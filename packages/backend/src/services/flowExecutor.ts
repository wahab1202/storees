import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { flowTrips, flows, customers, emailTemplates, scheduledJobs, events } from '../db/schema.js'
import { flowActionsQueue } from './queue.js'
import { sendEmail, interpolateTemplate } from './emailService.js'
import type { FlowNode, ActionNode, DelayNode, ConditionNode } from '@storees/shared'

const DEMO_DELAY_MINUTES = Number(process.env.DEMO_DELAY_MINUTES ?? 2)

/**
 * Advance a flow trip through its nodes.
 * Called when a trip is created or when a delay expires.
 */
export async function advanceTrip(tripId: string): Promise<void> {
  const [trip] = await db
    .select()
    .from(flowTrips)
    .where(eq(flowTrips.id, tripId))
    .limit(1)

  if (!trip || trip.status === 'completed' || trip.status === 'exited') return

  const [flow] = await db
    .select()
    .from(flows)
    .where(eq(flows.id, trip.flowId))
    .limit(1)

  if (!flow) return

  const nodes = flow.nodes as FlowNode[]
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  let currentNode = nodeMap.get(trip.currentNodeId)
  if (!currentNode) return

  // Process nodes until we hit a delay, end, or action
  let iterations = 0
  const MAX_ITERATIONS = 20 // safety limit

  while (currentNode && iterations < MAX_ITERATIONS) {
    iterations++

    switch (currentNode.type) {
      case 'trigger': {
        // Move to next node in sequence
        const nextNode = getNextNode(nodes, currentNode.id)
        if (!nextNode) {
          await completeTrip(tripId)
          return
        }
        await updateTripNode(tripId, nextNode.id)
        currentNode = nextNode
        break
      }

      case 'delay': {
        const delayNode = currentNode as DelayNode
        // Use demo delay override
        const delayMs = DEMO_DELAY_MINUTES * 60 * 1000

        const nextNode = getNextNode(nodes, currentNode.id)
        if (!nextNode) {
          await completeTrip(tripId)
          return
        }

        // Schedule a job to advance after delay
        const executeAt = new Date(Date.now() + delayMs)

        await db.insert(scheduledJobs).values({
          flowTripId: tripId,
          executeAt,
          action: { type: 'advance_trip', nextNodeId: nextNode.id },
          status: 'pending',
        })

        // Schedule BullMQ delayed job
        await flowActionsQueue.add(
          'advance-trip',
          { tripId, nextNodeId: nextNode.id },
          { delay: delayMs },
        )

        // Set trip to waiting
        await db.update(flowTrips).set({
          status: 'waiting',
          currentNodeId: currentNode.id,
        }).where(eq(flowTrips.id, tripId))

        console.log(`Trip ${tripId}: waiting ${DEMO_DELAY_MINUTES}min at delay node`)
        return // Stop processing — will resume after delay
      }

      case 'condition': {
        const condNode = currentNode as ConditionNode
        const met = await evaluateCondition(condNode, trip)
        const branchId = met ? condNode.config.branches.yes : condNode.config.branches.no
        const branchNode = nodeMap.get(branchId)

        if (!branchNode) {
          await completeTrip(tripId)
          return
        }

        await updateTripNode(tripId, branchNode.id)
        currentNode = branchNode
        break
      }

      case 'action': {
        // Re-check trip status before executing — prevents sending after exit event race
        const [freshTrip] = await db
          .select({ status: flowTrips.status })
          .from(flowTrips)
          .where(eq(flowTrips.id, tripId))
          .limit(1)
        if (!freshTrip || freshTrip.status === 'exited' || freshTrip.status === 'completed') {
          console.log(`Trip ${tripId} already ${freshTrip?.status}, skipping action`)
          return
        }

        const actionNode = currentNode as ActionNode
        await executeAction(actionNode, trip)

        const nextNode = getNextNode(nodes, currentNode.id)
        if (!nextNode) {
          await completeTrip(tripId)
          return
        }
        await updateTripNode(tripId, nextNode.id)
        currentNode = nextNode
        break
      }

      case 'end': {
        await completeTrip(tripId, (currentNode as { label?: string }).label)
        return
      }

      default:
        console.warn(`Unknown node type: ${(currentNode as FlowNode).type}`)
        return
    }
  }
}

/**
 * Handle exit events — check if any active trips should be exited.
 */
