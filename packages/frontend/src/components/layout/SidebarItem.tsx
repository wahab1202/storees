'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type SidebarItemProps = {
  href: string
  label: string
  icon: LucideIcon
  count?: number
}

export function SidebarItem({ href, label, icon: Icon, count }: SidebarItemProps) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(`${href}/`)

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
        size={16}
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
