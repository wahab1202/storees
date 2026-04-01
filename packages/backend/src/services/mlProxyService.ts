/**
 * ML Proxy Service
 *
 * Proxies requests to the Python FastAPI ML service.
 * Handles: timeouts, camelCase↔snake_case conversion,
 * graceful degradation, caching.
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
const PROPENSITY_TIMEOUT = 5000  // 5s
const HEALTH_TIMEOUT = 2000     // 2s

type MlFactor = {
  feature: string
  value: number
  impact: number
  direction: 'positive' | 'negative'
  label: string
}

type MlScoreResult = {
  customerId: string
  score: number
  confidence: number
  bucket: 'High' | 'Medium' | 'Low'
}

type MlScoreResponse = {
  scores: MlScoreResult[]
  modelVersion: string
  computedAt: string
}

type MlExplainResponse = {
  customerId: string
  score: number
  confidence: number
  bucket: 'High' | 'Medium' | 'Low'
  factors: MlFactor[]
  modelVersion: string
}

// snake_case to camelCase conversion
function toCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toCamel)
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      result[camelKey] = toCamel(value)
    }
    return result
  }
  return obj
}

// camelCase to snake_case conversion
function toSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toSnake)
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const snakeKey = key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
      result[snakeKey] = toSnake(value)
    }
    return result
  }
  return obj
}

async function mlFetch(path: string, options: {
  method?: string
  body?: unknown
  timeout?: number
} = {}): Promise<unknown> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? PROPENSITY_TIMEOUT)

  try {
    const res = await fetch(`${ML_SERVICE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(toSnake(options.body)) : undefined,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error')
      throw new Error(`ML service error ${res.status}: ${text}`)
    }

    const data = await res.json()
    return toCamel(data)
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function checkMlHealth(): Promise<boolean> {
  try {
    await mlFetch('/health', { timeout: HEALTH_TIMEOUT })
    return true
  } catch {
    return false
  }
}

export async function scoreCustomers(
  projectId: string,
  goalId: string,
  customerIds: string[],
  observationDays?: number,
): Promise<MlScoreResponse> {
  const result = await mlFetch('/propensity/score', {
    method: 'POST',
    body: { projectId, goalId, customerIds, observationDays: observationDays ?? 90 },
  })
  return result as MlScoreResponse
}

export async function explainCustomer(
  projectId: string,
  goalId: string,
  customerId: string,
  observationDays?: number,
): Promise<MlExplainResponse> {
  const result = await mlFetch('/propensity/explain', {
    method: 'POST',
    body: { projectId, goalId, customerId, observationDays: observationDays ?? 90 },
  })
  return result as MlExplainResponse
}

export async function listModels(): Promise<{ models: { goalId: string; modelVersion: string; auc: number; trainedAt: string }[] }> {
  const result = await mlFetch('/propensity/models')
  return result as { models: { goalId: string; modelVersion: string; auc: number; trainedAt: string }[] }
}

type MlTrainResult = {
  status: string
  auc: number
  baselineAuc: number
  modelLiftOverBaseline: number
  modelVersion: string
  warning: string | null
  reason: string | null
}

export async function trainModel(
  projectId: string,
  goalId: string,
  targetEvent: string,
  observationDays: number = 90,
  predictionDays: number = 14,
  domain: string = 'ecommerce',
): Promise<MlTrainResult> {
  const result = await mlFetch('/propensity/train', {
    method: 'POST',
    body: { projectId, goalId, targetEvent, observationDays, predictionDays, domain },
    timeout: 300_000, // 5 minutes — training takes time
  })
  return result as MlTrainResult
}
