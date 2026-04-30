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
      // Multiple campaigns can process in parallel. Per-campaign in-flight sends are bounded by
      // PARALLEL_SENDS_PER_PAGE (10) inside processCampaign, so 3 campaigns × 10 = 30 max in-flight.
      concurrency: 3,
    },
  )

  worker.on('failed', (job, err) => {
    console.error(`[CampaignWorker] Job ${job?.id} failed:`, err.message)
  })

  console.log('[CampaignWorker] Started')
}
