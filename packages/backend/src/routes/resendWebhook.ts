import { Router } from 'express'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { campaignSends, campaigns, messages, events } from '../db/schema.js'

const router = Router()

type ResendWebhookPayload = {
  type: string
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    created_at: string
  }
}

// Campaign tracking: column + counter
const CAMPAIGN_EVENT_MAP: Record<string, { tsField: string; counterField: string }> = {
  'email.delivered': { tsField: 'delivered_at', counterField: 'delivered_count' },
  'email.opened': { tsField: 'opened_at', counterField: 'opened_count' },
  'email.clicked': { tsField: 'clicked_at', counterField: 'clicked_count' },
  'email.bounced': { tsField: 'bounced_at', counterField: 'bounced_count' },
  'email.complained': { tsField: 'complained_at', counterField: 'complained_count' },
}

// Messages table tracking: column name
const MESSAGE_EVENT_MAP: Record<string, string> = {
  'email.delivered': 'delivered_at',
  'email.opened': 'read_at',
  'email.clicked': 'clicked_at',
  'email.bounced': 'failed_at',
}

// Storees event names for activity timeline
const STOREES_EVENT_MAP: Record<string, string> = {
  'email.delivered': 'email_delivered',
  'email.opened': 'email_opened',
  'email.clicked': 'email_clicked',
  'email.bounced': 'email_bounced',
  'email.complained': 'email_complained',
}

/**
 * POST /api/webhooks/resend
 *
 * Handles email delivery events from Resend. Updates:
 * 1. campaign_sends table (campaign emails)
 * 2. messages table (all emails — campaigns + flows)
 * 3. Creates tracking events in events table (for activity timeline)
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body as ResendWebhookPayload
    const emailId = payload.data?.email_id
    if (!emailId) return res.status(400).json({ error: 'Missing email_id' })

    const campaignMapping = CAMPAIGN_EVENT_MAP[payload.type]
    const messageField = MESSAGE_EVENT_MAP[payload.type]
    const storeesEvent = STOREES_EVENT_MAP[payload.type]

    if (!campaignMapping && !messageField) {
      return res.json({ received: true })
    }

    const now = new Date()

    // ── 1. Update campaign_sends (if this is a campaign email) ──
    if (campaignMapping) {
      const [send] = await db
        .select({ id: campaignSends.id, campaignId: campaignSends.campaignId, customerId: campaignSends.customerId })
        .from(campaignSends)
        .where(eq(campaignSends.resendMessageId, emailId))
        .limit(1)

      if (send) {
        const result = await db.execute(sql`
          UPDATE campaign_sends
          SET ${sql.raw(campaignMapping.tsField)} = ${now}
          WHERE id = ${send.id} AND ${sql.raw(campaignMapping.tsField)} IS NULL
        `)

        if ((result as { rowCount?: number }).rowCount && (result as { rowCount: number }).rowCount > 0) {
          await db.execute(sql`
            UPDATE campaigns
            SET ${sql.raw(campaignMapping.counterField)} = ${sql.raw(campaignMapping.counterField)} + 1,
                updated_at = NOW()
            WHERE id = ${send.campaignId}
          `)
        }
      }
    }

    // ── 2. Update messages table (campaigns + flows + any email) ──
    if (messageField) {
      const [msg] = await db
        .select({
          id: messages.id,
          projectId: messages.projectId,
          customerId: messages.customerId,
          campaignId: messages.campaignId,
          flowTripId: messages.flowTripId,
          status: messages.status,
        })
        .from(messages)
        .where(eq(messages.providerMessageId, emailId))
        .limit(1)

      if (msg) {
        // Update timestamp (idempotent — only first occurrence)
        await db.execute(sql`
          UPDATE messages
          SET ${sql.raw(messageField)} = ${now},
              status = CASE
                WHEN ${messageField} = 'failed_at' THEN 'failed'
                WHEN ${messageField} = 'clicked_at' THEN 'clicked'
                WHEN ${messageField} = 'read_at' THEN 'read'
                WHEN ${messageField} = 'delivered_at' AND status = 'sent' THEN 'delivered'
                ELSE status
              END
          WHERE id = ${msg.id} AND ${sql.raw(messageField)} IS NULL
        `)

        // ── 3. Create tracking event (for activity timeline) ──
        if (storeesEvent && msg.customerId) {
          await db.insert(events).values({
            projectId: msg.projectId,
            customerId: msg.customerId,
            eventName: storeesEvent,
            properties: {
              message_id: msg.id,
              channel: 'email',
              campaign_id: msg.campaignId ?? undefined,
              flow_trip_id: msg.flowTripId ?? undefined,
              subject: payload.data.subject,
            },
            platform: 'email',
            source: 'resend_webhook',
            idempotencyKey: `${payload.type}_${emailId}`,
            timestamp: now,
          }).onConflictDoNothing()
        }
      }
    }

    res.json({ received: true })
  } catch (err) {
    console.error('Resend webhook error:', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

export default router
