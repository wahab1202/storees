'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

type DashboardStats = {
  domainType: string
  totalCustomers: number
  activeCustomers: number
  newCustomers: number
  avgClv: number
  // % changes (7d vs prev 7d)
  activeChange: number
  newCustomersChange: number
  // ecommerce
  totalOrders?: number
  totalRevenue?: number
  ordersChange?: number
  revenueChange?: number
  // fintech
  totalTransactions?: number
  transactionVolume?: number
  transactionsChange?: number
  // saas / custom
  totalEvents?: number
  eventsChange?: number
  // SDK engagement (cross-domain)
  pageViews7d?: number
  pageViewsChange?: number
  sessions7d?: number
  sessionsChange?: number
}

type ActivityItem = {
  id: string
  eventName: string
  customerId: string | null
  customerName: string | null
  customerEmail: string | null
  properties: Record<string, unknown>
  platform: string
  timestamp: string
}

type TrendPoint = {
  date: string
  new_customers?: number
  active_customers?: number
  events?: number
  orders?: number
  revenue?: number
  transactions?: number
}

type TrendsData = {
  range: string
  customers: TrendPoint[]
  events: TrendPoint[]
  domain: TrendPoint[]
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>(withProject('/api/dashboard/stats')),
    staleTime: 60_000, // 1 minute — don't refetch on every tab focus
  })
}

export function useDashboardActivity(limit = 20) {
  return useQuery({
    queryKey: ['dashboard-activity', limit],
    queryFn: () => api.get<ActivityItem[]>(withProject('/api/dashboard/activity', { limit })),
    staleTime: 30_000, // 30 seconds — activity is more time-sensitive
  })
}

type EntityCounts = {
  customers: number
  segments: number
  flows: number
  templates: number
  campaigns: number
}

export function useSidebarCounts() {
  return useQuery({
    queryKey: ['sidebar-counts'],
    queryFn: () => api.get<EntityCounts>(withProject('/api/dashboard/counts')),
    staleTime: 120_000, // 2 minutes
  })
}

export function useDashboardTrends(range: '7d' | '14d' | '30d' = '7d') {
  return useQuery({
    queryKey: ['dashboard-trends', range],
    queryFn: () => api.get<TrendsData>(withProject('/api/dashboard/trends', { range })),
    staleTime: 60_000, // 1 minute — trend data doesn't change fast
  })
}
