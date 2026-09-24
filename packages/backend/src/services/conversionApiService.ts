import { createHash } from 'node:crypto'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { adConversionDestinations, customers as customersTable } from '../db/schema.js'
import { decrypt } from './encryption.js'
import { projectVocabulary } from './projectVocabulary.js'

// Gap 9: Conversion APIs. When a revenue event lands (order_placed,
// subscription_renewed, etc.), we fan out a server-side event to every
// configured ad-platform destination so the platform can optimize bids
// against actual conversions instead of just pixel-fired noise.
//
// This commit ships:
//   - Full Meta CAPI implementation (covers >70% of retail ad spend)
//   - Stubs for Google / TikTok / Snap that log "not yet implemented"
//     and increment events_failed but don't throw — so a half-configured
//     destination doesn't poison the relay path.
//
// Hashing rules match the audience-export service (gap 8): SHA-256 hex
// of normalized email/phone/name. Both endpoints share the platform's
// expected identifier format so a customer hashes consistently across
// the Custom Audience CSV upload AND the conversion event payload.

export type AdPlatform = 'meta' | 'google' | 'tiktok' | 'snap'

export type ConversionEventInput = {
  projectId: string
  customerId: string
  eventName: string                   // order_placed, subscription_renewed, …
  eventTime: Date
  properties: Record<string, unknown>  // total, currency, line_items, …
}

// Normalize + hash helpers (kept local for self-containment).

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function hashEmail(raw: string | null): string | null {
  if (!raw) return null
  const e = raw.trim().toLowerCase()
  return e.includes('@') ? sha256Hex(e) : null
}

function hashPhone(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  return digits.length >= 7 ? sha256Hex(digits) : null
}

function hashName(raw: string | null): string | null {
  if (!raw) return null
  const n = raw.trim().toLowerCase()
  return n.length > 0 ? sha256Hex(n) : null
}

function splitName(name: string | null): { fn: string | null; ln: string | null } {
  if (!name) return { fn: null, ln: null }
  const parts = name.trim().split(/\s+/)
  return {
    fn: hashName(parts[0] ?? null),
    ln: parts.length > 1 ? hashName(parts.slice(1).join(' ')) : null,
  }
}

// ── Platform: Meta Conversions API ──────────────────────────────────────────
// Doc: developers.facebook.com/docs/marketing-api/conversions-api

const META_EVENT_NAME_MAP: Record<string, string> = {
  order_placed: 'Purchase',
  subscription_started: 'Subscribe',
  subscription_renewed: 'Subscribe',
  added_to_cart: 'AddToCart',
  checkout_started: 'InitiateCheckout',
  product_viewed: 'ViewContent',
  added_to_wishlist: 'AddToWishlist',
  search_performed: 'Search',
  customer_created: 'CompleteRegistration',
}

/** What Meta should be told this event was — resolved through the project's slots.
 *
 *  `META_EVENT_NAME_MAP` is keyed on OUR published names, and the name arriving here
 *  is whatever the shop actually sends. For a shop using its own vocabulary the lookup
 *  missed every time and `if (!mappedName) return` skipped the relay in silence — so
 *  Meta received NO conversions at all, and the ad platform optimised bids against
 *  nothing. Nothing errored; the destination simply reported zero sent.
 *
 *  So resolve the meaning first: whatever this project calls a purchase becomes
 *  `order_placed` for the purposes of the lookup, and Meta gets `Purchase`. */
function canonicalNameFor(eventName: string, vocab: {
  purchaseEvents: string[]; viewEvents: string[]; cartEvents: string[]
  wishlistEvents: string[]; fulfilmentEvents: string[]
}): string {
  if (vocab.purchaseEvents.includes(eventName)) return 'order_placed'
  if (vocab.viewEvents.includes(eventName)) return 'product_viewed'
  if (vocab.cartEvents.includes(eventName)) return 'added_to_cart'
  if (vocab.wishlistEvents.includes(eventName)) return 'added_to_wishlist'
  return eventName   // already ours, or a signal Meta has no equivalent for
}

