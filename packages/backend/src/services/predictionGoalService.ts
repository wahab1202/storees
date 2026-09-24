import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { predictionGoals, predictionScores, segments, events } from '../db/schema.js'

/**
 * The two AUCs, plus how many people the model actually covers.
 *
 * A single AUC over the whole base is FLATTERED on any goal with a large dormant
 * population: separating "never buys" from "buys" is easy, and it inflates the score
 * without the model being better at the question anyone cares about. Purchase reads
 * 0.96 globally and 0.77 among customers who actually shop — same model, same run.
 *
 * Both are stored (`auc` and `segment_metrics[0].auc` on the training run), so both
 * are surfaced rather than the caller picking one and the other going unseen.
 *
 * `usersScored` is the goal's own population — a cart model scores only people with
 * a cart — and `totalUsers` is the project's whole base. Showing scored without total
 * makes 705 look like a failure rather than 705 of the 16,165 who qualify.
 */
type GoalMetrics = {
  globalAuc: number | null
  activeAuc: number | null
  lift: number | null
  usersScored: number
  totalUsers: number
}

async function metricsFor(projectId: string, goalIds: string[]): Promise<Map<string, GoalMetrics>> {
  const out = new Map<string, GoalMetrics>()
  if (goalIds.length === 0) return out

  // One query for the whole page rather than one per card. DISTINCT ON keeps the
  // newest successful run per goal; a failed run must not blank a good number.
  const runs = await db.execute<{
    goal_id: string; auc: string | null; lift: string | null; active_auc: string | null
  }>(sql`
    SELECT DISTINCT ON (goal_id)
           goal_id, auc, lift,
           -- The active-population AUC, found BY NAME rather than by position.
           -- This read segment_metrics -> 0, which is right only while the active
           -- entry happens to be first. The array also carries region and dealer
           -- breakdowns, so the day a dealer sorts ahead of it the headline number on
           -- every card silently becomes one dealer's score.
           (SELECT s ->> 'auc'
              FROM jsonb_array_elements(segment_metrics) AS s
             WHERE s ->> 'segmentValue' = 'active'
                OR s ->> 'segment_value' = 'active'
             LIMIT 1) AS active_auc
      FROM prediction_training_runs
     WHERE project_id = ${projectId} AND status = 'success'
     ORDER BY goal_id, trained_at DESC
  `)

  const scored = await db.execute<{ goal_id: string; n: string }>(sql`
    SELECT goal_id, count(*)::text AS n
      FROM prediction_scores
     WHERE project_id = ${projectId}
     GROUP BY goal_id
  `)

  const [{ n: totalUsers } = { n: '0' }] = (await db.execute<{ n: string }>(sql`
    SELECT count(*)::text AS n FROM customers WHERE project_id = ${projectId}
  `)).rows

  const runRows = runs.rows ?? []
  const scoredRows = scored.rows ?? []
  const num = (v: string | null) => (v == null || v === '' ? null : Number(v))

  for (const id of goalIds) {
    const r = runRows.find(x => x.goal_id === id)
    const s = scoredRows.find(x => x.goal_id === id)
    out.set(id, {
      globalAuc: num(r?.auc ?? null),
      activeAuc: num(r?.active_auc ?? null),
      lift: num(r?.lift ?? null),
      usersScored: Number(s?.n ?? 0),
      totalUsers: Number(totalUsers ?? 0),
    })
  }
  return out
}

export async function createPredictionGoal(
  projectId: string,
  data: {
    name: string
    targetEvent: string
    observationWindowDays?: number
    predictionWindowDays?: number
    /** Honour the two windows above instead of deriving them. Opt-in, per goal. */
    windowsPinned?: boolean
    minPositiveLabels?: number
    origin?: 'pack' | 'user'
  },
) {
  const [goal] = await db.insert(predictionGoals).values({
    projectId,
    name: data.name,
    targetEvent: data.targetEvent,
    observationWindowDays: data.observationWindowDays ?? 90,
    predictionWindowDays: data.predictionWindowDays ?? 14,
    // Packs never pin. A pack's numbers are an industry starting point, and treating
    // them as a deliberate choice would switch the search off for every project that
    // ever onboarded — the opposite of the default.
    windowsPinned: data.origin === 'pack' ? false : (data.windowsPinned ?? false),
    minPositiveLabels: data.minPositiveLabels ?? 200,
    origin: data.origin ?? 'user',
    status: 'active',
  }).returning()

  // A NEW GOAL IS NOT TRAINED UNTIL SOMEBODY ASKS.
  //
  // This used to queue training the moment the row existed. At onboarding that is before
  // any of the shop's data has arrived — `activatePack` runs, and only then does the
  // historical sync start — so every goal a new customer got was trained against an empty
  // database, correctly reported "not enough history", and then sat failed until the
  // 24-hour scheduler came round. A shop connecting at 9am saw five broken-looking cards
  // for the rest of the day.
  //
  // Training a model is minutes to an hour of work whose result depends entirely on data
  // that may not be there yet, so it is a decision, not a side effect of creating a row.
  // The card shows "not trained yet" and offers Re-train; the person presses it when the
  // data is in. Same rule for a goal created by hand — no goal trains without a click.
  console.log(`[prediction-goal] Created "${goal.name}" — not trained yet, awaiting a `
    + `manual Re-train`)

  return goal
}

