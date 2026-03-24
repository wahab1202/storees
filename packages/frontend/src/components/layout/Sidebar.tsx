'use client'

import { useState, useEffect, useRef } from 'react'
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
  FolderOpen,
  Menu,
  X,
  ChevronDown,
  Check,
  Landmark,
  ShoppingBag,
  Monitor,
  Globe,
  BarChart3,
} from 'lucide-react'
import { SidebarItem } from './SidebarItem'
import { cn } from '@/lib/utils'
import { useProjects } from '@/hooks/useProjects'
import { useSwitchProject } from '@/lib/projectContext'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/segments', label: 'Segments', icon: PieChart },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/flows', label: 'Flows', icon: Workflow },
  { href: '/debugger', label: 'Event Debugger', icon: Radio },
]

const bottomItems = [
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/onboarding', label: 'New Project', icon: Plus },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/integrations', label: 'Connected Stores', icon: Store },
]

const DOMAIN_ICONS: Record<string, typeof Globe> = {
  ecommerce: ShoppingBag,
  fintech: Landmark,
  saas: Monitor,
  custom: Globe,
}

function ProjectSwitcher() {
  const { data } = useProjects()
  const switchProject = useSwitchProject()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const projects = data?.data ?? []

  // Read current project from localStorage
  const currentId = typeof window !== 'undefined'
    ? localStorage.getItem('storees-active-project')
    : null
  const currentProject = projects.find(p => p.id === currentId)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (projects.length === 0) return null

  const DomainIcon = currentProject ? (DOMAIN_ICONS[currentProject.domainType] || Globe) : Globe

  return (
    <div ref={ref} className="relative px-3 pb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
      >
        <DomainIcon size={14} className="text-sidebar-active flex-shrink-0" />
        <span className="flex-1 text-xs font-medium text-white truncate">
          {currentProject?.name ?? 'Select Project'}
        </span>
        <ChevronDown size={12} className={cn('text-sidebar-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-[#1e293b] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50 max-h-64 overflow-y-auto">
          {projects.map(project => {
            const Icon = DOMAIN_ICONS[project.domainType] || Globe
            const isActive = project.id === currentId
            return (
              <button
                key={project.id}
                onClick={() => {
                  setOpen(false)
                  if (!isActive) switchProject(project.id, project.name)
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 transition-colors',
                  isActive && 'bg-white/10',
                )}
              >
                <Icon size={14} className={cn('flex-shrink-0', isActive ? 'text-sidebar-active' : 'text-sidebar-muted')} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs font-medium truncate', isActive ? 'text-white' : 'text-slate-300')}>
                    {project.name}
                  </p>
                  <p className="text-[10px] text-slate-500 capitalize">{project.domainType}</p>
                </div>
                {isActive && <Check size={12} className="text-sidebar-active flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

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

      {/* Project Switcher */}
      <ProjectSwitcher />

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
