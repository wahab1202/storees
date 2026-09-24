/**
 * Prediction Trigger Worker — re-score a customer the moment their event lands.
 *
 * Reads the same 'events' queue as triggerWorker and metricsWorker. For every event it
 * asks one question: does any ACTIVE goal in this project have a window too short for
 * the nightly batch, and is this event the one that defines that goal's population? If
 * so, that customer's answer has just changed, and only that customer's.
 *
 * WHY IT EXISTS.
 *
 * Scoring is a nightly batch, which is right for a question whose answer plays out over
 * weeks. A cart's window is five hours. Measured on GoWelmart: half of every add that
 * ever converts has converted within 4.19 hours, and 56% inside the first hour. A score
 * written at midnight describes carts that opened and died before the job ran — the
 * model is good (global AUC 0.791, top-decile lift 1.63x) and every one of its answers
 * would arrive too late to act on.
 *
 * NOTHING HERE NAMES A GOAL OR AN EVENT.
 *
 *   which goals qualify   from the WINDOW: shorter than the batch's own period
 *   which events fire     from the goal's population signal, resolved through THIS
 *                         PROJECT'S vocabulary
 *
 * So a shop calling its add-to-cart `basket_touched` works untouched, and a goal built
 * next year with a two-hour horizon gets this path without anyone editing this file.
 * Cart is simply the first goal short enough to qualify.
 */

import { Worker } from 'bullmq'
import { Queue } from 'bullmq'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { predictionGoals } from '../db/schema.js'
import { and, eq } from 'drizzle-orm'
import { isEventDriven, triggerEventsFor } from '../services/predictionCadence.js'

const SCORE_QUEUE = 'score-customers'

type EventJob = {
  projectId: string
  customerId: string
  eventName: string
  properties?: Record<string, unknown>
  /** WHEN THE EVENT HAPPENED. Published by `eventProcessor` as an ISO string and
   *  simply not declared here, which is how the de-duplication key below came to be
   *  built from the clock instead. */
  timestamp?: string
}

