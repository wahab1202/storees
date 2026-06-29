import { Router } from 'express'
import crypto from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { webhookSubscriptions, webhookDeliveries } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { encrypt } from '../services/encryption.js'
import { webhookDeliveryQueue } from '../services/queue.js'

// Outbound webhook management (Settings → Webhooks backend). The signing secret
// is encrypted at rest and only ever returned in full on create/regenerate
// (shown once); list/get return a masked preview.

const router = Router()

const VALID_AUTH = new Set(['hmac', 'bearer'])

function maskSecretPreview(): string {
  // We never decrypt to show the secret again — just a fixed mask.
  return '••••••••••••'
}

function genSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}

// GET /api/webhooks/subscriptions — list for the active project
router.get('/subscriptions', requireProjectId, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: webhookSubscriptions.id,
        url: webhookSubscriptions.url,
        description: webhookSubscriptions.description,
        authMethod: webhookSubscriptions.authMethod,
        events: webhookSubscriptions.events,
        customHeaders: webhookSubscriptions.customHeaders,
        isActive: webhookSubscriptions.isActive,
        createdAt: webhookSubscriptions.createdAt,
      })
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.projectId, req.projectId!))
      .orderBy(desc(webhookSubscriptions.createdAt))

    res.json({ success: true, data: rows.map(r => ({ ...r, secretPreview: maskSecretPreview() })) })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// POST /api/webhooks/subscriptions — create. Returns the plaintext secret ONCE.
router.post('/subscriptions', requireProjectId, async (req, res) => {
  try {
    const { url, description, authMethod, events, customHeaders, signingSecret, isActive } = req.body as {
      url?: string
      description?: string
      authMethod?: string
      events?: string[]
      customHeaders?: Record<string, string>
      signingSecret?: string
      isActive?: boolean
    }

    if (!url || !/^https:\/\//i.test(url)) {
      return res.status(400).json({ success: false, error: 'A valid HTTPS url is required' })
    }
    const auth = authMethod ?? 'hmac'
    if (!VALID_AUTH.has(auth)) {
      return res.status(400).json({ success: false, error: "authMethod must be 'hmac' or 'bearer'" })
    }
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one event must be subscribed' })
    }

    const secret = signingSecret?.trim() || genSecret()

    const [created] = await db.insert(webhookSubscriptions).values({
      projectId: req.projectId!,
      url,
      description: description ?? null,
      authMethod: auth,
      signingSecret: encrypt(secret),
      events,
      customHeaders: customHeaders ?? {},
      isActive: isActive ?? true,
    }).returning({ id: webhookSubscriptions.id })

    // Secret returned in the clear exactly once.
    res.json({ success: true, data: { id: created.id, signingSecret: secret } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// PATCH /api/webhooks/subscriptions/:id — update fields; pass regenerateSecret to rotate.
router.patch('/subscriptions/:id', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string
    const [existing] = await db.select({ id: webhookSubscriptions.id })
      .from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.projectId, req.projectId!)))
      .limit(1)
    if (!existing) return res.status(404).json({ success: false, error: 'Subscription not found' })

    const { url, description, authMethod, events, customHeaders, isActive, regenerateSecret } = req.body as {
      url?: string; description?: string; authMethod?: string; events?: string[]
      customHeaders?: Record<string, string>; isActive?: boolean; regenerateSecret?: boolean
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (url !== undefined) {
      if (!/^https:\/\//i.test(url)) return res.status(400).json({ success: false, error: 'url must be HTTPS' })
      patch.url = url
    }
    if (description !== undefined) patch.description = description
    if (authMethod !== undefined) {
      if (!VALID_AUTH.has(authMethod)) return res.status(400).json({ success: false, error: "authMethod must be 'hmac' or 'bearer'" })
      patch.authMethod = authMethod
    }
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) return res.status(400).json({ success: false, error: 'At least one event required' })
      patch.events = events
    }
    if (customHeaders !== undefined) patch.customHeaders = customHeaders
    if (isActive !== undefined) patch.isActive = isActive

    let newSecret: string | null = null
    if (regenerateSecret) {
      newSecret = genSecret()
      patch.signingSecret = encrypt(newSecret)
    }

    await db.update(webhookSubscriptions).set(patch).where(eq(webhookSubscriptions.id, id))
    res.json({ success: true, data: { id, ...(newSecret ? { signingSecret: newSecret } : {}) } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// DELETE /api/webhooks/subscriptions/:id
router.delete('/subscriptions/:id', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string
    const result = await db.delete(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.projectId, req.projectId!)))
      .returning({ id: webhookSubscriptions.id })
    if (result.length === 0) return res.status(404).json({ success: false, error: 'Subscription not found' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// GET /api/webhooks/subscriptions/:id/deliveries — delivery log
router.get('/subscriptions/:id/deliveries', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string
    const [sub] = await db.select({ id: webhookSubscriptions.id })
      .from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.projectId, req.projectId!)))
      .limit(1)
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' })

    const limit = Math.min(Number(req.query.limit ?? 50), 200)
    const rows = await db.select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.subscriptionId, id))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit)
    res.json({ success: true, data: rows })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// POST /api/webhooks/deliveries/:id/resend — re-deliver a past attempt
router.post('/deliveries/:id/resend', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string
    // Confirm the delivery belongs to a subscription in this project.
    const [row] = await db
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .innerJoin(webhookSubscriptions, eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId))
      .where(and(eq(webhookDeliveries.id, id), eq(webhookSubscriptions.projectId, req.projectId!)))
      .limit(1)
    if (!row) return res.status(404).json({ success: false, error: 'Delivery not found' })

    await db.update(webhookDeliveries)
      .set({ final: false, attempt: 1, nextRetryAt: null, error: null })
      .where(eq(webhookDeliveries.id, id))
    await webhookDeliveryQueue.add('deliver', { deliveryId: id })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// POST /api/webhooks/subscriptions/:id/test — fire a sample payload
router.post('/subscriptions/:id/test', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string
    const [sub] = await db.select()
      .from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.projectId, req.projectId!)))
      .limit(1)
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' })

    const eventType = (sub.events as string[])[0] ?? 'customer.segment.entered'
    const deliveryId = crypto.randomUUID()
    const envelope = {
      id: `evt_${crypto.randomUUID()}`,
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      delivery_id: `del_${deliveryId}`,
      project_id: req.projectId!,
      test: true,
      data: {
        customer_id: 'test_customer',
        customer_email: 'test@example.com',
        segment: { id: 'seg_test', name: 'Test Segment' },
      },
    }
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      subscriptionId: sub.id,
      eventId: eventType,
      eventData: envelope,
      attempt: 1,
      final: false,
    })
    await webhookDeliveryQueue.add('deliver', { deliveryId })
    res.json({ success: true, data: { deliveryId } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
