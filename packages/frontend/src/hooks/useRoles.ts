'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

export type RolePermissions = {
  viewContactPii: boolean
  exportCustomers: boolean
  screens: string[] | '*'
}

export type Role = {
  id: string
  name: string
  description: string | null
  permissions: RolePermissions
  isSystem: boolean
  memberCount: number
  createdAt: string
}

type RoleInput = {
  name: string
  description?: string | null
  permissions: RolePermissions
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Role[]>(withProject('/api/roles')),
  })
}

const FULL_CAPS: RolePermissions = { viewContactPii: true, exportCustomers: true, screens: '*' }

/**
 * The current viewer's effective capabilities, resolved server-side. Used to hide
 * actions the role can't perform (e.g. the export button). The backend enforces
 * these independently — this is cosmetic. Defaults to full access while loading.
 */
export function useMyCapabilities(): RolePermissions {
  const { data } = useQuery({
    queryKey: ['me', 'capabilities'],
    queryFn: () => api.get<{ capabilities?: RolePermissions }>('/api/auth/me'),
    staleTime: 60_000,
  })
  return data?.data?.capabilities ?? FULL_CAPS
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RoleInput) => api.post<Role>(withProject('/api/roles'), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<RoleInput> & { id: string }) =>
      api.patch<Role>(withProject(`/api/roles/${id}`), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(withProject(`/api/roles/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}
