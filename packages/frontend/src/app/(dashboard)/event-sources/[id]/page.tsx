'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Loader2, Trash2, Pencil, ChevronDown, ChevronRight, Braces, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { CopyUrlButton } from '@/components/eventSources/CopyUrlButton'
import {
  useInboundWebhookDetail, useUpdateInboundWebhook, useInboundWebhookEvents,
  useInboundWebhookSchema, useEventDefinitions, useCreateEventDefinition,
  useUpdateEventDefinition, useDeleteEventDefinition,
  type EventDefinition, type PayloadSchemaField,
} from '@/hooks/useInboundWebhooks'
import type { FilterConfig, FilterRule, FilterOperator, EventPropertyMapping, CustomerAttributeMapping, EventDefinitionIdentityPaths } from '@storees/shared'

type Tab = 'data' | 'schema' | 'definitions'

const INPUT = 'w-full h-8 px-2 text-xs border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-accent/30'

export default function EventSourceDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { data, isLoading } = useInboundWebhookDetail(id)
  const updateHook = useUpdateInboundWebhook()
  const [tab, setTab] = useState<Tab>('data')

  const hook = data?.data

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>
  if (!hook) return <p className="py-16 text-center text-sm text-red-600">Webhook not found.</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/event-sources" className="p-1.5 rounded-lg hover:bg-surface text-text-muted"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-lg font-semibold text-heading truncate">{hook.name}</h1>
          <button
            onClick={() => updateHook.mutate({ id: hook.id, status: hook.status === 'active' ? 'paused' : 'active' })}
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border transition-colors flex-shrink-0',
              hook.status === 'active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200',
            )}
          >
            {hook.status === 'active' ? 'Active' : 'Paused'}
          </button>
        </div>
        <CopyUrlButton token={hook.token} />
      </div>

      <div className="flex gap-1 border-b border-border">
        {([['data', 'Data'], ['schema', 'Schema'], ['definitions', 'Event Definitions']] as Array<[Tab, string]>).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-primary',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'data' && <DataTab webhookId={id} token={hook.token} />}
      {tab === 'schema' && <SchemaTab webhookId={id} />}
      {tab === 'definitions' && <DefinitionsTab webhookId={id} />}
    </div>
  )
}

/* ─── Data (receipt log) ─── */

function DataTab({ webhookId, token }: { webhookId: string; token: string }) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useInboundWebhookEvents(webhookId, page)
  const rows = data?.data ?? []
  const pagination = data?.pagination

  if (isLoading) return <Skeleton className="h-64 w-full" />

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white py-16 text-center">
        <Braces className="mx-auto h-8 w-8 text-text-muted/50" />
        <p className="mt-3 text-sm font-medium text-text-primary">Start sending data</p>
        <p className="mt-1 text-xs text-text-muted">We haven&apos;t received anything yet. Copy the URL and POST JSON to it — rows appear here live.</p>
        <div className="mt-4 flex justify-center"><CopyUrlButton token={token} /></div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2.5 w-8" />
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Matched</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Received at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => <LogRow key={r.id} row={r} />)}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-text-secondary">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded border border-border disabled:opacity-40">Prev</button>
          <span>{page} / {pagination.totalPages}</span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded border border-border disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}

