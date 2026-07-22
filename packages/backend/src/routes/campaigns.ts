import { Router } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { campaigns, campaignSends, campaignSubscriptionCategories, customers, projects, segments } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { resolveScopedAgentIds } from '../middleware/agentScope.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'
import {
  listCampaigns,
  getCampaignWithSegment,
  dispatchCampaign,
  previewCampaignAudience,
  previewCampaignAudienceConfig,
  duplicateCampaign,
} from '../services/campaignService.js'
import { lintCampaignContent } from '../services/contentLint.js'
import {
  getCampaignAnalytics,
  compareAbVariants,
} from '../services/campaignAnalyticsService.js'
import { lintTemplate, hasBlockingErrors } from '../services/templateLint.js'
import {
  deleteCampaignAttachments,
  listCampaignAttachments,
  persistCampaignAttachments,
  type CampaignAttachmentUpload,
} from '../services/campaignAttachmentService.js'
import { normalizeGmailAnnotation } from '../services/gmailAnnotation.js'
import { assertApprovedWhatsappCampaignTemplate } from '../services/whatsappCampaignValidation.js'
import { resolveTemplateVariables, type CustomerLike, type ProjectLike } from '../services/templateContext.js'
import { appendUtmParameters, interpolateTemplate, personalizeDynamicImages, sendEmail } from '../services/emailService.js'
import { injectGmailAnnotation } from '../services/gmailAnnotation.js'
import { loadResendAttachments } from '../services/campaignAttachmentService.js'
import type { CampaignUtmParameters, FilterConfig, GmailAnnotation, TemplateVariable } from '@storees/shared'
import { normalizeEmailList } from '@storees/shared'

const router = Router()

// Dealer RBAC helpers. A dealer owns the campaigns they create; admin owns all.
function isScopedDealer(req: AuthenticatedRequest): boolean {
  const role = req.adminUser?.role
  return role === 'agent' || role === 'manager'
}
function canManageCampaign(req: AuthenticatedRequest, c: { createdByAgentId: string | null }): boolean {
  const user = req.adminUser
  if (!user || user.role === 'admin') return true
  return !!user.agentId && c.createdByAgentId === user.agentId
}
// Owner precheck for action routes that load via a service (send/duplicate/archive).
// Returns true if the campaign exists in this project AND the caller may manage it.
async function callerOwnsCampaign(req: AuthenticatedRequest, id: string): Promise<boolean> {
  const [c] = await db
    .select({ projectId: campaigns.projectId, createdByAgentId: campaigns.createdByAgentId })
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1)
  return !!c && c.projectId === req.projectId && canManageCampaign(req, c)
}

function normalizeUtmParameters(value: unknown): CampaignUtmParameters | null {
  if (!value || typeof value !== 'object') return null
  const input = value as { enabled?: unknown; params?: unknown }
  const params = Array.isArray(input.params)
    ? input.params
        .map(item => {
          const row = item as { key?: unknown; value?: unknown }
          return { key: String(row.key ?? '').trim(), value: String(row.value ?? '').trim() }
        })
        .filter(item => item.key && item.value)
    : []
  return { enabled: Boolean(input.enabled) && params.length > 0, params }
}

function campaignFrom(campaign: typeof campaigns.$inferSelect, project: ProjectLike): string | null {
  const email = campaign.fromEmail ?? project.emailFromAddress
  if (!email) return null
  const name = campaign.fromName ?? project.emailFromName ?? project.name
  return name ? `${name} <${email}>` : email
}

function utmParams(value: CampaignUtmParameters | null | undefined) {
  if (!value?.enabled || !Array.isArray(value.params)) return []
  return value.params
    .map(param => ({ key: String(param.key ?? '').trim(), value: String(param.value ?? '').trim() }))
    .filter(param => param.key && param.value)
}

// GET /api/campaigns?projectId=&includeArchived=true&archivedOnly=true
// Default: active campaigns only, latest first.
router.get('/', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    // [] = admin (all), null = deny, [ids] = dealer's own campaigns only.
    const ownerAgentIds = await resolveScopedAgentIds(req)
    const rows = await listCampaigns(req.projectId!, {
      includeArchived: req.query.includeArchived === 'true',
      archivedOnly: req.query.archivedOnly === 'true',
      ownerAgentIds,
    })
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Campaign list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch campaigns' })
  }
})

// GET /api/campaigns/:id?projectId=
router.get('/:id', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string
    const campaign = await getCampaignWithSegment(id)
    if (!campaign || campaign.projectId !== req.projectId || !canManageCampaign(req, campaign)) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }
    res.json({ success: true, data: campaign })
  } catch (err) {
    console.error('Campaign detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch campaign' })
  }
})

