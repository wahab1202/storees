import { Router, Response } from 'express'
import { eq, and, sql, isNull, or, gte, lte, inArray } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { campaigns, emailTemplates, customers, campaignSends } from '../db/schema.js'
import { filterToSql } from '@storees/segments'
import type { FilterConfig } from '@storees/shared'
import { requirePublicKeyAuth, type ApiKeyAuthRequest } from '../middleware/apiKeyAuth.js'

// Gap 1: public SDK endpoints for in-app messages. After the 0049
// refactor, in-app messages are just campaigns with channel='in_app'
// linked to a template (channel='in_app') — same shape as every other
// channel. This endpoint joins those two tables and returns what the
// SDK should render right now.
//
// GET  /api/v1/in-app-messages?customer_id=<external_id>
//   → list of active in-app campaigns this customer should see, after
//     audience filter + frequency + dismissal history is applied.
//
// POST /api/v1/in-app-messages/:campaign_id/event
//   body: { event: 'shown' | 'dismissed' | 'cta_clicked', customer_id }
//   → records the event in campaign_sends so the SDK can dedup + admin
//     analytics see real numbers.

const router = Router()
router.use(requirePublicKeyAuth())

type CampaignWithTemplate = {
  campaignId: string
  campaignStatus: string
  audienceFilter: unknown
  scheduledAt: Date | null
  endsAt: Date | null
  templateTitle: string | null
  templateBody: string | null
  templateImageUrl: string | null
  templateCtaLabel: string | null
  templateCtaUrl: string | null
  position: string | null
  frequency: string | null
  targetPages: unknown
}

router.get('/in-app-messages', async (req: ApiKeyAuthRequest, res: Response) => {
  try {
    const projectId = req.projectId
    if (!projectId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const externalId = (req.query.customer_id as string | undefined)?.trim()

    // Base query: active in-app campaigns + their linked template
    const baseConditions = and(
      eq(campaigns.projectId, projectId),
      eq(campaigns.channel, 'in_app'),
      // Active = either 'scheduled' with no end, or 'sent' (still live), or
      // explicit 'active' — match by NOT in the dead states.
      sql`${campaigns.status} NOT IN ('draft', 'paused', 'cancelled', 'failed', 'archived')`,
      or(isNull(campaigns.scheduledAt), lte(campaigns.scheduledAt, sql`NOW()`)),
    )

    // No customer id → only globally-targetable campaigns (no audience filter)
    if (!externalId) {
      const rows = await db
        .select({
          campaignId: campaigns.id,
          templateTitle: emailTemplates.subject,
          templateBody: emailTemplates.bodyText,
          templateImageUrl: emailTemplates.imageUrl,
          templateCtaLabel: emailTemplates.ctaLabel,
          templateCtaUrl: emailTemplates.ctaUrl,
          position: emailTemplates.inAppPosition,
          frequency: emailTemplates.inAppFrequency,
          targetPages: emailTemplates.inAppTargetPages,
        })
        .from(campaigns)
        .innerJoin(emailTemplates, eq(emailTemplates.id, campaigns.templateId))
        .where(and(
          baseConditions,
          isNull(campaigns.audienceFilter),
        ))
      return res.json({ success: true, data: rows.map((r) => ({ id: r.campaignId, ...r, campaignId: undefined })) })
    }

    // Resolve external_id → internal customer.id
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, externalId)))
      .limit(1)
    if (!customer) return res.json({ success: true, data: [] })

    const candidates: CampaignWithTemplate[] = await db
      .select({
        campaignId: campaigns.id,
        campaignStatus: campaigns.status,
        audienceFilter: campaigns.audienceFilter,
        scheduledAt: campaigns.scheduledAt,
        endsAt: sql<Date | null>`NULL`,  // campaigns don't carry endsAt yet; defer
        templateTitle: emailTemplates.subject,
        templateBody: emailTemplates.bodyText,
        templateImageUrl: emailTemplates.imageUrl,
        templateCtaLabel: emailTemplates.ctaLabel,
        templateCtaUrl: emailTemplates.ctaUrl,
        position: emailTemplates.inAppPosition,
        frequency: emailTemplates.inAppFrequency,
        targetPages: emailTemplates.inAppTargetPages,
      })
      .from(campaigns)
      .innerJoin(emailTemplates, eq(emailTemplates.id, campaigns.templateId))
      .where(baseConditions)

    if (candidates.length === 0) return res.json({ success: true, data: [] })

    // Per-customer view history. campaign_sends.openedAt = "shown" for in-app;
    // clickedAt = "cta_clicked"; bouncedAt repurposed as "dismissed" since
    // in-app messages don't bounce.
    const campaignIds = candidates.map((c) => c.campaignId)
    const views = await db
      .select({
        campaignId: campaignSends.campaignId,
        openedAt: campaignSends.openedAt,
        bouncedAt: campaignSends.bouncedAt,
      })
      .from(campaignSends)
      .where(and(
        eq(campaignSends.customerId, customer.id),
        inArray(campaignSends.campaignId, campaignIds),
      ))

    const viewMap = new Map<string, { shownAt: Date | null; dismissedAt: Date | null }[]>()
    for (const v of views) {
      const list = viewMap.get(v.campaignId) ?? []
      list.push({ shownAt: v.openedAt, dismissedAt: v.bouncedAt })
      viewMap.set(v.campaignId, list)
    }

    const now = new Date()
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

    const eligible: CampaignWithTemplate[] = []
    for (const c of candidates) {
      const history = viewMap.get(c.campaignId) ?? []
      const freq = c.frequency ?? 'once'
      if (freq === 'once') {
        if (history.some((v) => v.shownAt !== null)) continue
      } else if (freq === 'daily') {
        if (history.some((v) => v.shownAt !== null && v.shownAt >= todayStart)) continue
      } else {
        // 'always' — stop if explicitly dismissed
        if (history.some((v) => v.dismissedAt !== null)) continue
      }

      if (c.audienceFilter) {
        const filterSql = filterToSql(c.audienceFilter as FilterConfig)
        const [match] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.id, customer.id), filterSql))
          .limit(1)
        if (!match) continue
      }

      eligible.push(c)
    }

    res.json({
      success: true,
      data: eligible.map((c) => ({
        id: c.campaignId,
        title: c.templateTitle,
        body: c.templateBody,
        imageUrl: c.templateImageUrl,
        ctaLabel: c.templateCtaLabel,
        ctaUrl: c.templateCtaUrl,
        position: c.position,
        frequency: c.frequency,
        targetPages: c.targetPages,
      })),
    })
  } catch (err) {
    console.error('GET /v1/in-app-messages error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch in-app messages' })
  }
})

