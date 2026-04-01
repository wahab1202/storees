'use client'

import { useState, useMemo } from 'react'
import {
  ShoppingCart,
  Package,
  CreditCard,
  UserPlus,
  UserCog,
  Activity,
  Loader2,
  ArrowRightLeft,
  BadgeCheck,
  AlertCircle,
  Wallet,
  TrendingUp,
  Star,
  LogIn,
  Zap,
  ChevronDown,
  ChevronRight,
  Filter,
  ChevronsUpDown,
  Eye,
  Heart,
  ShoppingBag,
  LayoutGrid,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TrackedEvent } from '@storees/shared'

type Props = {
  events: TrackedEvent[]
  isLoading: boolean
}

// ─── Event icon map (domain-aware) ───────────────────────

const EVENT_ICONS: Record<string, typeof ShoppingCart> = {
  // Ecommerce
  order_placed: CreditCard,
  order_fulfilled: Package,
  order_cancelled: Package,
  cart_created: ShoppingCart,
  cart_updated: ShoppingCart,
  checkout_started: CreditCard,
  customer_created: UserPlus,
  customer_updated: UserCog,
  product_viewed: Eye,
  added_to_cart: ShoppingBag,
  added_to_wishlist: Heart,
  collection_viewed: LayoutGrid,
  // Fintech
  transaction_completed: ArrowRightLeft,
  bill_payment_completed: Wallet,
  kyc_verified: BadgeCheck,
  kyc_expired: AlertCircle,
  loan_disbursed: Wallet,
  emi_paid: CreditCard,
  emi_overdue: AlertCircle,
  sip_started: TrendingUp,
  card_activated: CreditCard,
  app_login: LogIn,
  // SaaS
  user_signup: UserPlus,
  feature_used: Zap,
  trial_expiring: AlertCircle,
  subscription_started: Star,
  subscription_cancelled: AlertCircle,
  user_invited: UserPlus,
  // Email tracking
  email_delivered: Mail,
  email_opened: Eye,
  email_clicked: ShoppingBag,
  email_bounced: AlertCircle,
  email_complained: AlertCircle,
}

const EVENT_COLORS: Record<string, string> = {
  order_placed: 'bg-blue-500',
  order_fulfilled: 'bg-green-500',
  order_cancelled: 'bg-red-500',
  cart_created: 'bg-amber-500',
  checkout_started: 'bg-indigo-500',
  customer_created: 'bg-emerald-500',
  product_viewed: 'bg-violet-500',
  added_to_cart: 'bg-orange-500',
  added_to_wishlist: 'bg-pink-500',
  collection_viewed: 'bg-cyan-500',
  transaction_completed: 'bg-blue-500',
  kyc_verified: 'bg-green-500',
  kyc_expired: 'bg-red-500',
  emi_overdue: 'bg-red-500',
  loan_disbursed: 'bg-emerald-500',
  feature_used: 'bg-purple-500',
  subscription_started: 'bg-green-500',
  subscription_cancelled: 'bg-red-500',
  // Email tracking
  email_delivered: 'bg-teal-500',
  email_opened: 'bg-sky-500',
  email_clicked: 'bg-blue-600',
  email_bounced: 'bg-red-400',
  email_complained: 'bg-red-600',
}

// ─── Helpers ─────────────────────────────────────────────

