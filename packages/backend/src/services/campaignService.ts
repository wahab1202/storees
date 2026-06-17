import { eq, and, inArray, gt, gte, sql, desc } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../db/connection.js'
import {
  campaigns,
  campaignSends,
  campaignHoldouts,
  customers,
  customerSegments,
  segments,
  emailSuppressions,
  consents,
  events,
  projects,
  campaignSubscriptionCategories,
  customerSubscriptions,
  whatsappTemplates,
  whatsappInboundMessages,
  messages,
} from '../db/schema.js'
import { sendEmail, interpolateTemplate, appendUtmParameters, appendUtmParametersToText, personalizeDynamicImages } from './emailService.js'
import { copyCampaignAttachments, listCampaignAttachments, loadResendAttachments, type ResendAttachment } from './campaignAttachmentService.js'
import { injectGmailAnnotation } from './gmailAnnotation.js'
import { campaignQueue } from './queue.js'
import { resolveTemplateVariables, type CustomerLike, type ProjectLike } from './templateContext.js'
import { computeOptimalSendTime } from './sendTimeService.js'
import { assertApprovedWhatsappCampaignTemplate } from './whatsappCampaignValidation.js'
import { filterToSql } from '@storees/segments'
import type { TemplateVariable, FilterConfig } from '@storees/shared'
import type { CampaignUtmParameters, GmailAnnotation } from '@storees/shared'

// Page sizes tuned for 100K-recipient campaigns: bounded heap, bounded round-trips.
const RECIPIENT_PAGE_SIZE = 1000
const SEND_PAGE_SIZE = 500
const SEND_INSERT_BATCH = 500           // Postgres parameter limit safety
const PARALLEL_SENDS_PER_PAGE = 10      // bounded in-page concurrency to avoid provider rate-limit storms
const EMPTY_FILTER: FilterConfig = { logic: 'AND', rules: [] }

// Human-readable labels for a pre-send block (messages.block_reason), surfaced on
// the campaign Recipients tab so a skipped recipient explains itself instead of a
// bare "Failed". Falls back to the raw reason for any unmapped value.
const BLOCK_REASON_LABELS: Record<string, string> = {
  frequency_capped: 'Skipped — frequency cap reached',
  consent_blocked: 'Skipped — no marketing consent',
  no_channel_reachability: 'Skipped — not reachable on this channel',
  user_inactive: 'Skipped — user inactive',
}

/** Deterministic A/B variant assignment — same customer always gets same variant for a given campaign. */
function assignVariant(customerId: string, campaignId: string, isAb: boolean, splitPct: number): 'A' | 'B' | null {
  if (!isAb) return null
  const s = customerId + ':' + campaignId
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0
  return (Math.abs(h) % 100) < splitPct ? 'A' : 'B'
}

/**
 * Stable per-(customer, campaign-seed) bucket in [0, 100). Used by the control
 * group split — needs cryptographic spread (sha256 truncation) so adjacent UUIDs
 * don't cluster in the same bucket like a 31-multiplier hash would.
 */
function bucketHash(customerId: string, seed: string): number {
  const digest = crypto.createHash('sha256').update(`${seed}:${customerId}`).digest()
  // Take 4 bytes → 32-bit unsigned int; mod 100 for the bucket.
  const n = digest.readUInt32BE(0)
  return n % 100
}

type SendRow = typeof campaignSends.$inferSelect
type CampaignRow = typeof campaigns.$inferSelect
type CustomerInfo = CustomerLike

export type CampaignAudiencePreview = {
  totalCandidates: number
  reachable: number
  suppressed: number
  optedOut: number
  subscriptionBlocked: number
  serviceWindowBlocked: number
  frequencyCapped: number
  deliverable: number
  estimatedHoldouts: number
  estimatedRecipients: number
  audienceCap: number | null
  stalePct: number
  warning: string | null
}

export type CampaignAudiencePreviewInput = {
  projectId: string
  channel?: string
  segmentId?: string | null
  audienceFilter?: FilterConfig | null
  excludeAudienceFilter?: FilterConfig | null
  audienceCap?: number | null
  controlGroupPct?: number
  subscriptionCategoryIds?: string[]
  templateId?: string | null
  ignoreFrequencyCap?: boolean
}

function hasRules(filter: FilterConfig | null | undefined): filter is FilterConfig {
  return !!filter && filter.rules.length > 0
}

/**
 * Audit a campaign's audience for deliverability risks BEFORE we stage sends.
 * Returns counts of would-be-skipped (suppressed, opted-out) and would-be-stale
 * (no email_opened in last 90 days) recipients. The send route uses this to
 * block on a high stale ratio unless the admin acknowledges with ?force=true.
 *
 * Why 90 days: industry consensus for an "engaged" mailbox. After 6 months of
 * silence, mailbox providers materially down-weight sender reputation.
 */
