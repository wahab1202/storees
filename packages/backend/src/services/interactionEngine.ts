import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { interactions, interactionConfigs, items } from '../db/schema.js'

/**
 * Process an event and create interaction records if the event matches
 * any configured interaction weight mapping for the project.
 *
 * Called by the interaction worker after event persistence.
 */
export async function processEventInteraction(
  projectId: string,
  customerId: string,
  eventName: string,
  eventProperties: Record<string, unknown>,
  eventId: string,
): Promise<void> {
  // 1. Find matching interaction configs for this event
  const configs = await db
    .select()
    .from(interactionConfigs)
    .where(and(
      eq(interactionConfigs.projectId, projectId),
      eq(interactionConfigs.eventName, eventName),
    ))

  if (configs.length === 0) return

  // 2. Extract item_id from event properties
  const itemExternalId = eventProperties.item_id as string | undefined
  const itemInternalId = eventProperties.item_internal_id as string | undefined

  let itemId: string | null = null

  if (itemInternalId) {
    itemId = itemInternalId
  } else if (itemExternalId) {
    // Look up item by external_id within the catalogue
    for (const config of configs) {
      const [item] = await db
        .select({ id: items.id })
        .from(items)
        .where(and(
          eq(items.projectId, projectId),
          eq(items.catalogueId, config.catalogueId),
          eq(items.externalId, itemExternalId),
        ))
        .limit(1)

      if (item) {
        itemId = item.id
        break
      }
    }
  }

  if (!itemId) return // No item found — can't create interaction

  // 3. Write interaction records for each matching config
  for (const config of configs) {
    await db.insert(interactions).values({
      projectId,
      customerId,
      itemId,
      interactionType: config.interactionType,
      weight: config.weight,
      sourceEventId: eventId,
    })
  }
}

/**
 * Create or update interaction weight config for a project.
 */
export async function upsertInteractionConfig(
  projectId: string,
  catalogueId: string,
  eventName: string,
  interactionType: string,
  weight: number,
  decayHalfLifeDays: number = 30,
) {
  const [config] = await db.insert(interactionConfigs).values({
    projectId,
    catalogueId,
    eventName,
    interactionType,
    weight: String(weight),
    decayHalfLifeDays,
  }).onConflictDoNothing().returning()

  // If conflict (already exists), update instead
  if (!config) {
    const [updated] = await db
      .update(interactionConfigs)
      .set({
        interactionType,
        weight: String(weight),
        decayHalfLifeDays,
      })
      .where(and(
        eq(interactionConfigs.projectId, projectId),
        eq(interactionConfigs.catalogueId, catalogueId),
        eq(interactionConfigs.eventName, eventName),
      ))
      .returning()

    return updated
  }

  return config
}

/**
 * List interaction configs for a project.
 */
export async function listInteractionConfigs(projectId: string) {
  return db
    .select()
    .from(interactionConfigs)
    .where(eq(interactionConfigs.projectId, projectId))
}
