import { Router } from 'express'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { encrypt, decrypt } from '../services/encryption.js'
import { generateSegmentFilter, isAiEnabled } from '../services/aiSegmentService.js'
import { computeNextBestAction } from '../services/nextBestActionService.js'
import { chatCompletion, getLlmConfig, testConnection } from '../services/llmService.js'
import { generateCopy, type CopywriterChannel, type VoiceTone, type CopywriterLanguage } from '../services/copywriterService.js'
import { generateWhatsappTemplate, type WhatsappCopilotTone } from '../services/whatsappCopilotService.js'
import { clearProjectChannelProviderCache } from '../services/channelProviderRegistry.js'

const router = Router()

// GET /api/ai/status — check if AI features are available
router.get('/status', (_req, res) => {
  res.json({ success: true, data: { enabled: isAiEnabled() } })
})

// POST /api/ai/segment?projectId=...
// Body: { input: string, history?: { role: 'user' | 'assistant', text: string }[] }
router.post('/segment', requireProjectId, async (req, res) => {
  try {
    const { input, history } = req.body

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Input text is required' })
    }

    if (input.length > 500) {
      return res.status(400).json({ success: false, error: 'Input too long (max 500 characters)' })
    }

    const projectId = req.query.projectId as string
    const result = await generateSegmentFilter(projectId, input.trim(), history)

    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI generation failed'
    console.error('[AI] Segment generation error:', message)
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/ai/copywriter — Gap 3: channel-aware marketing copy generator.
// Mirrors MoEngage's Merlin Copywriter: structured prompt fields (channel,
// voice/tone, language, audience, keywords) → N variants of usable copy
// that fit the channel's character limits.
const VALID_CHANNELS: CopywriterChannel[] = ['email', 'sms', 'push', 'whatsapp']
const VALID_TONES: VoiceTone[] = ['persuasive', 'informative', 'excitement', 'fomo', 'exclusivity']
const VALID_LANGS: CopywriterLanguage[] = ['en', 'hi', 'ta', 'fr', 'es', 'zh']

router.post('/copywriter', requireProjectId, async (req, res) => {
  try {
    const {
      channel, useCase, voiceTone, language,
      audiencePersona, includeKeywords, excludeKeywords, variantCount,
    } = req.body as Record<string, unknown>

    if (typeof useCase !== 'string' || useCase.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'useCase is required' })
    }
    if (useCase.length > 800) {
      return res.status(400).json({ success: false, error: 'useCase too long (max 800 chars)' })
    }
    if (!VALID_CHANNELS.includes(channel as CopywriterChannel)) {
      return res.status(400).json({ success: false, error: `channel must be one of ${VALID_CHANNELS.join(', ')}` })
    }
    if (!VALID_TONES.includes(voiceTone as VoiceTone)) {
      return res.status(400).json({ success: false, error: `voiceTone must be one of ${VALID_TONES.join(', ')}` })
    }
    if (!VALID_LANGS.includes(language as CopywriterLanguage)) {
      return res.status(400).json({ success: false, error: `language must be one of ${VALID_LANGS.join(', ')}` })
    }

    const result = await generateCopy(req.projectId!, {
      channel: channel as CopywriterChannel,
      useCase: useCase.trim(),
      voiceTone: voiceTone as VoiceTone,
      language: language as CopywriterLanguage,
      audiencePersona: typeof audiencePersona === 'string' ? audiencePersona.trim() : undefined,
      includeKeywords: Array.isArray(includeKeywords) ? includeKeywords.filter((x): x is string => typeof x === 'string') : undefined,
      excludeKeywords: Array.isArray(excludeKeywords) ? excludeKeywords.filter((x): x is string => typeof x === 'string') : undefined,
      variantCount: typeof variantCount === 'number' ? variantCount : 3,
    })

    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Copywriter failed'
    console.error('[AI] Copywriter error:', message)
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/ai/whatsapp-template?projectId=...
// Body: { goal, audience?, tone?, category?, language? }
// Drafts a Meta-compliant WhatsApp template (body + numbered vars + suggestions).
const VALID_WA_TONES: WhatsappCopilotTone[] = ['professional', 'friendly', 'witty', 'urgent']
router.post('/whatsapp-template', requireProjectId, async (req, res) => {
  try {
    const { goal, audience, tone, category, language } = req.body as Record<string, unknown>
    if (typeof goal !== 'string' || goal.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'goal is required' })
    }
    if (goal.length > 800) {
      return res.status(400).json({ success: false, error: 'goal too long (max 800 chars)' })
    }
    const result = await generateWhatsappTemplate(req.projectId!, {
      goal: goal.trim(),
      audience: typeof audience === 'string' ? audience.trim() : undefined,
      tone: VALID_WA_TONES.includes(tone as WhatsappCopilotTone) ? (tone as WhatsappCopilotTone) : undefined,
      category: ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category as string) ? (category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION') : undefined,
      language: typeof language === 'string' ? language.trim() : undefined,
    })
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'WhatsApp template generation failed'
    console.error('[AI] WhatsApp template error:', message)
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/ai/next-action/:customerId — Next Best Action for a customer
router.post('/next-action/:customerId', requireProjectId, async (req, res) => {
  try {
    const result = await computeNextBestAction(req.params.customerId as string, req.projectId!)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('Next Best Action error:', err)
    res.status(500).json({ success: false, error: 'Failed to compute next best action' })
  }
})

// POST /api/ai/campaign-variations?projectId=...
// Body: { channel, subject?, body, goal?, count? }
router.post('/campaign-variations', requireProjectId, async (req, res) => {
  try {
    const { channel, subject, body, goal, count } = req.body as {
      channel?: string
      subject?: string
      body?: string
      goal?: string
      count?: number
    }
    if (!channel || !['email', 'sms', 'push', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, error: 'Valid channel is required' })
    }
    if (!body?.trim() && !subject?.trim()) {
      return res.status(400).json({ success: false, error: 'Subject or body is required' })
    }
    const config = await getLlmConfig(req.projectId!)
    if (!config) {
      return res.status(400).json({ success: false, error: 'AI provider is not configured' })
    }

    const desired = Math.max(1, Math.min(5, Math.floor(count ?? 3)))
    const channelInstruction = {
      email: 'Email may include a subject and rich body copy. Keep body suitable for an email content block.',
      sms: 'SMS must return an empty subject and a short body under 160 characters when possible.',
      push: 'Push should return a short notification title in subject and a concise notification body.',
      whatsapp: 'WhatsApp must return an empty subject and short template-style body text only. Do not invent media, headers, buttons, or non-approved template capabilities.',
    }[channel]

    const result = await chatCompletion(config, [
      {
        role: 'system',
        content: [
          'You generate concise marketing campaign copy from the full brief and existing campaign text.',
          'Respect include/exclude keywords, target audience, tone, language, coupon, emoji preference, and channel constraints when present in the brief.',
          'Preserve mustache variables exactly, e.g. {{customer_name}}. Do not rename, escape, or invent variables unless explicitly requested.',
          channelInstruction,
          'Return only JSON: {"variations":[{"subject":"...","body":"...","tone":"..."}]}.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          channel,
          goal: goal ?? 'Improve campaign engagement',
          subject: subject ?? '',
          body: body ?? '',
          count: desired,
        }),
      },
    ], { temperature: 0.7, maxTokens: 900 })

    const parsed = parseCampaignVariationResponse(result.content)
    const variations = parsed
      .slice(0, desired)
      .map(v => ({
        subject: ['sms', 'whatsapp'].includes(channel) ? '' : String(v.subject ?? ''),
        body: String(v.body ?? ''),
        tone: String(v.tone ?? 'variation'),
      }))
      .filter(v => v.subject.trim() || v.body.trim())
    res.json({ success: true, data: { variations, provider: result.provider, model: result.model } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate campaign variations'
    console.error('[AI] Campaign variation error:', message)
    res.status(500).json({ success: false, error: message })
  }
})

// GET /api/ai/config — Get current AI provider config (redacted key)
router.get('/config', requireProjectId, async (req, res) => {
  try {
    const config = await getLlmConfig(req.projectId!)
    if (!config) {
      return res.json({ success: true, data: { configured: false } })
    }
    res.json({
      success: true,
      data: {
        configured: true,
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey.slice(0, 8) + '...' + config.apiKey.slice(-4),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch AI config' })
  }
})

// GET /api/ai/channel-config — Get saved messaging provider settings, redacted.
router.get('/channel-config', requireProjectId, async (req, res) => {
  try {
    const [project] = await db
      .select({ settings: projects.settings })
      .from(projects)
      .where(eq(projects.id, req.projectId!))
      .limit(1)
    const settings = (project?.settings ?? {}) as Record<string, unknown>
    const channels = (settings.channels ?? {}) as Record<string, { provider?: string; config?: Record<string, string> }>
    const redacted = Object.fromEntries(Object.entries(channels).map(([channel, value]) => [
      channel,
      {
        provider: value.provider,
        config: redactSecrets(value.config ?? {}),
      },
    ]))
    res.json({ success: true, data: { channels: redacted } })
  } catch (err) {
    console.error('Fetch channel config error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch channel config' })
  }
})

// POST /api/ai/config — Save AI provider config OR channel provider config
router.post('/config', requireProjectId, async (req, res) => {
  try {
    const { provider, apiKey, model, channelConfig } = req.body as {
      provider: string
      apiKey: string
      model?: string
      channelConfig?: Record<string, { provider: string; config: Record<string, string> }>
    }

    // Channel config save (SMS/WhatsApp/Push provider settings)
    if (channelConfig) {
      const [project] = await db
        .select({ settings: projects.settings })
        .from(projects)
        .where(eq(projects.id, req.projectId!))
        .limit(1)
      const settings = (project?.settings ?? {}) as Record<string, unknown>
      const existingChannels = (settings.channels ?? {}) as Record<string, { provider?: string; config?: Record<string, string> }>
      const mergedChannels = { ...existingChannels }

      for (const [channel, incoming] of Object.entries(channelConfig)) {
        const previous = existingChannels[channel] ?? { config: {} }
        const cleanedConfig = Object.fromEntries(
          Object.entries(incoming.config ?? {}).filter(([, value]) => String(value ?? '').trim() !== ''),
        )
        mergedChannels[channel] = {
          provider: incoming.provider,
          config: {
            ...(previous.provider === incoming.provider ? previous.config ?? {} : {}),
            ...cleanedConfig,
          },
        }
      }

      const channelJson = JSON.stringify(mergedChannels)
      const emailProvider = mergedChannels.email?.provider
      await db.execute(sql`
        UPDATE projects SET
          settings = jsonb_set(
            COALESCE(settings, '{}'::jsonb),
            '{channels}',
            ${channelJson}::jsonb
          ),
          email_marketing_provider = COALESCE(${emailProvider ?? null}, email_marketing_provider),
          email_transactional_provider = COALESCE(${emailProvider ?? null}, email_transactional_provider),
          updated_at = NOW()
        WHERE id = ${req.projectId!}
      `)
      clearProjectChannelProviderCache(req.projectId!)
      return res.json({ success: true })
    }

    // AI provider config save. Allow model/provider edits without re-entering
    // the secret when an existing key is already stored for the same provider.
    if (!provider) {
      return res.status(400).json({ success: false, error: 'provider is required' })
    }
    const [project] = await db
      .select({ settings: projects.settings })
      .from(projects)
      .where(eq(projects.id, req.projectId!))
      .limit(1)
    const settings = (project?.settings ?? {}) as Record<string, unknown>
    const existingProvider = String(settings.ai_provider ?? '')
    const existingKey = existingProvider === provider ? decrypt(String(settings.ai_api_key ?? '')) : ''
    const nextKey = apiKey?.trim() || existingKey
    if (!nextKey) {
      return res.status(400).json({ success: false, error: 'apiKey is required for a new AI provider' })
    }

    // Update project settings
    await db.execute(sql`
      UPDATE projects SET
        settings = COALESCE(settings, '{}'::jsonb)
          || jsonb_build_object(
            'ai_provider', ${provider},
            'ai_api_key', ${encrypt(nextKey)},
            'ai_model', ${model ?? ''}
          ),
        updated_at = NOW()
      WHERE id = ${req.projectId!}
    `)

    res.json({ success: true })
  } catch (err) {
    console.error('Save AI config error:', err)
    res.status(500).json({ success: false, error: 'Failed to save AI config' })
  }
})

// Redact by pattern rather than an exact denylist so provider-specific key names
// (apikey, secretAccessKey, serviceAccountKey, serverToken, …) can never leak.
const SECRET_KEY_HINT = /(secret|token|password|passwd|key|credential|auth|private)/i

function redactSecrets(config: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [
    key,
    SECRET_KEY_HINT.test(key) && value ? `${value.slice(0, 4)}...${value.slice(-4)}` : value,
  ]))
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

function parseCampaignVariationResponse(content: string): Array<{ subject?: string; body?: string; tone?: string }> {
  try {
    const parsed = JSON.parse(extractJsonObject(content)) as {
      variations?: Array<{ subject?: string; body?: string; tone?: string }>
    }
    if (Array.isArray(parsed.variations)) return parsed.variations
  } catch {
    // Some providers still wrap JSON in prose despite the system prompt. Fall
    // back to a single body variation so the UI can recover gracefully.
  }
  const cleaned = content
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  return cleaned ? [{ body: cleaned, tone: 'generated' }] : []
}

// POST /api/ai/test-connection — Test LLM connection
router.post('/test-connection', requireProjectId, async (req, res) => {
  try {
    const config = await getLlmConfig(req.projectId!)
    if (!config) {
      return res.json({ success: false, error: 'No AI provider configured' })
    }
    const result = await testConnection(config)
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Connection test failed' })
  }
})

export default router
