import { Router } from 'express'
import crypto from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { campaignSends, campaigns, messages, emailSuppressions } from '../db/schema.js'
import { redis } from '../services/redis.js'
import { handleDeliveryReceipt } from '../services/messageStatusService.js'

const router = Router()

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? ''
const RESEND_WEBHOOK_DEDUP_PREFIX = 'resend-webhook:'
const RESEND_WEBHOOK_DEDUP_TTL = 86400 // 24 hours
const SVIX_TIMESTAMP_TOLERANCE_S = 5 * 60 // 5 minutes — protects against replay

/**
 * Verify a svix-signed Resend webhook. svix is the standard webhook signing
 * format Resend uses; we re-implement the verification here (~20 lines)
 * rather than pull in the svix client just for this one call.
 *
 * Format:
 *   svix-id:        unique message id (also used for dedupe)
 *   svix-timestamp: epoch seconds
 *   svix-signature: space-separated list of "v1,<base64>" entries
 *
 * Signed payload: `${svix-id}.${svix-timestamp}.${rawBody}`
 * Signature:      base64( HMAC-SHA256(decoded_secret, signed_payload) )
 *
 * Returns true on success. Returns false (and the caller should 401) if:
 *   - secret not configured (fail closed)
 *   - any required header missing
 *   - timestamp older than 5 minutes (replay protection)
 *   - signature mismatch (constant-time compare)
 */
