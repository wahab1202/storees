'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useEvents, useEventNames, useEventSessions, type SessionSummary } from '@/hooks/useEvents'
import { Loader2, ChevronDown, ChevronRight, Radio, Search, X, Link2, UserX, CheckCircle2, Fingerprint } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function DebuggerPage() {
  // Filter state. `customerInput` is what the user types; `customer` is the
  // debounced value actually sent to the server (avoids a query per keystroke).
  const [customerInput, setCustomerInput] = useState('')
  const [customer, setCustomer] = useState('')
  const [eventName, setEventName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [session, setSession] = useState('')
  const [showSessions, setShowSessions] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setCustomer(customerInput), 400)
    return () => clearTimeout(t)
  }, [customerInput])

  const { data, isLoading, isError, dataUpdatedAt } = useEvents(200, { customer, eventName, from, to, session })
  const { data: namesData } = useEventNames()
  const events = data?.data ?? []
  const eventNames = namesData?.data ?? []

  const hasFilters = !!(customerInput || eventName || from || to || session)
  const clearAll = () => { setCustomerInput(''); setCustomer(''); setEventName(''); setFrom(''); setTo(''); setSession('') }

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

      {/* Sessions — the identity-stitching debugger */}
      <div className="mb-4">
        <button
          onClick={() => setShowSessions(v => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary mb-2"
        >
          {showSessions ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Fingerprint className="h-3.5 w-3.5" />
          Sessions (last 7 days)
        </button>
        {showSessions && <SessionsPanel activeSession={session} onPick={sid => setSession(sid === session ? '' : sid)} />}
      </div>

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
        {session && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-mono rounded-lg bg-accent/10 text-accent">
            session: …{session.slice(-10)}
            <button onClick={() => setSession('')} aria-label="Clear session filter"><X className="h-3 w-3" /></button>
          </span>
        )}
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
                  {event.sessionId && (
                    <button
                      onClick={e => { e.stopPropagation(); setSession(event.sessionId!) }}
                      title={`Filter by session ${event.sessionId}`}
                      className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] hover:bg-slate-200 shrink-0"
                    >
                      s:…{event.sessionId.slice(-6)}
                    </button>
                  )}
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


/* ─── Sessions panel — answers "which session did my checkout phone land on,
   and did it ever link to a customer?" ─── */

function SessionsPanel({ activeSession, onPick }: { activeSession: string; onPick: (sessionId: string) => void }) {
  const { data, isLoading } = useEventSessions()
  const sessions = data?.data ?? []

  if (isLoading) return <div className="rounded-lg border border-border bg-surface-elevated p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-text-muted" /></div>
  if (sessions.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-xs text-text-muted">No sessions in the last 7 days. Sessions appear when SDK/webhook events carry a session_id.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-elevated">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-text-muted">
            <th className="text-left font-medium px-3 py-2">Session</th>
            <th className="text-right font-medium px-2 py-2">Events</th>
            <th className="text-left font-medium px-3 py-2">Activity</th>
            <th className="text-left font-medium px-3 py-2">Identity seen in payloads</th>
            <th className="text-left font-medium px-3 py-2">Customer link</th>
            <th className="text-left font-medium px-3 py-2">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => <SessionRow key={s.sessionId} s={s} active={activeSession === s.sessionId} onPick={onPick} />)}
        </tbody>
      </table>
      <p className="px-3 py-2 border-t border-border text-[10px] text-text-muted">
        Two rows with the SAME person but DIFFERENT session ids = the storefront SDK session and the checkout&apos;s own session are not being bridged — identity typed at checkout can&apos;t back-attribute the browsing events. Click a row to see its events below.
      </p>
    </div>
  )
}

function SessionRow({ s, active, onPick }: { s: SessionSummary; active: boolean; onPick: (id: string) => void }) {
  const linked = !!s.customerId
  const backAttributed = !!s.resolvedAt
  return (
    <tr
      onClick={() => onPick(s.sessionId)}
      className={cn('border-b border-border/50 last:border-0 cursor-pointer transition-colors', active ? 'bg-accent/5' : 'hover:bg-surface')}
    >
      <td className="px-3 py-2">
        <code className={cn('text-[11px]', active ? 'text-accent font-semibold' : 'text-text-secondary')} title={s.sessionId}>
          …{s.sessionId.slice(-12)}
        </code>
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{s.eventCount}</td>
      <td className="px-3 py-2 text-text-muted max-w-[220px] truncate" title={s.eventNames.join(', ')}>
        {s.eventNames.slice(0, 3).join(', ')}{s.eventNames.length > 3 ? ` +${s.eventNames.length - 3}` : ''}
      </td>
      <td className="px-3 py-2">
        {s.seenPhone || s.seenEmail ? (
          <span className="text-amber-700" title="An identity value was PRESENT in this session's payloads — if the link column says anonymous, the stitch is what's failing">
            {[s.seenPhone, s.seenEmail].filter(Boolean).join(' · ')}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {linked ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Link2 className="h-3 w-3" /> {s.customerLabel ?? s.customerId}
            {backAttributed && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600" title={`${s.eventsBackAttributed ?? 0} earlier events re-attributed to this customer`}>
                <CheckCircle2 className="h-3 w-3" /> {s.eventsBackAttributed ?? 0} back-attributed
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-text-muted"><UserX className="h-3 w-3" /> anonymous</span>
        )}
      </td>
      <td className="px-3 py-2 text-text-muted whitespace-nowrap">{new Date(s.lastSeen).toLocaleString()}</td>
    </tr>
  )
}
