'use client'

import Link from 'next/link'
import { useTemplates, useDeleteTemplate, useSeedTemplates } from '@/hooks/useTemplates'
import { useWhatsappTemplates, useSyncWhatsappTemplates, useRefreshTemplateStatus, type WhatsappTemplate } from '@/hooks/useWhatsappTemplates'
import { toast } from 'sonner'
import { TemplatePreviewCard } from '@/components/shared/TemplatePreviewCard'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { PageHeader } from '@/components/layout/PageHeader'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { Plus, Mail, MessageSquare, Bell, Phone, FileText, Trash2, Loader2, Search, Pencil, Sparkles, Layers, RefreshCw, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { EmailTemplate, TemplateChannel } from '@storees/shared'

const WA_STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600', icon: FileText },
  APPROVED: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  PENDING: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock },
  IN_APPEAL: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle },
  FLAGGED: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle },
  PAUSED: { bg: 'bg-slate-100', text: 'text-slate-700', icon: AlertCircle },
  DISABLED: { bg: 'bg-slate-100', text: 'text-slate-700', icon: AlertCircle },
}

const CHANNEL_TABS: { value: TemplateChannel | 'all'; label: string; icon: typeof Mail }[] = [
  { value: 'all',      label: 'All',       icon: FileText },
  { value: 'email',    label: 'Email',     icon: Mail },
  { value: 'sms',      label: 'SMS',       icon: MessageSquare },
  { value: 'push',     label: 'Push',      icon: Bell },
  { value: 'whatsapp', label: 'WhatsApp',  icon: Phone },
  { value: 'in_app',   label: 'In-App',    icon: Layers },
]

const CHANNEL_CONFIG = {
  email:     { label: 'Email',    icon: Mail,          color: 'text-blue-600 bg-blue-50 border-blue-200' },
  sms:       { label: 'SMS',      icon: MessageSquare, color: 'text-teal-600 bg-teal-50 border-teal-200' },
  push:      { label: 'Push',     icon: Bell,          color: 'text-violet-600 bg-violet-50 border-violet-200' },
  whatsapp:  { label: 'WhatsApp', icon: Phone,         color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  in_app:    { label: 'In-App',   icon: Layers,        color: 'text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200' },
} as const

export default function TemplatesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-text-secondary">Loading…</div>}>
      <TemplatesContent />
    </Suspense>
  )
}

