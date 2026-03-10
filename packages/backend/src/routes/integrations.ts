import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { shopifySyncQueue } from '../services/queue.js'
import {
  getInstallUrl,
  exchangeCodeForToken,
  verifyOAuthHmac,
  registerWebhooks,
  generateNonce,
  generateWebhookSecret,
  getCallbackRedirectUrl,
} from '../services/shopifyService.js'
import { instantiateDefaultSegments } from '../services/segmentService.js'
import { instantiateDefaultFlows } from '../services/flowService.js'

const router = Router()

// In-memory nonce store. TODO: move to Redis with 10-min TTL
const nonceStore = new Map<string, { shop: string; expiresAt: number }>()

// GET /api/integrations/shopify/install?shop=mystore.myshopify.com
router.get('/shopify/install', (req, res) => {
  const shop = req.query.shop as string

  if (!shop || !shop.endsWith('.myshopify.com')) {
    res.status(400).json({ success: false, error: 'Valid shop domain required (e.g., mystore.myshopify.com)' })
    return
  }

  const nonce = generateNonce()
  nonceStore.set(nonce, { shop, expiresAt: Date.now() + 10 * 60 * 1000 })

  const installUrl = getInstallUrl(shop, nonce)
  res.redirect(installUrl)
})

// GET /api/integrations/shopify/callback?code=...&hmac=...&shop=...&state=...
router.get('/shopify/callback', async (req, res) => {
  try {
    const { code, shop, state } = req.query as Record<string, string>

    // Verify state nonce
    const stored = nonceStore.get(state)
    if (!stored || stored.shop !== shop || stored.expiresAt < Date.now()) {
      res.status(400).json({ success: false, error: 'Invalid or expired state parameter' })
      return
    }
    nonceStore.delete(state)

    // Verify HMAC
    if (!verifyOAuthHmac(req.query as Record<string, string>)) {
      res.status(401).json({ success: false, error: 'HMAC verification failed' })
      return
    }

    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(shop, code)
    const webhookSecret = generateWebhookSecret()

    // Upsert project
    const existing = await db.select().from(projects).where(eq(projects.shopifyDomain, shop)).limit(1)

    let projectId: string

    if (existing.length > 0) {
      projectId = existing[0].id
      await db.update(projects).set({
        shopifyAccessToken: accessToken,
        webhookSecret,
        updatedAt: new Date(),
      }).where(eq(projects.id, projectId))
    } else {
      const [created] = await db.insert(projects).values({
        name: shop.replace('.myshopify.com', ''),
        shopifyDomain: shop,
        shopifyAccessToken: accessToken,
        businessType: 'ecommerce',
        webhookSecret,
      }).returning()
      projectId = created.id
    }

    // Register webhooks
    await registerWebhooks(shop, accessToken, projectId)

    // Create default segments and flows
    await instantiateDefaultSegments(projectId)
    await instantiateDefaultFlows(projectId)

    // Trigger historical sync
    await shopifySyncQueue.add('sync', { projectId })

    res.redirect(getCallbackRedirectUrl(true))
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.redirect(getCallbackRedirectUrl(false))
  }
})

// GET /api/integrations/shopify/status?projectId=...
router.get('/shopify/status', async (req, res) => {
  const projectId = req.query.projectId as string
  if (!projectId) {
    res.status(400).json({ success: false, error: 'projectId is required' })
    return
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found' })
    return
  }

  res.json({
    success: true,
    data: {
      connected: !!project.shopifyAccessToken,
      shopifyDomain: project.shopifyDomain,
    },
  })
})

export default router
