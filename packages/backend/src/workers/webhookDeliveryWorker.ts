import { Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { deliverWebhook } from '../services/webhookService.js'

// Delivers outbound webhooks off the 'webhook-delivery' queue. Retries are
// managed inside deliverWebhook (per-subscription retry_policy schedules the
// next delayed job), so this worker just runs one attempt per job.

export function startWebhookDeliveryWorker(): Worker {
  const worker = new Worker(
    'webhook-delivery',
    async (job) => {
      const { deliveryId } = job.data as { deliveryId: string }
      if (!deliveryId) throw new Error('webhook-delivery job missing deliveryId')
      await deliverWebhook(deliveryId)
    },
    { connection: redisConnection, concurrency: 5 },
  )

  worker.on('failed', (job, err) => {
    console.error(`[webhook-delivery] job ${job?.id} failed:`, err.message)
  })

  return worker
}
