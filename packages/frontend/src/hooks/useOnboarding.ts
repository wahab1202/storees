import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DomainType } from '@storees/shared'

type ProjectCreateResponse = {
  project: {
    id: string
    name: string
    domain_type: DomainType
    integration_type: string
  }
  api_keys?: {
    key_public: string
    key_secret: string
    warning: string
  }
  shopify?: {
    install_url: string | null
    instructions: string
  }
  integration_guide?: IntegrationGuide
  next_step: string
}

type IntegrationStatus = {
  project_id: string
  domain_type: DomainType
  integration_type: string
  status: 'pending' | 'waiting_for_data' | 'active'
  total_events: number
  active_api_keys: number
  has_received_first_event: boolean
  checklist: { step: string; label: string; done: boolean }[]
}

type IntegrationGuideEndpoint = {
  name: string
  method: string
  path: string
  description: string
  curl: string
}

type IntegrationGuide = {
  domain_type: DomainType
  channels: string[]
  api_base_url: string
  authentication: {
    method: string
    headers: Record<string, string>
  }
  endpoints: IntegrationGuideEndpoint[]
  sample_event: Record<string, unknown>
}

type TestEventResponse = {
  event_id: string
  message: string
}

export function useCreateProject() {
  return useMutation({
    mutationFn: (data: { name: string; domain_type: DomainType }) =>
      api.post<ProjectCreateResponse>('/api/onboarding/projects', data),
  })
}

export function useIntegrationStatus(projectId: string | null) {
  return useQuery({
    queryKey: ['integration-status', projectId],
    queryFn: () => api.get<IntegrationStatus>(`/api/onboarding/projects/${projectId}/integration-status`),
    enabled: !!projectId,
    refetchInterval: 5000, // Poll every 5s while on verification page
  })
}

export function useIntegrationGuide(projectId: string | null) {
  return useQuery({
    queryKey: ['integration-guide', projectId],
    queryFn: () => api.get<IntegrationGuide>(`/api/onboarding/projects/${projectId}/guide`),
    enabled: !!projectId,
  })
}

export function useSendTestEvent() {
  return useMutation({
    mutationFn: (projectId: string) =>
      api.post<TestEventResponse>(`/api/onboarding/projects/${projectId}/test-event`, {}),
  })
}

export type { ProjectCreateResponse, IntegrationStatus, IntegrationGuide, IntegrationGuideEndpoint }
