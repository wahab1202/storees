'use client'

import { PageHeader } from '@/components/layout/PageHeader'
import { useDashboardStats, useDashboardActivity } from '@/hooks/useDashboard'
import { formatCurrency } from '@storees/shared'
import { Users, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: activity, isLoading: activityLoading } = useDashboardActivity()

  return (
    <div>
      <PageHeader title="Dashboard" />

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricCard
          label="Total Customers"
          value={stats?.data.totalCustomers.toLocaleString()}
          icon={<Users className="h-5 w-5" />}
          loading={statsLoading}
        />
        <MetricCard
          label="Active (7d)"
          value={stats?.data.activeCustomers.toLocaleString()}
          icon={<TrendingUp className="h-5 w-5" />}
          loading={statsLoading}
        />
        <MetricCard
          label="Total Orders"
          value={stats?.data.totalOrders.toLocaleString()}
          icon={<ShoppingCart className="h-5 w-5" />}
          loading={statsLoading}
        />
        <MetricCard
          label="Total Revenue"
          value={stats?.data.totalRevenue !== undefined ? formatCurrency(stats.data.totalRevenue) : undefined}
          icon={<DollarSign className="h-5 w-5" />}
          loading={statsLoading}
        />
        <MetricCard
          label="Avg CLV"
          value={stats?.data.avgClv !== undefined ? formatCurrency(stats.data.avgClv) : undefined}
          icon={<DollarSign className="h-5 w-5" />}
          loading={statsLoading}
        />
      </div>

      {/* Recent activity */}
      <h2 className="text-lg font-semibold text-heading mb-3">Recent Activity</h2>
      {activityLoading ? (
        <div className="bg-surface-elevated border border-border rounded-lg divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      ) : activity && activity.data.length === 0 ? (
        <p className="text-sm text-text-muted py-8 text-center">
          No activity yet. Connect a Shopify store to start ingesting events.
        </p>
      ) : activity ? (
        <div className="bg-surface-elevated border border-border rounded-lg divide-y divide-border">
          {activity.data.map(event => (
            <div key={event.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-text-primary">
                  {formatEventName(event.eventName)}
                </span>
                {event.customerName && (
                  <span className="text-sm text-text-muted ml-2">
                    — {event.customerName}
                  </span>
                )}
              </div>
              <span className="text-xs text-text-muted shrink-0">
                {formatTimestamp(event.timestamp)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon,
  loading,
}: {
  label: string
  value?: string
  icon: React.ReactNode
  loading: boolean
}) {
  return (
    <div className="bg-surface-elevated border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-secondary uppercase tracking-wide font-medium">{label}</p>
        <div className="text-text-muted">{icon}</div>
      </div>
      {loading ? (
        <div className="h-9 bg-surface rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-heading">{value ?? '—'}</p>
      )}
    </div>
  )
}

function formatEventName(name: string): string {
  return name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
