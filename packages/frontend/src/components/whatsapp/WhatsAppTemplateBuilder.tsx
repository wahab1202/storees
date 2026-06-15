'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, Plus, Trash2, Save, Send, X, Image as ImageIcon, Video, FileText, Type,
  MessageSquareReply, ExternalLink, Phone, Smartphone, Sparkles, Copy, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVariableSources } from '@/hooks/useTemplates'
import { SourcePicker } from '@/components/templates/VariablePanel'
import { WhatsAppBriefModal } from '@/components/whatsapp/WhatsAppBriefModal'
import {
  useWhatsappProviderStatus,
  useLintWhatsappTemplate,
  useSubmitWhatsappTemplate,
  useSaveWhatsappDraft,
  useEditWhatsappDraft,
  useSubmitWhatsappForApproval,
  type WhatsappTemplate,
  type SubmitInput,
  type LintFinding,
} from '@/hooks/useWhatsappTemplates'
import type { WhatsappCopilotDraft } from '@/hooks/useAiWhatsappTemplate'
import { useUploadWhatsappMedia } from '@/hooks/useUploadWhatsappMedia'
import type {
  TemplateVariable,
  TemplateVariableSource,
  WhatsappTemplateCategory,
  WhatsappHeaderType,
  WhatsappButton,
  WhatsappOtpConfig,
  WhatsappCarouselCard,
  VariableSourceCatalog,
} from '@storees/shared'

const CATEGORIES: { value: WhatsappTemplateCategory; label: string; hint: string }[] = [
  { value: 'MARKETING', label: 'Marketing', hint: 'Promotions, offers, announcements' },
  { value: 'UTILITY', label: 'Utility', hint: 'Order updates, reminders, alerts' },
  { value: 'AUTHENTICATION', label: 'Authentication', hint: 'One-time passcodes' },
]

