'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'

export type InboxConversation = {
  id: string
  phone: string
  status: 'bot' | 'human' | 'closed'
  botTurns: number
  handoffReason: string | null
  lastInboundAt: string | null
  lastBotAt: string | null
  updatedAt: string
  customerId: string | null
  customerName: string | null
  lastMessage: string | null
}

export type InboxMessage = {
  direction: 'in' | 'out'
  content: string | null
  at: string
  sentBy?: 'bot' | 'agent'
  agentName?: string | null
  mediaType?: string | null
}

type ConversationsResponse = {
  data: InboxConversation[]
  attention: number
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export function useInboxConversations(status?: 'bot' | 'human' | 'closed') {
  return useQuery({
    queryKey: ['inbox', 'conversations', status ?? 'all'],
    queryFn: () => api.get<InboxConversation[]>(withProject('/api/whatsapp/inbox/conversations', status ? { status } : undefined)) as unknown as Promise<ConversationsResponse>,
    refetchInterval: 20_000, // poll so new handoffs surface
  })
}

export function useInboxThread(conversationId: string | null) {
  return useQuery({
    queryKey: ['inbox', 'thread', conversationId],
    queryFn: () => api.get<InboxMessage[]>(withProject(`/api/whatsapp/inbox/conversations/${conversationId}/messages`)),
    enabled: !!conversationId,
    refetchInterval: conversationId ? 15_000 : false,
  })
}

export function useSendInboxReply() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, text }: { conversationId: string; text: string }) =>
      api.post<{ sent: boolean }>(withProject(`/api/whatsapp/inbox/conversations/${conversationId}/reply`), { text }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['inbox', 'thread', v.conversationId] })
      qc.invalidateQueries({ queryKey: ['inbox', 'conversations'] })
    },
  })
}

export function useSetConversationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, status }: { conversationId: string; status: 'bot' | 'human' | 'closed' }) =>
      api.post<{ status: string }>(withProject(`/api/whatsapp/inbox/conversations/${conversationId}/status`), { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox', 'conversations'] }),
  })
}
