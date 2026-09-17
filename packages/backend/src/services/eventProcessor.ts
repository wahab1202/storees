import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { events, orders, deadLetterEvents } from '../db/schema.js'
import { eventsQueue, metricsQueue, interactionQueue, publishEvent } from './queue.js'
import {
  resolveCustomer,
  updateCustomerAggregates,
  recalculateAggregates,
} from './customerService.js'
import { stitchOrderToSession } from './anonymousSessionService.js'
import { normalizeLineItemFields } from '@storees/shared'
import { purchaseAwaitingProcessing } from './orderArrival.js'
import { projectVocabulary } from './projectVocabulary.js'
import { ORDER_STATUS } from '../db/orderStatus.js'

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
    // 1. Normalize — read the payload for what it holds, whatever the event is called.
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

    // 3b. Stitch the anonymous browse session to this order's customer. A 3rd-party
    // checkout (e.g. Shopflo) means the visitor never identifies on-site, but the
    // storefront stamps the SDK session id onto the cart as `storees_sid`, which
    // rides through to order.note_attributes — so the order closes the loop.
    // Any purchase closes the loop, not only a shop's. A lender's `loan_disbursed`
    // carries the same session id and was never stitched, so the anonymous browsing
    // that led to the loan stayed detached from the borrower.
    const stitchVocab = await projectVocabulary(projectId)
    if (stitchVocab.purchaseEvents.includes(eventName)) {
      await stitchOrderToSession(projectId, customerId, payload).catch(err =>
        console.error('[order-stitch] failed:', err))
    }

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
    await publishEvent(eventName, {
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
  // Idempotent: re-running a historical sync must NOT duplicate the same event,
  // otherwise the customer Activity tab shows each order again on every sync.
  // Key on the order id when present so ON CONFLICT DO NOTHING collapses repeats
  // (matches the /v1/import/orders key convention so the two paths dedupe too).
  //
  // Under this project's name for it. Keyed on the literal `order_id`, a shop calling
  // it `increment_id` found none and fell through to customer+timestamp — which only
  // dedupes while the re-sync reproduces the timestamp to the millisecond.
  const histVocab = await projectVocabulary(projectId)
  const orderId = properties[histVocab.orderIdKey] ?? properties.order_id
  const idempotencyKey =
    typeof orderId === 'string' || typeof orderId === 'number'
      ? `${eventName}_historical:${orderId}`
      : `${eventName}_historical:${customerId}:${timestamp.getTime()}`

  await db.insert(events).values({
    projectId,
    customerId,
    eventName,
    properties,
    platform: 'historical_sync',
    idempotencyKey,
    timestamp,
  }).onConflictDoNothing()
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

/** Does this payload carry an ORDER — an id, or a total, or a basket?
 *
 *  ASKED OF THE PAYLOAD, NEVER OF THE NAME.
 *
 *  This used to be a literal `case` list of four retail names. Anything outside it
 *  fell through to the default branch, so no `email` was lifted out, validation
 *  rejected the event for having "no customer identifier", and it was DROPPED —
 *  never stored, not merely unmapped.
 *
 *  It cost `order_returned` and `order_refunded` outright: both published, both sent
 *  by Shopify, neither on the list. Measured on a clean project — five order events
 *  in, three rows stored.
 *
 *  Losing the event is worse than misreading it. Everything in Storees is rebuildable
 *  precisely because the event ledger is permanent; a door that discards events breaks
 *  that guarantee, and no replay can recover what was never written.
 *
 *  A name list would only have moved the trap: whatever is not on it still vanishes.
 *  The payload already says what it is, so read that. A shop may call the event
 *  anything at all — `txn_done`, `parcel_arrived`, a word nobody has thought of — and
 *  it is still read, still stored, still recoverable. What the name MEANS is a
 *  separate question, answered later by the slots. */
function carriesAnOrder(payload: WebhookPayload): boolean {
  const p = payload as Record<string, unknown>
  return p.order_id != null || p.total != null || p.total_price != null
    || Array.isArray(p.line_items)
}

function normalizePayload(
  eventName: string, payload: WebhookPayload,
): NormalizedPayload {
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

  // Customer webhooks are matched by name because they carry no order to inspect;
  // everything else is judged by what the payload actually holds.
  const isCustomerEvent = eventName === 'customer_created' || eventName === 'customer_updated'
  switch (!isCustomerEvent && carriesAnOrder(payload) ? '__order_shaped__' : eventName) {
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

    case '__order_shaped__': {
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
        // `line_items`, not `items`: every feature that reads a basket reads this key,
        // and orders arriving by this path were storing it where nothing looks —
        // fifteen features silently empty for any Shopify-native client.
        line_items: (lineItems as Record<string, unknown>[]).map(item => {
          const f = normalizeLineItemFields(item)
          return {
            product_id: f.productId,
            product_name: f.productName,
            quantity: f.quantity,
            price: f.price,
            image_url: (item.image_url as string) ?? (item.image as Record<string, unknown>)?.src as string ?? undefined,
          }
        }),
      }
      base.timestamp = payload.created_at ? new Date(payload.created_at as string) : new Date()
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
        line_items: (cartItems as Record<string, unknown>[]).map(item => {
          const f = normalizeLineItemFields(item)
          return {
            product_id: f.productId,
            product_name: f.productName,
            quantity: f.quantity,
            price: f.price,
            image_url: (item.image_url as string) ?? (item.image as string) ?? undefined,
          }
        }),
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
  // WHAT THIS PROJECT CALLS A PURCHASE, AND WHERE IT PUTS THE ID AND THE MONEY.
  //
  // The `orders` table was written only for `order_placed` / `order_completed`, so a
  // lender's `loan_disbursed`, a course platform's `course_enrolled` and even a SaaS
  // `subscription_started` produced no order row at all — three projects with real
  // purchase events and zero rows in `orders` between them.
  //
  // That table is not a dashboard detail. Revenue tiles, the customer's order history,
  // order-based segment filters and the pipeline's cleaned rows all read it, so one
  // hardcoded name emptied four surfaces at once. The dashboard's own fallback — count
  // the events instead — filtered on the same two names, so both paths missed together.
  const vocab = await projectVocabulary(projectId)
  const isPurchaseEvent = vocab.purchaseEvents.includes(eventName)

  // Delivery and reversal dispatch through the project's slots too, not the retail
  // names alone. `isPurchaseEvent` already did; these two did not, so a source using
  // its own words got its purchases recognised and its deliveries and cancellations
  // ignored — the order row created, then frozen at `pending` for ever.
  const isFulfilmentEvent = vocab.fulfilmentEvents.includes(eventName)
  const isReversalEvent = vocab.cancellationEvents.includes(eventName)

  switch (
    isPurchaseEvent ? '__purchase__'
    : isFulfilmentEvent ? '__fulfilment__'
    : isReversalEvent ? '__reversal__'
    : eventName
  ) {
    case '__purchase__': {
      // Canonical-first per the project's own mapping, then the retail names, then
      // Shopify's raw shape — a lender sends `loan_id`/`amount`, a shop `order_id`/
      // `total`, and a Shopify webhook `id`/`total_price`.
      const externalOrderId = String(
        payload[vocab.orderIdKey] ?? payload.order_id ?? payload.id ?? '')
      const total = Number(
        payload[vocab.amountKey] ?? payload.total ?? payload.total_price ?? 0)
      const discount = Number(payload.discount ?? payload.total_discounts ?? 0)
      const currency = (payload[vocab.currencyKey] as string) ?? (payload.currency as string) ?? 'INR'
      const lineItems = (payload.line_items as Record<string, unknown>[]) ?? []

      // Dedupe atomically on the (projectId, externalOrderId) unique index — a
      // concurrent duplicate webhook must not throw (and drop the event) or
      // double-count aggregates.
      {
        const [inserted] = await db.insert(orders).values({
          projectId,
          customerId,
          externalOrderId,
          // A purchase is money committed, never a delivery.
          //
          // This read `order_completed ? 'fulfilled' : 'pending'` — the word
          // "completed" taken to mean "arrived". Two names for ONE meaning then
          // produced two different order states, decided by whichever arrived
          // first: `order_placed` first left it pending, `order_completed` first
          // marked it delivered before anything had shipped. A coin flip, not a rule.
          //
          // Delivery is the fulfilment slot's job and nothing else's.
          status: ORDER_STATUS.PENDING,
          // A webhook IS an event and is stored in the ledger, so this row is
          // rebuildable and may be replaced when the mapping changes.
          sourceEvent: eventName,
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
            ...normalizeLineItemFields(item),
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

    case '__fulfilment__': {
      // Under THIS project's order-id key, the same three-way fallback the purchase
      // branch uses. Read as the literal `order_id`, a shop naming it anything else —
      // `txn_ref`, `loan_id`, `enrollment_id` — matched no order row, so the UPDATE
      // touched nothing and the delivery or reversal was silently dropped. The purchase
      // branch had been fixed for exactly this and these two were left behind.
      const externalOrderId = String(
        payload[vocab.orderIdKey] ?? payload.order_id ?? payload.id ?? '')
      // SAME RACE AS THE REVERSAL BELOW, SAME ANSWER — with one difference.
      //
      // A delivery can also arrive before its purchase has been processed, and then
      // silently fail to mark the order fulfilled. But zero rows here has a SECOND,
      // legitimate cause: the guard below deliberately refuses to overwrite a
      // cancelled, returned or refunded order with a late delivery webhook. That is a
      // decision, not a miss, and must not be retried.
      //
      // So the two are told apart by asking whether the order exists at all. Missing
      // row: raise, and let the queue's existing retries pick it up once the purchase
      // has landed. Present but already reversed: leave it exactly as it is.
      const fulfilled = await db.update(orders).set({
        status: ORDER_STATUS.FULFILLED,
        fulfilledAt: new Date(),
      }).where(and(
        eq(orders.projectId, projectId),
        eq(orders.externalOrderId, externalOrderId),
        // A reversal already on the record is never undone by a late delivery
        // webhook. `unknown` is not a decision — it is the absence of one — so a
        // delivery may replace it; `cancelled`, `returned` and `refunded` may not.
        inArray(orders.status, ['pending', 'unknown', 'processing']),
      )).returning({ id: orders.id })
      if (fulfilled.length === 0 && externalOrderId) {
        const [prior] = await db.select({ status: orders.status }).from(orders)
          .where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId)))
          .limit(1)
        // Judge the row's STATUS, not its existence — by the time this read runs the
        // purchase may have inserted the row the UPDATE could not find, and "it exists"
        // would then be misread as "the guard refused it". A status the UPDATE above
        // would have accepted means the race was lost and nothing else.
        if (prior && ['pending', 'unknown', 'processing'].includes(prior.status)) {
          throw new Error(
            `Fulfilment '${eventName}' for order ${externalOrderId} lost a race with its `
            + `purchase (project ${projectId}) — retrying`)
        }
        if (!prior && await purchaseAwaitingProcessing(
          projectId, externalOrderId, vocab.purchaseEvents, vocab.orderIdKey,
        )) {
          throw new Error(
            `Fulfilment '${eventName}' for order ${externalOrderId} arrived before its `
            + `purchase was processed (project ${projectId}) — retrying`)
        }
      }
      break
    }

    case '__reversal__': {
      // Under THIS project's order-id key, the same three-way fallback the purchase
      // branch uses. Read as the literal `order_id`, a shop naming it anything else —
      // `txn_ref`, `loan_id`, `enrollment_id` — matched no order row, so the UPDATE
      // touched nothing and the delivery or reversal was silently dropped. The purchase
      // branch had been fixed for exactly this and these two were left behind.
      const externalOrderId = String(
        payload[vocab.orderIdKey] ?? payload.order_id ?? payload.id ?? '')

      // Which KIND of reversal, from the slots. Collapsing all three to `cancelled`
      // loses the difference between an order that never shipped and one that came
      // back — which is the whole reason they are three separate slots.
      const reversalStatus =
        vocab.refundEvents.includes(eventName) ? 'refunded'
        : vocab.returnEvents.includes(eventName) ? 'returned'
        : 'cancelled'

      // A REVERSAL THAT MATCHES NO ORDER HAS NOT BEEN APPLIED — SAY SO.
      //
      // Aggregate jobs run eight at a time, so an order and its cancellation can be
      // processed in the same instant by different workers. When the reversal wins that
      // race the order row does not exist yet, this UPDATE touches zero rows, and the
      // cancellation is lost in silence: the order stays a live sale for ever.
      //
      // Measured on a 760-customer import: of 68 reversals, 24 applied and 44 did not —
      // and a second project fed byte-identical data lost a DIFFERENT 44, which is the
      // signature of a race rather than a rule. Revenue read Rs2,154,720 against a true
      // Rs1,975,087.
      //
      // The queue already carries `attempts: 5` with exponential backoff and has never
      // used them here, because zero rows updated looked like success. Raising it hands
      // the job back to that machinery: a second later the purchase has landed and the
      // retry applies cleanly. A reversal for an order that genuinely does not exist
      // exhausts its attempts and lands in the failed set, where it can be seen — the
      // right outcome for a reversal with no sale behind it.
      const reversed = await db.update(orders).set({
        status: reversalStatus,
      }).where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, externalOrderId)))
        .returning({ id: orders.id })
      if (reversed.length === 0 && externalOrderId && await purchaseAwaitingProcessing(
        projectId, externalOrderId, vocab.purchaseEvents, vocab.orderIdKey,
      )) {
        throw new Error(
          `Reversal '${eventName}' for order ${externalOrderId} arrived before its purchase `
          + `was processed (project ${projectId}) — retrying`)
      }

      await recalculateAggregates(customerId)
      break
    }
  }
}

function buildName(first?: string, last?: string): string | null {
  const parts = [first, last].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}
