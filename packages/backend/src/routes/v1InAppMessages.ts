import { Router, Response } from 'express'
import { eq, and, sql, isNull, or, gte, lte } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { inAppMessages, inAppMessageViews, customers } from '../db/schema.js'
import { filterToSql } from '@storees/segments'
import type { FilterConfig } from '@storees/shared'
import { requirePublicKeyAuth, type ApiKeyAuthRequest } from '../middleware/apiKeyAuth.js'

// Gap 1: public SDK endpoints for in-app messages.
//
// GET  /api/v1/in-app-messages?customer_id=<external_id>
//   → list of active messages this customer should see right now,
//     filtered by audience filter + frequency + dismissal history
//
// POST /api/v1/in-app-messages/:id/event
//   body: { event: 'shown' | 'dismissed' | 'cta_clicked', customer_id }
//   → records the event so the SDK can dedup + the admin sees counters
//
// Same API-key auth as the rest of the public SDK endpoints.

const router = Router()
router.use(requirePublicKeyAuth())

router.get('/in-app-messages', async (req: ApiKeyAuthRequest, res: Response) => {
  try {
    const projectId = req.projectId
    if (!projectId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const externalId = (req.query.customer_id as string | undefined)?.trim()
    if (!externalId) {
      // SDK can also call without a customer id to fetch globally-active
      // messages — useful for "hero banner on home page" pre-login.
      // Return everything that has no audience filter.
      const rows = await db
        .select({
          id: inAppMessages.id,
          title: inAppMessages.title,
          body: inAppMessages.body,
          imageUrl: inAppMessages.imageUrl,
          ctaLabel: inAppMessages.ctaLabel,
          ctaUrl: inAppMessages.ctaUrl,
          position: inAppMessages.position,
          frequency: inAppMessages.frequency,
          targetPages: inAppMessages.targetPages,
        })
        .from(inAppMessages)
        .where(and(
          eq(inAppMessages.projectId, projectId),
          eq(inAppMessages.status, 'active'),
          isNull(inAppMessages.audienceFilter),
          or(isNull(inAppMessages.startsAt), lte(inAppMessages.startsAt, sql`NOW()`)),
          or(isNull(inAppMessages.endsAt), gte(inAppMessages.endsAt, sql`NOW()`)),
        ))
      return res.json({ success: true, data: rows })
    }

    // Resolve external_id → internal customer.id
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, externalId)))
      .limit(1)
    if (!customer) return res.json({ success: true, data: [] })

    // Pull all candidate active messages — apply audience filter +
    // frequency check in app code rather than building 1 monster SQL.
    // Active-set is typically small (< 50 messages per project) so this
    // is fast and easier to reason about than a join + jsonb filter.
    const candidates = await db
      .select()
      .from(inAppMessages)
      .where(and(
        eq(inAppMessages.projectId, projectId),
        eq(inAppMessages.status, 'active'),
        or(isNull(inAppMessages.startsAt), lte(inAppMessages.startsAt, sql`NOW()`)),
        or(isNull(inAppMessages.endsAt), gte(inAppMessages.endsAt, sql`NOW()`)),
      ))

    if (candidates.length === 0) return res.json({ success: true, data: [] })

    // Pull this customer's view history for these messages
    const messageIds = candidates.map((c) => c.id)
    const views = await db
      .select({
        messageId: inAppMessageViews.messageId,
        shownAt: inAppMessageViews.shownAt,
        dismissedAt: inAppMessageViews.dismissedAt,
      })
      .from(inAppMessageViews)
      .where(and(
        eq(inAppMessageViews.customerId, customer.id),
        sql`${inAppMessageViews.messageId} = ANY(${messageIds})`,
      ))

    const viewMap = new Map<string, { shownAt: Date; dismissedAt: Date | null }[]>()
    for (const v of views) {
      const list = viewMap.get(v.messageId) ?? []
      list.push({ shownAt: v.shownAt, dismissedAt: v.dismissedAt })
      viewMap.set(v.messageId, list)
    }

    const now = new Date()
    const todayStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

    const eligible: Array<typeof candidates[number]> = []
    for (const msg of candidates) {
      const history = viewMap.get(msg.id) ?? []

      // Frequency rules. 'always' = show every fetch unless dismissed.
      if (msg.frequency === 'once') {
        if (history.length > 0) continue
      } else if (msg.frequency === 'daily') {
        if (history.some((v) => v.shownAt >= todayStart)) continue
      } else {
        // 'always' — but stop if user explicitly dismissed
        if (history.some((v) => v.dismissedAt !== null)) continue
      }

      // Audience match — if no filter, everyone's in. Otherwise run a
      // 1-customer EXISTS query against the filter SQL.
      if (msg.audienceFilter) {
        const filterSql = filterToSql(msg.audienceFilter as FilterConfig)
        const [match] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.id, customer.id), filterSql))
          .limit(1)
        if (!match) continue
      }

      eligible.push(msg)
    }

    res.json({
      success: true,
      data: eligible.map((msg) => ({
        id: msg.id,
        title: msg.title,
        body: msg.body,
        imageUrl: msg.imageUrl,
        ctaLabel: msg.ctaLabel,
        ctaUrl: msg.ctaUrl,
        position: msg.position,
        frequency: msg.frequency,
        targetPages: msg.targetPages,
      })),
    })
  } catch (err) {
    console.error('GET /v1/in-app-messages error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch in-app messages' })
  }
})

