'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  useWhatsappProviderStatus,
  useWhatsappTemplates,
  useLintWhatsappTemplate,
  useSubmitWhatsappTemplate,
  useSaveWhatsappDraft,
  useEditWhatsappDraft,
  useSubmitWhatsappForApproval,
  useSyncWhatsappTemplates,
  useRefreshTemplateStatus,
  type WhatsappTemplate,
  type WhatsappProviderStatus,
  type LintFinding,
  type SubmitInput,
} from '@/hooks/useWhatsappTemplates'
import { cn } from '@/lib/utils'
import { Loader2, RefreshCw, AlertCircle, CheckCircle2, Clock, Plus, X, Send, Save, Pencil, FileText } from 'lucide-react'

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  DRAFT:      { bg: 'bg-slate-100',   text: 'text-slate-600',   icon: FileText },
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
  const providerStatus = useWhatsappProviderStatus()
  const { data, isLoading } = useWhatsappTemplates()
  const sync = useSyncWhatsappTemplates()
  const refresh = useRefreshTemplateStatus()
  const submitApproval = useSubmitWhatsappForApproval()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null)

  const templates = data?.data ?? []
  const formOpen = showForm || !!editing
  const canSubmit = !!providerStatus.data?.data?.capabilities.submitTemplate && !!providerStatus.data?.data?.configured

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Templates"
        description="Submit, track approval status, and monitor re-categorisations."
      />

      <ProviderStatusBanner status={providerStatus.data?.data} loading={providerStatus.isLoading} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setEditing(null); setShowForm(v => !v) }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
        >
          {formOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {formOpen ? 'Cancel' : 'New template'}
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

      {formOpen && (
        <SubmitForm
          key={editing?.id ?? 'new'}
          editing={editing}
          onDone={() => { setShowForm(false); setEditing(null) }}
          canSubmit={canSubmit}
        />
      )}

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
                  onEdit={() => { setShowForm(false); setEditing(t) }}
                  onSubmitForApproval={() => submitApproval.mutate(t.id)}
                  isSubmitting={submitApproval.isPending && submitApproval.variables === t.id}
                  canSubmit={canSubmit}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function ProviderStatusBanner({ status, loading }: {
  status?: WhatsappProviderStatus
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Checking connected WhatsApp provider...
      </div>
    )
  }

  if (!status?.provider) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No WhatsApp provider is connected. Connect WhatsApp Cloud API in Settings before syncing or submitting templates.
      </div>
    )
  }

  const canSubmit = status.configured && status.capabilities.submitTemplate
  const canSync = status.configured && status.capabilities.syncTemplates
  const canRefresh = status.configured && status.capabilities.getTemplateStatus

  return (
    <div className={cn('rounded-lg border px-4 py-3', canSubmit ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className={cn('text-sm font-semibold', canSubmit ? 'text-emerald-900' : 'text-amber-900')}>
            Connected provider: {status.provider}
          </p>
          <p className={cn('mt-0.5 text-xs', canSubmit ? 'text-emerald-700' : 'text-amber-800')}>
            Templates are submitted through the connected provider. Meta approval status is stored and refreshed here.
          </p>
          {status.missingConfig.length > 0 && (
            <p className="mt-1 text-xs text-amber-800">
              Missing config: {status.missingConfig.join(', ')}. For Meta, template approval needs Phone Number ID, WABA ID, and Access Token.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <CapabilityPill enabled={canSubmit} label="Submit for approval" />
          <CapabilityPill enabled={canSync} label="Sync templates" />
          <CapabilityPill enabled={canRefresh} label="Refresh status" />
        </div>
      </div>
    </div>
  )
}

function CapabilityPill({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium', enabled ? 'bg-white text-emerald-700' : 'bg-white text-amber-700')}>
      {enabled ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {label}
    </span>
  )
}

function TemplateRow({ template: t, onRefresh, isRefreshing, onEdit, onSubmitForApproval, isSubmitting, canSubmit }: {
  template: WhatsappTemplate
  onRefresh: () => void
  isRefreshing: boolean
  onEdit: () => void
  onSubmitForApproval: () => void
  isSubmitting: boolean
  canSubmit: boolean
}) {
  const editable = t.status === 'DRAFT' || t.status === 'REJECTED'
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
        <div className="inline-flex items-center gap-3 justify-end">
          {editable && (
            <>
              <button
                onClick={onEdit}
                className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                onClick={onSubmitForApproval}
                disabled={isSubmitting || !canSubmit}
                title={!canSubmit ? 'Connect a WhatsApp provider that supports submission' : undefined}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Submit for approval
              </button>
            </>
          )}
          {t.status !== 'DRAFT' && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 disabled:opacity-50"
            >
              {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function SubmitForm({ onDone, canSubmit, editing }: { onDone: () => void; canSubmit: boolean; editing: WhatsappTemplate | null }) {
  const lint = useLintWhatsappTemplate()
  const submit = useSubmitWhatsappTemplate()       // new: create + immediate submit
  const saveDraft = useSaveWhatsappDraft()          // new: create as draft
  const editDraft = useEditWhatsappDraft()          // edit existing draft
  const submitApproval = useSubmitWhatsappForApproval() // submit existing draft

  const isEditing = !!editing
  const [form, setForm] = useState<SubmitInput>({
    name: editing?.name ?? '',
    language: editing?.language ?? 'en_US',
    category: (editing?.category as SubmitInput['category']) ?? 'UTILITY',
    bodyText: editing?.bodyText ?? '',
    footer: editing?.footer ?? '',
  })

  const findings: LintFinding[] = lint.data?.data?.findings ?? []
  const blocking = lint.data?.data?.blocking ?? false
  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  const parameterCount = countTemplateParameters(form.bodyText)
  const pending = submit.isPending || saveDraft.isPending || editDraft.isPending || submitApproval.isPending
  const incomplete = !form.name || !form.bodyText

  const buildInput = (): SubmitInput => ({
    ...form,
    bodyExample: parameterCount > 0
      ? Array.from({ length: parameterCount }, (_, idx) => form.bodyExample?.[idx]?.trim() || sampleValueFor(idx))
      : undefined,
  })

  const handleLint = () => lint.mutate(form)

  // Save (as draft, or update an existing draft) — no provider submission.
  const handleSaveDraft = () => {
    if (isEditing) editDraft.mutate({ id: editing!.id, input: buildInput() }, { onSuccess: () => onDone() })
    else saveDraft.mutate(buildInput(), { onSuccess: () => onDone() })
  }

  // Submit for approval. When editing, persist edits first, then push to provider.
  const handleSubmitForApproval = () => {
    if (isEditing) {
      editDraft.mutate({ id: editing!.id, input: buildInput() }, {
        onSuccess: () => submitApproval.mutate(editing!.id, { onSuccess: () => onDone() }),
      })
    } else {
      submit.mutate(buildInput(), { onSuccess: () => onDone() })
    }
  }

  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {isEditing ? `Edit ${editing!.status === 'REJECTED' ? 'rejected' : 'draft'} template: ${editing!.name}` : 'New template'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <label className="text-sm">
          <span className="block font-medium text-slate-700 mb-1">Name <span className="text-slate-400 text-xs">(lowercase + underscore)</span></span>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="welcome_offer"
            readOnly={isEditing}
            className={cn(
              'w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500',
              isEditing && 'bg-slate-100 text-slate-500 cursor-not-allowed',
            )}
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

      {parameterCount > 0 && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-medium text-slate-700">Meta review examples</p>
          <p className="mt-0.5 text-xs text-slate-500">Meta requires sample values for every body parameter before it will review the template.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: parameterCount }, (_, idx) => (
              <label key={idx} className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">{`{{${idx + 1}}}`} example</span>
                <input
                  value={form.bodyExample?.[idx] ?? ''}
                  onChange={e => setForm(f => {
                    const examples = Array.from({ length: parameterCount }, (_, i) => f.bodyExample?.[i] ?? sampleValueFor(i))
                    examples[idx] = e.target.value
                    return { ...f, bodyExample: examples }
                  })}
                  placeholder={sampleValueFor(idx)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </label>
            ))}
          </div>
        </div>
      )}

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

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleLint}
          disabled={lint.isPending || !form.bodyText}
          className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 disabled:opacity-60"
        >
          {lint.isPending && <Loader2 className="h-4 w-4 animate-spin inline mr-1" />}
          Run lint
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={pending || blocking || incomplete}
          className="px-4 py-2 border border-indigo-300 text-indigo-700 bg-white text-sm font-medium rounded-md hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {(saveDraft.isPending || (editDraft.isPending && !submitApproval.isPending)) ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : <Save className="h-4 w-4 inline mr-1" />}
          {isEditing ? 'Save draft' : 'Save as draft'}
        </button>
        <button
          onClick={handleSubmitForApproval}
          disabled={pending || blocking || !canSubmit || incomplete}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {(submit.isPending || submitApproval.isPending) ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : <Send className="h-4 w-4 inline mr-1" />}
          Submit for approval
        </button>
        {blocking && <span className="text-xs text-red-600">Resolve blocking errors before submitting</span>}
        {!canSubmit && <span className="text-xs text-amber-700">Save as draft is fine; submission needs a connected provider.</span>}
      </div>
    </section>
  )
}

function countTemplateParameters(body: string): number {
  const matches = Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(match => Number(match[1]))
  return matches.length > 0 ? Math.max(...matches) : 0
}

function sampleValueFor(idx: number): string {
  return ['Wahab', 'ORD-1001', 'Storees', '20%'][idx] ?? `sample ${idx + 1}`
}
