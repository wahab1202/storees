import { Router } from 'express'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { whatsappTemplates, ctwaAttributions, customers, projects, whatsappProvisioningRequests } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole, requirePlatformAdmin } from '../middleware/agentScope.js'
import { linkMetaWhatsappAccount, registerWhatsappNumber } from '../services/whatsappMetaConnectService.js'
import { getBusinessProfile, updateBusinessProfile, setProfilePhotoFromUrl, type BusinessProfilePatch } from '../services/whatsappProfileService.js'
import { getUsageSummary } from '../services/whatsappUsageService.js'
import { getChannelProvider, getProviderCapabilities, clearProjectChannelProviderCache, type SubmitTemplateInput } from '../services/channelProviderRegistry.js'
import { lintTemplate, hasBlockingErrors, type TemplateLintInput } from '../services/templateLinter.js'
import { countParameters, buildBodyParams } from '../services/providers/whatsappUtils.js'
import { syncWhatsappTemplatesForProject } from '../services/whatsappTemplateSyncService.js'
import { resolveTemplateVariables, type CustomerLike, type ProjectLike } from '../services/templateContext.js'
import { encrypt, decrypt } from '../services/encryption.js'
import crypto from 'node:crypto'
import {
  pinnacleGetUserDetails,
  pinnacleGetWabaInfo,
  pinnacleSetWebhook,
} from '../services/providers/pinnacleWhatsappProvider.js'
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
          webhookRegistered: false,
        },
      })
    }

    const { provider, config } = channelResult
    const requiredKeysByProvider: Record<string, string[]> = {
      meta: ['phoneNumberId', 'wabaId', 'accessToken'],
      pinnacle: ['phoneNumberId', 'wabaId', 'apikey'],
    }
    const missingConfig = (requiredKeysByProvider[provider.name] ?? [])
      .filter(key => !String(config[key] ?? '').trim())

    res.json({
      success: true,
      data: {
        configured: missingConfig.length === 0,
        provider: provider.name,
        capabilities: getProviderCapabilities(provider),
        missingConfig,
        // Delivery/read receipts only flow once the callback is registered. Stored
        // at connect time; surfaced so the connected card can flag broken tracking.
        webhookRegistered: !!config.webhookRegisteredAt,
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
/**
 * Meta requires sample media (`example.header_handle`) on media headers and
 * carousel cards at submission — without it the provider rejects with the
 * opaque "component of type HEADER is missing expected field(s) (example)".
 * Returns an actionable message, or null when the template is submittable.
 */
function missingMediaSampleError(header: unknown, carousel: unknown): string | null {
  const h = header as { type?: string; format?: string; example?: string } | null
  const headerType = h?.type ?? h?.format
  if (h && headerType && headerType !== 'TEXT' && !String(h.example ?? '').trim()) {
    return `The ${headerType} header needs sample media for Meta review — upload a file or paste a URL in the builder, then submit again.`
  }
  const cards = Array.isArray(carousel) ? carousel as Array<{ headerExample?: string }> : []
  const missingIdx = cards.findIndex(c => !String(c?.headerExample ?? '').trim())
  if (missingIdx >= 0) {
    return `Carousel card ${missingIdx + 1} needs sample media for Meta review — add it in the builder, then submit again.`
  }
  return null
}

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

    // 2. Resolve provider + verify capability. Drafts can be authored WITHOUT a
    //    connected provider (matches the UI promise); only submission needs one.
    const channelResult = await getChannelProvider(projectId, 'whatsapp')
    const isDraft = !!(body as { draft?: boolean }).draft
    if (!channelResult && !isDraft) {
      return res.status(400).json({ success: false, error: 'No WhatsApp provider configured for this project' })
    }
    const provider = channelResult?.provider ?? null
    const config = channelResult?.config ?? {}

    // DRAFT path: save the template locally WITHOUT submitting to the provider.
    // Drafts are freely editable; "Submit for approval" (POST /:id/submit) is
    // what later pushes it to Meta for MARKETING / UTILITY / AUTH review.
    if ((body as { draft?: boolean }).draft) {
      const now = new Date()
      const paramCount = countParameters(body.bodyText)
      const bodyExample = (body as TemplateLintInput & { bodyExample?: string[] }).bodyExample
      const otp = (body as { otp?: unknown }).otp ?? null
      const carousel = (body as { carousel?: unknown }).carousel ?? null
      const variables = (body as TemplateLintInput & { variables?: unknown }).variables ?? null
      const [draft] = await db.insert(whatsappTemplates).values({
        projectId,
        provider: provider?.name ?? 'unconfigured',
        providerTemplateId: body.name,
        name: body.name,
        language: body.language,
        category: body.category,
        status: 'DRAFT',
        bodyText: body.bodyText,
        header: body.header as object | null,
        footer: body.footer,
        buttons: body.buttons as object | null,
        parameterCount: paramCount,
        variables: variables as object | null,
        carousel: carousel as object | null,
        // Stash the example values for {{1}}.. so submission can supply them later.
        rawPayload: (bodyExample || otp) ? { bodyExample, otp } : null,
        submittedAt: null,
      }).onConflictDoUpdate({
        target: [whatsappTemplates.projectId, whatsappTemplates.provider, whatsappTemplates.name, whatsappTemplates.language],
        set: {
          category: body.category,
          bodyText: body.bodyText,
          header: body.header as object | null,
          footer: body.footer,
          buttons: body.buttons as object | null,
          parameterCount: paramCount,
          variables: variables as object | null,
          carousel: carousel as object | null,
          rawPayload: (bodyExample || otp) ? { bodyExample, otp } : null,
          status: 'DRAFT',
          rejectionReason: null,
          updatedAt: now,
        },
      }).returning()
      return res.status(201).json({ success: true, data: { template: draft, lintFindings: findings } })
    }

    if (!provider || !provider.submitTemplate) {
      return res.status(400).json({
        success: false,
        error: `Provider '${provider?.name ?? 'none'}' does not support template submission. Submit through the provider's dashboard and run "Sync templates" instead.`,
      })
    }

    // 2b. Submission-only guard: media headers / carousel cards must carry
    // sample media, or Meta rejects the whole submission. (Drafts skip this —
    // they returned above.)
    const mediaError = missingMediaSampleError(body.header, (body as { carousel?: unknown }).carousel)
    if (mediaError) {
      return res.status(400).json({ success: false, error: mediaError })
    }

    // 3. Insert PENDING row first so we have a record even if the provider call fails
    const now = new Date()
    const paramCount = countParameters(body.bodyText)
    const variables = (body as TemplateLintInput & { variables?: unknown }).variables ?? null
    const subBodyExample = (body as TemplateLintInput & { bodyExample?: string[] }).bodyExample
    const subOtp = (body as { otp?: unknown }).otp ?? null
    const subCarousel = (body as { carousel?: unknown }).carousel ?? null
    const subRawPayload = (subBodyExample || subOtp) ? { bodyExample: subBodyExample, otp: subOtp } : null
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
      variables: variables as object | null,
      carousel: subCarousel as object | null,
      rawPayload: subRawPayload,
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
        variables: variables as object | null,
        carousel: subCarousel as object | null,
        rawPayload: subRawPayload,
        submittedAt: now,
        status: 'PENDING',
        rejectionReason: null,
        updatedAt: now,
      },
    }).returning()

    // 4. Call provider — on failure, mark template REJECTED with the error message
    try {
      const cat = body.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
      const result = await provider.submitTemplate!({
        name: body.name,
        language: body.language,
        category: cat,
        bodyText: body.bodyText,
        header: body.header,
        footer: body.footer,
        buttons: body.buttons,
        bodyExample: (body as TemplateLintInput & { bodyExample?: string[] }).bodyExample,
        otp: (body as { otp?: SubmitTemplateInput['otp'] }).otp,
        carousel: (body as { carousel?: SubmitTemplateInput['carousel'] }).carousel,
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
 * POST /api/whatsapp/templates/:id/submit?projectId=...
 *
 * Push a DRAFT (or re-push a REJECTED) template to the provider for Meta
 * approval. Meta routes it to MARKETING / UTILITY / AUTHENTICATION review based
 * on the template's category. On success the row flips DRAFT → PENDING.
 */
router.post('/templates/:id/submit', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string

    const [tmpl] = await db
      .select()
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.id, id), eq(whatsappTemplates.projectId, projectId)))
      .limit(1)
    if (!tmpl) return res.status(404).json({ success: false, error: 'Template not found' })
    if (tmpl.status !== 'DRAFT' && tmpl.status !== 'REJECTED') {
      return res.status(400).json({ success: false, error: `Only DRAFT or REJECTED templates can be submitted (current: ${tmpl.status})` })
    }

    const channelResult = await getChannelProvider(projectId, 'whatsapp')
    if (!channelResult?.provider.submitTemplate) {
      return res.status(400).json({ success: false, error: 'WhatsApp provider not configured or does not support submission' })
    }
    const draftMediaError = missingMediaSampleError(tmpl.header, tmpl.carousel)
    if (draftMediaError) {
      return res.status(400).json({ success: false, error: draftMediaError })
    }
    const { provider, config } = channelResult
    const raw = tmpl.rawPayload as { bodyExample?: string[]; otp?: SubmitTemplateInput['otp'] } | null
    const bodyExample = raw?.bodyExample
    const now = new Date()

    try {
      const result = await provider.submitTemplate!({
        name: tmpl.name,
        language: tmpl.language,
        category: tmpl.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
        bodyText: tmpl.bodyText,
        header: tmpl.header as { type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string; example?: string } | null,
        footer: tmpl.footer,
        buttons: tmpl.buttons as SubmitTemplateInput['buttons'],
        bodyExample,
        otp: raw?.otp ?? undefined,
        carousel: tmpl.carousel as SubmitTemplateInput['carousel'],
      }, config)
      const [updated] = await db.update(whatsappTemplates).set({
        provider: provider.name,  // adopt the real provider if the draft was saved unconfigured
        providerTemplateId: result.providerTemplateId,
        status: result.status,
        category: result.category ?? tmpl.category,
        submittedAt: now,
        lastStatusCheckAt: now,
        rejectionReason: null,
        updatedAt: now,
      }).where(eq(whatsappTemplates.id, id)).returning()
      res.json({ success: true, data: { template: updated } })
    } catch (providerErr) {
      const reason = providerErr instanceof Error ? providerErr.message : 'Unknown provider error'
      const [failed] = await db.update(whatsappTemplates).set({
        status: 'REJECTED', rejectionReason: reason, lastStatusCheckAt: now, updatedAt: now,
      }).where(eq(whatsappTemplates.id, id)).returning()
      res.status(502).json({ success: false, error: 'Provider rejected the submission', data: { template: failed, providerError: reason } })
    }
  } catch (err) {
    console.error('POST /whatsapp/templates/:id/submit error:', err)
    res.status(500).json({ success: false, error: 'Submission failed' })
  }
})

