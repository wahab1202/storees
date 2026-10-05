import { Router } from 'express'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects, customers, events, orders } from '../db/schema.js'
import { verifyHmac } from '../services/shopifyService.js'
import { processWebhookEvent } from '../services/eventProcessor.js'
import { handleProductWebhook, handleCollectionWebhook } from '../services/catalogService.js'
import { redis } from '../services/redis.js'

const router = Router()

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET ?? process.env.SHOPIFY_CLIENT_SECRET ?? ''
const WEBHOOK_DEDUP_TTL = 86400 // 24 hours
const WEBHOOK_DEDUP_PREFIX = 'shopify-webhook:'
const DLQ_PREFIX = 'shopify-dlq:'

// Shopify webhook topic → standard event name mapping (customer-scoped events only)
const TOPIC_EVENT_MAP: Record<string, string> = {
  'customers/create': 'customer_created',
  'customers/update': 'customer_updated',
  'orders/create': 'order_placed',
  'orders/fulfilled': 'order_fulfilled',
  'orders/cancelled': 'order_cancelled',
  'checkouts/create': 'checkout_started',
  'carts/create': 'cart_created',
  'carts/update': 'cart_updated',
}

// Catalog topics route to a different handler (no customer identity, no event row)
const CATALOG_PRODUCT_TOPICS = new Set(['products/create', 'products/update', 'products/delete'])
const CATALOG_COLLECTION_TOPICS = new Set(['collections/create', 'collections/update', 'collections/delete'])

