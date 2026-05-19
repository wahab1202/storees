import { decrypt } from '../encryption.js'

// ── Types ────────────────────────────────────────────────────────────────────

export type EntityType = 'customers' | 'products' | 'orders' | 'dealers'

export type AuthSpec = {
  type: 'bearer' | 'api_key' | 'basic'
  header?: string
  valuePrefix?: string
}

export type EndpointSpec = {
  path: string
  method?: 'GET' | 'POST'
  queryParams?: Record<string, string>
  responseDataPath?: string   // dot-path to the array in the response body
  responseCountPath?: string  // dot-path to a numeric total (for progress)
  responseNextCursorPath?: string  // dot-path to next-page cursor (cursor pagination only)
}

export type PaginationSpec = {
  type: 'offset' | 'page' | 'cursor'
  limitParam: string
  offsetParam?: string
  pageParam?: string
  cursorParam?: string
  pageSize: number
}

export type IncrementalSpec = {
  param: string
  format: 'iso8601' | 'epoch_ms' | 'epoch_s'
}

export type FieldMapValue =
  | string
  | { concat: string[]; separator?: string }
  | { from: string; divideBy?: number; multiplyBy?: number }
  | { fromArray: string; field: string }
  | { [key: string]: FieldMapValue | unknown }

export type LineItemMap = {
  sourcePath: string
  fields: Record<string, FieldMapValue>
}

export type ConnectorTemplate = {
  id: string
  label: string
  description: string
  auth: AuthSpec
  endpoints: Partial<Record<EntityType, EndpointSpec>>
  pagination: PaginationSpec
  incremental?: Partial<Record<EntityType, IncrementalSpec>>
  fieldMap: {
    customers: Record<string, FieldMapValue>
    products: Record<string, FieldMapValue>
    orders: Record<string, FieldMapValue | LineItemMap>
    dealers?: Record<string, FieldMapValue>
  }
  // Throughput controls — keep the source-side API happy. Defaults are gentle
  // but every template can override per its API's tolerance.
  interBatchDelayMs?: number    // Pause between successive page fetches (default 0)
  maxFetchRetries?: number      // Retry attempts on transient HTTP errors (default 3)
}

export type RuntimeConfig = {
  baseUrl: string
  encryptedAuthValue: string
  template: ConnectorTemplate
}

// ── Field mapping resolver ───────────────────────────────────────────────────
// Supports dot-paths with array indices ("variants[0].prices[0].amount"),
// concat ({ concat: [...], separator }), numeric transforms
// ({ from, divideBy }), array projection ({ fromArray, field }), and nested
// objects (for custom_attributes).

export function getByPath(obj: unknown, path: string): unknown {
  if (!path || obj == null) return undefined
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cur: any = obj
  for (const part of parts) {
    if (cur == null) return undefined
    cur = cur[part]
  }
  return cur
}

function isLineItemMap(v: unknown): v is LineItemMap {
  return !!v && typeof v === 'object' && 'sourcePath' in (v as object) && 'fields' in (v as object)
}

export function applyFieldMap(record: unknown, spec: FieldMapValue): unknown {
  if (typeof spec === 'string') return getByPath(record, spec)
  if (spec == null || typeof spec !== 'object') return undefined

  const s = spec as Record<string, unknown>

  if (Array.isArray(s.concat) && s.concat.every((x) => typeof x === 'string')) {
    const parts = (s.concat as string[])
      .map((p) => getByPath(record, p))
      .filter((v) => v != null && v !== '')
    return parts.length ? parts.join((s.separator as string | undefined) ?? ' ') : null
  }

  if (typeof s.from === 'string') {
    const raw = getByPath(record, s.from)
    if (typeof raw !== 'number') return raw ?? null
    if (typeof s.divideBy === 'number' && s.divideBy !== 0) return raw / s.divideBy
    if (typeof s.multiplyBy === 'number') return raw * s.multiplyBy
    return raw
  }

  if (typeof s.fromArray === 'string' && typeof s.field === 'string') {
    const fromArray = s.fromArray as string
    const field = s.field as string
    const arr = getByPath(record, fromArray)
    if (!Array.isArray(arr)) return []
    return arr.map((item) => getByPath(item, field)).filter((v) => v != null)
  }

  // Generic object — recurse per key (used for custom_attributes)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) {
    out[k] = applyFieldMap(record, v as FieldMapValue)
  }
  return out
}

function mapLineItems(record: unknown, spec: LineItemMap): unknown[] {
  const items = getByPath(record, spec.sourcePath)
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(spec.fields)) {
      out[k] = applyFieldMap(item, v)
    }
    return out
  })
}

export function mapRecord(
  record: unknown,
  fieldMap: Record<string, FieldMapValue | LineItemMap>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [canonical, spec] of Object.entries(fieldMap)) {
    out[canonical] = isLineItemMap(spec) ? mapLineItems(record, spec) : applyFieldMap(record, spec)
  }
  return out
}

// ── HTTP fetcher ─────────────────────────────────────────────────────────────

export type FetchPageOptions = {
  entity: EntityType
  offset?: number
  page?: number
  cursor?: string | null
  updatedSince?: string | null
}

export type FetchPageResult = {
  records: unknown[]
  hasMore: boolean
  nextCursor: string | null
  totalCount: number | null
}

function buildAuthHeader(auth: AuthSpec, decryptedValue: string): Record<string, string> {
  const headerName = auth.header ?? 'Authorization'
  const prefix = auth.valuePrefix ?? ''
  if (auth.type === 'basic') {
    return { [headerName]: `Basic ${Buffer.from(decryptedValue).toString('base64')}` }
  }
  return { [headerName]: `${prefix}${decryptedValue}` }
}

