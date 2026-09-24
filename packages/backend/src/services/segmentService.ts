import { eq, and, sql, inArray } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { segments, customers, customerSegments } from '../db/schema.js'
import { SEGMENT_TEMPLATE_DEFINITIONS } from '@storees/segments'
import { eventsQueue } from './queue.js'
import { emitWebhookEvent } from './webhookService.js'
import type { FilterConfig } from '@storees/shared'
import { filterSqlForProject } from './projectVocabulary.js'

/**
 * Create the default segments for a new project from templates.
 * Idempotent — skips if the project already has ANY segments.
 *
 * The guard used to look only for `type = 'default'`, and the two other seeders write
 * `type = 'template'` — the vertical pack's list and onboarding's domain list. So a
 * project that had already been seeded twice still looked empty to this check, and
 * because `GET /api/segments` calls this before rendering, merely OPENING the segments
 * page added a third set. A freshly onboarded ecommerce project went from 8 segments to
 * 14 on the first click, with two different segments both named "At Risk" and one
 * ("Overdue Reorders") filtering on `days_overdue`, a lending field that resolves to
 * nothing in a shop.
 *
 * Widening the check to any segment is the small fix. The real problem is that a GET
 * mutates data at all; seeding belongs at project creation, and this call should
 * eventually come out of the read path.
 */
export async function instantiateDefaultSegments(projectId: string): Promise<void> {
  const existing = await db
    .select({ id: segments.id })
    .from(segments)
    .where(eq(segments.projectId, projectId))
    .limit(1)

  if (existing.length > 0) return

  const created: string[] = []
  for (const template of SEGMENT_TEMPLATE_DEFINITIONS) {
    const [seg] = await db.insert(segments).values({
      projectId,
      name: template.name,
      type: 'default',
      description: template.description,
      filters: template.filters,
      memberCount: 0,
      isActive: true,
    }).returning()
    created.push(seg.id)
  }

  console.log(`Created ${SEGMENT_TEMPLATE_DEFINITIONS.length} default segments for project ${projectId}`)

  // Evaluate newly created segments immediately
  for (const segId of created) {
    try {
      await evaluateSegment(segId)
    } catch (err) {
      console.error(`Default segment evaluation error (non-fatal):`, (err as Error).message)
    }
  }
}

/**
 * Re-evaluate a segment: find all matching customers and update the junction table.
 * Uses SQL-first filter evaluation for performance.
 */
export async function evaluateSegment(segmentId: string): Promise<number> {
  const [segment] = await db
    .select()
    .from(segments)
    .where(eq(segments.id, segmentId))
    .limit(1)

  if (!segment || !segment.isActive) return 0

  const filters = segment.filters as FilterConfig
  // Evaluate against THIS project's vocabulary. Without it every product, browse and
  // order filter compiles to a shop's event names, and a lender's "took a Gold Loan"
  // segment returns nobody while looking exactly like a segment nobody qualifies for.
  const filterSql = await filterSqlForProject(segment.projectId, filters)

  // Find all matching customers for this project. Pull reachability flags
  // alongside so we can compute reachableCount in the same scan — match +
  // (subscribed AND identifier present) on at least one channel.
  const matchingCustomers = await db
    .select({
      id: customers.id,
      email: customers.email,
      phone: customers.phone,
      emailSubscribed: customers.emailSubscribed,
      smsSubscribed: customers.smsSubscribed,
    })
    .from(customers)
    .where(and(eq(customers.projectId, segment.projectId), filterSql))

  const matchingIds = new Set(matchingCustomers.map(c => c.id))

  // Gap 13: reachable count = matched AND reachable on ≥1 channel
  let reachableCount = 0
  for (const c of matchingCustomers) {
    const okEmail = c.emailSubscribed === true && !!c.email
    const okSms = c.smsSubscribed === true && !!c.phone
    const okWa = !!c.phone
    if (okEmail || okSms || okWa) reachableCount++
  }

  // Get current members
  const currentMembers = await db
    .select({ customerId: customerSegments.customerId })
    .from(customerSegments)
    .where(eq(customerSegments.segmentId, segmentId))

  const currentIds = new Set(currentMembers.map(m => m.customerId))

  // Add new members
  const toAdd = [...matchingIds].filter(id => !currentIds.has(id))
  if (toAdd.length > 0) {
    await db.insert(customerSegments).values(
      toAdd.map(customerId => ({
        customerId,
        segmentId,
      })),
    ).onConflictDoNothing()
  }

  // Remove members who no longer match (batched)
  const toRemove = [...currentIds].filter(id => !matchingIds.has(id))
  if (toRemove.length > 0) {
    await db.delete(customerSegments).where(
      and(
        eq(customerSegments.segmentId, segmentId),
        inArray(customerSegments.customerId, toRemove),
      ),
    )
  }

  // Emit enters_segment / exits_segment events in bulk (one round-trip each)
  // rather than one queue add per membership change.
  const segmentEventJob = (customerId: string, eventName: 'enters_segment' | 'exits_segment') => ({
    name: eventName,
    data: {
      projectId: segment.projectId,
      customerId,
      eventName,
      properties: { segmentId, segmentName: segment.name },
      platform: 'system',
      timestamp: new Date().toISOString(),
    },
  })
  if (toAdd.length > 0) {
    await eventsQueue.addBulk(toAdd.map(id => segmentEventJob(id, 'enters_segment')))
  }
  if (toRemove.length > 0) {
    await eventsQueue.addBulk(toRemove.map(id => segmentEventJob(id, 'exits_segment')))
  }

  // Mirror membership changes to outbound webhooks (customer.segment.entered /
  // .exited). No-op unless the project has a matching subscription. Uses the
  // customer's external_id (the id on the customer's own system) so receivers
  // like Gowelmart can link the event back to their records.
  const affected = [...toAdd, ...toRemove]
  if (affected.length > 0) {
    const rows = await db
      .select({ id: customers.id, externalId: customers.externalId, email: customers.email, phone: customers.phone })
      .from(customers)
      .where(inArray(customers.id, affected))
    const byId = new Map(rows.map(r => [r.id, r]))
    const segmentRef = { id: segmentId, name: segment.name }
    const emit = (customerId: string, eventType: 'customer.segment.entered' | 'customer.segment.exited') => {
      const c = byId.get(customerId)
      return emitWebhookEvent({
        projectId: segment.projectId,
        eventType,
        data: {
          customer_id: c?.externalId ?? customerId,
          customer_email: c?.email ?? null,
          customer_phone: c?.phone ?? null,
          segment: segmentRef,
        },
      })
    }
    for (const customerId of toAdd) await emit(customerId, 'customer.segment.entered')
    for (const customerId of toRemove) await emit(customerId, 'customer.segment.exited')
  }

  // Update member + reachable counts
  await db.update(segments).set({
    memberCount: matchingIds.size,
    reachableCount,
    updatedAt: new Date(),
  }).where(eq(segments.id, segmentId))

  console.log(`Segment "${segment.name}": ${matchingIds.size} members (${reachableCount} reachable, +${toAdd.length} -${toRemove.length})`)

  return matchingIds.size
}

