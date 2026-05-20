/**
 * Prediction Training Scheduler.
 *
 * Wakes up on RETRAIN_INTERVAL_HOURS (default 24h) and enqueues a fresh
 * training job for every prediction goal — including those currently
 * stuck on insufficient_data, in case data has caught up. Without this,
 * goals are only trained once at creation time and stay frozen.
 *
 * The scheduler does not skip "active" goals: training is cheap relative
 * to the value of detecting drift, and the alternative (training only
 * stale goals) makes drift invisible.
 *
 * If the ML service is unreachable, the training worker no-ops cheaply
 * (it short-circuits on checkMlHealth before doing any DB work), so a
 * dead ML service doesn't cause queue buildup.
 */

import { Queue } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { predictionGoals } from '../db/schema.js'

const TRAIN_QUEUE = 'train-model'
const DEFAULT_RETRAIN_INTERVAL_HOURS = 24

async function enqueueAllRetrains(queue: Queue) {
  const goals = await db
    .select({ id: predictionGoals.id, projectId: predictionGoals.projectId })
    .from(predictionGoals)

  if (goals.length === 0) {
    console.log('[prediction-training-scheduler] No prediction goals — nothing to retrain')
    return
  }

  for (const g of goals) {
    await queue.add('train-model', {
      projectId: g.projectId,
      goalId: g.id,
    }, {
      jobId: `retrain-scheduled-${g.id}-${Date.now()}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    })
  }

  console.log(`[prediction-training-scheduler] Enqueued ${goals.length} retrain jobs`)
}

export function startPredictionTrainingScheduler() {
  const intervalHours = Number(process.env.RETRAIN_INTERVAL_HOURS) || DEFAULT_RETRAIN_INTERVAL_HOURS
  const queue = new Queue(TRAIN_QUEUE, { connection: redisConnection })

  // Do NOT run immediately on boot — pod restarts shouldn't all retrain at once.
  // First retrain fires after `intervalHours`.
  const timer = setInterval(() => {
    enqueueAllRetrains(queue).catch(err => {
      console.error('[prediction-training-scheduler] Scheduled retrain failed:', err)
    })
  }, intervalHours * 60 * 60 * 1000)
  timer.unref()

  console.log(`[scheduler] Prediction-training retrain interval: ${intervalHours}h`)
  return { queue, timer }
}
