import type {
  TemplateVariable,
  TemplateVariableSource,
  TemplateVariableFormat,
  BrandKit,
} from '@storees/shared'
import { readPath } from '@storees/shared'

/**
 * Send-time variable resolver — the heart of Phase 0.
 *
 * Replaces the old hardcoded `{ customer_name, customer_email, store_name }`
 * substitution maps in campaignService + flowExecutor. Same resolver runs
 * for every channel (email, SMS, WhatsApp, push) so a `{{customer_name}}`
 * placeholder always reads from the same source regardless of where the
 * template ends up rendered.
 *
 * Resolution order:
 *   1. For each declared mapping, read the value from its source
 *   2. Apply format transform (money/date/upper/etc.)
 *   3. Fall back to defaultValue if source returned null/undefined/''
 *   4. Coerce to string
 *
 * Anything in the body that LACKS a declared mapping is left untouched —
 * the legacy `interpolateTemplate` collapses it to ''. Save-time linting
 * (services/templateLint.ts) blocks templates with undeclared `{{vars}}`
 * before they reach send-time.
 */

export type CustomerLike = {
  id: string
  email?: string | null
  phone?: string | null
  name?: string | null
  region?: string | null
  city?: string | null
  totalOrders?: number | null
  totalSpent?: string | number | null   // decimal column comes back as string
  avgOrderValue?: string | number | null
  clv?: string | number | null
  firstOrderDate?: Date | string | null
  lastOrderDate?: Date | string | null
  lastSeen?: Date | string | null
  customAttributes?: Record<string, unknown> | null
  externalId?: string | null
}

export type ProjectLike = {
  id: string
  name: string
  emailFromAddress?: string | null
  emailFromName?: string | null
  brandKit?: BrandKit | null
}

// Neutral fallbacks for brand tokens when a store has no brand kit synced.
const BRAND_DEFAULT_PRIMARY = '#1f2937'
const BRAND_DEFAULT_ACCENT = '#4f46e5'

/** Allow only http(s) URLs through to brand img src (keep untrusted data safe). */
function httpUrl(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim()
  return /^https?:\/\//i.test(s) ? s.replace(/"/g, '%22') : null
}
function escapeAttr(value: string): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type ProductLike = {
  id?: string | null
  externalId?: string | null
  name?: string | null
  title?: string | null
  price?: string | number | null
  url?: string | null
  imageUrl?: string | null
  productType?: string | null
  vendor?: string | null
}

export type ResolveOpts = {
  variables: TemplateVariable[]
  customer: CustomerLike
  project: ProjectLike
  product?: ProductLike | null
  eventProperties?: Record<string, unknown>
  /**
   * Computed at send-time, e.g. one-click unsubscribe URL. Merged in as
   * `system.<key>` so templates can use `{{unsubscribe_url}}` without the
   * caller pre-stuffing it into eventProperties.
   */
  systemVars?: Record<string, string>
  /**
   * Decisioning values (recommended product, live social proof, next-best-
   * action) computed once per send. Read by `decision`-kind variable sources —
   * so a WhatsApp positional {{1}} can carry a recommendation, not just email.
   */
  decisionContext?: Record<string, string>
}

export function resolveTemplateVariables({
  variables,
  customer,
  project,
  product,
  eventProperties,
  systemVars,
  decisionContext,
}: ResolveOpts): Record<string, string> {
  const out: Record<string, string> = {}

  // System vars are always available without a declared mapping. Lets
  // {{unsubscribe_url}} / {{store_name}} work even on legacy templates that
  // pre-date the variable system.
  if (systemVars) {
    for (const [k, v] of Object.entries(systemVars)) {
      out[k] = v
    }
  }
  out.store_name = project.emailFromName ?? project.name
  out.customer_name = nonEmpty(customer.name) ?? 'there'
  out.customer_email = customer.email ?? ''

  // Brand kit tokens (Step 2) — always available, with neutral fallbacks so a
  // store that hasn't synced a brand still renders a clean, consistent email.
  const bk = project.brandKit
  const brandLogo = httpUrl(bk?.logoUrl)
  out.brand_logo = brandLogo ?? ''
  out.brand_primary_color = bk?.primaryColor || BRAND_DEFAULT_PRIMARY
  out.brand_accent = bk?.accentColor || BRAND_DEFAULT_ACCENT
  out.brand_slogan = bk?.slogan ?? ''
  // Ready-rendered header: the store's logo when we have one, else a wordmark —
  // so templates get graceful fallback without conditional logic in the body.
  out.brand_header = brandLogo
    ? `<img src="${brandLogo}" alt="${escapeAttr(out.store_name)}" height="34" style="height:34px;display:inline-block;border:0;" />`
    : `<span style="font-weight:800;font-size:19px;letter-spacing:.5px;color:${out.brand_primary_color};">${escapeAttr(out.store_name)}</span>`

  for (const variable of variables ?? []) {
    const raw = readSource(variable.source, customer, project, product, eventProperties, decisionContext)
    const formatted = applyFormat(raw, variable.format)
    const final = nonEmpty(formatted) ?? variable.defaultValue ?? ''
    out[variable.key] = final
  }

  return out
}

