import type { EmailBlock, EmailBlockType, EmailLayout } from '@storees/shared'
import { getLlmConfig, chatCompletion } from './llmService.js'
import { renderBlocksToHtml } from './emailLayoutRenderer.js'

/**
 * AI email layout generator (Email Engine Step 3).
 *
 * The model returns a strict JSON block schema (never HTML). We validate it to the
 * known vocabulary, then the deterministic renderer owns the HTML + brand. This is
 * the jump from "AI writes copy" to "AI designs the email": it chooses the blocks,
 * their order and the words; the renderer makes it on-brand and email-safe.
 */

export type EmailLayoutInput = {
  goal: string                 // "win back an abandoned cart", "welcome new subscribers"…
  tone?: string                // persuasive / friendly / urgent / informative…
  audience?: string
  language?: string            // e.g. "English", "Hindi"
  hasCart?: boolean            // allow the cart_items block (abandoned-cart style flows)
  hasRecommendations?: boolean // allow the product_grid block
}

const BLOCK_TYPES: EmailBlockType[] = ['hero', 'paragraph', 'button', 'cart_items', 'product_grid', 'discount', 'divider', 'spacer', 'footer_note']
const MAX_BLOCKS = 14

function buildPrompt(input: EmailLayoutInput): { system: string; user: string } {
  const dynamic: string[] = []
  if (input.hasCart) dynamic.push('- {"type":"cart_items"} — the shopper\'s actual abandoned items (rendered automatically). Use once, near the top.')
  if (input.hasRecommendations) dynamic.push('- {"type":"product_grid","heading":"Picked for you"} — a live product recommendation grid (rendered automatically). Use once, lower down.')

  const system = [
    'You are an expert e-commerce email designer. You design an email by choosing a sequence of BLOCKS — you never write HTML.',
    'Respond with STRICT JSON only (no prose, no markdown fences), shaped: {"subject":"...","blocks":[ ... ]}.',
    'Available block types:',
    '- {"type":"hero","heading":"...","subheading":"..."} — the opening headline (subheading optional). Use once, first.',
    '- {"type":"paragraph","text":"..."} — a short paragraph.',
    '- {"type":"button","label":"...","href":"{{cart_url}}"} — a call to action. href MUST be one of the link tokens {{cart_url}} or {{store_url}}.',
    '- {"type":"discount","code":"SAVE10","text":"..."} — a coupon box (only if a discount is part of the goal).',
    '- {"type":"divider"} / {"type":"spacer"} — visual separators.',
    '- {"type":"footer_note","text":"..."} — small print.',
    ...dynamic,
    `Use at most ${MAX_BLOCKS} blocks. Open with a hero and include at least one button. Copy must be concise and specific — no placeholders like "[product]". You may use the personalization token {{customer_name}} in copy.`,
    'Do NOT invent block types or fields beyond those listed.',
  ].join('\n')

  const lines = [
    `Goal: ${input.goal.trim()}`,
    input.tone ? `Tone: ${input.tone}` : '',
    input.audience ? `Audience: ${input.audience}` : '',
    input.language ? `Write all copy in ${input.language}.` : '',
    'Design the email now.',
  ].filter(Boolean)

  return { system, user: lines.join('\n') }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('LLM response is not JSON')
  return JSON.parse(trimmed.slice(first, last + 1))
}

/** Validate/clean raw blocks to the known vocabulary — drop anything malformed. */
export function coerceBlocks(raw: unknown): EmailBlock[] {
  if (!Array.isArray(raw)) return []
  const out: EmailBlock[] = []
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
  for (const b of raw) {
    const type = (b as { type?: string })?.type as EmailBlockType
    if (!BLOCK_TYPES.includes(type)) continue
    const o = b as Record<string, unknown>
    switch (type) {
      case 'hero': {
        const heading = str(o.heading)
        if (!heading) continue
        out.push({ type, heading, ...(str(o.subheading) ? { subheading: str(o.subheading) } : {}) })
        break
      }
      case 'paragraph': { const text = str(o.text); if (text) out.push({ type, text }); break }
      case 'button': { const label = str(o.label); if (label) out.push({ type, label, href: str(o.href) || '{{store_url}}' }); break }
      case 'discount': { const code = str(o.code); if (code) out.push({ type, code, ...(str(o.text) ? { text: str(o.text) } : {}) }); break }
      case 'footer_note': { const text = str(o.text); if (text) out.push({ type, text }); break }
      case 'product_grid': { out.push({ type, ...(str(o.heading) ? { heading: str(o.heading) } : {}) }); break }
      case 'cart_items': out.push({ type }); break
      case 'divider': out.push({ type }); break
      case 'spacer': out.push({ type }); break
    }
    if (out.length >= MAX_BLOCKS) break
  }
  return out
}

export async function generateEmailLayout(
  projectId: string,
  input: EmailLayoutInput,
): Promise<EmailLayout & { html: string }> {
  const config = await getLlmConfig(projectId)
  if (!config) {
    throw new Error('No LLM provider configured for this project — set one in Settings → AI before generating a layout.')
  }
  const { system, user } = buildPrompt(input)
  const response = await chatCompletion(
    config,
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { temperature: 0.6, maxTokens: 2000 },
  )
  const parsed = extractJson(response.content) as { subject?: string; blocks?: unknown }
  const blocks = coerceBlocks(parsed.blocks)
  if (blocks.length === 0) throw new Error('The model did not return any usable blocks')
  const subject = typeof parsed.subject === 'string' && parsed.subject.trim() ? parsed.subject.trim() : 'A note from {{store_name}}'
  return { subject, blocks, html: renderBlocksToHtml(blocks) }
}