// Event tracking: stored on campaign_sends. shown→insert+openedAt;
// dismissed→bouncedAt (repurposed); cta_clicked→clickedAt.
router.post('/in-app-messages/:campaign_id/event', async (req: ApiKeyAuthRequest, res: Response) => {
  try {
    const projectId = req.projectId
    if (!projectId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const campaignId = req.params.campaign_id as string
    const { event, customer_id: externalId } = req.body as { event?: string; customer_id?: string }
    if (!event || !['shown', 'dismissed', 'cta_clicked'].includes(event)) {
      return res.status(400).json({ success: false, error: 'event must be shown | dismissed | cta_clicked' })
    }
    if (!externalId) return res.status(400).json({ success: false, error: 'customer_id required' })

    const [campaign] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.projectId, projectId), eq(campaigns.channel, 'in_app')))
      .limit(1)
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' })

    const [customer] = await db
      .select({ id: customers.id, email: customers.email })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, externalId)))
      .limit(1)
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' })

    if (event === 'shown') {
      // First time shown → insert. Subsequent shows for 'always' frequency
      // update openedAt to the latest time.
      await db.execute(sql`
        INSERT INTO campaign_sends (campaign_id, customer_id, email, status, opened_at, created_at)
        VALUES (${campaignId}, ${customer.id}, ${customer.email ?? ''}, 'delivered', NOW(), NOW())
        ON CONFLICT (campaign_id, customer_id) DO UPDATE
          SET opened_at = NOW()
      `)
    } else if (event === 'dismissed') {
      await db.execute(sql`
        UPDATE campaign_sends SET bounced_at = NOW()
        WHERE campaign_id = ${campaignId} AND customer_id = ${customer.id}
      `)
    } else {
      await db.execute(sql`
        UPDATE campaign_sends SET clicked_at = NOW()
        WHERE campaign_id = ${campaignId} AND customer_id = ${customer.id}
      `)
    }

    res.json({ success: true })
  } catch (err) {
    console.error('POST /v1/in-app-messages/:campaign_id/event error:', err)
    res.status(500).json({ success: false, error: 'Failed to record event' })
  }
})

export default router
