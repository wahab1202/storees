import { eq, and, sql, gte } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { messages, consents, customers, whatsappTemplates, projects } from '../db/schema.js'
import { deliveryQueue } from './queue.js'
import { buildBodyParams } from './providers/whatsappUtils.js'
import { redis } from './redis.js'
import type { SendCommand, MessageChannel, CampaignUtmParameter } from '@storees/shared'

import { getChannelProvider } from './channelProviderRegistry.js'
import { mirrorCampaignReceipt } from './messageStatusService.js'
import { createTrackedLink } from './shortLinkService.js'

type DeliveryProvider = {
  name: string
  send(command: SendCommand): Promise<{ messageId: string; status: string; error?: string }>
  getStatus?(providerMessageId: string): Promise<string>
}

const providers = new Map<string, DeliveryProvider>()

export function registerProvider(name: string, provider: DeliveryProvider): void {
  providers.set(name, provider)
}

/**
 * Pre-send pipeline: consent → frequency → quiet hours → rate limit → queue.
 * Returns the message ID or null if blocked.
 */
export async function send(command: SendCommand): Promise<string | null> {
  // 0. WhatsApp category drives marketing-vs-transactional treatment. Meta/Pinnacle
  // classify each approved template: MARKETING (promotional — subject to consent +
  // the per-user marketing frequency cap, and can be silently dropped by Meta error
  // 131049) vs UTILITY/AUTHENTICATION (transactional — order/shipping/OTP, always
  // allowed, no marketing cap). Derive messageType from the template's category so
  // callers (flows, campaigns) don't have to, and a UTILITY template is never
  // wrongly marketing-capped.
  if (command.channel === 'whatsapp' && command.templateId) {
    const category = await getWhatsappTemplateCategory(command.projectId, command.templateId)
    if (category) {
      command.messageType = category === 'MARKETING' ? 'promotional' : 'transactional'
    }
  }

  // Gates 1-3 are independent reads — run them together, then evaluate in
  // priority order so the recorded block reason is unchanged. Frequency cap is
  // marketing-only; transactional sends bypass it by design.
  const capApplies = !command.ignoreFrequencyCap && command.messageType !== 'transactional'
  const [consented, capped, reachable] = await Promise.all([
    checkConsent(command.projectId, command.userId, command.channel, command.messageType),
    capApplies ? checkFrequencyCap(command.projectId, command.userId, command.channel) : Promise.resolve(false),
    checkReachability(command.projectId, command.userId, command.channel),
  ])

  if (!consented) {
    await recordMessage(command, 'blocked', 'consent_blocked')
    return null
  }
  if (capped) {
    await recordMessage(command, 'blocked', 'frequency_capped')
    return null
  }
  if (!reachable) {
    await recordMessage(command, 'blocked', 'no_channel_reachability')
    return null
  }

  // 4. Record as queued and add to delivery queue
  const messageId = await recordMessage(command, 'queued')

  await deliveryQueue.add('send', {
    messageId,
    ...command,
    scheduledAt: command.scheduledAt?.toISOString(),
  }, {
    delay: command.scheduledAt
      ? Math.max(0, command.scheduledAt.getTime() - Date.now())
      : undefined,
  })

  return messageId
}

/**
 * Actually send via provider — called by deliveryWorker.
 */
