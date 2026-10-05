import { eq, and, inArray, sql } from 'drizzle-orm'
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
import { projectVocabulary } from './projectVocabulary.js'
import { ORDER_STATUS, isReversedOrderStatus, statusFromProperties, type OrderStatus } from '../db/orderStatus.js'
import { statedMoment } from './orderMoments.js'
import { orderEventKey } from './orderEventKey.js'

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
          // Parse source_created_at if the template provides it. Used to
          // set first_seen accurately and prevent batch syncs from labelling
          // every historical customer as "new today".
          const rawSourceCreatedAt = mapped.source_created_at
          let sourceCreatedAt: Date | null = null
          if (rawSourceCreatedAt) {
            const d = new Date(rawSourceCreatedAt as string)
            if (!Number.isNaN(d.getTime())) sourceCreatedAt = d
          }
          await resolveCustomer({
            projectId,
            externalId,
            email,
            phone,
            name: (mapped.name as string | undefined) ?? null,
            emailSubscribed: (mapped.email_subscribed as boolean | undefined) ?? false,
            smsSubscribed: (mapped.sms_subscribed as boolean | undefined) ?? false,
            pushSubscribed: (mapped.push_subscribed as boolean | undefined),
            region: (mapped.region as string | undefined) ?? null,
            city: (mapped.city as string | undefined) ?? null,
            // Connector-mapped custom attributes (e.g. fcm_token for push).
            // Merged into customers.custom_attributes; push delivery reads
            // custom_attributes->>'fcm_token'.
            customAttributes: (mapped.custom_attributes as Record<string, unknown> | undefined),
            // B2B: stamp customers.agent_id when the dealer exists and store
            // dealer_id in custom_attributes for deferred backlinking.
            agentExternalDealerId: (mapped.dealer_id as string | undefined) ?? null,
            // Connector sync is pipeline activity, not customer activity —
            // don't masquerade as activity by bumping last_seen. The
            // customer-aggregate worker bumps last_seen from real event
            // timestamps via GREATEST(last_seen, event_ts) — that's the
            // correct path.
            skipLastSeenBump: true,
            sourceCreatedAt,
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

/** @internal exported for tests — callers go through `runSync`. */
export async function importOrderBatch(
  projectId: string,
  syncId: string,
  records: unknown[],
  template: ConnectorTemplate,
  stats: EntityStats,
): Promise<void> {
  type Pending = { rawCustomerId: string; row: ReturnType<typeof buildOrderRow> }
  const pending: Pending[] = []

  // Resolved once for the batch — the lookup is cached, but a sync walks thousands of
  // records and there is no reason to ask per row.
  const syncVocab = await projectVocabulary(projectId)

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

    // ONE MONEY RULE — the same as every other door into Storees.
    //
    //   An order counts as revenue when it is PLACED. Shipping and delivery move no
    //   money. Only a real cancellation, return or refund takes it back off.
    //
    // This path used to count an order only once the source said `delivered`, and
    // wrote a cancellation event to take back any order it had counted that was not
    // delivered YET — so in-transit orders were booked as cancelled, and booked again
    // as a "revival" when they arrived. Measured on one connector-fed shop: 6,663 such
    // cancellations of orders that were never cancelled. The rule was one client's
    // instruction, applied to every shop on this connector.
    //
    // The order's state is read by the shared reader (orderStatus.ts), which keeps "is
    // the order still on?" apart from "where is the parcel?".
    const sourceState = statusFromProperties({
      order_status: mapped.order_status, fulfillment_status: mapped.fulfillment_status,
    })
    const reversal: OrderStatus | null =
      sourceState && isReversedOrderStatus(sourceState) ? sourceState
      : mapped.canceled_at ? ORDER_STATUS.CANCELLED
      : null

    // A reversal already counted once must not be counted again, and needs the amount
    // the sale was booked at — the source often zeroes an order's total on cancellation.
    const priorTotal = reversal ? await bookedTotal(projectId, orderId, syncVocab) : null

    const total = mapped.total
    const hasTotal = typeof total === 'number' && total > 0
    if (!hasTotal && priorTotal === null) {
      // Nothing booked before and no amount now: there is no sale to record or undo.
      if (!reversal) {
        stats.failed += 1
        await log(syncId, 'warn', `Order ${orderId} has total ${String(total)} — skipping (zero/negative totals indicate a field-mapping bug)`, {
          entityType: 'order', entityId: orderId, payload: { mapped },
        })
      }
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
        entityType: 'order', entityId: orderId, payload: { mapped },
      })
      continue
    }

    // The sale — always, when the source has an amount for it. A cancelled order that
    // was never booked is still recorded and immediately reversed: net zero, and the
    // history says what happened.
    if (hasTotal) {
      const row = buildOrderRow(projectId, mapped, syncVocab)
      if (!row) {
        stats.failed += 1
        await log(syncId, 'error', `Order ${orderId} skipped — invalid timestamp value: ${String(mapped.timestamp)}`, {
          entityType: 'order', entityId: orderId, payload: { mapped },
        })
        continue
      }
      pending.push({ rawCustomerId: customerExternalId, row })
    }

    // The reversal — only when the source says it really happened.
    if (reversal) {
      const undo = await buildReversal(projectId, orderId, mapped, reversal,
        priorTotal ?? (total as number), syncVocab)
      if (undo === 'already-recorded') continue
      if (undo === 'no-slot') {
        await log(syncId, 'warn', `Order ${orderId} is ${reversal} at the source, but this project has no event mapped for that — set it on the Event Mapping screen`, {
          entityType: 'order', entityId: orderId,
        })
        continue
      }
      pending.push({ rawCustomerId: customerExternalId, row: undo })
    }
  }

  // Resolve customer UUIDs (each row needs a customer_id FK). resolveCustomer
  // creates a bare row if the external_id is unknown — better than dropping
  // orders. The customers sync fills in profile fields next pass.
  // Orders frequently share a customer — resolve each DISTINCT external id
  // once (bounded concurrency) instead of once per order. Deduping also avoids
  // concurrent create races on the same external_id.
  const uniqueExternalIds = [...new Set(pending.map(p => p.rawCustomerId))]
  const idByExternal = new Map<string, string>()
  const RESOLVE_CONCURRENCY = 10
  for (let i = 0; i < uniqueExternalIds.length; i += RESOLVE_CONCURRENCY) {
    await Promise.all(uniqueExternalIds.slice(i, i + RESOLVE_CONCURRENCY).map(async extId => {
      try {
        idByExternal.set(extId, await resolveCustomer({ projectId, externalId: extId }))
      } catch (err) {
        await log(syncId, 'error', `Customer lookup failed for ${extId}: ${(err as Error).message}`, {
          entityType: 'order',
        })
      }
    }))
  }

  const resolved: Array<{ row: ReturnType<typeof buildOrderRow>; customerId: string }> = []
  for (const p of pending) {
    const customerId = idByExternal.get(p.rawCustomerId)
    if (customerId == null) {
      stats.failed += 1
      continue
    }
    resolved.push({ row: p.row, customerId })
  }

  if (resolved.length === 0) return

  // On re-sync, merge the freshly-mapped properties into the existing row
  // (jsonb `||` — incoming keys win on collision, untouched keys preserved).
  // This lets a full re-sync retrofit newly-mapped fields (e.g. discount,
  // added to the VirpanAI template after history was already ingested)
  // onto historical events without losing any worker-added keys. Nothing
  // else mutates events.properties post-insert (see customerAggregateWorker
  // — it only stamps processed_at), so the merge is safe.
  const inserted = await db
    .insert(eventsTable)
    .values(resolved.map((r) => ({ ...r.row!, customerId: r.customerId })))
    .onConflictDoUpdate({
      target: [eventsTable.projectId, eventsTable.idempotencyKey],
      set: {
        properties: sql`${eventsTable.properties} || excluded.properties`,
      },
    })
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

