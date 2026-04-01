'use client'

import { useState, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCreateCampaign } from '@/hooks/useCampaigns'
import { useSegments } from '@/hooks/useSegments'
import { useTemplates } from '@/hooks/useTemplates'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { TemplatePreviewCard } from '@/components/shared/TemplatePreviewCard'
import { cn } from '@/lib/utils'
import type { CampaignContentType, CampaignChannel, CampaignDeliveryType, ConversionGoal, PeriodicSchedule } from '@storees/shared'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Users,
  Mail,
  MessageSquare,
  Bell,
  Calendar,
  Target,
  Loader2,
  Plus,
  X,
  Eye,
  Columns2,
  Columns3,
  Columns4,
  Clock,
  Zap,
  ShieldCheck,
  Send,
  Info,
  BarChart3,
  Layout,
  CalendarClock,
  Repeat,
  FlaskConical,
  SplitSquareHorizontal,
  Trophy,
} from 'lucide-react'

type Step = 1 | 2 | 3
type SendTiming = 'asap' | 'scheduled'
type EditorMode = 'templates' | 'html' | 'preview'

const STEPS = [
  { num: 1 as Step, label: 'Target Users' },
  { num: 2 as Step, label: 'Content' },
  { num: 3 as Step, label: 'Schedule and Goals' },
]

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email', sms: 'SMS', push: 'Push',
}

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail, sms: MessageSquare, push: Bell,
}

/* ─── Starter layout templates (email only) ─── */

const BLANK_HTML = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #111; font-size: 24px; margin-bottom: 16px;">Hi {{customer_name}},</h1>
  <p style="color: #555; font-size: 16px; line-height: 1.6;">
    Write your campaign message here.
  </p>
  <a href="#" style="display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
    Shop Now
  </a>
</div>`

const TWO_COL_HTML = `<table width="600" cellpadding="0" cellspacing="0" style="font-family: sans-serif; margin: 0 auto;">
  <tr><td colspan="2" style="padding: 24px; text-align: center; background: #6366f1; color: white;"><h1 style="margin:0; font-size: 22px;">{{store_name}}</h1></td></tr>
  <tr>
    <td width="50%" style="padding: 20px; vertical-align: top;"><h3 style="color:#111;">Column 1</h3><p style="color:#555; font-size: 14px;">Your content here.</p></td>
    <td width="50%" style="padding: 20px; vertical-align: top;"><h3 style="color:#111;">Column 2</h3><p style="color:#555; font-size: 14px;">Your content here.</p></td>
  </tr>
  <tr><td colspan="2" style="padding: 16px; text-align: center;"><a href="#" style="padding: 10px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Shop Now</a></td></tr>
</table>`

const THREE_COL_HTML = `<table width="600" cellpadding="0" cellspacing="0" style="font-family: sans-serif; margin: 0 auto;">
  <tr><td colspan="3" style="padding: 24px; text-align: center; background: #6366f1; color: white;"><h1 style="margin:0; font-size: 22px;">{{store_name}}</h1></td></tr>
  <tr>
    <td width="33%" style="padding: 16px; vertical-align: top; text-align: center;"><div style="width:48px;height:48px;background:#EEF2FF;border-radius:12px;margin:0 auto 8px;"></div><h4 style="color:#111; margin:0 0 4px;">Feature 1</h4><p style="color:#555; font-size:13px; margin:0;">Description here</p></td>
    <td width="33%" style="padding: 16px; vertical-align: top; text-align: center;"><div style="width:48px;height:48px;background:#EEF2FF;border-radius:12px;margin:0 auto 8px;"></div><h4 style="color:#111; margin:0 0 4px;">Feature 2</h4><p style="color:#555; font-size:13px; margin:0;">Description here</p></td>
    <td width="33%" style="padding: 16px; vertical-align: top; text-align: center;"><div style="width:48px;height:48px;background:#EEF2FF;border-radius:12px;margin:0 auto 8px;"></div><h4 style="color:#111; margin:0 0 4px;">Feature 3</h4><p style="color:#555; font-size:13px; margin:0;">Description here</p></td>
  </tr>
</table>`

const FOUR_COL_HTML = `<table width="600" cellpadding="0" cellspacing="0" style="font-family: sans-serif; margin: 0 auto;">
  <tr><td colspan="4" style="padding: 24px; text-align: center; background: #6366f1; color: white;"><h1 style="margin:0; font-size: 22px;">{{store_name}}</h1></td></tr>
  <tr>
    <td width="25%" style="padding: 12px; text-align: center; vertical-align: top;"><div style="width:40px;height:40px;background:#EEF2FF;border-radius:10px;margin:0 auto 6px;"></div><p style="color:#111; font-size:12px; font-weight:600; margin:0;">Item 1</p></td>
    <td width="25%" style="padding: 12px; text-align: center; vertical-align: top;"><div style="width:40px;height:40px;background:#EEF2FF;border-radius:10px;margin:0 auto 6px;"></div><p style="color:#111; font-size:12px; font-weight:600; margin:0;">Item 2</p></td>
    <td width="25%" style="padding: 12px; text-align: center; vertical-align: top;"><div style="width:40px;height:40px;background:#EEF2FF;border-radius:10px;margin:0 auto 6px;"></div><p style="color:#111; font-size:12px; font-weight:600; margin:0;">Item 3</p></td>
    <td width="25%" style="padding: 12px; text-align: center; vertical-align: top;"><div style="width:40px;height:40px;background:#EEF2FF;border-radius:10px;margin:0 auto 6px;"></div><p style="color:#111; font-size:12px; font-weight:600; margin:0;">Item 4</p></td>
  </tr>
