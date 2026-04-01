import { Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { executeSend } from '../services/deliveryService.js'
import type { SendCommand } from '@storees/shared'

export function startDeliveryWorker(): void {
  const worker = new Worker(
    'delivery',
    async (job) => {
      const { messageId, ...command } = job.data as { messageId: string } & SendCommand

      // Reconstruct Date if scheduledAt was serialized
      if (command.scheduledAt && typeof command.scheduledAt === 'string') {
        command.scheduledAt = new Date(command.scheduledAt)
      }

      await executeSend(messageId, command)
    },
    {
      connection: redisConnection,
      concurrency: 50, // rate-limited by queue, high concurrency for throughput
      limiter: {
        max: 50,
        duration: 1000, // 50 msgs/sec max to Pinnacle
      },
    },
  )

  worker.on('completed', (job) => {
    console.log(`Delivery job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Delivery job ${job?.id} failed:`, err.message)
  })

  console.log('Delivery worker started (concurrency: 50, rate: 50/sec)')
}
