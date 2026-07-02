import { Router } from 'express'
import { eq, and, sql, count, inArray, desc, or } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { flows, flowTrips, customers, messages, scheduledJobs } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import { getFlowAnalytics } from '../services/flowAnalyticsService.js'
import { listFlowTemplates, installFlowTemplate, type FlowTemplateId } from '../services/flowTemplates.js'

const router = Router()

// Flows are admin-only. Sub-admins (manager/agent roles) are fenced out:
// flows reference segments + customers across regions, so read-only would still leak.
router.use(requireRole('admin'))

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
          .where(inArray(flowTrips.flowId, flowRows.map(f => f.id)))
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
    const { name, description, triggerEvent, triggerFilters } = req.body

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Name is required' })
    }

    // Persist the event + any property filters set in the create dialog. The
    // builder reads config.filters on the trigger node, so they carry straight
    // through when the flow opens.
    const triggerConfig = {
      event: triggerEvent || 'cart_created',
      ...(triggerFilters && Array.isArray(triggerFilters.rules) && triggerFilters.rules.length > 0
        ? { filters: triggerFilters }
        : {}),
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

// GET /api/flows/:id/analytics?projectId=...
// GET /api/flows/:id/debug?projectId=...&customer=<id|email|phone>
//
// Per-user flow debugger. Looks up the customer (by Storees UUID, email,
// or phone) and returns every flow_trip they've had through THIS flow,
// each annotated with:
//   - currentNodeId  → where they are/were in the graph
//   - scheduledJobs[] → pending and completed action jobs for that trip
//   - messages[]      → actual sent messages (channel, status, engagement
//                       timestamps, block reasons)
//
// Used by the "Debug" tab on the flow detail page. Big support unlock —
// instead of trawling logs to answer "why didn't this user get message
// 3?", ops can search and see the full timeline.
router.get('/:id/debug', requireProjectId, async (req, res) => {
  try {
    const flowId = req.params.id as string
    const projectId = req.projectId!
    const query = ((req.query.customer as string | undefined) ?? '').trim()

    if (!query) {
      return res.status(400).json({ success: false, error: 'customer query required' })
    }

    const [flow] = await db
      .select({ projectId: flows.projectId, name: flows.name })
      .from(flows)
      .where(eq(flows.id, flowId))
      .limit(1)

    if (!flow || flow.projectId !== projectId) {
      return res.status(404).json({ success: false, error: 'Flow not found' })
    }

    // Identity resolution — accept UUID, email, or phone. We match
    // exactly on any of them so onboarding can paste a customer id from
    // a support ticket OR a marketer can paste an email.
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)
    const [customer] = await db
      .select({
        id: customers.id,
        externalId: customers.externalId,
        email: customers.email,
        phone: customers.phone,
        name: customers.name,
      })
      .from(customers)
      .where(
        and(
          eq(customers.projectId, projectId),
          looksLikeUuid
            ? eq(customers.id, query)
            : or(
                eq(customers.email, query),
                eq(customers.phone, query),
                eq(customers.externalId, query),
              ),
        ),
      )
      .limit(1)

    if (!customer) {
      return res.json({ success: true, data: { customer: null, trips: [] } })
    }

    const trips = await db
      .select({
        id: flowTrips.id,
        status: flowTrips.status,
        currentNodeId: flowTrips.currentNodeId,
        context: flowTrips.context,
        triggerEventId: flowTrips.triggerEventId,
        enteredAt: flowTrips.enteredAt,
        exitedAt: flowTrips.exitedAt,
      })
      .from(flowTrips)
      .where(and(eq(flowTrips.flowId, flowId), eq(flowTrips.customerId, customer.id)))
      .orderBy(desc(flowTrips.enteredAt))
      .limit(20)

    if (trips.length === 0) {
      return res.json({ success: true, data: { customer, trips: [] } })
    }

    const tripIds = trips.map((t) => t.id)

    // Fetch all messages + scheduled jobs in two queries (vs N+1 per trip)
    const [msgs, jobs] = await Promise.all([
      db
        .select({
          id: messages.id,
          flowTripId: messages.flowTripId,
          channel: messages.channel,
          messageType: messages.messageType,
          templateId: messages.templateId,
          status: messages.status,
          blockReason: messages.blockReason,
          scheduledAt: messages.scheduledAt,
          sentAt: messages.sentAt,
          deliveredAt: messages.deliveredAt,
          readAt: messages.readAt,
          clickedAt: messages.clickedAt,
          failedAt: messages.failedAt,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(inArray(messages.flowTripId, tripIds))
        .orderBy(messages.createdAt),
      db
        .select({
          id: scheduledJobs.id,
          flowTripId: scheduledJobs.flowTripId,
          action: scheduledJobs.action,
          status: scheduledJobs.status,
          executeAt: scheduledJobs.executeAt,
          createdAt: scheduledJobs.createdAt,
        })
        .from(scheduledJobs)
        .where(inArray(scheduledJobs.flowTripId, tripIds))
        .orderBy(scheduledJobs.executeAt),
    ])

    const msgsByTrip = new Map<string, typeof msgs>()
    for (const m of msgs) {
      if (!m.flowTripId) continue
      const list = msgsByTrip.get(m.flowTripId) ?? []
      list.push(m)
      msgsByTrip.set(m.flowTripId, list)
    }
    const jobsByTrip = new Map<string, typeof jobs>()
    for (const j of jobs) {
      const list = jobsByTrip.get(j.flowTripId) ?? []
      list.push(j)
      jobsByTrip.set(j.flowTripId, list)
    }

    const enrichedTrips = trips.map((t) => ({
      ...t,
      messages: msgsByTrip.get(t.id) ?? [],
      scheduledJobs: jobsByTrip.get(t.id) ?? [],
    }))

    res.json({
      success: true,
      data: { customer, trips: enrichedTrips },
    })
  } catch (err) {
    console.error('Flow debug error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch flow debug info' })
  }
})

router.get('/:id/analytics', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string

    const [flow] = await db
      .select({ projectId: flows.projectId })
      .from(flows)
      .where(eq(flows.id, id))
      .limit(1)

    if (!flow || flow.projectId !== req.projectId) {
      return res.status(404).json({ success: false, error: 'Flow not found' })
    }

    const analytics = await getFlowAnalytics(id)
    res.json({ success: true, data: analytics })
  } catch (err) {
    console.error('Flow analytics error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch flow analytics' })
  }
})

