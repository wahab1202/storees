import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

type Project = {
  id: string
  name: string
  domainType: string
  integrationType: string
  features?: { agentScopedAccess?: boolean; [key: string]: unknown } | null
  createdAt: string
}

type ProjectFeatures = { agentScopedAccess?: boolean }

/** Returns true if the currently-active project has agent-scoped access enabled. */
export function useAgentRbacEnabled() {
  const { data } = useProjects()
  const projects = data?.data ?? []
  const activeId = typeof window !== 'undefined'
    ? localStorage.getItem('storees-active-project')
    : null
  const active = projects.find(p => p.id === activeId)
  return !!active?.features?.agentScopedAccess
}

type ApiKey = {
  id: string
  name: string
  keyPublic: string
  permissions: string[]
  rateLimit: number
  isActive: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/api/onboarding/projects'),
  })
}

export function useProjectApiKeys(projectId: string) {
  return useQuery({
    queryKey: ['api-keys', projectId],
    queryFn: () => api.get<ApiKey[]>(`/api/api-keys?projectId=${projectId}`),
    enabled: !!projectId,
  })
}

/** Mutate per-project feature flags. Invalidates the projects list so dependent UI re-reads. */
export function useUpdateProjectFeatures(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (features: ProjectFeatures) =>
      api.patch<{ features: ProjectFeatures }>(`/api/onboarding/projects/${projectId}/features`, features),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
