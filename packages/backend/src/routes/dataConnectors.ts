import { Router } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import {
  dataSourceConnectors,
  dataSourceSyncs,
  dataSourceSyncLogs,
} from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { encrypt, decrypt } from '../services/encryption.js'
import { listTemplates, getTemplate, cloneTemplate } from '../services/connectorRegistry.js'
import { testConnection, type RuntimeConfig } from '../services/connectors/genericHttpConnector.js'
import { dataSyncQueue } from '../services/queue.js'

// Admin endpoints for managing data-source connectors. Onboarding team uses
// these from the project page in the Storees admin UI. No client-side
// engineering — they just enter URL + creds and press buttons.

const router = Router()

// ── Templates catalogue ──────────────────────────────────────────────────────
// Listed in the "Add Connector" dialog so the user can pick (VirpanAI for a
// VirpanAI-backed client, Custom HTTP for everyone else).

router.get('/templates', async (_req, res) => {
  res.json({ success: true, data: listTemplates() })
})

router.get('/templates/:id', async (req, res) => {
  const template = getTemplate((req.params.id as string))
  if (!template) return res.status(404).json({ success: false, error: 'Template not found' })
  res.json({ success: true, data: template })
})

// ── Connectors CRUD ──────────────────────────────────────────────────────────

router.get('/connectors', requireProjectId, async (req, res) => {
  const rows = await db
    .select({
      id: dataSourceConnectors.id,
      template: dataSourceConnectors.template,
      name: dataSourceConnectors.name,
      baseUrl: dataSourceConnectors.baseUrl,
      status: dataSourceConnectors.status,
      lastSyncedAt: dataSourceConnectors.lastSyncedAt,
      createdAt: dataSourceConnectors.createdAt,
      updatedAt: dataSourceConnectors.updatedAt,
    })
    .from(dataSourceConnectors)
    .where(eq(dataSourceConnectors.projectId, req.projectId!))
    .orderBy(desc(dataSourceConnectors.createdAt))

  res.json({ success: true, data: rows })
})

router.get('/connectors/:id', requireProjectId, async (req, res) => {
  const [row] = await db
    .select()
    .from(dataSourceConnectors)
    .where(and(eq(dataSourceConnectors.id, (req.params.id as string)), eq(dataSourceConnectors.projectId, req.projectId!)))
    .limit(1)
  if (!row) return res.status(404).json({ success: false, error: 'Connector not found' })

  // Don't return auth_config (encrypted blob) to the client. The UI never
  // needs to see it once saved.
  const { authConfig: _authConfig, ...safe } = row
  res.json({ success: true, data: safe })
})

