'use client'

import {
  LayoutDashboard,
  Users,
  PieChart,
  Megaphone,
  Workflow,
  Radio,
  Settings,
  Store,
} from 'lucide-react'
import { SidebarItem } from './SidebarItem'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/segments', label: 'Segments', icon: PieChart },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/flows', label: 'Flows', icon: Workflow },
  { href: '/debugger', label: 'Event Debugger', icon: Radio },
]

const bottomItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/integrations', label: 'Connected Stores', icon: Store },
]

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-sidebar flex flex-col">
      <div className="px-4 py-5">
        <h1 className="text-white text-base font-semibold tracking-wider">
          ◆ STOREES
        </h1>
      </div>

      <nav className="flex-1 flex flex-col gap-1 py-2">
        {navItems.map((item) => (
          <SidebarItem key={item.href} {...item} />
        ))}
      </nav>

      <div className="border-t border-white/10 py-2">
        {bottomItems.map((item) => (
          <SidebarItem key={item.href} {...item} />
        ))}
      </div>
    </aside>
  )
}
