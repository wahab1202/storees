import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import {
  dataSourceConnectors,
  dataSourceSyncs,
  dataSourceSyncLogs,
  events as eventsTable,
  projects,
} from '../db/schema.js'
import {
  fetchPageWithRetry,
  mapRecord,
  type ConnectorTemplate,
  type EntityType,
  type RuntimeConfig,
} from './connectors/genericHttpConnector.js'
import { getTemplate } from './connectorRegistry.js'
import { resolveCustomer } from './customerService.js'
import { bulkUpsertProducts, type ProductImport } from './productCatalogService.js'
import { upsertDealer, type DealerInput } from './dealerImport.js'
import { agentRbacEnabled } from '../config/features.js'
import { customerAggregateQueue } from './queue.js'

// Sync orchestrator. The BullMQ worker calls runSync(syncId) — everything
// else (pagination, mapping, calling import services, writing logs) lives
// here. Failures in one entity don't abort the others — the sync ends as
// 'partial' so other data still loads.
//
// Throughput design (batchwise — large datasets must not break the system):
//   - Source API is fetched ONE page at a time (no parallel page-fetch);
//     each page is fully processed before the next is requested.
//   - Page-fetch is wrapped in fetchPageWithRetry — transient 5xx/429/network
//     errors retry with exponential backoff before failing the entity.
//   - Inter-batch delay is configurable per template — be kind to rate-limited
//     APIs (default 0; e.g. VirpanAI uses 100ms).
//   - Within a page, customer upserts run with bounded concurrency
//     (CUSTOMER_PAGE_CONCURRENCY) — fast enough but doesn't saturate the
//     DB connection pool.
//   - Product upserts go via a single bulk-insert per page (productCatalogService).
//   - Order events go via a single bulk-insert per page + a single
//     queue.addBulk for the customer-aggregate workers.

const MAX_PAGES_PER_ENTITY = 10_000   // safety cap: 1M records at pageSize=100
const CUSTOMER_PAGE_CONCURRENCY = 10  // parallel resolveCustomer calls per page

type EntityStats = { fetched: number; imported: number; failed: number }
type SyncStats = Record<EntityType, EntityStats>

function emptyStats(): SyncStats {
  return {
    customers: { fetched: 0, imported: 0, failed: 0 },
    products: { fetched: 0, imported: 0, failed: 0 },
    orders:    { fetched: 0, imported: 0, failed: 0 },
    dealers:   { fetched: 0, imported: 0, failed: 0 },
  }
}

async function log(
  syncId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  opts: { entityType?: string; entityId?: string; payload?: unknown } = {},
): Promise<void> {
  await db.insert(dataSourceSyncLogs).values({
    syncId,
    level,
    entityType: opts.entityType ?? null,
    entityId: opts.entityId ?? null,
    message,
    payload: opts.payload != null ? (opts.payload as object) : null,
  })
}

async function updateSyncStats(syncId: string, stats: SyncStats): Promise<void> {
  await db
    .update(dataSourceSyncs)
    .set({ stats, updatedAt: new Date() })
    .where(eq(dataSourceSyncs.id, syncId))
}

// ── Per-entity import handlers ───────────────────────────────────────────────