router.post('/connectors', requireProjectId, async (req, res) => {
  try {
    const { template, name, baseUrl, authValue, configOverride } = req.body as {
      template: string
      name: string
      baseUrl: string
      authValue: string
      configOverride?: Record<string, unknown>
    }

    if (!template || !name || !baseUrl || !authValue) {
      return res.status(400).json({ success: false, error: 'template, name, baseUrl, authValue required' })
    }

    const tpl = getTemplate(template)
    if (!tpl) return res.status(400).json({ success: false, error: `Unknown template: ${template}` })

    const [inserted] = await db
      .insert(dataSourceConnectors)
      .values({
        projectId: req.projectId!,
        template,
        name,
        baseUrl: baseUrl.replace(/\/+$/, ''),  // strip trailing slashes
        authConfig: encrypt(authValue),
        config: configOverride ?? {},
        status: 'active',
      })
      .returning({ id: dataSourceConnectors.id })

    res.json({ success: true, data: { id: inserted.id } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.patch('/connectors/:id', requireProjectId, async (req, res) => {
  const { name, baseUrl, authValue, configOverride, status } = req.body as {
    name?: string
    baseUrl?: string
    authValue?: string
    configOverride?: Record<string, unknown>
    status?: string
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (name != null) updates.name = name
  if (baseUrl != null) updates.baseUrl = baseUrl.replace(/\/+$/, '')
  if (authValue != null) updates.authConfig = encrypt(authValue)
  if (configOverride != null) updates.config = configOverride
  if (status != null) updates.status = status

  await db
    .update(dataSourceConnectors)
    .set(updates)
    .where(and(eq(dataSourceConnectors.id, (req.params.id as string)), eq(dataSourceConnectors.projectId, req.projectId!)))

  res.json({ success: true })
})

router.delete('/connectors/:id', requireProjectId, async (req, res) => {
  await db
    .delete(dataSourceConnectors)
    .where(and(eq(dataSourceConnectors.id, (req.params.id as string)), eq(dataSourceConnectors.projectId, req.projectId!)))
  res.json({ success: true })
})

// ── Test Connection ──────────────────────────────────────────────────────────
// Fetches one record from each endpoint and returns the raw + mapped form so
// onboarding can validate the field mapping before saving / syncing.

router.post('/connectors/:id/test', requireProjectId, async (req, res) => {
  try {
    const [conn] = await db
      .select()
      .from(dataSourceConnectors)
      .where(and(eq(dataSourceConnectors.id, (req.params.id as string)), eq(dataSourceConnectors.projectId, req.projectId!)))
      .limit(1)
    if (!conn) return res.status(404).json({ success: false, error: 'Connector not found' })

    const tpl = cloneTemplate(conn.template)
    if (!tpl) return res.status(400).json({ success: false, error: `Unknown template: ${conn.template}` })

    // Merge stored config overrides on top of the template defaults
    const override = (conn.config as Record<string, unknown> | undefined) ?? {}
    const merged = {
      ...tpl,
      ...override,
      fieldMap: { ...tpl.fieldMap, ...((override as { fieldMap?: object }).fieldMap ?? {}) },
    } as typeof tpl

    const cfg: RuntimeConfig = {
      baseUrl: conn.baseUrl,
      encryptedAuthValue: conn.authConfig,
      template: merged,
    }

    const result = await testConnection(cfg)
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ── Trigger a sync ───────────────────────────────────────────────────────────
// Manual "Sync Now" button. Defaults to incremental; pass `?kind=full` for
// the emergency full-resync button.

router.post('/connectors/:id/sync', requireProjectId, async (req, res) => {
  try {
    const kind = (req.query.kind === 'full' || req.body?.kind === 'full') ? 'full' : 'incremental'

    const [conn] = await db
      .select()
      .from(dataSourceConnectors)
      .where(and(eq(dataSourceConnectors.id, (req.params.id as string)), eq(dataSourceConnectors.projectId, req.projectId!)))
      .limit(1)
    if (!conn) return res.status(404).json({ success: false, error: 'Connector not found' })

    // First sync forces full regardless — there's no last_synced_at to filter by
    const lastSynced = conn.lastSyncedAt as Record<string, string | undefined>
    const hasEverSynced = Object.keys(lastSynced ?? {}).length > 0
    const effectiveKind = !hasEverSynced ? 'full' : kind

    const [sync] = await db
      .insert(dataSourceSyncs)
      .values({
        connectorId: conn.id,
        kind: effectiveKind,
        status: 'queued',
      })
      .returning({ id: dataSourceSyncs.id })

    await dataSyncQueue.add('sync', { syncId: sync.id }, { jobId: `sync-${sync.id}` })

    res.json({ success: true, data: { syncId: sync.id, kind: effectiveKind } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ── Sync history ─────────────────────────────────────────────────────────────

router.get('/connectors/:id/syncs', requireProjectId, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 25), 100)

  // Verify connector belongs to project
  const [conn] = await db
    .select({ id: dataSourceConnectors.id })
    .from(dataSourceConnectors)
    .where(and(eq(dataSourceConnectors.id, (req.params.id as string)), eq(dataSourceConnectors.projectId, req.projectId!)))
    .limit(1)
  if (!conn) return res.status(404).json({ success: false, error: 'Connector not found' })

  const rows = await db
    .select()
    .from(dataSourceSyncs)
    .where(eq(dataSourceSyncs.connectorId, (req.params.id as string)))
    .orderBy(desc(dataSourceSyncs.createdAt))
    .limit(limit)

  res.json({ success: true, data: rows })
})

// ── Logs for a sync run ──────────────────────────────────────────────────────

router.get('/syncs/:syncId/logs', requireProjectId, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 1000)
  const level = req.query.level as string | undefined

  // Verify sync belongs to a connector in this project
  const [sync] = await db
    .select({ connectorId: dataSourceSyncs.connectorId })
    .from(dataSourceSyncs)
    .where(eq(dataSourceSyncs.id, (req.params.syncId as string)))
    .limit(1)
  if (!sync) return res.status(404).json({ success: false, error: 'Sync not found' })

  const [conn] = await db
    .select({ id: dataSourceConnectors.id })
    .from(dataSourceConnectors)
    .where(and(eq(dataSourceConnectors.id, sync.connectorId), eq(dataSourceConnectors.projectId, req.projectId!)))
    .limit(1)
  if (!conn) return res.status(404).json({ success: false, error: 'Sync not in this project' })

  const conditions = [eq(dataSourceSyncLogs.syncId, (req.params.syncId as string))]
  if (level) conditions.push(eq(dataSourceSyncLogs.level, level))

  const rows = await db
    .select()
    .from(dataSourceSyncLogs)
    .where(and(...conditions))
    .orderBy(desc(dataSourceSyncLogs.createdAt))
    .limit(limit)

  res.json({ success: true, data: rows })
})

export default router
