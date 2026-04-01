import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../db/connection.js'
import {
  campaigns,
  campaignSends,
  customers,
  customerSegments,
  segments,
} from '../db/schema.js'
import { sendEmail, interpolateTemplate } from './emailService.js'
import { campaignQueue } from './queue.js'

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
 * Dispatch a campaign for sending.
 * - Creates per-recipient campaign_sends rows (pending)
 * - Updates campaign status to 'sending'
 * - Enqueues a BullMQ job for the worker to process
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
  if (!campaign.segmentId) throw new Error('Campaign has no target segment')

  // Fetch recipients
  const recipients = await getCampaignRecipients(campaign.segmentId)
  if (recipients.length === 0) throw new Error('Target segment has no customers with email addresses')

  // Assign A/B variants if enabled
  const isAb = campaign.abTestEnabled ?? false
  const splitPct = campaign.abSplitPct ?? 50

  // Shuffle recipients for random split
  const shuffled = [...recipients].sort(() => Math.random() - 0.5)
  const splitIndex = isAb ? Math.round(shuffled.length * (splitPct / 100)) : shuffled.length

  // Create pending send records with variant assignment
  await db.insert(campaignSends).values(
    shuffled.map((r, i) => ({
      campaignId,
      customerId: r.customerId,
      email: r.email,
      status: 'pending' as const,
      variant: isAb ? (i < splitIndex ? 'A' : 'B') : null,
    })),
  )

  // Update campaign status and recipient count
  await db.update(campaigns).set({
    status: 'sending',
    totalRecipients: recipients.length,
    updatedAt: new Date(),
  }).where(eq(campaigns.id, campaignId))

  // Enqueue background job
  await campaignQueue.add('send-campaign', { campaignId })

  console.log(`Campaign "${campaign.name}" dispatched — ${recipients.length} recipients`)
  return recipients.length
}

/**
 * Process a campaign: send emails to all pending recipients.
 * Called by the campaign worker.
 */
export async function processCampaign(campaignId: string): Promise<void> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!campaign || campaign.status !== 'sending') return

  // Fetch all pending sends
  const pendingSends = await db
    .select()
    .from(campaignSends)
    .where(
      and(
        eq(campaignSends.campaignId, campaignId),
        eq(campaignSends.status, 'pending'),
      ),
    )

  let sentCount = campaign.sentCount
  let failedCount = campaign.failedCount

  for (const send of pendingSends) {
    // Get customer name for personalization
    const [customer] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, send.customerId))
      .limit(1)

    const templateContext: Record<string, string> = {
      customer_name: customer?.name ?? 'there',
      customer_email: send.email,
      store_name: 'Storees Store',
    }

    // Use variant B content if A/B enabled and this is variant B
    const useVariantB = send.variant === 'B' && campaign.abTestEnabled
    const rawSubject = useVariantB && campaign.abVariantBSubject
      ? campaign.abVariantBSubject
      : campaign.subject ?? ''
    const rawHtml = useVariantB && campaign.abVariantBHtmlBody
      ? campaign.abVariantBHtmlBody
      : campaign.htmlBody ?? ''

    const subject = interpolateTemplate(rawSubject, templateContext)
    const html = interpolateTemplate(rawHtml, templateContext)

    const messageId = await sendEmail({ to: send.email, subject, html })

    if (messageId) {
      await db.update(campaignSends).set({
        status: 'sent',
        sentAt: new Date(),
        resendMessageId: messageId,
      }).where(eq(campaignSends.id, send.id))
      sentCount++
    } else {
      await db.update(campaignSends).set({ status: 'failed' }).where(eq(campaignSends.id, send.id))
      failedCount++
    }

    // Update campaign counts periodically
    await db.update(campaigns).set({
      sentCount,
      failedCount,
      updatedAt: new Date(),
    }).where(eq(campaigns.id, campaignId))
  }

  // Mark campaign as sent
  await db.update(campaigns).set({
    status: 'sent',
    sentAt: new Date(),
    sentCount,
    failedCount,
    updatedAt: new Date(),
  }).where(eq(campaigns.id, campaignId))

  console.log(`Campaign "${campaign.name}" completed — ${sentCount} sent, ${failedCount} failed`)
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
