'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useSnapshotDates, useTransitions, useCreateSnapshot } from '@/hooks/useAnalytics'
import type { SegmentTransition } from '@/hooks/useAnalytics'
import { SankeyDiagram } from '@/components/analytics/SankeyDiagram'
import { toast } from 'sonner'
import {
  Loader2,
  ArrowLeftRight,
  ArrowRight,
  Camera,
  ChevronDown,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Zap,
  Users,
  Play,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

export default function TransitionsPage() {
  const [period1, setPeriod1] = useState('')
  const [period2, setPeriod2] = useState('')
  const [view, setView] = useState<'cards' | 'sankey'>('cards')

  const { data: snapshotDatesData, isLoading: loadingDates } = useSnapshotDates()
  const dates = snapshotDatesData?.data ?? []
  const { data: transitionData, isLoading: loadingTransitions } = useTransitions(period1, period2)
  const result = transitionData?.data
  const createSnapshot = useCreateSnapshot()
  const queryClient = useQueryClient()
  const router = useRouter()

  const handleSnapshot = async () => {
    try {
      const res = await createSnapshot.mutateAsync()
      if (res.success) {
        toast.success(`Snapshot created: ${res.data.snapshotted} memberships captured`)
        queryClient.invalidateQueries({ queryKey: ['snapshot-dates'] })
      }
    } catch {
      toast.error('Failed to create snapshot')
    }
  }

  const handleTakeAction = (t: SegmentTransition) => {
    // Navigate to flows page with transition context in URL params
    const params = new URLSearchParams({
      from_segment: t.fromSegmentId || '',
      to_segment: t.toSegmentId || '',
      from_name: t.fromSegmentName,
      to_name: t.toSegmentName,
      count: String(t.count),
    })
    router.push(`/flows/new?transition=${encodeURIComponent(params.toString())}`)
  }

  const handleViewUsers = (t: SegmentTransition) => {
    // Navigate to customers page filtered by the "to" segment
    if (t.toSegmentId) {
      router.push(`/customers?segment=${t.toSegmentId}`)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-heading">Segment Transitions</h1>
          <p className="text-sm text-text-secondary mt-1">Track how customers move between segments over time</p>
        </div>
        <button
          onClick={handleSnapshot}
          disabled={createSnapshot.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {createSnapshot.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          Take Snapshot
        </button>
      </div>

      {/* Period selector */}
      <div className="bg-white border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-heading mb-4">Compare Periods</h2>

        {dates.length < 2 ? (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Need at least 2 snapshots</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Click &quot;Take Snapshot&quot; to capture current segment memberships. Take another one later to compare.
                {dates.length === 1 && ` (1 snapshot on ${dates[0]})`}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-secondary mb-1.5">From</label>
              <div className="relative">
                <select
                  value={period1}
                  onChange={(e) => setPeriod1(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary appearance-none bg-white pr-8"
                >
                  <option value="">Select period...</option>
                  {dates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-text-muted mt-5" />
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-secondary mb-1.5">To</label>
              <div className="relative">
                <select
                  value={period2}
                  onChange={(e) => setPeriod2(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary appearance-none bg-white pr-8"
                >
                  <option value="">Select period...</option>
                  {dates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {loadingTransitions && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      )}

      {/* Results */}
      {result && result.transitions.length > 0 && (
        <>
          {/* Summary + view toggle */}
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="text-sm text-text-secondary">
              {result.totalCustomers.toLocaleString()} customers changed segments
              <span className="text-xs text-text-muted ml-2">{result.period1} → {result.period2}</span>
            </span>
            <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5">
              <button
                onClick={() => setView('cards')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  view === 'cards' ? 'bg-white text-heading shadow-sm' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Cards
              </button>
              <button
                onClick={() => setView('sankey')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  view === 'sankey' ? 'bg-white text-heading shadow-sm' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Flow
              </button>
            </div>
          </div>

          {/* Sankey view */}
          {view === 'sankey' && (
            <div className="mb-6">
              <SankeyDiagram
                transitions={result.transitions}
                totalCustomers={result.totalCustomers}
                height={Math.max(300, result.transitions.length * 25)}
                onTransitionClick={handleTakeAction}
              />
            </div>
          )}

          {/* Cards view */}
          {view === 'cards' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {result.transitions.slice(0, 8).map((t, i) => (
                <TransitionCard
                  key={i}
                  transition={t}
                  onTakeAction={handleTakeAction}
                  onViewUsers={handleViewUsers}
                />
              ))}
            </div>
          )}

          {/* Full transition table */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-heading">All Transitions</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/50">
                  <th className="text-left py-3 px-4 text-text-secondary font-medium">From Segment</th>
                  <th className="text-center py-3 px-1 text-text-secondary font-medium w-8" />
                  <th className="text-left py-3 px-4 text-text-secondary font-medium">To Segment</th>
                  <th className="text-right py-3 px-4 text-text-secondary font-medium">Customers</th>
                  <th className="text-right py-3 px-4 text-text-secondary font-medium">% of Total</th>
                  <th className="text-right py-3 px-4 text-text-secondary font-medium w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {result.transitions.map((t, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-gray-50/30">
                    <td className="py-3 px-4">
                      <span className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium',
                        t.fromSegmentName === '(none)' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700',
                      )}>
                        {t.fromSegmentName}
                      </span>
                    </td>
                    <td className="py-3 px-1 text-center">
                      <ArrowRight className="w-3.5 h-3.5 text-text-muted inline" />
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium',
                        t.toSegmentName === '(none)' ? 'bg-gray-100 text-gray-500' : 'bg-purple-50 text-purple-700',
                      )}>
                        {t.toSegmentName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-heading">{t.count.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-text-secondary">{t.percentage}%</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleTakeAction(t)}
                        className="text-xs font-medium text-accent hover:text-accent-hover"
                      >
                        Create Flow
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty state - has periods but no transitions */}
      {result && result.transitions.length === 0 && (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <ArrowLeftRight className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No segment transitions found between these periods</p>
        </div>
      )}

      {/* Initial empty state */}
      {!result && !loadingTransitions && dates.length >= 2 && (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <ArrowLeftRight className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Select two snapshot dates to compare segment movements</p>
        </div>
      )}
    </div>
  )
}

function TransitionCard({
  transition: t,
  onTakeAction,
  onViewUsers,
}: {
  transition: SegmentTransition
  onTakeAction: (t: SegmentTransition) => void
  onViewUsers: (t: SegmentTransition) => void
}) {
  const isNegative = ['risk', 'lost', 'dormant', 'sleep', 'churn', 'lapsed'].some(
    w => t.toSegmentName.toLowerCase().includes(w),
  )
  const isPositive = ['loyal', 'active', 'convert', 'champion', 'high value'].some(
    w => t.toSegmentName.toLowerCase().includes(w),
  )

  return (
    <div className={cn(
      'border rounded-xl p-4 transition-colors',
      isNegative ? 'border-red-200 bg-red-50/30' : isPositive ? 'border-green-200 bg-green-50/30' : 'border-border bg-white',
    )}>
      <div className="flex items-center gap-2 mb-2">
        {isNegative ? (
          <TrendingDown className="w-4 h-4 text-red-500" />
        ) : isPositive ? (
          <TrendingUp className="w-4 h-4 text-green-600" />
        ) : (
          <ArrowRight className="w-4 h-4 text-text-muted" />
        )}
        <span className="text-sm font-medium text-heading">{t.fromSegmentName}</span>
        <ArrowRight className="w-3 h-3 text-text-muted" />
        <span className="text-sm font-medium text-heading">{t.toSegmentName}</span>
      </div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-bold text-heading">{t.count.toLocaleString()}</span>
        <span className="text-xs text-text-secondary">{t.percentage}% of all transitions</span>
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
        <button
          onClick={() => onTakeAction(t)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            isNegative
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : isPositive
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-accent/10 text-accent hover:bg-accent/20',
          )}
        >
          <Play className="w-3 h-3" />
          {isNegative ? 'Create Rescue Flow' : isPositive ? 'Nurture Flow' : 'Create Flow'}
        </button>
        {t.toSegmentId && (
          <button
            onClick={() => onViewUsers(t)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-surface transition-colors"
          >
            <Users className="w-3 h-3" /> View Users
          </button>
        )}
      </div>
    </div>
  )
}
