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
      windowsPinned?: boolean
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

export function useRetrainPredictionGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ enqueued: boolean; goalId: string }>(
        withProject(`/api/prediction-goals/${id}/retrain`),
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prediction-goals'] })
      // ...and the watcher that draws the banner. It only polls WHILE something
      // is running, so on its own it never learns that anything STARTED: the page
      // keeps the answer it had from before the click until something else happens
      // to refetch it. Observed: five cards went to `training…` while the banner
      // still showed the previous run's failure.
      queryClient.invalidateQueries({ queryKey: ['prediction-training-status'] })
    },
  })
}

export function useRetrainAllPredictionGoals() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ enqueued: number; total: number }>(
        withProject('/api/prediction-goals/_retrain-all'),
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prediction-goals'] })
      // ...and the watcher that draws the banner. It only polls WHILE something
      // is running, so on its own it never learns that anything STARTED: the page
      // keeps the answer it had from before the click until something else happens
      // to refetch it. Observed: five cards went to `training…` while the banner
      // still showed the previous run's failure.
      queryClient.invalidateQueries({ queryKey: ['prediction-training-status'] })
    },
  })
}

export type SegmentMetric = {
  segment_type: 'behaviour' | 'region' | 'dealer' | string
  segment_value: string | null
  segment_label: string
  n: number
  n_positive: number
  auc: number
  delta_vs_overall: number
}

export type TrainingRun = {
  id: string
  trainedAt: string
  status: 'success' | 'insufficient_data' | 'failed' | 'error'
  auc: number | null
  baselineAuc: number | null
  lift: number | null
  nPositive: number | null
  reason: string | null
  durationMs: number | null
  segmentMetrics: SegmentMetric[] | null
}

export function useGoalTrainingHistory(goalId: string, limit = 30) {
  return useQuery({
    queryKey: ['goal-training-history', goalId, limit],
    queryFn: () =>
      api.get<TrainingRun[]>(withProject(`/api/prediction-goals/${goalId}/training-history`, { limit })),
    enabled: !!goalId,
    staleTime: 60_000,
  })
}

export type ModelVersion = {
  id: string
  modelVersion: string
  trainAuc: number | null
  baselineAuc: number | null
  trainedAt: string
  isActive: boolean
  activatedAt: string | null
  notes: string | null
}

export function useGoalModelVersions(goalId: string) {
  return useQuery({
    queryKey: ['goal-model-versions', goalId],
    queryFn: () =>
      api.get<ModelVersion[]>(withProject(`/api/prediction-goals/${goalId}/versions`)),
    enabled: !!goalId,
    staleTime: 30_000,
  })
}

export function usePromoteModelVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ goalId, versionId }: { goalId: string; versionId: string }) =>
      api.post<{ promoted: boolean; modelVersion: string }>(
        withProject(`/api/prediction-goals/${goalId}/versions/${versionId}/promote`),
        {},
      ),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['goal-model-versions', vars.goalId] })
      queryClient.invalidateQueries({ queryKey: ['prediction-goals'] })
    },
  })
}

export function useMlServiceHealth() {
  return useQuery({
    queryKey: ['ml-service-health'],
    queryFn: () =>
      api.get<{ mlServiceUp: boolean }>(withProject('/api/prediction-goals/_ml-health')),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

/** Which goals are training right now, polled while any of them is.
 *
 *  Training takes minutes and the Re-train request returns instantly — it only queues
 *  the job. The button's own spinner therefore stops almost at once, and the page looks
 *  exactly as it did before the click. This is what lets the screen keep saying so.
 *
 *  Polling stops the moment nothing is running, so an idle Predictions page makes no
 *  requests at all. Same shape as `useReplayStatus` on the Event Mapping screen.
 */
export function useTrainingStatus() {
  return useQuery({
    queryKey: ['prediction-training-status'],
    queryFn: () => api.get<{
      running: boolean
      goals: Array<{ id: string; name: string }>
      /** Goals whose most recent attempt (last 6h) did not produce a model. A failed
       *  training leaves the goal `active` so its existing model keeps scoring, which
       *  means the card alone cannot show that anything went wrong. */
      failures: Array<{ goalId: string; name: string; reason: string }>
    }>(withProject('/api/prediction-goals/_training-status')),
    refetchInterval: (q) => (q.state.data?.data?.running ? 3000 : false),
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
  params: { bucket?: string; page?: number; pageSize?: number; sort?: string; scope?: 'live' | 'all' } = {},
) {
  const { bucket, page = 1, pageSize = 25, sort = 'score_desc', scope } = params
  const extra: Record<string, string> = {
    page: String(page),
    pageSize: String(pageSize),
    sort,
  }
  if (bucket) extra.bucket = bucket
  if (scope) extra.scope = scope

  return useQuery({
    queryKey: ['goal-customers', goalId, bucket, page, pageSize, sort, scope],
    queryFn: () =>
      api.get<GoalCustomersResponse>(
        withProject(`/api/predictions/goals/${goalId}/customers`, extra),
      ),
    enabled: !!goalId,
    staleTime: 60_000,
  })
}

export type { PredictionScore, PredictionFactor, ReorderTimingData, CustomerPredictions, GoalCustomerScore, GoalCustomersStats }
