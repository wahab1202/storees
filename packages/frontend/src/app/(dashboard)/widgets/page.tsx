'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { NumberInput } from '@/components/ui/NumberInput'
import {
  useOptinWidgets,
  useCreateOptinWidget,
  useUpdateOptinWidget,
  useDeleteOptinWidget,
  type OptinWidget,
  type WidgetTriggerType,
} from '@/hooks/useOptinWidgets'
import { cn } from '@/lib/utils'
import { Loader2, Plus, X, Eye, Trash2, Power, PowerOff } from 'lucide-react'

const TRIGGER_LABELS: Record<WidgetTriggerType, string> = {
  exit_intent: 'Exit intent',
  time_on_page: 'Time on page',
  scroll_depth: 'Scroll depth',
  manual: 'Manual (Storees(\'widget\', \'show\'))',
}

const DEFAULT_FORM = {
  name: '',
  headline: '',
  body: null as string | null,
  buttonLabel: 'Get the discount',
  consentText: 'By submitting your phone number, you agree to receive WhatsApp messages from us. Reply STOP to unsubscribe.',
  triggerType: 'exit_intent' as WidgetTriggerType,
  triggerConfig: {} as Record<string, unknown>,
  targetPages: [] as string[],
  showOnce: true,
  collectEmail: false,
  collectName: false,
  phoneRequired: true,
  preCheckConsent: false,
  isActive: false,
}

