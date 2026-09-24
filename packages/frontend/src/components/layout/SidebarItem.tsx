'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type SidebarItemProps = {
  href: string
  label: string
  icon: Icon
  count?: number
  /** Every href in the sidebar. Needed so an item can tell whether a deeper item
   *  already owns the current page — see `isActive` below. */
  allHrefs?: string[]
}

export function SidebarItem({ href, label, icon: Icon, count, allHrefs }: SidebarItemProps) {
  const pathname = usePathname()

  // THE LONGEST MATCHING HREF WINS.
  //
  // This read `pathname === href || pathname.startsWith(href + '/')`, so a parent lit
  // up for any page beneath it. That is right for a detail page — `/customers/abc123`
  // should keep Customers highlighted, and it has no sidebar item of its own.
  //
  // It is wrong when a nested page IS its own item. Event Mapping lives at
  // `/event-sources/mapping`, so opening it highlighted Event Sources AND Event
  // Mapping at once, and the sidebar stopped saying where you were.
  //
  // Comparing lengths settles both cases with one rule: `/event-sources/mapping` beats
  // `/event-sources`, and `/customers/abc123` still falls to Customers because nothing
  // longer matches it.
  const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`)
  const longestMatch = (allHrefs ?? [href])
    .filter(matches)
    .reduce((a, b) => (b.length > a.length ? b : a), '')
  const isActive = longestMatch === href

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors rounded-md mx-2',
        isActive
          ? 'bg-sidebar-hover text-white border-l-2 border-sidebar-active'
          : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white'
      )}
    >
      <Icon
        size={18}
        weight={isActive ? 'fill' : 'regular'}
        className={cn(isActive ? 'text-sidebar-active' : 'text-sidebar-muted')}
      />
      <span className="flex-1">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cn(
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums',
          isActive ? 'bg-sidebar-active/20 text-sidebar-active' : 'bg-white/10 text-sidebar-muted',
        )}>
          {count > 999 ? '999+' : count}
        </span>
      )}
    </Link>
  )
}
