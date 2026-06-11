'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useWhatsappTemplates } from '@/hooks/useWhatsappTemplates'
import { WhatsAppTemplateBuilder } from '@/components/whatsapp/WhatsAppTemplateBuilder'

export default function EditWhatsappTemplatePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { data, isLoading } = useWhatsappTemplates()
  const template = data?.data?.find(t => t.id === params.id) ?? null
  const editable = template && (template.status === 'DRAFT' || template.status === 'REJECTED')

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/templates?channel=whatsapp')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-text-secondary transition-colors hover:bg-surface"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">WhatsApp Template</p>
          <h1 className="text-2xl font-bold text-heading">{template ? `Edit ${template.name}` : 'Edit WhatsApp Template'}</h1>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !template ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-text-secondary">Template not found.</div>
      ) : !editable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          This template is <strong>{template.status}</strong> and is managed by Meta — only DRAFT or REJECTED templates can be edited.
          Create a new version instead.
        </div>
      ) : (
        <WhatsAppTemplateBuilder editing={template} />
      )}
    </div>
  )
}
