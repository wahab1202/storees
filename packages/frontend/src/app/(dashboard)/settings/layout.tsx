'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { useAgentRbacEnabled } from '@/hooks/useProjects'
import type { ReactNode } from 'react'

type Tab = { href: string; label: string; adminOnly?: boolean; featureFlag?: 'agentRbac' }

const tabs: Tab[] = [
  { href: '/settings', label: 'SDK & Integration', adminOnly: true },
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/dealers', label: 'Dealers', adminOnly: true, featureFlag: 'agentRbac' },
  { href: '/settings/team', label: 'Team', adminOnly: true, featureFlag: 'agentRbac' },
]

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = session?.user?.role
  const isAdmin = !role || role === 'admin'
  const agentRbac = useAgentRbacEnabled()

  const visibleTabs = tabs.filter(t => {
    if (t.adminOnly && !isAdmin) return false
    if (t.featureFlag === 'agentRbac' && !agentRbac) return false
    return true
  })

  return (
    <div>
      <nav className="flex gap-1 border-b border-slate-200 mb-6">
        {visibleTabs.map((tab) => {
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
