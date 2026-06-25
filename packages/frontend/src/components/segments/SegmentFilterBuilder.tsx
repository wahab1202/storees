'use client'

import { createContext, useContext, useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, GripVertical, Search, ChevronDown, Loader2, FolderPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NumberInput } from '@/components/ui/NumberInput'
import { useProducts, useCollections, useProductCategories } from '@/hooks/useProducts'
import { useCustomers } from '@/hooks/useCustomers'
import { useDomainSchema } from '@/hooks/useDomainSchema'
import type { FilterConfig, FilterRule, FilterGroup, FilterOperator, DomainFieldDef, AggregateRule } from '@storees/shared'

// Recursive nesting depth cap. Past 3 levels the UX is unreadable; almost
// every real-world segment can be expressed in ≤2 levels anyway.
const MAX_NESTING_DEPTH = 3

type RuleOrGroup = FilterRule | FilterGroup | AggregateRule

function isGroup(item: RuleOrGroup): item is FilterGroup {
  return 'type' in item && item.type === 'group'
}

function isAggregate(item: RuleOrGroup): item is AggregateRule {
  return 'type' in item && item.type === 'aggregate'
}

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
    { value: 'between_dates', label: 'is between' },
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

/**
 * Position the dropdown panel below the trigger using viewport-fixed coords
 * computed from the trigger's bounding rect. Lets us render in a portal so
 * ancestor `overflow-hidden` (campaign create page → audience card → filter
 * row) can't clip the panel anymore. Also flips upward when there's not
 * enough room below — the previous version always opened down, which got
 * clipped against the viewport bottom.
 */
type DropdownCoords = { left: number; top: number; width: number; openUp: boolean }

function useDropdownCoords(triggerRef: React.RefObject<HTMLElement | null>, open: boolean, panelHeight = 320): DropdownCoords | null {
  const [coords, setCoords] = useState<DropdownCoords | null>(null)
  useLayoutEffect(() => {
    if (!open) { setCoords(null); return }
    const compute = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - r.bottom
      const openUp = spaceBelow < panelHeight && r.top > spaceBelow
      setCoords({
        left: r.left,
        top: openUp ? r.top : r.bottom,
        width: r.width,
        openUp,
      })
    }
    compute()
    window.addEventListener('scroll', compute, true)
    window.addEventListener('resize', compute)
    return () => {
      window.removeEventListener('scroll', compute, true)
      window.removeEventListener('resize', compute)
    }
  }, [open, triggerRef, panelHeight])
  return coords
}

function ProductSearchDropdown({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useProducts(search)
  const products = data?.data ?? []
  const coords = useDropdownCoords(triggerRef, open)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const panel = open && coords ? createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: coords.left,
        top: coords.openUp ? undefined : coords.top + 4,
        bottom: coords.openUp ? window.innerHeight - coords.top + 4 : undefined,
        width: 288,
      }}
      className="z-[100] bg-white border border-border rounded-lg shadow-lg overflow-hidden"
    >
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
      <div className="max-h-72 overflow-y-auto py-1">
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
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(inputClass, 'w-full sm:w-52 flex items-center justify-between gap-1 text-left truncate', !value && 'text-text-muted')}
      >
        <span className="truncate">{value || 'Select product...'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
      </button>
      {panel}
    </>
  )
}

// ============ Customer value typeahead ============
// For identifier fields (phone/email/name/external id) — search real customers
// and fill the EXACT stored value, so you don't mistype (and a phone with a
// country code can't silently mismatch). Still allows free typing.

const CUSTOMER_IDENTIFIER_FIELDS = new Set(['phone', 'email', 'name', 'externalId', 'external_id', 'customerId', 'customer_id'])

function customerFieldValue(c: { phone?: string | null; email?: string | null; name?: string | null; externalId?: string | null }, field: string): string {
  if (field === 'email') return c.email ?? ''
  if (field === 'name') return c.name ?? ''
  if (field === 'externalId' || field === 'external_id' || field === 'customerId' || field === 'customer_id') return c.externalId ?? ''
  return c.phone ?? '' // phone (default)
}

