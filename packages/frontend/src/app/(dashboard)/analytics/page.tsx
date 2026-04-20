'use client'

import {
  BarChart3,
  GitBranch,
  Users,
  TrendingUp,
  Clock,
  ShoppingBag,
  ArrowLeftRight,
  Brain,
  FolderOpen,
  Plus,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useSavedAnalyses } from '@/hooks/useAnalytics'

const sections = [
  {
    href: '/analytics/funnels',
    label: 'Funnels',
    description: 'Multi-step event funnels with drop-off analysis',
    icon: GitBranch,
    color: 'text-blue-600 bg-blue-50',
  },
  {
    href: '/analytics/cohorts',
    label: 'Cohorts',
    description: 'Retention heatmap — track how customers come back over time',
    icon: Users,
    color: 'text-purple-600 bg-purple-50',
  },
  {
    href: '/analytics/timeseries',
    label: 'Time Series',
    description: 'Compare metrics over time with period-over-period analysis',
    icon: TrendingUp,
    color: 'text-green-600 bg-green-50',
  },
  {
    href: '/analytics/time-to-event',
    label: 'Time-to-Event',
    description: 'Measure conversion timing — median, p75, p90 between any two events',
    icon: Clock,
    color: 'text-amber-600 bg-amber-50',
  },
  {
    href: '/analytics/products',
    label: 'Product Analytics',
    description: 'Top products by views, purchases, conversion rate, and abandonment',
    icon: ShoppingBag,
    color: 'text-rose-600 bg-rose-50',
  },
  {
    href: '/analytics/transitions',
    label: 'Segment Transitions',
    description: 'Track how customers move between segments over time',
    icon: ArrowLeftRight,
    color: 'text-indigo-600 bg-indigo-50',
    badge: 'New',
  },
  {
    href: '/analytics/predictions',
    label: 'Predictions',
    description: 'AI-powered propensity scoring with explainability',
    icon: Brain,
    color: 'text-violet-600 bg-violet-50',
    badge: 'AI',
  },
]

const TYPE_TO_HREF: Record<string, string> = {
  funnel: '/analytics/funnels',
  timeseries: '/analytics/timeseries',
  'time-to-event': '/analytics/time-to-event',
  product: '/analytics/products',
}

const TYPE_TO_ICON: Record<string, typeof GitBranch> = {
  funnel: GitBranch,
  timeseries: TrendingUp,
  'time-to-event': Clock,
  product: ShoppingBag,
}

export default function AnalyticsPage() {
  const { data: savedData } = useSavedAnalyses()
  const saved = savedData?.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-heading">Analytics</h1>
          <p className="text-sm text-text-secondary mt-1">Understand users, see who is changing, predict what comes next</p>
        </div>
      </div>

      {/* Quick create row */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Quick Start</span>
        <Link
          href="/analytics/funnels"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors"
        >
          <Plus className="w-3 h-3" /> New Funnel
        </Link>
        <Link
          href="/analytics/timeseries"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-medium hover:bg-green-100 transition-colors"
        >
          <Plus className="w-3 h-3" /> New Time Series
        </Link>
        <Link
          href="/analytics/time-to-event"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium hover:bg-amber-100 transition-colors"
        >
          <Plus className="w-3 h-3" /> New Time-to-Event
        </Link>
      </div>

      {/* Report cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {sections.map((section) => {
          const Icon = section.icon
          return (
            <Link
              key={section.href}
              href={section.href}
              className="group border border-border rounded-xl p-6 hover:border-accent/30 hover:shadow-sm transition-all bg-white"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', section.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                {'badge' in section && section.badge && (
                  <span className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded-full uppercase',
                    section.badge === 'AI' ? 'bg-violet-100 text-violet-700' : 'bg-accent/10 text-accent',
                  )}>
                    {section.badge}
                  </span>
                )}
              </div>
              <h2 className="text-base font-semibold text-heading group-hover:text-accent transition-colors">
                {section.label}
              </h2>
              <p className="text-sm text-text-secondary mt-1">{section.description}</p>
            </Link>
          )
        })}
      </div>

      {/* Saved analyses */}
      {saved.length > 0 && (
        <div className="bg-white border border-border rounded-xl">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-heading">Saved Analyses</h2>
            <span className="text-xs text-text-muted ml-1">{saved.length}</span>
          </div>
          <div className="divide-y divide-border/50">
            {saved.slice(0, 10).map(s => {
              const Icon = TYPE_TO_ICON[s.type] ?? BarChart3
              const href = TYPE_TO_HREF[s.type] ?? '/analytics'
              return (
                <Link
                  key={s.id}
                  href={href}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors"
                >
                  <Icon className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-heading">{s.name}</span>
                    <span className="text-xs text-text-muted ml-2 capitalize">{s.type}</span>
                  </div>
                  <span className="text-xs text-text-muted flex-shrink-0">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
