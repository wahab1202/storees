/**
 * Training Worker — Train + score pipeline for prediction goals.
 *
 * Triggered when a new goal is created or manually retrained.
 * Flow:
 * 1. Call ML service /propensity/train
 * 2. Update goal status + metric in DB
 * 3. If training succeeded, enqueue scoring job
 */

import { Queue, Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { predictionGoals, projects } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { trainModel, checkMlHealth } from '../services/mlProxyService.js'

type TrainingJob = {
  projectId: string
  goalId: string
}

const SCORE_QUEUE = 'score-customers'

async function processTraining(job: { data: TrainingJob }) {
  const { projectId, goalId } = job.data

  // Check ML service
  const mlAvailable = await checkMlHealth()
  if (!mlAvailable) {
    console.warn(`[training] ML service unavailable, skipping goal ${goalId}`)
    return { status: 'skipped', reason: 'ml_unavailable' }
  }

  // Get goal details
  const [goal] = await db
    .select()
    .from(predictionGoals)
    .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))

  if (!goal) {
    return { status: 'skipped', reason: 'goal_not_found' }
  }

  // Get project domain
  const [project] = await db
    .select({ domainType: projects.domainType })
    .from(projects)
    .where(eq(projects.id, projectId))

  let domain = (project?.domainType ?? 'ecommerce').toLowerCase()
  if (['nbfc', 'lending', 'banking'].includes(domain)) domain = 'fintech'
  if (['education', 'edtech', 'e-learning'].includes(domain)) domain = 'edtech'
  if (!['ecommerce', 'fintech', 'saas', 'edtech'].includes(domain)) domain = 'ecommerce'

  console.log(`[training] Training model for goal "${goal.name}" (${goalId}), domain=${domain}`)

  try {
    const result = await trainModel(
      projectId,
      goalId,
      goal.targetEvent,
      goal.observationWindowDays ?? 90,
      goal.predictionWindowDays ?? 14,
      domain,
    )

    console.log(`[training] Result: status=${result.status}, auc=${result.auc}, baseline=${result.baselineAuc}`)

    if (result.status === 'success') {
      // Update goal with metric
      await db
        .update(predictionGoals)
        .set({
          currentMetric: String(result.auc),
          lastTrainedAt: new Date(),
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(predictionGoals.id, goalId))

      // Enqueue scoring job
      const scoreQueue = new Queue(SCORE_QUEUE, { connection: redisConnection })
      await scoreQueue.add('score-customers', {
        projectId,
        goalId,
      }, {
        jobId: `score-after-train-${goalId}-${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      })
      await scoreQueue.close()

      console.log(`[training] Model trained (AUC=${result.auc}), scoring job enqueued`)
      return { status: 'trained', auc: result.auc, baselineAuc: result.baselineAuc }

    } else if (result.status === 'insufficient_data') {
      await db
        .update(predictionGoals)
        .set({ status: 'insufficient_data', updatedAt: new Date() })
        .where(eq(predictionGoals.id, goalId))

      console.log(`[training] Insufficient data for goal "${goal.name}"`)
      return { status: 'insufficient_data', reason: result.reason }

    } else {
      // Training failed (leakage, no lift, etc.)
      console.warn(`[training] Training failed for "${goal.name}": ${result.reason}`)
      return { status: 'failed', reason: result.reason }
    }
  } catch (err) {
    console.error(`[training] Error training goal ${goalId}:`, err)
    return { status: 'error', reason: String(err) }
  }
}

export function startTrainingWorker() {
  const worker = new Worker('train-model', processTraining, {
    connection: redisConnection,
    concurrency: 1,
    limiter: { max: 1, duration: 5000 }, // Max 1 train every 5s
  })

  worker.on('completed', (job, result) => {
    console.log(`[training] Job ${job?.id} completed:`, result)
  })

  worker.on('failed', (job, err) => {
    console.error(`[training] Job ${job?.id} failed:`, err.message)
  })

  console.log('[training] Training worker started')
  return worker
}

export async function enqueueTrainingJob(projectId: string, goalId: string) {
  const queue = new Queue('train-model', { connection: redisConnection })
  await queue.add('train-model', { projectId, goalId }, {
    jobId: `train-${goalId}-${Date.now()}`,
    removeOnComplete: 50,
    removeOnFail: 20,
  })
  await queue.close()
}