export async function previewCampaignAudience(campaignId: string): Promise<{
  totalReachable: number
  suppressed: number
  optedOut: number
  neverOpened: number
  stalePct: number
  warning: string | null
}> {
  const [campaign] = await db
    .select({
      projectId: campaigns.projectId,
      segmentId: campaigns.segmentId,
      channel: campaigns.channel,
      audienceFilter: campaigns.audienceFilter,
      excludeAudienceFilter: campaigns.excludeAudienceFilter,
      audienceCap: campaigns.audienceCap,
      controlGroupPct: campaigns.controlGroupPct,
      templateId: campaigns.templateId,
      ignoreFrequencyCap: campaigns.ignoreFrequencyCap,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!campaign) throw new Error('Campaign not found')

  const categoryRows = await db
    .select({ categoryId: campaignSubscriptionCategories.categoryId })
    .from(campaignSubscriptionCategories)
    .where(eq(campaignSubscriptionCategories.campaignId, campaignId))

  const preview = await previewCampaignAudienceConfig({
    projectId: campaign.projectId,
    channel: campaign.channel,
    segmentId: campaign.segmentId,
    audienceFilter: campaign.audienceFilter as FilterConfig | null,
    excludeAudienceFilter: campaign.excludeAudienceFilter as FilterConfig | null,
    audienceCap: campaign.audienceCap,
    controlGroupPct: campaign.controlGroupPct,
    subscriptionCategoryIds: categoryRows.map(r => r.categoryId),
    templateId: campaign.templateId,
    ignoreFrequencyCap: campaign.ignoreFrequencyCap,
  })

  return {
    totalReachable: preview.reachable,
    suppressed: preview.suppressed,
    optedOut: preview.optedOut,
    neverOpened: preview.deliverable > 0 ? Math.round((preview.stalePct / 100) * preview.deliverable) : 0,
    stalePct: preview.stalePct,
    warning: preview.warning,
  }
}

export async function previewCampaignAudienceConfig(input: CampaignAudiencePreviewInput): Promise<CampaignAudiencePreview> {
  const channel = input.channel ?? 'email'
  const audienceFilter = hasRules(input.audienceFilter) ? input.audienceFilter : null
  const excludeAudienceFilter = hasRules(input.excludeAudienceFilter) ? input.excludeAudienceFilter : null
  const audienceCap = input.audienceCap ?? null
  const subscriptionCategoryIds = input.subscriptionCategoryIds ?? []
  const ctrlPct = Math.max(0, Math.min(50, Math.floor(input.controlGroupPct ?? 0)))

  let totalCandidates = 0
  let reachableCount = 0
  let suppressed = 0
  let optedOut = 0
  let subscriptionBlocked = 0
  let serviceWindowBlocked = 0
  let frequencyCapped = 0
  let deliverable = 0
  let stale = 0
  let cursor: string | null = null
  const requiresWhatsappServiceWindow = channel === 'whatsapp'
    ? await whatsappTemplateRequiresServiceWindow(input.projectId, input.templateId)
    : false

  // Frequency-cap simulation. Mirrors deliveryService.checkFrequencyCap so the
  // preview's deliverable count matches the real send instead of over-promising
  // (the trap where a preview shows N deliverable but the cap silently drops them).
  // Marketing only: WhatsApp UTILITY/AUTH templates and ignoreFrequencyCap bypass.
  const appliesFrequencyCap =
    !input.ignoreFrequencyCap && (channel === 'whatsapp' ? !requiresWhatsappServiceWindow : true)
  const { getProjectFreqCaps } = await import('./deliveryService.js')
  const freqCap = appliesFrequencyCap
    ? (await getProjectFreqCaps(input.projectId))[`${channel}_marketing`] ?? null
    : null

  while (true) {
    const excludeClause = excludeAudienceFilter ? sql`NOT (${filterToSql(excludeAudienceFilter)})` : undefined
    const page: Array<{ customerId: string; email: string | null; phone: string | null; pushSubscribed: boolean; customAttributes: unknown }>
      = audienceFilter
        ? await db
            .select({
              customerId: customers.id,
              email: customers.email,
              phone: customers.phone,
              pushSubscribed: customers.pushSubscribed,
              customAttributes: customers.customAttributes,
            })
            .from(customers)
            .where(and(
              eq(customers.projectId, input.projectId),
              cursor ? gt(customers.id, cursor) : undefined,
              filterToSql(audienceFilter),
              excludeClause,
            ))
            .orderBy(customers.id)
            .limit(RECIPIENT_PAGE_SIZE)
        : input.segmentId
        ? await db
            .select({
              customerId: customerSegments.customerId,
              email: customers.email,
              phone: customers.phone,
              pushSubscribed: customers.pushSubscribed,
              customAttributes: customers.customAttributes,
            })
            .from(customerSegments)
            .innerJoin(customers, eq(customers.id, customerSegments.customerId))
            .where(and(
              eq(customerSegments.segmentId, input.segmentId),
              cursor ? gt(customers.id, cursor) : undefined,
              excludeClause,
            ))
            .orderBy(customers.id)
            .limit(RECIPIENT_PAGE_SIZE)
        : await db
            .select({
              customerId: customers.id,
              email: customers.email,
              phone: customers.phone,
              pushSubscribed: customers.pushSubscribed,
              customAttributes: customers.customAttributes,
            })
            .from(customers)
            .where(and(
              eq(customers.projectId, input.projectId),
              cursor ? gt(customers.id, cursor) : undefined,
              excludeClause,
            ))
            .orderBy(customers.id)
            .limit(RECIPIENT_PAGE_SIZE)

    if (page.length === 0) break
    totalCandidates += page.length

    const reachable = page.filter(c => {
      if (channel === 'email') return !!c.email
      if (channel === 'sms' || channel === 'whatsapp') return !!c.phone
      if (channel === 'push') return c.pushSubscribed || !!asRecord(c.customAttributes)?.fcm_token
      return !!c.email
    })
    reachableCount += reachable.length
    let allowed = reachable

    if (channel === 'email' && reachable.length > 0) {
      const emails = reachable.map(c => c.email!.toLowerCase())
      const customerIds = reachable.map(c => c.customerId)
      const suppressedRows = await db
        .select({ email: emailSuppressions.email })
        .from(emailSuppressions)
        .where(and(
          eq(emailSuppressions.projectId, input.projectId),
          inArray(sql`lower(${emailSuppressions.email})`, emails),
        ))
      const suppressedSet = new Set(suppressedRows.map(r => r.email.toLowerCase()))
      const optedOutRows = await db
        .select({ customerId: consents.customerId })
        .from(consents)
        .where(and(
          eq(consents.projectId, input.projectId),
          eq(consents.channel, 'email'),
          eq(consents.purpose, 'promotional'),
          eq(consents.status, 'opted_out'),
          inArray(consents.customerId, customerIds),
        ))
      const optedOutSet = new Set(optedOutRows.map(r => r.customerId))
      suppressed += suppressedSet.size
      optedOut += optedOutSet.size
      allowed = allowed.filter(c => !suppressedSet.has(c.email!.toLowerCase()) && !optedOutSet.has(c.customerId))
    }

    if (subscriptionCategoryIds.length > 0 && allowed.length > 0) {
      const customerIds = allowed.map(c => c.customerId)
      const subscribedRows = await db
        .select({ customerId: customerSubscriptions.customerId })
        .from(customerSubscriptions)
        .where(and(
          eq(customerSubscriptions.projectId, input.projectId),
          inArray(customerSubscriptions.categoryId, subscriptionCategoryIds),
          inArray(customerSubscriptions.customerId, customerIds),
          sql`${customerSubscriptions.optedOutAt} IS NULL`,
        ))
      const subscribedSet = new Set(subscribedRows.map(r => r.customerId))
      const before = allowed.length
      allowed = allowed.filter(c => subscribedSet.has(c.customerId))
      subscriptionBlocked += before - allowed.length
    }

    if (requiresWhatsappServiceWindow && allowed.length > 0) {
      const customerIds = allowed.map(c => c.customerId)
      const recentRows = await db
        .select({ customerId: whatsappInboundMessages.customerId })
        .from(whatsappInboundMessages)
        .where(and(
          eq(whatsappInboundMessages.projectId, input.projectId),
          inArray(whatsappInboundMessages.customerId, customerIds),
          sql`${whatsappInboundMessages.receivedAt} >= NOW() - INTERVAL '24 hours'`,
        ))
      const recentSet = new Set(recentRows.map(r => r.customerId).filter(Boolean))
      const before = allowed.length
      allowed = allowed.filter(c => recentSet.has(c.customerId))
      serviceWindowBlocked += before - allowed.length
    }

    if (freqCap && freqCap.max > 0 && allowed.length > 0) {
      const customerIds = allowed.map(c => c.customerId)
      const countRows = await db
        .select({ customerId: messages.customerId, c: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(
          eq(messages.projectId, input.projectId),
          inArray(messages.customerId, customerIds),
          eq(messages.channel, channel),
          eq(messages.messageType, 'promotional'),
          eq(messages.countsTowardFrequencyCap, true),
          gte(messages.createdAt, sql`NOW() - (${freqCap.perDays}::int * INTERVAL '1 day')`),
        ))
        .groupBy(messages.customerId)
      const cappedSet = new Set(countRows.filter(r => r.c >= freqCap.max).map(r => r.customerId))
      const before = allowed.length
      allowed = allowed.filter(c => !cappedSet.has(c.customerId))
      frequencyCapped += before - allowed.length
    }

    if (channel === 'email' && allowed.length > 0) {
      const customerIds = allowed.map(c => c.customerId)
      // Use the typed query builder rather than a raw `ANY($1::uuid[])`
      // template — drizzle interpolates a JS array as a `($1, $2, ...)`
      // tuple, which Postgres treats as a record and refuses to cast to
      // uuid[] ("cannot cast type record to uuid[]"). project_id filter
      // also lets the planner use idx_events_customer.
      const recentlyOpenedRows = await db
        .selectDistinct({ customerId: events.customerId })
        .from(events)
        .where(and(
          eq(events.projectId, input.projectId),
          inArray(events.customerId, customerIds),
          inArray(events.eventName, ['email_opened', 'email_read']),
          sql`${events.timestamp} >= NOW() - INTERVAL '90 days'`,
        ))
      const recentlyOpened = new Set(recentlyOpenedRows.map(r => String(r.customerId)).filter(Boolean))
      stale += allowed.filter(c => !recentlyOpened.has(c.customerId)).length
    }

    deliverable += allowed.length
    cursor = page[page.length - 1].customerId
    if (page.length < RECIPIENT_PAGE_SIZE) break
  }

  const estimatedHoldouts = ctrlPct > 0 ? Math.floor((deliverable * ctrlPct) / 100) : 0
  const afterHoldout = Math.max(0, deliverable - estimatedHoldouts)
  const estimatedRecipients = audienceCap == null ? afterHoldout : Math.min(afterHoldout, audienceCap)
  const stalePct = channel === 'email' && deliverable > 0 ? Math.round((stale / deliverable) * 100) : 0
  const warning =
    stalePct > 30 && deliverable > 0
      ? `${stalePct}% of recipients haven't opened any email in the last 90 days. Sending may hurt deliverability.`
      : null

  return {
    totalCandidates,
    reachable: reachableCount,
    suppressed,
    optedOut,
    subscriptionBlocked,
    serviceWindowBlocked,
    frequencyCapped,
    deliverable,
    estimatedHoldouts,
    estimatedRecipients,
    audienceCap,
    stalePct,
    warning,
  }
}

async function whatsappTemplateRequiresServiceWindow(
  projectId: string,
  templateId: string | null | undefined,
): Promise<boolean> {
  if (!templateId) return false
  const [template] = await db
    .select({ category: whatsappTemplates.category })
    .from(whatsappTemplates)
    .where(and(
      eq(whatsappTemplates.id, templateId),
      eq(whatsappTemplates.projectId, projectId),
    ))
    .limit(1)
  return !!template?.category && template.category !== 'MARKETING'
}

/**
 * Fetch all customers in a segment who have an email address.
 * Returns the fresh member list (re-evaluates via junction table).
 */
export async function getCampaignRecipients(
  segmentId: string,
): Promise<Array<{ customerId: string; email: string; name: string | null }>> {
  const members = await db
    .select({
      customerId: customerSegments.customerId,
      email: customers.email,
      name: customers.name,
    })
    .from(customerSegments)
    .innerJoin(customers, eq(customers.id, customerSegments.customerId))
    .where(eq(customerSegments.segmentId, segmentId))

  // Filter customers who have a valid email
  return members.filter((m): m is typeof m & { email: string } => !!m.email)
}

/**
 * Dispatch a campaign for sending. Designed for 100K+ recipients without OOM.
 * - Streams recipients in pages (cursor on customers.id) — bounded heap regardless of segment size
 * - Inserts campaign_sends per page in 500-row batches
 * - Deterministic A/B assignment (no full-array shuffle)
 * - Enqueues a single worker job; processCampaign does the actual sends
 */
export async function dispatchCampaign(campaignId: string): Promise<number> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!campaign) throw new Error('Campaign not found')
  if (!['draft', 'scheduled'].includes(campaign.status)) {
    throw new Error(`Campaign cannot be sent: current status is "${campaign.status}"`)
  }
  const channel = campaign.channel ?? 'email'
  if (channel === 'whatsapp') {
    await assertApprovedWhatsappCampaignTemplate(
      campaign.projectId,
      campaign.templateId,
      campaign.variables as TemplateVariable[],
    )
    const whatsappTemplateId = campaign.templateId as string
    const [waTemplate] = await db
      .select({ category: whatsappTemplates.category })
      .from(whatsappTemplates)
      .where(and(
        eq(whatsappTemplates.id, whatsappTemplateId),
        eq(whatsappTemplates.projectId, campaign.projectId),
      ))
      .limit(1)
    if (waTemplate.category && waTemplate.category !== 'MARKETING') {
      console.log(`[campaign ${campaignId}] WhatsApp ${waTemplate.category} template requires recent inbound service-window eligibility`)
    }
  }
  const isAb = campaign.abTestEnabled ?? false
  const splitPct = campaign.abSplitPct ?? 50
  // Audience-v2 controls — all default to "no constraint" so legacy campaigns
  // (created before this column shipped) continue to behave identically.
  const audienceFilter = (campaign.audienceFilter ?? null) as FilterConfig | null
  const excludeAudienceFilter = (campaign.excludeAudienceFilter ?? null) as FilterConfig | null
  const audienceCap = campaign.audienceCap ?? null
  const ctrlPct = campaign.controlGroupPct ?? 0
  const ctrlSeed = campaign.controlGroupSeed ?? ''
  const subscriptionRows = await db
    .select({ categoryId: campaignSubscriptionCategories.categoryId })
    .from(campaignSubscriptionCategories)
    .where(eq(campaignSubscriptionCategories.campaignId, campaignId))
  const subscriptionCategoryIds = subscriptionRows.map(r => r.categoryId)

  let totalRecipients = 0
  let totalHoldouts = 0
  let cursor: string | null = null

  while (true) {
    // Stop early if the cap is satisfied — saves the rest of the audience pull.
    if (audienceCap != null && totalRecipients >= audienceCap) break

    // Fetch one page of candidate customers. Three audience modes, in priority
    // order: inline filter > saved segment > all-users.
    const remaining = audienceCap == null ? RECIPIENT_PAGE_SIZE : Math.min(RECIPIENT_PAGE_SIZE, audienceCap - totalRecipients)
    const pageLimit = Math.max(1, remaining)
    const excludeClause = hasRules(excludeAudienceFilter) ? sql`NOT (${filterToSql(excludeAudienceFilter)})` : undefined
    const page: Array<{ customerId: string; email: string | null; name: string | null; phone: string | null; pushSubscribed: boolean; customAttributes: unknown }>
      = hasRules(audienceFilter)
        ? await db
            .select({
              customerId: customers.id,
              email: customers.email,
	              name: customers.name,
	              phone: customers.phone,
	              pushSubscribed: customers.pushSubscribed,
	              customAttributes: customers.customAttributes,
            })
            .from(customers)
            .where(and(
              eq(customers.projectId, campaign.projectId),
              cursor ? gt(customers.id, cursor) : undefined,
              filterToSql(audienceFilter),
              excludeClause,
            ))
            .orderBy(customers.id)
            .limit(pageLimit)
        : campaign.segmentId
        ? await db
            .select({
              customerId: customerSegments.customerId,
              email: customers.email,
	              name: customers.name,
	              phone: customers.phone,
	              pushSubscribed: customers.pushSubscribed,
	              customAttributes: customers.customAttributes,
            })
            .from(customerSegments)
            .innerJoin(customers, eq(customers.id, customerSegments.customerId))
            .where(cursor
              ? and(eq(customerSegments.segmentId, campaign.segmentId), gt(customers.id, cursor), excludeClause)
              : and(eq(customerSegments.segmentId, campaign.segmentId), excludeClause))
            .orderBy(customers.id)
            .limit(pageLimit)
        : await db
            .select({
              customerId: customers.id,
              email: customers.email,
	              name: customers.name,
	              phone: customers.phone,
	              pushSubscribed: customers.pushSubscribed,
	              customAttributes: customers.customAttributes,
            })
            .from(customers)
            .where(cursor
              ? and(eq(customers.projectId, campaign.projectId), gt(customers.id, cursor), excludeClause)
              : and(eq(customers.projectId, campaign.projectId), excludeClause))
            .orderBy(customers.id)
            .limit(pageLimit)

    if (page.length === 0) break

    // 1. Filter by channel reachability
    const reachable = page.filter(c => {
      if (channel === 'email') return !!c.email
      if (channel === 'sms' || channel === 'whatsapp') return !!c.phone
      // Push: a device token is what makes delivery possible (and, per the consent
      // policy, implies consent). push_subscribed alone (no token) can't deliver,
      // so accept either — consistent with checkConsent.
      if (channel === 'push') return c.pushSubscribed || !!asRecord(c.customAttributes)?.fcm_token
      return !!c.email
    })

    // 2. Filter by suppression + consent (deliverability gates).
    //    Two cheap per-page lookups: O(1000) IN-list each, bounded round-trips.
    let allowed = reachable
    if (channel === 'email' && reachable.length > 0) {
      const emails = reachable.map(c => c.email!.toLowerCase())
      const customerIds = reachable.map(c => c.customerId)

      const suppressedRows = await db
        .select({ email: emailSuppressions.email })
        .from(emailSuppressions)
        .where(and(
          eq(emailSuppressions.projectId, campaign.projectId),
          inArray(sql`lower(${emailSuppressions.email})`, emails),
        ))
      const suppressedSet = new Set(suppressedRows.map(r => r.email.toLowerCase()))

      const optedOutRows = await db
        .select({ customerId: consents.customerId })
        .from(consents)
        .where(and(
          eq(consents.projectId, campaign.projectId),
          eq(consents.channel, 'email'),
          eq(consents.purpose, 'promotional'),
          eq(consents.status, 'opted_out'),
          inArray(consents.customerId, customerIds),
        ))
      const optedOutSet = new Set(optedOutRows.map(r => r.customerId))

      const before = allowed.length
      allowed = reachable.filter(c => !suppressedSet.has(c.email!.toLowerCase()) && !optedOutSet.has(c.customerId))
      const excluded = before - allowed.length
      if (excluded > 0) {
        console.log(`[campaign ${campaignId}] page-skip ${excluded} (suppressed=${suppressedSet.size}, opted_out=${optedOutSet.size})`)
      }
    }

    if (subscriptionCategoryIds.length > 0 && allowed.length > 0) {
      const customerIds = allowed.map(c => c.customerId)
      const subscribedRows = await db
        .select({ customerId: customerSubscriptions.customerId })
        .from(customerSubscriptions)
        .where(and(
          eq(customerSubscriptions.projectId, campaign.projectId),
          inArray(customerSubscriptions.categoryId, subscriptionCategoryIds),
          inArray(customerSubscriptions.customerId, customerIds),
          sql`${customerSubscriptions.optedOutAt} IS NULL`,
        ))
      const subscribedSet = new Set(subscribedRows.map(r => r.customerId))
      const before = allowed.length
      allowed = allowed.filter(c => subscribedSet.has(c.customerId))
      const excluded = before - allowed.length
      if (excluded > 0) {
        console.log(`[campaign ${campaignId}] page-skip ${excluded} (subscription_category_blocked)`)
      }
    }

    if (channel === 'whatsapp' && campaign.templateId && allowed.length > 0) {
      const [waTemplate] = await db
        .select({ category: whatsappTemplates.category })
        .from(whatsappTemplates)
        .where(eq(whatsappTemplates.id, campaign.templateId))
        .limit(1)
      if (waTemplate?.category && waTemplate.category !== 'MARKETING') {
        const customerIds = allowed.map(c => c.customerId)
        const recentRows = await db
          .select({ customerId: whatsappInboundMessages.customerId })
          .from(whatsappInboundMessages)
          .where(and(
            eq(whatsappInboundMessages.projectId, campaign.projectId),
            inArray(whatsappInboundMessages.customerId, customerIds),
            sql`${whatsappInboundMessages.receivedAt} >= NOW() - INTERVAL '24 hours'`,
          ))
        const recentSet = new Set(recentRows.map(r => r.customerId).filter(Boolean))
        const before = allowed.length
        allowed = allowed.filter(c => recentSet.has(c.customerId))
        const excluded = before - allowed.length
        if (excluded > 0) {
          console.log(`[campaign ${campaignId}] page-skip ${excluded} (outside_whatsapp_24h_service_window)`)
        }
      }
    }

    if (allowed.length > 0) {
      // Control-group split. Deterministic hash of (customerId + seed) → bucket
      // 0..99; held back if bucket < ctrlPct. Same customer always falls in
      // the same bucket for a given campaign, so re-runs are reproducible and
      // the seed makes the split auditable across reschedules.
      const heldOut: typeof allowed = []
      const recipients: typeof allowed = []
      for (const r of allowed) {
        if (ctrlPct > 0 && bucketHash(r.customerId, ctrlSeed) < ctrlPct) {
          heldOut.push(r)
        } else {
          recipients.push(r)
        }
      }

      // Cap enforcement — trim recipients (NOT holdouts) to fit the remaining
      // budget. Holdouts are always recorded regardless of cap because they
      // represent the experimental control, not "send-eligible" load.
      let toSend = recipients
      if (audienceCap != null) {
        const remaining = Math.max(0, audienceCap - totalRecipients)
        if (toSend.length > remaining) toSend = toSend.slice(0, remaining)
      }

      if (heldOut.length > 0) {
        const holdoutRows = heldOut.map(r => ({
          campaignId,
          customerId: r.customerId,
          reason: 'control_group' as const,
        }))
        for (let i = 0; i < holdoutRows.length; i += SEND_INSERT_BATCH) {
          await db.insert(campaignHoldouts)
            .values(holdoutRows.slice(i, i + SEND_INSERT_BATCH))
            .onConflictDoNothing()
        }
        totalHoldouts += heldOut.length
      }

      if (toSend.length > 0) {
        const sendRows = await Promise.all(toSend.map(async r => ({
          campaignId,
          customerId: r.customerId,
          email: r.email ?? '',
          status: 'pending' as const,
          variant: assignVariant(r.customerId, campaignId, isAb, splitPct),
          scheduledAt: await resolveRecipientScheduledAt(campaign, {
              id: r.customerId,
              email: r.email,
              phone: r.phone,
              name: r.name,
              customAttributes: asRecord(r.customAttributes),
            }) ?? null,
        })))
        let insertedRecipients = 0
        // Postgres parameter-limit safety
        for (let i = 0; i < sendRows.length; i += SEND_INSERT_BATCH) {
          const inserted = await db.insert(campaignSends)
            .values(sendRows.slice(i, i + SEND_INSERT_BATCH))
            .onConflictDoNothing()
            .returning({ id: campaignSends.id })
          insertedRecipients += inserted.length
        }
        totalRecipients += insertedRecipients
      }
    }

    cursor = page[page.length - 1].customerId
    if (page.length < RECIPIENT_PAGE_SIZE) break
  }

  if (totalRecipients === 0 && totalHoldouts === 0) {
    throw new Error(`No reachable customers found for ${channel} campaign`)
  }
  if (totalRecipients === 0) {
    throw new Error('Audience produced 0 recipients (everyone fell into the control group). Reduce control_group_pct.')
  }

  await db.update(campaigns).set({
    status: 'sending',
    totalRecipients,
    updatedAt: new Date(),
  }).where(eq(campaigns.id, campaignId))

  await campaignQueue.add('send-campaign', { campaignId })

  console.log(
    `Campaign "${campaign.name}" dispatched — ${totalRecipients} recipients` +
    (totalHoldouts > 0 ? `, ${totalHoldouts} held back as control` : '') +
    (audienceCap != null && totalRecipients >= audienceCap ? ` (capped at ${audienceCap})` : ''),
  )
  return totalRecipients
}

