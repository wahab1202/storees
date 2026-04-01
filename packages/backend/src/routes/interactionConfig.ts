import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import {
  upsertInteractionConfig,
  listInteractionConfigs,
} from '../services/interactionEngine.js'

const router = Router()

// GET /api/interaction-config?projectId=...
router.get('/', requireProjectId, async (req, res) => {
  try {
    const configs = await listInteractionConfigs(req.projectId!)
    res.json({ success: true, data: configs })
  } catch (err) {
    console.error('Interaction config list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch interaction configs' })
  }
})

// POST /api/interaction-config?projectId=...
// Body: { catalogueId, eventName, interactionType, weight, decayHalfLifeDays? }
router.post('/', requireProjectId, async (req, res) => {
  try {
    const { catalogueId, eventName, interactionType, weight, decayHalfLifeDays } = req.body

    if (!catalogueId || !eventName || !interactionType || weight === undefined) {
      return res.status(400).json({
        success: false,
        error: 'catalogueId, eventName, interactionType, and weight are required',
      })
    }

    const config = await upsertInteractionConfig(
      req.projectId!,
      catalogueId,
      eventName,
      interactionType,
      Number(weight),
      decayHalfLifeDays ?? 30,
    )

    res.status(201).json({ success: true, data: config })
  } catch (err) {
    console.error('Interaction config create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create interaction config' })
  }
})

// POST /api/interaction-config/bulk?projectId=...
// Body: { configs: [{ catalogueId, eventName, interactionType, weight, decayHalfLifeDays? }] }
router.post('/bulk', requireProjectId, async (req, res) => {
  try {
    const { configs } = req.body as {
      configs: { catalogueId: string; eventName: string; interactionType: string; weight: number; decayHalfLifeDays?: number }[]
    }

    if (!Array.isArray(configs)) {
      return res.status(400).json({ success: false, error: 'configs array required' })
    }

    const results = []
    for (const c of configs) {
      const config = await upsertInteractionConfig(
        req.projectId!,
        c.catalogueId,
        c.eventName,
        c.interactionType,
        c.weight,
        c.decayHalfLifeDays ?? 30,
      )
      results.push(config)
    }

    res.status(201).json({ success: true, data: results })
  } catch (err) {
    console.error('Interaction config bulk error:', err)
    res.status(500).json({ success: false, error: 'Failed to bulk create interaction configs' })
  }
})

export default router
