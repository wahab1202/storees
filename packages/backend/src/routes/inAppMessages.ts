import { Router } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { inAppMessages } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'

// Gap 1: admin endpoints for managing in-app messages.
// SDK-side delivery is in routes/v1InAppMessages.ts.

const router = Router()

const VALID_POSITIONS = ['modal', 'banner', 'toast', 'inbox']
const VALID_FREQUENCIES = ['always', 'once', 'daily']
const VALID_STATUSES = ['draft', 'active', 'paused', 'archived']

router.get('/', requireProjectId, async (req, res) => {
  const rows = await db
    .select()
    .from(inAppMessages)
    .where(eq(inAppMessages.projectId, req.projectId!))
    .orderBy(desc(inAppMessages.createdAt))
  res.json({ success: true, data: rows })
})

router.get('/:id', requireProjectId, async (req, res) => {
  const [row] = await db
    .select()
    .from(inAppMessages)
    .where(and(
      eq(inAppMessages.id, req.params.id as string),
      eq(inAppMessages.projectId, req.projectId!),
    ))
    .limit(1)
  if (!row) return res.status(404).json({ success: false, error: 'Not found' })
  res.json({ success: true, data: row })
})

router.post('/', requireProjectId, async (req, res) => {
  try {
    const {
      name, title, body, imageUrl, ctaLabel, ctaUrl,
      position, frequency, targetPages, audienceFilter,
      startsAt, endsAt, status,
    } = req.body as Record<string, unknown>

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name required' })
    }
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, error: 'title required' })
    }
    if (position && !VALID_POSITIONS.includes(String(position))) {
      return res.status(400).json({ success: false, error: `position must be one of ${VALID_POSITIONS.join(', ')}` })
    }
    if (frequency && !VALID_FREQUENCIES.includes(String(frequency))) {
      return res.status(400).json({ success: false, error: `frequency must be one of ${VALID_FREQUENCIES.join(', ')}` })
    }
    if (status && !VALID_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of ${VALID_STATUSES.join(', ')}` })
    }

    const [inserted] = await db
      .insert(inAppMessages)
      .values({
        projectId: req.projectId!,
        name: name.trim(),
        title: title.trim(),
        body: typeof body === 'string' ? body : null,
        imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
        ctaLabel: typeof ctaLabel === 'string' ? ctaLabel : null,
        ctaUrl: typeof ctaUrl === 'string' ? ctaUrl : null,
        position: (position as string) ?? 'modal',
        frequency: (frequency as string) ?? 'once',
        targetPages: Array.isArray(targetPages) ? targetPages : [],
        audienceFilter: audienceFilter && typeof audienceFilter === 'object' ? audienceFilter : null,
        startsAt: typeof startsAt === 'string' ? new Date(startsAt) : null,
        endsAt: typeof endsAt === 'string' ? new Date(endsAt) : null,
        status: (status as string) ?? 'draft',
      })
      .returning({ id: inAppMessages.id })
    res.json({ success: true, data: { id: inserted.id } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.patch('/:id', requireProjectId, async (req, res) => {
  const patch = req.body as Record<string, unknown>
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  // Whitelist editable fields so a stray "impressions: 0" in the request
  // doesn't reset counters.
  const fields = [
    'name', 'title', 'body', 'imageUrl', 'ctaLabel', 'ctaUrl',
    'position', 'frequency', 'targetPages', 'audienceFilter',
    'startsAt', 'endsAt', 'status',
  ]
  for (const f of fields) {
    if (patch[f] === undefined) continue
    if ((f === 'startsAt' || f === 'endsAt') && typeof patch[f] === 'string') {
      updates[f] = new Date(patch[f] as string)
    } else if (f === 'startsAt' || f === 'endsAt') {
      updates[f] = null
    } else {
      updates[f] = patch[f]
    }
  }
  await db
    .update(inAppMessages)
    .set(updates)
    .where(and(
      eq(inAppMessages.id, req.params.id as string),
      eq(inAppMessages.projectId, req.projectId!),
    ))
  res.json({ success: true })
})

router.delete('/:id', requireProjectId, async (req, res) => {
  await db
    .delete(inAppMessages)
    .where(and(
      eq(inAppMessages.id, req.params.id as string),
      eq(inAppMessages.projectId, req.projectId!),
    ))
  res.json({ success: true })
})

export default router
