'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, GripVertical, Search, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProducts, useCollections } from '@/hooks/useProducts'
import type { FilterConfig, FilterRule, FilterOperator } from '@storees/shared'

// Field categories for organized dropdown — Klaviyo-style grouped fields
const FIELD_CATEGORIES = [
  {
    label: 'Purchase Activity',
    fields: [
      { value: 'total_orders', label: 'Total Orders', type: 'number' },
      { value: 'total_spent', label: 'Total Spent', type: 'number' },
      { value: 'avg_order_value', label: 'Average Order Value', type: 'number' },
      { value: 'clv', label: 'Customer Lifetime Value', type: 'number' },
      { value: 'discount_order_percentage', label: 'Discount Order %', type: 'number' },
    ],
  },
  {
    label: 'Product Filters',
    fields: [
      { value: 'product_name', label: 'Has Purchased Product', type: 'product' },
      { value: 'collection_name', label: 'From Collection', type: 'collection' },
      { value: 'product_purchase_count', label: 'Distinct Products Bought', type: 'number' },
    ],
  },
  {
    label: 'Order Frequency',
    fields: [
      { value: 'orders_in_last_30_days', label: 'Orders in Last 30 Days', type: 'number' },
      { value: 'orders_in_last_90_days', label: 'Orders in Last 90 Days', type: 'number' },
      { value: 'orders_in_last_365_days', label: 'Orders in Last Year', type: 'number' },
      { value: 'days_since_last_order', label: 'Days Since Last Order', type: 'number' },
    ],
  },
  {
    label: 'Customer Properties',
    fields: [
      { value: 'email', label: 'Email Address', type: 'string' },
      { value: 'name', label: 'Full Name', type: 'string' },
    ],
  },
  {
    label: 'Engagement',
    fields: [
      { value: 'days_since_first_seen', label: 'Days Since First Seen', type: 'number' },
      { value: 'first_seen', label: 'First Seen Date', type: 'date' },
      { value: 'last_seen', label: 'Last Seen Date', type: 'date' },
    ],
  },
  {
    label: 'Subscriptions',
    fields: [
      { value: 'email_subscribed', label: 'Email Subscribed', type: 'boolean' },
      { value: 'sms_subscribed', label: 'SMS Subscribed', type: 'boolean' },
    ],
  },
]

type FieldDef = { value: string; label: string; type: string }

const ALL_FIELDS: FieldDef[] = FIELD_CATEGORIES.flatMap(c => c.fields)

