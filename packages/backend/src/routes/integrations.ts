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
import { encrypt } from '../services/encryption.js'
import { redis } from '../services/redis.js'
import { instantiateDefaultSegments } from '../services/segmentService.js'
import { instantiateDefaultFlows } from '../services/flowService.js'

const router = Router()

const NONCE_TTL = 600 // 10 minutes
const NONCE_PREFIX = 'shopify-nonce:'

// GET /api/integrations/shopify/install?shop=mystore.myshopify.com
router.get('/shopify/install', async (req, res) => {
  const shop = req.query.shop as string

  if (!shop || !shop.endsWith('.myshopify.com')) {
    res.status(400).json({ success: false, error: 'Valid shop domain required (e.g., mystore.myshopify.com)' })
    return
  }

  const nonce = generateNonce()
  await redis.set(`${NONCE_PREFIX}${nonce}`, shop, 'EX', NONCE_TTL)

  const installUrl = getInstallUrl(shop, nonce)
  res.redirect(installUrl)
})

// GET /api/integrations/shopify/callback?code=...&hmac=...&shop=...&state=...
router.get('/shopify/callback', async (req, res) => {
  try {
    const { code, shop, state } = req.query as Record<string, string>

    // Verify state nonce from Redis
    const storedShop = await redis.get(`${NONCE_PREFIX}${state}`)
    if (!storedShop || storedShop !== shop) {
      res.status(400).json({ success: false, error: 'Invalid or expired state parameter' })
      return
    }
    await redis.del(`${NONCE_PREFIX}${state}`)

    // Verify HMAC
    if (!verifyOAuthHmac(req.query as Record<string, string>)) {
      res.status(401).json({ success: false, error: 'HMAC verification failed' })
      return
    }

    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(shop, code)
    const webhookSecret = generateWebhookSecret()
    const encryptedToken = encrypt(accessToken)

    // Upsert project
    const existing = await db.select().from(projects).where(eq(projects.shopifyDomain, shop)).limit(1)

    let projectId: string

    if (existing.length > 0) {
      projectId = existing[0].id
      await db.update(projects).set({
        shopifyAccessToken: encryptedToken,
        webhookSecret,
        updatedAt: new Date(),
      }).where(eq(projects.id, projectId))
    } else {
      const [created] = await db.insert(projects).values({
        name: shop.replace('.myshopify.com', ''),
        shopifyDomain: shop,
        shopifyAccessToken: encryptedToken,
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

// POST /api/integrations/shopify/sync?projectId=...
// Manually trigger a re-sync of Shopify data
router.post('/shopify/sync', async (req, res) => {
  const projectId = req.query.projectId as string
  if (!projectId) {
    res.status(400).json({ success: false, error: 'projectId is required' })
    return
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project?.shopifyAccessToken || !project.shopifyDomain) {
    res.status(400).json({ success: false, error: 'Project not connected to Shopify' })
    return
  }

  // Check if a sync is already running
  const existingJobs = await shopifySyncQueue.getJobs(['active', 'waiting'])
  const alreadyRunning = existingJobs.some(j => j.data?.projectId === projectId)

  if (alreadyRunning) {
    res.status(409).json({ success: false, error: 'Sync already in progress' })
    return
  }

  const job = await shopifySyncQueue.add('sync', { projectId })

  res.json({
    success: true,
    data: { jobId: job.id, status: 'queued' },
  })
})

// GET /api/integrations/shopify/sync-status?projectId=...
// Check progress of the most recent sync job
router.get('/shopify/sync-status', async (req, res) => {
  const projectId = req.query.projectId as string
  if (!projectId) {
    res.status(400).json({ success: false, error: 'projectId is required' })
    return
  }

  // Check active/waiting jobs first
  const jobs = await shopifySyncQueue.getJobs(['active', 'waiting', 'completed', 'failed'])
  const projectJobs = jobs
    .filter(j => j.data?.projectId === projectId)
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

  const latest = projectJobs[0]

  if (!latest) {
    res.json({
      success: true,
      data: { status: 'none', message: 'No sync jobs found' },
    })
    return
  }

  const state = await latest.getState()
  const progress = latest.progress as Record<string, unknown> | undefined
  const returnValue = latest.returnvalue as Record<string, unknown> | undefined

  res.json({
    success: true,
    data: {
      jobId: latest.id,
      status: state,
      progress: progress ?? null,
      result: state === 'completed' ? returnValue : null,
      failedReason: state === 'failed' ? latest.failedReason : null,
    },
  })
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
