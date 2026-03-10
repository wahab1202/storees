import { Queue } from 'bullmq'
import { redisConnection } from './redis.js'

export const eventsQueue = new Queue('events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
})

export const flowActionsQueue = new Queue('flow-actions', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
})

export const shopifySyncQueue = new Queue('shopify-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
  },
})

export const campaignQueue = new Queue('campaigns', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  },
})
