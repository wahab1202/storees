import { Router, type Request, type Response } from 'express'
import { and, eq, inArray, count, desc, ne, sql, ilike, or } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { adminUsers, userProjects, projects, customers, messages, events } from '../db/schema.js'
import { hashPassword } from '../services/authService.js'
import { requireSuperAdmin, invalidateMembership } from '../middleware/membership.js'
import { getEntitlements, invalidateEntitlements } from '../services/entitlementService.js'
import { daysLeft } from '../services/trialLifecycleService.js'
import { clampPageSize, calcTotalPages } from '@storees/shared'
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

// ── Customers / Trials monitoring ──

const VALID_PLAN = ['trial', 'starter', 'pro', 'custom']
const VALID_STATUS = ['trialing', 'active', 'expired', 'suspended', 'cancelled']

// GET /api/super-admin/customers?status=&source=&endingSoon=&search=&page=&pageSize=
router.get('/customers', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = clampPageSize(Number(req.query.pageSize) || 25)
    const status = req.query.status as string | undefined
    const source = req.query.source as string | undefined
    const search = (req.query.search as string | undefined)?.trim()

    const conds = []
    if (status && VALID_STATUS.includes(status)) conds.push(eq(projects.status, status))
    if (source) conds.push(eq(projects.signupSource, source))
    if (req.query.endingSoon === 'true') {
      conds.push(eq(projects.plan, 'trial'))
      conds.push(sql`${projects.trialEndsAt} < NOW() + INTERVAL '3 days'`)
    }
    if (search) conds.push(or(ilike(projects.name, `%${search}%`), ilike(projects.shopifyDomain, `%${search}%`))!)
    const where = conds.length ? and(...conds) : undefined

    const [{ total }] = await db.select({ total: count() }).from(projects).where(where)
    const rows = await db
      .select({
        id: projects.id, name: projects.name, shopifyDomain: projects.shopifyDomain,
        plan: projects.plan, status: projects.status, trialEndsAt: projects.trialEndsAt,
        signupSource: projects.signupSource, createdAt: projects.createdAt,
      })
      .from(projects).where(where).orderBy(desc(projects.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize)

    const ids = rows.map(r => r.id)
    const [contactAgg, sentAgg, activeAgg, ownerAgg] = ids.length ? await Promise.all([
      db.select({ p: customers.projectId, c: count() }).from(customers).where(inArray(customers.projectId, ids)).groupBy(customers.projectId),
      db.select({ p: messages.projectId, c: count() }).from(messages).where(and(inArray(messages.projectId, ids), sql`${messages.status} NOT IN ('failed','blocked')`)).groupBy(messages.projectId),
      db.select({ p: events.projectId, last: sql<string>`max(${events.timestamp})` }).from(events).where(inArray(events.projectId, ids)).groupBy(events.projectId),
      db.select({ p: adminUsers.projectId, email: sql<string>`min(${adminUsers.email})` }).from(adminUsers).where(and(inArray(adminUsers.projectId, ids), eq(adminUsers.role, 'admin'))).groupBy(adminUsers.projectId),
    ]) : [[], [], [], []]
    const contactMap = new Map(contactAgg.map(r => [r.p, Number(r.c)]))
    const sentMap = new Map(sentAgg.map(r => [r.p, Number(r.c)]))
    const activeMap = new Map(activeAgg.map(r => [r.p, r.last]))
    const ownerMap = new Map(ownerAgg.map(r => [r.p, r.email]))

    const data = rows.map(r => ({
      ...r,
      ownerEmail: ownerMap.get(r.id) ?? null,
      contacts: contactMap.get(r.id) ?? 0,
      messagesSent: sentMap.get(r.id) ?? 0,
      lastActiveAt: activeMap.get(r.id) ?? null,
      trialDaysLeft: r.plan === 'trial' && r.trialEndsAt ? daysLeft(r.trialEndsAt) : null,
    }))
    res.json({ success: true, data, pagination: { page, pageSize, total: Number(total), totalPages: calcTotalPages(Number(total), pageSize) } })
  } catch (err) {
    console.error('GET /super-admin/customers error:', err)
    res.status(500).json({ success: false, error: 'Failed to load customers' })
  }
})

