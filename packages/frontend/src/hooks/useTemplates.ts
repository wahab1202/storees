'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type {
  EmailTemplate,
  TemplateChannel,
  TemplateVariable,
  VariableSourceCatalog,
} from '@storees/shared'

type CreateTemplateInput = {
  name: string
  channel: TemplateChannel
  subject?: string
  htmlBody?: string
  bodyText?: string
  variables?: TemplateVariable[]
}

type UpdateTemplateInput = Partial<Omit<CreateTemplateInput, 'channel'>>

export type LintIssue = {
  kind: 'error' | 'warning'
  code: string
  key?: string
  message: string
}

export type PreviewResponse = {
  rendered: { subject: string; htmlBody: string; bodyText: string }
  substitutions: Record<string, string>
  sampleSource: 'requested' | 'auto' | 'placeholder'
  sampleCustomer: { id: string; name: string | null; email: string | null }
  issues: LintIssue[]
}

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

/**
 * Catalogue of variable sources for the picker dropdown — customer fields,
 * custom-attribute keys observed on real customers, project fields, top
 * events with property keys. Cached for the session since it's a read-only
 * snapshot of project metadata.
 */
export function useVariableSources() {
  return useQuery({
    queryKey: ['variable-sources'],
    queryFn: () =>
      api.get<VariableSourceCatalog>(withProject('/api/templates/variable-sources')),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Live preview that resolves variables against a real customer (or sample)
 * — same code path the worker uses at send-time, so what you see is what
 * the recipient gets.
 */
export function usePreviewTemplate() {
  return useMutation({
    mutationFn: (input: {
      subject?: string | null
      htmlBody?: string | null
      bodyText?: string | null
      variables?: TemplateVariable[]
      sampleCustomerId?: string
      eventProperties?: Record<string, unknown>
    }) =>
      api.post<PreviewResponse>(withProject('/api/templates/preview'), input),
  })
}
