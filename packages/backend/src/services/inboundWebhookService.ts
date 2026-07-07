import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { inboundWebhooks, inboundWebhookEvents, eventDefinitions, events, customers } from '../db/schema.js'
import { evaluateEventFilters, readPath } from '@storees/shared'
import type {
  FilterConfig,
  FilterRule,
  PayloadSchemaField,
  EventPropertyMapping,
  CustomerAttributeMapping,
  EventDefinitionIdentityPaths,
} from '@storees/shared'
import { resolveCustomer } from './customerService.js'
import { linkAnonymousSession } from './anonymousSessionService.js'
import { eventsQueue, metricsQueue, customerAggregateQueue } from './queue.js'

/**
 * Inbound webhook data sources (CleverSend parity).
 *
 * A payload POSTed to /api/hooks/<token> is logged raw, then every ACTIVE
 * event definition on the webhook runs against the envelope
 * `{ body: <payload>, headers: <headers> }`:
 *   filters match → identity resolved (email/phone/external_id paths) →
 *   properties mapped → profile attributes upserted → event emitted through
 *   the SAME pipeline as /api/v1/events (events row + BullMQ fan-out), so
 *   flow triggers, metrics, and segments all see it with zero special-casing.
 */

// ─── Schema inference ───────────────────────────────────

const MAX_DEPTH = 4
const MAX_FIELDS = 200

function typeOf(v: unknown): PayloadSchemaField['type'] {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v === 'object' ? 'object'
    : typeof v === 'number' ? 'number'
    : typeof v === 'boolean' ? 'boolean'
    : 'string'
}

function sampleOf(v: unknown): string | undefined {
  if (v === null || v === undefined || typeof v === 'object') return undefined
  const s = String(v)
  return s.length > 40 ? s.slice(0, 37) + '…' : s
}

/**
 * Flatten a JSON value into dot-path fields. Arrays are sampled at index 0
 * only (paths stay stable regardless of array length). Depth-capped.
 */
export function flattenPayload(value: unknown, prefix: string, depth = 0, out: Map<string, PayloadSchemaField> = new Map()): Map<string, PayloadSchemaField> {
  if (out.size >= MAX_FIELDS) return out
  const t = typeOf(value)
  if (prefix && (t !== 'object' && t !== 'array' || depth >= MAX_DEPTH)) {
    if (!out.has(prefix)) out.set(prefix, { path: prefix, type: t, sample: sampleOf(value) })
    return out
  }
  if (t === 'array') {
    if (prefix && !out.has(prefix)) out.set(prefix, { path: prefix, type: 'array' })
    const first = (value as unknown[])[0]
    if (first !== undefined) flattenPayload(first, `${prefix}.0`, depth + 1, out)
    return out
  }
  if (t === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenPayload(v, prefix ? `${prefix}.${k}` : k, depth + 1, out)
      if (out.size >= MAX_FIELDS) break
    }
  }
  return out
}

/** Observed schema across the webhook's recent payloads (union of dot-paths). */
export async function inferWebhookSchema(webhookId: string, sampleSize = 50): Promise<PayloadSchemaField[]> {
  const rows = await db
    .select({ payload: inboundWebhookEvents.payload, headers: inboundWebhookEvents.headers })
    .from(inboundWebhookEvents)
    .where(eq(inboundWebhookEvents.webhookId, webhookId))
    .orderBy(desc(inboundWebhookEvents.receivedAt))
    .limit(sampleSize)

  const out = new Map<string, PayloadSchemaField>()
  for (const r of rows) {
    flattenPayload(r.payload, 'body', 0, out)
    flattenPayload(r.headers ?? {}, 'headers', 2, out) // headers stay shallow
  }
  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path))
}

// ─── Payload processing ─────────────────────────────────

const PROFILE_COLUMNS = new Set(['email', 'phone', 'name', 'region', 'city'])

type DefinitionRow = {
  id: string
  name: string
  filters: unknown
  propertyMappings: unknown
  attributeMappings: unknown
  identityPaths: unknown
}

