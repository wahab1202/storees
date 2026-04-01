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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-heading">Cohort Retention</h1>
          <p className="text-sm text-text-secondary mt-1">Track how customers come back over time</p>
        </div>
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
      </div>

      {/* Heatmap */}
      {isLoading ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Computing cohorts...</p>
        </div>
      ) : cohorts.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <Users className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No cohort data yet. Events need to span multiple {granularity}s.</p>
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
                  <th key={i} className="text-center px-2 py-3 font-semibold text-text-secondary min-w-[56px]">
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
