import { Worker } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { dataSourceConnectors, dataSourceSyncs, dataSourceSyncLogs } from '../db/schema.js'
import { dataSyncQueue, shopifySyncQueue } from '../services/queue.js'
import { runSync } from '../services/dataSyncService.js'

// Data sync worker — pulls customers/products/orders from a configured
// connector endpoint and feeds them through the same import path as
// /v1/import/*. One sync run = one BullMQ job. The orchestrator
// (services/dataSyncService.ts) handles pagination, mapping, and per-entity
// failure isolation; this worker just owns the job lifecycle.
//
// Two job shapes flow through the 'data-sync' queue:
//   - name 'sync' + { syncId }     → run one pre-created sync row (manual buttons + the ticks below)
//   - name 'scheduled-incremental' → fan-out tick: enqueue an incremental sync for every active connector
//   - name 'scheduled-full'        → fan-out tick: enqueue a full resync for every active connector
//
// The scheduled ticks are why connectors stay fresh WITHOUT anyone clicking
// "Sync Now". Incremental runs often (cheap, updated_after cursor); the nightly
// full resync closes the cursor gap — backdated/late-arriving orders whose
// source timestamp is older than the cursor are invisible to incremental sync
// but always caught by a full pull.

const INCREMENTAL_EVERY_MS = 3 * 60 * 60 * 1000 // 3h
const FULL_RESYNC_CRON = '0 3 * * *'            // nightly at 03:00 server time

/**
 * Enqueue a sync for every active connector. Mirrors the manual /sync route:
 * first-ever sync is forced full (no cursor to filter by), and a connector that
 * already has a queued/running sync is skipped so ticks don't pile up on a slow
 * full resync.
 */
async function fanOutScheduledSyncs(kind: 'incremental' | 'full'): Promise<{ enqueued: number; skipped: number }> {
  const connectors = await db
    .select({
      id: dataSourceConnectors.id,
      projectId: dataSourceConnectors.projectId,
      template: dataSourceConnectors.template,
      lastSyncedAt: dataSourceConnectors.lastSyncedAt,
    })
    .from(dataSourceConnectors)
    .where(eq(dataSourceConnectors.status, 'active'))

  if (connectors.length === 0) return { enqueued: 0, skipped: 0 }

  // Skip connectors that already have an in-flight sync (queued or running).
  const inflight = await db
    .select({ connectorId: dataSourceSyncs.connectorId })
    .from(dataSourceSyncs)
    .where(inArray(dataSourceSyncs.status, ['queued', 'running']))
  const busy = new Set(inflight.map((r) => r.connectorId))

  let enqueued = 0
  let skipped = 0
  for (const conn of connectors) {
    if (busy.has(conn.id)) {
      skipped++
      continue
    }

    // Shopify is a native source — route it to the shopify-sync worker, NOT the
    // generic queue (which would throw "Unknown template: shopify"). Its live
    // updates come via webhooks, so only the nightly FULL tick does a
    // reconciliation re-pull — skip Shopify on the frequent incremental tick.
    if (conn.template === 'shopify') {
      if (kind !== 'full') { skipped++; continue }
      const [sync] = await db
        .insert(dataSourceSyncs)
        .values({ connectorId: conn.id, kind: 'full', status: 'queued' })
        .returning({ id: dataSourceSyncs.id })
      await shopifySyncQueue.add('sync', { projectId: conn.projectId, syncId: sync.id })
      enqueued++
      continue
    }

    const lastSynced = (conn.lastSyncedAt as Record<string, string | undefined>) ?? {}
    const hasEverSynced = Object.keys(lastSynced).length > 0
    const effectiveKind = !hasEverSynced ? 'full' : kind

    const [sync] = await db
      .insert(dataSourceSyncs)
      .values({ connectorId: conn.id, kind: effectiveKind, status: 'queued' })
      .returning({ id: dataSourceSyncs.id })

    await dataSyncQueue.add('sync', { syncId: sync.id }, { jobId: `sync-${sync.id}` })
    enqueued++
  }
  return { enqueued, skipped }
}

export function startDataSyncWorker(): Worker {
  const worker = new Worker(
    'data-sync',
    async (job) => {
      // Fan-out ticks — enqueue real sync jobs for every active connector.
      if (job.name === 'scheduled-incremental' || job.name === 'scheduled-full') {
        const kind = job.name === 'scheduled-full' ? 'full' : 'incremental'
        const { enqueued, skipped } = await fanOutScheduledSyncs(kind)
        if (enqueued > 0) console.log(`[data-sync] ${job.name}: enqueued ${enqueued} sync(s), skipped ${skipped} in-flight`)
        return { tick: job.name, enqueued, skipped }
      }

      // Single sync run.
      const { syncId } = job.data as { syncId: string }
      if (!syncId) throw new Error('data-sync job missing syncId')

      try {
        await runSync(syncId)
      } catch (err) {
        const message = (err as Error).message
        await db
          .update(dataSourceSyncs)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            updatedAt: new Date(),
            errorSummary: message.slice(0, 500),
          })
          .where(eq(dataSourceSyncs.id, syncId))
        await db.insert(dataSourceSyncLogs).values({
          syncId,
          level: 'error',
          entityType: 'meta',
          message: `Sync aborted: ${message}`,
        })
        throw err  // BullMQ records the failure
      }
    },
    {
      connection: redisConnection,
      // Syncs are heavy (long-running HTTP loops) — keep concurrency at 2 so
      // we don't saturate the worker process. Multiple projects can still
      // sync in parallel since BullMQ picks up across the pool.
      concurrency: 2,
    },
  )

  worker.on('failed', (job, err) => {
    console.error(`[data-sync] job ${job?.id} failed:`, err.message)
  })

  // Schedule the repeatable ticks. upsertJobScheduler is idempotent — re-adding
  // on every boot keeps a single live schedule.
  dataSyncQueue.upsertJobScheduler(
    'scheduled-incremental-sync',
    { every: INCREMENTAL_EVERY_MS },
    { name: 'scheduled-incremental', data: {}, opts: { removeOnComplete: true, removeOnFail: { count: 5 } } },
  ).catch((err) => console.error('[data-sync] failed to schedule incremental:', err))

  dataSyncQueue.upsertJobScheduler(
    'scheduled-full-resync',
    { pattern: FULL_RESYNC_CRON },
    { name: 'scheduled-full', data: {}, opts: { removeOnComplete: true, removeOnFail: { count: 5 } } },
  ).catch((err) => console.error('[data-sync] failed to schedule full resync:', err))

  console.log(`[data-sync] worker started — incremental every ${INCREMENTAL_EVERY_MS / 1000 / 60 / 60}h, full resync at '${FULL_RESYNC_CRON}'`)
  return worker
}
