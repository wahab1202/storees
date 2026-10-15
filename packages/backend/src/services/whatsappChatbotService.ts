import { and, eq, desc, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects, customers, orders, events, whatsappConversations } from '../db/schema.js'
import { getLlmConfig, chatCompletion } from './llmService.js'
import { getChannelProvider } from './channelProviderRegistry.js'
import { recommendForCustomer } from './decisioningService.js'

/**
 * AI WhatsApp chatbot (Bitespeed roadmap — Phase 1).
 *
 * Auto-responds to inbound WhatsApp messages: answers FAQs, reports order status,
 * recommends products, and hands off to a human when it can't help. Replies are
 * free-form SESSION messages (valid because the customer just messaged us, inside
 * WhatsApp's 24h customer-service window), sent via the provider's sendSessionText.
 *
 * Safety: off unless explicitly enabled per project; never replies to STOP/START
 * (consent is handled upstream) or media-only messages; a per-conversation turn
 * cap and a 'human'/'closed' state stop runaway loops; everything is wrapped so a
 * failure never breaks the inbound webhook.
 */

export type ChatbotConfig = {
  enabled: boolean
  greeting?: string
  handoffKeywords: string[]
  faqs: Array<{ q: string; a: string }>
  maxTurns: number
}

const DEFAULT_HANDOFF_PATTERNS = /\b(agent|human|representative|speak to someone|talk to a person|customer care)\b/i
const CONSENT_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'OPT OUT', 'STOP ALL', 'START', 'YES', 'SUBSCRIBE', 'OPTIN', 'OPT IN', 'UNSTOP'])

export function readChatbotConfig(settings: unknown): ChatbotConfig {
  const s = (settings ?? {}) as Record<string, any>
  const bot = s?.channels?.whatsapp?.chatbot ?? {}
  return {
    enabled: bot.enabled === true,
    greeting: typeof bot.greeting === 'string' ? bot.greeting : undefined,
    handoffKeywords: Array.isArray(bot.handoffKeywords) ? bot.handoffKeywords.filter((k: unknown) => typeof k === 'string') : [],
    faqs: Array.isArray(bot.faqs) ? bot.faqs.filter((f: any) => f && typeof f.q === 'string' && typeof f.a === 'string') : [],
    maxTurns: typeof bot.maxTurns === 'number' && bot.maxTurns > 0 ? bot.maxTurns : 8,
  }
}

/** True when the message explicitly asks for a human (config keyword or built-in pattern). */
export function wantsHumanHandoff(content: string, cfg: ChatbotConfig): boolean {
  const upper = content.toUpperCase()
  if (cfg.handoffKeywords.some(k => k && upper.includes(k.toUpperCase()))) return true
  return DEFAULT_HANDOFF_PATTERNS.test(content)
}

type Intent = 'faq' | 'order_status' | 'product_recommendation' | 'greeting' | 'other' | 'handoff'
type BotDecision = { intent: Intent; reply: string; needsHuman: boolean; confidence: number }

/** Resolve the project's WhatsApp provider and send a free-form session text. */
export async function sendWhatsappSessionText(
  projectId: string,
  toPhone: string,
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  const resolved = await getChannelProvider(projectId, 'whatsapp')
  if (!resolved) return { ok: false, reason: 'no_provider' }
  if (typeof resolved.provider.sendSessionText !== 'function') return { ok: false, reason: 'unsupported' }
  const res = await resolved.provider.sendSessionText(toPhone, text, resolved.config)
  return res.status === 'sent' ? { ok: true } : { ok: false, reason: res.error ?? 'send_failed' }
}

/**
 * Entry point: called (fire-and-forget) after an inbound WhatsApp message is
 * persisted. Decides whether/how to auto-reply. Never throws.
 */
