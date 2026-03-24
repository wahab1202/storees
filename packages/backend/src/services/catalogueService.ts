import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { catalogues, items } from '../db/schema.js'

/**
 * Create a new catalogue (item type definition) for a project.
 */
export async function createCatalogue(
  projectId: string,
  name: string,
  itemTypeLabel: string,
  attributeSchema: unknown[] = [],
): Promise<typeof catalogues.$inferSelect> {
  const [catalogue] = await db.insert(catalogues).values({
    projectId,
    name,
    itemTypeLabel,
    attributeSchema,
  }).returning()

  return catalogue
}

/**
 * List all catalogues for a project.
 */
export async function listCatalogues(projectId: string) {
  return db.select().from(catalogues).where(eq(catalogues.projectId, projectId))
}

/**
 * Get a single catalogue by ID.
 */
export async function getCatalogue(projectId: string, catalogueId: string) {
  const [catalogue] = await db
    .select()
    .from(catalogues)
    .where(and(eq(catalogues.id, catalogueId), eq(catalogues.projectId, projectId)))
    .limit(1)

  return catalogue ?? null
}

/**
 * Update a catalogue.
 */
export async function updateCatalogue(
  catalogueId: string,
  updates: { name?: string; itemTypeLabel?: string; attributeSchema?: unknown[] },
) {
  const [updated] = await db
    .update(catalogues)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(catalogues.id, catalogueId))
    .returning()

  return updated
}
