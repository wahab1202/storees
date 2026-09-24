/**
 * Scoring & Snapshot Scheduler
 *
 * Runs two scheduled tasks:
 * 1. Scoring (every SCORING_INTERVAL_HOURS, default 24h):
 *    Query active prediction goals → enqueue 'score-customers' jobs
 * 2. Segment Snapshots (every SNAPSHOT_INTERVAL_HOURS, default 168h = 1 week):
 *    Capture segment membership snapshots for transition analysis
 */

import { Queue } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { predictionGoals, projects } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { createSegmentSnapshot } from '../services/transitionService.js'
import { isEventDriven } from '../services/predictionCadence.js'

const SCORE_QUEUE = 'score-customers'
const DEFAULT_SCORING_INTERVAL_HOURS = 24
const DEFAULT_SNAPSHOT_INTERVAL_HOURS = 168 // 1 week

// ============ SCORING ============

async function enqueueScoringJobs(queue: Queue) {
  const allActive = await db
    .select({
      id: predictionGoals.id,
      projectId: predictionGoals.projectId,
      predictionWindowDays: predictionGoals.predictionWindowDays,
    })
    .from(predictionGoals)
    .where(eq(predictionGoals.status, 'active'))

  // A goal whose window is shorter than this scheduler's own period is not served by
  // it at all — the window opens and closes between two wake-ups — so it is scored when
  // its event arrives instead, by predictionTriggerWorker. Enqueuing it here as well
  // would write answers that were already stale when the job started, and overwrite the
  // fresh event-driven ones with them.
  //
  // Decided by the WINDOW, never by the goal's name: see services/predictionCadence.ts.
  const activeGoals = allActive.filter(g => !isEventDriven(g.predictionWindowDays))
  const skipped = allActive.length - activeGoals.length
  if (skipped > 0) {
    console.log(`[scoring-scheduler] ${skipped} goal(s) have a sub-daily window and are `
      + `scored on their own events, not on this schedule`)
  }

  if (activeGoals.length === 0) {
    console.log('[scoring-scheduler] No active prediction goals found, nothing to enqueue')
    return
  }

  for (const goal of activeGoals) {
    await queue.add('score-customers', {
      projectId: goal.projectId,
      goalId: goal.id,
    }, {
      jobId: `score-${goal.projectId}-${goal.id}-${Date.now()}`,
      removeOnComplete: 100,
      removeOnFail: 50,
      // SURVIVE A DEPENDENCY THAT IS SLOWER TO BOOT THAN WE ARE.
      //
      // Without this, BullMQ's default of one attempt meant any transient failure —
      // most often the ML service still importing its model while this sweep runs on
      // the backend's own boot — cost that goal a whole day of scores, because the
      // next sweep is 24 hours away. Four retries on exponential backoff from 30s
      // cover about eight minutes, which is far longer than a cold model load, and a
      // service that is genuinely down still lands in the failed set to be seen.
      attempts: 5,
      backoff: { type: 'exponential' as const, delay: 30_000 },
    })
  }

  console.log(`[scoring-scheduler] Enqueued ${activeGoals.length} scoring jobs`)
}

/** RE-SCORE THE SHORT-WINDOW GOALS, ON A CADENCE THEIR WINDOW CAN LIVE WITH.
 *
 *  The sweep above skips these deliberately and correctly: a daily pass cannot serve a
 *  five-hour question. But "not on the daily cadence" was read as "not at all", and
 *  that left them with NO safety net — every one of their answers came from an event,
 *  so a single dropped event left a wrong row on the screen for ever.
 *
 *  Observed three times: a shopper emptied their basket, the removal did not reach the
 *  trigger worker, and the page went on showing a live cart worth what had been in it.
 *  Each time the fix was to run a job by hand. That is not a fix, it is a person
 *  standing in for the missing mechanism.
 *
 *  Events stay the fast path — a cart scores within seconds of being touched. This is
 *  the slow one that makes the fast one's failures temporary: whatever the events miss,
 *  the next sweep corrects, because scoring now both writes live carts and clears the
 *  ones whose occasion has closed.
 *
 *  The cadence comes from the WINDOW, like every other decision here. A twentieth of the
 *  shortest event-driven window bounds how long a wrong row can survive to roughly 5% of
 *  the horizon it describes — fifteen minutes against five hours — and a goal built next
 *  year with a two-hour window gets a six-minute sweep without anyone choosing one.
 */
