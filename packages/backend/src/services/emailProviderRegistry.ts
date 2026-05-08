import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import type { CampaignContentType } from '@storees/shared'

export type EmailAttachment = {
  filename: string
  content: string
  contentType: string
}

export type EmailSendCommand = {
  to: string
  subject: string
  html: string
  from?: string | null
  replyTo?: string | null
  cc?: string[]
  bcc?: string[]
  attachments?: EmailAttachment[]
}

export type EmailSendResult = {
  messageId: string
  provider: string
}

export type EmailProvider = {
  name: string
  send(command: EmailSendCommand, config: Record<string, string>): Promise<EmailSendResult | null>
}

type EmailProviderConfig = {
  provider: string
  config: Record<string, string>
}

const providers = new Map<string, EmailProvider>()

export function registerEmailProvider(provider: EmailProvider): void {
  providers.set(provider.name, provider)
  console.log(`[email] Registered provider: ${provider.name}`)
}

export async function getEmailProviderForProject(
  projectId: string | undefined,
  contentType: CampaignContentType | 'transactional' | 'promotional' = 'promotional',
): Promise<EmailProviderConfig> {
  if (!projectId) {
    return envFallback('resend')
  }

  const [project] = await db
    .select({
      settings: projects.settings,
      emailMarketingProvider: projects.emailMarketingProvider,
      emailTransactionalProvider: projects.emailTransactionalProvider,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  const configuredProvider = contentType === 'transactional'
    ? project?.emailTransactionalProvider
    : project?.emailMarketingProvider
  const providerName = configuredProvider || 'resend'
  const settings = (project?.settings ?? {}) as Record<string, unknown>
  const channels = (settings.channels ?? {}) as Record<string, { provider?: string; config?: Record<string, string> }>
  const emailChannel = channels.email
  const config = emailChannel?.provider === providerName ? emailChannel.config ?? {} : {}

  return {
    provider: providerName,
    config: {
      ...envConfig(providerName),
      ...config,
    },
  }
}

export function getRegisteredEmailProvider(name: string): EmailProvider {
  const provider = providers.get(name)
  if (!provider) {
    throw new Error(`Email provider "${name}" is not registered`)
  }
  return provider
}

function envFallback(provider: string): EmailProviderConfig {
  return { provider, config: envConfig(provider) }
}

function envConfig(provider: string): Record<string, string> {
  switch (provider) {
    case 'resend':
      return {
        apiKey: process.env.RESEND_API_KEY ?? '',
        fromEmail: process.env.FROM_EMAIL ?? 'Storees <noreply@storees.app>',
      }
    case 'sendgrid':
      return {
        apiKey: process.env.SENDGRID_API_KEY ?? '',
        fromEmail: process.env.FROM_EMAIL ?? 'Storees <noreply@storees.app>',
      }
    case 'mailgun':
      return {
        apiKey: process.env.MAILGUN_API_KEY ?? '',
        domain: process.env.MAILGUN_DOMAIN ?? '',
        baseUrl: process.env.MAILGUN_BASE_URL ?? '',
        fromEmail: process.env.FROM_EMAIL ?? 'Storees <noreply@storees.app>',
      }
    case 'postmark':
      return {
        serverToken: process.env.POSTMARK_SERVER_TOKEN ?? process.env.POSTMARK_API_KEY ?? '',
        fromEmail: process.env.FROM_EMAIL ?? 'Storees <noreply@storees.app>',
      }
    case 'ses':
      return {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        sessionToken: process.env.AWS_SESSION_TOKEN ?? '',
        region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
        fromEmail: process.env.FROM_EMAIL ?? 'Storees <noreply@storees.app>',
      }
    default:
      return {}
  }
}
