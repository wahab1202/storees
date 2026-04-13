import { Router } from 'express'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects, customers, events, orders } from '../db/schema.js'
import { verifyHmac } from '../services/shopifyService.js'
import { processWebhookEvent } from '../services/eventProcessor.js'

const router = Router()

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET ?? ''

// Shopify webhook topic → standard event name mapping
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

// POST /api/webhooks/shopify/:projectId
// Body is raw Buffer (parsed by express.raw() in index.ts)
router.post('/shopify/:projectId', async (req, res) => {
  const { projectId } = req.params
  const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string
  const topic = req.headers['x-shopify-topic'] as string
  const rawBody = req.body as Buffer

  if (!hmacHeader || !topic) {
    res.status(400).json({ success: false, error: 'Missing Shopify headers' })
    return
  }

  try {
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

    // Map topic to standard event name
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
    })
  } catch (err) {
    console.error('Webhook processing error:', err)
    // Still return 200 to prevent Shopify retries on our errors
    // Log to dead_letter for manual inspection
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

export default router
