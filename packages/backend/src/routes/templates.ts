import { Router } from 'express'
import { db } from '../db/connection.js'
import { emailTemplates, customers, projects } from '../db/schema.js'
import { eq, and, count, desc, sql } from 'drizzle-orm'
import { requireProjectId } from '../middleware/projectId.js'
import { SEED_TEMPLATES } from '../data/seedTemplates.js'
import { buildVariableCatalog } from '../services/variableSources.js'
import { lintTemplate, hasBlockingErrors } from '../services/templateLint.js'
import {
  resolveTemplateVariables,
  type CustomerLike,
  type ProjectLike,
} from '../services/templateContext.js'
import { interpolateTemplate } from '../services/emailService.js'
import type { TemplateVariable } from '@storees/shared'

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

// GET /api/templates/variable-sources?projectId=...
// Catalogue of available variable sources for the picker UI: customer fields,
// custom-attribute keys observed on real customers, project fields, and event
// names with their property keys. Loaded once when the editor opens.
//
// MUST come before `/:id` — Express matches in declaration order.
router.get('/variable-sources', requireProjectId, async (req, res) => {
  try {
    const projectId = req.query.projectId as string
    const catalog = await buildVariableCatalog(projectId)
    res.json({ success: true, data: catalog })
  } catch (err) {
    console.error('[Templates] variable-sources error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch variable sources' })
  }
})

// POST /api/templates/preview?projectId=...
// Live-render preview using a real customer (sampleCustomerId) or a synthetic
// row when none is given. Powers the "Test with sample customer" feature in
// the editor — same resolver path that send-time uses.
//
// MUST come before `/:id`.
router.post('/preview', requireProjectId, async (req, res) => {
  try {
    const projectId = req.query.projectId as string
    const {
      subject,
      htmlBody,
      bodyText,
      variables,
      sampleCustomerId,
      eventProperties,
    } = req.body as {
      subject?: string | null
      htmlBody?: string | null
      bodyText?: string | null
      variables?: TemplateVariable[]
      sampleCustomerId?: string
      eventProperties?: Record<string, unknown>
    }

    // Pull the project — emailFromName/Address feed {{store_name}}.
    const [projectRow] = await db
      .select({
        id: projects.id,
        name: projects.name,
        emailFromAddress: projects.emailFromAddress,
        emailFromName: projects.emailFromName,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    const project: ProjectLike = projectRow ?? { id: projectId, name: '' }

    // Sample customer: use the requested one if it belongs to this project,
    // else pick the most-recent active row, else fall back to a placeholder.
    let customer: CustomerLike
    let sampleSource: 'requested' | 'auto' | 'placeholder' = 'placeholder'
    const customerSelect = {
      id: customers.id,
      externalId: customers.externalId,
      email: customers.email,
      phone: customers.phone,
      name: customers.name,
      region: customers.region,
      city: customers.city,
      totalOrders: customers.totalOrders,
      totalSpent: customers.totalSpent,
      avgOrderValue: customers.avgOrderValue,
      clv: customers.clv,
      firstOrderDate: customers.firstOrderDate,
      lastOrderDate: customers.lastOrderDate,
      lastSeen: customers.lastSeen,
      customAttributes: customers.customAttributes,
    }

    if (sampleCustomerId) {
      const [row] = await db
        .select(customerSelect)
        .from(customers)
        .where(and(eq(customers.id, sampleCustomerId), eq(customers.projectId, projectId)))
        .limit(1)
      if (row) { customer = row as CustomerLike; sampleSource = 'requested' }
      else { customer = placeholderCustomer(); sampleSource = 'placeholder' }
    } else {
      const [row] = await db
        .select(customerSelect)
        .from(customers)
        .where(eq(customers.projectId, projectId))
        .orderBy(desc(customers.lastSeen))
        .limit(1)
      if (row) { customer = row as CustomerLike; sampleSource = 'auto' }
      else { customer = placeholderCustomer(); sampleSource = 'placeholder' }
    }

    const map = resolveTemplateVariables({
      variables: variables ?? [],
      customer,
      project,
      eventProperties,
    })

    const issues = lintTemplate({ variables, subject, htmlBody, bodyText })

    res.json({
      success: true,
      data: {
        rendered: {
          subject: interpolateTemplate(subject ?? '', map),
          htmlBody: interpolateTemplate(htmlBody ?? '', map),
          bodyText: interpolateTemplate(bodyText ?? '', map),
        },
        substitutions: map,
        sampleSource,
        sampleCustomer: {
          id: customer.id,
          name: customer.name ?? null,
          email: customer.email ?? null,
        },
        issues,
      },
    })
  } catch (err) {
    console.error('[Templates] preview error:', err)
    res.status(500).json({ success: false, error: 'Failed to render preview' })
  }
})

function placeholderCustomer(): CustomerLike {
  return {
    id: 'sample',
    name: 'Alex Rivera',
    email: 'alex@example.com',
    phone: '+1 555 0100',
    region: 'California',
    city: 'San Francisco',
    totalOrders: 12,
    totalSpent: '4280.00',
    avgOrderValue: '356.67',
    clv: '5400.00',
    firstOrderDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 365),
    lastOrderDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
    lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    customAttributes: {},
  }
}

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
    const { name, channel = 'email', subject, htmlBody, bodyText, variables } = req.body

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Template name is required' })
    }

    const validChannels = ['email', 'sms', 'push', 'whatsapp']
    if (!validChannels.includes(channel)) {
      return res.status(400).json({ success: false, error: 'Invalid channel' })
    }

    // Save-time lint — undefined `{{key}}` references in body block the save.
    const issues = lintTemplate({ variables, subject, htmlBody, bodyText })
    if (hasBlockingErrors(issues)) {
      return res.status(400).json({ success: false, error: 'Template has invalid variables', issues })
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
        variables: variables ?? [],
      })
      .returning()

    res.status(201).json({ success: true, data: template, issues })
  } catch (err) {
    console.error('[Templates] Create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create template' })
  }
})

// PATCH /api/templates/:id?projectId=...
router.patch('/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.query.projectId as string
    const { name, subject, htmlBody, bodyText, variables } = req.body

    const [existing] = await db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, req.params.id as string), eq(emailTemplates.projectId, projectId)))
      .limit(1)

    if (!existing) return res.status(404).json({ success: false, error: 'Template not found' })

    // Lint against the merged shape (caller may patch only some fields).
    const merged = {
      variables: variables !== undefined ? variables : existing.variables,
      subject: subject !== undefined ? subject : existing.subject,
      htmlBody: htmlBody !== undefined ? htmlBody : existing.htmlBody,
      bodyText: bodyText !== undefined ? bodyText : existing.bodyText,
    }
    const issues = lintTemplate(merged)
    if (hasBlockingErrors(issues)) {
      return res.status(400).json({ success: false, error: 'Template has invalid variables', issues })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name.trim()
    if (subject !== undefined) updates.subject = subject?.trim() || null
    if (htmlBody !== undefined) updates.htmlBody = htmlBody?.trim() || null
    if (bodyText !== undefined) updates.bodyText = bodyText?.trim() || null
    if (variables !== undefined) updates.variables = variables

    const [updated] = await db
      .update(emailTemplates)
      .set(updates)
      .where(eq(emailTemplates.id, req.params.id as string))
      .returning()

    res.json({ success: true, data: updated, issues })
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
