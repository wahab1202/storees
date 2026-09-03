import { Router, type Request, type Response } from 'express'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { adminUsers, userProjects, projects } from '../db/schema.js'
import { hashPassword } from '../services/authService.js'
import { requireSuperAdmin, invalidateMembership } from '../middleware/membership.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'

/**
 * Super-admin-only client management. Mounted at /api/super-admin behind
 * requireAuth; every route additionally requires is_super_admin. This is the
 * ONLY way client accounts are created and linked to projects (Phase 1:
 * super admin creates the login + sets the initial password + links one project).
 */
const router = Router()
router.use(requireSuperAdmin())

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/super-admin/clients — create a client login linked to one project.
router.post('/clients', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, name, password, projectId } = req.body as {
      email?: string; name?: string; password?: string; projectId?: string
    }
    const mail = (email ?? '').trim().toLowerCase()

    if (!mail || !EMAIL_RE.test(mail)) return res.status(400).json({ success: false, error: 'A valid email is required' })
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name is required' })
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' })

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1)
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' })

    const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, mail)).limit(1)
    if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists' })

    const passwordHash = await hashPassword(password)
    const [user] = await db.insert(adminUsers).values({
      email: mail,
      name: name.trim(),
      passwordHash,
      role: 'admin',            // project-admin: can invite their own agents/managers
      isSuperAdmin: false,      // never a super admin
      projectId,                // home/default project
      emailVerified: true,
    }).returning({ id: adminUsers.id, email: adminUsers.email, name: adminUsers.name, projectId: adminUsers.projectId })

    await db.insert(userProjects).values({
      userId: user.id,
      projectId,
      createdBy: req.adminUser!.userId,
    }).onConflictDoNothing()

    res.status(201).json({ success: true, data: user })
  } catch (err) {
    console.error('Create client error:', err)
    res.status(500).json({ success: false, error: 'Failed to create client' })
  }
})

// GET /api/super-admin/clients — list client accounts (non-super-admin) + their projects.
router.get('/clients', async (_req: Request, res: Response) => {
  try {
    const users = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        projectId: adminUsers.projectId,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers)
      .where(eq(adminUsers.isSuperAdmin, false))
      .orderBy(adminUsers.createdAt)

    // Attach each user's project memberships in one query.
    const ids = users.map(u => u.id)
    const memberships = ids.length
      ? await db.select({ userId: userProjects.userId, projectId: userProjects.projectId })
          .from(userProjects).where(inArray(userProjects.userId, ids))
      : []
    const byUser = new Map<string, string[]>()
    for (const m of memberships) {
      const arr = byUser.get(m.userId) ?? []
      arr.push(m.projectId)
      byUser.set(m.userId, arr)
    }
    res.json({ success: true, data: users.map(u => ({ ...u, projectIds: byUser.get(u.id) ?? [] })) })
  } catch (err) {
    console.error('List clients error:', err)
    res.status(500).json({ success: false, error: 'Failed to list clients' })
  }
})

// POST /api/super-admin/clients/:userId/link — grant a client access to a project.
router.post('/clients/:userId/link', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.params.userId as string
    const { projectId } = req.body as { projectId?: string }
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' })

    const [user] = await db.select({ id: adminUsers.id, isSuperAdmin: adminUsers.isSuperAdmin }).from(adminUsers).where(eq(adminUsers.id, userId)).limit(1)
    if (!user) return res.status(404).json({ success: false, error: 'User not found' })
    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1)
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' })

    await db.insert(userProjects).values({ userId, projectId, createdBy: req.adminUser!.userId }).onConflictDoNothing()
    invalidateMembership(userId)
    res.json({ success: true, data: { userId, projectId } })
  } catch (err) {
    console.error('Link client error:', err)
    res.status(500).json({ success: false, error: 'Failed to link project' })
  }
})

// DELETE /api/super-admin/clients/:userId/link/:projectId — revoke access.
router.delete('/clients/:userId/link/:projectId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string
    const projectId = req.params.projectId as string
    await db.delete(userProjects).where(and(eq(userProjects.userId, userId), eq(userProjects.projectId, projectId)))
    invalidateMembership(userId)
    res.json({ success: true, data: { userId, projectId } })
  } catch (err) {
    console.error('Unlink client error:', err)
    res.status(500).json({ success: false, error: 'Failed to unlink project' })
  }
})

export default router
