'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useCohorts, useEventNames } from '@/hooks/useAnalytics'
import { Users, Loader2, ChevronDown } from 'lucide-react'

export default function CohortsPage() {
  const [granularity, setGranularity] = useState<'week' | 'month'>('week')
  const [periods, setPeriods] = useState(8)
  const [returnEvent, setReturnEvent] = useState('')

  const { data, isLoading } = useCohorts({
    granularity,
    periods,
    returnEvent: returnEvent || undefined,
  })
  const { data: eventNamesData } = useEventNames()
  const eventNames = eventNamesData?.data ?? []

  const cohorts = data?.data?.cohorts ?? []

  const getHeatColor = (value: number): string => {
    if (value === 0) return 'bg-surface text-text-muted'
    if (value >= 80) return 'bg-accent text-white'
    if (value >= 60) return 'bg-accent/80 text-white'
    if (value >= 40) return 'bg-accent/60 text-white'
    if (value >= 20) return 'bg-accent/40 text-heading'
    if (value >= 10) return 'bg-accent/20 text-heading'
    return 'bg-accent/10 text-text-secondary'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-semibold text-heading">Cohort Retention</h1>
          <p className="text-sm text-text-secondary mt-1">
            Group customers by when they first appeared, then track what % come back over time.
          </p>
        </div>
      </div>

      {/* How to read */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-6 text-xs text-text-secondary leading-relaxed">
        <p className="font-semibold text-text-primary mb-1.5">How to read this</p>
        <ul className="space-y-1">
          <li>• Each <span className="font-medium text-text-primary">row</span> is a cohort — customers grouped by the {granularity} they were first seen.</li>
          <li>• <span className="font-medium text-text-primary">{granularity === 'week' ? 'W0' : 'M0'}</span> is the cohort&apos;s first {granularity} — always 100% by definition.</li>
          <li>• <span className="font-medium text-text-primary">{granularity === 'week' ? 'W1, W2…' : 'M1, M2…'}</span> = the % of that cohort still active (triggered the return event) that many {granularity}s later.</li>
          <li>• Retention naturally falls left → right; darker cells = higher retention. Compare rows to see whether newer cohorts retain better.</li>
        </ul>
      </div>

      {/* Controls */}
      <div className="bg-white border border-border rounded-xl p-4 mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-text-secondary">Granularity</label>
          <div className="flex border border-border rounded-lg overflow-hidden">
            {(['week', 'month'] as const).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium capitalize',
                  granularity === g ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface',
                )}
              >
                {g}ly
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-text-secondary">Periods</label>
          <select
            value={periods}
            onChange={(e) => setPeriods(Number(e.target.value))}
            className="text-xs border border-border rounded-lg px-3 py-1.5 text-text-secondary"
          >
            <option value={4}>4</option>
            <option value={6}>6</option>
            <option value={8}>8</option>
            <option value={12}>12</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-text-secondary">Return event</label>
          <div className="relative">
            <select
              value={returnEvent}
              onChange={(e) => setReturnEvent(e.target.value)}
              className="text-xs border border-border rounded-lg px-3 py-1.5 text-text-secondary appearance-none bg-white pr-7 min-w-[160px]"
            >
              <option value="">Any event</option>
              {eventNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <p className="w-full text-[11px] text-text-muted mt-1">
          <span className="font-medium text-text-secondary">Return event</span> defines what counts as &ldquo;retained&rdquo; — a customer is retained in a period if they trigger it (leave as <span className="font-medium text-text-secondary">Any event</span> for any activity). Retention&nbsp;% = returning customers ÷ cohort size.
        </p>
      </div>

      {/* Legend */}
      {cohorts.length > 0 && !isLoading && (
        <div className="flex items-center gap-2 mb-3 text-[11px] text-text-muted">
          <span>Lower retention</span>
          {['bg-accent/10', 'bg-accent/20', 'bg-accent/40', 'bg-accent/60', 'bg-accent/80', 'bg-accent'].map((c, i) => (
            <span key={i} className={cn('inline-block h-3 w-5 rounded-sm border border-border/50', c)} />
          ))}
          <span>Higher retention</span>
        </div>
      )}

      {/* Heatmap */}
      {isLoading ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Computing cohorts...</p>
        </div>
      ) : cohorts.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <Users className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No cohort data yet — customers need activity spanning at least two {granularity}s for retention to appear.</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-3 font-semibold text-text-secondary sticky left-0 bg-white z-10 min-w-[100px]">
                  Cohort
                </th>
                <th className="text-center px-2 py-3 font-semibold text-text-secondary min-w-[60px]">
                  Users
                </th>
                {Array.from({ length: periods }, (_, i) => (
                  <th
                    key={i}
                    title={i === 0
                      ? `${granularity === 'week' ? 'Week' : 'Month'} 0 — the cohort's first ${granularity} (always 100%)`
                      : `${granularity === 'week' ? 'Week' : 'Month'} ${i} — % of the cohort still active ${i} ${granularity}${i > 1 ? 's' : ''} after first seen`}
                    className="text-center px-2 py-3 font-semibold text-text-secondary min-w-[56px] cursor-help"
                  >
                    {granularity === 'week' ? `W${i}` : `M${i}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.cohortDate} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-heading sticky left-0 bg-white z-10">
                    {cohort.cohortDate}
                  </td>
                  <td className="text-center px-2 py-2 font-medium text-heading">
                    {cohort.cohortSize.toLocaleString()}
                  </td>
                  {cohort.retention.map((pct, i) => (
                    <td key={i} className="px-1 py-1">
                      <div className={cn(
                        'rounded px-2 py-1.5 text-center font-medium',
                        getHeatColor(pct),
                      )}>
                        {pct}%
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