export function startPredictionTriggerWorker(): Worker {
  const queue = new Queue(SCORE_QUEUE, { connection: redisConnection })

  // ITS OWN QUEUE, NOT THE SHARED ONE.
  //
  // This listened on `events` alongside `triggerWorker`, and BullMQ hands each job to
  // exactly one consumer — so the two split the stream and this one saw about half the
  // adds and removals. `publishEvent` fans out to both queues; each worker now gets
  // every event.
  const worker = new Worker(
    'prediction-events',
    async (job) => {
      const event = job.data as EventJob
      if (!event?.projectId || !event.customerId || !event.eventName) return

      // Historical and backfilled events describe activity that already resolved. The
      // flow trigger worker skips them for the same reason — replaying a year of orders
      // must not fire a year of live actions — and here they would queue one scoring job
      // per historical add, scoring the present against a cart from months ago.
      if ((event.properties as Record<string, unknown> | undefined)?.historical === true) return

      const goals = await db
        .select({
          id: predictionGoals.id,
          name: predictionGoals.name,
          projectId: predictionGoals.projectId,
          targetEvent: predictionGoals.targetEvent,
          predictionWindowDays: predictionGoals.predictionWindowDays,
        })
        .from(predictionGoals)
        .where(and(
          eq(predictionGoals.projectId, event.projectId),
          eq(predictionGoals.status, 'active'),
        ))

      for (const goal of goals) {
        if (!isEventDriven(goal.predictionWindowDays)) continue

        const triggers = await triggerEventsFor(event.projectId, goal.targetEvent)
        if (!triggers.includes(event.eventName)) continue

        // AN EVENT OLDER THAN THE WINDOW CANNOT OPEN A LIVE OCCASION.
        //
        // The `historical` flag above is the same idea and depends on a publisher
        // remembering to set it; nothing does. So an import behaves like a stampede:
        // 71,000 backdated events queued 7,091 scoring jobs, every one of them asking
        // "is this three-week-old cart still open" — and a shopper adding to their
        // basket right now waited behind 6,448 of them.
        //
        // The event's own age answers it without anyone declaring anything. A cart from
        // last month is closed whatever the payload says, and scoring it tells us what
        // we already know. Derived from the goal's window, so a goal with a different
        // horizon draws its own line.
        const windowMs = Number(goal.predictionWindowDays) * 86_400_000
        const age = Date.now() - new Date(event.timestamp ?? Date.now()).getTime()
        if (age > windowMs) continue

        await queue.add(SCORE_QUEUE, {
          projectId: event.projectId,
          goalId: goal.id,
          customerIds: [event.customerId],
        }, {
          // One job per (goal, customer, EVENT-second). A burst of adds from the same
          // person in the same second is one shopping action and one answer; BullMQ
          // drops the duplicates on the id. Deliberately not coarser: two adds minutes
          // apart are two states of the cart, and the later one is the one worth acting
          // on.
          //
          // KEYED ON THE EVENT'S OWN CLOCK, NOT THIS PROCESS'S.
          //
          // `Date.now()` is when the WORKER happened to run, which is the same thing
          // only while the queue is current. Behind a backlog it is not: draining
          // 105,000 seeded events, the worker handled thousands per second, so two adds
          // five minutes apart landed in one wall-clock second, collapsed onto one id,
          // and the later cart state was dropped — the basket on screen stayed at
          // Rs23,293 while the shop showed Rs4,596. The event's timestamp says when the
          // shopper acted and is identical on every replay, so the same two adds are
          // always two jobs however far behind this worker is.
          jobId: `score-ev-${goal.id}-${event.customerId}-`
               + `${Math.floor(new Date(event.timestamp ?? Date.now()).getTime() / 1000)}`,
          removeOnComplete: 500,
          removeOnFail: 100,
          // RETRY, BECAUSE THIS PATH HAS NO SECOND CHANCE.
          //
          // The nightly sweep enqueues with the same policy, but a goal it drops is
          // picked up by tomorrow's run. A goal scored HERE is event-driven precisely
          // because a daily pass is too slow for it, so nothing comes along behind to
          // notice the miss: one failed job is one customer silently never scored for
          // the whole occasion. Losing it is permanent in a way the batch's is not.
          //
          // Kept identical to the sweep's policy rather than tuned separately — same
          // queue, same worker, same failure modes. Worth knowing if a goal is ever
          // given a window SHORTER than this ladder (~8 minutes): the last retries
          // would then land after the occasion they describe has already closed, and
          // the scoring worker's own age check discards them. Harmless, but it means
          // very short windows get fewer effective attempts than the number here says.
          attempts: 5,
          backoff: { type: 'exponential' as const, delay: 30_000 },
        })

        console.log(`[prediction-trigger] ${goal.name}: ${event.eventName} from `
          + `${event.customerId} — window ${goal.predictionWindowDays}d, scoring now`)

        // AND AN ALARM FOR THE MOMENT THIS CART GOES COLD.
        //
        // A cart opening is an event. A cart EXPIRING is not: the shopper does nothing
        // at all, so nothing arrives to say the window has passed, and the row would
        // sit in the live worklist reading "live" long after it was over — chasing
        // people about baskets they abandoned last week is how a recovery channel gets
        // ignored.
        //
        // Previously a sweep every few minutes asked every project "has anyone expired
        // yet?", which is a poll for a question that has an exact answer: the cart
        // opened, the window is known, so the moment is known. Scheduling one wake-up
        // per live cart does the same job with work proportional to LIVE CARTS rather
        // than to elapsed time — nothing at all runs when no cart is open, instead of
        // scanning every project on a timer to find nobody.
        //
        // The id carries the customer but not the time, so each new cart action
        // REPLACES the pending alarm rather than adding one: the window is rolling, and
        // an add at 3:30 moves the deadline that an add at 2:00 set. BullMQ keeps the
        // first job of a given id, so the old one is removed before the new is added.
        const expiresInMs = Number(goal.predictionWindowDays) * 86_400_000
        if (Number.isFinite(expiresInMs) && expiresInMs > 0) {
          const alarmId = `expire-${goal.id}-${event.customerId}`
          await queue.remove(alarmId).catch(() => {})
          await queue.add('score-customers', {
            projectId: goal.projectId,
            goalId: goal.id,
            customerIds: [event.customerId],
            reason: 'window-expired',
          }, {
            jobId: alarmId,
            // A minute past the deadline, so the recalculation happens on the far side
            // of the boundary rather than exactly on it.
            delay: expiresInMs + 60_000,
            removeOnComplete: 200,
            removeOnFail: 50,
            // The alarm needs retries more than the scoring above does. Nothing else
            // will ever fire for this occasion — the shopper does nothing, that is the
            // whole point of it — so if the alarm is lost the row stays in the live
            // worklist reading "live" for ever, which is the exact failure the alarm
            // exists to prevent.
            attempts: 5,
            backoff: { type: 'exponential' as const, delay: 30_000 },
          })
        }
      }
    },
    { connection: redisConnection, concurrency: 5 },
  )

  worker.on('failed', (job, err) => {
    console.error(`[prediction-trigger] job ${job?.id} failed:`, err?.message)
  })

  return worker
}
