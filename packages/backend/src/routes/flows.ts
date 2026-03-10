import { Router } from 'express'
import { eq, and, sql, count } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { flows, flowTrips } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'

const router = Router()

// GET /api/flows?projectId=...
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    const flowRows = await db
      .select()
      .from(flows)
      .where(eq(flows.projectId, projectId))

    // Get trip counts per flow
    const tripCounts = flowRows.length > 0
      ? await db
          .select({
            flowId: flowTrips.flowId,
            active: sql<number>`COUNT(*) FILTER (WHERE ${flowTrips.status} = 'active')`,
            waiting: sql<number>`COUNT(*) FILTER (WHERE ${flowTrips.status} = 'waiting')`,
            completed: sql<number>`COUNT(*) FILTER (WHERE ${flowTrips.status} = 'completed')`,
            exited: sql<number>`COUNT(*) FILTER (WHERE ${flowTrips.status} = 'exited')`,
            total: count(),
          })
          .from(flowTrips)
          .where(sql`${flowTrips.flowId} IN ${flowRows.map(f => f.id)}`)
          .groupBy(flowTrips.flowId)
      : []

    const tripCountMap = new Map(tripCounts.map(tc => [tc.flowId, tc]))

    const data = flowRows.map(flow => ({
      ...flow,
      tripCounts: tripCountMap.get(flow.id) ?? {
        active: 0,
        waiting: 0,
        completed: 0,
        exited: 0,
        total: 0,
      },
    }))

    res.json({ success: true, data })
  } catch (err) {
    console.error('Flows list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch flows' })
  }
})

// GET /api/flows/:id?projectId=...
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string

    const [flow] = await db
      .select()
      .from(flows)
      .where(and(eq(flows.id, id), eq(flows.projectId, projectId)))

    if (!flow) {
      return res.status(404).json({ success: false, error: 'Flow not found' })
    }

    const tripCounts = await db
      .select({
        active: sql<number>`COUNT(*) FILTER (WHERE ${flowTrips.status} = 'active')`,
        waiting: sql<number>`COUNT(*) FILTER (WHERE ${flowTrips.status} = 'waiting')`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${flowTrips.status} = 'completed')`,
        exited: sql<number>`COUNT(*) FILTER (WHERE ${flowTrips.status} = 'exited')`,
        total: count(),
      })
      .from(flowTrips)
      .where(eq(flowTrips.flowId, id))

    res.json({
      success: true,
      data: {
        ...flow,
        tripCounts: tripCounts[0] ?? { active: 0, waiting: 0, completed: 0, exited: 0, total: 0 },
      },
    })
  } catch (err) {
    console.error('Flow detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch flow' })
  }
})

// POST /api/flows?projectId=...
// Body: { name, description?, triggerEvent? }
router.post('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const { name, description, triggerEvent } = req.body

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Name is required' })
    }

    const triggerConfig = {
      event: triggerEvent || 'cart_created',
    }

    const defaultNodes = [
      { id: 'trigger_1', type: 'trigger', config: triggerConfig },
      { id: 'end_1', type: 'end', label: 'End' },
    ]

    const [flow] = await db.insert(flows).values({
      projectId,
      name: name.trim(),
      description: description?.trim() || '',
      triggerConfig,
      nodes: defaultNodes,
      status: 'draft',
    }).returning()

    res.status(201).json({ success: true, data: flow })
  } catch (err) {
    console.error('Flow create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create flow' })
  }
})

// PATCH /api/flows/:id/status?projectId=...
// Body: { status: 'active' | 'paused' | 'draft' }
router.patch('/:id/status', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string
    const { status } = req.body

    const validStatuses = ['draft', 'active', 'paused']
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      })
    }

    // Verify flow exists and belongs to project
    const [existing] = await db
      .select()
      .from(flows)
      .where(and(eq(flows.id, id), eq(flows.projectId, projectId)))

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Flow not found' })
    }

    // Validate state transitions
    const allowedTransitions: Record<string, string[]> = {
      draft: ['active'],
      active: ['paused'],
      paused: ['active', 'draft'],
    }

    if (!allowedTransitions[existing.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot transition from '${existing.status}' to '${status}'`,
      })
    }

    const [updated] = await db
      .update(flows)
      .set({ status, updatedAt: new Date() })
      .where(eq(flows.id, id))
      .returning()

    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Flow status update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update flow status' })
  }
})

// PATCH /api/flows/:id?projectId=...
// Body: { name?, description?, nodes?, triggerConfig?, exitConfig? }
router.patch('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string
    const { name, description, nodes, triggerConfig, exitConfig } = req.body

    const [existing] = await db
      .select()
      .from(flows)
      .where(and(eq(flows.id, id), eq(flows.projectId, projectId)))

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Flow not found' })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (nodes !== undefined) updates.nodes = nodes
    if (triggerConfig !== undefined) updates.triggerConfig = triggerConfig
    if (exitConfig !== undefined) updates.exitConfig = exitConfig

    const [updated] = await db
      .update(flows)
      .set(updates)
      .where(eq(flows.id, id))
      .returning()

    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Flow update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update flow' })
  }
})

// DELETE /api/flows/:id?projectId=...
router.delete('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string

    const [existing] = await db
      .select()
      .from(flows)
      .where(and(eq(flows.id, id), eq(flows.projectId, projectId)))

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Flow not found' })
    }

    if (existing.status === 'active') {
      return res.status(400).json({ success: false, error: 'Cannot delete an active flow. Pause it first.' })
    }

    // Delete associated trips first
    await db.delete(flowTrips).where(eq(flowTrips.flowId, id))
    await db.delete(flows).where(eq(flows.id, id))

    res.json({ success: true, data: { message: 'Flow deleted' } })
  } catch (err) {
    console.error('Flow delete error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete flow' })
  }
})

export default router
