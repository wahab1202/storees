import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { events, orders, deadLetterEvents } from '../db/schema.js'
import { eventsQueue, metricsQueue, interactionQueue } from './queue.js'
import {
  resolveCustomer,
  updateCustomerAggregates,
  recalculateAggregates,
} from './customerService.js'

type WebhookPayload = Record<string, unknown>

type ProcessedEvent = {
  projectId: string
  customerId: string
  eventName: string
  properties: Record<string, unknown>
  platform: string
  timestamp: Date
}

/**
 * Main event processor pipeline:
 * normalize → validate → identity resolve → enrich → persist → publish
 */
export async function processWebhookEvent(
  projectId: string,
  eventName: string,
  payload: WebhookPayload,
): Promise<void> {
  try {
    // 1. Normalize — extract standard fields from Shopify payload
    const normalized = normalizePayload(eventName, payload)

    // 2. Validate — check required fields
    if (!normalized.email && !normalized.externalCustomerId && !normalized.phone) {
      console.warn(`Skipping event ${eventName}: no customer identifier in payload`)
      return
    }

    // 3. Identity resolve — find or create customer
    const customerId = await resolveCustomer({
      projectId,
      externalId: normalized.externalCustomerId,
      email: normalized.email,
      phone: normalized.phone,
      name: normalized.customerName,
      emailSubscribed: normalized.emailSubscribed,
      smsSubscribed: normalized.smsSubscribed,
      region: normalized.region,
      city: normalized.city,
    })

    // 4. Enrich — handle side effects (create order rows, update aggregates)
    await handleSideEffects(projectId, customerId, eventName, normalized, payload)

    // 5. Persist — write event to DB
    const processed: ProcessedEvent = {
      projectId,
      customerId,
      eventName,
      properties: normalized.properties,
      platform: 'shopify_webhook',
      timestamp: normalized.timestamp,
    }

    const [insertedEvent] = await db.insert(events).values({
      projectId: processed.projectId,
      customerId: processed.customerId,
      eventName: processed.eventName,
      properties: processed.properties,
      platform: processed.platform,
      timestamp: processed.timestamp,
    }).returning({ id: events.id })

    // 6. Publish — send to BullMQ for segment evaluation + flow triggers
    await eventsQueue.add(eventName, {
      ...processed,
      timestamp: processed.timestamp.toISOString(),
    })

    // 7. Publish to metrics queue — recompute customer metrics
    await metricsQueue.add('recompute', {
      ...processed,
      timestamp: processed.timestamp.toISOString(),
    })

    // 8. Publish to interaction queue — create user-item interactions if configured
    if (processed.properties.item_id || processed.properties.item_internal_id) {
      await interactionQueue.add('process', {
        projectId: processed.projectId,
        customerId: processed.customerId,
        eventName: processed.eventName,
        properties: processed.properties,
        eventId: insertedEvent.id,
      })
    }

    console.log(`Event processed: ${eventName} for customer ${customerId}`)
  } catch (err) {
    console.error(`Event processing failed for ${eventName}:`, err)
    // Persist the failed event so it can be inspected/replayed rather than lost.
    await db.insert(deadLetterEvents).values({
      projectId,
      eventName,
      payload,
      error: err instanceof Error ? err.message : String(err),
    }).catch(dlErr => console.error('[dead-letter] failed to persist event:', dlErr))
  }
}

/**
 * Process historical sync events — persists but does NOT publish to queue.
 */
export async function processHistoricalEvent(
  projectId: string,
  customerId: string,
  eventName: string,
  properties: Record<string, unknown>,
  timestamp: Date,
): Promise<void> {
  await db.insert(events).values({
    projectId,
    customerId,
    eventName,
    properties,
    platform: 'historical_sync',
    timestamp,
  })
}

// ============ NORMALIZER ============

type NormalizedPayload = {
  externalCustomerId?: string
  email?: string | null
  phone?: string | null
  customerName?: string | null
  emailSubscribed?: boolean
  smsSubscribed?: boolean
  region?: string | null
  city?: string | null
  properties: Record<string, unknown>
  timestamp: Date
}

/** Pull province (region) and city from a Shopify customer's default_address. Tolerates the field being missing or partial. */
function extractShopifyAddress(customer: Record<string, unknown> | undefined): { region: string | null; city: string | null } {
  if (!customer) return { region: null, city: null }
  const addr = (customer.default_address ?? customer.billing_address ?? customer.shipping_address) as Record<string, unknown> | undefined
  if (!addr) return { region: null, city: null }
  const region = (addr.province as string | undefined) || (addr.province_code as string | undefined) || null
  const city = (addr.city as string | undefined) || null
  return { region: region || null, city: city || null }
}

