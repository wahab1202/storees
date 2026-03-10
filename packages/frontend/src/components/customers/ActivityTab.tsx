'use client'

import {
  ShoppingCart,
  Package,
  CreditCard,
  UserPlus,
  UserCog,
  Activity,
  Loader2,
} from 'lucide-react'
import type { TrackedEvent } from '@storees/shared'

type Props = {
  events: TrackedEvent[]
  isLoading: boolean
}

const EVENT_ICONS: Record<string, typeof ShoppingCart> = {
  order_placed: CreditCard,
  order_fulfilled: Package,
  order_cancelled: Package,
  cart_created: ShoppingCart,
  cart_updated: ShoppingCart,
  checkout_started: CreditCard,
  customer_created: UserPlus,
  customer_updated: UserCog,
}

function formatTimestamp(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatEventName(name: string): string {
  return name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function summarizeProperties(props: Record<string, unknown>): string {
  const parts: string[] = []
  if (props.total !== undefined) parts.push(`Total: $${Number(props.total).toFixed(2)}`)
  if (props.item_count !== undefined) parts.push(`${props.item_count} items`)
  if (props.order_id) parts.push(`Order #${props.order_id}`)
  if (props.cart_value !== undefined) parts.push(`Cart: $${Number(props.cart_value).toFixed(2)}`)
  return parts.join(' · ')
}

export function ActivityTab({ events, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    )
  }

  if (events.length === 0) {
    return <p className="text-sm text-text-muted py-4">No activity recorded.</p>
  }

  return (
    <div className="space-y-1">
      {events.map(event => {
        const Icon = EVENT_ICONS[event.eventName] ?? Activity
        const summary = summarizeProperties(event.properties)

        return (
          <div key={event.id} className="flex items-start gap-3 py-2">
            <div className="mt-0.5 p-1.5 rounded-lg bg-surface-elevated">
              <Icon className="h-4 w-4 text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {formatEventName(event.eventName)}
                </span>
                <span className="text-xs text-text-muted">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
              {summary && (
                <p className="text-xs text-text-secondary mt-0.5">{summary}</p>
              )}
            </div>
            <span className="text-xs text-text-muted shrink-0">{event.platform}</span>
          </div>
        )
      })}
    </div>
  )
}
