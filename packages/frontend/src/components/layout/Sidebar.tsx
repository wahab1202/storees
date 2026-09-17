'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
// Phosphor icons, aliased to the previous lucide names so usages below are
// unchanged. Prototype for the app-wide icon refresh.
import {
  SquaresFour as LayoutDashboard,
  Users,
  ChartPie as PieChart,
  Megaphone,
  FlowArrow as Workflow,
  Broadcast as Radio,
  Scroll as ScrollText,
  GearSix as Settings,
  Plus,
  FileText,
  FolderOpen,
  List as Menu,
  X,
  CaretDown as ChevronDown,
  Check,
  Bank as Landmark,
  ShoppingBag,
  Monitor,
  Globe,
  ChartBar as BarChart3,
  SignOut as LogOut,
  ShieldCheck,
  UserCircle,
  PlugsConnected as Webhook,
  ArrowsLeftRight as EventMapIcon,
} from '@phosphor-icons/react'
import { SidebarItem } from './SidebarItem'
import { cn } from '@/lib/utils'
import { useProjects } from '@/hooks/useProjects'
import { useSwitchProject } from '@/lib/projectContext'
import { useSidebarCounts } from '@/hooks/useDashboard'

type AdminRole = 'admin' | 'manager' | 'agent'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean       // project-admin (role='admin') and up
  superAdminOnly?: boolean  // cross-tenant platform operator only
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/segments', label: 'Segments', icon: PieChart },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/templates', label: 'Templates', icon: FileText, adminOnly: true },
  { href: '/flows', label: 'Flows', icon: Workflow, adminOnly: true },
  { href: '/event-sources', label: 'Event Sources', icon: Webhook, adminOnly: true },
  { href: '/event-sources/mapping', label: 'Event Mapping', icon: EventMapIcon, adminOnly: true },
  { href: '/debugger', label: 'Event Debugger', icon: Radio, adminOnly: true },
  { href: '/logs', label: 'Notification Logs', icon: ScrollText, adminOnly: true },
]

const bottomItems: NavItem[] = [
  { href: '/clients', label: 'Clients', icon: UserCircle, superAdminOnly: true },
  { href: '/projects', label: 'Projects', icon: FolderOpen, superAdminOnly: true },
  { href: '/onboarding', label: 'New Project', icon: Plus, superAdminOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
  // Connected Stores retired — store connections now live per-project in the
  // Projects → Data Sources panel (unified with all data connectors).
]

// Fail-CLOSED: an undefined role is NOT treated as admin (the backend always sets
// role; the old fail-open let a role-less session see every admin surface). Nav
// visibility is cosmetic — the backend enforces access — but it must not advertise
// super-admin surfaces to clients.
function visibleFor(role: AdminRole | undefined, isSuperAdmin: boolean, items: NavItem[]): NavItem[] {
  const isAdmin = role === 'admin'
  return items.filter(i => {
    if (i.superAdminOnly) return isSuperAdmin
    if (i.adminOnly) return isAdmin
    return true
  })
}

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

  // A client with a single project doesn't need a switcher — show it as a label.
  const single = projects.length <= 1
  const display = currentProject ?? projects[0]
  const DomainIcon = display ? (DOMAIN_ICONS[display.domainType] || Globe) : Globe

  return (
    <div ref={ref} className="relative px-3 pb-3">
      <button
        onClick={single ? undefined : () => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/5 text-left',
          single ? 'cursor-default' : 'hover:bg-white/10 transition-colors',
        )}
      >
        <DomainIcon size={14} className="text-sidebar-active flex-shrink-0" />
        <span className="flex-1 text-xs font-medium text-white truncate">
          {display?.name ?? 'Select Project'}
        </span>
        {!single && <ChevronDown size={12} className={cn('text-sidebar-muted transition-transform', open && 'rotate-180')} />}
      </button>

      {!single && open && (
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

function UserMenu() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!session?.user) return null

  const initials = (session.user.name ?? session.user.email ?? '?')
    .split(' ')
    .map(s => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div ref={ref} className="relative px-3 py-3 border-t border-white/10">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-semibold text-white">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{session.user.name}</p>
          <p className="text-[10px] text-sidebar-muted truncate">{session.user.email}</p>
        </div>
      </button>

      {open && (
        <div className="absolute left-3 right-3 bottom-full mb-1 bg-[#1e293b] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          <Link
            href="/settings/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-300 hover:bg-white/5 transition-colors"
          >
            <UserCircle size={14} />
            Account
          </Link>
          <Link
            href="/settings/security"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-300 hover:bg-white/5 transition-colors"
          >
            <ShieldCheck size={14} />
            Security
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-400 hover:bg-white/5 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = session?.user?.role as AdminRole | undefined
  const isSuperAdmin = session?.user?.isSuperAdmin === true
  const { data: countsData } = useSidebarCounts()
  const counts = countsData?.data

  const visibleNavItems = visibleFor(role, isSuperAdmin, navItems)
  const visibleBottomItems = visibleFor(role, isSuperAdmin, bottomItems)

  // Every href on screen, so each item can tell whether a deeper one owns the current
  // page. Without it a parent and its nested child both highlight — see SidebarItem.
  const allHrefs = [...visibleNavItems, ...visibleBottomItems].map(i => i.href)

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
      <div className="shrink-0 px-4 py-5 flex items-center justify-between">
        <img
          src="https://cdn.waioz.com/webpimg/imgi_19_image.webp"
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
      <div className="shrink-0"><ProjectSwitcher /></div>

      {/*
        THE NAV SCROLLS; EVERYTHING ELSE STAYS PUT.

        `flex-1` alone does not make a flex child shrink — its default `min-height:auto`
        keeps it at least as tall as its content. So once the item list outgrew the
        viewport the nav simply pushed the footer off the bottom of the screen, and the
        signed-in account disappeared with no way to reach it. Three super-admin items
        were enough to do it on a laptop.

        `min-h-0` lets it shrink, `overflow-y-auto` gives the overflow somewhere to go,
        and the blocks above and below are pinned with `shrink-0` so the account and
        Settings are reachable at any window height.
      */}
      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 py-2">
        {visibleNavItems.map((item) => {
          const countMap: Record<string, number | undefined> = {
            '/customers': counts?.customers,
            '/segments': counts?.segments,
            '/campaigns': counts?.campaigns,
            '/templates': counts?.templates,
            '/flows': counts?.flows,
          }
          return (
            <SidebarItem key={item.href} {...item} allHrefs={allHrefs} count={countMap[item.href]} />
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 py-2">
        {visibleBottomItems.map((item) => (
          <SidebarItem key={item.href} {...item} allHrefs={allHrefs} />
        ))}
      </div>

      <div className="shrink-0"><UserMenu /></div>
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
          src="https://cdn.waioz.com/webpimg/imgi_19_image.webp"
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