function formatIncremental(value: string, format: IncrementalSpec['format']): string {
  if (format === 'iso8601') return value
  const epochMs = new Date(value).getTime()
  if (format === 'epoch_ms') return String(epochMs)
  if (format === 'epoch_s') return String(Math.floor(epochMs / 1000))
  return value
}

function joinUrl(base: string, path: string): URL {
  const trimmedBase = base.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  return new URL(`${trimmedBase}/${trimmedPath}`)
}

export async function fetchPage(
  cfg: RuntimeConfig,
  opts: FetchPageOptions,
): Promise<FetchPageResult> {
  const { entity, offset = 0, page = 1, cursor = null, updatedSince = null } = opts
  const endpoint = cfg.template.endpoints[entity]
  const pagination = cfg.template.pagination
  const incremental = cfg.template.incremental?.[entity]

  if (!endpoint) {
    throw new Error(`Template does not declare a "${entity}" endpoint — nothing to fetch.`)
  }
  if (!endpoint.path) {
    throw new Error(`Endpoint path for "${entity}" is empty — configure the connector before syncing.`)
  }

  const url = joinUrl(cfg.baseUrl, endpoint.path)

  if (endpoint.queryParams) {
    for (const [k, v] of Object.entries(endpoint.queryParams)) url.searchParams.set(k, v)
  }

  url.searchParams.set(pagination.limitParam, String(pagination.pageSize))
  if (pagination.type === 'offset' && pagination.offsetParam) {
    url.searchParams.set(pagination.offsetParam, String(offset))
  } else if (pagination.type === 'page' && pagination.pageParam) {
    url.searchParams.set(pagination.pageParam, String(page))
  } else if (pagination.type === 'cursor' && pagination.cursorParam && cursor) {
    url.searchParams.set(pagination.cursorParam, cursor)
  }

  if (incremental && updatedSince) {
    url.searchParams.set(incremental.param, formatIncremental(updatedSince, incremental.format))
  }

  const authValue = decrypt(cfg.encryptedAuthValue)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...buildAuthHeader(cfg.template.auth, authValue),
  }

  const response = await fetch(url.toString(), {
    method: endpoint.method ?? 'GET',
    headers,
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} from ${endpoint.path}: ${body.slice(0, 300)}`)
  }

  const json = await response.json()
  const records = endpoint.responseDataPath ? getByPath(json, endpoint.responseDataPath) : json

  if (!Array.isArray(records)) {
    throw new Error(
      `Expected array at "${endpoint.responseDataPath ?? '<root>'}" of ${endpoint.path}, got ${typeof records}`,
    )
  }

  const totalCount = endpoint.responseCountPath
    ? Number(getByPath(json, endpoint.responseCountPath)) || null
    : null

  let hasMore = records.length === pagination.pageSize
  let nextCursor: string | null = null
  if (pagination.type === 'cursor') {
    nextCursor = endpoint.responseNextCursorPath
      ? (getByPath(json, endpoint.responseNextCursorPath) as string | null)
      : null
    hasMore = !!nextCursor
  }

  return { records, hasMore, nextCursor, totalCount }
}

// Retry wrapper for transient errors. A flaky source-side API or a brief
// network blip would otherwise abort the entire entity sync. Retries with
// exponential backoff on:
//   - 5xx server errors
//   - 429 rate-limit responses
//   - DNS / connection-refused / abort
// Permanent errors (400, 401, 403, 404) fail fast — retrying won't help.
export async function fetchPageWithRetry(
  cfg: RuntimeConfig,
  opts: FetchPageOptions,
): Promise<FetchPageResult> {
  const maxRetries = cfg.template.maxFetchRetries ?? 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchPage(cfg, opts)
    } catch (err) {
      lastError = err as Error
      const msg = lastError.message
      // Permanent — don't retry
      if (/HTTP 4(00|01|03|04)/.test(msg)) throw lastError
      if (attempt === maxRetries) throw lastError
      // Exponential backoff: 500ms, 1s, 2s, 4s, 8s (capped)
      const delay = Math.min(500 * 2 ** attempt, 8000)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError ?? new Error('fetchPageWithRetry: exhausted retries')
}

// ── Connection test ──────────────────────────────────────────────────────────
// Fetch one record from each endpoint and return the mapped + raw form so the
// onboarding UI can show "this is what we'd import" before the user commits.

export async function testConnection(cfg: RuntimeConfig): Promise<{
  ok: boolean
  results: Record<EntityType, { ok: boolean; sample?: unknown; mapped?: unknown; error?: string }>
}> {
  const results: Record<EntityType, { ok: boolean; sample?: unknown; mapped?: unknown; error?: string }> = {
    customers: { ok: false },
    products: { ok: false },
    orders: { ok: false },
    dealers: { ok: false },
  }

  // A template may legitimately omit an entity (e.g. a connector that doesn't
  // expose dealers). Skip those instead of failing the test.
  const declared = Object.keys(cfg.template.endpoints) as EntityType[]
  for (const entity of declared) {
    try {
      const page = await fetchPage({ ...cfg, template: { ...cfg.template, pagination: { ...cfg.template.pagination, pageSize: 1 } } }, { entity })
      const first = page.records[0]
      const fm = cfg.template.fieldMap[entity]
      results[entity] = {
        ok: true,
        sample: first ?? null,
        mapped: first && fm ? mapRecord(first, fm) : null,
      }
    } catch (err) {
      results[entity] = { ok: false, error: (err as Error).message }
    }
  }

  // Drop entities the template never declared — UI shouldn't show a blank card.
  for (const entity of Object.keys(results) as EntityType[]) {
    if (!declared.includes(entity)) delete results[entity]
  }

  return { ok: Object.values(results).every((r) => r.ok), results }
}
