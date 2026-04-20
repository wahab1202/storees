import type { Response, NextFunction } from 'express'
import { sql, eq, and, or, inArray } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { agents, customers } from '../db/schema.js'
import type { AuthenticatedRequest } from './requireAuth.js'
import type { AdminRole } from '../services/authService.js'

/**
 * Role-based customer scope for B2B agent RBAC.
 *
 *   admin   → full project scope (no extra filter)
 *   agent   → only customers whose customers.agent_id matches their JWT
 *   manager → their own + any agents reporting to them (manager_id = self)
 *
 * Always layer this ONTO the existing projectId filter; never replace it.
 * Returns a Drizzle SQL fragment ready to compose with other conditions.
 */
export async function customerScopeFilter(
  req: AuthenticatedRequest,
  projectId: string
): Promise<SQL> {
  const user = req.adminUser
  const projectFilter = eq(customers.projectId, projectId)

  if (!user || user.role === 'admin') return projectFilter

  if (user.role === 'agent') {
    if (!user.agentId) return sql`FALSE`
    return and(projectFilter, eq(customers.agentId, user.agentId))!
  }

  if (user.role === 'manager') {
    if (!user.agentId) return sql`FALSE`
    const managed = await db
      .select({ id: agents.id })
      .from(agents)
      .where(or(eq(agents.id, user.agentId), eq(agents.managerId, user.agentId))!)
    const ids = managed.map(r => r.id)
    if (ids.length === 0) return sql`FALSE`
    return and(projectFilter, inArray(customers.agentId, ids))!
  }

  return sql`FALSE`
}

/**
 * Role gate — returns true if the authenticated user has any of the allowed roles.
 */
export function hasRole(req: AuthenticatedRequest, ...allowed: AdminRole[]): boolean {
  const role = req.adminUser?.role
  return !!role && allowed.includes(role)
}

/**
 * Express middleware: rejects with 403 if user's role is not in the allowed list.
 * Use to fence agent/manager users out of admin-only routes (e.g. flows).
 */
export function requireRole(...allowed: AdminRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!hasRole(req, ...allowed)) {
      return res.status(403).json({ success: false, error: 'Forbidden: insufficient role' })
    }
    next()
  }
}

/**
 * Raw-SQL scope fragment for aggregation queries that don't use Drizzle's
 * typed `customers` table reference (e.g. dashboard stats issuing db.execute).
 *
 * Returns a SQL expression that evaluates to TRUE for rows the user is allowed
 * to see, scoped to `customers.project_id` and — for agent/manager — customers.agent_id.
 * Intended to be composed with `AND`:
 *   sql`SELECT ... FROM customers WHERE ${await rawCustomerScopeSql(req, projectId)}`
 */
export async function rawCustomerScopeSql(
  req: AuthenticatedRequest,
  projectId: string
): Promise<SQL> {
  const user = req.adminUser
  const base = sql`project_id = ${projectId}`

  if (!user || user.role === 'admin') return base

  const ids = await resolveScopedAgentIds(req)
  if (ids === null) return sql`FALSE`
  if (ids.length === 0) return base
  if (ids.length === 1) return sql`${base} AND agent_id = ${ids[0]}`
  // Manager: multiple managed agents.
  const orClause = or(...ids.map(id => sql`agent_id = ${id}`))!
  return and(base, orClause)!
}

/**
 * Subquery fragment that restricts a table with a `customer_id` column to
 * customers in the caller's scope. Returns `TRUE` for admin (no-op).
 * Compose with AND in raw SQL contexts (orders/events/messages aggregations).
 */
export async function scopedCustomerIdsSubquery(
  req: AuthenticatedRequest,
  projectId: string
): Promise<SQL> {
  const user = req.adminUser
  if (!user || user.role === 'admin') return sql`TRUE`

  const ids = await resolveScopedAgentIds(req)
  if (ids === null) return sql`FALSE`
  if (ids.length === 0) return sql`TRUE`
  if (ids.length === 1) {
    return sql`customer_id IN (
      SELECT id FROM customers WHERE project_id = ${projectId} AND agent_id = ${ids[0]}
    )`
  }
  const orClause = or(...ids.map(id => sql`agent_id = ${id}`))!
  return sql`customer_id IN (
    SELECT id FROM customers WHERE project_id = ${projectId} AND (${orClause})
  )`
}

/**
 * Returns the list of agent IDs the authenticated user is allowed to see.
 * Empty array for non-scoped admins (meaning: no filter).
 * null for agents/managers with no valid agentId (meaning: deny all).
 */
export async function resolveScopedAgentIds(
  req: AuthenticatedRequest
): Promise<string[] | null> {
  const user = req.adminUser
  if (!user || user.role === 'admin') return []

  if (!user.agentId) return null

  if (user.role === 'agent') return [user.agentId]

  if (user.role === 'manager') {
    const managed = await db
      .select({ id: agents.id })
      .from(agents)
      .where(or(eq(agents.id, user.agentId), eq(agents.managerId, user.agentId))!)
    return managed.map(r => r.id)
  }

  return null
}