function CustomerSearchDropdown({ field, value, onChange }: { field: string; value: string; onChange: (val: string) => void }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useCustomers({ search: search.trim() || undefined, pageSize: 8 })
  const customers = (search.trim().length >= 2 ? data?.data : []) ?? []
  const coords = useDropdownCoords(triggerRef, open)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const panel = open && coords ? createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: coords.left,
        top: coords.openUp ? undefined : coords.top + 4,
        bottom: coords.openUp ? window.innerHeight - coords.top + 4 : undefined,
        width: 320,
      }}
      className="z-[100] bg-white border border-border rounded-lg shadow-lg overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="h-3.5 w-3.5 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name / phone / email..."
          autoFocus
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-text-muted"
        />
        {isLoading && <Loader2 className="h-3.5 w-3.5 text-text-muted animate-spin" />}
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {customers.length === 0 && (
          <p className="px-3 py-3 text-xs text-text-muted text-center">
            {search.trim().length >= 2 ? 'No customers found' : 'Type at least 2 characters'}
          </p>
        )}
        {customers.map(c => {
          const picked = customerFieldValue(c, field)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange(picked); setSearch(''); setOpen(false) }}
              className={cn('w-full px-3 py-2 text-left hover:bg-surface transition-colors', picked === value && 'bg-accent/5')}
            >
              <div className="text-sm text-text-primary truncate">{c.name || c.email || c.phone || 'Customer'}</div>
              <div className="text-[11px] text-text-muted truncate">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(inputClass, 'w-full sm:w-52 flex items-center justify-between gap-1 text-left truncate', !value && 'text-text-muted')}
      >
        <span className="truncate">{value || `Search ${field}...`}</span>
        <ChevronDown className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
      </button>
      {panel}
    </>
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

// ============ Schema context — avoids prop-drilling through nested groups ============

type SchemaCtx = {
  schemaFields: DomainFieldDef[]
  categories: string[]
  getFieldDef: (field: string) => DomainFieldDef | undefined
  getFieldType: (field: string) => string
  getOperators: (field: string) => Array<{ value: FilterOperator; label: string }>
  firstField: string
  defaultRuleFor: (field: string) => FilterRule
}

const SchemaContext = createContext<SchemaCtx | null>(null)

function useSchema(): SchemaCtx {
  const ctx = useContext(SchemaContext)
  if (!ctx) throw new Error('useSchema must be inside SchemaContext')
  return ctx
}

// ============ RuleRow — renders one FilterRule ============

