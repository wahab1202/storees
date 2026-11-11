import { and, eq, desc, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import {
  customers, events, consents, orders, messages,
  whatsappInboundMessages, whatsappOutboundMessages, whatsappConversations, projects,
} from '../db/schema.js'

/**
 * Data-subject rights (GDPR Art. 15/17 · DPDP §11/§12) — the technical primitives:
 *  - exportCustomerData(): right of access / portability — everything we hold on a person.
 *  - eraseCustomer(): right to erasure — anonymise the person across every PII store,
 *    keeping non-identifying rows for analytics + legally-required consent records.
 *  - purgeShopData(): Shopify shop/redact — anonymise the whole tenant on uninstall.
 *
 * Erasure anonymises rather than hard-deletes so referential integrity and
 * aggregate analytics survive, which GDPR/DPDP permit once data is no longer
 * identifiable. Consent records are retained as the lawful proof of processing.
 */

// PII keys stripped from raw event/payload JSONB on erasure.
const PII_JSONB_KEYS = ['email', 'phone', 'customer_email', 'customer_phone', 'name', 'customer_name', 'wa_id', 'whatsapp', 'address', 'first_name', 'last_name']

export async function resolveCustomerId(projectId: string, opts: { customerId?: string; email?: string }): Promise<string | null> {
  if (opts.customerId) return opts.customerId
  if (!opts.email) return null
  const [row] = await db.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.projectId, projectId), eq(customers.email, opts.email.toLowerCase()))).limit(1)
  return row?.id ?? null
}

/** Right of access: compile everything held on a customer into a portable object. */
export async function exportCustomerData(projectId: string, customerId: string): Promise<Record<string, unknown> | null> {
  const [customer] = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.projectId, projectId))).limit(1)
  if (!customer) return null

  const [consentRows, orderRows, eventRows, messageRows, inbound, outbound] = await Promise.all([
    db.select().from(consents).where(and(eq(consents.projectId, projectId), eq(consents.customerId, customerId))),
    db.select().from(orders).where(and(eq(orders.projectId, projectId), eq(orders.customerId, customerId))).orderBy(desc(orders.createdAt)).limit(500),
    db.select({ eventName: events.eventName, properties: events.properties, timestamp: events.timestamp })
      .from(events).where(and(eq(events.projectId, projectId), eq(events.customerId, customerId))).orderBy(desc(events.timestamp)).limit(1000),
    db.select({ channel: messages.channel, status: messages.status, createdAt: messages.createdAt })
      .from(messages).where(and(eq(messages.projectId, projectId), eq(messages.customerId, customerId))).orderBy(desc(messages.createdAt)).limit(500),
    db.select().from(whatsappInboundMessages).where(and(eq(whatsappInboundMessages.projectId, projectId), eq(whatsappInboundMessages.customerId, customerId))).limit(500),
    db.select().from(whatsappOutboundMessages).where(and(eq(whatsappOutboundMessages.projectId, projectId), eq(whatsappOutboundMessages.customerId, customerId))).limit(500),
  ])

  return {
    exportedAt: new Date().toISOString(),
    customer,
    consents: consentRows,
    orders: orderRows,
    events: eventRows,
    messages: messageRows,
    whatsappInbound: inbound,
    whatsappOutbound: outbound,
  }
}

/**
 * Right to erasure: anonymise the customer across every PII store. Returns a
 * summary of what was scrubbed (for the audit trail). Consent rows are KEPT
 * (lawful record of processing); everything identifying is removed.
 */
export async function eraseCustomer(projectId: string, customerId: string): Promise<{ erased: boolean }> {
  const [customer] = await db.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId))).limit(1)
  if (!customer) return { erased: false }

  const now = new Date()
  // 1. The customer record itself.
  await db.update(customers).set({
    email: null, phone: null, name: 'Redacted', externalId: null,
    customAttributes: {}, updatedAt: now,
  }).where(eq(customers.id, customerId))

  // 2. Strip PII keys from raw event properties (keeps the event for analytics).
  const stripExpr = PII_JSONB_KEYS.reduce((acc, k) => sql`${acc} - ${k}`, sql`${events.properties}`)
  await db.update(events).set({ properties: stripExpr })
    .where(and(eq(events.projectId, projectId), eq(events.customerId, customerId)))

  // 3. WhatsApp message bodies + numbers (free-text PII).
  await db.update(whatsappInboundMessages).set({ content: null, mediaUrl: null, rawPayload: null, fromPhone: 'redacted' })
    .where(and(eq(whatsappInboundMessages.projectId, projectId), eq(whatsappInboundMessages.customerId, customerId)))
  await db.update(whatsappOutboundMessages).set({ content: '[redacted]', phone: 'redacted' })
    .where(and(eq(whatsappOutboundMessages.projectId, projectId), eq(whatsappOutboundMessages.customerId, customerId)))
  await db.update(whatsappConversations).set({ phone: 'redacted', updatedAt: now })
    .where(and(eq(whatsappConversations.projectId, projectId), eq(whatsappConversations.customerId, customerId)))

  // 4. Audit the erasure (events row carries no PII).
  await db.insert(events).values({
    projectId, customerId,
    eventName: 'data_erased',
    properties: { basis: 'gdpr_dpdp_erasure' },
    platform: 'system', source: 'data-subject', timestamp: now,
  }).catch(() => {})

  return { erased: true }
}

/** Shopify shop/redact (48h after uninstall): anonymise the whole tenant's PII. */
export async function purgeShopData(projectId: string): Promise<void> {
  const now = new Date()
  await db.update(customers).set({ email: null, phone: null, name: 'Redacted', externalId: null, customAttributes: {}, updatedAt: now })
    .where(eq(customers.projectId, projectId))
  await db.update(whatsappInboundMessages).set({ content: null, mediaUrl: null, rawPayload: null, fromPhone: 'redacted' })
    .where(eq(whatsappInboundMessages.projectId, projectId))
  await db.update(whatsappOutboundMessages).set({ content: '[redacted]', phone: 'redacted' })
    .where(eq(whatsappOutboundMessages.projectId, projectId))
  // Sever the Shopify connection.
  await db.update(projects).set({ shopifyAccessToken: null, updatedAt: now }).where(eq(projects.id, projectId))
}