/**
 * Process a campaign: route to correct channel (email, SMS, push, WhatsApp).
 * Designed for 100K+ recipients without OOM or DB pool starvation:
 *   - Pulls pending sends in pages of SEND_PAGE_SIZE (cursor on campaignSends.id)
 *   - Batch-fetches customer rows for the whole page in ONE query
 *   - Sends concurrently within the page (PARALLEL_SENDS_PER_PAGE workers)
 *   - Bulk-updates failures per page (one UPDATE per status group)
 *   - Sent rows are updated per-row inside sendOne (each carries a unique providerMessageId)
 */
export async function processCampaign(campaignId: string): Promise<void> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!campaign || campaign.status !== 'sending') return

  const channel = campaign.channel ?? 'email'

  // Fetch project once per campaign — same for every recipient. Used by the
  // template-variable resolver for {{store_name}} / {{email_from_address}}.
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

  let sentCount = campaign.sentCount
  let failedCount = campaign.failedCount
  let cursor: string | null = null
  const emailAttachments = channel === 'email' ? await loadResendAttachments(campaign.id) : []
  const rateLimitPerMinute = campaign.deliveryLimit != null && campaign.deliveryLimit > 0
    ? campaign.deliveryLimit
    : null
  const rateState = { sentInWindow: 0, windowStartedAt: Date.now() }

	  while (true) {
	    const dueClause = sql`(${campaignSends.scheduledAt} IS NULL OR ${campaignSends.scheduledAt} <= NOW())`
	    const pageSends: SendRow[] = await db
	      .select()
	      .from(campaignSends)
	      .where(cursor
	        ? and(eq(campaignSends.campaignId, campaignId), eq(campaignSends.status, 'pending'), dueClause, gt(campaignSends.id, cursor))
	        : and(eq(campaignSends.campaignId, campaignId), eq(campaignSends.status, 'pending'), dueClause))
	      .orderBy(campaignSends.id)
	      .limit(SEND_PAGE_SIZE)

	    if (pageSends.length === 0) {
	      const nextPendingAt = await getNextPendingSendAt(campaignId)
	      if (nextPendingAt) {
	        const delay = Math.max(1000, nextPendingAt.getTime() - Date.now())
	        await campaignQueue.add('send-campaign', { campaignId }, { delay })
	        console.log(`[campaign ${campaignId}] paused until next scheduled recipient at ${nextPendingAt.toISOString()}`)
	        return
	      }
	      break
	    }

    // Batch-fetch all customers for this page in one query — pull every field
    // the variable resolver might read (region, city, totals, dates) so we
    // don't re-query per-recipient.
    const customerIds = pageSends.map(s => s.customerId)
    const customerRows = await db
      .select({
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
      })
      .from(customers)
      .where(inArray(customers.id, customerIds))
    const customerMap = new Map<string, CustomerInfo>(
      customerRows.map(c => [c.id, c as CustomerInfo]),
    )

    // Bounded-parallel processing within the page
    const results: Array<{ id: string; success: boolean }> = []
    let i = 0
    while (i < pageSends.length) {
      const chunkSize = await nextCampaignChunkSize(rateLimitPerMinute, rateState, PARALLEL_SENDS_PER_PAGE)
      const chunk = pageSends.slice(i, i + chunkSize)
      const chunkResults = await Promise.all(
        chunk.map(send => sendOneRecipient(send, customerMap.get(send.customerId), campaign, channel, project, emailAttachments)),
      )
      results.push(...chunkResults)
      rateState.sentInWindow += chunk.length
      i += chunk.length
    }

    // Bulk UPDATE failures (sent rows are updated per-row inside sendOneRecipient because each
    // carries a unique providerMessageId we want to persist on the campaign_sends row)
    const failedIds = results.filter(r => !r.success).map(r => r.id)
    if (failedIds.length > 0) {
      await db.update(campaignSends).set({ status: 'failed' }).where(inArray(campaignSends.id, failedIds))
    }

    sentCount += results.length - failedIds.length
    failedCount += failedIds.length

    // Aggregate update once per page (not per recipient) — bounded round-trips
    await db.update(campaigns).set({
      sentCount, failedCount, updatedAt: new Date(),
    }).where(eq(campaigns.id, campaignId))

    cursor = pageSends[pageSends.length - 1].id
	    if (pageSends.length < SEND_PAGE_SIZE) {
	      const nextPendingAt = await getNextPendingSendAt(campaignId)
	      if (nextPendingAt) {
	        const delay = Math.max(1000, nextPendingAt.getTime() - Date.now())
	        await campaignQueue.add('send-campaign', { campaignId }, { delay })
	        console.log(`[campaign ${campaignId}] processed due recipients, next scheduled at ${nextPendingAt.toISOString()}`)
	        return
	      }
	      break
	    }
	  }

  await db.update(campaigns).set({
    status: 'sent',
    sentAt: new Date(),
    sentCount,
    failedCount,
    updatedAt: new Date(),
  }).where(eq(campaigns.id, campaignId))

  console.log(`Campaign "${campaign.name}" [${channel}] completed — ${sentCount} sent, ${failedCount} failed`)
}

