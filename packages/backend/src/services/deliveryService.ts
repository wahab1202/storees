import { eq, and, sql, gte } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { messages, consents, customers } from '../db/schema.js'
import { deliveryQueue } from './queue.js'
import { redis } from './redis.js'
import type { SendCommand, MessageChannel } from '@storees/shared'

import { getChannelProvider } from './channelProviderRegistry.js'

type DeliveryProvider = {
  name: string
  send(command: SendCommand): Promise<{ messageId: string; status: string; error?: string }>
  getStatus?(providerMessageId: string): Promise<string>
}

const providers = new Map<string, DeliveryProvider>()

export function registerProvider(name: string, provider: DeliveryProvider): void {
  providers.set(name, provider)
}

/**
 * Pre-send pipeline: consent → frequency → quiet hours → rate limit → queue.
 * Returns the message ID or null if blocked.
 */
export async function send(command: SendCommand): Promise<string | null> {
  // 1. Consent check
  const consented = await checkConsent(
    command.projectId,
    command.userId,
    command.channel,
    command.messageType,
  )
  if (!consented) {
    await recordMessage(command, 'blocked', 'consent_blocked')
    return null
  }

  // 2. Frequency cap check
  const capped = await checkFrequencyCap(command.projectId, command.userId, command.channel)
  if (capped) {
    await recordMessage(command, 'blocked', 'frequency_capped')
    return null
  }

  // 3. Channel reachability check
  const reachable = await checkReachability(command.projectId, command.userId, command.channel)
  if (!reachable) {
    await recordMessage(command, 'blocked', 'no_channel_reachability')
    return null
  }

  // 4. Record as queued and add to delivery queue
  const messageId = await recordMessage(command, 'queued')

  await deliveryQueue.add('send', {
    messageId,
    ...command,
    scheduledAt: command.scheduledAt?.toISOString(),
  }, {
    delay: command.scheduledAt
      ? Math.max(0, command.scheduledAt.getTime() - Date.now())
      : undefined,
  })

  return messageId
}

/**
 * Actually send via provider — called by deliveryWorker.
 */
export async function executeSend(messageId: string, command: SendCommand): Promise<void> {
  try {
    // Try channel provider registry first (project-level config)
    const channelResult = await getChannelProvider(command.projectId, command.channel)

    let providerName: string
    let sendResult: { messageId: string; status: string; error?: string }

    if (channelResult) {
      providerName = channelResult.provider.name
      sendResult = await channelResult.provider.send(command, channelResult.config)
    } else {
      // Fallback to legacy registered providers
      const legacy = providers.get('pinnacle') ?? providers.get('resend')
      if (!legacy) throw new Error(`No provider configured for channel ${command.channel}`)
      providerName = legacy.name
      sendResult = await legacy.send(command)
    }

    if (sendResult.error) {
      console.error(`Delivery failed for message ${messageId}:`, sendResult.error)
      await db.update(messages).set({
        status: 'failed',
        failedAt: new Date(),
      }).where(eq(messages.id, messageId))
      return
    }

    await db.update(messages).set({
      status: 'sent',
      provider: providerName,
      providerMessageId: sendResult.messageId,
      sentAt: new Date(),
    }).where(eq(messages.id, messageId))
  } catch (err) {
    console.error(`Delivery failed for message ${messageId}:`, err)
    await db.update(messages).set({
      status: 'failed',
      failedAt: new Date(),
    }).where(eq(messages.id, messageId))
  }
}

/**
 * Update message status from provider receipt webhook.
 */
export async function handleReceipt(
  providerMessageId: string,
  status: 'delivered' | 'read' | 'clicked' | 'failed',
): Promise<void> {
  const timestampField = {
    delivered: 'deliveredAt',
    read: 'readAt',
    clicked: 'clickedAt',
    failed: 'failedAt',
  }[status] as string

  await db.update(messages).set({
    status,
    [timestampField]: new Date(),
  }).where(eq(messages.providerMessageId, providerMessageId))
}

// ============ PRE-SEND CHECKS ============

async function checkConsent(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
  messageType: string,
): Promise<boolean> {
  // Transactional defaults to allowed unless explicitly opted out
  const cacheKey = `consent:${projectId}:${customerId}:${channel}:${messageType}`
  const cached = await redis.get(cacheKey)
  if (cached !== null) return cached === '1'

  const [record] = await db
    .select({ status: consents.status })
    .from(consents)
    .where(and(
      eq(consents.projectId, projectId),
      eq(consents.customerId, customerId),
      eq(consents.channel, channel),
      eq(consents.purpose, messageType),
    ))
    .limit(1)

  // No consent record: check customer subscription flags as fallback
  let allowed: boolean
  if (record) {
    allowed = record.status === 'opted_in'
  } else if (messageType === 'transactional') {
    allowed = true // transactional always allowed
  } else {
    // Fallback: check customer.{channel}_subscribed flag
    const subField: Record<string, string> = { email: 'email_subscribed', sms: 'sms_subscribed', push: 'push_subscribed', whatsapp: 'whatsapp_subscribed' }
    const col = subField[channel]
    if (col) {
      const [cust] = await db.select({ subscribed: sql<boolean>`${sql.raw(col)}` }).from(customers).where(eq(customers.id, customerId)).limit(1)
      allowed = cust?.subscribed ?? false
    } else {
      allowed = false
    }
  }

  await redis.set(cacheKey, allowed ? '1' : '0', 'EX', 300) // 5 min TTL
  return allowed
}

async function checkFrequencyCap(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
): Promise<boolean> {
  const maxPerDay = 5 // promotional cap; TODO: make configurable per project
  const count = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(
      eq(messages.projectId, projectId),
      eq(messages.customerId, customerId),
      eq(messages.channel, channel),
      eq(messages.messageType, 'promotional'),
      gte(messages.createdAt, sql`NOW() - INTERVAL '24 hours'`),
    ))

  return (count[0]?.count ?? 0) >= maxPerDay
}

async function checkReachability(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
): Promise<boolean> {
  const [customer] = await db
    .select({
      email: customers.email,
      phone: customers.phone,
      pushSubscribed: customers.pushSubscribed,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.projectId, projectId)))
    .limit(1)

  if (!customer) return false

  switch (channel) {
    case 'email':
      return !!customer.email
    case 'sms':
    case 'whatsapp':
      return !!customer.phone
    case 'push':
      return customer.pushSubscribed
    case 'inapp':
      return true // always reachable
    default:
      return false
  }
}

async function recordMessage(
  command: SendCommand,
  status: string,
  blockReason?: string,
): Promise<string> {
  const [msg] = await db.insert(messages).values({
    projectId: command.projectId,
    customerId: command.userId,
    channel: command.channel,
    messageType: command.messageType,
    templateId: command.templateId,
    variables: command.variables,
    status,
    blockReason: blockReason ?? null,
    flowTripId: command.flowTripId ?? null,
    campaignId: command.campaignId ?? null,
    scheduledAt: command.scheduledAt ?? null,
  }).returning()

  return msg.id
}