// POST /api/webhooks/shopify/:projectId
// Body is raw Buffer (parsed by express.raw() in index.ts)
router.post('/shopify/:projectId', async (req, res) => {
  const { projectId } = req.params
  const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string
  const topic = req.headers['x-shopify-topic'] as string
  const webhookId = req.headers['x-shopify-webhook-id'] as string | undefined
  const rawBody = req.body as Buffer

  if (!hmacHeader || !topic) {
    res.status(400).json({ success: false, error: 'Missing Shopify headers' })
    return
  }

  try {
    // Idempotency check — skip if we've already processed this webhook
    if (webhookId) {
      const dedupKey = `${WEBHOOK_DEDUP_PREFIX}${webhookId}`
      const alreadyProcessed = await redis.set(dedupKey, '1', 'EX', WEBHOOK_DEDUP_TTL, 'NX')
      if (!alreadyProcessed) {
        console.log(`Duplicate webhook skipped: ${webhookId} (${topic})`)
        res.status(200).json({ success: true })
        return
      }
    }

    // Look up project for webhook secret
    const [project] = await db
      .select({ webhookSecret: projects.webhookSecret })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project?.webhookSecret) {
      res.status(404).json({ success: false, error: 'Project not found' })
      return
    }

    // HMAC verification — uses raw body before JSON parse
    if (!verifyHmac(rawBody, hmacHeader, project.webhookSecret)) {
      console.error(`HMAC verification failed for project ${projectId}, topic ${topic}`)
      res.status(401).json({ success: false, error: 'HMAC verification failed' })
      return
    }

    // Parse JSON from raw body
    const payload = JSON.parse(rawBody.toString('utf-8'))

    // Catalog webhooks (products/*, collections/*) take a different path — no
    // customer identity, no events row, just upsert/archive the catalog table.
    if (CATALOG_PRODUCT_TOPICS.has(topic) || CATALOG_COLLECTION_TOPICS.has(topic)) {
      console.log(`Catalog webhook received: ${topic} for project ${projectId}`)
      res.status(200).json({ success: true })

      const handler = CATALOG_PRODUCT_TOPICS.has(topic)
        ? handleProductWebhook(projectId, topic, payload)
        : handleCollectionWebhook(projectId, topic, payload)

      handler.catch(err => {
        console.error(`Catalog webhook processing failed for ${topic}:`, err)
        const dlqEntry = JSON.stringify({
          webhookId,
          projectId,
          topic,
          error: err instanceof Error ? err.message : String(err),
          payload,
          failedAt: new Date().toISOString(),
        })
        redis.lpush(`${DLQ_PREFIX}${projectId}`, dlqEntry).catch(() => {})
        redis.ltrim(`${DLQ_PREFIX}${projectId}`, 0, 999).catch(() => {})
      })
      return
    }

    // SHIPMENT TRACKING → DELIVERED.
    //
    // Shopify has no "order delivered" topic. Delivery arrives as a fulfillment event —
    // the courier's tracking update — and only some of those mean the customer has it.
    // They also carry no customer at all, just the order id, so on their own they are
    // dropped like any event Storees cannot tie to a person. The order is already known
    // here, so the customer is read from it and the update goes on as a delivery.
    if (topic === 'fulfillment_events/create') {
      res.status(200).json({ success: true })
      const delivery = await deliveryFromTracking(projectId, payload)
      if (!delivery) return
      console.log(`Webhook received: ${topic} (${payload.status}) → order_delivered for project ${projectId}`)
      processWebhookEvent(projectId, 'order_delivered', delivery).catch(err => {
        console.error('Async event processing failed for order_delivered:', err)
        const dlqEntry = JSON.stringify({ webhookId, projectId, topic, eventName: 'order_delivered',
          error: err instanceof Error ? err.message : String(err), payload, failedAt: new Date().toISOString() })
        redis.lpush(`${DLQ_PREFIX}${projectId}`, dlqEntry).catch(() => {})
        redis.ltrim(`${DLQ_PREFIX}${projectId}`, 0, 999).catch(() => {})
      })
      return
    }

    // A REFUND, as the reversal it is.
    //
    // Shopify will not cancel an order that has been paid; the shop refunds it instead.
    // Storees never subscribed to refunds, so a refunded order kept counting as revenue
    // and never read "Refunded". Like tracking updates, a refund names the order but not
    // the customer, so the customer is read from the order Storees already holds.
    if (topic === 'refunds/create') {
      res.status(200).json({ success: true })
      const refund = await reversalFromRefund(projectId, payload)
      if (!refund) return
      console.log(`Webhook received: ${topic} → order_refunded for project ${projectId}`)
      processWebhookEvent(projectId, 'order_refunded', refund).catch(err => {
        console.error('Async event processing failed for order_refunded:', err)
        const dlqEntry = JSON.stringify({ webhookId, projectId, topic, eventName: 'order_refunded',
          error: err instanceof Error ? err.message : String(err), payload, failedAt: new Date().toISOString() })
        redis.lpush(`${DLQ_PREFIX}${projectId}`, dlqEntry).catch(() => {})
        redis.ltrim(`${DLQ_PREFIX}${projectId}`, 0, 999).catch(() => {})
      })
      return
    }

    // Map topic to standard customer-scoped event name
    const eventName = TOPIC_EVENT_MAP[topic]
    if (!eventName) {
      console.warn(`Unknown webhook topic: ${topic}`)
      res.status(200).json({ success: true })
      return
    }

    console.log(`Webhook received: ${topic} → ${eventName} for project ${projectId}`)

    // Respond 200 quickly — Shopify retries if response takes > 5 seconds
    res.status(200).json({ success: true })

    // Process asynchronously after responding
    processWebhookEvent(projectId, eventName, payload).catch(err => {
      console.error(`Async event processing failed for ${eventName}:`, err)
      // Dead letter queue — store failed events in Redis for manual inspection
      const dlqEntry = JSON.stringify({
        webhookId,
        projectId,
        topic,
        eventName,
        error: err instanceof Error ? err.message : String(err),
        payload,
        failedAt: new Date().toISOString(),
      })
      redis.lpush(`${DLQ_PREFIX}${projectId}`, dlqEntry).catch(() => {})
      redis.ltrim(`${DLQ_PREFIX}${projectId}`, 0, 999).catch(() => {}) // keep last 1000
    })
  } catch (err) {
    console.error('Webhook processing error:', err)
    // Still return 200 to prevent Shopify retries on our errors
    res.status(200).json({ success: true })
  }
})

// ── GDPR compliance webhooks ──
// Shopify requires these three endpoints. They use the app-level API secret for HMAC.

