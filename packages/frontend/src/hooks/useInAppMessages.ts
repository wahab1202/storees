import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { toast } from 'sonner'
import type { FilterConfig } from '@storees/shared'

export type InAppMessagePosition = 'modal' | 'banner' | 'toast' | 'inbox'
export type InAppMessageFrequency = 'always' | 'once' | 'daily'
export type InAppMessageStatus = 'draft' | 'active' | 'paused' | 'archived'

export type InAppMessage = {
  id: string
  projectId: string
  name: string
  status: InAppMessageStatus
  title: string
  body: string | null
  imageUrl: string | null
  ctaLabel: string | null
  ctaUrl: string | null
  position: InAppMessagePosition
  frequency: InAppMessageFrequency
  targetPages: string[]
  audienceFilter: FilterConfig | null
  startsAt: string | null
  endsAt: string | null
  impressions: number
  dismissals: number
  ctaClicks: number
  createdAt: string
  updatedAt: string
}

export type InAppMessageInput = {
  name: string
  title: string
  body?: string | null
  imageUrl?: string | null
  ctaLabel?: string | null
  ctaUrl?: string | null
  position?: InAppMessagePosition
  frequency?: InAppMessageFrequency
  targetPages?: string[]
  audienceFilter?: FilterConfig | null
  startsAt?: string | null
  endsAt?: string | null
  status?: InAppMessageStatus
}

export function useInAppMessages() {
  return useQuery({
    queryKey: ['in-app-messages'],
    queryFn: () => api.get<InAppMessage[]>(withProject('/api/in-app-messages')),
  })
}

export function useInAppMessage(id: string | undefined) {
  return useQuery({
    queryKey: ['in-app-messages', id],
    queryFn: () => api.get<InAppMessage>(withProject(`/api/in-app-messages/${id}`)),
    enabled: !!id,
  })
}

export function useCreateInAppMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: InAppMessageInput) =>
      api.post<{ id: string }>(withProject('/api/in-app-messages'), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['in-app-messages'] })
      toast.success('Message created')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to create'),
  })
}

export function useUpdateInAppMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<InAppMessageInput>) =>
      api.patch(withProject(`/api/in-app-messages/${id}`), input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['in-app-messages'] })
      toast.success('Saved')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to save'),
  })
}

export function useDeleteInAppMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(withProject(`/api/in-app-messages/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['in-app-messages'] })
      toast.success('Deleted')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to delete'),
  })
}
