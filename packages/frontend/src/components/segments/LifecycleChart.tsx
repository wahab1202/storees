'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Treemap, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { useLifecycleChart } from '@/hooks/useSegments'
import { useSnapshotDates, useTransitions } from '@/hooks/useAnalytics'
import { useDashboardStats } from '@/hooks/useDashboard'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@storees/shared'
import {
  TrendingUp,
  TrendingDown,
  Repeat,
  ShoppingBag,
  DollarSign,
  ArrowRight,
  ArrowLeftRight,
  Clock,
  BarChart3,
} from 'lucide-react'

const TABS = ['RFM Model', 'User Transitions', 'Recency', 'Frequency', 'Monetary'] as const
type Tab = (typeof TABS)[number]

const ROW_LABELS_BY_DOMAIN: Record<string, string[]> = {
  ecommerce: ['Recent (0–30d)', 'Medium (31–90d)', 'Lapsed (90d+)'],
  fintech: ['Active (0–30d)', 'Inactive (31–90d)', 'Dormant (90d+)'],
  saas: ['Active (0–30d)', 'Slipping (31–90d)', 'Churned (90d+)'],
}

const COL_LABELS_BY_DOMAIN: Record<string, string[]> = {
  ecommerce: ['Low Value', 'Medium Value', 'High Value'],
  fintech: ['Low Activity', 'Medium Activity', 'High Activity'],
  saas: ['Free / Trial', 'Starter', 'Pro / Enterprise'],
}

export function LifecycleChart() {
  const { data, isLoading, isError } = useLifecycleChart()
  const { data: statsData } = useDashboardStats()
  const domain = statsData?.data?.domainType ?? 'ecommerce'
  const [activeTab, setActiveTab] = useState<Tab>('RFM Model')

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

  return (
    <div className="bg-white border border-border rounded-xl">
      {/* Header */}
      <div className="px-5 py-3 bg-surface border-b border-border rounded-t-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Customer Lifecycle</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {domain === 'fintech' ? 'Activity analysis — Recency vs. Transaction Volume'
                : domain === 'saas' ? 'Engagement analysis — Recency vs. Plan Value'
                : 'RFM analysis — Recency vs. Monetary Value'}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {(metrics.buyerCount ?? 0) > 0 && (
              <span className="text-text-primary font-semibold">{(metrics.buyerCount ?? 0).toLocaleString()} buyers</span>
            )}
            {(metrics.noPurchaseCount ?? 0) > 0 && (
              <span className="text-text-muted">{(metrics.noPurchaseCount ?? 0).toLocaleString()} contacts (no purchase)</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 border-b border-border bg-surface/50">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-xs font-medium transition-colors relative',
              activeTab === tab ? 'text-accent' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Metrics row — always visible */}
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
          value={formatCurrency(metrics.avgPurchaseValue)}
        />
        <MetricCell
          icon={TrendingUp}
          label="Avg CLV"
          value={formatCurrency(metrics.avgClv)}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'RFM Model' && (
        <RFMGrid segments={segments} domain={domain} />
      )}
      {activeTab === 'User Transitions' && (
        <UserTransitionsTab />
      )}
      {activeTab === 'Recency' && (
        <DistributionTab buckets={data.data.recencyDistribution ?? []} dimension="recency" />
      )}
      {activeTab === 'Frequency' && (
        <DistributionTab buckets={data.data.frequencyDistribution ?? []} dimension="frequency" />
      )}
      {activeTab === 'Monetary' && (
        <DistributionTab buckets={data.data.monetaryDistribution ?? []} dimension="monetary" />
      )}
    </div>
  )
}

// ============ RFM Treemap Tab ============

const RECENCY_KEYS = ['recent', 'medium', 'lapsed'] as const
const VALUE_KEYS = ['low', 'medium', 'high'] as const

type SegmentCell = {
  name: string
  label: string
  percentage: number
  contactCount: number
  position: { row: number; col: number }
  color: string
  retentionTactics: string[]
}

