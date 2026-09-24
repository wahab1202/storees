'use client'

import { isPseudoGoal, PSEUDO_GOAL_EVENTS } from '@/lib/predictionQuality'
import { isEventDriven, formatWindow, expiresAt, formatRemaining, occasionStartedAt, factorValue, outcomeOf } from '@/lib/predictionCadence'

import { useState, useEffect } from 'react'
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

  // A SHORT WINDOW CHANGES WHAT THIS PAGE IS — see the note below. Resolved here
  // because it also decides what order to ASK the server for: a worklist wants the
  // newest baskets first, a fortnightly report wants the strongest scores first.
  const live = isEventDriven(goal?.predictionWindowDays)

  // LIVE FIRST, HISTORY ONLY AS A FALLBACK.
  //
  // The worklist is the carts open right now. When none are — the sync has stopped, or
  // it is simply a quiet hour — this shows the last evaluation run instead, labelled as
  // history. It does NOT silently widen the list: the banner says which population is
  // on screen, because a fourteen-day evaluation set presented as work to do is how
  // 1,298 dead carts came to be shown with a five-hour countdown on each.
  const [showHistory, setShowHistory] = useState(false)
  const scope: 'live' | 'all' = !live ? 'all' : (showHistory ? 'all' : 'live')

  const { data: customersData, isLoading: customersLoading } = useGoalCustomers(goalId, {
    bucket,
    page,
    pageSize: 25,
    sort: live && scope === 'live' ? 'recent_desc' : 'score_desc',
    scope,
  })

  // api.get returns the full JSON: { success, data, stats, pagination }
  // TanStack Query puts this in customersData
  const raw = customersData as any
  const allRows = raw?.data ?? []
  const stats = raw?.stats ?? { total: 0, avgScore: 0, buckets: { high: 0, medium: 0, low: 0 } }
  const liveTotal: number = stats.liveTotal ?? 0
  const outcomes: Record<string, { known: number; happened: number; rate: number | null }> =
    stats.outcomes ?? {}
  // History is what is on screen when a live goal has nothing open.
  const viewingHistory = live && (stats.scope === 'all')

  // Nothing open: fall back to history. In an effect, not in render — setting state
  // while rendering is how a component ends up re-rendering itself forever.
  useEffect(() => {
    if (live && !showHistory && !customersLoading && liveTotal === 0) setShowHistory(true)
  }, [live, showHistory, customersLoading, liveTotal])

  // A SHORT WINDOW CHANGES WHAT THIS PAGE IS.
  //
  // For a goal measured in weeks the list is a report: written last night, good all day,
  // read top-down by score. For one measured in hours it is a WORKLIST that decays while
  // it is open. `live` switches the labels, the countdown column and the sort.
  //
  // IT DOES NOT FILTER. Expired scores are dropped by the API, in the same query that
  // produces the bucket counts beside the list — see routes/predictions.ts. Doing it
  // here instead is what made the screen read "Live Now 0" next to "Likely 812": the
  // page hid rows the server had already counted. It also only ever cleaned the 25 rows
  // on screen, leaving page 2 full of dead carts.
  const now = Date.now()

  // STILL INSIDE THEIR WINDOW, counted. This read `customers.length`, which is the
  // page — so it showed "25" on every page of every goal forever, including a goal
  // whose last cart died a week ago. Counting the rows in hand is still only this
  // page's worth; it is honest about what it can see rather than confidently wrong,
  // and the server-side total belongs beside the bucket counts in routes/predictions.ts.
  // Counted by the server over every row, not by the page over its own twenty-five.

  // NO CLIENT-SIDE RE-SORT. Ordering a live goal by time is right, but doing it here
  // reordered only the twenty-five rows the server had already picked BY SCORE — every
  // page came out date-sorted inside itself and the dates restarted on the next page.
  // The request now asks for that order (`recent_desc`) and the rows arrive in it.
  const customers = allRows
  const pagination = raw?.pagination ?? { page: 1, pageSize: 25, total: 0, totalPages: 0 }

  const isLoading = goalLoading || customersLoading
  // the project's whole base, so "scored" can be read as a share rather than a count
  const totalUsers = (goal as (typeof goal & { totalUsers?: number }) | undefined)?.totalUsers ?? null
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
            {goal ? `${isPseudoGoal(goal.targetEvent)
              ? `Goal: ${PSEUDO_GOAL_EVENTS[goal.targetEvent].label}`
              : `Target event: ${goal.targetEvent}`} · ${formatWindow(goal.observationWindowDays)} observation · ${formatWindow(goal.predictionWindowDays)} prediction` : ''}
          </p>
        </div>
        {(() => {
          // BOTH numbers, global above active. They answer different questions and a
          // reader shown only one will draw the wrong conclusion: global is measured
          // over everyone, so a base full of dormant accounts lifts it without the
          // model being better at the customers a team can actually act on. Purchase
          // reads 0.963 global against 0.773 active from the same run.
          const g = goal as (typeof goal & { globalAuc?: number | null; activeAuc?: number | null }) | undefined
          const globalAuc = g?.globalAuc != null ? Number(g.globalAuc)
            : g?.currentMetric ? Number(g.currentMetric) : null
          const activeAuc = g?.activeAuc != null ? Number(g.activeAuc) : null
          if (globalAuc == null) return null

          const targetLower = (goal?.targetEvent ?? '').toLowerCase()
          const nameLower = (goal?.name ?? '').toLowerCase()
          const isBehavior = ['dormancy', 'dormant', 'churn', 'cancel', 'default', 'missed', 'expired', 'abandon'].some(
            k => targetLower.includes(k) || nameLower.includes(k)
          )
          const typeLabel = isBehavior ? 'Behavior-Based' : globalAuc >= 0.95 ? 'Cycle-Based' : null
          const typeColor = isBehavior ? 'text-emerald-600' : 'text-violet-600'
          // A wide gap is not a fault — it is the mix showing through — but it has to
          // be named, or the headline gets quoted on its own.
          const inflated = activeAuc != null && globalAuc - activeAuc > 0.05

          return (
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wide text-text-muted">Model Quality</div>
              {/* ACTIVE LEADS, GLOBAL SUPPORTS — the same order as the cards on the list
                  page, because a number that changes rank between two screens is a number
                  nobody trusts. Global was the headline here, and it is both the one that
                  gets quoted and the one flattered by dormant customers. */}
              {activeAuc != null ? (
                <>
                  <div className="text-lg font-bold text-heading leading-tight tabular-nums">
                    {(activeAuc * 100).toFixed(1)}%
                    <span className="text-xs font-normal text-text-secondary ml-1">Active AUC</span>
                  </div>
                  <div className="text-sm font-semibold text-text-secondary leading-tight tabular-nums">
                    {(globalAuc * 100).toFixed(1)}%
                    <span className="text-xs font-normal text-text-muted ml-1">Global AUC</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-heading leading-tight tabular-nums">
                    {(globalAuc * 100).toFixed(1)}%
                    <span className="text-xs font-normal text-text-secondary ml-1">Global AUC</span>
                  </div>
                  <div className="text-[10px] text-text-muted">
                    Active-only score arrives with the next re-train
                  </div>
                </>
              )}
              {typeLabel && (
                <div className={cn('text-[10px] mt-0.5 font-medium', typeColor)}>{typeLabel}</div>
              )}
              {inflated && (
                <div className="text-[10px] mt-0.5 text-amber-600 max-w-[190px] ml-auto">
                  Global is lifted by inactive customers — read the active figure
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Stats Cards — five tiles, so the grid steps 2 -> 3 -> 5 rather than
          leaving a stranded row on a tablet. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 shrink-0 text-text-muted" />
            {/* The whole customer base is a useful denominator for a goal about
                people. It is a misleading neighbour for one about OCCASIONS: most of
                these 16,000 never open a cart, and putting the two counts side by side
                invites a comparison that means nothing. Replaced by the only number
                that can still be acted on. */}
            <span className="text-xs text-text-muted truncate">{live ? 'Live Now' : 'Total Users'}</span>
          </div>
          <div className="text-2xl font-bold text-heading tabular-nums">
            {live ? liveTotal.toLocaleString()
                  : totalUsers != null ? totalUsers.toLocaleString() : '—'}
          </div>
          <div className="text-xs text-text-secondary">
            {live ? `open inside their ${formatWindow(goal?.predictionWindowDays)} window`
                  : 'in this project'}
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 shrink-0 text-text-muted" />
            <span className="text-xs text-text-muted truncate">{live ? 'Carts Scored' : 'Users Scored'}</span>
          </div>
          <div className="text-2xl font-bold text-heading tabular-nums">{stats.total.toLocaleString()}</div>
          {/* Scored is the goal's ELIGIBLE population, not a shortfall: a cart model
              can only score people who have a cart. Showing the share stops 705
              reading as a failure when it is 705 of the 705 who qualify. */}
          <div className="text-xs text-text-secondary">
            {/* A share of the customer base is meaningless once a row is an occasion
                rather than a person: one shopper contributes several, so the figure can
                pass 100% and says nothing either way. */}
            {/* Now the same set the list and the bands describe — the API drops expired
                scores before counting, so these agree by construction rather than by
                luck. */}
            {/* The evaluation set is COLLECTED over the observation window and each
                cart is judged over the prediction window. Labelling 1,298 carts
                gathered across fourteen days as "inside their 5h window" described
                neither. */}
            {live
              ? (viewingHistory
                  ? `opened over ${goal?.observationWindowDays ?? '—'} days · all closed`
                  : `inside their ${formatWindow(goal?.predictionWindowDays)} window`)
              : totalUsers ? `${((stats.total / totalUsers) * 100).toFixed(1)}% of base` : 'eligible for this goal'}
          </div>
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
              {/* MEASURED, WHERE IT IS KNOWN.
                  `pct` is the band's share of the population — true by construction,
                  identical on every goal every day, and read as accuracy sitting where
                  it does. Where the outcomes have played out, the honest number is the
                  share that actually happened. */}
              {outcomes[b]?.rate != null ? (
                <div className="text-xs text-text-secondary">
                  <span className="font-semibold text-heading">{outcomes[b]!.rate}%</span>
                  {' '}actually {getBucketCardLabel(goalName, b).toLowerCase().includes('abandon')
                    ? 'abandoned' : 'happened'}
                </div>
              ) : (
                <div className="text-xs text-text-secondary">{pct}% of scored</div>
              )}
            </button>
          )
        })}
      </div>

      {/* WHAT POPULATION IS ON SCREEN. Never left implicit for a live goal: this list
          is a worklist when carts are open and a record when none are, and the two look
          identical row for row. Saying which, and when data last arrived, is what turns
          an empty page from "broken" into an answer. */}
      {viewingHistory && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
          <span className="text-amber-600 text-sm leading-5 shrink-0">⚠</span>
          <div className="text-xs leading-5">
            <span className="font-semibold text-amber-900">
              No carts are open right now — showing the last evaluation run instead.
            </span>
            <span className="text-amber-800">
              {' '}These {stats.total.toLocaleString()} carts opened during the model&apos;s{' '}
              {goal?.observationWindowDays ?? '—'}-day test window and have all closed. Their{' '}
              <strong>outcome is already known</strong>, so this is a record of how the model
              did, not a list to work. Live carts appear here automatically once events
              start arriving again.
            </span>
          </div>
        </div>
      )}

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
            {/* NAME WHAT IS ON SCREEN.
                "Customers — All" was wrong three times over on a live goal: the rows are
                CARTS, not customers — one person can open several — they are not "all"
                of anything, and the word gave a reader no way to tell a worklist from a
                record of a sealed test. The heading now says which population it is and
                how it is ordered, so the list is self-describing before anyone reads a
                row. */}
            <h2 className="text-sm font-semibold text-heading">
              {live
                ? (viewingHistory ? 'Evaluated Carts' : 'Live Carts')
                : 'Customers'}
              {bucket ? ` — ${getBucketCardLabel(goalName, bucket)}` : ''}
            </h2>
            <span className="text-xs text-text-muted">
              {pagination.total.toLocaleString()}
              {live && (viewingHistory
                ? ' from the test window · outcome known'
                : ' open now · newest first')}
            </span>
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
          <div className="text-center py-12 px-6">
            {/* AN EMPTY WORKLIST IS AN ANSWER, NOT A FAILURE. Saying so — and saying
                what would fill it — is the difference between a screen that looks
                broken and one that has just told you your events stopped arriving. */}
            <div className="text-sm font-medium text-heading mb-1">
              {live ? 'No carts are open right now' : 'No scored customers found'}
            </div>
            <div className="text-xs text-text-muted max-w-md mx-auto">
              {live
                ? `A cart appears here the moment a shopper opens one, and drops off after ${formatWindow(goal?.predictionWindowDays)}. Nothing is open at the moment — if that is unexpected, check that events are still arriving.`
                : 'Re-train this goal to score your customers.'}
            </div>
          </div>
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
                  {/* Confidence is hidden here rather than everywhere: it renders 0% on
                      every row, so on a list read under time pressure it is a column of
                      noise. Left in place for the goals whose pages nobody is working
                      against a clock, so this change cannot be the reason a number
                      somebody relies on disappears. */}
                  {!live && <th className="text-left px-3 py-2.5 font-medium">Confidence</th>}
                  {live && <th className="text-left px-3 py-2.5 font-medium">Cart Value</th>}
                  {live && <th className="text-left px-3 py-2.5 font-medium">Expires in</th>}
                  {/* "Scored at" was the row's write time and read the same on all
                      1,298 rows. What a reader needs is when the basket opened. */}
                  <th className="text-left px-3 py-2.5 font-medium">{live ? 'Opened' : 'Scored'}</th>
                  {/* ONLY WHERE IT IS KNOWN. A live cart has no outcome — that is the
                      point of predicting it — so the column appears for history and is
                      absent, not blank, for a worklist. */}
                  {viewingHistory && <th className="text-left px-3 py-2.5 font-medium">Outcome</th>}
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
                      {!live && (
                        <td className="px-3 py-3">
                          <span className="text-xs text-text-secondary">
                            {(c.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                      )}
                      {live && (() => {
                        // WHAT IS IN THE BASKET, not what opened it. `cart_value` is
                        // the model's feature — the opening add — and showing it here
                        // read Rs7,499 beside a shop showing Rs23,293. Falls back to it
                        // for rows scored before the basket total existed.
                        const v = factorValue(c, 'basket_value') ?? factorValue(c, 'cart_value')
                        return (
                          <td className="px-3 py-3">
                            <span className="text-xs tabular-nums text-heading">
                              {v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`}
                            </span>
                          </td>
                        )
                      })()}
                      {live && (() => {
                        const started = occasionStartedAt(c)
                        const until = expiresAt(started ?? c.createdAt, goal!.predictionWindowDays)
                        // Under a quarter of the window left, the row is about to stop
                        // being actionable — the one thing a reader scanning this list
                        // needs to see before the score.
                        const urgent = until.getTime() - now
                          < goal!.predictionWindowDays * 86_400_000 * 0.25
                        return (
                          <td className="px-3 py-3">
                            <span className={cn('text-xs font-semibold tabular-nums',
                              urgent ? 'text-red-600' : 'text-heading')}>
                              {formatRemaining(until, new Date(now))}
                            </span>
                          </td>
                        )
                      })()}
                      <td className="px-3 py-3">
                        <span className="text-xs text-text-muted tabular-nums">
                          {/* A DATE is enough for a fortnight-long window and useless
                              for a five-hour one, where every row would read today. */}
                          {live
                            ? occasionStartedAt(c)
                              ? new Date(occasionStartedAt(c)!).toLocaleString([], {
                                  month: 'short', day: 'numeric',
                                  hour: '2-digit', minute: '2-digit' })
                              : '—'
                            : c.computedAt
                              ? new Date(c.computedAt).toLocaleDateString()
                              : '—'}
                        </span>
                      </td>
                      {viewingHistory && (() => {
                        const o = outcomeOf(c)
                        return (
                          <td className="px-3 py-3">
                            <span className={cn('text-xs font-semibold',
                              o === 'happened' ? 'text-red-600'
                              : o === 'converted' ? 'text-emerald-600'
                              : 'text-text-muted')}>
                              {o === 'happened' ? 'abandoned' : o === 'converted' ? 'bought' : '—'}
                            </span>
                          </td>
                        )
                      })()}
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
