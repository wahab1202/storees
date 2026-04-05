import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import type { MessageChannel, SendCommand } from '@storees/shared'

export type ChannelProvider = {
  name: string
  send(command: SendCommand, config: Record<string, string>): Promise<{ messageId: string; status: string; error?: string }>
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
        if (impl) return { provider: impl, config: { phoneNumberId: process.env.WA_PHONE_NUMBER_ID, accessToken: process.env.WA_ACCESS_TOKEN! } }
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
