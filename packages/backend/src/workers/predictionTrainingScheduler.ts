/**
 * Prediction Training Scheduler.
 *
 * Enqueues a fresh training job for every prediction goal once a day — including
 * goals stuck on insufficient_data, in case data has caught up. Without this,
 * goals are only trained when somebody presses the button and otherwise stay frozen.
 *
 * The scheduler does not skip "active" goals: training is cheap relative to the value
 * of detecting drift, and the alternative (training only stale goals) makes drift
 * invisible.
 *
 * WHY A CLOCK TIME AND NOT AN INTERVAL.
 *
 * This used to be `setInterval(sweep, 24h)`, which counts from process start. Every
 * restart reset the countdown, so on a box that redeploys daily the sweep NEVER FIRED —
 * silently, with no error and no log line to notice. Models went stale and the only
 * symptom was a training date that quietly stopped moving.
 *
 * A time of day cannot drift that way: 21:30 is 21:30 however many times the process
 * restarted. The poll-every-minute-and-compare shape is the one `flowFixedTimeScheduler`
 * already uses for scheduled flows, reused here rather than inventing a second way to
 * say "daily" in the same codebase.
 *
 * WHY THE LAST-SWEEP KEY EXISTS.
 *
 * A bare clock check trades one silent miss for another: if the process is down at
 * exactly 21:30 the day is skipped, again with nothing to see. Redis remembers the date
 * of the last sweep, which buys two things — the sweep runs at most once a day however
 * often the minute is polled or the process restarts, and a box that was down at 21:30
 * and comes up at 23:00 still runs that day's sweep instead of losing it.
 *
 * If the ML service is unreachable, the training worker no-ops cheaply (it short-circuits
 * on checkMlHealth before doing any DB work), so a dead ML service doesn't build a queue.
 */

import { Queue } from 'bullmq'
import { redisConnection, redis } from '../services/redis.js'
import { db } from '../db/connection.js'
import { predictionGoals } from '../db/schema.js'

const TRAIN_QUEUE = 'train-model'

/**
 * 21:30 UTC is 03:00 in India — the quiet hours of the shops on this platform.
 *
 * Stated in UTC because that is what every other schedule in Storees compares against
 * (see `flowFixedTimeScheduler`), and a scheduler that silently meant something else
 * would be worse than one that asks you to do the arithmetic once, here.
 */
const DEFAULT_RETRAIN_AT_UTC = '21:30'

/** Same minute-resolution poll `flowFixedTimeScheduler` uses. */
const POLL_MS = 60_000

/** Holds a YYYY-MM-DD (UTC). Survives restarts; that is the whole point of it. */
const SWEEP_KEY = 'prediction:last-retrain-sweep'

/**
 * A sweep this far behind runs at once rather than waiting for the next 21:30.
 *
 * Covers the long outage: down across 21:30 and still down the following morning, the
 * clock rule alone would wait until tonight and leave a two-day hole. Two days is the
 * smallest gap that cannot be explained by an ordinary restart.
 */
const OVERDUE_DAYS = 2

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIso}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY
  return Math.round((b - a) / 86_400_000)
}

/** "21:30" -> {hh:21, mm:30}. Returns null for anything it cannot read. */
function parseAtUtc(raw: string): { hh: number, mm: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return { hh, mm }
}

async function enqueueAllRetrains(queue: Queue) {
  const goals = await db
    .select({ id: predictionGoals.id, projectId: predictionGoals.projectId })
    .from(predictionGoals)

  if (goals.length === 0) {
    console.log('[prediction-training-scheduler] No prediction goals — nothing to retrain')
    return
  }

  for (const g of goals) {
    await queue.add('train-model', {
      projectId: g.projectId,
      goalId: g.id,
    }, {
      jobId: `retrain-scheduled-${g.id}-${Date.now()}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    })
  }

  console.log(`[prediction-training-scheduler] Enqueued ${goals.length} retrain jobs`)
}

/**
 * Due when we have not swept today AND either the clock has passed the target, or the
 * last sweep is old enough that waiting for tonight would leave a hole.
 *
 * Reads Redis rather than trusting a variable in this process: two backend instances
 * sharing one Redis then sweep once between them instead of once each.
 *
 * Exported so the decision can be exercised directly: it returns a boolean and enqueues
 * nothing, which is the only way to test the schedule on a machine whose worker would
 * otherwise pick the jobs up and start training for real.
 */
export async function sweepIsDue(now: Date, at: { hh: number, mm: number }): Promise<boolean> {
  const today = utcDate(now)

  let last: string | null = null
  try {
    last = await redis.get(SWEEP_KEY)
  } catch (err) {
    // A Redis that cannot answer must not become a reason to retrain every minute.
    console.error('[prediction-training-scheduler] Could not read last-sweep marker:', err)
    return false
  }

  if (last === today) return false

  if (last && daysBetween(last, today) >= OVERDUE_DAYS) {
    console.log(`[prediction-training-scheduler] Last sweep was ${last} — overdue, sweeping now`)
    return true
  }

  const pastTarget =
    now.getUTCHours() > at.hh ||
    (now.getUTCHours() === at.hh && now.getUTCMinutes() >= at.mm)

  return pastTarget
}

export function startPredictionTrainingScheduler() {
  const rawAt = process.env.RETRAIN_AT_UTC
  const legacyInterval = process.env.RETRAIN_INTERVAL_HOURS

  // OFF, two ways. `RETRAIN_AT_UTC=off` is the current spelling; `RETRAIN_INTERVAL_HOURS=0`
  // is the one that used to mean it and is still set in existing .env files — honoured so
  // that upgrading this file does not quietly switch daily training ON for anybody who had
  // deliberately turned it off.
  const offByNew = rawAt !== undefined && ['off', '0', 'none', 'false'].includes(rawAt.trim().toLowerCase())
  const offByLegacy = legacyInterval !== undefined && legacyInterval.trim() !== '' && Number(legacyInterval) === 0

  if (offByNew || offByLegacy) {
    const which = offByNew ? 'RETRAIN_AT_UTC' : 'RETRAIN_INTERVAL_HOURS=0'
    console.log(`[scheduler] Prediction-training retrain is OFF (${which}). `
      + 'Models train only when someone asks.')
    return { queue: null, timer: null }
  }

  const at = parseAtUtc(rawAt && rawAt.trim() !== '' ? rawAt : DEFAULT_RETRAIN_AT_UTC)
  if (!at) {
    console.error(`[scheduler] RETRAIN_AT_UTC="${rawAt}" is not HH:MM — retrain scheduler NOT started. `
      + `Use 24-hour UTC, e.g. ${DEFAULT_RETRAIN_AT_UTC}, or "off".`)
    return { queue: null, timer: null }
  }

  const queue = new Queue(TRAIN_QUEUE, { connection: redisConnection })

  const timer = setInterval(() => {
    const now = new Date()
    sweepIsDue(now, at)
      .then(async due => {
        if (!due) return
        // Claim the day BEFORE the work, so a sweep that takes minutes cannot be started
        // a second time by the next poll, and a crash mid-sweep does not re-enqueue every
        // goal on the following minute.
        await redis.set(SWEEP_KEY, utcDate(now))
        await enqueueAllRetrains(queue)
      })
      .catch(err => {
        console.error('[prediction-training-scheduler] Scheduled retrain failed:', err)
      })
  }, POLL_MS)
  timer.unref()

  const hh = String(at.hh).padStart(2, '0')
  const mm = String(at.mm).padStart(2, '0')
  console.log(`[scheduler] Prediction-training retrain daily at ${hh}:${mm} UTC`)
  return { queue, timer }
}
