import { Worker } from 'bullmq'
import { eq, and } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { flows, flowTrips, customers } from '../db/schema.js'
import { evaluateFilter } from '@storees/segments'
import { checkExitEvents, advanceTrip } from '../services/flowExecutor.js'
import type { TriggerConfig, FilterConfig, FilterRule, Customer } from '@storees/shared'

type EventJob = {
  projectId: string
  customerId: string
  eventName: string
  properties: Record<string, unknown>
  platform: string
  timestamp: string
}

export function startTriggerWorker(): Worker {
  const worker = new Worker(
    'events',
    async (job) => {
      const event = job.data as EventJob

      // Exit events processed BEFORE trigger evaluation (order of operations)
      await checkExitEvents(event.customerId, event.eventName)

      // 1. Get all ACTIVE flows for this project
      const activeFlows = await db
        .select()
        .from(flows)
        .where(and(eq(flows.projectId, event.projectId), eq(flows.status, 'active')))

      for (const flow of activeFlows) {
        const tripId = await evaluateFlowTrigger(flow, event)
        // If a new trip was created, start advancing it
        if (tripId) await advanceTrip(tripId)
      }
    },
    {
      connection: redisConnection,
      concurrency: 50, // Up from 5 — SDK sends 100+ events/sec
    },
  )

  worker.on('completed', (job) => {
    console.log(`Trigger evaluation completed for event job ${job.id}`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Trigger evaluation failed for job ${job?.id}:`, err.message)
  })

  return worker
}

async function evaluateFlowTrigger(flow: Record<string, unknown>, event: EventJob): Promise<string | null> {
  const triggerConfig = flow.triggerConfig as TriggerConfig

  // 2. Match event name against flow trigger
  if (triggerConfig.event !== event.eventName) return null

  // 3. Check trigger filters against event properties
  if (triggerConfig.filters) {
    const match = evaluateEventFilters(triggerConfig.filters, event.properties)
    if (!match) return null
  }

  // 4. Check audience filters against customer
  if (triggerConfig.audienceFilter) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, event.customerId))
      .limit(1)

    if (!customer) return null

    // Map DB row to Customer type for evaluateFilter
    const customerObj: Customer = {
      ...customer,
      externalId: customer.externalId ?? '',
      totalSpent: Number(customer.totalSpent),
      avgOrderValue: Number(customer.avgOrderValue),
      clv: Number(customer.clv),
      customAttributes: (customer.customAttributes ?? {}) as Record<string, unknown>,
      metrics: (customer.metrics ?? {}) as Record<string, unknown>,
    }

    if (!evaluateFilter(triggerConfig.audienceFilter, customerObj)) return null
  }

  // 5. Check for duplicate trips (one customer = one active trip per flow)
  const [existingTrip] = await db
    .select({ id: flowTrips.id })
    .from(flowTrips)
    .where(
      and(
        eq(flowTrips.flowId, flow.id as string),
        eq(flowTrips.customerId, event.customerId),
        eq(flowTrips.status, 'active'),
      ),
    )
    .limit(1)

  if (existingTrip) {
    console.log(`Customer ${event.customerId} already has active trip in flow ${flow.id}`)
    return null
  }

  // Also check for 'waiting' status trips
  const [waitingTrip] = await db
    .select({ id: flowTrips.id })
    .from(flowTrips)
    .where(
      and(
        eq(flowTrips.flowId, flow.id as string),
        eq(flowTrips.customerId, event.customerId),
        eq(flowTrips.status, 'waiting'),
      ),
    )
    .limit(1)

  if (waitingTrip) {
    console.log(`Customer ${event.customerId} already has waiting trip in flow ${flow.id}`)
    return null
  }

  // 6. Create FlowTrip with event context for personalization
  const flowNodes = flow.nodes as Array<{ id: string; type: string }>
  const firstNodeId = flowNodes.length > 0 ? flowNodes[0].id : 'trigger'

  const [created] = await db.insert(flowTrips).values({
    flowId: flow.id as string,
    customerId: event.customerId,
    status: 'active',
    currentNodeId: firstNodeId,
    context: {
      triggerEvent: event.eventName,
      triggerProperties: event.properties,
      triggeredAt: event.timestamp,
    },
  }).returning()

  console.log(`Created flow trip for customer ${event.customerId} in flow ${(flow as { name: string }).name}`)
  return created.id
}

/**
 * Evaluate trigger filters against event properties.
 * Simple property matching — not the same as segment filters.
 */
function evaluateEventFilters(
  filters: FilterConfig,
  properties: Record<string, unknown>,
): boolean {
  const results = filters.rules.map(item => {
    // Skip nested groups in event filter context — only flat rules apply
    if ('type' in item && item.type === 'group') return true

    const rule = item as FilterRule
    // Support dotted paths like "properties.cart_value"
    const fieldPath = rule.field.replace(/^properties\./, '')
    const value = properties[fieldPath]

    switch (rule.operator) {
      case 'is':
        return value === rule.value
      case 'is_not':
        return value !== rule.value
      case 'greater_than':
        return Number(value) > Number(rule.value)
      case 'less_than':
        return Number(value) < Number(rule.value)
      case 'contains':
        return String(value ?? '').includes(String(rule.value))
      case 'is_true':
        return value === true
      case 'is_false':
        return value === false
      default:
        return false
    }
  })

  return filters.logic === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean)
}
