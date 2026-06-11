'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { WhatsAppTemplateBuilder } from '@/components/whatsapp/WhatsAppTemplateBuilder'

export default function NewWhatsappTemplatePage() {
  const router = useRouter()
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
          <h1 className="text-2xl font-bold text-heading">New WhatsApp Template</h1>
        </div>
      </div>
      <WhatsAppTemplateBuilder />
    </div>
  )
}
