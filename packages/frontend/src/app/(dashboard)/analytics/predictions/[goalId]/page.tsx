'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { usePredictionGoal, useGoalCustomers } from '@/hooks/usePredictions'
import {
  ArrowLeft,
  Brain,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Clock,
  AlertTriangle,
} from 'lucide-react'

// Goal type determines label semantics:
// - conversion/purchase = positive (high score is good)
// - churn/dormancy = risk (high score is dangerous)
// - cart abandonment = action (high score = likely to abandon)
type BucketStyle = { label: string; color: string; ring: string; bar: string }
type GoalType = 'positive' | 'risk' | 'abandonment'

const GOAL_BUCKETS: Record<GoalType, Record<string, BucketStyle>> = {
  positive: {
    high: { label: 'Likely', color: 'bg-green-100 text-green-700', ring: 'ring-green-200', bar: 'bg-green-500' },
    medium: { label: 'Possible', color: 'bg-amber-100 text-amber-700', ring: 'ring-amber-200', bar: 'bg-amber-500' },
    low: { label: 'Unlikely', color: 'bg-gray-100 text-gray-600', ring: 'ring-gray-200', bar: 'bg-gray-400' },
  },
  risk: {
    high: { label: 'High Risk', color: 'bg-red-100 text-red-700', ring: 'ring-red-200', bar: 'bg-red-500' },
    medium: { label: 'Medium Risk', color: 'bg-amber-100 text-amber-700', ring: 'ring-amber-200', bar: 'bg-amber-500' },
    low: { label: 'Low Risk', color: 'bg-green-100 text-green-700', ring: 'ring-green-200', bar: 'bg-green-500' },
  },
  abandonment: {
    high: { label: 'Likely to Abandon', color: 'bg-red-100 text-red-700', ring: 'ring-red-200', bar: 'bg-red-500' },
    medium: { label: 'May Abandon', color: 'bg-amber-100 text-amber-700', ring: 'ring-amber-200', bar: 'bg-amber-500' },
    low: { label: 'Unlikely to Abandon', color: 'bg-green-100 text-green-700', ring: 'ring-green-200', bar: 'bg-green-500' },
  },
}

function getGoalType(name: string): GoalType {
  const n = name.toLowerCase()
  // Abandonment patterns
  if (n.includes('abandon') || n.includes('cart abandon')) return 'abandonment'
  // Positive/conversion patterns (ecommerce, fintech, saas)
  if (n.includes('conversion') || n.includes('purchase') || n.includes('order')
    || n.includes('propensity') || n.includes('repeat')
    || n.includes('loan conversion') || n.includes('cross-sell')
    || n.includes('trial to paid') || n.includes('expansion') || n.includes('upgrade')
    || n.includes('top-up') || n.includes('feature adoption')
    || n.includes('pre-closure')) return 'positive'
  // Everything else is risk (churn, dormancy, default, expiration)
  return 'risk'
}

function getBucketConfig(goalName: string) {
  return GOAL_BUCKETS[getGoalType(goalName)]
}

function getBucketCardLabel(goalName: string, bucket: string) {
  const type = getGoalType(goalName)
  const n = goalName.toLowerCase()

  if (type === 'positive') {
    // Domain-specific positive labels
    if (n.includes('loan')) {
      if (bucket === 'high') return 'Likely to Convert'
      if (bucket === 'medium') return 'Considering'
      return 'Unlikely'
    }
    if (n.includes('trial')) {
      if (bucket === 'high') return 'Likely to Subscribe'
      if (bucket === 'medium') return 'On the Fence'
      return 'Unlikely'
    }
    if (bucket === 'high') return 'Likely to Convert'
    if (bucket === 'medium') return 'On the Fence'
    return 'Unlikely to Convert'
  }
  if (type === 'abandonment') {
    if (bucket === 'high') return 'Likely to Abandon'
    if (bucket === 'medium') return 'May Abandon'
    return 'Unlikely to Abandon'
  }
  // risk (churn, dormancy, EMI default, trial expiration)
  if (n.includes('emi') || n.includes('default')) {
    if (bucket === 'high') return 'High Default Risk'
    if (bucket === 'medium') return 'Medium Default Risk'
    return 'Low Default Risk'
  }
  if (n.includes('dormancy') || n.includes('dormant')) {
    if (bucket === 'high') return 'Likely Dormant'
    if (bucket === 'medium') return 'At Risk'
    return 'Active'
  }
  if (bucket === 'high') return 'High Risk'
  if (bucket === 'medium') return 'Medium Risk'
  return 'Low Risk'
}

