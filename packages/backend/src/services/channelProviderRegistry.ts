import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import type { MessageChannel, SendCommand } from '@storees/shared'

export type SendResult = { messageId: string; status: string; error?: string }

// Provider's view of an approved WhatsApp template after a sync()
export type ProviderTemplate = {
  providerTemplateId: string
  name: string
  language: string
  category?: string
  status: string
  bodyText: string
  header?: unknown
  footer?: string
  buttons?: unknown
  parameterCount: number
  rawPayload?: unknown
}

export type SendTemplateCommand = SendCommand & {
  // Resolved at the deliveryService layer from whatsapp_templates
  templateName: string
  templateLanguage: string
  templateParams: string[]      // ordered substitutions for {{1}} {{2}} ...
  templateHeader?: unknown
  templateButtons?: unknown
  /** Test-send: bypass customer.phone lookup and deliver to this E.164 number
   *  instead. Used by POST /api/whatsapp/test-send to preview a template
   *  against the admin's own phone before campaign go-live. */
  phoneOverride?: string
}

/**
 * Click-to-WhatsApp referral payload that Meta attaches to the FIRST inbound
 * message after a user taps a CTWA ad. Phase F2a wires this through to
 * the attribution table; presence of this object on an InboundMessage is the
 * primary signal that a new lead originated from a paid ad click.
 */
export type CtwaReferral = {
  /** Meta source_id — the ad/post id (also exposed as ad_id in our schema). */
  sourceId: string
  sourceType?: 'ad' | 'post' | string
  sourceUrl?: string                 // fb.me/... short URL the user tapped
  headline?: string                  // ad headline
  body?: string                      // ad body
  mediaType?: 'image' | 'video' | string
  imageUrl?: string
  /** Unique per-click token, lets the merchant attribute conversions to specific clicks. */
  ctwaClid?: string
}

export type InboundMessage = {
  fromPhone: string
  providerMessageId: string
  content?: string
  mediaUrl?: string
  mediaType?: string
  replyTo?: string
  /** Set when Meta forwards a CTWA ad-click referral with this message. */
  ctwaReferral?: CtwaReferral
  rawPayload?: unknown
}

export type SubmitTemplateInput = {
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  bodyText: string
  header?: { type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string; example?: string } | null
  footer?: string | null
  buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone?: string }>
  /** Sample values for body parameters {{1}}..{{N}}. Meta rejects without these. */
  bodyExample?: string[]
}

export type SubmitTemplateResult = {
  providerTemplateId: string
  status: string // 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_APPEAL' | 'PAUSED' | 'DISABLED'
  category?: string
}

export type TemplateStatusResult = {
  status: string
  category?: string
  rejectionReason?: string | null
}

export type ChannelProvider = {
  name: string
  send(command: SendCommand, config: Record<string, string>): Promise<SendResult>
  // Optional WhatsApp-specific capabilities. Presence of the method = capability is supported.
  sendTemplate?(command: SendTemplateCommand, config: Record<string, string>): Promise<SendResult>
  syncTemplates?(config: Record<string, string>): Promise<ProviderTemplate[]>
  /** Submit a new template to the provider. Returns the provider's id + initial status. */
  submitTemplate?(input: SubmitTemplateInput, config: Record<string, string>): Promise<SubmitTemplateResult>
  /** Refresh status for a previously-submitted template. */
  getTemplateStatus?(providerTemplateId: string, config: Record<string, string>): Promise<TemplateStatusResult>
  parseInbound?(payload: unknown): InboundMessage[]
}

export type ProviderCapabilities = {
  sendText: boolean
  sendTemplate: boolean
  syncTemplates: boolean
  submitTemplate: boolean
  getTemplateStatus: boolean
  parseInbound: boolean
}

export function getProviderCapabilities(provider: ChannelProvider): ProviderCapabilities {
  return {
    sendText: typeof provider.send === 'function',
    sendTemplate: typeof provider.sendTemplate === 'function',
    syncTemplates: typeof provider.syncTemplates === 'function',
    submitTemplate: typeof provider.submitTemplate === 'function',
    getTemplateStatus: typeof provider.getTemplateStatus === 'function',
    parseInbound: typeof provider.parseInbound === 'function',
  }
}

