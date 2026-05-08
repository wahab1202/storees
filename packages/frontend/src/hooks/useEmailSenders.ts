'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { ProjectEmailSender } from '@storees/shared'

export function useEmailSenders() {
  return useQuery({
    queryKey: ['email-senders'],
    queryFn: () => api.get<ProjectEmailSender[]>(withProject('/api/email-senders')),
  })
}

export function useSyncDefaultEmailSender() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<ProjectEmailSender>(withProject('/api/email-senders/sync-default'), {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-senders'] })
    },
  })
}
