import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { messages, events } from '../db/schema.js'

/**
 * Unified per-message delivery-receipt handler — used by every channel
 * webhook (Twilio, Bird, Vonage, Gupshup, Meta WhatsApp, Resend) so that
 * "did this customer read this message?" works the same way across email,
 * SMS, WhatsApp, and push.
 *
 * Effects:
 *   1. Update messages.<status>_at timestamp (idempotent — only first occurrence)
 *   2. Set messages.status to the new status
 *   3. Insert an event row named `${channel}_${status}` (e.g. email_read,
 *      whatsapp_read, sms_read). The naming is uniform so downstream
 *      analytics + segment filters work cross-channel without special cases.
 *
 * Idempotency: writes the timestamp only when currently NULL; the event
 * row uses an idempotency key on (eventName, providerMessageId) so retries
 * don't duplicate.
 */
export async function handleDeliveryReceipt(
  providerMessageId: string,
  status: 'delivered' | 'read' | 'clicked' | 'failed',
  channel: string,
  providerName: string,
): Promise<void> {
  const fieldMap: Record<string, string> = {
    delivered: 'delivered_at',
    read: 'read_at',
    clicked: 'clicked_at',
    failed: 'failed_at',
  }

  const tsField = fieldMap[status]
  if (!tsField) return

  const [msg] = await db
    .select({ id: messages.id, projectId: messages.projectId, customerId: messages.customerId })
    .from(messages)
    .where(eq(messages.providerMessageId, providerMessageId))
    .limit(1)

  if (!msg) return

  // Update timestamp + status (status only escalates forward — we never
  // overwrite 'read' with 'delivered' if events arrive out of order).
  await db.execute(sql`
    UPDATE messages
    SET ${sql.raw(tsField)} = NOW(),
        status = CASE
          WHEN ${status} = 'failed' THEN 'failed'
          WHEN ${status} = 'clicked' THEN 'clicked'
          WHEN ${status} = 'read' AND status NOT IN ('clicked', 'failed') THEN 'read'
          WHEN ${status} = 'delivered' AND status IN ('queued', 'sent') THEN 'delivered'
          ELSE status
        END
    WHERE id = ${msg.id} AND ${sql.raw(tsField)} IS NULL
  `)

  // Tracking event — `email_read`, `whatsapp_read`, `sms_read`, etc. Cross-channel
  // queries can do `event_name LIKE '%_read'` to find every "customer read it" event.
  if (msg.customerId) {
    const eventName = `${channel}_${status}`
    await db.insert(events).values({
      projectId: msg.projectId,
      customerId: msg.customerId,
      eventName,
      properties: { message_id: msg.id, channel, provider: providerName },
      platform: channel,
      source: `${providerName}_webhook`,
      idempotencyKey: `${eventName}_${providerMessageId}`,
      timestamp: new Date(),
    }).onConflictDoNothing()

    // Backward-compat alias: pre-unification, email opens emitted `email_opened`.
    // Some existing flow configs and saved segments still reference that name.
    // Dual-emit on email reads keeps them firing during the transition; can be
    // removed after a release where consumers are confirmed migrated.
    if (channel === 'email' && status === 'read') {
      await db.insert(events).values({
        projectId: msg.projectId,
        customerId: msg.customerId,
        eventName: 'email_opened',
        properties: { message_id: msg.id, channel, provider: providerName, alias_for: 'email_read' },
        platform: channel,
        source: `${providerName}_webhook`,
        idempotencyKey: `email_opened_${providerMessageId}`,
        timestamp: new Date(),
      }).onConflictDoNothing()
    }
  }
}
