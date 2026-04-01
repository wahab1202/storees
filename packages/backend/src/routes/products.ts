import { Router } from 'express'
import { eq, ilike, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { products, collections, productCollections } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'

const router = Router()

// GET /api/products?projectId=...&search=...
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const search = (req.query.search as string) || ''

    const conditions = [eq(products.projectId, projectId)]
    if (search.trim()) {
      conditions.push(ilike(products.title, `%${search.trim()}%`))
    }

    const rows = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .limit(50)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Product list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch products' })
  }
})

// GET /api/products/categories?projectId=... — distinct product types
router.get('/categories', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    const rows = await db
      .selectDistinct({ productType: products.productType })
      .from(products)
      .where(and(eq(products.projectId, projectId), eq(products.status, 'active')))
      .orderBy(products.productType)

    const categories = rows
      .map(r => r.productType)
      .filter((t): t is string => !!t && t.trim() !== '')

    res.json({ success: true, data: categories })
  } catch (err) {
    console.error('Product categories error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch product categories' })
  }
})

// GET /api/products/collections?projectId=...
router.get('/collections', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    const rows = await db
      .select()
      .from(collections)
      .where(eq(collections.projectId, projectId))

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Collection list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch collections' })
  }
})

// GET /api/products/by-collection/:collectionId?projectId=...
router.get('/by-collection/:collectionId', requireProjectId, async (req, res) => {
  try {
    const collectionId = req.params.collectionId as string

    const rows = await db
      .select({ product: products })
      .from(productCollections)
      .innerJoin(products, eq(products.id, productCollections.productId))
      .where(eq(productCollections.collectionId, collectionId))

    res.json({ success: true, data: rows.map(r => r.product) })
  } catch (err) {
    console.error('Products by collection error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch products' })
  }
})

export default router
