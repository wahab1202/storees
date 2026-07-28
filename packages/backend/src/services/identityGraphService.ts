import crypto from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { customers, anonymousSessions, identityEdges, customerMerges, customerMergeRows, events, orders } from '../db/schema.js'
import { recalculateAggregates } from './customerService.js'
import { identityMergeEnabled } from '../config/features.js'

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

// Cross-brand PII keys (phone/email) are stored hash-only, so hash
// irreversibility IS the de-identification boundary. A bare SHA-256 over a
// ~10^10 phone space is trivially reversible with a precomputed table, so when
// a server-held pepper is configured we key the hash with HMAC — non-reversible
// without the secret, while equality-matching still works. Unset (dev) falls
// back to plain SHA-256 for behavioural parity; prod MUST set IDENTITY_PEPPER
// before the cross-brand network is enabled (rotating it needs a rehash).
const IDENTITY_PEPPER = process.env.IDENTITY_PEPPER || ''

function hash(value: string): string {
  return IDENTITY_PEPPER
    ? crypto.createHmac('sha256', IDENTITY_PEPPER).update(value).digest('hex')
    : crypto.createHash('sha256').update(value).digest('hex')
}

/**
 * Hash an identifier the same way everywhere (per-project edges AND the global
 * cross-brand plane) so the same phone/email resolves consistently.
 */