// POST /api/flows/:id/clone?projectId=...
router.post('/:id/clone', requireProjectId, async (req, res) => {
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

    const [cloned] = await db.insert(flows).values({
      projectId,
      name: `${existing.name} (Copy)`,
      description: existing.description,
      triggerConfig: existing.triggerConfig,
      exitConfig: existing.exitConfig,
      nodes: existing.nodes,
      status: 'draft',
    }).returning()

    res.status(201).json({ success: true, data: cloned })
  } catch (err) {
    console.error('Flow clone error:', err)
    res.status(500).json({ success: false, error: 'Failed to clone flow' })
  }
})

// GET /api/flows/templates — list pre-built flow templates installable into a project
router.get('/templates/list', requireProjectId, (_req, res) => {
  res.json({ success: true, data: listFlowTemplates() })
})

// POST /api/flows/templates/install?projectId=  body: { templateId }
// Installs a pre-built flow template (e.g. CTWA Welcome) as a draft flow.
router.post('/templates/install', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const { templateId } = req.body as { templateId: FlowTemplateId }
    if (!templateId) {
      return res.status(400).json({ success: false, error: 'templateId is required' })
    }
    const result = await installFlowTemplate(projectId, templateId)
    res.status(201).json({ success: true, data: result })
  } catch (err) {
    console.error('Install flow template error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to install template'
    res.status(500).json({ success: false, error: msg })
  }
})

export default router
