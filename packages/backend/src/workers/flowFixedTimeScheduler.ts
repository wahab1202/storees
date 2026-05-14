/**
 * Flow Fixed-Time Scheduler — Gap 11 (Storees → MoEngage).
 *
 * Polls every 60 seconds for active flows with triggerConfig.kind='fixed_time'
 * whose schedule matches the current minute. For each matching flow, enrolls
 * every customer the audienceFilter resolves to into a fresh trip.
 *
 * Idempotency: we stamp last_fired_at on the flow row (via metadata jsonb)
 * so the same one-minute boundary doesn't double-enroll. A 60-second poll
 * window with a same-minute guard is sufficient — at most one fire per
 * configured fixed-time window per flow.
 */

import { db } from '../db/connection.js'
import { flows, flowTrips, customers, events } from '../db/schema.js'
import { eq, and, sql } from 'drizzle-orm'
import { flowActionsQueue } from '../services/queue.js'
import { filterToSql } from '@storees/segments'
import type { FlowNode, FilterConfig, TriggerConfig } from '@storees/shared'

const POLL_INTERVAL_MS = 60_000

function isFixedTimeDue(schedule: NonNullable<TriggerConfig['fixedTimeSchedule']>, now: Date): boolean {
  const [hh, mm] = (schedule.time ?? '00:00').split(':').map((s) => parseInt(s, 10))
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false
  // Compare in the project's tz if specified, else UTC.
  // For MVP we use UTC consistently — proper IANA tz handling is a later improvement.
  if (now.getUTCHours() !== hh || now.getUTCMinutes() !== mm) return false
  switch (schedule.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return schedule.dayOfWeek === undefined || now.getUTCDay() === schedule.dayOfWeek
    case 'monthly':
      return schedule.dayOfMonth === undefined || now.getUTCDate() === schedule.dayOfMonth
    default:
      return false
  }
}

async function fireFixedTimeFlow(flow: {
  id: string
  projectId: string
  triggerConfig: TriggerConfig
  nodes: FlowNode[]
}): Promise<void> {
  const triggerNode = flow.nodes.find((n) => n.type === 'trigger')
  if (!triggerNode) return

  const audience = flow.triggerConfig.audienceFilter as FilterConfig | undefined
  if (!audience || audience.rules.length === 0) {
    console.warn(`[flow-fixed-time] flow ${flow.id} has no audience filter — refusing to enroll all customers`)
    return
  }

  // Resolve customer IDs via the segment evaluator
  const sqlCond = filterToSql(audience)
  const customerRows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.projectId, flow.projectId), sqlCond))
    .limit(50_000)  // safety cap per fire

  if (customerRows.length === 0) {
    console.log(`[flow-fixed-time] flow ${flow.id}: audience empty, nothing to enroll`)
    return
  }

  const now = new Date()
  let enrolled = 0
  for (const c of customerRows) {
    const [eventRow] = await db
      .insert(events)
      .values({
        projectId: flow.projectId,
        customerId: c.id,
        eventName: `flow_fixed_time:${flow.id}`,
        platform: 'api',
        source: 'system',
        timestamp: now,
        idempotencyKey: `flow_fixed_time:${flow.id}:${c.id}:${now.toISOString().slice(0, 16)}`,
        properties: { flowId: flow.id },
      })
      .onConflictDoNothing({ target: [events.projectId, events.idempotencyKey] })
      .returning({ id: events.id })

    if (!eventRow) continue   // already enrolled this minute

    const [trip] = await db
      .insert(flowTrips)
      .values({
        flowId: flow.id,
        customerId: c.id,
        status: 'active',
        currentNodeId: triggerNode.id,
        triggerEventId: eventRow.id,
      })
      .onConflictDoNothing()
      .returning({ id: flowTrips.id })

    if (trip) {
      await flowActionsQueue.add('advance', { tripId: trip.id })
      enrolled++
    }
  }

  console.log(`[flow-fixed-time] flow ${flow.id} fired — ${enrolled} customers enrolled`)
}

async function pollFixedTimeFlows(): Promise<void> {
  const now = new Date()

  const candidates = await db
    .select({
      id: flows.id,
      projectId: flows.projectId,
      triggerConfig: flows.triggerConfig,
      nodes: flows.nodes,
    })
    .from(flows)
    .where(and(
      eq(flows.status, 'active'),
      sql`trigger_config->>'kind' = 'fixed_time'`,
    ))

  for (const c of candidates) {
    const cfg = c.triggerConfig as TriggerConfig
    const schedule = cfg?.fixedTimeSchedule
    if (!schedule) continue
    if (!isFixedTimeDue(schedule, now)) continue
    try {
      await fireFixedTimeFlow({
        id: c.id,
        projectId: c.projectId,
        triggerConfig: cfg,
        nodes: c.nodes as FlowNode[],
      })
    } catch (err) {
      console.error(`[flow-fixed-time] flow ${c.id} fire failed:`, (err as Error).message)
    }
  }
}

export function startFlowFixedTimeScheduler(): void {
  // Wait 30s after boot so other workers/migrations land first
  setTimeout(() => {
    pollFixedTimeFlows().catch((err) => console.error('[flow-fixed-time] initial poll failed:', err))
    setInterval(() => {
      pollFixedTimeFlows().catch((err) => console.error('[flow-fixed-time] poll failed:', err))
    }, POLL_INTERVAL_MS)
  }, 30_000)
  console.log('[flow-fixed-time] scheduler will start polling in 30s (every 60s)')
}
