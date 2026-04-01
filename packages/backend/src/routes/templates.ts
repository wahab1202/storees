import { Router } from 'express'
import { db } from '../db/connection.js'
import { emailTemplates } from '../db/schema.js'
import { eq, and, count } from 'drizzle-orm'
import { requireProjectId } from '../middleware/projectId.js'
import { SEED_TEMPLATES } from '../data/seedTemplates.js'

const router = Router()

// GET /api/templates?projectId=...
router.get('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.query.projectId as string
    const rows = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.projectId, projectId))
      .orderBy(emailTemplates.createdAt)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('[Templates] List error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch templates' })
  }
})

// POST /api/templates/seed?projectId=...
// Seeds starter templates (skips if project already has templates)
router.post('/seed', requireProjectId, async (req, res) => {
  try {
    const projectId = req.query.projectId as string
    const force = req.body.force === true

    if (!force) {
      const [existing] = await db
        .select({ total: count() })
        .from(emailTemplates)
        .where(eq(emailTemplates.projectId, projectId))

      if (existing && existing.total > 0) {
        return res.json({
          success: true,
          data: { seeded: 0, message: `Project already has ${existing.total} templates. Use force: true to add anyway.` },
        })
      }
    }

    const rows = SEED_TEMPLATES.map(t => ({
      projectId,
      name: t.name,
      channel: t.channel,
      subject: t.subject ?? null,
      htmlBody: t.htmlBody ?? null,
      bodyText: t.bodyText ?? null,
    }))

    await db.insert(emailTemplates).values(rows)

    res.status(201).json({
      success: true,
      data: { seeded: rows.length, message: `Created ${rows.length} templates (${rows.filter(r => r.channel === 'email').length} email, ${rows.filter(r => r.channel === 'sms').length} SMS)` },
    })
  } catch (err) {
    console.error('[Templates] Seed error:', err)
    res.status(500).json({ success: false, error: 'Failed to seed templates' })
  }
})

// GET /api/templates/:id?projectId=...
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.query.projectId as string
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, req.params.id as string), eq(emailTemplates.projectId, projectId)))
      .limit(1)

    if (!template) return res.status(404).json({ success: false, error: 'Template not found' })

    res.json({ success: true, data: template })
  } catch (err) {
    console.error('[Templates] Get error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch template' })
  }
})

// POST /api/templates?projectId=...
router.post('/', requireProjectId, async (req, res) => {
  try {
    const projectId = req.query.projectId as string
    const { name, channel = 'email', subject, htmlBody, bodyText } = req.body

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Template name is required' })
    }

    const validChannels = ['email', 'sms', 'push', 'whatsapp']
    if (!validChannels.includes(channel)) {
      return res.status(400).json({ success: false, error: 'Invalid channel' })
    }

    const [template] = await db
      .insert(emailTemplates)
      .values({
        projectId,
        name: name.trim(),
        channel,
        subject: subject?.trim() || null,
        htmlBody: htmlBody?.trim() || null,
        bodyText: bodyText?.trim() || null,
      })
      .returning()

    res.status(201).json({ success: true, data: template })
  } catch (err) {
    console.error('[Templates] Create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create template' })
  }
})

// PATCH /api/templates/:id?projectId=...
router.patch('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.query.projectId as string
    const { name, subject, htmlBody, bodyText } = req.body

    const [existing] = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, req.params.id as string), eq(emailTemplates.projectId, projectId)))
      .limit(1)

    if (!existing) return res.status(404).json({ success: false, error: 'Template not found' })

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name.trim()
    if (subject !== undefined) updates.subject = subject?.trim() || null
    if (htmlBody !== undefined) updates.htmlBody = htmlBody?.trim() || null
    if (bodyText !== undefined) updates.bodyText = bodyText?.trim() || null

    const [updated] = await db
      .update(emailTemplates)
      .set(updates)
      .where(eq(emailTemplates.id, req.params.id as string))
      .returning()

    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('[Templates] Update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update template' })
  }
})

// DELETE /api/templates/:id?projectId=...
router.delete('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.query.projectId as string

    const [existing] = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, req.params.id as string), eq(emailTemplates.projectId, projectId)))
      .limit(1)

    if (!existing) return res.status(404).json({ success: false, error: 'Template not found' })

    await db.delete(emailTemplates).where(eq(emailTemplates.id, req.params.id as string))

    res.json({ success: true, data: { id: req.params.id as string } })
  } catch (err) {
    console.error('[Templates] Delete error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete template' })
  }
})

export default router
