import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type ClientUser = {
  id: string
  email: string
  name: string
  role: string
  projectId: string | null
  projectIds: string[]
  createdAt: string
}

/** Super-admin: list all client accounts (non-super-admins) + their memberships. */
export function useClients() {
  return useQuery({
    queryKey: ['super-admin', 'clients'],
    queryFn: () => api.get<ClientUser[]>('/api/super-admin/clients'),
  })
}

export function useCreateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; name: string; password: string; projectId: string }) =>
      api.post<{ id: string }>('/api/super-admin/clients', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super-admin', 'clients'] }),
  })
}

export function useLinkClientProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, projectId }: { userId: string; projectId: string }) =>
      api.post(`/api/super-admin/clients/${userId}/link`, { projectId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super-admin', 'clients'] }),
  })
}

export function useUnlinkClientProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, projectId }: { userId: string; projectId: string }) =>
      api.delete(`/api/super-admin/clients/${userId}/link/${projectId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super-admin', 'clients'] }),
  })
}