// POST /api/campaigns?projectId=
router.post('/', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name, channel, deliveryType, subject, htmlBody, emailBuilderTemplate, bodyText,
      segmentId, fromName, fromEmail, replyToEmail, ccEmails, bccEmails, scheduledAt, contentType, previewText,
      gmailAnnotation,
      utmParameters,
      templateId, conversionGoals, goalTrackingHours, currency, pushPlatforms, pushContent, deliveryLimit, ignoreFrequencyCap, countForFrequencyCap,
      sendTimeMode, scheduleTimezone,
      periodicSchedule, abTestEnabled, abSplitPct, abVariantBSubject,
      abVariantBHtmlBody, abVariantBBodyText, abWinnerMetric,
      abAutoSendWinner, abTestDurationHours,
      tags, audienceFilter, audienceCap, controlGroupPct,
      variables,
      subscriptionCategoryIds,
      excludeAudienceFilter,
      attachmentUploads,
    } = req.body as {
      name: string
      channel?: string
      deliveryType?: string
      subject?: string
      htmlBody?: string
      emailBuilderTemplate?: unknown
      bodyText?: string
      segmentId?: string
      fromName?: string
      fromEmail?: string
      replyToEmail?: string
      ccEmails?: string[]
      bccEmails?: string[]
      gmailAnnotation?: unknown
      utmParameters?: unknown
      scheduledAt?: string
      contentType?: string
      previewText?: string
      templateId?: string
      conversionGoals?: unknown[]
      goalTrackingHours?: number
      currency?: string | null
      pushPlatforms?: unknown
      pushContent?: unknown
      deliveryLimit?: number | null
      ignoreFrequencyCap?: boolean
      countForFrequencyCap?: boolean
      sendTimeMode?: string
      scheduleTimezone?: string | null
      periodicSchedule?: unknown
      abTestEnabled?: boolean
      abSplitPct?: number
      abVariantBSubject?: string
      abVariantBHtmlBody?: string
      abVariantBBodyText?: string
      abWinnerMetric?: string
      abAutoSendWinner?: boolean
      abTestDurationHours?: number
      tags?: string[]
      audienceFilter?: unknown   // FilterConfig — validated structurally at staging time
      excludeAudienceFilter?: unknown
      audienceCap?: number | null
      controlGroupPct?: number
      variables?: TemplateVariable[]
      subscriptionCategoryIds?: string[]
      attachmentUploads?: CampaignAttachmentUpload[]
    }

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' })
    }

    const ch = channel ?? 'email'
    if (ch === 'email' && (!subject?.trim() || !htmlBody?.trim())) {
      return res.status(400).json({ success: false, error: 'Email campaigns require subject and htmlBody' })
    }
    if ((ch === 'sms' || ch === 'push') && !bodyText?.trim()) {
      return res.status(400).json({ success: false, error: `${ch.toUpperCase()} campaigns require bodyText` })
    }
    if (ch === 'whatsapp') {
      try {
        await assertApprovedWhatsappCampaignTemplate(req.projectId!, templateId, variables)
      } catch (err) {
        return res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Invalid WhatsApp template' })
      }
    }
    if (ch === 'in_app' && !templateId) {
      return res.status(400).json({ success: false, error: 'In-App campaigns require an in-app template' })
    }

    // Audience-v2 validation. controlGroupPct must be in [0,50]; cap > 0 if set.
    const ctrlPct = Math.max(0, Math.min(50, Math.floor(controlGroupPct ?? 0)))
    if (audienceCap != null && audienceCap <= 0) {
      return res.status(400).json({ success: false, error: 'audienceCap must be positive when set' })
    }
    // Generate the deterministic-split seed only when the control group is actually in use
    const ctrlSeed = ctrlPct > 0 ? `cg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}` : null

    const variableIssues = lintTemplate({ variables, subject, htmlBody, bodyText })
    const abVariableIssues = abTestEnabled
      ? lintTemplate({ variables, subject: abVariantBSubject, htmlBody: abVariantBHtmlBody, bodyText: abVariantBBodyText })
      : []
    const blockingVariableIssues = [...variableIssues, ...abVariableIssues]
    if (hasBlockingErrors(blockingVariableIssues)) {
      return res.status(400).json({
        success: false,
        error: 'Campaign has invalid variables',
        issues: blockingVariableIssues,
      })
    }

    // Dealer RBAC: stamp ownership, and ensure a dealer can only target one of
    // their OWN segments (defense-in-depth on top of the send-side owner gate).
    let createdByAgentId: string | null = null
    if (isScopedDealer(req)) {
      if (!req.adminUser?.agentId) {
        return res.status(403).json({ success: false, error: 'No dealer scope assigned' })
      }
      createdByAgentId = req.adminUser.agentId
      if (segmentId) {
        const [seg] = await db
          .select({ createdByAgentId: segments.createdByAgentId })
          .from(segments)
          .where(and(eq(segments.id, segmentId), eq(segments.projectId, req.projectId!)))
          .limit(1)
        if (!seg || seg.createdByAgentId !== createdByAgentId) {
          return res.status(403).json({ success: false, error: 'You can only target your own segments' })
        }
      }
    }

    const [campaign] = await db.insert(campaigns).values({
      projectId: req.projectId!,
      name: name.trim(),
      channel: ch,
      deliveryType: deliveryType ?? 'one-time',
      subject: subject?.trim() ?? null,
      htmlBody: htmlBody ?? null,
      emailBuilderTemplate: ch === 'email' ? emailBuilderTemplate ?? null : null,
      bodyText: bodyText?.trim() ?? null,
      segmentId: segmentId ?? null,
      createdByAgentId,
      fromName: fromName?.trim() ?? null,
      fromEmail: fromEmail?.trim() || null,
      replyToEmail: replyToEmail?.trim() || null,
      ccEmails: normalizeEmailList(ccEmails),
      bccEmails: normalizeEmailList(bccEmails),
      gmailAnnotation: normalizeGmailAnnotation(gmailAnnotation),
      utmParameters: normalizeUtmParameters(utmParameters),
      contentType: contentType ?? 'promotional',
      previewText: previewText?.trim() ?? null,
      templateId: templateId ?? null,
      conversionGoals: conversionGoals ?? [],
      goalTrackingHours: goalTrackingHours ?? 36,
      currency: currency?.trim() || null,
      pushPlatforms: Array.isArray(pushPlatforms) ? pushPlatforms : [],
      pushContent: pushContent && typeof pushContent === 'object' ? pushContent : {},
      deliveryLimit: deliveryLimit ?? null,
      ignoreFrequencyCap: ignoreFrequencyCap ?? false,
      countForFrequencyCap: countForFrequencyCap ?? true,
      sendTimeMode: sendTimeMode ?? (scheduledAt ? 'fixed' : 'asap'),
      scheduleTimezone: scheduleTimezone?.trim() || null,
      periodicSchedule: periodicSchedule ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : 'draft',
      abTestEnabled: abTestEnabled ?? false,
      abSplitPct: abSplitPct ?? 50,
      abVariantBSubject: abVariantBSubject?.trim() ?? null,
      abVariantBHtmlBody: abVariantBHtmlBody ?? null,
      abVariantBBodyText: abVariantBBodyText?.trim() ?? null,
      abWinnerMetric: abWinnerMetric ?? 'open_rate',
      abAutoSendWinner: abAutoSendWinner ?? false,
      abTestDurationHours: abTestDurationHours ?? 4,
      tags: tags ?? [],
      audienceFilter: audienceFilter ?? null,
      excludeAudienceFilter: excludeAudienceFilter ?? null,
      audienceCap: audienceCap ?? null,
      controlGroupPct: ctrlPct,
      controlGroupSeed: ctrlSeed,
      variables: variables ?? [],
    }).returning()

    const categoryIds = [...new Set(subscriptionCategoryIds ?? [])]
    if (categoryIds.length > 0) {
      await db.insert(campaignSubscriptionCategories).values(
        categoryIds.map(categoryId => ({ campaignId: campaign.id, categoryId })),
      ).onConflictDoNothing()
    }
    const attachments = ch === 'email'
      ? await persistCampaignAttachments(campaign.id, attachmentUploads ?? [])
      : []

    // Phase E3.3 — content lint. Warnings only; never blocks creation.
    // Frontend surfaces these on the campaign review/send step.
    const lintFindings = ch === 'email'
      ? lintCampaignContent({ subject: subject ?? '', html: htmlBody ?? '', text: bodyText ?? null, variables: variables ?? [] })
      : []

    res.status(201).json({ success: true, data: { ...campaign, subscriptionCategoryIds: categoryIds, attachments, lintFindings } })
  } catch (err) {
    console.error('Campaign create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create campaign' })
  }
})

