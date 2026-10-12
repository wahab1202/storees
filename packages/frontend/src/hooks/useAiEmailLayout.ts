'use client'

import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import type { EmailBlock } from '@storees/shared'

// Email Engine Step 3: AI designs a full email as a typed block schema; the
// backend renders it to a brand-safe, token-driven HTML template.

export type EmailLayoutInput = {
  goal: string
  tone?: string
  audience?: string
  language?: string
  hasCart?: boolean
  hasRecommendations?: boolean
}

export type EmailLayoutResult = {
  subject: string
  blocks: EmailBlock[]
  html: string         // the saveable template (tokens unfilled)
  previewHtml: string  // tokens filled with brand + sample data, for display
}

export function useAiEmailLayout() {
  return useMutation({
    mutationFn: (input: EmailLayoutInput) =>
      api.post<EmailLayoutResult>(withProject('/api/ai/email-layout'), input),
  })
}
