import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

// Gap 3: AI Copywriter. Channel-aware marketing copy generation via the
// project's configured LLM provider.

export type CopywriterChannel = 'email' | 'sms' | 'push' | 'whatsapp'
export type VoiceTone = 'persuasive' | 'informative' | 'excitement' | 'fomo' | 'exclusivity'
export type CopywriterLanguage = 'en' | 'hi' | 'ta' | 'fr' | 'es' | 'zh'

export type CopywriterInput = {
  channel: CopywriterChannel
  useCase: string
  voiceTone: VoiceTone
  language: CopywriterLanguage
  audiencePersona?: string
  includeKeywords?: string[]
  excludeKeywords?: string[]
  variantCount?: number
}

export type CopywriterVariant = {
  subject?: string
  body: string
}

export function useAiCopywriter() {
  return useMutation({
    mutationFn: (input: CopywriterInput) =>
      api.post<{ variants: CopywriterVariant[] }>(withProject('/api/ai/copywriter'), input),
  })
}
