'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { Flow } from '@storees/shared'

export type FlowWithCounts = Flow & {
  tripCounts: {
    active: number
    waiting: number
    completed: number
    exited: number
    total: number
  }
}

export function useFlows() {
  return useQuery({
    queryKey: ['flows'],
    queryFn: () => api.get<FlowWithCounts[]>(withProject('/api/flows')),
  })
}

export function useFlowDetail(id: string) {
  return useQuery({
    queryKey: ['flows', id],
    queryFn: () => api.get<FlowWithCounts>(withProject(`/api/flows/${id}`)),
    enabled: !!id,
  })
}

export function useCreateFlow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; triggerEvent?: string }) =>
      api.post<Flow>(withProject('/api/flows'), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success('Flow created')
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to create flow')
    },
  })
}

export function useUpdateFlowStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'draft' | 'active' | 'paused' }) =>
      api.patch<Flow>(withProject(`/api/flows/${id}/status`), { status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success(`Flow ${variables.status === 'active' ? 'activated' : variables.status === 'paused' ? 'paused' : 'set to draft'}`)
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to update flow status')
    },
  })
}

export function useDeleteFlow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(withProject(`/api/flows/${id}`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success('Flow deleted')
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to delete flow')
    },
  })
}

// Flow analytics types
export type FlowAnalytics = {
  overview: {
    totalTrips: number
    activeTrips: number
    completedTrips: number
    exitedTrips: number
    completionRate: number
    avgTimeToCompleteHours: number | null
  }
  nodeFunnel: Array<{
    nodeId: string
    nodeType: string
    label: string
    entered: number
    exited: number
    dropOffRate: number
  }>
  weeklyTrips: Array<{
    week: string
    entered: number
    completed: number
    exited: number
  }>
  recentTrips: Array<{
    tripId: string
    customerId: string
    customerName: string | null
    customerEmail: string | null
    status: string
    currentNodeId: string
    enteredAt: string
    exitedAt: string | null
  }>
  messageStats: {
    totalSent: number
    delivered: number
    failed: number
    deliveryRate: number
  }
}

export function useFlowAnalytics(id: string) {
  return useQuery({
    queryKey: ['flows', id, 'analytics'],
    queryFn: () => api.get<FlowAnalytics>(withProject(`/api/flows/${id}/analytics`)),
    enabled: !!id,
    refetchInterval: 30_000,
  })
}

export function useCloneFlow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Flow>(withProject(`/api/flows/${id}/clone`), {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success('Flow cloned')
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to clone flow')
    },
  })
}

export function useUpdateFlow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; nodes?: unknown; exitConfig?: unknown }) =>
      api.patch<Flow>(withProject(`/api/flows/${id}`), data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      queryClient.invalidateQueries({ queryKey: ['flows', variables.id] })
      toast.success('Flow saved')
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to save flow')
    },
  })
}