// POST /api/campaigns/lint?projectId= — preview content lint without persisting
// Lets the frontend live-preview warnings as the admin types.
router.post('/lint', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const { subject, htmlBody, bodyText, variables } = req.body as { subject?: string; htmlBody?: string; bodyText?: string; variables?: TemplateVariable[] }
    const findings = lintCampaignContent({
      subject: subject ?? '',
      html: htmlBody ?? '',
      text: bodyText ?? null,
      variables: variables ?? [],
    })
    res.json({ success: true, data: { findings } })
  } catch (err) {
    console.error('Lint error:', err)
    res.status(500).json({ success: false, error: 'Failed to lint content' })
  }
})

// POST /api/campaigns/audience-preview?projectId= — draft audience math without saving
router.post('/audience-preview', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      channel,
      segmentId,
      audienceFilter,
      excludeAudienceFilter,
      audienceCap,
      controlGroupPct,
      subscriptionCategoryIds,
      templateId,
    } = req.body as {
      channel?: string
      segmentId?: string | null
      audienceFilter?: FilterConfig | null
      excludeAudienceFilter?: FilterConfig | null
      audienceCap?: number | null
      controlGroupPct?: number
      subscriptionCategoryIds?: string[]
      templateId?: string | null
    }

    if (audienceCap != null && audienceCap <= 0) {
      return res.status(400).json({ success: false, error: 'audienceCap must be positive when set' })
    }

    const preview = await previewCampaignAudienceConfig({
      projectId: req.projectId!,
      channel,
      segmentId,
      audienceFilter,
      excludeAudienceFilter,
      audienceCap: audienceCap ?? null,
      controlGroupPct,
      subscriptionCategoryIds,
      templateId,
    })

    res.json({ success: true, data: preview })
  } catch (err) {
    console.error('Audience preview error:', err)
    res.status(500).json({ success: false, error: 'Failed to preview audience' })
  }
})