function RFMGrid({ segments, domain }: { segments: SegmentCell[]; domain: string }) {
  const router = useRouter()

  const populated = segments.filter(s => s.contactCount > 0)
  const totalCount = populated.reduce((sum, s) => sum + s.contactCount, 0)

  if (populated.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-text-secondary mb-1">No customers in any RFM segment yet</p>
        <p className="text-xs text-text-muted">Once orders come in, segments will populate automatically.</p>
      </div>
    )
  }

  const data = populated.map(s => ({
    name: s.label,
    size: s.contactCount,
    fill: s.color,
    full: s,
  }))

  function handleClick(cell: SegmentCell) {
    router.push(`/customers?rfm=${RECENCY_KEYS[cell.position.row]}_${VALUE_KEYS[cell.position.col]}`)
  }

  return (
    <div className="p-5">
      <div className="h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            stroke="#fff"
            isAnimationActive={false}
            content={<TreemapCell onCellClick={handleClick} />}
          >
            <RechartsTooltip
              content={<TreemapTooltip totalCount={totalCount} domain={domain} />}
              wrapperStyle={{ outline: 'none', zIndex: 50 }}
              cursor={false}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

type TreemapCellProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  full?: SegmentCell
  fill?: string
  depth?: number
  onCellClick?: (cell: SegmentCell) => void
}

