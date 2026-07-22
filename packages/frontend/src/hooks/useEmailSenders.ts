'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { ProjectEmailSender } from '@storees/shared'

export function useEmailSenders() {
  return useQuery({
    queryKey: ['email-senders'],
    queryFn: () => api.get<ProjectEmailSender[]>(withProject('/api/email-senders')),
  })
}
