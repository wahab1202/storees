import { Worker } from 'bullmq'
import { eq, and } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { scheduledJobs, flowTrips } from '../db/schema.js'
import { advanceTrip } from '../services/flowExecutor.js'

export function startFlowWorker(): Worker {
  const worker = new Worker(
    'flow-actions',
    async (job) => {
      const { tripId, nextNodeId } = job.data as { tripId: string; nextNodeId: string }

      console.log(`Processing flow action: advance trip ${tripId} to node ${nextNodeId}`)

      // Mark scheduled job as executed
      await db.update(scheduledJobs).set({
        status: 'executed',
      }).where(
        and(
          eq(scheduledJobs.flowTripId, tripId),
          eq(scheduledJobs.status, 'pending'),
        ),
      )

      // Move the trip onto the post-delay node BEFORE advancing. Without this,
      // advanceTrip re-reads currentNodeId (still the delay node), re-processes
      // the delay, and reschedules another advance_trip — an infinite wait loop
      // that never reaches the next node. Guard on status='waiting' so an exit
      // event that fired during the delay isn't resurrected.
      const moved = await db.update(flowTrips)
        .set({ currentNodeId: nextNodeId, status: 'active' })
        .where(and(eq(flowTrips.id, tripId), eq(flowTrips.status, 'waiting')))
        .returning({ id: flowTrips.id })

      // Advance the trip (only meaningful if it was still waiting)
      if (moved.length > 0) await advanceTrip(tripId)
    },
    {
      connection: redisConnection,
      concurrency: 20, // Up from 5 — more flow actions with SDK traffic
    },
  )

  worker.on('completed', (job) => {
    console.log(`Flow action job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Flow action job ${job?.id} failed:`, err.message)
  })

  return worker
}
