import { getLlmConfig, chatCompletion } from './llmService.js'

// Gap 3: AI Copywriter. Generates channel-aware marketing copy via the
// project's configured LLM provider (same llmService as Segment AI).
//
// Channel constraints we tell the model about:
//   email     — subject (≤ 60 chars) + body (~200 words, can be longer)
//   sms       — body only, ≤ 160 chars (avoid splits + carrier costs)
//   push      — title (≤ 50 chars) + body (≤ 200 chars, no salesy spam)
//   whatsapp  — body only, ≤ 1024 chars (provider hard cap)
//
// Output is always strict JSON so the frontend can apply variants
// directly to the campaign content fields without parsing prose.

export type CopywriterChannel = 'email' | 'sms' | 'push' | 'whatsapp'
export type VoiceTone = 'persuasive' | 'informative' | 'excitement' | 'fomo' | 'exclusivity'
export type CopywriterLanguage = 'en' | 'hi' | 'ta' | 'fr' | 'es' | 'zh'

export type CopywriterInput = {
  channel: CopywriterChannel
  useCase: string
  voiceTone: VoiceTone
  language: CopywriterLanguage
  audiencePersona?: string
  includeKeywords?: string[]
  excludeKeywords?: string[]
  variantCount?: number
}

export type CopywriterVariant = {
  subject?: string   // only for email + push
  body: string
}

const CHANNEL_CONSTRAINTS: Record<CopywriterChannel, string> = {
  email: 'Email: produce both a SUBJECT (max 60 chars, no clickbait, no ALL CAPS) and a BODY (3-5 short paragraphs, friendly tone, end with one clear CTA).',
  sms:   'SMS: produce only a BODY. STRICT 160 character limit including spaces. No subject. One clear CTA, no emoji spam.',
  push:  'Push notification: produce a TITLE (max 50 chars) as the "subject" field AND a BODY (max 200 chars). The title hooks attention, the body is the actual message. Avoid generic phrasing.',
  whatsapp: 'WhatsApp: produce only a BODY (max 1024 chars). Use line breaks where natural. Conversational tone — like texting a friend. Do not greet with "Dear" or formal openers.',
}

const VOICE_GUIDES: Record<VoiceTone, string> = {
  persuasive:  'Voice: persuasive. Make a clear case for action. Lead with the benefit; let the offer land naturally.',
  informative: 'Voice: informative. Plain, factual, useful. No salesy adjectives.',
  excitement:  'Voice: excitement. High energy, present tense, action verbs. One emoji max — only if it adds meaning.',
  fomo:        'Voice: FOMO. Highlight scarcity / time pressure honestly. Never invent fake urgency.',
  exclusivity: 'Voice: exclusivity. Make the recipient feel chosen. "You\'re one of the first…" framing.',
}

const LANGUAGE_NAMES: Record<CopywriterLanguage, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  ta: 'Tamil',
  fr: 'French',
  es: 'Spanish',
  zh: 'Simplified Chinese',
}

function buildPrompt(input: CopywriterInput): { system: string; user: string } {
  const count = Math.max(1, Math.min(input.variantCount ?? 3, 5))

  const system = [
    'You are a senior marketing copywriter. You write copy that fits exact channel constraints and never breaks character.',
    'Always respond with STRICT JSON in this shape — no prose, no markdown fences:',
    '{"variants":[{"subject":"...","body":"..."}, ...]}',
    'For SMS and WhatsApp channels, omit the subject field entirely.',
    'Every variant must obey the channel\'s character limits.',
  ].join('\n')

  const lines: string[] = []
  lines.push(`Generate ${count} distinct variants of marketing copy.`)
  lines.push('')
  lines.push(`Channel: ${input.channel}`)
  lines.push(CHANNEL_CONSTRAINTS[input.channel])
  lines.push('')
  lines.push(VOICE_GUIDES[input.voiceTone])
  lines.push('')
  lines.push(`Write in ${LANGUAGE_NAMES[input.language]}.`)
  lines.push('')
  lines.push(`Use case / context: ${input.useCase.trim()}`)
  if (input.audiencePersona?.trim()) {
    lines.push(`Audience: ${input.audiencePersona.trim()}`)
  }
  if (input.includeKeywords?.length) {
    lines.push(`Try to include these keywords naturally: ${input.includeKeywords.join(', ')}`)
  }
  if (input.excludeKeywords?.length) {
    lines.push(`Avoid these words entirely: ${input.excludeKeywords.join(', ')}`)
  }
  lines.push('')
  lines.push('Each variant should approach the use case from a different angle — not just reword the same line.')

  return { system, user: lines.join('\n') }
}

function extractJson(raw: string): unknown {
  // Strip markdown fences and any leading prose. Find the first { and last }.
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('LLM response is not JSON')
  return JSON.parse(trimmed.slice(first, last + 1))
}

export async function generateCopy(
  projectId: string,
  input: CopywriterInput,
): Promise<{ variants: CopywriterVariant[] }> {
  const config = await getLlmConfig(projectId)
  if (!config) {
    throw new Error('No LLM provider configured for this project — set one in Settings → AI before using the copywriter.')
  }

  const { system, user } = buildPrompt(input)
  const response = await chatCompletion(
    config,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.7, maxTokens: 1500 },
  )

  const parsed = extractJson(response.content) as { variants?: Array<{ subject?: string; body?: string }> }
  if (!parsed.variants || !Array.isArray(parsed.variants)) {
    throw new Error('LLM did not return a variants array')
  }

  const variants: CopywriterVariant[] = parsed.variants
    .filter((v) => typeof v?.body === 'string' && v.body.trim().length > 0)
    .map((v) => {
      const out: CopywriterVariant = { body: v.body!.trim() }
      if ((input.channel === 'email' || input.channel === 'push') && typeof v.subject === 'string') {
        out.subject = v.subject.trim()
      }
      return out
    })

  if (variants.length === 0) {
    throw new Error('LLM returned variants but none had a usable body')
  }
  return { variants }
}
