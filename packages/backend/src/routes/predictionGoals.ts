import { Router } from 'express'
import { eq, and, desc, gt } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { predictionTrainingRuns, predictionModelVersions, predictionGoals } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import {
  createPredictionGoal,
  listPredictionGoals,
  getPredictionGoal,
  updatePredictionGoalStatus,
  deletePredictionGoal,
} from '../services/predictionGoalService.js'
import { enqueueTrainingJob, TRAINING_STALE_MS } from '../workers/trainingWorker.js'

/** How far back the screen looks for a training outcome to report. Long enough to
 *  still be there when someone walks away and comes back; short enough that a
 *  failure from last week is history, not news. */
const RECENT_RUN_MS = 6 * 60 * 60_000

import { checkMlHealth, promoteModelVersion } from '../services/mlProxyService.js'

const router = Router()

// GET /api/prediction-goals/_ml-health?projectId=...
// Cheap probe for the Predictions UI — shows a banner if the ML service is
// down, so users understand why a Re-train click won't change anything.
// Note: ordered BEFORE /:id so 'm_ml-health' isn't treated as a goal id.
router.get('/_ml-health', requireProjectId, async (_req, res) => {
  const ok = await checkMlHealth()
  res.json({ success: true, data: { mlServiceUp: ok } })
})

// POST /api/prediction-goals/_retrain-all?projectId=...
/** Which goals are training right now.
 *
 *  Training is minutes of work behind a button that returns in milliseconds — the
 *  request only queues a job. Without something to poll, the page is identical before
 *  and after a click: no spinner, no error, nothing moving until the numbers change
 *  some minutes later. The natural reading is "it didn't work", and the natural
 *  response is to click again.
 *
 *  Mirrors the Event Mapping replay-status endpoint, and for the same reason.
 */
router.get('/_training-status', requireProjectId, async (req, res) => {
  try {
    const rows = await db
      .select({ id: predictionGoals.id, name: predictionGoals.name,
                updatedAt: predictionGoals.updatedAt })
      .from(predictionGoals)
      .where(and(
        eq(predictionGoals.projectId, req.projectId!),
        eq(predictionGoals.status, 'training'),
      ))

    // A worker killed mid-run cannot clear its own status, so anything older than the
    // stale window is reported as finished. A spinner that never stops is worse than
    // no spinner: it claims work is happening when nothing is.
    const cutoff = Date.now() - TRAINING_STALE_MS
    const running = rows.filter(r => (r.updatedAt?.getTime() ?? 0) > cutoff)

    // WHAT HAPPENED THE LAST TIME SOMEBODY PRESSED THE BUTTON.
    //
    // A failed training puts the goal back to `active` — anything else would take its
    // existing model out of scoring. That is right for the pipeline and useless for the
    // person who just clicked: the card would go back to exactly how it looked before,
    // and nothing on the screen would say the attempt died. The attempt is recorded, so
    // read it back and let the page say so.
    const since = new Date(Date.now() - RECENT_RUN_MS)
    const recent = await db
      .select({ goalId: predictionTrainingRuns.goalId, name: predictionGoals.name,
                status: predictionTrainingRuns.status, reason: predictionTrainingRuns.reason,
                at: predictionTrainingRuns.trainedAt })
      .from(predictionTrainingRuns)
      .innerJoin(predictionGoals, eq(predictionGoals.id, predictionTrainingRuns.goalId))
      .where(and(
        eq(predictionTrainingRuns.projectId, req.projectId!),
        gt(predictionTrainingRuns.trainedAt, since),
      ))
      .orderBy(desc(predictionTrainingRuns.trainedAt))

    // One entry per goal — its most recent attempt only. An older failure that has since
    // been retrained successfully must not keep reporting itself.
    const latest = new Map<string, typeof recent[number]>()
    for (const r of recent) if (!latest.has(r.goalId)) latest.set(r.goalId, r)
    const failures = [...latest.values()]
      .filter(r => r.status === 'failed' || r.status === 'error')
      .map(r => ({ goalId: r.goalId, name: r.name, reason: r.reason ?? 'Training did not complete.' }))

    res.json({ success: true, data: {
      running: running.length > 0,
      goals: running.map(r => ({ id: r.id, name: r.name })),
      failures,
    } })
  } catch (err) {
    console.error('Training status error:', err)
    res.status(500).json({ success: false, error: 'Failed to read training status' })
  }
})

// Re-enqueue training for every goal on this project. Used by the
// "Re-train all" button or after a major data backfill, so goals stuck on
// insufficient_data get a fresh shot once data lands.
router.post('/_retrain-all', requireProjectId, async (req, res) => {
  try {
    const goals = await listPredictionGoals(req.projectId!)
    let enqueued = 0
    for (const g of goals) {
      try {
        await enqueueTrainingJob(req.projectId!, g.id)
        enqueued++
      } catch (err) {
        console.error(`[retrain-all] enqueue failed for ${g.id}:`, err)
      }
    }
    res.json({ success: true, data: { enqueued, total: goals.length } })
  } catch (err) {
    console.error('Prediction retrain-all error:', err)
    res.status(500).json({ success: false, error: 'Failed to enqueue retraining' })
  }
})

