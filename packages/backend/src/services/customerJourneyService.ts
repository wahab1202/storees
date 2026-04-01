import { eq, and, desc, sql, gte } from 'drizzle-orm'
import { db } from '../db/connection.js'
import {
  customers,
  events,
  campaignSends,
  campaigns,
  flowTrips,
  flows,
  messages,
  customerSegments,
  segments,
  orders,
} from '../db/schema.js'

/* ─── Unified timeline entry ─── */

export type JourneyEntryType =
  | 'event'
  | 'campaign_sent'
  | 'campaign_opened'
  | 'campaign_clicked'
  | 'flow_entered'
  | 'flow_exited'
  | 'segment_joined'
  | 'order'
  | 'message'

export type JourneyEntry = {
  id: string
  type: JourneyEntryType
  timestamp: string
  title: string
  subtitle: string | null
  meta: Record<string, unknown>
}

export type ActivitySummary = {
  engagementScore: number          // 0–100
  totalEvents: number
  totalOrders: number
  totalCampaignsReceived: number
  totalFlowTrips: number
  channelBreakdown: Record<string, number> // email: 12, sms: 3, push: 1
  weeklyActivity: Array<{ week: string; count: number }> // last 8 weeks
  topEvents: Array<{ eventName: string; count: number }>  // top 5 event types
  firstSeen: string | null
  lastSeen: string | null
  daysSinceLastActive: number | null
}

/* ─── Journey Timeline ─── */

