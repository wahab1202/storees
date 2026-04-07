'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { Campaign, CampaignSend, CampaignContentType, CampaignChannel, CampaignDeliveryType, ConversionGoal, PeriodicSchedule } from '@storees/shared'

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
      channel?: CampaignChannel
      deliveryType?: CampaignDeliveryType
      subject?: string
      htmlBody?: string
      bodyText?: string
      segmentId?: string
      fromName?: string
      scheduledAt?: string
      contentType?: CampaignContentType
      previewText?: string
      templateId?: string
      conversionGoals?: ConversionGoal[]
      goalTrackingHours?: number
      deliveryLimit?: number | null
      periodicSchedule?: PeriodicSchedule
      abTestEnabled?: boolean
      abSplitPct?: number
      abVariantBSubject?: string
      abVariantBHtmlBody?: string
      abVariantBBodyText?: string
      abWinnerMetric?: string
      abAutoSendWinner?: boolean
      abTestDurationHours?: number
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
      bodyText?: string
      segmentId?: string | null
      fromName?: string | null
      scheduledAt?: string | null
      contentType?: CampaignContentType
      previewText?: string | null
      conversionGoals?: ConversionGoal[]
      goalTrackingHours?: number
      deliveryLimit?: number | null
      periodicSchedule?: PeriodicSchedule | null
      abTestEnabled?: boolean
      abSplitPct?: number
      abVariantBSubject?: string | null
      abVariantBHtmlBody?: string | null
      abVariantBBodyText?: string | null
      abWinnerMetric?: string
      abAutoSendWinner?: boolean
      abTestDurationHours?: number
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

export function useRetryCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ message: string; retryCount: number }>(
        withProject(`/api/campaigns/${id}/retry`),
        {},
      ),
    onSuccess: (res, id) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] })
      queryClient.invalidateQueries({ queryKey: ['campaign-sends', id] })
      toast.success(res.data?.message ?? 'Retrying failed recipients')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to retry'),
  })
}

// Campaign analytics types
export type CampaignAnalytics = {
  funnel: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    complained: number
    converted: number
    deliveryRate: number
    openRate: number
    clickRate: number
    bounceRate: number
    conversionRate: number
  }
  conversions: Array<{
    goalName: string
    eventName: string
    conversions: number
    conversionRate: number
    totalRecipients: number
    revenue: number
  }>
  timeline: Array<{
    hour: string
    delivered: number
    opened: number
    clicked: number
  }>
  topRecipients: Array<{
    customerId: string
    email: string
    name: string | null
    opened: boolean
    clicked: boolean
    converted: boolean
    revenue: number
  }>
  summary: {
    totalRevenue: number
    avgRevenuePerRecipient: number
    avgRevenuePerConversion: number
    bestPerformingGoal: string | null
  }
}

export type AbTestResults = {
  variantA: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number }
  variantB: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number }
  winner: 'A' | 'B' | 'tie'
  confidence: number
}

export function useCampaignAnalytics(id: string) {
  return useQuery({
    queryKey: ['campaigns', id, 'analytics'],
    queryFn: () => api.get<CampaignAnalytics>(withProject(`/api/campaigns/${id}/analytics`)),
    enabled: !!id,
    refetchInterval: 30_000, // Refresh every 30s for live campaigns
  })
}

export function useCampaignAbResults(id: string, enabled = false) {
  return useQuery({
    queryKey: ['campaigns', id, 'ab-results'],
    queryFn: () => api.get<AbTestResults>(withProject(`/api/campaigns/${id}/ab-results`)),
    enabled: !!id && enabled,
  })
}
