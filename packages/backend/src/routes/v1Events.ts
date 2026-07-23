import { Router, Request, Response } from 'express'
import crypto from 'node:crypto'
import { db } from '../db/connection.js'
import { events, customers, entities, identities } from '../db/schema.js'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { requirePublicKeyAuth } from '../middleware/apiKeyAuth.js'
import { dataMaskingMiddleware } from '../middleware/dataMasking.js'
import { rateLimiter } from '../middleware/rateLimiter.js'
import { eventsQueue, metricsQueue, customerAggregateQueue } from '../services/queue.js'
import { resolveCustomer as resolveCustomerService } from '../services/customerService.js'
import { linkAnonymousSession } from '../services/anonymousSessionService.js'
import type { EventIngestionPayload } from '@storees/shared'

const router = Router()

// Fallback dedup key for events that arrive WITHOUT a caller-supplied
// idempotency_key. Same (event, customer, properties) inside a 10s window →
// same key → collapsed by the (project_id, idempotency_key) unique index.
// Different properties (e.g. a different cart total/items) → different hash →
// kept; a later window → different bucket → kept (legit repeat states survive).
const DEDUP_WINDOW_MS = 10_000
function deriveIdempotencyKey(
  eventName: string,
  customerId: string,
  properties: Record<string, unknown> | undefined,
  ts: Date,
): string {
  const bucket = Math.floor(ts.getTime() / DEDUP_WINDOW_MS)
  const hash = crypto
    .createHash('sha1')
    .update(`${customerId}|${JSON.stringify(properties ?? {})}`)
    .digest('hex')
    .slice(0, 24)
  return `auto:${eventName}:${hash}:${bucket}`
}

// All v1 routes require API key auth (public-key-only for SDK compatibility)
router.use(requirePublicKeyAuth())

// Rate limiting — uses API key's rateLimit (default 1000/min)
router.use(rateLimiter(1000))

// Data masking on all event routes
router.use(dataMaskingMiddleware('strict'))

/**
 * POST /api/v1/events — Ingest a single event
 */
