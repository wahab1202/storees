'use client'

import { useState, useMemo } from 'react'
import { useDashboardStats, useDashboardActivity, useDashboardTrends } from '@/hooks/useDashboard'
import { formatCurrency } from '@storees/shared'
import { Info, Activity, ChevronUp, ChevronDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'

type DateRange = '7d' | '14d' | '30d'

export default function DashboardPage() {
  const [range, setRange] = useState<DateRange>('7d')
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: activity, isLoading: activityLoading } = useDashboardActivity()
  const { data: trends, isLoading: trendsLoading } = useDashboardTrends(range)

  const domain = stats?.data.domainType ?? 'ecommerce'
  const chartData = useMemo(() => ({
    customers: trends?.data.customers ? formatChartData(trends.data.customers) : [],
    events: trends?.data.events ? formatChartData(trends.data.events) : [],
    domain: trends?.data.domain ? formatChartData(trends.data.domain) : [],
  }), [trends])

  // Compute sub-stats from chart data
  const customerSubStats = useMemo(() => {
    if (!chartData.customers.length) return null
    const last = chartData.customers[chartData.customers.length - 1]
    const avgActive = Math.round(chartData.customers.reduce((s, d) => s + (Number(d.active_customers) || 0), 0) / chartData.customers.length)
    return {
      lastDayActive: Number(last?.active_customers) || 0,
      avgActive,
      lastDayNew: Number(last?.new_customers) || 0,
      avgNew: Math.round(chartData.customers.reduce((s, d) => s + (Number(d.new_customers) || 0), 0) / chartData.customers.length),
    }
  }, [chartData.customers])

  const eventSubStats = useMemo(() => {
    if (!chartData.events.length) return null
    const last = chartData.events[chartData.events.length - 1]
    const total = chartData.events.reduce((s, d) => s + (Number(d.events) || 0), 0)
    return {
      lastDay: Number(last?.events) || 0,
      average: Math.round(total / chartData.events.length),
      total,
    }
  }, [chartData.events])

  // Build metrics array for the inline strip
  const metrics = buildMetrics(stats?.data, domain, statsLoading)

  return (
    <div className="space-y-5">
      {/* Header bar — MoEngage style: breadcrumb + filters */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted">Dashboard &gt; Key Metrics</p>
          <h1 className="text-lg font-semibold text-heading mt-0.5">Key Metrics</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-secondary">Duration</span>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      {/* Metric Strip — MoEngage inline horizontal band */}
      <div className="bg-white border border-border rounded-lg">
        <div className="flex items-stretch divide-x divide-border overflow-x-auto">
          {metrics.map((m, i) => (
            <div key={i} className="flex-1 min-w-[140px] px-4 py-3">
              {statsLoading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-text-muted font-medium">{m.label}</p>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xl font-bold text-heading tabular-nums">{m.value}</span>
                    {m.change !== undefined && (
                      <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                        m.change > 0 ? 'text-emerald-600' : m.change < 0 ? 'text-red-500' : 'text-text-muted'
                      }`}>
                        {m.change !== 0 && (
                          m.change > 0
                            ? <ChevronUp className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />
                        )}
                        {Math.abs(m.change)}%
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chart Row 1 — MoEngage: 2 charts with sub-stat boxes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardChart
          title="Active Customers"
          color="#4F46E5"
          loading={trendsLoading}
          subStats={customerSubStats ? [
            { label: 'Last Day', value: customerSubStats.lastDayActive.toLocaleString() },
            { label: 'Average', value: customerSubStats.avgActive.toLocaleString() },
          ] : undefined}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData.customers}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<DashTooltip />} />
              <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line type="monotone" dataKey="active_customers" name="Active Customers" stroke="#4F46E5" strokeWidth={2} dot={{ r: 3, fill: '#4F46E5' }} />
              <Line type="monotone" dataKey="new_customers" name="New Customers" stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: '#10B981' }} />
            </LineChart>
          </ResponsiveContainer>
        </DashboardChart>

        <DashboardChart
          title="Events"
          color="#8B5CF6"
          loading={trendsLoading}
          subStats={eventSubStats ? [
            { label: 'Last Day', value: eventSubStats.lastDay.toLocaleString() },
            { label: 'Average', value: eventSubStats.average.toLocaleString() },
          ] : undefined}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData.events}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<DashTooltip />} />
              <Line type="monotone" dataKey="events" name="Total Events" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3, fill: '#8B5CF6' }} />
            </LineChart>
          </ResponsiveContainer>
        </DashboardChart>
      </div>

      {/* Chart Row 2 — Domain + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {domain === 'ecommerce' && chartData.domain.length > 0 && (
          <DashboardChart title="Orders & Revenue" color="#10B981" loading={trendsLoading}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData.domain}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={35} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={45} />
                <Tooltip content={<DashTooltip />} />
                <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar yAxisId="left" dataKey="orders" name="Orders" fill="#4F46E5" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="right" dataKey="revenue" name="Revenue" fill="#10B981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DashboardChart>
        )}

        {domain === 'fintech' && chartData.domain.length > 0 && (
          <DashboardChart title="Transactions" color="#F59E0B" loading={trendsLoading}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData.domain}>
                <defs>
                  <linearGradient id="gradTx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<DashTooltip />} />
                <Area type="monotone" dataKey="transactions" name="Transactions" stroke="#F59E0B" fill="url(#gradTx)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </DashboardChart>
        )}

        {/* Recent Activity */}
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-heading">Recent Activity</h3>
            <span className="text-[11px] text-text-muted">{activity?.data.length ?? 0} events</span>
          </div>
          {activityLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : activity && activity.data.length === 0 ? (
            <p className="text-sm text-text-muted py-10 text-center">
              No activity yet. Send your first event to start ingesting data.
            </p>
          ) : activity ? (
            <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
              {activity.data.map(event => (
                <div key={event.id} className="px-4 py-2 flex items-center gap-3 hover:bg-surface/50 transition-colors">
                  <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                    <Activity className="h-3 w-3 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-primary">{formatEventName(event.eventName)}</span>
                    {event.customerName && (
                      <span className="text-xs text-text-muted ml-1.5">— {event.customerName}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted shrink-0">{formatTimestamp(event.timestamp)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ─── MoEngage-style subcomponents ─── */

function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const options: { label: string; value: DateRange }[] = [
    { label: '7 Days', value: '7d' },
    { label: '14 Days', value: '14d' },
    { label: '30 Days', value: '30d' },
  ]
  return (
    <div className="flex items-center border border-border rounded-md overflow-hidden bg-white">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0 ${
            value === opt.value
              ? 'bg-accent text-white'
              : 'text-text-secondary hover:bg-surface'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** MoEngage-style chart panel with title + sub-stats box */
function DashboardChart({
  title,
  color,
  loading,
  children,
  subStats,
}: {
  title: string
  color: string
  loading: boolean
  children: React.ReactNode
  subStats?: Array<{ label: string; value: string }>
}) {
  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold text-heading">{title}</h3>
        <Info className="h-3.5 w-3.5 text-text-muted ml-0.5" />
      </div>

      {/* Sub-stat boxes — MoEngage shows "Last Day" and "Average" above the chart */}
      {subStats && !loading && (
        <div className="px-4 pb-2 flex gap-3">
          {subStats.map((s, i) => (
            <div key={i} className="border border-border rounded-md px-3 py-1.5">
              <p className="text-[10px] text-text-muted">{s.label}</p>
              <p className="text-sm font-semibold text-heading tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="px-2 pb-3">
        {loading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="space-y-3 w-full px-6">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function DashTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-heading text-white rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </p>
      ))}
    </div>
  )
}

/* ─── Helpers ─── */

type MetricItem = { label: string; value: string; change?: number }

function buildMetrics(
  data: Record<string, unknown> | undefined,
  domain: string,
  loading: boolean,
): MetricItem[] {
  if (!data || loading) {
    return [
      { label: 'Total Customers', value: '—' },
      { label: 'Active (7d)', value: '—' },
      { label: 'New Customers', value: '—' },
      { label: 'Orders', value: '—' },
      { label: 'Revenue', value: '—' },
    ]
  }
  const d = data as Record<string, number | string | undefined>
  const base: MetricItem[] = [
    { label: 'Total Customers', value: Number(d.totalCustomers ?? 0).toLocaleString() },
    { label: 'Active (7d)', value: Number(d.activeCustomers ?? 0).toLocaleString(), change: Number(d.activeChange ?? 0) },
    { label: 'New Customers', value: Number(d.newCustomers ?? 0).toLocaleString(), change: Number(d.newCustomersChange ?? 0) },
  ]

  if (domain === 'ecommerce') {
    base.push(
      { label: 'Total Orders', value: Number(d.totalOrders ?? 0).toLocaleString(), change: Number(d.ordersChange ?? 0) },
      { label: 'Revenue', value: formatCurrency(Number(d.totalRevenue ?? 0)), change: Number(d.revenueChange ?? 0) },
    )
  } else if (domain === 'fintech') {
    base.push(
      { label: 'Transactions', value: Number(d.totalTransactions ?? 0).toLocaleString(), change: Number(d.transactionsChange ?? 0) },
      { label: 'Volume', value: formatCurrency(Number(d.transactionVolume ?? 0)) },
    )
  } else {
    base.push(
      { label: 'Total Events', value: Number(d.totalEvents ?? 0).toLocaleString(), change: Number(d.eventsChange ?? 0) },
    )
  }
  base.push({ label: 'Avg CLV', value: formatCurrency(Number(d.avgClv ?? 0)) })

  // SDK engagement metrics (shown when SDK is active)
  if (Number(d.pageViews7d ?? 0) > 0) {
    base.push({ label: 'Page Views (7d)', value: Number(d.pageViews7d).toLocaleString(), change: Number(d.pageViewsChange ?? 0) })
  }
  if (Number(d.sessions7d ?? 0) > 0) {
    base.push({ label: 'Sessions (7d)', value: Number(d.sessions7d).toLocaleString(), change: Number(d.sessionsChange ?? 0) })
  }

  return base
}

function formatChartData(data: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return data.map(point => {
    const date = String(point.date)
    const d = new Date(date)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const mapped: Record<string, unknown> = { ...point, label }
    for (const key of Object.keys(mapped)) {
      if (key !== 'date' && key !== 'label' && typeof mapped[key] === 'string') {
        mapped[key] = Number(mapped[key])
      }
    }
    return mapped
  })
}

function formatEventName(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
