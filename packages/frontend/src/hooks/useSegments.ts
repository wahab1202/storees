'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { Segment, LifecycleChartData } from '@storees/shared'

export function useSegments() {
  return useQuery({
    queryKey: ['segments'],
    queryFn: () => api.get<Segment[]>(withProject('/api/segments')),
  })
}

export function useSegmentDetail(id: string) {
  return useQuery({
    queryKey: ['segments', id],
    queryFn: () => api.get<Segment>(withProject(`/api/segments/${id}`)),
    enabled: !!id,
  })
}

export function useLifecycleChart() {
  return useQuery({
    queryKey: ['segments', 'lifecycle'],
    queryFn: () => api.get<LifecycleChartData>(withProject('/api/segments/lifecycle')),
  })
}

export function useCreateSegment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; filters: unknown }) =>
      api.post<Segment>(withProject('/api/segments'), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments'] })
      toast.success('Segment created')
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to create segment')
    },
  })
}

export function useUpdateSegment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; filters?: unknown; isActive?: boolean }) =>
      api.patch<Segment>(withProject(`/api/segments/${id}`), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments'] })
      toast.success('Segment updated')
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to update segment')
    },
  })
}

export function useDeleteSegment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(withProject(`/api/segments/${id}`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments'] })
      toast.success('Segment deleted')
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to delete segment')
    },
  })
}

export function useEvaluateSegments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post<{ message: string }>(withProject('/api/segments/evaluate'), {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments'] })
      toast.success('Segments re-evaluated')
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to evaluate segments')
    },
  })
}