export async function handleInboundForChatbot(input: {
  projectId: string
  customerId: string
  fromPhone: string
  content: string | null | undefined
}): Promise<void> {
  const { projectId, customerId, fromPhone } = input
  const content = (input.content ?? '').trim()
  try {
    if (!content) return // media-only / empty

    const [project] = await db
      .select({ name: projects.name, settings: projects.settings })
      .from(projects).where(eq(projects.id, projectId)).limit(1)
    if (!project) return
    const cfg = readChatbotConfig(project.settings)
    if (!cfg.enabled) return

    const upper = content.toUpperCase()
    if (CONSENT_KEYWORDS.has(upper)) return // opt-in/out handled upstream

    const convo = await getOrCreateConversation(projectId, customerId, fromPhone)
    if (convo.status === 'human') return // a human owns this thread

    // Explicit ask for a person, or we've looped enough — hand off.
    if (wantsHumanHandoff(content, cfg)) return handoff(convo.id, projectId, customerId, fromPhone, 'requested_human')
    if (convo.botTurns >= cfg.maxTurns) return handoff(convo.id, projectId, customerId, fromPhone, 'turn_cap')

    const [customer] = await db
      .select({ name: customers.name })
      .from(customers).where(eq(customers.id, customerId)).limit(1)
    const recentOrders = await loadRecentOrders(projectId, customerId)

    const decision = await decide(projectId, cfg, {
      businessName: project.name,
      customerName: customer?.name ?? null,
      message: content,
      recentOrders,
    })
    if (!decision) return handoff(convo.id, projectId, customerId, fromPhone, 'ai_unavailable')
    if (decision.needsHuman || decision.intent === 'handoff' || decision.confidence < 0.4) {
      return handoff(convo.id, projectId, customerId, fromPhone, 'low_confidence')
    }

    let reply = decision.reply.trim()
    if (decision.intent === 'product_recommendation') {
      const recs = await recommendForCustomer(projectId, customerId, 3).catch(() => [])
      if (recs.length) reply += '\n\n' + recs.map(r => `• ${r.title}`).join('\n')
    }
    if (!reply) return

    const sent = await sendWhatsappSessionText(projectId, fromPhone, reply)
    if (!sent.ok) {
      // Can't auto-reply (provider lacks session text, etc.) — let a human take it.
      return handoff(convo.id, projectId, customerId, fromPhone, `send_${sent.reason ?? 'failed'}`)
    }

    await db.update(whatsappConversations)
      .set({ botTurns: sql`${whatsappConversations.botTurns} + 1`, lastBotAt: new Date(), updatedAt: new Date() })
      .where(eq(whatsappConversations.id, convo.id))
    await logBotEvent(projectId, customerId, fromPhone, 'whatsapp_bot_reply', { intent: decision.intent, reply })
  } catch (err) {
    console.error('[whatsapp-chatbot] handler failed (non-fatal):', (err as Error).message)
  }
}

// ── internals ──

type ConvoRow = { id: string; status: string; botTurns: number }

async function getOrCreateConversation(projectId: string, customerId: string, phone: string): Promise<ConvoRow> {
  const now = new Date()
  const [existing] = await db
    .select({ id: whatsappConversations.id, status: whatsappConversations.status, botTurns: whatsappConversations.botTurns })
    .from(whatsappConversations)
    .where(and(eq(whatsappConversations.projectId, projectId), eq(whatsappConversations.phone, phone)))
    .limit(1)

  if (existing) {
    // A new inbound after a 'closed' thread reopens it to the bot with a fresh count.
    if (existing.status === 'closed') {
      await db.update(whatsappConversations)
        .set({ status: 'bot', botTurns: 0, customerId, lastInboundAt: now, updatedAt: now })
        .where(eq(whatsappConversations.id, existing.id))
      return { ...existing, status: 'bot', botTurns: 0 }
    }
    await db.update(whatsappConversations)
      .set({ customerId, lastInboundAt: now, updatedAt: now })
      .where(eq(whatsappConversations.id, existing.id))
    return existing
  }

  const [row] = await db.insert(whatsappConversations)
    .values({ projectId, customerId, phone, status: 'bot', lastInboundAt: now })
    .returning({ id: whatsappConversations.id, status: whatsappConversations.status, botTurns: whatsappConversations.botTurns })
  return row
}