export function hashIdentityKey(type: EdgeType, raw: string): string {
  return hash(normalise(type, raw))
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
  for (const c of custRows) {
    edgeCount += await recordEdges(projectId, c.id, { email: c.email, phone: c.phone, externalId: c.externalId }, 'backfill')
  }

  const sessRows = await db
    .select({ customerId: anonymousSessions.customerId, sessionId: anonymousSessions.sessionId, deviceId: anonymousSessions.deviceId })
    .from(anonymousSessions)
    .where(eq(anonymousSessions.projectId, projectId))
  for (const s of sessRows) {
    edgeCount += await recordEdges(projectId, s.customerId, { sessionId: s.sessionId, deviceId: s.deviceId }, 'backfill')
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

/* ── Step 2b: within-brand merge (OFF by default; dry-run first) ── */

export type MergeResult = {
  survivorId: string
  mergedId: string
  moved: { events: number; orders: number; sessions: number; edges: number }
  dryRun: boolean
}

async function countBy(table: typeof events | typeof orders | typeof anonymousSessions | typeof identityEdges, projectId: string, customerId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(table)
    .where(and(eq(table.projectId, projectId), eq(table.customerId, customerId)))
  return Number(row?.n ?? 0)
}

/**
 * Merge `loser` into `survivor` within a project. Re-points the identity-bearing
 * rows (events / orders / anonymous_sessions / identity_edges), soft-marks the
 * loser with merged_into (the row stays — no FK breaks), recomputes the
 * survivor's aggregates, and writes a customer_merges audit row. dryRun (default)
 * only counts what would move.
 */
export async function mergeCustomers(
  projectId: string,
  survivorId: string,
  loserId: string,
  reason: string,
  dryRun = true,
): Promise<MergeResult> {
  if (survivorId === loserId) {
    return { survivorId, mergedId: loserId, moved: { events: 0, orders: 0, sessions: 0, edges: 0 }, dryRun: true }
  }
  if (dryRun) {
    return {
      survivorId,
      mergedId: loserId,
      moved: {
        events: await countBy(events, projectId, loserId),
        orders: await countBy(orders, projectId, loserId),
        sessions: await countBy(anonymousSessions, projectId, loserId),
        edges: await countBy(identityEdges, projectId, loserId),
      },
      dryRun: true,
    }
  }

  // Re-point identity-bearing rows and write the audit atomically — a mid-way
  // failure must not leave rows moved with no undoable record. Aggregates are
  // derivable, so they're recomputed after the tx commits.
  const moved = await db.transaction(async (tx) => {
    const movedEvents = await tx.update(events).set({ customerId: survivorId })
      .where(and(eq(events.projectId, projectId), eq(events.customerId, loserId))).returning({ id: events.id })
    const movedOrders = await tx.update(orders).set({ customerId: survivorId })
      .where(and(eq(orders.projectId, projectId), eq(orders.customerId, loserId))).returning({ id: orders.id })
    const movedSessions = await tx.update(anonymousSessions).set({ customerId: survivorId })
      .where(and(eq(anonymousSessions.projectId, projectId), eq(anonymousSessions.customerId, loserId))).returning({ id: anonymousSessions.id })

    // Edges are derivable — drop loser edges the survivor already has (unique
    // index), re-point the rest. Undo rebuilds edges for both, so no tracking.
    await tx.execute(sql`
      DELETE FROM identity_edges le
      WHERE le.project_id = ${projectId} AND le.customer_id = ${loserId}
        AND EXISTS (
          SELECT 1 FROM identity_edges se
          WHERE se.project_id = ${projectId} AND se.customer_id = ${survivorId}
            AND se.edge_type = le.edge_type AND se.edge_hash = le.edge_hash
        )
    `)
    await tx.update(identityEdges).set({ customerId: survivorId })
      .where(and(eq(identityEdges.projectId, projectId), eq(identityEdges.customerId, loserId)))

    await tx.update(customers).set({ mergedInto: survivorId, updatedAt: new Date() }).where(eq(customers.id, loserId))

    const moved = { events: movedEvents.length, orders: movedOrders.length, sessions: movedSessions.length, edges: 0 }
    const [audit] = await tx.insert(customerMerges).values({ projectId, survivorId, mergedId: loserId, reason, moved }).returning({ id: customerMerges.id })
    const records = [
      ...movedEvents.map(r => ({ mergeId: audit.id, entity: 'event', rowId: r.id })),
      ...movedOrders.map(r => ({ mergeId: audit.id, entity: 'order', rowId: r.id })),
      ...movedSessions.map(r => ({ mergeId: audit.id, entity: 'session', rowId: r.id })),
    ]
    for (let i = 0; i < records.length; i += 1000) {
      const chunk = records.slice(i, i + 1000)
      if (chunk.length) await tx.insert(customerMergeRows).values(chunk)
    }
    return moved
  })

  await recalculateAggregates(survivorId)
  return { survivorId, mergedId: loserId, moved, dryRun: false }
}

/** A db handle or an open transaction — lets helpers run inside a tx. */
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Re-point a set of row ids from `fromCustomer` to `toCustomer` (chunked for the
 * param limit). The `fromCustomer` guard is essential for undo correctness: if a
 * survivor was itself later merged into a third customer, its rows have moved on,
 * and undoing the FIRST merge must NOT drag those rows out of the second — only
 * rows still sitting on the survivor are reverted.
 */
async function repointRows(
  tx: DbExecutor,
  table: typeof events | typeof orders | typeof anonymousSessions,
  projectId: string,
  ids: string[],
  toCustomer: string,
  fromCustomer: string,
): Promise<void> {
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000)
    if (chunk.length) {
      await tx.update(table).set({ customerId: toCustomer })
        .where(and(eq(table.projectId, projectId), eq(table.customerId, fromCustomer), inArray(table.id, chunk)))
    }
  }
}

/** Delete a customer's edges and rebuild them from its own row + sessions. */
async function rederiveEdges(projectId: string, customerId: string): Promise<void> {
  await db.delete(identityEdges).where(and(eq(identityEdges.projectId, projectId), eq(identityEdges.customerId, customerId)))
  const [cust] = await db.select({ email: customers.email, phone: customers.phone, externalId: customers.externalId })
    .from(customers).where(eq(customers.id, customerId)).limit(1)
  if (cust) await recordEdges(projectId, customerId, { email: cust.email, phone: cust.phone, externalId: cust.externalId }, 'backfill')
  const sess = await db.select({ sessionId: anonymousSessions.sessionId, deviceId: anonymousSessions.deviceId })
    .from(anonymousSessions).where(and(eq(anonymousSessions.projectId, projectId), eq(anonymousSessions.customerId, customerId)))
  for (const s of sess) await recordEdges(projectId, customerId, { sessionId: s.sessionId, deviceId: s.deviceId }, 'backfill')
}

/**
 * Reverse a merge: re-point the recorded rows back to the restored customer,
 * clear merged_into, recompute both customers' aggregates, rebuild both edge
 * sets, and mark the merge undone. Idempotent-safe (throws if already undone).
 */
