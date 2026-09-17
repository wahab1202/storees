/**
 * ML Proxy Service
 *
 * Proxies requests to the Python FastAPI ML service.
 * Handles: timeouts, camelCase↔snake_case conversion,
 * graceful degradation, caching.
 */

import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
const PROPENSITY_TIMEOUT = 5000  // 5s

/** How long one training may take before the request is abandoned.
 *
 *  Was 5 minutes, on the assumption that training is a request. It is not — it derives
 *  the windows, searches several look-back candidates across held-out rounds, selects
 *  features in three stages and then fits. MEASURED on GoWelmart's purchase goal with
 *  329 days of history: 50 minutes, and it succeeded. The request had been abandoned at
 *  minute five, so the model was written to disk while the database recorded
 *  `AbortError` — a trained model nothing knew about, and a screen showing the previous
 *  one with an error beside it.
 *
 *  The ceiling is still here to stop a genuinely hung service holding the single
 *  training slot for ever, so it is generous rather than absent, and configurable for a
 *  project whose history is longer than anything measured here.
 */
const TRAIN_TIMEOUT = Number(process.env.ML_TRAIN_TIMEOUT_MS ?? 2 * 60 * 60_000)

/** Reading a project's eligible population is one query over its own rows — slower
 *  than an ordinary call, nowhere near training. */
const ELIGIBLE_TIMEOUT = 5 * 60_000

/** Scoring builds the project's whole feature matrix before it selects anyone, so it
 *  is minutes of work, not the seconds an ordinary call takes. */
const SCORE_TIMEOUT = Number(process.env.ML_SCORE_TIMEOUT_MS ?? 30 * 60_000)
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
  /** What the score was ABOUT, for goals whose row is an occasion rather than a
   *  person — a cart carries its value and the moment it opened. Same shape
   *  `publish_results` writes, so the page cannot tell a live score from a
   *  published one. Absent for goals scored per customer. */
  factors?: Array<Record<string, unknown>>
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

/** A POST with NO hidden clock, for the one call that legitimately runs for an hour.
 *
 *  `fetch` is not usable here. Node's implementation applies its own `headersTimeout` of
 *  five minutes, entirely separate from any AbortController, and training sends no
 *  response headers until it has finished. Raising the abort timeout to two hours
 *  therefore changed nothing: the request still died at minute five, now with
 *  `UND_ERR_HEADERS_TIMEOUT` — observed on a Dormancy run whose model was still being
 *  fitted twenty minutes later. Two timeouts, one visible, and the invisible one won.
 *
 *  `node:http` has no such default. The only clock is the one passed in, so the ceiling
 *  is the one the caller actually chose. No new dependency for a request this shape.
 */
function longPost(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const url = new URL(`${ML_SERVICE_URL}${path}`)
  const payload = JSON.stringify(toSnake(body))
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest

  return new Promise((resolve, reject) => {
    const req = send({
      protocol: url.protocol, hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const status = res.statusCode ?? 0
        if (status < 200 || status >= 300) {
          return reject(new Error(`ML service error ${status}: ${text || 'Unknown error'}`))
        }
        try {
          resolve(toCamel(JSON.parse(text)))
        } catch {
          reject(new Error(`ML service returned unparseable JSON: ${text.slice(0, 200)}`))
        }
      })
    })

    // The ONLY deadline. Covers connect and the whole silent wait for a response.
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(
        `ML service did not respond within ${Math.round(timeoutMs / 60_000)} minutes`))
    })
    req.on('error', reject)
    req.end(payload)
  })
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
  // Given a real deadline, and sent through the same timeout-free transport as training.
  //
  // This called `mlFetch` with no timeout, so it inherited PROPENSITY_TIMEOUT: FIVE
  // SECONDS. Scoring builds the whole project's feature matrix, which takes far longer,
  // so the client abandoned every request while the service carried on building. Each
  // abandoned build left its Postgres connection attached, and after 39 of them the
  // database refused everyone — the ML service, the backend and psql alike — with
  // `sorry, too many clients already`. The 500s in the log were the symptom; this was
  // the first domino.
  const result = await longPost('/propensity/score',
    { projectId, goalId, customerIds, observationDays: observationDays ?? 90 },
    SCORE_TIMEOUT)
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

