import { Router } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import {
  dataSourceConnectors,
  dataSourceSyncs,
  dataSourceSyncLogs,
  projects,
} from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { encrypt, decrypt } from '../services/encryption.js'
import { listTemplates, getTemplate, cloneTemplate } from '../services/connectorRegistry.js'
import { testConnection, type RuntimeConfig } from '../services/connectors/genericHttpConnector.js'
import { dataSyncQueue, shopifySyncQueue } from '../services/queue.js'
import { agentRbacEnabled } from '../config/features.js'

// Admin endpoints for managing data-source connectors. Onboarding team uses
// these from the project page in the Storees admin UI. No client-side
// engineering — they just enter URL + creds and press buttons.

const router = Router()

/**
 * Refuse to save an effective config that would silently destroy historical
 * analytics.
 *
 * If the orders mapping is present, `fieldMap.orders.timestamp` MUST be a
 * non-empty string. Without it the sync falls back to NOW() and every
 * imported order lands on import day, making campaign attribution / cohort
 * retention / revenue charts meaningless. The runtime importer now skips
 * such rows (rather than substituting NOW()) but the save-time validator
 * catches the misconfig before any sync runs.
 *
 * Returns the error message to send back, or null when validation passes.
 */
function validateConnectorConfig(effectiveConfig: unknown): string | null {
  if (typeof effectiveConfig !== 'object' || effectiveConfig === null) return null
  const cfg = effectiveConfig as { fieldMap?: { orders?: { timestamp?: unknown } } }
  const orders = cfg.fieldMap?.orders
  if (!orders) return null
  if (!('timestamp' in orders)) return null
  const ts = orders.timestamp
  if (typeof ts !== 'string' || ts.trim() === '') {
    return 'fieldMap.orders.timestamp is required. Set it to the source field that holds the order date (e.g. "created_at"). Without it, imported orders would all be stamped with the current time, destroying historical analytics.'
  }
  return null
}

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

    // Validate the effective fieldMap (template defaults + override) the way
    // the sync path will read it. The override may omit fieldMap entirely
    // (taking template defaults), or partially override it.
    const overrideFieldMap = (configOverride as { fieldMap?: Record<string, unknown> })?.fieldMap ?? {}
    const effectiveConfig = {
      ...(configOverride ?? {}),
      fieldMap: { ...tpl.fieldMap, ...overrideFieldMap },
    }
    const configError = validateConnectorConfig(effectiveConfig)
    if (configError) return res.status(400).json({ success: false, error: configError })

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
    console.error('Create connector error:', err)
    res.status(500).json({ success: false, error: 'Failed to save connector' })
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

  // Same validation as POST — patching the timestamp mapping to empty is the
  // same kind of bug as creating with empty.
  if (configOverride != null) {
    const [existing] = await db
      .select({ template: dataSourceConnectors.template })
      .from(dataSourceConnectors)
      .where(and(eq(dataSourceConnectors.id, (req.params.id as string)), eq(dataSourceConnectors.projectId, req.projectId!)))
      .limit(1)
    if (existing) {
      const tpl = getTemplate(existing.template)
      if (tpl) {
        const overrideFieldMap = (configOverride as { fieldMap?: Record<string, unknown> })?.fieldMap ?? {}
        const effectiveConfig = {
          ...configOverride,
          fieldMap: { ...tpl.fieldMap, ...overrideFieldMap },
        }
        const configError = validateConnectorConfig(effectiveConfig)
        if (configError) return res.status(400).json({ success: false, error: configError })
      }
    }
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
  const id = req.params.id as string
  const [conn] = await db
    .select({ template: dataSourceConnectors.template })
    .from(dataSourceConnectors)
    .where(and(eq(dataSourceConnectors.id, id), eq(dataSourceConnectors.projectId, req.projectId!)))
    .limit(1)

  // Disconnecting a Shopify source also clears the store creds + token from the
  // project (the worker reads them from there).
  if (conn?.template === 'shopify') {
    const [p] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, req.projectId!)).limit(1)
    const settings = { ...((p?.settings ?? {}) as Record<string, unknown>) }
    delete settings.shopifyCustomApp
    await db.update(projects).set({
      shopifyDomain: null, shopifyAccessToken: null, webhookSecret: null, settings, updatedAt: new Date(),
    }).where(eq(projects.id, req.projectId!))
  }

  await db
    .delete(dataSourceConnectors)
    .where(and(eq(dataSourceConnectors.id, id), eq(dataSourceConnectors.projectId, req.projectId!)))
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

    // Strip the dealers endpoint from the test config when the project
     // doesn't have agentScopedAccess — avoids showing a Dealers card on
     // non-B2B projects even if they pick a template that declares it.
    const [project] = await db
      .select({ features: projects.features })
      .from(projects)
      .where(eq(projects.id, req.projectId!))
      .limit(1)
    if (!agentRbacEnabled((project?.features ?? {}) as Record<string, unknown>)) {
      delete merged.endpoints.dealers
    }

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

    // Shopify is a native source — its run goes through the shopify-sync worker,
    // which writes counts back into this same sync row for the unified history.
    // (Shopify always does a full historical sync, so kind is always 'full'.)
    if (conn.template === 'shopify') {
      const [sync] = await db.insert(dataSourceSyncs)
        .values({ connectorId: conn.id, kind: 'full', status: 'queued' })
        .returning({ id: dataSourceSyncs.id })
      await shopifySyncQueue.add('sync', { projectId: req.projectId!, syncId: sync.id })
      return res.json({ success: true, data: { syncId: sync.id, kind: 'full' } })
    }

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
