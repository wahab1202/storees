import { Worker } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { processCampaign } from '../services/campaignService.js'

export function startCampaignWorker(): void {
  const worker = new Worker(
    'campaigns',
    async (job) => {
      const { campaignId } = job.data as { campaignId: string }
      console.log(`[CampaignWorker] Processing campaign ${campaignId}`)
      await processCampaign(campaignId)
    },
    {
      connection: redisConnection,
      concurrency: 1, // process one campaign at a time to avoid Resend rate limits
    },
  )

  worker.on('failed', (job, err) => {
    console.error(`[CampaignWorker] Job ${job?.id} failed:`, err.message)
  })

  console.log('[CampaignWorker] Started')
}
