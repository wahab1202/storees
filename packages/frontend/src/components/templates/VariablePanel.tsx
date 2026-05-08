'use client'

import { useEffect, useMemo } from 'react'
import { Sparkles, Plus, Trash2, Eye, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVariableSources, usePreviewTemplate, type PreviewResponse } from '@/hooks/useTemplates'
import type {
  TemplateVariable,
  TemplateVariableSource,
  TemplateVariableFormat,
  VariableSourceCatalog,
} from '@storees/shared'

type Props = {
  variables: TemplateVariable[]
  onChange: (next: TemplateVariable[]) => void
  /** Body content to scan for {{key}} references. Pass subject + body. */
  contentSources: Array<string | null | undefined>
  /** Optional: live-preview render targets. */
  preview?: {
    subject?: string | null
    htmlBody?: string | null
    bodyText?: string | null
  }
}

/**
 * Inline picker that auto-discovers `{{var}}` references in the template body
 * and lets the user map each one to a customer/project/event field with an
 * optional default + format. Same shape as Meta WhatsApp's template-variable
 * editor; backed by the templateContext resolver at send-time.
 *
 * Layout (right rail of the editor):
 *   ┌────────────────────────────────────┐
 *   │ Variables (3)            ⓘ         │
 *   ├────────────────────────────────────┤
 *   │ {{customer_name}}                  │
 *   │   Source: Customer ▸ Name          │
 *   │   Default: there         Format: — │
 *   │ {{order_total}}            ⚠       │
 *   │   Source: — (pick one)             │
 *   │ + Add variable                     │
 *   ├────────────────────────────────────┤
 *   │ ▶ Test with sample customer        │
 *   └────────────────────────────────────┘
 */
export function VariablePanel({ variables, onChange, contentSources, preview }: Props) {
  const { data: catalogResp } = useVariableSources()
  const catalog: VariableSourceCatalog | null = catalogResp?.data ?? null
  const previewMutation = usePreviewTemplate()
  const previewData: PreviewResponse | null = previewMutation.data?.data ?? null

  // Auto-discover keys in body that don't yet have a mapping → seed empty rows
  const detectedKeys = useMemo(() => extractKeys(...contentSources), [contentSources])
  useEffect(() => {
    const declared = new Set(variables.map(v => v.key))
    const missing = detectedKeys.filter(k => !declared.has(k) && !SYSTEM_KEYS.has(k) && !/^\d+$/.test(k))
    if (missing.length === 0) return
    const seeded: TemplateVariable[] = missing.map(key => ({
      key,
      source: guessSourceForKey(key),
    }))
    onChange([...variables, ...seeded])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedKeys.join('|')])

  const referencedKeys = new Set(detectedKeys)

  const updateVariable = (idx: number, patch: Partial<TemplateVariable>) => {
    const next = [...variables]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }
  const removeVariable = (idx: number) => {
    onChange(variables.filter((_, i) => i !== idx))
  }
  const addVariable = () => {
    const key = nextKey('variable', variables)
    onChange([...variables, { key, source: { kind: 'customer', field: 'name' } }])
  }

  const runPreview = () => {
    if (!preview) return
    previewMutation.mutate({
      ...preview,
      variables,
    })
  }

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">
            Variables
            {variables.length > 0 && (
              <span className="ml-2 text-xs font-normal text-text-muted">({variables.length})</span>
            )}
          </h2>
        </div>
      </div>

      <div className="p-4 space-y-3 max-h-[480px] overflow-y-auto">
        {variables.length === 0 && (
          <p className="text-xs text-text-muted py-4 text-center">
            Type <code className="px-1 py-0.5 bg-surface rounded text-[11px]">{'{{your_var}}'}</code> in the body to add a variable, or click below.
          </p>
        )}

        {variables.map((v, idx) => (
          <VariableRow
            key={`${v.key}-${idx}`}
            variable={v}
            inUse={referencedKeys.has(v.key)}
            catalog={catalog}
            onChange={patch => updateVariable(idx, patch)}
            onRemove={() => removeVariable(idx)}
          />
        ))}

        <button
          type="button"
          onClick={addVariable}
          className="w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-medium text-accent border border-dashed border-accent/40 rounded-lg hover:bg-accent/5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add variable
        </button>
      </div>

      {preview && (
        <div className="border-t border-border p-4 bg-surface/40">
          <button
            type="button"
            onClick={runPreview}
            disabled={previewMutation.isPending}
            className="w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-medium border border-border rounded-lg bg-white hover:bg-surface transition-colors disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" />
            {previewMutation.isPending ? 'Rendering…' : 'Test with sample customer'}
          </button>
          {previewData && <PreviewResult result={previewData} />}
        </div>
      )}
    </div>
  )
}

