import type { ChannelProvider, InboundMessage } from '../channelProviderRegistry.js'
import type { SendCommand } from '@storees/shared'
import { db } from '../../db/connection.js'
import { customers, emailTemplates } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

async function resolveBody(command: SendCommand): Promise<{ to: string; body: string }> {
  const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
  const template = command.templateId ? (await db.select({ bodyText: emailTemplates.bodyText }).from(emailTemplates).where(eq(emailTemplates.id, command.templateId)).limit(1))[0] : undefined

  let body = template?.bodyText ?? ''
  for (const [key, val] of Object.entries(command.variables)) {
    body = body.replaceAll(`{{${key}}}`, val)
  }
  return { to: customer?.phone ?? '', body }
}

/** Bird (MessageBird) SMS Provider */
export const birdSmsProvider: ChannelProvider = {
  name: 'bird',
  async send(command, config) {
    const { accessKey, originator } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://rest.messagebird.com/messages', {
      method: 'POST',
      headers: {
        'Authorization': `AccessKey ${accessKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipients: [to], originator, body }),
    })

    const data = await resp.json() as { id?: string; status?: string; errors?: Array<{ description: string }> }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.errors?.[0]?.description ?? `HTTP ${resp.status}` }
    return { messageId: data.id ?? '', status: 'sent' }
  },
}

/** Bird (MessageBird) WhatsApp Provider via Conversations API */
export const birdWhatsappProvider: ChannelProvider = {
  name: 'bird',
  async send(command, config) {
    const { accessKey, channelId } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://conversations.messagebird.com/v1/conversations/start', {
      method: 'POST',
      headers: {
        'Authorization': `AccessKey ${accessKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        channelId,
        type: 'text',
        content: { text: body },
      }),
    })

    const data = await resp.json() as { id?: string; status?: string; errors?: Array<{ description: string }> }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.errors?.[0]?.description ?? `HTTP ${resp.status}` }
    return { messageId: data.id ?? '', status: 'sent' }
  },

  /**
   * Bird Conversations template send. providerTemplateId stored in our DB is the Bird HSM
   * template projectId/name (Bird requires both — we serialize as 'projectId:name' or pass name only).
   */
  async sendTemplate(command, config) {
    const { accessKey, channelId } = config
    const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
    const to = customer?.phone
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://conversations.messagebird.com/v1/send', {
      method: 'POST',
      headers: { Authorization: `AccessKey ${accessKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        channelId,
        type: 'hsm',
        content: {
          hsm: {
            namespace: command.templateLanguage,           // Bird also uses namespace; we stash language here
            templateName: command.templateName,
            language: { policy: 'deterministic', code: command.templateLanguage },
            params: command.templateParams.map(text => ({ default: text })),
          },
        },
      }),
    })
    const data = await resp.json() as { id?: string; errors?: Array<{ description: string }> }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.errors?.[0]?.description ?? `HTTP ${resp.status}` }
    return { messageId: data.id ?? '', status: 'sent' }
  },

  /**
   * Bird Conversations inbound webhook payload shape:
   * { type: 'message.created', message: { id, channelId, from, content: { text, type, ... } } }
   */
  parseInbound(payload) {
    type BirdMsg = {
      id: string
      from: string
      direction?: string
      content?: {
        text?: string
        type?: string
        url?: string
        caption?: string
      }
    }
    type BirdWebhook = { type?: string; message?: BirdMsg }
    const p = payload as BirdWebhook
    if (p.type !== 'message.created' || !p.message?.id || !p.message.from) return []
    if (p.message.direction === 'sent') return []  // outbound echo

    const t = p.message.content?.type ?? 'text'
    let mediaType: string | undefined
    let mediaUrl: string | undefined
    let content = p.message.content?.text
    if (t === 'image' || t === 'video' || t === 'audio' || t === 'file') {
      mediaType = t === 'file' ? 'document' : t
      mediaUrl = p.message.content?.url
      content = p.message.content?.caption
    }
    return [{
      providerMessageId: p.message.id,
      fromPhone: p.message.from,
      content,
      mediaUrl,
      mediaType,
      rawPayload: p.message,
    } as InboundMessage]
  },
}
