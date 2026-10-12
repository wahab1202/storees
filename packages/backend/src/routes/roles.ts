import { Router, Response } from 'express'
import { eq, and, asc, count } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { roles, adminUsers } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import { invalidateAllCaps } from '../middleware/capabilities.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'

const router = Router()

// Custom roles are a project-admin capability (same gate as team management).
router.use(requireRole('admin'), requireProjectId)

/** Sanitize an incoming permissions object to the known, typed shape. */
function normalizePermissions(input: unknown): { viewContactPii: boolean; exportCustomers: boolean; screens: string[] | '*' } {
  const p = (input ?? {}) as Record<string, unknown>
  const screens = Array.isArray(p.screens)
    ? (p.screens as unknown[]).filter((s): s is string => typeof s === 'string')
    : '*'
  return {
    // Default-true: a role only restricts when it explicitly sets false.
    viewContactPii: p.viewContactPii !== false,
    exportCustomers: p.exportCustomers !== false,
    screens,
  }
}

// GET /api/roles?projectId=...  — list this project's custom roles (+ holder counts)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const rows = await db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        permissions: roles.permissions,
        isSystem: roles.isSystem,
        createdAt: roles.createdAt,
        memberCount: count(adminUsers.id),
      })
      .from(roles)
      .leftJoin(adminUsers, eq(adminUsers.roleId, roles.id))
      .where(eq(roles.projectId, projectId))
      .groupBy(roles.id)
      .orderBy(asc(roles.name))

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Roles list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch roles' })
  }
})

// POST /api/roles?projectId=...  — body: { name, description?, permissions }
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const { name, description } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Role name is required' })
    }

    // Unique name per project (case-insensitive — matches idx_roles_project_name).
    const [existing] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.projectId, projectId), eq(roles.name, name.trim())))
      .limit(1)
    if (existing) {
      return res.status(409).json({ success: false, error: 'A role with this name already exists' })
    }

    const [row] = await db
      .insert(roles)
      .values({
        projectId,
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : null,
        permissions: normalizePermissions(req.body.permissions),
      })
      .returning()

    res.status(201).json({ success: true, data: row })
  } catch (err) {
    console.error('Role create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create role' })
  }
})

// PATCH /api/roles/:id?projectId=...  — body: { name?, description?, permissions? }
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string
    const { name, description, permissions } = req.body

    const [target] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.projectId, projectId)))
      .limit(1)
    if (!target) {
      return res.status(404).json({ success: false, error: 'Role not found' })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Role name cannot be empty' })
      }
      updates.name = name.trim()
    }
    if (description !== undefined) {
      updates.description = typeof description === 'string' ? description.trim() : null
    }
    if (permissions !== undefined) {
      updates.permissions = normalizePermissions(permissions)
    }

    const [row] = await db
      .update(roles)
      .set(updates)
      .where(eq(roles.id, id))
      .returning()

    // Permission changes affect every holder — clear the caps cache process-wide.
    invalidateAllCaps()

    res.json({ success: true, data: row })
  } catch (err) {
    console.error('Role update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update role' })
  }
})

// DELETE /api/roles/:id?projectId=...  — holders revert to full access (FK SET NULL)
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string

    const result = await db
      .delete(roles)
      .where(and(eq(roles.id, id), eq(roles.projectId, projectId)))
      .returning({ id: roles.id })

    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'Role not found' })
    }

    invalidateAllCaps()
    res.json({ success: true, data: { message: 'Role deleted' } })
  } catch (err) {
    console.error('Role delete error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete role' })
  }
})

export default router