// Event tracking: SDK fires these when it actually shows/dismisses/clicks a message.
router.post('/in-app-messages/:id/event', async (req: ApiKeyAuthRequest, res: Response) => {
  try {
    const projectId = req.projectId
    if (!projectId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const messageId = req.params.id as string
    const { event, customer_id: externalId } = req.body as { event?: string; customer_id?: string }
    if (!event || !['shown', 'dismissed', 'cta_clicked'].includes(event)) {
      return res.status(400).json({ success: false, error: 'event must be shown | dismissed | cta_clicked' })
    }
    if (!externalId) return res.status(400).json({ success: false, error: 'customer_id required' })

    const [msg] = await db
      .select({ id: inAppMessages.id })
      .from(inAppMessages)
      .where(and(eq(inAppMessages.id, messageId), eq(inAppMessages.projectId, projectId)))
      .limit(1)
    if (!msg) return res.status(404).json({ success: false, error: 'Message not found' })

    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, externalId)))
      .limit(1)
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' })

    if (event === 'shown') {
      await db.insert(inAppMessageViews).values({ messageId, customerId: customer.id })
      await db
        .update(inAppMessages)
        .set({ impressions: sql`${inAppMessages.impressions} + 1` })
        .where(eq(inAppMessages.id, messageId))
    } else if (event === 'dismissed') {
      // Mark the most recent view for this customer + message as dismissed
      await db.execute(sql`
        UPDATE in_app_message_views
        SET dismissed_at = NOW()
        WHERE id = (
          SELECT id FROM in_app_message_views
          WHERE message_id = ${messageId} AND customer_id = ${customer.id} AND dismissed_at IS NULL
          ORDER BY shown_at DESC
          LIMIT 1
        )
      `)
      await db
        .update(inAppMessages)
        .set({ dismissals: sql`${inAppMessages.dismissals} + 1` })
        .where(eq(inAppMessages.id, messageId))
    } else {
      // cta_clicked
      await db.execute(sql`
        UPDATE in_app_message_views
        SET cta_clicked_at = NOW()
        WHERE id = (
          SELECT id FROM in_app_message_views
          WHERE message_id = ${messageId} AND customer_id = ${customer.id} AND cta_clicked_at IS NULL
          ORDER BY shown_at DESC
          LIMIT 1
        )
      `)
      await db
        .update(inAppMessages)
        .set({ ctaClicks: sql`${inAppMessages.ctaClicks} + 1` })
        .where(eq(inAppMessages.id, messageId))
    }

    res.json({ success: true })
  } catch (err) {
    console.error('POST /v1/in-app-messages/:id/event error:', err)
    res.status(500).json({ success: false, error: 'Failed to record event' })
  }
})

export default router