export async function undoMerge(projectId: string, mergeId: string): Promise<{ survivorId: string; restoredId: string; restored: { events: number; orders: number; sessions: number } }> {
  const [merge] = await db.select().from(customerMerges)
    .where(and(eq(customerMerges.id, mergeId), eq(customerMerges.projectId, projectId))).limit(1)
  if (!merge) throw new Error('Merge not found')
  if (merge.undoneAt) throw new Error('Merge already undone')

  const rows = await db.select({ entity: customerMergeRows.entity, rowId: customerMergeRows.rowId })
    .from(customerMergeRows).where(eq(customerMergeRows.mergeId, mergeId))
  const eventIds = rows.filter(r => r.entity === 'event').map(r => r.rowId)
  const orderIds = rows.filter(r => r.entity === 'order').map(r => r.rowId)
  const sessionIds = rows.filter(r => r.entity === 'session').map(r => r.rowId)

  // Revert the repoints + audit atomically. Only rows still on the survivor are
  // moved back (the fromCustomer guard in repointRows), so a survivor that was
  // itself later merged doesn't get corrupted by undoing this earlier merge.
  await db.transaction(async (tx) => {
    await repointRows(tx, events, projectId, eventIds, merge.mergedId, merge.survivorId)
    await repointRows(tx, orders, projectId, orderIds, merge.mergedId, merge.survivorId)
    await repointRows(tx, anonymousSessions, projectId, sessionIds, merge.mergedId, merge.survivorId)
    await tx.update(customers).set({ mergedInto: null, updatedAt: new Date() }).where(eq(customers.id, merge.mergedId))
    await tx.update(customerMerges).set({ undoneAt: new Date() }).where(eq(customerMerges.id, mergeId))
    await tx.delete(customerMergeRows).where(eq(customerMergeRows.mergeId, mergeId))
  })

  // Derivable state, recomputed after commit.
  await recalculateAggregates(merge.survivorId)
  await recalculateAggregates(merge.mergedId)
  await rederiveEdges(projectId, merge.survivorId)
  await rederiveEdges(projectId, merge.mergedId)

  return { survivorId: merge.survivorId, restoredId: merge.mergedId, restored: { events: eventIds.length, orders: orderIds.length, sessions: sessionIds.length } }
}

/** Survivor = most orders, tie-broken by oldest account. */
async function pickSurvivor(projectId: string, ids: string[]): Promise<string> {
  const rows = await db.select({ id: customers.id, totalOrders: customers.totalOrders, createdAt: customers.createdAt })
    .from(customers).where(and(eq(customers.projectId, projectId), inArray(customers.id, ids)))
  rows.sort((a, b) => (b.totalOrders - a.totalOrders) || (a.createdAt.getTime() - b.createdAt.getTime()))
  return rows[0]?.id ?? ids[0]
}

/**
 * Apply the would-merge clusters from the shadow report. dryRun (default true)
 * reports what would happen and writes nothing. A live run (dryRun:false)
 * additionally requires ENABLE_IDENTITY_MERGE=true.
 */
export async function applyMerges(
  projectId: string,
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<{ dryRun: boolean; clusters: number; merges: MergeResult[] }> {
  const live = opts.dryRun === false
  if (live && !identityMergeEnabled()) {
    throw new Error('Identity merge is disabled — set ENABLE_IDENTITY_MERGE=true to run a live merge')
  }

  const clusters = await shadowMergeReport(projectId, opts.limit ?? 500)
  const merges: MergeResult[] = []
  const consumed = new Set<string>()

  for (const cluster of clusters) {
    const ids = cluster.customerIds.filter(id => !consumed.has(id))
    if (ids.length < 2) continue
    const survivor = await pickSurvivor(projectId, ids)
    for (const loserId of ids) {
      if (loserId === survivor) continue
      merges.push(await mergeCustomers(projectId, survivor, loserId, `${cluster.edgeType}:${cluster.edgeHash.slice(0, 8)}`, !live))
      // Consume in dry-run too, so the preview's cluster consumption (and thus
      // its merge/row counts) matches what a live run would actually perform.
      consumed.add(loserId)
    }
  }
  return { dryRun: !live, clusters: clusters.length, merges }
}