/**
 * PATCH /api/whatsapp/templates/:id?projectId=...
 *
 * Edit a DRAFT (or REJECTED) template before submission. APPROVED / PENDING
 * templates are Meta-managed and not editable here.
 */
router.patch('/templates/:id', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const id = req.params.id as string
    const body = req.body as Partial<TemplateLintInput> & { bodyExample?: string[]; variables?: unknown; otp?: unknown; carousel?: unknown }

    const [tmpl] = await db
      .select()
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.id, id), eq(whatsappTemplates.projectId, projectId)))
      .limit(1)
    if (!tmpl) return res.status(404).json({ success: false, error: 'Template not found' })
    if (tmpl.status !== 'DRAFT' && tmpl.status !== 'REJECTED') {
      return res.status(400).json({ success: false, error: `Only DRAFT or REJECTED templates can be edited (current: ${tmpl.status})` })
    }

    const merged = {
      name: tmpl.name,
      language: tmpl.language,
      category: (body.category ?? tmpl.category) as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
      bodyText: body.bodyText ?? tmpl.bodyText,
      header: (body.header ?? tmpl.header) as TemplateLintInput['header'],
      footer: body.footer ?? tmpl.footer ?? undefined,
      buttons: (body.buttons ?? tmpl.buttons) as TemplateLintInput['buttons'],
      carousel: (body.carousel ?? tmpl.carousel) as TemplateLintInput['carousel'],
    }
    const findings = lintTemplate(merged as TemplateLintInput)
    if (hasBlockingErrors(findings)) {
      return res.status(400).json({ success: false, error: 'lint_blocking', data: { findings } })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.category !== undefined) updates.category = body.category
    if (body.bodyText !== undefined) { updates.bodyText = body.bodyText; updates.parameterCount = countParameters(body.bodyText) }
    if (body.header !== undefined) updates.header = body.header as object | null
    if (body.footer !== undefined) updates.footer = body.footer
    if (body.buttons !== undefined) updates.buttons = body.buttons as object | null
    if (body.variables !== undefined) updates.variables = body.variables as object | null
    if (body.carousel !== undefined) updates.carousel = body.carousel as object | null
    if (body.bodyExample !== undefined || body.otp !== undefined) {
      const prev = (tmpl.rawPayload as { bodyExample?: string[]; otp?: unknown } | null) ?? {}
      const bodyExample = body.bodyExample !== undefined ? body.bodyExample : prev.bodyExample
      const otp = body.otp !== undefined ? body.otp : prev.otp
      updates.rawPayload = (bodyExample || otp) ? { bodyExample, otp } : null
    }

    const [updated] = await db.update(whatsappTemplates).set(updates).where(eq(whatsappTemplates.id, id)).returning()
    res.json({ success: true, data: { template: updated, lintFindings: findings } })
  } catch (err) {
    console.error('PATCH /whatsapp/templates/:id error:', err)
    res.status(500).json({ success: false, error: 'Update failed' })
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
      ...(status.qualityScore !== undefined ? { qualityScore: status.qualityScore } : {}),
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

    // Ordered body params {{1}}..{{N}} — never empty (Meta #131008). For a test
    // send we fall back to the template's approved sample values so an
    // unmapped/blank variable still renders something real.
    const testBodyExample = (tmpl.rawPayload as { bodyExample?: string[] } | null)?.bodyExample
    const templateParams = buildBodyParams(
      tmpl.parameterCount ?? 0,
      i => substitutions[String(i)],
      i => testBodyExample?.[i - 1],
    )

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

/**
 * POST /api/whatsapp/connect-pinnacle?projectId=...
 * Connector onboarding (BYO credentials): the brand pastes ONE secret (apikey).
 * We discover their numbers via getuserdetails, store the channel config (apikey
 * encrypted, phone_number_id + waba_id plaintext so webhook routing resolves the
 * project), register the webhook, and import existing Pinnacle templates.
 *
 * Body: { apikey: string, phoneNumberId?: string }
 *  - If the apikey owns multiple numbers and none is chosen, returns the list
 *    with needsSelection=true and does NOT save — the UI prompts for a default.
 */
/**
 * POST /api/whatsapp/connect-meta?projectId=...
 * Body: { phoneNumberId, wabaId, accessToken }
 *
 * Connect a brand's OWN Meta Cloud API WhatsApp account (BYO token). Thin wrapper
 * over linkMetaWhatsappAccount — the same chokepoint the Storees-provisioning
 * admin queue uses, so both paths behave identically.
 */
router.post('/connect-meta', requireProjectId, async (req, res) => {
  try {
    const { phoneNumberId, wabaId, accessToken } = (req.body ?? {}) as {
      phoneNumberId?: string; wabaId?: string; accessToken?: string
    }
    const result = await linkMetaWhatsappAccount(req.projectId!, {
      phoneNumberId: String(phoneNumberId ?? ''),
      wabaId: String(wabaId ?? ''),
      accessToken: String(accessToken ?? ''),
    })
    if (!result.ok) return res.status(400).json({ success: false, error: result.error })
    res.json({ success: true, data: { connected: true, ...result.data } })
  } catch (err) {
    console.error('[whatsapp/connect-meta] error:', err)
    res.status(500).json({ success: false, error: 'Failed to connect Meta WhatsApp account' })
  }
})

/* ── Storees-provisioned WhatsApp onboarding (ops-assisted) ────────────────
 * For brands with no provider: the onboarding team collects a fresh number +
 * business details (intake), provisions the WABA on the Meta side out-of-band,
 * then records the created creds to link it (reusing linkMetaWhatsappAccount).
 */

const PROVISIONING_FIELDS = [
  'requestedNumber', 'businessName', 'category', 'address', 'website',
  'about', 'logoUrl', 'contactName', 'contactEmail', 'notes',
] as const

/** GET /api/whatsapp/provisioning — this project's provisioning request (or null). */
router.get('/provisioning', requireProjectId, async (req, res) => {
  try {
    const [row] = await db.select().from(whatsappProvisioningRequests)
      .where(eq(whatsappProvisioningRequests.projectId, req.projectId!)).limit(1)
    res.json({ success: true, data: row ?? null })
  } catch (err) {
    console.error('[whatsapp/provisioning] get error:', err)
    res.status(500).json({ success: false, error: 'Failed to load provisioning request' })
  }
})

/** POST /api/whatsapp/provisioning — create/update the intake (status → submitted). */
router.post('/provisioning', requireProjectId, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const patch: Record<string, string | null> = {}
    for (const f of PROVISIONING_FIELDS) {
      if (f in body) patch[f] = body[f] == null || body[f] === '' ? null : String(body[f]).trim()
    }
    const [existing] = await db.select({ id: whatsappProvisioningRequests.id, status: whatsappProvisioningRequests.status })
      .from(whatsappProvisioningRequests).where(eq(whatsappProvisioningRequests.projectId, req.projectId!)).limit(1)

    if (existing) {
      // A previously-errored request re-opens to submitted on edit; otherwise
      // keep its current status (don't clobber provisioning/active).
      const nextStatus = existing.status === 'error' ? 'submitted' : existing.status
      const [row] = await db.update(whatsappProvisioningRequests)
        .set({ ...patch, status: nextStatus, updatedAt: new Date() })
        .where(eq(whatsappProvisioningRequests.id, existing.id)).returning()
      return res.json({ success: true, data: row })
    }
    const [row] = await db.insert(whatsappProvisioningRequests)
      .values({ projectId: req.projectId!, status: 'submitted', ...patch }).returning()
    res.json({ success: true, data: row })
  } catch (err) {
    console.error('[whatsapp/provisioning] upsert error:', err)
    res.status(500).json({ success: false, error: 'Failed to save provisioning request' })
  }
})

