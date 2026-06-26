import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects, adminUsers, oauthAccounts } from '../db/schema.js'
import { shopifySyncQueue } from '../services/queue.js'
import {
  getInstallUrl,
  exchangeCodeForToken,
  verifyOAuthHmac,
  registerWebhooks,
  generateNonce,
  generateWebhookSecret,
  getCallbackRedirectUrl,
  getCallbackErrorUrl,
  fetchShopInfo,
  mintShopifyToken,
} from '../services/shopifyService.js'
import { encrypt } from '../services/encryption.js'
import { redis } from '../services/redis.js'
import { generateJwt, jwtPayloadFrom } from '../services/authService.js'
import { requireAuth } from '../middleware/requireAuth.js'
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
      res.redirect(getCallbackErrorUrl('Invalid or expired state parameter'))
      return
    }
    await redis.del(`${NONCE_PREFIX}${state}`)

    // Verify HMAC
    if (!verifyOAuthHmac(req.query as Record<string, string>)) {
      res.redirect(getCallbackErrorUrl('HMAC verification failed'))
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

    // Fetch shop owner info to auto-create admin account
    const shopInfo = await fetchShopInfo(shop, accessToken)
    const ownerEmail = shopInfo.email.toLowerCase()

    // Find or create admin user for the shop owner
    const [existingUser] = await db
      .select({ id: adminUsers.id, projectId: adminUsers.projectId })
      .from(adminUsers)
      .where(eq(adminUsers.email, ownerEmail))
      .limit(1)

    let userId: string

    if (existingUser) {
      userId = existingUser.id
      // Link user to this project if they don't have one yet
      if (!existingUser.projectId) {
        await db.update(adminUsers).set({ projectId, updatedAt: new Date() }).where(eq(adminUsers.id, userId))
      }
    } else {
      // Auto-register the shop owner as an admin user (no password — Shopify-authed)
      const [newUser] = await db.insert(adminUsers).values({
        email: ownerEmail,
        name: shopInfo.shopOwner || shop.replace('.myshopify.com', ''),
        projectId,
        emailVerified: true,
      }).returning({ id: adminUsers.id })
      userId = newUser.id
    }

    // Link Shopify as an OAuth provider
    const [existingOauth] = await db
      .select({ id: oauthAccounts.id })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerAccountId, shop))
      .limit(1)

    if (!existingOauth) {
      await db.insert(oauthAccounts).values({
        userId,
        provider: 'shopify',
        providerAccountId: shop,
      })
    }

    // Generate JWT so the merchant is logged in immediately.
    // Shopify auto-install always creates an admin-role user, so role defaults apply.
    const token = generateJwt(jwtPayloadFrom({ id: userId, email: ownerEmail, projectId }))

    res.redirect(getCallbackRedirectUrl(token, projectId))
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.redirect(getCallbackErrorUrl('Connection failed — please try again'))
  }
})

/** Normalize a pasted store domain → bare `*.myshopify.com` (strip scheme/path). */
function normalizeShopDomain(input: string): string {
  return input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

// POST /api/integrations/shopify/connect — custom-distribution app (client_credentials).
// The LIVE-store path: no OAuth redirect. The body carries the app's client_id +
// secret; we mint a token (which validates the creds + that the app is installed),
// store them encrypted on the project, register webhooks, and kick off the sync.
router.post('/shopify/connect', requireAuth, async (req, res) => {
  try {
    const { shop: rawShop, client_id, client_secret } = req.body as { shop?: string; client_id?: string; client_secret?: string }
    const shop = normalizeShopDomain(rawShop ?? '')
    if (!shop.endsWith('.myshopify.com')) {
      return res.status(400).json({ success: false, error: 'Enter a valid *.myshopify.com store domain' })
    }
    if (!client_id?.trim() || !client_secret?.trim()) {
      return res.status(400).json({ success: false, error: 'Client ID and client secret are required' })
    }

    // Mint a token — validates the credentials AND that the app is installed.
    const minted = await mintShopifyToken(shop, client_id.trim(), client_secret.trim())
    const tokenExpiresAt = new Date(Date.now() + minted.expiresInSec * 1000).toISOString()

    // Target project: an existing one already bound to this shop (re-connect),
    // else the caller's current workspace. shopify_domain is unique.
    // requireAuth populates req.query.projectId from the caller's JWT.
    const callerProjectId = req.query.projectId as string | undefined
    const [bound] = await db.select({ id: projects.id }).from(projects).where(eq(projects.shopifyDomain, shop)).limit(1)
    const projectId = bound?.id ?? callerProjectId
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'No workspace to attach the store to' })
    }

    const [target] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, projectId)).limit(1)
    const baseSettings = (target?.settings ?? {}) as Record<string, unknown>

    await db.update(projects).set({
      shopifyDomain: shop,
      shopifyAccessToken: encrypt(minted.accessToken),
      integrationType: 'shopify',
      // Webhooks registered via the Admin API are signed with the app secret, so
      // the webhook receiver verifies HMAC against it.
      webhookSecret: client_secret.trim(),
      settings: { ...baseSettings, shopifyCustomApp: { clientId: client_id.trim(), clientSecret: encrypt(client_secret.trim()), tokenExpiresAt } },
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId))

    // Register webhooks (non-fatal — historical sync still proceeds without them).
    try { await registerWebhooks(shop, minted.accessToken, projectId) } catch (e) {
      console.warn('[shopify/connect] webhook registration failed:', (e as Error).message)
    }

    // Kick off the historical sync (reuses the existing Shopify sync worker).
    await shopifySyncQueue.add('sync', { projectId })

    res.json({ success: true, data: { projectId, shop, status: 'connected' } })
  } catch (err) {
    console.error('Shopify connect error:', err)
    res.status(400).json({ success: false, error: (err as Error).message || 'Connection failed' })
  }
})

// POST /api/integrations/shopify/disconnect?projectId=...
// Clears the Shopify connection from the active project so the store can be
// connected to a different project (the domain is unique per project).
router.post('/shopify/disconnect', requireAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined
    if (!projectId) return res.status(400).json({ success: false, error: 'No active project' })
    const [p] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, projectId)).limit(1)
    const settings = { ...((p?.settings ?? {}) as Record<string, unknown>) }
    delete settings.shopifyCustomApp
    await db.update(projects).set({
      shopifyDomain: null,
      shopifyAccessToken: null,
      webhookSecret: null,
      settings,
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId))
    res.json({ success: true })
  } catch (err) {
    console.error('Shopify disconnect error:', err)
    res.status(500).json({ success: false, error: 'Failed to disconnect' })
  }
})

// POST /api/integrations/shopify/sync?projectId=...
// Manually trigger a re-sync of Shopify data
router.post('/shopify/sync', requireAuth, async (req, res) => {
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
router.get('/shopify/sync-status', requireAuth, async (req, res) => {
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
router.get('/shopify/status', requireAuth, async (req, res) => {
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
