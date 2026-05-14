import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { toast } from 'sonner'

// Gap 9: ad-platform Conversion API destinations. Each row stores
// credentials for one pixel/account on one platform. The aggregator
// fans revenue events out to every active destination automatically.

export type AdConversionPlatform = 'meta' | 'google' | 'tiktok' | 'snap'

export type AdConversionDestination = {
  id: string
  platform: AdConversionPlatform
  name: string
  pixelId: string
  testEventCode: string | null
  status: 'active' | 'paused' | 'error'
  eventsSent: number
  eventsFailed: number
  lastSentAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  createdAt: string
  updatedAt: string
}

export function useAdConversionDestinations() {
  return useQuery({
    queryKey: ['ad-conversions'],
    queryFn: () => api.get<AdConversionDestination[]>(withProject('/api/ad-conversions')),
    refetchInterval: (q) => {
      // Refresh once a minute so eventsSent counters drift up live
      const data = q.state.data?.data
      return Array.isArray(data) && data.some((d) => d.status === 'active') ? 60_000 : false
    },
  })
}

export function useCreateAdConversion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      platform: AdConversionPlatform
      name: string
      pixelId: string
      accessToken: string
      testEventCode?: string | null
    }) => api.post<{ id: string }>(withProject('/api/ad-conversions'), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-conversions'] })
      toast.success('Conversion API destination added')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to add destination'),
  })
}

export function useUpdateAdConversion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: {
      id: string
      name?: string
      accessToken?: string
      testEventCode?: string | null
      status?: string
    }) => api.patch(withProject(`/api/ad-conversions/${id}`), patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-conversions'] })
      toast.success('Destination updated')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to update'),
  })
}

export function useDeleteAdConversion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(withProject(`/api/ad-conversions/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-conversions'] })
      toast.success('Destination removed')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to remove'),
  })
}

export function useTestAdConversion() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ message: string }>(withProject(`/api/ad-conversions/${id}/test`), {}),
    onSuccess: (res) => toast.success(res.data?.message ?? 'Test event sent'),
    onError: (err: Error) => toast.error(err.message ?? 'Test failed'),
  })
}
