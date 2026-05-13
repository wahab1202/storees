import { Router } from 'express'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { whatsappTemplates, ctwaAttributions, customers, projects } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { getChannelProvider, getProviderCapabilities } from '../services/channelProviderRegistry.js'
import { lintTemplate, hasBlockingErrors, type TemplateLintInput } from '../services/templateLinter.js'
import { countParameters } from '../services/providers/whatsappUtils.js'
import { syncWhatsappTemplatesForProject } from '../services/whatsappTemplateSyncService.js'
import { resolveTemplateVariables, type CustomerLike, type ProjectLike } from '../services/templateContext.js'
import type { TemplateVariable } from '@storees/shared'

const router = Router()

/**
 * GET /api/whatsapp/provider-status?projectId=...
 * Shows the currently resolved WhatsApp provider and whether it can sync,
 * submit templates for approval, and refresh approval status.
 */
router.get('/provider-status', requireProjectId, async (req, res) => {
  try {
    const channelResult = await getChannelProvider(req.projectId!, 'whatsapp')
    if (!channelResult) {
      return res.json({
        success: true,
        data: {
          configured: false,
          provider: null,
          capabilities: {
            sendText: false,
            sendTemplate: false,
            syncTemplates: false,
            submitTemplate: false,
            getTemplateStatus: false,
            parseInbound: false,
          },
          missingConfig: [],
        },
      })
    }

    const { provider, config } = channelResult
    const missingConfig = provider.name === 'meta'
      ? ['phoneNumberId', 'wabaId', 'accessToken'].filter(key => !String(config[key] ?? '').trim())
      : []

    res.json({
      success: true,
      data: {
        configured: missingConfig.length === 0,
        provider: provider.name,
        capabilities: getProviderCapabilities(provider),
        missingConfig,
      },
    })
  } catch (err) {
    console.error('GET /whatsapp/provider-status error:', err)
    res.status(500).json({ success: false, error: 'Failed to load WhatsApp provider status' })
  }
})

/**
 * GET /api/whatsapp/templates?projectId=...
 * Lists all synced WhatsApp templates for the project.
 */
router.get('/templates', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const rows = await db
      .select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.projectId, projectId))
      .orderBy(desc(whatsappTemplates.syncedAt))
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('GET /whatsapp/templates error:', err)
    res.status(500).json({ success: false, error: 'Failed to load templates' })
  }
})

/**
 * POST /api/whatsapp/sync-templates?projectId=...
 * Triggers a template sync from the project's configured WhatsApp provider.
 * Upserts each template into whatsapp_templates (unique on project_id+provider+name+language).
 */
router.post('/sync-templates', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    const result = await syncWhatsappTemplatesForProject(projectId)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('POST /whatsapp/sync-templates error:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Sync failed' })
  }
})

/**
 * POST /api/whatsapp/templates/lint?projectId=...
 *
 * Synchronous validation. Returns findings; never persists. Lets the form
 * preview lint warnings as the merchant types.
 */
router.post('/templates/lint', requireProjectId, async (req, res) => {
  try {
    const input = req.body as TemplateLintInput
    const findings = lintTemplate(input)
    res.json({ success: true, data: { findings, blocking: hasBlockingErrors(findings) } })
  } catch (err) {
    console.error('POST /whatsapp/templates/lint error:', err)
    res.status(500).json({ success: false, error: 'Lint failed' })
  }
})

/**
 * POST /api/whatsapp/templates?projectId=...
 *
 * Submit a new template through Storees → provider. Flow:
 *   1. Lint synchronously; reject submission if blocking errors (caller must fix).
 *      Caller can pass { force: true } to override warnings only (errors still block).
 *   2. Insert PENDING row in whatsapp_templates with submitted_at = NOW.
 *   3. Call provider.submitTemplate; on success, update row with providerTemplateId
 *      and the provider's reported status.
 *   4. Return the row so the UI can poll /templates for status updates.
 */