function normalizePayload(eventName: string, payload: WebhookPayload): NormalizedPayload {
  const base: NormalizedPayload = {
    properties: {},
    timestamp: new Date(),
  }

  // Extract customer identifiers from Shopify payload
  const customer = payload.customer as Record<string, unknown> | undefined

  if (customer) {
    base.externalCustomerId = String(customer.id ?? '')
    base.email = (customer.email as string) ?? null
    base.phone = (customer.phone as string) ?? null
    base.customerName = buildName(
      customer.first_name as string | undefined,
      customer.last_name as string | undefined,
    )

    const emailConsent = customer.email_marketing_consent as Record<string, unknown> | undefined
    if (emailConsent) {
      base.emailSubscribed = emailConsent.state === 'subscribed'
    }

    const smsConsent = customer.sms_marketing_consent as Record<string, unknown> | undefined
    if (smsConsent) {
      base.smsSubscribed = smsConsent.state === 'subscribed'
    }

    const { region, city } = extractShopifyAddress(customer)
    base.region = region
    base.city = city
  }

  switch (eventName) {
    case 'customer_created':
    case 'customer_updated':
      // Canonical-first: connectors map source id -> customer_id (or pass
      // through external_id); Shopify webhooks still emit `id`. Accept all.
      base.externalCustomerId = String(payload.customer_id ?? payload.external_id ?? payload.id ?? '')
      base.email = (payload.email as string) ?? null
      base.phone = (payload.phone as string) ?? null
      base.customerName = buildName(
        payload.first_name as string | undefined,
        payload.last_name as string | undefined,
      )
      const emailConsent = payload.email_marketing_consent as Record<string, unknown> | undefined
      if (emailConsent) base.emailSubscribed = emailConsent.state === 'subscribed'
      const smsConsent = payload.sms_marketing_consent as Record<string, unknown> | undefined
      if (smsConsent) base.smsSubscribed = smsConsent.state === 'subscribed'
      // customer_* webhooks deliver fields at top level, not nested under .customer
      const directAddr = extractShopifyAddress(payload as Record<string, unknown>)
      if (directAddr.region) base.region = directAddr.region
      if (directAddr.city) base.city = directAddr.city
      break

    case 'order_placed':
    case 'order_completed':
    case 'order_fulfilled':
    case 'order_cancelled': {
      base.email = (payload.email as string) ?? base.email
      const lineItems = (payload.line_items as unknown[]) ?? []
      // Canonical-first per the connector mapping (order_id/total/discount/
      // product_name/image_url); Shopify webhooks still emit the raw shape
      // (id/total_price/total_discounts/title/image.src). Accept both so
      // every connector flows through cleanly.
      base.properties = {
        order_id: String(payload.order_id ?? payload.id ?? ''),
        total: Number(payload.total ?? payload.total_price ?? 0),
        discount: Number(payload.discount ?? payload.total_discounts ?? 0),
        item_count: lineItems.length,
        items: (lineItems as Record<string, unknown>[]).map(item => ({
          product_id: String(item.product_id ?? item.productId ?? ''),
          product_name: String(item.product_name ?? item.title ?? ''),
          quantity: Number(item.quantity ?? 1),
          price: Number(item.price ?? item.unit_price ?? 0),
          image_url: (item.image_url as string) ?? (item.image as Record<string, unknown>)?.src as string ?? undefined,
        })),
      }
      base.timestamp = payload.created_at ? new Date(payload.created_at as string) : new Date()
      break
    }

    case 'order_status_updated': {
      // Real-time status transition for an already-placed order. Carries just
      // the order id + new status (no line items). Accept any of the common
      // field spellings so the sending system isn't forced into one shape.
      base.properties = {
        order_id: String(payload.order_id ?? payload.id ?? ''),
        status: String(payload.status ?? payload.order_status ?? payload.fulfillment_status ?? ''),
      }
      break
    }

    case 'checkout_started':
      base.email = (payload.email as string) ?? base.email
      base.properties = {
        checkout_id: String(payload.checkout_id ?? payload.id ?? ''),
        total: Number(payload.total ?? payload.total_price ?? 0),
      }
      break

    case 'cart_created':
    case 'cart_updated': {
      const cartItems = (payload.line_items as unknown[]) ?? []
      const cartValue = (cartItems as Record<string, unknown>[]).reduce(
        (sum, item) => sum + Number(item.price ?? item.unit_price ?? 0) * Number(item.quantity ?? 1),
        0,
      )
      base.properties = {
        cart_id: String(payload.cart_id ?? payload.id ?? payload.token ?? ''),
        cart_value: cartValue,
        item_count: cartItems.length,
        items: (cartItems as Record<string, unknown>[]).map(item => ({
          product_id: String(item.product_id ?? item.productId ?? ''),
          product_name: String(item.product_name ?? item.title ?? ''),
          quantity: Number(item.quantity ?? 1),
          price: Number(item.price ?? item.unit_price ?? 0),
          image_url: (item.image_url as string) ?? (item.image as string) ?? undefined,
        })),
        checkout_url: payload.token
          ? `https://${base.externalCustomerId ? '' : ''}cart/${payload.token}`
          : undefined,
      }
      break
    }
  }

  return base
}