function getColumnHeader(goalName: string): string {
  const type = getGoalType(goalName)
  const n = goalName.toLowerCase()
  if (type === 'positive') return 'Likelihood'
  if (type === 'abandonment') return 'Abandon Risk'
  if (n.includes('emi') || n.includes('default')) return 'Default Risk'
  if (n.includes('dormancy') || n.includes('dormant')) return 'Dormancy Risk'
  return 'Risk Level'
}

function isReorderGoal(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('repeat') || n.includes('reorder')
}

export default function PredictionDetailPage() {
  const { goalId } = useParams<{ goalId: string }>()
  const router = useRouter()
  const [bucket, setBucket] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)

  const { data: goalData, isLoading: goalLoading } = usePredictionGoal(goalId)
  const goal = goalData?.data

  const { data: customersData, isLoading: customersLoading } = useGoalCustomers(goalId, {
    bucket,
    page,
    pageSize: 25,
  })

  // api.get returns the full JSON: { success, data, stats, pagination }
  // TanStack Query puts this in customersData
  const raw = customersData as any
  const customers = raw?.data ?? []
  const stats = raw?.stats ?? { total: 0, avgScore: 0, buckets: { high: 0, medium: 0, low: 0 } }
  const pagination = raw?.pagination ?? { page: 1, pageSize: 25, total: 0, totalPages: 0 }

  const isLoading = goalLoading || customersLoading
  const goalName = goal?.name ?? ''
  const bucketConfig = getBucketConfig(goalName)
  const isReorder = isReorderGoal(goalName)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/analytics/predictions')}
          className="p-1.5 hover:bg-surface rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-text-muted" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-heading">{goal?.name ?? 'Prediction'}</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {goal ? `Target: ${goal.targetEvent} · ${goal.observationWindowDays}d observation · ${goal.predictionWindowDays}d prediction` : ''}
          </p>
        </div>
        {goal?.currentMetric && (() => {
          const auc = Number(goal.currentMetric)
          const targetLower = (goal.targetEvent ?? '').toLowerCase()
          const nameLower = (goal.name ?? '').toLowerCase()
          const isBehavior = ['dormancy', 'dormant', 'churn', 'cancel', 'default', 'missed', 'expired', 'abandon'].some(
            k => targetLower.includes(k) || nameLower.includes(k)
          )
          const typeLabel = isBehavior ? 'Behavior-Based' : auc >= 0.95 ? 'Cycle-Based' : null
          const typeColor = isBehavior ? 'text-emerald-600' : 'text-violet-600'
          const hint = isBehavior ? 'Engagement patterns'
            : auc >= 0.95 ? 'Recurring order patterns'
            : null
          return (
            <div className="text-right">
              <div className="text-xs text-text-muted">Model Quality</div>
              <div className="text-lg font-bold text-heading">
                {(auc * 100).toFixed(1)}%
                <span className="text-xs font-normal text-text-secondary ml-1">AUC</span>
              </div>
              {typeLabel && (
                <div className={cn('text-[10px] mt-0.5 font-medium', typeColor)}>
                  {typeLabel}{hint ? ` · ${hint}` : ''}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-muted">Total Scored</span>
          </div>
          <div className="text-2xl font-bold text-heading">{stats.total.toLocaleString()}</div>
        </div>
        {(['high', 'medium', 'low'] as const).map(b => {
          const cfg = bucketConfig[b]
          const count = stats.buckets[b] ?? 0
          const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0'
          return (
            <button
              key={b}
              onClick={() => {
                setBucket(bucket === b ? undefined : b)
                setPage(1)
              }}
              className={cn(
                'bg-white border rounded-xl p-4 text-left transition-all',
                bucket === b ? 'border-accent shadow-sm' : 'border-border hover:border-accent/30',
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('w-2 h-2 rounded-full', cfg.bar)} />
                <span className="text-xs text-text-muted">{getBucketCardLabel(goalName, b)}</span>
                {bucket === b && <span className="text-[10px] text-accent font-medium ml-auto">Filtered</span>}
              </div>
              <div className="text-2xl font-bold text-heading">{count.toLocaleString()}</div>
              <div className="text-xs text-text-secondary">{pct}%</div>
            </button>
          )
        })}
      </div>

      {/* Distribution Bar */}
      {stats.total > 0 && (
        <div className="bg-white border border-border rounded-xl p-4 mb-6">
          <div className="text-xs font-medium text-text-muted mb-2">Score Distribution</div>
          <div className="flex h-4 rounded-full overflow-hidden">
            {(['high', 'medium', 'low'] as const).map(b => {
              const count = stats.buckets[b] ?? 0
              const pct = (count / stats.total) * 100
              if (pct === 0) return null
              return (
                <div
                  key={b}
                  className={cn(bucketConfig[b].bar, 'transition-all')}
                  style={{ width: `${pct}%` }}
                  title={`${bucketConfig[b].label}: ${count} (${pct.toFixed(1)}%)`}
                />
              )
            })}
          </div>
          <div className="flex justify-between mt-1.5">
            {(['high', 'medium', 'low'] as const).map(b => (
              <span key={b} className="text-[10px] text-text-muted">
                {bucketConfig[b].label}: {((stats.buckets[b] / stats.total) * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timing Distribution (reorder goals only) */}
      {isReorder && customers.length > 0 && (() => {
        const timingBuckets: Record<string, number> = { 'overdue': 0, '0-3d': 0, '3-7d': 0, '7-14d': 0, '14d+': 0, 'n/a': 0 }
        for (const c of customers as any[]) {
          if (c.factors?.days_overdue > 0) timingBuckets['overdue']++
          else if (c.factors?.timing_bucket) timingBuckets[c.factors.timing_bucket]++
          else timingBuckets['n/a']++
        }
        const total = customers.length
        const colors: Record<string, string> = {
          'overdue': 'bg-red-500', '0-3d': 'bg-orange-400', '3-7d': 'bg-amber-400',
          '7-14d': 'bg-blue-400', '14d+': 'bg-gray-400', 'n/a': 'bg-gray-200',
        }
        return (
          <div className="bg-white border border-border rounded-xl p-4 mb-6">
            <div className="text-xs font-medium text-text-muted mb-2">Reorder Timing Distribution</div>
            <div className="flex h-4 rounded-full overflow-hidden">
              {Object.entries(timingBuckets).map(([key, count]) => {
                const pct = (count / total) * 100
                if (pct === 0) return null
                return <div key={key} className={cn(colors[key], 'transition-all')} style={{ width: `${pct}%` }} title={`${key}: ${count}`} />
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-1.5">
              {Object.entries(timingBuckets).filter(([, c]) => c > 0).map(([key, count]) => (
                <span key={key} className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                  <span className={cn('w-2 h-2 rounded-full', colors[key])} />
                  {key === 'overdue' ? 'Overdue' : key === 'n/a' ? 'No Data' : key}: {count}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Customer Table */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-heading">
              Customers {bucket ? `— ${getBucketCardLabel(goalName, bucket)}` : '— All'}
            </h2>
            <span className="text-xs text-text-muted">({pagination.total.toLocaleString()})</span>
          </div>
          {bucket && (
            <button
              onClick={() => { setBucket(undefined); setPage(1) }}
              className="text-xs text-accent hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12 text-sm text-text-muted">No scored customers found</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-text-muted border-b border-border/50">
                  <th className="text-left px-5 py-2.5 font-medium">Customer</th>
                  <th className="text-left px-3 py-2.5 font-medium">Score</th>
                  <th className="text-left px-3 py-2.5 font-medium">{getColumnHeader(goalName)}</th>
                  {isReorder && <th className="text-left px-3 py-2.5 font-medium">Timing</th>}
                  {isReorder && <th className="text-left px-3 py-2.5 font-medium">Overdue</th>}
                  <th className="text-left px-3 py-2.5 font-medium">Confidence</th>
                  <th className="text-left px-3 py-2.5 font-medium">Scored</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {customers.map((c: any) => {
                  const bucketKey = (c.bucket || 'low').toLowerCase()
                  const cfg = bucketConfig[bucketKey as keyof typeof bucketConfig] ?? bucketConfig.low
                  return (
                    <tr key={c.customerId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/customers/${c.customerId}`} className="group">
                          <div className="text-sm font-medium text-heading group-hover:text-accent transition-colors">
                            {c.customerName || 'Unknown'}
                          </div>
                          <div className="text-xs text-text-muted">{c.customerEmail || '—'}</div>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', cfg.bar)}
                              style={{ width: `${Math.min(c.score, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-heading">{c.score}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', cfg.color)}>
                          {cfg.label}
                        </span>
                      </td>
                      {isReorder && (
                        <td className="px-3 py-3">
                          {c.factors?.timing_bucket ? (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                              <Clock className="w-3 h-3" />
                              {c.factors.timing_bucket}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </td>
                      )}
                      {isReorder && (
                        <td className="px-3 py-3">
                          {c.factors?.days_overdue > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <AlertTriangle className="w-3 h-3" />
                              {Math.round(c.factors.days_overdue)}d
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <span className="text-xs text-text-secondary">
                          {(c.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-text-muted">
                          {c.computedAt ? new Date(c.computedAt).toLocaleDateString() : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/customers/${c.customerId}`}
                          className="text-accent hover:text-accent-hover"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded hover:bg-surface disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages}
                    className="p-1.5 rounded hover:bg-surface disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
