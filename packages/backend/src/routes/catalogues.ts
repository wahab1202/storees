import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import {
  createCatalogue,
  listCatalogues,
  getCatalogue,
  updateCatalogue,
} from '../services/catalogueService.js'

const router = Router()

// GET /api/catalogues?projectId=...
router.get('/', requireProjectId, async (req, res) => {
  try {
    const rows = await listCatalogues(req.projectId!)
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Catalogue list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch catalogues' })
  }
})

// GET /api/catalogues/:id?projectId=...
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const catalogue = await getCatalogue(req.projectId!, req.params.id as string)
    if (!catalogue) {
      return res.status(404).json({ success: false, error: 'Catalogue not found' })
    }
    res.json({ success: true, data: catalogue })
  } catch (err) {
    console.error('Catalogue detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch catalogue' })
  }
})

// POST /api/catalogues?projectId=...
// Body: { name, itemTypeLabel, attributeSchema? }
router.post('/', requireProjectId, async (req, res) => {
  try {
    const { name, itemTypeLabel, attributeSchema } = req.body
    if (!name || !itemTypeLabel) {
      return res.status(400).json({ success: false, error: 'name and itemTypeLabel are required' })
    }

    const catalogue = await createCatalogue(req.projectId!, name, itemTypeLabel, attributeSchema)
    res.status(201).json({ success: true, data: catalogue })
  } catch (err) {
    console.error('Catalogue create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create catalogue' })
  }
})

// PATCH /api/catalogues/:id?projectId=...
router.patch('/:id', requireProjectId, async (req, res) => {
  try {
    const catalogue = await getCatalogue(req.projectId!, req.params.id as string)
    if (!catalogue) {
      return res.status(404).json({ success: false, error: 'Catalogue not found' })
    }

    const updated = await updateCatalogue(req.params.id as string, req.body)
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Catalogue update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update catalogue' })
  }
})

export default router
