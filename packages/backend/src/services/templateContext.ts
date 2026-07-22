import type {
  TemplateVariable,
  TemplateVariableSource,
  TemplateVariableFormat,
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
}

export function resolveTemplateVariables({
  variables,
  customer,
  project,
  product,
  eventProperties,
  systemVars,
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

  for (const variable of variables ?? []) {
    const raw = readSource(variable.source, customer, project, product, eventProperties)
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
  }
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
      const n = typeof raw === 'string' ? Number(raw) : Number(raw)
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
])