async function relayToMeta(
  destination: typeof adConversionDestinations.$inferSelect,
  evt: ConversionEventInput,
  customer: { email: string | null; phone: string | null; name: string | null },
  vocab: Awaited<ReturnType<typeof projectVocabulary>>,
): Promise<void> {
  const mappedName = META_EVENT_NAME_MAP[canonicalNameFor(evt.eventName, vocab)]
  if (!mappedName) return  // event isn't part of Meta's standard taxonomy — silently skip

  const { fn, ln } = splitName(customer.name)
  const user_data: Record<string, unknown> = {}
  const em = hashEmail(customer.email)
  const ph = hashPhone(customer.phone)
  if (em) user_data.em = [em]
  if (ph) user_data.ph = [ph]
  if (fn) user_data.fn = [fn]
  if (ln) user_data.ln = [ln]
  user_data.external_id = [sha256Hex(evt.customerId)]

  if (Object.keys(user_data).length === 0) return  // nothing to match on

  // Amount, currency and transaction id under THIS project's field names. Read as the
  // literal `total`/`order_id`, a shop calling them anything else relayed a conversion
  // with no value on it — Meta counts the event but cannot optimise for revenue, which
  // is the entire reason for sending it.
  const props = evt.properties as Record<string, unknown> & {
    line_items?: Array<{ product_id?: string; quantity?: number; price?: number }>
  }
  const amount = Number(props[vocab.amountKey] ?? props.total)
  const currency = String(props[vocab.currencyKey] ?? props.currency ?? 'INR')
  const orderId = props[vocab.orderIdKey] ?? props.order_id

  const custom_data: Record<string, unknown> = {}
  if (Number.isFinite(amount)) {
    custom_data.value = amount
    custom_data.currency = currency.toUpperCase()
  }
  if (orderId) custom_data.order_id = orderId
  if (Array.isArray(props.line_items) && props.line_items.length > 0) {
    custom_data.content_ids = props.line_items.map((l) => l.product_id).filter(Boolean)
    custom_data.content_type = 'product'
    custom_data.num_items = props.line_items.reduce((s, l) => s + (l.quantity ?? 1), 0)
  }

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: mappedName,
        event_time: Math.floor(evt.eventTime.getTime() / 1000),
        action_source: 'website',
        // Meta dedupes on this. Under the project's own order-id key — read as the
        // literal `order_id`, a shop naming it otherwise fell back to the customer id,
        // so two different orders by the same customer in the same millisecond could
        // collide, and a retried relay of one order would not dedupe against itself.
        event_id: `${evt.eventName}:${orderId ?? evt.customerId}:${evt.eventTime.getTime()}`,
        user_data,
        custom_data,
      },
    ],
  }
  if (destination.testEventCode) body.test_event_code = destination.testEventCode

  const accessToken = decrypt(destination.accessToken)
  const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(destination.pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Meta CAPI ${resp.status}: ${text.slice(0, 300)}`)
  }
}

// ── Platform stubs (Phase 2) ────────────────────────────────────────────────

async function relayToGoogle(): Promise<void> {
  // Google Enhanced Conversions uses gclid or Customer Match identifiers
  // via /customers/{cid}/conversionActions. Needs developer-token + OAuth
  // refresh flow — defer to Phase 2.
  throw new Error('Google Enhanced Conversions integration not yet implemented')
}

async function relayToTikTok(): Promise<void> {
  // TikTok Events API: POST to business-api.tiktok.com/open_api/v1.3/event/track/.
  // Same hashing rules as Meta but different field names. Phase 2.
  throw new Error('TikTok Events API integration not yet implemented')
}

async function relayToSnap(): Promise<void> {
  // Snap CAPI: POST to tr.snapchat.com/v3/{pixel_id}/events.
  // Hashed identifiers in pii_hashed object. Phase 2.
  throw new Error('Snap Conversions API integration not yet implemented')
}

// ── Public relay entry point ────────────────────────────────────────────────

/**
 * Fan an aggregate-worker-recognised conversion event out to every active
 * destination configured for the project. Called by customerAggregateWorker
 * after applying the event to customer totals, so we only relay events
 * that genuinely affected revenue.
 *
 * Designed to NEVER throw — relay failures are logged + counted but never
 * block the aggregator. Each platform that errors out increments its
 * own counter so the admin UI can show "Meta: 1024 sent / 3 failed".
 */
export async function relayConversionEvent(evt: ConversionEventInput): Promise<void> {
  let destinations: Array<typeof adConversionDestinations.$inferSelect>
  try {
    destinations = await db
      .select()
      .from(adConversionDestinations)
      .where(and(
        eq(adConversionDestinations.projectId, evt.projectId),
        eq(adConversionDestinations.status, 'active'),
      ))
  } catch (err) {
    console.error('[conversion-api] failed to load destinations:', (err as Error).message)
    return
  }
  if (destinations.length === 0) return

  // Resolved once for the whole fan-out — every destination needs the same answer.
  const relayVocab = await projectVocabulary(evt.projectId)

  // Single customer lookup, reused across destinations
  const [customer] = await db
    .select({ email: customersTable.email, phone: customersTable.phone, name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.id, evt.customerId))
    .limit(1)
  if (!customer) return

  for (const dest of destinations) {
    try {
      const platform = dest.platform as AdPlatform
      if (platform === 'meta') await relayToMeta(dest, evt, customer, relayVocab)
      else if (platform === 'google') await relayToGoogle()
      else if (platform === 'tiktok') await relayToTikTok()
      else if (platform === 'snap') await relayToSnap()
      else continue

      await db
        .update(adConversionDestinations)
        .set({
          eventsSent: sql`${adConversionDestinations.eventsSent} + 1`,
          lastSentAt: new Date(),
        })
        .where(eq(adConversionDestinations.id, dest.id))
    } catch (err) {
      const message = (err as Error).message
      console.warn(`[conversion-api] ${dest.platform} relay failed (${dest.pixelId}):`, message)
      await db
        .update(adConversionDestinations)
        .set({
          eventsFailed: sql`${adConversionDestinations.eventsFailed} + 1`,
          lastError: message.slice(0, 500),
          lastErrorAt: new Date(),
        })
        .where(eq(adConversionDestinations.id, dest.id))
    }
  }
}

// Used by the test-event admin endpoint — fires a fake order_placed at
// the destination so onboarding can verify "is it landing in Events
// Manager?" before going live.
export async function testRelay(destinationId: string, projectId: string): Promise<void> {
  const [dest] = await db
    .select()
    .from(adConversionDestinations)
    .where(and(eq(adConversionDestinations.id, destinationId), eq(adConversionDestinations.projectId, projectId)))
    .limit(1)
  if (!dest) throw new Error('Destination not found')

  const [customer] = await db
    .select({ id: customersTable.id, email: customersTable.email, phone: customersTable.phone, name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.projectId, projectId))
    .limit(1)
  if (!customer) throw new Error('No customers in project — cannot send a test event with real identifiers')

  // The project's own purchase event, and its own field names.
  //
  // A test exists to prove the real thing works. Sent as the literal `order_placed`
  // carrying `order_id` and `total`, it proved that RETAIL's conversion would relay —
  // which tells a lender or a course platform nothing about their own. Their live
  // conversions could be failing for precisely the reason the test was meant to catch,
  // and the test would still come back green.
  const vocab = await projectVocabulary(projectId)
  const evt: ConversionEventInput = {
    projectId,
    customerId: customer.id,
    eventName: vocab.purchaseEvents[0] ?? 'order_placed',
    eventTime: new Date(),
    properties: {
      [vocab.orderIdKey]: `test_${Date.now()}`,
      [vocab.amountKey]: 100,
      [vocab.currencyKey]: 'INR',
      line_items: [{ product_id: 'test-product', quantity: 1, price: 100 }],
    },
  }

  const platform = dest.platform as AdPlatform
  if (platform === 'meta') return relayToMeta(dest, evt, customer, vocab)
  if (platform === 'google') return relayToGoogle()
  if (platform === 'tiktok') return relayToTikTok()
  if (platform === 'snap') return relayToSnap()
  throw new Error(`Unknown platform: ${platform}`)
}
