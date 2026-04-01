import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import {
  computeFunnel,
  computeCohorts,
  getDistinctEventNames,
  computeTimeSeries,
  computeTimeToEvent,
  computeProductAnalytics,
} from '../services/analyticsService.js'
import { db } from '../db/connection.js'
import { savedAnalyses } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import {
  createSegmentSnapshot,
  getSnapshotDates,
  computeTransitions,
  computeSegmentTrend,
} from '../services/transitionService.js'

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

// POST /api/analytics/timeseries?projectId=...
// Body: { metric, startDate, endDate, compareStartDate?, compareEndDate?, granularity, segmentIds? }
router.post('/timeseries', requireProjectId, async (req, res) => {
  try {
    const { metric, startDate, endDate, compareStartDate, compareEndDate, granularity, segmentIds } = req.body

    if (!metric || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'metric, startDate, and endDate are required' })
    }

    const result = await computeTimeSeries(req.projectId!, {
      metric,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      compareStartDate: compareStartDate ? new Date(compareStartDate) : undefined,
      compareEndDate: compareEndDate ? new Date(compareEndDate) : undefined,
      granularity: granularity ?? 'day',
      segmentIds,
    })

    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Time series error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute time series' })
  }
})

// POST /api/analytics/time-to-event?projectId=...
// Body: { startEvent, endEvent, startDate?, endDate?, breakdownBy? }
router.post('/time-to-event', requireProjectId, async (req, res) => {
  try {
    const { startEvent, endEvent, startDate, endDate, breakdownBy } = req.body

    if (!startEvent || !endEvent) {
      return res.status(400).json({ success: false, error: 'startEvent and endEvent are required' })
    }

    const result = await computeTimeToEvent(req.projectId!, {
      startEvent,
      endEvent,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      breakdownBy,
    })

    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Time-to-event error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute time-to-event' })
  }
})

// GET /api/analytics/products?projectId=...&sort=views&limit=50&startDate=...&endDate=...
router.get('/products', requireProjectId, async (req, res) => {
  try {
    const result = await computeProductAnalytics(req.projectId!, {
      sort: req.query.sort as 'views' | 'conversions' | 'revenue' | 'abandonment' | 'conversion_rate' | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    })

    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Product analytics error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute product analytics' })
  }
})

// ============ SAVED ANALYSES ============

// GET /api/analytics/saved?projectId=...&type=funnel
router.get('/saved', requireProjectId, async (req, res) => {
  try {
    const type = req.query.type as string | undefined
    const conditions = [eq(savedAnalyses.projectId, req.projectId!)]
    if (type) conditions.push(eq(savedAnalyses.type, type))

    const rows = await db
      .select()
      .from(savedAnalyses)
      .where(and(...conditions))
      .orderBy(desc(savedAnalyses.updatedAt))
      .limit(50)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Saved analyses error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch saved analyses' })
  }
})

// POST /api/analytics/saved?projectId=...
router.post('/saved', requireProjectId, async (req, res) => {
  try {
    const { name, type, config } = req.body
    if (!name || !type) {
      return res.status(400).json({ success: false, error: 'name and type are required' })
    }

    const [row] = await db.insert(savedAnalyses).values({
      projectId: req.projectId!,
      name,
      type,
      config: config ?? {},
    }).returning()

    res.json({ success: true, data: row })
  } catch (err) {
    console.error('Save analysis error:', err)
    res.status(500).json({ success: false, error: 'Failed to save analysis' })
  }
})

// DELETE /api/analytics/saved/:id?projectId=...
router.delete('/saved/:id', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string
    await db.delete(savedAnalyses).where(
      and(eq(savedAnalyses.id, id), eq(savedAnalyses.projectId, req.projectId!))
    )
    res.json({ success: true })
  } catch (err) {
    console.error('Delete analysis error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete analysis' })
  }
})

// ============ SEGMENT TRANSITIONS ============

// POST /api/analytics/snapshot?projectId=...
// Creates a snapshot of current segment memberships
router.post('/snapshot', requireProjectId, async (req, res) => {
  try {
    const count = await createSegmentSnapshot(req.projectId!)
    res.json({ success: true, data: { snapshotted: count } })
  } catch (err) {
    console.error('Snapshot error:', err)
    res.status(500).json({ success: false, error: 'Failed to create snapshot' })
  }
})

// GET /api/analytics/snapshot-dates?projectId=...
router.get('/snapshot-dates', requireProjectId, async (req, res) => {
  try {
    const dates = await getSnapshotDates(req.projectId!)
    res.json({ success: true, data: dates })
  } catch (err) {
    console.error('Snapshot dates error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch snapshot dates' })
  }
})

// GET /api/analytics/transitions?projectId=...&period1=2025-02-01&period2=2025-03-01&segmentIds=...
router.get('/transitions', requireProjectId, async (req, res) => {
  try {
    const { period1, period2, segmentIds } = req.query
    if (!period1 || !period2) {
      return res.status(400).json({ success: false, error: 'period1 and period2 are required' })
    }

    const result = await computeTransitions(
      req.projectId!,
      period1 as string,
      period2 as string,
      segmentIds ? (segmentIds as string).split(',') : undefined,
    )

    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Transitions error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute transitions' })
  }
})

// GET /api/analytics/segment-trend?projectId=...&segmentIds=id1,id2
router.get('/segment-trend', requireProjectId, async (req, res) => {
  try {
    const segmentIds = req.query.segmentIds
      ? (req.query.segmentIds as string).split(',')
      : []

    if (segmentIds.length === 0) {
      return res.status(400).json({ success: false, error: 'segmentIds are required' })
    }

    const result = await computeSegmentTrend(req.projectId!, segmentIds)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Segment trend error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute segment trend' })
  }
})

export default router
