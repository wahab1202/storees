import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'

type LlmProvider = 'groq' | 'openai' | 'anthropic'

type LlmConfig = {
  provider: LlmProvider
  apiKey: string
  model: string
}

type LlmMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type LlmResponse = {
  content: string
  model: string
  provider: LlmProvider
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  // Groq retired llama-3.3-70b-versatile (shutdown 2026-08-16); their mapped
  // replacement is openai/gpt-oss-120b. See GROQ_FALLBACK_CHAIN for runtime
  // resilience when a saved/old model is decommissioned.
  groq: 'openai/gpt-oss-120b',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
}

// Ordered fallback for Groq: when the requested model is decommissioned (404 /
// model_not_found), retry down this chain instead of failing the whole feature.
const GROQ_FALLBACK_CHAIN = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']

function isRetiredModelError(status: number, body: string): boolean {
  if (status !== 404 && status !== 400) return false
  return /model_not_found|model_decommissioned|does not exist|decommission/i.test(body)
}

const PROVIDER_URLS: Record<LlmProvider, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
}

/**
 * Get LLM config from project settings.
 * Falls back to GROQ_API_KEY env var if no project-level config.
 */
export async function getLlmConfig(projectId: string): Promise<LlmConfig | null> {
  const [project] = await db
    .select({ settings: projects.settings })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  const settings = (project?.settings ?? {}) as Record<string, unknown>

  // Project-level config
  if (settings.ai_api_key && settings.ai_provider) {
    return {
      provider: settings.ai_provider as LlmProvider,
      apiKey: String(settings.ai_api_key),
      model: String(settings.ai_model ?? DEFAULT_MODELS[settings.ai_provider as LlmProvider] ?? DEFAULT_MODELS.groq),
    }
  }

  // Fallback to env vars
  if (process.env.GROQ_API_KEY) {
    return { provider: 'groq', apiKey: process.env.GROQ_API_KEY, model: DEFAULT_MODELS.groq }
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: DEFAULT_MODELS.openai }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: DEFAULT_MODELS.anthropic }
  }

  return null
}

/**
 * Send a chat completion request to any supported LLM provider.
 */
export async function chatCompletion(
  config: LlmConfig,
  messages: LlmMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<LlmResponse> {
  const { provider, apiKey, model } = config
  const temperature = options?.temperature ?? 0.3
  const maxTokens = options?.maxTokens ?? 1024

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, messages, temperature, maxTokens)
  }

  // Groq and OpenAI use the same OpenAI-compatible API format
  return callOpenAICompatible(provider, apiKey, model, messages, temperature, maxTokens)
}

async function callOpenAICompatible(
  provider: LlmProvider,
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  temperature: number,
  maxTokens: number,
): Promise<LlmResponse> {
  // Candidate models: the requested one first, then (groq only) the fallback
  // chain, so a decommissioned model degrades to a working one instead of
  // failing the whole feature.
  const candidates = [model]
  if (provider === 'groq') {
    for (const m of GROQ_FALLBACK_CHAIN) if (!candidates.includes(m)) candidates.push(m)
  }

  let lastError = `${provider} API error`
  for (let i = 0; i < candidates.length; i++) {
    const tryModel = candidates[i]
    const resp = await fetch(PROVIDER_URLS[provider], {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: tryModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    })

    if (resp.ok) {
      const data = await resp.json() as {
        choices: Array<{ message: { content: string } }>
        model: string
      }
      if (i > 0) console.warn(`[llm] ${provider} model "${model}" unavailable — used fallback "${tryModel}"`)
      return {
        content: data.choices[0]?.message?.content ?? '',
        model: data.model,
        provider,
      }
    }

    const err = await resp.text()
    lastError = `${provider} API error (${resp.status}): ${err}`
    // Only fall through on a retired-model error (groq chain); every other
    // failure (auth, rate limit, bad request) throws immediately as before.
    const canFallback = provider === 'groq' && isRetiredModelError(resp.status, err) && i < candidates.length - 1
    if (!canFallback) throw new Error(lastError)
  }
  throw new Error(lastError)
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  temperature: number,
  maxTokens: number,
): Promise<LlmResponse> {
  // Extract system message
  const systemMsg = messages.find(m => m.role === 'system')?.content ?? ''
  const userMessages = messages.filter(m => m.role !== 'system')

  const resp = await fetch(PROVIDER_URLS.anthropic, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system: systemMsg,
      messages: userMessages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Anthropic API error (${resp.status}): ${err}`)
  }

  const data = await resp.json() as {
    content: Array<{ text: string }>
    model: string
  }

  return {
    content: data.content[0]?.text ?? '',
    model: data.model,
    provider: 'anthropic',
  }
}

/**
 * Test an LLM connection with a simple prompt.
 */
export async function testConnection(config: LlmConfig): Promise<{ ok: boolean; error?: string; model: string }> {
  try {
    const result = await chatCompletion(config, [
      { role: 'system', content: 'Respond with exactly: {"status":"ok"}' },
      { role: 'user', content: 'Test' },
    ], { maxTokens: 20 })
    return { ok: true, model: result.model }
  } catch (err) {
    return { ok: false, error: (err as Error).message, model: config.model }
  }
}
