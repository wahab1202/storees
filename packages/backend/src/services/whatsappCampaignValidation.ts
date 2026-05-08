import { and, eq } from 'drizzle-orm'
import type { TemplateVariable } from '@storees/shared'
import { db } from '../db/connection.js'
import { whatsappTemplates } from '../db/schema.js'

type WhatsappTemplateForCampaign = {
  status: string
  parameterCount: number | null
  header: unknown
  buttons: unknown
}

export async function assertApprovedWhatsappCampaignTemplate(
  projectId: string,
  templateId: string | undefined | null,
  variables: TemplateVariable[] | undefined | null = [],
): Promise<void> {
  if (!templateId) throw new Error('WhatsApp campaigns require an approved template')

  const [template] = await db
    .select({
      status: whatsappTemplates.status,
      parameterCount: whatsappTemplates.parameterCount,
      header: whatsappTemplates.header,
      buttons: whatsappTemplates.buttons,
    })
    .from(whatsappTemplates)
    .where(and(
      eq(whatsappTemplates.id, templateId),
      eq(whatsappTemplates.projectId, projectId),
    ))
    .limit(1)

  if (!template) throw new Error('WhatsApp template not found')
  if (template.status !== 'APPROVED') throw new Error('WhatsApp campaigns can only use APPROVED templates')

  assertWhatsappTemplateMappings(template, variables ?? [])
}

function assertWhatsappTemplateMappings(
  template: WhatsappTemplateForCampaign,
  variables: TemplateVariable[],
): void {
  const keys = new Set(variables.map(v => String(v.key ?? '').trim()).filter(Boolean))
  const parameterCount = Math.max(0, Number(template.parameterCount ?? 0))

  for (let i = 1; i <= parameterCount; i++) {
    if (!keys.has(String(i))) {
      throw new Error(`WhatsApp template requires a mapping for body variable {{${i}}}`)
    }
  }

  const headerKind = getWhatsappHeaderKind(template.header)
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerKind) && !hasAnyKey(keys, ['wa_header_media_url', 'header_media_url'])) {
    throw new Error(`WhatsApp ${headerKind.toLowerCase()} header requires a media URL mapping`)
  }

  let urlButtonPosition = 0
  getWhatsappButtons(template.buttons).forEach((button) => {
    if (String(button.type ?? '').toUpperCase() !== 'URL') return
    urlButtonPosition += 1
    const url = String(button.url ?? '')
    if (!/\{\{\s*\w+\s*\}\}/.test(url)) return
    if (!hasAnyKey(keys, [`wa_button_url_${urlButtonPosition}`, `button_url_${urlButtonPosition}`])) {
      throw new Error(`WhatsApp URL button ${urlButtonPosition} requires a URL variable mapping`)
    }
  })
}

function getWhatsappHeaderKind(header: unknown): string {
  if (!header || typeof header !== 'object') return ''
  const h = header as { type?: unknown; format?: unknown }
  return String(h.format ?? h.type ?? '').toUpperCase()
}

function getWhatsappButtons(buttons: unknown): Array<{ type?: unknown; url?: unknown }> {
  if (Array.isArray(buttons)) return buttons as Array<{ type?: unknown; url?: unknown }>
  if (buttons && typeof buttons === 'object') {
    const nested = (buttons as { buttons?: unknown }).buttons
    if (Array.isArray(nested)) return nested as Array<{ type?: unknown; url?: unknown }>
  }
  return []
}

function hasAnyKey(keys: Set<string>, candidates: string[]): boolean {
  return candidates.some(key => keys.has(key))
}