async function sendOneRecipient(
  send: SendRow,
  customer: CustomerInfo | undefined,
  campaign: CampaignRow,
  channel: string,
  project: ProjectLike,
  emailAttachments: ResendAttachment[],
): Promise<{ id: string; success: boolean }> {
  // Variable mapping declared on the campaign at save-time. Resolved against
  // this recipient's customer row + project row to produce the substitution
  // map. Replaces the old hardcoded { customer_name, customer_email,
  // store_name } context — those three keys still come back automatically as
  // defaults inside the resolver.
  const customerLike: CustomerLike = customer ?? { id: send.customerId, email: send.email }
  const templateContext: Record<string, unknown> = resolveTemplateVariables({
    variables: (campaign.variables as TemplateVariable[]) ?? [],
    customer: customerLike,
    project,
  })
  // send.email is the authoritative recipient address — it may differ from
  // customer.email if the audience was overridden. Stamp it onto the context
  // so {{customer_email}} reflects what we're actually sending to.
  templateContext.customer_email = send.email
  templateContext.campaign_name = campaign.name
  templateContext.recipient_images = readRecipientImages(customerLike)
  const deliveryScheduledAt = undefined

  if (channel === 'email') {
    const useVariantB = send.variant === 'B' && campaign.abTestEnabled
    const rawSubject = useVariantB && campaign.abVariantBSubject ? campaign.abVariantBSubject : campaign.subject ?? ''
    const rawHtml = useVariantB && campaign.abVariantBHtmlBody ? campaign.abVariantBHtmlBody : campaign.htmlBody ?? ''
    const subject = interpolateTemplate(rawSubject, templateContext)
    const personalizedHtml = personalizeDynamicImages(rawHtml, templateContext)
    const htmlWithVariables = interpolateTemplate(personalizedHtml, templateContext)
    const htmlWithUtm = appendUtmParameters(
      htmlWithVariables,
      normalizeUtmParameters(campaign.utmParameters as CampaignUtmParameters | null),
      templateContext,
    )
    const html = injectGmailAnnotation(
      htmlWithUtm,
      campaign.gmailAnnotation as GmailAnnotation | null,
    )
    const from = formatCampaignFrom(campaign, project)

    try {
      const messageId = await sendEmail({
        to: send.email,
        subject,
        html,
        projectId: campaign.projectId,
        contentType: campaign.contentType === 'transactional' ? 'transactional' : 'promotional',
        from,
        replyTo: campaign.replyToEmail,
        cc: normalizeEmailList(campaign.ccEmails),
        bcc: normalizeEmailList(campaign.bccEmails),
        attachments: emailAttachments,
      })
      if (messageId) {
        await db.update(campaignSends).set({
          status: 'sent', sentAt: new Date(), resendMessageId: messageId,
        }).where(eq(campaignSends.id, send.id))
        return { id: send.id, success: true }
      }
    } catch (err) {
      console.error(`Campaign email send failed for ${send.customerId}:`, err)
    }
    return { id: send.id, success: false }
  }

  // SMS, Push, WhatsApp via delivery service
  try {
    const { send: deliverySend } = await import('./deliveryService.js')
    const utmParams = normalizeUtmParameters(campaign.utmParameters as CampaignUtmParameters | null)
    const messageWithImages = personalizeDynamicImages(campaign.bodyText ?? '', templateContext)
    const renderedMessage = interpolateTemplate(messageWithImages, templateContext)
    const imageWithImages = personalizeDynamicImages(campaign.previewText ?? '', templateContext)
    const variables: Record<string, string> = {
      ...templateContext,
      message: appendUtmParametersToText(renderedMessage, utmParams, templateContext),
      title: interpolateTemplate(campaign.subject ?? '', templateContext),
      ...(campaign.previewText ? { image: interpolateTemplate(imageWithImages, templateContext) } : {}),
    }
    const msgId = await deliverySend({
      projectId: campaign.projectId,
      userId: send.customerId,
      channel: channel as 'sms' | 'push' | 'whatsapp',
      templateId: campaign.templateId ?? '',
      variables,
      messageType: (campaign.contentType ?? 'promotional') as 'promotional' | 'transactional',
      campaignId: campaign.id,
      ignoreFrequencyCap: campaign.ignoreFrequencyCap,
      countForFrequencyCap: campaign.countForFrequencyCap,
      scheduledAt: deliveryScheduledAt,
    })
    if (msgId) {
      await db.update(campaignSends).set({
        status: 'sent', sentAt: new Date(),
      }).where(eq(campaignSends.id, send.id))
      return { id: send.id, success: true }
    }
    // deliverySend returned null = a pre-send gate blocked this recipient
    // (frequency cap, consent, reachability). It recorded a `messages` row with a
    // block_reason but no campaign_sends reason, so the Recipients tab showed a
    // blank "Failed". Surface that reason here. (Provider-level send failures are
    // mirrored separately by executeSend → mirrorCampaignReceipt.) The bulk
    // status='failed' update in the caller only sets status, so this survives.
    const [blocked] = await db
      .select({ blockReason: messages.blockReason })
      .from(messages)
      .where(and(eq(messages.campaignId, campaign.id), eq(messages.customerId, send.customerId)))
      .orderBy(desc(messages.createdAt))
      .limit(1)
    if (blocked?.blockReason) {
      await db.update(campaignSends)
        .set({ failureReason: BLOCK_REASON_LABELS[blocked.blockReason] ?? blocked.blockReason })
        .where(eq(campaignSends.id, send.id))
    }
  } catch (err) {
    console.error(`Campaign ${channel} send failed for ${send.customerId}:`, err)
  }
  return { id: send.id, success: false }
}