function LogRow({ row }: { row: { id: string; payload: Record<string, unknown>; headers: Record<string, unknown>; matchedDefinitions: Array<{ eventName: string }>; status: string; error: string | null; receivedAt: string } }) {
  const [open, setOpen] = useState(false)
  const preview = JSON.stringify(row.payload)
  const statusStyle = row.status === 'processed' ? 'bg-emerald-50 text-emerald-700'
    : row.status === 'no_match' ? 'bg-amber-50 text-amber-700'
    : row.status === 'error' ? 'bg-red-50 text-red-700'
    : 'bg-gray-50 text-gray-500'

  return (
    <>
      <tr onClick={() => setOpen(!open)} className="border-b border-border last:border-0 cursor-pointer hover:bg-surface/50 transition-colors">
        <td className="px-4 py-2.5 text-text-muted">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
        <td className="px-4 py-2.5"><code className="block max-w-[420px] truncate text-[11px] text-text-secondary">{preview}</code></td>
        <td className="px-4 py-2.5 text-xs text-text-secondary">
          {row.matchedDefinitions.length > 0 ? row.matchedDefinitions.map(m => m.eventName).join(', ') : '—'}
        </td>
        <td className="px-4 py-2.5">
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold', statusStyle)}>{row.status}</span>
        </td>
        <td className="px-4 py-2.5 text-xs text-text-secondary whitespace-nowrap">{new Date(row.receivedAt).toLocaleString('en-IN')}</td>
      </tr>
      {open && (
        <tr className="border-b border-border last:border-0 bg-surface/40">
          <td colSpan={5} className="px-6 py-3">
            {row.error && <p className="mb-2 text-[11px] text-red-600">{row.error}</p>}
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">Body</p>
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-white p-3 text-[11px] leading-relaxed">{JSON.stringify(row.payload, null, 2)}</pre>
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-medium text-text-secondary">Headers</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-white p-3 text-[11px]">{JSON.stringify(row.headers, null, 2)}</pre>
            </details>
          </td>
        </tr>
      )}
    </>
  )
}

/* ─── Schema (observed dot-paths) ─── */

