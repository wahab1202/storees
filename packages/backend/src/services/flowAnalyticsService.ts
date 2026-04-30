import { eq, and, sql, gte, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { flows, flowTrips, events, orders, customers, messages } from '../db/schema.js'

/* ─── Types ─── */

export type FlowAnalytics = {
  overview: {
    totalTrips: number
    activeTrips: number
    completedTrips: number
    exitedTrips: number
    completionRate: number
    avgTimeToCompleteHours: number | null
  }
  nodeFunnel: Array<{
    nodeId: string
    nodeType: string
    label: string
    entered: number
    exited: number
    dropOffRate: number
  }>
  weeklyTrips: Array<{
    week: string
    entered: number
    completed: number
    exited: number
  }>
  recentTrips: Array<{
    tripId: string
    customerId: string
    customerName: string | null
    customerEmail: string | null
    status: string
    currentNodeId: string
    enteredAt: string
    exitedAt: string | null
  }>
  messageStats: {
    totalSent: number
    delivered: number
    opened: number
    clicked: number
    failed: number
    deliveryRate: number
    openRate: number
    clickRate: number
    bounceRate: number
    byChannel: Array<{
      channel: string
      sent: number
      delivered: number
      opened: number
      clicked: number
      failed: number
      deliveryRate: number
      openRate: number
      clickRate: number
      bounceRate: number
    }>
  }
}

/* ─── Main analytics function ─── */

export async function getFlowAnalytics(flowId: string): Promise<FlowAnalytics> {
  // First get the flow to access its nodes
  const [flow] = await db.select().from(flows).where(eq(flows.id, flowId)).limit(1)
  if (!flow) throw new Error('Flow not found')

  const nodes = (flow.nodes as Array<{ id: string; type: string; config?: Record<string, unknown> }>) ?? []

  const [
    tripStats,
    avgCompletion,
    nodeDistribution,
    weeklyData,
    recentTripRows,
    msgStats,
  ] = await Promise.all([
    // Trip status counts
    db.select({
      status: flowTrips.status,
      count: sql<number>`count(*)::int`,
    })
    .from(flowTrips)
    .where(eq(flowTrips.flowId, flowId))
    .groupBy(flowTrips.status),

    // Average time to complete (completed trips only)
    db.select({
      avgHours: sql<number>`avg(extract(epoch from (${flowTrips.exitedAt} - ${flowTrips.enteredAt})) / 3600)::float`,
    })
    .from(flowTrips)
    .where(and(eq(flowTrips.flowId, flowId), eq(flowTrips.status, 'completed')))
    .then(r => r[0]?.avgHours ?? null),

    // Current node distribution (where trips are now or stopped)
    db.select({
      nodeId: flowTrips.currentNodeId,
      status: flowTrips.status,
      count: sql<number>`count(*)::int`,
    })
    .from(flowTrips)
    .where(eq(flowTrips.flowId, flowId))
    .groupBy(flowTrips.currentNodeId, flowTrips.status),

    // Weekly trip entries (last 8 weeks)
    db.select({
      week: sql<string>`to_char(date_trunc('week', ${flowTrips.enteredAt}), 'YYYY-MM-DD')`,
      status: flowTrips.status,
      count: sql<number>`count(*)::int`,
    })
    .from(flowTrips)
    .where(
      and(
        eq(flowTrips.flowId, flowId),
        gte(flowTrips.enteredAt, sql`now() - interval '8 weeks'`),
      ),
    )
    .groupBy(sql`date_trunc('week', ${flowTrips.enteredAt})`, flowTrips.status)
    .orderBy(sql`date_trunc('week', ${flowTrips.enteredAt})`),

    // Recent 20 trips with customer info
    db.select({
      tripId: flowTrips.id,
      customerId: flowTrips.customerId,
      customerName: customers.name,
      customerEmail: customers.email,
      status: flowTrips.status,
      currentNodeId: flowTrips.currentNodeId,
      enteredAt: flowTrips.enteredAt,
      exitedAt: flowTrips.exitedAt,
    })
    .from(flowTrips)
    .innerJoin(customers, eq(customers.id, flowTrips.customerId))
    .where(eq(flowTrips.flowId, flowId))
    .orderBy(desc(flowTrips.enteredAt))
    .limit(20),

    // Per-channel message engagement — read implies delivered, clicked implies read,
    // so "delivered" is the union of any later-state timestamp being set.
    db.select({
      channel: messages.channel,
      sent: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) filter (where ${messages.deliveredAt} is not null or ${messages.readAt} is not null or ${messages.clickedAt} is not null)::int`,
      opened: sql<number>`count(*) filter (where ${messages.readAt} is not null or ${messages.clickedAt} is not null)::int`,
      clicked: sql<number>`count(*) filter (where ${messages.clickedAt} is not null)::int`,
      failed: sql<number>`count(*) filter (where ${messages.failedAt} is not null)::int`,
    })
    .from(messages)
    .innerJoin(flowTrips, eq(flowTrips.id, messages.flowTripId))
    .where(eq(flowTrips.flowId, flowId))
    .groupBy(messages.channel),
  ])

  // Build overview
  const statusMap: Record<string, number> = {}
  for (const s of tripStats) statusMap[s.status] = s.count
  const totalTrips = Object.values(statusMap).reduce((a, b) => a + b, 0)
  const completedTrips = statusMap['completed'] ?? 0
  const exitedTrips = statusMap['exited'] ?? 0
  const activeTrips = (statusMap['active'] ?? 0) + (statusMap['waiting'] ?? 0)

  // Build node funnel
  // For each node in order, count how many trips reached it vs how many left
  const nodeCountMap: Record<string, { entered: number; exited: number }> = {}
  for (const d of nodeDistribution) {
    if (!nodeCountMap[d.nodeId]) nodeCountMap[d.nodeId] = { entered: 0, exited: 0 }
    nodeCountMap[d.nodeId].entered += d.count
    if (d.status === 'exited' || d.status === 'completed') {
      nodeCountMap[d.nodeId].exited += d.count
    }
  }

  const nodeFunnel = nodes.map(node => {
    const stats = nodeCountMap[node.id] ?? { entered: 0, exited: 0 }
    const label = getNodeLabel(node)
    return {
      nodeId: node.id,
      nodeType: node.type,
      label,
      entered: stats.entered,
      exited: stats.exited,
      dropOffRate: stats.entered > 0 ? ((stats.entered - stats.exited) / stats.entered) * 100 : 0,
    }
  })

  // Build weekly data
  const weekMap: Record<string, { entered: number; completed: number; exited: number }> = {}
  for (const w of weeklyData) {
    if (!weekMap[w.week]) weekMap[w.week] = { entered: 0, completed: 0, exited: 0 }
    weekMap[w.week].entered += w.count
    if (w.status === 'completed') weekMap[w.week].completed += w.count
    if (w.status === 'exited') weekMap[w.week].exited += w.count
  }
  const weeklyTrips = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => ({ week, ...data }))

  // Aggregate per-channel rows into totals + a normalized per-channel breakdown
  const pct = (num: number, den: number) => den > 0 ? (num / den) * 100 : 0
  const byChannel = msgStats.map(r => ({
    channel: r.channel,
    sent: r.sent,
    delivered: r.delivered,
    opened: r.opened,
    clicked: r.clicked,
    failed: r.failed,
    deliveryRate: pct(r.delivered, r.sent),
    openRate: pct(r.opened, r.delivered),
    clickRate: pct(r.clicked, r.opened),
    bounceRate: pct(r.failed, r.sent),
  }))
  const totalMsgSent = byChannel.reduce((a, c) => a + c.sent, 0)
  const delivered = byChannel.reduce((a, c) => a + c.delivered, 0)
  const opened = byChannel.reduce((a, c) => a + c.opened, 0)
  const clicked = byChannel.reduce((a, c) => a + c.clicked, 0)
  const failed = byChannel.reduce((a, c) => a + c.failed, 0)

  return {
    overview: {
      totalTrips,
      activeTrips,
      completedTrips,
      exitedTrips,
      completionRate: totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0,
      avgTimeToCompleteHours: avgCompletion ? Math.round(avgCompletion * 10) / 10 : null,
    },
    nodeFunnel,
    weeklyTrips,
    recentTrips: recentTripRows.map(t => ({
      tripId: t.tripId,
      customerId: t.customerId,
      customerName: t.customerName,
      customerEmail: t.customerEmail,
      status: t.status,
      currentNodeId: t.currentNodeId,
      enteredAt: (t.enteredAt as Date).toISOString(),
      exitedAt: t.exitedAt ? (t.exitedAt as Date).toISOString() : null,
    })),
    messageStats: {
      totalSent: totalMsgSent,
      delivered,
      opened,
      clicked,
      failed,
      deliveryRate: pct(delivered, totalMsgSent),
      openRate: pct(opened, delivered),
      clickRate: pct(clicked, opened),
      bounceRate: pct(failed, totalMsgSent),
      byChannel,
    },
  }
}

/* ─── Helpers ─── */

function getNodeLabel(node: { id: string; type: string; config?: Record<string, unknown> }): string {
  switch (node.type) {
    case 'trigger': return 'Trigger'
    case 'delay': {
      const cfg = node.config as { value?: number; unit?: string } | undefined
      return cfg ? `Wait ${cfg.value ?? 0} ${cfg.unit ?? 'hours'}` : 'Delay'
    }
    case 'condition': {
      const cfg = node.config as { check?: string } | undefined
      return cfg?.check ? `Check: ${cfg.check}` : 'Condition'
    }
    case 'action': {
      const cfg = node.config as { actionType?: string } | undefined
      return cfg?.actionType?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? 'Action'
    }
    case 'end': return 'End'
    default: return node.type
  }
}
