import { Router, Request, Response } from 'express'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { loadPack, getWizardQuestions, activatePack, listPacks } from '../services/verticalPackService.js'

const router = Router()

/**
 * GET /api/wizard/steps/:packId — Get wizard step definitions for a vertical pack.
 *
 * Returns the 7-step wizard configuration with pack-specific questions.
 * The frontend renders these steps dynamically.
 */
router.get('/steps/:packId', (req: Request, res: Response) => {
  try {
    const packId = req.params.packId as string
    const pack = loadPack(packId)

    if (!pack) {
      return res.status(404).json({ success: false, error: 'Pack not found' })
    }

    const questions = pack.wizard_questions

    const steps = [
      {
        step: 1,
        id: 'industry',
        title: 'Select your industry',
        description: 'Choose the vertical that best matches your business',
        type: 'single_select',
        options: listPacks().map(p => ({ id: p.id, name: p.name, icon: p.icon, description: p.description })),
        selected: packId,
      },
      {
        step: 2,
        id: 'products',
        title: questions.products_label,
        description: 'Select the products or services you offer. We\'ll set up your item catalogue automatically.',
        type: 'multi_select',
        options: questions.products_options,
      },
      {
        step: 3,
        id: 'journey',
        title: 'Map your customer journey',
        description: 'Select the key steps in your customer lifecycle. This configures event tracking and interaction weights.',
        type: 'multi_select',
        options: questions.journey_steps,
      },
      {
        step: 4,
        id: 'priorities',
        title: 'What are your business priorities?',
        description: 'Rank these in order of importance. Your top priorities become active AI prediction goals.',
        type: 'rank',
        options: questions.priorities,
      },
      {
        step: 5,
        id: 'channels',
        title: 'Communication channels',
        description: 'Which channels do you want to use to reach your customers?',
        type: 'multi_select',
        options: ['Email', 'SMS', 'WhatsApp', 'Push Notifications', 'In-App Messages'],
      },
      {
        step: 6,
        id: 'volume',
        title: 'Customer volume',
        description: 'How many customers do you have? This helps us optimize data processing thresholds.',
        type: 'single_select',
        options: [
          { id: 'starter', label: 'Up to 1,000', thresholds: { min_positive_labels: 50 } },
          { id: 'growing', label: '1,000 - 10,000', thresholds: { min_positive_labels: 100 } },
          { id: 'scaling', label: '10,000 - 100,000', thresholds: { min_positive_labels: 200 } },
          { id: 'enterprise', label: '100,000+', thresholds: { min_positive_labels: 500 } },
        ],
      },
      {
        step: 7,
        id: 'summary',
        title: 'Review & Launch',
        description: 'Review your configuration and launch your workspace.',
        type: 'summary',
      },
    ]

    res.json({ success: true, data: { packId, steps } })
  } catch (err) {
    console.error('Wizard steps error:', err)
    res.status(500).json({ success: false, error: 'Failed to get wizard steps' })
  }
})

/**
 * POST /api/wizard/complete — Complete the onboarding wizard.
 *
 * Accepts all 7 step answers at once and activates the vertical pack.
 * Creates project if projectId not provided, or configures existing project.
 *
 * Body: {
 *   projectId?: string,        // Existing project (from step 1 project creation)
 *   projectName?: string,      // For new project creation
 *   packId: string,            // Selected vertical pack
 *   products: string[],        // Step 2 selections
 *   journeySteps: string[],    // Step 3 selections
 *   priorities: { label: string, maps_to: string | null }[], // Step 4 ranked
 *   channels: string[],        // Step 5 selections
 *   customerVolume: string,    // Step 6 selection id
 * }
 */
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const {
      projectId,
      projectName,
      packId,
      products,
      journeySteps,
      priorities,
      channels,
      customerVolume,
    } = req.body

    if (!packId) {
      return res.status(400).json({ success: false, error: 'packId is required' })
    }

    const pack = loadPack(packId)
    if (!pack) {
      return res.status(400).json({ success: false, error: `Unknown pack: ${packId}` })
    }

    // Resolve or create project
    let resolvedProjectId = projectId
    if (!resolvedProjectId) {
      if (!projectName) {
        return res.status(400).json({ success: false, error: 'projectId or projectName required' })
      }

      // Map pack ID to domain type
      const domainMap: Record<string, string> = {
        ecommerce: 'ecommerce',
        nbfc: 'fintech',
        saas: 'saas',
        edtech: 'custom',
      }

      const [project] = await db.insert(projects).values({
        name: projectName,
        domainType: domainMap[packId] ?? 'custom',
        integrationType: packId === 'ecommerce' ? 'shopify' : 'api_key',
        settings: {},
      }).returning()

      resolvedProjectId = project.id
    }

    // Build wizard answers for pack activation
    const selectedProducts = (products ?? []).map((name: string) => ({
      name,
      type: pack.catalogue.item_type_label.toLowerCase().replace(/\s+/g, '_'),
      attributes: {},
    }))

    const result = await activatePack(resolvedProjectId, packId, {
      selectedProducts,
      rankedPriorities: priorities ?? [],
      channels: channels ?? [],
      customerVolume: customerVolume ?? 'growing',
    })

    // Store wizard answers in project settings for reference
    await db.update(projects).set({
      settings: {
        vertical: packId,
        wizard_completed: true,
        wizard_answers: {
          products,
          journeySteps,
          priorities,
          channels,
          customerVolume,
        },
      },
      updatedAt: new Date(),
    }).where(eq(projects.id, resolvedProjectId))

    res.status(201).json({
      success: true,
      data: {
        projectId: resolvedProjectId,
        ...result,
        next_step: packId === 'ecommerce' ? 'connect_shopify' : 'sdk_setup',
      },
    })
  } catch (err) {
    console.error('Wizard complete error:', err)
    const message = err instanceof Error ? err.message : 'Failed to complete wizard'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
