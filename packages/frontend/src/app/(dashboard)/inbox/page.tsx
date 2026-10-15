'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useInboxConversations,
  useInboxThread,
  useSendInboxReply,
  useSetConversationStatus,
  type InboxConversation,
} from '@/hooks/useInbox'
import { Loader2, Send, MessageSquare, UserCheck, CheckCircle2, RotateCcw, Bot } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'human' | 'closed'

const STATUS_STYLE: Record<string, string> = {
  bot: 'bg-indigo-100 text-indigo-700',
  human: 'bg-amber-100 text-amber-700',
  closed: 'bg-slate-100 text-slate-500',
}
const STATUS_LABEL: Record<string, string> = { bot: 'Bot', human: 'Needs reply', closed: 'Closed' }

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function InboxPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<InboxConversation | null>(null)
  const [reply, setReply] = useState('')

  const { data: convResp, isLoading } = useInboxConversations(filter === 'all' ? undefined : filter)
  const conversations = convResp?.data ?? []
  const attention = convResp?.attention ?? 0

  const { data: threadResp, isLoading: threadLoading } = useInboxThread(selected?.id ?? null)
  const thread = threadResp?.data ?? []
  const send = useSendInboxReply()
  const setStatus = useSetConversationStatus()

  async function handleSend() {
    if (!selected || !reply.trim()) return
    try {
      await send.mutateAsync({ conversationId: selected.id, text: reply.trim() })
      setReply('')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to send')
    }
  }

  async function changeStatus(status: 'bot' | 'human' | 'closed') {
    if (!selected) return
    try {
      await setStatus.mutateAsync({ conversationId: selected.id, status })
      setSelected({ ...selected, status })
      toast.success(status === 'human' ? 'You’ve taken over this chat' : status === 'closed' ? 'Conversation closed' : 'Handed back to the bot')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update')
    }
  }

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Live WhatsApp conversations. The bot handles what it can; take over anything that needs a person."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[480px]">
        {/* List */}
        <div className="border border-border rounded-xl bg-white flex flex-col min-h-0">
          <div className="flex items-center gap-1 p-2 border-b border-border">
            {([['all', 'All'], ['human', `Needs reply${attention ? ` (${attention})` : ''}`], ['closed', 'Closed']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k as Filter)}
                className={cn('px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  filter === k ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-text-muted"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageSquare className="h-7 w-7 mx-auto text-text-muted mb-2" />
                <p className="text-sm text-text-secondary">No conversations here yet.</p>
              </div>
            ) : (
              conversations.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={cn('w-full text-left px-4 py-3 border-b border-border/70 transition-colors',
                    selected?.id === c.id ? 'bg-accent/5' : 'hover:bg-surface')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">{c.customerName || c.phone}</span>
                    <span className="text-[11px] text-text-muted shrink-0">{timeAgo(c.lastInboundAt ?? c.updatedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-text-muted truncate">{c.lastMessage || '—'}</span>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0', STATUS_STYLE[c.status])}>{STATUS_LABEL[c.status]}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="border border-border rounded-xl bg-white flex flex-col min-h-0">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <MessageSquare className="h-8 w-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">Select a conversation to read and reply.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{selected.customerName || selected.phone}</p>
                  <p className="text-xs text-text-muted">{selected.phone}{selected.handoffReason ? ` · handoff: ${selected.handoffReason}` : ''}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {selected.status !== 'human' && (
                    <button onClick={() => changeStatus('human')} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg text-text-secondary hover:bg-surface">
                      <UserCheck className="h-3.5 w-3.5" /> Take over
                    </button>
                  )}
                  {selected.status === 'human' && (
                    <button onClick={() => changeStatus('bot')} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg text-text-secondary hover:bg-surface">
                      <RotateCcw className="h-3.5 w-3.5" /> Back to bot
                    </button>
                  )}
                  {selected.status !== 'closed' && (
                    <button onClick={() => changeStatus('closed')} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-border rounded-lg text-text-secondary hover:bg-surface">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Close
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2 bg-background/40">
                {threadLoading ? (
                  <div className="flex items-center justify-center py-10 text-text-muted"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
                ) : thread.length === 0 ? (
                  <p className="text-center text-sm text-text-muted py-10">No messages yet.</p>
                ) : (
                  thread.map((m, i) => (
                    <div key={i} className={cn('flex', m.direction === 'in' ? 'justify-start' : 'justify-end')}>
                      <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm',
                        m.direction === 'in' ? 'bg-white border border-border text-text-primary' : 'bg-accent text-white')}>
                        {m.direction === 'out' && (
                          <span className="flex items-center gap-1 text-[10px] opacity-80 mb-0.5">
                            {m.sentBy === 'bot' ? <><Bot className="h-3 w-3" /> Bot</> : <>{m.agentName || 'Agent'}</>}
                          </span>
                        )}
                        <span className="whitespace-pre-wrap break-words">{m.content}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend() }}
                    rows={2}
                    placeholder="Type a reply… (⌘/Ctrl+Enter to send)"
                    className="flex-1 min-w-0 resize-none px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted"
                  />
                  <button
                    onClick={handleSend}
                    disabled={send.isPending || !reply.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send
                  </button>
                </div>
                <p className="text-[11px] text-text-muted mt-1.5">Replies send as WhatsApp session messages (within the 24h window) and need a provider that supports free-form text.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
