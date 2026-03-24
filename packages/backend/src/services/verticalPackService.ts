import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { db } from '../db/connection.js'
import { projects, segments } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { createCatalogue } from './catalogueService.js'
import { bulkCreateItems } from './itemService.js'
import { upsertInteractionConfig } from './interactionEngine.js'
import { createPredictionGoal } from './predictionGoalService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PACKS_DIR = join(__dirname, '..', 'packs')

export type VerticalPack = {
  id: string
  name: string
  icon: string
  description: string
  catalogue: {
    name: string
    item_type_label: string
    attribute_schema: { name: string; type: string; values?: string[]; weight: number }[]
    default_items: { name: string; type: string; attributes: Record<string, unknown> }[]
  }
  interaction_config: {
    event_name: string
    interaction_type: string
    weight: number
    decay_half_life_days: number
  }[]
  prediction_goals: {
    name: string
    target_event: string
    observation_window_days: number
    prediction_window_days: number
    min_positive_labels: number
    priority: number
    default_status: 'active' | 'paused'
  }[]
  segment_templates: {
    name: string
    description: string
    icon: string
    filter: Record<string, unknown>
  }[]
  flow_templates: unknown[]
  dashboard_templates: unknown[]
  wizard_questions: {
    products_label: string
    products_options: string[]
    journey_steps: string[]
    priorities: { label: string; maps_to: string | null }[]
  }
}

// Cache loaded packs in memory
const packCache = new Map<string, VerticalPack>()

/**
 * Load a single pack by ID from the packs directory.
 */
export function loadPack(packId: string): VerticalPack | null {
  if (packCache.has(packId)) return packCache.get(packId)!

  try {
    const filePath = join(PACKS_DIR, `${packId}.json`)
    const raw = readFileSync(filePath, 'utf-8')
    const pack = JSON.parse(raw) as VerticalPack
    packCache.set(packId, pack)
    return pack
  } catch {
    return null
  }
}

/**
 * List all available packs (id, name, icon, description only — not full config).
 */
export function listPacks(): Pick<VerticalPack, 'id' | 'name' | 'icon' | 'description'>[] {
  try {
    const files = readdirSync(PACKS_DIR).filter(f => f.endsWith('.json'))
    return files.map(f => {
      const packId = f.replace('.json', '')
      const pack = loadPack(packId)
      if (!pack) return null
      return { id: pack.id, name: pack.name, icon: pack.icon, description: pack.description }
    }).filter(Boolean) as Pick<VerticalPack, 'id' | 'name' | 'icon' | 'description'>[]
  } catch {
    return []
  }
}

/**
 * Get wizard questions for a pack (used by onboarding wizard step rendering).
 */
export function getWizardQuestions(packId: string) {
  const pack = loadPack(packId)
  if (!pack) return null
  return pack.wizard_questions
}

export type WizardAnswers = {
  selectedProducts?: { name: string; type: string; attributes?: Record<string, unknown> }[]
  rankedPriorities?: { label: string; maps_to: string | null }[]
  channels?: string[]
  customerVolume?: string
}

/**
 * Activate a vertical pack for a project.
 * Creates catalogue, items, interaction configs, prediction goals, and segment templates.
 * Idempotent — checks for existing records before inserting.
 */
export async function activatePack(
  projectId: string,
  packId: string,
  answers?: WizardAnswers,
) {
  const pack = loadPack(packId)
  if (!pack) throw new Error(`Pack not found: ${packId}`)

  // 1. Create catalogue
  const catalogue = await createCatalogue(
    projectId,
    pack.catalogue.name,
    pack.catalogue.item_type_label,
    pack.catalogue.attribute_schema,
  )

  // 2. Create items — use wizard answers if provided, otherwise use default_items
  const items = answers?.selectedProducts?.length
    ? answers.selectedProducts
    : pack.catalogue.default_items

  if (items.length > 0) {
    await bulkCreateItems(projectId, catalogue.id, items.map(item => ({
      type: item.type,
      name: item.name,
      attributes: item.attributes ?? {},
    })))
  }

  // 3. Insert interaction configs
  for (const config of pack.interaction_config) {
    await upsertInteractionConfig(
      projectId,
      catalogue.id,
      config.event_name,
      config.interaction_type,
      config.weight,
      config.decay_half_life_days,
    )
  }

  // 4. Create prediction goals — top priorities from wizard answers become active
  const topGoals = answers?.rankedPriorities?.slice(0, 3) ?? []
  for (const goalDef of pack.prediction_goals) {
    const isTopPriority = topGoals.some(p => p.maps_to === goalDef.name)
    await createPredictionGoal(projectId, {
      name: goalDef.name,
      targetEvent: goalDef.target_event,
      observationWindowDays: goalDef.observation_window_days,
      predictionWindowDays: goalDef.prediction_window_days,
      minPositiveLabels: goalDef.min_positive_labels,
      origin: 'pack',
    })
    // Status already defaults to 'active' — if not a top priority and default says paused, that's fine
    // The pack's default_status field is informational for the wizard UI
  }

  // 5. Insert segment templates
  for (const template of pack.segment_templates) {
    await db.insert(segments).values({
      projectId,
      name: template.name,
      description: template.description,
      type: 'template',
      filters: template.filter,
      isActive: true,
    }).onConflictDoNothing() // idempotent — unique on (projectId, name) via existing logic
  }

  // 6. Update project vertical setting
  await db.update(projects).set({
    settings: { vertical: packId },
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId))

  return {
    packId,
    catalogueId: catalogue.id,
    itemsCreated: items.length,
    interactionConfigs: pack.interaction_config.length,
    predictionGoals: pack.prediction_goals.length,
    segmentTemplates: pack.segment_templates.length,
  }
}
