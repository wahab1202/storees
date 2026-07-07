import { Router } from 'express'
import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { inboundWebhooks } from '../db/schema.js'
import { processInboundPayload } from '../services/inboundWebhookService.js'

const router = Router()

/**
 * POST /api/hooks/:token — public inbound-webhook receiver.
 *
 * The token IS the auth (per-endpoint secret embedded in the URL the user
 * copies out of the Event Sources page). Accepts any JSON body; logs it raw
 * and runs the webhook's event definitions over it.
 */
router.post('/:token', async (req, res) => {
  try {
    const token = req.params.token as string
    if (!token || token.length < 16) {
      return res.status(404).json({ success: false, error: 'Unknown webhook' })
    }

    const [hook] = await db
      .select({ id: inboundWebhooks.id, projectId: inboundWebhooks.projectId, status: inboundWebhooks.status, secretHeader: inboundWebhooks.secretHeader })
      .from(inboundWebhooks)
      .where(eq(inboundWebhooks.token, token))
      .limit(1)

    if (!hook) return res.status(404).json({ success: false, error: 'Unknown webhook' })
    if (hook.status !== 'active') {
      return res.status(409).json({ success: false, error: 'Webhook is paused' })
    }

    // Optional defense-in-depth: constant-time check of the shared-secret
    // header when the webhook has one configured.
    if (hook.secretHeader) {
      const presented = String(req.headers['x-storees-secret'] ?? '')
      const a = Buffer.from(presented)
      const b = Buffer.from(hook.secretHeader)
      const match = a.length === b.length && crypto.timingSafeEqual(a, b)
      if (!match) return res.status(401).json({ success: false, error: 'Invalid or missing x-storees-secret header' })
    }

    const payload = (req.body ?? {}) as Record<string, unknown>
    if (typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ success: false, error: 'Body must be a JSON object' })
    }

    // Keep a bounded, useful subset of headers (drop hop-by-hop noise)
    const headers: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (['authorization', 'cookie'].includes(k)) continue
      headers[k] = Array.isArray(v) ? v.join(', ') : v
    }

    const result = await processInboundPayload(hook, headers, payload)
    res.status(200).json({ success: true, data: { status: result.status, matched: result.matched.length } })
  } catch (err) {
    console.error('POST /api/hooks/:token error:', err)
    res.status(500).json({ success: false, error: 'Failed to process payload' })
  }
})

// Anything but POST is a sender misconfiguration — answer helpfully.
router.all('/:token', (_req, res) => {
  res.status(405).json({ success: false, error: 'Use POST with a JSON body — this endpoint receives webhook deliveries' })
})

export default router
