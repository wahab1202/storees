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
  const channel = campaign.channel ?? 'email'

  // Fetch recipients — from segment or all project customers
  // Filter by channel reachability: email needs email, sms/whatsapp needs phone, push needs pushSubscribed
  let allCustomerRows: Array<{ customerId: string; email: string | null; name: string | null; phone: string | null; pushSubscribed: boolean }>

  if (campaign.segmentId) {
    const members = await db
      .select({
        customerId: customerSegments.customerId,
        email: customers.email,
        name: customers.name,
        phone: customers.phone,
        pushSubscribed: customers.pushSubscribed,
      })
      .from(customerSegments)
      .innerJoin(customers, eq(customers.id, customerSegments.customerId))
      .where(eq(customerSegments.segmentId, campaign.segmentId))
    allCustomerRows = members
  } else {
    const rows = await db
      .select({ customerId: customers.id, email: customers.email, name: customers.name, phone: customers.phone, pushSubscribed: customers.pushSubscribed })
      .from(customers)
      .where(eq(customers.projectId, campaign.projectId))
    allCustomerRows = rows
  }

  // Filter by channel reachability
  const recipients = allCustomerRows.filter(c => {
    if (channel === 'email') return !!c.email
    if (channel === 'sms' || channel === 'whatsapp') return !!c.phone
    if (channel === 'push') return true // push token checked at delivery time
    return !!c.email
  }).map(c => ({
    customerId: c.customerId,
    email: c.email ?? '',
    name: c.name,
  }))

  if (recipients.length === 0) throw new Error(`No reachable customers found for ${channel} campaign`)

  // Assign A/B variants if enabled
  const isAb = campaign.abTestEnabled ?? false
  const splitPct = campaign.abSplitPct ?? 50

  // Shuffle recipients for random split
  const shuffled = [...recipients].sort(() => Math.random() - 0.5)
  const splitIndex = isAb ? Math.round(shuffled.length * (splitPct / 100)) : shuffled.length

  // Create pending send records with variant assignment (batched to avoid Postgres param limit)
  const BATCH_SIZE = 500
  const sendRows = shuffled.map((r, i) => ({
    campaignId,
    customerId: r.customerId,
    email: r.email,
    status: 'pending' as const,
    variant: isAb ? (i < splitIndex ? 'A' : 'B') : null,
  }))

  for (let i = 0; i < sendRows.length; i += BATCH_SIZE) {
    const batch = sendRows.slice(i, i + BATCH_SIZE)
    await db.insert(campaignSends).values(batch)
  }

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
 * Process a campaign: route to correct channel (email, SMS, push, WhatsApp).
 * Called by the campaign worker.
 */
export async function processCampaign(campaignId: string): Promise<void> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!campaign || campaign.status !== 'sending') return

  const channel = campaign.channel ?? 'email'

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
    // Get customer for personalization
    const [customer] = await db
      .select({ name: customers.name, phone: customers.phone, customAttributes: customers.customAttributes })
      .from(customers)
      .where(eq(customers.id, send.customerId))
      .limit(1)

    const templateContext: Record<string, string> = {
      customer_name: customer?.name ?? 'there',
      customer_email: send.email,
      store_name: 'Storees Store',
    }

    let success = false

    if (channel === 'email') {
      // Email: use Resend directly
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
          status: 'sent', sentAt: new Date(), resendMessageId: messageId,
        }).where(eq(campaignSends.id, send.id))
        success = true
      }
    } else {
      // SMS, Push, WhatsApp: use delivery service
      try {
        const { send: deliverySend } = await import('./deliveryService.js')
        const templateId = campaign.templateId ?? ''

        // Build variables from campaign content
        const variables: Record<string, string> = {
          ...templateContext,
          // For SMS/push: use bodyText as the message
          message: interpolateTemplate(campaign.bodyText ?? '', templateContext),
          // For push: subject is the title
          title: interpolateTemplate(campaign.subject ?? '', templateContext),
        }

        const msgId = await deliverySend({
          projectId: campaign.projectId,
          userId: send.customerId,
          channel: channel as 'sms' | 'push' | 'whatsapp',
          templateId,
          variables,
          messageType: (campaign.contentType ?? 'promotional') as 'promotional' | 'transactional',
          campaignId,
        })

        if (msgId) {
          await db.update(campaignSends).set({
            status: 'sent', sentAt: new Date(),
          }).where(eq(campaignSends.id, send.id))
          success = true
        }
      } catch (err) {
        console.error(`Campaign ${channel} send failed for ${send.customerId}:`, err)
      }
    }

    if (!success) {
      await db.update(campaignSends).set({ status: 'failed' }).where(eq(campaignSends.id, send.id))
      failedCount++
    } else {
      sentCount++
    }

    // Update campaign counts periodically
    if ((sentCount + failedCount) % 50 === 0 || sentCount + failedCount === pendingSends.length) {
      await db.update(campaigns).set({
        sentCount, failedCount, updatedAt: new Date(),
      }).where(eq(campaigns.id, campaignId))
    }
  }

  // Mark campaign as sent
  await db.update(campaigns).set({
    status: 'sent',
    sentAt: new Date(),
    sentCount,
    failedCount,
    updatedAt: new Date(),
  }).where(eq(campaigns.id, campaignId))

  console.log(`Campaign "${campaign.name}" [${channel}] completed — ${sentCount} sent, ${failedCount} failed`)
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
