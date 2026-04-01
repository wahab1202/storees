import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

type FunnelStep = {
  eventName: string
  label?: string
}

type FunnelStepResult = {
  eventName: string
  label: string
  count: number
  percentage: number
  dropoff: number
  dropoffPercentage: number
}

type FunnelResult = {
  steps: FunnelStepResult[]
  totalEntered: number
  totalCompleted: number
  overallConversion: number
}

type CohortEntry = {
  cohortDate: string
  cohortSize: number
  retention: number[]
}

type CohortResult = {
  cohorts: CohortEntry[]
  periods: number
  granularity: 'week' | 'month'
}

export function useFunnel() {
  return useMutation({
    mutationFn: (data: {
      steps: FunnelStep[]
      startDate?: string
      endDate?: string
    }) =>
      api.post<FunnelResult>(withProject('/api/analytics/funnel'), data),
  })
}

export function useCohorts(opts: {
  granularity?: 'week' | 'month'
  periods?: number
  returnEvent?: string
} = {}) {
  const params: Record<string, string | number | undefined> = {
    granularity: opts.granularity,
    periods: opts.periods,
    returnEvent: opts.returnEvent,
  }

  return useQuery({
    queryKey: ['cohorts', opts],
    queryFn: () => api.get<CohortResult>(withProject('/api/analytics/cohorts', params)),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  })
}

export function useEventNames() {
  return useQuery({
    queryKey: ['event-names'],
    queryFn: () => api.get<string[]>(withProject('/api/analytics/event-names')),
    staleTime: 60_000,
  })
}

// ============ TIME SERIES ============

type TimeSeriesPoint = {
  date: string
  value: number
  compareValue?: number
}

type TimeSeriesResult = {
  metric: string
  granularity: string
  points: TimeSeriesPoint[]
  total: number
  compareTotal?: number
  changePercent?: number
}

export function useTimeSeries() {
  return useMutation({
    mutationFn: (data: {
      metric: string
      startDate: string
      endDate: string
      compareStartDate?: string
      compareEndDate?: string
      granularity?: 'day' | 'week' | 'month'
      segmentIds?: string[]
    }) =>
      api.post<TimeSeriesResult>(withProject('/api/analytics/timeseries'), data),
  })
}

// ============ TIME-TO-EVENT ============

type TimeToEventResult = {
  startEvent: string
  endEvent: string
  medianSeconds: number
  p75Seconds: number
  p90Seconds: number
  totalCompletions: number
  distribution: { bucket: string; count: number }[]
  breakdowns?: { key: string; medianSeconds: number; count: number }[]
}

export function useTimeToEvent() {
  return useMutation({
    mutationFn: (data: {
      startEvent: string
      endEvent: string
      startDate?: string
      endDate?: string
      breakdownBy?: 'platform' | 'segment'
    }) =>
      api.post<TimeToEventResult>(withProject('/api/analytics/time-to-event'), data),
  })
}

// ============ PRODUCT ANALYTICS ============

type ProductAnalyticsItem = {
  itemId: string
  name: string
  category: string | null
  views: number
  conversions: number
  conversionRate: number
  revenue: number
  abandonment: number
}

export function useProductAnalytics(opts: {
  sort?: string
  limit?: number
  startDate?: string
  endDate?: string
} = {}) {
  return useQuery({
    queryKey: ['product-analytics', opts],
    queryFn: () =>
      api.get<ProductAnalyticsItem[]>(withProject('/api/analytics/products', {
        sort: opts.sort,
        limit: opts.limit,
        startDate: opts.startDate,
        endDate: opts.endDate,
      })),
    staleTime: 60_000,
  })
}

// ============ SAVED ANALYSES ============

type SavedAnalysis = {
  id: string
  projectId: string
  name: string
  type: string
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export function useSavedAnalyses(type?: string) {
  return useQuery({
    queryKey: ['saved-analyses', type],
    queryFn: () =>
      api.get<SavedAnalysis[]>(withProject('/api/analytics/saved', { type })),
    staleTime: 30_000,
  })
}

export function useSaveAnalysis() {
  return useMutation({
    mutationFn: (data: { name: string; type: string; config: Record<string, unknown> }) =>
      api.post<SavedAnalysis>(withProject('/api/analytics/saved'), data),
  })
}

export function useDeleteAnalysis() {
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(withProject(`/api/analytics/saved/${id}`)),
  })
}

// ============ SEGMENT TRANSITIONS ============

type SegmentTransition = {
  fromSegmentId: string
  fromSegmentName: string
  toSegmentId: string | null
  toSegmentName: string
  count: number
  percentage: number
}

type TransitionResult = {
  period1: string
  period2: string
  transitions: SegmentTransition[]
  totalCustomers: number
}

type SegmentTrendPoint = {
  date: string
  segmentId: string
  segmentName: string
  memberCount: number
}

export function useSnapshotDates() {
  return useQuery({
    queryKey: ['snapshot-dates'],
    queryFn: () => api.get<string[]>(withProject('/api/analytics/snapshot-dates')),
    staleTime: 60_000,
  })
}

export function useCreateSnapshot() {
  return useMutation({
    mutationFn: () =>
      api.post<{ snapshotted: number }>(withProject('/api/analytics/snapshot'), {}),
  })
}

export function useTransitions(period1?: string, period2?: string) {
  return useQuery({
    queryKey: ['transitions', period1, period2],
    queryFn: () =>
      api.get<TransitionResult>(withProject('/api/analytics/transitions', { period1, period2 })),
    enabled: !!period1 && !!period2,
    staleTime: 60_000,
  })
}

export function useSegmentTrend(segmentIds: string[]) {
  return useQuery({
    queryKey: ['segment-trend', segmentIds],
    queryFn: () =>
      api.get<SegmentTrendPoint[]>(withProject('/api/analytics/segment-trend', {
        segmentIds: segmentIds.join(','),
      })),
    enabled: segmentIds.length > 0,
    staleTime: 60_000,
  })
}

export type {
  FunnelResult, FunnelStepResult, CohortResult, CohortEntry,
  TimeSeriesResult, TimeSeriesPoint, TimeToEventResult, ProductAnalyticsItem, SavedAnalysis,
  TransitionResult, SegmentTransition, SegmentTrendPoint,
}
