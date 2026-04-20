'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

export type Agent = {
  id: string
  externalDealerId: string | null
  name: string
  email: string | null
  phone: string | null
  region: string | null
  city: string | null
  managerId: string | null
  isActive: boolean
  createdAt: string
  customerCount: number
}

type CreateAgentInput = {
  name: string
  email?: string
  phone?: string
  region?: string
  city?: string
  externalDealerId?: string
  managerId?: string | null
}

type UpdateAgentInput = Partial<CreateAgentInput> & { isActive?: boolean }

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>(withProject('/api/agents')),
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAgentInput) =>
      api.post<Agent>(withProject('/api/agents'), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useUpdateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAgentInput & { id: string }) =>
      api.patch<Agent>(withProject(`/api/agents/${id}`), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}
