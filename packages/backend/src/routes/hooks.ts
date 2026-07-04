import { Router } from 'express'
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
      .select({ id: inboundWebhooks.id, projectId: inboundWebhooks.projectId, status: inboundWebhooks.status })
      .from(inboundWebhooks)
      .where(eq(inboundWebhooks.token, token))
      .limit(1)

    if (!hook) return res.status(404).json({ success: false, error: 'Unknown webhook' })
    if (hook.status !== 'active') {
      return res.status(409).json({ success: false, error: 'Webhook is paused' })
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

export default router
