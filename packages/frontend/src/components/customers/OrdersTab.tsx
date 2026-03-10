'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { formatCurrency } from '@storees/shared'
import { cn } from '@/lib/utils'
import type { Order } from '@storees/shared'

type Props = {
  orders: Order[]
  isLoading: boolean
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  fulfilled: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
}

export function OrdersTab({ orders, isLoading }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    )
  }

  if (orders.length === 0) {
    return <p className="text-sm text-text-muted py-4">No orders yet.</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-2 px-2 font-medium text-text-secondary w-8" />
          <th className="text-left py-2 px-2 font-medium text-text-secondary">Order</th>
          <th className="text-left py-2 px-2 font-medium text-text-secondary">Date</th>
          <th className="text-left py-2 px-2 font-medium text-text-secondary">Status</th>
          <th className="text-right py-2 px-2 font-medium text-text-secondary">Total</th>
        </tr>
      </thead>
      <tbody>
        {orders.map(order => (
          <OrderRow
            key={order.id}
            order={order}
            isExpanded={expandedId === order.id}
            onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
          />
        ))}
      </tbody>
    </table>
  )
}

function OrderRow({
  order,
  isExpanded,
  onToggle,
}: {
  order: Order
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className="border-b border-border hover:bg-surface-elevated cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 px-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-muted" />
          )}
        </td>
        <td className="py-2 px-2 font-medium text-text-primary">
          #{order.externalOrderId || order.id.slice(0, 8)}
        </td>
        <td className="py-2 px-2 text-text-secondary">{formatDate(order.createdAt)}</td>
        <td className="py-2 px-2">
          <span
            className={cn(
              'inline-block px-2 py-0.5 text-xs rounded-full font-medium',
              STATUS_COLORS[order.status] ?? STATUS_COLORS.pending,
            )}
          >
            {order.status}
          </span>
        </td>
        <td className="py-2 px-2 text-right font-medium text-text-primary">
          {formatCurrency(order.total)}
        </td>
      </tr>
      {isExpanded && order.lineItems.length > 0 && (
        <tr>
          <td colSpan={5} className="bg-surface-elevated px-6 py-3">
            <div className="space-y-2">
              {order.lineItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.productName}
                      className="w-8 h-8 rounded object-cover"
                    />
                  )}
                  <span className="text-text-primary flex-1">{item.productName}</span>
                  <span className="text-text-muted">x{item.quantity}</span>
                  <span className="text-text-secondary font-medium">
                    {formatCurrency(item.price)}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
