'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'

type RecalcResult = { updated: number; message: string }
type BackfillResult = { materialized: number; updated: number; message: string }

/**
 * Admin data-maintenance actions. "Recalculate aggregates" rebuilds every
 * customer's order count / total spend / CLV from the authoritative orders
 * table and re-evaluates segments — the fix when a customer's summary card
 * drifts from their actual Orders tab (stale cached aggregate). A nightly job
 * does this automatically; this button is the on-demand version.
 */
export function DataMaintenance() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [backfillBusy, setBackfillBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refreshViews() {
    qc.invalidateQueries({ queryKey: ['customers'] })
    qc.invalidateQueries({ queryKey: ['customer'] })
    qc.invalidateQueries({ queryKey: ['segments'] })
  }

  async function recalc() {
    setBusy(true); setError(null); setResult(null)
    try {
      const resp = await api.post<RecalcResult>(withProject('/api/customers/recalculate'), {})
      if (!resp.success || !resp.data) { setError(resp.error ?? 'Recalculation failed'); return }
      setResult(resp.data.message ?? `Recalculated ${resp.data.updated} customers`)
      refreshViews()
    } catch {
      setError('Recalculation failed')
    } finally {
      setBusy(false)
    }
  }

  async function backfillOrders() {
    setBackfillBusy(true); setError(null); setResult(null)
    try {
      const resp = await api.post<BackfillResult>(withProject('/api/customers/backfill-orders'), {})
      if (!resp.success || !resp.data) { setError(resp.error ?? 'Order backfill failed'); return }
      setResult(resp.data.message ?? `Materialised ${resp.data.materialized} orders`)
      refreshViews()
    } catch {
      setError('Order backfill failed')
    } finally {
      setBackfillBusy(false)
    }
  }

  return (
    <div className="bg-surface-elevated border border-border rounded-lg p-6">
      <h3 className="font-semibold text-text-primary mb-1">Data maintenance</h3>
      <p className="text-sm text-text-secondary mb-4">
        <span className="font-medium">Recalculate</span> rebuilds every customer&apos;s order count,
        spend, and CLV, then re-evaluates segments (runs nightly too).
        <span className="font-medium"> Materialise event-only orders</span> turns historical /
        connector orders that only exist as events into real order rows — a one-time fix so
        segments, metrics, and exports stop undercounting. Both are safe to re-run.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={recalc}
          disabled={busy || backfillBusy}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-primary hover:bg-surface disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {busy ? 'Recalculating…' : 'Recalculate customer aggregates'}
        </button>
        <button
          onClick={backfillOrders}
          disabled={busy || backfillBusy}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-primary hover:bg-surface disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          {backfillBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {backfillBusy ? 'Materialising…' : 'Materialise event-only orders'}
        </button>
        {result && (
          <span className="text-xs text-green-600 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> {result}
          </span>
        )}
        {error && (
          <span className="text-xs text-red-600 inline-flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5" /> {error}
          </span>
        )}
      </div>
    </div>
  )
}
