'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, GripVertical, Search, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProducts, useCollections, useProductCategories } from '@/hooks/useProducts'
import { useDomainSchema } from '@/hooks/useDomainSchema'
import type { FilterConfig, FilterRule, FilterOperator, DomainFieldDef } from '@storees/shared'

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
  select: [
    { value: 'is', label: 'equals' },
    { value: 'is_not', label: 'does not equal' },
  ],
  product: [
    { value: 'has_purchased', label: 'has purchased' },
    { value: 'has_not_purchased', label: 'has not purchased' },
    { value: 'has_viewed', label: 'has viewed' },
    { value: 'has_not_viewed', label: 'has not viewed' },
    { value: 'has_wishlisted', label: 'has wishlisted' },
    { value: 'has_not_wishlisted', label: 'has not wishlisted' },
  ],
  collection: [
    { value: 'has_purchased', label: 'has purchased from' },
    { value: 'has_not_purchased', label: 'has not purchased from' },
  ],
  product_category: [
    { value: 'has_purchased', label: 'has purchased from' },
    { value: 'has_not_purchased', label: 'has not purchased from' },
    { value: 'has_viewed', label: 'has viewed in' },
    { value: 'has_not_viewed', label: 'has not viewed in' },
  ],
}

function needsValue(operator: FilterOperator): boolean {
  return !['is_true', 'is_false'].includes(operator)
}

const selectClass = 'h-9 px-3 pr-8 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent appearance-none cursor-pointer transition-colors duration-150 bg-[length:14px] bg-[right_8px_center] bg-no-repeat bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")]'
const inputClass = 'h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/60 transition-colors duration-150'

// ============ Product Search Dropdown ============

