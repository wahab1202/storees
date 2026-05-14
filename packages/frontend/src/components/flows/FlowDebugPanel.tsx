'use client'

import { useState, useMemo } from 'react'
import {
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Mail,
  MessageSquare,
  Bell,
  Phone,
  ChevronDown,
  ChevronRight,
  PlayCircle,
} from 'lucide-react'
import { useFlowDebug, type FlowDebugTrip, type FlowDebugMessage, type FlowDebugJob } from '@/hooks/useFlows'

// Per-user flow debugger — "why didn't this customer get message 3?"
// Powered by the GET /api/flows/:id/debug?customer=<query> endpoint.
// Search input accepts: Storees customer UUID, email, phone, or external id.

export function FlowDebugPanel({ flowId }: { flowId: string }) {
  const [input, setInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')

  const { data, isLoading, isError, error } = useFlowDebug(flowId, activeQuery)
  const result = data?.data
  const trips = result?.trips ?? []

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setActiveQuery(input.trim())
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search by email, phone, customer UUID, or external id…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <button
          type="submit"
          disabled={input.trim().length < 3}
          className="px-4 py-2 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Trace
        </button>
      </form>

      {!activeQuery && (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-text-muted text-sm">
          Enter a customer identifier above to trace their journey through this flow.
          <br />
          You'll see every entry, every stage they reached, every message sent, and why they exited.
        </div>
      )}

      {activeQuery && isLoading && (
        <div className="text-sm text-text-muted py-6 text-center">Searching…</div>
      )}

      {isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {(error as Error)?.message ?? 'Failed to load debug info'}
        </div>
      )}

      {activeQuery && !isLoading && result && (
        <DebugResult query={activeQuery} result={result} />
      )}
    </div>
  )
}

function DebugResult({ query, result }: { query: string; result: NonNullable<ReturnType<typeof useFlowDebug>['data']>['data'] }) {
  if (!result) return null

  if (!result.customer) {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
        No customer found matching <code className="font-mono">{query}</code>. Check the email/phone/id is correct, or that this customer exists in this project.
      </div>
    )
  }

  const { customer, trips } = result

  return (
    <div className="space-y-4">
      {/* Customer card */}
      <div className="bg-white border border-border rounded-lg p-4">
        <div className="text-xs uppercase tracking-wider text-text-muted mb-1">Customer</div>
        <div className="text-base font-semibold text-heading">{customer.name ?? customer.email ?? customer.phone ?? customer.id}</div>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-text-muted">
          <span><span className="font-medium text-text-secondary">UUID:</span> <code className="font-mono">{customer.id.slice(0, 12)}…</code></span>
          {customer.externalId && <span><span className="font-medium text-text-secondary">External:</span> <code className="font-mono">{customer.externalId}</code></span>}
          {customer.email && <span><span className="font-medium text-text-secondary">Email:</span> {customer.email}</span>}
          {customer.phone && <span><span className="font-medium text-text-secondary">Phone:</span> {customer.phone}</span>}
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="rounded-lg bg-surface border border-border p-4 text-sm text-text-muted">
          This customer has never entered this flow. (They may match the entry criteria but no triggering event has fired since the flow was active.)
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-text-muted">
            {trips.length} trip{trips.length === 1 ? '' : 's'} through this flow (most recent first)
          </div>
          {trips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
        </div>
      )}
    </div>
  )
}

