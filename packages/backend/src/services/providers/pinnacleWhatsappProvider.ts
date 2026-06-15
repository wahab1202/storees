import type {
  ChannelProvider,
  ProviderTemplate,
  SubmitTemplateInput,
  SubmitTemplateResult,
  TemplateStatusResult,
} from '../channelProviderRegistry.js'
import { resolveTemplateStatusByLanguage } from '../channelProviderRegistry.js'
import { db } from '../../db/connection.js'
import { customers, emailTemplates } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { decrypt } from '../encryption.js'
import { countParameters, buildTemplateComponents, normalizeWhatsAppRecipient } from './whatsappUtils.js'
import { buildMetaComponents, parseMetaTemplate, type MetaTemplate } from './metaWhatsappProvider.js'

/**
 * Pinnacle Teleservices — WhatsApp Business API (Partners API V3).
 *
 * Pinnacle is a BSP that relays Meta's WhatsApp Cloud API. The request/response
 * bodies are therefore the SAME Meta Cloud API shapes the metaWhatsappProvider
 * already speaks — the only differences are:
 *   1. Base URL       → https://partnersv1.pinbot.ai/v3   (vs graph.facebook.com)
 *   2. Auth header    → `apikey: <key>`                   (vs `Authorization: Bearer`)
 *   3. Per-tenant key → each brand brings its own apikey, stored encrypted in
 *                       projects.settings.channels.whatsapp.config.apikey
 *
 * Connector model (BYO credentials): the brand already has a live WABA on
 * Pinnacle. We never create one. Discovery (getuserdetails), WABA info, and
 * webhook registration live as standalone exports used by the connect route.
 *
 * No `parseInbound` is implemented on purpose: inbound replies stay on the
 * Pinnacle dashboard, not in Storees. The channelProviderRegistry capability
 * check (presence of the method) means inbound is never ingested for Pinnacle.
 */

const PINNACLE_BASE = (process.env.PINNACLE_API_URL ?? 'https://partnersv1.pinbot.ai/v3').replace(/\/+$/, '')

/** Resolve the per-tenant apikey (stored encrypted) into request headers. */
function authHeaders(config: Record<string, string>): Record<string, string> {
  const apikey = decrypt(config.apikey ?? '')
  return { apikey, 'Content-Type': 'application/json' }
}

async function readError(resp: Response): Promise<string> {
  const data = await resp.json().catch(() => ({})) as {
    // Meta-relayed nested envelope
    error?: { message?: string; error_user_msg?: string }
    // Pinnacle's own flat envelope: { code, status, message } e.g. "Authentication Failed"
    message?: string
    status?: string
  }
  return data.error?.error_user_msg ?? data.error?.message ?? data.message ?? `HTTP ${resp.status}`
}

