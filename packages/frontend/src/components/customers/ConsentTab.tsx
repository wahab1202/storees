'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { cn } from '@/lib/utils'
import { Loader2, Mail, MessageSquare, Phone, Bell, ShieldCheck, ShieldOff, Info } from 'lucide-react'

type ConsentChannel = 'email' | 'sms' | 'whatsapp' | 'push'

type AuditEntry = {
  id: string
  channel: ConsentChannel
  messageType: string
  action: 'opt_in' | 'opt_out'
  source: string
  consentText: string | null
  ipAddress: string | null
  createdAt: string
}

type CurrentStatus = {
  email: boolean
  sms: boolean
  whatsapp: boolean
  push: boolean
} | null

type ConsentHistoryResponse = {
  history: AuditEntry[]
  currentStatus: CurrentStatus
}

const CHANNEL_ICON: Record<ConsentChannel, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: Phone,
  push: Bell,
}

const CHANNEL_LABEL: Record<ConsentChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  push: 'Push',
}

const SOURCE_LABEL: Record<string, string> = {
  sdk: 'JS SDK',
  api: 'Public API',
  admin: 'Admin panel',
  webhook: 'Provider webhook',
  one_click_unsub: 'One-click unsubscribe',
  ctwa_ad: 'CTWA ad',
  widget: 'On-site widget',
  backfill: 'Migrated (legacy)',
}

export function ConsentTab({ customerId }: { customerId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['consent-history', customerId],
    queryFn: () => api.get<ConsentHistoryResponse>(withProject(`/api/customers/${customerId}/consent-history`)),
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading consent history…
      </div>
    )
  }

  if (isError || !data?.data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load consent history.
      </div>
    )
  }

  const { history, currentStatus } = data.data
  const channels: ConsentChannel[] = ['email', 'sms', 'whatsapp', 'push']

  return (
    <div className="space-y-6">
      {/* Current status row */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Current consent status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {channels.map(ch => {
            const opted = currentStatus?.[ch] ?? false
            const Icon = CHANNEL_ICON[ch]
            return (
              <div
                key={ch}
                className={cn(
                  'rounded-lg border p-3 flex items-center gap-3',
                  opted ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50',
                )}
              >
                <Icon className={cn('h-4 w-4 flex-shrink-0', opted ? 'text-emerald-600' : 'text-slate-400')} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary">{CHANNEL_LABEL[ch]}</div>
                  <div className={cn('text-xs', opted ? 'text-emerald-700' : 'text-slate-500')}>
                    {opted ? 'Opted in' : 'Opted out'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Audit log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Audit log</h3>
          <span className="text-xs text-text-muted">{history.length} {history.length === 1 ? 'entry' : 'entries'}</span>
        </div>

        {history.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-text-muted">
            <Info className="h-5 w-5 mx-auto mb-2 text-slate-400" />
            No consent changes recorded for this customer.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Channel</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">IP</th>
                  <th className="px-3 py-2 text-left font-medium">Consent text</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map(row => {
                  const Icon = CHANNEL_ICON[row.channel as ConsentChannel] ?? Mail
                  const isOptIn = row.action === 'opt_in'
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 align-top">
                      <td className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <Icon className="h-3.5 w-3.5 text-slate-500" />
                          {CHANNEL_LABEL[row.channel as ConsentChannel] ?? row.channel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 capitalize">{row.messageType}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                            isOptIn ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
                          )}
                        >
                          {isOptIn ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                          {isOptIn ? 'Opted in' : 'Opted out'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {SOURCE_LABEL[row.source] ?? row.source}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 font-mono">{row.ipAddress ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 max-w-md break-words">
                        {row.consentText || <span className="text-slate-400 italic">not recorded</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-text-muted">
          This log is append-only and immutable. Used for DPDP Act compliance audits and Meta WABA quality-rating disputes.
        </p>
      </div>
    </div>
  )
}
