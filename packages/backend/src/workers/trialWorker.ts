import { Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { trialLifecycleQueue } from '../services/queue.js'
import { expireTrials, sendDueTrialReminders } from '../services/trialLifecycleService.js'

const WORKER_NAME = 'trial-lifecycle'
const DAILY_MS = 24 * 60 * 60 * 1000

/**
 * Daily trial lifecycle worker: expire finished trials + send due reminder emails.
 * Idempotent (expiry is a conditional UPDATE; reminders are deduped per day), so a
 * missed tick or a double-run is harmless.
 */
export function startTrialWorker(): Worker {
  const worker = new Worker(
    WORKER_NAME,
    async () => {
      const expired = await expireTrials()
      const reminded = await sendDueTrialReminders()
      return { expired, reminded }
    },
    { connection: redisConnection, concurrency: 1 },
  )

  worker.on('completed', (job, result) => {
    const r = result as { expired?: number; reminded?: number }
    if ((r.expired ?? 0) > 0 || (r.reminded ?? 0) > 0) {
      console.log(`[trial] job ${job.id} completed:`, result)
    }
  })
  worker.on('failed', (job, err) => console.error(`[trial] job ${job?.id} failed:`, err.message))

  trialLifecycleQueue.upsertJobScheduler(
    'daily-trial-lifecycle',
    { every: DAILY_MS },
    { name: 'tick', data: {}, opts: { removeOnComplete: true, removeOnFail: { count: 5 } } },
  ).catch(err => console.error('[trial] failed to schedule:', err))

  console.log('[trial] lifecycle worker started (daily: expire + reminders)')
  return worker
}
