'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCampaignVariations } from '@/hooks/useCampaignAi'
import type { CampaignChannel } from '@storees/shared'

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
  whatsapp: 'WhatsApp',
}

export function CampaignAiCopywriter({
  channel,
  subject,
  body,
  onApplySubject,
  onApplyBody,
  inputClass,
  lockedReason,
  extraGoal,
}: {
  channel: CampaignChannel
  subject?: string
  body?: string
  onApplySubject?: (v: string) => void
  onApplyBody?: (v: string) => void
  inputClass: string
  lockedReason?: string
  extraGoal?: string
}) {
  const variations = useCampaignVariations()
  const [useCase, setUseCase] = useState('')
  const [includeKeywords, setIncludeKeywords] = useState('')
  const [excludeKeywords, setExcludeKeywords] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [tone, setTone] = useState('')
  const [persona, setPersona] = useState('')
  const [language, setLanguage] = useState('English')
  const [personalizationAttribute, setPersonalizationAttribute] = useState('customer_name')
  const [couponCode, setCouponCode] = useState('')
  const [includeEmoji, setIncludeEmoji] = useState(false)
  const channelLabel = CHANNEL_LABELS[channel] ?? channel

  const buildGoal = () => [
    `Create ${channelLabel} campaign copy from this brief.`,
    useCase && `Use case: ${useCase}`,
    includeKeywords && `Include these keywords: ${includeKeywords}`,
    excludeKeywords && `Avoid these keywords: ${excludeKeywords}`,
    targetAudience && `Target audience: ${targetAudience}`,
    tone && `Voice and tone: ${tone}`,
    persona && `Writing style or persona: ${persona}`,
    language && `Language: ${language}`,
    personalizationAttribute && `Use personalization attribute when useful: {{${personalizationAttribute}}}`,
    couponCode && `Coupon code: ${couponCode}`,
    `Emoji preference: ${includeEmoji ? 'include tasteful emoji' : 'do not add emoji unless already present'}`,
    extraGoal,
    'Preserve valid {{variable}} placeholders. Do not invent unavailable variables except the personalization attribute above.',
    subject && `Existing subject/title for context: ${subject}`,
    body && `Existing body for context: ${body}`,
  ].filter(Boolean).join('\n')

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex flex-col gap-3 border-b border-border bg-surface px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">AI Copywriter</h2>
            <p className="text-xs text-text-muted">Generate context-aware {channelLabel.toLowerCase()} copy with campaign constraints.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => variations.mutate({
            channel,
            subject,
            body,
            goal: buildGoal(),
            count: 3,
          })}
          disabled={variations.isPending || (!useCase.trim() && !subject?.trim() && !body?.trim())}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {variations.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Generate
        </button>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4 border-b border-border p-5 lg:border-b-0 lg:border-r">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">Describe your use case</label>
            <textarea
              value={useCase}
              onChange={e => setUseCase(e.target.value)}
              rows={4}
              placeholder="Type your use case/scenario"
              className={cn(inputClass, 'h-24 resize-none')}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Include keywords</label>
              <input value={includeKeywords} onChange={e => setIncludeKeywords(e.target.value)} placeholder="sale, new arrivals" className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Exclude keywords</label>
              <input value={excludeKeywords} onChange={e => setExcludeKeywords(e.target.value)} placeholder="spammy, free" className={inputClass} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Target audience</label>
              <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="Gen Z, repeat buyers" className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Voice/tone</label>
              <select value={tone} onChange={e => setTone(e.target.value)} className={inputClass}>
                <option value="">Select tone</option>
                <option value="friendly and direct">Friendly and direct</option>
                <option value="premium and concise">Premium and concise</option>
                <option value="urgent but not pushy">Urgent but not pushy</option>
                <option value="playful and warm">Playful and warm</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Writing style/persona</label>
              <select value={persona} onChange={e => setPersona(e.target.value)} className={inputClass}>
                <option value="">Select style</option>
                <option value="brand marketer">Brand marketer</option>
                <option value="helpful store assistant">Helpful store assistant</option>
                <option value="luxury retail concierge">Luxury retail concierge</option>
                <option value="short performance copywriter">Short performance copywriter</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className={inputClass}>
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Arabic">Arabic</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Personalization attribute</label>
              <select value={personalizationAttribute} onChange={e => setPersonalizationAttribute(e.target.value)} className={inputClass}>
                <option value="customer_name">customer_name</option>
                <option value="store_name">store_name</option>
                <option value="city">city</option>
                <option value="order_id">order_id</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Coupon code</label>
              <input value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="SUMMER20" className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={includeEmoji}
              onChange={e => setIncludeEmoji(e.target.checked)}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            Include emoji
          </label>
        </div>

        <div className="min-h-[360px] bg-surface/20 p-5">
          {lockedReason && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {lockedReason}
            </div>
          )}
          {variations.isPending ? (
            <div className="flex h-full min-h-[260px] items-center justify-center rounded-lg border border-dashed border-border bg-white text-sm text-text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Writing variations...
            </div>
          ) : variations.data?.data?.variations?.length ? (
            <div className="space-y-3">
              {variations.data.data.variations.map((variation, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{variation.tone || `Variation ${idx + 1}`}</span>
                    <div className="flex items-center gap-2">
                      {variation.subject && onApplySubject && (
                        <button type="button" onClick={() => onApplySubject(variation.subject ?? '')} className="text-xs font-medium text-accent hover:text-accent-hover">
                          Apply title
                        </button>
                      )}
                      {variation.body && onApplyBody && (
                        <button type="button" onClick={() => onApplyBody(variation.body ?? '')} className="text-xs font-medium text-accent hover:text-accent-hover">
                          Apply body
                        </button>
                      )}
                    </div>
                  </div>
                  {variation.subject && <p className="text-sm font-semibold text-text-primary">{variation.subject}</p>}
                  {variation.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{variation.body}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-[260px] items-center justify-center rounded-lg border border-dashed border-border bg-white p-6 text-center text-sm text-text-muted">
              Add a brief on the left, then generate variants. Existing campaign text is included as context.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