function verifySvixSignature(
  rawBody: Buffer,
  svixId: string | undefined,
  svixTimestamp: string | undefined,
  svixSignatureHeader: string | undefined,
): boolean {
  if (!RESEND_WEBHOOK_SECRET) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured — rejecting')
    return false
  }
  if (!svixId || !svixTimestamp || !svixSignatureHeader) return false

  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts)) return false
  const ageS = Math.abs(Math.floor(Date.now() / 1000) - ts)
  if (ageS > SVIX_TIMESTAMP_TOLERANCE_S) {
    console.warn(`[resend-webhook] timestamp out of tolerance (age=${ageS}s)`)
    return false
  }

  // Strip the whsec_ prefix and base64-decode the secret
  const rawSecret = RESEND_WEBHOOK_SECRET.startsWith('whsec_')
    ? RESEND_WEBHOOK_SECRET.slice('whsec_'.length)
    : RESEND_WEBHOOK_SECRET
  let secretBuf: Buffer
  try {
    secretBuf = Buffer.from(rawSecret, 'base64')
  } catch {
    console.error('[resend-webhook] failed to decode secret')
    return false
  }

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody.toString('utf-8')}`
  const expected = crypto.createHmac('sha256', secretBuf).update(signedPayload).digest('base64')
  const expectedBuf = Buffer.from(expected)

  // Header carries one or more "v1,<base64>" entries (rotation support); accept any match
  const sigs = svixSignatureHeader.split(' ')
  for (const entry of sigs) {
    const [version, sig] = entry.split(',')
    if (version !== 'v1' || !sig) continue
    const sigBuf = Buffer.from(sig)
    if (sigBuf.length !== expectedBuf.length) continue
    if (crypto.timingSafeEqual(sigBuf, expectedBuf)) return true
  }
  return false
}

type ResendWebhookPayload = {
  type: string
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    created_at: string
    // Bounce events carry a bounce sub-shape; we use it to distinguish
    // hard bounces (suppress permanently) from soft bounces (don't).
    bounce?: {
      type?: string // 'hard_bounce' | 'soft_bounce' | other
      message?: string
    }
  }
}

/**
 * Look up the Storees project that owns this Resend message id. The recipient
 * email is taken straight from the webhook payload (data.to[]) — Resend is
 * authoritative for what got sent. Project comes from the messages row that
 * was written when the send was queued.
 */
async function resolveProjectId(emailId: string): Promise<string | null> {
  const [msg] = await db
    .select({ projectId: messages.projectId })
    .from(messages)
    .where(eq(messages.providerMessageId, emailId))
    .limit(1)
  return msg?.projectId ?? null
}

/**
 * Insert a row into email_suppressions if not already present. The unique
 * index on (project_id, lower(email)) makes this safe to call many times.
 */
async function suppressEmail(
  projectId: string,
  email: string,
  reason: 'hard_bounce' | 'complained' | 'unsubscribed' | 'manual',
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db
    .insert(emailSuppressions)
    .values({
      projectId,
      email: email.toLowerCase().trim(),
      reason,
      source: 'resend_webhook',
      metadata,
    })
    .onConflictDoNothing()
}

// Campaign tracking: column + counter (email-specific aggregate counters live here, not in
// the shared message-status service, since SMS/WhatsApp use a different aggregate model).
const CAMPAIGN_EVENT_MAP: Record<string, { tsField: string; counterField: string }> = {
  'email.delivered': { tsField: 'delivered_at', counterField: 'delivered_count' },
  'email.opened': { tsField: 'opened_at', counterField: 'opened_count' },
  'email.clicked': { tsField: 'clicked_at', counterField: 'clicked_count' },
  'email.bounced': { tsField: 'bounced_at', counterField: 'bounced_count' },
  'email.complained': { tsField: 'complained_at', counterField: 'complained_count' },
}

// Resend event → unified delivery-receipt status. The shared
// messageStatusService maps this to messages.<status>_at + emits a
// `email_<status>` event row (email_read on opens, matching whatsapp_read /
// sms_read for cross-channel queries).
const RECEIPT_STATUS_MAP: Record<string, 'delivered' | 'read' | 'clicked' | 'failed'> = {
  'email.delivered': 'delivered',
  'email.opened': 'read',
  'email.clicked': 'clicked',
  'email.bounced': 'failed',
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
    const rawBody = req.body as Buffer
    const svixId = req.headers['svix-id'] as string | undefined
    const svixTs = req.headers['svix-timestamp'] as string | undefined
    const svixSig = req.headers['svix-signature'] as string | undefined

    if (!verifySvixSignature(rawBody, svixId, svixTs, svixSig)) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    // Idempotency: dedupe by svix-id (svix guarantees the same id is reused on retry)
    const dedupKey = `${RESEND_WEBHOOK_DEDUP_PREFIX}${svixId}`
    const isFirst = await redis.set(dedupKey, '1', 'EX', RESEND_WEBHOOK_DEDUP_TTL, 'NX')
    if (!isFirst) {
      // Already processed — respond 200 so svix doesn't retry, but skip the work
      return res.json({ received: true, deduped: true })
    }

    const payload = JSON.parse(rawBody.toString('utf-8')) as ResendWebhookPayload
    const emailId = payload.data?.email_id
    if (!emailId) return res.status(400).json({ error: 'Missing email_id' })

    const campaignMapping = CAMPAIGN_EVENT_MAP[payload.type]
    const receiptStatus = RECEIPT_STATUS_MAP[payload.type]

    if (!campaignMapping && !receiptStatus) {
      return res.json({ received: true })
    }

    const now = new Date()

    // ── Suppression: hard bounces and complaints get added to email_suppressions
    //    so they're never re-sent to. Soft bounces are NOT suppressed (transient).
    const isHardBounce = payload.type === 'email.bounced' && (
      // Resend's payload shape: data.bounce.type indicates hard vs soft.
      // If absent (older payloads), treat as hard since Resend escalates
      // permanent failures to .bounced.
      !payload.data.bounce?.type ||
      payload.data.bounce.type === 'hard_bounce' ||
      payload.data.bounce.type === 'permanent'
    )
    const isComplaint = payload.type === 'email.complained'

    if (isHardBounce || isComplaint) {
      const projectId = await resolveProjectId(emailId)
      const recipient = payload.data.to?.[0]
      if (projectId && recipient) {
        await suppressEmail(
          projectId,
          recipient,
          isHardBounce ? 'hard_bounce' : 'complained',
          {
            email_id: emailId,
            bounce_type: payload.data.bounce?.type,
            bounce_message: payload.data.bounce?.message,
          },
        )
      }
    }

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

    // ── 2. Update messages.<status>_at + emit `email_<status>` event ──
    // Goes through the shared messageStatusService so email gets the same
    // delivery-receipt + read-status pipeline as WhatsApp/SMS. On
    // email.opened this writes messages.read_at + status='read' + an
    // `email_read` event (parallel to whatsapp_read / sms_read for
    // cross-channel "has read" segment filters and timeline rendering).
    if (receiptStatus) {
      await handleDeliveryReceipt(emailId, receiptStatus, 'email', 'resend')
    }

    res.json({ received: true })
  } catch (err) {
    console.error('Resend webhook error:', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

export default router
