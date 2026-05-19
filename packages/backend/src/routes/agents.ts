import { Router } from 'express'
import { eq, and, asc, count, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { agents, customers } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'

const router = Router()

// All agent admin endpoints are admin-only.
router.use(requireRole('admin'), requireProjectId)

// GET /api/agents?projectId=...
router.get('/', async (req, res) => {
  try {
    const projectId = req.projectId!

    const rows = await db
      .select({
        id: agents.id,
        externalDealerId: agents.externalDealerId,
        name: agents.name,
        email: agents.email,
        phone: agents.phone,
        region: agents.region,
        city: agents.city,
        managerId: agents.managerId,
        isActive: agents.isActive,
        createdAt: agents.createdAt,
        customerCount: sql<number>`(
          SELECT COUNT(*)::int FROM customers
          WHERE customers.agent_id = ${agents.id} AND customers.project_id = ${projectId}
        )`,
      })
      .from(agents)
      .where(eq(agents.projectId, projectId))
      .orderBy(asc(agents.name))

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Agents list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch agents' })
  }
})

// POST /api/agents?projectId=...
router.post('/', async (req, res) => {
  try {
    const projectId = req.projectId!
    const { name, email, phone, region, city, externalDealerId, managerId } = req.body

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Name is required' })
    }

    const [row] = await db
      .insert(agents)
      .values({
        projectId,
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        region: region?.trim() || null,
        city: city?.trim() || null,
        externalDealerId: externalDealerId?.trim() || null,
        managerId: managerId || null,
      })
      .returning()

    res.status(201).json({ success: true, data: row })
  } catch (err) {
    console.error('Agent create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create agent' })
  }
})

// PATCH /api/agents/:id?projectId=...
router.patch('/:id', async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string
    const { name, email, phone, region, city, externalDealerId, managerId, isActive } = req.body

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name.trim()
    if (email !== undefined) updates.email = email?.trim() || null
    if (phone !== undefined) updates.phone = phone?.trim() || null
    if (region !== undefined) updates.region = region?.trim() || null
    if (city !== undefined) updates.city = city?.trim() || null
    if (externalDealerId !== undefined) updates.externalDealerId = externalDealerId?.trim() || null
    if (managerId !== undefined) updates.managerId = managerId || null
    if (isActive !== undefined) updates.isActive = isActive

    const [row] = await db
      .update(agents)
      .set(updates)
      .where(and(eq(agents.id, id), eq(agents.projectId, projectId)))
      .returning()

    if (!row) return res.status(404).json({ success: false, error: 'Agent not found' })

    res.json({ success: true, data: row })
  } catch (err) {
    console.error('Agent update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update agent' })
  }
})

export default router
