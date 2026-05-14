'use client'

import { useState } from 'react'
import { Plus, Trash2, Pencil, Layers, Image as ImageIcon, ExternalLink, Eye, MousePointerClick, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentFilterBuilder } from '@/components/segments/SegmentFilterBuilder'
import {
  useInAppMessages,
  useCreateInAppMessage,
  useUpdateInAppMessage,
  useDeleteInAppMessage,
  type InAppMessage,
  type InAppMessagePosition,
  type InAppMessageFrequency,
  type InAppMessageStatus,
} from '@/hooks/useInAppMessages'
import type { FilterConfig } from '@storees/shared'

// Gap 1: in-app + on-site web messaging admin page. List + composer.
// Actual rendering on the storefront is done by Storees.js fetching
// /api/v1/in-app-messages per customer.

const POSITIONS: Array<{ id: InAppMessagePosition; label: string; desc: string }> = [
  { id: 'modal', label: 'Modal', desc: 'Center overlay — highest attention, blocks interaction' },
  { id: 'banner', label: 'Banner', desc: 'Top strip — passive, always visible until dismissed' },
  { id: 'toast', label: 'Toast', desc: 'Corner snackbar — brief, auto-dismisses' },
  { id: 'inbox', label: 'Inbox', desc: 'Persistent notification feed — no auto-dismiss' },
]
const FREQUENCIES: Array<{ id: InAppMessageFrequency; label: string; desc: string }> = [
  { id: 'once', label: 'Once', desc: 'Show one time per customer' },
  { id: 'daily', label: 'Daily', desc: 'At most once per customer per UTC day' },
  { id: 'always', label: 'Always', desc: 'Show every page-load until dismissed' },
]

const EMPTY_FILTER: FilterConfig = { logic: 'AND', rules: [] }