export async function executeSend(messageId: string, command: SendCommand): Promise<void> {
  try {
    // Try channel provider registry first (project-level config)
    const channelResult = await getChannelProvider(command.projectId, command.channel)

    let providerName: string
    let sendResult: { messageId: string; status: string; error?: string }

    if (channelResult) {
      providerName = channelResult.provider.name
      // Route through sendTemplate when channel=whatsapp + templateId resolves to a synced WhatsApp template
      // for this provider. Falls through to plain text send otherwise.
      const waTemplate = await resolveWhatsappTemplate(command, providerName)
      if (waTemplate && channelResult.provider.sendTemplate) {
        // Tracked URL buttons: mint a per-recipient short link and pass its slug
        // as the dynamic suffix (wa_button_url_N). buildTemplateComponents reads
        // it; the tap then routes through /c/:slug and logs a whatsapp_clicked.
        const variables = await injectTrackedButtonSlugs(command, messageId, waTemplate.buttons)
        // Never send an empty body param — Meta rejects with #131008. Empties
        // fall back to "-" (the variable's defaultValue is already applied
        // upstream by resolveTemplateVariables; set one to avoid the dash).
        const params = buildBodyParams(waTemplate.parameterCount ?? 0, i => variables[String(i)])
        sendResult = await channelResult.provider.sendTemplate(
          {
            ...command,
            variables,
            templateName: waTemplate.providerTemplateId,
            templateLanguage: waTemplate.language,
            templateParams: params,
            templateHeader: waTemplate.header,
            templateButtons: waTemplate.buttons,
          },
          channelResult.config,
        )
      } else {
        sendResult = await channelResult.provider.send(command, channelResult.config)
      }
    } else {
      // Fallback to legacy registered providers
      const legacy = providers.get('pinnacle') ?? providers.get('resend')
      if (!legacy) throw new Error(`No provider configured for channel ${command.channel}`)
      providerName = legacy.name
      sendResult = await legacy.send(command)
    }

    if (sendResult.error) {
      console.error(`Delivery failed for message ${messageId}:`, sendResult.error)
      await db.update(messages).set({
        status: 'failed',
        failedAt: new Date(),
        failureReason: String(sendResult.error).slice(0, 2000),
      }).where(eq(messages.id, messageId))
      await mirrorCampaignProviderFailure(command, String(sendResult.error))
      return
    }

    await db.update(messages).set({
      status: 'sent',
      provider: providerName,
      providerMessageId: sendResult.messageId,
      sentAt: new Date(),
    }).where(eq(messages.id, messageId))
  } catch (err) {
    console.error(`Delivery failed for message ${messageId}:`, err)
    await db.update(messages).set({
      status: 'failed',
      failedAt: new Date(),
      failureReason: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
    }).where(eq(messages.id, messageId))
    await mirrorCampaignProviderFailure(command, err instanceof Error ? err.message : String(err))
  }
}

async function mirrorCampaignProviderFailure(command: SendCommand, reason?: string | null): Promise<void> {
  if (!command.campaignId) return
  await mirrorCampaignReceipt(command.campaignId, command.userId, 'failed', reason)
}

/**
 * If the command targets WhatsApp and templateId points at a synced whatsapp_templates row
 * for this provider, return it. Returns null for plain-text sends or unknown templates.
 */
async function resolveWhatsappTemplate(
  command: SendCommand,
  providerName: string,
): Promise<{ providerTemplateId: string; name: string; language: string; parameterCount: number; header: unknown; buttons: unknown } | null> {
  if (command.channel !== 'whatsapp' || !command.templateId) return null
  const [selected] = await db
    .select({
      id: whatsappTemplates.id,
      name: whatsappTemplates.name,
      providerTemplateId: whatsappTemplates.providerTemplateId,
      language: whatsappTemplates.language,
      parameterCount: whatsappTemplates.parameterCount,
      status: whatsappTemplates.status,
      header: whatsappTemplates.header,
      buttons: whatsappTemplates.buttons,
    })
    .from(whatsappTemplates)
    .where(and(
      eq(whatsappTemplates.id, command.templateId),
      eq(whatsappTemplates.projectId, command.projectId),
      eq(whatsappTemplates.provider, providerName),
    ))
    .limit(1)
  if (!selected || selected.status !== 'APPROVED') return null

  const [customer] = await db
    .select({ customAttributes: customers.customAttributes })
    .from(customers)
    .where(eq(customers.id, command.userId))
    .limit(1)
  const attrs = (customer?.customAttributes ?? {}) as Record<string, unknown>
  const preferredLanguage = String(attrs.language ?? attrs.locale ?? '').trim()
  if (!preferredLanguage || preferredLanguage === selected.language) return selected

  const [localized] = await db
    .select({
      providerTemplateId: whatsappTemplates.providerTemplateId,
      name: whatsappTemplates.name,
      language: whatsappTemplates.language,
      parameterCount: whatsappTemplates.parameterCount,
      header: whatsappTemplates.header,
      buttons: whatsappTemplates.buttons,
    })
    .from(whatsappTemplates)
    .where(and(
      eq(whatsappTemplates.projectId, command.projectId),
      eq(whatsappTemplates.provider, providerName),
      eq(whatsappTemplates.name, selected.name),
      eq(whatsappTemplates.language, preferredLanguage),
      eq(whatsappTemplates.status, 'APPROVED'),
    ))
    .limit(1)
  return localized ?? selected
}

