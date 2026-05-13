import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { dataSourceSyncs, dataSourceSyncLogs } from '../db/schema.js'
import { runSync } from '../services/dataSyncService.js'

// Data sync worker — pulls customers/products/orders from a configured
// connector endpoint and feeds them through the same import path as
// /v1/import/*. One sync run = one BullMQ job. The orchestrator
// (services/dataSyncService.ts) handles pagination, mapping, and per-entity
// failure isolation; this worker just owns the job lifecycle.

export function startDataSyncWorker(): Worker {
  const worker = new Worker(
    'data-sync',
    async (job) => {
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

  return worker
}