function normalizeEmailList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(v => String(v).trim()).filter(Boolean)
    : []
}

async function nextCampaignChunkSize(
  limitPerMinute: number | null,
  state: { sentInWindow: number; windowStartedAt: number },
  maxChunk: number,
): Promise<number> {
  if (!limitPerMinute) return maxChunk
  const now = Date.now()
  const elapsed = now - state.windowStartedAt
  if (elapsed >= 60_000) {
    state.windowStartedAt = now
    state.sentInWindow = 0
  }
  const remaining = Math.max(0, limitPerMinute - state.sentInWindow)
  if (remaining > 0) return Math.max(1, Math.min(maxChunk, remaining))

  const waitMs = Math.max(50, 60_000 - elapsed)
  await sleep(waitMs)
  state.windowStartedAt = Date.now()
  state.sentInWindow = 0
  return Math.max(1, Math.min(maxChunk, limitPerMinute))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getNextPendingSendAt(campaignId: string): Promise<Date | null> {
  const [next] = await db
    .select({ scheduledAt: campaignSends.scheduledAt })
    .from(campaignSends)
    .where(and(
      eq(campaignSends.campaignId, campaignId),
      eq(campaignSends.status, 'pending'),
      sql`${campaignSends.scheduledAt} IS NOT NULL`,
    ))
    .orderBy(campaignSends.scheduledAt)
    .limit(1)
  return next?.scheduledAt ?? null
}

async function resolveRecipientScheduledAt(
  campaign: CampaignRow,
  customer: CustomerLike,
): Promise<Date | undefined> {
  const mode = campaign.sendTimeMode ?? 'asap'
  if (mode === 'asap') return undefined
  if (mode === 'fixed') return campaign.scheduledAt ?? undefined

  const base = campaign.scheduledAt ?? new Date()
  const timezone = readCustomerTimezone(customer) ?? campaign.scheduleTimezone ?? 'UTC'
  if (mode === 'user_timezone') {
    return nextLocalDateTime(base, timezone)
  }
  if (mode === 'best_time') {
    const best = await computeOptimalSendTime(customer.id, campaign.projectId)
    const hour = best.best_send_hour ?? 10
    return nextLocalDateTime(setUtcHour(base, hour), timezone)
  }
  return undefined
}

function readCustomerTimezone(customer: CustomerLike): string | null {
  const attrs = customer.customAttributes
  if (!attrs || typeof attrs !== 'object') return null
  const raw = attrs.timezone ?? attrs.time_zone ?? attrs.tz
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function setUtcHour(date: Date, hour: number): Date {
  const next = new Date(date)
  next.setUTCHours(hour, 0, 0, 0)
  return next
}

function nextLocalDateTime(target: Date, timezone: string): Date {
  try {
    const parts = getZonedParts(target, timezone)
    const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0)
    const offsetMs = getTimezoneOffsetMs(new Date(utcGuess), timezone)
    let scheduled = new Date(utcGuess - offsetMs)
    if (scheduled.getTime() < Date.now()) {
      scheduled = new Date(scheduled.getTime() + 24 * 60 * 60 * 1000)
    }
    return scheduled
  } catch {
    return target.getTime() < Date.now()
      ? new Date(Date.now())
      : target
  }
}

function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
  }
}

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const parts = getZonedParts(date, timezone)
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0)
  return zonedAsUtc - date.getTime()
}

