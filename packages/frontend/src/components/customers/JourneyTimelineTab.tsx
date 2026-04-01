'use client'

import { useState, useMemo } from 'react'
import { useCustomerJourney, useActivitySummary } from '@/hooks/useCustomerDetail'
import type { JourneyEntryType } from '@/hooks/useCustomerDetail'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  Zap,
  Mail,
  MailOpen,
  MousePointerClick,
  GitBranch,
  LogOut,
  Users,
  ShoppingCart,
  MessageSquare,
  TrendingUp,
  BarChart3,
  Activity,
  Clock,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

/* ─── Type config ─── */

const TYPE_CONFIG: Record<JourneyEntryType, { icon: typeof Zap; color: string; bg: string; label: string }> = {
  event:            { icon: Zap,              color: 'text-blue-600',   bg: 'bg-blue-100',    label: 'Events' },
  campaign_sent:    { icon: Mail,             color: 'text-indigo-600', bg: 'bg-indigo-100',  label: 'Campaign Sent' },
  campaign_opened:  { icon: MailOpen,         color: 'text-green-600',  bg: 'bg-green-100',   label: 'Campaign Opened' },
  campaign_clicked: { icon: MousePointerClick,color: 'text-emerald-600',bg: 'bg-emerald-100', label: 'Campaign Clicked' },
  flow_entered:     { icon: GitBranch,        color: 'text-purple-600', bg: 'bg-purple-100',  label: 'Flow Entered' },
  flow_exited:      { icon: LogOut,           color: 'text-orange-600', bg: 'bg-orange-100',  label: 'Flow Exited' },
  segment_joined:   { icon: Users,            color: 'text-pink-600',   bg: 'bg-pink-100',    label: 'Segment Joined' },
  order:            { icon: ShoppingCart,      color: 'text-amber-600',  bg: 'bg-amber-100',   label: 'Orders' },
  message:          { icon: MessageSquare,     color: 'text-cyan-600',   bg: 'bg-cyan-100',    label: 'Messages' },
}

const ALL_TYPES = Object.keys(TYPE_CONFIG) as JourneyEntryType[]

const FILTER_GROUPS: Array<{ label: string; types: JourneyEntryType[] }> = [
  { label: 'Events', types: ['event'] },
  { label: 'Campaigns', types: ['campaign_sent', 'campaign_opened', 'campaign_clicked'] },
  { label: 'Flows', types: ['flow_entered', 'flow_exited'] },
  { label: 'Segments', types: ['segment_joined'] },
  { label: 'Orders', types: ['order'] },
  { label: 'Messages', types: ['message'] },
]

/* ─── Activity Summary Cards ─── */

