'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { cn } from '@/lib/utils'
import { BarChart3, Loader2 } from 'lucide-react'
import type { WhatsappUsageSummary, WhatsappUsageCategory } from '@storees/shared'

const RANGES = [7, 30, 90] as const

// Category → tile accent (semantic, light + subtle). marketing = accent (paid
// promo), utility = sky, authentication = amber, service = emerald (free).
const CATS: Array<{ key: WhatsappUsageCategory; label: string; dot: string }> = [
  { key: 'marketing', label: 'Marketing', dot: 'bg-accent' },
  { key: 'utility', label: 'Utility', dot: 'bg-sky-500' },
  { key: 'authentication', label: 'Authentication', dot: 'bg-amber-500' },
  { key: 'service', label: 'Service', dot: 'bg-emerald-500' },
]

function formatMoney(amount: number, currency: string): string {
  // Stored in the smallest currency unit (paise/cents).
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`
  }
}

/**
 * WhatsApp usage — billable conversations by category (Meta bills per 24h
 * conversation, not per message). Renders on the WhatsApp settings for any
 * connected provider; zeros until conversations are metered from the webhook.
 */
export function WhatsappUsage() {
  const [days, setDays] = useState<number>(30)
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-usage', days],
    queryFn: () => api.get<WhatsappUsageSummary>(withProject(`/api/whatsapp/usage?days=${days}`)),
    staleTime: 60_000,
  })
  const summary = data?.success ? data.data : null

  return (
    <div className="mt-4 rounded-lg border border-border bg-white">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">WhatsApp Usage</span>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                days === r ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {CATS.map(c => (
                <div key={c.key} className="rounded-lg border border-border bg-surface/40 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={cn('w-2 h-2 rounded-full', c.dot)} />
                    <span className="text-[11px] font-medium text-text-secondary">{c.label}</span>
                  </div>
                  <div className="text-xl font-semibold text-text-primary tabular-nums">
                    {(summary?.byCategory?.[c.key] ?? 0).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-text-secondary">
                <span className="font-semibold text-text-primary tabular-nums">{(summary?.totalConversations ?? 0).toLocaleString()}</span> billable conversations
              </span>
              {summary?.estimatedCost && (
                <span className="text-text-secondary">
                  Est. spend <span className="font-semibold text-text-primary">{formatMoney(summary.estimatedCost.amount, summary.estimatedCost.currency)}</span>
                </span>
              )}
            </div>

            <p className="text-[11px] text-text-muted">
              Meta bills per <span className="font-medium">conversation</span> (a 24-hour window), categorised by Meta — not per message.
              {!summary?.estimatedCost && ' Set WA_RATE_* env vars to show an estimated spend.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