async function importCustomerBatch(
  projectId: string,
  syncId: string,
  records: unknown[],
  template: ConnectorTemplate,
  stats: EntityStats,
): Promise<void> {
  // Process records in sub-chunks of CUSTOMER_PAGE_CONCURRENCY parallel
  // resolveCustomer calls. Fast enough for large pages without saturating
  // the DB connection pool. resolveCustomer is race-safe (ON CONFLICT) so
  // duplicate identifiers in the same chunk are handled cleanly.
  for (let i = 0; i < records.length; i += CUSTOMER_PAGE_CONCURRENCY) {
    const chunk = records.slice(i, i + CUSTOMER_PAGE_CONCURRENCY)
    await Promise.all(
      chunk.map(async (raw) => {
        stats.fetched += 1
        const mapped = mapRecord(raw, template.fieldMap.customers)
        const externalId = mapped.external_id as string | undefined
        const email = mapped.email as string | undefined
        const phone = mapped.phone as string | undefined

        if (!externalId && !email && !phone) {
          stats.failed += 1
          await log(syncId, 'error', 'Customer has no external_id, email, or phone — cannot resolve identity', {
            entityType: 'customer',
            payload: { mapped, raw },
          })
          return
        }

        try {
          await resolveCustomer({
            projectId,
            externalId,
            email,
            phone,
            name: (mapped.name as string | undefined) ?? null,
            emailSubscribed: (mapped.email_subscribed as boolean | undefined) ?? false,
            smsSubscribed: (mapped.sms_subscribed as boolean | undefined) ?? false,
            region: (mapped.region as string | undefined) ?? null,
            city: (mapped.city as string | undefined) ?? null,
          })
          stats.imported += 1
        } catch (err) {
          stats.failed += 1
          await log(syncId, 'error', `Customer upsert failed: ${(err as Error).message}`, {
            entityType: 'customer',
            entityId: externalId ?? email ?? phone,
            payload: { mapped },
          })
        }
      }),
    )
  }
}

async function importProductBatch(
  projectId: string,
  syncId: string,
  records: unknown[],
  template: ConnectorTemplate,
  stats: EntityStats,
): Promise<void> {
  const inputs: ProductImport[] = []
  for (const raw of records) {
    stats.fetched += 1
    const mapped = mapRecord(raw, template.fieldMap.products)
    const productId = mapped.product_id as string | undefined
    if (!productId) {
      stats.failed += 1
      await log(syncId, 'error', 'Product has no product_id — skipping', {
        entityType: 'product',
        payload: { mapped },
      })
      continue
    }
    const productImport: ProductImport = {
      product_id: productId,
      title: (mapped.title as string | undefined) ?? productId,
    }
    if (typeof mapped.product_type === 'string') productImport.product_type = mapped.product_type
    if (typeof mapped.vendor === 'string') productImport.vendor = mapped.vendor
    if (typeof mapped.base_price === 'number') productImport.base_price = mapped.base_price
    if (typeof mapped.currency === 'string') productImport.currency = mapped.currency
    if (typeof mapped.image_url === 'string') productImport.image_url = mapped.image_url
    const status = mapped.status
    if (status === 'active' || status === 'archived' || status === 'draft') productImport.status = status
    if (Array.isArray(mapped.collections)) productImport.collections = mapped.collections as string[]
    if (mapped.attributes && typeof mapped.attributes === 'object') {
      productImport.attributes = mapped.attributes as Record<string, unknown>
    }
    inputs.push(productImport)
  }

  if (inputs.length === 0) return

  try {
    const { imported, errors } = await bulkUpsertProducts(projectId, inputs)
    stats.imported += imported
    for (const e of errors) {
      stats.failed += 1
      await log(syncId, 'error', `Product upsert failed at index ${e.index}: ${e.error}`, {
        entityType: 'product',
        entityId: inputs[e.index]?.product_id,
      })
    }
  } catch (err) {
    stats.failed += inputs.length
    await log(syncId, 'error', `Product batch failed: ${(err as Error).message}`, {
      entityType: 'product',
    })
  }
}