router.post('/events', async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId!
    const payload = req.body as EventIngestionPayload

    // Validate required fields
    if (!payload.event_name?.trim()) {
      return res.status(400).json({ success: false, error: 'event_name is required' })
    }

    // An anonymous client id (SDK `anon_…`, pixel UUID clientId) is a session, not
    // a customer — reclassify before deciding identity.
    normalizeAnonymousId(payload)

    // Anonymous events (only a session id, no real identifier) are stored against
    // the session with customer_id = NULL — NO customer record is created, so
    // browsing visitors don't pollute the customer base / skew funnels. They
    // back-attribute to a real customer when one identifies on the same session
    // (handleSdkEvent / order stitch).
    const hasIdentity = !!(payload.customer_id || payload.customer_email || payload.customer_phone)
    if (!hasIdentity && !payload.session_id) {
      return res.status(400).json({
        success: false,
        error: 'At least one of customer_id, customer_email, customer_phone, or session_id is required',
      })
    }

    // Validate timestamp (not more than 7 days in past)
    const eventTimestamp = payload.timestamp ? new Date(payload.timestamp) : new Date()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    if (eventTimestamp < sevenDaysAgo) {
      return res.status(400).json({
        success: false,
        error: 'Event timestamp cannot be more than 7 days in the past',
      })
    }

    // Resolve the customer only when a real identifier is present; anonymous
    // (session-only) events have customer_id = NULL.
    const customerId = hasIdentity ? await resolveCustomer(projectId, payload) : null

    // Insert event — idempotency handled atomically via ON CONFLICT
    let eventId: string

    const eventPlatform = payload.platform ?? 'api'
    const eventSource = payload.source ?? 'api'
    const eventSessionId = payload.session_id ?? null

    // Dedup key: use the caller's idempotency_key when provided; otherwise derive
    // one so duplicate webhook deliveries of the same event (same customer + same
    // properties) within a short window collapse instead of piling up. Chatty
    // sources (e.g. Shopify carts/update retries) were creating many identical
    // rows because a NULL key dedupes nothing. Distinct states differ in
    // properties → different hash → preserved; the time bucket lets a cart
    // legitimately return to an earlier state later without being dropped.
    const effectiveKey = payload.idempotency_key
      ? payload.idempotency_key
      : deriveIdempotencyKey(payload.event_name.trim(), customerId ?? eventSessionId ?? 'anon', payload.properties, eventTimestamp)

    const result = await db.execute(sql`
      INSERT INTO events (project_id, customer_id, event_name, properties, platform, source, session_id, device_id, idempotency_key, timestamp)
      VALUES (${projectId}, ${customerId}, ${payload.event_name.trim()}, ${JSON.stringify(payload.properties ?? {})}::jsonb, ${eventPlatform}, ${eventSource}, ${eventSessionId}, ${payload.device_id ?? null}, ${effectiveKey}, ${eventTimestamp})
      ON CONFLICT (project_id, idempotency_key) DO NOTHING
      RETURNING id
    `)
    if (result.rows.length === 0) {
      // Already exists — deduplicated (provided or derived key)
      const [existing] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.projectId, projectId), eq(events.idempotencyKey, effectiveKey)))
        .limit(1)
      return res.status(200).json({
        success: true,
        data: { id: existing?.id, deduplicated: true },
      })
    }
    eventId = (result.rows[0] as { id: string }).id

    // Customer side-effects only run for identified events. Anonymous
    // (customer_id = NULL) events are just stored against the session; the
    // back-attribution worker handles aggregates/flows once they're stitched.
    if (customerId) {
      // Upsert entities if provided
      if (payload.entities && payload.entities.length > 0) {
        for (const entity of payload.entities) {
          await upsertEntity(projectId, customerId, entity)
        }
      }

      // Update customer lastSeen
      await db.update(customers)
        .set({ lastSeen: eventTimestamp, updatedAt: new Date() })
        .where(eq(customers.id, customerId))

      // Handle SDK-specific events (incl. the session→customer stitch)
      await handleSdkEvent(projectId, customerId, payload)

      // Publish to BullMQ for flow triggers + metrics recomputation
      const jobPayload = {
        projectId,
        customerId,
        eventName: payload.event_name.trim(),
        properties: payload.properties ?? {},
        platform: eventPlatform,
        source: eventSource,
        timestamp: eventTimestamp.toISOString(),
      }
      await eventsQueue.add(payload.event_name, jobPayload)
      await metricsQueue.add('recompute', jobPayload)
      // Customer-aggregate worker — folds the event into total_orders /
      // total_spent / last_order_date / etc. Replaces the FDW federation cron.
      await customerAggregateQueue.add(payload.event_name, {
        eventId,
        projectId,
        customerId,
        eventName: payload.event_name.trim(),
        properties: payload.properties ?? {},
        timestamp: eventTimestamp.toISOString(),
      })
    }

    res.status(201).json({ success: true, data: { id: eventId } })
  } catch (err) {
    console.error('Event ingestion error:', err)
    res.status(500).json({ success: false, error: 'Failed to ingest event' })
  }
})

/**
 * POST /api/v1/events/batch — Ingest up to 1000 events
 *
 * Optimized: resolves customers in parallel batches, bulk-inserts events,
 * and publishes to BullMQ with addBulk(). ~3 queries instead of ~6N.
 */
