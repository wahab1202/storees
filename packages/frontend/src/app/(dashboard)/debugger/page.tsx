'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useEvents, useEventNames } from '@/hooks/useEvents'
import { Loader2, ChevronDown, ChevronRight, Radio, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function DebuggerPage() {
  // Filter state. `customerInput` is what the user types; `customer` is the
  // debounced value actually sent to the server (avoids a query per keystroke).
  const [customerInput, setCustomerInput] = useState('')
  const [customer, setCustomer] = useState('')
  const [eventName, setEventName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setCustomer(customerInput), 400)
    return () => clearTimeout(t)
  }, [customerInput])

  const { data, isLoading, isError, dataUpdatedAt } = useEvents(200, { customer, eventName, from, to })
  const { data: namesData } = useEventNames()
  const events = data?.data ?? []
  const eventNames = namesData?.data ?? []

  const hasFilters = !!(customerInput || eventName || from || to)
  const clearAll = () => { setCustomerInput(''); setCustomer(''); setEventName(''); setFrom(''); setTo('') }

  const inputCls = 'px-3 py-2 text-sm border border-border rounded-lg bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent/20'

  return (
    <div>
      <PageHeader
        title="Event Debugger"
        actions={
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-green-500 animate-pulse" />
            <span className="text-xs text-text-muted">
              Live — updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Customer name, email, phone, or ID…"
            value={customerInput}
            onChange={e => setCustomerInput(e.target.value)}
            className={cn(inputCls, 'pl-8 w-72 placeholder:text-text-muted')}
          />
        </div>
        <select value={eventName} onChange={e => setEventName(e.target.value)} className={inputCls}>
          <option value="">All events</option>
          {eventNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="flex flex-col text-[10px] uppercase tracking-wide text-text-muted gap-0.5">
          From
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col text-[10px] uppercase tracking-wide text-text-muted gap-0.5">
          To
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </label>
        {hasFilters && (
          <button onClick={clearAll} className="inline-flex items-center gap-1 px-3 py-2 text-sm text-text-muted hover:text-text-primary">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load events.</p>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-text-secondary text-sm">
            {hasFilters ? 'No events match these filters.' : 'No events yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface-elevated border border-border rounded-lg divide-y divide-border font-mono text-sm">
          {events.map(event => {
            const isExpanded = expandedId === event.id

            return (
              <div key={event.id}>
                <div
                  className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-surface transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  )}
                  <span className="text-xs text-text-muted w-[150px] shrink-0">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium shrink-0',
                    platformColor(event.platform),
                  )}>
                    {event.platform}
                  </span>
                  <span className="text-accent font-medium">{event.eventName}</span>
                  {eventPreview(event.properties) && (
                    <span className="text-text-muted text-xs truncate max-w-[200px]">
                      {eventPreview(event.properties)}
                    </span>
                  )}
                  {(event.customerName || event.customerEmail) && (
                    <span className="text-text-muted ml-auto truncate">
                      {event.customerName ?? event.customerEmail}
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <div className="px-4 pb-3 pl-12">
                    <pre className="text-xs text-text-secondary bg-surface rounded p-3 overflow-x-auto">
                      {JSON.stringify(event.properties, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function eventPreview(properties: Record<string, unknown> | null | undefined): string | null {
  if (!properties) return null
  const p = properties as Record<string, unknown>

  // Page views
  if (p.page) return String(p.page)
  if (p.url) return String(p.url)

  // Transactions / payments
  const parts: string[] = []
  if (p.amount) parts.push(`₹${Number(p.amount).toLocaleString('en-IN')}`)
  if (p.channel) parts.push(String(p.channel).toUpperCase())
  if (p.biller) parts.push(String(p.biller))
  if (p.category && !p.amount) parts.push(String(p.category))
  if (p.type && p.amount) parts.push(String(p.type))
  if (p.method) parts.push(String(p.method))
  if (p.plan) parts.push(String(p.plan))

  return parts.length > 0 ? parts.join(' · ') : null
}

function platformColor(platform: string): string {
  switch (platform) {
    case 'shopify_webhook': return 'bg-purple-100 text-purple-700'
    case 'historical_sync': return 'bg-blue-100 text-blue-700'
    case 'web': return 'bg-green-100 text-green-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}