function VariableRow({
  variable,
  inUse,
  catalog,
  onChange,
  onRemove,
}: {
  variable: TemplateVariable
  inUse: boolean
  catalog: VariableSourceCatalog | null
  onChange: (patch: Partial<TemplateVariable>) => void
  onRemove: () => void
}) {
  const sourceLabel = describeSource(variable.source, catalog)
  const sourceUnknown = !sourceLabel

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2',
      sourceUnknown ? 'border-amber-300 bg-amber-50/50' : 'border-border bg-white',
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <code className="text-xs font-mono px-1.5 py-0.5 bg-surface rounded truncate max-w-[180px]">
            {`{{${variable.key}}}`}
          </code>
          {!inUse && (
            <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              unused
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded hover:bg-surface text-text-muted hover:text-red-500 transition-colors"
          aria-label={`Remove ${variable.key}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <SourcePicker
        catalog={catalog}
        source={variable.source}
        onChange={src => onChange({ source: src })}
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={variable.defaultValue ?? ''}
          onChange={e => onChange({ defaultValue: e.target.value })}
          placeholder="Default"
          className="h-8 px-2 text-xs border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        <select
          value={variable.format ?? ''}
          onChange={e => onChange({ format: (e.target.value || undefined) as TemplateVariableFormat | undefined })}
          className="h-8 px-2 text-xs border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-accent/30"
        >
          <option value="">No format</option>
          <option value="money">Money (₹1,234.56)</option>
          <option value="date">Date (YYYY-MM-DD)</option>
          <option value="date:long">Date (Jan 1, 2026)</option>
          <option value="date:short">Date (Jan 1)</option>
          <option value="upper">UPPERCASE</option>
          <option value="lower">lowercase</option>
          <option value="title">Title Case</option>
        </select>
      </div>
    </div>
  )
}

function SourcePicker({
  catalog,
  source,
  onChange,
}: {
  catalog: VariableSourceCatalog | null
  source: TemplateVariableSource
  onChange: (src: TemplateVariableSource) => void
}) {
  // Encode the {kind, field/key/value} as a single combobox value so we can
  // use a native select. Format: `<kind>::<field-or-key-or-value>`.
  const value = encodeSource(source)

  const handleChange = (encoded: string) => {
    const decoded = decodeSource(encoded)
    if (decoded) onChange(decoded)
  }

  return (
    <select
      value={value}
      onChange={e => handleChange(e.target.value)}
      className="w-full h-8 px-2 text-xs border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-accent/30"
    >
      <optgroup label="Customer">
        {(catalog?.customer ?? []).map(f => (
          <option key={`customer-${f.field}`} value={`customer::${f.field}`}>
            {f.label}
          </option>
        ))}
      </optgroup>
      {catalog?.attributes && catalog.attributes.length > 0 && (
        <optgroup label="Custom Attributes">
          {catalog.attributes.map(a => (
            <option key={`attribute-${a.key}`} value={`attribute::${a.key}`}>
              {a.key}{a.sample ? ` — e.g. ${a.sample}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {catalog?.product && catalog.product.length > 0 && (
        <optgroup label="Product">
          {catalog.product.map(f => (
            <option key={`product-${f.field}`} value={`product::${f.field}`}>
              {f.label}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Project">
        {(catalog?.project ?? []).map(f => (
          <option key={`project-${f.field}`} value={`project::${f.field}`}>
            {f.label}
          </option>
        ))}
      </optgroup>
      {catalog?.events && catalog.events.length > 0 && (
        <optgroup label="Event properties">
          {catalog.events.flatMap(ev =>
            ev.properties.map(p => (
              <option key={`event-${ev.name}-${p}`} value={`event::${p}`}>
                {ev.name}.{p}
              </option>
            )),
          )}
        </optgroup>
      )}
      <optgroup label="Other">
        <option value={`literal::${source.kind === 'literal' ? source.value : ''}`}>
          Literal value (type below)
        </option>
      </optgroup>
    </select>
  )
}

function PreviewResult({ result }: { result: PreviewResponse }) {
  const errors = result.issues.filter(i => i.kind === 'error')
  const warnings = result.issues.filter(i => i.kind === 'warning')
  const sampleLabel = result.sampleSource === 'placeholder'
    ? 'Placeholder data'
    : result.sampleCustomer.name ?? result.sampleCustomer.email ?? result.sampleCustomer.id

  return (
    <div className="mt-3 space-y-2 text-xs">
      <div className="rounded-md border border-border bg-white p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Sample Customer
        </div>
        <div className="mt-1 truncate text-[11px] font-medium text-text-primary" title={sampleLabel}>
          {sampleLabel}
        </div>
        <div className="mt-0.5 text-[10px] text-text-muted">
          {result.sampleSource === 'requested' ? 'Selected manually' : result.sampleSource === 'auto' ? 'Auto-selected from customers' : 'Fallback sample'}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 space-y-1">
          {errors.map((iss, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-700">
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{iss.message}</span>
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && errors.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 space-y-1">
          {warnings.map((iss, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-800">
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{iss.message}</span>
            </div>
          ))}
        </div>
      )}

      {result.rendered.subject && (
        <div className="rounded-md border border-border bg-white p-2">
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-0.5">Subject</div>
          <div className="line-clamp-2 text-text-primary">{result.rendered.subject}</div>
        </div>
      )}

      {(result.rendered.htmlBody || result.rendered.bodyText) && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-0.5">Body</div>
          {result.rendered.htmlBody ? (
            <div className="overflow-hidden rounded-md border border-border bg-white">
              <iframe
                srcDoc={result.rendered.htmlBody}
                title="Rendered sample preview"
                className="h-72 w-full bg-white"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <pre className="max-h-56 overflow-y-auto rounded-md border border-border bg-white p-2 text-text-primary whitespace-pre-wrap font-sans text-xs">
              {result.rendered.bodyText}
            </pre>
          )}
        </div>
      )}

      {Object.keys(result.substitutions).length > 0 && (
        <details className="rounded-md border border-border bg-white p-2">
          <summary className="cursor-pointer text-[11px] font-medium text-text-secondary">
            Resolved variables
          </summary>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {Object.entries(result.substitutions).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] gap-2 text-[10px]">
                <code className="truncate rounded bg-surface px-1 py-0.5 text-text-secondary">{`{{${key}}}`}</code>
                <span className="truncate text-text-primary" title={value}>{value || '-'}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ----- helpers -----

const SYSTEM_KEYS = new Set(['customer_name', 'customer_email', 'store_name', 'campaign_name', 'unsubscribe_url'])

function extractKeys(...contents: Array<string | null | undefined>): string[] {
  const keys = new Set<string>()
  for (const c of contents) {
    if (!c) continue
    const matches = c.matchAll(/\{\{(\w+)\}\}/g)
    for (const m of matches) keys.add(m[1])
  }
  return [...keys]
}

function nextKey(base: string, existing: TemplateVariable[]): string {
  const taken = new Set(existing.map(v => v.key))
  if (!taken.has(base)) return base
  for (let i = 1; i < 100; i++) {
    if (!taken.has(`${base}_${i}`)) return `${base}_${i}`
  }
  return `${base}_${Date.now()}`
}

/**
 * Heuristic — when a {{key}} is auto-detected, pick the most likely
 * field so the row arrives with a sensible default rather than blank.
 */
function guessSourceForKey(key: string): TemplateVariableSource {
  const productField = guessProductField(key)
  if (productField) return { kind: 'product', field: productField }
  return { kind: 'customer', field: guessCustomerField(key) ?? 'name' }
}

function guessProductField(key: string): string | null {
  const k = key.toLowerCase()
  const isProductKey = /\b(product|item|sku|variant|catalog|merchandise)_/.test(k) || k.includes('product')
  if (!isProductKey) return null
  if (k.includes('price') || k.includes('amount')) return 'price'
  if (k.includes('image') || k.includes('img') || k.includes('photo') || k.includes('picture')) return 'image_url'
  if (k.includes('url') || k.includes('link')) return 'url'
  if (k.includes('type') || k.includes('category')) return 'type'
  if (k.includes('vendor') || k.includes('brand')) return 'vendor'
  if (k.includes('id') || k.includes('sku') || k.includes('variant')) return 'id'
  if (k.includes('name') || k.includes('title')) return 'name'
  return 'name'
}

function guessCustomerField(key: string): string | null {
  const k = key.toLowerCase()
  if (k.includes('name')) return 'name'
  if (k.includes('email')) return 'email'
  if (k.includes('phone') || k.includes('mobile')) return 'phone'
  if (k.includes('city')) return 'city'
  if (k.includes('region') || k.includes('state')) return 'region'
  if (k.includes('orders')) return 'total_orders'
  if (k.includes('spent') || k.includes('amount') || k.includes('total')) return 'total_spent'
  if (k.includes('first_order')) return 'first_order_date'
  if (k.includes('last_order')) return 'last_order_date'
  return null
}

function encodeSource(s: TemplateVariableSource): string {
  switch (s.kind) {
    case 'customer':  return `customer::${s.field}`
    case 'attribute': return `attribute::${s.key}`
    case 'product':   return `product::${s.field}`
    case 'project':   return `project::${s.field}`
    case 'event':     return `event::${s.key}`
    case 'literal':   return `literal::${s.value}`
  }
}

function decodeSource(encoded: string): TemplateVariableSource | null {
  const [kind, ...rest] = encoded.split('::')
  const value = rest.join('::')
  switch (kind) {
    case 'customer':  return { kind: 'customer',  field: value }
    case 'attribute': return { kind: 'attribute', key: value }
    case 'product':   return { kind: 'product',   field: value }
    case 'project':   return { kind: 'project',   field: value }
    case 'event':     return { kind: 'event',     key: value }
    case 'literal':   return { kind: 'literal',   value }
    default: return null
  }
}

function describeSource(s: TemplateVariableSource, catalog: VariableSourceCatalog | null): string | null {
  if (!s) return null
  switch (s.kind) {
    case 'customer': {
      const label = catalog?.customer.find(c => c.field === s.field)?.label
      return label ? `Customer ▸ ${label}` : null
    }
    case 'attribute': return `Attribute ▸ ${s.key}`
    case 'product': {
      const label = catalog?.product?.find(p => p.field === s.field)?.label
      return label ? `Product ▸ ${label}` : `Product ▸ ${s.field}`
    }
    case 'project':   return `Project ▸ ${s.field}`
    case 'event':     return `Event ▸ ${s.key}`
    case 'literal':   return `Literal ▸ "${s.value}"`
  }
}
