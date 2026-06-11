import { getLlmConfig, chatCompletion } from './llmService.js'

/**
 * AI copilot for the WhatsApp template builder. Takes a short brief
 * (goal / audience / tone) and drafts a Meta-compliant template: body with
 * numbered {{1}} params, sample values, and suggested header/footer/buttons.
 * Mirrors the copywriterService pattern (getLlmConfig → chatCompletion → JSON).
 */

export type WhatsappCopilotTone = 'professional' | 'friendly' | 'witty' | 'urgent'

export type WhatsappCopilotInput = {
  goal: string
  audience?: string
  tone?: WhatsappCopilotTone
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language?: string
}

export type WhatsappCopilotDraft = {
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  bodyText: string
  /** sample value per numbered param, index 0 = {{1}} */
  variables: Array<{ sample: string; label?: string }>
  header?: { type: 'TEXT'; text: string } | null
  footer?: string | null
  buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone?: string }>
}

const TONE_HINT: Record<WhatsappCopilotTone, string> = {
  professional: 'professional and concise',
  friendly: 'warm and friendly',
  witty: 'playful and witty (but still clear)',
  urgent: 'urgent and action-driving',
}

function buildPrompt(input: WhatsappCopilotInput): { system: string; user: string } {
  const system = [
    'You write WhatsApp Business message templates that comply with Meta/WhatsApp template rules.',
    'Rules:',
    '- Use numbered placeholders {{1}}, {{2}}, … (sequential, no gaps). NEVER use named placeholders.',
    '- A placeholder must not be at the very start or very end of the body.',
    '- Body ≤ 1024 characters. Footer ≤ 60 characters. Header text ≤ 60 characters.',
    '- For UTILITY or AUTHENTICATION categories, do NOT use promotional/marketing language, discounts, or emojis.',
    '- Do not invent media; header (if any) must be plain TEXT.',
    '- Buttons are optional: at most 3 QUICK_REPLY, plus at most 1 URL and 1 PHONE_NUMBER.',
    'Return ONLY a JSON object, no prose, with this exact shape:',
    '{"category":"MARKETING|UTILITY|AUTHENTICATION","bodyText":"...","variables":[{"sample":"...","label":"..."}],"header":{"type":"TEXT","text":"..."}|null,"footer":"..."|null,"buttons":[{"type":"QUICK_REPLY|URL|PHONE_NUMBER","text":"...","url":"...","phone":"..."}]}',
    'The variables array MUST have exactly one entry per {{n}} in bodyText, in order; "sample" is a realistic example value and "label" a short human name.',
  ].join('\n')

  const user = JSON.stringify({
    goal: input.goal,
    audience: input.audience || 'general customers',
    tone: TONE_HINT[input.tone ?? 'professional'],
    category: input.category ?? 'choose the most appropriate',
    language: input.language ?? 'en_US',
  })

  return { system, user }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('LLM response is not JSON')
  return JSON.parse(trimmed.slice(first, last + 1))
}

const VALID_CATEGORIES = new Set(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
const VALID_BUTTONS = new Set(['QUICK_REPLY', 'URL', 'PHONE_NUMBER'])

export async function generateWhatsappTemplate(
  projectId: string,
  input: WhatsappCopilotInput,
): Promise<WhatsappCopilotDraft> {
  const config = await getLlmConfig(projectId)
  if (!config) {
    throw new Error('No AI provider configured for this project — set one in Settings → AI before using the copilot.')
  }

  const { system, user } = buildPrompt(input)
  const response = await chatCompletion(
    config,
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { temperature: 0.6, maxTokens: 900 },
  )

  const parsed = extractJson(response.content) as Partial<WhatsappCopilotDraft>
  if (!parsed.bodyText || typeof parsed.bodyText !== 'string') {
    throw new Error('AI did not return a usable template body')
  }

  const category = (parsed.category && VALID_CATEGORIES.has(parsed.category))
    ? parsed.category
    : (input.category ?? 'MARKETING')

  const variables = Array.isArray(parsed.variables)
    ? parsed.variables
        .filter((v): v is { sample: string; label?: string } => !!v && typeof v.sample === 'string')
        .map(v => ({ sample: v.sample.trim(), label: typeof v.label === 'string' ? v.label.trim() : undefined }))
    : []

  const header = parsed.header && parsed.header.type === 'TEXT' && typeof parsed.header.text === 'string'
    ? { type: 'TEXT' as const, text: parsed.header.text.trim().slice(0, 60) }
    : null

  const buttons = Array.isArray(parsed.buttons)
    ? parsed.buttons
        .filter(b => b && VALID_BUTTONS.has(b.type) && typeof b.text === 'string')
        .slice(0, 6)
        .map(b => ({
          type: b.type,
          text: b.text.trim().slice(0, 25),
          ...(b.type === 'URL' && b.url ? { url: String(b.url).trim() } : {}),
          ...(b.type === 'PHONE_NUMBER' && b.phone ? { phone: String(b.phone).trim() } : {}),
        }))
    : undefined

  return {
    category,
    bodyText: parsed.bodyText.trim().slice(0, 1024),
    variables,
    header,
    footer: typeof parsed.footer === 'string' ? parsed.footer.trim().slice(0, 60) : null,
    buttons,
  }
}