/** The amount this order was booked at by an earlier sync, or null if it never was. */
async function bookedTotal(
  projectId: string, orderId: string, vocab: { amountKey: string; purchaseEvents: string[] },
): Promise<number | null> {
  // The fingerprint the sale is written under now, and the one older syncs wrote (which
  // named `order_placed` whatever the project called a sale).
  const keys = [...new Set([
    orderEventKey(vocab.purchaseEvents[0] ?? 'order_placed', orderId),
    orderEventKey('order_placed', orderId),
  ])]
  const [prior] = await db
    .select({ properties: eventsTable.properties })
    .from(eventsTable)
    .where(and(eq(eventsTable.projectId, projectId), inArray(eventsTable.idempotencyKey, keys)))
    .limit(1)
  if (!prior) return null
  const props = (prior.properties ?? {}) as Record<string, unknown>
  const amount = Number(props[vocab.amountKey] ?? props.total ?? 0)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

type OrderEventRow = NonNullable<ReturnType<typeof buildOrderRow>> & {
  properties: Record<string, unknown>
}

/**
 * The reversal event for an order the source says was cancelled, returned or refunded —
 * under THIS project's word for that kind of reversal, from its mapping.
 *
 * One per order, ever: the idempotency key is unchanged from the earlier implementation
 * (`order_cancelled_compensation:<orderId>`), so a reversal already recorded by a past
 * sync is recognised and never written twice. It is bookkeeping, not vocabulary.
 *
 * 'no-slot' when the project has no event for that kind of reversal — it cannot be
 * expressed in its own words, and inventing a retail word for it would be read by
 * nothing (see the history of the compensation path).
 */
async function buildReversal(
  projectId: string,
  orderId: string,
  mapped: Record<string, unknown>,
  kind: OrderStatus,
  amount: number,
  vocab: { cancellationEvents: string[]; returnEvents: string[]; refundEvents: string[]; orderIdKey: string; amountKey: string; currencyKey: string },
): Promise<'already-recorded' | 'no-slot' | OrderEventRow> {
  const key = `order_cancelled_compensation:${orderId}`
  const [existing] = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.projectId, projectId), eq(eventsTable.idempotencyKey, key)))
    .limit(1)
  if (existing) return 'already-recorded'

  const cancelOnly = vocab.cancellationEvents.filter(n => !vocab.returnEvents.includes(n) && !vocab.refundEvents.includes(n))
  const eventName =
    kind === ORDER_STATUS.REFUNDED ? (vocab.refundEvents[0] ?? cancelOnly[0])
    : kind === ORDER_STATUS.RETURNED ? (vocab.returnEvents[0] ?? cancelOnly[0])
    : (cancelOnly[0] ?? vocab.cancellationEvents[0])
  if (!eventName) return 'no-slot'

  // When it was reversed, if the source says; otherwise the order's own date — an old
  // cancellation imported today must not look like it happened today.
  const when = statedMoment('reversal', mapped) ?? new Date(mapped.timestamp as string)

  return {
    projectId,
    eventName,
    platform: 'api',
    source: 'connector_sync',
    timestamp: Number.isNaN(when.getTime()) ? new Date() : when,
    idempotencyKey: key,
    sessionId: null,
    customerId: null as string | null,
    properties: {
      [vocab.orderIdKey]: orderId,
      [vocab.amountKey]: amount,
      discount: 0,
      [vocab.currencyKey]: mapped.currency ?? 'INR',
      line_items: [],
      // The source's own words, kept so it is clear later WHY this reversal exists.
      status: mapped.order_status ?? null,
      fulfillment_status: mapped.fulfillment_status ?? null,
      canceled_at: mapped.canceled_at ?? null,
      reason: `source_status_${kind}`,
      historical: true,
    },
  }
}