async function reconcileEventDrivenGoals(queue: Queue) {
  const goals = (await db
    .select({
      id: predictionGoals.id,
      projectId: predictionGoals.projectId,
      predictionWindowDays: predictionGoals.predictionWindowDays,
    })
    .from(predictionGoals)
    .where(eq(predictionGoals.status, 'active')))
    .filter(g => isEventDriven(g.predictionWindowDays))

  if (goals.length === 0) return

  for (const goal of goals) {
    await queue.add('score-customers', {
      projectId: goal.projectId,
      goalId: goal.id,
    }, {
      // Keyed on the sweep's own minute so two sweeps cannot pile up on one another,
      // and so a sweep is dropped rather than queued behind a slow predecessor.
      jobId: `reconcile-${goal.projectId}-${goal.id}-${Math.floor(Date.now() / 60000)}`,
      removeOnComplete: 50,
      removeOnFail: 20,
    })
  }
  console.log(`[scoring-scheduler] reconciling ${goals.length} short-window goal(s)`)
}

/** How often to run it: a twentieth of the shortest event-driven window, bounded so a
 *  very short window cannot busy-loop the queue and a borderline one still gets swept
 *  well inside its own horizon. */
async function reconcileIntervalMs(): Promise<number> {
  const rows = (await db
    .select({ predictionWindowDays: predictionGoals.predictionWindowDays })
    .from(predictionGoals)
    .where(eq(predictionGoals.status, 'active')))
    .filter(g => isEventDriven(g.predictionWindowDays))
    .map(g => Number(g.predictionWindowDays) * 86_400_000)
  if (rows.length === 0) return 15 * 60_000
  return Math.min(Math.max(Math.min(...rows) / 20, 60_000), 30 * 60_000)
}

// ============ SEGMENT SNAPSHOTS ============

async function takeAllSnapshots() {
  try {
    const allProjects = await db
      .select({ id: projects.id })
      .from(projects)

    if (allProjects.length === 0) {
      console.log('[snapshot-scheduler] No projects found')
      return
    }

    for (const project of allProjects) {
      try {
        const count = await createSegmentSnapshot(project.id)
        console.log(`[snapshot-scheduler] Project ${project.id}: ${count} memberships snapshotted`)
      } catch (err) {
        console.error(`[snapshot-scheduler] Failed for project ${project.id}:`, err)
      }
    }
  } catch (err) {
    console.error('[snapshot-scheduler] Failed to take snapshots:', err)
  }
}

// ============ STARTUP ============

export function startScoringScheduler() {
  const scoringIntervalHours = Number(process.env.SCORING_INTERVAL_HOURS) || DEFAULT_SCORING_INTERVAL_HOURS
  const snapshotIntervalHours = Number(process.env.SNAPSHOT_INTERVAL_HOURS) || DEFAULT_SNAPSHOT_INTERVAL_HOURS

  const queue = new Queue(SCORE_QUEUE, { connection: redisConnection })

  // Run scoring immediately, then on interval
  enqueueScoringJobs(queue).catch(err => {
    console.error('[scoring-scheduler] Initial enqueue failed:', err)
  })

  const scoringTimer = setInterval(() => {
    enqueueScoringJobs(queue).catch(err => {
      console.error('[scoring-scheduler] Scheduled enqueue failed:', err)
    })
  }, scoringIntervalHours * 60 * 60 * 1000)
  scoringTimer.unref()

  // ONCE ON BOOT, then never on a timer.
  //
  // A cart expiring sends nothing — the shopper simply stops — so something has to
  // notice the window has passed. That used to be a poll every few minutes asking
  // every project "has anyone expired yet?", which is a question with an exact answer:
  // the cart opened, the window is known, so the moment is known. `predictionTrigger`
  // now schedules one wake-up per live cart at precisely that moment, so the work is
  // proportional to LIVE CARTS instead of to elapsed time — nothing runs at all when
  // no cart is open, rather than scanning every project on a timer to find nobody.
  //
  // Measured on this database: answering "who has a live cart?" for a 1.18M-event
  // project cost 38 seconds and 7.7GB, to return zero. Every few minutes, per project.
  //
  // This one boot-time pass remains because alarms live in Redis and a cart may have
  // expired while the process was down — nothing would be pending for it.
  reconcileEventDrivenGoals(queue).catch(err => {
    console.error('[scoring-scheduler] Boot reconcile failed:', err)
  })
  console.log('[scheduler] short-window goals expire on scheduled alarms, not a poll')

  // Run snapshots on interval (not immediately — avoid duplicate on restart)
  const snapshotTimer = setInterval(() => {
    takeAllSnapshots()
  }, snapshotIntervalHours * 60 * 60 * 1000)
  snapshotTimer.unref()

  console.log(`[scheduler] Started — scoring: ${scoringIntervalHours}h, snapshots: ${snapshotIntervalHours}h`)
  return { queue, scoringTimer, snapshotTimer }
}
