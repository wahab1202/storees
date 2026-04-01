'use client'

import { Loader2, Mail, MessageSquare, Bell, Smartphone, Send, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'

type Message = {
  id: string
  channel: string
  messageType: string
  status: string
  sentAt: string | null
  deliveredAt: string | null
  readAt: string | null
  campaignName: string | null
  flowName: string | null
  blockReason: string | null
}

type Props = {
  messages: Message[]
  isLoading: boolean
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  push: Bell,
  whatsapp: Smartphone,
  inapp: Bell,
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  read: 'bg-emerald-100 text-emerald-700',
  clicked: 'bg-purple-100 text-purple-700',
  failed: 'bg-red-100 text-red-700',
  blocked: 'bg-yellow-100 text-yellow-700',
}

export function MessagesTab({ messages, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="bg-white border border-border rounded-xl p-12 text-center">
        <Send className="h-10 w-10 text-text-muted mx-auto mb-3" />
        <p className="text-sm text-text-secondary">No messages sent yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Channel</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Source</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Type</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Status</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Sent</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Delivered</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Read</th>
          </tr>
        </thead>
        <tbody>
          {messages.map(msg => {
            const ChannelIcon = CHANNEL_ICONS[msg.channel] ?? Mail
            const statusStyle = STATUS_STYLES[msg.status] ?? STATUS_STYLES.queued
            const source = msg.campaignName
              ? `Campaign: ${msg.campaignName}`
              : msg.flowName
                ? `Flow: ${msg.flowName}`
                : 'Direct'

            return (
              <tr key={msg.id} className="border-b border-border/50 hover:bg-surface/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ChannelIcon className="h-4 w-4 text-text-muted" />
                    <span className="capitalize text-text-primary">{msg.channel}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-text-secondary text-xs">{source}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs capitalize text-text-muted">{msg.messageType}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusStyle)}>
                      {msg.status === 'blocked' && <Ban className="h-3 w-3 mr-1" />}
                      {msg.status}
                    </span>
                    {msg.blockReason && (
                      <span className="text-[10px] text-yellow-600">({msg.blockReason.replace(/_/g, ' ')})</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                  {msg.sentAt ? formatDate(msg.sentAt) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                  {msg.deliveredAt ? formatDate(msg.deliveredAt) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                  {msg.readAt ? formatDate(msg.readAt) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
