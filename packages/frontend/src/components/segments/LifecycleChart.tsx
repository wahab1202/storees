'use client'

import { useState } from 'react'
import { useLifecycleChart } from '@/hooks/useSegments'
import { useDashboardStats } from '@/hooks/useDashboard'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { TrendingUp, Repeat, ShoppingBag, DollarSign } from 'lucide-react'

const ROW_LABELS_BY_DOMAIN: Record<string, string[]> = {
  ecommerce: ['Recent (0–30d)', 'Medium (31–90d)', 'Lapsed (90d+)'],
  fintech:   ['Active (0–30d)', 'Inactive (31–90d)', 'Dormant (90d+)'],
  saas:      ['Active (0–30d)', 'Slipping (31–90d)', 'Churned (90d+)'],
}

const COL_LABELS_BY_DOMAIN: Record<string, string[]> = {
  ecommerce: ['Low Value', 'Medium Value', 'High Value'],
  fintech:   ['Low Activity', 'Medium Activity', 'High Activity'],
  saas:      ['Free / Trial', 'Starter', 'Pro / Enterprise'],
}

export function LifecycleChart() {
  const { data, isLoading, isError } = useLifecycleChart()
  const { data: statsData } = useDashboardStats()
  const domain = statsData?.data.domainType ?? 'ecommerce'
  const ROW_LABELS = ROW_LABELS_BY_DOMAIN[domain] ?? ROW_LABELS_BY_DOMAIN.ecommerce
  const COL_LABELS = COL_LABELS_BY_DOMAIN[domain] ?? COL_LABELS_BY_DOMAIN.ecommerce
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="bg-white border border-border rounded-xl p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data?.data) return null

  const { segments, metrics } = data.data

  // Build grid lookup
  const gridMap = new Map(segments.map(s => [`${s.position.row}_${s.position.col}`, s]))

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 bg-surface border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">Customer Lifecycle</h2>
        <p className="text-xs text-text-muted mt-0.5">
          {domain === 'fintech' ? 'Activity analysis — Recency vs. Transaction Volume'
            : domain === 'saas' ? 'Engagement analysis — Recency vs. Plan Value'
            : 'RFM analysis — Recency vs. Monetary Value'}
        </p>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-px bg-border border-b border-border">
        <MetricCell
          icon={Repeat}
          label={domain === 'saas' ? 'Returning %' : domain === 'fintech' ? 'Active %' : 'Returning %'}
          value={`${metrics.returningCustomerPercentage}%`}
        />
        <MetricCell
          icon={ShoppingBag}
          label={domain === 'saas' ? 'Avg Usage' : domain === 'fintech' ? 'Avg Txn Freq' : 'Avg Frequency'}
          value={`${metrics.avgPurchaseFrequency}x`}
        />
        <MetricCell
          icon={DollarSign}
          label={domain === 'fintech' ? 'Avg Txn Value' : domain === 'saas' ? 'Avg MRR' : 'Avg Order Value'}
          value={`${metrics.avgPurchaseValue.toLocaleString()}`}
        />
        <MetricCell
          icon={TrendingUp}
          label="Avg CLV"
          value={`${metrics.avgClv.toLocaleString()}`}
        />
      </div>

      {/* Grid */}
      <div className="p-5">
        {/* Column headers */}
        <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2 mb-2">
          <div />
          {COL_LABELS.map(label => (
            <div key={label} className="text-center text-[11px] font-medium text-text-muted uppercase tracking-wide">
              {label}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {[0, 1, 2].map(row => (
          <div key={row} className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2 mb-2">
            {/* Row label */}
            <div className="flex items-center justify-end pr-2">
              <span className="text-[11px] font-medium text-text-muted text-right leading-tight">
                {ROW_LABELS[row]}
              </span>
            </div>

            {/* Cells */}
            {[0, 1, 2].map(col => {
              const cell = gridMap.get(`${row}_${col}`)
              if (!cell) return <div key={col} className="h-24 rounded-lg bg-surface" />

              const isHovered = hoveredCell === cell.name

              return (
                <div
                  key={col}
                  onMouseEnter={() => setHoveredCell(cell.name)}
                  onMouseLeave={() => setHoveredCell(null)}
                  className={cn(
                    'relative h-24 rounded-lg border transition-all cursor-default p-3 flex flex-col justify-between',
                    isHovered ? 'border-heading shadow-md scale-[1.02]' : 'border-border',
                  )}
                  style={{ backgroundColor: `${cell.color}15` }}
                >
                  {/* Color indicator */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
                    style={{ backgroundColor: cell.color }}
                  />

                  <div>
                    <p className="text-xs font-semibold text-text-primary leading-tight">{cell.label}</p>
                    <p className="text-lg font-bold text-text-primary tabular-nums mt-0.5">
                      {cell.contactCount}
                    </p>
                  </div>

                  <p className="text-[11px] text-text-muted tabular-nums">
                    {cell.percentage}%
                  </p>

                  {/* Hover tooltip */}
                  {isHovered && cell.retentionTactics.length > 0 && (
                    <div className="absolute z-20 left-0 top-full mt-1 w-56 bg-heading text-white rounded-lg shadow-xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70 mb-1.5">
                        Retention Tactics
                      </p>
                      <ul className="space-y-1">
                        {cell.retentionTactics.map((tactic, i) => (
                          <li key={i} className="text-xs text-white/90 flex items-start gap-1.5">
                            <span className="text-white/40 mt-0.5">•</span>
                            {tactic}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCell({ icon: Icon, label, value }: { icon: typeof TrendingUp; label: string; value: string }) {
  return (
    <div className="bg-white p-3 flex items-center gap-3">
      <div className="p-2 bg-surface rounded-lg">
        <Icon className="h-4 w-4 text-text-muted" />
      </div>
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm font-semibold text-text-primary tabular-nums">{value}</p>
      </div>
    </div>
  )
}