router.post('/events/batch', async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId!
    const { events: eventList } = req.body as { events: EventIngestionPayload[] }

    if (!Array.isArray(eventList) || eventList.length === 0) {
      return res.status(400).json({ success: false, error: 'events array is required' })
    }

    if (eventList.length > 1000) {
      return res.status(400).json({ success: false, error: 'Maximum 1000 events per batch' })
    }

    const results: { index: number; id?: string; error?: string }[] = []
    const validEvents: { index: number; payload: EventIngestionPayload }[] = []

    // Phase 1: Validate all events upfront (no DB calls)
    for (let i = 0; i < eventList.length; i++) {
      const payload = eventList[i]
      if (!payload.event_name?.trim()) {
        results.push({ index: i, error: 'event_name is required' })
        continue
      }
      // Reclassify anonymous client ids (SDK `anon_…`, pixel UUID) as sessions.
      normalizeAnonymousId(payload)
      if (!payload.customer_id && !payload.customer_email && !payload.customer_phone && !payload.session_id) {
        results.push({ index: i, error: 'customer identifier or session_id required' })
        continue
      }
      validEvents.push({ index: i, payload })
    }

    if (validEvents.length === 0) {
      return res.status(200).json({
        success: true,
        data: { total: eventList.length, succeeded: 0, failed: results.length, results },
      })
    }

    // Phase 2: Bulk-check idempotency keys in one query
    const idempotencyKeys = validEvents
      .filter(e => e.payload.idempotency_key)
      .map(e => e.payload.idempotency_key!)

    const existingIdempotencyMap = new Map<string, string>()
    if (idempotencyKeys.length > 0) {
      const existing = await db
        .select({ id: events.id, idempotencyKey: events.idempotencyKey })
        .from(events)
        .where(and(
          eq(events.projectId, projectId),
          inArray(events.idempotencyKey, idempotencyKeys),
        ))
      for (const row of existing) {
        if (row.idempotencyKey) {
          existingIdempotencyMap.set(row.idempotencyKey, row.id)
        }
      }
    }

    // Phase 3: Resolve customers in parallel (batch of 20 concurrent). Anonymous
    // (session-only) events resolve to customerId = null — no customer created.
    const eventsToInsert: { index: number; payload: EventIngestionPayload; customerId: string | null }[] = []
    const RESOLVE_BATCH_SIZE = 20

    for (let i = 0; i < validEvents.length; i += RESOLVE_BATCH_SIZE) {
      const batch = validEvents.slice(i, i + RESOLVE_BATCH_SIZE)
      const resolved = await Promise.allSettled(
        batch.map(async ({ index, payload }) => {
          // Skip if already deduplicated
          if (payload.idempotency_key && existingIdempotencyMap.has(payload.idempotency_key)) {
            results.push({ index, id: existingIdempotencyMap.get(payload.idempotency_key) })
            return null
          }
          const hasIdentity = !!(payload.customer_id || payload.customer_email || payload.customer_phone)
          const customerId = hasIdentity ? await resolveCustomer(projectId, payload) : null
          return { index, payload, customerId }
        }),
      )

      for (const result of resolved) {
        if (result.status === 'fulfilled' && result.value) {
          eventsToInsert.push(result.value)
        } else if (result.status === 'rejected') {
          // Find the index from the batch — use position
          results.push({ index: batch[resolved.indexOf(result)]?.index ?? -1, error: 'Customer resolution failed' })
        }
      }
    }

    // Phase 4: Bulk insert events (chunks of 500 to stay within PG param limits)
    const INSERT_BATCH_SIZE = 500
    const insertedEvents: { index: number; id: string; payload: EventIngestionPayload; customerId: string | null }[] = []

    for (let i = 0; i < eventsToInsert.length; i += INSERT_BATCH_SIZE) {
      const chunk = eventsToInsert.slice(i, i + INSERT_BATCH_SIZE)

      // Separate events with and without idempotency keys
      const withIdemKey = chunk.filter(e => e.payload.idempotency_key)
      const withoutIdemKey = chunk.filter(e => !e.payload.idempotency_key)

      // Bulk insert events WITH idempotency keys (ON CONFLICT DO NOTHING).
      // Use the Drizzle ORM bulk insert (correct multi-row parameter binding) —
      // the previous raw sql.join(...) VALUES construction mis-bound parameters
      // and failed with "malformed array literal".
      if (withIdemKey.length > 0) {
        const rows = withIdemKey.map(({ payload, customerId }) => ({
          projectId,
          customerId,
          eventName: payload.event_name.trim(),
          properties: payload.properties ?? {},
          platform: payload.platform ?? 'api',
          source: payload.source ?? 'api',
          sessionId: payload.session_id ?? null,
          deviceId: payload.device_id ?? null,
          idempotencyKey: payload.idempotency_key!,
          timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
        }))

        // RETURNING id + idempotency_key so we can match results correctly
        // (PG does not guarantee RETURNING order matches VALUES order with ON CONFLICT DO NOTHING)
        const insertedRows = await db
          .insert(events)
          .values(rows)
          .onConflictDoNothing({ target: [events.projectId, events.idempotencyKey] })
          .returning({ id: events.id, idempotencyKey: events.idempotencyKey })

        const insertedByKey = new Map(insertedRows.map(r => [r.idempotencyKey, r.id]))

        for (const entry of withIdemKey) {
          const eventId = insertedByKey.get(entry.payload.idempotency_key!)
          if (eventId) {
            insertedEvents.push({ ...entry, id: eventId })
            results.push({ index: entry.index, id: eventId })
          } else {
            // Not in RETURNING = deduplicated by ON CONFLICT
            results.push({ index: entry.index, error: 'Deduplicated' })
          }
        }
      }

      // Bulk insert events WITHOUT idempotency keys (always insert)
      if (withoutIdemKey.length > 0) {
        const rows = withoutIdemKey.map(({ payload, customerId }) => ({
          projectId,
          customerId,
          eventName: payload.event_name.trim(),
          properties: payload.properties ?? {},
          platform: payload.platform ?? 'api',
          source: payload.source ?? 'api',
          sessionId: payload.session_id ?? null,
          deviceId: payload.device_id ?? null,
          timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
        }))

        const insertedIds = await db.insert(events).values(rows).returning({ id: events.id })
        for (let j = 0; j < insertedIds.length; j++) {
          insertedEvents.push({ ...withoutIdemKey[j], id: insertedIds[j].id })
          results.push({ index: withoutIdemKey[j].index, id: insertedIds[j].id })
        }
      }
    }

    // Anonymous (customer_id = null) events are stored only — no customer
    // side-effects. Everything below runs for identified events.
    const customerEvents = insertedEvents.filter(
      (e): e is typeof e & { customerId: string } => !!e.customerId,
    )

    // Phase 5: Handle entities for events that have them (parallel)
    const entityPromises = customerEvents
      .filter(e => e.payload.entities && e.payload.entities.length > 0)
      .flatMap(e =>
        e.payload.entities!.map(entity => upsertEntity(projectId, e.customerId, entity)),
      )
    if (entityPromises.length > 0) {
      await Promise.allSettled(entityPromises)
    }

    // Phase 5.5: Handle SDK-specific events (identity merge, property updates,
    // and the session→customer stitch)
    for (const e of customerEvents) {
      await handleSdkEvent(projectId, e.customerId, e.payload).catch(err =>
        console.error('SDK event handler error (non-fatal):', (err as Error).message)
      )
    }

    // Phase 6: Bulk publish to BullMQ queues (identified events only)
    const jobPayloads = customerEvents.map(e => ({
      name: e.payload.event_name,
      data: {
        projectId,
        customerId: e.customerId,
        eventName: e.payload.event_name.trim(),
        properties: e.payload.properties ?? {},
        platform: e.payload.platform ?? 'api',
        source: e.payload.source ?? 'api',
        timestamp: (e.payload.timestamp ? new Date(e.payload.timestamp) : new Date()).toISOString(),
      },
    }))

    // Customer-aggregate jobs need the event id (so the worker can stamp
    // processed_at). Build that list separately from the trigger/metrics
    // payloads which don't.
    const aggregateJobs = customerEvents.map(e => ({
      name: e.payload.event_name,
      data: {
        eventId: e.id,
        projectId,
        customerId: e.customerId,
        eventName: e.payload.event_name.trim(),
        properties: e.payload.properties ?? {},
        timestamp: (e.payload.timestamp ? new Date(e.payload.timestamp) : new Date()).toISOString(),
      },
    }))

    if (jobPayloads.length > 0) {
      await Promise.all([
        eventsQueue.addBulk(jobPayloads),
        metricsQueue.addBulk(jobPayloads.map(j => ({ name: 'recompute', data: j.data }))),
        customerAggregateQueue.addBulk(aggregateJobs),
      ])
    }

    // Phase 7: Bulk update lastSeen for affected (identified) customers.
    const customerIds = [...new Set(customerEvents.map(e => e.customerId))]
    if (customerIds.length > 0) {
      await db.update(customers)
        .set({ lastSeen: new Date(), updatedAt: new Date() })
        .where(inArray(customers.id, customerIds))
    }

    const succeeded = results.filter(r => r.id).length
    const failed = results.filter(r => r.error && r.error !== 'Deduplicated').length

    res.status(200).json({
      success: true,
      data: { total: eventList.length, succeeded, failed, results },
    })
  } catch (err) {
    console.error('Batch event ingestion error:', err)
    res.status(500).json({ success: false, error: 'Failed to process batch' })
  }
})

