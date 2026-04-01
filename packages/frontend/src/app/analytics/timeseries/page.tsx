'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useTimeSeries } from '@/hooks/useAnalytics'
import type { TimeSeriesResult } from '@/hooks/useAnalytics'
import { toast } from 'sonner'
import {
  Loader2,
  Play,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

const METRICS = [
  { value: 'events', label: 'Total Events' },
  { value: 'customers', label: 'Active Customers' },
  { value: 'new_customers', label: 'New Customers' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'orders', label: 'Orders' },
  { value: 'sessions', label: 'Sessions' },
]

const DATE_RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const GRANULARITIES = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

export default function TimeSeriesPage() {
  const [metric, setMetric] = useState('events')
  const [dateRange, setDateRange] = useState('30')
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day')
  const [compareEnabled, setCompareEnabled] = useState(true)
  const [result, setResult] = useState<TimeSeriesResult | null>(null)

  const timeSeries = useTimeSeries()

  const run = async () => {
    try {
      const days = Number(dateRange)
      const endDate = new Date()
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      const compareEndDate = compareEnabled ? new Date(startDate.getTime() - 1) : undefined
      const compareStartDate = compareEnabled
        ? new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000)
        : undefined

      const res = await timeSeries.mutateAsync({
        metric,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        compareStartDate: compareStartDate?.toISOString(),
        compareEndDate: compareEndDate?.toISOString(),
        granularity,
      })
      if (res.success) setResult(res.data)
    } catch {
      toast.error('Failed to compute time series')
    }
  }

  const formatValue = (v: number) => {
    if (metric === 'revenue') return `$${v.toLocaleString()}`
    return v.toLocaleString()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-heading">Time Series Comparison</h1>
        <p className="text-sm text-text-secondary mt-1">Compare metrics over time with period-over-period analysis</p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-border rounded-xl p-6 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary"
            >
              {METRICS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary"
            >
              {DATE_RANGES.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Granularity</label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as 'day' | 'week' | 'month')}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text-primary"
            >
              {GRANULARITIES.map(g => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={compareEnabled}
                onChange={(e) => setCompareEnabled(e.target.checked)}
                className="rounded border-border"
              />
              Compare prev period
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={run}
            disabled={timeSeries.isPending}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover flex items-center gap-2 disabled:opacity-50"
          >
            {timeSeries.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Computing...</>
            ) : (
              <><Play className="w-4 h-4" /> Run</>
            )}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <SummaryCard
            label="Total"
            value={formatValue(result.total)}
            change={result.changePercent}
          />
          {result.compareTotal !== undefined && (
            <SummaryCard
              label="Previous Period"
              value={formatValue(result.compareTotal)}
            />
          )}
          <SummaryCard
            label="Avg per Period"
            value={result.points.length > 0
              ? formatValue(Math.round(result.total / result.points.length))
              : '0'}
          />
        </div>
      )}

      {/* Chart */}
      {result && result.points.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-heading mb-4">
            {METRICS.find(m => m.value === result.metric)?.label} — {granularity}
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={result.points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => {
                    const d = new Date(v)
                    return `${d.getMonth() + 1}/${d.getDate()}`
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v) => formatValue(Number(v))}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Current"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                {compareEnabled && (
                  <Area
                    type="monotone"
                    dataKey="compareValue"
                    name="Previous"
                    stroke="#a5b4fc"
                    fill="#a5b4fc"
                    fillOpacity={0.05}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !timeSeries.isPending && (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <BarChart3 className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Select a metric and click <span className="font-medium text-heading">Run</span> to see time series data</p>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, change }: {
  label: string
  value: string
  change?: number
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-heading">{value}</span>
        {change !== undefined && (
          <span className={cn(
            'text-xs font-medium flex items-center gap-0.5',
            change >= 0 ? 'text-green-600' : 'text-red-500',
          )}>
            {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(change)}%
          </span>
        )}
      </div>
    </div>
  )
}