async function loadRecentOrders(projectId: string, customerId: string): Promise<Array<Record<string, unknown>>> {
  const rows = await db
    .select({
      externalOrderId: orders.externalOrderId,
      status: orders.status,
      total: orders.total,
      currency: orders.currency,
      createdAt: orders.createdAt,
      fulfilledAt: orders.fulfilledAt,
    })
    .from(orders)
    .where(and(eq(orders.projectId, projectId), eq(orders.customerId, customerId)))
    .orderBy(desc(orders.createdAt))
    .limit(3)
  const iso = (d: Date | string | null) => (d instanceof Date ? d.toISOString().slice(0, 10) : d)
  return rows.map(o => ({
    order_id: o.externalOrderId,
    status: o.status,
    total: o.total,
    currency: o.currency,
    placed_at: iso(o.createdAt),
    fulfilled_at: iso(o.fulfilledAt),
  }))
}

async function handoff(convoId: string, projectId: string, customerId: string, phone: string, reason: string): Promise<void> {
  await db.update(whatsappConversations)
    .set({ status: 'human', handoffReason: reason, updatedAt: new Date() })
    .where(eq(whatsappConversations.id, convoId))
  // Best-effort: tell the customer a human is coming (needs session text support).
  await sendWhatsappSessionText(projectId, phone, "Thanks for your message — I'm connecting you with our team. Someone will reply here shortly.").catch(() => {})
  await logBotEvent(projectId, customerId, phone, 'whatsapp_handoff', { reason })
}

async function logBotEvent(projectId: string, customerId: string, phone: string, eventName: string, props: Record<string, unknown>): Promise<void> {
  await db.insert(events).values({
    projectId,
    customerId,
    eventName,
    properties: { ...props, from_phone: phone },
    platform: 'whatsapp',
    source: 'chatbot',
    timestamp: new Date(),
  }).catch(() => {})
}

const SYSTEM_PROMPT = [
  'You are a helpful WhatsApp support assistant for an e-commerce store.',
  'Decide how to handle the customer message and reply concisely (WhatsApp style, under ~500 characters, no markdown).',
  'Respond with STRICT JSON only: {"intent":"faq|order_status|product_recommendation|greeting|other|handoff","reply":"...","needsHuman":false,"confidence":0.0}',
  'Rules: use ONLY the provided FAQ answers and order data — never invent order numbers, prices, refund outcomes, or policies. If the question needs information you do not have (refunds, complaints, account changes, anything sensitive), set needsHuman=true. confidence is your certainty the reply is correct (0-1).',
  'For product questions use intent "product_recommendation" (the system appends product suggestions). For order questions use "order_status" and answer from the order data.',
].join('\n')

async function decide(
  projectId: string,
  cfg: ChatbotConfig,
  ctx: { businessName: string; customerName: string | null; message: string; recentOrders: Array<Record<string, unknown>> },
): Promise<BotDecision | null> {
  const config = await getLlmConfig(projectId)
  if (!config) return null

  const user = [
    `Business: ${ctx.businessName}`,
    ctx.customerName ? `Customer name: ${ctx.customerName}` : '',
    cfg.faqs.length ? `FAQs (use these answers verbatim where relevant):\n${cfg.faqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n')}` : 'No FAQs provided.',
    ctx.recentOrders.length ? `Customer's recent orders (JSON):\n${JSON.stringify(ctx.recentOrders)}` : 'No recent orders on file.',
    `Customer message: ${ctx.message}`,
  ].filter(Boolean).join('\n\n')

  try {
    const res = await chatCompletion(config, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ], { temperature: 0.3, maxTokens: 500 })
    const parsed = extractJson(res.content) as Partial<BotDecision>
    if (typeof parsed.reply !== 'string') return null
    const intent = (['faq', 'order_status', 'product_recommendation', 'greeting', 'other', 'handoff'] as Intent[])
      .includes(parsed.intent as Intent) ? parsed.intent as Intent : 'other'
    return {
      intent,
      reply: parsed.reply,
      needsHuman: parsed.needsHuman === true,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    }
  } catch (err) {
    console.error('[whatsapp-chatbot] LLM decide failed:', (err as Error).message)
    return null
  }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('not JSON')
  return JSON.parse(trimmed.slice(first, last + 1))
}
