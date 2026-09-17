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

/** THE SAME EVENTS AGAIN, FOR PREDICTION SCORING.
 *
 *  A BullMQ queue is a WORK queue, not a broadcast: every job goes to exactly one
 *  consumer. `triggerWorker` and `predictionTriggerWorker` both listened on `events`,
 *  so the two of them split the stream and each saw roughly half of it — a coin flip on
 *  every event deciding whether a cart got re-scored.
 *
 *  It looked like flakiness rather than a bug, because half of everything did work: a
 *  shopper added three items and one or two updated the screen. Chased as intermittency
 *  for an afternoon; it is a race, and it was in the wiring rather than in either
 *  worker.
 *
 *  Fanning out to a second queue is the smallest correct fix — each consumer gets its
 *  own copy, and neither can starve the other. A third consumer of the event stream
 *  needs its own queue too; adding another `new Worker('events', …)` would quietly
 *  reintroduce exactly this. */
export const predictionEventsQueue = new Queue('prediction-events', {
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

// Nightly reconciliation of customer aggregates (total_orders / total_spent /
// clv) from the authoritative orders table. A self-healing net: any path that
// adds or re-points orders without recomputing (historical sync, identity
// stitch) can only leave the summary counters stale until the next tick.
export const aggregateReconcileQueue = new Queue('aggregate-reconcile', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: true,
    removeOnFail: { count: 10 },
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

// Data-source sync queue. One job per sync run (manual "Sync Now" from the
// project page or programmatic). Heavy long-running jobs (paginated HTTP +
// field mapping + batched imports) — keep attempts low so a deterministic
// failure (bad creds, broken endpoint) doesn't retry uselessly.
export const dataSyncQueue = new Queue('data-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
})

export const webhookDeliveryQueue = new Queue('webhook-delivery', {
  connection: redisConnection,
  defaultJobOptions: {
    // Retries are managed in-worker via retry_policy (per-subscription schedule),
    // so BullMQ itself only retries on a thrown worker error, not on non-2xx.
    attempts: 1,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  },
})


/** PUBLISH ONE EVENT TO EVERY CONSUMER OF THE EVENT STREAM.
 *
 *  Use this rather than `eventsQueue.add` directly. Two independent things react to
 *  events — flow triggers and prediction scoring — and a BullMQ queue delivers each job
 *  to exactly ONE worker, so sharing a queue silently halves both of them. Fanning out
 *  here keeps that decision in a single place: a new consumer gets a queue and a line in
 *  this function, instead of a `new Worker('events', …)` that quietly steals half the
 *  stream from whoever was already listening.
 */
export async function publishEvent(name: string, data: unknown, opts?: Record<string, unknown>) {
  await Promise.all([
    eventsQueue.add(name, data as never, opts as never),
    predictionEventsQueue.add(name, data as never, opts as never),
  ])
}

/** The bulk form, for an import or a segment recompute. */
export async function publishEvents(jobs: Array<{ name: string; data: unknown }>) {
  if (jobs.length === 0) return
  const shaped = jobs.map(j => ({ name: j.name, data: j.data as never }))
  await Promise.all([
    eventsQueue.addBulk(shaped),
    predictionEventsQueue.addBulk(shaped),
  ])
}