function ActivitySummaryCards({ customerId }: { customerId: string }) {
  const { data, isLoading } = useActivitySummary(customerId)
  const summary = data?.data

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  if (!summary) return null

  // Engagement score color
  const scoreColor = summary.engagementScore >= 70
    ? 'text-green-600'
    : summary.engagementScore >= 40
      ? 'text-amber-600'
      : 'text-red-500'

  const scoreLabel = summary.engagementScore >= 70
    ? 'Highly Engaged'
    : summary.engagementScore >= 40
      ? 'Moderately Engaged'
      : 'Low Engagement'

  return (
    <div className="space-y-4 mb-6">
      {/* Top row: engagement score + key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Engagement Score */}
        <div className="bg-white border border-border rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-text-muted" />
            <span className="text-xs font-medium text-text-secondary">Engagement</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn('text-3xl font-bold', scoreColor)}>{summary.engagementScore}</span>
            <span className="text-xs text-text-muted">/ 100</span>
          </div>
          <p className={cn('text-xs font-medium mt-1', scoreColor)}>{scoreLabel}</p>
        </div>

        {/* Quick stats */}
        {[
          { label: 'Events', value: summary.totalEvents, icon: Zap },
          { label: 'Orders', value: summary.totalOrders, icon: ShoppingCart },
          { label: 'Campaigns', value: summary.totalCampaignsReceived, icon: Mail },
          { label: 'Flows', value: summary.totalFlowTrips, icon: GitBranch },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="h-4 w-4 text-text-muted" />
              <span className="text-xs font-medium text-text-secondary">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-heading">{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Bottom row: weekly activity + top events + channels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly Activity Mini Chart */}
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-text-muted" />
            <span className="text-xs font-medium text-text-secondary">Weekly Activity (8 weeks)</span>
          </div>
          {summary.weeklyActivity.length > 0 ? (
            <div className="flex items-end gap-1 h-12">
              {summary.weeklyActivity.map((w, i) => {
                const maxCount = Math.max(...summary.weeklyActivity.map(x => x.count), 1)
                const height = Math.max(4, (w.count / maxCount) * 48)
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${w.week}: ${w.count} events`}>
                    <div
                      className="w-full bg-accent/70 rounded-sm transition-all"
                      style={{ height: `${height}px` }}
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-text-muted">No recent activity</p>
          )}
        </div>

        {/* Top Events */}
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-text-muted" />
            <span className="text-xs font-medium text-text-secondary">Top Events</span>
          </div>
          {summary.topEvents.length > 0 ? (
            <div className="space-y-1.5">
              {summary.topEvents.slice(0, 4).map((e, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-text-primary truncate">{e.eventName.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-medium text-text-secondary ml-2 shrink-0">{e.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">No events yet</p>
          )}
        </div>

        {/* Channel Breakdown */}
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-text-muted" />
            <span className="text-xs font-medium text-text-secondary">Channel Breakdown</span>
          </div>
          {Object.keys(summary.channelBreakdown).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(summary.channelBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([channel, count]) => {
                  const total = Object.values(summary.channelBreakdown).reduce((a, b) => a + b, 0)
                  const pct = total > 0 ? (count / total) * 100 : 0
                  return (
                    <div key={channel}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-text-primary capitalize">{channel}</span>
                        <span className="text-xs text-text-muted">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-accent/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <p className="text-xs text-text-muted">No messages sent</p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Timeline Entry Component ─── */

function TimelineEntry({ entry }: { entry: { id: string; type: JourneyEntryType; timestamp: string; title: string; subtitle: string | null; meta: Record<string, unknown> } }) {
  const [expanded, setExpanded] = useState(false)
  const config = TYPE_CONFIG[entry.type]
  const Icon = config.icon

  const time = new Date(entry.timestamp)
  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const props = entry.meta.properties as Record<string, unknown> | undefined
  const hasDetails = entry.type === 'event' && !!props && Object.keys(props).length > 0

  return (
    <div className="flex gap-3 group">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center">
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', config.bg)}>
          <Icon className={cn('h-4 w-4', config.color)} />
        </div>
        <div className="w-px flex-1 bg-border group-last:bg-transparent" />
      </div>

      {/* Content */}
      <div className="pb-5 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary leading-tight">{entry.title}</p>
            {entry.subtitle && (
              <p className="text-xs text-text-muted mt-0.5">{entry.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-text-muted whitespace-nowrap">{timeStr}</span>
            <span className="text-[10px] text-text-muted whitespace-nowrap">{dateStr}</span>
          </div>
        </div>

        {/* Expandable event properties */}
        {hasDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-accent hover:text-accent-hover transition-colors"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Properties
          </button>
        )}
        {expanded && props && (
          <div className="mt-2 p-2.5 bg-surface rounded-lg border border-border">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(props).slice(0, 12).map(([key, val]) => (
                <div key={key} className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-[10px] text-text-muted shrink-0">{key}:</span>
                  <span className="text-[10px] text-text-primary truncate">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Main Tab Component ─── */

export function JourneyTimelineTab({ customerId }: { customerId: string }) {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set()) // empty = all
  const [showFilters, setShowFilters] = useState(false)
  const [limit] = useState(100)

  // Compute types param from active filters
  const typesForQuery = useMemo(() => {
    if (activeFilters.size === 0) return undefined
    const types: JourneyEntryType[] = []
    for (const group of FILTER_GROUPS) {
      if (activeFilters.has(group.label)) {
        types.push(...group.types)
      }
    }
    return types.length > 0 ? types : undefined
  }, [activeFilters])

  const { data: journeyRes, isLoading } = useCustomerJourney(customerId, { limit, types: typesForQuery })
  const entries = journeyRes?.data ?? []

  // Group entries by date
  const groupedEntries = useMemo(() => {
    const groups: Array<{ date: string; entries: typeof entries }> = []
    let currentDate = ''
    for (const entry of entries) {
      const date = new Date(entry.timestamp).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
      if (date !== currentDate) {
        currentDate = date
        groups.push({ date, entries: [] })
      }
      groups[groups.length - 1].entries.push(entry)
    }
    return groups
  }, [entries])

  const toggleFilter = (label: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <div>
      {/* Activity Summary */}
      <ActivitySummaryCards customerId={customerId} />

      {/* Timeline header + filters */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-heading">Timeline</h3>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
            showFilters || activeFilters.size > 0
              ? 'border-accent bg-accent/5 text-accent'
              : 'border-border text-text-secondary hover:border-gray-300',
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
          {activeFilters.size > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold">
              {activeFilters.size}
            </span>
          )}
        </button>
      </div>

      {/* Filter pills */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-surface rounded-lg border border-border">
          {FILTER_GROUPS.map(group => {
            const isActive = activeFilters.has(group.label)
            const firstType = group.types[0]
            const config = TYPE_CONFIG[firstType]
            const GroupIcon = config.icon
            return (
              <button
                key={group.label}
                onClick={() => toggleFilter(group.label)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
                  isActive
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-text-secondary hover:border-gray-300',
                )}
              >
                <GroupIcon className={cn('h-3 w-3', isActive ? config.color : 'text-text-muted')} />
                {group.label}
              </button>
            )
          })}
          {activeFilters.size > 0 && (
            <button
              onClick={() => setActiveFilters(new Set())}
              className="text-xs text-text-muted hover:text-text-primary transition-colors px-2"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48 mb-1" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 bg-white border border-border rounded-xl">
          <Clock className="h-8 w-8 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No journey events found</p>
          <p className="text-xs text-text-muted mt-1">
            {activeFilters.size > 0 ? 'Try adjusting your filters' : 'Events will appear here as the customer interacts'}
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          {groupedEntries.map(group => (
            <div key={group.date}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3 mt-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider shrink-0">
                  {group.date}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {/* Entries for this date */}
              {group.entries.map(entry => (
                <TimelineEntry key={entry.id} entry={entry} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
