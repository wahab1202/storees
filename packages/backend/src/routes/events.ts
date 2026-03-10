import { Router } from 'express'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { events, customers } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'

const router = Router()

// GET /api/events?projectId=...&limit=100
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const limit = Math.min(Number(req.query.limit) || 100, 500)

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
    console.error('Events list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch events' })
  }
})

export default router
