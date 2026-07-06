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

    const session = (req.query.session as string | undefined)?.trim()
    if (session) conditions.push(sql`${events.sessionId} ILIKE ${'%' + session + '%'}`)

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
        source: events.source,
        sessionId: events.sessionId,
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

// GET /api/events/sessions — the SESSION DEBUGGER feed.
// Recent sessions with their event activity, any identity values SEEN in the
// payloads (phone/email typed at checkout etc.), and whether the session ever
// linked to a customer (anonymous_sessions). Built to answer: "I typed my
// phone in checkout — which session did it land on, and why didn't it stitch?"
router.get('/sessions', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = req.projectId!
    const rows = await db.execute(sql`
      WITH recent AS (
        SELECT session_id, customer_id, event_name, timestamp, properties
        FROM events
        WHERE project_id = ${projectId}
          AND session_id IS NOT NULL
          AND received_at > NOW() - INTERVAL '7 days'
        ORDER BY received_at DESC
        LIMIT 20000
      )
      SELECT
        r.session_id,
        COUNT(*)::int AS event_count,
        MIN(r.timestamp) AS first_seen,
        MAX(r.timestamp) AS last_seen,
        MAX(r.customer_id::text) AS event_customer_id,
        array_agg(DISTINCT r.event_name) AS event_names,
        MAX(COALESCE(r.properties->>'phone', r.properties->>'customer_phone')) AS seen_phone,
        MAX(COALESCE(r.properties->>'email', r.properties->>'customer_email')) AS seen_email
      FROM recent r
      GROUP BY r.session_id
      ORDER BY MAX(r.timestamp) DESC
      LIMIT 100
    `)

    const sessions = rows.rows as Array<{
      session_id: string; event_count: number; first_seen: string; last_seen: string
      event_customer_id: string | null; event_names: string[] | null
      seen_phone: string | null; seen_email: string | null
    }>

    // Link state from anonymous_sessions + customer display names
    const ids = sessions.map(s2 => s2.session_id)
    const links = ids.length > 0 ? (await db.execute(sql`
      SELECT session_id, customer_id::text AS customer_id, linked_at, resolved_at, events_back_attributed
      FROM anonymous_sessions
      WHERE project_id = ${projectId} AND session_id = ANY(${ids}::varchar[])
    `)).rows as Array<{ session_id: string; customer_id: string | null; linked_at: string | null; resolved_at: string | null; events_back_attributed: number | null }> : []
    const linkBySession = new Map(links.map(l => [l.session_id, l]))

    const customerIds = [...new Set([
      ...sessions.map(s2 => s2.event_customer_id),
      ...links.map(l => l.customer_id),
    ].filter((x): x is string => !!x))]
    const customerRows = customerIds.length > 0 ? (await db.execute(sql`
      SELECT id::text AS id, name, email, phone FROM customers WHERE id = ANY(${customerIds}::uuid[])
    `)).rows as Array<{ id: string; name: string | null; email: string | null; phone: string | null }> : []
    const customerById = new Map(customerRows.map(c => [c.id, c]))

    const data = sessions.map(s2 => {
      const link = linkBySession.get(s2.session_id)
      const customerId = link?.customer_id ?? s2.event_customer_id
      const cust = customerId ? customerById.get(customerId) : undefined
      return {
        sessionId: s2.session_id,
        eventCount: s2.event_count,
        firstSeen: s2.first_seen,
        lastSeen: s2.last_seen,
        eventNames: (s2.event_names ?? []).slice(0, 8),
        seenPhone: s2.seen_phone,
        seenEmail: s2.seen_email,
        customerId: customerId ?? null,
        customerLabel: cust ? (cust.name || cust.email || cust.phone) : null,
        linkedAt: link?.linked_at ?? null,
        resolvedAt: link?.resolved_at ?? null,
        eventsBackAttributed: link?.events_back_attributed ?? null,
      }
    })

    res.json({ success: true, data })
  } catch (err) {
    console.error('Sessions debugger error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch sessions' })
  }
})

export default router
