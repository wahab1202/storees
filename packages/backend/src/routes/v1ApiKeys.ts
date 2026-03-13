import { Router } from 'express'
import { db } from '../db/connection.js'
import { apiKeys, projects, events } from '../db/schema.js'
import { eq, and, desc, sql } from 'drizzle-orm'
import { generateApiKeyPair } from '../middleware/apiKeyAuth.js'
import { requireProjectId } from '../middleware/projectId.js'

const router = Router()

// All routes need projectId (admin panel routes, not API key auth)
router.use(requireProjectId)

/**
 * POST /api/api-keys — Generate a new API key pair for a project
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body as { name?: string }
    const { keyPublic, keySecret, keySecretHash } = generateApiKeyPair()

    const [key] = await db.insert(apiKeys).values({
      projectId: req.projectId!,
      name: name?.trim() || 'Default',
      keyPublic,
      keySecretHash,
      permissions: ['read', 'write'],
      rateLimit: 1000,
    }).returning()

    // Return the secret ONCE — it cannot be retrieved again
    res.status(201).json({
      success: true,
      data: {
        id: key.id,
        name: key.name,
        key_public: keyPublic,
        key_secret: keySecret, // shown once!
        permissions: key.permissions,
        rate_limit: key.rateLimit,
        created_at: key.createdAt,
        warning: 'Save the key_secret now. It cannot be retrieved again.',
      },
    })
  } catch (err) {
    console.error('API key create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create API key' })
  }
})

/**
 * GET /api/api-keys — List API keys for a project (secrets not included)
 */
router.get('/', async (req, res) => {
  try {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPublic: apiKeys.keyPublic,
        permissions: apiKeys.permissions,
        rateLimit: apiKeys.rateLimit,
        isActive: apiKeys.isActive,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.projectId, req.projectId!))
      .orderBy(desc(apiKeys.createdAt))

    res.json({ success: true, data: keys })
  } catch (err) {
    console.error('API key list error:', err)
    res.status(500).json({ success: false, error: 'Failed to list API keys' })
  }
})

/**
 * DELETE /api/api-keys/:id — Revoke an API key
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id as string

    const [key] = await db
      .select({ projectId: apiKeys.projectId })
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1)

    if (!key || key.projectId !== req.projectId) {
      return res.status(404).json({ success: false, error: 'API key not found' })
    }

    await db.update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.id, id))

    res.json({ success: true, data: { message: 'API key revoked' } })
  } catch (err) {
    console.error('API key revoke error:', err)
    res.status(500).json({ success: false, error: 'Failed to revoke API key' })
  }
})

/**
 * GET /api/api-keys/sdk-config — Get SDK configuration for the settings page
 * Returns public API key, API URL, domain type, and connection status
 */
router.get('/sdk-config', async (req, res) => {
  try {
    const projectId = req.projectId!

    // Get active API key (public only)
    const [key] = await db
      .select({ keyPublic: apiKeys.keyPublic })
      .from(apiKeys)
      .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.isActive, true)))
      .orderBy(desc(apiKeys.createdAt))
      .limit(1)

    // Get project domain type
    const [project] = await db
      .select({ domainType: projects.domainType })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    // Check if any SDK events have been received
    const sdkEventResult = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM events
        WHERE project_id = ${projectId} AND source = 'sdk'
        LIMIT 1
      ) AS has_sdk_events
    `)
    const hasSdkEvents = (sdkEventResult.rows[0] as Record<string, boolean>).has_sdk_events

    res.json({
      success: true,
      data: {
        apiKey: key?.keyPublic ?? null,
        apiUrl: process.env.APP_URL ?? 'http://localhost:3001',
        domainType: (project?.domainType as string) ?? 'custom',
        sdkConnected: hasSdkEvents,
      },
    })
  } catch (err) {
    console.error('SDK config error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch SDK config' })
  }
})

export default router
