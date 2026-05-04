'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useWhatsappTemplates,
  useLintWhatsappTemplate,
  useSubmitWhatsappTemplate,
  useSyncWhatsappTemplates,
  useRefreshTemplateStatus,
  type WhatsappTemplate,
  type LintFinding,
  type SubmitInput,
} from '@/hooks/useWhatsappTemplates'
import { cn } from '@/lib/utils'
import { Loader2, RefreshCw, AlertCircle, CheckCircle2, Clock, Plus, X } from 'lucide-react'

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  APPROVED:   { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  PENDING:    { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: Clock },
  IN_APPEAL:  { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: Clock },
  REJECTED:   { bg: 'bg-red-100',     text: 'text-red-700',     icon: AlertCircle },
  FLAGGED:    { bg: 'bg-red-100',     text: 'text-red-700',     icon: AlertCircle },
  PAUSED:     { bg: 'bg-slate-100',   text: 'text-slate-700',   icon: AlertCircle },
  DISABLED:   { bg: 'bg-slate-100',   text: 'text-slate-700',   icon: AlertCircle },
}

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utility',
  AUTHENTICATION: 'Authentication',
}

export default function WhatsappTemplatesPage() {
  const { data, isLoading } = useWhatsappTemplates()
  const sync = useSyncWhatsappTemplates()
  const refresh = useRefreshTemplateStatus()
  const [showForm, setShowForm] = useState(false)

  const templates = data?.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Templates"
        description="Submit, track approval status, and monitor re-categorisations."
      />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Submit new template'}
        </button>
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 disabled:opacity-60"
        >
          {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync from provider
        </button>
      </div>

      {showForm && <SubmitForm onDone={() => setShowForm(false)} />}

      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">All templates</h2>
          <span className="text-xs text-slate-500">{templates.length} {templates.length === 1 ? 'template' : 'templates'}</span>
        </header>

        {isLoading ? (
          <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No templates yet. Submit a new one or sync from your WhatsApp provider.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Language</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Last checked</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map(t => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  onRefresh={() => refresh.mutate(t.id)}
                  isRefreshing={refresh.isPending && refresh.variables === t.id}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function TemplateRow({ template: t, onRefresh, isRefreshing }: {
  template: WhatsappTemplate
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const style = STATUS_STYLES[t.status] ?? STATUS_STYLES.PENDING
  const StatusIcon = style.icon
  const wasRecategorised = !!t.previousCategory && t.previousCategory !== t.category

  return (
    <tr className="hover:bg-slate-50 align-top">
      <td className="px-4 py-3 font-mono text-xs">{t.name}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{t.language}</td>
      <td className="px-4 py-3 text-xs">
        {t.category ? (
          <span className="inline-flex items-center gap-1.5">
            {CATEGORY_LABELS[t.category] ?? t.category}
            {wasRecategorised && (
              <span className="text-amber-600" title={`Was: ${t.previousCategory}`}>
                ⚠
              </span>
            )}
          </span>
        ) : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3">
        <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', style.bg, style.text)}>
          <StatusIcon className="h-3 w-3" /> {t.status}
        </span>
        {t.rejectionReason && (
          <div className="text-xs text-red-600 mt-1 max-w-xs">{t.rejectionReason}</div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {t.lastStatusCheckAt ? new Date(t.lastStatusCheckAt).toLocaleString() : 'never'}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 disabled:opacity-50"
        >
          {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </td>
    </tr>
  )
}

function SubmitForm({ onDone }: { onDone: () => void }) {
  const lint = useLintWhatsappTemplate()
  const submit = useSubmitWhatsappTemplate()

  const [form, setForm] = useState<SubmitInput>({
    name: '',
    language: 'en_US',
    category: 'UTILITY',
    bodyText: '',
    footer: '',
  })

  const findings: LintFinding[] = lint.data?.data?.findings ?? []
  const blocking = lint.data?.data?.blocking ?? false
  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')

  const handleLint = () => lint.mutate(form)

  const handleSubmit = () => {
    submit.mutate(form, { onSuccess: () => onDone() })
  }

  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">New template submission</h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">Name <span className="text-slate-400 text-xs">(lowercase + underscore)</span></span>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="welcome_offer"
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">Language</span>
          <input
            value={form.language}
            onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
            placeholder="en_US"
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">Category</span>
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value as SubmitInput['category'] }))}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          >
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
            <option value="AUTHENTICATION">Authentication</option>
          </select>
        </label>
      </div>

      <label className="block text-sm mb-3">
        <span className="block font-medium text-slate-700 mb-1">Body</span>
        <textarea
          value={form.bodyText}
          onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))}
          rows={4}
          placeholder="Hi {{1}}, your order #{{2}} has been confirmed."
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
        />
        <span className="text-xs text-slate-500 mt-1 block">Use {`{{1}}`}, {`{{2}}`}, ... for parameters. Max 1024 chars.</span>
      </label>

      <label className="block text-sm mb-3">
        <span className="block font-medium text-slate-700 mb-1">Footer (optional)</span>
        <input
          value={form.footer ?? ''}
          onChange={e => setForm(f => ({ ...f, footer: e.target.value }))}
          placeholder="Reply STOP to unsubscribe"
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
        />
      </label>

      {findings.length > 0 && (
        <div className="mb-3 space-y-1">
          {errors.map((f, i) => (
            <div key={`e${i}`} className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <strong>Error:</strong> {f.message}
            </div>
          ))}
          {warnings.map((f, i) => (
            <div key={`w${i}`} className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <strong>Warning:</strong> {f.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleLint}
          disabled={lint.isPending || !form.bodyText}
          className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 disabled:opacity-60"
        >
          {lint.isPending && <Loader2 className="h-4 w-4 animate-spin inline mr-1" />}
          Run lint
        </button>
        <button
          onClick={handleSubmit}
          disabled={submit.isPending || blocking || !form.name || !form.bodyText}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submit.isPending && <Loader2 className="h-4 w-4 animate-spin inline mr-1" />}
          Submit to provider
        </button>
        {blocking && <span className="text-xs text-red-600">Resolve blocking errors before submitting</span>}
      </div>
    </section>
  )
}
