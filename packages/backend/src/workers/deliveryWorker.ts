import { Worker, DelayedError } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { executeSend } from '../services/deliveryService.js'
import { acquireEmailSlot } from '../services/emailRateLimit.js'
import type { SendCommand } from '@storees/shared'

export function startDeliveryWorker(): void {
  const worker = new Worker(
    'delivery',
    async (job, token) => {
      const { messageId, ...command } = job.data as { messageId: string } & SendCommand

      // Reconstruct Date if scheduledAt was serialized
      if (command.scheduledAt && typeof command.scheduledAt === 'string') {
        command.scheduledAt = new Date(command.scheduledAt)
      }

      // Per-tenant rate budget gate (Phase E3.1). Only applies to email sends —
      // SMS/WhatsApp/push have their own provider-side rate limits. If the
      // project is over budget for the current minute, reschedule into the
      // next minute window rather than dropping the job.
      if (command.channel === 'email' && command.projectId) {
        const slot = await acquireEmailSlot(command.projectId)
        if (!slot.ok) {
          console.log(`[delivery] project ${command.projectId} over email budget (${slot.current}/${slot.limit}); deferring ${slot.retryAfterMs}ms`)
          await job.moveToDelayed(Date.now() + slot.retryAfterMs, token)
          throw new DelayedError()
        }
      }

      await executeSend(messageId, command)
    },
    {
      connection: redisConnection,
      concurrency: 50, // global concurrency ceiling — per-tenant gate is the meaningful limit
      limiter: {
        max: 50,
        duration: 1000, // 50 msgs/sec global cap (provider-friendly)
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
