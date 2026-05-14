import { Router } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { adConversionDestinations } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { encrypt } from '../services/encryption.js'
import { testRelay } from '../services/conversionApiService.js'

// Gap 9: admin endpoints for managing ad-platform Conversion API
// destinations. Onboarding configures them once in Settings → Ad
// Conversions; the relay path fires automatically from
// customerAggregateWorker whenever an order_placed lands.

const router = Router()

router.get('/', requireProjectId, async (req, res) => {
  const rows = await db
    .select({
      id: adConversionDestinations.id,
      platform: adConversionDestinations.platform,
      name: adConversionDestinations.name,
      pixelId: adConversionDestinations.pixelId,
      testEventCode: adConversionDestinations.testEventCode,
      status: adConversionDestinations.status,
      eventsSent: adConversionDestinations.eventsSent,
      eventsFailed: adConversionDestinations.eventsFailed,
      lastSentAt: adConversionDestinations.lastSentAt,
      lastError: adConversionDestinations.lastError,
      lastErrorAt: adConversionDestinations.lastErrorAt,
      createdAt: adConversionDestinations.createdAt,
      updatedAt: adConversionDestinations.updatedAt,
    })
    .from(adConversionDestinations)
    .where(eq(adConversionDestinations.projectId, req.projectId!))
    .orderBy(desc(adConversionDestinations.createdAt))
  res.json({ success: true, data: rows })
})

router.post('/', requireProjectId, async (req, res) => {
  try {
    const { platform, name, pixelId, accessToken, testEventCode } = req.body as {
      platform?: string
      name?: string
      pixelId?: string
      accessToken?: string
      testEventCode?: string | null
    }

    if (!platform || !['meta', 'google', 'tiktok', 'snap'].includes(platform)) {
      return res.status(400).json({ success: false, error: 'platform must be meta | google | tiktok | snap' })
    }
    if (!name?.trim() || !pixelId?.trim() || !accessToken?.trim()) {
      return res.status(400).json({ success: false, error: 'name, pixelId, accessToken required' })
    }

    const [inserted] = await db
      .insert(adConversionDestinations)
      .values({
        projectId: req.projectId!,
        platform,
        name: name.trim(),
        pixelId: pixelId.trim(),
        accessToken: encrypt(accessToken.trim()),
        testEventCode: testEventCode?.trim() || null,
        status: 'active',
      })
      .returning({ id: adConversionDestinations.id })
    res.json({ success: true, data: { id: inserted.id } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.patch('/:id', requireProjectId, async (req, res) => {
  const { name, accessToken, testEventCode, status } = req.body as {
    name?: string
    accessToken?: string
    testEventCode?: string | null
    status?: string
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (name != null) updates.name = name
  if (accessToken != null) updates.accessToken = encrypt(accessToken)
  if (testEventCode !== undefined) updates.testEventCode = testEventCode?.trim() || null
  if (status != null) updates.status = status

  await db
    .update(adConversionDestinations)
    .set(updates)
    .where(and(
      eq(adConversionDestinations.id, req.params.id as string),
      eq(adConversionDestinations.projectId, req.projectId!),
    ))
  res.json({ success: true })
})

router.delete('/:id', requireProjectId, async (req, res) => {
  await db
    .delete(adConversionDestinations)
    .where(and(
      eq(adConversionDestinations.id, req.params.id as string),
      eq(adConversionDestinations.projectId, req.projectId!),
    ))
  res.json({ success: true })
})

// Fires a synthetic order_placed at the configured destination so the
// onboarding team can verify the event reaches the platform's Events
// Manager before going live. Uses the first real customer in the
// project so the hashed identifiers actually match something.
router.post('/:id/test', requireProjectId, async (req, res) => {
  try {
    await testRelay(req.params.id as string, req.projectId!)
    res.json({ success: true, data: { message: 'Test event sent — check the platform\'s Events Manager debug view in ~30s' } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
