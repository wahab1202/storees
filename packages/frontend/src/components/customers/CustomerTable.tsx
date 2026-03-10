'use client'

import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@storees/shared'
import { CustomerDetail } from './CustomerDetail'
import type { Customer, CustomerListParams } from '@storees/shared'

type CustomerWithSegments = Customer & {
  segments: Array<{ id: string; name: string }>
}

type Props = {
  customers: CustomerWithSegments[]
  sortBy?: CustomerListParams['sortBy']
  sortOrder?: CustomerListParams['sortOrder']
  onSort: (field: CustomerListParams['sortBy']) => void
  expandedId: string | null
  onToggleExpand: (id: string) => void
}

type SortableColumn = {
  key: CustomerListParams['sortBy']
  label: string
  align?: 'left' | 'right'
}

const COLUMNS: SortableColumn[] = [
  { key: 'name', label: 'Customer' },
  { key: 'totalSpent', label: 'Total Spent', align: 'right' },
  { key: 'clv', label: 'CLV', align: 'right' },
  { key: 'lastSeen', label: 'Last Seen' },
]

const COL_COUNT = COLUMNS.length + 2 // +Segments +Orders

function SortIcon({ column, sortBy, sortOrder }: { column: string; sortBy?: string; sortOrder?: string }) {
  if (column !== sortBy) return <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" />
  return sortOrder === 'asc'
    ? <ArrowUp className="h-3.5 w-3.5 text-accent" />
    : <ArrowDown className="h-3.5 w-3.5 text-accent" />
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function CustomerTable({ customers, sortBy, sortOrder, onSort, expandedId, onToggleExpand }: Props) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface-elevated">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            {COLUMNS.map(col => (
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
            <th className="px-4 py-3 font-medium text-text-secondary text-right">Orders</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(customer => (
            <>
              <tr
                key={customer.id}
                className={cn(
                  'border-b border-border cursor-pointer transition-colors',
                  expandedId === customer.id ? 'bg-surface' : 'hover:bg-surface',
                )}
                onClick={() => onToggleExpand(customer.id)}
              >
                {/* Customer name + email */}
                <td className="px-4 py-3">
                  <div className="font-medium text-text-primary">
                    {customer.name || 'Unknown'}
                  </div>
                  {customer.email && (
                    <div className="text-xs text-text-muted mt-0.5">{customer.email}</div>
                  )}
                </td>

                {/* Total spent */}
                <td className="px-4 py-3 text-right font-medium text-text-primary">
                  {formatCurrency(customer.totalSpent)}
                </td>

                {/* CLV */}
                <td className="px-4 py-3 text-right text-text-secondary">
                  {formatCurrency(customer.clv)}
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

                {/* Orders count */}
                <td className="px-4 py-3 text-right text-text-secondary">
                  {customer.totalOrders}
                </td>
              </tr>

              {/* Expanded detail row */}
              {expandedId === customer.id && (
                <tr key={`${customer.id}-detail`}>
                  <td colSpan={COL_COUNT} className="p-0">
                    <CustomerDetail customerId={customer.id} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
