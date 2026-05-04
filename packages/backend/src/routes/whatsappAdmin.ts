import { Router } from 'express'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { whatsappTemplates, ctwaAttributions } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { getChannelProvider, getProviderCapabilities } from '../services/channelProviderRegistry.js'
import { lintTemplate, hasBlockingErrors, type TemplateLintInput } from '../services/templateLinter.js'
import { countParameters } from '../services/providers/whatsappUtils.js'

const router = Router()

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

    const channelResult = await getChannelProvider(projectId, 'whatsapp')
    if (!channelResult) {
      return res.status(400).json({ success: false, error: 'No WhatsApp provider configured for this project' })
    }
    const { provider, config } = channelResult
    const caps = getProviderCapabilities(provider)
    if (!caps.syncTemplates || !provider.syncTemplates) {
      return res.status(400).json({ success: false, error: `Provider '${provider.name}' does not support template sync` })
    }

    const templates = await provider.syncTemplates(config)

    let upserted = 0
    for (const t of templates) {
      await db.insert(whatsappTemplates).values({
        projectId,
        provider: provider.name,
        providerTemplateId: t.providerTemplateId,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        bodyText: t.bodyText,
        header: t.header as object | null,
        footer: t.footer,
        buttons: t.buttons as object | null,
        parameterCount: t.parameterCount,
        rawPayload: t.rawPayload as object | null,
      }).onConflictDoUpdate({
        target: [whatsappTemplates.projectId, whatsappTemplates.provider, whatsappTemplates.name, whatsappTemplates.language],
        set: {
          providerTemplateId: t.providerTemplateId,
          category: t.category,
          status: t.status,
          bodyText: t.bodyText,
          header: t.header as object | null,
          footer: t.footer,
          buttons: t.buttons as object | null,
          parameterCount: t.parameterCount,
          rawPayload: t.rawPayload as object | null,
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      upserted++
    }

    res.json({ success: true, data: { provider: provider.name, count: upserted } })
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