function TreemapCell(props: TreemapCellProps) {
  const { x = 0, y = 0, width = 0, height = 0, full, fill, depth, onCellClick } = props
  if (!full || depth !== 1) return null

  const showLabel = width > 64 && height > 28
  const showCount = width > 72 && height > 60
  const showPercent = width > 90 && height > 80
  const labelClamped = width < 110 ? truncate(full.label, Math.max(6, Math.floor(width / 8))) : full.label

  return (
    <g
      onClick={() => onCellClick?.(full)}
      style={{ cursor: 'pointer' }}
      className="rfm-treemap-cell"
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="#ffffff"
        strokeWidth={2}
        rx={2}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#ffffff"
        fillOpacity={0}
        className="hover:fill-white/10 transition-colors"
      />
      {showLabel && (
        <text
          x={x + 12}
          y={y + 22}
          fill="#ffffff"
          fontSize={12}
          fontWeight={600}
          style={{ pointerEvents: 'none', letterSpacing: '0.01em' }}
        >
          {labelClamped}
        </text>
      )}
      {showCount && (
        <text
          x={x + 12}
          y={y + 46}
          fill="#ffffff"
          fontSize={20}
          fontWeight={700}
          fillOpacity={0.96}
          style={{ pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}
        >
          {formatCompact(full.contactCount)}
        </text>
      )}
      {showPercent && (
        <text
          x={x + 12}
          y={y + 64}
          fill="#ffffff"
          fontSize={11}
          fillOpacity={0.82}
          style={{ pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}
        >
          {full.percentage}% of customers
        </text>
      )}
    </g>
  )
}

type TreemapTooltipProps = {
  active?: boolean
  payload?: Array<{ payload?: { full?: SegmentCell } }>
  totalCount: number
  domain: string
}

function TreemapTooltip({ active, payload, totalCount, domain }: TreemapTooltipProps) {
  if (!active || !payload?.length) return null
  const cell = payload[0]?.payload?.full
  if (!cell) return null

  const ROW_LABELS = ROW_LABELS_BY_DOMAIN[domain] ?? ROW_LABELS_BY_DOMAIN.ecommerce
  const COL_LABELS = COL_LABELS_BY_DOMAIN[domain] ?? COL_LABELS_BY_DOMAIN.ecommerce

  return (
    <div className="bg-white border border-border rounded-lg shadow-xl p-3.5 w-64 text-xs">
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
          style={{ backgroundColor: cell.color }}
        />
        <span className="font-semibold text-text-primary text-[13px]">{cell.label}</span>
      </div>

      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-xl font-bold text-text-primary tabular-nums leading-none">
          {cell.contactCount.toLocaleString()}
        </span>
        <span className="text-text-muted tabular-nums">/ {totalCount.toLocaleString()}</span>
        <span className="ml-auto text-sm font-semibold text-text-primary tabular-nums">
          {cell.percentage}%
        </span>
      </div>

      <div className="space-y-1 mb-3">
        <TooltipRow label="Recency" value={ROW_LABELS[cell.position.row]} />
        <TooltipRow label="Value tier" value={COL_LABELS[cell.position.col]} />
      </div>

      {cell.retentionTactics.length > 0 && (
        <div className="border-t border-border pt-2.5 mb-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1.5">
            Retention tactics
          </p>
          <ul className="space-y-1">
            {cell.retentionTactics.slice(0, 3).map((t, i) => (
              <li key={i} className="text-[11px] text-text-secondary flex items-start gap-1.5 leading-snug">
                <span className="text-text-muted mt-0.5">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-accent text-[11px] font-medium">Click to view customers →</p>
    </div>
  )
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary font-medium">{value}</span>
    </div>
  )
}

function truncate(s: string, max: number) {
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

// ============ User Transitions Tab ============

function UserTransitionsTab() {
  const { data: snapshotDatesData, isLoading: loadingDates } = useSnapshotDates()
  const dates = snapshotDatesData?.data ?? []

  // Auto-select latest two dates
  const period1 = dates.length >= 2 ? dates[dates.length - 2] : ''
  const period2 = dates.length >= 2 ? dates[dates.length - 1] : ''

  const { data: transitionData, isLoading: loadingTransitions } = useTransitions(period1, period2)
  const result = transitionData?.data

  if (loadingDates) {
    return (
      <div className="p-5">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (dates.length < 2) {
    return (
      <div className="p-8 text-center">
        <ArrowLeftRight className="w-8 h-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-secondary mb-1">Need at least 2 snapshots to show transitions</p>
        <p className="text-xs text-text-muted">
          Go to Analytics → Transitions to take snapshots
          {dates.length === 1 && ` (1 snapshot on ${dates[0]})`}
        </p>
      </div>
    )
  }

  if (loadingTransitions) {
    return (
      <div className="p-5">
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (!result || result.transitions.length === 0) {
    return (
      <div className="p-8 text-center">
        <ArrowLeftRight className="w-8 h-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-secondary">No transitions found between {period1} and {period2}</p>
      </div>
    )
  }

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4 text-xs text-text-secondary">
        <Clock className="w-3 h-3" />
        <span>{period1}</span>
        <ArrowRight className="w-3 h-3" />
        <span>{period2}</span>
        <span className="text-text-muted ml-2">({result.totalCustomers.toLocaleString()} customers changed)</span>
      </div>

      {/* Top movements */}
      <div className="space-y-2">
        {result.transitions.slice(0, 8).map((t, i) => {
          const isNegative = t.toSegmentName.toLowerCase().includes('risk')
            || t.toSegmentName.toLowerCase().includes('lost')
            || t.toSegmentName.toLowerCase().includes('dormant')
            || t.toSegmentName.toLowerCase().includes('lapsed')
          const isPositive = t.toSegmentName.toLowerCase().includes('loyal')
            || t.toSegmentName.toLowerCase().includes('champion')
            || t.toSegmentName.toLowerCase().includes('active')

          return (
            <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-surface/50">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isNegative ? (
                  <TrendingDown className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                ) : isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                )}
                <span className="text-xs font-medium text-text-primary truncate">{t.fromSegmentName}</span>
                <ArrowRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                <span className={cn(
                  'text-xs font-medium truncate',
                  isNegative ? 'text-red-600' : isPositive ? 'text-green-600' : 'text-text-primary',
                )}>
                  {t.toSegmentName}
                </span>
              </div>
              <span className="text-sm font-bold text-heading tabular-nums">{t.count.toLocaleString()}</span>
              <span className="text-xs text-text-muted tabular-nums w-12 text-right">{t.percentage}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============ Distribution Tabs (Recency / Frequency / Monetary) ============

// Maps distribution bar labels → rfm query param for customer filtering
const RECENCY_RFM_MAP: Record<string, string> = {
  'Recent (0–30d)': 'recent',
  'Medium (31–90d)': 'medium',
  'Lapsed (90d+)': 'lapsed',
}
const MONETARY_RFM_MAP: Record<string, string> = {
  'Low Value': '_low',
  'Medium Value': '_medium',
  'High Value': '_high',
}

const DIMENSION_COLORS: Record<string, string[]> = {
  recency: ['#10B981', '#F59E0B', '#EF4444'],
  frequency: ['#6366F1', '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE'],
  monetary: ['#94A3B8', '#3B82F6', '#8B5CF6'],
}

function DistributionTab({ buckets: rawBuckets, dimension }: {
  buckets: { label: string; count: number; percentage: number }[]
  dimension: 'recency' | 'frequency' | 'monetary'
}) {
  const router = useRouter()
  const colors = DIMENSION_COLORS[dimension] ?? DIMENSION_COLORS.recency
  const buckets = rawBuckets.map((b, i) => ({ ...b, color: colors[i % colors.length] }))

  const maxCount = Math.max(...buckets.map(b => b.count), 1)
  const totalCount = buckets.reduce((sum, b) => sum + b.count, 0)

  const dimensionLabels = {
    recency: { title: 'Recency Distribution', desc: 'How recently customers have been active', icon: Clock },
    frequency: { title: 'Purchase Frequency', desc: 'Order count distribution across buyers', icon: BarChart3 },
    monetary: { title: 'Monetary Distribution', desc: 'Spending tiers — bottom 50% / middle / top 10% by total spend', icon: DollarSign },
  }

  const { title, desc, icon: Icon } = dimensionLabels[dimension]

  function handleBarClick(label: string) {
    if (dimension === 'recency') {
      const rfm = RECENCY_RFM_MAP[label]
      if (rfm) router.push(`/customers?rfm=${rfm}`)
    } else if (dimension === 'monetary') {
      const rfm = MONETARY_RFM_MAP[label]
      if (rfm) router.push(`/customers?rfm=${rfm}`)
    }
    // Frequency bars don't have a direct rfm mapping
  }

  const isClickable = dimension === 'recency' || dimension === 'monetary'

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-text-muted" />
        <div>
          <h3 className="text-sm font-semibold text-heading">{title}</h3>
          <p className="text-xs text-text-muted">{desc}</p>
        </div>
      </div>

      <div className="space-y-4">
        {buckets.map((bucket, i) => (
          <div
            key={i}
            onClick={() => isClickable && bucket.count > 0 && handleBarClick(bucket.label)}
            className={isClickable && bucket.count > 0 ? 'cursor-pointer group' : ''}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className={cn(
                'text-sm font-medium text-text-primary',
                isClickable && 'group-hover:text-accent transition-colors',
              )}>{bucket.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-heading tabular-nums">{bucket.count.toLocaleString()}</span>
                <span className="text-xs text-text-muted tabular-nums w-10 text-right">{bucket.percentage}%</span>
              </div>
            </div>
            <div className={cn(
              'h-8 bg-gray-100 rounded-lg overflow-hidden relative',
              isClickable && 'group-hover:bg-gray-200 transition-colors',
            )}>
              <div
                className="h-full rounded-lg transition-all"
                style={{
                  width: `${(bucket.count / maxCount) * 100}%`,
                  backgroundColor: bucket.color,
                  opacity: 0.7,
                }}
              />
              <div className="absolute inset-0 flex items-center px-3">
                <span className="text-[10px] font-semibold text-white drop-shadow-sm">
                  {totalCount > 0 ? ((bucket.count / totalCount) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Insights */}
      <div className="mt-5 p-3 bg-surface rounded-lg">
        <p className="text-xs text-text-secondary">
          {dimension === 'recency' && buckets[0]?.percentage > 50
            ? 'Healthy distribution — majority of buyers are recently active.'
            : dimension === 'recency' && buckets[buckets.length - 1]?.percentage > 40
            ? 'Warning — a large portion of buyers have lapsed. Consider re-engagement campaigns.'
            : dimension === 'monetary' && buckets[buckets.length - 1]?.percentage > 30
            ? 'Strong high-value segment. Focus on retention for these top spenders.'
            : dimension === 'monetary' && buckets[0]?.percentage > 60
            ? 'Most buyers are low-value. Explore upsell and cross-sell opportunities.'
            : dimension === 'frequency' && buckets[0]?.percentage > 60
            ? 'Most buyers have only 1 order — focus on repeat purchase incentives.'
            : dimension === 'frequency' && buckets.length > 2 && buckets.slice(2).reduce((s, b) => s + b.percentage, 0) > 30
            ? 'Strong repeat purchase behavior — 30%+ of buyers have 4+ orders.'
            : 'Balanced distribution across segments.'}
        </p>
      </div>
    </div>
  )
}

// ============ Shared Components ============

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
