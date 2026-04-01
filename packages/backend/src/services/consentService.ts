import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, consentAuditLog } from '../db/schema.js'

type ConsentChannel = 'email' | 'sms' | 'push' | 'whatsapp'
type ConsentAction = 'opt_in' | 'opt_out'
type ConsentSource = 'sdk' | 'api' | 'admin' | 'webhook'

/**
 * Update consent for a customer on a specific channel and log the change.
 * Always appends to the immutable audit log.
 */
export async function updateConsent(
  projectId: string,
  customerId: string,
  channel: ConsentChannel,
  action: ConsentAction,
  source: ConsentSource,
  opts?: {
    messageType?: string
    consentText?: string
    ipAddress?: string
  },
) {
  // Map channel to customer subscription field
  const fieldMap: Record<ConsentChannel, string> = {
    email: 'emailSubscribed',
    sms: 'smsSubscribed',
    push: 'pushSubscribed',
    whatsapp: 'whatsappSubscribed',
  }

  const field = fieldMap[channel]
  const subscribed = action === 'opt_in'

  // Update customer subscription status
  await db
    .update(customers)
    .set({ [field]: subscribed, updatedAt: new Date() })
    .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId)))

  // Append to immutable audit log
  const [entry] = await db.insert(consentAuditLog).values({
    projectId,
    customerId,
    channel,
    messageType: opts?.messageType ?? 'all',
    action,
    source,
    consentText: opts?.consentText ?? null,
    ipAddress: opts?.ipAddress ?? null,
  }).returning()

  return entry
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
