import { Worker } from 'bullmq'
import { eq, and, isNull, sql, gte, max as sqlMax } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { events, anonymousSessions, flows } from '../db/schema.js'
import { eventsQueue } from '../services/queue.js'

/**
 * Phase F3 — back-attribute previously anonymous events when a session resolves
 * to a known customer, then replay them through the events queue so flow
 * triggers re-evaluate with idempotency.
 *
 * Flow:
 *   1. Read anonymous_sessions row (project_id, session_id, customer_id)
 *   2. Find the maximum lookback_days across all active flows in the project.
 *      We use the LARGEST so the back-attribution covers every flow that
 *      could potentially fire. Per-flow lookback enforcement happens in the
 *      trigger evaluator (F3-5/6).
 *   3. UPDATE events SET customer_id = X WHERE session_id = Y AND customer_id IS NULL
 *      AND timestamp >= NOW() - INTERVAL 'lookback days'
 *   4. For each newly-attributed event, re-publish to the events queue with
 *      replayed=true so the trigger worker re-evaluates flows. Idempotency on
 *      flow_trips.(flow_id, customer_id, trigger_event_id) prevents
 *      double-enrolment.
 *   5. Stamp anonymous_sessions.events_back_attributed + flows_triggered +
 *      resolved_at for observability.
 *
 * Bounded by the max-lookback window. A 5K-event session that resolves
 * triggers ~5K queue messages — the events queue's existing concurrency (50)
 * handles this without blocking real-time event ingestion.
 */

const WORKER_NAME = 'identity-merge'
const REPLAY_BATCH = 500 // events processed per chunk

type MergeJob = {
  projectId: string
  sessionId: string
  customerId: string
}

export function startIdentityMergeWorker(): Worker {
  const worker = new Worker(
    WORKER_NAME,
    async (job) => {
      const { projectId, sessionId, customerId } = job.data as MergeJob

      // Largest lookback across all active flows; events older than this
      // can't possibly trigger anything so don't waste cycles attributing.
      const [{ maxLookback } = { maxLookback: null as number | null }] = await db
        .select({ maxLookback: sqlMax(flows.lookbackDays) })
        .from(flows)
        .where(and(eq(flows.projectId, projectId), eq(flows.status, 'active')))

      const lookback = maxLookback ?? 30 // fallback if no active flows

      // 1. Back-attribute prior anonymous events for this session
      const updated = await db.execute(sql`
        UPDATE events
        SET customer_id = ${customerId}
        WHERE project_id = ${projectId}
          AND session_id = ${sessionId}
          AND customer_id IS NULL
          AND timestamp >= NOW() - (${lookback}::int * INTERVAL '1 day')
        RETURNING id, event_name, properties, timestamp
      `)

      const attributed = updated.rows as Array<{
        id: string
        event_name: string
        properties: unknown
        timestamp: Date
      }>

      console.log(`[identity-merge] project=${projectId} session=${sessionId} → customer=${customerId}: attributed ${attributed.length} events`)

      // 2. Replay each through the events queue with replayed=true
      let triggeredFlowCount = 0
      for (let i = 0; i < attributed.length; i += REPLAY_BATCH) {
        const chunk = attributed.slice(i, i + REPLAY_BATCH)
        for (const e of chunk) {
          await eventsQueue.add('replayed_event', {
            projectId,
            customerId,
            eventName: e.event_name,
            properties: (e.properties ?? {}) as Record<string, unknown>,
            platform: 'web',
            timestamp: new Date(e.timestamp).toISOString(),
            // Phase F3 — replay flag + the event id; the trigger worker uses
            // the event id as the flow-trip idempotency key.
            replayed: true,
            triggerEventId: e.id,
          }).catch(err => console.error('[identity-merge] re-publish failed:', err))
          triggeredFlowCount++ // upper bound; actual fires depend on flow filters
        }
      }

      // 3. Stamp the resolution outcome so the admin panel can show "X events
      //    attributed, Y flow trips triggered" per resolution.
      await db.update(anonymousSessions).set({
        eventsBackAttributed: attributed.length,
        flowsTriggered: triggeredFlowCount,
        resolvedAt: new Date(),
      }).where(and(
        eq(anonymousSessions.projectId, projectId),
        eq(anonymousSessions.sessionId, sessionId),
      ))

      return { eventsBackAttributed: attributed.length, eventsReplayed: triggeredFlowCount }
    },
    { connection: redisConnection, concurrency: 5 },
  )

  worker.on('completed', (job, result) => {
    console.log(`[identity-merge] job ${job.id} completed:`, result)
  })

  worker.on('failed', (job, err) => {
    console.error(`[identity-merge] job ${job?.id} failed:`, err.message)
  })

  console.log('[identity-merge] worker started')
  return worker
}