export const pinnacleWhatsappProvider: ChannelProvider = {
  name: 'pinnacle',

  /** Free-form text send (24h session window). Body resolved from a template row if given. */
  async send(command, config) {
    const { phoneNumberId } = config
    if (!phoneNumberId) return { messageId: '', status: 'failed', error: 'Pinnacle: phoneNumberId not configured' }

    const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
    const template = command.templateId
      ? (await db.select({ bodyText: emailTemplates.bodyText }).from(emailTemplates).where(eq(emailTemplates.id, command.templateId)).limit(1))[0]
      : undefined

    const to = normalizeWhatsAppRecipient(customer?.phone)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    let body = template?.bodyText ?? ''
    for (const [key, val] of Object.entries(command.variables)) {
      body = body.replaceAll(`{{${key}}}`, val)
    }

    const resp = await fetch(`${PINNACLE_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body },
      }),
    })

    const data = await resp.json() as { messages?: Array<{ id: string }>; error?: { message: string } }
    if (!resp.ok) return { messageId: '', status: 'failed', error: data.error?.message ?? `HTTP ${resp.status}` }
    return { messageId: data.messages?.[0]?.id ?? '', status: 'sent' }
  },

  /** Approved-template send — required outside the 24h window. Components shape shared with Meta. */
  async sendTemplate(command, config) {
    const { phoneNumberId } = config
    if (!phoneNumberId) return { messageId: '', status: 'failed', error: 'Pinnacle: phoneNumberId not configured' }

    let rawTo: string | null | undefined = command.phoneOverride
    if (!rawTo) {
      const [customer] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, command.userId)).limit(1)
      rawTo = customer?.phone
    }
    const to = normalizeWhatsAppRecipient(rawTo)
    if (!to) return { messageId: '', status: 'failed', error: 'No phone number' }

    const components = buildTemplateComponents(command)

    const resp = await fetch(`${PINNACLE_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
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
   * Submit a new template for Meta approval via Pinnacle.
   *   POST /v3/{wabaId}/message_templates
   * Real status starts PENDING (the doc's APPROVED samples are illustrative).
   */
  async submitTemplate(input: SubmitTemplateInput, config: Record<string, string>): Promise<SubmitTemplateResult> {
    const { wabaId } = config
    if (!wabaId) throw new Error('Pinnacle submitTemplate: wabaId required')

    const payload = {
      name: input.name,
      category: input.category,
      language: input.language,
      allow_category_change: true,
      components: buildMetaComponents(input),
    }

    const resp = await fetch(`${PINNACLE_BASE}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error(`Pinnacle submitTemplate failed: ${await readError(resp)}`)

    const data = await resp.json() as { id?: string; status?: string; category?: string }
    return {
      providerTemplateId: data.id ?? input.name,
      status: (data.status ?? 'PENDING').toUpperCase(),
      category: data.category,
    }
  },

  /**
   * Refresh a single template's status. Numeric ids hit /v3/{id}; otherwise
   * filter the WABA template list by name (safety-net poll alongside webhooks).
   */
  async getTemplateStatus(providerTemplateId: string, language: string, config: Record<string, string>): Promise<TemplateStatusResult> {
    const { wabaId } = config
    if (!wabaId) throw new Error('Pinnacle getTemplateStatus: wabaId required')

    const isNumeric = /^\d+$/.test(providerTemplateId)
    const url = isNumeric
      ? `${PINNACLE_BASE}/${providerTemplateId}?fields=name,language,status,category`
      : `${PINNACLE_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(providerTemplateId)}&fields=name,language,status,category`

    const resp = await fetch(url, { headers: authHeaders(config) })
    if (!resp.ok) throw new Error(`Pinnacle getTemplateStatus failed: ${await readError(resp)}`)

    const json = await resp.json() as
      | { name: string; language?: string; status?: string; category?: string; reason?: string }
      | { data: Array<{ name: string; language?: string; status?: string; category?: string; reason?: string }> }

    return resolveTemplateStatusByLanguage(
      'data' in json ? (json.data ?? []) : [json],
      providerTemplateId,
      language,
    )
  },

  /**
   * Pull every template for the WABA (the "show pre-existing Pinnacle templates"
   * requirement + the reconciliation source).
   *   GET /v3/{wabaId}/message_templates
   */
  async syncTemplates(config) {
    const { wabaId } = config
    if (!wabaId) throw new Error('Pinnacle syncTemplates: wabaId required')

    const all: ProviderTemplate[] = []
    let url: string = `${PINNACLE_BASE}/${wabaId}/message_templates?limit=100`
    while (url) {
      const resp = await fetch(url, { headers: authHeaders(config) })
      if (!resp.ok) throw new Error(`Pinnacle syncTemplates failed: ${await readError(resp)}`)
      const page = await resp.json() as { data?: MetaTemplate[]; paging?: { next?: string } } | MetaTemplate[]
      const list = Array.isArray(page) ? page : page.data ?? []
      for (const t of list) all.push(parseMetaTemplate(t))
      url = Array.isArray(page) ? '' : page.paging?.next ?? ''
    }
    return all
  },
}

// ============ Connector onboarding helpers (not part of ChannelProvider) ============
// Used by the connect route. These take a RAW apikey (the just-pasted secret),
// not the encrypted config form.

export type PinnacleAccountTriple = {
  wabaId: string
  waNumber: string
  phoneNumberId: string
}

/**
 * GET /v3/getuserdetails — discover every (wabaid, wanumber, phone_number_id)
 * tied to an apikey. Used at connect time to auto-fill config from one secret.
 */
export async function pinnacleGetUserDetails(rawApikey: string): Promise<PinnacleAccountTriple[]> {
  const resp = await fetch(`${PINNACLE_BASE}/getuserdetails`, {
    headers: { apikey: rawApikey },
  })
  if (!resp.ok) throw new Error(`Pinnacle getuserdetails failed: ${await readError(resp)}`)

  const json = await resp.json() as
    | Array<Record<string, unknown>>
    | { data?: Array<Record<string, unknown>> }
  const rows = Array.isArray(json) ? json : json.data ?? []

  return rows.map(r => ({
    wabaId: String(r.whatsapp_business_account_id ?? r.wabaid ?? r.waba_id ?? ''),
    waNumber: String(r.wanumber ?? r.wa_number ?? r.display_phone_number ?? ''),
    phoneNumberId: String(r.phone_number_id ?? r.phoneNumberId ?? ''),
  })).filter(t => t.phoneNumberId && t.wabaId)
}

/** GET /v3/{wabaId} — WABA info incl. message_template_namespace. */
export async function pinnacleGetWabaInfo(wabaId: string, rawApikey: string): Promise<{ name?: string; namespace?: string }> {
  const resp = await fetch(`${PINNACLE_BASE}/${wabaId}`, { headers: { apikey: rawApikey } })
  if (!resp.ok) throw new Error(`Pinnacle WABA info failed: ${await readError(resp)}`)
  const data = await resp.json() as { name?: string; message_template_namespace?: string }
  return { name: data.name, namespace: data.message_template_namespace }
}

/**
 * POST /v3/{phoneNumberId}/setwebhook — register Storees' single webhook URL for
 * a number, with a relayed verification header. Pinnacle echoes `headers` back
 * on every callback; we verify `x-storees-secret` on inbound.
 */
export async function pinnacleSetWebhook(
  phoneNumberId: string,
  rawApikey: string,
  webhookUrl: string,
  secret: string,
): Promise<void> {
  const resp = await fetch(`${PINNACLE_BASE}/${phoneNumberId}/setwebhook`, {
    method: 'POST',
    headers: { apikey: rawApikey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook_url: webhookUrl, headers: { 'x-storees-secret': secret } }),
  })
  if (!resp.ok) throw new Error(`Pinnacle setwebhook failed: ${await readError(resp)}`)
}

export { PINNACLE_BASE }
