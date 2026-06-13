import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { messages, events, campaignSends } from '../db/schema.js'

type DeliveryReceiptStatus = 'delivered' | 'read' | 'clicked' | 'failed'

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
  status: DeliveryReceiptStatus,
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
    .select({
      id: messages.id,
      projectId: messages.projectId,
      customerId: messages.customerId,
      campaignId: messages.campaignId,
    })
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
    if (msg.campaignId) {
      await mirrorCampaignReceipt(msg.campaignId, msg.customerId, status)
    }

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

export async function mirrorCampaignReceipt(
  campaignId: string,
  customerId: string,
  status: DeliveryReceiptStatus,
  failureReason?: string | null,
): Promise<void> {
  if (status === 'delivered') {
    await markCampaignDelivered(campaignId, customerId)
    return
  }

  if (status === 'read') {
    await markCampaignDelivered(campaignId, customerId)
    await markCampaignOpened(campaignId, customerId)
    return
  }

  if (status === 'clicked') {
    await markCampaignDelivered(campaignId, customerId)
    await markCampaignOpened(campaignId, customerId)
    await incrementCampaignSendMetric(campaignId, customerId, 'clicked_at', 'clicked_count')
    return
  }

  await markCampaignFailed(campaignId, customerId, failureReason)
}

async function markCampaignDelivered(campaignId: string, customerId: string): Promise<void> {
  await db.execute(sql`
    UPDATE campaign_sends
    SET delivered_at = NOW(),
        status = CASE
          WHEN status IN ('pending', 'sent') THEN 'delivered'
          ELSE status
        END
    WHERE campaign_id = ${campaignId}
      AND customer_id = ${customerId}
      AND delivered_at IS NULL
  `).then(result => incrementCampaignCounterIfChanged(result, campaignId, 'delivered_count'))
}

async function markCampaignOpened(campaignId: string, customerId: string): Promise<void> {
  await incrementCampaignSendMetric(campaignId, customerId, 'opened_at', 'opened_count')
}

async function markCampaignFailed(campaignId: string, customerId: string, failureReason?: string | null): Promise<void> {
  const result = await db
    .update(campaignSends)
    .set({ status: 'failed', ...(failureReason ? { failureReason: failureReason.slice(0, 2000) } : {}) })
    .where(and(
      eq(campaignSends.campaignId, campaignId),
      eq(campaignSends.customerId, customerId),
      sql`${campaignSends.status} <> 'failed'`,
    ))

  await incrementCampaignCounterIfChanged(result, campaignId, 'failed_count')
}

async function incrementCampaignSendMetric(
  campaignId: string,
  customerId: string,
  timestampField: 'opened_at' | 'clicked_at',
  counterField: 'opened_count' | 'clicked_count',
): Promise<void> {
  const result = await db.execute(sql`
    UPDATE campaign_sends
    SET ${sql.raw(timestampField)} = NOW()
    WHERE campaign_id = ${campaignId}
      AND customer_id = ${customerId}
      AND ${sql.raw(timestampField)} IS NULL
  `)

  await incrementCampaignCounterIfChanged(result, campaignId, counterField)
}

async function incrementCampaignCounterIfChanged(
  result: unknown,
  campaignId: string,
  counterField: 'delivered_count' | 'opened_count' | 'clicked_count' | 'failed_count',
): Promise<void> {
  const changed = (result as { rowCount?: number }).rowCount ?? 0
  if (changed <= 0) return

  await db.execute(sql`
    UPDATE campaigns
    SET ${sql.raw(counterField)} = ${sql.raw(counterField)} + ${changed},
        updated_at = NOW()
    WHERE id = ${campaignId}
  `)
}
