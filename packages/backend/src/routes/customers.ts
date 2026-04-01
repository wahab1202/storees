import { Router } from 'express'
import { eq, and, desc, asc, ilike, or, sql, count } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, orders, events, customerSegments, segments, flowTrips, flows, messages, campaigns } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { clampPageSize, calcTotalPages } from '@storees/shared'
import { getCustomerJourney, getActivitySummary } from '../services/customerJourneyService.js'
import { recalculateAllAggregates } from '../services/customerService.js'
import type { JourneyEntryType } from '../services/customerJourneyService.js'

const router = Router()

// GET /api/customers?projectId=...&page=1&pageSize=25&search=...&sortBy=lastSeen&sortOrder=desc&segmentId=...
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = clampPageSize(Number(req.query.pageSize) || undefined)
    const search = req.query.search as string | undefined
    const sortBy = (req.query.sortBy as string) || 'lastSeen'
    const sortOrder = (req.query.sortOrder as string) || 'desc'
    const segmentId = req.query.segmentId as string | undefined
    const rfm = req.query.rfm as string | undefined // e.g. "recent_high", "lapsed_medium"
    const offset = (page - 1) * pageSize

    // Build WHERE conditions
    const conditions = [eq(customers.projectId, projectId)]

    if (search) {
      conditions.push(
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.email, `%${search}%`),
          ilike(customers.phone, `%${search}%`),
        )!,
      )
    }

    if (segmentId) {
      conditions.push(
        sql`${customers.id} IN (
          SELECT customer_id FROM customer_segments WHERE segment_id = ${segmentId}
        )`,
      )
    }

    // RFM bucket filter: recency (recent/medium/lapsed) × value (low/medium/high)
    if (rfm) {
      const [recency, value] = rfm.split('_')
      // Recency filter
      if (recency === 'recent') {
        conditions.push(sql`EXTRACT(DAY FROM NOW() - ${customers.lastSeen}) <= 30`)
      } else if (recency === 'medium') {
        conditions.push(sql`EXTRACT(DAY FROM NOW() - ${customers.lastSeen}) > 30`)
        conditions.push(sql`EXTRACT(DAY FROM NOW() - ${customers.lastSeen}) <= 90`)
      } else if (recency === 'lapsed') {
        conditions.push(sql`EXTRACT(DAY FROM NOW() - ${customers.lastSeen}) > 90`)
      }
      // Value filter using NTILE(3) among buyers
      conditions.push(sql`${customers.totalOrders} > 0`)
      if (value === 'low') {
        conditions.push(sql`${customers.id} IN (
          SELECT id FROM (
            SELECT id, NTILE(3) OVER (ORDER BY total_spent::numeric) AS tile
            FROM customers WHERE project_id = ${projectId} AND total_orders > 0
          ) t WHERE tile = 1
        )`)
      } else if (value === 'medium') {
        conditions.push(sql`${customers.id} IN (
          SELECT id FROM (
            SELECT id, NTILE(3) OVER (ORDER BY total_spent::numeric) AS tile
            FROM customers WHERE project_id = ${projectId} AND total_orders > 0
          ) t WHERE tile = 2
        )`)
      } else if (value === 'high') {
        conditions.push(sql`${customers.id} IN (
          SELECT id FROM (
            SELECT id, NTILE(3) OVER (ORDER BY total_spent::numeric) AS tile
            FROM customers WHERE project_id = ${projectId} AND total_orders > 0
          ) t WHERE tile = 3
        )`)
      }
    }

    const whereClause = and(...conditions)

    // Sort
    const sortColumn = {
      lastSeen: customers.lastSeen,
      totalSpent: customers.totalSpent,
      clv: customers.clv,
      name: customers.name,
    }[sortBy] ?? customers.lastSeen

    const orderFn = sortOrder === 'asc' ? asc : desc

    // Count total
    const [{ total }] = await db
      .select({ total: count() })
      .from(customers)
      .where(whereClause)

    // Fetch page
    const rows = await db
      .select()
      .from(customers)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset(offset)

    // Fetch segment names for each customer
    const customerIds = rows.map(r => r.id)
    const segmentMemberships = customerIds.length > 0
      ? await db
          .select({
            customerId: customerSegments.customerId,
            segmentId: customerSegments.segmentId,
            segmentName: segments.name,
          })
          .from(customerSegments)
          .innerJoin(segments, eq(customerSegments.segmentId, segments.id))
          .where(sql`${customerSegments.customerId} IN ${customerIds}`)
      : []

    // Group segments by customer
    const segmentsByCustomer = new Map<string, Array<{ id: string; name: string }>>()
    for (const m of segmentMemberships) {
      const list = segmentsByCustomer.get(m.customerId) ?? []
      list.push({ id: m.segmentId, name: m.segmentName })
      segmentsByCustomer.set(m.customerId, list)
    }

    const data = rows.map(row => ({
      ...row,
      totalSpent: Number(row.totalSpent),
      avgOrderValue: Number(row.avgOrderValue),
      clv: Number(row.clv),
      segments: segmentsByCustomer.get(row.id) ?? [],
    }))

    res.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calcTotalPages(total, pageSize),
      },
    })
  } catch (err) {
    console.error('Customer list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch customers' })
  }
})

