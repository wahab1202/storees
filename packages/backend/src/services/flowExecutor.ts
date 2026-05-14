import { eq, and, gt, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { flowTrips, flows, customers, emailTemplates, scheduledJobs, events, projects } from '../db/schema.js'
import { flowActionsQueue } from './queue.js'
import { sendEmail, interpolateTemplate } from './emailService.js'
import { resolveTemplateVariables, type CustomerLike, type ProjectLike } from './templateContext.js'
import { createHash } from 'node:crypto'
import type {
  FlowNode,
  ActionNode,
  DelayNode,
  ConditionNode,
  AbSplitNode,
  GotoNode,
  TemplateVariable,
} from '@storees/shared'

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

  // Process nodes until we hit a delay, end, or action.
  // MAX_ITERATIONS guards against infinite goto/ab_split loops. Bumped
  // to 50 (from 20) when goto landed — a legitimate retry-3-times-then-
  // give-up flow can chew through ~6 nodes per iteration easily.
  let iterations = 0
  const MAX_ITERATIONS = 50

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

      case 'ab_split': {
        // Deterministic split: hash(customerId + nodeId) → 0..99, pick the
        // branch whose cumulative weight bucket the hash falls into. Same
        // customer always lands on the same branch, so journeys are stable
        // for repeat events and the debug-flows view shows a coherent path.
        const abNode = currentNode as AbSplitNode
        const branches = abNode.config.branches ?? []
        if (branches.length === 0) {
          await completeTrip(tripId, 'ab_split: no branches')
          return
        }
        const bucket = hashToBucket(`${trip.customerId}:${currentNode.id}`)
        let cumulative = 0
        let chosen = branches[0]
        for (const b of branches) {
          cumulative += b.weight
          if (bucket < cumulative) { chosen = b; break }
        }
        const targetNode = nodeMap.get(chosen.target)
        if (!targetNode) {
          console.warn(`Trip ${tripId}: ab_split target ${chosen.target} not found`)
          await completeTrip(tripId, `ab_split: target missing`)
          return
        }
        await updateTripNode(tripId, targetNode.id)
        currentNode = targetNode
        break
      }

      case 'goto': {
        // Unconditional jump. Use cases: loop on retry, re-route into a
        // sub-flow, "if did_not_open in 3 days then goto nurture_node_x".
        // Visited-set guards against infinite loops in malformed flows.
        const gotoNode = currentNode as GotoNode
        const targetNode = nodeMap.get(gotoNode.config.target)
        if (!targetNode) {
          console.warn(`Trip ${tripId}: goto target ${gotoNode.config.target} not found`)
          await completeTrip(tripId, 'goto: target missing')
          return
        }
        await updateTripNode(tripId, targetNode.id)
        currentNode = targetNode
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

// Deterministic 0..99 bucket from a string key. Used by ab_split so the
// same customer hashes to the same branch across re-evaluations.
function hashToBucket(key: string): number {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 8)
  return parseInt(hex, 16) % 100
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
  // Read the trip BEFORE marking it complete so flow-exit chaining can
  // see which flow + customer just finished.
  const [trip] = await db
    .select({ flowId: flowTrips.flowId, customerId: flowTrips.customerId })
    .from(flowTrips)
    .where(eq(flowTrips.id, tripId))
    .limit(1)

  await db.update(flowTrips).set({
    status: 'completed',
    exitedAt: new Date(),
  }).where(eq(flowTrips.id, tripId))

  console.log(`Trip ${tripId} completed${label ? ` (${label})` : ''}`)

  // Gap 11: chain follow-up flows triggered on this flow's exit. Each
  // dependent flow with triggerConfig.kind='flow_exit' + sourceFlowId
  // pointing at the just-finished flow enrols the same customer.
  if (trip) await fireFlowExitTriggers(trip.flowId, trip.customerId)
}

async function fireFlowExitTriggers(sourceFlowId: string, customerId: string): Promise<void> {
  try {
    const dependents = await db
      .select({ id: flows.id, projectId: flows.projectId, triggerConfig: flows.triggerConfig })
      .from(flows)
      .where(and(eq(flows.status, 'active'), sql`trigger_config->>'kind' = 'flow_exit' AND trigger_config->>'sourceFlowId' = ${sourceFlowId}`))

    for (const dep of dependents) {
      // Enrol via a synthetic event row so the trigger worker handles the
      // rest of the audience filter + duplicate-trip guard. The event
      // never reaches the customer-aggregate worker because the event_name
      // 'flow_exit_chain:<sourceId>' doesn't match any revenue event.
      const [inserted] = await db
        .insert(events)
        .values({
          projectId: dep.projectId,
          customerId,
          eventName: `flow_exit_chain:${sourceFlowId}`,
          platform: 'api',
          source: 'system',
          timestamp: new Date(),
          idempotencyKey: `flow_exit_chain:${sourceFlowId}:${customerId}:${Date.now()}`,
          properties: { sourceFlowId, dependentFlowId: dep.id },
        })
        .onConflictDoNothing({ target: [events.projectId, events.idempotencyKey] })
        .returning({ id: events.id })

      if (inserted) {
        // Directly start the dependent trip — the trigger worker normally
        // matches event name to triggerConfig.event, but flow_exit triggers
        // don't have a user-event name. We bypass and enrol directly.
        await db.insert(flowTrips).values({
          flowId: dep.id,
          customerId,
          status: 'active',
          currentNodeId: 'trigger_1',  // by convention; first trigger node
          triggerEventId: inserted.id,
        }).onConflictDoNothing()

        // Find the actual first node id from the flow + advance
        const [depFlow] = await db
          .select({ nodes: flows.nodes })
          .from(flows)
          .where(eq(flows.id, dep.id))
          .limit(1)
        if (depFlow) {
          const depNodes = depFlow.nodes as FlowNode[]
          const triggerNode = depNodes.find((n) => n.type === 'trigger')
          if (triggerNode) {
            const [newTrip] = await db
              .select({ id: flowTrips.id })
              .from(flowTrips)
              .where(and(eq(flowTrips.flowId, dep.id), eq(flowTrips.customerId, customerId), eq(flowTrips.triggerEventId, inserted.id)))
              .limit(1)
            if (newTrip) {
              await db.update(flowTrips).set({ currentNodeId: triggerNode.id }).where(eq(flowTrips.id, newTrip.id))
              await flowActionsQueue.add('advance', { tripId: newTrip.id })
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(`[flow-exit-chain] sourceFlowId=${sourceFlowId} customerId=${customerId} failed:`, (err as Error).message)
  }
}

async function evaluateCondition(
  node: ConditionNode,
  trip: Record<string, unknown>,
): Promise<boolean> {
  const config = node.config

  if (config.check === 'event_occurred') {
    if (!config.event) return false
    const customerId = trip.customerId as string

    let since = trip.enteredAt as Date
    if (config.since === 'flow_start') {
      const flowId = trip.flowId as string | undefined
      if (flowId) {
        const [flow] = await db
          .select({ createdAt: flows.createdAt })
          .from(flows)
          .where(eq(flows.id, flowId))
          .limit(1)
        if (flow?.createdAt) since = flow.createdAt as Date
      }
    }

    const [result] = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.customerId, customerId),
          eq(events.eventName, config.event),
          gt(events.timestamp, since),
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

    // Support dotted paths like "customAttributes.loyalty_tier" so the UI
    // can target keys nested inside the customAttributes JSON blob.
    const value = resolveDottedPath(customer as Record<string, unknown>, config.field)
    switch (config.operator) {
      case 'is':           return value === config.value
      case 'is_not':       return value !== config.value
      case 'greater_than': return Number(value) > Number(config.value)
      case 'less_than':    return Number(value) < Number(config.value)
      case 'contains':     return String(value ?? '').includes(String(config.value ?? ''))
      case 'begins_with':  return String(value ?? '').startsWith(String(config.value ?? ''))
      case 'ends_with':    return String(value ?? '').endsWith(String(config.value ?? ''))
      case 'is_true':      return value === true
      case 'is_false':     return value === false
      default:             return false
    }
  }

  return false
}

function resolveDottedPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return obj[path]
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

async function executeAction(
  node: ActionNode,
  trip: Record<string, unknown>,
): Promise<void> {
  const { actionType, templateId, subjectOverride } = node.config
  const customerId = trip.customerId as string
  const projectId = trip.projectId as string ?? ''
  const context = (trip.context ?? {}) as Record<string, unknown>

  // Map action type to channel
  const channelMap: Record<string, string> = {
    send_email: 'email',
    send_sms: 'sms',
    send_push: 'push',
    send_whatsapp: 'whatsapp',
  }
  const channel = channelMap[actionType]

  if (!channel) {
    console.warn(`Unknown action type: ${actionType}`)
    return
  }

  // Pull the full customer + project rows once — both needed for variable
  // resolution regardless of channel.
  const [customer] = await db
    .select({
      id: customers.id,
      externalId: customers.externalId,
      email: customers.email,
      phone: customers.phone,
      name: customers.name,
      region: customers.region,
      city: customers.city,
      totalOrders: customers.totalOrders,
      totalSpent: customers.totalSpent,
      avgOrderValue: customers.avgOrderValue,
      clv: customers.clv,
      firstOrderDate: customers.firstOrderDate,
      lastOrderDate: customers.lastOrderDate,
      lastSeen: customers.lastSeen,
      customAttributes: customers.customAttributes,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer) {
    console.warn(`Cannot execute action: customer ${customerId} not found`)
    return
  }

  const [projectRow] = await db
    .select({
      id: projects.id,
      name: projects.name,
      emailFromAddress: projects.emailFromAddress,
      emailFromName: projects.emailFromName,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  const project: ProjectLike = projectRow ?? { id: projectId, name: '' }
  const customerLike = customer as CustomerLike

  const eventProperties = context.triggerProperties as Record<string, unknown> | undefined

  // For email, use the existing direct send path (backward compatible)
  if (channel === 'email') {
    if (!customer.email) {
      console.warn(`Cannot send email: customer ${customerId} has no email`)
      return
    }

    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.name, templateId))
      .limit(1)

    const templateContext = resolveTemplateVariables({
      variables: ((template?.variables as TemplateVariable[]) ?? []),
      customer: customerLike,
      project,
      eventProperties,
    })

    let subject: string
    let html: string

    if (template) {
      subject = subjectOverride
        ? interpolateTemplate(subjectOverride, templateContext)
        : interpolateTemplate(template.subject ?? '', templateContext)
      html = interpolateTemplate(template.htmlBody ?? '', templateContext)
    } else {
      subject = subjectOverride
        ? interpolateTemplate(subjectOverride, templateContext)
        : 'You left something behind!'
      html = `<p>Hi {{customer_name}},</p><p>Come back and complete your purchase!</p>`
      html = interpolateTemplate(html, templateContext)
    }

    await sendEmail({ to: customer.email, subject, html, projectId, contentType: 'promotional' })
    console.log(`Action executed: sent email to ${customer.email} (template: ${templateId})`)
    return
  }

  // For SMS, Push, WhatsApp — use the delivery service. Resolve template
  // variables here too so positional params {{1}}, {{2}} (WhatsApp) and named
  // tokens (SMS/push) all read from the same per-customer/per-event context.
  const { send } = await import('./deliveryService.js')
  // Look up the template's declared variables (SMS/push/WhatsApp templates
  // share the same email_templates table for now — variable shape is generic).
  const [providerTemplate] = await db
    .select({ variables: emailTemplates.variables })
    .from(emailTemplates)
    .where(eq(emailTemplates.name, templateId))
    .limit(1)
  const variables = resolveTemplateVariables({
    variables: ((providerTemplate?.variables as TemplateVariable[]) ?? []),
    customer: customerLike,
    project,
    eventProperties,
  })

  const messageId = await send({
    projectId,
    userId: customerId,
    channel: channel as 'sms' | 'push' | 'whatsapp',
    templateId,
    variables,
    messageType: 'promotional',
    flowTripId: trip.id as string,
  })

  console.log(`Action executed: ${actionType} for customer ${customerId} (message: ${messageId ?? 'blocked'})`)
}
