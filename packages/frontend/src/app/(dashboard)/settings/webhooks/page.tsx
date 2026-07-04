'use client'

import { useState, Fragment } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useWebhookSubscriptions,
  useWebhookDeliveries,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useResendDelivery,
  WEBHOOK_EVENT_CATALOG,
  type WebhookSubscription,
  type RetryPolicy,
} from '@/hooks/useWebhooks'
import { Plus, Send, Trash2, Loader2, Copy, ChevronDown, ChevronRight, RefreshCw, CheckCircle2, XCircle, Clock, Pencil, X, KeyRound } from 'lucide-react'

const RETRY_PRESETS: { id: string; label: string; policy: RetryPolicy }[] = [
  { id: 'default', label: 'Default — 5 attempts (1s → 256s)', policy: { max_attempts: 5, schedule_seconds: [1, 4, 16, 64, 256] } },
  { id: 'quick', label: 'Quick — 3 attempts (5s, 30s)', policy: { max_attempts: 3, schedule_seconds: [5, 30] } },
  { id: 'persistent', label: 'Persistent — 8 attempts (up to 1h)', policy: { max_attempts: 8, schedule_seconds: [1, 4, 16, 64, 256, 600, 1800, 3600] } },
]
const presetIdFor = (p?: RetryPolicy): string =>
  RETRY_PRESETS.find(x => JSON.stringify(x.policy) === JSON.stringify(p))?.id ?? 'default'

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function WebhooksPage() {
  const { data, isLoading } = useWebhookSubscriptions()
  const subs = data?.data ?? []
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<WebhookSubscription | null>(null)
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
        <WebhookForm
          onClose={() => setAdding(false)}
          onSecret={(url, secret) => setNewSecret({ url, secret })}
          onDone={() => setAdding(false)}
        />
      )}
      {editing && (
        <WebhookForm
          existing={editing}
          onClose={() => setEditing(null)}
          onSecret={(url, secret) => setNewSecret({ url, secret })}
          onDone={() => setEditing(null)}
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
          subs.map(sub => <WebhookCard key={sub.id} sub={sub} onEdit={() => { setAdding(false); setEditing(sub) }} />)
        )}
      </div>
    </div>
  )
}

function WebhookForm({ existing, onClose, onSecret, onDone }: {
  existing?: WebhookSubscription
  onClose: () => void
  onSecret: (url: string, secret: string) => void
  onDone: () => void
}) {
  const create = useCreateWebhook()
  const update = useUpdateWebhook()
  const isEdit = !!existing
  const [url, setUrl] = useState(existing?.url ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [authMethod, setAuthMethod] = useState<'hmac' | 'bearer'>(existing?.authMethod ?? 'hmac')
  const [events, setEvents] = useState<string[]>(existing?.events ?? ['customer.segment.entered', 'customer.segment.exited'])
  const [signingSecret, setSigningSecret] = useState('')
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
    Object.entries(existing?.customHeaders ?? {}).map(([key, value]) => ({ key, value })),
  )
  const [retryPreset, setRetryPreset] = useState<string>(presetIdFor(existing?.retryPolicy))
  const pending = create.isPending || update.isPending

  const toggleEvent = (id: string) =>
    setEvents(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id])

  async function regenerate() {
    if (!existing) return
    if (!confirm('Regenerate the signing secret? The old one stops working on the next delivery.')) return
    try {
      const res = await update.mutateAsync({ id: existing.id, regenerateSecret: true })
      if (res.data?.signingSecret) onSecret(existing.url, res.data.signingSecret)
      toast.success('Secret regenerated — copy it now')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^https:\/\//i.test(url)) return toast.error('URL must be HTTPS')
    if (events.length === 0) return toast.error('Select at least one event')
    const customHeaders = Object.fromEntries(headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value]))
    const retryPolicy = RETRY_PRESETS.find(x => x.id === retryPreset)?.policy
    try {
      if (isEdit) {
        await update.mutateAsync({ id: existing!.id, url, description: description || null, authMethod, events, customHeaders, retryPolicy })
        toast.success('Webhook updated')
        onDone()
      } else {
        const res = await create.mutateAsync({ url, description: description || undefined, authMethod, events, signingSecret: signingSecret || undefined, customHeaders, retryPolicy })
        onSecret(url, res.data!.signingSecret)
        toast.success('Webhook created')
        onDone()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save webhook')
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">{isEdit ? 'Edit webhook' : 'New webhook'}</p>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X size={15} /></button>
      </div>
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
      {isEdit ? (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Signing secret</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 text-sm border border-slate-200 bg-slate-50 rounded-lg text-slate-400">••••••••••••••••••••••••••••••••</code>
            <button type="button" onClick={regenerate} disabled={update.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
              <KeyRound size={13} /> Regenerate
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Shown once at creation. Regenerating invalidates the old secret immediately.</p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Signing secret</label>
          <input value={signingSecret} onChange={e => setSigningSecret(e.target.value)} placeholder="Leave blank to auto-generate"
            className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          <p className="text-xs text-slate-400 mt-1">For a Bearer receiver (e.g. Gowelmart), paste the receiver&apos;s expected token here.</p>
        </div>
      )}
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
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Custom headers</label>
        <div className="space-y-1.5">
          {headers.map((h, i) => (
            <div key={i} className="flex gap-2">
              <input value={h.key} onChange={e => setHeaders(headers.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                placeholder="X-Tenant" className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg" />
              <input value={h.value} onChange={e => setHeaders(headers.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                placeholder="gowelmart" className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg" />
              <button type="button" onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                className="p-1.5 text-slate-400 hover:text-red-500"><X size={13} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setHeaders([...headers, { key: '', value: '' }])}
            className="text-xs font-medium text-indigo-600 hover:underline">+ Add header</button>
        </div>
        <p className="text-xs text-slate-400 mt-1">Static headers sent with every delivery — e.g. tenant routing.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Retry policy</label>
        <select value={retryPreset} onChange={e => setRetryPreset(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200">
          {RETRY_PRESETS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <p className="text-xs text-slate-400 mt-1">Retries fire on 5xx / 408 / 429 / network errors. 400-level failures are final (misconfiguration, not transient).</p>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
        <button type="submit" disabled={pending}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {pending && <Loader2 size={14} className="animate-spin" />} {isEdit ? 'Save changes' : 'Create'}
        </button>
      </div>
    </form>
  )
}

function WebhookCard({ sub, onEdit }: { sub: WebhookSubscription; onEdit: () => void }) {
  const [showDeliveries, setShowDeliveries] = useState(false)
  const del = useDeleteWebhook()
  const test = useTestWebhook()
  const update = useUpdateWebhook()

  async function toggleActive() {
    try {
      await update.mutateAsync({ id: sub.id, isActive: !sub.isActive })
      toast.success(sub.isActive ? 'Webhook disabled' : 'Webhook enabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    }
  }

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
              <button onClick={toggleActive} disabled={update.isPending} title="Click to toggle"
                className={cn('text-[10px] px-2 py-0.5 rounded-full transition-colors', sub.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                {sub.isActive ? 'Active' : 'Disabled'}
              </button>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase">{sub.authMethod}</span>
              {sub.events.map(e => <code key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{e}</code>)}
              <span className="text-[10px] text-slate-400">Last delivery: {timeAgo(sub.lastDeliveryAt)}</span>
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
            <button onClick={onEdit} title="Edit"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              <Pencil size={13} /> Edit
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
