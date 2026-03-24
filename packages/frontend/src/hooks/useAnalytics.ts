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
  })
}

export function useEventNames() {
  return useQuery({
    queryKey: ['event-names'],
    queryFn: () => api.get<string[]>(withProject('/api/analytics/event-names')),
    staleTime: 60_000,
  })
}

export type { FunnelResult, FunnelStepResult, CohortResult, CohortEntry }
