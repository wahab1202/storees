'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useTimeToEvent, useEventNames } from '@/hooks/useAnalytics'
import type { TimeToEventResult } from '@/hooks/useAnalytics'
import { toast } from 'sonner'
import {
  Loader2,
  Play,
  Clock,
  ChevronDown,
  ArrowRight,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}

export default function TimeToEventPage() {
  const [startEvent, setStartEvent] = useState('')
  const [endEvent, setEndEvent] = useState('')
  const [dateRange, setDateRange] = useState('30')
  const [breakdownBy, setBreakdownBy] = useState<'' | 'platform'>('')
  const [result, setResult] = useState<TimeToEventResult | null>(null)

  const timeToEvent = useTimeToEvent()
  const { data: eventNamesData } = useEventNames()
  const eventNames = eventNamesData?.data ?? []

  const canRun = startEvent && endEvent && startEvent !== endEvent

  const run = async () => {
    if (!canRun) return
    try {
      const endDate = new Date()
      const startDate = new Date(Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000)

      const res = await timeToEvent.mutateAsync({
        startEvent,
        endEvent,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        breakdownBy: breakdownBy || undefined,
      })
      if (res.success) setResult(res.data)
    } catch {
      toast.error('Failed to compute time-to-event')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-heading">Time-to-Event Analysis</h1>
        <p className="text-sm text-text-secondary mt-1">Measure how long it takes customers to go from one event to another</p>
      </div>

      {/* Builder */}
      <div className="bg-white border border-border rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Start Event</label>
            <div className="relative">
              <select
                value={startEvent}
                onChange={(e) => setStartEvent(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary appearance-none bg-white pr-8"
              >
                <option value="">Select start event...</option>
                {eventNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">End Event</label>
            <div className="relative">
              <select
                value={endEvent}
                onChange={(e) => setEndEvent(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary appearance-none bg-white pr-8"
              >
                <option value="">Select end event...</option>
                {eventNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary"
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Breakdown</label>
            <select
              value={breakdownBy}
              onChange={(e) => setBreakdownBy(e.target.value as '' | 'platform')}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary"
            >
              <option value="">None</option>
              <option value="platform">By Platform</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={run}
            disabled={!canRun || timeToEvent.isPending}
            className={cn(
              'px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
              canRun ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface text-text-muted cursor-not-allowed',
            )}
          >
            {timeToEvent.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Computing...</>
            ) : (
              <><Play className="w-4 h-4" /> Analyze</>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Journey label */}
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="text-sm font-medium text-heading">{result.startEvent}</span>
            <ArrowRight className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-medium text-heading">{result.endEvent}</span>
            <span className="text-xs text-text-muted ml-2">({result.totalCompletions.toLocaleString()} completions)</span>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Median" value={formatDuration(result.medianSeconds)} />
            <StatCard label="75th Percentile" value={formatDuration(result.p75Seconds)} />
            <StatCard label="90th Percentile" value={formatDuration(result.p90Seconds)} />
            <StatCard label="Completions" value={result.totalCompletions.toLocaleString()} />
          </div>

          {/* Distribution chart */}
          {result.distribution.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-6 mb-6">
              <h2 className="text-sm font-semibold text-heading mb-4">Completion Time Distribution</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Breakdowns */}
          {result.breakdowns && result.breakdowns.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-6">
              <h2 className="text-sm font-semibold text-heading mb-4">Breakdown by Platform</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-text-secondary font-medium">Platform</th>
                    <th className="text-right py-2 text-text-secondary font-medium">Median Time</th>
                    <th className="text-right py-2 text-text-secondary font-medium">Completions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.breakdowns.map(b => (
                    <tr key={b.key} className="border-b border-border/50">
                      <td className="py-2.5 text-heading font-medium capitalize">{b.key}</td>
                      <td className="py-2.5 text-right text-text-primary">{formatDuration(b.medianSeconds)}</td>
                      <td className="py-2.5 text-right text-text-primary">{b.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !timeToEvent.isPending && (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <Clock className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">
            Select a start and end event, then click <span className="font-medium text-heading">Analyze</span> to see timing data
          </p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className="text-lg font-bold text-heading">{value}</p>
    </div>
  )
}
