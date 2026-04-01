import { Router } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import { db } from '../db/connection.js'
import { predictionScores, predictionGoals, customers } from '../db/schema.js'
import { eq, and, desc, asc, count, avg } from 'drizzle-orm'
import { checkMlHealth, explainCustomer } from '../services/mlProxyService.js'
import { clampPageSize, calcTotalPages } from '@storees/shared'

const router = Router()

// GET /api/predictions/health
// Check if ML service is available
router.get('/health', async (_req, res) => {
  const available = await checkMlHealth()
  res.json({ success: true, data: { mlAvailable: available } })
})

// GET /api/predictions/goals/:goalId/customers?projectId=...&bucket=high|medium|low&page=1&pageSize=25&sort=score_desc|score_asc
// Returns paginated customers with their prediction scores for a specific goal, plus aggregate stats
router.get('/goals/:goalId/customers', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const goalId = req.params.goalId as string
    const bucket = req.query.bucket as string | undefined
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = clampPageSize(Number(req.query.pageSize) || undefined)
    const sort = (req.query.sort as string) || 'score_desc'
    const offset = (page - 1) * pageSize

    // Build WHERE conditions
    const conditions = [
      eq(predictionScores.projectId, projectId),
      eq(predictionScores.goalId, goalId),
    ]

    if (bucket) {
      conditions.push(eq(predictionScores.bucket, bucket))
    }

    const whereClause = and(...conditions)

    // Order clause
    const orderFn = sort === 'score_asc'
      ? asc(predictionScores.score)
      : desc(predictionScores.score)

    // Fetch paginated results joining prediction_scores with customers
    const rows = await db
      .select({
        customerId: customers.id,
        customerName: customers.name,
        customerEmail: customers.email,
        score: predictionScores.score,
        bucket: predictionScores.bucket,
        confidence: predictionScores.confidence,
        factors: predictionScores.factors,
        computedAt: predictionScores.computedAt,
      })
      .from(predictionScores)
      .innerJoin(customers, eq(predictionScores.customerId, customers.id))
      .where(whereClause)
      .orderBy(orderFn)
      .limit(pageSize)
      .offset(offset)

    // Count total matching rows
    const [{ total }] = await db
      .select({ total: count() })
      .from(predictionScores)
      .where(whereClause)

    // Aggregate stats: count by bucket + average score (unfiltered by bucket)
    const baseConditions = [
      eq(predictionScores.projectId, projectId),
      eq(predictionScores.goalId, goalId),
    ]
    const baseWhere = and(...baseConditions)

    const bucketStats = await db
      .select({
        bucket: predictionScores.bucket,
        count: count(),
        avgScore: avg(predictionScores.score),
      })
      .from(predictionScores)
      .where(baseWhere)
      .groupBy(predictionScores.bucket)

    const stats = {
      total: bucketStats.reduce((sum, b) => sum + Number(b.count), 0),
      avgScore: 0,
      buckets: { high: 0, medium: 0, low: 0 } as Record<string, number>,
    }

    let weightedSum = 0
    for (const row of bucketStats) {
      const bucketKey = row.bucket.toLowerCase()
      stats.buckets[bucketKey] = Number(row.count)
      weightedSum += Number(row.avgScore || 0) * Number(row.count)
    }
    stats.avgScore = stats.total > 0
      ? Math.round((weightedSum / stats.total) * 100) / 100
      : 0

    res.json({
      success: true,
      data: rows,
      stats,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calcTotalPages(total, pageSize),
      },
    })
  } catch (err) {
    console.error('Goal customers error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch goal customers' })
  }
})

// GET /api/predictions/:customerId?projectId=...
// Returns all prediction scores for a customer with goal metadata
router.get('/:customerId', requireProjectId, async (req, res) => {
  try {
    const customerId = req.params.customerId as string

    // Get latest score per goal for this customer from DB
    const rows = await db
      .select({
        id: predictionScores.id,
        customerId: predictionScores.customerId,
        goalId: predictionScores.goalId,
        goalName: predictionGoals.name,
        score: predictionScores.score,
        confidence: predictionScores.confidence,
        bucket: predictionScores.bucket,
        factors: predictionScores.factors,
        modelVersion: predictionScores.modelVersion,
        computedAt: predictionScores.computedAt,
      })
      .from(predictionScores)
      .innerJoin(predictionGoals, eq(predictionScores.goalId, predictionGoals.id))
      .where(
        and(
          eq(predictionScores.projectId, req.projectId!),
          eq(predictionScores.customerId, customerId),
          eq(predictionGoals.status, 'active'),
        ),
      )
      .orderBy(desc(predictionScores.computedAt))

    // Deduplicate: keep latest score per goal
    const seen = new Set<string>()
    const scores = rows.filter(r => {
      if (seen.has(r.goalId)) return false
      seen.add(r.goalId)
      return true
    })

    res.json({ success: true, data: { scores } })
  } catch (err) {
    console.error('Customer predictions error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch customer predictions' })
  }
})

// POST /api/predictions/:customerId/explain?projectId=...
// Body: { goalId }
// Get SHAP explainability from ML service in real-time
router.post('/:customerId/explain', requireProjectId, async (req, res) => {
  try {
    const customerId = req.params.customerId as string
    const { goalId } = req.body

    if (!goalId) {
      return res.status(400).json({ success: false, error: 'goalId is required' })
    }

    const mlAvailable = await checkMlHealth()
    if (!mlAvailable) {
      return res.status(503).json({
        success: false,
        error: 'AI features temporarily unavailable',
      })
    }

    const result = await explainCustomer(req.projectId!, goalId, customerId)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Prediction explain error:', err)
    res.status(500).json({ success: false, error: 'Failed to get prediction explanation' })
  }
})

export default router
