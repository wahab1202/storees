'use client'

import { useState } from 'react'
import { ABANDONMENT_REASONS } from '@storees/shared'
import type { AbandonmentInstance } from '@storees/shared'
import { useAbandonments, useSaveAbandonmentReason } from '@/hooks/useAbandonments'
import { cn } from '@/lib/utils'
import { Loader2, ShoppingCart, CheckCircle2, ExternalLink, Lightbulb } from 'lucide-react'

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) } catch { return s }
}
function fmtMoney(n: number | null | undefined): string | null {
  if (n == null) return null
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n) } catch { return `₹${Math.round(n)}` }
}

export function AbandonmentTab({ customerId }: { customerId: string }) {
  const { data, isLoading } = useAbandonments(customerId)
  const summary = data?.success ? data.data : null

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-text-muted p-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }
  if (!summary || summary.total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 text-center p-12 text-text-muted">
        <ShoppingCart className="h-6 w-6" />
        <div className="text-sm text-text-primary font-medium">No abandoned carts</div>
        <p className="text-xs max-w-sm">This customer hasn&apos;t abandoned a checkout. Abandonments appear here from the <code className="text-[10px]">checkout_abandoned</code> event, with the products they browsed and a place to record why.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-white border border-border rounded-xl p-4">
        <div>
          <div className="text-2xl font-semibold text-text-primary tabular-nums">{summary.total}</div>
          <div className="text-[11px] text-text-muted">Total abandonments</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-green-600 tabular-nums">{summary.recovered}</div>
          <div className="text-[11px] text-text-muted">Later recovered</div>
        </div>
        {summary.latestLikelyReason && (
          <div className="flex-1 min-w-[200px] flex items-start gap-2 text-xs text-text-secondary bg-surface/50 rounded-lg px-3 py-2">
            <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
            <span><span className="font-medium">Likely (inferred):</span> {summary.latestLikelyReason}</span>
          </div>
        )}
      </div>

      {summary.instances.map(inst => (
        <AbandonmentCard key={inst.eventId} customerId={customerId} inst={inst} />
      ))}
    </div>
  )
}

function AbandonmentCard({ customerId, inst }: { customerId: string; inst: AbandonmentInstance }) {
  const save = useSaveAbandonmentReason(customerId)
  const [reason, setReason] = useState(inst.note?.reason ?? '')
  const [remarks, setRemarks] = useState(inst.note?.remarks ?? '')
  const [saved, setSaved] = useState(false)

  async function onSave() {
    setSaved(false)
    const resp = await save.mutateAsync({ eventId: inst.eventId, reason, remarks: remarks || undefined })
    if (resp.success) setSaved(true)
  }

  const price = fmtMoney(inst.cart.totalPrice)

  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-text-primary">Abandoned {fmtDate(inst.abandonedAt)}</div>
        {inst.recovered ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 bg-green-500/10 px-2 py-0.5 rounded">
            <CheckCircle2 className="h-3.5 w-3.5" /> Recovered
          </span>
        ) : (
          <span className="text-[11px] font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded">Open</span>
        )}
      </div>

      {/* Cart */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
        {inst.cart.productDetails && <span className="text-text-primary">{inst.cart.productDetails}</span>}
        {price && <span>{price}</span>}
        {inst.cart.itemCount != null && <span>{inst.cart.itemCount} item{inst.cart.itemCount === 1 ? '' : 's'}</span>}
        {inst.cart.recoveryUrl && (
          <a href={inst.cart.recoveryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
            Recovery link <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Products browsed before */}
      {inst.productsBefore.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-text-muted mb-1.5">Browsed before abandoning</div>
          <div className="flex flex-wrap gap-1.5">
            {inst.productsBefore.map(p => (
              <span key={p.productId} className="text-[11px] bg-surface border border-border rounded px-2 py-0.5 text-text-secondary">{p.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Reason capture */}
      <div className="border-t border-border pt-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Reason (after calling)</label>
            <select
              value={reason}
              onChange={e => { setReason(e.target.value); setSaved(false) }}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            >
              <option value="">Select a reason…</option>
              {ABANDONMENT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Remarks</label>
            <input
              value={remarks}
              onChange={e => { setRemarks(e.target.value); setSaved(false) }}
              placeholder="What the customer said…"
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onSave}
            disabled={save.isPending || !reason}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save reason
          </button>
          {saved && <span className="text-xs text-green-600">Saved</span>}
          {inst.note?.markedByName && !saved && (
            <span className="text-[11px] text-text-muted">Recorded by {inst.note.markedByName}</span>
          )}
        </div>
      </div>
    </div>
  )
}
