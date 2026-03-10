'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

type DashboardStats = {
  totalCustomers: number
  activeCustomers: number
  totalOrders: number
  totalRevenue: number
  avgClv: number
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

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>(withProject('/api/dashboard/stats')),
  })
}

export function useDashboardActivity(limit = 20) {
  return useQuery({
    queryKey: ['dashboard-activity', limit],
    queryFn: () => api.get<ActivityItem[]>(withProject('/api/dashboard/activity', { limit })),
  })
}
