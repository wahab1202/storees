import type { ChannelProvider, ProviderTemplate, InboundMessage } from '../channelProviderRegistry.js'
import type { SendCommand } from '@storees/shared'
import { db } from '../../db/connection.js'
import { customers, emailTemplates } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { countParameters } from './whatsappUtils.js'

// Subset of Gupshup template list response
type GupshupTemplate = {
  id?: string
  elementName: string
  languageCode: string
  category?: string
  status: string
  data?: string         // body text with {{1}} {{2}} placeholders
  templateType?: string
  containerMeta?: string  // JSON string with header/footer/buttons in some API versions
}

function parseGupshupTemplate(t: GupshupTemplate): ProviderTemplate {
  let header: unknown
  let footer: string | undefined
  let buttons: unknown
  if (t.containerMeta) {
    try {
      const meta = JSON.parse(t.containerMeta) as { header?: unknown; footer?: string; buttons?: unknown }
      header = meta.header
      footer = meta.footer
      buttons = meta.buttons
    } catch { /* ignore malformed */ }
  }
  const bodyText = t.data ?? ''
  return {
    providerTemplateId: t.id ?? t.elementName,
    name: t.elementName,
    language: t.languageCode,
    category: t.category,
    status: t.status,
    bodyText,
    header,
    footer,
    buttons,
    parameterCount: countParameters(bodyText),
    rawPayload: t,
  }
}

async function resolveBody(command: SendCommand): Promise<{ to: string; body: string }> {
  const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
  const template = command.templateId ? (await db.select({ bodyText: emailTemplates.bodyText }).from(emailTemplates).where(eq(emailTemplates.id, command.templateId)).limit(1))[0] : undefined

  let body = template?.bodyText ?? ''
  for (const [key, val] of Object.entries(command.variables)) {
    body = body.replaceAll(`{{${key}}}`, val)
  }
  return { to: customer?.phone ?? '', body }
}

/** Gupshup SMS Provider */
export const gupshupSmsProvider: ChannelProvider = {
  name: 'gupshup',
  async send(command, config) {
    const { userid, password } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const params = new URLSearchParams({
      method: 'sendMessage',
      send_to: to,
      msg: body,
      msg_type: 'TEXT',
      userid,
      password,
      auth_scheme: 'plain',
      format: 'json',
    })

    const resp = await fetch(`https://enterprise.smsgupshup.com/GatewayAPI/rest?${params}`)
    const data = await resp.json() as { response: { id?: string; status?: string } }
    return { messageId: data.response?.id ?? '', status: data.response?.status ?? 'sent' }
  },
}

/** Gupshup WhatsApp Provider */
export const gupshupWhatsappProvider: ChannelProvider = {
  name: 'gupshup',
  async send(command, config) {
    const { apiKey, appName, sourceNumber } = config
    const { to, body } = await resolveBody(command)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
      method: 'POST',
      headers: { 'apikey': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: sourceNumber,
        destination: to,
        'src.name': appName,
        message: JSON.stringify({ type: 'text', text: body }),
      }),
    })

    const data = await resp.json() as { messageId?: string; status?: string; message?: string }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.message ?? `HTTP ${resp.status}` }
    return { messageId: data.messageId ?? '', status: 'sent' }
  },

  /**
   * Sends an approved HSM template via Gupshup's template endpoint.
   * Required for messaging dormant contacts (outside 24h session).
   */
  async sendTemplate(command, config) {
    const { apiKey, appName, sourceNumber } = config
    const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
    const to = customer?.phone
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const resp = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        source: sourceNumber,
        destination: to,
        'src.name': appName,
        template: JSON.stringify({
          id: command.templateName,           // Gupshup uses provider_template_id (we passed name through)
          params: command.templateParams,
        }),
      }),
    })
    const data = await resp.json() as { messageId?: string; status?: string; message?: string }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.message ?? `HTTP ${resp.status}` }
    return { messageId: data.messageId ?? '', status: 'sent' }
  },

  /**
   * Parses Gupshup's inbound webhook payload (type='message').
   * Status updates use type='message-event' and are handled separately by the webhook router.
   */
  parseInbound(payload) {
    type GupshupInbound = {
      type?: string
      payload?: {
        id?: string
        type?: string                            // 'text' | 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'button_reply' | 'list_reply'
        source?: string                          // sender phone
        sender?: { phone?: string }
        payload?: {
          text?: string
          url?: string
          caption?: string
          contentType?: string
          title?: string                          // for button/list replies
          name?: string                           // file name
        }
        context?: { id?: string }
      }
    }
    const p = payload as GupshupInbound
    if (p.type !== 'message') return []
    const inner = p.payload
    const messageId = inner?.id
    if (!messageId) return []
    const fromPhone = inner.source ?? inner.sender?.phone ?? ''
    if (!fromPhone) return []

    const t = inner.type ?? 'text'
    let content: string | undefined
    let mediaType: string | undefined
    let mediaUrl: string | undefined
    if (t === 'text') content = inner.payload?.text
    else if (t === 'image') { mediaType = 'image'; mediaUrl = inner.payload?.url; content = inner.payload?.caption }
    else if (t === 'video') { mediaType = 'video'; mediaUrl = inner.payload?.url; content = inner.payload?.caption }
    else if (t === 'audio') { mediaType = 'audio'; mediaUrl = inner.payload?.url }
    else if (t === 'file') { mediaType = 'document'; mediaUrl = inner.payload?.url; content = inner.payload?.name }
    else if (t === 'sticker') { mediaType = 'sticker'; mediaUrl = inner.payload?.url }
    else if (t === 'button_reply' || t === 'list_reply') { content = inner.payload?.title }

    return [{
      providerMessageId: messageId,
      fromPhone,
      content,
      mediaUrl,
      mediaType,
      replyTo: inner.context?.id,
      rawPayload: inner,
    }]
  },

  /**
   * Pulls approved templates for the Gupshup app. Requires `appId` (distinct from `appName`).
   * Endpoint shape varies between Gupshup tiers; this targets the v1 templates endpoint.
   */
  async syncTemplates(config) {
    const { apiKey, appId } = config
    if (!apiKey || !appId) throw new Error('Gupshup syncTemplates: apiKey and appId required')

    const resp = await fetch(`https://api.gupshup.io/wa/app/${appId}/template`, {
      headers: { apikey: apiKey },
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`Gupshup syncTemplates failed: HTTP ${resp.status} ${errText.slice(0, 200)}`)
    }
    const data = await resp.json() as { templates?: GupshupTemplate[] }
    return (data.templates ?? []).map(parseGupshupTemplate)
  },
}