function RuleRow({
  rule,
  canRemove,
  onChange,
  onRemove,
}: {
  rule: FilterRule
  canRemove: boolean
  onChange: (updates: Partial<FilterRule>) => void
  onRemove: () => void
}) {
  const { schemaFields, categories, getFieldDef, getFieldType, getOperators } = useSchema()
  const fieldType = getFieldType(rule.field)
  const fieldDef = getFieldDef(rule.field)
  const operators = getOperators(rule.field)

  const handleFieldChange = (newField: string) => {
    if (newField === rule.field) return
    const newType = getFieldType(newField)
    const ops = getOperators(newField)
    const newDef = getFieldDef(newField)
    const firstOp = ops[0]?.value as FilterOperator
    const defaultValue = firstOp === 'between' ? [0, 100]
      : firstOp === 'between_dates' ? ['', '']
      : newType === 'number' ? 0
      : newType === 'boolean' ? true
      : newType === 'select' ? (newDef?.optionPairs?.[0]?.value ?? newDef?.options?.[0] ?? '')
      : ''
    onChange({ field: newField, operator: firstOp, value: defaultValue })
  }

  const handleOperatorChange = (op: FilterOperator) => {
    const updates: Partial<FilterRule> = { operator: op }
    // Array-shaped value for range operators; scalar otherwise.
    if (op === 'between' && !Array.isArray(rule.value)) updates.value = [0, 100]
    if (op === 'between_dates' && !Array.isArray(rule.value)) updates.value = ['', '']
    if (op !== 'between' && op !== 'between_dates' && Array.isArray(rule.value)) {
      updates.value = fieldType === 'date' ? '' : 0
    }
    onChange(updates)
  }

  return (
    <div className="group flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-white hover:border-border-focus/50 transition-colors">
      <GripVertical className="h-4 w-4 text-text-muted/40 flex-shrink-0 hidden sm:block" />

      <select
        value={rule.field}
        onChange={e => handleFieldChange(e.target.value)}
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

      <select
        value={rule.operator}
        onChange={e => handleOperatorChange(e.target.value as FilterOperator)}
        className={cn(selectClass, 'min-w-0 w-full sm:w-auto sm:min-w-[150px]')}
      >
        {operators.map(op => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      {needsValue(rule.operator) && (
        fieldType === 'product' ? (
          <ProductSearchDropdown
            value={rule.value as string}
            onChange={val => onChange({ value: val })}
          />
        ) : fieldType === 'product_category' ? (
          <ProductCategoryDropdown
            value={rule.value as string}
            onChange={val => onChange({ value: val })}
          />
        ) : fieldType === 'collection' ? (
          <CollectionDropdown
            value={rule.value as string}
            onChange={val => onChange({ value: val })}
          />
        ) : fieldType === 'select' && (fieldDef?.optionPairs || fieldDef?.options) ? (
          <select
            value={rule.value as string}
            onChange={e => onChange({ value: e.target.value })}
            className={cn(selectClass, 'min-w-[140px]')}
          >
            <option value="">Select...</option>
            {fieldDef.optionPairs
              ? fieldDef.optionPairs.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))
              : fieldDef.options!.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
          </select>
        ) : rule.operator === 'between' ? (
          <div className="flex items-center gap-2">
            <NumberInput
              value={Array.isArray(rule.value) ? rule.value[0] : undefined}
              onChange={n => onChange({ value: [n ?? 0, Array.isArray(rule.value) ? rule.value[1] : 100] })}
              className={cn(inputClass, 'w-24')}
            />
            <span className="text-xs font-medium text-text-muted">and</span>
            <NumberInput
              value={Array.isArray(rule.value) ? rule.value[1] : undefined}
              onChange={n => onChange({ value: [Array.isArray(rule.value) ? rule.value[0] : 0, n ?? 0] })}
              className={cn(inputClass, 'w-24')}
            />
          </div>
        ) : rule.operator === 'between_dates' ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={Array.isArray(rule.value) ? (rule.value[0] as string) ?? '' : ''}
              onChange={e => onChange({ value: [e.target.value, Array.isArray(rule.value) ? rule.value[1] : ''] })}
              className={cn(inputClass, 'w-40')}
            />
            <span className="text-xs font-medium text-text-muted">and</span>
            <input
              type="date"
              value={Array.isArray(rule.value) ? (rule.value[1] as string) ?? '' : ''}
              onChange={e => onChange({ value: [Array.isArray(rule.value) ? rule.value[0] : '', e.target.value] })}
              className={cn(inputClass, 'w-40')}
            />
          </div>
        ) : fieldType === 'number' ? (
          <NumberInput
            value={typeof rule.value === 'number' ? rule.value : undefined}
            onChange={n => onChange({ value: n ?? 0 })}
            className={cn(inputClass, 'w-28')}
          />
        ) : fieldType === 'date' ? (
          <input
            type="date"
            value={rule.value as string}
            onChange={e => onChange({ value: e.target.value })}
            className={cn(inputClass, 'w-40')}
          />
        ) : CUSTOMER_IDENTIFIER_FIELDS.has(rule.field) ? (
          <CustomerSearchDropdown
            field={rule.field}
            value={rule.value as string}
            onChange={val => onChange({ value: val })}
          />
        ) : (
          <input
            type="text"
            value={rule.value as string}
            onChange={e => onChange({ value: e.target.value })}
            placeholder="Enter value..."
            className={cn(inputClass, 'w-44')}
          />
        )
      )}

      <div className="flex-1" />

      <button
        onClick={onRemove}
        disabled={!canRemove}
        className={cn(
          'p-1.5 rounded-md transition-colors',
          canRemove
            ? 'text-text-muted hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'
            : 'text-text-muted/30 cursor-not-allowed',
        )}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

// ============ Aggregate condition (scoped SUM/COUNT) ============
// P1 ships the engine; the editor card is P2. Until then, render any existing
// aggregate leaf as a read-only sentence so it's visible and removable.

const AGG_FN_LABEL: Record<string, string> = {
  SUM: 'Sum', COUNT: 'Count of', COUNT_DISTINCT: 'Distinct count of', AVG: 'Average', MIN: 'Min', MAX: 'Max',
}
const AGG_OP_LABEL: Record<string, string> = {
  is: 'is', gt: 'is greater than', gte: 'is at least', lt: 'is less than', lte: 'is at most', between: 'is between',
}

function aggregateSummary(rule: AggregateRule): string {
  const fn = AGG_FN_LABEL[rule.aggregate.fn] ?? rule.aggregate.fn
  const field = rule.aggregate.field ? ` ${rule.aggregate.field.replace(/_/g, ' ')}` : ' rows'
  const scope = (rule.scope?.filters ?? [])
    .map(f => `${f.field.replace(/_/g, ' ')} ${f.operator.replace(/_/g, ' ')} ${Array.isArray(f.value) ? f.value.join(', ') : f.value}`)
    .join(' and ')
  const tf = rule.timeframe?.type === 'between' ? `, between ${rule.timeframe.start} and ${rule.timeframe.end}`
    : rule.timeframe?.type === 'last_n_days' ? `, in the last ${rule.timeframe.n} days` : ''
  const val = Array.isArray(rule.value) ? `${rule.value[0]} and ${rule.value[1]}` : rule.value
  return `${fn}${field} for orders${scope ? ` where ${scope}` : ''}${tf} ${AGG_OP_LABEL[rule.operator] ?? rule.operator} ${val}`
}

// Scope-field catalogue (source-row fields per spec §3.7). Reuses the existing
// product/collection/category pickers; values match line-item JSON keys.
type ScopeKind = 'product' | 'collection' | 'product_category' | 'number'
const SCOPE_FIELDS: { field: string; label: string; kind: ScopeKind }[] = [
  { field: 'product_name', label: 'Product', kind: 'product' },
  { field: 'collection', label: 'Collection', kind: 'collection' },
  { field: 'product_category', label: 'Product category', kind: 'product_category' },
  { field: 'price', label: 'Product price', kind: 'number' },
  { field: 'quantity', label: 'Quantity', kind: 'number' },
]
const SCOPE_OPS: Record<ScopeKind, { value: FilterOperator; label: string }[]> = {
  product: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }],
  collection: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }],
  product_category: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }],
  number: [{ value: 'is', label: 'is' }, { value: 'greater_than', label: 'greater than' }, { value: 'less_than', label: 'less than' }, { value: 'between', label: 'between' }],
}
const scopeKindFor = (field: string): ScopeKind => SCOPE_FIELDS.find(f => f.field === field)?.kind ?? 'product'