export default function InAppMessagesPage() {
  const { data, isLoading } = useInAppMessages()
  const messages = data?.data ?? []
  const [editing, setEditing] = useState<InAppMessage | null>(null)
  const [composing, setComposing] = useState(false)

  return (
    <div className="space-y-5">
      <PageHeader
        title="In-App Messages"
        actions={
          <button
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New message
          </button>
        }
      />

      <p className="text-sm text-text-muted max-w-3xl">
        Modals, banners, toasts, and inbox cards rendered inside your client's storefront via the Storees SDK. The customer's segment membership + page URL drives which messages show; per-customer dismissals dedup so the same message doesn't reappear.
      </p>

      {isLoading ? (
        <div className="text-sm text-text-muted py-8 text-center">Loading messages…</div>
      ) : messages.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl px-8 py-12 text-center">
          <Layers className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-heading mb-1">No in-app messages yet</h3>
          <p className="text-sm text-text-muted mb-4 max-w-md mx-auto">
            Author a modal, banner, toast, or inbox card here. The Storees SDK on your storefront fetches active messages per customer and renders them.
          </p>
          <button
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Compose first message
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => <MessageCard key={m.id} message={m} onEdit={() => setEditing(m)} />)}
        </div>
      )}

      {(composing || editing) && (
        <Composer
          existing={editing}
          onClose={() => { setComposing(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function MessageCard({ message: m, onEdit }: { message: InAppMessage; onEdit: () => void }) {
  const deleteMutation = useDeleteInAppMessage()
  const updateMutation = useUpdateInAppMessage()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const ctr = m.impressions > 0 ? Math.round((m.ctaClicks / m.impressions) * 100) : 0

  return (
    <div className="border border-border rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-heading">{m.name}</span>
            <StatusBadge status={m.status} />
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-text-muted font-medium uppercase tracking-wider">
              {m.position}
            </span>
          </div>
          <p className="text-sm text-text-primary truncate">
            <span className="font-medium">{m.title}</span>
            {m.body ? <span className="text-text-muted"> — {m.body.slice(0, 80)}{m.body.length > 80 ? '…' : ''}</span> : null}
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {m.impressions.toLocaleString()}</span>
            <span className="inline-flex items-center gap-1"><X className="h-3 w-3" /> {m.dismissals.toLocaleString()}</span>
            <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {m.ctaClicks.toLocaleString()} ({ctr}%)</span>
            <span>Freq: {m.frequency}</span>
            {m.audienceFilter && m.audienceFilter.rules.length > 0 && <span>Audience-targeted</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => updateMutation.mutate({ id: m.id, status: m.status === 'active' ? 'paused' : 'active' })}
            className="px-2 py-1 text-xs font-medium border border-border rounded-md hover:bg-surface"
          >
            {m.status === 'active' ? 'Pause' : m.status === 'paused' ? 'Resume' : 'Activate'}
          </button>
          <button onClick={onEdit} className="p-1 text-text-muted hover:text-text-primary rounded-md hover:bg-surface" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {confirmingDelete ? (
            <>
              <button
                onClick={() => deleteMutation.mutate(m.id, { onSettled: () => setConfirmingDelete(false) })}
                className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Confirm
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="px-2 py-1 text-xs text-text-muted hover:text-text-primary">Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirmingDelete(true)} className="p-1 text-text-muted hover:text-red-600 rounded-md hover:bg-surface" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: InAppMessageStatus }) {
  const config: Record<InAppMessageStatus, { color: string; label: string }> = {
    draft:    { color: 'bg-surface text-text-muted', label: 'Draft' },
    active:   { color: 'bg-emerald-50 text-emerald-700', label: 'Active' },
    paused:   { color: 'bg-amber-50 text-amber-700', label: 'Paused' },
    archived: { color: 'bg-surface text-text-muted', label: 'Archived' },
  }
  const c = config[status]
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.color}`}>{c.label}</span>
}

function Composer({ existing, onClose }: { existing: InAppMessage | null; onClose: () => void }) {
  const isEdit = !!existing
  const create = useCreateInAppMessage()
  const update = useUpdateInAppMessage()

  const [name, setName] = useState(existing?.name ?? '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? '')
  const [ctaLabel, setCtaLabel] = useState(existing?.ctaLabel ?? '')
  const [ctaUrl, setCtaUrl] = useState(existing?.ctaUrl ?? '')
  const [position, setPosition] = useState<InAppMessagePosition>(existing?.position ?? 'modal')
  const [frequency, setFrequency] = useState<InAppMessageFrequency>(existing?.frequency ?? 'once')
  const [targetPages, setTargetPages] = useState((existing?.targetPages ?? []).join('\n'))
  const [audienceFilter, setAudienceFilter] = useState<FilterConfig>(existing?.audienceFilter ?? EMPTY_FILTER)
  const [status, setStatus] = useState<InAppMessageStatus>(existing?.status ?? 'draft')

  async function handleSave() {
    if (!name.trim() || !title.trim()) return
    const payload = {
      name: name.trim(),
      title: title.trim(),
      body: body.trim() || null,
      imageUrl: imageUrl.trim() || null,
      ctaLabel: ctaLabel.trim() || null,
      ctaUrl: ctaUrl.trim() || null,
      position,
      frequency,
      targetPages: targetPages.split('\n').map((s) => s.trim()).filter(Boolean),
      audienceFilter: audienceFilter.rules.length > 0 ? audienceFilter : null,
      status,
    }
    if (isEdit && existing) {
      await update.mutateAsync({ id: existing.id, ...payload })
    } else {
      await create.mutateAsync(payload)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen flex items-start justify-center py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-heading">
              {isEdit ? 'Edit in-app message' : 'New in-app message'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-surface">
              <X className="h-4 w-4 text-text-muted" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] divide-x divide-border">
            {/* Form */}
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <Section title="Content">
                <Field label="Internal name">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Black Friday banner" className={INPUT} />
                </Field>
                <Field label="Title">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Eye-catching headline" className={INPUT} />
                </Field>
                <Field label="Body (optional)">
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Supporting copy" className={INPUT} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Image URL">
                    <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className={INPUT} />
                  </Field>
                  <Field label="CTA label">
                    <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Shop now" className={INPUT} />
                  </Field>
                </div>
                <Field label="CTA URL">
                  <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://shop.example.com/sale" className={INPUT} />
                </Field>
              </Section>

              <Section title="Display rules">
                <Field label="Position">
                  <div className="space-y-1.5">
                    {POSITIONS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPosition(p.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                          position === p.id ? 'border-text-primary bg-surface' : 'border-border hover:border-text-muted'
                        }`}
                      >
                        <div className="text-sm font-medium text-heading">{p.label}</div>
                        <div className="text-xs text-text-muted mt-0.5">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Frequency">
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value as InAppMessageFrequency)} className={INPUT}>
                    {FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.label} — {f.desc}</option>)}
                  </select>
                </Field>
                <Field label="Target pages (one URL pattern per line, blank = every page)">
                  <textarea
                    value={targetPages}
                    onChange={(e) => setTargetPages(e.target.value)}
                    rows={3}
                    placeholder={'/cart\n/checkout/*'}
                    className={`${INPUT} font-mono text-xs`}
                  />
                </Field>
              </Section>

              <Section title="Audience">
                <p className="text-xs text-text-muted mb-2">
                  Customers matching this filter will see the message. Leave empty to target all logged-in customers.
                </p>
                <div className="border border-border rounded-lg p-3 bg-surface/30">
                  <SegmentFilterBuilder filters={audienceFilter} onChange={setAudienceFilter} />
                </div>
              </Section>

              <Section title="Status">
                <div className="flex gap-2">
                  {(['draft', 'active', 'paused'] as InAppMessageStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md border ${
                        status === s ? 'border-text-primary bg-text-primary text-white' : 'border-border text-text-secondary hover:border-text-muted'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </Section>
            </div>

            {/* Preview */}
            <div className="p-5 bg-surface/30 max-h-[80vh] overflow-y-auto">
              <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Preview · {position}</div>
              <Preview title={title} body={body} imageUrl={imageUrl} ctaLabel={ctaLabel} position={position} />
            </div>
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border bg-surface/40">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || !title.trim() || create.isPending || update.isPending}
              className="px-4 py-2 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(create.isPending || update.isPending) ? 'Saving…' : isEdit ? 'Save changes' : 'Save message'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-text-muted font-medium mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  )
}

const INPUT = 'w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent'

function Preview({ title, body, imageUrl, ctaLabel, position }: { title: string; body: string; imageUrl: string; ctaLabel: string; position: InAppMessagePosition }) {
  const showImage = !!imageUrl
  const ctaButton = ctaLabel ? (
    <button className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md">
      {ctaLabel}
      <ExternalLink className="h-3 w-3" />
    </button>
  ) : null

  if (position === 'modal') {
    return (
      <div className="rounded-xl bg-slate-800 p-3 shadow-inner">
        <div className="bg-white rounded-lg p-4">
          {showImage && <img src={imageUrl} alt="" className="w-full h-32 object-cover rounded mb-3" />}
          <div className="text-sm font-semibold text-slate-900">{title || 'Title'}</div>
          {body && <div className="text-xs text-slate-600 mt-1">{body}</div>}
          {ctaButton}
        </div>
      </div>
    )
  }
  if (position === 'banner') {
    return (
      <div className="rounded-md bg-indigo-600 text-white px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{title || 'Title'}</div>
          {body && <div className="text-xs opacity-90 truncate">{body}</div>}
        </div>
        {ctaLabel && (
          <button className="px-3 py-1 bg-white text-indigo-700 text-xs font-medium rounded">
            {ctaLabel}
          </button>
        )}
      </div>
    )
  }
  if (position === 'toast') {
    return (
      <div className="rounded-lg border border-slate-300 bg-white shadow-lg p-3 max-w-xs">
        <div className="flex items-start gap-2">
          {showImage ? (
            <img src={imageUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
          ) : (
            <div className="h-10 w-10 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{title || 'Title'}</div>
            {body && <div className="text-xs text-slate-600 truncate">{body}</div>}
          </div>
        </div>
      </div>
    )
  }
  // inbox
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Inbox card</div>
      <div className="text-sm font-semibold text-heading">{title || 'Title'}</div>
      {body && <div className="text-xs text-text-secondary mt-1">{body}</div>}
      {showImage && <img src={imageUrl} alt="" className="mt-2 w-full h-20 object-cover rounded" />}
      {ctaButton}
    </div>
  )
}