export async function getCustomerJourney(
  customerId: string,
  options: { limit?: number; offset?: number; types?: JourneyEntryType[] } = {},
): Promise<JourneyEntry[]> {
  const limit = Math.min(options.limit ?? 100, 500)
  const offset = options.offset ?? 0
  const typeFilter = options.types

  const entries: JourneyEntry[] = []

  // Run all queries in parallel
  const [
    eventRows,
    sendRows,
    tripRows,
    segmentRows,
    orderRows,
    messageRows,
  ] = await Promise.all([
    // Events
    (!typeFilter || typeFilter.includes('event'))
      ? db.select({
          id: events.id,
          eventName: events.eventName,
          properties: events.properties,
          timestamp: events.timestamp,
          source: events.source,
        })
        .from(events)
        .where(eq(events.customerId, customerId))
        .orderBy(desc(events.timestamp))
        .limit(200)
      : Promise.resolve([]),

    // Campaign sends (with campaign name)
    (!typeFilter || typeFilter.some(t => t.startsWith('campaign_')))
      ? db.select({
          id: campaignSends.id,
          campaignName: campaigns.name,
          campaignChannel: campaigns.channel,
          status: campaignSends.status,
          sentAt: campaignSends.sentAt,
          openedAt: campaignSends.openedAt,
          clickedAt: campaignSends.clickedAt,
          variant: campaignSends.variant,
        })
        .from(campaignSends)
        .innerJoin(campaigns, eq(campaigns.id, campaignSends.campaignId))
        .where(eq(campaignSends.customerId, customerId))
        .orderBy(desc(campaignSends.sentAt))
        .limit(100)
      : Promise.resolve([]),

    // Flow trips (with flow name)
    (!typeFilter || typeFilter.some(t => t.startsWith('flow_')))
      ? db.select({
          id: flowTrips.id,
          flowName: flows.name,
          status: flowTrips.status,
          enteredAt: flowTrips.enteredAt,
          exitedAt: flowTrips.exitedAt,
        })
        .from(flowTrips)
        .innerJoin(flows, eq(flows.id, flowTrips.flowId))
        .where(eq(flowTrips.customerId, customerId))
        .orderBy(desc(flowTrips.enteredAt))
        .limit(50)
      : Promise.resolve([]),

    // Segment joins
    (!typeFilter || typeFilter.includes('segment_joined'))
      ? db.select({
          segmentId: customerSegments.segmentId,
          segmentName: segments.name,
          joinedAt: customerSegments.joinedAt,
        })
        .from(customerSegments)
        .innerJoin(segments, eq(segments.id, customerSegments.segmentId))
        .where(eq(customerSegments.customerId, customerId))
      : Promise.resolve([]),

    // Orders
    (!typeFilter || typeFilter.includes('order'))
      ? db.select({
          id: orders.id,
          externalOrderId: orders.externalOrderId,
          total: orders.total,
          currency: orders.currency,
          status: orders.status,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.customerId, customerId))
        .orderBy(desc(orders.createdAt))
        .limit(50)
      : Promise.resolve([]),

    // Messages (non-campaign, e.g. flow-triggered or transactional)
    (!typeFilter || typeFilter.includes('message'))
      ? db.select({
          id: messages.id,
          channel: messages.channel,
          messageType: messages.messageType,
          status: messages.status,
          sentAt: messages.sentAt,
          campaignId: messages.campaignId,
          flowTripId: messages.flowTripId,
        })
        .from(messages)
        .where(eq(messages.customerId, customerId))
        .orderBy(desc(messages.sentAt))
        .limit(100)
      : Promise.resolve([]),
  ])

  // Map events — skip standard tracked events that will show as orders/campaigns
  for (const e of eventRows) {
    entries.push({
      id: e.id,
      type: 'event',
      timestamp: (e.timestamp as Date).toISOString(),
      title: formatEventName(e.eventName),
      subtitle: e.source ?? null,
      meta: { eventName: e.eventName, properties: e.properties, source: e.source },
    })
  }

  // Map campaign sends → separate entries for sent, opened, clicked
  for (const s of sendRows) {
    if (s.sentAt && (!typeFilter || typeFilter.includes('campaign_sent'))) {
      entries.push({
        id: `${s.id}-sent`,
        type: 'campaign_sent',
        timestamp: (s.sentAt as Date).toISOString(),
        title: `Campaign sent: ${s.campaignName}`,
        subtitle: s.variant ? `Variant ${s.variant}` : null,
        meta: { campaignName: s.campaignName, channel: s.campaignChannel, status: s.status },
      })
    }
    if (s.openedAt && (!typeFilter || typeFilter.includes('campaign_opened'))) {
      entries.push({
        id: `${s.id}-opened`,
        type: 'campaign_opened',
        timestamp: (s.openedAt as Date).toISOString(),
        title: `Opened: ${s.campaignName}`,
        subtitle: null,
        meta: { campaignName: s.campaignName },
      })
    }
    if (s.clickedAt && (!typeFilter || typeFilter.includes('campaign_clicked'))) {
      entries.push({
        id: `${s.id}-clicked`,
        type: 'campaign_clicked',
        timestamp: (s.clickedAt as Date).toISOString(),
        title: `Clicked: ${s.campaignName}`,
        subtitle: null,
        meta: { campaignName: s.campaignName },
      })
    }
  }

  // Map flow trips → entered + exited
  for (const t of tripRows) {
    if (t.enteredAt && (!typeFilter || typeFilter.includes('flow_entered'))) {
      entries.push({
        id: `${t.id}-enter`,
        type: 'flow_entered',
        timestamp: (t.enteredAt as Date).toISOString(),
        title: `Entered flow: ${t.flowName}`,
        subtitle: `Status: ${t.status}`,
        meta: { flowName: t.flowName, status: t.status },
      })
    }
    if (t.exitedAt && (!typeFilter || typeFilter.includes('flow_exited'))) {
      entries.push({
        id: `${t.id}-exit`,
        type: 'flow_exited',
        timestamp: (t.exitedAt as Date).toISOString(),
        title: `Exited flow: ${t.flowName}`,
        subtitle: `Status: ${t.status}`,
        meta: { flowName: t.flowName, status: t.status },
      })
    }
  }

  // Map segment joins
  for (const s of segmentRows) {
    if (s.joinedAt) {
      entries.push({
        id: `seg-${s.segmentId}`,
        type: 'segment_joined',
        timestamp: (s.joinedAt as Date).toISOString(),
        title: `Joined segment: ${s.segmentName}`,
        subtitle: null,
        meta: { segmentName: s.segmentName, segmentId: s.segmentId },
      })
    }
  }

  // Map orders
  for (const o of orderRows) {
    entries.push({
      id: o.id,
      type: 'order',
      timestamp: (o.createdAt as Date).toISOString(),
      title: `Order ${o.externalOrderId ?? o.id.slice(0, 8)}`,
      subtitle: `${o.currency ?? 'INR'} ${Number(o.total ?? 0).toFixed(2)}`,
      meta: { externalOrderId: o.externalOrderId, total: Number(o.total ?? 0), currency: o.currency, status: o.status },
    })
  }

  // Map messages (flow-triggered only, skip campaign messages to avoid duplication)
  for (const m of messageRows) {
    if (m.campaignId) continue // already shown as campaign_sent
    if (m.sentAt) {
      entries.push({
        id: m.id,
        type: 'message',
        timestamp: (m.sentAt as Date).toISOString(),
        title: `${capitalize(m.channel)} ${m.messageType} message`,
        subtitle: `Status: ${m.status}`,
        meta: { channel: m.channel, messageType: m.messageType, status: m.status, flowTripId: m.flowTripId },
      })
    }
  }

  // Sort by timestamp descending
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Apply pagination
  return entries.slice(offset, offset + limit)
}

/* ─── Activity Summary ─── */

