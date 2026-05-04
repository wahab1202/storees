import { eq, and, inArray, gt, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import {
  campaigns,
  campaignSends,
  customers,
  customerSegments,
  segments,
  emailSuppressions,
  consents,
} from '../db/schema.js'
import { sendEmail, interpolateTemplate } from './emailService.js'
import { campaignQueue } from './queue.js'

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

type SendRow = typeof campaignSends.$inferSelect
type CampaignRow = typeof campaigns.$inferSelect
type CustomerInfo = { id: string; name: string | null; phone: string | null; customAttributes: unknown }

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

  let totalRecipients = 0
  let cursor: string | null = null

  while (true) {
    // Fetch one page of candidate customers
    const page: Array<{ customerId: string; email: string | null; name: string | null; phone: string | null; pushSubscribed: boolean }>
      = campaign.segmentId
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
            .limit(RECIPIENT_PAGE_SIZE)
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
            .limit(RECIPIENT_PAGE_SIZE)

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
      const sendRows = allowed.map(r => ({
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
      totalRecipients += allowed.length
    }

    cursor = page[page.length - 1].customerId
    if (page.length < RECIPIENT_PAGE_SIZE) break
  }

  if (totalRecipients === 0) throw new Error(`No reachable customers found for ${channel} campaign`)

  await db.update(campaigns).set({
    status: 'sending',
    totalRecipients,
    updatedAt: new Date(),
  }).where(eq(campaigns.id, campaignId))

  await campaignQueue.add('send-campaign', { campaignId })

  console.log(`Campaign "${campaign.name}" dispatched — ${totalRecipients} recipients`)
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

    // Batch-fetch all customers for this page in one query
    const customerIds = pageSends.map(s => s.customerId)
    const customerRows = await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone, customAttributes: customers.customAttributes })
      .from(customers)
      .where(inArray(customers.id, customerIds))
    const customerMap = new Map(customerRows.map(c => [c.id, c]))

    // Bounded-parallel processing within the page
    const results: Array<{ id: string; success: boolean }> = []
    for (let i = 0; i < pageSends.length; i += PARALLEL_SENDS_PER_PAGE) {
      const chunk = pageSends.slice(i, i + PARALLEL_SENDS_PER_PAGE)
      const chunkResults = await Promise.all(
        chunk.map(send => sendOneRecipient(send, customerMap.get(send.customerId), campaign, channel)),
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
): Promise<{ id: string; success: boolean }> {
  const templateContext: Record<string, string> = {
    customer_name: customer?.name ?? 'there',
    customer_email: send.email,
    store_name: 'Storees Store',
  }

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
export async function listCampaigns(projectId: string) {
  const rows = await db
    .select({
      campaign: campaigns,
      segmentName: segments.name,
    })
    .from(campaigns)
    .leftJoin(segments, eq(segments.id, campaigns.segmentId))
    .where(eq(campaigns.projectId, projectId))
    .orderBy(campaigns.createdAt)

  return rows.map(r => ({
    ...r.campaign,
    segmentName: r.segmentName ?? null,
  }))
}
