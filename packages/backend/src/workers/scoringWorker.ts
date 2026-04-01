/**
 * Scoring Worker — Batch score customers for prediction goals.
 *
 * Processes jobs from the 'score-customers' queue.
 * Job data: { projectId, goalId, targetEvent }
 *
 * Flow:
 * 1. Get all active customers for the project
 * 2. Batch them into chunks of 100
 * 3. Call ML service /propensity/score for each batch
 * 4. Upsert scores into prediction_scores table
 */

import { Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { customers, predictionScores, predictionGoals } from '../db/schema.js'
import { eq, and, sql } from 'drizzle-orm'
import { scoreCustomers, checkMlHealth } from '../services/mlProxyService.js'

type ScoringJob = {
  projectId: string
  goalId: string
}

const BATCH_SIZE = 100

async function processScoring(job: { data: ScoringJob }) {
  const { projectId, goalId } = job.data

  // Check ML service availability
  const mlAvailable = await checkMlHealth()
  if (!mlAvailable) {
    console.warn(`[scoring] ML service unavailable, skipping goal ${goalId}`)
    return { status: 'skipped', reason: 'ml_unavailable' }
  }

  // Get goal details
  const [goal] = await db
    .select()
    .from(predictionGoals)
    .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))

  if (!goal || goal.status !== 'active') {
    return { status: 'skipped', reason: 'goal_not_active' }
  }

  // Get all customer IDs
  const customerRows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.projectId, projectId))

  const allIds = customerRows.map(r => r.id)
  console.log(`[scoring] Scoring ${allIds.length} customers for goal ${goalId}`)

  let scored = 0

  // Process in batches
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE)

    try {
      const result = await scoreCustomers(
        projectId,
        goalId,
        batch,
        goal.observationWindowDays ?? 90,
      )

      // Upsert scores
      for (const s of result.scores) {
        await db.insert(predictionScores).values({
          projectId,
          customerId: s.customerId,
          goalId,
          score: String(s.score),
          confidence: String(s.confidence),
          bucket: s.bucket,
          factors: [],  // batch scoring doesn't compute SHAP (too expensive)
          modelVersion: result.modelVersion,
          computedAt: new Date(result.computedAt),
        })
        scored++
      }
    } catch (err) {
      console.error(`[scoring] Batch error at offset ${i}:`, err)
    }
  }

  // Update goal's last trained timestamp
  await db
    .update(predictionGoals)
    .set({
      lastTrainedAt: new Date(),
      currentMetric: String(goal.currentMetric ?? '0'),
    })
    .where(eq(predictionGoals.id, goalId))

  console.log(`[scoring] Done: ${scored}/${allIds.length} customers scored for goal ${goalId}`)
  return { status: 'completed', scored, total: allIds.length }
}

export function startScoringWorker() {
  const worker = new Worker('score-customers', processScoring, {
    connection: redisConnection,
    concurrency: 1,
    limiter: { max: 1, duration: 1000 },
  })

  worker.on('completed', (job, result) => {
    console.log(`[scoring] Job ${job?.id} completed:`, result)
  })

  worker.on('failed', (job, err) => {
    console.error(`[scoring] Job ${job?.id} failed:`, err.message)
  })

  console.log('[scoring] Scoring worker started')
  return worker
}