type ChannelConfig = {
  provider: string
  config: Record<string, string>
}

// All registered provider implementations
const providerImpls = new Map<string, ChannelProvider>()

export function registerChannelProvider(key: string, provider: ChannelProvider): void {
  providerImpls.set(key, provider)
  console.log(`[channels] Registered provider: ${key}`)
}

// Cache project channel config for 5 minutes
const configCache = new Map<string, { data: Record<string, ChannelConfig>; expiresAt: number }>()

export function clearProjectChannelProviderCache(projectId: string): void {
  configCache.delete(projectId)
}

/**
 * Get the configured provider for a project + channel.
 * Reads from projects.settings.channels JSONB.
 */
export async function getChannelProvider(
  projectId: string,
  channel: MessageChannel,
): Promise<{ provider: ChannelProvider; config: Record<string, string> } | null> {
  // Check cache
  let channels = configCache.get(projectId)
  if (!channels || channels.expiresAt < Date.now()) {
    const [project] = await db
      .select({ settings: projects.settings })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    const settings = (project?.settings ?? {}) as Record<string, unknown>
    const channelsConfig = (settings.channels ?? {}) as Record<string, ChannelConfig>
    configCache.set(projectId, { data: channelsConfig, expiresAt: Date.now() + 5 * 60 * 1000 })
    channels = configCache.get(projectId)!
  }

  const channelConfig = channels.data[channel]
  if (!channelConfig?.provider) {
    // Fall back to env-var based providers
    return getEnvFallback(channel)
  }

  const impl = providerImpls.get(`${channel}_${channelConfig.provider}`)
    ?? providerImpls.get(channelConfig.provider)
  if (!impl) {
    console.warn(`[channels] Provider ${channelConfig.provider} for ${channel} not found`)
    return null
  }

  return { provider: impl, config: channelConfig.config }
}

/**
 * Fallback: check env vars for provider credentials
 */
function getEnvFallback(channel: MessageChannel): { provider: ChannelProvider; config: Record<string, string> } | null {
  switch (channel) {
    case 'email': {
      const impl = providerImpls.get('email_resend')
      if (impl && process.env.RESEND_API_KEY) {
        return { provider: impl, config: { apiKey: process.env.RESEND_API_KEY, fromEmail: process.env.FROM_EMAIL ?? 'noreply@storees.io' } }
      }
      return null
    }
    case 'sms': {
      if (process.env.TWILIO_ACCOUNT_SID) {
        const impl = providerImpls.get('sms_twilio')
        if (impl) return { provider: impl, config: { accountSid: process.env.TWILIO_ACCOUNT_SID, authToken: process.env.TWILIO_AUTH_TOKEN!, fromNumber: process.env.TWILIO_FROM_NUMBER! } }
      }
      return null
    }
    case 'whatsapp': {
      if (process.env.WA_PHONE_NUMBER_ID) {
        const impl = providerImpls.get('whatsapp_meta')
        if (impl) return {
          provider: impl,
          config: {
            phoneNumberId: process.env.WA_PHONE_NUMBER_ID,
            wabaId: process.env.WA_WABA_ID ?? process.env.WHATSAPP_WABA_ID ?? '',
            accessToken: process.env.WA_ACCESS_TOKEN!,
          },
        }
      }
      return null
    }
    case 'push': {
      if (process.env.FCM_PROJECT_ID) {
        const impl = providerImpls.get('push_fcm')
        if (impl) return { provider: impl, config: { projectId: process.env.FCM_PROJECT_ID, serviceAccountKey: process.env.FCM_SERVICE_ACCOUNT_KEY! } }
      }
      return null
    }
    default:
      return null
  }
}

/** List all registered provider names by channel */
export function listProviders(): Record<string, string[]> {
  const result: Record<string, string[]> = { sms: [], whatsapp: [], push: [], email: [] }
  for (const key of providerImpls.keys()) {
    const [channel, name] = key.includes('_') ? key.split('_', 2) : ['other', key]
    if (result[channel]) result[channel].push(name)
  }
  return result
}
