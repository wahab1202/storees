import type { SendTemplateCommand } from '../channelProviderRegistry.js'

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

  // Media header — only when the template declares a media header AND a link is supplied
  const header = command.templateHeader as { type?: string; format?: string } | null | undefined
  const headerFormat = (header?.format ?? header?.type ?? '').toUpperCase()
  const mediaUrl = command.variables.wa_header_media_url || command.variables.header_media_url
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