function formatEventName(name: string): string {
  return name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function summarizeProperties(props: Record<string, unknown>): string {
  const parts: string[] = []
  // Page views
  if (props.page) parts.push(String(props.page))
  if (props.url && !props.page) parts.push(String(props.url))
  // Product browsing / wishlist / cart
  if (props.product_name) parts.push(String(props.product_name))
  if (props.product_type) parts.push(String(props.product_type))
  if (props.collection_name) parts.push(String(props.collection_name))
  if (props.variant_title) parts.push(String(props.variant_title))
  if (props.price !== undefined && !props.total) parts.push(`₹${Number(props.price).toLocaleString('en-IN')}`)
  // Ecommerce orders
  if (props.total !== undefined) parts.push(`₹${Number(props.total).toLocaleString('en-IN')}`)
  if (props.item_count !== undefined) parts.push(`${props.item_count} items`)
  if (props.order_id) parts.push(`Order #${props.order_id}`)
  if (props.cart_value !== undefined) parts.push(`Cart: ₹${Number(props.cart_value).toLocaleString('en-IN')}`)
  // Fintech
  if (props.amount !== undefined) parts.push(`₹${Number(props.amount).toLocaleString('en-IN')}`)
  if (props.channel) parts.push(String(props.channel).toUpperCase())
  if (props.biller) parts.push(String(props.biller))
  if (props.category) parts.push(String(props.category))
  if (props.recipient) parts.push(`to ${props.recipient}`)
  if (props.transaction_id) parts.push(`Txn #${props.transaction_id}`)
  if (props.loan_amount !== undefined) parts.push(`₹${Number(props.loan_amount).toLocaleString('en-IN')}`)
  // Auth
  if (props.method) parts.push(String(props.method))
  if (props.device) parts.push(String(props.device))
  if (props.type && !props.amount) parts.push(String(props.type))
  // SaaS
  if (props.plan) parts.push(`Plan: ${props.plan}`)
  if (props.feature) parts.push(String(props.feature))
  return parts.join(' · ')
}

function formatPropValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return value.toLocaleString()
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ─── Component ───────────────────────────────────────────

export function ActivityTab({ events, isLoading }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filterEvent, setFilterEvent] = useState<string>('')
  const [allExpanded, setAllExpanded] = useState(false)

  // Unique event names for filter dropdown
  const eventNames = useMemo(() => {
    const names = new Set(events.map(e => e.eventName))
    return Array.from(names).sort()
  }, [events])

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (!filterEvent) return events
    return events.filter(e => e.eventName === filterEvent)
  }, [events, filterEvent])

  const toggleEvent = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set())
      setAllExpanded(false)
    } else {
      setExpandedIds(new Set(filteredEvents.map(e => e.id)))
      setAllExpanded(true)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="h-8 w-8 text-text-muted/30 mx-auto mb-3" />
        <p className="text-sm text-text-muted">No activity recorded.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3">
        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-text-muted" />
          <select
            value={filterEvent}
            onChange={e => setFilterEvent(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
          >
            <option value="">All Events ({events.length})</option>
            {eventNames.map(name => (
              <option key={name} value={name}>
                {formatEventName(name)} ({events.filter(e => e.eventName === name).length})
              </option>
            ))}
          </select>
        </div>

        {/* Expand/Collapse All */}
        <button
          onClick={toggleAll}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {/* Timeline */}
      <div className="space-y-px">
        {filteredEvents.map((event, idx) => {
          const Icon = EVENT_ICONS[event.eventName] ?? Activity
          const dotColor = EVENT_COLORS[event.eventName] ?? 'bg-gray-400'
          const summary = summarizeProperties(event.properties)
          const isExpanded = expandedIds.has(event.id)
          const propEntries = Object.entries(event.properties).filter(
            ([, v]) => v !== null && v !== undefined,
          )
          const isLast = idx === filteredEvents.length - 1

          return (
            <div key={event.id} className="group">
              <div
                className={cn(
                  'flex items-start gap-4 px-4 py-3 rounded-lg cursor-pointer transition-colors',
                  isExpanded ? 'bg-surface' : 'hover:bg-surface/50',
                )}
                onClick={() => toggleEvent(event.id)}
              >
                {/* Timestamp column */}
                <div className="w-16 shrink-0 text-right pt-0.5">
                  <div className="text-xs font-medium text-text-primary">
                    {formatTime(event.timestamp)}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {formatDate(event.timestamp)}
                  </div>
                </div>

                {/* Timeline dot + connector */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="flex items-center justify-center w-5 h-5">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
                    ) : (
                      <div className={cn('w-2.5 h-2.5 rounded-full', dotColor)} />
                    )}
                  </div>
                  {!isLast && (
                    <div className="w-px flex-1 min-h-[16px] bg-border" />
                  )}
                </div>

                {/* Event content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-text-muted shrink-0" />
                    <span className="text-sm font-medium text-text-primary">
                      {formatEventName(event.eventName)}
                    </span>
                  </div>

                  {/* Platform + source badges */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-surface-elevated text-text-muted">
                      {event.platform}
                    </span>
                  </div>

                  {/* Summary line (collapsed) */}
                  {summary && !isExpanded && (
                    <p className="text-xs text-text-secondary mt-1">{summary}</p>
                  )}
                </div>

                {/* Expand indicator */}
                <div className="shrink-0 pt-0.5">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>

              {/* Expanded properties table */}
              {isExpanded && propEntries.length > 0 && (
                <div className="ml-[100px] mr-4 mb-3 bg-white border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">
                          Key
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {propEntries.map(([key, val]) => (
                        <tr key={key} className="border-t border-border/50">
                          <td className="px-4 py-2 text-text-secondary font-medium">{key}</td>
                          <td className="px-4 py-2 text-text-primary">{formatPropValue(val)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty filtered state */}
      {filteredEvents.length === 0 && filterEvent && (
        <div className="text-center py-8">
          <p className="text-sm text-text-muted">
            No &ldquo;{formatEventName(filterEvent)}&rdquo; events found.
          </p>
        </div>
      )}
    </div>
  )
}
