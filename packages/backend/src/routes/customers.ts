import { Router } from 'express'
import { eq, and, desc, asc, ilike, or, sql, count } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, orders, events, customerSegments, segments } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { clampPageSize, calcTotalPages } from '@storees/shared'

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
    const rows = await db
      .select()
      .from(orders)
      .where(
        and(eq(orders.customerId, req.params.id as string), eq(orders.projectId, req.projectId!)),
      )
      .orderBy(desc(orders.createdAt))

    res.json({
      success: true,
      data: rows.map(row => ({
        ...row,
        total: Number(row.total),
        discount: Number(row.discount),
      })),
    })
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

export default router
