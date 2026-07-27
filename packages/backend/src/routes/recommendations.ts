import { Router } from 'express'
import { and, eq, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { productRecommendations } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import { recommendForProduct, socialProof } from '../services/decisioningService.js'

// Cross-sell / recommendation pairing config + preview (Decisioning Step 1).
const router = Router()

// GET /api/recommendations?projectId= — list the project's pairing rules.
router.get('/', requireProjectId, async (req, res) => {
  const rows = await db.select().from(productRecommendations)
    .where(eq(productRecommendations.projectId, req.projectId!))
    .orderBy(desc(productRecommendations.createdAt))
  res.json({ success: true, data: rows })
})

// POST /api/recommendations — create a pairing rule.
router.post('/', requireRole('admin'), requireProjectId, async (req, res) => {
  try {
    const { matchType, matchValue, recommendProductId, rank } = req.body as {
      matchType?: string; matchValue?: string; recommendProductId?: string; rank?: number
    }
    if (!['product', 'product_type', 'collection'].includes(matchType ?? '') || !matchValue?.trim() || !recommendProductId?.trim()) {
      return res.status(400).json({ success: false, error: 'matchType (product|product_type|collection), matchValue, recommendProductId are required' })
    }
    const [row] = await db.insert(productRecommendations).values({
      projectId: req.projectId!,
      matchType: matchType!,
      matchValue: matchValue!.trim(),
      recommendProductId: recommendProductId!.trim(),
      rank: Number(rank) || 0,
    }).onConflictDoUpdate({
      target: [productRecommendations.projectId, productRecommendations.matchType, productRecommendations.matchValue, productRecommendations.recommendProductId],
      set: { rank: Number(rank) || 0 },
    }).returning({ id: productRecommendations.id })
    res.status(201).json({ success: true, data: { id: row.id } })
  } catch (err) {
    console.error('Create recommendation error:', err)
    res.status(500).json({ success: false, error: 'Failed to save recommendation' })
  }
})

// DELETE /api/recommendations/:id — remove a pairing rule.
router.delete('/:id', requireRole('admin'), requireProjectId, async (req, res) => {
  await db.delete(productRecommendations)
    .where(and(eq(productRecommendations.id, req.params.id as string), eq(productRecommendations.projectId, req.projectId!)))
  res.json({ success: true })
})

// GET /api/recommendations/resolve?productId= — preview the resolved
// recommendation + live social proof for a product. Same output flows and the
// storefront will consume; this is the decisioning API in miniature.
router.get('/resolve', requireProjectId, async (req, res) => {
  const productId = req.query.productId as string | undefined
  if (!productId) return res.status(400).json({ success: false, error: 'productId is required' })
  const [recommended, proof] = await Promise.all([
    recommendForProduct(req.projectId!, productId, 3),
    socialProof(req.projectId!, productId),
  ])
  res.json({ success: true, data: { recommended, socialProof: proof } })
})

export default router