export default function WidgetsPage() {
  const { data, isLoading } = useOptinWidgets()
  const create = useCreateOptinWidget()
  const del = useDeleteOptinWidget()

  const widgets = data?.data ?? []
  const [editing, setEditing] = useState<OptinWidget | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [previewOf, setPreviewOf] = useState<OptinWidget | null>(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="On-site Widgets"
        description="Storefront opt-in popups. Capture phone + WhatsApp consent on exit-intent, time-on-page, or scroll-depth."
      />

      <div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> New widget
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Your widgets</h2>
        </header>

        {isLoading ? (
          <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : widgets.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <p>No widgets yet.</p>
            <p className="mt-2 text-xs text-slate-400">Create one to start capturing storefront opt-ins.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Trigger</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {widgets.map(w => (
                <WidgetRow
                  key={w.id}
                  widget={w}
                  onPreview={() => setPreviewOf(w)}
                  onEdit={() => setEditing(w)}
                  onDelete={() => {
                    if (confirm(`Delete widget "${w.name}"?`)) del.mutate(w.id)
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showNew && (
        <WidgetEditor
          initial={{ ...DEFAULT_FORM }}
          onSave={(input) => create.mutate(input, { onSuccess: () => setShowNew(false) })}
          onCancel={() => setShowNew(false)}
          saving={create.isPending}
          mode="create"
        />
      )}

      {editing && (
        <WidgetEditorWithUpdate
          widget={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {previewOf && <PreviewModal widget={previewOf} onClose={() => setPreviewOf(null)} />}
    </div>
  )
}

function WidgetRow({ widget, onPreview, onEdit, onDelete }: {
  widget: OptinWidget
  onPreview: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <tr className="hover:bg-slate-50 align-top">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{widget.name}</div>
        <div className="text-xs text-slate-500 truncate max-w-md">{widget.headline}</div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">
        {TRIGGER_LABELS[widget.triggerType]}
        {widget.triggerType === 'time_on_page' && (widget.triggerConfig as { seconds?: number }).seconds !== undefined && (
          <span className="text-slate-400"> ({(widget.triggerConfig as { seconds: number }).seconds}s)</span>
        )}
        {widget.triggerType === 'scroll_depth' && (widget.triggerConfig as { percent?: number }).percent !== undefined && (
          <span className="text-slate-400"> ({(widget.triggerConfig as { percent: number }).percent}%)</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
          widget.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600',
        )}>
          {widget.isActive ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
          {widget.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <button onClick={onPreview} title="Preview" className="text-slate-500 hover:text-slate-900 px-1"><Eye className="h-4 w-4" /></button>
        <button onClick={onEdit} className="text-slate-500 hover:text-slate-900 ml-2 text-xs">Edit</button>
        <button onClick={onDelete} title="Delete" className="text-slate-400 hover:text-red-600 ml-2 px-1"><Trash2 className="h-4 w-4" /></button>
      </td>
    </tr>
  )
}

function WidgetEditorWithUpdate({ widget, onClose }: { widget: OptinWidget; onClose: () => void }) {
  const update = useUpdateOptinWidget(widget.id)
  return (
    <WidgetEditor
      initial={widget}
      onSave={(input) => update.mutate(input, { onSuccess: onClose })}
      onCancel={onClose}
      saving={update.isPending}
      mode="edit"
    />
  )
}

function WidgetEditor({ initial, onSave, onCancel, saving, mode }: {
  initial: typeof DEFAULT_FORM | OptinWidget
  onSave: (input: Partial<typeof DEFAULT_FORM>) => void
  onCancel: () => void
  saving: boolean
  mode: 'create' | 'edit'
}) {
  const [form, setForm] = useState({ ...initial })

  const updateTriggerConfig = (k: string, v: number) => {
    setForm(f => ({ ...f, triggerConfig: { ...f.triggerConfig, [k]: v } }))
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h3 className="text-base font-semibold text-slate-900">{mode === 'create' ? 'New widget' : `Edit "${(initial as OptinWidget).name ?? ''}"`}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </header>

        <div className="px-6 py-5 space-y-4">
          <Field label="Internal name" hint="Admin label only — not shown to visitors">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT} placeholder="Welcome offer" />
          </Field>
          <Field label="Headline" hint="Shown at the top of the popup">
            <input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} className={INPUT} placeholder="Get ₹150 off your first order" />
          </Field>
          <Field label="Body (optional)" hint="Supporting copy under the headline">
            <textarea value={form.body ?? ''} onChange={e => setForm(f => ({ ...f, body: e.target.value || null }))} rows={2} className={INPUT} />
          </Field>
          <Field label="Button label">
            <input value={form.buttonLabel} onChange={e => setForm(f => ({ ...f, buttonLabel: e.target.value }))} className={INPUT} />
          </Field>

          <Field label="Consent text" hint="Exact wording shown next to the consent checkbox. Required by DPDP Act + Meta WABA quality rating.">
            <textarea value={form.consentText} onChange={e => setForm(f => ({ ...f, consentText: e.target.value }))} rows={3} className={INPUT} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Trigger">
              <select value={form.triggerType} onChange={e => setForm(f => ({ ...f, triggerType: e.target.value as WidgetTriggerType, triggerConfig: {} }))} className={INPUT}>
                <option value="exit_intent">Exit intent (mouse leaves top)</option>
                <option value="time_on_page">After N seconds on page</option>
                <option value="scroll_depth">After N% scroll depth</option>
                <option value="manual">Manual (call from your code)</option>
              </select>
            </Field>
            {form.triggerType === 'time_on_page' && (
              <Field label="Seconds">
                <NumberInput min={1} max={600} value={(form.triggerConfig as { seconds?: number }).seconds ?? 30} onChange={n => updateTriggerConfig('seconds', n ?? 30)} className={INPUT} />
              </Field>
            )}
            {form.triggerType === 'scroll_depth' && (
              <Field label="Scroll %">
                <NumberInput min={1} max={100} value={(form.triggerConfig as { percent?: number }).percent ?? 50} onChange={n => updateTriggerConfig('percent', n ?? 50)} className={INPUT} />
              </Field>
            )}
          </div>

          <Field label="Target pages" hint="One URL pattern per line (e.g. /products/* or /). Empty = show on every page.">
            <textarea
              value={form.targetPages.join('\n')}
              onChange={e => setForm(f => ({ ...f, targetPages: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }))}
              rows={2}
              className={INPUT}
              placeholder="/products/*"
            />
          </Field>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            <Toggle label="Phone required" v={form.phoneRequired} on={v => setForm(f => ({ ...f, phoneRequired: v }))} />
            <Toggle label="Collect name" v={form.collectName} on={v => setForm(f => ({ ...f, collectName: v }))} />
            <Toggle label="Collect email" v={form.collectEmail} on={v => setForm(f => ({ ...f, collectEmail: v }))} />
            <Toggle label="Show once per visitor" v={form.showOnce} on={v => setForm(f => ({ ...f, showOnce: v }))} />
            <Toggle label="Pre-check consent" v={form.preCheckConsent} on={v => setForm(f => ({ ...f, preCheckConsent: v }))} />
            <Toggle label="Active" v={form.isActive} on={v => setForm(f => ({ ...f, isActive: v }))} />
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onCancel} className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}

function PreviewModal({ widget, onClose }: { widget: OptinWidget; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-7 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-4 text-slate-400 hover:text-slate-700 text-2xl">×</button>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">{widget.headline}</h3>
        {widget.body && <p className="text-sm text-slate-600 mb-4">{widget.body}</p>}
        <div className="space-y-3">
          {widget.collectName && <input className={INPUT} placeholder="Name" disabled />}
          {widget.collectEmail && <input className={INPUT} placeholder="Email" disabled />}
          <input className={INPUT} placeholder="Phone +91 9876543210" disabled />
          <label className="flex gap-2 items-start text-xs text-slate-600">
            <input type="checkbox" defaultChecked={widget.preCheckConsent} disabled className="mt-0.5 flex-shrink-0" />
            <span>{widget.consentText}</span>
          </label>
          <button className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg" disabled>{widget.buttonLabel}</button>
        </div>
        <p className="text-xs text-slate-400 mt-4 text-center">Preview only — submission is disabled.</p>
      </div>
    </div>
  )
}

const INPUT = 'w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  )
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={v} onChange={e => on(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
      <span className="text-slate-700">{label}</span>
    </label>
  )
}