/**
 * POST /api/v1/customers — Upsert customer profile
 */
router.post('/customers', async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId!
    const { customer_id, attributes, session_id } = req.body as {
      customer_id: string
      attributes?: Record<string, unknown>
      session_id?: string
    }

    if (!customer_id?.trim()) {
      return res.status(400).json({ success: false, error: 'customer_id is required' })
    }

    const email = attributes?.email as string | undefined
    const phone = attributes?.phone as string | undefined
    const name = attributes?.name as string | undefined

    // Extract subscription booleans from attributes (map to dedicated columns)
    const SUBSCRIPTION_KEYS = ['email_subscribed', 'sms_subscribed', 'push_subscribed', 'whatsapp_subscribed'] as const
    const subscriptions: Record<string, boolean> = {}
    for (const key of SUBSCRIPTION_KEYS) {
      if (attributes?.[key] !== undefined) {
        subscriptions[key] = Boolean(attributes[key])
      }
    }

    // Try to find existing customer
    let [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, customer_id)))
      .limit(1)

    if (existing) {
      // Update existing
      const updates: Record<string, unknown> = { updatedAt: new Date() }
      if (email) updates.email = email
      if (phone) updates.phone = phone
      if (name) updates.name = name
      // Map subscription booleans to dedicated columns
      if (subscriptions.email_subscribed !== undefined) updates.emailSubscribed = subscriptions.email_subscribed
      if (subscriptions.sms_subscribed !== undefined) updates.smsSubscribed = subscriptions.sms_subscribed
      if (subscriptions.push_subscribed !== undefined) updates.pushSubscribed = subscriptions.push_subscribed
      if (subscriptions.whatsapp_subscribed !== undefined) updates.whatsappSubscribed = subscriptions.whatsapp_subscribed
      if (attributes) {
        // Merge custom attributes (excluding standard + subscription fields)
        const { email: _, phone: __, name: ___,
          email_subscribed: ____, sms_subscribed: _____,
          push_subscribed: ______, whatsapp_subscribed: _______,
          ...custom } = attributes
        if (Object.keys(custom).length > 0) {
          updates.customAttributes = custom
        }
      }

      await db.update(customers).set(updates).where(eq(customers.id, existing.id))

      // Phase F3 — link the browser session if one was provided. Enqueue
      // identity-merge so prior anonymous events get back-attributed.
      if (session_id) {
        await linkAnonymousSession(projectId, session_id, existing.id)
      }

      res.json({ success: true, data: { id: existing.id, created: false } })
    } else {
      // Create new
      const { email: _, phone: __, name: ___,
        email_subscribed: ____, sms_subscribed: _____,
        push_subscribed: ______, whatsapp_subscribed: _______,
        ...custom } = attributes ?? {}

      const [customer] = await db.insert(customers).values({
        projectId,
        externalId: customer_id,
        email: email ?? null,
        phone: phone ?? null,
        name: name ?? null,
        emailSubscribed: subscriptions.email_subscribed ?? false,
        smsSubscribed: subscriptions.sms_subscribed ?? false,
        pushSubscribed: subscriptions.push_subscribed ?? false,
        whatsappSubscribed: subscriptions.whatsapp_subscribed ?? false,
        customAttributes: Object.keys(custom).length > 0 ? custom : {},
        metrics: {},
      }).returning({ id: customers.id })

      // Create identity records
      const identityRecords = []
      if (customer_id) {
        identityRecords.push({ projectId, customerId: customer.id, identifierType: 'external_id', identifierValue: customer_id, isPrimary: true })
      }
      if (email) {
        identityRecords.push({ projectId, customerId: customer.id, identifierType: 'email', identifierValue: email, isPrimary: false })
      }
      if (phone) {
        identityRecords.push({ projectId, customerId: customer.id, identifierType: 'phone', identifierValue: phone, isPrimary: false })
      }
      if (identityRecords.length > 0) {
        await db.insert(identities).values(identityRecords).onConflictDoNothing()
      }

      // Phase F3 — link the browser session if one was provided
      if (session_id) {
        await linkAnonymousSession(projectId, session_id, customer.id)
      }

      res.status(201).json({ success: true, data: { id: customer.id, created: true } })
    }
  } catch (err) {
    console.error('Customer upsert error:', err)
    res.status(500).json({ success: false, error: 'Failed to upsert customer' })
  }
})

