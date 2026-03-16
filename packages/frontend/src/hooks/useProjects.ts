import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

type Project = {
  id: string
  name: string
  domainType: string
  integrationType: string
  createdAt: string
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
