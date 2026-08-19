import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { CustomerAbandonments } from '@storees/shared'

export function useAbandonments(customerId: string) {
  return useQuery({
    queryKey: ['abandonments', customerId],
    queryFn: () => api.get<CustomerAbandonments>(withProject(`/api/customers/${customerId}/abandonments`)),
    enabled: !!customerId,
    staleTime: 30_000,
  })
}

export function useSaveAbandonmentReason(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { eventId: string; reason: string; remarks?: string; transcriptUrl?: string; transcriptName?: string }) =>
      api.post(withProject(`/api/customers/${customerId}/abandonments/reason`), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['abandonments', customerId] }),
  })
}