function TemplatesContent() {
  const { data, isLoading, isError } = useTemplates()
  const { data: waData, isLoading: waLoading } = useWhatsappTemplates()
  const syncWa = useSyncWhatsappTemplates()
  const refreshWa = useRefreshTemplateStatus()
  const deleteTemplate = useDeleteTemplate()
  const seedTemplates = useSeedTemplates()
  const searchParams = useSearchParams()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState<TemplateChannel | 'all'>(
    (searchParams.get('channel') as TemplateChannel) ?? 'all',
  )
  const [search, setSearch] = useState('')
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null)

  // WhatsApp templates live in their own lifecycle-managed table; the generic
  // editor no longer writes channel='whatsapp' rows, so exclude any legacy ones.
  const templates = (data?.data ?? []).filter((t: EmailTemplate) => t.channel !== 'whatsapp')
  const waTemplates = waData?.data ?? []

  const filtered = useMemo(() => {
    let result = templates
    if (channelFilter !== 'all') {
      result = result.filter((t: EmailTemplate) => t.channel === channelFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t: EmailTemplate) =>
        t.name.toLowerCase().includes(q) ||
        (t.subject && t.subject.toLowerCase().includes(q))
      )
    }
    return result
  }, [templates, channelFilter, search])

  const filteredWa = useMemo(() => {
    if (channelFilter !== 'all' && channelFilter !== 'whatsapp') return []
    if (!search.trim()) return waTemplates
    const q = search.toLowerCase()
    return waTemplates.filter(t => t.name.toLowerCase().includes(q) || t.bodyText.toLowerCase().includes(q))
  }, [waTemplates, channelFilter, search])

  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length + waTemplates.length, whatsapp: waTemplates.length }
    for (const t of templates) {
      counts[t.channel] = (counts[t.channel] ?? 0) + 1
    }
    return counts
  }, [templates, waTemplates])

  const isWhatsappTab = channelFilter === 'whatsapp'

  return (
    <div>
      <PageHeader
        title="Templates"
        actions={
          <div className="flex items-center gap-2">
            {isWhatsappTab && (
              <>
                <button
                  onClick={() => syncWa.mutate()}
                  disabled={syncWa.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border text-text-secondary rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
                >
                  {syncWa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sync from provider
                </button>
                <Link
                  href="/templates/whatsapp/new"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New WhatsApp Template
                </Link>
              </>
            )}
            {!isWhatsappTab && (
            <>
            <button
              onClick={() => seedTemplates.mutate({ force: true }, {
                onSuccess: (res) => {
                  const seeded = res.data?.seeded ?? 0
                  if (seeded > 0) toast.success(`Added ${seeded} starter templates`)
                  else toast.info(res.data?.message ?? 'Templates already loaded')
                },
                onError: () => toast.error('Failed to load starter templates'),
              })}
              disabled={seedTemplates.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border text-text-secondary rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
            >
              {seedTemplates.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Starter Templates
            </button>
            <Link
              href="/templates/create"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Template
            </Link>
            </>
            )}
          </div>
        }
      />

      {/* Channel filter tabs */}
      <div className="flex items-center gap-1 mb-4 bg-white border border-border rounded-lg p-1 overflow-x-auto">
        {CHANNEL_TABS.map(tab => {
          const Icon = tab.icon
          const count = channelCounts[tab.value] ?? 0
          const isActive = channelFilter === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setChannelFilter(tab.value)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                isActive ? 'bg-white/20' : 'bg-surface',
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-full h-10 pl-9 pr-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 placeholder:text-text-muted"
        />
      </div>

      {isLoading || (isWhatsappTab && waLoading) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load templates.</p>
        </div>
      ) : filtered.length === 0 && filteredWa.length === 0 ? (
        <div className="text-center py-20 bg-white border border-border rounded-xl">
          <FileText className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            {isWhatsappTab ? 'No WhatsApp templates yet' : templates.length === 0 ? 'No templates yet' : 'No matching templates'}
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            {isWhatsappTab
              ? 'Build a Meta-approved WhatsApp template, or sync existing ones from your provider.'
              : templates.length === 0
                ? 'Create reusable message templates for email, SMS, push, and WhatsApp.'
                : 'Try adjusting your search or channel filter.'}
          </p>
          {isWhatsappTab ? (
            <Link
              href="/templates/whatsapp/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
            >
              <Plus className="h-4 w-4" />
              New WhatsApp Template
            </Link>
          ) : templates.length === 0 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => seedTemplates.mutate({}, {
                  onSuccess: (res) => {
                    const seeded = res.data?.seeded ?? 0
                    if (seeded > 0) toast.success(`Added ${seeded} starter templates`)
                  },
                  onError: () => toast.error('Failed to load starter templates'),
                })}
                disabled={seedTemplates.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {seedTemplates.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Load Starter Templates
              </button>
              <Link
                href="/templates/create"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border text-text-secondary rounded-lg hover:bg-surface transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create from Scratch
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredWa.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredWa.map(t => (
                <WhatsappTemplateCard
                  key={t.id}
                  template={t}
                  onRefresh={() => refreshWa.mutate(t.id)}
                  isRefreshing={refreshWa.isPending && refreshWa.variables === t.id}
                />
              ))}
            </div>
          )}
          {filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((tpl: EmailTemplate) => {
            const ch = CHANNEL_CONFIG[tpl.channel] ?? CHANNEL_CONFIG.email
            const ChIcon = ch.icon
            return (
              <div key={tpl.id} className="relative group">
                <TemplatePreviewCard
                  name={tpl.name}
                  htmlBody={tpl.htmlBody}
                  subject={tpl.subject}
                  onChoose={() => window.location.href = `/templates/${tpl.id}/edit`}
                  onPreview={tpl.htmlBody ? () => setPreviewTemplate(tpl) : undefined}
                  channelIcon={
                    !tpl.htmlBody ? (
                      <div className={cn('p-3 rounded-lg border', ch.color)}>
                        <ChIcon className="h-6 w-6" />
                      </div>
                    ) : undefined
                  }
                />
                {/* Channel badge + date overlay */}
                <div className="absolute bottom-[30%] left-2 z-10">
                  <span className={cn('px-2 py-0.5 text-[10px] font-semibold rounded-full border', ch.color)}>
                    {ch.label}
                  </span>
                </div>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteConfirm(deleteConfirm === tpl.id ? null : tpl.id)
                  }}
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-white/80 text-text-muted hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                {/* Delete confirmation */}
                {deleteConfirm === tpl.id && (
                  <div className="absolute inset-0 z-20 bg-white/95 rounded-xl flex flex-col items-center justify-center p-4 border-2 border-red-200">
                    <Trash2 className="h-5 w-5 text-red-500 mb-2" />
                    <p className="text-xs text-red-700 text-center mb-3">Delete &quot;{tpl.name}&quot;?</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-1.5 text-xs font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteTemplate.mutate(tpl.id, { onSuccess: () => setDeleteConfirm(null) })}
                        disabled={deleteTemplate.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {deleteTemplate.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          </div>
          )}
        </div>
      )}

      {/* Template preview slide panel */}
      <SlidePanel
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        title={previewTemplate?.name ?? 'Template Preview'}
        width="w-[640px]"
        footer={
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPreviewTemplate(null)}
              className="px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
            >
              Close
            </button>
            {previewTemplate && (
              <Link
                href={`/templates/${previewTemplate.id}/edit`}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Template
              </Link>
            )}
          </div>
        }
      >
        {previewTemplate?.htmlBody && (
          <div className="h-full">
            <div className="mb-4 space-y-1">
              {previewTemplate.subject && (
                <p className="text-sm text-text-secondary">
                  <span className="font-medium text-text-primary">Subject:</span> {previewTemplate.subject}
                </p>
              )}
              <p className="text-xs text-text-muted">
                Updated {new Date(previewTemplate.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <iframe
                srcDoc={previewTemplate.htmlBody}
                title="Template Preview"
                className="w-full h-[calc(100vh-240px)]"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  )
}

function WhatsappTemplateCard({ template: t, onRefresh, isRefreshing }: {
  template: WhatsappTemplate
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const style = WA_STATUS_STYLES[t.status] ?? WA_STATUS_STYLES.PENDING
  const StatusIcon = style.icon
  const editable = t.status === 'DRAFT' || t.status === 'REJECTED'

  return (
    <div className="flex flex-col rounded-xl border border-border bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-lg border text-emerald-600 bg-emerald-50 border-emerald-200">
            <Phone className="h-4 w-4" />
          </div>
          <p className="truncate font-mono text-xs text-text-primary" title={t.name}>{t.name}</p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', style.bg, style.text)}>
          <StatusIcon className="h-3 w-3" /> {t.status}
        </span>
      </div>
      <p className="mb-3 line-clamp-3 min-h-[3rem] text-xs text-text-secondary">{t.bodyText}</p>
      {t.rejectionReason && <p className="mb-2 line-clamp-2 text-[11px] text-red-600">{t.rejectionReason}</p>}
      <div className="mt-auto flex items-center justify-between border-t border-border pt-2.5">
        <span className="text-[11px] text-text-muted">{t.category ?? '—'} · {t.language}</span>
        <div className="flex items-center gap-3">
          {editable ? (
            <Link href={`/templates/whatsapp/${t.id}/edit`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover">
              <Pencil className="h-3 w-3" /> Edit
            </Link>
          ) : (
            <button onClick={onRefresh} disabled={isRefreshing} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
              {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