function buildOrderRow(
  projectId: string,
  mapped: Record<string, unknown>,
  // What this project calls a purchase, and where it puts the id and the money.
  //
  // A connector's job is to translate an external feed into Storees' shape, and this
  // wrote retail's shape specifically: `order_placed` carrying `order_id` and `total`.
  // For a lender pulling loans through a connector that produces events its OWN mapping
  // does not recognise — the pack says `loan_disbursed` / `loan_id` / `amount` — so the
  // rows land, match nothing, and the loans are invisible to the aggregator, the orders
  // table and every model.
  //
  // Retail's names are the default, so a shop's sync is unchanged.
  vocab: { purchaseEvents: string[]; orderIdKey: string; amountKey: string; currencyKey: string } = {
    purchaseEvents: ['order_placed'], orderIdKey: 'order_id', amountKey: 'total', currencyKey: 'currency',
  },
) {
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

  // One sale per order, ever — the shared fingerprint every door writes for it
  // (orderEventKey.ts), under the purchase name this row is written as.
  const idempotencyKey = orderEventKey(vocab.purchaseEvents[0] ?? 'order_placed', orderId)

  return {
    projectId,
    eventName: vocab.purchaseEvents[0] ?? 'order_placed',
    platform: 'api',
    source: 'connector_sync',
    timestamp,
    idempotencyKey,
    sessionId: null,
    customerId: null as string | null,
    properties: {
      [vocab.orderIdKey]: orderId,
      [vocab.amountKey]: mapped.total,
      // Connector-derived per-order discount (e.g. VirpanAI subtract:
      // summary.original_order_total - summary.current_order_total). Read by
      // discount_order_percentage in metricsWorker + segment evaluator.
      discount: typeof mapped.discount === 'number' ? mapped.discount : 0,
      [vocab.currencyKey]: mapped.currency ?? 'INR',
      line_items: Array.isArray(mapped.line_items) ? mapped.line_items : [],
      // Carry source-side state so future queries / segments can filter on it.
      status: mapped.order_status ?? null,
      fulfillment_status: mapped.fulfillment_status ?? null,
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

    // An empty page with hasMore=true happens when a whole page is filtered out
    // server-side (e.g. GWM orders without customer_id or total=0). Don't stop —
    // advance and keep going, or we'd miss every later page. Bounded by
    // MAX_PAGES_PER_ENTITY. Empty + !hasMore = genuinely done.
    if (pageResult.records.length === 0) {
      if (pageResult.hasMore && i < MAX_PAGES_PER_ENTITY - 1) {
        offset = pageResult.nextOffset ?? offset + cfg.template.pagination.pageSize
        page += 1
        continue
      }
      break
    }

    await handler(projectId, syncId, pageResult.records, cfg.template, stats[entity])
    await updateSyncStats(syncId, fullStats)

    if (!pageResult.hasMore) break

    // Last iteration of the loop — hit the safety cap WITHOUT pageResult.hasMore=false
    if (i === MAX_PAGES_PER_ENTITY - 1) {
      hitSafetyCap = true
      break
    }

    offset = pageResult.nextOffset ?? offset + cfg.template.pagination.pageSize
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
