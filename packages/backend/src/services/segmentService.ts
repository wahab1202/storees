import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { segments, customers, customerSegments } from '../db/schema.js'
import { SEGMENT_TEMPLATE_DEFINITIONS, filterToSql } from '@storees/segments'
import type { FilterConfig } from '@storees/shared'

/**
 * Create the 4 default segments for a new project from templates.
 * Idempotent — skips if segments already exist for the project.
 */
export async function instantiateDefaultSegments(projectId: string): Promise<void> {
  const existing = await db
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.projectId, projectId), eq(segments.type, 'default')))
    .limit(1)

  if (existing.length > 0) return

  for (const template of SEGMENT_TEMPLATE_DEFINITIONS) {
    await db.insert(segments).values({
      projectId,
      name: template.name,
      type: 'default',
      description: template.description,
      filters: template.filters,
      memberCount: 0,
      isActive: true,
    })
  }

  console.log(`Created ${SEGMENT_TEMPLATE_DEFINITIONS.length} default segments for project ${projectId}`)
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
  const filterSql = filterToSql(filters)

  // Find all matching customers for this project
  const matchingCustomers = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.projectId, segment.projectId), filterSql))

  const matchingIds = new Set(matchingCustomers.map(c => c.id))

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

  // Remove members who no longer match
  const toRemove = [...currentIds].filter(id => !matchingIds.has(id))
  for (const customerId of toRemove) {
    await db.delete(customerSegments).where(
      and(
        eq(customerSegments.customerId, customerId),
        eq(customerSegments.segmentId, segmentId),
      ),
    )
  }

  // Update member count
  await db.update(segments).set({
    memberCount: matchingIds.size,
    updatedAt: new Date(),
  }).where(eq(segments.id, segmentId))

  console.log(`Segment "${segment.name}": ${matchingIds.size} members (+${toAdd.length} -${toRemove.length})`)

  return matchingIds.size
}

/**
 * Re-evaluate all active segments for a project.
 */
export async function evaluateAllSegments(projectId: string): Promise<void> {
  const activeSegments = await db
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.projectId, projectId), eq(segments.isActive, true)))

  for (const segment of activeSegments) {
    await evaluateSegment(segment.id)
  }
}
