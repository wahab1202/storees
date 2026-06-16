import { Router } from 'express'
import { eq, and, or, desc, ilike, gte, lte, isNull, isNotNull, count, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { messages, customers, campaigns, flowTrips, flows } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import { clampPageSize, calcTotalPages } from '@storees/shared'

const router = Router()

// Notification logs are an admin surface — they expose every customer's delivery
// outcome across the project, so gate to admins (project "super admin").
router.use(requireRole('admin'), requireProjectId)

/** Build the shared WHERE for both the list and the summary, from query filters. */
function buildFilters(req: { projectId?: string; query: Record<string, unknown> }) {
  const projectId = req.projectId!
  const channel = String(req.query.channel ?? '').trim()
  const status = String(req.query.status ?? '').trim()
  const source = String(req.query.source ?? '').trim() // 'campaign' | 'flow' | 'transactional'
  const search = String(req.query.search ?? '').trim()
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()

  const conditions = [eq(messages.projectId, projectId)]
  if (channel) conditions.push(eq(messages.channel, channel))
  if (status) conditions.push(eq(messages.status, status))
  if (source === 'campaign') conditions.push(isNotNull(messages.campaignId))
  else if (source === 'flow') conditions.push(isNotNull(messages.flowTripId))
  else if (source === 'transactional') conditions.push(and(isNull(messages.campaignId), isNull(messages.flowTripId))!)
  if (from) conditions.push(gte(messages.createdAt, new Date(from)))
  if (to) conditions.push(lte(messages.createdAt, new Date(to)))
  if (search) {
    conditions.push(or(
      ilike(customers.email, `%${search}%`),
      ilike(customers.phone, `%${search}%`),
      ilike(customers.name, `%${search}%`),
    )!)
  }
  return and(...conditions)
}

/**
 * GET /api/logs/notifications — paginated delivery log across all channels.
 * Filters: channel, status, source (campaign|flow|transactional), search
 * (recipient name/email/phone), from/to (ISO dates).
 */
router.get('/notifications', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = clampPageSize(Number(req.query.pageSize) || undefined)
    const offset = (page - 1) * pageSize
    const where = buildFilters(req)

    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(messages)
      .leftJoin(customers, eq(customers.id, messages.customerId))
      .where(where)

    const rows = await db
      .select({
        id: messages.id,
        channel: messages.channel,
        status: messages.status,
        messageType: messages.messageType,
        provider: messages.provider,
        failureReason: messages.failureReason,
        blockReason: messages.blockReason,
        createdAt: messages.createdAt,
        sentAt: messages.sentAt,
        deliveredAt: messages.deliveredAt,
        readAt: messages.readAt,
        clickedAt: messages.clickedAt,
        failedAt: messages.failedAt,
        campaignId: messages.campaignId,
        flowTripId: messages.flowTripId,
        customerName: customers.name,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        campaignName: campaigns.name,
        flowName: flows.name,
      })
      .from(messages)
      .leftJoin(customers, eq(customers.id, messages.customerId))
      .leftJoin(campaigns, eq(campaigns.id, messages.campaignId))
      .leftJoin(flowTrips, eq(flowTrips.id, messages.flowTripId))
      .leftJoin(flows, eq(flows.id, flowTrips.flowId))
      .where(where)
      .orderBy(desc(messages.createdAt))
      .limit(pageSize)
      .offset(offset)

    res.json({
      success: true,
      data: rows,
      pagination: { page, pageSize, total, totalPages: calcTotalPages(total, pageSize) },
    })
  } catch (err) {
    console.error('GET /logs/notifications error:', err)
    res.status(500).json({ success: false, error: 'Failed to load notification logs' })
  }
})

/**
 * GET /api/logs/notifications/summary — status counts for the current filter,
 * powering the pass/fail header stats. Honours the same filters except status.
 */
router.get('/notifications/summary', async (req, res) => {
  try {
    const where = buildFilters({ projectId: req.projectId, query: { ...req.query, status: '' } })
    const rows = await db
      .select({ status: messages.status, c: count() })
      .from(messages)
      .leftJoin(customers, eq(customers.id, messages.customerId))
      .where(where)
      .groupBy(messages.status)

    const byStatus: Record<string, number> = {}
    let total = 0
    for (const r of rows) { byStatus[r.status] = Number(r.c); total += Number(r.c) }
    res.json({ success: true, data: { total, byStatus } })
  } catch (err) {
    console.error('GET /logs/notifications/summary error:', err)
    res.status(500).json({ success: false, error: 'Failed to load log summary' })
  }
})

export default router
