import { Router } from 'express'
import { eq, and, sql, count, desc, gte } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, orders, events, projects, segments, flows, emailTemplates, campaigns } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'

const router = Router()

/** Compute % change between two values. Returns 0 if prev is 0. */
function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

// GET /api/dashboard/stats?projectId=...
router.get('/stats', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    // Fetch domain type
    const [project] = await db
      .select({ domainType: projects.domainType })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    const domainType = (project?.domainType as string) ?? 'ecommerce'

    // Core metrics: current + previous period in single queries using FILTER
    const coreResult = await db.execute(sql`
      SELECT
        COUNT(*) AS total_customers,
        COUNT(*) FILTER (WHERE last_seen >= ${sevenDaysAgo}) AS active_7d,
        COUNT(*) FILTER (WHERE last_seen >= ${fourteenDaysAgo} AND last_seen < ${sevenDaysAgo}) AS active_prev_7d,
        COUNT(*) FILTER (WHERE first_seen >= ${sevenDaysAgo}) AS new_customers_7d,
        COUNT(*) FILTER (WHERE first_seen >= ${fourteenDaysAgo} AND first_seen < ${sevenDaysAgo}) AS new_customers_prev_7d,
        COALESCE(AVG(clv), 0) AS avg_clv
      FROM customers WHERE project_id = ${projectId}
    `)
    const core = coreResult.rows[0] as Record<string, string>

    // Domain-specific metrics with period comparison
    let domainStats: Record<string, number | undefined> = {}
    let domainChanges: Record<string, number> = {}

    if (domainType === 'ecommerce') {
      const orderResult = await db.execute(sql`
        SELECT
          COUNT(*) AS total_orders,
          COALESCE(SUM(total), 0) AS total_revenue,
          COUNT(*) FILTER (WHERE created_at >= ${sevenDaysAgo}) AS orders_7d,
          COUNT(*) FILTER (WHERE created_at >= ${fourteenDaysAgo} AND created_at < ${sevenDaysAgo}) AS orders_prev_7d,
          COALESCE(SUM(total) FILTER (WHERE created_at >= ${sevenDaysAgo}), 0) AS revenue_7d,
          COALESCE(SUM(total) FILTER (WHERE created_at >= ${fourteenDaysAgo} AND created_at < ${sevenDaysAgo}), 0) AS revenue_prev_7d
        FROM orders WHERE project_id = ${projectId}
      `)
      const o = orderResult.rows[0] as Record<string, string>
      domainStats = {
        totalOrders: Number(o.total_orders),
        totalRevenue: Number(o.total_revenue),
      }
      domainChanges = {
        ordersChange: pctChange(Number(o.orders_7d), Number(o.orders_prev_7d)),
        revenueChange: pctChange(Number(o.revenue_7d), Number(o.revenue_prev_7d)),
      }
    } else if (domainType === 'fintech') {
      const txResult = await db.execute(sql`
        SELECT
          COUNT(*) AS total_tx,
          COUNT(*) FILTER (WHERE timestamp >= ${sevenDaysAgo}) AS tx_7d,
          COUNT(*) FILTER (WHERE timestamp >= ${fourteenDaysAgo} AND timestamp < ${sevenDaysAgo}) AS tx_prev_7d
        FROM events WHERE project_id = ${projectId} AND event_name = 'transaction_completed'
      `)
      const tx = txResult.rows[0] as Record<string, string>

      const [volume] = await db
        .select({
          total: sql<string>`COALESCE(SUM((metrics->>'total_transaction_volume')::numeric), 0)`,
        })
        .from(customers)
        .where(eq(customers.projectId, projectId))

      domainStats = {
        totalTransactions: Number(tx.total_tx),
        transactionVolume: Number(Number(volume.total).toFixed(2)),
      }
      domainChanges = {
        transactionsChange: pctChange(Number(tx.tx_7d), Number(tx.tx_prev_7d)),
      }
    } else {
      const evtResult = await db.execute(sql`
        SELECT
          COUNT(*) AS total_events,
          COUNT(*) FILTER (WHERE timestamp >= ${sevenDaysAgo}) AS events_7d,
          COUNT(*) FILTER (WHERE timestamp >= ${fourteenDaysAgo} AND timestamp < ${sevenDaysAgo}) AS events_prev_7d
        FROM events WHERE project_id = ${projectId}
      `)
      const e = evtResult.rows[0] as Record<string, string>
      domainStats = { totalEvents: Number(e.total_events) }
      domainChanges = {
        eventsChange: pctChange(Number(e.events_7d), Number(e.events_prev_7d)),
      }
    }

    // Engagement metrics (SDK — cross-domain)
    const engResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE event_name = 'page_viewed' AND timestamp >= ${sevenDaysAgo}) AS page_views_7d,
        COUNT(*) FILTER (WHERE event_name = 'page_viewed' AND timestamp >= ${fourteenDaysAgo} AND timestamp < ${sevenDaysAgo}) AS page_views_prev_7d,
        COUNT(*) FILTER (WHERE event_name = 'session_started' AND timestamp >= ${sevenDaysAgo}) AS sessions_7d,
        COUNT(*) FILTER (WHERE event_name = 'session_started' AND timestamp >= ${fourteenDaysAgo} AND timestamp < ${sevenDaysAgo}) AS sessions_prev_7d
      FROM events WHERE project_id = ${projectId}
    `)
    const eng = engResult.rows[0] as Record<string, string>

    res.json({
      success: true,
      data: {
        domainType,
        totalCustomers: Number(core.total_customers),
        activeCustomers: Number(core.active_7d),
        newCustomers: Number(core.new_customers_7d),
        avgClv: Number(Number(core.avg_clv).toFixed(2)),
        // % changes (7d vs prev 7d)
        activeChange: pctChange(Number(core.active_7d), Number(core.active_prev_7d)),
        newCustomersChange: pctChange(Number(core.new_customers_7d), Number(core.new_customers_prev_7d)),
        ...domainStats,
        ...domainChanges,
        // SDK engagement (only included when > 0)
        ...(Number(eng.page_views_7d) > 0 || Number(eng.sessions_7d) > 0 ? {
          pageViews7d: Number(eng.page_views_7d),
          pageViewsChange: pctChange(Number(eng.page_views_7d), Number(eng.page_views_prev_7d)),
          sessions7d: Number(eng.sessions_7d),
          sessionsChange: pctChange(Number(eng.sessions_7d), Number(eng.sessions_prev_7d)),
        } : {}),
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

// GET /api/dashboard/trends?projectId=...&range=7d|14d|30d
router.get('/trends', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const range = (req.query.range as string) || '7d'
    const days = range === '30d' ? 30 : range === '14d' ? 14 : 7
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Fetch domain type
    const [project] = await db
      .select({ domainType: projects.domainType })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    const domainType = (project?.domainType as string) ?? 'ecommerce'

    // Daily new customers + daily active customers
    const customerTrends = await db.execute(sql`
      SELECT
        d.day::date AS date,
        COALESCE(nc.new_count, 0) AS new_customers,
        COALESCE(ac.active_count, 0) AS active_customers
      FROM generate_series(${startDate}::date, CURRENT_DATE, '1 day') AS d(day)
      LEFT JOIN (
        SELECT first_seen::date AS day, COUNT(*) AS new_count
        FROM customers WHERE project_id = ${projectId} AND first_seen >= ${startDate}
        GROUP BY first_seen::date
      ) nc ON nc.day = d.day::date
      LEFT JOIN (
        SELECT last_seen::date AS day, COUNT(*) AS active_count
        FROM customers WHERE project_id = ${projectId} AND last_seen >= ${startDate}
        GROUP BY last_seen::date
      ) ac ON ac.day = d.day::date
      ORDER BY d.day
    `)

    // Daily events
    const eventTrends = await db.execute(sql`
      SELECT
        d.day::date AS date,
        COALESCE(e.event_count, 0) AS events
      FROM generate_series(${startDate}::date, CURRENT_DATE, '1 day') AS d(day)
      LEFT JOIN (
        SELECT timestamp::date AS day, COUNT(*) AS event_count
        FROM events WHERE project_id = ${projectId} AND timestamp >= ${startDate}
        GROUP BY timestamp::date
      ) e ON e.day = d.day::date
      ORDER BY d.day
    `)

    // Domain-specific daily trends
    let domainTrends: Record<string, unknown>[] = []

    if (domainType === 'ecommerce') {
      const result = await db.execute(sql`
        SELECT
          d.day::date AS date,
          COALESCE(o.order_count, 0) AS orders,
          COALESCE(o.revenue, 0) AS revenue
        FROM generate_series(${startDate}::date, CURRENT_DATE, '1 day') AS d(day)
        LEFT JOIN (
          SELECT created_at::date AS day, COUNT(*) AS order_count, SUM(total) AS revenue
          FROM orders WHERE project_id = ${projectId} AND created_at >= ${startDate}
          GROUP BY created_at::date
        ) o ON o.day = d.day::date
        ORDER BY d.day
      `)
      domainTrends = result.rows as Record<string, unknown>[]
    } else if (domainType === 'fintech') {
      const result = await db.execute(sql`
        SELECT
          d.day::date AS date,
          COALESCE(t.tx_count, 0) AS transactions
        FROM generate_series(${startDate}::date, CURRENT_DATE, '1 day') AS d(day)
        LEFT JOIN (
          SELECT timestamp::date AS day, COUNT(*) AS tx_count
          FROM events WHERE project_id = ${projectId} AND event_name = 'transaction_completed' AND timestamp >= ${startDate}
          GROUP BY timestamp::date
        ) t ON t.day = d.day::date
        ORDER BY d.day
      `)
      domainTrends = result.rows as Record<string, unknown>[]
    }

    res.json({
      success: true,
      data: {
        range,
        customers: customerTrends.rows,
        events: eventTrends.rows,
        domain: domainTrends,
      },
    })
  } catch (err) {
    console.error('Dashboard trends error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch trends' })
  }
})

// GET /api/dashboard/counts?projectId=...
router.get('/counts', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const [
      [{ customersCount }],
      [{ segmentsCount }],
      [{ flowsCount }],
      [{ templatesCount }],
      [{ campaignsCount }],
    ] = await Promise.all([
      db.select({ customersCount: count() }).from(customers).where(eq(customers.projectId, projectId)),
      db.select({ segmentsCount: count() }).from(segments).where(eq(segments.projectId, projectId)),
      db.select({ flowsCount: count() }).from(flows).where(eq(flows.projectId, projectId)),
      db.select({ templatesCount: count() }).from(emailTemplates).where(eq(emailTemplates.projectId, projectId)),
      db.select({ campaignsCount: count() }).from(campaigns).where(eq(campaigns.projectId, projectId)),
    ])

    res.json({
      success: true,
      data: {
        customers: customersCount,
        segments: segmentsCount,
        flows: flowsCount,
        templates: templatesCount,
        campaigns: campaignsCount,
      },
    })
  } catch (err) {
    console.error('Dashboard counts error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch counts' })
  }
})

export default router
