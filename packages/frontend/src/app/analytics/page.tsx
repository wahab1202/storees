'use client'

import { BarChart3, GitBranch, Users } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

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
]

export default function AnalyticsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-heading">Analytics</h1>
        <p className="text-sm text-text-secondary mt-1">Deep dive into customer behaviour</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map((section) => {
          const Icon = section.icon
          return (
            <Link
              key={section.href}
              href={section.href}
              className="group border border-border rounded-xl p-6 hover:border-accent/30 hover:shadow-sm transition-all bg-white"
            >
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-4', section.color)}>
                <Icon className="w-5 h-5" />
              </div>
              <h2 className="text-base font-semibold text-heading group-hover:text-accent transition-colors">
                {section.label}
              </h2>
              <p className="text-sm text-text-secondary mt-1">{section.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
