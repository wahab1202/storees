import { Router } from 'express'
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { events, customers } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { scopedCustomerIdsSubquery } from '../middleware/agentScope.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'

const router = Router()

// GET /api/events?projectId=...&limit=100&customer=...&eventName=...&from=YYYY-MM-DD&to=YYYY-MM-DD
// Filters are server-side so you can find a specific customer's events on a
// specific date even when they're far outside the latest page.
router.get('/', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = req.projectId!
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const customerIdScope = await scopedCustomerIdsSubquery(req, projectId)

    const conditions = [eq(events.projectId, projectId), customerIdScope]

    const eventName = (req.query.eventName as string | undefined)?.trim()
    if (eventName) conditions.push(eq(events.eventName, eventName))

    const from = (req.query.from as string | undefined)?.trim()
    if (from) {
      const d = new Date(from)
      if (!Number.isNaN(d.getTime())) conditions.push(gte(events.timestamp, d))
    }
    const to = (req.query.to as string | undefined)?.trim()
    if (to) {
      // A date-only value means "through the end of that day".
      const d = new Date(/T/.test(to) ? to : `${to}T23:59:59.999`)
      if (!Number.isNaN(d.getTime())) conditions.push(lte(events.timestamp, d))
    }

    const customer = (req.query.customer as string | undefined)?.trim()
    if (customer) {
      const q = `%${customer.toLowerCase()}%`
      conditions.push(sql`(
        lower(${customers.name}) LIKE ${q}
        OR lower(${customers.email}) LIKE ${q}
        OR lower(${customers.phone}) LIKE ${q}
        OR lower(${customers.externalId}) LIKE ${q}
      )`)
    }

    const rows = await db
      .select({
        id: events.id,
        eventName: events.eventName,
        customerId: events.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
        customerExternalId: customers.externalId,
        properties: events.properties,
        platform: events.platform,
        timestamp: events.timestamp,
      })
      .from(events)
      .leftJoin(customers, eq(events.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(events.timestamp))
      .limit(limit)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Events list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch events' })
  }
})

// GET /api/events/names — distinct event names for the project (filter dropdown)
router.get('/names', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = req.projectId!
    const rows = await db
      .selectDistinct({ eventName: events.eventName })
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(events.eventName)
    res.json({ success: true, data: rows.map(r => r.eventName) })
  } catch (err) {
    console.error('Event names error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch event names' })
  }
})

export default router
