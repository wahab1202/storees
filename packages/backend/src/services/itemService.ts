import { eq, and, ilike, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { items } from '../db/schema.js'

/**
 * Create a single item in a catalogue.
 */
export async function createItem(
  projectId: string,
  catalogueId: string,
  data: { externalId?: string; type: string; name: string; attributes?: Record<string, unknown> },
) {
  const [item] = await db.insert(items).values({
    projectId,
    catalogueId,
    externalId: data.externalId ?? null,
    type: data.type,
    name: data.name,
    attributes: data.attributes ?? {},
  }).onConflictDoNothing().returning()

  return item
}

/**
 * Bulk insert items — for CSV/JSON import and vertical pack activation.
 */
export async function bulkCreateItems(
  projectId: string,
  catalogueId: string,
  itemsData: { externalId?: string; type: string; name: string; attributes?: Record<string, unknown> }[],
): Promise<number> {
  if (itemsData.length === 0) return 0

  const values = itemsData.map(d => ({
    projectId,
    catalogueId,
    externalId: d.externalId ?? null,
    type: d.type,
    name: d.name,
    attributes: d.attributes ?? {},
  }))

  // Batch in chunks of 500 to avoid huge SQL statements
  let inserted = 0
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500)
    const result = await db.insert(items).values(chunk).onConflictDoNothing().returning()
    inserted += result.length
  }

  return inserted
}

/**
 * List items with optional type filter and search.
 */
export async function listItems(
  projectId: string,
  opts: { catalogueId?: string; type?: string; search?: string; page?: number; pageSize?: number } = {},
) {
  const conditions = [eq(items.projectId, projectId)]

  if (opts.catalogueId) conditions.push(eq(items.catalogueId, opts.catalogueId))
  if (opts.type) conditions.push(eq(items.type, opts.type))
  if (opts.search) conditions.push(ilike(items.name, `%${opts.search}%`))

  const page = opts.page ?? 1
  const pageSize = Math.min(opts.pageSize ?? 25, 100)
  const offset = (page - 1) * pageSize

  const [rows, [{ count }]] = await Promise.all([
    db.select()
      .from(items)
      .where(and(...conditions))
      .orderBy(items.name)
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(items)
      .where(and(...conditions)),
  ])

  return {
    data: rows,
    pagination: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) },
  }
}

/**
 * Get a single item by ID.
 */
export async function getItem(projectId: string, itemId: string) {
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.projectId, projectId)))
    .limit(1)

  return item ?? null
}

/**
 * Update an item.
 */
export async function updateItem(
  itemId: string,
  updates: { name?: string; attributes?: Record<string, unknown>; status?: string },
) {
  const [updated] = await db
    .update(items)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(items.id, itemId))
    .returning()

  return updated
}
