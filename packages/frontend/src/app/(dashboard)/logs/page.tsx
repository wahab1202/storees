'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, ScrollText, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useNotificationLogs,
  useNotificationLogSummary,
  type NotificationLog,
} from '@/hooks/useNotificationLogs'

const CHANNELS = ['', 'whatsapp', 'email', 'sms', 'push', 'inapp']
const STATUSES = ['', 'queued', 'sent', 'delivered', 'read', 'clicked', 'failed', 'blocked']
const SOURCES = ['', 'campaign', 'flow', 'transactional']

// Status → badge styling. delivered/read/clicked = good, failed = bad, blocked = warn.
function statusClass(status: string): string {
  if (['delivered', 'read', 'clicked'].includes(status)) return 'bg-green-50 text-green-700 border-green-200'
  if (status === 'sent') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  if (status === 'failed') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'blocked') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

const BLOCK_LABELS: Record<string, string> = {
  frequency_capped: 'Frequency cap reached',
  consent_blocked: 'No marketing consent',
  no_channel_reachability: 'Not reachable on channel',
  user_inactive: 'User inactive',
}

function recipient(r: NotificationLog): string {
  return r.customerName || r.customerEmail || r.customerPhone || '—'
}

function source(r: NotificationLog): { label: string; href?: string } {
  if (r.campaignId) return { label: r.campaignName || 'Campaign', href: `/campaigns/${r.campaignId}` }
  if (r.flowTripId) return { label: r.flowName || 'Flow', href: '/flows' }
  return { label: 'Transactional' }
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NotificationLogsPage() {
  const [channel, setChannel] = useState('')
  const [status, setStatus] = useState('')
  const [src, setSrc] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filters = { channel, status, source: src, search, page, pageSize: 25 }
  const { data, isLoading, isError } = useNotificationLogs(filters)
  const { data: summary } = useNotificationLogSummary({ channel, source: src, search })

  const rows = data?.data ?? []
  const pagination = data?.pagination
  const counts = summary?.data?.byStatus ?? {}
  const totalAll = summary?.data?.total ?? 0

  const stats: Array<{ label: string; value: number; tone: string }> = [
    { label: 'Total', value: totalAll, tone: 'text-text-primary' },
    { label: 'Delivered', value: counts.delivered ?? 0, tone: 'text-green-600' },
    { label: 'Read', value: counts.read ?? 0, tone: 'text-green-600' },
    { label: 'Clicked', value: counts.clicked ?? 0, tone: 'text-green-600' },
    { label: 'Failed', value: counts.failed ?? 0, tone: 'text-red-600' },
    { label: 'Blocked', value: counts.blocked ?? 0, tone: 'text-amber-600' },
  ]

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1) }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <ScrollText className="h-5 w-5 text-text-muted" />
        <h1 className="text-xl font-semibold text-text-primary">Notification Logs</h1>
      </div>
      <p className="-mt-3 text-sm text-text-secondary">
        Every notification sent across channels — delivery, read, click, failure, and block reasons.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-white p-3">
            <div className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">{s.label}</div>
            <div className={cn('mt-1 text-xl font-semibold tabular-nums', s.tone)}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => resetPage(setSearch)(e.target.value)}
            placeholder="Search recipient…"
            className="h-9 w-56 rounded-lg border border-border pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <Select value={channel} onChange={resetPage(setChannel)} options={CHANNELS} allLabel="All channels" />
        <Select value={status} onChange={resetPage(setStatus)} options={STATUSES} allLabel="All statuses" />
        <Select value={src} onChange={resetPage(setSrc)} options={SOURCES} allLabel="All sources" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2.5 font-semibold">Time</th>
              <th className="px-4 py-2.5 font-semibold">Channel</th>
              <th className="px-4 py-2.5 font-semibold">Recipient</th>
              <th className="px-4 py-2.5 font-semibold">Source</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td></tr>
            )}
            {isError && !isLoading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-red-600">Failed to load logs.</td></tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">No notifications match these filters.</td></tr>
            )}
            {rows.map(r => {
              const s = source(r)
              const reason = r.failureReason || (r.blockReason ? (BLOCK_LABELS[r.blockReason] ?? r.blockReason) : '')
              return (
                <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-surface/50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{fmtTime(r.createdAt)}</td>
                  <td className="px-4 py-2.5 capitalize text-text-primary">{r.channel}</td>
                  <td className="px-4 py-2.5 text-text-primary">{recipient(r)}</td>
                  <td className="px-4 py-2.5">
                    {s.href
                      ? <Link href={s.href} className="text-accent hover:underline">{s.label}</Link>
                      : <span className="text-text-secondary">{s.label}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize', statusClass(r.status))}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary max-w-[280px] truncate" title={reason}>{reason || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total.toLocaleString()} total</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-surface"
            >Previous</button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-surface"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Select({ value, onChange, options, allLabel }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  allLabel: string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-9 rounded-lg border border-border bg-white px-3 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-accent/20"
    >
      {options.map(o => <option key={o} value={o}>{o === '' ? allLabel : o}</option>)}
    </select>
  )
}
