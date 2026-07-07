import { Router } from 'express'
import crypto from 'node:crypto'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { inboundWebhooks, inboundWebhookEvents, eventDefinitions } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { inferWebhookSchema, reprocessWebhook } from '../services/inboundWebhookService.js'

const router = Router()

/**
 * Admin surface for inbound-webhook data sources (Event Sources page).
 * The public receiver lives at routes/hooks.ts (POST /api/hooks/:token).
 */

// GET /api/inbound-webhooks?projectId=… — list with 24h receive counts
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const rows = await db.execute(sql`
      SELECT w.*, COALESCE(c.received_24h, 0)::int AS received_24h
      FROM inbound_webhooks w
      LEFT JOIN (
        SELECT webhook_id, COUNT(*) AS received_24h
        FROM inbound_webhook_events
        WHERE received_at > NOW() - INTERVAL '24 hours'
        GROUP BY webhook_id
      ) c ON c.webhook_id = w.id
      WHERE w.project_id = ${projectId}
      ORDER BY w.created_at DESC
    `)
    const data = (rows.rows as Array<Record<string, unknown>>).map(r => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      token: r.token,
      status: r.status,
      lastReceivedAt: r.last_received_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      received24h: r.received_24h,
    }))
    res.json({ success: true, data })
  } catch (err) {
    console.error('GET /inbound-webhooks error:', err)
    res.status(500).json({ success: false, error: 'Failed to load webhooks' })
  }
})

// POST /api/inbound-webhooks?projectId=… — create (name only; token generated)
router.post('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const name = String((req.body as { name?: string }).name ?? '').trim()
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' })

    const token = crypto.randomBytes(24).toString('base64url') // 32 chars, URL-safe
    const [created] = await db.insert(inboundWebhooks).values({ projectId, name, token }).returning()
    res.status(201).json({ success: true, data: created })
  } catch (err) {
    console.error('POST /inbound-webhooks error:', err)
    res.status(500).json({ success: false, error: 'Failed to create webhook' })
  }
})

// GET /api/inbound-webhooks/:id — detail
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const [hook] = await db.select().from(inboundWebhooks)
      .where(and(eq(inboundWebhooks.id, req.params.id as string), eq(inboundWebhooks.projectId, req.projectId!)))
      .limit(1)
    if (!hook) return res.status(404).json({ success: false, error: 'Webhook not found' })
    res.json({ success: true, data: hook })
  } catch (err) {
    console.error('GET /inbound-webhooks/:id error:', err)
    res.status(500).json({ success: false, error: 'Failed to load webhook' })
  }
})

// PATCH /api/inbound-webhooks/:id — rename / pause / resume
router.patch('/:id', requireProjectId, async (req, res) => {
  try {
    const { name, status, secretHeader, regenerateToken } = req.body as {
      name?: string; status?: 'active' | 'paused'; secretHeader?: string | null; regenerateToken?: boolean
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = String(name).trim()
    if (status !== undefined) {
      if (!['active', 'paused'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' })
      updates.status = status
    }
    // Optional shared-secret header: string sets it, null/'' clears it
    if (secretHeader !== undefined) {
      updates.secretHeader = secretHeader ? String(secretHeader).trim().slice(0, 128) : null
    }
    // Rotate the URL token — the old receive URL stops working immediately
    if (regenerateToken) {
      updates.token = crypto.randomBytes(24).toString('base64url')
    }
    const [updated] = await db.update(inboundWebhooks).set(updates)
      .where(and(eq(inboundWebhooks.id, req.params.id as string), eq(inboundWebhooks.projectId, req.projectId!)))
      .returning()
    if (!updated) return res.status(404).json({ success: false, error: 'Webhook not found' })
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('PATCH /inbound-webhooks/:id error:', err)
    res.status(500).json({ success: false, error: 'Failed to update webhook' })
  }
})

// DELETE /api/inbound-webhooks/:id — cascades to events + definitions
router.delete('/:id', requireProjectId, async (req, res) => {
  try {
    const [deleted] = await db.delete(inboundWebhooks)
      .where(and(eq(inboundWebhooks.id, req.params.id as string), eq(inboundWebhooks.projectId, req.projectId!)))
      .returning({ id: inboundWebhooks.id })
    if (!deleted) return res.status(404).json({ success: false, error: 'Webhook not found' })
    res.json({ success: true, data: { id: deleted.id } })
  } catch (err) {
    console.error('DELETE /inbound-webhooks/:id error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete webhook' })
  }
})

// GET /api/inbound-webhooks/:id/events?page=&pageSize= — receipt log
router.get('/:id/events', requireProjectId, async (req, res) => {
  try {
    const webhookId = req.params.id as string
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')))
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '25'))))

    const [hook] = await db.select({ id: inboundWebhooks.id }).from(inboundWebhooks)
      .where(and(eq(inboundWebhooks.id, webhookId), eq(inboundWebhooks.projectId, req.projectId!)))
      .limit(1)
    if (!hook) return res.status(404).json({ success: false, error: 'Webhook not found' })

    const [rows, [{ count }]] = await Promise.all([
      db.select().from(inboundWebhookEvents)
        .where(eq(inboundWebhookEvents.webhookId, webhookId))
        .orderBy(desc(inboundWebhookEvents.receivedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(inboundWebhookEvents)
        .where(eq(inboundWebhookEvents.webhookId, webhookId)),
    ])

    res.json({
      success: true,
      data: rows,
      pagination: { page, pageSize, total: count, totalPages: Math.max(1, Math.ceil(count / pageSize)) },
    })
  } catch (err) {
    console.error('GET /inbound-webhooks/:id/events error:', err)
    res.status(500).json({ success: false, error: 'Failed to load webhook events' })
  }
})

