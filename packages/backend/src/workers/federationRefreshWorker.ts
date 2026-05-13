import { Worker } from 'bullmq'
import { eq, sql } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { projectDataSources } from '../db/schema.js'
import { federationRefreshQueue } from '../services/queue.js'

/**
 * Phase F-fed — periodic refresh of federated data.
 *
 * For each project flagged with `is_active=true` in `project_data_sources`,
 * runs three steps inside a single connection:
 *
 *   1. REFRESH MATERIALIZED VIEW CONCURRENTLY mv_gwm_customer_attrs
 *      Pulls live data from gwm via postgres_fdw. CONCURRENTLY = no lock
 *      on reads while the refresh runs.
 *
 *   2. sync_gwm_customer_attrs()
 *      Copies MV → customers.region/city/total_orders/total_spent/...
 *      Only updates rows where the value actually changed (cheap diff).
 *
 *   3. sync_gwm_agents(project_id)
 *      Upserts gwm.dealer rows into Storees.agents and re-links
 *      customers.agent_id from the MV.
 *
 * Stamps last_refresh_at/_status/_error/_duration on project_data_sources
 * so /admin/coverage and ops dashboards can show last-refresh state.
 *
 * Schedule: every 5 minutes via BullMQ repeatable (configurable). Source
 * DBs are read-only from Storees' side; safe to run frequently.
 *
 * Failure semantics: on FDW network error, marks status='failed' with
 * error message; the scheduler picks up again next tick. Doesn't crash
 * the worker.
 */

const WORKER_NAME = 'federation-refresh'
const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 min

// Per-source-type orchestration. Today only medusa_gwm exists; other source
// types (Shopify federation, custom Postgres) plug in here when needed.
type RefreshStats = {
  updatedAttrs: number
  upsertedAgents: number
  linkedCustomers: number
  upsertedProducts: number
  upsertedCollections: number
  linkedProductCollections: number
  upsertedOrders: number
  ordersCursor: string | null
}

const SOURCE_HANDLERS: Record<string, (projectId: string, config: SourceConfig) => Promise<{ stats: RefreshStats; nextConfig: SourceConfig }>> = {
  medusa_gwm: refreshMedusaGwm,
}

/**
 * Per-stream cursor state stored in project_data_sources.config. Each stream
 * tracks its own watermark so a slow stream doesn't block fast ones.
 */
type SourceConfig = {
  orders?: { lastSyncedAt?: string | null }
  // host/dbname/note kept verbatim — config is opaque to the worker beyond cursors.
  [key: string]: unknown
}

async function refreshMedusaGwm(projectId: string, config: SourceConfig): Promise<{ stats: RefreshStats; nextConfig: SourceConfig }> {
  // Step 1: refresh the customer-attr MV (live FDW pull from gwm). Wrapped
  // in a SECURITY DEFINER function so the worker's app role doesn't need to
  // own the MV — see gwm_federated_permissions_fix.sql for context.
  await db.execute(sql`SELECT refresh_gwm_customer_attrs_mv()`)

  // Step 2: copy MV → customers columns (only diffs)
  const attrsResult = await db.execute(sql`SELECT * FROM sync_gwm_customer_attrs()`)
  const updatedAttrs = Number((attrsResult.rows[0] as { updated_count?: number | string })?.updated_count ?? 0)

  // Step 3: upsert agents + relink customers.agent_id
  const agentsResult = await db.execute(sql`SELECT * FROM sync_gwm_agents(${projectId}::uuid)`)
  const agentRow = agentsResult.rows[0] as { upserted_count?: number | string; linked_customers?: number | string } | undefined
  const upsertedAgents = Number(agentRow?.upserted_count ?? 0)
  const linkedCustomers = Number(agentRow?.linked_customers ?? 0)

  // Step 4: products — full upsert (catalog is small, ~3K rows, cheap)
  const productsResult = await db.execute(sql`SELECT * FROM sync_gwm_products(${projectId}::uuid)`)
  const upsertedProducts = Number((productsResult.rows[0] as { upserted_count?: number | string })?.upserted_count ?? 0)

  // Step 5: collections (derived from cat_product.category) — full re-link
  const collectionsResult = await db.execute(sql`SELECT * FROM sync_gwm_collections(${projectId}::uuid)`)
  const collectionsRow = collectionsResult.rows[0] as { upserted_collections?: number | string; linked_products?: number | string } | undefined
  const upsertedCollections = Number(collectionsRow?.upserted_collections ?? 0)
  const linkedProductCollections = Number(collectionsRow?.linked_products ?? 0)

  // Step 6: orders — incremental from cursor stored in config.orders.lastSyncedAt.
  // First run: cursor=null → backfills everything. Function returns the new
  // max(updated_at) which we persist back into config so the next tick picks
  // up exactly where this one left off.
  const ordersSince = config.orders?.lastSyncedAt ?? null
  const ordersResult = await db.execute(sql`
    SELECT * FROM sync_gwm_orders(${projectId}::uuid, ${ordersSince}::timestamptz)
  `)
  const ordersRow = ordersResult.rows[0] as { upserted_count?: number | string; max_updated_at?: string | null } | undefined
  const upsertedOrders = Number(ordersRow?.upserted_count ?? 0)
  const ordersCursor = ordersRow?.max_updated_at ?? ordersSince

  // Carry forward the existing config + bump the orders cursor only.
  const nextConfig: SourceConfig = {
    ...config,
    orders: { lastSyncedAt: ordersCursor },
  }

  return {
    stats: {
      updatedAttrs,
      upsertedAgents,
      linkedCustomers,
      upsertedProducts,
      upsertedCollections,
      linkedProductCollections,
      upsertedOrders,
      ordersCursor: ordersCursor ?? null,
    },
    nextConfig,
  }
}

