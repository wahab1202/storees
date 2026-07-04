import type { CampaignContentType } from '@storees/shared'
import { readPath } from '@storees/shared'
import {
  getEmailProviderForProject,
  getRegisteredEmailProvider,
  type EmailAttachment,
  type EmailSendCommand,
} from './emailProviderRegistry.js'

type SendEmailParams = {
  to: string
  subject: string
  html: string
  projectId?: string
  contentType?: CampaignContentType
  from?: string | null
  replyTo?: string | null
  cc?: string[]
  bcc?: string[]
  attachments?: EmailAttachment[]
}

export type UtmParameter = {
  key: string
  value: string
}

/**
 * Send an email via the project's configured email provider.
 * Returns the provider message ID on success.
 */
export async function sendEmail({
  to,
  subject,
  html,
  projectId,
  contentType = 'promotional',
  from,
  replyTo,
  cc,
  bcc,
  attachments,
}: SendEmailParams): Promise<string | null> {
  const command = {
      to,
      subject,
      html,
      from,
      replyTo,
      cc,
      bcc,
      attachments,
  }

  try {
    const selection = await getEmailProviderForProject(projectId, contentType)
    const result = await attemptProviderSend(selection.provider, command, selection.config)
    if (result) {
      console.log(`Email sent to ${to} via ${selection.provider}: ${result}`)
      return result
    }

    if (selection.provider !== 'resend') {
      console.warn(`Email provider ${selection.provider} returned no message id; falling back to Resend for ${to}`)
      const fallbackSelection = await getEmailProviderForProject(undefined, contentType)
      const fallback = await attemptProviderSend('resend', command, fallbackSelection.config)
      if (fallback) {
        console.log(`Email sent to ${to} via resend fallback: ${fallback}`)
        return fallback
      }
    }

    console.warn(`Email send to ${to} returned no message id`)
    return null
  } catch (err) {
    console.error('Email send failed:', err)
    try {
      const fallbackSelection = await getEmailProviderForProject(undefined, contentType)
      const fallback = await attemptProviderSend('resend', command, fallbackSelection.config)
      if (fallback) {
        console.log(`Email sent to ${to} via resend fallback after provider error: ${fallback}`)
        return fallback
      }
    } catch (fallbackErr) {
      console.error('Resend fallback failed:', fallbackErr)
    }
    return null
  }
}

async function attemptProviderSend(
  providerName: string,
  command: EmailSendCommand,
  config: Record<string, string>,
): Promise<string | null> {
  try {
    const provider = getRegisteredEmailProvider(providerName)
    const result = await provider.send(command, config)
    return result?.messageId ?? null
  } catch (err) {
    console.error(`Email provider ${providerName} failed:`, err)
    return null
  }
}

/**
 * Replace {{variable}} placeholders in a template string with values from context.
 */
export function interpolateTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  // Keys may be dot-paths (line_items.0.image) — flat keys hit the context
  // map directly, dotted keys traverse nested values.
  return template.replace(/\{\{([\w.]+)\}\}/g, (_match, key: string) => {
    const value = key.includes('.') && context[key] === undefined
      ? readPath(context, key)
      : context[key]
    return value !== undefined && value !== null ? String(value) : ''
  })
}

export function personalizeDynamicImages(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{recipient_image:([a-zA-Z0-9_.-]+)\}\}/g, (_match, key: string) => {
    const imageMap = context.recipient_images
    if (!imageMap || typeof imageMap !== 'object') return ''
    const value = readPath(imageMap as Record<string, unknown>, key)
    return value !== undefined && value !== null ? String(value) : ''
  })
}

export function appendUtmParameters(
  html: string,
  params: UtmParameter[],
  context: Record<string, unknown>,
): string {
  const cleanParams = params
    .map(p => ({ key: p.key.trim(), value: p.value.trim() }))
    .filter(p => p.key && p.value)

  if (cleanParams.length === 0) return html

  return html.replace(/\bhref=(["'])(https?:\/\/[^"']+)\1/gi, (match, quote: string, rawUrl: string) => {
    try {
      const url = new URL(rawUrl)
      for (const param of cleanParams) {
        url.searchParams.set(param.key, interpolateTemplate(param.value, context))
      }
      return `href=${quote}${url.toString()}${quote}`
    } catch {
      return match
    }
  })
}

export function appendUtmParametersToText(
  text: string,
  params: UtmParameter[],
  context: Record<string, unknown>,
): string {
  const cleanParams = params
    .map(p => ({ key: p.key.trim(), value: p.value.trim() }))
    .filter(p => p.key && p.value)

  if (cleanParams.length === 0) return text

  return text.replace(/https?:\/\/[^\s<>"']+/g, (rawUrl) => {
    const trailing = rawUrl.match(/[),.!?;:]+$/)?.[0] ?? ''
    const urlPart = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl
    try {
      const url = new URL(urlPart)
      for (const param of cleanParams) {
        url.searchParams.set(param.key, interpolateTemplate(param.value, context))
      }
      return `${url.toString()}${trailing}`
    } catch {
      return rawUrl
    }
  })
}

// (dotted-path reads use the shared readPath util)
