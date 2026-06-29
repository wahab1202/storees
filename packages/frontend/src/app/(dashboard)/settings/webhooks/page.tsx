'use client'

import { useState, Fragment } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useWebhookSubscriptions,
  useWebhookDeliveries,
  useCreateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useResendDelivery,
  WEBHOOK_EVENT_CATALOG,
  type WebhookSubscription,
} from '@/hooks/useWebhooks'
import { Plus, Send, Trash2, Loader2, Copy, ChevronDown, ChevronRight, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react'

export default function WebhooksPage() {
  const { data, isLoading } = useWebhookSubscriptions()
  const subs = data?.data ?? []
  const [adding, setAdding] = useState(false)
  const [newSecret, setNewSecret] = useState<{ url: string; secret: string } | null>(null)

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Webhooks</h1>
          <p className="text-sm text-slate-500">Deliver events (segment changes, etc.) to external platforms, signed and retried.</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus size={16} /> Add Webhook
          </button>
        )}
      </div>

      {/* One-time secret reveal */}
      {newSecret && (
        <div className="my-4 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-900 mb-1">Webhook created — copy your signing secret now</p>
          <p className="text-xs text-green-700 mb-2">It won&apos;t be shown again. {newSecret.url}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white px-3 py-2 rounded border border-green-200 text-xs font-mono text-slate-900 break-all">
              {newSecret.secret}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(newSecret.secret); toast.success('Secret copied') }}
              className="p-2 hover:bg-green-100 rounded"
            >
              <Copy size={16} className="text-green-700" />
            </button>
          </div>
          <button onClick={() => setNewSecret(null)} className="mt-2 text-xs text-green-700 hover:underline">Dismiss</button>
        </div>
      )}

      {adding && (
        <AddWebhookForm
          onClose={() => setAdding(false)}
          onCreated={(url, secret) => { setAdding(false); setNewSecret({ url, secret }) }}
        />
      )}

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : subs.length === 0 && !adding ? (
          <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
            No webhooks yet. Add one to start delivering events to an external platform.
          </div>
        ) : (
          subs.map(sub => <WebhookCard key={sub.id} sub={sub} />)
        )}
      </div>
    </div>
  )
}