/**
 * For each tracked URL button, mint a per-recipient short link pointing at the
 * button's real destination and expose its slug as `wa_button_url_N` (N = the
 * URL button's position). buildTemplateComponents turns that into the dynamic
 * suffix, so the approved `…/c/{{1}}` base resolves to `…/c/<slug>` and the tap
 * is tracked. Returns a fresh variables map (untracked buttons are unaffected).
 */
async function injectTrackedButtonSlugs(
  command: SendCommand,
  messageId: string,
  buttons: unknown,
): Promise<Record<string, string>> {
  const variables: Record<string, string> = { ...(command.variables ?? {}) }
  const list = Array.isArray(buttons) ? buttons as Array<{ type?: string; url?: string; track?: boolean }> : []
  let urlPos = 0
  for (const b of list) {
    if ((b.type ?? '').toUpperCase() !== 'URL') continue
    urlPos += 1 // counts every URL button, matching buildTemplateComponents
    if (!b.track) continue
    // Per-send destination override (wa_button_dest_N): lets a flow point the
    // tracked button at an EVENT field — e.g. abandoned-cart recovery, where
    // every recipient's checkout URL differs and the token sits mid-URL (so
    // Meta's suffix-only dynamic buttons can't express it). The short link
    // 302s to whatever destination we mint it with, so the approved button
    // base (…/c/{{1}}) is immutable while the target is per-recipient.
    const destination = command.variables?.[`wa_button_dest_${urlPos}`] || b.url
    if (!destination) continue
    const { slug } = await createTrackedLink({
      // UTM params (pre-interpolated by the caller, e.g. a flow send node)
      // ride on the destination — the short link 302s to url + UTM, so
      // attribution works even though the approved button URL is immutable.
      originalUrl: appendUtmToUrl(destination, command.utmParameters),
      projectId: command.projectId,
      channel: 'whatsapp',
      messageId,
      campaignId: command.campaignId ?? null,
      customerId: command.userId,
    })
    variables[`wa_button_url_${urlPos}`] = slug
  }
  return variables
}

function appendUtmToUrl(rawUrl: string, params?: CampaignUtmParameter[]): string {
  if (!params || params.length === 0) return rawUrl
  try {
    const url = new URL(rawUrl)
    for (const p of params) {
      if (p.key && p.value) url.searchParams.set(p.key, p.value)
    }
    return url.toString()
  } catch {
    return rawUrl // relative/malformed destination — leave untouched
  }
}

/**
 * Update message status from provider receipt webhook.
 */
export async function handleReceipt(
  providerMessageId: string,
  status: 'delivered' | 'read' | 'clicked' | 'failed',
): Promise<void> {
  const timestampField = {
    delivered: 'deliveredAt',
    read: 'readAt',
    clicked: 'clickedAt',
    failed: 'failedAt',
  }[status] as string

  await db.update(messages).set({
    status,
    [timestampField]: new Date(),
  }).where(eq(messages.providerMessageId, providerMessageId))
}

// ============ PRE-SEND CHECKS ============

async function checkConsent(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
  messageType: string,
): Promise<boolean> {
  // Transactional defaults to allowed unless explicitly opted out
  const cacheKey = `consent:${projectId}:${customerId}:${channel}:${messageType}`
  const cached = await redis.get(cacheKey)
  if (cached !== null) return cached === '1'

  const [record] = await db
    .select({ status: consents.status })
    .from(consents)
    .where(and(
      eq(consents.projectId, projectId),
      eq(consents.customerId, customerId),
      eq(consents.channel, channel),
      eq(consents.purpose, messageType),
    ))
    .limit(1)

  // Opt-out consent model (product decision): with no explicit consent record,
  // marketing is allowed by default on EVERY channel. The only thing that blocks
  // is an explicit `opted_out` consents row (handled above) — written by an
  // inbound STOP, a push uninstall, or the unsubscribe API. Transactional was
  // always allowed. Deliverability (email/phone present, FCM token, etc.) is
  // enforced separately in checkReachability, so defaulting to allowed here never
  // results in a send to a customer we cannot actually reach.
  // NOTE: this is more permissive than Meta's WhatsApp opt-in policy and than a
  // strict email/SMS double-opt-in. For email/SMS, Shopify-synced unsubscribes
  // live in the *_subscribed flags and are NOT honored here unless mirrored to an
  // `opted_out` consents row; email hard-suppressions (bounces/complaints) are
  // still enforced separately in campaignService.
  const allowed = record ? record.status === 'opted_in' : true

  await redis.set(cacheKey, allowed ? '1' : '0', 'EX', 300) // 5 min TTL
  return allowed
}

