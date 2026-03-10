import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { verifyHmac } from '../services/shopifyService.js'
import { processWebhookEvent } from '../services/eventProcessor.js'

const router = Router()

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

export default router