function normalizeUtmParameters(value: CampaignUtmParameters | null | undefined) {
  if (!value?.enabled || !Array.isArray(value.params)) return []
  return value.params
    .map(param => ({
      key: String(param.key ?? '').trim(),
      value: String(param.value ?? '').trim(),
    }))
    .filter(param => param.key && param.value)
}

function readRecipientImages(customer: CustomerLike): Record<string, unknown> {
  const attrs = customer.customAttributes
  if (!attrs || typeof attrs !== 'object') return {}
  const images = attrs.images
  return images && typeof images === 'object'
    ? images as Record<string, unknown>
    : {}
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null
}

function formatCampaignFrom(campaign: CampaignRow, project: ProjectLike): string | null {
  const email = campaign.fromEmail ?? project.emailFromAddress
  if (!email) return null
  const name = campaign.fromName ?? project.emailFromName ?? project.name
  return name ? `${name} <${email}>` : email
}

/**
 * Get a campaign with its segment name joined.
 */
export async function getCampaignWithSegment(campaignId: string) {
  const result = await db
    .select({
      campaign: campaigns,
      segmentName: segments.name,
    })
    .from(campaigns)
    .leftJoin(segments, eq(segments.id, campaigns.segmentId))
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!result[0]) return null
  const categoryRows = await db
    .select({ categoryId: campaignSubscriptionCategories.categoryId })
    .from(campaignSubscriptionCategories)
    .where(eq(campaignSubscriptionCategories.campaignId, campaignId))
  return {
    ...result[0].campaign,
    segmentName: result[0].segmentName ?? null,
    subscriptionCategoryIds: categoryRows.map(r => r.categoryId),
    attachments: await listCampaignAttachments(campaignId),
  }
}