router.post('/shopify/compliance', async (req, res) => {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string
  const topic = req.headers['x-shopify-topic'] as string
  const rawBody = req.body as Buffer

  if (!hmacHeader || !SHOPIFY_API_SECRET) {
    res.status(401).json({ success: false, error: 'Missing HMAC or API secret' })
    return
  }

  // Verify HMAC using the app's API secret (not per-project webhook secret)
  if (!verifyHmac(rawBody, hmacHeader, SHOPIFY_API_SECRET)) {
    console.error('GDPR webhook HMAC verification failed')
    res.status(401).json({ success: false, error: 'HMAC verification failed' })
    return
  }

  const payload = JSON.parse(rawBody.toString('utf-8'))

  try {
    switch (topic) {
      case 'customers/data_request': {
        // Shopify asks: "what data do you have for this customer?"
        // Log the request — actual data export would be manual/async
        const { shop_domain, customer } = payload
        console.log(`[GDPR] Data request for customer ${customer?.email} from ${shop_domain}`)
        // In production: queue a job to compile and email the data export
        break
      }

      case 'customers/redact': {
        // Shopify says: "delete this customer's data"
        const { shop_domain, customer } = payload
        const email = customer?.email
        console.log(`[GDPR] Customer redact request for ${email} from ${shop_domain}`)

        if (email) {
          // Find the project for this shop
          const [project] = await db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.shopifyDomain, shop_domain))
            .limit(1)

          if (project) {
            // Find and anonymize the customer
            const [cust] = await db
              .select({ id: customers.id })
              .from(customers)
              .where(and(eq(customers.projectId, project.id), eq(customers.email, email)))
              .limit(1)

            if (cust) {
              // Anonymize customer data (keep row for referential integrity)
              await db.update(customers).set({
                email: null,
                phone: null,
                name: 'Redacted',
                customAttributes: {},
                updatedAt: new Date(),
              }).where(eq(customers.id, cust.id))

              console.log(`[GDPR] Customer ${email} data redacted in project ${project.id}`)
            }
          }
        }
        break
      }

      case 'shop/redact': {
        // Shopify says: "merchant uninstalled, delete all their data"
        const { shop_domain } = payload
        console.log(`[GDPR] Shop redact request for ${shop_domain}`)

        // Clear the Shopify connection (don't delete the project — they may reconnect)
        await db.update(projects).set({
          shopifyAccessToken: null,
          webhookSecret: null,
          updatedAt: new Date(),
        }).where(eq(projects.shopifyDomain, shop_domain))

        console.log(`[GDPR] Shop ${shop_domain} credentials cleared`)
        break
      }

      default:
        console.warn(`[GDPR] Unknown compliance topic: ${topic}`)
    }
  } catch (err) {
    console.error('[GDPR] Compliance webhook error:', err)
  }

  // Always return 200 to Shopify
  res.status(200).json({ success: true })
})

/**
 * A Shopify refund, as a reversal Storees can process — or null.
 *
 * FULL refunds only. Storees holds one status per order and has no notion of a part
 * refund; marking a partly refunded order "refunded" would take its whole value off the
 * books to settle a fraction of it. Counting it in full is the smaller error, and it is
 * the same rule the history pull applies (`partially_refunded` is not a reversal there).
 */
async function reversalFromRefund(
  projectId: string, refund: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const orderId = refund.order_id != null ? String(refund.order_id) : ''
  if (!orderId) return null

  const [row] = await db
    .select({ total: orders.total, externalId: customers.externalId, email: customers.email, phone: customers.phone })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, orderId)))
    .limit(1)
  if (!row) {
    console.warn(`[shopify] refund for order ${orderId} not recorded — Storees has no such order (project ${projectId})`)
    return null
  }

  // What actually went back: the successful refund transactions.
  const refunded = ((refund.transactions as Array<Record<string, unknown>>) ?? [])
    .filter(t => String(t.kind) === 'refund' && String(t.status) === 'success')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  const total = Number(row.total)
  if (!(refunded > 0) || refunded + 0.005 < total) {
    console.log(`[shopify] refund of ${refunded} on order ${orderId} (total ${total}) is partial — order still counts`)
    return null
  }

  return {
    order_id: orderId,
    total,
    refunded_at: refund.processed_at ?? refund.created_at,
    customer: { id: row.externalId, email: row.email, phone: row.phone },
  }
}

/** Courier statuses that mean the customer now has the parcel. `picked_up` is the
 *  customer collecting it themselves (local pickup). Everything else — in transit, out for
 *  delivery, a failed attempt — is not delivery and is not turned into one. */
const DELIVERED_TRACKING_STATUSES = new Set(['delivered', 'picked_up'])

/**
 * A Shopify tracking update, as a delivery event Storees can process — or null.
 *
 * Null when it is not a delivery, or when Storees has no such order (it cannot know whose
 * parcel it is). The customer comes from the order row; the moment comes from the courier
 * (`happened_at`), carried as `delivered_at` so the order's delivered date is when it
 * arrived, not when this message did.
 */
async function deliveryFromTracking(
  projectId: string, tracking: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const status = String(tracking.status ?? '').toLowerCase()
  if (!DELIVERED_TRACKING_STATUSES.has(status)) return null
  const orderId = tracking.order_id != null ? String(tracking.order_id) : ''
  if (!orderId) return null

  const [row] = await db
    .select({ externalId: customers.externalId, email: customers.email, phone: customers.phone })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.projectId, projectId), eq(orders.externalOrderId, orderId)))
    .limit(1)
  if (!row) {
    console.warn(`[shopify] delivery for order ${orderId} not recorded — Storees has no such order (project ${projectId})`)
    return null
  }

  return {
    order_id: orderId,
    fulfillment_id: tracking.fulfillment_id,
    delivery_status: 'delivered',
    delivered_at: tracking.happened_at ?? tracking.created_at,
    customer: { id: row.externalId, email: row.email, phone: row.phone },
  }
}

export default router