// ============ HELPERS ============

/**
 * An anonymous client id, not a real customer. The SDK sends `anon_<uuid>` for
 * un-identified visitors (identity.ts getCustomerId), the Customer Events pixel
 * sends Shopify's `clientId` (a bare UUID), and `storees_sid` is `sdk_<uuid>`.
 * Real Shopify external customer ids are numeric, so none of these are customers.
 */
function isAnonymousCustomerId(id: string): boolean {
  return /^(anon_|sdk_)/i.test(id) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/**
 * If `customer_id` is an anonymous client id (with no real email/phone alongside),
 * move it to `session_id` and clear it — so the event is stored anonymously
 * (customer_id = NULL) and back-attributes on identify, instead of spawning a
 * ghost customer per visitor. Store-agnostic: works regardless of whether the
 * deployed SDK/pixel snippet has been updated to stop sending the client id.
 */
function normalizeAnonymousId(payload: EventIngestionPayload): void {
  if (
    payload.customer_id &&
    !payload.customer_email &&
    !payload.customer_phone &&
    isAnonymousCustomerId(payload.customer_id)
  ) {
    payload.session_id = payload.session_id || payload.customer_id
    payload.customer_id = undefined
  }
}

/** Resolve customer by external_id, email, or phone. Create if not found. */
async function resolveCustomer(
  projectId: string,
  payload: EventIngestionPayload,
): Promise<string> {
  // Delegate to shared service (handles resolution, creation, lastSeen, ON CONFLICT)
  const customerId = await resolveCustomerService({
    projectId,
    externalId: payload.customer_id ?? undefined,
    email: payload.customer_email ?? undefined,
    phone: payload.customer_phone ?? undefined,
  })

  // Ensure identity records exist for this customer (idempotent via ON CONFLICT)
  const identityRecords = []
  if (payload.customer_id) {
    identityRecords.push({ projectId, customerId, identifierType: 'external_id', identifierValue: payload.customer_id, isPrimary: true })
  }
  if (payload.customer_email) {
    identityRecords.push({ projectId, customerId, identifierType: 'email', identifierValue: payload.customer_email, isPrimary: false })
  }
  if (payload.customer_phone) {
    identityRecords.push({ projectId, customerId, identifierType: 'phone', identifierValue: payload.customer_phone, isPrimary: false })
  }
  if (identityRecords.length > 0) {
    await db.insert(identities).values(identityRecords).onConflictDoNothing()
  }

  return customerId
}

/** Upsert an entity (order, transaction, account, etc.) */
async function upsertEntity(
  projectId: string,
  customerId: string,
  entity: { type: string; external_id: string; status?: string; attributes?: Record<string, unknown> },
) {
  if (!entity.type || !entity.external_id) return

  const [existing] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(
      eq(entities.projectId, projectId),
      eq(entities.entityType, entity.type),
      eq(entities.externalId, entity.external_id),
    ))
    .limit(1)

  if (existing) {
    await db.update(entities)
      .set({
        status: entity.status ?? undefined,
        attributes: entity.attributes ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(entities.id, existing.id))
  } else {
    await db.insert(entities).values({
      projectId,
      customerId,
      entityType: entity.type,
      externalId: entity.external_id,
      status: entity.status ?? null,
      attributes: entity.attributes ?? {},
    })
  }
}

// ============ SDK EVENT HANDLERS ============

/** Dispatch SDK-specific event handlers (identity merge, property updates) */
async function handleSdkEvent(
  projectId: string,
  customerId: string,
  payload: EventIngestionPayload,
): Promise<void> {
  const eventName = payload.event_name?.trim()
  if (!eventName) return

  // Stitch a prior anonymous browse session to this customer whenever an event
  // carries BOTH a session id AND a real identifier (email/phone). e.g. the
  // pixel's checkout_started brings the visitor's email + their browse session,
  // so the earlier anonymous product_viewed/added_to_cart events back-attribute
  // to the real customer — no dependence on the order arriving or on the
  // 3rd-party checkout preserving cart attributes. Idempotent + non-fatal.
  if (payload.session_id && (payload.customer_email || payload.customer_phone)) {
    await linkAnonymousSession(projectId, payload.session_id, customerId).catch(err =>
      console.error('[events] session link failed:', (err as Error).message))
  }

  if (eventName === 'customer_identified') {
    await handleCustomerIdentified(projectId, customerId, payload.properties ?? {})
  } else if (eventName === 'user_properties_updated') {
    await handleUserPropertiesUpdated(projectId, customerId, payload.properties ?? {})
  }
}

/**
 * Merge anonymous customer into identified customer.
 * SDK sends: { user_id: 'real_123', previous_anonymous_id: 'anon_abc' }
 */
async function handleCustomerIdentified(
  projectId: string,
  customerId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const previousAnonId = properties.previous_anonymous_id as string | undefined
  const userId = properties.user_id as string | undefined

  if (!previousAnonId || !userId) return

  // Find the anonymous customer
  const [anonCustomer] = await db
    .select({ id: customers.id, customAttributes: customers.customAttributes, firstSeen: customers.firstSeen })
    .from(customers)
    .where(and(eq(customers.projectId, projectId), eq(customers.externalId, previousAnonId)))
    .limit(1)

  if (!anonCustomer) return // No anonymous customer to merge

  // Find the identified customer (may be the same record if resolved by email)
  const [identifiedCustomer] = await db
    .select({ id: customers.id, customAttributes: customers.customAttributes, firstSeen: customers.firstSeen })
    .from(customers)
    .where(and(eq(customers.projectId, projectId), eq(customers.externalId, userId)))
    .limit(1)

  if (identifiedCustomer && identifiedCustomer.id !== anonCustomer.id) {
    // Two different records exist — merge anonymous into identified
    // Wrap in a transaction to prevent partial merges (e.g. events moved but anon not deleted)
    const anonAttrs = (anonCustomer.customAttributes ?? {}) as Record<string, unknown>
    const identifiedAttrs = (identifiedCustomer.customAttributes ?? {}) as Record<string, unknown>
    const mergedAttrs = { ...anonAttrs, ...identifiedAttrs }
    const earlierFirstSeen = anonCustomer.firstSeen < identifiedCustomer.firstSeen
      ? anonCustomer.firstSeen
      : identifiedCustomer.firstSeen

    await db.transaction(async (tx) => {
      // 1. Reassign all events from anonymous to identified
      await tx.execute(sql`
        UPDATE events SET customer_id = ${identifiedCustomer.id}
        WHERE customer_id = ${anonCustomer.id} AND project_id = ${projectId}
      `)

      // 2. Reassign entities
      await tx.execute(sql`
        UPDATE entities SET customer_id = ${identifiedCustomer.id}
        WHERE customer_id = ${anonCustomer.id} AND project_id = ${projectId}
      `)

      // 3. Merge custom attributes + use earlier firstSeen
      await tx.update(customers)
        .set({ customAttributes: mergedAttrs, firstSeen: earlierFirstSeen, updatedAt: new Date() })
        .where(eq(customers.id, identifiedCustomer.id))

      // 4. Delete anonymous customer's identities and the customer record
      await tx.execute(sql`
        DELETE FROM identities WHERE customer_id = ${anonCustomer.id} AND project_id = ${projectId}
      `)
      await tx.delete(customers).where(eq(customers.id, anonCustomer.id))
    })

    console.log(`Merged anonymous customer ${anonCustomer.id} → ${identifiedCustomer.id}`)
  } else if (!identifiedCustomer) {
    // Only anonymous exists — just rename to the real ID
    await db.update(customers)
      .set({ externalId: userId, updatedAt: new Date() })
      .where(eq(customers.id, anonCustomer.id))

    console.log(`Renamed anonymous customer ${anonCustomer.id} → externalId: ${userId}`)
  }
  // If same record, nothing to merge
}

/**
 * Merge user properties from SDK into customer record.
 * Filters out $-prefixed SDK metadata keys.
 */
async function handleUserPropertiesUpdated(
  projectId: string,
  customerId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  // Filter out SDK metadata keys ($os, $browser, $sdk_version, etc.)
  const userProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (!key.startsWith('$')) {
      userProps[key] = value
    }
  }

  if (Object.keys(userProps).length === 0) return

  // Extract known customer fields
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (userProps.email) { updates.email = userProps.email; delete userProps.email }
  if (userProps.phone) { updates.phone = userProps.phone; delete userProps.phone }
  if (userProps.name) { updates.name = userProps.name; delete userProps.name }

  // Extract subscription booleans
  const subKeys = { email_subscribed: 'emailSubscribed', sms_subscribed: 'smsSubscribed', push_subscribed: 'pushSubscribed', whatsapp_subscribed: 'whatsappSubscribed' } as const
  for (const [snakeKey, camelKey] of Object.entries(subKeys)) {
    if (userProps[snakeKey] !== undefined) {
      updates[camelKey] = Boolean(userProps[snakeKey])
      delete userProps[snakeKey]
    }
  }

  // Merge remaining into customAttributes via JSONB merge
  if (Object.keys(userProps).length > 0) {
    await db.execute(sql`
      UPDATE customers
      SET custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || ${JSON.stringify(userProps)}::jsonb,
          updated_at = NOW()
      WHERE id = ${customerId}
    `)
  }

  // Apply known field updates
  if (Object.keys(updates).length > 1) { // > 1 because updatedAt is always there
    await db.update(customers).set(updates).where(eq(customers.id, customerId))
  }
}