/**
 * List campaigns for a project with segment names.
 */
export async function listCampaigns(
  projectId: string,
  opts: { includeArchived?: boolean; archivedOnly?: boolean } = {},
) {
  // Default: active only (archived_at IS NULL), most recent first.
  // includeArchived=true: include both active + archived.
  // archivedOnly=true: only archived.
  const archivedFilter = opts.archivedOnly
    ? sql`${campaigns.archivedAt} IS NOT NULL`
    : opts.includeArchived
      ? sql`TRUE`
      : sql`${campaigns.archivedAt} IS NULL`

  const rows = await db
    .select({
      campaign: campaigns,
      segmentName: segments.name,
    })
    .from(campaigns)
    .leftJoin(segments, eq(segments.id, campaigns.segmentId))
    .where(and(eq(campaigns.projectId, projectId), archivedFilter))
    .orderBy(sql`${campaigns.createdAt} DESC`)

  const campaignIds = rows.map(r => r.campaign.id)
  const categoryRows = campaignIds.length > 0
    ? await db
        .select({
          campaignId: campaignSubscriptionCategories.campaignId,
          categoryId: campaignSubscriptionCategories.categoryId,
        })
        .from(campaignSubscriptionCategories)
        .where(inArray(campaignSubscriptionCategories.campaignId, campaignIds))
    : []
  const categoryMap = new Map<string, string[]>()
  for (const row of categoryRows) {
    const existing = categoryMap.get(row.campaignId) ?? []
    existing.push(row.categoryId)
    categoryMap.set(row.campaignId, existing)
  }

  return rows.map(r => ({
    ...r.campaign,
    segmentName: r.segmentName ?? null,
    subscriptionCategoryIds: categoryMap.get(r.campaign.id) ?? [],
  }))
}

