import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { db } from '../db/connection.js'
import { projects, segments, dataSourceConnectors, catalogues, predictionGoals } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
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
  /** Where the money sits inside this vertical's events. The pipeline defaults to a
   *  shop's vocabulary — `order_id` and `total` — which is right for retail and wrong
   *  everywhere else: a lender sends `loan_id` and `amount`, so every loan would be
   *  discarded and four of its five models could not train. Absent means the retail
   *  defaults are correct for this vertical. */
  field_defaults?: {
    order?: { order_id?: string; amount?: string; currency?: string }
  }
  /** Which event's gaps measure how fast this vertical's relationship moves. Window
   *  sizes are scaled by that pace, and it is read off the purchase by default — right
   *  for a shop whose customers buy repeatedly, unmeasurable for a lender whose
   *  customers take one loan. With nothing to measure the ML uses a fixed 14 days, and
   *  a churn goal then asks "quiet for 42 days?" of borrowers who are normally quiet
   *  for months. Lending's real clock is the monthly EMI. Absent means the purchase is
   *  the right clock. Format: `order`, or `event:<event_name>`. */
  cadence_signal?: string
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
    if (files.length === 0) {
      console.error(`[verticalPackService] PACKS_DIR exists but is empty: ${PACKS_DIR}. Check that the build step copied src/packs/*.json into dist/packs/.`)
    }
    return files.map(f => {
      const packId = f.replace('.json', '')
      const pack = loadPack(packId)
      if (!pack) return null
      return { id: pack.id, name: pack.name, icon: pack.icon, description: pack.description }
    }).filter(Boolean) as Pick<VerticalPack, 'id' | 'name' | 'icon' | 'description'>[]
  } catch (err) {
    console.error(`[verticalPackService] Could not read PACKS_DIR (${PACKS_DIR}):`, err)
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

  // THIS WHOLE FUNCTION HAS TO SURVIVE BEING RUN TWICE.
  //
  // It could not. Step 5 checked for existing segments before inserting, but the
  // catalogue and the goals went straight to INSERT — and `prediction_goals` carries a
  // unique index on (project_id, name). So a second activation built a duplicate
  // catalogue, then threw on the first goal and abandoned the rest: no field paths, no
  // cadence signal, two catalogues, half the goals missing, and an error at the caller.
  //
  // Re-activation is not exotic. A merchant reinstalling a Shopify app hits it, so does
  // changing a project's industry, and so does re-running a pack to pick up pack
  // changes — which is exactly what an existing project needs after the packs are
  // edited. Every step below now checks before it writes.

  // 1. Catalogue — find or create
  const [existingCatalogue] = await db
    .select()
    .from(catalogues)
    .where(and(eq(catalogues.projectId, projectId), eq(catalogues.name, pack.catalogue.name)))
    .limit(1)

  const catalogue = existingCatalogue ?? await createCatalogue(
    projectId,
    pack.catalogue.name,
    pack.catalogue.item_type_label,
    pack.catalogue.attribute_schema,
  )

  // 2. Items — only for a NEW catalogue. Re-adding them to one that already exists
  // duplicates every product the project has, which is worse than skipping.
  const items = answers?.selectedProducts?.length
    ? answers.selectedProducts
    : pack.catalogue.default_items

  if (!existingCatalogue && items.length > 0) {
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
    // (project_id, name) is UNIQUE — inserting a second time throws and takes the rest
    // of the activation with it. A goal that already exists is left alone rather than
    // overwritten: its windows and metrics were rewritten by training, and the pack's
    // numbers are only seeds.
    const [existingGoal] = await db
      .select({ id: predictionGoals.id })
      .from(predictionGoals)
      .where(and(eq(predictionGoals.projectId, projectId), eq(predictionGoals.name, goalDef.name)))
      .limit(1)
    if (existingGoal) continue
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

  // 5. Insert segment templates — skip names that already exist for the
  // project. (onConflictDoNothing was a no-op: there is NO unique index on
  // (project_id, name), so it never matched — which is exactly how projects
  // ended up with duplicate "Repeat Buyers" seeded by both onboarding AND a
  // vertical pack.)
  for (const template of pack.segment_templates) {
    const [dup] = await db.select({ id: segments.id }).from(segments)
      .where(and(eq(segments.projectId, projectId), eq(segments.name, template.name)))
      .limit(1)
    if (dup) continue
    await db.insert(segments).values({
      projectId,
      name: template.name,
      description: template.description,
      type: 'template',
      filters: template.filter,
      isActive: true,
    })
  }

  // 6. Field paths — which keys inside `properties` carry the id and the amount —
  // and the cadence signal, which names the event whose gaps measure how fast this
  // industry's relationship moves. Written here because this is the one moment the
  // industry is known; after this the project carries its own answers and nothing
  // downstream needs to know the vertical.
  //
  // The cadence signal exists because "how often does a customer do this?" is read off
  // the purchase everywhere, and a borrower purchases once. With no gaps to measure the
  // ML falls back to a fixed 14 days, and the goals sized off it ask the wrong-sized
  // question. Lending's real clock is the monthly EMI. Only the ANSWER is per-industry;
  // the code that reads it is the same for everyone.
  //
  // Stored on the connector config, which is the first place the pipeline looks.
  if (pack.field_defaults || pack.cadence_signal) {
    const [existing] = await db
      .select({ id: dataSourceConnectors.id, config: dataSourceConnectors.config })
      .from(dataSourceConnectors)
      .where(eq(dataSourceConnectors.projectId, projectId))
      .limit(1)

    const prev = (existing?.config ?? {}) as Record<string, any>
    // only fill what is not already set — a mapping corrected by hand outranks a default
    const nextConfig = {
      ...prev,
      mapping: {
        ...(prev.mapping ?? {}),
        fields: { ...(pack.field_defaults), ...(prev.mapping?.fields ?? {}) },
        ...(pack.cadence_signal && !prev.mapping?.cadence_signal
          ? { cadence_signal: pack.cadence_signal }
          : {}),
      },
    }

    if (existing) {
      await db.update(dataSourceConnectors)
        .set({ config: nextConfig, updatedAt: new Date() })
        .where(eq(dataSourceConnectors.id, existing.id))
    } else {
      // No connector for this project, so one is created purely to hold the setting.
      // NOT active: the sync worker fans out over active rows and would try to pull
      // from a base URL that does not exist.
      await db.insert(dataSourceConnectors).values({
        projectId,
        template: 'event_mapping',
        name: 'Event mapping',
        baseUrl: '',
        authConfig: '{}',
        config: nextConfig,
        status: 'inactive',
      })
    }
  }

  // 7. Update project vertical setting
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