// Per-project frequency-cap config cached for 60s. Capped values rarely
// change (admin tweaks them once during onboarding) but the hot path runs
// per-send, so a DB lookup every time is wasteful.
export type FreqCapConfig = { perDays: number; max: number }
const FREQ_CAP_CACHE_TTL_MS = 60_000
const freqCapCache = new Map<string, { caps: Record<string, FreqCapConfig>; expiresAt: number }>()

const DEFAULT_FREQ_CAPS: Record<string, FreqCapConfig> = {
  whatsapp_marketing: { perDays: 7, max: 1 },
  sms_marketing: { perDays: 7, max: 3 },
  email_marketing: { perDays: 1, max: 3 },
  push_marketing: { perDays: 1, max: 5 },
}

export async function getProjectFreqCaps(projectId: string): Promise<Record<string, FreqCapConfig>> {
  const cached = freqCapCache.get(projectId)
  if (cached && cached.expiresAt > Date.now()) return cached.caps

  const [row] = await db
    .select({ caps: projects.frequencyCaps })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  const caps = (row?.caps as Record<string, FreqCapConfig> | null) ?? DEFAULT_FREQ_CAPS
  freqCapCache.set(projectId, { caps, expiresAt: Date.now() + FREQ_CAP_CACHE_TTL_MS })
  return caps
}

/** Resolve a WhatsApp template's Meta category (MARKETING | UTILITY |
 *  AUTHENTICATION) by its id, so the send pipeline can treat it correctly.
 *  Returns null if the template isn't found (caller keeps the given messageType). */
async function getWhatsappTemplateCategory(projectId: string, templateId: string): Promise<string | null> {
  const [row] = await db
    .select({ category: whatsappTemplates.category })
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.projectId, projectId)))
    .limit(1)
  return row?.category ?? null
}

/** Returns true if this customer has hit (or exceeded) the marketing cap on
 *  this channel. Transactional sends never reach this check — bypass is at
 *  the caller. Returning true blocks the send and flags it as `frequency_capped`. */
async function checkFrequencyCap(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
): Promise<boolean> {
  const caps = await getProjectFreqCaps(projectId)
  const cap = caps[`${channel}_marketing`]
  if (!cap || cap.max <= 0) return false // no cap configured = no limit

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(
      eq(messages.projectId, projectId),
      eq(messages.customerId, customerId),
      eq(messages.channel, channel),
      eq(messages.messageType, 'promotional'),
      eq(messages.countsTowardFrequencyCap, true),
      // Only messages that actually went out count toward the cap. Failed/blocked
      // sends never reached the customer, so they must not consume the budget
      // (otherwise a burst of failed test sends silently caps a real one).
      sql`${messages.status} NOT IN ('failed', 'blocked')`,
      gte(messages.createdAt, sql`NOW() - (${cap.perDays}::int * INTERVAL '1 day')`),
    ))

  return count >= cap.max
}

async function checkReachability(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
): Promise<boolean> {
  const [customer] = await db
    .select({
      email: customers.email,
      phone: customers.phone,
      pushSubscribed: customers.pushSubscribed,
      fcmToken: sql<string | null>`${customers.customAttributes}->>'fcm_token'`,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId)))
    .limit(1)

  if (!customer) return false

  switch (channel) {
    case 'email':
      return !!customer.email
    case 'sms':
    case 'whatsapp':
      return !!customer.phone
    case 'push':
      // Reachable if subscribed OR we hold a device token (fcmProvider sends to
      // customAttributes.fcm_token). Mirrors campaignService's push reachability.
      return customer.pushSubscribed || !!(customer.fcmToken && customer.fcmToken.trim())
    case 'inapp':
      return true // always reachable
    default:
      return false
  }
}

async function recordMessage(
  command: SendCommand,
  status: string,
  blockReason?: string,
): Promise<string> {
  const [msg] = await db.insert(messages).values({
    projectId: command.projectId,
    customerId: command.userId,
    channel: command.channel,
    messageType: command.messageType,
    templateId: command.templateId,
    variables: command.variables,
    status,
    blockReason: blockReason ?? null,
    countsTowardFrequencyCap: command.countForFrequencyCap ?? true,
    flowTripId: command.flowTripId ?? null,
    campaignId: command.campaignId ?? null,
    scheduledAt: command.scheduledAt ?? null,
  }).returning()

  return msg.id
}