router.post('/templates', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const body = req.body as TemplateLintInput & { force?: boolean }

    // 1. Lint
    const findings = lintTemplate(body)
    if (hasBlockingErrors(findings)) {
      return res.status(400).json({
        success: false,
        error: 'lint_blocking',
        data: { findings },
      })
    }

    // 2. Resolve provider + verify capability
    const channelResult = await getChannelProvider(projectId, 'whatsapp')
    if (!channelResult) {
      return res.status(400).json({ success: false, error: 'No WhatsApp provider configured for this project' })
    }
    const { provider, config } = channelResult
    if (!provider.submitTemplate) {
      return res.status(400).json({
        success: false,
        error: `Provider '${provider.name}' does not support template submission. Submit through the provider's dashboard and run "Sync templates" instead.`,
      })
    }

    // 3. Insert PENDING row first so we have a record even if the provider call fails
    const now = new Date()
    const paramCount = countParameters(body.bodyText)
    const [inserted] = await db.insert(whatsappTemplates).values({
      projectId,
      provider: provider.name,
      providerTemplateId: body.name, // updated after provider response
      name: body.name,
      language: body.language,
      category: body.category,
      status: 'PENDING',
      bodyText: body.bodyText,
      header: body.header as object | null,
      footer: body.footer,
      buttons: body.buttons as object | null,
      parameterCount: paramCount,
      submittedAt: now,
      lastStatusCheckAt: now,
    }).onConflictDoUpdate({
      target: [whatsappTemplates.projectId, whatsappTemplates.provider, whatsappTemplates.name, whatsappTemplates.language],
      set: {
        category: body.category,
        bodyText: body.bodyText,
        header: body.header as object | null,
        footer: body.footer,
        buttons: body.buttons as object | null,
        parameterCount: paramCount,
        submittedAt: now,
        status: 'PENDING',
        rejectionReason: null,
        updatedAt: now,
      },
    }).returning()

    // 4. Call provider — on failure, mark template REJECTED with the error message
    try {
      const cat = body.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
      const result = await provider.submitTemplate({
        name: body.name,
        language: body.language,
        category: cat,
        bodyText: body.bodyText,
        header: body.header,
        footer: body.footer,
        buttons: body.buttons,
        bodyExample: (body as TemplateLintInput & { bodyExample?: string[] }).bodyExample,
      }, config)
      const [updated] = await db.update(whatsappTemplates).set({
        providerTemplateId: result.providerTemplateId,
        status: result.status,
        category: result.category ?? body.category,
        lastStatusCheckAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(whatsappTemplates.id, inserted.id)).returning()

      res.status(201).json({ success: true, data: { template: updated, lintFindings: findings } })
    } catch (providerErr) {
      const reason = providerErr instanceof Error ? providerErr.message : 'Unknown provider error'
      const [failed] = await db.update(whatsappTemplates).set({
        status: 'REJECTED',
        rejectionReason: reason,
        lastStatusCheckAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(whatsappTemplates.id, inserted.id)).returning()
      res.status(502).json({ success: false, error: 'Provider rejected the submission', data: { template: failed, providerError: reason } })
    }
  } catch (err) {
    console.error('POST /whatsapp/templates error:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Submission failed' })
  }
})

/**
 * POST /api/whatsapp/templates/:id/refresh-status?projectId=...
 *
 * Force a status refresh for a single template. Used by the UI's "Check status"
 * button. The cron worker handles bulk polling on its own schedule.
 */
router.post('/templates/:id/refresh-status', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string

    const [tmpl] = await db
      .select()
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.id, id), eq(whatsappTemplates.projectId, projectId)))
      .limit(1)
    if (!tmpl) return res.status(404).json({ success: false, error: 'Template not found' })

    const channelResult = await getChannelProvider(projectId, 'whatsapp')
    if (!channelResult) return res.status(400).json({ success: false, error: 'No WhatsApp provider configured' })
    const { provider, config } = channelResult
    if (!provider.getTemplateStatus) {
      return res.status(400).json({ success: false, error: `Provider '${provider.name}' does not support status refresh` })
    }

    const status = await provider.getTemplateStatus(tmpl.providerTemplateId, config)
    const previousCategory = tmpl.category && status.category && tmpl.category !== status.category
      ? tmpl.category
      : tmpl.previousCategory

    const [updated] = await db.update(whatsappTemplates).set({
      status: status.status,
      category: status.category ?? tmpl.category,
      previousCategory,
      rejectionReason: status.rejectionReason ?? null,
      lastStatusCheckAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(whatsappTemplates.id, id)).returning()

    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('POST /whatsapp/templates/:id/refresh-status error:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Refresh failed' })
  }
})

