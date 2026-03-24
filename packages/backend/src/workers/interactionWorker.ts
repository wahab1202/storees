import { Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { processEventInteraction } from '../services/interactionEngine.js'

export function startInteractionWorker(): void {
  const worker = new Worker(
    'interactions',
    async (job) => {
      const { projectId, customerId, eventName, properties, eventId } = job.data as {
        projectId: string
        customerId: string
        eventName: string
        properties: Record<string, unknown>
        eventId: string
      }

      await processEventInteraction(projectId, customerId, eventName, properties, eventId)
    },
    {
      connection: redisConnection,
      concurrency: 30,
    },
  )

  worker.on('completed', (job) => {
    console.log(`Interaction job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Interaction job ${job?.id} failed:`, err.message)
  })

  console.log('Interaction worker started (concurrency: 30)')
}
