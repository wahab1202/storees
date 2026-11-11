'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

type Me = {
  id: string
  email: string
  role: string
  isSuperAdmin: boolean
}

/** The current viewer's identity + role, used to gate admin-only actions. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Me>('/api/auth/me'),
    staleTime: 60_000,
  })
}

/** True when the viewer may run data-subject (DSAR) actions — matches the backend's requireRole('admin'). */
export function useIsAdmin(): boolean {
  const { data } = useMe()
  return data?.data?.role === 'admin'
}

/**
 * Right of access: fetch the full dataset held on a customer and trigger a
 * client-side JSON download. Returns a mutation so callers get loading/error state.
 */
export function useExportCustomerData(customerId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.get<Record<string, unknown>>(
        withProject(`/api/customers/${customerId}/data-export`),
      )
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `customer-${customerId}-export.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      return res.data
    },
  })
}

/** Right to erasure: anonymise the customer across all PII stores. Irreversible. */
export function useEraseCustomer(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ erased: boolean }>(withProject(`/api/customers/${customerId}/erase`), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