const OPERATORS_BY_TYPE: Record<string, { value: FilterOperator; label: string }[]> = {
  number: [
    { value: 'is', label: 'equals' },
    { value: 'is_not', label: 'does not equal' },
    { value: 'greater_than', label: 'is greater than' },
    { value: 'less_than', label: 'is less than' },
    { value: 'between', label: 'is between' },
  ],
  string: [
    { value: 'is', label: 'equals' },
    { value: 'is_not', label: 'does not equal' },
    { value: 'contains', label: 'contains' },
    { value: 'begins_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
  ],
  boolean: [
    { value: 'is_true', label: 'is true' },
    { value: 'is_false', label: 'is false' },
  ],
  date: [
    { value: 'before_date', label: 'is before' },
    { value: 'after_date', label: 'is after' },
  ],
  product: [
    { value: 'has_purchased', label: 'has purchased' },
    { value: 'has_not_purchased', label: 'has not purchased' },
  ],
  collection: [
    { value: 'has_purchased', label: 'has purchased from' },
    { value: 'has_not_purchased', label: 'has not purchased from' },
  ],
}

function getFieldType(field: string): string {
  return ALL_FIELDS.find(f => f.value === field)?.type ?? 'string'
}

function getFieldLabel(field: string): string {
  return ALL_FIELDS.find(f => f.value === field)?.label ?? field
}

function getOperatorsForField(field: string) {
  return OPERATORS_BY_TYPE[getFieldType(field)] ?? OPERATORS_BY_TYPE.string
}

function needsValue(operator: FilterOperator): boolean {
  return !['is_true', 'is_false'].includes(operator)
}

const selectClass = 'h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus appearance-none cursor-pointer'
const inputClass = 'h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted'

// ============ Searchable Product Dropdown ============

function ProductSearchDropdown({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useProducts(search)
  const products = data?.data ?? []

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          inputClass,
          'w-52 flex items-center justify-between gap-1 text-left truncate',
          !value && 'text-text-muted',
        )}
      >
        <span className="truncate">{value || 'Select product...'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-72 bg-white border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              autoFocus
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-text-muted"
            />
            {isLoading && <Loader2 className="h-3.5 w-3.5 text-text-muted animate-spin" />}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {products.length === 0 && !isLoading && (
              <p className="px-3 py-3 text-xs text-text-muted text-center">
                {search ? 'No products found' : 'Type to search products'}
              </p>
            )}
            {products.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.title)
                  setOpen(false)
                  setSearch('')
                }}
                className={cn(
                  'w-full px-3 py-2 text-sm text-left hover:bg-surface transition-colors flex items-center gap-2',
                  p.title === value && 'bg-accent/5 text-accent font-medium',
                )}
              >
                {p.imageUrl && (
                  <img src={p.imageUrl} alt="" className="h-6 w-6 rounded object-cover flex-shrink-0" />
                )}
                <span className="truncate">{p.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============ Collection Dropdown ============

function CollectionDropdown({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const { data, isLoading } = useCollections()
  const collections = data?.data ?? []

  if (isLoading) {
    return (
      <div className={cn(inputClass, 'w-52 flex items-center gap-2')}>
        <Loader2 className="h-3.5 w-3.5 text-text-muted animate-spin" />
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn(selectClass, 'w-52')}
    >
      <option value="">Select collection...</option>
      {collections.map(c => (
        <option key={c.id} value={c.title}>{c.title}</option>
      ))}
    </select>
  )
}

// ============ Main Component ============

type SegmentFilterBuilderProps = {
  filters: FilterConfig
  onChange: (filters: FilterConfig) => void
}

export function SegmentFilterBuilder({ filters, onChange }: SegmentFilterBuilderProps) {
  const rules = filters.rules as FilterRule[]

  const updateRule = (index: number, updates: Partial<FilterRule>) => {
    const newRules = [...rules]
    const current = newRules[index]

    if (updates.field && updates.field !== current.field) {
      const newType = getFieldType(updates.field)
      const operators = OPERATORS_BY_TYPE[newType]
      updates.operator = operators[0].value
      updates.value = newType === 'number' ? 0 : newType === 'boolean' ? true : ''
    }

    if (updates.operator === 'between' && !Array.isArray(current.value)) {
      updates.value = [0, 100]
    }

    newRules[index] = { ...current, ...updates }
    onChange({ ...filters, rules: newRules })
  }

  const addRule = () => {
    onChange({
      ...filters,
      rules: [...rules, { field: 'total_orders', operator: 'greater_than', value: 0 }],
    })
  }

  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index)
    onChange({ ...filters, rules: newRules })
  }

  const toggleLogic = () => {
    onChange({ ...filters, logic: filters.logic === 'AND' ? 'OR' : 'AND' })
  }

  return (
    <div className="relative">
      {/* Vertical connector line */}
      {rules.length > 1 && (
        <div className="absolute left-6 top-[44px] bottom-[44px] w-px bg-border" />
      )}

      <div className="space-y-0">
        {rules.map((rule, index) => (
          <div key={index} className="relative">
            {/* AND/OR connector pill */}
            {index > 0 && (
              <div className="flex items-center py-2 pl-3">
                <button
                  onClick={toggleLogic}
                  className={cn(
                    'relative z-10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full border transition-colors',
                    filters.logic === 'AND'
                      ? 'bg-accent/10 text-accent border-accent/20 hover:bg-accent/20'
                      : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
                  )}
                >
                  {filters.logic}
                </button>
              </div>
            )}

            {/* Rule card */}
            <div className="group flex items-center gap-2 p-3 rounded-lg border border-border bg-white hover:border-border-focus/50 transition-colors">
              <GripVertical className="h-4 w-4 text-text-muted/40 flex-shrink-0" />

              {/* Field selector — grouped like Klaviyo */}
              <select
                value={rule.field}
                onChange={e => updateRule(index, { field: e.target.value })}
                className={cn(selectClass, 'min-w-[180px]')}
              >
                {FIELD_CATEGORIES.map(cat => (
                  <optgroup key={cat.label} label={cat.label}>
                    {cat.fields.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* Operator selector */}
              <select
                value={rule.operator}
                onChange={e => updateRule(index, { operator: e.target.value as FilterOperator })}
                className={cn(selectClass, 'min-w-[150px]')}
              >
                {getOperatorsForField(rule.field).map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>

              {/* Value input — product/collection get searchable dropdowns */}
              {needsValue(rule.operator) && (
                getFieldType(rule.field) === 'product' ? (
                  <ProductSearchDropdown
                    value={rule.value as string}
                    onChange={val => updateRule(index, { value: val })}
                  />
                ) : getFieldType(rule.field) === 'collection' ? (
                  <CollectionDropdown
                    value={rule.value as string}
                    onChange={val => updateRule(index, { value: val })}
                  />
                ) : rule.operator === 'between' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={Array.isArray(rule.value) ? rule.value[0] : 0}
                      onChange={e => updateRule(index, {
                        value: [Number(e.target.value), Array.isArray(rule.value) ? rule.value[1] : 100],
                      })}
                      className={cn(inputClass, 'w-24')}
                    />
                    <span className="text-xs font-medium text-text-muted">and</span>
                    <input
                      type="number"
                      value={Array.isArray(rule.value) ? rule.value[1] : 100}
                      onChange={e => updateRule(index, {
                        value: [Array.isArray(rule.value) ? rule.value[0] : 0, Number(e.target.value)],
                      })}
                      className={cn(inputClass, 'w-24')}
                    />
                  </div>
                ) : getFieldType(rule.field) === 'number' ? (
                  <input
                    type="number"
                    value={rule.value as number}
                    onChange={e => updateRule(index, { value: Number(e.target.value) })}
                    className={cn(inputClass, 'w-28')}
                  />
                ) : getFieldType(rule.field) === 'date' ? (
                  <input
                    type="date"
                    value={rule.value as string}
                    onChange={e => updateRule(index, { value: e.target.value })}
                    className={cn(inputClass, 'w-40')}
                  />
                ) : (
                  <input
                    type="text"
                    value={rule.value as string}
                    onChange={e => updateRule(index, { value: e.target.value })}
                    placeholder="Enter value..."
                    className={cn(inputClass, 'w-44')}
                  />
                )
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Remove button */}
              <button
                onClick={() => removeRule(index)}
                disabled={rules.length <= 1}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  rules.length > 1
                    ? 'text-text-muted hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'
                    : 'text-text-muted/30 cursor-not-allowed',
                )}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add condition button */}
      <div className="mt-3 pl-3">
        <button
          onClick={addRule}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent hover:text-accent-hover border border-dashed border-accent/30 hover:border-accent/60 rounded-lg transition-colors hover:bg-accent/5"
        >
          <Plus className="h-4 w-4" />
          Add condition
        </button>
      </div>
    </div>
  )
}

/** Generates a human-readable summary of a filter config */
export function filterSummary(filters: FilterConfig): string {
  const rules = filters.rules as FilterRule[]
  if (rules.length === 0) return 'No conditions'

  const parts = rules.slice(0, 3).map(rule => {
    const field = getFieldLabel(rule.field)
    const ops = getOperatorsForField(rule.field)
    const opLabel = ops.find(o => o.value === rule.operator)?.label ?? rule.operator
    if (['is_true', 'is_false'].includes(rule.operator)) {
      return `${field} ${opLabel}`
    }
    if (['has_purchased', 'has_not_purchased'].includes(rule.operator)) {
      return `${opLabel} "${rule.value}"`
    }
    return `${field} ${opLabel} ${rule.value}`
  })

  const joined = parts.join(` ${filters.logic} `)
  return rules.length > 3 ? `${joined} (+${rules.length - 3} more)` : joined
}