export async function getActivitySummary(customerId: string): Promise<ActivitySummary> {
  const [
    customer,
    eventCount,
    orderCount,
    campaignCount,
    tripCount,
    channelCounts,
    weeklyEvents,
    topEventTypes,
  ] = await Promise.all([
    // Customer record
    db.select({ firstSeen: customers.firstSeen, lastSeen: customers.lastSeen })
      .from(customers).where(eq(customers.id, customerId)).limit(1)
      .then(r => r[0] ?? null),

    // Total events
    db.select({ count: sql<number>`count(*)::int` })
      .from(events).where(eq(events.customerId, customerId))
      .then(r => r[0]?.count ?? 0),

    // Total orders
    db.select({ count: sql<number>`count(*)::int` })
      .from(orders).where(eq(orders.customerId, customerId))
      .then(r => r[0]?.count ?? 0),

    // Total campaign sends
    db.select({ count: sql<number>`count(*)::int` })
      .from(campaignSends).where(eq(campaignSends.customerId, customerId))
      .then(r => r[0]?.count ?? 0),

    // Total flow trips
    db.select({ count: sql<number>`count(*)::int` })
      .from(flowTrips).where(eq(flowTrips.customerId, customerId))
      .then(r => r[0]?.count ?? 0),

    // Channel breakdown from messages
    db.select({
      channel: messages.channel,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(eq(messages.customerId, customerId))
    .groupBy(messages.channel)
    .then(rows => {
      const map: Record<string, number> = {}
      for (const r of rows) map[r.channel] = r.count
      return map
    }),

    // Weekly event counts (last 8 weeks)
    db.select({
      week: sql<string>`to_char(date_trunc('week', ${events.timestamp}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(events)
    .where(
      and(
        eq(events.customerId, customerId),
        gte(events.timestamp, sql`now() - interval '8 weeks'`),
      ),
    )
    .groupBy(sql`date_trunc('week', ${events.timestamp})`)
    .orderBy(sql`date_trunc('week', ${events.timestamp})`)
    .then(rows => rows.map(r => ({ week: r.week, count: r.count }))),

    // Top 5 event types
    db.select({
      eventName: events.eventName,
      count: sql<number>`count(*)::int`,
    })
    .from(events)
    .where(eq(events.customerId, customerId))
    .groupBy(events.eventName)
    .orderBy(sql`count(*) desc`)
    .limit(5),
  ])

  const lastSeen = customer?.lastSeen ? new Date(customer.lastSeen as unknown as string) : null
  const daysSinceLastActive = lastSeen
    ? Math.floor((Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Engagement score: composite of recency, frequency, breadth
  const engagementScore = computeEngagementScore({
    daysSinceLastActive,
    totalEvents: eventCount,
    totalOrders: orderCount,
    totalCampaignsReceived: campaignCount,
    channelCount: Object.keys(channelCounts).length,
  })

  return {
    engagementScore,
    totalEvents: eventCount,
    totalOrders: orderCount,
    totalCampaignsReceived: campaignCount,
    totalFlowTrips: tripCount,
    channelBreakdown: channelCounts,
    weeklyActivity: weeklyEvents,
    topEvents: topEventTypes,
    firstSeen: customer?.firstSeen ? (customer.firstSeen as Date).toISOString() : null,
    lastSeen: customer?.lastSeen ? (customer.lastSeen as Date).toISOString() : null,
    daysSinceLastActive,
  }
}

/* ─── Helpers ─── */

function computeEngagementScore(params: {
  daysSinceLastActive: number | null
  totalEvents: number
  totalOrders: number
  totalCampaignsReceived: number
  channelCount: number
}): number {
  const { daysSinceLastActive, totalEvents, totalOrders, totalCampaignsReceived, channelCount } = params

  // Recency score (0-30 points): more recent = higher
  let recencyScore = 0
  if (daysSinceLastActive !== null) {
    if (daysSinceLastActive <= 1) recencyScore = 30
    else if (daysSinceLastActive <= 7) recencyScore = 25
    else if (daysSinceLastActive <= 14) recencyScore = 20
    else if (daysSinceLastActive <= 30) recencyScore = 15
    else if (daysSinceLastActive <= 60) recencyScore = 8
    else recencyScore = 2
  }

  // Frequency score (0-35 points): based on total events
  const freqScore = Math.min(35, Math.round(Math.log2(totalEvents + 1) * 5))

  // Monetary score (0-20 points): based on orders
  const monetaryScore = Math.min(20, totalOrders * 4)

  // Channel breadth (0-15 points): multi-channel = more engaged
  const channelScore = Math.min(15, channelCount * 5)

  return Math.min(100, recencyScore + freqScore + monetaryScore + channelScore)
}

function formatEventName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