const AGG_FNS: { value: AggregateRule['aggregate']['fn']; label: string }[] = [
  { value: 'SUM', label: 'Sum' }, { value: 'COUNT', label: 'Count of rows' }, { value: 'COUNT_DISTINCT', label: 'Count distinct orders' },
  { value: 'AVG', label: 'Average' }, { value: 'MIN', label: 'Min' }, { value: 'MAX', label: 'Max' },
]
const AGG_FIELDS: { value: NonNullable<AggregateRule['aggregate']['field']>; label: string }[] = [
  { value: 'line_value', label: 'line value' }, { value: 'quantity', label: 'quantity' }, { value: 'price', label: 'price' },
]
const AGG_COMPARE: { value: AggregateRule['operator']; label: string }[] = [
  { value: 'is', label: 'is' }, { value: 'gt', label: 'greater than' }, { value: 'gte', label: 'at least' },
  { value: 'lt', label: 'less than' }, { value: 'lte', label: 'at most' }, { value: 'between', label: 'between' },
]

function defaultAggregateRule(): AggregateRule {
  return {
    type: 'aggregate', source: 'order_fulfilled',
    scope: { operator: 'AND', filters: [] },
    timeframe: { type: 'all_time' },
    aggregate: { fn: 'SUM', field: 'line_value' },
    operator: 'gt', value: 0,
  }
}

