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
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
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
      model: String(settings.ai_model ?? DEFAULT_MODELS[settings.ai_provider as LlmProvider] ?? 'llama-3.3-70b-versatile'),
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
  const resp = await fetch(PROVIDER_URLS[provider], {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`${provider} API error (${resp.status}): ${err}`)
  }

  const data = await resp.json() as {
    choices: Array<{ message: { content: string } }>
    model: string
  }

  return {
    content: data.choices[0]?.message?.content ?? '',
    model: data.model,
    provider,
  }
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