export async function checkExitEvents(
  customerId: string,
  eventName: string,
): Promise<void> {
  // Find all active/waiting trips for this customer
  const activeTrips = await db
    .select({
      tripId: flowTrips.id,
      flowId: flowTrips.flowId,
    })
    .from(flowTrips)
    .where(
      and(
        eq(flowTrips.customerId, customerId),
        eq(flowTrips.status, 'active'),
      ),
    )

  const waitingTrips = await db
    .select({
      tripId: flowTrips.id,
      flowId: flowTrips.flowId,
    })
    .from(flowTrips)
    .where(
      and(
        eq(flowTrips.customerId, customerId),
        eq(flowTrips.status, 'waiting'),
      ),
    )

  const allTrips = [...activeTrips, ...waitingTrips]

  for (const trip of allTrips) {
    const [flow] = await db
      .select({ exitConfig: flows.exitConfig })
      .from(flows)
      .where(eq(flows.id, trip.flowId))
      .limit(1)

    if (!flow?.exitConfig) continue

    const exitConfig = flow.exitConfig as { event: string; scope: string }

    if (exitConfig.event === eventName) {
      // Exit the trip
      await db.update(flowTrips).set({
        status: 'exited',
        exitedAt: new Date(),
      }).where(eq(flowTrips.id, trip.tripId))

      // Cancel any pending scheduled jobs
      await db.update(scheduledJobs).set({
        status: 'cancelled',
      }).where(
        and(
          eq(scheduledJobs.flowTripId, trip.tripId),
          eq(scheduledJobs.status, 'pending'),
        ),
      )

      console.log(`Trip ${trip.tripId} exited due to ${eventName}`)
    }
  }
}

// ============ HELPERS ============

function getNextNode(nodes: FlowNode[], currentId: string): FlowNode | undefined {
  const idx = nodes.findIndex(n => n.id === currentId)
  return idx >= 0 && idx < nodes.length - 1 ? nodes[idx + 1] : undefined
}

async function updateTripNode(tripId: string, nodeId: string): Promise<void> {
  await db.update(flowTrips).set({
    currentNodeId: nodeId,
    status: 'active',
  }).where(eq(flowTrips.id, tripId))
}

async function completeTrip(tripId: string, label?: string): Promise<void> {
  await db.update(flowTrips).set({
    status: 'completed',
    exitedAt: new Date(),
  }).where(eq(flowTrips.id, tripId))

  console.log(`Trip ${tripId} completed${label ? ` (${label})` : ''}`)
}

async function evaluateCondition(
  node: ConditionNode,
  trip: Record<string, unknown>,
): Promise<boolean> {
  const config = node.config

  if (config.check === 'event_occurred') {
    // Check if the event happened since the trip started
    const tripEnteredAt = trip.enteredAt as Date
    const customerId = trip.customerId as string

    const [result] = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.customerId, customerId),
          eq(events.eventName, config.event!),
        ),
      )
      .limit(1)

    return !!result
  }

  // attribute_check — check customer attribute
  if (config.check === 'attribute_check' && config.field) {
    const customerId = trip.customerId as string
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)

    if (!customer) return false

    const value = (customer as Record<string, unknown>)[config.field]
    switch (config.operator) {
      case 'is': return value === config.value
      case 'is_not': return value !== config.value
      case 'greater_than': return Number(value) > Number(config.value)
      case 'less_than': return Number(value) < Number(config.value)
      case 'is_true': return value === true
      case 'is_false': return value === false
      default: return false
    }
  }

  return false
}

async function executeAction(
  node: ActionNode,
  trip: Record<string, unknown>,
): Promise<void> {
  const { actionType, templateId, subjectOverride } = node.config

  if (actionType !== 'send_email') {
    console.warn(`Action type "${actionType}" not yet implemented`)
    return
  }

  const customerId = trip.customerId as string
  const context = (trip.context ?? {}) as Record<string, unknown>

  // Get customer email
  const [customer] = await db
    .select({ email: customers.email, name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer?.email) {
    console.warn(`Cannot send email: customer ${customerId} has no email`)
    return
  }

  // Build template context
  const templateContext: Record<string, unknown> = {
    customer_name: customer.name ?? 'there',
    customer_email: customer.email,
    ...(context.triggerProperties as Record<string, unknown> ?? {}),
  }

  // Try to find template in DB
  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.name, templateId))
    .limit(1)

  let subject: string
  let html: string

  if (template) {
    subject = subjectOverride
      ? interpolateTemplate(subjectOverride, templateContext)
      : interpolateTemplate(template.subject ?? '', templateContext)
    html = interpolateTemplate(template.htmlBody ?? '', templateContext)
  } else {
    // Fallback for missing template
    subject = subjectOverride
      ? interpolateTemplate(subjectOverride, templateContext)
      : 'You left something behind!'
    html = `<p>Hi {{customer_name}},</p><p>Come back and complete your purchase!</p>`
    html = interpolateTemplate(html, templateContext)
  }

  await sendEmail({ to: customer.email, subject, html })
  console.log(`Action executed: sent email to ${customer.email} (template: ${templateId})`)
}