export async function listPredictionGoals(projectId: string) {
  const goals = await db
    .select()
    .from(predictionGoals)
    .where(eq(predictionGoals.projectId, projectId))
    .orderBy(predictionGoals.createdAt)

  const metrics = await metricsFor(projectId, goals.map(g => g.id))
  return goals.map(g => ({ ...g, ...(metrics.get(g.id) ?? {}) }))
}

export async function getPredictionGoal(projectId: string, goalId: string) {
  const [goal] = await db
    .select()
    .from(predictionGoals)
    .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))
    .limit(1)

  if (!goal) return null
  const metrics = await metricsFor(projectId, [goal.id])
  return { ...goal, ...(metrics.get(goal.id) ?? {}) }
}

export async function updatePredictionGoalStatus(
  goalId: string,
  status: 'active' | 'paused' | 'insufficient_data',
) {
  const [updated] = await db
    .update(predictionGoals)
    .set({ status, updatedAt: new Date() })
    .where(eq(predictionGoals.id, goalId))
    .returning()

  return updated ?? null
}

/** The goal meanings the pipeline implements. Mirrors `shared/windows.py:GOALS`. */
const BUILT_IN_GOALS = new Set([
  'purchase', 'repeat_purchase', 'churn', 'dormancy', 'cart_abandoned',
])

/**
 * Can this project answer a goal aimed at `target`?
 *
 * A built-in meaning always can. Anything else has to be an event the project has
 * actually recorded — a goal asked about an event that has never arrived has no
 * positive labels by construction, and says so only after a training run.
 */
export async function goalTargetIsKnown(projectId: string, target: string): Promise<boolean> {
  if (BUILT_IN_GOALS.has(target)) return true
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.eventName, target)))
    .limit(1)
  return Number(row?.n ?? 0) > 0
}

/** Segments whose filter reads this goal's score — they lose a condition if it goes. */
export async function segmentsUsingGoal(projectId: string, goalId: string): Promise<string[]> {
  const rows = await db
    .select({ name: segments.name, filters: segments.filters })
    .from(segments)
    .where(eq(segments.projectId, projectId))

  // The segment builder namespaces these fields `prediction:<goalId>:bucket|score`
  // (see `predictionFieldDefs`), so the goal id appears verbatim in the filter JSON.
  return rows
    .filter(r => JSON.stringify(r.filters ?? {}).includes(`prediction:${goalId}:`))
    .map(r => r.name)
}

export async function deletePredictionGoal(projectId: string, goalId: string) {
  // THE SCORES GO FIRST, IN THE SAME TRANSACTION.
  //
  // `prediction_scores.goal_id` is the one child reference declared WITHOUT
  // `onDelete: cascade` — `prediction_training_runs` and `prediction_model_versions`
  // both have it. So a goal that had ever been scored could not be deleted at all:
  //
  //   ERROR: update or delete on table "prediction_goals" violates foreign key
  //   constraint "prediction_scores_goal_id_prediction_goals_id_fk"
  //
  // In practice that meant only a goal that never trained could be removed, which is
  // backwards — the ones worth deleting are exactly the ones that have run. Clearing
  // them here rather than changing the constraint keeps this a code change; the
  // constraint is still the better long-term home for it.
  //
  // One transaction, so a failure between the two statements cannot leave a goal
  // stripped of its scores but still listed.
  return await db.transaction(async tx => {
    const [found] = await tx
      .select({ id: predictionGoals.id })
      .from(predictionGoals)
      .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))

    if (!found) return false

    await tx.delete(predictionScores).where(eq(predictionScores.goalId, goalId))

    const [deleted] = await tx
      .delete(predictionGoals)
      .where(and(eq(predictionGoals.id, goalId), eq(predictionGoals.projectId, projectId)))
      .returning({ id: predictionGoals.id })

    return !!deleted
  })
}
