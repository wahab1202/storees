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

const SCORE_QUEUE = 'score-customers'
const DEFAULT_SCORING_INTERVAL_HOURS = 24
const DEFAULT_SNAPSHOT_INTERVAL_HOURS = 168 // 1 week

// ============ SCORING ============

async function enqueueScoringJobs(queue: Queue) {
  const activeGoals = await db
    .select({ id: predictionGoals.id, projectId: predictionGoals.projectId })
    .from(predictionGoals)
    .where(eq(predictionGoals.status, 'active'))

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
    })
  }

  console.log(`[scoring-scheduler] Enqueued ${activeGoals.length} scoring jobs`)
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

  // Run snapshots on interval (not immediately — avoid duplicate on restart)
  const snapshotTimer = setInterval(() => {
    takeAllSnapshots()
  }, snapshotIntervalHours * 60 * 60 * 1000)
  snapshotTimer.unref()

  console.log(`[scheduler] Started — scoring: ${scoringIntervalHours}h, snapshots: ${snapshotIntervalHours}h`)
  return { queue, scoringTimer, snapshotTimer }
}