// GET /api/prediction-goals?projectId=...
router.get('/', requireProjectId, async (req, res) => {
  try {
    const goals = await listPredictionGoals(req.projectId!)
    res.json({ success: true, data: goals })
  } catch (err) {
    console.error('Prediction goals list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch prediction goals' })
  }
})

// GET /api/prediction-goals/:id?projectId=...
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const goal = await getPredictionGoal(req.projectId!, req.params.id as string)
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Prediction goal not found' })
    }
    res.json({ success: true, data: goal })
  } catch (err) {
    console.error('Prediction goal detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch prediction goal' })
  }
})

// POST /api/prediction-goals?projectId=...
// Body: { name, targetEvent, observationWindowDays?, predictionWindowDays?, minPositiveLabels? }
router.post('/', requireProjectId, async (req, res) => {
  try {
    const {
      name, targetEvent, observationWindowDays, predictionWindowDays,
      windowsPinned, minPositiveLabels,
    } = req.body

    if (!name || !targetEvent) {
      return res.status(400).json({ success: false, error: 'name and targetEvent are required' })
    }

    // Pinning without saying what to pin to is the one incoherent combination — the
    // pipeline would skip the search and then have nothing to skip it in favour of.
    if (windowsPinned && !(observationWindowDays > 0 && predictionWindowDays > 0)) {
      return res.status(400).json({
        success: false,
        error: 'Setting the windows yourself needs both an observation and a '
             + 'prediction window, in days.',
      })
    }

    // BOTH ARRIVE IN DAYS; ONLY ONE OF THEM CAN BE A FRACTION.
    //
    // `prediction_window_days` is double precision precisely so a window shorter than a
    // day is expressible — the cart goal derives to five hours, and a form that could
    // not send 0.2083 would leave the manual path unable to say what the automatic path
    // says every run. `observation_window_days` is an integer column: a fraction there
    // is silently truncated by the driver, so a request asking for half a day of history
    // would train on none and report it as a modelling failure. Rejected loudly instead.
    if (windowsPinned && !Number.isInteger(observationWindowDays)) {
      return res.status(400).json({
        success: false,
        error: 'The observation window must be a whole number of days.',
      })
    }

    const goal = await createPredictionGoal(req.projectId!, {
      name,
      targetEvent,
      observationWindowDays,
      predictionWindowDays,
      windowsPinned: Boolean(windowsPinned),
      minPositiveLabels,
    })

    res.status(201).json({ success: true, data: goal })
  } catch (err) {
    // 23505 = unique_violation; idx_prediction_goals_name enforces unique
    // (project_id, name). The wizard seeds default goals on pack activation,
    // so this fires when the user re-creates one with an existing name.
    if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A prediction goal with this name already exists for this project. Pick a different name or edit the existing goal.',
      })
    }
    console.error('Prediction goal create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create prediction goal' })
  }
})