// GET /api/super-admin/customers/:projectId — detail + entitlements + usage + timeline
router.get('/customers/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const [project] = await db
      .select({ id: projects.id, name: projects.name, shopifyDomain: projects.shopifyDomain, plan: projects.plan, status: projects.status, trialStartedAt: projects.trialStartedAt, trialEndsAt: projects.trialEndsAt, signupSource: projects.signupSource, createdAt: projects.createdAt })
      .from(projects).where(eq(projects.id, projectId)).limit(1)
    if (!project) return res.status(404).json({ success: false, error: 'Customer not found' })

    const [entitlements, [{ contacts }], sentByChannel, admins, timeline] = await Promise.all([
      getEntitlements(projectId),
      db.select({ contacts: count() }).from(customers).where(eq(customers.projectId, projectId)),
      db.select({ channel: messages.channel, c: count() }).from(messages).where(and(eq(messages.projectId, projectId), sql`${messages.status} NOT IN ('failed','blocked')`)).groupBy(messages.channel),
      db.select({ email: adminUsers.email, name: adminUsers.name }).from(adminUsers).where(and(eq(adminUsers.projectId, projectId), eq(adminUsers.role, 'admin'))),
      db.select({ eventName: events.eventName, at: events.timestamp }).from(events).where(eq(events.projectId, projectId)).orderBy(desc(events.timestamp)).limit(25),
    ])

    res.json({
      success: true,
      data: {
        ...project,
        trialDaysLeft: project.plan === 'trial' && project.trialEndsAt ? daysLeft(project.trialEndsAt) : null,
        entitlements,
        usage: { contacts: Number(contacts), sentByChannel: Object.fromEntries(sentByChannel.map(s => [s.channel, Number(s.c)])) },
        admins,
        timeline,
      },
    })
  } catch (err) {
    console.error('GET /super-admin/customers/:id error:', err)
    res.status(500).json({ success: false, error: 'Failed to load customer' })
  }
})

// POST /api/super-admin/customers/:projectId/plan — upgrade/downgrade/suspend/extend trial
router.post('/customers/:projectId/plan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.projectId as string
    const { plan, status, extendDays } = req.body ?? {}

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (plan !== undefined) {
      if (!VALID_PLAN.includes(plan)) return res.status(400).json({ success: false, error: `plan must be one of ${VALID_PLAN.join(', ')}` })
      updates.plan = plan
    }
    if (status !== undefined) {
      if (!VALID_STATUS.includes(status)) return res.status(400).json({ success: false, error: `status must be one of ${VALID_STATUS.join(', ')}` })
      updates.status = status
    }
    if (extendDays !== undefined) {
      const n = Number(extendDays)
      if (!Number.isFinite(n) || n <= 0 || n > 365) return res.status(400).json({ success: false, error: 'extendDays must be 1–365' })
      const [cur] = await db.select({ trialEndsAt: projects.trialEndsAt }).from(projects).where(eq(projects.id, projectId)).limit(1)
      const base = cur?.trialEndsAt && cur.trialEndsAt > new Date() ? cur.trialEndsAt : new Date()
      updates.trialEndsAt = new Date(base.getTime() + n * 86_400_000)
      if (status === undefined) updates.status = 'trialing' // re-open an expired trial on extend
    }

    const [row] = await db.update(projects).set(updates).where(eq(projects.id, projectId))
      .returning({ id: projects.id, plan: projects.plan, status: projects.status, trialEndsAt: projects.trialEndsAt })
    if (!row) return res.status(404).json({ success: false, error: 'Customer not found' })

    invalidateEntitlements(projectId)
    await db.insert(events).values({
      projectId, eventName: 'trial_admin_update',
      properties: { plan: updates.plan ?? null, status: updates.status ?? null, extendDays: extendDays ?? null, by: req.adminUser?.email ?? null },
      platform: 'system', source: 'super-admin', timestamp: new Date(),
    }).catch(() => {})

    res.json({ success: true, data: row })
  } catch (err) {
    console.error('POST /super-admin/customers/:id/plan error:', err)
    res.status(500).json({ success: false, error: 'Failed to update plan' })
  }
})

export default router
