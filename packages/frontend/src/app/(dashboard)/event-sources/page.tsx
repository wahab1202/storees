'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Webhook, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { CopyUrlButton, webhookUrl } from '@/components/eventSources/CopyUrlButton'
import {
  useInboundWebhooks, useCreateInboundWebhook, useUpdateInboundWebhook, useDeleteInboundWebhook,
  type InboundWebhook,
} from '@/hooks/useInboundWebhooks'

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function EventSourcesPage() {
  const { data, isLoading } = useInboundWebhooks()
  const createHook = useCreateInboundWebhook()
  const updateHook = useUpdateInboundWebhook()
  const deleteHook = useDeleteInboundWebhook()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<InboundWebhook | null>(null)

  const hooks = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-heading">Event Sources</h1>
          <p className="mt-1 text-sm text-text-muted">
            Named webhook endpoints that receive JSON from any external system. Define events out of the
            payloads and they flow into segments, flow triggers, and template variables.
          </p>
        </div>
        <button
          onClick={() => { setName(''); setCreateOpen(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors flex-shrink-0"
        >
          <Plus className="h-4 w-4" /> Create Webhook
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : hooks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white py-16 text-center">
          <Webhook className="mx-auto h-8 w-8 text-text-muted/50" />
          <p className="mt-3 text-sm font-medium text-text-primary">No webhooks yet</p>
          <p className="mt-1 text-xs text-text-muted">Create one, copy its URL, and POST any JSON to it.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">URL</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Data (last 24h)</th>
                <th className="px-4 py-2.5">Last received</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {hooks.map(h => (
                <tr key={h.id} className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/event-sources/${h.id}`} className="text-sm font-medium text-accent hover:underline">
                      {h.name}
                    </Link>
                    <p className="text-[11px] text-text-muted">Created {fmtDate(h.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="max-w-[220px] truncate text-[11px] text-text-secondary" title={webhookUrl(h.token)}>
                        …/api/hooks/{h.token.slice(0, 10)}…
                      </code>
                      <CopyUrlButton token={h.token} compact />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateHook.mutate({ id: h.id, status: h.status === 'active' ? 'paused' : 'active' })}
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border transition-colors',
                        h.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200',
                      )}
                      title="Click to toggle"
                    >
                      {h.status === 'active' ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-text-primary">{h.received24h ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{fmtDate(h.lastReceivedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDeleting(h)}
                      className="p-1.5 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                      aria-label={`Delete ${h.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Webhook"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-xs font-medium text-text-secondary rounded-lg hover:bg-surface">Cancel</button>
            <button
              disabled={!name.trim() || createHook.isPending}
              onClick={() => createHook.mutate({ name: name.trim() }, { onSuccess: () => setCreateOpen(false) })}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {createHook.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Continue
            </button>
          </div>
        }
      >
        <div className="p-5">
          <label className="block text-xs font-semibold text-text-secondary mb-1.5">Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) createHook.mutate({ name: name.trim() }, { onSuccess: () => setCreateOpen(false) }) }}
            placeholder="e.g. Shopflow — checkout events"
            className="w-full h-9 px-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
          <p className="mt-2 text-[11px] text-text-muted">A unique receive URL is generated — copy it from the list and start POSTing JSON.</p>
        </div>
      </Dialog>

      {/* Delete confirm */}
      {deleting && (
        <Dialog
          open
          onClose={() => setDeleting(null)}
          title={`Delete "${deleting.name}"?`}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-xs font-medium text-text-secondary rounded-lg hover:bg-surface">Cancel</button>
              <button
                onClick={() => deleteHook.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          }
        >
          <p className="p-5 text-xs text-text-secondary leading-relaxed">
            The receive URL stops working immediately and the payload history + event definitions are removed.
            Events already emitted into the pipeline are kept.
          </p>
        </Dialog>
      )}
    </div>
  )
}
