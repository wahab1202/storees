import type { Request, Response, NextFunction } from 'express'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { userProjects, adminUsers } from '../db/schema.js'
import type { AuthenticatedRequest } from './requireAuth.js'

/**
 * Multi-client tenant access control.
 *
 * A client (super_admin=false) may only operate on projects they hold a
 * `user_projects` row for. Super admins bypass entirely (cross-project ops).
 *
 * Enforcement is gated by ENFORCE_PROJECT_MEMBERSHIP so we can deploy the code,
 * confirm the 0085 backfill, then flip the flag + smoke-test (per the 2026-07-22
 * tenant-isolation revert playbook — no straight cut-over). While the flag is
 * off, every guard here is a pass-through and behaviour is unchanged.
 */
export function membershipEnforced(): boolean {
  return process.env.ENFORCE_PROJECT_MEMBERSHIP === 'true'
}

// ── membership lookup (short-TTL, size-bounded in-process cache) ──
//
// Warm path is a Map hit (no DB). Cold/expired path is ONE index-only PK lookup
// on user_projects (PK = user_id, project_id). Cache is per-instance and bounded
// (MAX_ENTRIES) with an expired-sweep + oldest-evict so it can't grow unbounded.
//
// NOTE ON REVOCATION: because the cache is per-process, an unlink invalidates the
// serving instance immediately (invalidateMembership) but other instances keep a
// stale grant until their entry expires — i.e. cross-instance revocation is
// eventually-consistent within TTL_MS (≤30s). Acceptable for admin access control.
const CACHE = new Map<string, { ok: boolean; exp: number }>()
const TTL_MS = 30_000
const MAX_ENTRIES = 50_000

function cacheSet(key: string, ok: boolean, now: number): void {
  if (CACHE.size >= MAX_ENTRIES) {
    for (const [k, v] of CACHE) if (v.exp <= now) CACHE.delete(k) // drop expired first
    while (CACHE.size >= MAX_ENTRIES) {                            // then evict oldest (FIFO)
      const oldest = CACHE.keys().next().value
      if (oldest === undefined) break
      CACHE.delete(oldest)
    }
  }
  CACHE.set(key, { ok, exp: now + TTL_MS })
}

export async function userInProject(userId: string, projectId: string): Promise<boolean> {
  const key = `${userId}:${projectId}`
  const now = Date.now()
  const cached = CACHE.get(key)
  if (cached && cached.exp > now) return cached.ok
  const rows = await db
    .select({ u: userProjects.userId })
    .from(userProjects)
    .where(and(eq(userProjects.userId, userId), eq(userProjects.projectId, projectId)))
    .limit(1)
  const ok = rows.length > 0
  cacheSet(key, ok, now)
  return ok
}

/** Drop cached membership for a user (call after link/unlink so it takes effect fast). */
export function invalidateMembership(userId: string): void {
  const prefix = `${userId}:`
  for (const k of CACHE.keys()) if (k.startsWith(prefix)) CACHE.delete(k)
}

/**
 * The single authorization decision. Returns true if the request may act on
 * `projectId`. Super admins and the flag-off state always pass. When there is no
 * authenticated user (api-key / server-to-server paths) the caller should NOT be
 * using this — those derive projectId from the key, not user input.
 */
export async function mayAccessProject(req: Request, projectId: string): Promise<boolean> {
  if (!membershipEnforced()) return true
  const user = (req as AuthenticatedRequest).adminUser
  if (!user) return true // no user context = not the JWT path (api-key routes gate themselves)
  if (user.isSuperAdmin) return true
  return userInProject(user.userId, projectId)
}

/**
 * Guard for routes that resolve their own projectId (params/body/query) and do
 * NOT flow through requireProjectId — v1Onboarding /projects/:id/*, wizard
 * /complete, integrations shopify/*. `pick` extracts the target projectId.
 */
export function requireProjectAccess(pick: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = pick(req)
      if (!projectId) {
        res.status(400).json({ success: false, error: 'projectId is required' })
        return
      }
      if (await mayAccessProject(req, projectId)) return next()
      res.status(403).json({ success: false, error: 'You do not have access to this project' })
    } catch (err) {
      console.error('requireProjectAccess error:', err)
      res.status(500).json({ success: false, error: 'Authorization check failed' })
    }
  }
}

/** Super-admin-only gate for BRAND-NEW endpoints (create-client, link/unlink). Always enforces. */
export function requireSuperAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req as AuthenticatedRequest).adminUser?.isSuperAdmin) return next()
    res.status(403).json({ success: false, error: 'Forbidden: super admin only' })
  }
}

/**
 * Super-admin gate for RETROFITTED existing endpoints (project create/delete/feature
 * flags). Rides the ENFORCE_PROJECT_MEMBERSHIP flag so current behaviour is
 * unchanged until cutover — pass-through while the flag is off, super-admin-only once on.
 */
export function requireSuperAdminWhenEnforced() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!membershipEnforced()) return next()
    if ((req as AuthenticatedRequest).adminUser?.isSuperAdmin) return next()
    res.status(403).json({ success: false, error: 'Forbidden: super admin only' })
  }
}

/** Project ids the caller may list (super admin → null = all; client → membership set). */
export async function accessibleProjectIds(req: Request): Promise<string[] | null> {
  const user = (req as AuthenticatedRequest).adminUser
  if (!user) return null
  if (user.isSuperAdmin || !membershipEnforced()) return null
  const rows = await db
    .select({ p: userProjects.projectId })
    .from(userProjects)
    .where(eq(userProjects.userId, user.userId))
  return rows.map(r => r.p)
}

/**
 * Bootstrap super admins from the STOREES_PLATFORM_ADMINS allowlist on startup so
 * existing platform operators keep cross-project access after 0085. Idempotent;
 * only sets the flag true, never clears it. Continues the env allowlist as the
 * bootstrap source (see requirePlatformAdmin).
 */
export async function seedSuperAdmins(): Promise<void> {
  const emails = (process.env.STOREES_PLATFORM_ADMINS ?? '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (emails.length === 0) return
  try {
    await db.update(adminUsers)
      .set({ isSuperAdmin: true, updatedAt: new Date() })
      .where(and(inArray(sql`lower(${adminUsers.email})`, emails), eq(adminUsers.isSuperAdmin, false)))
  } catch (err) {
    console.error('[seedSuperAdmins] failed (non-fatal):', err)
  }
}