export function startFederationRefreshWorker(): Worker {
  const worker = new Worker(
    WORKER_NAME,
    async () => {
      const sources = await db
        .select()
        .from(projectDataSources)
        .where(eq(projectDataSources.isActive, true))

      const results: Array<{ projectId: string; sourceType: string; ok: boolean; durationMs: number; error?: string; stats?: unknown }> = []

      for (const src of sources) {
        const handler = SOURCE_HANDLERS[src.sourceType]
        if (!handler) {
          console.warn(`[federation-refresh] no handler for source_type=${src.sourceType}`)
          continue
        }

        const startedAt = Date.now()
        try {
          await db.update(projectDataSources)
            .set({ lastRefreshStatus: 'running', updatedAt: new Date() })
            .where(eq(projectDataSources.projectId, src.projectId))

          const config = (src.config ?? {}) as SourceConfig
          const { stats, nextConfig } = await handler(src.projectId, config)
          const durationMs = Date.now() - startedAt

          await db.update(projectDataSources).set({
            lastRefreshAt: new Date(),
            lastRefreshStatus: 'success',
            lastRefreshError: null,
            lastRefreshDurationMs: durationMs,
            // Persist the bumped cursor so the next tick picks up where this left off.
            config: nextConfig,
            updatedAt: new Date(),
          }).where(eq(projectDataSources.projectId, src.projectId))

          results.push({ projectId: src.projectId, sourceType: src.sourceType, ok: true, durationMs, stats })
        } catch (err) {
          const durationMs = Date.now() - startedAt
          const message = err instanceof Error ? err.message : String(err)

          await db.update(projectDataSources).set({
            lastRefreshAt: new Date(),
            lastRefreshStatus: 'failed',
            lastRefreshError: message,
            lastRefreshDurationMs: durationMs,
            updatedAt: new Date(),
          }).where(eq(projectDataSources.projectId, src.projectId))

          console.error(`[federation-refresh] project=${src.projectId} source=${src.sourceType} FAILED:`, message)
          results.push({ projectId: src.projectId, sourceType: src.sourceType, ok: false, durationMs, error: message })
        }
      }

      return { sources: sources.length, results }
    },
    { connection: redisConnection, concurrency: 1 }, // serialised — refreshes are heavy
  )

  worker.on('completed', (job, result) => {
    const r = result as { sources: number; results: Array<{ projectId: string; ok: boolean; durationMs: number }> }
    if (r.sources > 0) {
      console.log(`[federation-refresh] job ${job.id} processed ${r.sources} sources:`, r.results)
    }
  })

  worker.on('failed', (job, err) => {
    console.error(`[federation-refresh] job ${job?.id} failed:`, err.message)
  })

  // Schedule the repeatable. Idempotent — re-registering the same name updates schedule.
  federationRefreshQueue.upsertJobScheduler(
    'periodic-federation-refresh',
    { every: REFRESH_INTERVAL_MS },
    {
      name: 'refresh',
      data: {},
      opts: { removeOnComplete: true, removeOnFail: { count: 5 } },
    },
  ).catch(err => console.error('[federation-refresh] failed to schedule:', err))

  console.log('[federation-refresh] worker started, refreshing every', REFRESH_INTERVAL_MS / 1000 / 60, 'min')
  return worker
}
