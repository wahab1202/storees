'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { Campaign, CampaignSend, CampaignContentType, CampaignChannel, CampaignDeliveryType, CampaignSendTimeMode, CampaignUtmParameters, ConversionGoal, GmailAnnotation, PeriodicSchedule, FilterConfig, TemplateVariable } from '@storees/shared'
import type { EmailTemplate } from '@/lib/emailTypes'

export type CampaignAttachmentUpload = {
  filename: string
  mime: string
  sizeBytes: number
  contentBase64: string
}

export function useCampaigns(opts?: { archivedOnly?: boolean; includeArchived?: boolean }) {
  const params: Record<string, string> = {}
  if (opts?.archivedOnly) params.archivedOnly = 'true'
  else if (opts?.includeArchived) params.includeArchived = 'true'
  const key = opts?.archivedOnly ? 'archived' : opts?.includeArchived ? 'all' : 'active'
  return useQuery({
    queryKey: ['campaigns', key],
    queryFn: () => api.get<Campaign[]>(withProject('/api/campaigns', params)),
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
      emailBuilderTemplate?: EmailTemplate | null
      bodyText?: string
      segmentId?: string
      fromName?: string
      fromEmail?: string
      replyToEmail?: string
      ccEmails?: string[]
	      bccEmails?: string[]
	      gmailAnnotation?: GmailAnnotation | null
	      utmParameters?: CampaignUtmParameters | null
	      scheduledAt?: string
      contentType?: CampaignContentType
      previewText?: string
      templateId?: string
      conversionGoals?: ConversionGoal[]
      goalTrackingHours?: number
      currency?: string | null
      pushPlatforms?: ('android' | 'ios' | 'web')[]
      pushContent?: Record<string, { title: string; body: string; imageUrl?: string; clickUrl?: string }>
      deliveryLimit?: number | null
      ignoreFrequencyCap?: boolean
      countForFrequencyCap?: boolean
      sendTimeMode?: CampaignSendTimeMode
      scheduleTimezone?: string | null
      periodicSchedule?: PeriodicSchedule
      abTestEnabled?: boolean
      abSplitPct?: number
      abVariantBSubject?: string
      abVariantBHtmlBody?: string
      abVariantBBodyText?: string
      abWinnerMetric?: string
      abAutoSendWinner?: boolean
      abTestDurationHours?: number
      tags?: string[]
      audienceFilter?: FilterConfig
      excludeAudienceFilter?: FilterConfig
      audienceCap?: number
      controlGroupPct?: number
      variables?: TemplateVariable[]
      subscriptionCategoryIds?: string[]
      attachmentUploads?: CampaignAttachmentUpload[]
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
      emailBuilderTemplate?: EmailTemplate | null
      bodyText?: string
      segmentId?: string | null
      fromName?: string | null
      fromEmail?: string | null
      replyToEmail?: string | null
      ccEmails?: string[]
	      bccEmails?: string[]
	      gmailAnnotation?: GmailAnnotation | null
	      utmParameters?: CampaignUtmParameters | null
	      scheduledAt?: string | null
      contentType?: CampaignContentType
      previewText?: string | null
      templateId?: string | null
      conversionGoals?: ConversionGoal[]
      goalTrackingHours?: number
      currency?: string | null
      pushPlatforms?: ('android' | 'ios' | 'web')[]
      pushContent?: Record<string, { title: string; body: string; imageUrl?: string; clickUrl?: string }>
      deliveryLimit?: number | null
      ignoreFrequencyCap?: boolean
      countForFrequencyCap?: boolean
      sendTimeMode?: CampaignSendTimeMode
      scheduleTimezone?: string | null
      periodicSchedule?: PeriodicSchedule | null
      abTestEnabled?: boolean
      abSplitPct?: number
      abVariantBSubject?: string | null
      abVariantBHtmlBody?: string | null
      abVariantBBodyText?: string | null
      abWinnerMetric?: string
      abAutoSendWinner?: boolean
      abTestDurationHours?: number
      tags?: string[]
      audienceFilter?: FilterConfig | null
      excludeAudienceFilter?: FilterConfig | null
      audienceCap?: number | null
      controlGroupPct?: number
      variables?: TemplateVariable[]
      subscriptionCategoryIds?: string[]
      attachmentUploads?: CampaignAttachmentUpload[]
      deleteAttachmentIds?: string[]
    }) => api.patch<Campaign>(withProject(`/api/campaigns/${id}`), data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] })
      toast.success('Campaign saved')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to save campaign'),
  })
}

export type CampaignAudiencePreview = {
  totalCandidates: number
  reachable: number
  suppressed: number
  optedOut: number
  subscriptionBlocked: number
  serviceWindowBlocked: number
  frequencyCapped: number
  deliverable: number
  estimatedHoldouts: number
  estimatedRecipients: number
  audienceCap: number | null
  stalePct: number
  warning: string | null
}

