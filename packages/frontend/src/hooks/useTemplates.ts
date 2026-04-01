'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { EmailTemplate, TemplateChannel } from '@storees/shared'

type CreateTemplateInput = {
  name: string
  channel: TemplateChannel
  subject?: string
  htmlBody?: string
  bodyText?: string
}

type UpdateTemplateInput = Partial<Omit<CreateTemplateInput, 'channel'>>

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<EmailTemplate[]>(withProject('/api/templates')),
  })
}

export function useTemplateDetail(id: string) {
  return useQuery({
    queryKey: ['templates', id],
    queryFn: () => api.get<EmailTemplate>(withProject(`/api/templates/${id}`)),
    enabled: !!id,
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      api.post<EmailTemplate>(withProject('/api/templates'), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTemplateInput & { id: string }) =>
      api.patch<EmailTemplate>(withProject(`/api/templates/${id}`), input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['templates', vars.id] })
    },
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ id: string }>(withProject(`/api/templates/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useSeedTemplates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts?: { force?: boolean }) =>
      api.post<{ seeded: number; message: string }>(withProject('/api/templates/seed'), opts ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}