// PATCH /api/prediction-goals/:id/status?projectId=...
// Body: { status: 'active' | 'paused' | 'insufficient_data' }
router.patch('/:id/status', requireProjectId, async (req, res) => {
  try {
    const goal = await getPredictionGoal(req.projectId!, req.params.id as string)
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Prediction goal not found' })
    }

    const { status } = req.body
    const validStatuses = ['active', 'paused', 'insufficient_data']
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${validStatuses.join(', ')}`,
      })
    }

    const updated = await updatePredictionGoalStatus(req.params.id as string, status)
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Prediction goal status update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update prediction goal status' })
  }
})

// GET /api/prediction-goals/:id/training-history?projectId=...
// Recent training attempts (most recent first). Drives the drift mini-chart
// on the Predictions page. Default limit 30 ≈ a month of daily runs.
router.get('/:id/training-history', requireProjectId, async (req, res) => {
  try {
    const goal = await getPredictionGoal(req.projectId!, req.params.id as string)
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Prediction goal not found' })
    }
    const limit = Math.min(Number(req.query.limit) || 30, 200)
    const rows = await db
      .select({
        id: predictionTrainingRuns.id,
        trainedAt: predictionTrainingRuns.trainedAt,
        status: predictionTrainingRuns.status,
        auc: predictionTrainingRuns.auc,
        baselineAuc: predictionTrainingRuns.baselineAuc,
        lift: predictionTrainingRuns.lift,
        nPositive: predictionTrainingRuns.nPositive,
        reason: predictionTrainingRuns.reason,
        durationMs: predictionTrainingRuns.durationMs,
        segmentMetrics: predictionTrainingRuns.segmentMetrics,
      })
      .from(predictionTrainingRuns)
      .where(
        and(
          eq(predictionTrainingRuns.goalId, goal.id),
          eq(predictionTrainingRuns.projectId, req.projectId!),
        ),
      )
      .orderBy(desc(predictionTrainingRuns.trainedAt))
      .limit(limit)

    res.json({
      success: true,
      data: rows.map(r => ({
        ...r,
        auc: r.auc != null ? Number(r.auc) : null,
        baselineAuc: r.baselineAuc != null ? Number(r.baselineAuc) : null,
        lift: r.lift != null ? Number(r.lift) : null,
      })),
    })
  } catch (err) {
    console.error('Prediction goal training-history error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch training history' })
  }
})

// GET /api/prediction-goals/:id/versions?projectId=...
// Lists all model versions trained for this goal, latest first, with the
// active one flagged. Powers the version-history UI.
router.get('/:id/versions', requireProjectId, async (req, res) => {
  try {
    const goal = await getPredictionGoal(req.projectId!, req.params.id as string)
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Prediction goal not found' })
    }
    const rows = await db
      .select()
      .from(predictionModelVersions)
      .where(eq(predictionModelVersions.goalId, goal.id))
      .orderBy(desc(predictionModelVersions.trainedAt))
      .limit(50)

    res.json({
      success: true,
      data: rows.map(r => ({
        ...r,
        trainAuc: r.trainAuc != null ? Number(r.trainAuc) : null,
        baselineAuc: r.baselineAuc != null ? Number(r.baselineAuc) : null,
      })),
    })
  } catch (err) {
    console.error('Prediction goal versions error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch model versions' })
  }
})

// POST /api/prediction-goals/:id/versions/:versionId/promote?projectId=...
// Make a specific historical version the live model. Hits the ML service
// to swap the joblib files, then flips is_active in our DB. Useful for
// rollback when a newly-trained model regressed.
router.post('/:id/versions/:versionId/promote', requireProjectId, async (req, res) => {
  try {
    const goal = await getPredictionGoal(req.projectId!, req.params.id as string)
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Prediction goal not found' })
    }
    const [version] = await db
      .select()
      .from(predictionModelVersions)
      .where(
        and(
          eq(predictionModelVersions.id, req.params.versionId as string),
          eq(predictionModelVersions.goalId, goal.id),
        ),
      )
      .limit(1)
    if (!version) {
      return res.status(404).json({ success: false, error: 'Model version not found' })
    }
    if (version.isActive) {
      return res.json({ success: true, data: { alreadyActive: true } })
    }

    // 1. Tell the ML service to swap files
    try {
      await promoteModelVersion(goal.id, version.modelVersion)
    } catch (err) {
      return res.status(502).json({
        success: false,
        error: `ML service refused promote: ${err instanceof Error ? err.message : String(err)}`,
      })
    }

    // 2. Flip the active flag in our DB
    await db.transaction(async (tx) => {
      await tx
        .update(predictionModelVersions)
        .set({ isActive: false })
        .where(eq(predictionModelVersions.goalId, goal.id))
      await tx
        .update(predictionModelVersions)
        .set({ isActive: true, activatedAt: new Date() })
        .where(eq(predictionModelVersions.id, version.id))
      // Mirror the AUC into the goal so the card shows the right value.
      if (version.trainAuc != null) {
        await tx
          .update(predictionGoals)
          .set({ currentMetric: version.trainAuc, updatedAt: new Date() })
          .where(eq(predictionGoals.id, goal.id))
      }
    })

    res.json({ success: true, data: { promoted: true, modelVersion: version.modelVersion } })
  } catch (err) {
    console.error('Prediction goal promote error:', err)
    res.status(500).json({ success: false, error: 'Failed to promote model version' })
  }
})

// POST /api/prediction-goals/:id/retrain?projectId=...
// Re-enqueue training for a single goal. Status flips back to 'active' on
// success; stays insufficient_data if the model still can't find enough
// positive labels in the current data window.
router.post('/:id/retrain', requireProjectId, async (req, res) => {
  try {
    const goal = await getPredictionGoal(req.projectId!, req.params.id as string)
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Prediction goal not found' })
    }
    await enqueueTrainingJob(req.projectId!, goal.id)
    res.json({ success: true, data: { enqueued: true, goalId: goal.id } })
  } catch (err) {
    console.error('Prediction goal retrain error:', err)
    res.status(500).json({ success: false, error: 'Failed to enqueue retraining' })
  }
})

// DELETE /api/prediction-goals/:id?projectId=...
router.delete('/:id', requireProjectId, async (req, res) => {
  try {
    const deleted = await deletePredictionGoal(req.projectId!, req.params.id as string)
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Prediction goal not found' })
    }
    res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    console.error('Prediction goal delete error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete prediction goal' })
  }
})

export default router
