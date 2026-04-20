'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

export type AdminRole = 'admin' | 'manager' | 'agent'

export type TeamMember = {
  id: string
  email: string
  name: string
  role: AdminRole
  agentId: string | null
  agentName: string | null
  agentRegion: string | null
  emailVerified: boolean
  totpEnabled: boolean
  createdAt: string
}

type CreateAdminUserInput = {
  email: string
  name: string
  password: string
  role: AdminRole
  agentId?: string | null
}

type UpdateAdminUserInput = {
  name?: string
  role?: AdminRole
  agentId?: string | null
  password?: string
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<TeamMember[]>(withProject('/api/admin-users')),
  })
}

export function useCreateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAdminUserInput) =>
      api.post<TeamMember>(withProject('/api/admin-users'), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

export function useUpdateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAdminUserInput & { id: string }) =>
      api.patch<TeamMember>(withProject(`/api/admin-users/${id}`), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

export function useDeleteAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(withProject(`/api/admin-users/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}
