'use client'

import { cn } from '@/lib/utils'

type StatusTab = {
  key: string
  label: string
  count: number
}

type StatusStripProps = {
  tabs: StatusTab[]
  active: string | null
  onChange: (key: string | null) => void
}

export function StatusStrip({ tabs, active, onChange }: StatusStripProps) {
  return (
    <div className="bg-white border border-border rounded-lg flex items-stretch overflow-x-auto">
      {tabs.map((tab, i) => {
        const isActive = active === tab.key || (active === null && i === 0)
        return (
          <button
            key={tab.key}
            onClick={() => onChange(i === 0 ? null : tab.key)}
            className={cn(
              // Same rule as the dashboard's metric strip: grow to fill, but never
              // shrink below the number inside. `flex-1` is basis:0 + shrink:1, so a
              // cell collapses to the 100px floor and a long count (1,23,45,678) runs
              // out of the box and over its neighbour.
              'grow shrink-0 basis-auto min-w-[100px] px-4 py-3 text-center transition-colors border-b-2',
              isActive
                ? 'border-accent bg-accent/5'
                : 'border-transparent hover:bg-surface',
            )}
          >
            <p className={cn(
              'text-xl font-bold tabular-nums',
              isActive ? 'text-accent' : 'text-heading',
            )}>
              {tab.count > 0 ? tab.count : '--'}
            </p>
            <p className={cn(
              'text-[10px] font-semibold uppercase tracking-wider mt-0.5',
              isActive ? 'text-accent' : 'text-text-muted',
            )}>
              {tab.label}
            </p>
          </button>
        )
      })}
    </div>
  )
}
