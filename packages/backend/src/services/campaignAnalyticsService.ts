/**
 * Campaign Analytics Service
 *
 * Handles:
 * 1. Conversion goal tracking — match post-send events to campaign recipients
 * 2. Campaign analytics — delivery funnel, engagement timeline, revenue attribution
 * 3. A/B variant comparison
 */

import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import {
  campaigns,
  campaignSends,
  events,
  customers,
} from '../db/schema.js'

type ConversionGoal = {
  name: string
  eventName: string
  attributes?: Record<string, string>
}

type ConversionResult = {
  goalName: string
  eventName: string
  conversions: number
  conversionRate: number
  totalRecipients: number
  revenue: number
}

type DeliveryFunnel = {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  converted: number
  deliveryRate: number
  openRate: number
  clickRate: number
  bounceRate: number
  conversionRate: number
}

type EngagementTimeline = Array<{
  hour: string
  delivered: number
  opened: number
  clicked: number
}>

type CampaignAnalytics = {
  funnel: DeliveryFunnel
  conversions: ConversionResult[]
  timeline: EngagementTimeline
  topRecipients: Array<{
    customerId: string
    email: string
    name: string | null
    opened: boolean
    clicked: boolean
    converted: boolean
    revenue: number
  }>
  summary: {
    totalRevenue: number
    avgRevenuePerRecipient: number
    avgRevenuePerConversion: number
    bestPerformingGoal: string | null
  }
}

/**
 * Evaluate conversion goals for a sent campaign.
 * Looks for matching events from campaign recipients within the goal tracking window.
 */
export async function evaluateConversions(campaignId: string): Promise<ConversionResult[]> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!campaign || !campaign.sentAt) return []

  const goals = (campaign.conversionGoals ?? []) as ConversionGoal[]
  if (goals.length === 0) return []

  const trackingWindowEnd = new Date(
    campaign.sentAt.getTime() + (campaign.goalTrackingHours ?? 36) * 60 * 60 * 1000,
  )

  // Get all recipient customer IDs
  const recipients = await db
    .select({ customerId: campaignSends.customerId })
    .from(campaignSends)
    .where(eq(campaignSends.campaignId, campaignId))

  if (recipients.length === 0) return []
  const recipientIds = recipients.map(r => r.customerId)

  const results: ConversionResult[] = []

  for (const goal of goals) {
    // Find matching events from recipients within the tracking window
    const matchQuery = db
      .select({
        count: sql<number>`count(DISTINCT ${events.customerId})`,
        revenue: sql<number>`coalesce(sum(
          coalesce(
            (${events.properties}->>'order_total')::numeric,
            (${events.properties}->>'total')::numeric,
            (${events.properties}->>'amount')::numeric,
            (${events.properties}->>'revenue')::numeric,
            0
          )
        ), 0)`,
      })
      .from(events)
      .where(
        and(
          eq(events.projectId, campaign.projectId),
          eq(events.eventName, goal.eventName),
          inArray(events.customerId, recipientIds),
          gte(events.timestamp, campaign.sentAt!),
          lte(events.timestamp, trackingWindowEnd),
        ),
      )

    const [match] = await matchQuery

    const conversions = Number(match?.count ?? 0)
    const revenue = Number(match?.revenue ?? 0)

    results.push({
      goalName: goal.name,
      eventName: goal.eventName,
      conversions,
      conversionRate: campaign.totalRecipients > 0
        ? (conversions / campaign.totalRecipients) * 100
        : 0,
      totalRecipients: campaign.totalRecipients,
      revenue,
    })
  }

  return results
}

/**
 * Get full campaign analytics: funnel, timeline, conversions, top recipients.
 */
