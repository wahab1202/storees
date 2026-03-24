import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import {
  computeFunnel,
  computeCohorts,
  getDistinctEventNames,
} from '../services/analyticsService.js'

const router = Router()

// POST /api/analytics/funnel?projectId=...
// Body: { steps: [{ eventName, label? }], startDate?, endDate?, segmentId? }
router.post('/funnel', requireProjectId, async (req, res) => {
  try {
    const { steps, startDate, endDate, segmentId } = req.body

    if (!Array.isArray(steps) || steps.length < 2) {
      return res.status(400).json({ success: false, error: 'At least 2 funnel steps required' })
    }

    const result = await computeFunnel(req.projectId!, steps, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      segmentId,
    })

    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Funnel computation error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute funnel' })
  }
})

// GET /api/analytics/cohorts?projectId=...&granularity=week&periods=8&returnEvent=...
router.get('/cohorts', requireProjectId, async (req, res) => {
  try {
    const result = await computeCohorts(req.projectId!, {
      granularity: (req.query.granularity as 'week' | 'month') ?? 'week',
      periods: req.query.periods ? Number(req.query.periods) : 8,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      returnEvent: req.query.returnEvent as string | undefined,
    })

    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Cohort computation error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute cohorts' })
  }
})

// GET /api/analytics/event-names?projectId=...
router.get('/event-names', requireProjectId, async (req, res) => {
  try {
    const names = await getDistinctEventNames(req.projectId!)
    res.json({ success: true, data: names })
  } catch (err) {
    console.error('Event names error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch event names' })
  }
})

export default router
