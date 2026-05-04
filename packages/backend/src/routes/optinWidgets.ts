import { Router } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { optinWidgets } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'

const router = Router()

router.use(requireRole('admin'))

type WidgetBody = {
  name?: string
  headline?: string
  body?: string | null
  buttonLabel?: string
  consentText?: string
  triggerType?: 'exit_intent' | 'time_on_page' | 'scroll_depth' | 'manual'
  triggerConfig?: Record<string, unknown>
  targetPages?: string[]
  showOnce?: boolean
  collectEmail?: boolean
  collectName?: boolean
  phoneRequired?: boolean
  preCheckConsent?: boolean
  isActive?: boolean
}

const VALID_TRIGGERS = new Set(['exit_intent', 'time_on_page', 'scroll_depth', 'manual'])

function validate(body: WidgetBody): string | null {
  if (!body.name?.trim()) return 'name is required'
  if (!body.headline?.trim()) return 'headline is required'
  if (!body.consentText?.trim()) return 'consentText is required (DPDP compliance)'
  if (!body.triggerType || !VALID_TRIGGERS.has(body.triggerType)) return `triggerType must be one of: ${[...VALID_TRIGGERS].join(', ')}`
  if (body.triggerType === 'time_on_page') {
    const seconds = (body.triggerConfig as { seconds?: number } | undefined)?.seconds
    if (typeof seconds !== 'number' || seconds < 1 || seconds > 600) return 'time_on_page triggerConfig.seconds must be 1-600'
  }
  if (body.triggerType === 'scroll_depth') {
    const percent = (body.triggerConfig as { percent?: number } | undefined)?.percent
    if (typeof percent !== 'number' || percent < 1 || percent > 100) return 'scroll_depth triggerConfig.percent must be 1-100'
  }
  return null
}

// GET /api/optin-widgets?projectId=
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const rows = await db
      .select()
      .from(optinWidgets)
      .where(eq(optinWidgets.projectId, projectId))
      .orderBy(desc(optinWidgets.createdAt))
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('GET /optin-widgets error:', err)
    res.status(500).json({ success: false, error: 'Failed to load widgets' })
  }
})

// GET /api/optin-widgets/:id?projectId=
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const [row] = await db
      .select()
      .from(optinWidgets)
      .where(and(eq(optinWidgets.id, req.params.id as string), eq(optinWidgets.projectId, projectId)))
      .limit(1)
    if (!row) return res.status(404).json({ success: false, error: 'Widget not found' })
    res.json({ success: true, data: row })
  } catch (err) {
    console.error('GET /optin-widgets/:id error:', err)
    res.status(500).json({ success: false, error: 'Failed to load widget' })
  }
})

// POST /api/optin-widgets?projectId=
router.post('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const body = req.body as WidgetBody

    const err = validate(body)
    if (err) return res.status(400).json({ success: false, error: err })

    const [created] = await db.insert(optinWidgets).values({
      projectId,
      name: body.name!.trim(),
      headline: body.headline!.trim(),
      body: body.body ?? null,
      buttonLabel: body.buttonLabel?.trim() || 'Get the discount',
      consentText: body.consentText!.trim(),
      triggerType: body.triggerType!,
      triggerConfig: body.triggerConfig ?? {},
      targetPages: body.targetPages ?? [],
      showOnce: body.showOnce ?? true,
      collectEmail: body.collectEmail ?? false,
      collectName: body.collectName ?? false,
      phoneRequired: body.phoneRequired ?? true,
      preCheckConsent: body.preCheckConsent ?? false,
      isActive: body.isActive ?? false,
    }).returning()

    res.status(201).json({ success: true, data: created })
  } catch (e) {
    console.error('POST /optin-widgets error:', e)
    res.status(500).json({ success: false, error: 'Failed to create widget' })
  }
})

// PATCH /api/optin-widgets/:id?projectId=
router.patch('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string
    const body = req.body as WidgetBody

    // Allow partial updates; validate only what's supplied + treat full-update like a create
    if (body.triggerType && !VALID_TRIGGERS.has(body.triggerType)) {
      return res.status(400).json({ success: false, error: 'Invalid triggerType' })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) updates.name = body.name.trim()
    if (body.headline !== undefined) updates.headline = body.headline.trim()
    if (body.body !== undefined) updates.body = body.body
    if (body.buttonLabel !== undefined) updates.buttonLabel = body.buttonLabel.trim()
    if (body.consentText !== undefined) {
      if (!body.consentText.trim()) return res.status(400).json({ success: false, error: 'consentText cannot be empty' })
      updates.consentText = body.consentText.trim()
    }
    if (body.triggerType !== undefined) updates.triggerType = body.triggerType
    if (body.triggerConfig !== undefined) updates.triggerConfig = body.triggerConfig
    if (body.targetPages !== undefined) updates.targetPages = body.targetPages
    if (body.showOnce !== undefined) updates.showOnce = body.showOnce
    if (body.collectEmail !== undefined) updates.collectEmail = body.collectEmail
    if (body.collectName !== undefined) updates.collectName = body.collectName
    if (body.phoneRequired !== undefined) updates.phoneRequired = body.phoneRequired
    if (body.preCheckConsent !== undefined) updates.preCheckConsent = body.preCheckConsent
    if (body.isActive !== undefined) updates.isActive = body.isActive

    const [updated] = await db
      .update(optinWidgets)
      .set(updates)
      .where(and(eq(optinWidgets.id, id), eq(optinWidgets.projectId, projectId)))
      .returning()

    if (!updated) return res.status(404).json({ success: false, error: 'Widget not found' })
    res.json({ success: true, data: updated })
  } catch (e) {
    console.error('PATCH /optin-widgets/:id error:', e)
    res.status(500).json({ success: false, error: 'Failed to update widget' })
  }
})

// DELETE /api/optin-widgets/:id?projectId=
router.delete('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const result = await db
      .delete(optinWidgets)
      .where(and(eq(optinWidgets.id, req.params.id as string), eq(optinWidgets.projectId, projectId)))
      .returning({ id: optinWidgets.id })
    if (result.length === 0) return res.status(404).json({ success: false, error: 'Widget not found' })
    res.json({ success: true, data: { id: result[0].id } })
  } catch (e) {
    console.error('DELETE /optin-widgets/:id error:', e)
    res.status(500).json({ success: false, error: 'Failed to delete widget' })
  }
})

export default router
