'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  PieChart,
  Megaphone,
  Workflow,
  Radio,
  Settings,
  Store,
  Plus,
  FileText,
  Menu,
  X,
} from 'lucide-react'
import { SidebarItem } from './SidebarItem'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/segments', label: 'Segments', icon: PieChart },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/flows', label: 'Flows', icon: Workflow },
  { href: '/debugger', label: 'Event Debugger', icon: Radio },
]

const bottomItems = [
  { href: '/onboarding', label: 'New Project', icon: Plus },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/integrations', label: 'Connected Stores', icon: Store },
]

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const sidebarContent = (
    <>
      <div className="px-4 py-5 flex items-center justify-between">
        <img
          src="https://waioz.com/_next/image?url=https%3A%2F%2Fmosaic-waioz.s3.ap-south-1.amazonaws.com%2FStorees_logo_bf01e5c580.webp&w=384&q=75"
          alt="Storees"
          className="h-8 w-auto object-contain brightness-0 invert"
        />
        {/* Close button — mobile only */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 text-sidebar-muted hover:text-white transition-colors"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
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
    </>
  )

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-sidebar flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 text-sidebar-muted hover:text-white transition-colors"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <img
          src="https://waioz.com/_next/image?url=https%3A%2F%2Fmosaic-waioz.s3.ap-south-1.amazonaws.com%2FStorees_logo_bf01e5c580.webp&w=384&q=75"
          alt="Storees"
          className="h-6 w-auto object-contain brightness-0 invert"
        />
      </div>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar drawer (mobile) / fixed sidebar (desktop) */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 left-0 w-60 bg-sidebar flex flex-col z-50 transition-transform duration-200',
          // Desktop: always visible
          'lg:translate-x-0',
          // Mobile: slide in/out
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
