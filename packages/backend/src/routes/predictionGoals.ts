import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import {
  createPredictionGoal,
  listPredictionGoals,
  getPredictionGoal,
  updatePredictionGoalStatus,
  deletePredictionGoal,
} from '../services/predictionGoalService.js'

const router = Router()

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