export async function promoteModelVersion(goalId: string, modelVersion: string): Promise<{ status: string }> {
  const result = await mlFetch('/propensity/promote', {
    method: 'POST',
    body: { goalId, modelVersion },
    timeout: 30_000,
  })
  return result as { status: string }
}

export type MlSegmentMetric = {
  segmentType: 'behaviour' | 'region' | 'dealer' | string
  segmentValue: string | null
  segmentLabel: string
  n: number
  nPositive: number
  auc: number
  deltaVsOverall: number
}

type MlTrainResult = {
  status: string
  // Null when the run produced no model — insufficient data, no lift, stopped early.
  // Typed as a plain `number` while the service could only send 0.0, which made "no
  // model" and "a model that scored zero" the same value to every reader downstream.
  auc: number | null
  baselineAuc: number | null
  modelLiftOverBaseline: number | null
  modelVersion: string
  warning: string | null
  reason: string | null
  segmentMetrics?: MlSegmentMetric[]

  /** The windows the pipeline actually USED — derived unless it was told to pin. */
  observationWindowDays?: number | null
  predictionWindowDays?: number | null
  windowsPinned?: boolean

  /** AUC per population. `aucActive` is the one to act on: among customers still
   *  shopping, can we rank them? `auc` above is global and includes dormant customers,
   *  who are easy to separate and flatter it. */
  aucActive?: number | null
  aucInactive?: number | null

  /** Lift against the BASE RATE — the pipeline's real baseline. */
  topDecileLift?: number | null
  topDecilePrecision?: number | null
  baseRate?: number | null
  liftQuality?: string | null
  brier?: number | null

  nTest?: number | null
  nPositiveTest?: number | null
  selection?: Record<string, number | null> | null
  flags?: string[] | null
}

/** Train a model for one goal.
 *
 *  `observationDays` / `predictionDays` PIN the windows, and are passed only for a goal
 *  whose owner chose them. Left undefined — the normal case — the pipeline derives both
 *  from this project's own measured rhythm.
 *
 *  They used to default to 90/14 here, which meant every retrain pinned something and no
 *  caller could ask for the derivation. Undefined keys are dropped from the JSON body,
 *  so the service sees the field absent and derives.
 */
/** WHO a goal applies to, by the pipeline's own definition.
 *
 *  Asked rather than reimplemented: the rule differs per goal — all customers for
 *  purchase, distinct buyers for repeat purchase and churn, anyone with any activity for
 *  dormancy, a live-cart snapshot for abandonment — and a second copy of it here would
 *  drift from the population the model is actually graded against.
 */
export async function eligibleCustomers(
  projectId: string,
  goalId: string,
  targetEvent: string,
  domain = 'ecommerce',
): Promise<{ goal: string; customerIds: string[]; n: number }> {
  const result = await longPost('/propensity/eligible',
    { projectId, goalId, targetEvent, domain }, ELIGIBLE_TIMEOUT)
  return result as { goal: string; customerIds: string[]; n: number }
}

export async function trainModel(
  projectId: string,
  goalId: string,
  targetEvent: string,
  observationDays?: number,
  predictionDays?: number,
  domain: string = 'ecommerce',
): Promise<MlTrainResult> {
  const result = await longPost('/propensity/train', {
    projectId, goalId, targetEvent, domain,
    ...(observationDays != null ? { observationDays } : {}),
    ...(predictionDays != null ? { predictionDays } : {}),
  }, TRAIN_TIMEOUT)
  return result as MlTrainResult
}
