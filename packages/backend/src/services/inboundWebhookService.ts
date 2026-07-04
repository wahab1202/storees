import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { inboundWebhooks, inboundWebhookEvents, eventDefinitions, events, customers } from '../db/schema.js'
import { evaluateEventFilters, readPath } from '@storees/shared'
import type {
  FilterConfig,
  PayloadSchemaField,
  EventPropertyMapping,
  CustomerAttributeMapping,
  EventDefinitionIdentityPaths,
} from '@storees/shared'
import { resolveCustomer } from './customerService.js'
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

export async function processInboundPayload(
  webhook: { id: string; projectId: string },
  headers: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<ProcessResult> {
  const envelope = { body: payload, headers } as Record<string, unknown>
  const matched: ProcessResult['matched'] = []
  let firstError: string | undefined

  // Log the raw receipt first — the detail page's history + schema source
  const [rawRow] = await db.insert(inboundWebhookEvents).values({
    projectId: webhook.projectId,
    webhookId: webhook.id,
    headers,
    payload,
  }).returning({ id: inboundWebhookEvents.id })

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
    .where(and(eq(eventDefinitions.webhookId, webhook.id), eq(eventDefinitions.isActive, true)))

  for (const def of definitions as DefinitionRow[]) {
    try {
      const filters = def.filters as FilterConfig | null
      if (filters && filters.rules?.length > 0 && !evaluateEventFilters(filters, envelope)) continue

      await emitDefinedEvent(webhook.projectId, def, envelope, rawRow.id)
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
  }).where(eq(inboundWebhookEvents.id, rawRow.id))

  await db.update(inboundWebhooks)
    .set({ lastReceivedAt: new Date(), updatedAt: new Date() })
    .where(eq(inboundWebhooks.id, webhook.id))

  return { matched, status, error: firstError }
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
    return v === undefined || v === null || typeof v === 'object' ? null : String(v)
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
