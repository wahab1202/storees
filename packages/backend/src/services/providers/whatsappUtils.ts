import type { SendTemplateCommand } from '../channelProviderRegistry.js'

/**
 * Normalize a stored phone into the E.164-style digits WhatsApp/Meta needs (no '+',
 * no spaces/dashes). A bare national number (e.g. an Indian 10-digit "9677772323")
 * is undeliverable — Meta requires the country code. We add a default country code
 * (WHATSAPP_DEFAULT_COUNTRY_CODE, defaults to '91' for India) when the number looks
 * national; numbers that already carry a country code are left as-is.
 */
export function normalizeWhatsAppRecipient(
  phone: string | null | undefined,
  defaultCountryCode: string = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '91',
): string {
  let d = String(phone ?? '').replace(/\D/g, '')   // digits only — drops +, spaces, dashes, parens
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)            // 00 international prefix → strip
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)  // national trunk 0 (e.g. 09677…)
  if (d.length === 10) d = defaultCountryCode + d   // bare national number → prepend country code
  return d
}

/**
 * Build the ordered body params {{1}}..{{N}}, guaranteeing none are empty —
 * Meta rejects a blank body parameter with "(#131008) Required parameter is
 * missing". Falls back: resolved value → per-index fallback (e.g. the template's
 * approved sample) → "-".
 */
export function buildBodyParams(
  count: number,
  valueAt: (i: number) => string | null | undefined,
  fallbackAt?: (i: number) => string | null | undefined,
): string[] {
  const out: string[] = []
  for (let i = 1; i <= count; i++) {
    const v = valueAt(i)?.toString().trim()
    out.push(v || fallbackAt?.(i)?.toString().trim() || '-')
  }
  return out
}

/** Count positional template params: {{1}}, {{2}}... → returns the highest index seen. */
export function countParameters(body: string): number {
  const matches = body.match(/\{\{(\d+)\}\}/g)
  if (!matches) return 0
  return matches.reduce((max, m) => {
    const n = parseInt(m.slice(2, -2), 10)
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 0)
}

/**
 * Build the WhatsApp Cloud API `template.components` array from a send command.
 * Provider-agnostic: the Meta Cloud API shape is identical whether the request
 * goes direct to Meta or through a relaying BSP like Pinnacle, so both providers
 * share this. Covers ordered body params, an optional media header (link form),
 * and dynamic URL-button suffixes.
 */
export function buildTemplateComponents(command: SendTemplateCommand): Array<Record<string, unknown>> {
  // Body params → ordered text components
  const components: Array<Record<string, unknown>> = command.templateParams.length > 0
    ? [{ type: 'body', parameters: command.templateParams.map(p => ({ type: 'text', text: p })) }]
    : []

  // Media header — Meta REQUIRES a media parameter at send time for templates
  // approved with a media header. Fall back to the approved sample URL when no
  // per-send binding is mapped, so unmapped sends don't get rejected outright.
  const header = command.templateHeader as { type?: string; format?: string; example?: string } | null | undefined
  const headerFormat = (header?.format ?? header?.type ?? '').toUpperCase()
  const mediaUrl = command.variables.wa_header_media_url || command.variables.header_media_url || header?.example
  if (mediaUrl && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {
    const mediaType = headerFormat === 'DOCUMENT' ? 'document' : headerFormat.toLowerCase()
    components.push({
      type: 'header',
      parameters: [{ type: mediaType, [mediaType]: { link: mediaUrl } }],
    })
  }

  // Dynamic URL-button suffixes (button_url_1, button_url_2, ... by URL-button order)
  const buttons = Array.isArray(command.templateButtons) ? command.templateButtons as Array<{ type?: string; url?: string; example?: string }> : []
  let urlButtonPosition = 0
  buttons.forEach((button, idx) => {
    const type = (button.type ?? '').toUpperCase()
    if (type === 'URL') {
      urlButtonPosition += 1
      const suffix = command.variables[`wa_button_url_${urlButtonPosition}`] || command.variables[`button_url_${urlButtonPosition}`]
      if (!suffix) return
      components.push({
        type: 'button',
        sub_type: 'url',
        index: String(idx),
        parameters: [{ type: 'text', text: suffix }],
      })
    } else if (type === 'COPY_CODE') {
      // Copy-code buttons carry a coupon code at send-time; fall back to the
      // template's static sample (button.example) when no per-send code is mapped.
      const code = command.variables.wa_copy_code || command.variables.copy_code || button.example
      if (!code) return
      components.push({
        type: 'button',
        sub_type: 'copy_code',
        index: String(idx),
        parameters: [{ type: 'coupon_code', coupon_code: code }],
      })
    }
  })

  return components
}

/**
 * Meta returns `quality_score` either as a plain string or as an object
 * `{ score: 'GREEN', date: … }` depending on endpoint/version. Normalize to
 * the bare uppercase rating, or null when absent.
 */
export function normalizeQualityScore(raw: unknown): string | null {
  if (!raw) return null
  const score = typeof raw === 'object' && raw !== null && 'score' in raw
    ? (raw as { score?: unknown }).score
    : raw
  return typeof score === 'string' && score.trim() ? score.trim().toUpperCase() : null
}
