import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, consents, consentAuditLog } from '../db/schema.js'

export type ConsentChannel = 'email' | 'sms' | 'push' | 'whatsapp'
export type ConsentAction = 'opt_in' | 'opt_out'
export type ConsentSource = 'sdk' | 'api' | 'admin' | 'webhook' | 'one_click_unsub' | 'ctwa_ad' | 'widget' | 'backfill'
export type ConsentPurpose = 'transactional' | 'promotional'

/**
 * Update consent for a customer on a specific channel + purpose, write to all
 * three places that need to know:
 *   1. `customers.<channel>Subscribed` — quick boolean flag used by reachability checks
 *   2. `consents` row (per channel + purpose) — used by the campaign dispatcher's gate
 *   3. `consent_audit_log` — append-only history for DPDP / Meta WABA defence
 *
 * All three writes happen in one transaction so we never end up partially
 * applied. Defaults `purpose` to 'promotional' since that's the legal-risk
 * surface; transactional opt-outs are rare enough to be passed explicitly.
 */
export async function updateConsent(
  projectId: string,
  customerId: string,
  channel: ConsentChannel,
  action: ConsentAction,
  source: ConsentSource,
  opts?: {
    purpose?: ConsentPurpose
    messageType?: string  // legacy alias for purpose; ignored if purpose is supplied
    consentText?: string
    ipAddress?: string
    provider?: string
  },
) {
  const subscribedFieldMap: Record<ConsentChannel, string> = {
    email: 'emailSubscribed',
    sms: 'smsSubscribed',
    push: 'pushSubscribed',
    whatsapp: 'whatsappSubscribed',
  }
  const field = subscribedFieldMap[channel]
  const subscribed = action === 'opt_in'
  const purpose: ConsentPurpose = opts?.purpose ?? (opts?.messageType as ConsentPurpose) ?? 'promotional'
  const status = subscribed ? 'opted_in' : 'opted_out'
  const now = new Date()

  return db.transaction(async (tx) => {
    // 1. Boolean flag on customers — reachability shortcut
    await tx
      .update(customers)
      .set({ [field]: subscribed, updatedAt: now })
      .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId)))

    // 2. consents row — the dispatcher checks this. Find an existing row for
    //    this (project, customer, channel, purpose); update if present, else insert.
    const [existing] = await tx
      .select({ id: consents.id })
      .from(consents)
      .where(and(
        eq(consents.projectId, projectId),
        eq(consents.customerId, customerId),
        eq(consents.channel, channel),
        eq(consents.purpose, purpose),
      ))
      .limit(1)

    if (existing) {
      await tx
        .update(consents)
        .set({
          status,
          source,
          provider: opts?.provider ?? null,
          consentedAt: subscribed ? now : sql`consented_at`,
          revokedAt: subscribed ? null : now,
        })
        .where(eq(consents.id, existing.id))
    } else {
      await tx.insert(consents).values({
        projectId,
        customerId,
        channel,
        purpose,
        status,
        source,
        provider: opts?.provider ?? null,
        consentedAt: subscribed ? now : now,
        revokedAt: subscribed ? null : now,
      })
    }

    // 3. Append to immutable audit log
    const [entry] = await tx.insert(consentAuditLog).values({
      projectId,
      customerId,
      channel,
      messageType: purpose,
      action,
      source,
      consentText: opts?.consentText ?? null,
      ipAddress: opts?.ipAddress ?? null,
    }).returning()

    return entry
  })
}

/**
 * Get current consent status for a customer across all channels.
 */
export async function getConsentStatus(projectId: string, customerId: string) {
  const [customer] = await db
    .select({
      emailSubscribed: customers.emailSubscribed,
      smsSubscribed: customers.smsSubscribed,
      pushSubscribed: customers.pushSubscribed,
      whatsappSubscribed: customers.whatsappSubscribed,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId)))
    .limit(1)

  if (!customer) return null

  return {
    email: customer.emailSubscribed,
    sms: customer.smsSubscribed,
    push: customer.pushSubscribed,
    whatsapp: customer.whatsappSubscribed,
  }
}

/**
 * Get audit trail for a customer (most recent first).
 */
export async function getConsentAuditLog(
  projectId: string,
  customerId: string,
  limit = 50,
) {
  return db
    .select()
    .from(consentAuditLog)
    .where(and(
      eq(consentAuditLog.projectId, projectId),
      eq(consentAuditLog.customerId, customerId),
    ))
    .orderBy(desc(consentAuditLog.createdAt))
    .limit(limit)
}

/**
 * Bulk opt-in/opt-out for SDK integration.
 * Accepts an array of channel consent updates for a single customer.
 */
export async function bulkUpdateConsent(
  projectId: string,
  customerId: string,
  updates: { channel: ConsentChannel; action: ConsentAction }[],
  source: ConsentSource,
  ipAddress?: string,
) {
  const results = []
  for (const u of updates) {
    const entry = await updateConsent(projectId, customerId, u.channel, u.action, source, { ipAddress })
    results.push(entry)
  }
  return results
}
