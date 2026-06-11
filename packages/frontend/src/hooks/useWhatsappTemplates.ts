import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { toast } from 'sonner'
import type { TemplateVariable, WhatsappTemplate, WhatsappHeader, WhatsappButton, WhatsappTemplateCategory, WhatsappOtpConfig } from '@storees/shared'

export type { WhatsappTemplate } from '@storees/shared'

export type LintFinding = {
  code: string
  severity: 'error' | 'warning'
  message: string
}

export type LintInput = {
  name: string
  language: string
  category: WhatsappTemplateCategory
  bodyText: string
  header?: WhatsappHeader | null
  footer?: string | null
  buttons?: WhatsappButton[]
  otp?: WhatsappOtpConfig
}

export type SubmitInput = LintInput & { bodyExample?: string[]; variables?: TemplateVariable[] }

export type WhatsappProviderStatus = {
  configured: boolean
  provider: string | null
  capabilities: {
    sendText: boolean
    sendTemplate: boolean
    syncTemplates: boolean
    submitTemplate: boolean
    getTemplateStatus: boolean
    parseInbound: boolean
  }
  missingConfig: string[]
}

export function useWhatsappProviderStatus() {
  return useQuery({
    queryKey: ['whatsapp-provider-status'],
    queryFn: () => api.get<WhatsappProviderStatus>(withProject('/api/whatsapp/provider-status')),
    staleTime: 60_000,
  })
}

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

/** Save a template as a DRAFT (no provider submission yet). */
export function useSaveWhatsappDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SubmitInput) =>
      api.post<{ template: WhatsappTemplate; lintFindings: LintFinding[] }>(
        withProject('/api/whatsapp/templates'),
        { ...input, draft: true },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-templates'] })
      toast.success('Draft saved')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save draft'),
  })
}

/** Edit a DRAFT / REJECTED template before submission. */
export function useEditWhatsappDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SubmitInput> }) =>
      api.patch<{ template: WhatsappTemplate; lintFindings: LintFinding[] }>(
        withProject(`/api/whatsapp/templates/${id}`),
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-templates'] })
      toast.success('Draft updated')
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not update draft'),
  })
}

/** Push a DRAFT / REJECTED template to the provider for Meta approval. */
export function useSubmitWhatsappForApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ template: WhatsappTemplate }>(
        withProject(`/api/whatsapp/templates/${id}/submit`),
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-templates'] })
      toast.success('Submitted for approval')
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

/**
 * Send a single rendered template to a phone number for testing. Doesn't
 * count against frequency caps, doesn't create a campaign — just a quick
 * "did this actually render right?" before launching to thousands.
 */
export function useTestSendWhatsappTemplate() {
  return useMutation({
    mutationFn: (input: {
      templateId: string
      phone: string
      variables?: TemplateVariable[]
      sampleCustomerId?: string
    }) =>
      api.post<{ messageId: string; to: string }>(
        withProject(`/api/whatsapp/templates/${input.templateId}/test-send`),
        {
          phone: input.phone,
          variables: input.variables,
          sampleCustomerId: input.sampleCustomerId,
        },
      ),
    onSuccess: () => toast.success('Test message sent — check WhatsApp'),
    onError: (err: Error) => toast.error(err.message ?? 'Test send failed'),
  })
}