// ============ SIDE EFFECTS ============

async function handleSideEffects(
  projectId: string,
  customerId: string,
  eventName: string,
  normalized: NormalizedPayload,
  payload: WebhookPayload,
): Promise<void> {
  switch (eventName) {
    case 'order_placed':
    case 'order_completed': {
      // Canonical-first per the connector mapping (order_id/total/discount);
      // Shopify still emits id/total_price/total_discounts.
      const externalOrderId = String(payload.order_id ?? payload.id ?? '')
      const total = Number(payload.total ?? payload.total_price ?? 0)
      const discount = Number(payload.discount ?? payload.total_discounts ?? 0)
      const currency = (payload.currency as string) ?? 'INR'
      const lineItems = (payload.line_items as Record<string, unknown>[]) ?? []

      // Dedupe atomically on the (projectId, externalOrderId) unique index — a
      // concurrent duplicate webhook must not throw (and drop the event) or
      // double-count aggregates.
      {
        const [inserted] = await db.insert(orders).values({
          projectId,
          customerId,
          externalOrderId,
          status: eventName === 'order_completed' ? 'fulfilled' : 'pending',
          total: String(total),
          discount: String(discount),
          currency,
          // Canonical-first across every field. Connectors (VirpanAI / Medusa
          // / any using the canonical mapping) emit snake_case names —
          // product_id, product_name, price (renamed from source unit_price),
          // image_url. Shopify-direct webhooks still emit the raw shape —
          // product_id, title, image.src, sometimes unit_price. Accept all so
          // a switch of source doesn't silently empty fields downstream.
          lineItems: lineItems.map(item => ({
            productId: String(item.product_id ?? item.productId ?? ''),
            productName: String(item.product_name ?? item.title ?? ''),
            quantity: Number(item.quantity ?? 1),
            price: Number(item.price ?? item.unit_price ?? 0),
            imageUrl:
              (item.image_url as string) ??
              (item.image as Record<string, unknown>)?.src as string ??
              undefined,
          })),
          createdAt: normalized.timestamp,
        }).onConflictDoNothing().returning({ id: orders.id })

        // Only update aggregates when a new order row was actually inserted.
        if (inserted) {
          await updateCustomerAggregates(customerId, total)
        }
      }
      break
    }

    case 'order_fulfilled': {
      const externalOrderId = String(payload.order_id ?? payload.id ?? '')
      await db.update(orders).set({
        status: 'fulfilled',
        fulfilledAt: new Date(),
      }).where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId)))
      break
    }

    case 'order_cancelled': {
      const externalOrderId = String(payload.order_id ?? payload.id ?? '')

      await db.update(orders).set({
        status: 'cancelled',
      }).where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId)))

      await recalculateAggregates(customerId)
      break
    }

    case 'order_status_updated': {
      // Generic real-time status transition — lets the source system push ANY
      // status (processing/shipped/delivered/…) between syncs, not just the
      // fulfilled/cancelled terminals above. Stores the raw source value; the
      // Orders tab normalizes it for display. order_cancelled/order_fulfilled
      // remain as convenience aliases for those two terminal states.
      const externalOrderId = String(payload.order_id ?? payload.id ?? '')
      const rawStatus = String(
        payload.status ?? payload.order_status ?? payload.fulfillment_status ?? '',
      ).trim()
      if (!externalOrderId || !rawStatus) break
      const looksFulfilled = /^(fulfilled|completed|complete|delivered|shipped)$/i.test(rawStatus)
      await db.update(orders).set({
        status: rawStatus.slice(0, 20), // orders.status is varchar(20)
        ...(looksFulfilled ? { fulfilledAt: new Date() } : {}),
      }).where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId)))
      break
    }
  }
}

function buildName(first?: string, last?: string): string | null {
  const parts = [first, last].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}