// PATCH /api/campaigns/:id?projectId=
router.patch('/:id', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string
    const {
      name, subject, htmlBody, emailBuilderTemplate, bodyText, segmentId, fromName, fromEmail, replyToEmail, ccEmails, bccEmails, scheduledAt,
      gmailAnnotation, utmParameters, templateId,
      contentType, previewText, conversionGoals, goalTrackingHours, currency, pushPlatforms, pushContent, deliveryLimit, ignoreFrequencyCap, countForFrequencyCap,
      sendTimeMode, scheduleTimezone,
      periodicSchedule, abTestEnabled, abSplitPct, abVariantBSubject, abVariantBHtmlBody,
      abVariantBBodyText, abWinnerMetric, abAutoSendWinner, abTestDurationHours,
      tags, audienceFilter, audienceCap, controlGroupPct,
      variables,
      subscriptionCategoryIds,
      excludeAudienceFilter,
      attachmentUploads,
      deleteAttachmentIds,
    } = req.body as {
      name?: string
      subject?: string
      htmlBody?: string
      emailBuilderTemplate?: unknown | null
      bodyText?: string
      segmentId?: string | null
      fromName?: string | null
      fromEmail?: string | null
      replyToEmail?: string | null
      ccEmails?: string[]
      bccEmails?: string[]
      gmailAnnotation?: unknown
      utmParameters?: unknown
      templateId?: string | null
      scheduledAt?: string | null
      contentType?: string
      previewText?: string | null
      conversionGoals?: unknown[]
      goalTrackingHours?: number
      currency?: string | null
      pushPlatforms?: unknown
      pushContent?: unknown
      deliveryLimit?: number | null
      ignoreFrequencyCap?: boolean
      countForFrequencyCap?: boolean
      sendTimeMode?: string
      scheduleTimezone?: string | null
      periodicSchedule?: unknown | null
      abTestEnabled?: boolean
      abSplitPct?: number
      abVariantBSubject?: string | null
      abVariantBHtmlBody?: string | null
      abVariantBBodyText?: string | null
      abWinnerMetric?: string
      abAutoSendWinner?: boolean
      abTestDurationHours?: number
      tags?: string[]
      audienceFilter?: unknown | null
      excludeAudienceFilter?: unknown | null
      audienceCap?: number | null
      controlGroupPct?: number
      variables?: TemplateVariable[]
      subscriptionCategoryIds?: string[]
      attachmentUploads?: CampaignAttachmentUpload[]
      deleteAttachmentIds?: string[]
    }

    const [existing] = await db
      .select({
        subject: campaigns.subject,
        htmlBody: campaigns.htmlBody,
        emailBuilderTemplate: campaigns.emailBuilderTemplate,
        bodyText: campaigns.bodyText,
        abTestEnabled: campaigns.abTestEnabled,
        abVariantBSubject: campaigns.abVariantBSubject,
        abVariantBHtmlBody: campaigns.abVariantBHtmlBody,
        abVariantBBodyText: campaigns.abVariantBBodyText,
        variables: campaigns.variables,
        excludeAudienceFilter: campaigns.excludeAudienceFilter,
        channel: campaigns.channel,
        templateId: campaigns.templateId,
        status: campaigns.status,
        projectId: campaigns.projectId,
        createdByAgentId: campaigns.createdByAgentId,
        controlGroupSeed: campaigns.controlGroupSeed,
      })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)

    if (!existing || existing.projectId !== req.projectId || !canManageCampaign(req, existing)) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    if (!['draft', 'scheduled'].includes(existing.status)) {
      return res.status(400).json({ success: false, error: 'Only draft or scheduled campaigns can be edited' })
    }

    const mergedVariables = (variables !== undefined ? variables : existing.variables) as TemplateVariable[]
    const variableIssues = lintTemplate({
      variables: mergedVariables,
      subject: subject !== undefined ? subject : existing.subject,
      htmlBody: htmlBody !== undefined ? htmlBody : existing.htmlBody,
      bodyText: bodyText !== undefined ? bodyText : existing.bodyText,
    })
    const nextAbEnabled = abTestEnabled !== undefined ? abTestEnabled : existing.abTestEnabled
    const abVariableIssues = nextAbEnabled
      ? lintTemplate({
        variables: mergedVariables,
        subject: abVariantBSubject !== undefined ? abVariantBSubject : existing.abVariantBSubject,
        htmlBody: abVariantBHtmlBody !== undefined ? abVariantBHtmlBody : existing.abVariantBHtmlBody,
        bodyText: abVariantBBodyText !== undefined ? abVariantBBodyText : existing.abVariantBBodyText,
      })
      : []
    const blockingVariableIssues = [...variableIssues, ...abVariableIssues]
    if (hasBlockingErrors(blockingVariableIssues)) {
      return res.status(400).json({
        success: false,
        error: 'Campaign has invalid variables',
        issues: blockingVariableIssues,
      })
    }
    if ((templateId !== undefined || variables !== undefined) && existing.channel === 'whatsapp') {
      try {
        await assertApprovedWhatsappCampaignTemplate(req.projectId!, templateId !== undefined ? templateId : existing.templateId, mergedVariables)
      } catch (err) {
        return res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Invalid WhatsApp template' })
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name.trim()
    if (subject !== undefined) updates.subject = subject?.trim() ?? null
    if (htmlBody !== undefined) updates.htmlBody = htmlBody
    if (emailBuilderTemplate !== undefined) updates.emailBuilderTemplate = emailBuilderTemplate
    if (bodyText !== undefined) updates.bodyText = bodyText?.trim() ?? null
    if (segmentId !== undefined) updates.segmentId = segmentId
    if (fromName !== undefined) updates.fromName = fromName
    if (fromEmail !== undefined) updates.fromEmail = fromEmail?.trim() || null
    if (replyToEmail !== undefined) updates.replyToEmail = replyToEmail?.trim() || null
    if (ccEmails !== undefined) updates.ccEmails = normalizeEmailList(ccEmails)
    if (bccEmails !== undefined) updates.bccEmails = normalizeEmailList(bccEmails)
    if (gmailAnnotation !== undefined) updates.gmailAnnotation = normalizeGmailAnnotation(gmailAnnotation)
    if (utmParameters !== undefined) updates.utmParameters = normalizeUtmParameters(utmParameters)
    if (templateId !== undefined) updates.templateId = templateId
    if (contentType !== undefined) updates.contentType = contentType
    if (previewText !== undefined) updates.previewText = previewText
    if (conversionGoals !== undefined) updates.conversionGoals = conversionGoals
    if (goalTrackingHours !== undefined) updates.goalTrackingHours = goalTrackingHours
    if (currency !== undefined) updates.currency = currency?.trim() || null
    if (pushPlatforms !== undefined) updates.pushPlatforms = Array.isArray(pushPlatforms) ? pushPlatforms : []
    if (pushContent !== undefined) updates.pushContent = pushContent && typeof pushContent === 'object' ? pushContent : {}
    if (deliveryLimit !== undefined) updates.deliveryLimit = deliveryLimit
    if (ignoreFrequencyCap !== undefined) updates.ignoreFrequencyCap = ignoreFrequencyCap
    if (countForFrequencyCap !== undefined) updates.countForFrequencyCap = countForFrequencyCap
    if (sendTimeMode !== undefined) updates.sendTimeMode = sendTimeMode
    if (scheduleTimezone !== undefined) updates.scheduleTimezone = scheduleTimezone?.trim() || null
    if (periodicSchedule !== undefined) updates.periodicSchedule = periodicSchedule
    if (scheduledAt !== undefined) {
      updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null
      updates.status = scheduledAt ? 'scheduled' : 'draft'
    }
    if (abTestEnabled !== undefined) updates.abTestEnabled = abTestEnabled
    if (abSplitPct !== undefined) updates.abSplitPct = abSplitPct
    if (abVariantBSubject !== undefined) updates.abVariantBSubject = abVariantBSubject
    if (abVariantBHtmlBody !== undefined) updates.abVariantBHtmlBody = abVariantBHtmlBody
    if (abVariantBBodyText !== undefined) updates.abVariantBBodyText = abVariantBBodyText
    if (abWinnerMetric !== undefined) updates.abWinnerMetric = abWinnerMetric
    if (abAutoSendWinner !== undefined) updates.abAutoSendWinner = abAutoSendWinner
    if (abTestDurationHours !== undefined) updates.abTestDurationHours = abTestDurationHours
    if (tags !== undefined) updates.tags = tags
    if (variables !== undefined) updates.variables = variables
    if (audienceFilter !== undefined) updates.audienceFilter = audienceFilter
    if (excludeAudienceFilter !== undefined) updates.excludeAudienceFilter = excludeAudienceFilter
    if (audienceCap !== undefined) {
      if (audienceCap !== null && audienceCap <= 0) {
        return res.status(400).json({ success: false, error: 'audienceCap must be positive when set' })
      }
      updates.audienceCap = audienceCap
    }
    if (controlGroupPct !== undefined) {
      const next = Math.max(0, Math.min(50, Math.floor(controlGroupPct)))
      updates.controlGroupPct = next
      // Mint a fresh seed when toggling ON; clear when going to 0. Don't
      // regenerate if already > 0 — keeps the split stable across edits.
      if (next === 0) {
        updates.controlGroupSeed = null
      } else if (existing.controlGroupSeed == null) {
        updates.controlGroupSeed = `cg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      }
    }

    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(eq(campaigns.id, id))
      .returning()

    if (subscriptionCategoryIds !== undefined) {
      const categoryIds = [...new Set(subscriptionCategoryIds)]
      await db
        .delete(campaignSubscriptionCategories)
        .where(eq(campaignSubscriptionCategories.campaignId, id))
      if (categoryIds.length > 0) {
        await db.insert(campaignSubscriptionCategories).values(
          categoryIds.map(categoryId => ({ campaignId: id, categoryId })),
        ).onConflictDoNothing()
      }
    }

    if (deleteAttachmentIds !== undefined) {
      await deleteCampaignAttachments(id, deleteAttachmentIds)
    }
    const newAttachments = await persistCampaignAttachments(id, attachmentUploads ?? [])
    const attachments = newAttachments.length > 0 || deleteAttachmentIds !== undefined
      ? await listCampaignAttachments(id)
      : undefined

    res.json({ success: true, data: {
      ...updated,
      subscriptionCategoryIds: subscriptionCategoryIds !== undefined
        ? [...new Set(subscriptionCategoryIds)]
        : undefined,
      attachments,
    } })
  } catch (err) {
    console.error('Campaign update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update campaign' })
  }
})

// DELETE /api/campaigns/:id?projectId=
router.delete('/:id', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string

    const [existing] = await db
      .select({ status: campaigns.status, projectId: campaigns.projectId, createdByAgentId: campaigns.createdByAgentId })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)

    if (!existing || existing.projectId !== req.projectId || !canManageCampaign(req, existing)) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    if (existing.status === 'sending') {
      return res.status(400).json({ success: false, error: 'Cannot delete a campaign that is currently sending' })
    }

    await db.delete(campaigns).where(eq(campaigns.id, id))
    res.json({ success: true, data: { message: 'Campaign deleted' } })
  } catch (err) {
    console.error('Campaign delete error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete campaign' })
  }
})

// POST /api/campaigns/:id/archive?projectId=
// Sets archived_at = NOW. Idempotent (re-archiving a row updates the timestamp).
router.post('/:id/archive', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string
    if (!(await callerOwnsCampaign(req, id))) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }
    const [updated] = await db
      .update(campaigns)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.projectId, req.projectId!)))
      .returning()
    if (!updated) return res.status(404).json({ success: false, error: 'Campaign not found' })
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Campaign archive error:', err)
    res.status(500).json({ success: false, error: 'Failed to archive campaign' })
  }
})

// POST /api/campaigns/:id/unarchive?projectId=
router.post('/:id/unarchive', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string
    if (!(await callerOwnsCampaign(req, id))) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }
    const [updated] = await db
      .update(campaigns)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.projectId, req.projectId!)))
      .returning()
    if (!updated) return res.status(404).json({ success: false, error: 'Campaign not found' })
    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Campaign unarchive error:', err)
    res.status(500).json({ success: false, error: 'Failed to unarchive campaign' })
  }
})

// POST /api/campaigns/:id/duplicate?projectId=
// Clones the campaign as a fresh draft with " (Copy)" suffix. Counters reset.
router.post('/:id/duplicate', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string
    if (!(await callerOwnsCampaign(req, id))) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }
    const created = await duplicateCampaign(req.projectId!, id)
    // The copy is owned by whoever duplicated it (dealer → themselves).
    if (isScopedDealer(req) && req.adminUser?.agentId && created?.id) {
      await db.update(campaigns).set({ createdByAgentId: req.adminUser.agentId }).where(eq(campaigns.id, created.id))
    }
    res.status(201).json({ success: true, data: created })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to duplicate campaign'
    const status = msg.includes('not found') ? 404 : 500
    console.error('Campaign duplicate error:', err)
    res.status(status).json({ success: false, error: msg })
  }
})

// POST /api/campaigns/:id/send?projectId=[&force=true]
// Phase E3.2 — pre-flight stale-list audit. If >30% of the deliverable list
// hasn't opened any email in 90 days, return 409 with the audit; admin
// re-sends with ?force=true to override after acknowledging.
router.post('/:id/send', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string
    const force = req.query.force === 'true'

    // Ownership gate BEFORE dispatch — a dealer must never be able to trigger
    // another dealer's (or an admin's project-wide) campaign.
    if (!(await callerOwnsCampaign(req, id))) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    if (!force) {
      const audit = await previewCampaignAudience(id)
      if (audit.warning) {
        return res.status(409).json({
          success: false,
          error: 'stale_list_warning',
          data: audit,
        })
      }
    }

    const totalRecipients = await dispatchCampaign(id)
    res.json({ success: true, data: { message: `Campaign dispatched to ${totalRecipients} recipients`, totalRecipients } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to dispatch campaign'
    console.error('Campaign send error:', err)
    res.status(400).json({ success: false, error: msg })
  }
})

// GET /api/campaigns/:id/audience-preview?projectId= — pre-flight audit (no side effects)
router.get('/:id/audience-preview', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string
    if (!(await callerOwnsCampaign(req, id))) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }
    const audit = await previewCampaignAudience(id)
    res.json({ success: true, data: audit })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to preview audience'
    res.status(400).json({ success: false, error: msg })
  }
})

// POST /api/campaigns/:id/test-email?projectId= — render a saved email campaign with sample data and send to a test inbox.
router.post('/:id/test-email', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string
    const { to, sampleCustomerId } = req.body as { to?: string; sampleCustomerId?: string }
    const recipient = String(to ?? '').trim()
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return res.status(400).json({ success: false, error: 'A valid test email address is required' })
    }

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1)
    if (!campaign || campaign.projectId !== req.projectId || !canManageCampaign(req, campaign)) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }
    if (campaign.channel !== 'email') {
      return res.status(400).json({ success: false, error: 'Test email is only available for email campaigns' })
    }
    if (!campaign.subject?.trim() || !campaign.htmlBody?.trim()) {
      return res.status(400).json({ success: false, error: 'Email campaign requires subject and HTML body before test send' })
    }

    const [projectRow] = await db
      .select({
        id: projects.id,
        name: projects.name,
        emailFromAddress: projects.emailFromAddress,
        emailFromName: projects.emailFromName,
      })
      .from(projects)
      .where(eq(projects.id, campaign.projectId))
      .limit(1)
    const project: ProjectLike = projectRow ?? { id: campaign.projectId, name: '' }

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
    const [sample] = sampleCustomerId
      ? await db.select(customerSelect).from(customers).where(and(eq(customers.id, sampleCustomerId), eq(customers.projectId, campaign.projectId))).limit(1)
      : await db.select(customerSelect).from(customers).where(eq(customers.projectId, campaign.projectId)).orderBy(desc(customers.lastSeen)).limit(1)
    const customer: CustomerLike = sample ? sample as CustomerLike : {
      id: 'sample',
      email: recipient,
      name: 'Alex Rivera',
      customAttributes: {},
    }

    const context: Record<string, unknown> = resolveTemplateVariables({
      variables: (campaign.variables as TemplateVariable[]) ?? [],
      customer,
      project,
    })
    context.customer_email = recipient
    context.campaign_name = campaign.name
    const imageAttrs = customer.customAttributes && typeof customer.customAttributes === 'object'
      ? (customer.customAttributes as Record<string, unknown>).images
      : null
    context.recipient_images = imageAttrs && typeof imageAttrs === 'object' ? imageAttrs : {}

    const subject = interpolateTemplate(campaign.subject, context)
    const html = injectGmailAnnotation(
      appendUtmParameters(
        interpolateTemplate(personalizeDynamicImages(campaign.htmlBody, context), context),
        utmParams(campaign.utmParameters as CampaignUtmParameters | null),
        context,
      ),
      campaign.gmailAnnotation as GmailAnnotation | null,
    )
    const messageId = await sendEmail({
      to: recipient,
      subject,
      html,
      projectId: campaign.projectId,
      contentType: campaign.contentType === 'transactional' ? 'transactional' : 'promotional',
      from: campaignFrom(campaign, project),
      replyTo: campaign.replyToEmail,
      cc: normalizeEmailList(campaign.ccEmails),
      bcc: normalizeEmailList(campaign.bccEmails),
      attachments: await loadResendAttachments(campaign.id),
    })

    if (!messageId) {
      return res.status(502).json({ success: false, error: 'Provider did not return a message id' })
    }

    res.json({
      success: true,
      data: {
        messageId,
        to: recipient,
        sampleCustomer: { id: customer.id, name: customer.name ?? null, email: customer.email ?? null },
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send test email'
    console.error('Campaign test email error:', err)
    res.status(500).json({ success: false, error: msg })
  }
})

// POST /api/campaigns/:id/retry?projectId= — Retry failed recipients
router.post('/:id/retry', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string

    if (!(await callerOwnsCampaign(req, id))) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    // Reset failed sends back to pending
    const result = await db.update(campaignSends).set({
      status: 'pending',
    }).where(
      and(
        eq(campaignSends.campaignId, id),
        eq(campaignSends.status, 'failed'),
      ),
    )

    const retryCount = (result as { rowCount?: number }).rowCount ?? 0
    if (retryCount === 0) {
      return res.json({ success: true, data: { message: 'No failed recipients to retry', retryCount: 0 } })
    }

    // Reset campaign status to sending
    await db.update(campaigns).set({
      status: 'sending',
      updatedAt: new Date(),
    }).where(eq(campaigns.id, id))

    // Re-enqueue the campaign worker job
    const { campaignQueue } = await import('../services/queue.js')
    await campaignQueue.add('send-campaign', { campaignId: id })

    res.json({ success: true, data: { message: `Retrying ${retryCount} failed recipients`, retryCount } })
  } catch (err) {
    console.error('Campaign retry error:', err)
    res.status(500).json({ success: false, error: 'Failed to retry campaign' })
  }
})

// GET /api/campaigns/:id/sends?projectId=
router.get('/:id/sends', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string

    const [campaign] = await db
      .select({ projectId: campaigns.projectId, createdByAgentId: campaigns.createdByAgentId })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)

    if (!campaign || campaign.projectId !== req.projectId || !canManageCampaign(req, campaign)) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    const sends = await db
      .select()
      .from(campaignSends)
      .where(eq(campaignSends.campaignId, id))
      .orderBy(desc(campaignSends.createdAt))
      .limit(500)

    res.json({ success: true, data: sends })
  } catch (err) {
    console.error('Campaign sends error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch campaign sends' })
  }
})

// GET /api/campaigns/:id/analytics?projectId=
router.get('/:id/analytics', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string

    const [campaign] = await db
      .select({ projectId: campaigns.projectId, createdByAgentId: campaigns.createdByAgentId })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)

    if (!campaign || campaign.projectId !== req.projectId || !canManageCampaign(req, campaign)) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    // Gap 12: attribution-type + granularity query params drive the
    // conversion-count + timeline-bucket calculations.
    const attributionRaw = req.query.attributionType as string | undefined
    const attributionType = (attributionRaw === 'view_through' || attributionRaw === 'click_through' || attributionRaw === 'any')
      ? attributionRaw
      : 'any'
    const granularityRaw = req.query.granularity as string | undefined
    const granularity = (granularityRaw === 'day' || granularityRaw === 'week' || granularityRaw === 'hour')
      ? granularityRaw
      : 'hour'

    const analytics = await getCampaignAnalytics(id, { attributionType, granularity })
    res.json({ success: true, data: analytics })
  } catch (err) {
    console.error('Campaign analytics error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch campaign analytics' })
  }
})

// GET /api/campaigns/:id/ab-results?projectId=
router.get('/:id/ab-results', requireProjectId, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id as string

    const [campaign] = await db
      .select({ projectId: campaigns.projectId, createdByAgentId: campaigns.createdByAgentId })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)

    if (!campaign || campaign.projectId !== req.projectId || !canManageCampaign(req, campaign)) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    const results = await compareAbVariants(id)
    res.json({ success: true, data: results })
  } catch (err) {
    console.error('Campaign A/B results error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch A/B results' })
  }
})

export default router