/**
 * Re-evaluate all active segments for a project.
 */
/** One full pass per project at a time, and not on every page view.
 *
 *  MEASURED on GoWelmart: 58 segments, 181 seconds, 3.1s each. Nothing coordinated
 *  those passes. The segments list endpoint fired one after every response, so opening
 *  the page three times in a minute started three concurrent three-minute passes, all
 *  rewriting the same `customer_segments` rows — and each one attaches its own database
 *  connections. That is the shape of the exhaustion we already hit once today.
 *
 *  Two guards, both cheap:
 *    IN FLIGHT  a second caller joins the run already going rather than starting another
 *    COOLDOWN   a background caller skips entirely if one finished recently
 *
 *  `force` bypasses the cooldown only — never the in-flight guard, because two
 *  simultaneous passes are never what anyone wants. It is for the Re-evaluate All
 *  button, where somebody is explicitly asking for it now.
 */
const inFlight = new Map<string, Promise<void>>()
const lastFinished = new Map<string, number>()

/** How recently a pass must have finished for a background caller to skip its own.
 *  Long enough that browsing the page a few times costs one pass, short enough that a
 *  send list is never badly out of date. */
const SEGMENT_COOLDOWN_MS = Number(process.env.SEGMENT_COOLDOWN_MS ?? 10 * 60_000)

export async function evaluateAllSegments(
  projectId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const running = inFlight.get(projectId)
  if (running) return running

  const since = Date.now() - (lastFinished.get(projectId) ?? 0)
  if (!opts.force && since < SEGMENT_COOLDOWN_MS) {
    console.log(`[segments] skipped — a full pass finished ${Math.round(since / 1000)}s ago`)
    return
  }

  const run = _evaluateAllSegments(projectId).finally(() => {
    lastFinished.set(projectId, Date.now())
    inFlight.delete(projectId)
  })
  inFlight.set(projectId, run)
  return run
}

/** Whether a pass is running right now, for the screen to say so. */
export const segmentsEvaluating = (projectId: string) => inFlight.has(projectId)

async function _evaluateAllSegments(projectId: string): Promise<void> {
  const activeSegments = await db
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.projectId, projectId), eq(segments.isActive, true)))

  // One segment must not take the others down. A single malformed filter — a template
  // pointing at a field nothing supplies — used to throw out of this loop and abort
  // every remaining segment, so a project silently stopped updating ALL memberships
  // because of one bad row. Failures are logged and the loop continues.
  for (const segment of activeSegments) {
    try {
      await evaluateSegment(segment.id)
    } catch (err) {
      console.error(
        `[segments] evaluation failed for ${segment.id} — skipping it and continuing:`,
        (err as Error).message)
    }
  }
}