function ScopeFilterRow({ filter, onChange, onRemove }: { filter: FilterRule; onChange: (f: FilterRule) => void; onRemove: () => void }) {
  const kind = scopeKindFor(filter.field)
  const setField = (field: string) => {
    const k = scopeKindFor(field)
    onChange({ field, operator: SCOPE_OPS[k][0].value, value: k === 'number' ? 0 : '' })
  }
  const setOp = (operator: FilterOperator) => {
    let value = filter.value
    if (operator === 'between' && !Array.isArray(value)) value = [0, 100]
    if (operator !== 'between' && Array.isArray(value)) value = 0
    onChange({ ...filter, operator, value })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={filter.field} onChange={e => setField(e.target.value)} className={cn(selectClass, 'min-w-[150px]')}>
        {SCOPE_FIELDS.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
      </select>
      <select value={filter.operator} onChange={e => setOp(e.target.value as FilterOperator)} className={cn(selectClass, 'min-w-[110px]')}>
        {SCOPE_OPS[kind].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {kind === 'product' ? (
        <ProductSearchDropdown value={filter.value as string} onChange={v => onChange({ ...filter, value: v })} />
      ) : kind === 'collection' ? (
        <CollectionDropdown value={filter.value as string} onChange={v => onChange({ ...filter, value: v })} />
      ) : kind === 'product_category' ? (
        <ProductCategoryDropdown value={filter.value as string} onChange={v => onChange({ ...filter, value: v })} />
      ) : filter.operator === 'between' ? (
        <div className="flex items-center gap-2">
          <NumberInput value={Array.isArray(filter.value) ? filter.value[0] : undefined} onChange={n => onChange({ ...filter, value: [n ?? 0, Array.isArray(filter.value) ? filter.value[1] : 0] })} className={cn(inputClass, 'w-24')} />
          <span className="text-xs text-text-muted">and</span>
          <NumberInput value={Array.isArray(filter.value) ? filter.value[1] : undefined} onChange={n => onChange({ ...filter, value: [Array.isArray(filter.value) ? filter.value[0] : 0, n ?? 0] })} className={cn(inputClass, 'w-24')} />
        </div>
      ) : (
        <NumberInput value={typeof filter.value === 'number' ? filter.value : undefined} onChange={n => onChange({ ...filter, value: n ?? 0 })} className={cn(inputClass, 'w-28')} />
      )}
      <button onClick={onRemove} className="p-1.5 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Remove filter">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

/** The §3.5 aggregate condition card — reads as one sentence, owns its own scope
 *  and timeframe. CONTRACT echoed in the engine: scope + timeframe filter rows,
 *  then the aggregate runs, then the comparison. */
function AggregateCard({ rule, onChange, onRemove }: { rule: AggregateRule; onChange: (r: AggregateRule) => void; onRemove: () => void }) {
  const patch = (next: Partial<AggregateRule>) => onChange({ ...rule, ...next })
  const filters = rule.scope?.filters ?? []
  const setFilters = (f: FilterRule[]) => patch({ scope: { operator: 'AND', filters: f } })
  const showField = rule.aggregate.fn !== 'COUNT' && rule.aggregate.fn !== 'COUNT_DISTINCT'
  const tf = rule.timeframe ?? { type: 'all_time' }

  return (
    <div className="rounded-xl border border-violet-300/60 bg-violet-50/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-violet-100 text-violet-700">Behaviour · aggregate</span>
        <button onClick={onRemove} className="p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50" aria-label="Remove condition"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
        <span>Customers who</span>
        <select
          value={rule.aggregate.fn}
          onChange={e => {
            const fn = e.target.value as AggregateRule['aggregate']['fn']
            const field = fn === 'COUNT' || fn === 'COUNT_DISTINCT' ? undefined : (rule.aggregate.field ?? 'line_value')
            patch({ aggregate: { fn, field } })
          }}
          className={cn(selectClass, 'min-w-[160px]')}
        >
          {AGG_FNS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {showField && (
          <>
            <span>of</span>
            <select value={rule.aggregate.field ?? 'line_value'} onChange={e => patch({ aggregate: { ...rule.aggregate, field: e.target.value as NonNullable<AggregateRule['aggregate']['field']> } })} className={cn(selectClass, 'min-w-[120px]')}>
              {AGG_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </>
        )}
        <span>for</span>
        <select value={rule.source} onChange={e => patch({ source: e.target.value as 'order_fulfilled' })} className={cn(selectClass, 'min-w-[150px]')}>
          <option value="order_fulfilled">Order fulfilled</option>
        </select>
      </div>

      <div className="pl-3 border-l-2 border-violet-200 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">where</div>
        {filters.length === 0 && (
          <p className="text-[11px] text-text-muted">No scope filter — this aggregates the whole source. Add a Product filter to scope it (otherwise this is the customer total).</p>
        )}
        {filters.map((f, i) => (
          <ScopeFilterRow
            key={i}
            filter={f}
            onChange={nf => setFilters(filters.map((x, xi) => (xi === i ? nf : x)))}
            onRemove={() => setFilters(filters.filter((_, xi) => xi !== i))}
          />
        ))}
        <button onClick={() => setFilters([...filters, { field: 'product_name', operator: 'is', value: '' }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover">
          <Plus className="h-3 w-3" /> Add filter
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
        <span>in the</span>
        <select
          value={tf.type}
          onChange={e => {
            const t = e.target.value
            patch({ timeframe: t === 'between' ? { type: 'between', start: '', end: '' } : t === 'last_n_days' ? { type: 'last_n_days', n: 30 } : { type: 'all_time' } })
          }}
          className={cn(selectClass, 'min-w-[140px]')}
        >
          <option value="all_time">all time</option>
          <option value="last_n_days">last N days</option>
          <option value="between">between dates</option>
        </select>
        {tf.type === 'last_n_days' && (
          <>
            <NumberInput value={tf.n} onChange={n => patch({ timeframe: { type: 'last_n_days', n: n ?? 0 } })} className={cn(inputClass, 'w-20')} />
            <span>days</span>
          </>
        )}
        {tf.type === 'between' && (
          <>
            <input type="date" value={tf.start} onChange={e => patch({ timeframe: { type: 'between', start: e.target.value, end: tf.end } })} className={cn(inputClass, 'w-40')} />
            <span>to</span>
            <input type="date" value={tf.end} onChange={e => patch({ timeframe: { type: 'between', start: tf.start, end: e.target.value } })} className={cn(inputClass, 'w-40')} />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
        <span>is</span>
        <select
          value={rule.operator}
          onChange={e => {
            const op = e.target.value as AggregateRule['operator']
            let value = rule.value
            if (op === 'between' && !Array.isArray(value)) value = [0, 0]
            if (op !== 'between' && Array.isArray(value)) value = 0
            patch({ operator: op, value })
          }}
          className={cn(selectClass, 'min-w-[130px]')}
        >
          {AGG_COMPARE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {rule.operator === 'between' ? (
          <div className="flex items-center gap-2">
            <NumberInput value={Array.isArray(rule.value) ? rule.value[0] : undefined} onChange={n => patch({ value: [n ?? 0, Array.isArray(rule.value) ? rule.value[1] : 0] })} className={cn(inputClass, 'w-28')} />
            <span className="text-xs text-text-muted">and</span>
            <NumberInput value={Array.isArray(rule.value) ? rule.value[1] : undefined} onChange={n => patch({ value: [Array.isArray(rule.value) ? rule.value[0] : 0, n ?? 0] })} className={cn(inputClass, 'w-28')} />
          </div>
        ) : (
          <NumberInput value={typeof rule.value === 'number' ? rule.value : undefined} onChange={n => patch({ value: n ?? 0 })} className={cn(inputClass, 'w-32')} />
        )}
      </div>

      <p className="text-[11px] text-violet-700/90 border-t border-violet-200 pt-2">{aggregateSummary(rule)}</p>
    </div>
  )
}

// ============ GroupBuilder — recursive, renders a FilterConfig or FilterGroup ============

type GroupModel = { logic: 'AND' | 'OR'; scope?: 'default' | 'same_order'; rules: RuleOrGroup[] }

function GroupBuilder({
  group,
  onChange,
  onRemove,        // only set when this is a nested group (root has no remove)
  depth,
}: {
  group: GroupModel
  onChange: (next: GroupModel) => void
  onRemove?: () => void
  depth: number
}) {
  const { firstField, defaultRuleFor } = useSchema()
  const rules = group.rules

  const updateItem = (index: number, item: RuleOrGroup) => {
    const next = [...rules]
    next[index] = item
    onChange({ ...group, rules: next })
  }

  const removeItem = (index: number) => {
    onChange({ ...group, rules: rules.filter((_, i) => i !== index) })
  }

  const addRule = () => {
    onChange({ ...group, rules: [...rules, defaultRuleFor(firstField)] })
  }

  const addGroup = () => {
    // Nested group starts with one rule so it's visible + functional
    const newGroup: FilterGroup = {
      type: 'group',
      logic: 'AND',
      rules: [defaultRuleFor(firstField)],
    }
    onChange({ ...group, rules: [...rules, newGroup] })
  }

  const addAggregate = () => {
    onChange({ ...group, rules: [...rules, defaultAggregateRule()] })
  }

  // Condition-type fork (spec §3.3): Attribute vs Behaviour, chosen before any form.
  const [picking, setPicking] = useState(false)

  const toggleLogic = () => {
    onChange({ ...group, logic: group.logic === 'AND' ? 'OR' : 'AND' })
  }

  const sameOrder = group.scope === 'same_order'
  const toggleSameOrder = () => {
    onChange({ ...group, scope: sameOrder ? 'default' : 'same_order' })
  }

  const isRoot = depth === 0
  const canNest = depth + 1 < MAX_NESTING_DEPTH

  return (
    <div
      className={cn(
        'relative',
        !isRoot && 'rounded-xl border bg-surface/30 p-3',
        !isRoot && (sameOrder ? 'border-emerald-400/60' : group.logic === 'AND' ? 'border-accent/30' : 'border-blue-300/60'),
      )}
    >
      {!isRoot && (
        <>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded',
              group.logic === 'AND' ? 'bg-accent/10 text-accent' : 'bg-blue-100 text-blue-700',
            )}>
              Group · match {group.logic}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleSameOrder}
                className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors',
                  sameOrder
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-white text-text-muted border-border hover:border-text-muted/40',
                )}
                title="When on, every condition in this group must be satisfied by the SAME order (e.g. ₹10,000 spent IN this category, in one order)."
              >
                {sameOrder ? '✓ Within the same order' : 'Within the same order'}
              </button>
              {onRemove && (
                <button
                  onClick={onRemove}
                  className="p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                  aria-label="Remove group"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {sameOrder && (
            <p className="mb-2 px-1 text-[11px] text-emerald-700/80">
              All conditions below must match one single order. Use Order Total, Order Date, Product, Collection or Product Category here.
            </p>
          )}
        </>
      )}

      <div className="space-y-0">
        {rules.map((item, index) => (
          <div key={index} className="relative">
            {index > 0 && (
              <div className="flex items-center py-2 pl-3">
                <button
                  onClick={toggleLogic}
                  className={cn(
                    'relative z-10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full border transition-colors',
                    group.logic === 'AND'
                      ? 'bg-accent/10 text-accent border-accent/20 hover:bg-accent/20'
                      : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
                  )}
                >
                  {group.logic}
                </button>
              </div>
            )}

            {isGroup(item) ? (
              <GroupBuilder
                group={item}
                onChange={(next: GroupModel) => updateItem(index, { type: 'group', ...next })}
                onRemove={() => removeItem(index)}
                depth={depth + 1}
              />
            ) : isAggregate(item) ? (
              <AggregateCard rule={item} onChange={u => updateItem(index, u)} onRemove={() => removeItem(index)} />
            ) : (
              <RuleRow
                rule={item}
                canRemove={rules.length > 1 || !isRoot}
                onChange={(updates: Partial<FilterRule>) => updateItem(index, { ...item, ...updates })}
                onRemove={() => removeItem(index)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 pl-3 flex flex-wrap items-center gap-2">
        {picking ? (
          <>
            <span className="text-xs font-medium text-text-muted">Add:</span>
            <button
              onClick={() => { addRule(); setPicking(false) }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium text-accent border border-dashed border-accent/40 rounded-lg hover:bg-accent/5 transition-colors"
            >
              Attribute about the customer
            </button>
            <button
              onClick={() => { addAggregate(); setPicking(false) }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium text-violet-700 border border-dashed border-violet-400/50 rounded-lg hover:bg-violet-50 transition-colors"
            >
              Behaviour the customer performed
            </button>
            <button onClick={() => setPicking(false)} className="text-xs text-text-muted hover:text-text-primary px-1.5">Cancel</button>
          </>
        ) : (
          <button
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium text-accent hover:text-accent-hover border border-dashed border-accent/30 hover:border-accent/60 rounded-lg transition-colors hover:bg-accent/5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add condition
          </button>
        )}
        {canNest && (
          <button
            onClick={addGroup}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary border border-dashed border-border hover:border-text-muted/40 rounded-lg transition-colors hover:bg-surface"
            title="Group conditions together with their own AND/OR logic"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Add group
          </button>
        )}
      </div>
    </div>
  )
}

// ============ Main Component ============

type SegmentFilterBuilderProps = {
  filters: FilterConfig
  onChange: (filters: FilterConfig) => void
}

export function SegmentFilterBuilder({ filters, onChange }: SegmentFilterBuilderProps) {
  const { data: schemaData, isLoading: schemaLoading } = useDomainSchema()
  const schemaFields: DomainFieldDef[] = schemaData?.data.fields ?? []
  const categories = schemaData?.data.categories ?? []

  // Schema helpers exposed to nested components via context — avoids
  // threading them through every level of recursion.
  const getFieldDef = (field: string): DomainFieldDef | undefined =>
    schemaFields.find(f => f.field === field)
  const getFieldType = (field: string): string => getFieldDef(field)?.type ?? 'string'
  const getOperators = (field: string) => {
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
  const defaultRuleFor = (field: string): FilterRule => {
    const def = getFieldDef(field)
    const ops = getOperators(field)
    const type = def?.type ?? 'string'
    const value = type === 'number' ? 0
      : type === 'boolean' ? true
      : type === 'select' ? (def?.optionPairs?.[0]?.value ?? def?.options?.[0] ?? '')
      : ''
    return { field, operator: (ops[0]?.value ?? 'is') as FilterOperator, value }
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
    <SchemaContext.Provider value={{
      schemaFields, categories, getFieldDef, getFieldType, getOperators, firstField, defaultRuleFor,
    }}>
      <GroupBuilder
        group={{ logic: filters.logic, rules: filters.rules as RuleOrGroup[] }}
        onChange={(next: GroupModel) => onChange({ logic: next.logic, rules: next.rules })}
        depth={0}
      />
    </SchemaContext.Provider>
  )
}

/** Generates a human-readable summary of a filter config (handles nested groups) */
export function filterSummary(filters: FilterConfig): string {
  return summariseRules(filters.rules as RuleOrGroup[], filters.logic)
}

function summariseRules(items: RuleOrGroup[], logic: 'AND' | 'OR'): string {
  if (items.length === 0) return 'No conditions'

  const parts = items.slice(0, 3).map(item => {
    if (isGroup(item)) {
      return `(${summariseRules(item.rules, item.logic)})`
    }
    if (isAggregate(item)) {
      return aggregateSummary(item)
    }
    const field = item.field.replace(/_/g, ' ')
    const opLabel = item.operator.replace(/_/g, ' ')
    if (['is_true', 'is_false'].includes(item.operator)) return `${field} ${opLabel}`
    if (['has_purchased', 'has_not_purchased'].includes(item.operator)) return `${opLabel} "${item.value}"`
    return `${field} ${opLabel} ${item.value}`
  })

  const joined = parts.join(` ${logic} `)
  return items.length > 3 ? `${joined} (+${items.length - 3} more)` : joined
}

// ============ Validation (spec §6) ============

export type FilterValidation = { errors: string[]; warnings: string[] }

function asLowHigh(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 ? [Number(v[0]), Number(v[1])] : null
}

/** Validate a filter tree before save. Errors block save; warnings are advisory. */
export function validateFilterConfig(filters: FilterConfig): FilterValidation {
  const errors: string[] = []
  const warnings: string[] = []

  const visitRule = (r: FilterRule) => {
    const name = r.field.replace(/_/g, ' ')
    if (r.operator === 'between') {
      const lh = asLowHigh(r.value)
      if (lh && lh[0] > lh[1]) errors.push(`"${name}" range is reversed — the low value must not exceed the high value.`)
    }
    if (r.operator === 'between_dates') {
      const v = Array.isArray(r.value) ? (r.value as string[]) : []
      if (!v[0] || !v[1]) errors.push(`"${name}" needs both a from and a to date.`)
      else if (v[0] > v[1]) errors.push(`"${name}" date range is reversed — the from date must not be after the to date.`)
    }
  }

  const visitAggregate = (a: AggregateRule) => {
    if (a.operator === 'between') {
      const lh = asLowHigh(a.value)
      if (lh && lh[0] > lh[1]) errors.push('Aggregate comparison is reversed — the low value must not exceed the high value.')
    }
    if (a.timeframe?.type === 'between') {
      if (!a.timeframe.start || !a.timeframe.end) errors.push('Aggregate date range needs both a from and a to date.')
      else if (a.timeframe.start > a.timeframe.end) errors.push('Aggregate date range is reversed — the from date must not be after the to date.')
    }
    if (a.timeframe?.type === 'last_n_days' && (!a.timeframe.n || a.timeframe.n <= 0)) {
      errors.push('Aggregate "last N days" needs a positive number of days.')
    }
    for (const f of a.scope?.filters ?? []) {
      const name = f.field.replace(/_/g, ' ')
      if (f.operator === 'between') {
        const lh = asLowHigh(f.value)
        if (lh && lh[0] > lh[1]) errors.push(`Aggregate filter "${name}" range is reversed.`)
      } else if (!Array.isArray(f.value) && (f.value === '' || f.value == null)) {
        warnings.push(`Aggregate filter "${name}" has no value yet — it will be ignored.`)
      }
    }
    const noScope = (a.scope?.filters ?? []).length === 0
    const noTime = !a.timeframe || a.timeframe.type === 'all_time'
    if (noScope && noTime) {
      warnings.push('An aggregate with no scope filter and no timeframe is the customer total across all history — add a product filter if you meant spend on a specific product.')
    }
  }

  const walk = (items: (FilterRule | FilterGroup | AggregateRule)[], isRoot: boolean) => {
    if (items.length === 0) {
      errors.push(isRoot ? 'Add at least one condition.' : 'A group has no conditions — add one or remove the group.')
      return
    }
    for (const item of items) {
      if (isGroup(item)) walk(item.rules, false)
      else if (isAggregate(item)) visitAggregate(item)
      else visitRule(item)
    }
  }

  walk(filters.rules, true)
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

/** Inline list of validation errors (blocking) and warnings (advisory). */
export function FilterValidationMessages({ validation }: { validation: FilterValidation }) {
  if (validation.errors.length === 0 && validation.warnings.length === 0) return null
  return (
    <div className="mt-3 space-y-1.5">
      {validation.errors.map((e, i) => (
        <p key={`e${i}`} className="text-xs text-red-600 flex items-start gap-1.5">
          <span aria-hidden>⚠</span><span>{e}</span>
        </p>
      ))}
      {validation.warnings.map((w, i) => (
        <p key={`w${i}`} className="text-xs text-amber-700 flex items-start gap-1.5">
          <span aria-hidden>•</span><span>{w}</span>
        </p>
      ))}
    </div>
  )
}
