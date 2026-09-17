import { Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { aggregateReconcileQueue } from '../services/queue.js'
import { recalculateAllAggregates } from '../services/customerService.js'
import { evaluateAllSegments } from '../services/segmentService.js'

/**
 * Nightly reconciliation of customer aggregates.
 *
 * `customers.total_orders` / `total_spent` / `clv` are a cached rollup of the
 * orders table, maintained live by the aggregate worker + a few recompute
 * triggers (cancellation, identity merge). Any path that adds or re-points
 * orders WITHOUT a recompute — historical order sync (whose events aren't
 * queued), identity stitching, a dropped aggregate job — leaves the summary
 * counter stale even though the orders table is correct (the "card shows 6,
 * Orders tab shows 40" bug).
 *
 * This is the self-healing backstop: once a night, rebuild every customer's
 * aggregates from the authoritative orders table and re-evaluate segments, so
 * the summary can never drift more than a day from reality. Same operation as
 * the admin POST /api/customers/recalculate, run for every project.
 *
 * Schedule: daily at 03:00 via BullMQ repeatable.
 */

const WORKER_NAME = 'aggregate-reconcile'
const RECONCILE_CRON = '0 3 * * *' // daily 03:00 (server time)

export function startAggregateReconcileWorker(): Worker {
  const worker = new Worker(
    WORKER_NAME,
    async () => {
      const projectRows = await db.select({ id: projects.id }).from(projects)
      let reconciledProjects = 0
      let customersUpdated = 0
      for (const project of projectRows) {
        try {
          customersUpdated += await recalculateAllAggregates(project.id)
          // Segment memberships (Repeat Buyers, Champions…) key off the counters,
          // so re-evaluate after the recompute to keep them truthful too.
          await evaluateAllSegments(project.id)
          reconciledProjects++
        } catch (err) {
          console.error(`[aggregateReconcile] failed for project ${project.id}:`, err)
        }
      }
      return { reconciledProjects, customersUpdated }
    },
    { connection: redisConnection, concurrency: 1 },
  )

  worker.on('completed', (job, result) => {
    console.log(`[aggregateReconcile] job ${job.id} completed:`, result)
  })
  worker.on('failed', (job, err) => {
    console.error(`[aggregateReconcile] job ${job?.id} failed:`, err.message)
  })

  // Idempotent — re-adding the same scheduler key on every boot is a no-op.
  aggregateReconcileQueue.upsertJobScheduler(
    'reconcile-customer-aggregates',
    { pattern: RECONCILE_CRON },
    {
      name: 'reconcile',
      data: {},
      opts: { removeOnComplete: true, removeOnFail: { count: 5 } },
    },
  ).catch(err => console.error('[aggregateReconcile] failed to schedule:', err))

  console.log('[aggregateReconcile] worker started, reconciling nightly at 03:00')
  return worker
}