// Meta-supported template languages (common subset of the 70+ list).
const LANGUAGES = [
  { code: 'en_US', label: 'English (US)' }, { code: 'en_GB', label: 'English (UK)' }, { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' }, { code: 'ta', label: 'Tamil' }, { code: 'te', label: 'Telugu' },
  { code: 'mr', label: 'Marathi' }, { code: 'bn', label: 'Bengali' }, { code: 'gu', label: 'Gujarati' },
  { code: 'kn', label: 'Kannada' }, { code: 'ml', label: 'Malayalam' }, { code: 'pa', label: 'Punjabi' },
  { code: 'or', label: 'Odia' }, { code: 'as', label: 'Assamese' }, { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' }, { code: 'fa', label: 'Persian' }, { code: 'he', label: 'Hebrew' },
  { code: 'es', label: 'Spanish' }, { code: 'es_ES', label: 'Spanish (Spain)' }, { code: 'es_MX', label: 'Spanish (Mexico)' },
  { code: 'pt_BR', label: 'Portuguese (Brazil)' }, { code: 'pt_PT', label: 'Portuguese (Portugal)' },
  { code: 'fr', label: 'French' }, { code: 'de', label: 'German' }, { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' }, { code: 'pl', label: 'Polish' }, { code: 'ru', label: 'Russian' },
  { code: 'uk', label: 'Ukrainian' }, { code: 'tr', label: 'Turkish' }, { code: 'el', label: 'Greek' },
  { code: 'cs', label: 'Czech' }, { code: 'sk', label: 'Slovak' }, { code: 'hu', label: 'Hungarian' },
  { code: 'ro', label: 'Romanian' }, { code: 'bg', label: 'Bulgarian' }, { code: 'hr', label: 'Croatian' },
  { code: 'sr', label: 'Serbian' }, { code: 'sv', label: 'Swedish' }, { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' }, { code: 'nb', label: 'Norwegian' }, { code: 'id', label: 'Indonesian' },
  { code: 'ms', label: 'Malay' }, { code: 'th', label: 'Thai' }, { code: 'vi', label: 'Vietnamese' },
  { code: 'fil', label: 'Filipino' }, { code: 'km', label: 'Khmer' }, { code: 'lo', label: 'Lao' },
  { code: 'my', label: 'Burmese' }, { code: 'si', label: 'Sinhala' }, { code: 'ne', label: 'Nepali' },
  { code: 'ko', label: 'Korean' }, { code: 'ja', label: 'Japanese' }, { code: 'zh_CN', label: 'Chinese (Simplified)' },
  { code: 'zh_HK', label: 'Chinese (Hong Kong)' }, { code: 'zh_TW', label: 'Chinese (Traditional)' },
  { code: 'sw', label: 'Swahili' }, { code: 'af', label: 'Afrikaans' }, { code: 'sq', label: 'Albanian' },
  { code: 'az', label: 'Azerbaijani' }, { code: 'ka', label: 'Georgian' }, { code: 'hy', label: 'Armenian' },
  { code: 'kk', label: 'Kazakh' }, { code: 'lt', label: 'Lithuanian' }, { code: 'lv', label: 'Latvian' },
  { code: 'et', label: 'Estonian' }, { code: 'sl', label: 'Slovenian' }, { code: 'mk', label: 'Macedonian' },
]

const HEADER_TYPES: { value: 'NONE' | WhatsappHeaderType; label: string; icon: typeof Type }[] = [
  { value: 'NONE', label: 'None', icon: X },
  { value: 'TEXT', label: 'Text', icon: Type },
  { value: 'IMAGE', label: 'Image', icon: ImageIcon },
  { value: 'VIDEO', label: 'Video', icon: Video },
  { value: 'DOCUMENT', label: 'Document', icon: FileText },
]

const BODY_LIMIT = 1024

const inputClass =
  'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted'

// ----- variable helpers -----

/** Highest {{n}} number used in the body. Body params are always 1..N. */
function countBodyParams(body: string): number {
  const nums = Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(m => Number(m[1]))
  return nums.length ? Math.max(...nums) : 0
}

function defaultSampleFor(idx: number): string {
  return ['Wahab', 'ORD-1001', 'Storees', '20%', 'June 14'][idx] ?? `sample ${idx + 1}`
}

// ----- builder state -----

type BuilderState = {
  name: string
  category: WhatsappTemplateCategory
  language: string
  headerType: 'NONE' | WhatsappHeaderType
  headerText: string
  headerExample: string
  bodyText: string
  footer: string
  buttons: WhatsappButton[]
  /** sample value per body param, index 0 = {{1}} */
  samples: string[]
  /** CDP source mapping per body param, index 0 = {{1}} */
  sources: (TemplateVariableSource | undefined)[]
  // AUTHENTICATION (OTP) config
  otpType: 'COPY_CODE' | 'ONE_TAP'
  otpButtonText: string
  otpExpiryMinutes: string
  otpSecurityRecommendation: boolean
  // Carousel
  templateType: 'CUSTOM' | 'CAROUSEL'
  carouselHeaderType: 'IMAGE' | 'VIDEO'
  carousel: WhatsappCarouselCard[]
}

function initialState(editing: WhatsappTemplate | null): BuilderState {
  const header = editing?.header ?? null
  const vars = editing?.variables ?? []
  const sources: (TemplateVariableSource | undefined)[] = []
  for (const v of vars) {
    const n = Number(v.key)
    if (n >= 1) sources[n - 1] = v.source
  }
  return {
    name: editing?.name ?? '',
    category: (editing?.category as WhatsappTemplateCategory) ?? 'UTILITY',
    language: editing?.language ?? 'en_US',
    headerType: (header?.type as WhatsappHeaderType) ?? 'NONE',
    headerText: header?.text ?? '',
    headerExample: header?.example ?? '',
    bodyText: editing?.bodyText ?? '',
    footer: editing?.footer ?? '',
    buttons: editing?.buttons ?? [],
    samples: [],
    sources,
    otpType: 'COPY_CODE',
    otpButtonText: 'Copy code',
    otpExpiryMinutes: '10',
    otpSecurityRecommendation: true,
    templateType: editing?.carousel && editing.carousel.length > 0 ? 'CAROUSEL' : 'CUSTOM',
    carouselHeaderType: editing?.carousel?.[0]?.headerType ?? 'IMAGE',
    carousel: editing?.carousel ?? [],
  }
}

const AUTH_BODY = '{{1}} is your verification code.'

export function WhatsAppTemplateBuilder({ editing }: { editing?: WhatsappTemplate | null }) {
  const router = useRouter()
  const { data: catalogResp } = useVariableSources()
  const catalog: VariableSourceCatalog | null = catalogResp?.data ?? null
  const providerStatus = useWhatsappProviderStatus()

  const lint = useLintWhatsappTemplate()
  const submit = useSubmitWhatsappTemplate()
  const saveDraft = useSaveWhatsappDraft()
  const editDraft = useEditWhatsappDraft()
  const submitApproval = useSubmitWhatsappForApproval()

  const isEditing = !!editing
  const [s, setS] = useState<BuilderState>(() => initialState(editing ?? null))
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  const set = (patch: Partial<BuilderState>) => setS(prev => ({ ...prev, ...patch }))
  const [showBrief, setShowBrief] = useState(false)

  const isAuth = s.category === 'AUTHENTICATION'
  const isCarousel = !isAuth && s.templateType === 'CAROUSEL'
  const effectiveBody = isAuth ? AUTH_BODY : s.bodyText
  const paramCount = countBodyParams(effectiveBody)
  const canSubmit = !!providerStatus.data?.data?.capabilities.submitTemplate && !!providerStatus.data?.data?.configured
  const findings: LintFinding[] = lint.data?.data?.findings ?? []
  const blocking = lint.data?.data?.blocking ?? false
  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  const pending = submit.isPending || saveDraft.isPending || editDraft.isPending || submitApproval.isPending
  const nameValid = /^[a-z0-9_]+$/.test(s.name)
  const incomplete = !s.name || !nameValid || (!isAuth && !s.bodyText) || (isAuth && !s.otpButtonText.trim())

  // Apply an AI-generated draft into builder state.
  const applyDraft = (draft: WhatsappCopilotDraft) => {
    set({
      category: draft.category,
      bodyText: draft.bodyText,
      samples: draft.variables.map(v => v.sample),
      sources: [],
      headerType: draft.header ? 'TEXT' : 'NONE',
      headerText: draft.header?.text ?? '',
      footer: draft.footer ?? '',
      buttons: draft.buttons ?? [],
    })
  }

  const insertVariable = () => {
    const next = paramCount + 1
    const token = `{{${next}}}`
    const ta = bodyRef.current
    if (ta) {
      const start = ta.selectionStart ?? s.bodyText.length
      const end = ta.selectionEnd ?? s.bodyText.length
      const body = s.bodyText.slice(0, start) + token + s.bodyText.slice(end)
      set({ bodyText: body })
      requestAnimationFrame(() => {
        ta.focus()
        const pos = start + token.length
        ta.setSelectionRange(pos, pos)
      })
    } else {
      set({ bodyText: s.bodyText + token })
    }
  }

  // Build the API payload from builder state.
  const buildInput = (): SubmitInput => {
    // AUTHENTICATION templates: Meta generates the body; we send a standard body
    // (it's ignored for auth) plus the OTP config.
    if (isAuth) {
      const otp: WhatsappOtpConfig = {
        otpType: s.otpType,
        buttonText: s.otpButtonText.trim() || 'Copy code',
        codeExpirationMinutes: s.otpExpiryMinutes.trim() ? Math.max(1, Math.min(90, Number(s.otpExpiryMinutes))) : undefined,
        addSecurityRecommendation: s.otpSecurityRecommendation,
      }
      return {
        name: s.name,
        language: s.language,
        category: 'AUTHENTICATION',
        bodyText: AUTH_BODY,
        footer: null,
        bodyExample: ['123456'],
        otp,
      }
    }

    const header =
      s.headerType === 'NONE'
        ? null
        : s.headerType === 'TEXT'
          ? { type: 'TEXT' as const, text: s.headerText }
          : { type: s.headerType, example: s.headerExample || undefined }
    const variables: TemplateVariable[] = []
    const bodyExample: string[] = []
    for (let i = 0; i < paramCount; i++) {
      bodyExample.push(s.samples[i]?.trim() || defaultSampleFor(i))
      variables.push({
        key: String(i + 1),
        source: s.sources[i] ?? { kind: 'customer', field: 'name' },
      })
    }
    // Carousel templates: header/footer/top-level buttons are not used; the cards
    // carry their own media + body + buttons (with a uniform header media type).
    if (isCarousel) {
      return {
        name: s.name,
        language: s.language,
        category: s.category,
        bodyText: s.bodyText,
        bodyExample: paramCount > 0 ? bodyExample : undefined,
        variables: variables.length ? variables : undefined,
        carousel: s.carousel.map(c => ({ ...c, headerType: s.carouselHeaderType })),
      }
    }

    return {
      name: s.name,
      language: s.language,
      category: s.category,
      bodyText: s.bodyText,
      header: header as SubmitInput['header'],
      footer: s.footer.trim() || null,
      buttons: s.buttons.length ? s.buttons : undefined,
      bodyExample: paramCount > 0 ? bodyExample : undefined,
      variables: variables.length ? variables : undefined,
    }
  }

  const handleLint = () => lint.mutate(buildInput())

  const done = () => router.push('/templates?channel=whatsapp')

  const handleSaveDraft = () => {
    if (isEditing) editDraft.mutate({ id: editing!.id, input: buildInput() }, { onSuccess: done })
    else saveDraft.mutate(buildInput(), { onSuccess: done })
  }

  const handleSubmitForApproval = () => {
    if (isEditing) {
      editDraft.mutate({ id: editing!.id, input: buildInput() }, {
        onSuccess: () => submitApproval.mutate(editing!.id, { onSuccess: done }),
      })
    } else {
      submit.mutate(buildInput(), { onSuccess: done })
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* ---------- Editor ---------- */}
      <div className="min-w-0 space-y-5">
        {/* Setup */}
        <section className="rounded-xl border border-border bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Setup</h2>
              <p className="text-xs text-text-muted">Name, category and language — these are submitted to Meta for approval.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowBrief(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/10"
            >
              <Sparkles className="h-3.5 w-3.5" /> Generate with AI
            </button>
          </div>
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">Template Name</label>
                <input
                  value={s.name}
                  onChange={e => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  placeholder="order_confirmation"
                  readOnly={isEditing}
                  autoFocus={!isEditing}
                  className={cn(inputClass, 'font-mono', isEditing && 'bg-surface text-text-muted cursor-not-allowed')}
                />
                <p className="mt-1 text-xs text-text-muted">Lowercase letters, numbers and underscores only.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">Language</label>
                <select value={s.language} onChange={e => set({ language: e.target.value })} className={inputClass}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label} — {l.code}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">Category</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set({ category: c.value })}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      s.category === c.value
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-white hover:border-text-muted',
                    )}
                  >
                    <p className={cn('text-sm font-semibold', s.category === c.value ? 'text-accent' : 'text-text-primary')}>{c.label}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{c.hint}</p>
                  </button>
                ))}
              </div>
              {s.category === 'MARKETING' && (
                <p className="mt-2 text-xs text-amber-700">
                  Marketing templates cost ~6× a Utility template to send. If this is an order/account update, use <strong>Utility</strong>.
                </p>
              )}
              {warnings.some(w => /market/i.test(w.message)) && s.category !== 'MARKETING' && (
                <p className="mt-2 text-xs text-amber-700">This wording may be re-categorised as Marketing by Meta — keep it transactional.</p>
              )}
            </div>
            {!isAuth && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">Template type</label>
                <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
                  {([['CUSTOM', 'Custom'], ['CAROUSEL', 'Carousel']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => set({ templateType: val })}
                      className={cn(
                        'h-10 rounded-lg border text-sm font-medium transition-colors',
                        s.templateType === val ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:border-text-muted',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {isCarousel && <p className="mt-1 text-xs text-text-muted">An intro message followed by up to 10 swipeable cards.</p>}
              </div>
            )}
          </div>
        </section>

        {isAuth ? (
          <AuthOtpEditor s={s} set={set} />
        ) : (
        <>
        {!isCarousel && (
        <>
        {/* Header */}
        <section className="rounded-xl border border-border bg-white">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text-primary">Header <span className="font-normal text-text-muted">· optional</span></h2>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap gap-2">
              {HEADER_TYPES.map(h => {
                const Icon = h.icon
                return (
                  <button
                    key={h.value}
                    type="button"
                    onClick={() => set({ headerType: h.value })}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                      s.headerType === h.value ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:border-text-muted',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {h.label}
                  </button>
                )
              })}
            </div>
            {s.headerType === 'TEXT' && (
              <input
                value={s.headerText}
                onChange={e => set({ headerText: e.target.value })}
                maxLength={60}
                placeholder="Order confirmed 🎉"
                className={inputClass}
              />
            )}
            {(s.headerType === 'IMAGE' || s.headerType === 'VIDEO' || s.headerType === 'DOCUMENT') && (
              <MediaHeaderUpload
                headerType={s.headerType}
                value={s.headerExample}
                onChange={url => set({ headerExample: url })}
              />
            )}
          </div>
        </section>
        </>
        )}

        {/* Body (intro message for carousel) */}
        <section className="rounded-xl border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text-primary">{isCarousel ? 'Intro message' : 'Body'}</h2>
            <button
              type="button"
              onClick={insertVariable}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-accent/40 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/5"
            >
              <Plus className="h-3.5 w-3.5" /> Add variable
            </button>
          </div>
          <div className="p-5">
            <textarea
              ref={bodyRef}
              value={s.bodyText}
              onChange={e => set({ bodyText: e.target.value })}
              rows={6}
              maxLength={BODY_LIMIT}
              placeholder="Hi {{1}}, your order {{2}} has been confirmed and will arrive soon."
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-text-muted">Click <strong>Add variable</strong> to insert {`{{1}}`}, {`{{2}}`}… at the cursor.</p>
              <p className={cn('text-xs font-medium', s.bodyText.length > BODY_LIMIT ? 'text-red-500' : 'text-text-muted')}>{s.bodyText.length}/{BODY_LIMIT}</p>
            </div>
          </div>
        </section>

        {!isCarousel && (
        <>
        {/* Footer */}
        <section className="rounded-xl border border-border bg-white">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text-primary">Footer <span className="font-normal text-text-muted">· optional</span></h2>
          </div>
          <div className="p-5">
            <input
              value={s.footer}
              onChange={e => set({ footer: e.target.value })}
              maxLength={60}
              placeholder="Reply STOP to unsubscribe"
              className={inputClass}
            />
          </div>
        </section>

        {/* Buttons */}
        <ButtonsEditor buttons={s.buttons} onChange={buttons => set({ buttons })} />
        </>
        )}

        {isCarousel && (
          <CarouselEditor
            headerType={s.carouselHeaderType}
            cards={s.carousel}
            onHeaderTypeChange={t => set({ carouselHeaderType: t })}
            onChange={carousel => set({ carousel })}
          />
        )}
        </>
        )}

        {/* Lint findings */}
        {findings.length > 0 && (
          <div className="space-y-1.5">
            {errors.map((f, i) => (
              <div key={`e${i}`} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <strong>Error:</strong> {f.message}
              </div>
            ))}
            {warnings.map((f, i) => (
              <div key={`w${i}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <strong>Warning:</strong> {f.message}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLint}
            disabled={lint.isPending || incomplete}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-50"
          >
            {lint.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Run lint
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => router.push('/templates?channel=whatsapp')}
            className="inline-flex h-10 items-center rounded-lg border border-border bg-white px-4 text-sm font-medium text-text-secondary hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={pending || blocking || incomplete}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-accent/40 bg-white px-4 text-sm font-medium text-accent hover:bg-accent/5 disabled:opacity-50"
          >
            {(saveDraft.isPending || editDraft.isPending) && !submitApproval.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEditing ? 'Save draft' : 'Save as draft'}
          </button>
          <button
            type="button"
            onClick={handleSubmitForApproval}
            disabled={pending || blocking || incomplete || !canSubmit}
            title={!canSubmit ? 'Connect a WhatsApp provider that supports submission' : undefined}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(submit.isPending || submitApproval.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit for approval
          </button>
        </div>
        {!nameValid && s.name && <p className="text-xs text-red-600">Name must be lowercase letters, numbers and underscores only.</p>}
        {!canSubmit && <p className="text-xs text-amber-700">Saving a draft works without a provider; submitting for approval needs a connected WhatsApp provider.</p>}
      </div>

      {/* ---------- Right rail: variables + preview ---------- */}
      <aside className="space-y-5 xl:sticky xl:top-4 xl:self-start">
        <WhatsAppPreview state={s} paramCount={paramCount} isAuth={isAuth} />
        {!isAuth && (
          <WhatsAppVariableList
            paramCount={paramCount}
            samples={s.samples}
            sources={s.sources}
            catalog={catalog}
            onSampleChange={(idx, val) => {
              const samples = [...s.samples]; samples[idx] = val; set({ samples })
            }}
            onSourceChange={(idx, src) => {
              const sources = [...s.sources]; sources[idx] = src; set({ sources })
            }}
          />
        )}
      </aside>

      <WhatsAppBriefModal
        open={showBrief}
        category={s.category}
        language={s.language}
        onClose={() => setShowBrief(false)}
        onApply={applyDraft}
      />
    </div>
  )
}

// ===== Authentication (OTP) editor =====

function AuthOtpEditor({ s, set }: { s: BuilderState; set: (patch: Partial<BuilderState>) => void }) {
  return (
    <section className="rounded-xl border border-border bg-white">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Authentication (OTP)</h2>
      </div>
      <div className="space-y-4 p-5">
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
          Meta generates the message body for authentication templates — e.g. <em>&ldquo;123456 is your verification code.&rdquo;</em> You only configure the code button and expiry.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">OTP delivery</label>
            <select
              value={s.otpType}
              onChange={e => set({ otpType: e.target.value as 'COPY_CODE' | 'ONE_TAP' })}
              className={inputClass}
            >
              <option value="COPY_CODE">Copy code</option>
              <option value="ONE_TAP">One-tap autofill</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">Button text</label>
            <input
              value={s.otpButtonText}
              onChange={e => set({ otpButtonText: e.target.value })}
              maxLength={25}
              placeholder="Copy code"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">Code expiry (minutes)</label>
            <input
              value={s.otpExpiryMinutes}
              onChange={e => set({ otpExpiryMinutes: e.target.value.replace(/[^0-9]/g, '') })}
              inputMode="numeric"
              placeholder="10"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-text-muted">1–90 minutes. Leave blank for no expiry note.</p>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={s.otpSecurityRecommendation}
              onChange={e => set({ otpSecurityRecommendation: e.target.checked })}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
            />
            Add security recommendation
          </label>
        </div>
      </div>
    </section>
  )
}

// ===== Media header upload =====

const MEDIA_ACCEPT: Record<'IMAGE' | 'VIDEO' | 'DOCUMENT', string> = {
  IMAGE: 'image/jpeg,image/png,image/webp',
  VIDEO: 'video/mp4,video/quicktime,video/3gpp',
  DOCUMENT: 'application/pdf',
}
const MEDIA_CAP: Record<'IMAGE' | 'VIDEO' | 'DOCUMENT', string> = { IMAGE: '5MB', VIDEO: '16MB', DOCUMENT: '100MB' }

function MediaHeaderUpload({
  headerType, value, onChange,
}: {
  headerType: 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  value: string
  onChange: (url: string) => void
}) {
  const upload = useUploadWhatsappMedia()
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface">
          {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {upload.isPending ? 'Uploading…' : `Upload ${headerType.toLowerCase()}`}
          <input
            type="file"
            accept={MEDIA_ACCEPT[headerType]}
            disabled={upload.isPending}
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file, { onSuccess: res => { if (res.data?.url) onChange(res.data.url) } })
              e.target.value = ''
            }}
          />
        </label>
        <span className="text-xs text-text-muted">Max {MEDIA_CAP[headerType]}</span>
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={`…or paste a public URL (https://…/sample.${headerType === 'IMAGE' ? 'jpg' : headerType === 'VIDEO' ? 'mp4' : 'pdf'})`}
        className={inputClass}
      />
      {value && <p className="truncate text-xs text-emerald-700" title={value}>✓ {value}</p>}
      <p className="text-xs text-text-muted">A sample is shown to Meta for review; the real media is set when sending.</p>
    </div>
  )
}

// ===== Buttons editor =====

function ButtonsEditor({ buttons, onChange }: { buttons: WhatsappButton[]; onChange: (b: WhatsappButton[]) => void }) {
  const quickReplies = buttons.filter(b => b.type === 'QUICK_REPLY')
  const ctas = buttons.filter(b => b.type !== 'QUICK_REPLY')

  const update = (idx: number, patch: Partial<WhatsappButton>) => {
    const next = [...buttons]; next[idx] = { ...next[idx], ...patch }; onChange(next)
  }
  const remove = (idx: number) => onChange(buttons.filter((_, i) => i !== idx))
  const copyCodes = buttons.filter(b => b.type === 'COPY_CODE')
  const addQuickReply = () => onChange([...buttons, { type: 'QUICK_REPLY', text: '' }])
  const addUrl = () => onChange([...buttons, { type: 'URL', text: '', url: '' }])
  const addPhone = () => onChange([...buttons, { type: 'PHONE_NUMBER', text: '', phone: '' }])
  const addCopyCode = () => onChange([...buttons, { type: 'COPY_CODE', text: 'Copy code', example: '' }])

  return (
    <section className="rounded-xl border border-border bg-white">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Buttons <span className="font-normal text-text-muted">· optional</span></h2>
      </div>
      <div className="space-y-3 p-5">
        {buttons.map((b, idx) => (
          <div key={idx} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-text-muted">
              {b.type === 'QUICK_REPLY' ? <MessageSquareReply className="h-3.5 w-3.5" /> : b.type === 'URL' ? <ExternalLink className="h-3.5 w-3.5" /> : b.type === 'COPY_CODE' ? <Copy className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
            </span>
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={b.text}
                onChange={e => update(idx, { text: e.target.value })}
                maxLength={25}
                placeholder="Button text"
                className="h-9 rounded-md border border-border px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
              {b.type === 'URL' && (
                <>
                  <input
                    value={b.url ?? ''}
                    onChange={e => update(idx, { url: e.target.value })}
                    placeholder="https://shop.example.com"
                    className="h-9 rounded-md border border-border px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                  <label className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
                    <input
                      type="checkbox"
                      checked={!!b.track}
                      onChange={e => update(idx, { track: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent/30"
                    />
                    Track clicks <span className="text-text-muted">(wraps the link so taps show in analytics)</span>
                  </label>
                </>
              )}
              {b.type === 'PHONE_NUMBER' && (
                <input
                  value={b.phone ?? ''}
                  onChange={e => update(idx, { phone: e.target.value })}
                  placeholder="+91 90000 00000"
                  className="h-9 rounded-md border border-border px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              )}
              {b.type === 'COPY_CODE' && (
                <input
                  value={b.example ?? ''}
                  onChange={e => update(idx, { example: e.target.value })}
                  placeholder="Sample code e.g. SAVE20"
                  className="h-9 rounded-md border border-border px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              )}
            </div>
            <button type="button" onClick={() => remove(idx)} className="mt-1 rounded p-1 text-text-muted hover:text-red-500" aria-label="Remove button">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addQuickReply} disabled={quickReplies.length >= 3} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface disabled:opacity-40">
            <MessageSquareReply className="h-3.5 w-3.5" /> Quick reply
          </button>
          <button type="button" onClick={addUrl} disabled={ctas.length >= 2} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface disabled:opacity-40">
            <ExternalLink className="h-3.5 w-3.5" /> Visit website
          </button>
          <button type="button" onClick={addPhone} disabled={ctas.length >= 2} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface disabled:opacity-40">
            <Phone className="h-3.5 w-3.5" /> Call phone
          </button>
          <button type="button" onClick={addCopyCode} disabled={copyCodes.length >= 1} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface disabled:opacity-40">
            <Copy className="h-3.5 w-3.5" /> Copy code
          </button>
        </div>
        <p className="text-xs text-text-muted">Up to 3 quick-reply, 2 call-to-action, and 1 copy-code button.</p>
      </div>
    </section>
  )
}

// ===== Carousel editor =====

function CarouselEditor({
  headerType, cards, onHeaderTypeChange, onChange,
}: {
  headerType: 'IMAGE' | 'VIDEO'
  cards: WhatsappCarouselCard[]
  onHeaderTypeChange: (t: 'IMAGE' | 'VIDEO') => void
  onChange: (cards: WhatsappCarouselCard[]) => void
}) {
  const updateCard = (idx: number, patch: Partial<WhatsappCarouselCard>) => {
    const next = [...cards]; next[idx] = { ...next[idx], ...patch }; onChange(next)
  }
  const addCard = () => onChange([...cards, { headerType, bodyText: '', buttons: [] }])
  const removeCard = (idx: number) => onChange(cards.filter((_, i) => i !== idx))

  return (
    <section className="rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Cards <span className="font-normal text-text-muted">· {cards.length}/10</span></h2>
        <div className="flex items-center gap-1">
          {(['IMAGE', 'VIDEO'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onHeaderTypeChange(t)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                headerType === t ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:border-text-muted',
              )}
            >
              {t === 'IMAGE' ? <ImageIcon className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />} {t === 'IMAGE' ? 'Image' : 'Video'}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4 p-5">
        {cards.length === 0 && <p className="text-center text-xs text-text-muted">No cards yet. Add up to 10 — all cards share the same media type and button layout.</p>}
        {cards.map((card, idx) => (
          <div key={idx} className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary">Card {idx + 1}</span>
              <button type="button" onClick={() => removeCard(idx)} className="rounded p-1 text-text-muted hover:text-red-500" aria-label={`Remove card ${idx + 1}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <MediaHeaderUpload
              headerType={headerType}
              value={card.headerExample ?? ''}
              onChange={url => updateCard(idx, { headerExample: url })}
            />
            <textarea
              value={card.bodyText}
              onChange={e => updateCard(idx, { bodyText: e.target.value })}
              rows={2}
              maxLength={160}
              placeholder="Card text (max 160 chars)"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <ButtonsEditor buttons={card.buttons} onChange={buttons => updateCard(idx, { buttons })} />
          </div>
        ))}
        <button
          type="button"
          onClick={addCard}
          disabled={cards.length >= 10}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-accent/40 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add card
        </button>
      </div>
    </section>
  )
}

// ===== Variable mapping list =====

function WhatsAppVariableList({
  paramCount, samples, sources, catalog, onSampleChange, onSourceChange,
}: {
  paramCount: number
  samples: string[]
  sources: (TemplateVariableSource | undefined)[]
  catalog: VariableSourceCatalog | null
  onSampleChange: (idx: number, val: string) => void
  onSourceChange: (idx: number, src: TemplateVariableSource) => void
}) {
  const rows = useMemo(() => Array.from({ length: paramCount }, (_, i) => i), [paramCount])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="border-b border-border bg-surface px-5 py-3">
        <h2 className="text-sm font-semibold text-text-primary">
          Variables{paramCount > 0 && <span className="ml-2 text-xs font-normal text-text-muted">({paramCount})</span>}
        </h2>
      </div>
      <div className="space-y-3 p-4">
        {paramCount === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">
            No variables yet. Use <strong>Add variable</strong> in the body to insert {`{{1}}`}.
          </p>
        ) : (
          rows.map(i => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <code className="inline-block rounded bg-surface px-1.5 py-0.5 font-mono text-xs">{`{{${i + 1}}}`}</code>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-text-muted">Maps to</label>
                <SourcePicker
                  catalog={catalog}
                  source={sources[i] ?? { kind: 'customer', field: 'name' }}
                  onChange={src => onSourceChange(i, src)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-text-muted">Sample value (for Meta review)</label>
                <input
                  value={samples[i] ?? ''}
                  onChange={e => onSampleChange(i, e.target.value)}
                  placeholder={defaultSampleFor(i)}
                  className="h-8 w-full rounded-md border border-border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ===== Live WhatsApp phone preview =====

function renderWithSamples(text: string, samples: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => samples[Number(n) - 1]?.trim() || `{{${n}}}`)
}

function WhatsAppPreview({ state: s, paramCount, isAuth }: { state: BuilderState; paramCount: number; isAuth: boolean }) {
  const body = isAuth
    ? '123456 is your verification code.' + (s.otpSecurityRecommendation ? ' For your security, do not share this code.' : '')
    : renderWithSamples(s.bodyText, s.samples) || 'Your message preview appears here.'
  const headerText = !isAuth && s.headerType === 'TEXT' ? s.headerText : ''
  const previewButtons: WhatsappButton[] = isAuth
    ? [{ type: 'COPY_CODE', text: s.otpButtonText || 'Copy code' }]
    : s.buttons

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-5 py-3">
        <Smartphone className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Preview</h2>
      </div>
      <div className="bg-[#E5DDD5] p-4" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.04) 1px, transparent 0)', backgroundSize: '16px 16px' }}>
        <div className="ml-auto max-w-[280px] rounded-lg rounded-tr-sm bg-white p-2.5 shadow-sm">
          {/* media header */}
          {!isAuth && (s.headerType === 'IMAGE' || s.headerType === 'VIDEO' || s.headerType === 'DOCUMENT') && (
            <div className="mb-2 flex h-28 items-center justify-center rounded-md bg-slate-100 text-slate-400">
              {s.headerType === 'IMAGE' ? <ImageIcon className="h-7 w-7" /> : s.headerType === 'VIDEO' ? <Video className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
            </div>
          )}
          {headerText && <p className="mb-1 text-[13px] font-semibold text-slate-900">{headerText}</p>}
          <p className="whitespace-pre-wrap text-[13px] leading-snug text-slate-800">{body}</p>
          {!isAuth && s.footer && <p className="mt-1.5 text-[11px] text-slate-400">{s.footer}</p>}
          <p className="mt-1 text-right text-[10px] text-slate-400">{!isAuth && paramCount > 0 ? `${paramCount} var${paramCount > 1 ? 's' : ''}` : ''} 11:30</p>
        </div>
        {previewButtons.length > 0 && (
          <div className="ml-auto mt-1.5 max-w-[280px] space-y-1.5">
            {previewButtons.map((b, i) => (
              <div key={i} className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[13px] font-medium text-[#00A5F4] shadow-sm">
                {b.type === 'URL' ? <ExternalLink className="h-3.5 w-3.5" /> : b.type === 'PHONE_NUMBER' ? <Phone className="h-3.5 w-3.5" /> : b.type === 'COPY_CODE' ? <Copy className="h-3.5 w-3.5" /> : <MessageSquareReply className="h-3.5 w-3.5" />}
                {b.text || 'Button'}
              </div>
            ))}
          </div>
        )}
        {!isAuth && s.templateType === 'CAROUSEL' && s.carousel.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {s.carousel.map((card, i) => (
              <div key={i} className="w-[150px] shrink-0 overflow-hidden rounded-lg bg-white shadow-sm">
                <div className="flex h-20 items-center justify-center bg-slate-100 text-slate-400">
                  {s.carouselHeaderType === 'IMAGE' ? <ImageIcon className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                </div>
                <p className="line-clamp-3 px-2 py-1.5 text-[11px] leading-snug text-slate-800">{card.bodyText || 'Card text'}</p>
                {(card.buttons ?? []).map((b, j) => (
                  <div key={j} className="border-t border-slate-100 py-1.5 text-center text-[11px] font-medium text-[#00A5F4]">{b.text || 'Button'}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