</table>`

const LAYOUT_STARTERS = [
  { key: 'blank', label: 'Blank Template', icon: Plus, html: BLANK_HTML },
  { key: '2col', label: '2 Columns', icon: Columns2, html: TWO_COL_HTML },
  { key: '3col', label: '3 Columns', icon: Columns3, html: THREE_COL_HTML },
  { key: '4col', label: '4 Columns', icon: Columns4, html: FOUR_COL_HTML },
]

/* ─── Main Page ─── */

export default function CreateCampaignPage() {
  return (
    <Suspense fallback={<div className="p-8 text-text-secondary">Loading...</div>}>
      <CreateCampaignContent />
    </Suspense>
  )
}

function CreateCampaignContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createCampaign = useCreateCampaign()
  const { data: segmentsData } = useSegments()
  const { data: templatesData } = useTemplates()

  // Read channel and delivery type from URL params
  const channel = (searchParams.get('channel') ?? 'email') as CampaignChannel
  const deliveryType = (searchParams.get('type') ?? 'one-time') as CampaignDeliveryType
  const isEmail = channel === 'email'
  const isPeriodic = deliveryType === 'periodic'
  const ChannelIcon = CHANNEL_ICONS[channel] ?? Mail

  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [name, setName] = useState('')
  const [contentType, setContentType] = useState<CampaignContentType>('promotional')
  const [segmentId, setSegmentId] = useState('')
  const [audienceMode, setAudienceMode] = useState<'all' | 'segment'>('segment')
  const [showReachability, setShowReachability] = useState(false)

  // Step 2 — email
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [fromName, setFromName] = useState('')
  const [htmlBody, setHtmlBody] = useState(BLANK_HTML)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedLayout, setSelectedLayout] = useState<string>('blank')
  const [editorMode, setEditorMode] = useState<EditorMode>('templates')
  const [previewTemplate, setPreviewTemplate] = useState<{ name: string; html: string } | null>(null)

  // Step 2 — SMS / Push
  const [bodyText, setBodyText] = useState('')
  const [pushTitle, setPushTitle] = useState('')

  // A/B Testing
  const [abTestEnabled, setAbTestEnabled] = useState(false)
  const [abSplitPct, setAbSplitPct] = useState(50)
  const [abVariantBSubject, setAbVariantBSubject] = useState('')
  const [abVariantBHtmlBody, setAbVariantBHtmlBody] = useState('')
  const [abVariantBBodyText, setAbVariantBBodyText] = useState('')
  const [abWinnerMetric, setAbWinnerMetric] = useState<string>('open_rate')
  const [abAutoSendWinner, setAbAutoSendWinner] = useState(false)
  const [abTestDurationHours, setAbTestDurationHours] = useState(4)

  // Step 3
  const [sendTiming, setSendTiming] = useState<SendTiming>('asap')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [conversionGoals, setConversionGoals] = useState<ConversionGoal[]>([{ name: 'Goal 1', eventName: '' }])
  const [goalTrackingHours, setGoalTrackingHours] = useState(36)
  const [deliveryLimit, setDeliveryLimit] = useState<string>('')
  const [ignoreFreqCapping, setIgnoreFreqCapping] = useState(false)

  // Step 3 — periodic
  const [periodicFrequency, setPeriodicFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [periodicDayOfWeek, setPeriodicDayOfWeek] = useState(1)
  const [periodicDayOfMonth, setPeriodicDayOfMonth] = useState(1)
  const [periodicTime, setPeriodicTime] = useState('09:00')
  const [periodicEndsAt, setPeriodicEndsAt] = useState('')

  const segments = segmentsData?.data ?? []
  const templates = (templatesData?.data ?? []).filter(t => t.channel === channel)
  const selectedSegment = segments.find(s => s.id === segmentId)

  // Validation
  const step1Valid = name.trim().length > 0
  const step2Valid = isEmail
    ? subject.trim().length > 0 && htmlBody.trim().length > 0
    : bodyText.trim().length > 0
  const step3Valid = isPeriodic
    ? !!periodicTime
    : sendTiming === 'asap' || (!!scheduledDate && !!scheduledTime)
  const canSave = step1Valid && step2Valid

  const completedSteps = useMemo(() => {
    const s = new Set<Step>()
    if (step1Valid) s.add(1)
    if (step2Valid) s.add(2)
    if (step3Valid) s.add(3)
    return s
  }, [step1Valid, step2Valid, step3Valid])

  const handleSaveDraft = () => {
    const goals = conversionGoals.filter(g => g.eventName.trim())

    const periodicSchedule: PeriodicSchedule | undefined = isPeriodic ? {
      frequency: periodicFrequency,
      ...(periodicFrequency === 'weekly' ? { dayOfWeek: periodicDayOfWeek } : {}),
      ...(periodicFrequency === 'monthly' ? { dayOfMonth: periodicDayOfMonth } : {}),
      time: periodicTime,
      ...(periodicEndsAt ? { endsAt: periodicEndsAt } : {}),
    } : undefined

    createCampaign.mutate(
      {
        name,
        channel,
        deliveryType,
        contentType,
        // Email fields
        subject: isEmail ? subject : (channel === 'push' ? pushTitle : undefined),
        htmlBody: isEmail ? htmlBody : undefined,
        previewText: isEmail ? (previewText || undefined) : undefined,
        fromName: isEmail ? (fromName || undefined) : undefined,
        templateId: isEmail ? (selectedTemplateId || undefined) : undefined,
        // SMS/Push fields
        bodyText: !isEmail ? bodyText : undefined,
        // Audience
        segmentId: audienceMode === 'segment' ? segmentId || undefined : undefined,
        // Goals
        conversionGoals: goals.length > 0 ? goals : undefined,
        goalTrackingHours,
        deliveryLimit: deliveryLimit ? parseInt(deliveryLimit) : undefined,
        // Schedule
        periodicSchedule,
        scheduledAt: !isPeriodic && sendTiming === 'scheduled' && scheduledDate && scheduledTime
          ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
          : undefined,
        // A/B Testing
        abTestEnabled: abTestEnabled || undefined,
        abSplitPct: abTestEnabled ? abSplitPct : undefined,
        abVariantBSubject: abTestEnabled && isEmail ? abVariantBSubject || undefined : undefined,
        abVariantBHtmlBody: abTestEnabled && isEmail ? abVariantBHtmlBody || undefined : undefined,
        abVariantBBodyText: abTestEnabled && !isEmail ? abVariantBBodyText || undefined : undefined,
        abWinnerMetric: abTestEnabled ? abWinnerMetric : undefined,
        abAutoSendWinner: abTestEnabled ? abAutoSendWinner : undefined,
        abTestDurationHours: abTestEnabled ? abTestDurationHours : undefined,
      },
      { onSuccess: (res) => router.push(`/campaigns/${res.data?.id}`) },
    )
  }

  const goNext = () => setStep(s => Math.min(s + 1, 3) as Step)
  const goPrev = () => setStep(s => Math.max(s - 1, 1) as Step)

  const inputClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-text-muted'
  const selectClass = cn(inputClass, 'appearance-none cursor-pointer')

  const channelLabel = CHANNEL_LABELS[channel] ?? 'Email'
  const typeLabel = isPeriodic ? 'Periodic' : 'One-time'

  return (
    <div>
      {/* Header — breadcrumb + Save as draft */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/campaigns')} className="p-2 rounded-lg border border-border hover:bg-surface transition-colors">
            <ArrowLeft className="h-4 w-4 text-text-secondary" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-text-muted">Campaigns &gt; {channelLabel} ({typeLabel}) &gt; Create</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-text-secondary">
                <ChannelIcon className="h-3 w-3" />
                {channelLabel}
              </span>
              {isPeriodic && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-50 text-blue-600">
                  <Repeat className="h-3 w-3" />
                  Periodic
                </span>
              )}
            </div>
            <h1 className="text-lg font-semibold text-heading mt-0.5">{name || 'Untitled'}</h1>
          </div>
        </div>
        <button
          onClick={handleSaveDraft}
          disabled={!canSave || createCampaign.isPending}
          className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover disabled:text-text-muted disabled:cursor-not-allowed transition-colors"
        >
          {createCampaign.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save as draft
        </button>
      </div>

      {/* Step Progress Bar */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => {
          const isActive = step === s.num
          const isCompleted = completedSteps.has(s.num) && step > s.num
          return (
            <div key={s.num} className="flex items-center flex-1">
              <button onClick={() => setStep(s.num)} className="flex items-center gap-2 group">
                <span className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                  isActive ? 'bg-accent text-white' : isCompleted ? 'bg-accent/10 text-accent' : 'bg-gray-100 text-text-muted',
                )}>
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : s.num}
                </span>
                <span className={cn('text-sm font-medium transition-colors', isActive ? 'text-heading' : 'text-text-muted group-hover:text-text-secondary')}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="flex-1 mx-4">
                  <div className={cn('h-0.5 rounded-full', completedSteps.has(s.num) ? 'bg-accent/30' : 'bg-gray-100')} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <div className="min-h-[500px]">
        {step === 1 && (
          <Step1TargetUsers
            channel={channel}
            name={name} setName={setName}
            contentType={contentType} setContentType={setContentType}
            audienceMode={audienceMode} setAudienceMode={setAudienceMode}
            segmentId={segmentId} setSegmentId={setSegmentId}
            segments={segments} selectedSegment={selectedSegment}
            showReachability={showReachability} setShowReachability={setShowReachability}
            inputClass={inputClass} selectClass={selectClass}
          />
        )}
        {step === 2 && (
          <div className="space-y-6">
            {isEmail ? (
              <Step2EmailContent
                subject={subject} setSubject={setSubject}
                previewText={previewText} setPreviewText={setPreviewText}
                fromName={fromName} setFromName={setFromName}
                htmlBody={htmlBody} setHtmlBody={setHtmlBody}
                selectedTemplateId={selectedTemplateId}
                selectedLayout={selectedLayout}
                editorMode={editorMode} setEditorMode={setEditorMode}
                templates={templates}
                onSelectLayout={(key, html) => { setSelectedLayout(key); setSelectedTemplateId(null); setHtmlBody(html) }}
                onSelectTemplate={(id, html) => { setSelectedTemplateId(id); setSelectedLayout(''); setHtmlBody(html) }}
                onPreviewTemplate={setPreviewTemplate}
                inputClass={inputClass}
              />
            ) : (
              <Step2TextContent
                channel={channel}
                bodyText={bodyText} setBodyText={setBodyText}
                pushTitle={pushTitle} setPushTitle={setPushTitle}
                templates={templates}
                inputClass={inputClass}
              />
            )}

            {/* A/B Testing Section */}
            <AbTestSection
              enabled={abTestEnabled} setEnabled={setAbTestEnabled}
              isEmail={isEmail} channel={channel}
              splitPct={abSplitPct} setSplitPct={setAbSplitPct}
              variantBSubject={abVariantBSubject} setVariantBSubject={setAbVariantBSubject}
              variantBHtmlBody={abVariantBHtmlBody} setVariantBHtmlBody={setAbVariantBHtmlBody}
              variantBBodyText={abVariantBBodyText} setVariantBBodyText={setAbVariantBBodyText}
              winnerMetric={abWinnerMetric} setWinnerMetric={setAbWinnerMetric}
              autoSendWinner={abAutoSendWinner} setAutoSendWinner={setAbAutoSendWinner}
              testDurationHours={abTestDurationHours} setTestDurationHours={setAbTestDurationHours}
              inputClass={inputClass} selectClass={selectClass}
            />
          </div>
        )}
        {step === 3 && (
          <Step3ScheduleGoals
            isPeriodic={isPeriodic}
            channel={channel}
            sendTiming={sendTiming} setSendTiming={setSendTiming}
            scheduledDate={scheduledDate} setScheduledDate={setScheduledDate}
            scheduledTime={scheduledTime} setScheduledTime={setScheduledTime}
            periodicFrequency={periodicFrequency} setPeriodicFrequency={setPeriodicFrequency}
            periodicDayOfWeek={periodicDayOfWeek} setPeriodicDayOfWeek={setPeriodicDayOfWeek}
            periodicDayOfMonth={periodicDayOfMonth} setPeriodicDayOfMonth={setPeriodicDayOfMonth}
            periodicTime={periodicTime} setPeriodicTime={setPeriodicTime}
            periodicEndsAt={periodicEndsAt} setPeriodicEndsAt={setPeriodicEndsAt}
            conversionGoals={conversionGoals} setConversionGoals={setConversionGoals}
            goalTrackingHours={goalTrackingHours} setGoalTrackingHours={setGoalTrackingHours}
            deliveryLimit={deliveryLimit} setDeliveryLimit={setDeliveryLimit}
            ignoreFreqCapping={ignoreFreqCapping} setIgnoreFreqCapping={setIgnoreFreqCapping}
            inputClass={inputClass} selectClass={selectClass}
          />
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
        <button onClick={goPrev} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <ArrowLeft className="h-4 w-4" /> Previous
        </button>
        <div className="flex items-center gap-3">
          {step < 3 ? (
            <button onClick={goNext} disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={handleSaveDraft} disabled={!canSave || createCampaign.isPending} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {createCampaign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Create Campaign
            </button>
          )}
        </div>
      </div>

      {/* Template Preview Slide-Over */}
      <SlidePanel
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        title={previewTemplate?.name ?? 'Template Preview'}
        width="w-[640px]"
      >
        {previewTemplate && (
          <div className="border border-border rounded-lg overflow-hidden">
            <iframe srcDoc={previewTemplate.html} title="Preview" className="w-full h-[600px]" sandbox="allow-same-origin" />
          </div>
        )}
      </SlidePanel>
    </div>
  )
}

/* ─── Step 1: Target Users ─── */

function Step1TargetUsers({
  channel, name, setName, contentType, setContentType,
  audienceMode, setAudienceMode, segmentId, setSegmentId,
  segments, selectedSegment,
  showReachability, setShowReachability,
  inputClass, selectClass,
}: {
  channel: CampaignChannel
  name: string; setName: (v: string) => void
  contentType: CampaignContentType; setContentType: (v: CampaignContentType) => void
  audienceMode: 'all' | 'segment'; setAudienceMode: (v: 'all' | 'segment') => void
  segmentId: string; setSegmentId: (v: string) => void
  segments: Array<{ id: string; name: string; memberCount: number }>
  selectedSegment?: { id: string; name: string; memberCount: number }
  showReachability: boolean; setShowReachability: (v: boolean) => void
  inputClass: string; selectClass: string
}) {
  const reachable = selectedSegment ? Math.round(selectedSegment.memberCount * 0.9) : 0
  const reachablePct = selectedSegment && selectedSegment.memberCount > 0
    ? ((reachable / selectedSegment.memberCount) * 100).toFixed(1) : '0'

  const channelLabel = CHANNEL_LABELS[channel] ?? 'Email'

  return (
    <div className="max-w-2xl space-y-6">
      {/* Campaign Name */}
      <div className="bg-white border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          Campaign Name<span className="text-red-400">*</span>
        </label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. Summer Sale 2024 ${channelLabel}`} className={inputClass} autoFocus />
      </div>

      {/* Content Type — inline radios */}
      <div className="bg-white border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-text-primary mb-1">
          Campaign Content Type<span className="text-red-400">*</span>
        </label>
        <p className="text-xs text-text-muted mb-3">Promotional messages follow frequency capping. Transactional messages are always delivered.</p>
        <div className="flex gap-6">
          {([
            { value: 'promotional' as const, label: 'Promotional/Marketing', icon: Zap },
            { value: 'transactional' as const, label: 'Transactional', icon: ShieldCheck },
          ]).map(opt => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center', contentType === opt.value ? 'border-accent' : 'border-gray-300')}>
                {contentType === opt.value && <div className="w-2 h-2 rounded-full bg-accent" />}
              </div>
              <opt.icon className={cn('h-3.5 w-3.5', contentType === opt.value ? 'text-accent' : 'text-text-muted')} />
              <span className="text-sm text-text-primary">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Audience */}
      <div className="bg-white border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-text-primary mb-3">Select Audience<span className="text-red-400">*</span></label>
        <div className="flex gap-4 mb-4">
          {([{ value: 'all' as const, label: 'All users' }, { value: 'segment' as const, label: 'Filter users by' }]).map(opt => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center', audienceMode === opt.value ? 'border-accent' : 'border-gray-300')}>
                {audienceMode === opt.value && <div className="w-2 h-2 rounded-full bg-accent" />}
              </div>
              <span className="text-sm text-text-primary">{opt.label}</span>
            </label>
          ))}
        </div>

        {audienceMode === 'segment' && (
          <>
            <select value={segmentId} onChange={e => { setSegmentId(e.target.value); setShowReachability(false) }} className={selectClass}>
              <option value="">Select a segment...</option>
              {segments.map(s => <option key={s.id} value={s.id}>{s.name} ({s.memberCount.toLocaleString()} members)</option>)}
            </select>

            {segmentId && (
              <div className="mt-3">
                {!showReachability ? (
                  <button onClick={() => setShowReachability(true)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors">
                    <BarChart3 className="h-4 w-4" /> Show count
                  </button>
                ) : (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs font-medium text-text-secondary mb-1">{channelLabel} reachable users</p>
                    <p className="text-2xl font-bold text-heading">{reachable.toLocaleString()}</p>
                    <p className="text-xs text-text-muted">{reachablePct}% of total user count</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Step 2: Email Content (unchanged from before) ─── */

type TemplateItem = { id: string; name: string; htmlBody?: string | null; subject?: string | null; bodyText?: string | null }

function Step2EmailContent({
  subject, setSubject, previewText, setPreviewText,
  fromName, setFromName, htmlBody, setHtmlBody,
  selectedTemplateId, selectedLayout,
  editorMode, setEditorMode,
  templates, onSelectLayout, onSelectTemplate, onPreviewTemplate,
  inputClass,
}: {
  subject: string; setSubject: (v: string) => void
  previewText: string; setPreviewText: (v: string) => void
  fromName: string; setFromName: (v: string) => void
  htmlBody: string; setHtmlBody: (v: string) => void
  selectedTemplateId: string | null
  selectedLayout: string
  editorMode: EditorMode; setEditorMode: (v: EditorMode) => void
  templates: TemplateItem[]
  onSelectLayout: (key: string, html: string) => void
  onSelectTemplate: (id: string, html: string) => void
  onPreviewTemplate: (t: { name: string; html: string } | null) => void
  inputClass: string
}) {
  return (
    <div className="space-y-6">
      {/* Editor Mode Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { key: 'templates' as EditorMode, label: 'My Templates', icon: Layout },
          { key: 'html' as EditorMode, label: 'Custom HTML', icon: Mail },
          { key: 'preview' as EditorMode, label: 'Preview', icon: Eye },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setEditorMode(tab.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px]',
              editorMode === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {editorMode === 'templates' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-1">Start from a layout</h3>
            <p className="text-xs text-text-muted mb-3">Click on any tile to select the template.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {LAYOUT_STARTERS.map(layout => {
                const Icon = layout.icon
                const isSelected = selectedLayout === layout.key && !selectedTemplateId
                return (
                  <button key={layout.key} onClick={() => onSelectLayout(layout.key, layout.html)}
                    className={cn('flex flex-col items-center justify-center p-5 rounded-xl border-2 transition-all h-32',
                      isSelected ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-300',
                      layout.key === 'blank' && !isSelected && 'border-dashed',
                    )}>
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-2', isSelected ? 'bg-accent/10' : 'bg-gray-100')}>
                      <Icon className={cn('h-5 w-5', isSelected ? 'text-accent' : 'text-text-muted')} />
                    </div>
                    <span className="text-xs font-medium text-text-primary">{layout.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          {templates.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-primary mb-1">Pre-built templates</h3>
              <p className="text-xs text-text-muted mb-3">Choose from your saved templates.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {templates.map(t => (
                  <TemplatePreviewCard key={t.id} name={t.name} htmlBody={t.htmlBody} subject={t.subject}
                    selected={selectedTemplateId === t.id}
                    onChoose={() => onSelectTemplate(t.id, t.htmlBody ?? BLANK_HTML)}
                    onPreview={() => onPreviewTemplate({ name: t.name, html: t.htmlBody ?? '' })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editorMode === 'html' && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-surface border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary">Template Editor</h2>
          </div>
          <div className="p-5">
            <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={20}
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
              spellCheck={false} />
            <p className="text-xs text-text-muted mt-2">Variables: {'{{customer_name}}'}, {'{{customer_email}}'}, {'{{store_name}}'}</p>
          </div>
        </div>
      )}

      {editorMode === 'preview' && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-surface border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Email Preview</h2>
            <span className="text-xs text-text-muted">Subject: <strong className="text-text-primary">{subject || '(empty)'}</strong></span>
          </div>
          <div className="p-5">
            <div className="border border-border rounded-lg overflow-hidden">
              <iframe srcDoc={htmlBody} title="Email Preview" className="w-full h-[500px]" sandbox="allow-same-origin" />
            </div>
          </div>
        </div>
      )}

      {/* Email Details */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
          <Mail className="h-4 w-4 text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Email Details</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Subject<span className="text-red-400">*</span></label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Don't sweat the heat, our Summer Sale is here!" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Preview Text <span className="text-text-muted font-normal">(optional)</span></label>
            <input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Short preview shown in inbox next to subject line" className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Sender Name</label>
              <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="MyDeal" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">From email</label>
              <input value="noreply@yourdomain.com" disabled className={cn(inputClass, 'bg-gray-50 text-text-muted cursor-not-allowed')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Reply-to email</label>
              <input value="" placeholder="Same as from email" disabled className={cn(inputClass, 'bg-gray-50 cursor-not-allowed')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Step 2: SMS / Push Content ─── */

function Step2TextContent({
  channel, bodyText, setBodyText, pushTitle, setPushTitle, templates, inputClass,
}: {
  channel: CampaignChannel
  bodyText: string; setBodyText: (v: string) => void
  pushTitle: string; setPushTitle: (v: string) => void
  templates: TemplateItem[]
  inputClass: string
}) {
  const isSms = channel === 'sms'
  const isPush = channel === 'push'
  const ChannelIcon = CHANNEL_ICONS[channel] ?? MessageSquare
  const channelLabel = CHANNEL_LABELS[channel] ?? channel

  return (
    <div className="max-w-2xl space-y-6">
      {/* Saved templates for this channel */}
      {templates.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">Use a saved {channelLabel} template</h3>
          <div className="space-y-2">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => {
                  if (t.bodyText) setBodyText(t.bodyText)
                  if (isPush && t.subject) setPushTitle(t.subject)
                }}
                className="w-full text-left p-3 rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-colors"
              >
                <p className="text-sm font-medium text-text-primary">{t.name}</p>
                {t.bodyText && <p className="text-xs text-text-muted truncate mt-0.5">{t.bodyText}</p>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Push: Title */}
      {isPush && (
        <div className="bg-white border border-border rounded-xl p-6">
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Notification Title<span className="text-red-400">*</span>
          </label>
          <input
            value={pushTitle}
            onChange={e => setPushTitle(e.target.value)}
            placeholder="e.g. 🔔 Your order has shipped!"
            className={inputClass}
          />
          <p className="text-xs text-text-muted mt-1">Variables: {'{{customer_name}}'}, {'{{store_name}}'}</p>
        </div>
      )}

      {/* Message Body */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
          <ChannelIcon className="h-4 w-4 text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">{channelLabel} Message</h2>
        </div>
        <div className="p-5">
          <textarea
            value={bodyText}
            onChange={e => setBodyText(e.target.value)}
            rows={isSms ? 4 : 6}
            placeholder={
              isSms
                ? 'Hi {{customer_name}}, your order #{{order_id}} is ready for pickup! Reply STOP to unsubscribe.'
                : 'Your order has been shipped and will arrive in 2-3 business days. Track it now!'
            }
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none placeholder:text-text-muted"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-text-muted">Variables: {'{{customer_name}}'}, {'{{store_name}}'}, {'{{order_id}}'}</p>
            {isSms && (
              <p className={cn('text-xs font-medium', bodyText.length > 160 ? 'text-red-500' : 'text-text-muted')}>
                {bodyText.length}/160
                {bodyText.length > 160 && ` (${Math.ceil(bodyText.length / 153)} segments)`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Preview card */}
      {(isPush || isSms) && bodyText.trim() && (
        <div className="bg-white border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">Preview</h3>
          {isPush ? (
            <div className="max-w-xs mx-auto bg-gray-50 rounded-2xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bell className="h-4 w-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary">{pushTitle || 'App Name'}</p>
                  <p className="text-xs text-text-secondary mt-0.5 line-clamp-3">{bodyText}</p>
                  <p className="text-[10px] text-text-muted mt-1">now</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-xs mx-auto bg-gray-50 rounded-2xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="h-4 w-4 text-green-600" />
                </div>
                <div className="bg-white rounded-xl rounded-tl-none p-3 shadow-sm border border-gray-100 max-w-[240px]">
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{bodyText}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── A/B Test Section ─── */

function AbTestSection({
  enabled, setEnabled, isEmail, channel,
  splitPct, setSplitPct,
  variantBSubject, setVariantBSubject,
  variantBHtmlBody, setVariantBHtmlBody,
  variantBBodyText, setVariantBBodyText,
  winnerMetric, setWinnerMetric,
  autoSendWinner, setAutoSendWinner,
  testDurationHours, setTestDurationHours,
  inputClass, selectClass,
}: {
  enabled: boolean; setEnabled: (v: boolean) => void
  isEmail: boolean; channel: CampaignChannel
  splitPct: number; setSplitPct: (v: number) => void
  variantBSubject: string; setVariantBSubject: (v: string) => void
  variantBHtmlBody: string; setVariantBHtmlBody: (v: string) => void
  variantBBodyText: string; setVariantBBodyText: (v: string) => void
  winnerMetric: string; setWinnerMetric: (v: string) => void
  autoSendWinner: boolean; setAutoSendWinner: (v: boolean) => void
  testDurationHours: number; setTestDurationHours: (v: number) => void
  inputClass: string; selectClass: string
}) {
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-purple-500" />
          <h2 className="text-sm font-semibold text-text-primary">A/B Testing</h2>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">Optional</span>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={cn('relative w-10 h-5 rounded-full transition-colors', enabled ? 'bg-purple-500' : 'bg-gray-200')}
        >
          <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
      </div>

      {enabled && (
        <div className="p-5 space-y-5">
          {/* Split ratio */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">Traffic Split</label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-blue-600">Variant A — {splitPct}%</span>
                  <span className="text-xs font-semibold text-purple-600">Variant B — {100 - splitPct}%</span>
                </div>
                <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-blue-400 rounded-l-full" style={{ width: `${splitPct}%` }} />
                  <div className="absolute inset-y-0 right-0 bg-purple-400 rounded-r-full" style={{ width: `${100 - splitPct}%` }} />
                </div>
                <input
                  type="range"
                  min={10} max={90} step={5}
                  value={splitPct}
                  onChange={e => setSplitPct(parseInt(e.target.value))}
                  className="w-full mt-1 accent-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Variant B content */}
          <div className="p-4 bg-purple-50/50 rounded-lg border border-purple-100">
            <div className="flex items-center gap-2 mb-3">
              <SplitSquareHorizontal className="h-4 w-4 text-purple-500" />
              <h3 className="text-sm font-semibold text-text-primary">Variant B Content</h3>
            </div>
            <p className="text-xs text-text-muted mb-3">
              Variant A uses the main content above. Configure what Variant B recipients will see.
            </p>

            {isEmail ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Subject Line (B)</label>
                  <input
                    value={variantBSubject}
                    onChange={e => setVariantBSubject(e.target.value)}
                    placeholder="Alternative subject line for testing..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">HTML Body (B)</label>
                  <textarea
                    value={variantBHtmlBody}
                    onChange={e => setVariantBHtmlBody(e.target.value)}
                    rows={8}
                    placeholder="Paste alternative HTML for Variant B..."
                    className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-300/50 focus:border-purple-400 resize-none"
                    spellCheck={false}
                  />
                  <p className="text-xs text-text-muted mt-1">Leave empty to only test the subject line</p>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Message Body (B)</label>
                <textarea
                  value={variantBBodyText}
                  onChange={e => setVariantBBodyText(e.target.value)}
                  rows={4}
                  placeholder="Alternative message text for Variant B..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-300/50 focus:border-purple-400 resize-none"
                />
              </div>
            )}
          </div>

          {/* Winner selection config */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Winner Metric</label>
              <select value={winnerMetric} onChange={e => setWinnerMetric(e.target.value)} className={selectClass}>
                <option value="open_rate">Open Rate</option>
                <option value="click_rate">Click Rate</option>
                <option value="conversion_rate">Conversion Rate</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Test Duration</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={testDurationHours}
                  onChange={e => setTestDurationHours(parseInt(e.target.value) || 4)}
                  min={1} max={72}
                  className="w-20 h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <span className="text-xs text-text-secondary">hours</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Auto-send winner</label>
              <button
                onClick={() => setAutoSendWinner(!autoSendWinner)}
                className={cn('relative w-10 h-5 rounded-full transition-colors mt-2', autoSendWinner ? 'bg-accent' : 'bg-gray-200')}
              >
                <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', autoSendWinner ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
              <p className="text-[10px] text-text-muted mt-1">
                {autoSendWinner ? 'Winner sent to remaining audience' : 'Manual selection required'}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2">
            <Trophy className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-purple-700">
              <strong>{splitPct}%</strong> of recipients get Variant A, <strong>{100 - splitPct}%</strong> get Variant B.
              Winner determined by <strong>{winnerMetric.replace(/_/g, ' ')}</strong> after <strong>{testDurationHours}h</strong>.
              {autoSendWinner && ' Winning variant auto-sent to remaining audience.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Step 3: Schedule and Goals ─── */

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function Step3ScheduleGoals({
  isPeriodic, channel,
  sendTiming, setSendTiming, scheduledDate, setScheduledDate,
  scheduledTime, setScheduledTime,
  periodicFrequency, setPeriodicFrequency,
  periodicDayOfWeek, setPeriodicDayOfWeek,
  periodicDayOfMonth, setPeriodicDayOfMonth,
  periodicTime, setPeriodicTime,
  periodicEndsAt, setPeriodicEndsAt,
  conversionGoals, setConversionGoals,
  goalTrackingHours, setGoalTrackingHours,
  deliveryLimit, setDeliveryLimit,
  ignoreFreqCapping, setIgnoreFreqCapping,
  inputClass, selectClass,
}: {
  isPeriodic: boolean
  channel: CampaignChannel
  sendTiming: SendTiming; setSendTiming: (v: SendTiming) => void
  scheduledDate: string; setScheduledDate: (v: string) => void
  scheduledTime: string; setScheduledTime: (v: string) => void
  periodicFrequency: 'daily' | 'weekly' | 'monthly'; setPeriodicFrequency: (v: 'daily' | 'weekly' | 'monthly') => void
  periodicDayOfWeek: number; setPeriodicDayOfWeek: (v: number) => void
  periodicDayOfMonth: number; setPeriodicDayOfMonth: (v: number) => void
  periodicTime: string; setPeriodicTime: (v: string) => void
  periodicEndsAt: string; setPeriodicEndsAt: (v: string) => void
  conversionGoals: ConversionGoal[]; setConversionGoals: (v: ConversionGoal[]) => void
  goalTrackingHours: number; setGoalTrackingHours: (v: number) => void
  deliveryLimit: string; setDeliveryLimit: (v: string) => void
  ignoreFreqCapping: boolean; setIgnoreFreqCapping: (v: boolean) => void
  inputClass: string; selectClass: string
}) {
  const eventOptions = ['order_completed', 'product_viewed', 'added_to_cart', 'checkout_started', 'page_viewed', 'app_opened', 'signed_up']

  const addGoal = () => setConversionGoals([...conversionGoals, { name: `Goal ${conversionGoals.length + 1}`, eventName: '' }])
  const removeGoal = (idx: number) => setConversionGoals(conversionGoals.filter((_, i) => i !== idx))
  const updateGoal = (idx: number, field: keyof ConversionGoal, value: string) => {
    setConversionGoals(conversionGoals.map((g, i) => i === idx ? { ...g, [field]: value } : g))
  }

  const channelLabel = CHANNEL_LABELS[channel] ?? 'message'

  return (
    <div className="max-w-3xl space-y-6">
      {/* Schedule — One-time or Periodic */}
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          {isPeriodic ? <CalendarClock className="h-4 w-4 text-blue-600" /> : <Clock className="h-4 w-4 text-text-muted" />}
          <h3 className="text-sm font-semibold text-heading">
            {isPeriodic ? 'Recurring Schedule' : 'Send Campaign'}
          </h3>
        </div>
        <p className="text-xs text-text-muted mb-4">
          {isPeriodic ? 'Configure how often this campaign repeats' : 'One Time'}
        </p>

        {isPeriodic ? (
          <div className="space-y-4">
            {/* Frequency selector */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">Repeat every</label>
              <div className="flex gap-3">
                {(['daily', 'weekly', 'monthly'] as const).map(freq => (
                  <button
                    key={freq}
                    onClick={() => setPeriodicFrequency(freq)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all capitalize',
                      periodicFrequency === freq
                        ? 'border-accent bg-accent/5 text-accent'
                        : 'border-border text-text-secondary hover:border-gray-300',
                    )}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            {/* Day of week (weekly) */}
            {periodicFrequency === 'weekly' && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">On day</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_OF_WEEK.map((day, i) => (
                    <button
                      key={day}
                      onClick={() => setPeriodicDayOfWeek(i)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                        periodicDayOfWeek === i
                          ? 'border-accent bg-accent/5 text-accent'
                          : 'border-border text-text-secondary hover:border-gray-300',
                      )}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Day of month (monthly) */}
            {periodicFrequency === 'monthly' && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Day of month</label>
                <select
                  value={periodicDayOfMonth}
                  onChange={e => setPeriodicDayOfMonth(parseInt(e.target.value))}
                  className={selectClass}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Send time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Send at time</label>
                <input type="time" value={periodicTime} onChange={e => setPeriodicTime(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">End date <span className="text-text-muted font-normal">(optional)</span></label>
                <input type="date" value={periodicEndsAt} onChange={e => setPeriodicEndsAt(e.target.value)} className={inputClass} />
              </div>
            </div>

            {/* Summary */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>Schedule:</strong>{' '}
                {periodicFrequency === 'daily' && `Every day at ${periodicTime || '09:00'}`}
                {periodicFrequency === 'weekly' && `Every ${DAYS_OF_WEEK[periodicDayOfWeek]} at ${periodicTime || '09:00'}`}
                {periodicFrequency === 'monthly' && `Every month on day ${periodicDayOfMonth} at ${periodicTime || '09:00'}`}
                {periodicEndsAt ? ` until ${new Date(periodicEndsAt).toLocaleDateString()}` : ' (runs indefinitely)'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-4">
              {([
                { value: 'asap' as const, label: 'As soon as possible', icon: Zap },
                { value: 'scheduled' as const, label: 'At specific date and time', icon: Clock },
              ]).map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center', sendTiming === opt.value ? 'border-accent' : 'border-gray-300')}>
                    {sendTiming === opt.value && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                  <opt.icon className={cn('h-3.5 w-3.5', sendTiming === opt.value ? 'text-accent' : 'text-text-muted')} />
                  <span className="text-sm text-text-primary">{opt.label}</span>
                </label>
              ))}
            </div>
            {sendTiming === 'scheduled' && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-surface rounded-lg border border-border">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Start date</label>
                  <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Send time</label>
                  <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className={inputClass} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Conversion Goals */}
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-4 w-4 text-text-muted" />
          <h3 className="text-sm font-semibold text-heading">Conversion Goals</h3>
        </div>
        <p className="text-xs text-text-muted mb-4">Track which events users perform after receiving this campaign.</p>

        <div className="space-y-4">
          {conversionGoals.map((goal, idx) => (
            <div key={idx} className="relative p-4 bg-surface rounded-lg border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Goal {idx + 1}</span>
                {conversionGoals.length > 1 && (
                  <button onClick={() => removeGoal(idx)} className="text-text-muted hover:text-red-500 transition-colors"><X className="h-4 w-4" /></button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Goal name</label>
                  <input value={goal.name} onChange={e => updateGoal(idx, 'name', e.target.value)} placeholder="Goal 1" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Event name</label>
                  <select value={goal.eventName} onChange={e => updateGoal(idx, 'eventName', e.target.value)} className={selectClass}>
                    <option value="">Select an event...</option>
                    {eventOptions.map(ev => <option key={ev} value={ev}>{ev.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addGoal} className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-accent hover:text-accent-hover transition-colors">
          <Plus className="h-3.5 w-3.5" /> New goal
        </button>

        <div className="mt-5 pt-4 border-t border-border flex items-center gap-3">
          <span className="text-xs font-medium text-text-secondary">Track above goals for</span>
          <input type="number" value={goalTrackingHours} onChange={e => setGoalTrackingHours(parseInt(e.target.value) || 36)} className="w-16 h-8 px-2 text-sm text-center border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <span className="text-xs text-text-secondary">Hours</span>
          <span className="text-xs text-text-muted">from the time the {channelLabel} is opened</span>
        </div>
      </div>

      {/* Delivery Controls */}
      <div className="bg-white border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-heading mb-1">Delivery Controls</h3>
        <p className="text-xs text-text-muted mb-4">Protect your sender reputation with delivery limits.</p>

        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
          <div>
            <p className="text-sm text-text-primary">Ignore frequency capping</p>
            <p className="text-xs text-text-muted">Currently set as 1 {channelLabel} in 1 day in settings</p>
          </div>
          <button
            onClick={() => setIgnoreFreqCapping(!ignoreFreqCapping)}
            className={cn('relative w-10 h-5 rounded-full transition-colors', ignoreFreqCapping ? 'bg-accent' : 'bg-gray-200')}
          >
            <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', ignoreFreqCapping ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Request limit <span className="text-text-muted font-normal">(optional)</span></label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">Limit to</span>
            <input type="number" value={deliveryLimit} onChange={e => setDeliveryLimit(e.target.value)} placeholder="60000" className="w-28 h-8 px-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <span className="text-xs text-text-secondary">requests per minute</span>
          </div>
        </div>
      </div>
    </div>
  )
}