// GET /api/customers/:id?projectId=...
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(eq(customers.id, req.params.id as string), eq(customers.projectId, req.projectId!)),
      )
      .limit(1)

    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' })
      return
    }

    // Fetch segments
    const segmentRows = await db
      .select({
        segmentId: customerSegments.segmentId,
        segmentName: segments.name,
        joinedAt: customerSegments.joinedAt,
      })
      .from(customerSegments)
      .innerJoin(segments, eq(customerSegments.segmentId, segments.id))
      .where(eq(customerSegments.customerId, customer.id))

    res.json({
      success: true,
      data: {
        ...customer,
        totalSpent: Number(customer.totalSpent),
        avgOrderValue: Number(customer.avgOrderValue),
        clv: Number(customer.clv),
        segments: segmentRows,
      },
    })
  } catch (err) {
    console.error('Customer detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch customer' })
  }
})

// GET /api/customers/:id/orders?projectId=...
router.get('/:id/orders', requireProjectId, async (req, res) => {
  try {
    const customerId = req.params.id as string
    const projectId = req.projectId!

    // Try orders table first
    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.projectId, projectId)))
      .orderBy(desc(orders.createdAt))

    if (rows.length > 0) {
      res.json({
        success: true,
        data: rows.map(row => ({
          ...row,
          total: Number(row.total),
          discount: Number(row.discount),
        })),
      })
      return
    }

    // Fallback: derive orders from order_completed events (GoWelmart data)
    const eventRows = await db
      .select({
        id: events.id,
        properties: events.properties,
        timestamp: events.timestamp,
      })
      .from(events)
      .where(
        and(
          eq(events.customerId, customerId),
          eq(events.projectId, projectId),
          eq(events.eventName, 'order_completed'),
        ),
      )
      .orderBy(desc(events.timestamp))

    const data = eventRows.map(row => {
      const props = (row.properties ?? {}) as Record<string, unknown>
      const lineItems = Array.isArray(props.line_items) ? props.line_items : []

      return {
        id: row.id,
        projectId,
        customerId,
        externalOrderId: (props.order_id as string) ?? (props.display_id ? `#${props.display_id}` : null),
        status: (props.fulfillment_status as string) ?? (props.status as string) ?? 'pending',
        total: lineItems.reduce((sum: number, item: Record<string, unknown>) =>
          sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 1), 0),
        discount: Number(props.discount_total) || 0,
        currency: (props.currency as string) ?? 'INR',
        lineItems: lineItems.map((item: Record<string, unknown>) => ({
          productId: (item.product_id as string) ?? '',
          productName: (item.product_name as string) ?? 'Unknown Product',
          quantity: Number(item.quantity) || 1,
          price: Number(item.unit_price) || 0,
          imageUrl: (item.image_url as string) ?? undefined,
        })),
        createdAt: row.timestamp,
        fulfilledAt: props.fulfillment_status === 'delivered' ? row.timestamp : null,
      }
    })

    res.json({ success: true, data })
  } catch (err) {
    console.error('Customer orders error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch orders' })
  }
})

