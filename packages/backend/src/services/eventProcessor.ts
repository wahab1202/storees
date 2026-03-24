import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { events, orders } from '../db/schema.js'
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

    await db.insert(events).values({
      projectId: processed.projectId,
      customerId: processed.customerId,
      eventName: processed.eventName,
      properties: processed.properties,
      platform: processed.platform,
      timestamp: processed.timestamp,
    })

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
        eventId: processed.projectId, // event ID not returned from insert; use projectId as correlation
      })
    }

    console.log(`Event processed: ${eventName} for customer ${customerId}`)
  } catch (err) {
    console.error(`Event processing failed for ${eventName}:`, err)
    // TODO: write to dead_letter_events table
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
  properties: Record<string, unknown>
  timestamp: Date
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
  }

  switch (eventName) {
    case 'customer_created':
    case 'customer_updated':
      base.externalCustomerId = String(payload.id ?? '')
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
      break

    case 'order_placed':
    case 'order_fulfilled':
    case 'order_cancelled': {
      base.email = (payload.email as string) ?? base.email
      const lineItems = (payload.line_items as unknown[]) ?? []
      base.properties = {
        order_id: String(payload.id ?? ''),
        total: Number(payload.total_price ?? 0),
        discount: Number(payload.total_discounts ?? 0),
        item_count: lineItems.length,
        items: (lineItems as Record<string, unknown>[]).map(item => ({
          product_id: String(item.product_id ?? ''),
          product_name: (item.title as string) ?? '',
          quantity: Number(item.quantity ?? 1),
          price: Number(item.price ?? 0),
          image_url: (item.image as Record<string, unknown>)?.src as string ?? undefined,
        })),
      }
      base.timestamp = payload.created_at ? new Date(payload.created_at as string) : new Date()
      break
    }

    case 'checkout_started':
      base.email = (payload.email as string) ?? base.email
      base.properties = {
        checkout_id: String(payload.id ?? ''),
        total: Number(payload.total_price ?? 0),
      }
      break

    case 'cart_created':
    case 'cart_updated': {
      const cartItems = (payload.line_items as unknown[]) ?? []
      const cartValue = (cartItems as Record<string, unknown>[]).reduce(
        (sum, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 1),
        0,
      )
      base.properties = {
        cart_id: String(payload.id ?? payload.token ?? ''),
        cart_value: cartValue,
        item_count: cartItems.length,
        items: (cartItems as Record<string, unknown>[]).map(item => ({
          product_id: String(item.product_id ?? ''),
          product_name: (item.title as string) ?? '',
          quantity: Number(item.quantity ?? 1),
          price: Number(item.price ?? 0),
          image_url: (item.image as string) ?? undefined,
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
    case 'order_placed': {
      const externalOrderId = String(payload.id ?? '')
      const total = Number(payload.total_price ?? 0)
      const discount = Number(payload.total_discounts ?? 0)
      const currency = (payload.currency as string) ?? 'INR'
      const lineItems = (payload.line_items as Record<string, unknown>[]) ?? []

      // Dedupe: check if order already exists
      const [existing] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId)))
        .limit(1)

      if (!existing) {
        await db.insert(orders).values({
          projectId,
          customerId,
          externalOrderId,
          status: 'pending',
          total: String(total),
          discount: String(discount),
          currency,
          lineItems: lineItems.map(item => ({
            productId: String(item.product_id ?? ''),
            productName: (item.title as string) ?? '',
            quantity: Number(item.quantity ?? 1),
            price: Number(item.price ?? 0),
            imageUrl: (item.image as Record<string, unknown>)?.src as string ?? undefined,
          })),
          createdAt: normalized.timestamp,
        })

        await updateCustomerAggregates(customerId, total)
      }
      break
    }

    case 'order_fulfilled': {
      const externalOrderId = String(payload.id ?? '')
      await db.update(orders).set({
        status: 'fulfilled',
        fulfilledAt: new Date(),
      }).where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId)))
      break
    }

    case 'order_cancelled': {
      const externalOrderId = String(payload.id ?? '')
      const total = Number(payload.total_price ?? 0)

      await db.update(orders).set({
        status: 'cancelled',
      }).where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId)))

      await recalculateAggregates(customerId, total)
      break
    }
  }
}

function buildName(first?: string, last?: string): string | null {
  const parts = [first, last].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}