function ProductSearchDropdown({ value, onChange }: { value: string; onChange: (val: string) => void }) {
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
        className={cn(inputClass, 'w-full sm:w-52 flex items-center justify-between gap-1 text-left truncate', !value && 'text-text-muted')}
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
                onClick={() => { onChange(p.title); setOpen(false); setSearch('') }}
                className={cn('w-full px-3 py-2 text-sm text-left hover:bg-surface transition-colors flex items-center gap-2', p.title === value && 'bg-accent/5 text-accent font-medium')}
              >
                {p.imageUrl && <img src={p.imageUrl} alt="" className="h-6 w-6 rounded object-cover flex-shrink-0" />}
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

function CollectionDropdown({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const { data, isLoading } = useCollections()
  const collections = data?.data ?? []

  if (isLoading) {
    return (
      <div className={cn(inputClass, 'w-full sm:w-52 flex items-center gap-2')}>
        <Loader2 className="h-3.5 w-3.5 text-text-muted animate-spin" />
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    )
  }

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={cn(selectClass, 'w-full sm:w-52')}>
      <option value="">Select collection...</option>
      {collections.map(c => (
        <option key={c.id} value={c.title}>{c.title}</option>
      ))}
    </select>
  )
}

// ============ Product Category Dropdown ============

function ProductCategoryDropdown({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const { data, isLoading } = useProductCategories()
  const categories = data?.data ?? []

  if (isLoading) {
    return (
      <div className={cn(inputClass, 'w-full sm:w-52 flex items-center gap-2')}>
        <Loader2 className="h-3.5 w-3.5 text-text-muted animate-spin" />
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    )
  }

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={cn(selectClass, 'w-full sm:w-52')}>
      <option value="">Select category...</option>
      {categories.map(cat => (
        <option key={cat} value={cat}>{cat}</option>
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
  const { data: schemaData, isLoading: schemaLoading } = useDomainSchema()
  const rules = filters.rules as FilterRule[]

  // Build category → fields map from schema
  const schemaFields: DomainFieldDef[] = schemaData?.data.fields ?? []
  const categories = schemaData?.data.categories ?? []

  function getFieldDef(field: string): DomainFieldDef | undefined {
    return schemaFields.find(f => f.field === field)
  }

  function getFieldType(field: string): string {
    return getFieldDef(field)?.type ?? 'string'
  }

  function getFieldLabel(field: string): string {
    return getFieldDef(field)?.label ?? field.replace(/_/g, ' ')
  }

  function getOperators(field: string) {
    const def = getFieldDef(field)
    if (def?.operators?.length) {
      return def.operators.map(op => ({
        value: op,
        label: OPERATORS_BY_TYPE[def.type]?.find(o => o.value === op)?.label ?? op,
      }))
    }
    return OPERATORS_BY_TYPE[getFieldType(field)] ?? OPERATORS_BY_TYPE.string
  }

  const firstField = schemaFields[0]?.field ?? 'email'

  const updateRule = (index: number, updates: Partial<FilterRule>) => {
    const newRules = [...rules]
    const current = newRules[index]

    if (updates.field && updates.field !== current.field) {
      const newType = getFieldType(updates.field)
      const ops = getOperators(updates.field)
      updates.operator = ops[0]?.value as FilterOperator
      updates.value = newType === 'number' ? 0 : newType === 'boolean' ? true : ''
    }

    if (updates.operator === 'between' && !Array.isArray(current.value)) {
      updates.value = [0, 100]
    }

    newRules[index] = { ...current, ...updates }
    onChange({ ...filters, rules: newRules })
  }

  const addRule = () => {
    const def = getFieldDef(firstField)
    const ops = getOperators(firstField)
    const op = (ops[0]?.value ?? 'is') as FilterOperator
    const type = def?.type ?? 'string'
    const defaultValue = type === 'number' ? 0 : type === 'boolean' ? true : type === 'select' ? (def?.options?.[0] ?? '') : ''
    onChange({
      ...filters,
      rules: [...rules, { field: firstField, operator: op, value: defaultValue }],
    })
  }

  const removeRule = (index: number) => {
    onChange({ ...filters, rules: rules.filter((_, i) => i !== index) })
  }

  const toggleLogic = () => {
    onChange({ ...filters, logic: filters.logic === 'AND' ? 'OR' : 'AND' })
  }

  if (schemaLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading field definitions...
      </div>
    )
  }

  return (
    <div className="relative">
      {rules.length > 1 && (
        <div className="absolute left-6 top-[44px] bottom-[44px] w-px bg-border" />
      )}

      <div className="space-y-0">
        {rules.map((rule, index) => {
          const fieldType = getFieldType(rule.field)
          const fieldDef = getFieldDef(rule.field)
          const operators = getOperators(rule.field)

          return (
            <div key={index} className="relative">
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

              <div className="group flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-white hover:border-border-focus/50 transition-colors">
                <GripVertical className="h-4 w-4 text-text-muted/40 flex-shrink-0 hidden sm:block" />

                {/* Field selector */}
                <select
                  value={rule.field}
                  onChange={e => updateRule(index, { field: e.target.value })}
                  className={cn(selectClass, 'min-w-0 w-full sm:w-auto sm:min-w-[180px]')}
                >
                  {categories.map(cat => (
                    <optgroup key={cat} label={cat}>
                      {schemaFields.filter(f => f.category === cat).map(f => (
                        <option key={f.field} value={f.field}>{f.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {/* Operator selector */}
                <select
                  value={rule.operator}
                  onChange={e => updateRule(index, { operator: e.target.value as FilterOperator })}
                  className={cn(selectClass, 'min-w-0 w-full sm:w-auto sm:min-w-[150px]')}
                >
                  {operators.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>

                {/* Value input */}
                {needsValue(rule.operator) && (
                  fieldType === 'product' ? (
                    <ProductSearchDropdown
                      value={rule.value as string}
                      onChange={val => updateRule(index, { value: val })}
                    />
                  ) : fieldType === 'product_category' ? (
                    <ProductCategoryDropdown
                      value={rule.value as string}
                      onChange={val => updateRule(index, { value: val })}
                    />
                  ) : fieldType === 'collection' ? (
                    <CollectionDropdown
                      value={rule.value as string}
                      onChange={val => updateRule(index, { value: val })}
                    />
                  ) : fieldType === 'select' && fieldDef?.options ? (
                    <select
                      value={rule.value as string}
                      onChange={e => updateRule(index, { value: e.target.value })}
                      className={cn(selectClass, 'min-w-[140px]')}
                    >
                      <option value="">Select...</option>
                      {fieldDef.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : rule.operator === 'between' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={Array.isArray(rule.value) ? rule.value[0] : 0}
                        onChange={e => updateRule(index, { value: [Number(e.target.value), Array.isArray(rule.value) ? rule.value[1] : 100] })}
                        className={cn(inputClass, 'w-24')}
                      />
                      <span className="text-xs font-medium text-text-muted">and</span>
                      <input
                        type="number"
                        value={Array.isArray(rule.value) ? rule.value[1] : 100}
                        onChange={e => updateRule(index, { value: [Array.isArray(rule.value) ? rule.value[0] : 0, Number(e.target.value)] })}
                        className={cn(inputClass, 'w-24')}
                      />
                    </div>
                  ) : fieldType === 'number' ? (
                    <input
                      type="number"
                      value={rule.value as number}
                      onChange={e => updateRule(index, { value: Number(e.target.value) })}
                      className={cn(inputClass, 'w-28')}
                    />
                  ) : fieldType === 'date' ? (
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

                <div className="flex-1" />

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
          )
        })}
      </div>

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

/** Generates a human-readable summary of a filter config (field labels may be IDs if schema not loaded) */
export function filterSummary(filters: FilterConfig): string {
  const rules = filters.rules as FilterRule[]
  if (rules.length === 0) return 'No conditions'

  const parts = rules.slice(0, 3).map(rule => {
    const field = rule.field.replace(/_/g, ' ')
    const opLabel = rule.operator.replace(/_/g, ' ')
    if (['is_true', 'is_false'].includes(rule.operator)) return `${field} ${opLabel}`
    if (['has_purchased', 'has_not_purchased'].includes(rule.operator)) return `${opLabel} "${rule.value}"`
    return `${field} ${opLabel} ${rule.value}`
  })

  const joined = parts.join(` ${filters.logic} `)
  return rules.length > 3 ? `${joined} (+${rules.length - 3} more)` : joined
}
