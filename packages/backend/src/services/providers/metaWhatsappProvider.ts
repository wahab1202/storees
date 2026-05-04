import type {
  ChannelProvider,
  ProviderTemplate,
  InboundMessage,
  CtwaReferral,
  SubmitTemplateInput,
  SubmitTemplateResult,
  TemplateStatusResult,
} from '../channelProviderRegistry.js'
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

/**
 * Translate Storees' SubmitTemplateInput into Meta's `components` array shape.
 * Meta requires example values for any parameter — these power the preview in
 * Meta's review UI and are ALSO checked by their automated reviewer.
 */
function buildMetaComponents(input: SubmitTemplateInput): unknown[] {
  const components: Array<Record<string, unknown>> = []

  // BODY (required) — with example values for {{1}}..{{N}}
  const body: Record<string, unknown> = { type: 'BODY', text: input.bodyText }
  if (input.bodyExample && input.bodyExample.length > 0) {
    body.example = { body_text: [input.bodyExample] } // Meta expects array-of-arrays
  }
  components.push(body)

  // HEADER (optional) — TEXT carries text + example, media carries header_handle from upload
  if (input.header) {
    if (input.header.type === 'TEXT' && input.header.text) {
      const h: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text: input.header.text }
      if (input.header.example) h.example = { header_text: [input.header.example] }
      components.push(h)
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(input.header.type)) {
      // Media headers need an uploaded `header_handle` — caller provides via raw payload
      // for now; we can extend the interface when a customer needs this end-to-end.
      components.push({ type: 'HEADER', format: input.header.type })
    }
  }

  if (input.footer) components.push({ type: 'FOOTER', text: input.footer })

  if (input.buttons && input.buttons.length > 0) {
    const btns = input.buttons.map(b => {
      if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url }
      if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone }
      return { type: 'QUICK_REPLY', text: b.text }
    })
    components.push({ type: 'BUTTONS', buttons: btns })
  }

  return components
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
      // CTWA referral — present only on first message after a Click-to-WhatsApp ad tap
      referral?: {
        source_url?: string
        source_type?: string
        source_id?: string
        headline?: string
        body?: string
        media_type?: string
        image_url?: string
        ctwa_clid?: string
      }
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

          // CTWA referral — sourceId is the only required field; the rest enrich attribution
          let ctwaReferral: CtwaReferral | undefined
          if (m.referral && m.referral.source_id) {
            ctwaReferral = {
              sourceId: m.referral.source_id,
              sourceType: m.referral.source_type,
              sourceUrl: m.referral.source_url,
              headline: m.referral.headline,
              body: m.referral.body,
              mediaType: m.referral.media_type,
              imageUrl: m.referral.image_url,
              ctwaClid: m.referral.ctwa_clid,
            }
          }

          out.push({
            providerMessageId: m.id,
            fromPhone: m.from,
            content,
            mediaType,
            replyTo: m.context?.id,
            ctwaReferral,
            rawPayload: m,
          })
        }
      }
    }
    return out
  },

  /**
   * Submit a new template to Meta. Returns the provider id (Meta uses the
   * template *name* as the id; multiple languages of the same name share it)
   * and Meta's initial status (always PENDING for fresh submissions, but
   * existing approved templates re-submitted by name return APPROVED
   * immediately — Meta dedupes server-side).
   *
   * Requires `wabaId` and `accessToken`. The endpoint is
   *   POST /<waba_id>/message_templates
   */
  async submitTemplate(input: SubmitTemplateInput, config: Record<string, string>): Promise<SubmitTemplateResult> {
    const { wabaId, accessToken } = config
    if (!wabaId || !accessToken) throw new Error('Meta submitTemplate: wabaId and accessToken required')

    const components = buildMetaComponents(input)

    const payload = {
      name: input.name,
      language: input.language,
      category: input.category,
      components,
    }

    const resp = await fetch(`https://graph.facebook.com/v23.0/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { error?: { message: string; error_user_msg?: string } }
      throw new Error(`Meta submitTemplate failed: ${err.error?.error_user_msg ?? err.error?.message ?? `HTTP ${resp.status}`}`)
    }

    const data = await resp.json() as { id?: string; status?: string; category?: string }
    return {
      providerTemplateId: data.id ?? input.name,
      status: (data.status ?? 'PENDING').toUpperCase(),
      category: data.category,
    }
  },

  /**
   * Refresh status for a previously-submitted template. Uses the WABA-level
   * message_templates endpoint and filters by name (Meta has no per-template
   * GET that we trust to be cheap); for production this is fine because the
   * status worker only polls templates we know are still PENDING.
   */
  async getTemplateStatus(providerTemplateId: string, config: Record<string, string>): Promise<TemplateStatusResult> {
    const { wabaId, accessToken } = config
    if (!wabaId || !accessToken) throw new Error('Meta getTemplateStatus: wabaId and accessToken required')

    // providerTemplateId is the Meta template *name* (or numeric id depending on submit response).
    // Meta's name-filter param is `?name=`; numeric ids work via /<id> endpoint.
    const isNumeric = /^\d+$/.test(providerTemplateId)
    const url = isNumeric
      ? `https://graph.facebook.com/v23.0/${providerTemplateId}?fields=name,language,status,category,quality_score`
      : `https://graph.facebook.com/v23.0/${wabaId}/message_templates?name=${encodeURIComponent(providerTemplateId)}&fields=name,language,status,category,quality_score,reason`

    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { error?: { message: string } }
      throw new Error(`Meta getTemplateStatus failed: ${err.error?.message ?? `HTTP ${resp.status}`}`)
    }

    const data = await resp.json() as
      | { name: string; status?: string; category?: string; reason?: string }                       // single
      | { data: Array<{ name: string; status?: string; category?: string; reason?: string }> }     // list

    const t = 'data' in data ? data.data?.[0] : data
    if (!t) throw new Error(`Meta getTemplateStatus: template "${providerTemplateId}" not found`)

    return {
      status: (t.status ?? 'PENDING').toUpperCase(),
      category: t.category,
      rejectionReason: t.reason ?? null,
    }
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
