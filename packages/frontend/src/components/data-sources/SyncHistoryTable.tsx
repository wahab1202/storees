'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useSyncHistory, useSyncLogs, type SyncRun } from '@/hooks/useDataConnectors'

type Props = {
  connectorId: string
  projectId: string
}

export function SyncHistoryTable({ connectorId, projectId }: Props) {
  const { data: historyRes, isLoading } = useSyncHistory(connectorId, projectId)
  const runs: SyncRun[] = historyRes?.data ?? []
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) {
    return <div className="text-sm text-text-muted py-6 text-center">Loading sync history…</div>
  }

  if (runs.length === 0) {
    return (
      <div className="text-sm text-text-muted py-6 text-center border border-dashed border-border rounded-lg">
        No syncs yet — press <strong>Sync Now</strong> on the connector card to trigger the first one.
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface text-text-muted text-xs font-medium uppercase tracking-wider">
          <tr>
            <th className="py-2.5 px-3 text-left w-8"></th>
            <th className="py-2.5 px-3 text-left">When</th>
            <th className="py-2.5 px-3 text-left">Kind</th>
            <th className="py-2.5 px-3 text-left">Status</th>
            <th className="py-2.5 px-3 text-right">Customers</th>
            <th className="py-2.5 px-3 text-right">Products</th>
            <th className="py-2.5 px-3 text-right">Orders</th>
            <th className="py-2.5 px-3 text-right">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {runs.map((run) => {
            const expanded = expandedId === run.id
            return (
              <RunRow
                key={run.id}
                run={run}
                projectId={projectId}
                expanded={expanded}
                onToggle={() => setExpandedId(expanded ? null : run.id)}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RunRow({ run, projectId, expanded, onToggle }: { run: SyncRun; projectId: string; expanded: boolean; onToggle: () => void }) {
  const c = run.stats.customers
  const p = run.stats.products
  const o = run.stats.orders
  const durationMs =
    run.startedAt && run.finishedAt
      ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
      : run.startedAt
        ? Date.now() - new Date(run.startedAt).getTime()
        : null

  return (
    <>
      <tr className="cursor-pointer hover:bg-surface" onClick={onToggle}>
        <td className="py-2.5 px-3 text-text-muted">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="py-2.5 px-3 text-text-primary">{new Date(run.createdAt).toLocaleString()}</td>
        <td className="py-2.5 px-3">
          <span className="text-xs px-1.5 py-0.5 rounded bg-surface text-text-muted">{run.kind}</span>
        </td>
        <td className="py-2.5 px-3"><StatusBadge status={run.status} /></td>
        <td className="py-2.5 px-3 text-right font-mono text-xs">{formatStat(c)}</td>
        <td className="py-2.5 px-3 text-right font-mono text-xs">{formatStat(p)}</td>
        <td className="py-2.5 px-3 text-right font-mono text-xs">{formatStat(o)}</td>
        <td className="py-2.5 px-3 text-right text-xs text-text-muted">{formatDuration(durationMs)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-surface px-6 py-4">
            {run.errorSummary && (
              <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">
                <AlertCircle className="inline h-3 w-3 mr-1" />
                {run.errorSummary}
              </div>
            )}
            <SyncLogsView syncId={run.id} projectId={projectId} />
          </td>
        </tr>
      )}
    </>
  )
}

function SyncLogsView({ syncId, projectId }: { syncId: string; projectId: string }) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all')
  const { data: logsRes, isLoading } = useSyncLogs(
    syncId,
    projectId,
    filter === 'all' ? undefined : filter,
  )
  const logs = logsRes?.data ?? []

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-text-muted">Logs:</span>
        {(['all', 'error', 'warn'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2 py-0.5 rounded ${
              filter === f ? 'bg-text-primary text-white' : 'bg-white border border-border text-text-muted'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="text-xs text-text-muted">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="text-xs text-text-muted py-2">No log entries match this filter.</div>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded border border-border bg-white">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-border">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="py-1.5 px-2 w-16">
                    <span className={`text-xs ${l.level === 'error' ? 'text-red-700' : l.level === 'warn' ? 'text-amber-700' : 'text-text-muted'}`}>
                      {l.level}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 w-20 text-text-muted">{l.entityType ?? '—'}</td>
                  <td className="py-1.5 px-2 w-32 text-text-muted truncate max-w-[8rem]" title={l.entityId ?? ''}>{l.entityId ?? '—'}</td>
                  <td className="py-1.5 px-2 text-text-primary">{l.message}</td>
                  <td className="py-1.5 px-2 w-32 text-text-muted whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: SyncRun['status'] }) {
  const config = {
    queued: { icon: Clock, color: 'text-text-muted bg-surface', label: 'Queued' },
    running: { icon: Clock, color: 'text-blue-700 bg-blue-50', label: 'Running' },
    success: { icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50', label: 'Success' },
    partial: { icon: AlertCircle, color: 'text-amber-700 bg-amber-50', label: 'Partial' },
    failed: { icon: XCircle, color: 'text-red-700 bg-red-50', label: 'Failed' },
    cancelled: { icon: XCircle, color: 'text-text-muted bg-surface', label: 'Cancelled' },
  }[status]

  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}

function formatStat(s?: { fetched: number; imported: number; failed: number }) {
  if (!s) return '—'
  if (s.failed > 0) return `${s.imported}/${s.fetched} (${s.failed}✗)`
  return `${s.imported}/${s.fetched}`
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}