function SchemaTab({ webhookId }: { webhookId: string }) {
  const { data, isLoading } = useInboundWebhookSchema(webhookId)
  const fields = data?.data ?? []

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (fields.length === 0) {
    return <p className="py-16 text-center text-sm text-text-muted">No schema yet — it&apos;s inferred from received payloads.</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <th className="px-4 py-2.5">Field path</th>
            <th className="px-4 py-2.5">Type</th>
            <th className="px-4 py-2.5">Sample</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(f => (
            <tr key={f.path} className="border-b border-border last:border-0">
              <td className="px-4 py-2"><code className="text-[11px] text-text-primary">{f.path}</code></td>
              <td className="px-4 py-2 text-[11px] text-text-muted">{f.type}</td>
              <td className="px-4 py-2"><span className="text-[11px] text-text-secondary">{f.sample ?? '—'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─── Event definitions ─── */

const DEF_OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'contains', label: 'contains' },
  { value: 'is_true', label: 'is true' },
  { value: 'is_false', label: 'is false' },
]

const PROFILE_TARGETS = ['phone', 'email', 'name', 'region', 'city']

function DefinitionsTab({ webhookId }: { webhookId: string }) {
  const { data, isLoading } = useEventDefinitions(webhookId)
  const updateDef = useUpdateEventDefinition(webhookId)
  const deleteDef = useDeleteEventDefinition(webhookId)
  const [editing, setEditing] = useState<EventDefinition | 'new' | null>(null)

  const defs = data?.data ?? []

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" /> New Event Definition
        </button>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : defs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white py-14 text-center">
          <p className="text-sm font-medium text-text-primary">No event definitions</p>
          <p className="mt-1 text-xs text-text-muted">
            Define which payloads become which events — filters decide the match, mappings shape the event and the customer profile.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {defs.map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-semibold text-text-primary">{d.name}</code>
                  {!d.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">disabled</span>}
                </div>
                <p className="mt-0.5 text-[11px] text-text-muted truncate">
                  {(d.filters?.rules?.length ?? 0) > 0
                    ? `${d.filters!.rules.length} filter${d.filters!.rules.length > 1 ? 's' : ''}`
                    : 'matches every payload'}
                  {' · '}{d.propertyMappings.length > 0 ? `${d.propertyMappings.length} property mapping${d.propertyMappings.length > 1 ? 's' : ''}` : 'full body as properties'}
                  {d.attributeMappings.length > 0 && ` · ${d.attributeMappings.length} profile mapping${d.attributeMappings.length > 1 ? 's' : ''}`}
                </p>
              </div>
              <button
                onClick={() => updateDef.mutate({ id: d.id, isActive: !d.isActive })}
                className="text-[11px] font-medium text-text-secondary hover:text-text-primary"
              >
                {d.isActive ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => setEditing(d)} className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent/5"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => deleteDef.mutate(d.id)} className="p-1.5 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <DefinitionEditor
          webhookId={webhookId}
          definition={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/** Select a payload path from the observed schema, or type one. */
function PathPicker({ value, onChange, fields, placeholder }: {
  value: string; onChange: (v: string) => void; fields: PayloadSchemaField[]; placeholder?: string
}) {
  const known = fields.some(f => f.path === value)
  const custom = !!value && !known
  const [customMode, setCustomMode] = useState(false)
  const showInput = customMode || custom
  return (
    <div className="flex-1 min-w-0 space-y-1">
      <select
        value={showInput ? '__custom__' : value}
        onChange={e => {
          if (e.target.value === '__custom__') { setCustomMode(true); return }
          setCustomMode(false)
          onChange(e.target.value)
        }}
        className={INPUT}
      >
        <option value="">{fields.length ? 'Select field…' : 'No fields observed yet'}</option>
        {fields.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
        <option value="__custom__">Custom path…</option>
      </select>
      {showInput && (
        <input
          value={value}
          onChange={e => onChange(e.target.value.trim())}
          placeholder={placeholder ?? 'body.some.path'}
          className={cn(INPUT, 'font-mono')}
        />
      )}
    </div>
  )
}

function DefinitionEditor({ webhookId, definition, onClose }: {
  webhookId: string
  definition: EventDefinition | null
  onClose: () => void
}) {
  const { data: schemaResp } = useInboundWebhookSchema(webhookId)
  const fields = useMemo(() => schemaResp?.data ?? [], [schemaResp])
  const createDef = useCreateEventDefinition(webhookId)
  const updateDef = useUpdateEventDefinition(webhookId)

  const [name, setName] = useState(definition?.name ?? '')
  const [rules, setRules] = useState<FilterRule[]>(
    (definition?.filters?.rules ?? []).filter((r): r is FilterRule => !('type' in r)),
  )
  const [propMaps, setPropMaps] = useState<EventPropertyMapping[]>(definition?.propertyMappings ?? [])
  const [attrMaps, setAttrMaps] = useState<CustomerAttributeMapping[]>(definition?.attributeMappings ?? [])
  const [identity, setIdentity] = useState<EventDefinitionIdentityPaths>(definition?.identityPaths ?? {})

  const nameValid = /^[a-z0-9_]+$/.test(name)
  const saving = createDef.isPending || updateDef.isPending

  function save() {
    const filters: FilterConfig | null = rules.length > 0 ? { logic: 'AND', rules } : null
    const payload = {
      name,
      filters,
      propertyMappings: propMaps.filter(m => m.path && m.property),
      attributeMappings: attrMaps.filter(m => m.path && m.attribute),
      identityPaths: Object.values(identity).some(Boolean) ? identity : null,
    }
    if (definition) updateDef.mutate({ id: definition.id, ...payload }, { onSuccess: onClose })
    else createDef.mutate(payload, { onSuccess: onClose })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={definition ? `Edit definition — ${definition.name}` : 'New Event Definition'}
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-text-muted">Fields reference the payload as <code className="bg-surface px-1 rounded">body.…</code> / <code className="bg-surface px-1 rounded">headers.…</code></p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-text-secondary rounded-lg hover:bg-surface">Cancel</button>
            <button
              disabled={!name || !nameValid || saving}
              onClick={save}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
            </button>
          </div>
        </div>
      }
    >
      <div className="p-5 space-y-6">
        {/* Name */}
        <section>
          <label className="block text-xs font-semibold text-text-secondary mb-1.5">Event name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value.trim())}
            placeholder="e.g. checkout_abandoned"
            className={cn(INPUT, 'h-9 font-mono', name && !nameValid && 'border-red-300')}
          />
          <p className="mt-1 text-[11px] text-text-muted">
            Becomes the <code className="bg-surface px-1 rounded">event_name</code> — usable in flow triggers, segments, and variable pickers.
            {name && !nameValid && <span className="text-red-600"> Lowercase letters, numbers and underscores only.</span>}
          </p>
        </section>

        {/* Filters */}
        <section className="space-y-2">
          <div>
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wide">1 · Set filters</h3>
            <p className="text-[11px] text-text-muted mt-0.5">Which payloads count as this event? All conditions must match (AND). No filters = every payload.</p>
          </div>
          {rules.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <PathPicker value={r.field} onChange={v => setRules(rules.map((x, j) => j === i ? { ...x, field: v } : x))} fields={fields} />
              <select
                value={r.operator}
                onChange={e => setRules(rules.map((x, j) => j === i ? { ...x, operator: e.target.value as FilterOperator } : x))}
                className={cn(INPUT, '!w-28 flex-shrink-0')}
              >
                {DEF_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {!['is_true', 'is_false'].includes(r.operator) && (
                <input
                  value={String(r.value ?? '')}
                  onChange={e => setRules(rules.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                  placeholder="value"
                  className={cn(INPUT, '!w-36 flex-shrink-0')}
                />
              )}
              <button onClick={() => setRules(rules.filter((_, j) => j !== i))} className="p-1.5 text-text-muted hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button
            onClick={() => setRules([...rules, { field: fields[0]?.path ?? '', operator: 'is', value: '' }])}
            className="text-xs font-medium text-accent hover:underline"
          >
            + Add filter
          </button>
        </section>

        {/* Identity */}
        <section className="space-y-2">
          <div>
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wide">2 · Identify the customer</h3>
            <p className="text-[11px] text-text-muted mt-0.5">
              Map payload fields to identity. With email/phone/external id the event attaches to a (new or existing) customer profile; session id alone keeps it anonymous until stitched.
            </p>
          </div>
          {([['email', 'Email'], ['phone', 'Phone'], ['externalId', 'External ID'], ['sessionId', 'Session ID'], ['name', 'Name']] as Array<[keyof EventDefinitionIdentityPaths, string]>).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-24 flex-shrink-0 text-[11px] font-medium text-text-secondary">{label}</span>
              <PathPicker
                value={identity[key] ?? ''}
                onChange={v => setIdentity({ ...identity, [key]: v || undefined })}
                fields={fields}
              />
            </div>
          ))}
        </section>

        {/* Property mappings */}
        <section className="space-y-2">
          <div>
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wide">3 · Event properties</h3>
            <p className="text-[11px] text-text-muted mt-0.5">Payload field → property name on the emitted event. Leave EMPTY to pass the whole body as properties.</p>
          </div>
          {propMaps.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <PathPicker value={m.path} onChange={v => setPropMaps(propMaps.map((x, j) => j === i ? { ...x, path: v } : x))} fields={fields} />
              <span className="text-text-muted text-xs flex-shrink-0">→</span>
              <input
                value={m.property}
                onChange={e => setPropMaps(propMaps.map((x, j) => j === i ? { ...x, property: e.target.value.trim() } : x))}
                placeholder="property_name"
                className={cn(INPUT, '!w-44 flex-shrink-0 font-mono')}
              />
              <button onClick={() => setPropMaps(propMaps.filter((_, j) => j !== i))} className="p-1.5 text-text-muted hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button onClick={() => setPropMaps([...propMaps, { path: '', property: '' }])} className="text-xs font-medium text-accent hover:underline">+ Add property mapping</button>
        </section>

        {/* Attribute mappings */}
        <section className="space-y-2">
          <div>
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wide">4 · Update customer profile</h3>
            <p className="text-[11px] text-text-muted mt-0.5">Payload field → profile attribute, applied on every match. Pick a standard field or type a custom attribute key.</p>
          </div>
          {attrMaps.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <PathPicker value={m.path} onChange={v => setAttrMaps(attrMaps.map((x, j) => j === i ? { ...x, path: v } : x))} fields={fields} />
              <span className="text-text-muted text-xs flex-shrink-0">→</span>
              <input
                list={`attr-targets-${i}`}
                value={m.attribute}
                onChange={e => setAttrMaps(attrMaps.map((x, j) => j === i ? { ...x, attribute: e.target.value.trim() } : x))}
                placeholder="phone / custom_key"
                className={cn(INPUT, '!w-44 flex-shrink-0 font-mono')}
              />
              <datalist id={`attr-targets-${i}`}>
                {PROFILE_TARGETS.map(t => <option key={t} value={t} />)}
              </datalist>
              <button onClick={() => setAttrMaps(attrMaps.filter((_, j) => j !== i))} className="p-1.5 text-text-muted hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button onClick={() => setAttrMaps([...attrMaps, { path: '', attribute: '' }])} className="text-xs font-medium text-accent hover:underline">+ Add profile mapping</button>
        </section>
      </div>
    </Dialog>
  )
}
