import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { toast } from 'sonner'
import type { WhatsappTemplateCategory, WhatsappButton } from '@storees/shared'

export type WhatsappCopilotTone = 'professional' | 'friendly' | 'witty' | 'urgent'

export type WhatsappCopilotInput = {
  goal: string
  audience?: string
  tone?: WhatsappCopilotTone
  category?: WhatsappTemplateCategory
  language?: string
}

export type WhatsappCopilotDraft = {
  category: WhatsappTemplateCategory
  bodyText: string
  variables: Array<{ sample: string; label?: string }>
  header?: { type: 'TEXT'; text: string } | null
  footer?: string | null
  buttons?: WhatsappButton[]
}

export function useAiWhatsappTemplate() {
  return useMutation({
    mutationFn: (input: WhatsappCopilotInput) =>
      api.post<WhatsappCopilotDraft>(withProject('/api/ai/whatsapp-template'), input),
    onError: (err: Error) => toast.error(err.message ?? 'Could not generate template'),
  })
}
