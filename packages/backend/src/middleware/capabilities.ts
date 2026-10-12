import type { Request, Response, NextFunction } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { adminUsers, roles } from '../db/schema.js'
import type { AuthenticatedRequest } from './requireAuth.js'

/**
 * Resolved viewer capabilities — the data + action permissions that gate what a
 * logged-in user may see and do. Derived from their assigned custom role.
 *
 *   viewContactPii  — see raw customer email/phone (false ⇒ API masks them)
 *   exportCustomers — run customer/consent/audience CSV exports
 *   screens         — nav screens the role may reach ('*' = all)
 */
export type ViewerCapabilities = {
  viewContactPii: boolean
  exportCustomers: boolean
  screens: string[] | '*'
}

/** Full access — the non-breaking default for users with no custom role. */
export const FULL_CAPABILITIES: ViewerCapabilities = {
  viewContactPii: true,
  exportCustomers: true,
  screens: '*',
}

type StoredPermissions = {
  viewContactPii?: boolean
  exportCustomers?: boolean
  screens?: string[]
}

/**
 * Interpret a role's stored permissions. Booleans default to TRUE unless the
 * role explicitly sets them false — so a role only ever RESTRICTS, never silently
 * locks out a capability the builder didn't mention. The builder writes explicit
 * values, so this is purely defensive against partial/legacy JSON.
 */
function capsFromPermissions(perms: StoredPermissions | null | undefined): ViewerCapabilities {
  if (!perms || typeof perms !== 'object') return { ...FULL_CAPABILITIES }
  return {
    viewContactPii: perms.viewContactPii !== false,
    exportCustomers: perms.exportCustomers !== false,
    screens: Array.isArray(perms.screens) ? perms.screens : '*',
  }
}

// ── capability cache (short-TTL, size-bounded — mirrors membership cache) ──
const CACHE = new Map<string, { caps: ViewerCapabilities; exp: number }>()
const TTL_MS = 30_000
const MAX_ENTRIES = 50_000

function cacheSet(userId: string, caps: ViewerCapabilities, now: number): void {
  if (CACHE.size >= MAX_ENTRIES) {
    for (const [k, v] of CACHE) if (v.exp <= now) CACHE.delete(k)
    while (CACHE.size >= MAX_ENTRIES) {
      const oldest = CACHE.keys().next().value
      if (oldest === undefined) break
      CACHE.delete(oldest)
    }
  }
  CACHE.set(userId, { caps, exp: now + TTL_MS })
}

/** Drop a user's cached caps (call after assigning/editing a role). */
export function invalidateCaps(userId: string): void {
  CACHE.delete(userId)
}

/** Drop all cached caps (call after editing a role definition — affects every holder). */
export function invalidateAllCaps(): void {
  CACHE.clear()
}

/**
 * Resolve the capabilities for the current request's viewer. Super admins and
 * requests with no JWT user (api-key / internal paths) get FULL. Otherwise we
 * look up the user's assigned role and derive caps from its permissions; no role
 * assigned ⇒ FULL (legacy/non-breaking).
 */
export async function getViewerCaps(req: Request): Promise<ViewerCapabilities> {
  const user = (req as AuthenticatedRequest).adminUser
  if (!user) return { ...FULL_CAPABILITIES }
  if (user.isSuperAdmin) return { ...FULL_CAPABILITIES }

  const now = Date.now()
  const cached = CACHE.get(user.userId)
  if (cached && cached.exp > now) return cached.caps

  let caps: ViewerCapabilities
  try {
    const [row] = await db
      .select({ permissions: roles.permissions })
      .from(adminUsers)
      .leftJoin(roles, eq(adminUsers.roleId, roles.id))
      .where(eq(adminUsers.id, user.userId))
      .limit(1)
    // No role_id → leftJoin yields null permissions → FULL.
    caps = row && row.permissions != null
      ? capsFromPermissions(row.permissions as StoredPermissions)
      : { ...FULL_CAPABILITIES }
  } catch (err) {
    console.error('[getViewerCaps] lookup failed, defaulting to full:', err)
    caps = { ...FULL_CAPABILITIES }
  }
  cacheSet(user.userId, caps, now)
  return caps
}

/**
 * Express gate for action-restricted routes (e.g. CSV exports). 403s when the
 * viewer's role turns the capability off. `viewContactPii`/`exportCustomers`.
 */
export function requireCapability(cap: 'viewContactPii' | 'exportCustomers') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const caps = await getViewerCaps(req)
      if (caps[cap]) return next()
      res.status(403).json({ success: false, error: 'Your role does not permit this action' })
    } catch (err) {
      console.error('requireCapability error:', err)
      res.status(500).json({ success: false, error: 'Authorization check failed' })
    }
  }
}
