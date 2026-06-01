'use client'

import { useState } from 'react'
import { Sparkles, X, Wand2, Check, Loader2, Mail, MessageSquare, Bell, Phone } from 'lucide-react'
import { NumberInput } from '@/components/ui/NumberInput'
import {
  useAiCopywriter,
  type CopywriterChannel,
  type CopywriterLanguage,
  type CopywriterVariant,
  type VoiceTone,
} from '@/hooks/useAiCopywriter'

// Gap 3: AI Copywriter modal. Opens from the "Generate with AI" button in
// the campaign content step. Structured prompt fields → N variants. The
// marketer picks one and clicks "Apply" — populates the surrounding
// campaign fields (subject/body/pushTitle/pushImageUrl).

type Props = {
  open: boolean
  onClose: () => void
  channel: CopywriterChannel
  onApply: (variant: CopywriterVariant) => void
  // Optional context — the modal can suggest reasonable defaults based on
  // what the marketer already typed.
  initialUseCase?: string
}

const TONES: Array<{ value: VoiceTone; label: string; desc: string }> = [
  { value: 'persuasive',  label: 'Persuasive',  desc: 'Make a clear case for action' },
  { value: 'informative', label: 'Informative', desc: 'Plain, factual, useful' },
  { value: 'excitement',  label: 'Excitement',  desc: 'High energy, action verbs' },
  { value: 'fomo',        label: 'FOMO',        desc: 'Honest scarcity / time pressure' },
  { value: 'exclusivity', label: 'Exclusivity', desc: '"You\'re one of the first…"' },
]

const LANGUAGES: Array<{ value: CopywriterLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'zh', label: 'Chinese (Simplified)' },
]

export function AiCopywriterPanel({ open, onClose, channel, onApply, initialUseCase = '' }: Props) {
  const [useCase, setUseCase] = useState(initialUseCase)
  const [voiceTone, setVoiceTone] = useState<VoiceTone>('persuasive')
  const [language, setLanguage] = useState<CopywriterLanguage>('en')
  const [persona, setPersona] = useState('')
  const [includeKw, setIncludeKw] = useState('')
  const [excludeKw, setExcludeKw] = useState('')
  const [variantCount, setVariantCount] = useState(3)

  const mutation = useAiCopywriter()
  const variants = mutation.data?.data?.variants ?? []

  function handleGenerate() {
    mutation.mutate({
      channel,
      useCase: useCase.trim(),
      voiceTone,
      language,
      audiencePersona: persona.trim() || undefined,
      includeKeywords: includeKw.split(',').map((s) => s.trim()).filter(Boolean),
      excludeKeywords: excludeKw.split(',').map((s) => s.trim()).filter(Boolean),
      variantCount,
    })
  }

  function handleApply(v: CopywriterVariant) {
    onApply(v)
    onClose()
    mutation.reset()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-12 pb-8 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            <h2 className="text-base font-semibold text-heading">AI Copywriter</h2>
            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-surface text-text-muted font-medium">
              {channelIcon(channel)} {channel.toUpperCase()}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface">
            <X className="h-4 w-4 text-text-muted" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] divide-x divide-border">
          {/* Left: prompt form */}
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Use case / context</label>
              <textarea
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                rows={3}
                placeholder="e.g. Abandoned cart recovery for premium customers in the 24h after they added > ₹2000 of products"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Voice / tone</label>
                <select
                  value={voiceTone}
                  onChange={(e) => setVoiceTone(e.target.value as VoiceTone)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                >
                  {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <p className="mt-1 text-[10px] text-text-muted">{TONES.find((t) => t.value === voiceTone)?.desc}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as CopywriterLanguage)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                >
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Audience persona <span className="font-normal text-text-muted">(optional)</span></label>
              <input
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="e.g. Tier-2 city, value-conscious, mobile-first"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Include keywords</label>
                <input
                  value={includeKw}
                  onChange={(e) => setIncludeKw(e.target.value)}
                  placeholder="free shipping, today"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
                <p className="mt-1 text-[10px] text-text-muted">Comma-separated</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Exclude keywords</label>
                <input
                  value={excludeKw}
                  onChange={(e) => setExcludeKw(e.target.value)}
                  placeholder="cheap, discount"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
                <p className="mt-1 text-[10px] text-text-muted">Comma-separated</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Variants</label>
              <NumberInput
                min={1}
                max={5}
                value={variantCount}
                onChange={n => setVariantCount(n ?? 3)}
                className="w-20 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={!useCase.trim() || mutation.isPending}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {mutation.isPending ? 'Generating…' : 'Generate variants'}
            </button>

            {mutation.isError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                {(mutation.error as Error)?.message ?? 'Generation failed'}
              </div>
            )}
          </div>

          {/* Right: variants */}
          <div className="p-5 max-h-[70vh] overflow-y-auto">
            {variants.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-text-muted text-center px-8">
                Fill in the prompt on the left and click <strong>Generate variants</strong>. Each variant will appear here with an Apply button — click to drop it into the campaign content fields.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-text-muted">
                  {variants.length} variant{variants.length === 1 ? '' : 's'}
                </div>
                {variants.map((v, i) => <VariantCard key={i} variant={v} channel={channel} onApply={() => handleApply(v)} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VariantCard({ variant, channel, onApply }: { variant: CopywriterVariant; channel: CopywriterChannel; onApply: () => void }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-surface flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
          {channel === 'email' && 'Subject + body'}
          {channel === 'push' && 'Title + body'}
          {channel === 'sms' && 'SMS'}
          {channel === 'whatsapp' && 'WhatsApp'}
        </div>
        <button
          onClick={onApply}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-text-primary text-white rounded hover:opacity-90"
        >
          <Check className="h-3 w-3" />
          Apply
        </button>
      </div>
      <div className="p-3 space-y-2 text-sm bg-white">
        {variant.subject && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">{channel === 'push' ? 'Title' : 'Subject'}</div>
            <div className="font-semibold text-heading">{variant.subject}</div>
          </div>
        )}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted">Body</div>
          <div className="whitespace-pre-wrap text-text-primary">{variant.body}</div>
          <div className="mt-1 text-[10px] text-text-muted">
            {variant.body.length} char{variant.body.length === 1 ? '' : 's'}
            {channel === 'sms' && variant.body.length > 160 && <span className="text-amber-700 ml-1">· exceeds 160 char SMS limit</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function channelIcon(channel: CopywriterChannel) {
  const Icon = channel === 'email' ? Mail : channel === 'sms' ? MessageSquare : channel === 'push' ? Bell : Phone
  return <Icon className="h-3 w-3" />
}
