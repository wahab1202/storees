'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type AdminCustomer = {
  id: string
  name: string
  shopifyDomain: string | null
  plan: string
  status: string
  trialEndsAt: string | null
  trialDaysLeft: number | null
  signupSource: string
  createdAt: string
  ownerEmail: string | null
  contacts: number
  messagesSent: number
  lastActiveAt: string | null
}

type Filters = { status?: string; source?: string; endingSoon?: boolean; search?: string; page?: number }

export function useAdminCustomers(filters: Filters = {}) {
  const qs = new URLSearchParams()
  if (filters.status) qs.set('status', filters.status)
  if (filters.source) qs.set('source', filters.source)
  if (filters.endingSoon) qs.set('endingSoon', 'true')
  if (filters.search) qs.set('search', filters.search)
  if (filters.page) qs.set('page', String(filters.page))
  const suffix = qs.toString() ? `?${qs}` : ''
  return useQuery({
    queryKey: ['admin-customers', filters],
    queryFn: () => api.get<AdminCustomer[]>(`/api/super-admin/customers${suffix}`),
  })
}

export type AdminCustomerDetail = {
  id: string
  name: string
  shopifyDomain: string | null
  plan: string
  status: string
  trialStartedAt: string | null
  trialEndsAt: string | null
  trialDaysLeft: number | null
  signupSource: string
  createdAt: string
  entitlements: { features: Record<string, boolean>; limits: Record<string, number> }
  usage: { contacts: number; sentByChannel: Record<string, number> }
  admins: { email: string; name: string | null }[]
  timeline: { eventName: string; at: string }[]
}

export function useAdminCustomerDetail(projectId: string | null) {
  return useQuery({
    queryKey: ['admin-customer', projectId],
    queryFn: () => api.get<AdminCustomerDetail>(`/api/super-admin/customers/${projectId}`),
    enabled: !!projectId,
  })
}

export function useUpdateCustomerPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ...body }: { projectId: string; plan?: string; status?: string; extendDays?: number }) =>
      api.post(`/api/super-admin/customers/${projectId}/plan`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-customers'] }),
  })
}
