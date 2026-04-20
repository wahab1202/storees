import { Router, Response } from 'express'
import { eq, and, asc, ne } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { adminUsers, agents } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'
import { hashPassword } from '../services/authService.js'

const router = Router()

// Team management is admin-only.
router.use(requireRole('admin'), requireProjectId)

const VALID_ROLES = ['admin', 'manager', 'agent'] as const
type Role = (typeof VALID_ROLES)[number]

// GET /api/admin-users?projectId=...
// Lists team members scoped to this project (or global admins with no project).
router.get('/', async (req, res) => {
  try {
    const projectId = req.projectId!

    const rows = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        agentId: adminUsers.agentId,
        agentName: agents.name,
        agentRegion: agents.region,
        emailVerified: adminUsers.emailVerified,
        totpEnabled: adminUsers.totpEnabled,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers)
      .leftJoin(agents, eq(adminUsers.agentId, agents.id))
      .where(eq(adminUsers.projectId, projectId))
      .orderBy(asc(adminUsers.createdAt))

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Admin users list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch team' })
  }
})

// POST /api/admin-users?projectId=...
// Body: { email, name, password, role, agentId? }
// Creates a team member. For role='agent' or 'manager', agentId is required.
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const { email, name, password, role, agentId } = req.body

    if (!email || !name || !password) {
      return res.status(400).json({ success: false, error: 'Email, name, and password are required' })
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: `Role must be one of: ${VALID_ROLES.join(', ')}` })
    }

    if ((role === 'agent' || role === 'manager') && !agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required for agent and manager roles' })
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
    }

    // Verify agent belongs to this project when provided
    if (agentId) {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
        .limit(1)
      if (!agent) {
        return res.status(400).json({ success: false, error: 'Agent not found in this project' })
      }
    }

    // Guard against email collision
    const [existing] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase()))
      .limit(1)
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' })
    }

    const passwordHash = await hashPassword(password)

    const [row] = await db
      .insert(adminUsers)
      .values({
        email: email.toLowerCase(),
        name: name.trim(),
        passwordHash,
        role,
        agentId: agentId || null,
        projectId,
        emailVerified: true, // admin-invited accounts skip verification
      })
      .returning({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        agentId: adminUsers.agentId,
      })

    res.status(201).json({ success: true, data: row })
  } catch (err) {
    console.error('Admin user create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create team member' })
  }
})

// PATCH /api/admin-users/:id?projectId=...
// Body: { name?, role?, agentId?, password? }
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string
    const { name, role, agentId, password } = req.body

    // Load target user; guard against cross-project modification
    const [target] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.id, id), eq(adminUsers.projectId, projectId)))
      .limit(1)

    if (!target) {
      return res.status(404).json({ success: false, error: 'Team member not found' })
    }

    // Don't allow an admin to demote themselves — would lock them out
    if (target.id === req.adminUser!.userId && role !== undefined && role !== target.role) {
      return res.status(400).json({ success: false, error: 'Cannot change your own role' })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name.trim()
    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ success: false, error: `Role must be one of: ${VALID_ROLES.join(', ')}` })
      }
      updates.role = role
    }
    if (agentId !== undefined) {
      if (agentId) {
        const [agent] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
          .limit(1)
        if (!agent) {
          return res.status(400).json({ success: false, error: 'Agent not found in this project' })
        }
      }
      updates.agentId = agentId || null
    }
    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
      }
      updates.passwordHash = await hashPassword(password)
    }

    const [row] = await db
      .update(adminUsers)
      .set(updates)
      .where(eq(adminUsers.id, id))
      .returning({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        agentId: adminUsers.agentId,
      })

    res.json({ success: true, data: row })
  } catch (err) {
    console.error('Admin user update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update team member' })
  }
})

// DELETE /api/admin-users/:id?projectId=...
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string

    if (id === req.adminUser!.userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete yourself' })
    }

    // Hard delete since we have no soft-delete column. Safe: no cascade risk —
    // admin_users has no FK from other tables that would block this.
    const result = await db
      .delete(adminUsers)
      .where(and(eq(adminUsers.id, id), eq(adminUsers.projectId, projectId)))
      .returning({ id: adminUsers.id })

    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'Team member not found' })
    }

    res.json({ success: true, data: { message: 'Team member removed' } })
  } catch (err) {
    console.error('Admin user delete error:', err)
    res.status(500).json({ success: false, error: 'Failed to remove team member' })
  }
})

export default router