/**
 * POST /api/whatsapp/templates/:id/test-send
 *
 * Send a single rendered template message to an admin-provided phone before
 * launching the campaign to thousands of customers. Mirrors the actual
 * dispatch path (same provider.sendTemplate call, same variable resolver)
 * but bypasses the customer.phone lookup via phoneOverride.
 *
 * Body shape:
 *   {
 *     phone: "+919876543210",         // E.164, who to send to
 *     variables: TemplateVariable[],  // mappings from the campaign draft
 *     sampleCustomerId?: string       // resolve variables using a real
 *                                     // customer's data (optional)
 *   }
 *
 * Returns the provider message id on success. Useful for the admin to
 * eyeball the rendered template in their own WhatsApp before going live.
 */
router.post('/templates/:id/test-send', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string

    const body = req.body as {
      phone?: string
      variables?: TemplateVariable[]
      sampleCustomerId?: string
    }

    const phone = (body.phone ?? '').trim()
    if (!phone) return res.status(400).json({ success: false, error: 'phone is required (E.164 format)' })
    // Cheap E.164 validation — must start with + and have 7-15 digits after.
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      return res.status(400).json({ success: false, error: 'phone must be E.164, e.g. +919876543210' })
    }

    const [tmpl] = await db
      .select()
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.id, id), eq(whatsappTemplates.projectId, projectId)))
      .limit(1)
    if (!tmpl) return res.status(404).json({ success: false, error: 'Template not found' })
    if (tmpl.status !== 'APPROVED') {
      return res.status(400).json({ success: false, error: `Template status is ${tmpl.status}; only APPROVED templates can be sent` })
    }

    const channelResult = await getChannelProvider(projectId, 'whatsapp')
    if (!channelResult) {
      return res.status(400).json({ success: false, error: 'No WhatsApp provider configured for this project' })
    }
    const { provider, config } = channelResult
    if (!provider.sendTemplate) {
      return res.status(400).json({ success: false, error: `Provider '${provider.name}' does not support sendTemplate` })
    }

    // Resolve variables → substitution map. Same code path as send-time, so
    // what the test recipient receives is exactly what the campaign would.
    const [projectRow] = await db
      .select({
        id: projects.id, name: projects.name,
        emailFromAddress: projects.emailFromAddress, emailFromName: projects.emailFromName,
      })
      .from(projects).where(eq(projects.id, projectId)).limit(1)
    const project: ProjectLike = projectRow ?? { id: projectId, name: '' }

    // Sample customer for variable resolution (optional). Falls back to a
    // placeholder if not supplied — variables resolve to defaultValue.
    let customer: CustomerLike = { id: 'test_send_placeholder' }
    if (body.sampleCustomerId) {
      const [row] = await db.select({
        id: customers.id, externalId: customers.externalId,
        email: customers.email, phone: customers.phone, name: customers.name,
        region: customers.region, city: customers.city,
        totalOrders: customers.totalOrders, totalSpent: customers.totalSpent,
        avgOrderValue: customers.avgOrderValue, clv: customers.clv,
        firstOrderDate: customers.firstOrderDate, lastOrderDate: customers.lastOrderDate,
        lastSeen: customers.lastSeen, customAttributes: customers.customAttributes,
      })
        .from(customers)
        .where(and(eq(customers.id, body.sampleCustomerId), eq(customers.projectId, projectId)))
        .limit(1)
      if (row) customer = row as CustomerLike
    }

    const substitutions = resolveTemplateVariables({
      variables: body.variables ?? [],
      customer,
      project,
    })

    // Ordered body params {{1}}..{{N}} pulled from the substitutions map.
    const templateParams: string[] = []
    for (let i = 1; i <= (tmpl.parameterCount ?? 0); i++) {
      templateParams.push(substitutions[String(i)] ?? '')
    }

    const result = await provider.sendTemplate(
      {
        projectId,
        userId: 'test_send_placeholder',  // bypassed by phoneOverride
        channel: 'whatsapp',
        templateId: tmpl.id,
        templateName: tmpl.providerTemplateId,
        templateLanguage: tmpl.language,
        templateParams,
        templateHeader: tmpl.header,
        templateButtons: tmpl.buttons,
        variables: substitutions,
        messageType: 'promotional',
        phoneOverride: phone,
      },
      config,
    )

    if (result.error) {
      return res.status(502).json({ success: false, error: result.error })
    }
    res.json({ success: true, data: { messageId: result.messageId, to: phone } })
  } catch (err) {
    console.error('POST /whatsapp/templates/:id/test-send error:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Test send failed' })
  }
})

