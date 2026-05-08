import { Router } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { subscriptionCategories } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'

const router = Router()

// GET /api/subscription-categories?projectId=...
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    await ensureDefaultCategory(projectId)

    const rows = await db
      .select()
      .from(subscriptionCategories)
      .where(and(
        eq(subscriptionCategories.projectId, projectId),
        eq(subscriptionCategories.isActive, true),
      ))
      .orderBy(subscriptionCategories.name)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('[SubscriptionCategories] List error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch subscription categories' })
  }
})

// POST /api/subscription-categories?projectId=...
router.post('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const { name, description, channel } = req.body as {
      name?: string
      description?: string | null
      channel?: string | null
    }

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' })
    }
    if (channel != null && !['email', 'sms', 'push', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, error: 'Invalid channel' })
    }

    const [created] = await db
      .insert(subscriptionCategories)
      .values({
        projectId,
        name: name.trim(),
        description: description?.trim() || null,
        channel: channel ?? null,
      })
      .onConflictDoUpdate({
        target: [subscriptionCategories.projectId, subscriptionCategories.name],
        set: {
          description: description?.trim() || null,
          channel: channel ?? null,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning()

    res.status(201).json({ success: true, data: created })
  } catch (err) {
    console.error('[SubscriptionCategories] Create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create subscription category' })
  }
})

async function ensureDefaultCategory(projectId: string) {
  await db
    .insert(subscriptionCategories)
    .values({
      projectId,
      name: 'General marketing',
      description: 'Default marketing subscription category for campaign sends.',
      channel: null,
    })
    .onConflictDoNothing({
      target: [subscriptionCategories.projectId, subscriptionCategories.name],
    })
}

export default router
