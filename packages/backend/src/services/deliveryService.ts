import { eq, and, sql, gte } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { messages, consents, customers, whatsappTemplates, projects } from '../db/schema.js'
import { deliveryQueue } from './queue.js'
import { redis } from './redis.js'
import type { SendCommand, MessageChannel } from '@storees/shared'

import { getChannelProvider } from './channelProviderRegistry.js'
import { mirrorCampaignReceipt } from './messageStatusService.js'

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
  if (!command.ignoreFrequencyCap) {
    const capped = await checkFrequencyCap(command.projectId, command.userId, command.channel)
    if (capped) {
      await recordMessage(command, 'blocked', 'frequency_capped')
      return null
    }
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
      // Route through sendTemplate when channel=whatsapp + templateId resolves to a synced WhatsApp template
      // for this provider. Falls through to plain text send otherwise.
      const waTemplate = await resolveWhatsappTemplate(command, providerName)
      if (waTemplate && channelResult.provider.sendTemplate) {
        const params: string[] = []
        for (let i = 1; i <= (waTemplate.parameterCount ?? 0); i++) {
          params.push(command.variables?.[String(i)] ?? '')
        }
        sendResult = await channelResult.provider.sendTemplate(
          {
            ...command,
            templateName: waTemplate.providerTemplateId,
            templateLanguage: waTemplate.language,
            templateParams: params,
            templateHeader: waTemplate.header,
            templateButtons: waTemplate.buttons,
          },
          channelResult.config,
        )
      } else {
        sendResult = await channelResult.provider.send(command, channelResult.config)
      }
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
      await mirrorCampaignProviderFailure(command)
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
    await mirrorCampaignProviderFailure(command)
  }
}

async function mirrorCampaignProviderFailure(command: SendCommand): Promise<void> {
  if (!command.campaignId) return
  await mirrorCampaignReceipt(command.campaignId, command.userId, 'failed')
}

/**
 * If the command targets WhatsApp and templateId points at a synced whatsapp_templates row
 * for this provider, return it. Returns null for plain-text sends or unknown templates.
 */
async function resolveWhatsappTemplate(
  command: SendCommand,
  providerName: string,
): Promise<{ providerTemplateId: string; name: string; language: string; parameterCount: number; header: unknown; buttons: unknown } | null> {
  if (command.channel !== 'whatsapp' || !command.templateId) return null
  const [selected] = await db
    .select({
      id: whatsappTemplates.id,
      name: whatsappTemplates.name,
      providerTemplateId: whatsappTemplates.providerTemplateId,
      language: whatsappTemplates.language,
      parameterCount: whatsappTemplates.parameterCount,
      status: whatsappTemplates.status,
      header: whatsappTemplates.header,
      buttons: whatsappTemplates.buttons,
    })
    .from(whatsappTemplates)
    .where(and(
      eq(whatsappTemplates.id, command.templateId),
      eq(whatsappTemplates.projectId, command.projectId),
      eq(whatsappTemplates.provider, providerName),
    ))
    .limit(1)
  if (!selected || selected.status !== 'APPROVED') return null

  const [customer] = await db
    .select({ customAttributes: customers.customAttributes })
    .from(customers)
    .where(eq(customers.id, command.userId))
    .limit(1)
  const attrs = (customer?.customAttributes ?? {}) as Record<string, unknown>
  const preferredLanguage = String(attrs.language ?? attrs.locale ?? '').trim()
  if (!preferredLanguage || preferredLanguage === selected.language) return selected

  const [localized] = await db
    .select({
      providerTemplateId: whatsappTemplates.providerTemplateId,
      name: whatsappTemplates.name,
      language: whatsappTemplates.language,
      parameterCount: whatsappTemplates.parameterCount,
      header: whatsappTemplates.header,
      buttons: whatsappTemplates.buttons,
    })
    .from(whatsappTemplates)
    .where(and(
      eq(whatsappTemplates.projectId, command.projectId),
      eq(whatsappTemplates.provider, providerName),
      eq(whatsappTemplates.name, selected.name),
      eq(whatsappTemplates.language, preferredLanguage),
      eq(whatsappTemplates.status, 'APPROVED'),
    ))
    .limit(1)
  return localized ?? selected
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

// Per-project frequency-cap config cached for 60s. Capped values rarely
// change (admin tweaks them once during onboarding) but the hot path runs
// per-send, so a DB lookup every time is wasteful.
type FreqCapConfig = { perDays: number; max: number }
const FREQ_CAP_CACHE_TTL_MS = 60_000
const freqCapCache = new Map<string, { caps: Record<string, FreqCapConfig>; expiresAt: number }>()

const DEFAULT_FREQ_CAPS: Record<string, FreqCapConfig> = {
  whatsapp_marketing: { perDays: 7, max: 1 },
  sms_marketing: { perDays: 7, max: 3 },
  email_marketing: { perDays: 1, max: 3 },
  push_marketing: { perDays: 1, max: 5 },
}

async function getProjectFreqCaps(projectId: string): Promise<Record<string, FreqCapConfig>> {
  const cached = freqCapCache.get(projectId)
  if (cached && cached.expiresAt > Date.now()) return cached.caps

  const [row] = await db
    .select({ caps: projects.frequencyCaps })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  const caps = (row?.caps as Record<string, FreqCapConfig> | null) ?? DEFAULT_FREQ_CAPS
  freqCapCache.set(projectId, { caps, expiresAt: Date.now() + FREQ_CAP_CACHE_TTL_MS })
  return caps
}

/** Returns true if this customer has hit (or exceeded) the marketing cap on
 *  this channel. Transactional sends never reach this check — bypass is at
 *  the caller. Returning true blocks the send and flags it as `frequency_capped`. */
async function checkFrequencyCap(
  projectId: string,
  customerId: string,
  channel: MessageChannel,
): Promise<boolean> {
  const caps = await getProjectFreqCaps(projectId)
  const cap = caps[`${channel}_marketing`]
  if (!cap || cap.max <= 0) return false // no cap configured = no limit

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(
      eq(messages.projectId, projectId),
      eq(messages.customerId, customerId),
      eq(messages.channel, channel),
      eq(messages.messageType, 'promotional'),
      eq(messages.countsTowardFrequencyCap, true),
      gte(messages.createdAt, sql`NOW() - (${cap.perDays}::int * INTERVAL '1 day')`),
    ))

  return count >= cap.max
}

/** Test-only: clears the freq-cap cache for a project (admin UI calls this when caps change). */
export function invalidateFreqCapCache(projectId: string): void {
  freqCapCache.delete(projectId)
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
    countsTowardFrequencyCap: command.countForFrequencyCap ?? true,
    flowTripId: command.flowTripId ?? null,
    campaignId: command.campaignId ?? null,
    scheduledAt: command.scheduledAt ?? null,
  }).returning()

  return msg.id
}