export function usePreviewCampaignAudience() {
  return useMutation({
    mutationFn: (data: {
      channel?: CampaignChannel
      segmentId?: string | null
      audienceFilter?: FilterConfig | null
      excludeAudienceFilter?: FilterConfig | null
      audienceCap?: number | null
      controlGroupPct?: number
      subscriptionCategoryIds?: string[]
      templateId?: string | null
      ignoreFrequencyCap?: boolean
    }) => api.post<CampaignAudiencePreview>(withProject('/api/campaigns/audience-preview'), data),
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

export function useArchiveCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Campaign>(withProject(`/api/campaigns/${id}/archive`), {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign archived')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to archive campaign'),
  })
}

export function useUnarchiveCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Campaign>(withProject(`/api/campaigns/${id}/unarchive`), {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign restored')
    },
    onError: (err) => toast.error(err.message ?? 'Failed to restore campaign'),
  })
}

export function useDuplicateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Campaign>(withProject(`/api/campaigns/${id}/duplicate`), {}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success(`Duplicated as "${res.data?.name ?? 'Copy'}"`)
    },
    onError: (err) => toast.error(err.message ?? 'Failed to duplicate campaign'),
  })
}

export type StaleListAudit = {
  totalReachable: number
  suppressed: number
  optedOut: number
  neverOpened: number
  stalePct: number
  warning: string
}

/** Thrown by useSendCampaign on 409 — caller surfaces a confirm dialog and re-calls with force=true. */
export class StaleListError extends Error {
  audit: StaleListAudit
  constructor(audit: StaleListAudit) {
    super(audit.warning)
    this.name = 'StaleListError'
    this.audit = audit
  }
}

export function useSendCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) => {
      // Custom fetch path: api.post throws a plain Error on any non-2xx and
      // doesn't preserve the response body, but we need the audit data on 409.
      const { getSession } = await import('next-auth/react')
      const session = await getSession()
      const jwt = (session as Record<string, unknown> | null)?.backendJwt as string | undefined

      // withProject appends `?projectId=...`; pass force as a real query param
      // so the resulting URL is /send?projectId=...&force=true (not malformed).
      const url = withProject(`/api/campaigns/${id}/send`, force ? { force: 'true' } : undefined)
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: '{}',
      })

      if (response.status === 409) {
        const body = await response.json() as { error: string; data: StaleListAudit }
        if (body.error === 'stale_list_warning') {
          throw new StaleListError(body.data)
        }
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Failed to send' }))
        throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`)
      }

      return response.json() as Promise<{ success: boolean; data: { message: string; totalRecipients: number } }>
    },
    onSuccess: (res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns', id] })
      toast.success(res.data?.message ?? 'Campaign dispatched')
    },
    onError: (err) => {
      // StaleListError is intentionally surfaced to the caller — don't toast.
      if (err instanceof StaleListError) return
      toast.error(err.message ?? 'Failed to send campaign')
    },
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

export function useSendCampaignTestEmail() {
  return useMutation({
    mutationFn: ({ id, to, sampleCustomerId }: { id: string; to: string; sampleCustomerId?: string }) =>
      api.post<{ messageId: string; to: string; sampleCustomer: { id: string; name: string | null; email: string | null } }>(
        withProject(`/api/campaigns/${id}/test-email`),
        { to, sampleCustomerId },
      ),
    onSuccess: (res) => toast.success(`Test email sent to ${res.data?.to ?? 'recipient'}`),
    onError: (err) => toast.error(err.message ?? 'Failed to send test email'),
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
    currency: string | null
    isPrimary: boolean
  }>
  controlGroupLift: Array<{
    goalName: string
    eventName: string
    sentRecipients: number
    sentConversions: number
    sentConversionRate: number
    holdoutRecipients: number
    holdoutConversions: number
    holdoutConversionRate: number
    liftPct: number | null
    incrementalConversions: number
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

export type AnalyticsAttributionType = 'any' | 'click_through' | 'view_through'
export type AnalyticsGranularity = 'hour' | 'day' | 'week'

export function useCampaignAnalytics(
  id: string,
  options: { attributionType?: AnalyticsAttributionType; granularity?: AnalyticsGranularity } = {},
) {
  const attribution = options.attributionType ?? 'any'
  const granularity = options.granularity ?? 'hour'
  return useQuery({
    queryKey: ['campaigns', id, 'analytics', attribution, granularity],
    queryFn: () => api.get<CampaignAnalytics>(
      withProject(`/api/campaigns/${id}/analytics`, {
        attributionType: attribution,
        granularity,
      }),
    ),
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