async function importOrderBatch(
  projectId: string,
  syncId: string,
  records: unknown[],
  template: ConnectorTemplate,
  stats: EntityStats,
): Promise<void> {
  type Pending = { rawCustomerId: string; row: ReturnType<typeof buildOrderRow> }
  const pending: Pending[] = []

  for (const raw of records) {
    stats.fetched += 1
    const mapped = mapRecord(raw, template.fieldMap.orders)
    const customerExternalId = mapped.customer_id as string | undefined
    const orderId = mapped.order_id as string | undefined

    if (!customerExternalId || !orderId) {
      stats.failed += 1
      await log(syncId, 'error', 'Order missing customer_id or order_id', {
        entityType: 'order',
        payload: { mapped },
      })
      continue
    }

    const total = mapped.total
    if (typeof total !== 'number' || total <= 0) {
      stats.failed += 1
      await log(syncId, 'warn', `Order ${orderId} has total ${String(total)} — skipping (zero/negative totals indicate a field-mapping bug)`, {
        entityType: 'order',
        entityId: orderId,
        payload: { mapped },
      })
      continue
    }

    // Strict timestamp gate. Without a source-provided date the row would land
    // with NOW(), bucketing every historical order into "today" and breaking
    // every time-series analysis. Better to skip with a clear log than to
    // silently substitute the wrong value. Fix path is the connector's
    // `mappings.orders.timestamp` config.
    if (mapped.timestamp == null || mapped.timestamp === '') {
      stats.failed += 1
      await log(syncId, 'error', `Order ${orderId} skipped — no timestamp in source row. Set mappings.orders.timestamp on the connector to the source's order-date field (e.g. "created_at").`, {
        entityType: 'order',
        entityId: orderId,
        payload: { mapped },
      })
      continue
    }

    const row = buildOrderRow(projectId, mapped)
    if (!row) {
      stats.failed += 1
      await log(syncId, 'error', `Order ${orderId} skipped — invalid timestamp value: ${String(mapped.timestamp)}`, {
        entityType: 'order',
        entityId: orderId,
        payload: { mapped },
      })
      continue
    }
    pending.push({ rawCustomerId: customerExternalId, row })
  }

  // Resolve customer UUIDs (each row needs a customer_id FK). resolveCustomer
  // creates a bare row if the external_id is unknown — better than dropping
  // orders. The customers sync fills in profile fields next pass.
  const resolved: Array<{ row: ReturnType<typeof buildOrderRow>; customerId: string }> = []
  for (const p of pending) {
    try {
      const id = await resolveCustomer({ projectId, externalId: p.rawCustomerId })
      resolved.push({ row: p.row, customerId: id })
    } catch (err) {
      stats.failed += 1
      await log(syncId, 'error', `Customer lookup failed for ${p.rawCustomerId}: ${(err as Error).message}`, {
        entityType: 'order',
      })
    }
  }

  if (resolved.length === 0) return

  const inserted = await db
    .insert(eventsTable)
    .values(resolved.map((r) => ({ ...r.row!, customerId: r.customerId })))
    .onConflictDoNothing({ target: [eventsTable.projectId, eventsTable.idempotencyKey] })
    .returning({ id: eventsTable.id, customerId: eventsTable.customerId, timestamp: eventsTable.timestamp, eventName: eventsTable.eventName, properties: eventsTable.properties })

  stats.imported += inserted.length

  // Push to aggregate queue so the worker folds the new orders into totals
  if (inserted.length > 0) {
    await customerAggregateQueue.addBulk(
      inserted.map((ev) => ({
        name: 'aggregate',
        data: {
          eventId: ev.id,
          customerId: ev.customerId,
          projectId,
          eventName: ev.eventName,
          properties: ev.properties,
          timestamp: ev.timestamp,
        },
        opts: { jobId: `agg-${ev.id}`, removeOnComplete: true, removeOnFail: false },
      })),
    )
  }
}

function buildOrderRow(projectId: string, mapped: Record<string, unknown>) {
  const orderId = mapped.order_id as string
  // Caller already gates on mapped.timestamp presence; treat invalid date as
  // an unbuildable row (returns null) and let the caller log + count.
  const tsRaw = mapped.timestamp
  let timestamp: Date
  try {
    timestamp = new Date(tsRaw as string)
    if (Number.isNaN(timestamp.getTime())) return null
  } catch {
    return null
  }

  return {
    projectId,
    eventName: 'order_placed',
    platform: 'api',
    source: 'connector_sync',
    timestamp,
    idempotencyKey: `order_placed_historical:${orderId}`,
    sessionId: null,
    customerId: null as string | null,
    properties: {
      order_id: orderId,
      total: mapped.total,
      currency: mapped.currency ?? 'INR',
      line_items: Array.isArray(mapped.line_items) ? mapped.line_items : [],
      historical: true,
    },
  }
}

