import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { PredictionGoal } from '@storees/shared'

export function usePredictionGoals() {
  return useQuery({
    queryKey: ['prediction-goals'],
    queryFn: () => api.get<PredictionGoal[]>(withProject('/api/prediction-goals')),
    staleTime: 60_000,
  })
}

export function usePredictionGoal(id: string) {
  return useQuery({
    queryKey: ['prediction-goal', id],
    queryFn: () => api.get<PredictionGoal>(withProject(`/api/prediction-goals/${id}`)),
    enabled: !!id,
  })
}

export function useCreatePredictionGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      targetEvent: string
      observationWindowDays?: number
      predictionWindowDays?: number
      minPositiveLabels?: number
    }) => api.post<PredictionGoal>(withProject('/api/prediction-goals'), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prediction-goals'] })
    },
  })
}

export function useUpdatePredictionGoalStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<PredictionGoal>(withProject(`/api/prediction-goals/${id}/status`), { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prediction-goals'] })
    },
  })
}

export function useDeletePredictionGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(withProject(`/api/prediction-goals/${id}`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prediction-goals'] })
    },
  })
}

// ============ PREDICTION SCORES (for Customer 360) ============

type PredictionFactor = {
  feature: string
  value: number
  impact: number
  direction: 'positive' | 'negative'
  label: string
}

type ReorderTimingData = {
  timing_bucket: '0-3d' | '3-7d' | '7-14d' | '14d+' | null
  expected_reorder_days: number
  days_overdue: number
  avg_cycle_days: number
  is_repeat_buyer: boolean
  regularity: number
}

type PredictionScore = {
  id: string
  customerId: string
  goalId: string
  goalName: string
  score: number
  confidence: number
  bucket: 'High' | 'Medium' | 'Low'
  factors: PredictionFactor[] | ReorderTimingData
  computedAt: string
}

type CustomerPredictions = {
  scores: PredictionScore[]
}

export function useCustomerPredictions(customerId: string) {
  return useQuery({
    queryKey: ['customer-predictions', customerId],
    queryFn: () =>
      api.get<CustomerPredictions>(withProject(`/api/predictions/${customerId}`)),
    enabled: !!customerId,
    staleTime: 120_000,
  })
}

// ============ GOAL CUSTOMERS (ranked list) ============

type GoalCustomerScore = {
  customerId: string
  customerName: string
  customerEmail: string
  score: number
  bucket: string
  confidence: number
  factors: ReorderTimingData | null
  computedAt: string
}

type GoalCustomersStats = {
  total: number
  avgScore: number
  buckets: { high: number; medium: number; low: number }
}

type GoalCustomersResponse = {
  data: GoalCustomerScore[]
  stats: GoalCustomersStats
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export function useGoalCustomers(
  goalId: string,
  params: { bucket?: string; page?: number; pageSize?: number; sort?: string } = {},
) {
  const { bucket, page = 1, pageSize = 25, sort = 'score_desc' } = params
  const extra: Record<string, string> = {
    page: String(page),
    pageSize: String(pageSize),
    sort,
  }
  if (bucket) extra.bucket = bucket

  return useQuery({
    queryKey: ['goal-customers', goalId, bucket, page, pageSize, sort],
    queryFn: () =>
      api.get<GoalCustomersResponse>(
        withProject(`/api/predictions/goals/${goalId}/customers`, extra),
      ),
    enabled: !!goalId,
    staleTime: 60_000,
  })
}

export type { PredictionScore, PredictionFactor, ReorderTimingData, CustomerPredictions, GoalCustomerScore, GoalCustomersStats }
