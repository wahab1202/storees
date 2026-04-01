'use client'

import Link from 'next/link'
import { useTemplates, useDeleteTemplate, useSeedTemplates } from '@/hooks/useTemplates'
import { toast } from 'sonner'
import { TemplatePreviewCard } from '@/components/shared/TemplatePreviewCard'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { PageHeader } from '@/components/layout/PageHeader'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { Plus, Mail, MessageSquare, Bell, Phone, FileText, Trash2, Loader2, Search, Pencil, Sparkles } from 'lucide-react'
import { useState, useMemo } from 'react'
import type { EmailTemplate, TemplateChannel } from '@storees/shared'

const CHANNEL_TABS: { value: TemplateChannel | 'all'; label: string; icon: typeof Mail }[] = [
  { value: 'all',      label: 'All',       icon: FileText },
  { value: 'email',    label: 'Email',     icon: Mail },
  { value: 'sms',      label: 'SMS',       icon: MessageSquare },
  { value: 'push',     label: 'Push',      icon: Bell },
  { value: 'whatsapp', label: 'WhatsApp',  icon: Phone },
]

const CHANNEL_CONFIG = {
  email:     { label: 'Email',    icon: Mail,          color: 'text-blue-600 bg-blue-50 border-blue-200' },
  sms:       { label: 'SMS',      icon: MessageSquare, color: 'text-teal-600 bg-teal-50 border-teal-200' },
  push:      { label: 'Push',     icon: Bell,          color: 'text-violet-600 bg-violet-50 border-violet-200' },
  whatsapp:  { label: 'WhatsApp', icon: Phone,         color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
} as const

export default function TemplatesPage() {
  const { data, isLoading, isError } = useTemplates()
  const deleteTemplate = useDeleteTemplate()
  const seedTemplates = useSeedTemplates()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState<TemplateChannel | 'all'>('all')
  const [search, setSearch] = useState('')
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null)

  const templates = data?.data ?? []

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

  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length }
    for (const t of templates) {
      counts[t.channel] = (counts[t.channel] ?? 0) + 1
    }
    return counts
  }, [templates])

  return (
    <div>
      <PageHeader
        title="Templates"
        actions={
          <div className="flex items-center gap-2">
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
          className="w-full h-10 pl-9 pr-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus placeholder:text-text-muted"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load templates.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white border border-border rounded-xl">
          <FileText className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            {templates.length === 0 ? 'No templates yet' : 'No matching templates'}
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            {templates.length === 0
              ? 'Create reusable message templates for email, SMS, push, and WhatsApp.'
              : 'Try adjusting your search or channel filter.'}
          </p>
          {templates.length === 0 && (
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