/** PATCH /api/whatsapp/provisioning/status — ops updates status/notes (admin). */
router.patch('/provisioning/status', requireProjectId, requireRole('admin'), async (req, res) => {
  try {
    const { status, opsNotes, errorReason, assignedTo } = (req.body ?? {}) as {
      status?: string; opsNotes?: string; errorReason?: string; assignedTo?: string
    }
    const [existing] = await db.select({ id: whatsappProvisioningRequests.id })
      .from(whatsappProvisioningRequests).where(eq(whatsappProvisioningRequests.projectId, req.projectId!)).limit(1)
    if (!existing) return res.status(404).json({ success: false, error: 'No provisioning request for this project' })

    const allowed = ['submitted', 'provisioning', 'active', 'error', 'cancelled']
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (status !== undefined) {
      if (!allowed.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' })
      patch.status = status
    }
    if (opsNotes !== undefined) patch.opsNotes = opsNotes
    if (errorReason !== undefined) patch.errorReason = errorReason
    if (assignedTo !== undefined) patch.assignedTo = assignedTo || null

    const [row] = await db.update(whatsappProvisioningRequests).set(patch)
      .where(eq(whatsappProvisioningRequests.id, existing.id)).returning()
    res.json({ success: true, data: row })
  } catch (err) {
    console.error('[whatsapp/provisioning] status error:', err)
    res.status(500).json({ success: false, error: 'Failed to update provisioning request' })
  }
})

/**
 * POST /api/whatsapp/provisioning/link — ops records the created WABA's creds to
 * complete provisioning. Reuses linkMetaWhatsappAccount, then flips the request
 * active (or records the error). Admin only.
 */
router.post('/provisioning/link', requireProjectId, requireRole('admin'), async (req, res) => {
  try {
    const { phoneNumberId, wabaId, accessToken } = (req.body ?? {}) as {
      phoneNumberId?: string; wabaId?: string; accessToken?: string
    }
    const result = await linkMetaWhatsappAccount(req.projectId!, {
      phoneNumberId: String(phoneNumberId ?? ''),
      wabaId: String(wabaId ?? ''),
      accessToken: String(accessToken ?? ''),
    })
    if (!result.ok) {
      await db.update(whatsappProvisioningRequests)
        .set({ status: 'error', errorReason: result.error, updatedAt: new Date() })
        .where(eq(whatsappProvisioningRequests.projectId, req.projectId!))
      return res.status(400).json({ success: false, error: result.error })
    }
    const [row] = await db.update(whatsappProvisioningRequests)
      .set({
        status: 'active',
        phoneNumberId: result.data.number.phoneNumberId,
        wabaId: result.data.number.wabaId,
        errorReason: null,
        provisionedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappProvisioningRequests.projectId, req.projectId!)).returning()
    res.json({ success: true, data: { request: row ?? null, link: result.data } })
  } catch (err) {
    console.error('[whatsapp/provisioning] link error:', err)
    res.status(500).json({ success: false, error: 'Failed to link provisioned account' })
  }
})

/**
 * POST /api/whatsapp/provisioning/register — register the number for the Cloud
 * API + set its 2-step PIN (the API-driven provisioning step, so ops doesn't do
 * it in the Meta dashboard). Admin only.
 */
router.post('/provisioning/register', requireProjectId, requireRole('admin'), async (req, res) => {
  try {
    const { phoneNumberId, accessToken, pin } = (req.body ?? {}) as { phoneNumberId?: string; accessToken?: string; pin?: string }
    const result = await registerWhatsappNumber(String(phoneNumberId ?? ''), String(accessToken ?? ''), String(pin ?? ''))
    if (!result.ok) return res.status(400).json({ success: false, error: result.error })
    res.json({ success: true, data: { registered: true } })
  } catch (err) {
    console.error('[whatsapp/provisioning/register] error:', err)
    res.status(500).json({ success: false, error: 'Failed to register number' })
  }
})

/**
 * GET /api/whatsapp/provisioning-queue — EVERY brand's provisioning request in
 * one list, for the onboarding team. Cross-tenant, so platform-admin only
 * (STOREES_PLATFORM_ADMINS allowlist). Read-only; the actual link/register
 * actions stay per-project (scoped by requireProjectId).
 */
router.get('/provisioning-queue', requirePlatformAdmin(), async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: whatsappProvisioningRequests.id,
        projectId: whatsappProvisioningRequests.projectId,
        projectName: projects.name,
        status: whatsappProvisioningRequests.status,
        businessName: whatsappProvisioningRequests.businessName,
        requestedNumber: whatsappProvisioningRequests.requestedNumber,
        contactEmail: whatsappProvisioningRequests.contactEmail,
        assignedTo: whatsappProvisioningRequests.assignedTo,
        submittedAt: whatsappProvisioningRequests.submittedAt,
        updatedAt: whatsappProvisioningRequests.updatedAt,
      })
      .from(whatsappProvisioningRequests)
      .innerJoin(projects, eq(projects.id, whatsappProvisioningRequests.projectId))
      .orderBy(desc(whatsappProvisioningRequests.submittedAt))
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('[whatsapp/provisioning-queue] error:', err)
    res.status(500).json({ success: false, error: 'Failed to load provisioning queue' })
  }
})

