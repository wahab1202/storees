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
    attempts: 3, // Up from 1 — Shopify rate limits need retries
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  },
})

export const metricsQueue = new Queue('metrics', {
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

export const deliveryQueue = new Queue('delivery', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 200 },
  },
})

export const interactionQueue = new Queue('interactions', {
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

// Phase F1b — periodic poll for WhatsApp template approval status. Cron'd at
// startup to fire every 4h (see workers/templateStatusWorker.ts).
export const templateStatusQueue = new Queue('template-status', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: { count: 20 },
  },
})

// Phase F3 — identity-merge job queue. Enqueued when an anonymous browser
// session resolves to a known customer; the worker back-attributes prior
// events and re-publishes them through the events queue with replayed=true.
export const identityMergeQueue = new Queue('identity-merge', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
})

// Customer-aggregate worker — consumes events and folds them into
// customers.total_orders / total_spent / first_order_date / last_order_date /
// avg_order_value. Now the canonical path for keeping customer aggregates
// fresh (was FDW federation cron, removed).
//
// Dedicated queue (separate from `events`) so:
//   - The trigger worker and the aggregate worker can fail independently
//   - We can pause aggregates for maintenance without blocking flow triggers
//   - Retry/backoff is tuned for write contention on customers, not flow logic
export const customerAggregateQueue = new Queue('customer-aggregates', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: { count: 200 },
  },
})
