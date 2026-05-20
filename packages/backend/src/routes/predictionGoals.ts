import { Router } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { predictionTrainingRuns } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import {
  createPredictionGoal,
  listPredictionGoals,
  getPredictionGoal,
  updatePredictionGoalStatus,
  deletePredictionGoal,
} from '../services/predictionGoalService.js'
import { enqueueTrainingJob } from '../workers/trainingWorker.js'
import { checkMlHealth } from '../services/mlProxyService.js'

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
    const { name, targetEvent, observationWindowDays, predictionWindowDays, minPositiveLabels } = req.body

    if (!name || !targetEvent) {
      return res.status(400).json({ success: false, error: 'name and targetEvent are required' })
    }

    const goal = await createPredictionGoal(req.projectId!, {
      name,
      targetEvent,
      observationWindowDays,
      predictionWindowDays,
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