// POST /api/inbound-webhooks/:id/reprocess — re-run current definitions over
// past raw payloads (for events received before the definition existed/was fixed)
router.post('/:id/reprocess', requireProjectId, async (req, res) => {
  try {
    const webhookId = req.params.id as string
    const [hook] = await db.select({ id: inboundWebhooks.id, projectId: inboundWebhooks.projectId })
      .from(inboundWebhooks)
      .where(and(eq(inboundWebhooks.id, webhookId), eq(inboundWebhooks.projectId, req.projectId!)))
      .limit(1)
    if (!hook) return res.status(404).json({ success: false, error: 'Webhook not found' })

    const onlyUnmatched = String((req.body as { onlyUnmatched?: boolean }).onlyUnmatched ?? true) !== 'false'
    const result = await reprocessWebhook({ id: hook.id, projectId: hook.projectId }, { onlyUnmatched })
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('POST /inbound-webhooks/:id/reprocess error:', err)
    res.status(500).json({ success: false, error: 'Failed to reprocess' })
  }
})

// GET /api/inbound-webhooks/:id/schema — observed dot-path schema
router.get('/:id/schema', requireProjectId, async (req, res) => {
  try {
    const webhookId = req.params.id as string
    const [hook] = await db.select({ id: inboundWebhooks.id }).from(inboundWebhooks)
      .where(and(eq(inboundWebhooks.id, webhookId), eq(inboundWebhooks.projectId, req.projectId!)))
      .limit(1)
    if (!hook) return res.status(404).json({ success: false, error: 'Webhook not found' })

    const fields = await inferWebhookSchema(webhookId)
    res.json({ success: true, data: fields })
  } catch (err) {
    console.error('GET /inbound-webhooks/:id/schema error:', err)
    res.status(500).json({ success: false, error: 'Failed to infer schema' })
  }
})

// ─── Event definitions ──────────────────────────────────

// GET /api/inbound-webhooks/:id/definitions
router.get('/:id/definitions', requireProjectId, async (req, res) => {
  try {
    const rows = await db.select().from(eventDefinitions)
      .where(and(eq(eventDefinitions.webhookId, req.params.id as string), eq(eventDefinitions.projectId, req.projectId!)))
      .orderBy(desc(eventDefinitions.createdAt))
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('GET /inbound-webhooks/:id/definitions error:', err)
    res.status(500).json({ success: false, error: 'Failed to load definitions' })
  }
})

// POST /api/inbound-webhooks/:id/definitions
router.post('/:id/definitions', requireProjectId, async (req, res) => {
  try {
    const webhookId = req.params.id as string
    const [hook] = await db.select({ id: inboundWebhooks.id }).from(inboundWebhooks)
      .where(and(eq(inboundWebhooks.id, webhookId), eq(inboundWebhooks.projectId, req.projectId!)))
      .limit(1)
    if (!hook) return res.status(404).json({ success: false, error: 'Webhook not found' })

    const body = req.body as {
      name?: string; filters?: unknown; propertyMappings?: unknown
      attributeMappings?: unknown; identityPaths?: unknown; isActive?: boolean
    }
    const name = String(body.name ?? '').trim()
    if (!name) return res.status(400).json({ success: false, error: 'Event name is required' })
    if (!/^[a-z0-9_]+$/.test(name)) {
      return res.status(400).json({ success: false, error: 'Event name must be lowercase letters, numbers and underscores (it becomes the event_name)' })
    }

    const [created] = await db.insert(eventDefinitions).values({
      projectId: req.projectId!,
      webhookId,
      name,
      filters: (body.filters as object | null) ?? null,
      propertyMappings: (body.propertyMappings as object) ?? [],
      attributeMappings: (body.attributeMappings as object) ?? [],
      identityPaths: (body.identityPaths as object | null) ?? null,
      isActive: body.isActive ?? true,
    }).returning()
    res.status(201).json({ success: true, data: created })
  } catch (err) {
    console.error('POST /inbound-webhooks/:id/definitions error:', err)
    res.status(500).json({ success: false, error: 'Failed to create definition' })
  }
})

// PATCH /api/inbound-webhooks/definitions/:defId
router.patch('/definitions/:defId', requireProjectId, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!/^[a-z0-9_]+$/.test(name)) return res.status(400).json({ success: false, error: 'Invalid event name' })
      updates.name = name
    }
    for (const key of ['filters', 'propertyMappings', 'attributeMappings', 'identityPaths', 'isActive']) {
      if (body[key] !== undefined) updates[key] = body[key]
    }
    const [updated] = await db.update(eventDefinitions).set(updates)
      .where(and(eq(eventDefinitions.id, req.params.defId as string), eq(eventDefinitions.projectId, req.projectId!)))
      .returning()
    if (!updated) return res.status(404).json({ success: false, error: 'Definition not found' })
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('PATCH /inbound-webhooks/definitions/:defId error:', err)
    res.status(500).json({ success: false, error: 'Failed to update definition' })
  }
})

// DELETE /api/inbound-webhooks/definitions/:defId
router.delete('/definitions/:defId', requireProjectId, async (req, res) => {
  try {
    const [deleted] = await db.delete(eventDefinitions)
      .where(and(eq(eventDefinitions.id, req.params.defId as string), eq(eventDefinitions.projectId, req.projectId!)))
      .returning({ id: eventDefinitions.id })
    if (!deleted) return res.status(404).json({ success: false, error: 'Definition not found' })
    res.json({ success: true, data: { id: deleted.id } })
  } catch (err) {
    console.error('DELETE /inbound-webhooks/definitions/:defId error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete definition' })
  }
})

export default router
