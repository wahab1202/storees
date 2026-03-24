import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import {
  createItem,
  bulkCreateItems,
  listItems,
  getItem,
  updateItem,
} from '../services/itemService.js'

const router = Router()

// GET /api/items?projectId=...&catalogueId=...&type=...&search=...&page=1&pageSize=25
router.get('/', requireProjectId, async (req, res) => {
  try {
    const result = await listItems(req.projectId!, {
      catalogueId: req.query.catalogueId as string | undefined,
      type: req.query.type as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })

    res.json({ success: true, ...result })
  } catch (err) {
    console.error('Items list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch items' })
  }
})

// GET /api/items/:id?projectId=...
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const item = await getItem(req.projectId!, req.params.id as string)
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' })
    }
    res.json({ success: true, data: item })
  } catch (err) {
    console.error('Item detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch item' })
  }
})

// POST /api/items?projectId=...
// Body: { catalogueId, externalId?, type, name, attributes? }
router.post('/', requireProjectId, async (req, res) => {
  try {
    const { catalogueId, externalId, type, name, attributes } = req.body
    if (!catalogueId || !type || !name) {
      return res.status(400).json({ success: false, error: 'catalogueId, type, and name are required' })
    }

    const item = await createItem(req.projectId!, catalogueId, { externalId, type, name, attributes })
    res.status(201).json({ success: true, data: item })
  } catch (err) {
    console.error('Item create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create item' })
  }
})

// POST /api/items/bulk?projectId=...
// Body: { catalogueId, items: [{ externalId?, type, name, attributes? }] }
router.post('/bulk', requireProjectId, async (req, res) => {
  try {
    const { catalogueId, items: itemsData } = req.body
    if (!catalogueId || !Array.isArray(itemsData)) {
      return res.status(400).json({ success: false, error: 'catalogueId and items array required' })
    }

    const count = await bulkCreateItems(req.projectId!, catalogueId, itemsData)
    res.status(201).json({ success: true, data: { inserted: count } })
  } catch (err) {
    console.error('Items bulk create error:', err)
    res.status(500).json({ success: false, error: 'Failed to bulk create items' })
  }
})

// PATCH /api/items/:id?projectId=...
router.patch('/:id', requireProjectId, async (req, res) => {
  try {
    const item = await getItem(req.projectId!, req.params.id as string)
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' })
    }

    const updated = await updateItem(req.params.id as string, req.body)
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Item update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update item' })
  }
})

export default router
