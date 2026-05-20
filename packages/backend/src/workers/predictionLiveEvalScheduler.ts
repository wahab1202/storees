/**
 * Live-label AUC re-evaluation.
 *
 * Train-time AUC measures how well the model would have predicted the
 * past. Live-label AUC measures how well it predicted the actual future:
 *
 *   1. Take prediction_scores produced N days ago (where N >= predictionWindow,
 *      so the future has played out for them).
 *   2. For each scored customer, did the target event actually happen in the
 *      prediction window after their score was computed? → ground truth label.
 *   3. AUC of the original score vs ground truth = "live AUC".
 *
 * Drift signal: if training-time AUC stays good but live AUC falls, the
 * model is degrading against the real world.
 *
 * Stores results as rows in prediction_training_runs with status='live_eval'.
 * No schema migration needed — reuses the existing columns. The trend
 * sparkline ignores them (filters status='success'); a future UI overlay
 * can plot them alongside.
 */

import { db } from '../db/connection.js'
import {
  predictionGoals,
  predictionScores,
  predictionTrainingRuns,
  events,
} from '../db/schema.js'
import { eq, and, gte, lt, inArray } from 'drizzle-orm'

const DEFAULT_LIVE_EVAL_INTERVAL_HOURS = 24

/** Mann-Whitney U formulation of AUC — O(n log n), zero deps. */
function computeAuc(scores: number[], labels: number[]): number | null {
  if (scores.length !== labels.length || scores.length === 0) return null
  const nPositive = labels.reduce((s, l) => s + l, 0)
  const nNegative = labels.length - nPositive
  if (nPositive === 0 || nNegative === 0) return null  // AUC undefined

  // Pair, sort by score ascending, assign average ranks for ties
  const paired = scores.map((s, i) => ({ s, l: labels[i] }))
  paired.sort((a, b) => a.s - b.s)

  let rankSumPositives = 0
  let i = 0
  while (i < paired.length) {
    let j = i
    while (j + 1 < paired.length && paired[j + 1].s === paired[i].s) j++
    const avgRank = (i + j) / 2 + 1  // 1-indexed average rank for this tie group
    for (let k = i; k <= j; k++) {
      if (paired[k].l === 1) rankSumPositives += avgRank
    }
    i = j + 1
  }
  const u = rankSumPositives - (nPositive * (nPositive + 1)) / 2
  return u / (nPositive * nNegative)
}

async function liveEvalOneGoal(goal: {
  id: string
  projectId: string
  targetEvent: string
  predictionWindowDays: number | null
}): Promise<void> {
  const pred = goal.predictionWindowDays ?? 14
  const now = Date.now()
  // Score window: [now - 2*pred, now - pred] — scored long enough ago that
  // their prediction window has fully played out.
  const windowEnd = new Date(now - pred * 24 * 60 * 60 * 1000)
  const windowStart = new Date(now - 2 * pred * 24 * 60 * 60 * 1000)

  const scoreRows = await db
    .select({
      customerId: predictionScores.customerId,
      score: predictionScores.score,
      computedAt: predictionScores.computedAt,
    })
    .from(predictionScores)
    .where(
      and(
        eq(predictionScores.goalId, goal.id),
        eq(predictionScores.projectId, goal.projectId),
        gte(predictionScores.computedAt, windowStart),
        lt(predictionScores.computedAt, windowEnd),
      ),
    )

  if (scoreRows.length < 200) {
    // Same min_positive bar as training — below this AUC isn't meaningful
    await db.insert(predictionTrainingRuns).values({
      projectId: goal.projectId,
      goalId: goal.id,
      status: 'live_eval',
      reason: `Skipped: only ${scoreRows.length} scored customers in window`,
    })
    return
  }

  // Per scored customer: did the target event happen between their score
  // time and (score + pred) days? Single batched query keyed on customer.
  const customerIds = scoreRows.map(r => r.customerId)
  const eventRows = await db
    .select({
      customerId: events.customerId,
      timestamp: events.timestamp,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, goal.projectId),
        eq(events.eventName, goal.targetEvent),
        inArray(events.customerId, customerIds),
        gte(events.timestamp, windowStart),
      ),
    )

  // Build a map: customerId -> earliest event timestamp in or after their score window
  const eventsByCustomer = new Map<string, Date[]>()
  for (const e of eventRows) {
    if (!e.customerId) continue
    const arr = eventsByCustomer.get(e.customerId) ?? []
    arr.push(e.timestamp)
    eventsByCustomer.set(e.customerId, arr)
  }

  const scores: number[] = []
  const labels: number[] = []
  for (const row of scoreRows) {
    const scoreNum = Number(row.score)
    if (!Number.isFinite(scoreNum)) continue
    const customerEvents = eventsByCustomer.get(row.customerId) ?? []
    const windowEndForRow = new Date(row.computedAt.getTime() + pred * 24 * 60 * 60 * 1000)
    const positive = customerEvents.some(t => t >= row.computedAt && t <= windowEndForRow)
    scores.push(scoreNum)
    labels.push(positive ? 1 : 0)
  }

  const auc = computeAuc(scores, labels)
  const nPositive = labels.filter(l => l === 1).length

  await db.insert(predictionTrainingRuns).values({
    projectId: goal.projectId,
    goalId: goal.id,
    status: 'live_eval',
    auc: auc != null ? String(auc) : null,
    nPositive,
    reason: auc == null
      ? `AUC undefined (all labels one class — ${nPositive} positives, ${labels.length - nPositive} negatives)`
      : null,
  })

  console.log(
    `[live-eval] goal=${goal.id} scored=${scoreRows.length} positives=${nPositive} ` +
    `liveAuc=${auc != null ? auc.toFixed(4) : 'n/a'}`,
  )
}

async function runLiveEvalAll(): Promise<void> {
  const goals = await db
    .select({
      id: predictionGoals.id,
      projectId: predictionGoals.projectId,
      targetEvent: predictionGoals.targetEvent,
      predictionWindowDays: predictionGoals.predictionWindowDays,
    })
    .from(predictionGoals)
    .where(eq(predictionGoals.status, 'active'))

  if (goals.length === 0) {
    console.log('[live-eval-scheduler] No active goals — nothing to evaluate')
    return
  }

  for (const g of goals) {
    try {
      await liveEvalOneGoal(g)
    } catch (err) {
      console.error(`[live-eval-scheduler] Failed for goal ${g.id}:`, err)
    }
  }
}

export function startLiveEvalScheduler() {
  const intervalHours = Number(process.env.LIVE_EVAL_INTERVAL_HOURS) || DEFAULT_LIVE_EVAL_INTERVAL_HOURS

  // Don't run on boot (avoid pod-restart thundering herd); first fire after interval.
  const timer = setInterval(() => {
    runLiveEvalAll().catch(err => {
      console.error('[live-eval-scheduler] Scheduled live eval failed:', err)
    })
  }, intervalHours * 60 * 60 * 1000)
  timer.unref()

  console.log(`[scheduler] Live-eval interval: ${intervalHours}h`)
  return { timer }
}

// Exported for testing + manual runs (admin endpoint can call this directly).
export const liveEvalInternals = { liveEvalOneGoal, computeAuc, runLiveEvalAll }