// GET /api/customers/:id/events?projectId=...&limit=50
router.get('/:id/events', requireProjectId, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200)

    const rows = await db
      .select()
      .from(events)
      .where(
        and(eq(events.customerId, req.params.id as string), eq(events.projectId, req.projectId!)),
      )
      .orderBy(desc(events.timestamp))
      .limit(limit)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Customer events error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch events' })
  }
})

// GET /api/customers/:id/trips?projectId=...
router.get('/:id/trips', requireProjectId, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: flowTrips.id,
        flowId: flowTrips.flowId,
        flowName: flows.name,
        status: flowTrips.status,
        currentNodeId: flowTrips.currentNodeId,
        enteredAt: flowTrips.enteredAt,
        exitedAt: flowTrips.exitedAt,
        context: flowTrips.context,
      })
      .from(flowTrips)
      .innerJoin(flows, eq(flowTrips.flowId, flows.id))
      .where(
        and(eq(flowTrips.customerId, req.params.id as string), eq(flows.projectId, req.projectId!)),
      )
      .orderBy(desc(flowTrips.enteredAt))

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Customer trips error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch trips' })
  }
})

// GET /api/customers/:id/messages?projectId=...
router.get('/:id/messages', requireProjectId, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: messages.id,
        channel: messages.channel,
        messageType: messages.messageType,
        status: messages.status,
        sentAt: messages.sentAt,
        deliveredAt: messages.deliveredAt,
        readAt: messages.readAt,
        campaignName: campaigns.name,
        flowName: flows.name,
        blockReason: messages.blockReason,
      })
      .from(messages)
      .leftJoin(campaigns, eq(messages.campaignId, campaigns.id))
      .leftJoin(flowTrips, eq(messages.flowTripId, flowTrips.id))
      .leftJoin(flows, eq(flowTrips.flowId, flows.id))
      .where(
        and(eq(messages.customerId, req.params.id as string), eq(messages.projectId, req.projectId!)),
      )
      .orderBy(desc(messages.sentAt))
      .limit(50)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Customer messages error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch messages' })
  }
})

// GET /api/customers/:id/journey?projectId=...&limit=100&offset=0&types=event,order
router.get('/:id/journey', requireProjectId, async (req, res) => {
  try {
    const customerId = req.params.id as string

    // Verify customer belongs to project
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.projectId, req.projectId!)))
      .limit(1)

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }

    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const offset = Number(req.query.offset) || 0
    const typesParam = req.query.types as string | undefined
    const types = typesParam
      ? typesParam.split(',').filter(Boolean) as JourneyEntryType[]
      : undefined

    const entries = await getCustomerJourney(customerId, { limit, offset, types })
    res.json({ success: true, data: entries })
  } catch (err) {
    console.error('Customer journey error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch customer journey' })
  }
})

// GET /api/customers/:id/activity-summary?projectId=...
router.get('/:id/activity-summary', requireProjectId, async (req, res) => {
  try {
    const customerId = req.params.id as string

    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.projectId, req.projectId!)))
      .limit(1)

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' })
    }

    const summary = await getActivitySummary(customerId)
    res.json({ success: true, data: summary })
  } catch (err) {
    console.error('Activity summary error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch activity summary' })
  }
})

// POST /api/customers/recalculate?projectId=...
// Recalculates all customer aggregates (totalOrders, totalSpent, avgOrderValue, clv) from actual order data
router.post('/recalculate', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const updated = await recalculateAllAggregates(projectId)
    res.json({ success: true, data: { updated, message: `Recalculated aggregates for ${updated} customers` } })
  } catch (err) {
    console.error('Recalculate error:', err)
    res.status(500).json({ success: false, error: 'Failed to recalculate aggregates' })
  }
})

export default router
