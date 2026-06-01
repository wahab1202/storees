'use client'

import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { EVENTS_BY_DOMAIN, getEventProperties } from '@storees/shared'
import type { Node } from '@xyflow/react'
import type { FilterConfig, FilterRule, FilterOperator, EventPropertyDef } from '@storees/shared'
import { useTemplates } from '@/hooks/useTemplates'
import { useWhatsappTemplates } from '@/hooks/useWhatsappTemplates'
import { useSegments } from '@/hooks/useSegments'
import { useProducts, useCollections } from '@/hooks/useProducts'
import { NumberInput } from '@/components/ui/NumberInput'

type NodeConfigPanelProps = {
  node: Node | null
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onClose: () => void
  domainType?: string
}

export function NodeConfigPanel({ node, onUpdate, onClose, domainType = 'ecommerce' }: NodeConfigPanelProps) {
  const domainKey = domainType as keyof typeof EVENTS_BY_DOMAIN
  const eventOptions = EVENTS_BY_DOMAIN[domainKey] ?? EVENTS_BY_DOMAIN.ecommerce

  if (!node) return null

  return (
    <div className="w-72 border-l border-border bg-surface overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary capitalize">
          {node.type} Config
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-elevated transition-colors"
        >
          <X className="h-4 w-4 text-text-muted" />
        </button>
      </div>
      <div className="p-4">
        {node.type === 'trigger' && (
          <TriggerForm node={node} onUpdate={onUpdate} eventOptions={eventOptions} />
        )}
        {node.type === 'delay' && (
          <DelayForm node={node} onUpdate={onUpdate} />
        )}
        {node.type === 'condition' && (
          <ConditionForm node={node} onUpdate={onUpdate} eventOptions={eventOptions} />
        )}
        {node.type === 'action' && (
          <ActionForm node={node} onUpdate={onUpdate} />
        )}
        {node.type === 'ab_split' && (
          <AbSplitForm node={node} onUpdate={onUpdate} />
        )}
        {node.type === 'goto' && (
          <GotoForm node={node} onUpdate={onUpdate} />
        )}
        {node.type === 'end' && (
          <EndForm node={node} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  )
}

function TriggerForm({ node, onUpdate, eventOptions }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void; eventOptions: string[] }) {
  const d = node.data as Record<string, unknown>
  const [event, setEvent] = useState((d.event as string) ?? '')
  const [filters, setFilters] = useState<FilterConfig | undefined>(d.filters as FilterConfig | undefined)

  useEffect(() => {
    const nd = node.data as Record<string, unknown>
    setEvent((nd.event as string) ?? '')
    setFilters(nd.filters as FilterConfig | undefined)
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <FieldLabel label="Trigger Event">
        <select
          value={event}
          onChange={e => {
            const ev = e.target.value
            setEvent(ev)
            // Switching events invalidates any param filter the old event had.
            setFilters(undefined)
            onUpdate(node.id, { ...d, event: ev, filters: undefined })
          }}
          className={SELECT_CLASS}
        >
          <option value="">Select event...</option>
          {eventOptions.map((ev: string) => (
            <option key={ev} value={ev}>{formatEvent(ev)}</option>
          ))}
        </select>
      </FieldLabel>
      {event && (
        <EventParamsEditor
          event={event}
          filters={filters}
          onChange={next => {
            setFilters(next)
            onUpdate(node.id, { ...d, event, filters: next })
          }}
        />
      )}
    </div>
  )
}

function DelayForm({ node, onUpdate }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void }) {
  const d = node.data as Record<string, unknown>
  const [value, setValue] = useState((d.value as number) ?? 30)
  const [unit, setUnit] = useState((d.unit as string) ?? 'minutes')

  useEffect(() => {
    const nd = node.data as Record<string, unknown>
    setValue((nd.value as number) ?? 30)
    setUnit((nd.unit as string) ?? 'minutes')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <FieldLabel label="Duration">
        <div className="flex gap-2">
          <NumberInput
            min={1}
            value={value}
            onChange={n => {
              const v = n ?? 1
              setValue(v)
              onUpdate(node.id, { ...d, value: v, unit })
            }}
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-border-focus w-20"
          />
          <select
            value={unit}
            onChange={e => {
              setUnit(e.target.value)
              onUpdate(node.id, { ...d, value, unit: e.target.value })
            }}
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-border-focus flex-1"
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      </FieldLabel>
      <p className="text-xs text-text-muted">
        In demo mode, all delays are overridden by DEMO_DELAY_MINUTES.
      </p>
    </div>
  )
}

function ConditionForm({ node, onUpdate, eventOptions }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void; eventOptions: string[] }) {
  const d = node.data as Record<string, unknown>
  const [check, setCheck] = useState((d.check as string) ?? 'event_occurred')
  const [event, setEvent] = useState((d.event as string) ?? '')
  const [field, setField] = useState((d.field as string) ?? '')
  const [filters, setFilters] = useState<FilterConfig | undefined>(d.filters as FilterConfig | undefined)

  useEffect(() => {
    const nd = node.data as Record<string, unknown>
    setCheck((nd.check as string) ?? 'event_occurred')
    setEvent((nd.event as string) ?? '')
    setField((nd.field as string) ?? '')
    setFilters(nd.filters as FilterConfig | undefined)
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <FieldLabel label="Check Type">
        <select
          value={check}
          onChange={e => {
            setCheck(e.target.value)
            // Switching check type invalidates the event-side filter.
            setFilters(undefined)
            onUpdate(node.id, { ...d, check: e.target.value, filters: undefined })
          }}
          className={SELECT_CLASS}
        >
          <option value="event_occurred">Event Occurred</option>
          <option value="attribute_check">Attribute Check</option>
        </select>
      </FieldLabel>

      {check === 'event_occurred' ? (
        <>
          <FieldLabel label="Event Name">
            <select
              value={event}
              onChange={e => {
                const ev = e.target.value
                setEvent(ev)
                setFilters(undefined)
                onUpdate(node.id, { ...d, check, event: ev, filters: undefined })
              }}
              className={SELECT_CLASS}
            >
              <option value="">Select event...</option>
              {eventOptions.map((ev: string) => (
                <option key={ev} value={ev}>{formatEvent(ev)}</option>
              ))}
            </select>
          </FieldLabel>
          {event && (
            <EventParamsEditor
              event={event}
              filters={filters}
              onChange={next => {
                setFilters(next)
                onUpdate(node.id, { ...d, check, event, filters: next })
              }}
            />
          )}
        </>
      ) : (
        <FieldLabel label="Customer Field">
          <input
            type="text"
            value={field}
            placeholder="e.g. totalOrders"
            onChange={e => {
              setField(e.target.value)
              onUpdate(node.id, { ...d, check, field: e.target.value })
            }}
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </FieldLabel>
      )}

      <p className="text-xs text-text-muted">
        Yes/No branches are connected via edges on the canvas.
      </p>
    </div>
  )
}

const OPERATOR_LABELS: Record<string, string> = {
  is: 'is',
  is_not: 'is not',
  greater_than: '>',
  less_than: '<',
  contains: 'contains',
  is_true: 'is true',
  is_false: 'is false',
}

// Which operators make sense for a given field. Picker fields (segment /
// product / collection) are id lookups — only equality reads sensibly;
// numbers add comparators; booleans collapse to true/false (value implicit).
function operatorsForField(def: EventPropertyDef): FilterOperator[] {
  if (def.picker) return ['is', 'is_not']
  if (def.type === 'boolean') return ['is_true', 'is_false']
  if (def.type === 'number') return ['is', 'is_not', 'greater_than', 'less_than']
  return ['is', 'is_not', 'contains']
}

const COMPACT_SELECT =
  "w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent cursor-pointer"

/**
 * Renders one row per known property of the selected event (from
 * EVENT_PROPERTIES): operator dropdown + value input/picker. Produces a
 * FilterConfig with one rule per non-empty field (boolean operators carry
 * the value implicitly so the rule persists even with no UI value).
 * Used by both Trigger and Condition forms.
 */
function EventParamsEditor({
  event,
  filters,
  onChange,
}: {
  event: string
  filters: FilterConfig | undefined
  onChange: (next: FilterConfig | undefined) => void
}) {
  const defs = getEventProperties(event)
  const segments = useSegments()
  const products = useProducts()
  const collections = useCollections()
  const segmentList = segments.data?.data ?? []
  const productList = products.data?.data ?? []
  const collectionList = collections.data?.data ?? []

  // Read current rules into a {fieldName: {operator, value}} map for inputs.
  const valueMap = useMemo(() => {
    const m: Record<string, { operator: FilterOperator; value: string }> = {}
    for (const rule of filters?.rules ?? []) {
      if ('type' in rule && rule.type === 'group') continue
      const r = rule as FilterRule
      m[r.field] = { operator: r.operator, value: r.value == null ? '' : String(r.value) }
    }
    return m
  }, [filters])

  function commit(next: Record<string, { operator: FilterOperator; value: string }>) {
    const rules: FilterRule[] = []
    for (const [field, entry] of Object.entries(next)) {
      const def = defs.find(p => p.name === field)
      // Boolean operators carry their value implicitly.
      if (entry.operator === 'is_true')  { rules.push({ field, operator: 'is_true',  value: true  }); continue }
      if (entry.operator === 'is_false') { rules.push({ field, operator: 'is_false', value: false }); continue }
      if (entry.value === '') continue
      let value: unknown = entry.value
      if (def?.type === 'number') value = Number(entry.value)
      rules.push({ field, operator: entry.operator, value })
    }
    onChange(rules.length ? { logic: 'AND', rules } : undefined)
  }

  function setOperator(name: string, op: FilterOperator) {
    const current = valueMap[name] ?? { operator: 'is' as FilterOperator, value: '' }
    const nextEntry = { ...current, operator: op }
    if (op === 'is_true' || op === 'is_false') nextEntry.value = ''
    commit({ ...valueMap, [name]: nextEntry })
  }

  function setValue(name: string, val: string) {
    const current = valueMap[name] ?? { operator: 'is' as FilterOperator, value: '' }
    commit({ ...valueMap, [name]: { ...current, value: val } })
  }

  if (defs.length === 0) return null

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-elevated p-2.5">
      <p className="text-[11px] font-medium text-text-secondary">
        Match params (leave blank to ignore)
      </p>
      {defs.map((p) => {
        const entry = valueMap[p.name] ?? { operator: 'is' as FilterOperator, value: '' }
        const ops = operatorsForField(p)
        const valueless = entry.operator === 'is_true' || entry.operator === 'is_false'
        return (
          <div key={p.name} className="space-y-1">
            <span className="block text-[11px] text-text-secondary">{p.label}</span>
            <div className="flex gap-1.5 items-stretch">
              <div className="w-24 shrink-0">
                <select
                  value={entry.operator}
                  onChange={e => setOperator(p.name, e.target.value as FilterOperator)}
                  className={COMPACT_SELECT}
                >
                  {ops.map(op => (
                    <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                  ))}
                </select>
              </div>
              {!valueless && (
                <div className="flex-1 min-w-0">
                  {p.picker === 'segment' ? (
                    <select
                      value={entry.value}
                      onChange={e => setValue(p.name, e.target.value)}
                      className={COMPACT_SELECT}
                    >
                      <option value="">Choose…</option>
                      {segmentList.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : p.picker === 'product' ? (
                    <select
                      value={entry.value}
                      onChange={e => setValue(p.name, e.target.value)}
                      className={COMPACT_SELECT}
                    >
                      <option value="">Choose…</option>
                      {productList.map(pr => (
                        <option key={pr.id} value={pr.shopifyProductId}>{pr.title}</option>
                      ))}
                    </select>
                  ) : p.picker === 'collection' ? (
                    <select
                      value={entry.value}
                      onChange={e => setValue(p.name, e.target.value)}
                      className={COMPACT_SELECT}
                    >
                      <option value="">Choose…</option>
                      {collectionList.map(c => (
                        <option key={c.id} value={c.shopifyCollectionId}>{c.title}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={p.type === 'number' ? 'number' : 'text'}
                      value={entry.value}
                      placeholder={p.placeholder ?? 'value'}
                      onChange={e => setValue(p.name, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const SELECT_CLASS =
  "w-full px-3 py-1.5 pr-8 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"

function ActionForm({ node, onUpdate }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void }) {
  const d = node.data as Record<string, unknown>
  const [actionType, setActionType] = useState((d.actionType as string) ?? 'send_email')
  const [templateId, setTemplateId] = useState((d.templateId as string) ?? '')

  useEffect(() => {
    const nd = node.data as Record<string, unknown>
    setActionType((nd.actionType as string) ?? 'send_email')
    setTemplateId((nd.templateId as string) ?? '')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  // WhatsApp templates live in their own provider-approved table; everything
  // else (email/sms/push) comes from the unified templates table.
  const isWhatsapp = actionType === 'send_whatsapp'
  const channel =
    actionType === 'send_email' ? 'email' :
    actionType === 'send_sms' ? 'sms' :
    actionType === 'send_push' ? 'push' :
    'whatsapp'

  const generalTemplates = useTemplates()
  const whatsappTemplates = useWhatsappTemplates()

  const templateOptions = useMemo(() => {
    if (isWhatsapp) {
      const list = whatsappTemplates.data?.data ?? []
      return list
        .filter((t) => t.status === 'approved' || t.status === 'APPROVED')
        .map((t) => ({ id: t.id, label: `${t.name}${t.language ? ` · ${t.language}` : ''}` }))
    }
    const list = generalTemplates.data?.data ?? []
    return list
      .filter((t) => t.channel === channel)
      .map((t) => ({ id: t.id, label: t.name }))
  }, [isWhatsapp, channel, generalTemplates.data, whatsappTemplates.data])

  const isLoading = isWhatsapp ? whatsappTemplates.isLoading : generalTemplates.isLoading
  const selectedExists = templateOptions.some((t) => t.id === templateId)

  return (
    <div className="space-y-3">
      <FieldLabel label="Channel">
        <select
          value={actionType}
          onChange={e => {
            setActionType(e.target.value)
            // Reset templateId when switching channels — old id won't match
            setTemplateId('')
            onUpdate(node.id, { ...d, actionType: e.target.value, templateId: '' })
          }}
          className={SELECT_CLASS}
        >
          <option value="send_email">Email</option>
          <option value="send_sms">SMS</option>
          <option value="send_push">Push Notification</option>
          <option value="send_whatsapp">WhatsApp</option>
        </select>
      </FieldLabel>
      <FieldLabel label="Template">
        {isLoading ? (
          <div className="text-xs text-text-muted px-2 py-1.5">Loading templates…</div>
        ) : templateOptions.length === 0 ? (
          <div className="text-xs text-text-muted px-2 py-1.5 border border-dashed border-border rounded-lg">
            No {channel} templates yet — create one in the Templates page first.
          </div>
        ) : (
          <select
            value={selectedExists ? templateId : ''}
            onChange={e => {
              setTemplateId(e.target.value)
              onUpdate(node.id, { ...d, actionType, templateId: e.target.value })
            }}
            className={SELECT_CLASS}
          >
            <option value="">Select a template…</option>
            {templateOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        )}
        {templateId && !selectedExists && !isLoading && (
          <p className="mt-1 text-[11px] text-amber-700">
            ⚠ Saved template ID <code className="font-mono">{templateId.slice(0, 8)}…</code> not found in the current list — it may have been deleted or belongs to a different channel.
          </p>
        )}
      </FieldLabel>
    </div>
  )
}

type AbBranch = { label: string; target: string; weight: number }

function AbSplitForm({ node, onUpdate }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void }) {
  const d = node.data as Record<string, unknown>
  const initial = (d.branches as AbBranch[] | undefined) ?? [
    { label: 'A', target: '', weight: 50 },
    { label: 'B', target: '', weight: 50 },
  ]
  const [branches, setBranches] = useState<AbBranch[]>(initial)

  useEffect(() => {
    const fresh = (node.data as Record<string, unknown>).branches as AbBranch[] | undefined
    setBranches(fresh ?? [
      { label: 'A', target: '', weight: 50 },
      { label: 'B', target: '', weight: 50 },
    ])
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  function update(next: AbBranch[]) {
    setBranches(next)
    onUpdate(node.id, { ...d, branches: next })
  }

  const total = branches.reduce((s, b) => s + (b.weight || 0), 0)
  const weightsValid = total === 100

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Random per-customer split. Same customer always lands on the same branch (deterministic hash). Weights must sum to <strong>100</strong>.
      </p>
      <div className="space-y-2">
        {branches.map((b, i) => (
          <div key={i} className="rounded-lg border border-border bg-white p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                value={b.label}
                onChange={e => update(branches.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder="Branch label"
                className="flex-1 h-7 px-2 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <NumberInput
                min={1}
                max={99}
                value={b.weight}
                onChange={n => update(branches.map((x, j) => j === i ? { ...x, weight: n ?? 0 } : x))}
                className="w-14 h-7 px-2 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <span className="text-xs text-text-muted">%</span>
              {branches.length > 2 && (
                <button
                  onClick={() => update(branches.filter((_, j) => j !== i))}
                  className="p-1 text-text-muted hover:text-red-600"
                  title="Remove branch"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <input
              value={b.target}
              onChange={e => update(branches.map((x, j) => j === i ? { ...x, target: e.target.value } : x))}
              placeholder="Target node id"
              className="w-full h-7 px-2 text-xs font-mono border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => update([...branches, { label: String.fromCharCode(65 + branches.length), target: '', weight: 0 }])}
        className="text-xs text-accent hover:text-accent-hover"
      >
        + Add branch
      </button>
      <p className={`text-[11px] ${weightsValid ? 'text-emerald-700' : 'text-amber-700'}`}>
        Weights total: {total}{weightsValid ? ' ✓' : ' (must equal 100)'}
      </p>
    </div>
  )
}

function GotoForm({ node, onUpdate }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void }) {
  const d = node.data as Record<string, unknown>
  const [target, setTarget] = useState((d.target as string) ?? '')

  useEffect(() => {
    setTarget(((node.data as Record<string, unknown>).target as string) ?? '')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Unconditional jump to another node. Useful for loops (retry up to N times), re-routing into a nurture flow, or rejoining a main path after a side branch.
      </p>
      <FieldLabel label="Target node id">
        <input
          value={target}
          onChange={e => {
            setTarget(e.target.value)
            onUpdate(node.id, { ...d, target: e.target.value })
          }}
          placeholder="e.g. action_1, condition_2"
          className="w-full h-9 px-3 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </FieldLabel>
      <p className="text-[11px] text-text-muted">
        Find a node's id by clicking it on the canvas — it appears in this panel's header.
      </p>
    </div>
  )
}

function EndForm({ node, onUpdate }: { node: Node; onUpdate: (id: string, data: Record<string, unknown>) => void }) {
  const d = node.data as Record<string, unknown>
  const [label, setLabel] = useState((d.label as string) ?? 'End')

  useEffect(() => {
    setLabel(((node.data as Record<string, unknown>).label as string) ?? 'End')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when a different node is selected

  return (
    <div className="space-y-3">
      <FieldLabel label="Label">
        <input
          type="text"
          value={label}
          onChange={e => {
            setLabel(e.target.value)
            onUpdate(node.id, { ...d, label: e.target.value })
          }}
          className="w-full px-3 py-1.5 pr-8 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
        />
      </FieldLabel>
    </div>
  )
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-text-secondary block mb-1">{label}</span>
      {children}
    </label>
  )
}

function formatEvent(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
