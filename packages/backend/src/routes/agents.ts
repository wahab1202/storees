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

// POST /api/agents/backfill?projectId=...
// Mirrors db/data/gowelmart_agent_backfill.sql for one project, callable from
// the wire so we don't need DB access to seed dealers on prod. Idempotent:
//   - INSERT ... ON CONFLICT DO NOTHING on (project_id, external_dealer_id)
//   - UPDATE customers ... WHERE agent_id IS NULL
// Reads from customers.custom_attributes where _source='gowelmart_import'.
router.post('/backfill', async (req, res) => {
  try {
    const projectId = req.projectId!

    const candidates = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM customers
      WHERE project_id = ${projectId}
        AND custom_attributes->>'_source' = 'gowelmart_import'
        AND COALESCE(custom_attributes->>'dealer_id', '') <> ''
    `)
    const candidateCount = Number((candidates.rows[0] as { cnt?: number })?.cnt ?? 0)

    if (candidateCount === 0) {
      return res.json({
        success: true,
        data: {
          candidateCount: 0,
          agentsInserted: 0,
          customersLinked: 0,
          message: 'No customers with _source=gowelmart_import and dealer_id found for this project',
        },
      })
    }

    const result = await db.transaction(async (tx) => {
      const ins = await tx.execute(sql`
        INSERT INTO agents (project_id, external_dealer_id, name)
        SELECT DISTINCT
          c.project_id,
          c.custom_attributes->>'dealer_id' AS external_dealer_id,
          COALESCE(
            NULLIF(c.custom_attributes->>'company', ''),
            'Dealer ' || (c.custom_attributes->>'dealer_id')
          ) AS name
        FROM customers c
        WHERE c.project_id = ${projectId}
          AND c.custom_attributes->>'_source' = 'gowelmart_import'
          AND COALESCE(c.custom_attributes->>'dealer_id', '') <> ''
        ON CONFLICT (project_id, external_dealer_id) DO NOTHING
      `)

      const upd = await tx.execute(sql`
        UPDATE customers c
        SET
          agent_id = a.id,
          city     = NULLIF(c.custom_attributes->>'postal_code', ''),
          region   = NULLIF(c.custom_attributes->>'country', ''),
          updated_at = NOW()
        FROM agents a
        WHERE a.project_id = c.project_id
          AND a.external_dealer_id = c.custom_attributes->>'dealer_id'
          AND c.project_id = ${projectId}
          AND c.custom_attributes->>'_source' = 'gowelmart_import'
          AND c.agent_id IS NULL
      `)

      return {
        agentsInserted: ins.rowCount ?? 0,
        customersLinked: upd.rowCount ?? 0,
      }
    })

    res.json({
      success: true,
      data: { candidateCount, ...result },
    })
  } catch (err) {
    console.error('Agent backfill error:', err)
    res.status(500).json({ success: false, error: 'Failed to backfill agents' })
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
