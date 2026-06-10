import { Router } from 'express'
import { eq, and, asc, count, sql } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../db/connection.js'
import { agents, customers, adminUsers } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import { hashPassword } from '../services/authService.js'

const router = Router()

// Readable one-time temporary password for a freshly provisioned dealer login.
// 12 url-safe chars — admin distributes it; the dealer changes it via reset.
function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64url')
}

type ProvisionOutcome =
  | { status: 'provisioned'; agentId: string; name: string; email: string; tempPassword: string; loginId: string }
  | { status: 'reset'; agentId: string; name: string; email: string; tempPassword: string; loginId: string }
  | { status: 'already_provisioned'; agentId: string; name: string; email: string; loginId: string }
  | { status: 'skipped'; agentId: string; name: string; reason: string }

/**
 * Turn one imported dealer (agents row) into a portal login (admin_users,
 * role='agent'). Idempotent: an existing login is left alone unless `regenerate`.
 * Email is the login identifier, so a dealer with no email — or whose email is
 * already used by a different account — is skipped with a reason.
 */
async function provisionDealerLogin(
  projectId: string,
  agent: { id: string; name: string; email: string | null },
  regenerate: boolean,
): Promise<ProvisionOutcome> {
  // Existing login for THIS dealer? Checked FIRST and independent of the agent's
  // current email — a dealer provisioned earlier stays detected even if their
  // imported email later changes or clears.
  const [ownLogin] = await db
    .select({ id: adminUsers.id, email: adminUsers.email })
    .from(adminUsers)
    .where(eq(adminUsers.agentId, agent.id))
    .limit(1)

  if (ownLogin) {
    if (!regenerate) {
      return { status: 'already_provisioned', agentId: agent.id, name: agent.name, email: ownLogin.email, loginId: ownLogin.id }
    }
    const tempPassword = generateTempPassword()
    await db.update(adminUsers)
      .set({ passwordHash: await hashPassword(tempPassword), updatedAt: new Date() })
      .where(eq(adminUsers.id, ownLogin.id))
    return { status: 'reset', agentId: agent.id, name: agent.name, email: ownLogin.email, tempPassword, loginId: ownLogin.id }
  }

  // No login yet → we need the dealer's email to create one.
  const email = agent.email?.trim().toLowerCase()
  if (!email) {
    return { status: 'skipped', agentId: agent.id, name: agent.name, reason: 'Dealer has no email' }
  }

  // Email already used by a DIFFERENT account (admin_users.email is globally unique)?
  const [emailClash] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1)
  if (emailClash) {
    return { status: 'skipped', agentId: agent.id, name: agent.name, reason: 'Email already in use by another account' }
  }

  const tempPassword = generateTempPassword()
  const [created] = await db.insert(adminUsers).values({
    email,
    name: agent.name,
    role: 'agent',
    agentId: agent.id,
    projectId,
    emailVerified: true,
    passwordHash: await hashPassword(tempPassword),
  }).returning({ id: adminUsers.id })

  return { status: 'provisioned', agentId: agent.id, name: agent.name, email, tempPassword, loginId: created.id }
}

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

    // Which dealers already have a portal login (admin_users, role='agent').
    const loginRows = await db
      .select({ agentId: adminUsers.agentId })
      .from(adminUsers)
      .where(eq(adminUsers.projectId, projectId))
    const withLogin = new Set(loginRows.map(r => r.agentId).filter(Boolean) as string[])

    res.json({ success: true, data: rows.map(r => ({ ...r, hasLogin: withLogin.has(r.id) })) })
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

// POST /api/agents/:id/provision-login?projectId=...
// Body: { regenerate?: boolean }
// Create (or, with regenerate, reset) a portal login for one dealer. Returns the
// one-time temp password — surfaced once for the admin to hand to the dealer.
router.post('/:id/provision-login', async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string
    const regenerate = req.body?.regenerate === true

    const [agent] = await db
      .select({ id: agents.id, name: agents.name, email: agents.email })
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.projectId, projectId)))
      .limit(1)
    if (!agent) return res.status(404).json({ success: false, error: 'Dealer not found' })

    const outcome = await provisionDealerLogin(projectId, agent, regenerate)
    const httpStatus = outcome.status === 'skipped' ? 409 : outcome.status === 'provisioned' ? 201 : 200
    res.status(httpStatus).json({ success: outcome.status !== 'skipped', data: outcome })
  } catch (err) {
    console.error('Dealer login provision error:', err)
    res.status(500).json({ success: false, error: 'Failed to provision dealer login' })
  }
})

// POST /api/agents/provision-logins?projectId=...
// Body: { regenerate?: boolean, onlyActive?: boolean (default true) }
// Bulk-provision logins for every (active) dealer that has an email and no login
// yet. Returns temp passwords for the newly created logins — shown once.
router.post('/provision-logins', async (req, res) => {
  try {
    const projectId = req.projectId!
    const regenerate = req.body?.regenerate === true
    const onlyActive = req.body?.onlyActive !== false

    const where = onlyActive
      ? and(eq(agents.projectId, projectId), eq(agents.isActive, true))
      : eq(agents.projectId, projectId)

    const dealers = await db
      .select({ id: agents.id, name: agents.name, email: agents.email })
      .from(agents)
      .where(where)
      .orderBy(asc(agents.name))

    const provisioned: ProvisionOutcome[] = []
    const reset: ProvisionOutcome[] = []
    const alreadyProvisioned: ProvisionOutcome[] = []
    const skipped: ProvisionOutcome[] = []

    // Sequential — bounded by dealer count (tens), each does a couple of indexed
    // lookups + one bcrypt hash. Keeps email-uniqueness races out of the picture.
    for (const dealer of dealers) {
      const outcome = await provisionDealerLogin(projectId, dealer, regenerate)
      if (outcome.status === 'provisioned') provisioned.push(outcome)
      else if (outcome.status === 'reset') reset.push(outcome)
      else if (outcome.status === 'already_provisioned') alreadyProvisioned.push(outcome)
      else skipped.push(outcome)
    }

    res.json({
      success: true,
      data: {
        summary: {
          total: dealers.length,
          provisioned: provisioned.length,
          reset: reset.length,
          alreadyProvisioned: alreadyProvisioned.length,
          skipped: skipped.length,
        },
        provisioned,   // includes one-time tempPassword each
        reset,         // includes new tempPassword each
        alreadyProvisioned,
        skipped,       // includes a reason each
      },
    })
  } catch (err) {
    console.error('Bulk dealer login provision error:', err)
    res.status(500).json({ success: false, error: 'Failed to provision dealer logins' })
  }
})

export default router