// linkAnonymousSession now lives in services/anonymousSessionService.ts (shared
// with the order-ingestion stitch). Imported at the top of this file.

/**
 * POST /api/v1/identify — explicit session-to-customer linkage.
 *
 * Used when the storefront knows the customer's external_id but doesn't have
 * full attribute data to send a /customers upsert. Lighter-weight: just links
 * the browser session to an already-known customer and triggers the merge.
 *
 * Body: { customer_id: string, session_id: string }
 *
 * Useful for: post-checkout pages where the user just authenticated, embed
 * scripts triggered by an email-link UTM param resolving to a customer, etc.
 */
router.post('/identify', async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId!
    const { customer_id, session_id } = req.body as { customer_id?: string; session_id?: string }

    if (!customer_id?.trim() || !session_id?.trim()) {
      return res.status(400).json({ success: false, error: 'customer_id and session_id are required' })
    }

    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), eq(customers.externalId, customer_id)))
      .limit(1)

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Customer not found. Use /customers to create first.' })
    }

    await linkAnonymousSession(projectId, session_id, existing.id)
    res.json({ success: true, data: { customerId: existing.id } })
  } catch (err) {
    console.error('Identify error:', err)
    res.status(500).json({ success: false, error: 'Failed to link session' })
  }
})

export default router
