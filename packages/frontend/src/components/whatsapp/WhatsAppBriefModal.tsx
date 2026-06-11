'use client'

import { useState } from 'react'
import { Sparkles, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAiWhatsappTemplate, type WhatsappCopilotTone, type WhatsappCopilotDraft } from '@/hooks/useAiWhatsappTemplate'
import type { WhatsappTemplateCategory } from '@storees/shared'

const TONES: { value: WhatsappCopilotTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'witty', label: 'Witty' },
  { value: 'urgent', label: 'Urgent' },
]

export function WhatsAppBriefModal({
  open,
  category,
  language,
  onClose,
  onApply,
}: {
  open: boolean
  category: WhatsappTemplateCategory
  language: string
  onClose: () => void
  onApply: (draft: WhatsappCopilotDraft) => void
}) {
  const generate = useAiWhatsappTemplate()
  const [goal, setGoal] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState<WhatsappCopilotTone>('professional')

  if (!open) return null

  const handleGenerate = () => {
    generate.mutate(
      { goal: goal.trim(), audience: audience.trim() || undefined, tone, category, language },
      { onSuccess: res => { if (res.data) { onApply(res.data); onClose() } } },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Generate with AI</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-text-muted hover:bg-surface" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">Goal</label>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              rows={3}
              autoFocus
              maxLength={800}
              placeholder="e.g. Notify the customer their order has shipped and let them track it"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">Audience <span className="font-normal text-text-muted">· optional</span></label>
            <input
              value={audience}
              onChange={e => setAudience(e.target.value)}
              placeholder="e.g. Repeat buyers in Tamil Nadu"
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">Tone</label>
            <div className="grid grid-cols-4 gap-2">
              {TONES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTone(t.value)}
                  className={cn(
                    'h-9 rounded-lg border text-xs font-medium transition-colors',
                    tone === t.value ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:border-text-muted',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-text-muted">
            Drafts a <strong>{category.toLowerCase()}</strong> template in <strong>{language}</strong> with numbered variables. You can refine everything after.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="h-9 rounded-lg border border-border bg-white px-4 text-sm font-medium text-text-secondary hover:bg-surface">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!goal.trim() || generate.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}
