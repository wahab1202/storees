'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { Campaign, CampaignSend } from '@storees/shared'

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Campaign[]>(withProject('/api/campaigns')),
  })
}

export function useCampaignDetail(id: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => api.get<Campaign>(withProject(`/api/campaigns/${id}`)),
    enabled: !!id,
  })
}

export function useCampaignSends(id: string) {
  return useQuery({
    queryKey: ['campaigns', id, 'sends'],
    queryFn: () => api.get<CampaignSend[]>(withProject(`/api/campaigns/${id}/sends`)),
    enabled: !!id,
  })
}

export function useCreateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      subject: string
      htmlBody: string
      segmentId?: string
      fromName?: string
      scheduledAt?: string
    }) => api.post<Campaign>(withProject('/api/campaigns'), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign created')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to create campaign'),
  })
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string
      name?: string
      subject?: string
      htmlBody?: string
      segmentId?: string | null
      fromName?: string | null
      scheduledAt?: string | null
    }) => api.patch<Campaign>(withProject(`/api/campaigns/${id}`), data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] })
      toast.success('Campaign saved')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to save campaign'),
  })
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(withProject(`/api/campaigns/${id}`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign deleted')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to delete campaign'),
  })
}

export function useSendCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ message: string; totalRecipients: number }>(
        withProject(`/api/campaigns/${id}/send`),
        {},
      ),
    onSuccess: (res, id) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] })
      toast.success(res.data?.message ?? 'Campaign dispatched')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to send campaign'),
  })
}
