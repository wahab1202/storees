'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

const tabs = [
  { href: '/settings', label: 'SDK & Integration' },
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/security', label: 'Security' },
]

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      <nav className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map((tab) => {
          const isActive = tab.href === '/settings'
            ? pathname === '/settings'
            : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