function TripCard({ trip }: { trip: FlowDebugTrip }) {
  const [expanded, setExpanded] = useState(true)

  const durationMs = trip.exitedAt
    ? new Date(trip.exitedAt).getTime() - new Date(trip.enteredAt).getTime()
    : Date.now() - new Date(trip.enteredAt).getTime()

  // Build a chronological timeline by merging messages + jobs by timestamp
  const timeline = useMemo(() => {
    const events: Array<{ ts: string; kind: 'message' | 'job' | 'enter' | 'exit'; payload: unknown }> = []
    events.push({ ts: trip.enteredAt, kind: 'enter', payload: { triggerEventId: trip.triggerEventId } })
    for (const m of trip.messages) {
      events.push({ ts: m.createdAt, kind: 'message', payload: m })
    }
    for (const j of trip.scheduledJobs) {
      events.push({ ts: j.createdAt, kind: 'job', payload: j })
    }
    if (trip.exitedAt) {
      events.push({ ts: trip.exitedAt, kind: 'exit', payload: { reason: trip.status } })
    }
    return events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
  }, [trip])

  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface/50"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
          <TripStatusBadge status={trip.status} />
          <div className="text-left">
            <div className="text-sm font-medium text-heading">
              Entered {new Date(trip.enteredAt).toLocaleString()}
            </div>
            <div className="text-xs text-text-muted">
              Current node: <code className="font-mono">{trip.currentNodeId}</code> · {trip.messages.length} message{trip.messages.length === 1 ? '' : 's'} · {trip.scheduledJobs.length} job{trip.scheduledJobs.length === 1 ? '' : 's'} · {formatDuration(durationMs)}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-surface/30 px-4 py-3">
          <ol className="relative border-l border-border ml-3 space-y-3">
            {timeline.map((evt, i) => (
              <li key={`${evt.kind}-${i}`} className="ml-4">
                <TimelineDot kind={evt.kind} />
                <TimelineEntry evt={evt} />
              </li>
            ))}
          </ol>
          {trip.exitedAt === null && trip.status === 'active' && (
            <div className="mt-3 text-[11px] text-text-muted italic flex items-center gap-1.5">
              <PlayCircle className="h-3 w-3" /> Still active — waiting at <code className="font-mono">{trip.currentNodeId}</code>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TimelineDot({ kind }: { kind: 'message' | 'job' | 'enter' | 'exit' }) {
  const color =
    kind === 'enter' ? 'bg-indigo-500' :
    kind === 'exit' ? 'bg-text-muted' :
    kind === 'message' ? 'bg-emerald-500' :
    'bg-amber-500'
  return <span className={`absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full ${color} ring-2 ring-white`} />
}

function TimelineEntry({ evt }: { evt: { ts: string; kind: 'message' | 'job' | 'enter' | 'exit'; payload: unknown } }) {
  const ts = new Date(evt.ts).toLocaleString()

  if (evt.kind === 'enter') {
    return (
      <div>
        <div className="text-xs font-medium text-text-secondary">Entered flow</div>
        <div className="text-[11px] text-text-muted">{ts}</div>
      </div>
    )
  }
  if (evt.kind === 'exit') {
    const reason = (evt.payload as { reason: string }).reason
    return (
      <div>
        <div className="text-xs font-medium text-text-secondary">Exited — {reason}</div>
        <div className="text-[11px] text-text-muted">{ts}</div>
      </div>
    )
  }
  if (evt.kind === 'message') {
    const m = evt.payload as FlowDebugMessage
    const Icon = channelIcon(m.channel)
    const statusLabel = m.blockReason ? `${m.status} (${m.blockReason})` : m.status
    return (
      <div>
        <div className="flex items-center gap-2 text-xs">
          <Icon className="h-3 w-3 text-text-muted" />
          <span className="font-medium text-text-secondary">{m.channel.toUpperCase()}</span>
          <MessageStatusBadge status={m.status} blocked={!!m.blockReason} />
          {m.templateId && <code className="font-mono text-[10px] text-text-muted">{m.templateId.slice(0, 12)}…</code>}
        </div>
        <div className="text-[11px] text-text-muted mt-0.5">
          {ts}
          {m.blockReason && <span className="ml-2 text-red-700">— blocked: {m.blockReason.replace(/_/g, ' ')}</span>}
        </div>
        {(m.sentAt || m.deliveredAt || m.readAt || m.clickedAt || m.failedAt) && (
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-text-muted">
            {m.sentAt && <span>sent {new Date(m.sentAt).toLocaleTimeString()}</span>}
            {m.deliveredAt && <span>· delivered {new Date(m.deliveredAt).toLocaleTimeString()}</span>}
            {m.readAt && <span className="text-indigo-600">· read {new Date(m.readAt).toLocaleTimeString()}</span>}
            {m.clickedAt && <span className="text-violet-600">· clicked {new Date(m.clickedAt).toLocaleTimeString()}</span>}
            {m.failedAt && <span className="text-red-600">· failed {new Date(m.failedAt).toLocaleTimeString()}</span>}
          </div>
        )}
        <span className="sr-only">{statusLabel}</span>
      </div>
    )
  }
  // job
  const j = evt.payload as FlowDebugJob
  const actionType = (j.action as { type?: string })?.type ?? 'job'
  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <Clock className="h-3 w-3 text-text-muted" />
        <span className="font-medium text-text-secondary">Scheduled: {actionType}</span>
        <JobStatusBadge status={j.status} />
      </div>
      <div className="text-[11px] text-text-muted mt-0.5">
        Created {ts} · executes {new Date(j.executeAt).toLocaleString()}
      </div>
    </div>
  )
}

function TripStatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
    active: { icon: PlayCircle, color: 'text-blue-700 bg-blue-50', label: 'Active' },
    completed: { icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50', label: 'Completed' },
    exited: { icon: XCircle, color: 'text-text-muted bg-surface', label: 'Exited' },
    failed: { icon: AlertCircle, color: 'text-red-700 bg-red-50', label: 'Failed' },
  }
  const c = config[status] ?? { icon: AlertCircle, color: 'text-text-muted bg-surface', label: status }
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${c.color}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  )
}

function MessageStatusBadge({ status, blocked }: { status: string; blocked: boolean }) {
  if (blocked) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">blocked</span>
  const map: Record<string, string> = {
    queued: 'bg-surface text-text-muted',
    sent: 'bg-blue-50 text-blue-700',
    delivered: 'bg-emerald-50 text-emerald-700',
    read: 'bg-indigo-50 text-indigo-700',
    clicked: 'bg-violet-50 text-violet-700',
    failed: 'bg-red-50 text-red-700',
  }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${map[status] ?? 'bg-surface text-text-muted'}`}>{status}</span>
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700',
    completed: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-surface text-text-muted',
    failed: 'bg-red-50 text-red-700',
  }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${map[status] ?? 'bg-surface text-text-muted'}`}>{status}</span>
}

function channelIcon(channel: string) {
  switch (channel) {
    case 'email': return Mail
    case 'sms': return MessageSquare
    case 'push': return Bell
    case 'whatsapp': return Phone
    default: return MessageSquare
  }
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`
  return `${(ms / 86_400_000).toFixed(1)}d`
}
