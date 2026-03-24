import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import {
  listPacks,
  loadPack,
  getWizardQuestions,
  activatePack,
} from '../services/verticalPackService.js'

const router = Router()

// GET /api/packs — List all available vertical packs
router.get('/', (_req, res) => {
  try {
    const packs = listPacks()
    res.json({ success: true, data: packs })
  } catch (err) {
    console.error('Pack list error:', err)
    res.status(500).json({ success: false, error: 'Failed to list packs' })
  }
})

// GET /api/packs/:id — Get full pack config
router.get('/:id', (req, res) => {
  try {
    const pack = loadPack(req.params.id as string)
    if (!pack) {
      return res.status(404).json({ success: false, error: 'Pack not found' })
    }
    res.json({ success: true, data: pack })
  } catch (err) {
    console.error('Pack detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch pack' })
  }
})

// GET /api/packs/:id/wizard — Get wizard questions for a pack
router.get('/:id/wizard', (req, res) => {
  try {
    const questions = getWizardQuestions(req.params.id as string)
    if (!questions) {
      return res.status(404).json({ success: false, error: 'Pack not found' })
    }
    res.json({ success: true, data: questions })
  } catch (err) {
    console.error('Pack wizard error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch wizard questions' })
  }
})

// POST /api/packs/:id/activate?projectId=...
// Body: { selectedProducts?, rankedPriorities?, channels?, customerVolume? }
router.post('/:id/activate', requireProjectId, async (req, res) => {
  try {
    const result = await activatePack(
      req.projectId!,
      req.params.id as string,
      req.body,
    )
    res.status(201).json({ success: true, data: result })
  } catch (err) {
    console.error('Pack activation error:', err)
    const message = err instanceof Error ? err.message : 'Failed to activate pack'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
