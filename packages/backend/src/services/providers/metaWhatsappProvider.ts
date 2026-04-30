import type { ChannelProvider, ProviderTemplate, InboundMessage } from '../channelProviderRegistry.js'
import { db } from '../../db/connection.js'
import { customers, emailTemplates } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { countParameters } from './whatsappUtils.js'

// Subset of Meta's message_templates response we care about
type MetaComponent =
  | { type: 'BODY'; text?: string }
  | { type: 'HEADER'; format?: string; text?: string }
  | { type: 'FOOTER'; text?: string }
  | { type: 'BUTTONS'; buttons?: unknown[] }
type MetaTemplate = {
  name: string
  language: string
  status: string
  category?: string
  components?: MetaComponent[]
}

function parseMetaTemplate(t: MetaTemplate): ProviderTemplate {
  let bodyText = ''
  let header: unknown
  let footer: string | undefined
  let buttons: unknown
  for (const c of t.components ?? []) {
    if (c.type === 'BODY' && c.text) bodyText = c.text
    else if (c.type === 'HEADER') header = { format: c.format, text: c.text }
    else if (c.type === 'FOOTER') footer = c.text
    else if (c.type === 'BUTTONS') buttons = c.buttons
  }
  return {
    providerTemplateId: t.name, // Meta references templates by name
    name: t.name,
    language: t.language,
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

/** WhatsApp Cloud API (Meta) Provider */
export const metaWhatsappProvider: ChannelProvider = {
  name: 'meta',
  async send(command, config) {
    const { phoneNumberId, accessToken } = config

    const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
    const template = command.templateId ? (await db.select({ bodyText: emailTemplates.bodyText, subject: emailTemplates.subject }).from(emailTemplates).where(eq(emailTemplates.id, command.templateId)).limit(1))[0] : undefined

    const to = customer?.phone
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    let body = template?.bodyText ?? ''
    for (const [key, val] of Object.entries(command.variables)) {
      body = body.replaceAll(`{{${key}}}`, val)
    }

    const resp = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    })

    const data = await resp.json() as { messages?: Array<{ id: string }>; error?: { message: string } }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.error?.message ?? `HTTP ${resp.status}` }
    return { messageId: data.messages?.[0]?.id ?? '', status: 'sent' }
  },

  /**
   * Sends an approved HSM template — required for messaging contacts outside the 24h session window.
   */
  async sendTemplate(command, config) {
    const { phoneNumberId, accessToken } = config
    const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
    const to = customer?.phone
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    // Body params → ordered text components
    const components = command.templateParams.length > 0
      ? [{
          type: 'body',
          parameters: command.templateParams.map(p => ({ type: 'text', text: p })),
        }]
      : []

    const resp = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: command.templateName,
          language: { code: command.templateLanguage },
          components,
        },
      }),
    })
    const data = await resp.json() as { messages?: Array<{ id: string }>; error?: { message: string } }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.error?.message ?? `HTTP ${resp.status}` }
    return { messageId: data.messages?.[0]?.id ?? '', status: 'sent' }
  },

  /**
   * Parses Meta's inbound webhook payload (entry[].changes[].value.messages).
   * Returns one InboundMessage per message in the payload; ignores delivery receipts (those use status events).
   */
  parseInbound(payload) {
    const out: InboundMessage[] = []
    type MetaMsg = {
      id: string
      from: string
      type: string
      text?: { body: string }
      image?: { id: string; mime_type?: string; caption?: string }
      video?: { id: string; mime_type?: string; caption?: string }
      audio?: { id: string; mime_type?: string }
      document?: { id: string; mime_type?: string; filename?: string }
      sticker?: { id: string }
      button?: { text: string; payload?: string }
      interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
      context?: { id: string }
    }
    type MetaWebhook = { entry?: Array<{ changes?: Array<{ value?: { messages?: MetaMsg[] } }> }> }
    const p = payload as MetaWebhook
    for (const entry of p.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const m of change.value?.messages ?? []) {
          let content: string | undefined
          let mediaType: string | undefined
          if (m.text) content = m.text.body
          else if (m.image) { content = m.image.caption; mediaType = 'image' }
          else if (m.video) { content = m.video.caption; mediaType = 'video' }
          else if (m.audio) { mediaType = 'audio' }
          else if (m.document) { content = m.document.filename; mediaType = 'document' }
          else if (m.sticker) { mediaType = 'sticker' }
          else if (m.button) { content = m.button.text }
          else if (m.interactive?.button_reply) { content = m.interactive.button_reply.title }
          else if (m.interactive?.list_reply) { content = m.interactive.list_reply.title }
          out.push({
            providerMessageId: m.id,
            fromPhone: m.from,
            content,
            mediaType,
            replyTo: m.context?.id,
            rawPayload: m,
          })
        }
      }
    }
    return out
  },

  /**
   * Pulls every approved/pending template for the WABA into Storees.
   * Requires `wabaId` (WhatsApp Business Account ID, distinct from phoneNumberId).
   */
  async syncTemplates(config) {
    const { wabaId, accessToken } = config
    if (!wabaId || !accessToken) throw new Error('Meta syncTemplates: wabaId and accessToken required')

    const all: ProviderTemplate[] = []
    let url = `https://graph.facebook.com/v23.0/${wabaId}/message_templates?limit=100`
    while (url) {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { error?: { message: string } }
        throw new Error(`Meta syncTemplates failed: ${err.error?.message ?? `HTTP ${resp.status}`}`)
      }
      const page = await resp.json() as { data: MetaTemplate[]; paging?: { next?: string } }
      for (const t of page.data ?? []) all.push(parseMetaTemplate(t))
      url = page.paging?.next ?? ''
    }
    return all
  },
}
