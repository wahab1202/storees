import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { whatsappUsage } from '../db/schema.js'
import type { WhatsappUsageCategory, WhatsappUsageSummary } from '@storees/shared'

/**
 * WhatsApp usage metering. Meta bills per CONVERSATION (a 24h window), and
 * reports the category + conversation on the message-status webhook. We persist
 * one row per billable conversation (idempotent on conversation id) so a brand's
 * usage dashboard reflects the real cost driver, not a raw message tally.
 */

/** The `pricing` + `conversation` object Meta attaches to a status entry. */
export type StatusPricing = {
  conversation?: { id?: string; origin?: { type?: string }; expiration_timestamp?: string | number }
  pricing?: { billable?: boolean; pricing_model?: string; category?: string }
}

const CATEGORIES: WhatsappUsageCategory[] = ['marketing', 'utility', 'authentication', 'service']

function normaliseCategory(raw: string | undefined): string | null {
  if (!raw) return null
  const c = raw.toLowerCase()
  return CATEGORIES.includes(c as WhatsappUsageCategory) ? c : c // keep unknowns (e.g. referral_conversion) verbatim
}

/**
 * Record a billable conversation from a status webhook entry. No-op unless the
 * entry actually carries a conversation id + category. Idempotent per
 * (project, conversation) so re-delivered statuses don't double-count.
 */
export async function recordConversationUsage(
  projectId: string,
  provider: string,
  phoneNumberId: string | null,
  entry: StatusPricing,
): Promise<void> {
  const conversationId = entry.conversation?.id
  const category = normaliseCategory(entry.pricing?.category ?? entry.conversation?.origin?.type)
  if (!conversationId || !category) return

  const exp = entry.conversation?.expiration_timestamp
  const expirationAt = exp ? new Date(Number(exp) * 1000) : null

  await db.insert(whatsappUsage).values({
    projectId,
    provider,
    phoneNumberId,
    conversationId,
    category,
    pricingModel: entry.pricing?.pricing_model ?? null,
    originType: entry.conversation?.origin?.type ?? null,
    billable: entry.pricing?.billable ?? true,
    expirationAt,
    raw: entry as unknown as object,
  }).onConflictDoUpdate({
    target: [whatsappUsage.projectId, whatsappUsage.conversationId],
    // Category/pricing can be refined across a conversation's status events.
    set: {
      category,
      pricingModel: entry.pricing?.pricing_model ?? null,
      originType: entry.conversation?.origin?.type ?? null,
      billable: entry.pricing?.billable ?? true,
      updatedAt: new Date(),
    },
  })
}

/**
 * Optional rate card (smallest currency unit per conversation), read from env
 * so a deployment can estimate spend. e.g. WA_RATE_MARKETING=115 (₹1.15 in paise).
 * Returns null when nothing is configured, so the dashboard just omits cost.
 */
function rateCard(): { currency: string; rates: Partial<Record<WhatsappUsageCategory, number>> } | null {
  const rates: Partial<Record<WhatsappUsageCategory, number>> = {}
  let any = false
  for (const c of CATEGORIES) {
    const v = process.env[`WA_RATE_${c.toUpperCase()}`]
    if (v && !Number.isNaN(Number(v))) { rates[c] = Number(v); any = true }
  }
  return any ? { currency: process.env.WA_RATE_CURRENCY ?? 'INR', rates } : null
}

/** Per-brand usage rollup over [from, to]. Billable conversations by category. */
export async function getUsageSummary(projectId: string, from: Date, to: Date): Promise<WhatsappUsageSummary> {
  const rows = await db
    .select({ category: whatsappUsage.category, n: sql<number>`count(*)::int` })
    .from(whatsappUsage)
    .where(and(
      eq(whatsappUsage.projectId, projectId),
      eq(whatsappUsage.billable, true),
      gte(whatsappUsage.startedAt, from),
      lte(whatsappUsage.startedAt, to),
    ))
    .groupBy(whatsappUsage.category)

  const byCategory: Record<WhatsappUsageCategory, number> = { marketing: 0, utility: 0, authentication: 0, service: 0 }
  let total = 0
  for (const r of rows) {
    const n = Number(r.n)
    total += n
    if ((CATEGORIES as string[]).includes(r.category)) byCategory[r.category as WhatsappUsageCategory] = n
  }

  const summary: WhatsappUsageSummary = {
    range: { from: from.toISOString(), to: to.toISOString() },
    byCategory,
    totalConversations: total,
  }

  const card = rateCard()
  if (card) {
    let amount = 0
    for (const c of CATEGORIES) amount += (byCategory[c] ?? 0) * (card.rates[c] ?? 0)
    summary.estimatedCost = { currency: card.currency, amount }
  }
  return summary
}