/**
 * GET /api/whatsapp/ctwa-attributions?projectId=...&from=&to=
 *
 * Per-ad funnel for the Click-to-WhatsApp campaigns the merchant has been
 * running. Aggregates by ad_id: total leads, leads who replied beyond the
 * first inbound, leads who placed an order, attributed revenue. Drives the
 * CTWA Attribution view in the campaigns area.
 */
router.get('/ctwa-attributions', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const fromStr = (req.query.from as string) ?? ''
    const toStr = (req.query.to as string) ?? ''
    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const to = toStr ? new Date(toStr) : new Date()

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid from/to date' })
    }

    // Per-ad funnel. inbound_count > 1 = the lead actually replied (not just arrived).
    // first_purchase_at IS NOT NULL = the lead converted.
    const result = await db.execute(sql`
      SELECT
        ad_id,
        MAX(headline) AS headline,
        MAX(body) AS body,
        MAX(source_url) AS source_url,
        MAX(media_type) AS media_type,
        MAX(image_url) AS image_url,
        COUNT(*)::int AS leads,
        COUNT(*) FILTER (WHERE inbound_count > 1)::int AS engaged,
        COUNT(*) FILTER (WHERE first_purchase_at IS NOT NULL)::int AS converted,
        COALESCE(SUM(attributed_revenue), 0)::numeric AS attributed_revenue,
        MIN(first_inbound_at) AS first_seen,
        MAX(last_inbound_at) AS last_seen
      FROM ctwa_attributions
      WHERE project_id = ${projectId}
        AND first_inbound_at >= ${from}
        AND first_inbound_at <= ${to}
      GROUP BY ad_id
      ORDER BY leads DESC, last_seen DESC
      LIMIT 200
    `)

    const rows = (result.rows as Array<{
      ad_id: string
      headline: string | null
      body: string | null
      source_url: string | null
      media_type: string | null
      image_url: string | null
      leads: number
      engaged: number
      converted: number
      attributed_revenue: string
      first_seen: string
      last_seen: string
    }>).map(r => ({
      adId: r.ad_id,
      headline: r.headline,
      body: r.body,
      sourceUrl: r.source_url,
      mediaType: r.media_type,
      imageUrl: r.image_url,
      leads: r.leads,
      engaged: r.engaged,
      converted: r.converted,
      attributedRevenue: Number(r.attributed_revenue),
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    }))

    // Top-level totals for the dashboard cards
    const totals = rows.reduce(
      (acc, r) => ({
        leads: acc.leads + r.leads,
        engaged: acc.engaged + r.engaged,
        converted: acc.converted + r.converted,
        attributedRevenue: acc.attributedRevenue + r.attributedRevenue,
      }),
      { leads: 0, engaged: 0, converted: 0, attributedRevenue: 0 },
    )

    res.json({ success: true, data: { ads: rows, totals, range: { from, to } } })
  } catch (err) {
    console.error('GET /whatsapp/ctwa-attributions error:', err)
    res.status(500).json({ success: false, error: 'Failed to load CTWA attributions' })
  }
})

export default router