export async function getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics | null> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!campaign) return null

  // Delivery funnel
  const conversions = await evaluateConversions(campaignId)
  const totalConverted = conversions.reduce((sum, c) => sum + c.conversions, 0)
  const totalRevenue = conversions.reduce((sum, c) => sum + c.revenue, 0)

  const funnel: DeliveryFunnel = {
    sent: campaign.sentCount,
    delivered: campaign.deliveredCount,
    opened: campaign.openedCount,
    clicked: campaign.clickedCount,
    bounced: campaign.bouncedCount,
    complained: campaign.complainedCount,
    converted: totalConverted,
    deliveryRate: campaign.sentCount > 0
      ? (campaign.deliveredCount / campaign.sentCount) * 100 : 0,
    openRate: campaign.deliveredCount > 0
      ? (campaign.openedCount / campaign.deliveredCount) * 100 : 0,
    clickRate: campaign.openedCount > 0
      ? (campaign.clickedCount / campaign.openedCount) * 100 : 0,
    bounceRate: campaign.sentCount > 0
      ? (campaign.bouncedCount / campaign.sentCount) * 100 : 0,
    conversionRate: campaign.totalRecipients > 0
      ? (totalConverted / campaign.totalRecipients) * 100 : 0,
  }

  // Engagement timeline (hourly buckets after send)
  let timeline: EngagementTimeline = []
  if (campaign.sentAt) {
    const timelineRows = await db.execute(sql`
      SELECT
        date_trunc('hour', COALESCE(delivered_at, opened_at, clicked_at)) AS hour,
        COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
        COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked
      FROM campaign_sends
      WHERE campaign_id = ${campaignId}
        AND (delivered_at IS NOT NULL OR opened_at IS NOT NULL OR clicked_at IS NOT NULL)
      GROUP BY 1
      ORDER BY 1
      LIMIT 72
    `)

    timeline = (timelineRows as unknown as { rows?: Array<{ hour: string; delivered: string; opened: string; clicked: string }> }).rows?.map(r => ({
      hour: r.hour,
      delivered: Number(r.delivered),
      opened: Number(r.opened),
      clicked: Number(r.clicked),
    })) ?? []
  }

  // Top recipients (opened + clicked + converted)
  const topSends = await db
    .select({
      customerId: campaignSends.customerId,
      email: campaignSends.email,
      name: customers.name,
      openedAt: campaignSends.openedAt,
      clickedAt: campaignSends.clickedAt,
    })
    .from(campaignSends)
    .leftJoin(customers, eq(customers.id, campaignSends.customerId))
    .where(
      and(
        eq(campaignSends.campaignId, campaignId),
        sql`(${campaignSends.openedAt} IS NOT NULL OR ${campaignSends.clickedAt} IS NOT NULL)`,
      ),
    )
    .orderBy(desc(campaignSends.clickedAt))
    .limit(50)

  // Check which top recipients also converted
  const goals = (campaign.conversionGoals ?? []) as ConversionGoal[]
  const goalEventNames = goals.map(g => g.eventName)
  const topCustomerIds = topSends.map(s => s.customerId)

  let convertedSet = new Set<string>()
  let revenueMap = new Map<string, number>()

  if (goalEventNames.length > 0 && topCustomerIds.length > 0 && campaign.sentAt) {
    const trackingEnd = new Date(
      campaign.sentAt.getTime() + (campaign.goalTrackingHours ?? 36) * 60 * 60 * 1000,
    )

    const convEvents = await db
      .select({
        customerId: events.customerId,
        revenue: sql<number>`coalesce(
          (${events.properties}->>'order_total')::numeric,
          (${events.properties}->>'total')::numeric,
          (${events.properties}->>'amount')::numeric,
          0
        )`,
      })
      .from(events)
      .where(
        and(
          eq(events.projectId, campaign.projectId),
          inArray(events.eventName, goalEventNames),
          inArray(events.customerId, topCustomerIds),
          gte(events.timestamp, campaign.sentAt),
          lte(events.timestamp, trackingEnd),
        ),
      )

    for (const e of convEvents) {
      if (!e.customerId) continue
      convertedSet.add(e.customerId)
      revenueMap.set(e.customerId, (revenueMap.get(e.customerId) ?? 0) + Number(e.revenue ?? 0))
    }
  }

  const topRecipients = topSends.map(s => ({
    customerId: s.customerId,
    email: s.email,
    name: s.name,
    opened: !!s.openedAt,
    clicked: !!s.clickedAt,
    converted: convertedSet.has(s.customerId),
    revenue: revenueMap.get(s.customerId) ?? 0,
  }))

  const bestGoal = conversions.length > 0
    ? conversions.reduce((best, c) => c.conversions > best.conversions ? c : best, conversions[0])
    : null

  return {
    funnel,
    conversions,
    timeline,
    topRecipients,
    summary: {
      totalRevenue,
      avgRevenuePerRecipient: campaign.totalRecipients > 0
        ? totalRevenue / campaign.totalRecipients : 0,
      avgRevenuePerConversion: totalConverted > 0
        ? totalRevenue / totalConverted : 0,
      bestPerformingGoal: bestGoal?.goalName ?? null,
    },
  }
}

/**
 * Compare A/B variants for a campaign.
 * Variant is stored in campaignSends metadata (variant 'A' or 'B').
 */
export async function compareAbVariants(campaignId: string): Promise<{
  variantA: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number }
  variantB: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number }
  winner: 'A' | 'B' | 'tie'
  confidence: number
} | null> {
  const rows = await db.execute(sql`
    SELECT
      COALESCE(
        (properties->>'variant'),
        CASE WHEN ROW_NUMBER() OVER (ORDER BY id) <= (COUNT(*) OVER ()) / 2 THEN 'A' ELSE 'B' END
      ) AS variant,
      COUNT(*) AS sent,
      COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked
    FROM campaign_sends
    WHERE campaign_id = ${campaignId}
    GROUP BY 1
  `)

  const variants = (rows as unknown as { rows?: Array<{ variant: string; sent: string; opened: string; clicked: string }> }).rows ?? []
  const a = variants.find(v => v.variant === 'A')
  const b = variants.find(v => v.variant === 'B')

  if (!a || !b) return null

  const aStats = {
    sent: Number(a.sent),
    opened: Number(a.opened),
    clicked: Number(a.clicked),
    openRate: Number(a.sent) > 0 ? (Number(a.opened) / Number(a.sent)) * 100 : 0,
    clickRate: Number(a.opened) > 0 ? (Number(a.clicked) / Number(a.opened)) * 100 : 0,
  }

  const bStats = {
    sent: Number(b.sent),
    opened: Number(b.opened),
    clicked: Number(b.clicked),
    openRate: Number(b.sent) > 0 ? (Number(b.opened) / Number(b.sent)) * 100 : 0,
    clickRate: Number(b.opened) > 0 ? (Number(b.clicked) / Number(b.opened)) * 100 : 0,
  }

  // Simple z-test for open rate difference
  const p1 = aStats.openRate / 100
  const p2 = bStats.openRate / 100
  const n1 = aStats.sent
  const n2 = bStats.sent
  const pPooled = (p1 * n1 + p2 * n2) / (n1 + n2)
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2))
  const z = se > 0 ? Math.abs(p1 - p2) / se : 0
  // Approximate confidence from z-score
  const confidence = Math.min(z / 3 * 100, 99.9) // rough approximation

  const winner = aStats.openRate > bStats.openRate + 1 ? 'A'
    : bStats.openRate > aStats.openRate + 1 ? 'B'
    : 'tie'

  return { variantA: aStats, variantB: bStats, winner, confidence }
}
