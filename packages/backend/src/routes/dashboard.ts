import { Router } from 'express'
import { eq, and, sql, count, desc, gte } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, orders, events } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'

const router = Router()

// GET /api/dashboard/stats?projectId=...
router.get('/stats', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [totalCustomers] = await db
      .select({ count: count() })
      .from(customers)
      .where(eq(customers.projectId, projectId))

    const [activeCustomers] = await db
      .select({ count: count() })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), gte(customers.lastSeen, sevenDaysAgo)))

    const [totalOrders] = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.projectId, projectId))

    const [revenue] = await db
      .select({ total: sql<string>`COALESCE(SUM(total), 0)` })
      .from(orders)
      .where(eq(orders.projectId, projectId))

    const [avgClv] = await db
      .select({ avg: sql<string>`COALESCE(AVG(clv), 0)` })
      .from(customers)
      .where(eq(customers.projectId, projectId))

    res.json({
      success: true,
      data: {
        totalCustomers: totalCustomers.count,
        activeCustomers: activeCustomers.count,
        totalOrders: totalOrders.count,
        totalRevenue: Number(revenue.total),
        avgClv: Number(Number(avgClv.avg).toFixed(2)),
      },
    })
  } catch (err) {
    console.error('Dashboard stats error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' })
  }
})

// GET /api/dashboard/activity?projectId=...&limit=20
router.get('/activity', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const limit = Math.min(Number(req.query.limit) || 20, 50)

    const rows = await db
      .select({
        id: events.id,
        eventName: events.eventName,
        customerId: events.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
        properties: events.properties,
        platform: events.platform,
        timestamp: events.timestamp,
      })
      .from(events)
      .leftJoin(customers, eq(events.customerId, customers.id))
      .where(eq(events.projectId, projectId))
      .orderBy(desc(events.timestamp))
      .limit(limit)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Dashboard activity error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch activity' })
  }
})

export default router
