import { eq, and, inArray, gt, sql } from 'drizzle-orm'
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
  projects,
} from '../db/schema.js'
import { sendEmail, interpolateTemplate } from './emailService.js'
import { campaignQueue } from './queue.js'
import { resolveTemplateVariables, type CustomerLike, type ProjectLike } from './templateContext.js'
import { filterToSql } from '@storees/segments'
import type { TemplateVariable, FilterConfig } from '@storees/shared'

// Page sizes tuned for 100K-recipient campaigns: bounded heap, bounded round-trips.
const RECIPIENT_PAGE_SIZE = 1000
const SEND_PAGE_SIZE = 500
const SEND_INSERT_BATCH = 500           // Postgres parameter limit safety
const PARALLEL_SENDS_PER_PAGE = 10      // bounded in-page concurrency to avoid provider rate-limit storms

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
    .select({ projectId: campaigns.projectId, segmentId: campaigns.segmentId, channel: campaigns.channel })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!campaign) throw new Error('Campaign not found')
  if ((campaign.channel ?? 'email') !== 'email') {
    return { totalReachable: 0, suppressed: 0, optedOut: 0, neverOpened: 0, stalePct: 0, warning: null }
  }

  // Build the candidate customer list (same shape as dispatch but in one SQL call).
  // We want: count of reachable customers, count overlapping suppressions,
  // count overlapping opted-out, count with no email_opened in 90 days.
  const candidatesCte = campaign.segmentId
    ? sql`SELECT c.id AS customer_id, c.email
          FROM customers c
          JOIN customer_segments cs ON cs.customer_id = c.id
          WHERE cs.segment_id = ${campaign.segmentId}
          AND c.email IS NOT NULL`
    : sql`SELECT id AS customer_id, email
          FROM customers
          WHERE project_id = ${campaign.projectId}
          AND email IS NOT NULL`

  const result = await db.execute(sql`
    WITH candidates AS (${candidatesCte})
    SELECT
      (SELECT COUNT(*) FROM candidates) AS total_reachable,
      (SELECT COUNT(*) FROM candidates c
       WHERE EXISTS (
         SELECT 1 FROM email_suppressions s
         WHERE s.project_id = ${campaign.projectId}
         AND lower(s.email) = lower(c.email)
       )) AS suppressed,
      (SELECT COUNT(*) FROM candidates c
       WHERE EXISTS (
         SELECT 1 FROM consents co
         WHERE co.project_id = ${campaign.projectId}
         AND co.customer_id = c.customer_id
         AND co.channel = 'email'
         AND co.purpose = 'promotional'
         AND co.status = 'opted_out'
       )) AS opted_out,
      (SELECT COUNT(*) FROM candidates c
       WHERE NOT EXISTS (
         SELECT 1 FROM events e
         WHERE e.customer_id = c.customer_id
         AND e.event_name IN ('email_opened', 'email_read')
         AND e.timestamp >= NOW() - INTERVAL '90 days'
       )) AS never_opened
  `)

  const row = result.rows[0] as { total_reachable: string | number; suppressed: string | number; opted_out: string | number; never_opened: string | number }
  const totalReachable = Number(row.total_reachable)
  const suppressed = Number(row.suppressed)
  const optedOut = Number(row.opted_out)
  const neverOpened = Number(row.never_opened)

  // After excluding suppressed + opted-out, what % of the *deliverable* list is stale?
  const deliverable = Math.max(0, totalReachable - suppressed - optedOut)
  const stalePct = deliverable > 0 ? Math.round((neverOpened / deliverable) * 100) : 0

  // 30% stale threshold: industry guidance for shared sending pools. Above this
  // a campaign materially burns sender reputation. Tune later if needed.
  const STALE_THRESHOLD_PCT = 30
  const warning =
    stalePct > STALE_THRESHOLD_PCT && deliverable > 0
      ? `${stalePct}% of recipients haven't opened any email in the last 90 days. Sending may hurt deliverability. Consider adding a "Days Since Email Open" filter to your segment, or pass force=true to send anyway.`
      : null

  return { totalReachable, suppressed, optedOut, neverOpened, stalePct, warning }
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
  const isAb = campaign.abTestEnabled ?? false
  const splitPct = campaign.abSplitPct ?? 50
  // Audience-v2 controls — all default to "no constraint" so legacy campaigns
  // (created before this column shipped) continue to behave identically.
  const audienceFilter = (campaign.audienceFilter ?? null) as FilterConfig | null
  const audienceCap = campaign.audienceCap ?? null
  const ctrlPct = campaign.controlGroupPct ?? 0
  const ctrlSeed = campaign.controlGroupSeed ?? ''

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
    const page: Array<{ customerId: string; email: string | null; name: string | null; phone: string | null; pushSubscribed: boolean }>
      = audienceFilter
        ? await db
            .select({
              customerId: customers.id,
              email: customers.email,
              name: customers.name,
              phone: customers.phone,
              pushSubscribed: customers.pushSubscribed,
            })
            .from(customers)
            .where(and(
              eq(customers.projectId, campaign.projectId),
              cursor ? gt(customers.id, cursor) : undefined,
              filterToSql(audienceFilter),
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
            })
            .from(customerSegments)
            .innerJoin(customers, eq(customers.id, customerSegments.customerId))
            .where(cursor
              ? and(eq(customerSegments.segmentId, campaign.segmentId), gt(customers.id, cursor))
              : eq(customerSegments.segmentId, campaign.segmentId))
            .orderBy(customers.id)
            .limit(pageLimit)
        : await db
            .select({
              customerId: customers.id,
              email: customers.email,
              name: customers.name,
              phone: customers.phone,
              pushSubscribed: customers.pushSubscribed,
            })
            .from(customers)
            .where(cursor
              ? and(eq(customers.projectId, campaign.projectId), gt(customers.id, cursor))
              : eq(customers.projectId, campaign.projectId))
            .orderBy(customers.id)
            .limit(pageLimit)

    if (page.length === 0) break

    // 1. Filter by channel reachability
    const reachable = page.filter(c => {
      if (channel === 'email') return !!c.email
      if (channel === 'sms' || channel === 'whatsapp') return !!c.phone
      if (channel === 'push') return true
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
        const sendRows = toSend.map(r => ({
          campaignId,
          customerId: r.customerId,
          email: r.email ?? '',
          status: 'pending' as const,
          variant: assignVariant(r.customerId, campaignId, isAb, splitPct),
        }))
        // Postgres parameter-limit safety
        for (let i = 0; i < sendRows.length; i += SEND_INSERT_BATCH) {
          await db.insert(campaignSends).values(sendRows.slice(i, i + SEND_INSERT_BATCH))
        }
        totalRecipients += toSend.length
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

  while (true) {
    const pageSends: SendRow[] = await db
      .select()
      .from(campaignSends)
      .where(cursor
        ? and(eq(campaignSends.campaignId, campaignId), eq(campaignSends.status, 'pending'), gt(campaignSends.id, cursor))
        : and(eq(campaignSends.campaignId, campaignId), eq(campaignSends.status, 'pending')))
      .orderBy(campaignSends.id)
      .limit(SEND_PAGE_SIZE)

    if (pageSends.length === 0) break

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
    for (let i = 0; i < pageSends.length; i += PARALLEL_SENDS_PER_PAGE) {
      const chunk = pageSends.slice(i, i + PARALLEL_SENDS_PER_PAGE)
      const chunkResults = await Promise.all(
        chunk.map(send => sendOneRecipient(send, customerMap.get(send.customerId), campaign, channel, project)),
      )
      results.push(...chunkResults)
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
    if (pageSends.length < SEND_PAGE_SIZE) break
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
): Promise<{ id: string; success: boolean }> {
  // Variable mapping declared on the campaign at save-time. Resolved against
  // this recipient's customer row + project row to produce the substitution
  // map. Replaces the old hardcoded { customer_name, customer_email,
  // store_name } context — those three keys still come back automatically as
  // defaults inside the resolver.
  const customerLike: CustomerLike = customer ?? { id: send.customerId, email: send.email }
  const templateContext = resolveTemplateVariables({
    variables: (campaign.variables as TemplateVariable[]) ?? [],
    customer: customerLike,
    project,
  })
  // send.email is the authoritative recipient address — it may differ from
  // customer.email if the audience was overridden. Stamp it onto the context
  // so {{customer_email}} reflects what we're actually sending to.
  templateContext.customer_email = send.email

  if (channel === 'email') {
    const useVariantB = send.variant === 'B' && campaign.abTestEnabled
    const rawSubject = useVariantB && campaign.abVariantBSubject ? campaign.abVariantBSubject : campaign.subject ?? ''
    const rawHtml = useVariantB && campaign.abVariantBHtmlBody ? campaign.abVariantBHtmlBody : campaign.htmlBody ?? ''
    const subject = interpolateTemplate(rawSubject, templateContext)
    const html = interpolateTemplate(rawHtml, templateContext)

    try {
      const messageId = await sendEmail({ to: send.email, subject, html })
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
    const variables: Record<string, string> = {
      ...templateContext,
      message: interpolateTemplate(campaign.bodyText ?? '', templateContext),
      title: interpolateTemplate(campaign.subject ?? '', templateContext),
      ...(campaign.previewText ? { image: campaign.previewText } : {}),
    }
    const msgId = await deliverySend({
      projectId: campaign.projectId,
      userId: send.customerId,
      channel: channel as 'sms' | 'push' | 'whatsapp',
      templateId: campaign.templateId ?? '',
      variables,
      messageType: (campaign.contentType ?? 'promotional') as 'promotional' | 'transactional',
      campaignId: campaign.id,
    })
    if (msgId) {
      await db.update(campaignSends).set({
        status: 'sent', sentAt: new Date(),
      }).where(eq(campaignSends.id, send.id))
      return { id: send.id, success: true }
    }
  } catch (err) {
    console.error(`Campaign ${channel} send failed for ${send.customerId}:`, err)
  }
  return { id: send.id, success: false }
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
  return {
    ...result[0].campaign,
    segmentName: result[0].segmentName ?? null,
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

  return rows.map(r => ({
    ...r.campaign,
    segmentName: r.segmentName ?? null,
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
    subject: source.subject,
    previewText: source.previewText,
    htmlBody: source.htmlBody,
    bodyText: source.bodyText,
    fromName: source.fromName,
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
  }).returning()

  return created
}
