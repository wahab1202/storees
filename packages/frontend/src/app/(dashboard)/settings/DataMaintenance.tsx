'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'

type RecalcResult = { updated: number; message: string }

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
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function recalc() {
    setBusy(true); setError(null); setResult(null)
    try {
      const resp = await api.post<RecalcResult>(withProject('/api/customers/recalculate'), {})
      if (!resp.success || !resp.data) { setError(resp.error ?? 'Recalculation failed'); return }
      setResult(resp.data.message ?? `Recalculated ${resp.data.updated} customers`)
      // Refresh any customer/segment views so the corrected numbers show.
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer'] })
      qc.invalidateQueries({ queryKey: ['segments'] })
    } catch {
      setError('Recalculation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-elevated border border-border rounded-lg p-6">
      <h3 className="font-semibold text-text-primary mb-1">Data maintenance</h3>
      <p className="text-sm text-text-secondary mb-4">
        Rebuild every customer&apos;s order count, total spend, and CLV from the orders table,
        then re-evaluate segments. Use this if a customer&apos;s summary looks out of sync with
        their Orders tab. Runs automatically every night.
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={recalc}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-primary hover:bg-surface disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {busy ? 'Recalculating…' : 'Recalculate customer aggregates'}
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
