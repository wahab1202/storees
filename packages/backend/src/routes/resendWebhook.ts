import { Router } from 'express'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { campaignSends, campaigns } from '../db/schema.js'

const router = Router()

/**
 * Resend webhook event types we handle.
 * See: https://resend.com/docs/dashboard/webhooks/introduction
 */
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

// Column name → timestamp field + aggregate counter field
const EVENT_MAP: Record<string, { tsField: string; counterField: string }> = {
  'email.delivered': { tsField: 'delivered_at', counterField: 'delivered_count' },
  'email.opened': { tsField: 'opened_at', counterField: 'opened_count' },
  'email.clicked': { tsField: 'clicked_at', counterField: 'clicked_count' },
  'email.bounced': { tsField: 'bounced_at', counterField: 'bounced_count' },
  'email.complained': { tsField: 'complained_at', counterField: 'complained_count' },
}

/**
 * POST /api/webhooks/resend
 * Resend sends email delivery events here.
 * We look up the campaign_send by resend_message_id and update tracking fields.
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body as ResendWebhookPayload

    const mapping = EVENT_MAP[payload.type]
    if (!mapping) {
      // Event type we don't track (e.g. email.sent — we already track that)
      return res.json({ received: true })
    }

    const emailId = payload.data?.email_id
    if (!emailId) {
      return res.status(400).json({ error: 'Missing email_id' })
    }

    // Find the campaign_send by resend_message_id
    const [send] = await db
      .select({ id: campaignSends.id, campaignId: campaignSends.campaignId })
      .from(campaignSends)
      .where(eq(campaignSends.resendMessageId, emailId))
      .limit(1)

    if (!send) {
      // Could be a non-campaign email (e.g., flow email) — ignore gracefully
      return res.json({ received: true })
    }

    const now = new Date()

    // Update send record + increment campaign counter atomically.
    // Only sets timestamp if NULL (first occurrence) — prevents double-counting on duplicate webhooks.
    const updateResult = await db.execute(sql`
      UPDATE campaign_sends
      SET ${sql.raw(mapping.tsField)} = ${now}
      WHERE id = ${send.id} AND ${sql.raw(mapping.tsField)} IS NULL
    `)

    // Only increment aggregate counter if we actually updated a row (was first occurrence)
    if ((updateResult as { rowCount?: number }).rowCount && (updateResult as { rowCount: number }).rowCount > 0) {
      await db.execute(sql`
        UPDATE campaigns
        SET ${sql.raw(mapping.counterField)} = ${sql.raw(mapping.counterField)} + 1,
            updated_at = NOW()
        WHERE id = ${send.campaignId}
      `)
    }

    res.json({ received: true })
  } catch (err) {
    console.error('Resend webhook error:', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

export default router