/**
 * GET /api/whatsapp/usage?projectId=...&days=30
 * Per-brand billable-conversation usage by category (marketing / utility /
 * authentication / service) + optional cost estimate.
 */
router.get('/usage', requireProjectId, async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
    const to = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
    const summary = await getUsageSummary(req.projectId!, from, to)
    res.json({ success: true, data: summary })
  } catch (err) {
    console.error('[whatsapp/usage] error:', err)
    res.status(500).json({ success: false, error: 'Failed to load WhatsApp usage' })
  }
})

/* ── WhatsApp Business profile (the brand's public identity) ──────────────── */

/** GET /api/whatsapp/profile — the brand's business profile + verified name. */
router.get('/profile', requireProjectId, async (req, res) => {
  try {
    const profile = await getBusinessProfile(req.projectId!)
    res.json({ success: true, data: profile })
  } catch (err) {
    // Not-connected / non-Meta is an expected state, not a 500.
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

/** PUT /api/whatsapp/profile — update editable profile fields (not the name). */
router.put('/profile', requireProjectId, requireRole('admin'), async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const patch: BusinessProfilePatch = {}
    for (const f of ['about', 'address', 'description', 'email', 'vertical'] as const) {
      if (f in body) patch[f] = body[f] == null ? '' : String(body[f])
    }
    if ('websites' in body) {
      patch.websites = Array.isArray(body.websites)
        ? (body.websites as unknown[]).map(String).filter(Boolean)
        : String(body.websites ?? '').split(',').map(s => s.trim()).filter(Boolean)
    }
    await updateBusinessProfile(req.projectId!, patch)
    const profile = await getBusinessProfile(req.projectId!)
    res.json({ success: true, data: profile })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

/** POST /api/whatsapp/profile/photo — set the profile photo from an image URL. */
router.post('/profile/photo', requireProjectId, requireRole('admin'), async (req, res) => {
  try {
    const imageUrl = String((req.body ?? {}).imageUrl ?? '').trim()
    if (!imageUrl) return res.status(400).json({ success: false, error: 'imageUrl is required' })
    await setProfilePhotoFromUrl(req.projectId!, imageUrl)
    const profile = await getBusinessProfile(req.projectId!)
    res.json({ success: true, data: profile })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.post('/connect-pinnacle', requireProjectId, async (req, res) => {
  try {
    const { apikey, phoneNumberId } = (req.body ?? {}) as { apikey?: string; phoneNumberId?: string }
    const rawApikey = String(apikey ?? '').trim()
    if (!rawApikey) {
      return res.status(400).json({ success: false, error: 'apikey is required' })
    }

    // 1. Discover accounts/numbers from the single secret.
    let accounts
    try {
      accounts = await pinnacleGetUserDetails(rawApikey)
    } catch (err) {
      console.warn('[whatsapp/connect-pinnacle] getuserdetails failed:', (err as Error).message)
      return res.status(400).json({ success: false, error: 'Key not recognised — could not fetch account details from Pinnacle' })
    }
    if (accounts.length === 0) {
      return res.status(400).json({ success: false, error: 'Key not recognised — no WhatsApp numbers found for this apikey' })
    }

    // 2. Resolve the sending number.
    const selected = phoneNumberId
      ? accounts.find(a => a.phoneNumberId === phoneNumberId)
      : accounts.length === 1 ? accounts[0] : undefined
    if (!selected) {
      return res.json({ success: true, data: { needsSelection: true, numbers: accounts } })
    }

    // 3. WABA info (namespace) — best-effort.
    const wabaInfo = await pinnacleGetWabaInfo(selected.wabaId, rawApikey).catch(() => ({ name: undefined, namespace: undefined }))

    // 4. Persist channel config. apikey encrypted; ids plaintext for routing.
    const waConfig: Record<string, string> = {
      apikey: encrypt(rawApikey),
      phoneNumberId: selected.phoneNumberId,
      wabaId: selected.wabaId,
      waNumber: selected.waNumber,
    }
    if (wabaInfo.namespace) waConfig.templateNamespace = wabaInfo.namespace

    const [project] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, req.projectId!)).limit(1)
    const settings = (project?.settings ?? {}) as Record<string, unknown>
    const existingChannels = (settings.channels ?? {}) as Record<string, { provider?: string; config?: Record<string, string> }>

    // Per-project webhook secret — generated here so delivery/read receipts work
    // WITHOUT any platform env. Reuse the existing one on reconnect so the already
    // registered callback keeps verifying. Encrypted at rest like the apikey.
    const existingWaConfig = existingChannels.whatsapp?.config ?? {}
    const webhookSecret = existingWaConfig.webhookSecret
      ? decrypt(existingWaConfig.webhookSecret)
      : crypto.randomBytes(24).toString('hex')
    waConfig.webhookSecret = encrypt(webhookSecret)

    // 5. Register the webhook (non-fatal) BEFORE persisting, using the per-project
    //    secret — no platform env required, so receipts work out of the box. The
    //    registered flag is stored in config so the connected card can show health.
    const appUrl = process.env.APP_URL
    let webhookRegistered = false
    if (appUrl) {
      try {
        await pinnacleSetWebhook(selected.phoneNumberId, rawApikey, `${appUrl}/api/webhooks/channel/whatsapp/pinnacle`, webhookSecret)
        webhookRegistered = true
        waConfig.webhookRegisteredAt = new Date().toISOString()
      } catch (err) {
        console.warn('[whatsapp/connect-pinnacle] setwebhook failed:', (err as Error).message)
      }
    } else {
      console.warn('[whatsapp/connect-pinnacle] APP_URL unset — skipping webhook registration')
    }

    // 6. Persist channel config (incl. the registration flag).
    const mergedChannels = { ...existingChannels, whatsapp: { provider: 'pinnacle', config: waConfig } }
    await db.execute(sql`
      UPDATE projects SET
        settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{channels}', ${JSON.stringify(mergedChannels)}::jsonb),
        updated_at = NOW()
      WHERE id = ${req.projectId!}
    `)
    clearProjectChannelProviderCache(req.projectId!)

    // 7. Import existing Pinnacle templates (non-fatal).
    let templatesImported = 0
    try {
      const sync = await syncWhatsappTemplatesForProject(req.projectId!)
      templatesImported = sync.count
    } catch (err) {
      console.warn('[whatsapp/connect-pinnacle] template import failed:', (err as Error).message)
    }

    res.json({
      success: true,
      data: {
        connected: true,
        provider: 'pinnacle',
        selectedNumber: { phoneNumberId: selected.phoneNumberId, waNumber: selected.waNumber, wabaId: selected.wabaId },
        numbers: accounts,
        webhookRegistered,
        templatesImported,
      },
    })
  } catch (err) {
    console.error('POST /whatsapp/connect-pinnacle error:', err)
    res.status(500).json({ success: false, error: 'Failed to connect Pinnacle WhatsApp' })
  }
})

export default router
