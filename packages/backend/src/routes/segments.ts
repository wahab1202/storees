import { Router } from 'express'
import { eq, and, count } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { segments, customers } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { evaluateSegment, evaluateAllSegments, instantiateDefaultSegments } from '../services/segmentService.js'
import { getLifecycleChart, filterToSql } from '@storees/segments'
import type { FilterConfig } from '@storees/shared'

const router = Router()

// GET /api/segments?projectId=...
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    // Ensure default segments exist (evaluates them on first creation)
    await instantiateDefaultSegments(projectId)

    // Return cached counts immediately, re-evaluate in background
    const rows = await db
      .select()
      .from(segments)
      .where(eq(segments.projectId, projectId))

    res.json({
      success: true,
      data: rows,
    })

    // Fire-and-forget: re-evaluate all segments after response is sent
    evaluateAllSegments(projectId).catch(err => {
      console.error('Background segment evaluation error:', err)
    })
  } catch (err) {
    console.error('Segment list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch segments' })
  }
})

// GET /api/segments/lifecycle?projectId=...
// Must be before /:id to avoid param capture
router.get('/lifecycle', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const data = await getLifecycleChart(db, projectId)
    res.json({ success: true, data })
  } catch (err) {
    console.error('Lifecycle chart error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch lifecycle data' })
  }
})

// POST /api/segments/preview?projectId=...
// Body: { filters } — returns 10 sample matching customers + total count
router.post('/preview', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const { filters } = req.body as { filters: FilterConfig }

    if (!filters || !filters.logic || !Array.isArray(filters.rules) || filters.rules.length === 0) {
      return res.json({ success: true, data: { total: 0, sample: [] } })
    }

    const filterSql = filterToSql(filters)

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), filterSql))

    // Get 10 sample customers
    const sample = await db
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        totalOrders: customers.totalOrders,
        totalSpent: customers.totalSpent,
        lastSeen: customers.lastSeen,
      })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), filterSql))
      .orderBy(customers.lastSeen)
      .limit(10)

    res.json({ success: true, data: { total, sample } })
  } catch (err) {
    console.error('Segment preview error:', err)
    res.json({ success: true, data: { total: 0, sample: [], error: 'Filter evaluation failed' } })
  }
})

// GET /api/segments/:id?projectId=...
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string

    const [segment] = await db
      .select()
      .from(segments)
      .where(and(eq(segments.id, id), eq(segments.projectId, projectId)))

    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' })
    }

    res.json({ success: true, data: segment })
  } catch (err) {
    console.error('Segment detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch segment' })
  }
})

// POST /api/segments?projectId=...
// Body: { name, description?, filters }
router.post('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const { name, description, filters } = req.body

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Name is required' })
    }

    if (!filters || !filters.logic || !Array.isArray(filters.rules)) {
      return res.status(400).json({ success: false, error: 'Valid filters config is required' })
    }

    const [segment] = await db.insert(segments).values({
      projectId,
      name: name.trim(),
      type: 'custom',
      description: description?.trim() || '',
      filters,
      memberCount: 0,
      isActive: true,
    }).returning()

    // Evaluate the new segment immediately (non-fatal — don't fail creation if SQL evaluation errors)
    let memberCount = 0
    try {
      memberCount = await evaluateSegment(segment.id)
    } catch (evalErr) {
      console.error('Segment evaluation error (non-fatal):', (evalErr as Error).message)
    }

    res.status(201).json({ success: true, data: { ...segment, memberCount } })
  } catch (err) {
    console.error('Segment create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create segment' })
  }
})

// PATCH /api/segments/:id?projectId=...
// Body: { name?, description?, filters?, isActive? }
router.patch('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string
    const { name, description, filters, isActive } = req.body

    const [existing] = await db
      .select()
      .from(segments)
      .where(and(eq(segments.id, id), eq(segments.projectId, projectId)))

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Segment not found' })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description.trim()
    if (filters !== undefined) updates.filters = filters
    if (isActive !== undefined) updates.isActive = isActive

    const [updated] = await db
      .update(segments)
      .set(updates)
      .where(eq(segments.id, id))
      .returning()

    // Re-evaluate if filters changed
    if (filters !== undefined) {
      const memberCount = await evaluateSegment(id)
      return res.json({ success: true, data: { ...updated, memberCount } })
    }

    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Segment update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update segment' })
  }
})

// DELETE /api/segments/:id?projectId=...
router.delete('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string

    const [existing] = await db
      .select()
      .from(segments)
      .where(and(eq(segments.id, id), eq(segments.projectId, projectId)))

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Segment not found' })
    }

    if (existing.type === 'default') {
      return res.status(400).json({ success: false, error: 'Default segments cannot be deleted' })
    }

    await db.delete(segments).where(eq(segments.id, id))
    res.json({ success: true, data: { message: 'Segment deleted' } })
  } catch (err) {
    console.error('Segment delete error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete segment' })
  }
})

// POST /api/segments/evaluate?projectId=...
router.post('/evaluate', requireProjectId, async (req, res) => {
  try {
    await evaluateAllSegments(req.projectId!)
    res.json({ success: true, data: { message: 'Segments evaluated' } })
  } catch (err) {
    console.error('Segment evaluation error:', err)
    res.status(500).json({ success: false, error: 'Failed to evaluate segments' })
  }
})

// POST /api/segments/:id/evaluate?projectId=...
router.post('/:id/evaluate', requireProjectId, async (req, res) => {
  try {
    const count = await evaluateSegment(req.params.id as string)
    res.json({ success: true, data: { memberCount: count } })
  } catch (err) {
    console.error('Segment evaluation error:', err)
    res.status(500).json({ success: false, error: 'Failed to evaluate segment' })
  }
})

export default router