export type ProcessResult = {
  matched: Array<{ definitionId: string; eventName: string }>
  status: 'processed' | 'no_match' | 'error'
  error?: string
}

/**
 * Shopify convention: note_attributes / attributes arrive as
 * [{name, value}] pairs — unaddressable by dot-paths. Expose them
 * additionally as `<key>_map` objects (note_attributes_map.storees_sid)
 * so definitions can filter on and extract them.
 */
function withAttributeMaps(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload }
  for (const key of ['note_attributes', 'attributes', 'cart_attributes']) {
    const v = payload[key]
    if (!Array.isArray(v)) continue
    const map: Record<string, unknown> = {}
    for (const item of v) {
      if (item && typeof item === 'object' && 'name' in item) {
        map[String((item as { name: unknown }).name)] = (item as { value?: unknown }).value
      }
    }
    if (Object.keys(map).length > 0) out[`${key}_map`] = map
  }
  return out
}

export async function processInboundPayload(
  webhook: { id: string; projectId: string },
  headers: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<ProcessResult> {
  // Log the raw receipt first — the detail page's history + schema source
  const [rawRow] = await db.insert(inboundWebhookEvents).values({
    projectId: webhook.projectId,
    webhookId: webhook.id,
    headers,
    payload,
  }).returning({ id: inboundWebhookEvents.id })

  const result = await runDefinitionsForRow(webhook.id, webhook.projectId, rawRow.id, headers, payload)

  await db.update(inboundWebhooks)
    .set({ lastReceivedAt: new Date(), updatedAt: new Date() })
    .where(eq(inboundWebhooks.id, webhook.id))

  return result
}

/**
 * Run the webhook's ACTIVE event definitions against one stored raw payload and
 * update that row's matched/status. Used both live (right after receipt) and by
 * Reprocess (re-run current definitions over past rows — e.g. after fixing a
 * definition that left everything `no_match`). Idempotent: emitted events carry
 * `ibw_<rawRowId>_<defId>` idempotency keys, so re-running never duplicates.
 */
async function runDefinitionsForRow(
  webhookId: string,
  projectId: string,
  rawRowId: string,
  headers: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<ProcessResult> {
  const envelope = { body: withAttributeMaps(payload), headers } as Record<string, unknown>
  const matched: ProcessResult['matched'] = []
  let firstError: string | undefined

  const definitions = await db
    .select({
      id: eventDefinitions.id,
      name: eventDefinitions.name,
      filters: eventDefinitions.filters,
      propertyMappings: eventDefinitions.propertyMappings,
      attributeMappings: eventDefinitions.attributeMappings,
      identityPaths: eventDefinitions.identityPaths,
    })
    .from(eventDefinitions)
    .where(and(eq(eventDefinitions.webhookId, webhookId), eq(eventDefinitions.isActive, true)))

  for (const def of definitions as DefinitionRow[]) {
    try {
      const filters = def.filters as FilterConfig | null
      if (filters && filters.rules?.length > 0 && !evaluateEventFilters(filters, envelope)) continue

      await emitDefinedEvent(projectId, def, envelope, rawRowId)
      matched.push({ definitionId: def.id, eventName: def.name })
    } catch (err) {
      firstError = firstError ?? (err instanceof Error ? err.message : String(err))
      console.error(`[inbound-webhook] definition ${def.id} (${def.name}) failed:`, err)
    }
  }

  const status: ProcessResult['status'] = firstError ? 'error' : matched.length > 0 ? 'processed' : 'no_match'
  await db.update(inboundWebhookEvents).set({
    matchedDefinitions: matched,
    status,
    error: firstError ?? null,
  }).where(eq(inboundWebhookEvents.id, rawRowId))

  return { matched, status, error: firstError }
}

/**
 * Diagnose WHY a stored payload matched / didn't match. For each ACTIVE
 * definition, evaluates every filter rule against the payload and reports the
 * RESOLVED value + pass/fail — so "no_match" stops being a black box (usually
 * it's a wrong field path like `event_name` instead of `body.event_name`).
 */
export async function explainDefinitionsForPayload(
  webhookId: string,
  headers: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<{
  hasDefinitions: boolean
  results: Array<{
    definitionId: string
    name: string
    isActive: boolean
    matched: boolean
    rules: Array<{ field: string; operator: string; expected: unknown; actual: unknown; pass: boolean }>
    identityResolved: { email: unknown; phone: unknown; sessionId: unknown }
  }>
}> {
  const envelope = { body: withAttributeMaps(payload), headers } as Record<string, unknown>
  const defs = await db
    .select({
      id: eventDefinitions.id, name: eventDefinitions.name, isActive: eventDefinitions.isActive,
      filters: eventDefinitions.filters, identityPaths: eventDefinitions.identityPaths,
    })
    .from(eventDefinitions)
    .where(eq(eventDefinitions.webhookId, webhookId))

  const results = defs.map(def => {
    const filters = def.filters as FilterConfig | null
    const flatRules = (filters?.rules ?? []).filter((r): r is FilterRule => !('type' in r))
    const rules = flatRules.map(r => {
      const actual = readPath(envelope, r.field.replace(/^properties\./, ''))
      // Re-use the same matcher the engine uses (single-rule config)
      const pass = evaluateEventFilters({ logic: 'AND', rules: [r] }, envelope as Record<string, unknown>)
      return { field: r.field, operator: r.operator, expected: r.value, actual, pass }
    })
    const matched = !filters || flatRules.length === 0 || rules.every(x => x.pass)
    const ids = (def.identityPaths ?? {}) as Record<string, string>
    return {
      definitionId: def.id, name: def.name, isActive: def.isActive,
      matched: matched && def.isActive,
      rules,
      identityResolved: {
        email: ids.email ? readPath(envelope, ids.email) : undefined,
        phone: ids.phone ? readPath(envelope, ids.phone) : undefined,
        sessionId: ids.sessionId ? readPath(envelope, ids.sessionId) : undefined,
      },
    }
  })

  return { hasDefinitions: defs.length > 0, results }
}

/**
 * Reprocess stored raw payloads through the current definitions. Answers the
 * "I created/fixed the definition AFTER these events arrived, and they're all
 * no_match" case. `onlyUnmatched` (default true) skips rows already processed.
 * Bounded to the most recent `limit` rows.
 */
export async function reprocessWebhook(
  webhook: { id: string; projectId: string },
  opts: { onlyUnmatched?: boolean; limit?: number } = {},
): Promise<{ scanned: number; processed: number; stillNoMatch: number; errors: number }> {
  const onlyUnmatched = opts.onlyUnmatched ?? true
  const limit = Math.min(opts.limit ?? 2000, 5000)

  const rows = await db
    .select({
      id: inboundWebhookEvents.id,
      headers: inboundWebhookEvents.headers,
      payload: inboundWebhookEvents.payload,
      status: inboundWebhookEvents.status,
    })
    .from(inboundWebhookEvents)
    .where(eq(inboundWebhookEvents.webhookId, webhook.id))
    .orderBy(desc(inboundWebhookEvents.receivedAt))
    .limit(limit)

  let processed = 0, stillNoMatch = 0, errors = 0, scanned = 0
  for (const row of rows) {
    if (onlyUnmatched && row.status === 'processed') continue
    scanned++
    const r = await runDefinitionsForRow(
      webhook.id, webhook.projectId, row.id,
      (row.headers ?? {}) as Record<string, unknown>,
      (row.payload ?? {}) as Record<string, unknown>,
    )
    if (r.status === 'processed') processed++
    else if (r.status === 'error') errors++
    else stillNoMatch++
  }
  return { scanned, processed, stillNoMatch, errors }
}

async function emitDefinedEvent(
  projectId: string,
  def: DefinitionRow,
  envelope: Record<string, unknown>,
  rawRowId: string,
): Promise<void> {
  const readStr = (path: string | undefined): string | null => {
    if (!path) return null
    const v = readPath(envelope, path)
    if (v === undefined || v === null || typeof v === 'object') return null
    // Empty / whitespace identity values are ABSENT, not real — a mapped
    // customer.phone of "" (common on new-shopper payloads) must not resolve
    // to the empty string (which collides on the phone unique index → error).
    const str = String(v).trim()
    return str === '' ? null : str
  }

  // 1. Identity — resolve a customer when any identity path yields a value
  const ids = (def.identityPaths ?? {}) as EventDefinitionIdentityPaths
  const email = readStr(ids.email)
  const phone = readStr(ids.phone)
  const externalId = readStr(ids.externalId)
  const sessionId = readStr(ids.sessionId)
  const name = readStr(ids.name)

  // 2. Profile attribute mappings — known columns ride resolveCustomer;
  //    everything else lands in custom_attributes
  const attrMappings = (def.attributeMappings ?? []) as CustomerAttributeMapping[]
  const profile: Record<string, string> = {}
  const customAttrs: Record<string, unknown> = {}
  for (const m of attrMappings) {
    if (!m.path || !m.attribute) continue
    const v = readPath(envelope, m.path)
    if (v === undefined || v === null) continue
    if (PROFILE_COLUMNS.has(m.attribute)) profile[m.attribute] = String(v)
    else customAttrs[m.attribute] = v
  }

  let customerId: string | null = null
  if (email || phone || externalId || profile.email || profile.phone) {
    customerId = await resolveCustomer({
      projectId,
      externalId: externalId ?? undefined,
      email: email ?? profile.email ?? null,
      phone: phone ?? profile.phone ?? null,
      name: name ?? profile.name ?? null,
      region: profile.region ?? null,
      city: profile.city ?? null,
    })
    if (Object.keys(customAttrs).length > 0) {
      await db.execute(sql`
        UPDATE customers
        SET custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || ${JSON.stringify(customAttrs)}::jsonb,
            updated_at = NOW()
        WHERE id = ${customerId}
      `)
    }
  }

  // 2b. THE SESSION STITCH — when this payload carries BOTH an identity (a
  // resolved customer) and a session id (e.g. Shopflo forwarding the cart's
  // storees_sid via note_attributes), link the anonymous session so the
  // browsing events back-attribute to the customer.
  if (customerId && sessionId) {
    try {
      await linkAnonymousSession(projectId, sessionId, customerId)
    } catch (err) {
      console.error('[inbound-webhook] session link failed:', err)
    }
  }

  // 3. Event properties from mappings; empty mapping list = pass the whole body
  const propMappings = (def.propertyMappings ?? []) as EventPropertyMapping[]
  let properties: Record<string, unknown>
  if (propMappings.length > 0) {
    properties = {}
    for (const m of propMappings) {
      if (!m.path || !m.property) continue
      const v = readPath(envelope, m.path)
      if (v !== undefined) properties[m.property] = v
    }
  } else {
    properties = (envelope.body ?? {}) as Record<string, unknown>
  }

  // 4. Persist + fan out — same shape as /api/v1/events. Idempotency key is
  //    per (receipt, definition): a provider retry re-POSTs the payload → new
  //    raw row → new key, mirroring v1's time-bucketed dedup semantics.
  const idempotencyKey = `ibw_${rawRowId}_${def.id}`
  const timestamp = new Date()
  const inserted = await db.insert(events).values({
    projectId,
    customerId,
    eventName: def.name,
    properties,
    platform: 'webhook',
    source: 'api',
    sessionId,
    idempotencyKey,
    timestamp,
  }).onConflictDoNothing().returning({ id: events.id })

  if (inserted.length === 0 || !customerId) return

  const jobPayload = {
    projectId,
    customerId,
    eventName: def.name,
    properties,
    platform: 'webhook',
    source: 'api',
    timestamp: timestamp.toISOString(),
  }
  await eventsQueue.add(def.name, jobPayload)
  await metricsQueue.add('recompute', jobPayload)
  await customerAggregateQueue.add(def.name, {
    eventId: inserted[0].id,
    projectId,
    customerId,
    eventName: def.name,
    properties,
    timestamp: timestamp.toISOString(),
  })

  await db.update(customers)
    .set({ lastSeen: timestamp, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
}