function AddWebhookForm({ onClose, onCreated }: { onClose: () => void; onCreated: (url: string, secret: string) => void }) {
  const create = useCreateWebhook()
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [authMethod, setAuthMethod] = useState<'hmac' | 'bearer'>('hmac')
  const [events, setEvents] = useState<string[]>(['customer.segment.entered', 'customer.segment.exited'])
  const [signingSecret, setSigningSecret] = useState('')

  const toggleEvent = (id: string) =>
    setEvents(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^https:\/\//i.test(url)) return toast.error('URL must be HTTPS')
    if (events.length === 0) return toast.error('Select at least one event')
    try {
      const res = await create.mutateAsync({ url, description: description || undefined, authMethod, events, signingSecret: signingSecret || undefined })
      onCreated(url, res.data!.signingSecret)
      toast.success('Webhook created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create webhook')
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Webhook URL (HTTPS)</label>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/cdp-webhook"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Gowelmart segment sync"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Auth method</label>
        <div className="flex gap-2">
          {(['hmac', 'bearer'] as const).map(m => (
            <button type="button" key={m} onClick={() => setAuthMethod(m)}
              className={cn('px-3 py-1.5 text-sm rounded-lg border', authMethod === m ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600')}>
              {m === 'hmac' ? 'HMAC signature' : 'Bearer token'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Signing secret</label>
        <input value={signingSecret} onChange={e => setSigningSecret(e.target.value)} placeholder="Leave blank to auto-generate"
          className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        <p className="text-xs text-slate-400 mt-1">For a Bearer receiver (e.g. Gowelmart), paste the receiver&apos;s expected token here.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Events</label>
        <div className="space-y-1.5">
          {WEBHOOK_EVENT_CATALOG.map(ev => (
            <label key={ev.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={events.includes(ev.id)} onChange={() => toggleEvent(ev.id)} className="rounded border-slate-300" />
              <code className="text-xs text-slate-500">{ev.id}</code>
              <span className="text-slate-400">— {ev.label}</span>
              {!ev.live && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">soon</span>}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
        <button type="submit" disabled={create.isPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {create.isPending && <Loader2 size={14} className="animate-spin" />} Create
        </button>
      </div>
    </form>
  )
}

function WebhookCard({ sub }: { sub: WebhookSubscription }) {
  const [showDeliveries, setShowDeliveries] = useState(false)
  const del = useDeleteWebhook()
  const test = useTestWebhook()

  async function handleTest() {
    try { await test.mutateAsync(sub.id); toast.success('Test event queued'); setShowDeliveries(true) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Test failed') }
  }
  async function handleDelete() {
    if (!confirm(`Delete this webhook?\n${sub.url}`)) return
    try { await del.mutateAsync(sub.id); toast.success('Webhook deleted') }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed') }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 break-all">{sub.url}</p>
            {sub.description && <p className="text-xs text-slate-500 mt-0.5">{sub.description}</p>}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full', sub.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                {sub.isActive ? 'Active' : 'Disabled'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase">{sub.authMethod}</span>
              {sub.events.map(e => <code key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{e}</code>)}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleTest} disabled={test.isPending} title="Send test event"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              {test.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Test
            </button>
            <button onClick={() => setShowDeliveries(v => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              {showDeliveries ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Deliveries
            </button>
            <button onClick={handleDelete} disabled={del.isPending} title="Delete"
              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
      {showDeliveries && <DeliveriesTable subId={sub.id} />}
    </div>
  )
}

function DeliveriesTable({ subId }: { subId: string }) {
  const { data, isLoading } = useWebhookDeliveries(subId)
  const resend = useResendDelivery(subId)
  const rows = data?.data ?? []
  const [expanded, setExpanded] = useState<string | null>(null)

  if (isLoading) return <div className="border-t border-slate-100 p-4 text-center"><Loader2 className="animate-spin inline text-slate-400" size={16} /></div>
  if (rows.length === 0) return <div className="border-t border-slate-100 p-4 text-center text-xs text-slate-400">No deliveries yet.</div>

  return (
    <div className="border-t border-slate-100">
      <table className="w-full text-xs">
        <thead className="text-slate-400">
          <tr className="border-b border-slate-100">
            <th className="text-left font-medium px-4 py-2">When</th>
            <th className="text-left font-medium px-2 py-2">Event</th>
            <th className="text-left font-medium px-2 py-2">Status</th>
            <th className="text-left font-medium px-2 py-2">Attempt</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => {
            const ok = d.statusCode != null && d.statusCode >= 200 && d.statusCode < 300
            return (
              <Fragment key={d.id}>
                <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{d.attemptedAt ? new Date(d.attemptedAt).toLocaleString() : new Date(d.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-2"><code className="text-indigo-600">{d.eventId}</code></td>
                  <td className="px-2 py-2">
                    {d.statusCode == null ? (
                      <span className="inline-flex items-center gap-1 text-slate-400"><Clock size={12} /> pending</span>
                    ) : ok ? (
                      <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 size={12} /> {d.statusCode}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={12} /> {d.statusCode}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-slate-500">{d.attempt}{d.final ? '' : ' (retrying)'}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="text-slate-400 hover:text-slate-700 mr-2">
                      {expanded === d.id ? 'Hide' : 'Details'}
                    </button>
                    <button onClick={() => resend.mutate(d.id)} disabled={resend.isPending} title="Resend" className="text-indigo-600 hover:text-indigo-800">
                      <RefreshCw size={12} className="inline" />
                    </button>
                  </td>
                </tr>
                {expanded === d.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="grid gap-2">
                        <div>
                          <p className="text-[10px] uppercase text-slate-400 mb-1">Request</p>
                          <pre className="bg-white border border-slate-200 rounded p-2 overflow-x-auto text-[11px] text-slate-700">{JSON.stringify(d.eventData, null, 2)}</pre>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-slate-400 mb-1">Response{d.error ? ' / error' : ''}</p>
                          <pre className="bg-white border border-slate-200 rounded p-2 overflow-x-auto text-[11px] text-slate-700">{d.error ?? d.responseBody ?? '(no body)'}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
