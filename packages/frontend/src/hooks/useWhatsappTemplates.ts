import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { toast } from 'sonner'

export type WhatsappTemplate = {
  id: string
  projectId: string
  provider: string
  providerTemplateId: string
  name: string
  language: string
  category: string | null
  status: string
  bodyText: string
  header: { type?: string; text?: string } | null
  footer: string | null
  buttons: Array<{ type: string; text: string; url?: string; phone?: string }> | null
  parameterCount: number
  rejectionReason: string | null
  previousCategory: string | null
  submittedAt: string | null
  lastStatusCheckAt: string | null
  syncedAt: string
  createdAt: string
  updatedAt: string
}

export type LintFinding = {
  code: string
  severity: 'error' | 'warning'
  message: string
}

export type LintInput = {
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  bodyText: string
  header?: { type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string } | null
  footer?: string | null
  buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone?: string }>
}

export type SubmitInput = LintInput & { bodyExample?: string[] }

export function useWhatsappTemplates() {
  return useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: () => api.get<WhatsappTemplate[]>(withProject('/api/whatsapp/templates')),
  })
}

export function useLintWhatsappTemplate() {
  return useMutation({
    mutationFn: (input: LintInput) =>
      api.post<{ findings: LintFinding[]; blocking: boolean }>(
        withProject('/api/whatsapp/templates/lint'),
        input,
      ),
  })
}

export function useSubmitWhatsappTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SubmitInput) =>
      api.post<{ template: WhatsappTemplate; lintFindings: LintFinding[] }>(
        withProject('/api/whatsapp/templates'),
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-templates'] })
      toast.success('Template submitted to provider')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Submission failed'),
  })
}

export function useSyncWhatsappTemplates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ provider: string; count: number }>(withProject('/api/whatsapp/sync-templates'), {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['whatsapp-templates'] })
      toast.success(`Synced ${res.data?.count ?? 0} templates`)
    },
    onError: (err: Error) => toast.error(err.message ?? 'Sync failed'),
  })
}

export function useRefreshTemplateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<WhatsappTemplate>(withProject(`/api/whatsapp/templates/${id}/refresh-status`), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-templates'] })
    },
  })
}