/**
 * Duplicate a campaign as a fresh draft. Copies content + segment + delivery
 * config; resets all counters, schedule, and A/B winner state. Name gets
 * " (Copy)" appended; the merchant can rename in the editor.
 */
export async function duplicateCampaign(projectId: string, sourceId: string) {
  const [source] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, sourceId), eq(campaigns.projectId, projectId)))
    .limit(1)

  if (!source) throw new Error('Source campaign not found')

  const [created] = await db.insert(campaigns).values({
    projectId,
    name: `${source.name} (Copy)`,
    channel: source.channel,
    deliveryType: source.deliveryType,
    status: 'draft',
    contentType: source.contentType,
    segmentId: source.segmentId,
    audienceFilter: source.audienceFilter,
    excludeAudienceFilter: source.excludeAudienceFilter,
    audienceCap: source.audienceCap,
    controlGroupPct: source.controlGroupPct,
    subject: source.subject,
    previewText: source.previewText,
    htmlBody: source.htmlBody,
    emailBuilderTemplate: source.emailBuilderTemplate,
    bodyText: source.bodyText,
    fromName: source.fromName,
    fromEmail: source.fromEmail,
    replyToEmail: source.replyToEmail,
    ccEmails: source.ccEmails,
    bccEmails: source.bccEmails,
    gmailAnnotation: source.gmailAnnotation,
    periodicSchedule: source.periodicSchedule,
    templateId: source.templateId,
    conversionGoals: source.conversionGoals,
    goalTrackingHours: source.goalTrackingHours,
    deliveryLimit: source.deliveryLimit,
    // A/B config copied; winner + counters reset (new campaign starts fresh)
    abTestEnabled: source.abTestEnabled,
    abSplitPct: source.abSplitPct,
    abVariantBSubject: source.abVariantBSubject,
    abVariantBHtmlBody: source.abVariantBHtmlBody,
    abVariantBBodyText: source.abVariantBBodyText,
    abWinnerMetric: source.abWinnerMetric,
    abAutoSendWinner: source.abAutoSendWinner,
    abTestDurationHours: source.abTestDurationHours,
    variables: source.variables,
  }).returning()

  const categoryRows = await db
    .select({ categoryId: campaignSubscriptionCategories.categoryId })
    .from(campaignSubscriptionCategories)
    .where(eq(campaignSubscriptionCategories.campaignId, sourceId))
  if (categoryRows.length > 0) {
    await db.insert(campaignSubscriptionCategories).values(
      categoryRows.map(r => ({ campaignId: created.id, categoryId: r.categoryId })),
    ).onConflictDoNothing()
  }

  await copyCampaignAttachments(sourceId, created.id)

  return created
}
