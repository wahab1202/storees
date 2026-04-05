'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useEvents } from '@/hooks/useEvents'
import { Loader2, ChevronDown, ChevronRight, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function DebuggerPage() {
  const { data, isLoading, isError, dataUpdatedAt } = useEvents(200)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const events = data?.data ?? []
  const filtered = filter
    ? events.filter(e => e.eventName.includes(filter) || e.customerName?.toLowerCase().includes(filter.toLowerCase()))
    : events

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

      {/* Filter */}
      <input
        type="text"
        placeholder="Filter by event name or customer..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full max-w-md mb-4 px-4 py-2 text-sm border border-border rounded-lg bg-surface-elevated
                   focus:outline-none focus:ring-2 focus:ring-accent/20 placeholder:text-text-muted"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load events.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-text-secondary text-sm">
            {filter ? 'No events match your filter.' : 'No events yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface-elevated border border-border rounded-lg divide-y divide-border font-mono text-sm">
          {filtered.map(event => {
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
                  <span className="text-xs text-text-muted w-[140px] shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString()}
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
                  {event.customerName && (
                    <span className="text-text-muted ml-auto truncate">
                      {event.customerName}
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
