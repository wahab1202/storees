'use client'

import { useFlowAnalytics } from '@/hooks/useFlows'
import type { FlowAnalytics } from '@/hooks/useFlows'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Mail,
  MailCheck,
  MailX,
  Activity,
  ChevronRight,
} from 'lucide-react'

/* ─── Status colors for trip badges ─── */

const TRIP_STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-50 text-blue-600',
  waiting: 'bg-amber-50 text-amber-600',
  completed: 'bg-green-50 text-green-700',
  exited: 'bg-red-50 text-red-600',
}

const NODE_TYPE_COLORS: Record<string, string> = {
  trigger: 'bg-blue-500',
  delay: 'bg-amber-500',
  condition: 'bg-purple-500',
  action: 'bg-green-500',
  end: 'bg-gray-400',
}

/* ─── Main Component ─── */

export function FlowAnalyticsPanel({ flowId }: { flowId: string }) {
  const { data, isLoading } = useFlowAnalytics(flowId)
  const analytics = data?.data

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-text-muted">No analytics data available yet.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-full">
      {/* Overview Cards */}
      <OverviewCards overview={analytics.overview} messageStats={analytics.messageStats} />

      {/* Node Funnel */}
      <NodeFunnel funnel={analytics.nodeFunnel} totalTrips={analytics.overview.totalTrips} />

      {/* Weekly Trips Chart + Recent Trips */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeeklyChart data={analytics.weeklyTrips} />
        <RecentTrips trips={analytics.recentTrips} />
      </div>
    </div>
  )
}

/* ─── Overview Cards ─── */

function OverviewCards({
  overview,
  messageStats,
}: {
  overview: FlowAnalytics['overview']
  messageStats: FlowAnalytics['messageStats']
}) {
  const cards = [
    { label: 'Total Trips', value: overview.totalTrips, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Completed', value: overview.completedTrips, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Exited', value: overview.exitedTrips, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
    {
      label: 'Completion Rate',
      value: `${overview.completionRate.toFixed(1)}%`,
      icon: TrendingUp,
      color: overview.completionRate >= 50 ? 'text-green-600' : 'text-amber-600',
      bg: overview.completionRate >= 50 ? 'bg-green-50' : 'bg-amber-50',
    },
    {
      label: 'Avg. Duration',
      value: overview.avgTimeToCompleteHours
        ? overview.avgTimeToCompleteHours >= 24
          ? `${(overview.avgTimeToCompleteHours / 24).toFixed(1)}d`
          : `${overview.avgTimeToCompleteHours.toFixed(1)}h`
        : '—',
      icon: Clock,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    { label: 'Messages Sent', value: messageStats.totalSent, icon: Mail, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Delivered', value: messageStats.delivered, icon: MailCheck, color: 'text-green-600', bg: 'bg-green-50' },
    {
      label: 'Delivery Rate',
      value: `${messageStats.deliveryRate.toFixed(1)}%`,
      icon: messageStats.deliveryRate >= 90 ? MailCheck : MailX,
      color: messageStats.deliveryRate >= 90 ? 'text-green-600' : 'text-red-500',
      bg: messageStats.deliveryRate >= 90 ? 'bg-green-50' : 'bg-red-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(card => (
        <div key={card.label} className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', card.bg)}>
              <card.icon className={cn('h-4 w-4', card.color)} />
            </div>
            <span className="text-xs font-medium text-text-secondary">{card.label}</span>
          </div>
          <p className="text-xl font-bold text-heading">
            {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
          </p>
        </div>
      ))}
    </div>
  )
}

/* ─── Node Funnel ─── */

function NodeFunnel({ funnel, totalTrips }: { funnel: FlowAnalytics['nodeFunnel']; totalTrips: number }) {
  if (funnel.length === 0) return null

  const maxEntered = Math.max(...funnel.map(n => n.entered), 1)

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-heading">Node Funnel</h3>
        <span className="text-xs text-text-muted">({totalTrips} total trips)</span>
      </div>

      <div className="space-y-2">
        {funnel.map((node, i) => {
          const barWidth = maxEntered > 0 ? (node.entered / maxEntered) * 100 : 0
          const typeColor = NODE_TYPE_COLORS[node.nodeType] ?? 'bg-gray-400'

          return (
            <div key={node.nodeId} className="flex items-center gap-3">
              {/* Node indicator */}
              <div className="flex items-center gap-2 w-40 shrink-0">
                <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', typeColor)} />
                <span className="text-xs font-medium text-text-primary truncate">{node.label}</span>
              </div>

              {/* Bar */}
              <div className="flex-1 relative">
                <div className="h-7 bg-gray-50 rounded-md overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-md transition-all',
                      node.nodeType === 'end' ? 'bg-gray-200' : 'bg-accent/20',
                    )}
                    style={{ width: `${Math.max(barWidth, 2)}%` }}
                  />
                </div>
                <div className="absolute inset-y-0 left-2 flex items-center">
                  <span className="text-[10px] font-semibold text-text-primary">
                    {node.entered}
                  </span>
                </div>
              </div>

              {/* Drop-off */}
              {i < funnel.length - 1 && node.entered > 0 && (
                <span className={cn(
                  'text-[10px] font-medium w-12 text-right shrink-0',
                  node.dropOffRate > 50 ? 'text-red-500' : node.dropOffRate > 20 ? 'text-amber-600' : 'text-green-600',
                )}>
                  {node.dropOffRate > 0 ? `-${node.dropOffRate.toFixed(0)}%` : '0%'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Weekly Chart ─── */

function WeeklyChart({ data }: { data: FlowAnalytics['weeklyTrips'] }) {
  if (data.length === 0) {
    return (
      <div className="bg-white border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-heading mb-4">Weekly Trips</h3>
        <p className="text-xs text-text-muted text-center py-8">No data in the last 8 weeks</p>
      </div>
    )
  }

  const maxVal = Math.max(...data.map(d => d.entered), 1)

  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-heading mb-4">Weekly Trips (8 weeks)</h3>
      <div className="flex items-end gap-2 h-32">
        {data.map((w, i) => {
          const enteredH = (w.entered / maxVal) * 128
          const completedH = (w.completed / maxVal) * 128
          const weekLabel = new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${weekLabel}: ${w.entered} entered, ${w.completed} completed`}>
              <div className="w-full flex flex-col items-center gap-0.5">
                <div
                  className="w-full bg-accent/30 rounded-t-sm"
                  style={{ height: `${Math.max(enteredH, 2)}px` }}
                />
                {completedH > 0 && (
                  <div
                    className="w-full bg-green-400 rounded-b-sm -mt-0.5"
                    style={{ height: `${completedH}px` }}
                  />
                )}
              </div>
              <span className="text-[9px] text-text-muted">{weekLabel}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-accent/30" />
          <span className="text-[10px] text-text-muted">Entered</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-green-400" />
          <span className="text-[10px] text-text-muted">Completed</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Recent Trips ─── */

function RecentTrips({ trips }: { trips: FlowAnalytics['recentTrips'] }) {
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-heading">Recent Trips</h3>
      </div>
      {trips.length === 0 ? (
        <div className="p-5 text-center">
          <p className="text-xs text-text-muted">No trips yet</p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
          {trips.map(trip => (
            <Link
              key={trip.tripId}
              href={`/customers/${trip.customerId}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-surface transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                  {trip.customerName ?? trip.customerEmail ?? trip.customerId.slice(0, 8)}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  Entered {new Date(trip.enteredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize', TRIP_STATUS_COLORS[trip.status] ?? 'bg-gray-100 text-gray-600')}>
                  {trip.status}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