function readSource(
  source: TemplateVariableSource,
  customer: CustomerLike,
  project: ProjectLike,
  product: ProductLike | null | undefined,
  eventProperties: Record<string, unknown> | undefined,
  decisionContext: Record<string, string> | undefined,
): unknown {
  switch (source.kind) {
    case 'literal':
      return source.value
    case 'customer':
      return readCustomerField(customer, source.field)
    case 'attribute':
      // Dot-paths traverse nested custom-attribute objects
      return readPath(customer.customAttributes as Record<string, unknown> | undefined, source.key)
    case 'product':
      return readProductField(product, source.field, eventProperties)
    case 'project':
      return readProjectField(project, source.field)
    case 'event':
      // Dot-paths reach into nested event payloads — e.g. line_items.0.image
      return readPath(eventProperties, source.key)
    case 'decision':
      // Decisioning engine value, precomputed per send into decisionContext by
      // the caller (buildDecisionVars). Maps method+field -> the flat key.
      return decisionContext?.[decisionKey(source.method, source.field)]
  }
}

/** method+field → the flat key buildDecisionVars produces. */
export function decisionKey(method: string, field: string): string {
  if (method === 'recommended_product') return field === 'title' ? 'recommended_product' : `recommended_product_${field}`
  if (method === 'social_proof') return `social_proof_${field}`
  return method // next_best_action
}

function readProductField(
  product: ProductLike | null | undefined,
  field: string,
  eventProperties: Record<string, unknown> | undefined,
): unknown {
  switch (field) {
    case 'id': return product?.id ?? product?.externalId ?? eventProperties?.product_id
    case 'name': return product?.name ?? product?.title ?? eventProperties?.product_name ?? eventProperties?.title
    case 'price': return product?.price ?? eventProperties?.product_price ?? eventProperties?.price
    case 'url': return product?.url ?? eventProperties?.product_url ?? eventProperties?.url
    case 'image_url': return product?.imageUrl ?? eventProperties?.product_image_url ?? eventProperties?.image_url
    case 'type': return product?.productType ?? eventProperties?.product_type
    case 'vendor': return product?.vendor ?? eventProperties?.vendor
    default: return readPath(eventProperties, field)
  }
}

function readCustomerField(customer: CustomerLike, field: string): unknown {
  // Whitelisted reads — anything else returns undefined so a typo'd source
  // resolves to defaultValue rather than leaking unrelated row data.
  switch (field) {
    case 'id': return customer.id
    case 'external_id': return customer.externalId
    case 'email': return customer.email
    case 'phone': return customer.phone
    case 'name': return customer.name
    case 'region': return customer.region
    case 'city': return customer.city
    case 'total_orders': return customer.totalOrders
    case 'total_spent': return customer.totalSpent
    case 'avg_order_value': return customer.avgOrderValue
    case 'clv': return customer.clv
    case 'first_order_date': return customer.firstOrderDate
    case 'last_order_date': return customer.lastOrderDate
    case 'last_seen': return customer.lastSeen
    default: return undefined
  }
}

function readProjectField(project: ProjectLike, field: string): unknown {
  switch (field) {
    case 'name': return project.name
    case 'email_from_address': return project.emailFromAddress
    case 'email_from_name': return project.emailFromName
    default: return undefined
  }
}

function applyFormat(raw: unknown, format: TemplateVariableFormat | undefined): string {
  if (raw === null || raw === undefined) return ''
  if (!format) return String(raw)

  switch (format) {
    case 'money': {
      const n = Number(raw)
      if (!Number.isFinite(n)) return String(raw)
      // Decimal columns store rupees (not paise). Round to 2dp + Indian-locale grouping.
      return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    case 'date':
      return formatDate(raw, 'iso')
    case 'date:long':
      return formatDate(raw, 'long')
    case 'date:short':
      return formatDate(raw, 'short')
    case 'upper':
      return String(raw).toUpperCase()
    case 'lower':
      return String(raw).toLowerCase()
    case 'title':
      return String(raw).replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  }
}

function formatDate(raw: unknown, mode: 'iso' | 'long' | 'short'): string {
  const d = raw instanceof Date ? raw : new Date(String(raw))
  if (Number.isNaN(d.getTime())) return ''
  if (mode === 'iso') return d.toISOString().slice(0, 10)
  if (mode === 'long') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  // 'short'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function nonEmpty(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v)
  return s.length === 0 ? null : s
}

/**
 * Find every {{key}} reference in a template (subject + body combined). Used
 * by save-time lint and by the picker UI to auto-create rows for newly typed
 * variables.
 */
export function extractVariableKeys(...templates: Array<string | null | undefined>): string[] {
  const keys = new Set<string>()
  for (const t of templates) {
    if (!t) continue
    const matches = t.matchAll(/\{\{(\w+)\}\}/g)
    for (const m of matches) keys.add(m[1])
  }
  return [...keys]
}

/**
 * System keys that don't need a declared mapping — they're injected by the
 * resolver itself. Used by lint to know not to flag them as "undefined".
 */
export const SYSTEM_VARIABLE_KEYS = new Set([
  'customer_name',
  'customer_email',
  'store_name',
  'campaign_name',
  'unsubscribe_url',
  // Decisioning tokens — resolved via decisionContext at send time, so the
  // linter must not flag {{recommended_product}} / {{social_proof_*}} as undefined.
  'recommended_product',
  'recommended_product_image',
  'recommended_product_price',
  'recommended_product_id',
  'social_proof_viewers',
  'social_proof_buyers',
  // Dynamic product blocks (Email Engine Step 1) — injected as pre-rendered HTML
  // at send time (cart line items + an N-product recommendation grid).
  'cart_items',
  'recommended_products',
  // Brand kit tokens (Email Engine Step 2) — logo + colours from the store.
  'brand_logo',
  'brand_header',
  'brand_primary_color',
  'brand_accent',
  'brand_slogan',
])
