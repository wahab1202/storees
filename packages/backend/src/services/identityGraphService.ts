import crypto from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, anonymousSessions, identityEdges } from '../db/schema.js'

/**
 * Deterministic identity graph — Phase 2, step 2a (SHADOW MODE).
 *
 * Records identifier→customer edges and reports where a single identifier
 * points at more than one customer (a would-merge cluster). It NEVER mutates
 * customer_id — merging is a later, gated step. Safe to run in production.
 */

export type EdgeType = 'device_id' | 'session_id' | 'phone' | 'email' | 'external_id'
export type EdgeSource = 'backfill' | 'sdk' | 'webhook' | 'shopify' | 'pos' | 'loyalty' | 'admin'

export type Identifiers = {
  deviceId?: string | null
  sessionId?: string | null
  phone?: string | null
  email?: string | null
  externalId?: string | null
}

/** Normalise a value so the same person hashes to the same edge everywhere. */
function normalise(type: EdgeType, raw: string): string {
  const v = raw.trim()
  if (type === 'phone') return v.replace(/[\s()\-.]/g, '') // assume already ~E.164; strip separators
  if (type === 'email') return v.toLowerCase()
  return v
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/** Build the edge rows for a set of identifiers (skips empty values). */
function edgesFor(identifiers: Identifiers): Array<{ type: EdgeType; value: string; hash: string }> {
  const pairs: Array<[EdgeType, string | null | undefined]> = [
    ['device_id', identifiers.deviceId],
    ['session_id', identifiers.sessionId],
    ['phone', identifiers.phone],
    ['email', identifiers.email],
    ['external_id', identifiers.externalId],
  ]
  const out: Array<{ type: EdgeType; value: string; hash: string }> = []
  for (const [type, raw] of pairs) {
    if (!raw || !String(raw).trim()) continue
    const norm = normalise(type, String(raw))
    if (!norm) continue
    // PII (phone/email) stored hash-only; opaque ids keep their raw value.
    const isPii = type === 'phone' || type === 'email'
    out.push({ type, value: isPii ? '' : norm, hash: hash(norm) })
  }
  return out
}

/**
 * Upsert identifier→customer edges. Additive only — re-records bump last_seen.
 * A hash landing on a second customer is left in place as the would-merge signal.
 */
export async function recordEdges(
  projectId: string,
  customerId: string,
  identifiers: Identifiers,
  source: EdgeSource = 'sdk',
): Promise<number> {
  const edges = edgesFor(identifiers)
  if (edges.length === 0) return 0
  await db.insert(identityEdges).values(
    edges.map(e => ({
      projectId,
      customerId,
      edgeType: e.type,
      edgeValue: e.value || null,
      edgeHash: e.hash,
      source,
    })),
  ).onConflictDoUpdate({
    target: [identityEdges.projectId, identityEdges.customerId, identityEdges.edgeType, identityEdges.edgeHash],
    set: { lastSeenAt: new Date() },
  })
  return edges.length
}

const BACKFILL_CHUNK = 500

/**
 * Backfill identity_edges for a project from existing customers (phone / email /
 * external_id) and anonymous sessions (session_id / device_id). Idempotent —
 * safe to re-run. Returns the number of edge upserts issued.
 */
export async function backfillIdentityEdges(projectId: string): Promise<{ customers: number; sessions: number; edges: number }> {
  let edgeCount = 0

  const custRows = await db
    .select({ id: customers.id, email: customers.email, phone: customers.phone, externalId: customers.externalId })
    .from(customers)
    .where(eq(customers.projectId, projectId))
  for (let i = 0; i < custRows.length; i += BACKFILL_CHUNK) {
    for (const c of custRows.slice(i, i + BACKFILL_CHUNK)) {
      edgeCount += await recordEdges(projectId, c.id, { email: c.email, phone: c.phone, externalId: c.externalId }, 'backfill')
    }
  }

  const sessRows = await db
    .select({ customerId: anonymousSessions.customerId, sessionId: anonymousSessions.sessionId, deviceId: anonymousSessions.deviceId })
    .from(anonymousSessions)
    .where(eq(anonymousSessions.projectId, projectId))
  for (let i = 0; i < sessRows.length; i += BACKFILL_CHUNK) {
    for (const s of sessRows.slice(i, i + BACKFILL_CHUNK)) {
      edgeCount += await recordEdges(projectId, s.customerId, { sessionId: s.sessionId, deviceId: s.deviceId }, 'backfill')
    }
  }

  return { customers: custRows.length, sessions: sessRows.length, edges: edgeCount }
}

export type ShadowMergeCluster = {
  edgeType: EdgeType
  edgeHash: string
  customerIds: string[]
  customerCount: number
}

/**
 * SHADOW REPORT — identifiers that resolve to more than one customer, i.e. the
 * clusters that WOULD merge once merging is enabled. Review this (esp. on Fine
 * Wine) before turning on step 2b. Read-only.
 */
export async function shadowMergeReport(projectId: string, limit = 500): Promise<ShadowMergeCluster[]> {
  const res = await db.execute(sql`
    SELECT edge_type, edge_hash,
           array_agg(DISTINCT customer_id) AS customer_ids,
           count(DISTINCT customer_id)     AS customer_count
    FROM identity_edges
    WHERE project_id = ${projectId}
    GROUP BY edge_type, edge_hash
    HAVING count(DISTINCT customer_id) > 1
    ORDER BY customer_count DESC
    LIMIT ${limit}
  `)
  return (res.rows as Array<Record<string, unknown>>).map(r => ({
    edgeType: r.edge_type as EdgeType,
    edgeHash: r.edge_hash as string,
    customerIds: r.customer_ids as string[],
    customerCount: Number(r.customer_count),
  }))
}