async function importDealerBatch(
  projectId: string,
  syncId: string,
  records: unknown[],
  template: ConnectorTemplate,
  stats: EntityStats,
): Promise<void> {
  const dealerMap = template.fieldMap.dealers
  // No-op if the template doesn't declare a dealer field map — guard against
  // misconfigured connectors rather than hard-failing the whole sync.
  if (!dealerMap) return

  for (const raw of records) {
    stats.fetched += 1
    const mapped = mapRecord(raw, dealerMap) as DealerInput
    if (!mapped.dealer_id || !mapped.name) {
      stats.failed += 1
      await log(syncId, 'error', 'Dealer record missing dealer_id or name after mapping', {
        entityType: 'dealer',
        payload: { mapped, raw },
      })
      continue
    }
    try {
      await upsertDealer(projectId, mapped)
      stats.imported += 1
    } catch (err) {
      stats.failed += 1
      await log(syncId, 'error', `Dealer upsert failed: ${(err as Error).message}`, {
        entityType: 'dealer',
        entityId: mapped.dealer_id,
        payload: { mapped },
      })
    }
  }
}

// ── Per-entity loop ──────────────────────────────────────────────────────────

async function syncEntity(
  syncId: string,
  projectId: string,
  cfg: RuntimeConfig,
  entity: EntityType,
  updatedSince: string | null,
  stats: SyncStats,
  fullStats: SyncStats,
): Promise<{ ok: boolean; latestTimestamp: string }> {
  const handler =
    entity === 'customers' ? importCustomerBatch :
    entity === 'products' ? importProductBatch :
    entity === 'dealers' ? importDealerBatch :
    importOrderBatch

  let offset = 0
  let page = 1
  let cursor: string | null = null
  const runStart = new Date().toISOString()

  await log(syncId, 'info', `Starting ${entity} sync${updatedSince ? ` (incremental since ${updatedSince})` : ' (full)'}`, {
    entityType: entity,
  })

  const interBatchDelayMs = cfg.template.interBatchDelayMs ?? 0
  let hitSafetyCap = false

  for (let i = 0; i < MAX_PAGES_PER_ENTITY; i++) {
    let pageResult
    try {
      // fetchPageWithRetry — transient 5xx/429/network blips retry with backoff;
      // permanent 4xx fails fast. See genericHttpConnector.ts.
      pageResult = await fetchPageWithRetry(cfg, { entity, offset, page, cursor, updatedSince })
    } catch (err) {
      await log(syncId, 'error', `${entity} fetch failed at offset ${offset} after retries: ${(err as Error).message}`, {
        entityType: entity,
      })
      return { ok: false, latestTimestamp: runStart }
    }

    if (pageResult.records.length === 0) break

    await handler(projectId, syncId, pageResult.records, cfg.template, stats[entity])
    await updateSyncStats(syncId, fullStats)

    if (!pageResult.hasMore) break

    // Last iteration of the loop — hit the safety cap WITHOUT pageResult.hasMore=false
    if (i === MAX_PAGES_PER_ENTITY - 1) {
      hitSafetyCap = true
      break
    }

    offset += cfg.template.pagination.pageSize
    page += 1
    if (cfg.template.pagination.type === 'cursor') cursor = pageResult.nextCursor

    // Be polite to the source API — sleep between consecutive page fetches
    if (interBatchDelayMs > 0) {
      await new Promise((r) => setTimeout(r, interBatchDelayMs))
    }
  }

  if (hitSafetyCap) {
    await log(
      syncId,
      'warn',
      `${entity} sync hit MAX_PAGES_PER_ENTITY (${MAX_PAGES_PER_ENTITY}) at ${stats[entity].fetched} records — there may be more data on the source side. Re-run sync or raise the cap.`,
      { entityType: entity },
    )
  }

  await log(
    syncId,
    'info',
    `${entity} sync complete — fetched ${stats[entity].fetched}, imported ${stats[entity].imported}, failed ${stats[entity].failed}`,
    { entityType: entity },
  )

  return { ok: stats[entity].failed === 0, latestTimestamp: runStart }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runSync(syncId: string): Promise<void> {
  const [sync] = await db.select().from(dataSourceSyncs).where(eq(dataSourceSyncs.id, syncId)).limit(1)
  if (!sync) throw new Error(`Sync ${syncId} not found`)

  const [connector] = await db
    .select()
    .from(dataSourceConnectors)
    .where(eq(dataSourceConnectors.id, sync.connectorId))
    .limit(1)
  if (!connector) throw new Error(`Connector ${sync.connectorId} not found`)

  const template = getTemplate(connector.template)
  if (!template) throw new Error(`Unknown template: ${connector.template}`)

  // Merge stored config (if any) on top of the built-in template — onboarding
  // can override individual fields without losing the template defaults.
  const effectiveTemplate: ConnectorTemplate = {
    ...template,
    ...(connector.config as object),
    fieldMap: { ...template.fieldMap, ...((connector.config as any)?.fieldMap ?? {}) },
  }

  const cfg: RuntimeConfig = {
    baseUrl: connector.baseUrl,
    encryptedAuthValue: connector.authConfig,
    template: effectiveTemplate,
  }

  const stats = emptyStats()
  const lastSyncedAt = (connector.lastSyncedAt as Record<string, string | undefined>) ?? {}
  const newLastSyncedAt: Record<string, string | undefined> = { ...lastSyncedAt }

  await db
    .update(dataSourceSyncs)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(dataSourceSyncs.id, syncId))

  let anyOk = false
  let anyFailed = false

  // Dealers only sync when (a) the template declares the endpoint AND (b) the
  // project has the B2B agentScopedAccess feature flag enabled. Keeps the
  // dealer pull strictly opt-in: today only the GWM project qualifies.
  const [project] = await db
    .select({ features: projects.features })
    .from(projects)
    .where(eq(projects.id, connector.projectId))
    .limit(1)
  const dealersEnabled =
    !!effectiveTemplate.endpoints.dealers &&
    agentRbacEnabled((project?.features ?? {}) as Record<string, unknown>)

  // Dealers FIRST (so per-customer agent_id resolves immediately during the
  // customer sync), then customers → products → orders.
  const entityOrder: EntityType[] = dealersEnabled
    ? ['dealers', 'customers', 'products', 'orders']
    : ['customers', 'products', 'orders']

  for (const entity of entityOrder) {
    const since = sync.kind === 'incremental' ? lastSyncedAt[entity] ?? null : null
    const { ok, latestTimestamp } = await syncEntity(syncId, connector.projectId, cfg, entity, since, stats, stats)
    if (ok) {
      newLastSyncedAt[entity] = latestTimestamp
      anyOk = true
    } else {
      anyFailed = true
    }
  }

  const finalStatus = anyOk && anyFailed ? 'partial' : anyOk ? 'success' : 'failed'

  await db
    .update(dataSourceSyncs)
    .set({
      status: finalStatus,
      finishedAt: new Date(),
      updatedAt: new Date(),
      stats,
      errorSummary: anyFailed ? 'One or more entities had failures — see logs' : null,
    })
    .where(eq(dataSourceSyncs.id, syncId))

  // Only advance last_synced_at for entities that succeeded — partial failures
  // re-pull failed entities next run instead of leaving gaps.
  if (anyOk) {
    await db
      .update(dataSourceConnectors)
      .set({ lastSyncedAt: newLastSyncedAt, updatedAt: new Date() })
      .where(eq(dataSourceConnectors.id, connector.id))
  }
}
