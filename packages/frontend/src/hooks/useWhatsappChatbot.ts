'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

export type ChatbotFaq = { q: string; a: string }
export type WhatsappChatbotConfig = {
  enabled: boolean
  greeting?: string
  handoffKeywords: string[]
  faqs: ChatbotFaq[]
  maxTurns: number
  answerUnknown: boolean
}

export function useWhatsappChatbotConfig() {
  return useQuery({
    queryKey: ['whatsapp-chatbot-config'],
    queryFn: () => api.get<WhatsappChatbotConfig>(withProject('/api/whatsapp/chatbot-config')),
  })
}

export function useSaveWhatsappChatbotConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (config: WhatsappChatbotConfig) =>
      api.put<WhatsappChatbotConfig>(withProject('/api/whatsapp/chatbot-config'), config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-chatbot-config'] }),
  })
}
