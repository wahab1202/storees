'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@storees/shared'
import type { Customer, CustomerListParams } from '@storees/shared'

type CustomerWithSegments = Customer & {
  segments: Array<{ id: string; name: string }>
}

type Props = {
  customers: CustomerWithSegments[]
  sortBy?: CustomerListParams['sortBy']
  sortOrder?: CustomerListParams['sortOrder']
  onSort: (field: CustomerListParams['sortBy']) => void
  domain?: string
}

type SortableColumn = {
  key: CustomerListParams['sortBy']
  label: string
  align?: 'left' | 'right'
}

type DomainColumnConfig = {
  columns: SortableColumn[]
  activityLabel: string
  getMoneyValue: (c: CustomerWithSegments) => number
  getSecondaryValue: (c: CustomerWithSegments) => string
  getActivityCount: (c: CustomerWithSegments) => number
}

function getMetric(c: CustomerWithSegments, key: string): unknown {
  return (c.metrics as Record<string, unknown>)?.[key]
}

// B2B stores (GWM and its dealers) key customers by shop, not person. In the
// live data the shop name lands at custom_attributes.company (the
// gowelmart_import path); `shop_name` is reserved for connectors that emit it
// but is currently empty. Read company first, then shop_name. When present,
// show the shop as the primary label so a dealer can find a customer by shop
// name; the person's name/email drops to the muted secondary line. Falls back
// to the person name for every non-B2B customer (no shop → unchanged).
function getShopName(c: CustomerWithSegments): string | undefined {
  const ca = c.customAttributes as Record<string, unknown> | undefined
  for (const key of ['company', 'shop_name']) {
    const v = ca?.[key]
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return undefined
}

function getDomainColumns(domain?: string): DomainColumnConfig {
  switch (domain) {
    case 'fintech':
      return {
        columns: [
          { key: 'name', label: 'Customer' },
          { key: 'totalSpent', label: 'Txn Volume', align: 'right' },
          { key: 'clv', label: 'Net Flow', align: 'right' },
          { key: 'lastSeen', label: 'Last Seen' },
        ],
        activityLabel: 'Transactions',
        getMoneyValue: (c) => {
          const debit = Number(getMetric(c, 'total_debit') ?? 0)
          const credit = Number(getMetric(c, 'total_credit') ?? 0)
          return debit + credit
        },
        getSecondaryValue: (c) => {
          const credit = Number(getMetric(c, 'total_credit') ?? 0)
          const debit = Number(getMetric(c, 'total_debit') ?? 0)
          return formatCurrency(credit - debit)
        },
        getActivityCount: (c) => Number(getMetric(c, 'total_transactions') ?? 0),
      }
    case 'saas':
      return {
        columns: [
          { key: 'name', label: 'Customer' },
          { key: 'totalSpent', label: 'MRR', align: 'right' },
          { key: 'clv', label: 'Plan', align: 'right' },
          { key: 'lastSeen', label: 'Last Seen' },
        ],
        activityLabel: 'Feature Usage',
        getMoneyValue: (c) => Number(getMetric(c, 'mrr') ?? 0),
        getSecondaryValue: (c) => {
          const plan = (getMetric(c, 'plan') as string) ?? 'free'
          return plan.charAt(0).toUpperCase() + plan.slice(1)
        },
        getActivityCount: (c) => Number(getMetric(c, 'feature_usage_count') ?? 0),
      }
    default: // ecommerce + custom
      return {
        columns: [
          { key: 'name', label: 'Customer' },
          { key: 'totalSpent', label: 'Total Spent', align: 'right' },
          { key: 'clv', label: 'CLV', align: 'right' },
          { key: 'lastSeen', label: 'Last Seen' },
        ],
        activityLabel: 'Orders',
        getMoneyValue: (c) => c.totalSpent,
        getSecondaryValue: (c) => formatCurrency(c.clv),
        getActivityCount: (c) => c.totalOrders,
      }
  }
}

function SortIcon({ column, sortBy, sortOrder }: { column: string; sortBy?: string; sortOrder?: string }) {
  if (column !== sortBy) return <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" />
  return sortOrder === 'asc'
    ? <ArrowUp className="h-3.5 w-3.5 text-accent" />
    : <ArrowDown className="h-3.5 w-3.5 text-accent" />
}

function formatDate(date: Date | string | null | undefined): string {
  if (date == null) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function CustomerTable({ customers, sortBy, sortOrder, onSort, domain }: Props) {
  const router = useRouter()
  const cfg = getDomainColumns(domain)

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface-elevated overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b border-border bg-surface">
            {cfg.columns.map(col => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 font-medium text-text-secondary cursor-pointer hover:text-text-primary transition-colors select-none',
                  col.align === 'right' ? 'text-right' : 'text-left',
                )}
                onClick={() => onSort(col.key)}
              >
                <span className="inline-flex items-center gap-1.5">
                  {col.label}
                  <SortIcon column={col.key!} sortBy={sortBy} sortOrder={sortOrder} />
                </span>
              </th>
            ))}
            <th className="px-4 py-3 font-medium text-text-secondary text-left">Segments</th>
            <th className="px-4 py-3 font-medium text-text-secondary text-right">{cfg.activityLabel}</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(customer => {
            const shopName = getShopName(customer)
            // When a shop name exists it becomes the primary label; the person
            // name (or email if no name) fills the secondary line so the human
            // behind the shop stays visible. Otherwise keep the original
            // name-then-email layout.
            const primaryLabel = shopName ?? customer.name ?? 'Unknown'
            const secondaryLabel = shopName
              ? (customer.name || customer.email || undefined)
              : (customer.email || undefined)
            return (
              <tr
                key={customer.id}
                className="border-b border-border cursor-pointer transition-colors hover:bg-surface"
                onClick={() => router.push(`/customers/${customer.id}`)}
              >
                {/* Customer name + email (shop name takes precedence for B2B) */}
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-medium text-text-primary hover:text-accent hover:underline transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    {primaryLabel}
                  </Link>
                  {secondaryLabel && (
                    <div className="text-xs text-text-muted mt-0.5">{secondaryLabel}</div>
                  )}
                </td>

                {/* Money column (domain-aware) */}
                <td className="px-4 py-3 text-right font-medium text-text-primary">
                  {formatCurrency(cfg.getMoneyValue(customer))}
                </td>

                {/* Secondary column (domain-aware) */}
                <td className="px-4 py-3 text-right text-text-secondary">
                  {cfg.getSecondaryValue(customer)}
                </td>

                {/* Last seen */}
                <td className="px-4 py-3 text-text-secondary">
                  {formatDate(customer.lastSeen)}
                </td>

                {/* Segments */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {customer.segments.length > 0 ? (
                      customer.segments.map(seg => (
                        <span
                          key={seg.id}
                          className="inline-block px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent font-medium"
                        >
                          {seg.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </div>
                </td>

                {/* Activity count (domain-aware) */}
                <td className="px-4 py-3 text-right text-text-secondary">
                  {cfg.getActivityCount(customer)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
