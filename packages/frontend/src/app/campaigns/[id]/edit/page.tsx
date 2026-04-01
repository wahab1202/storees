'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCampaignDetail, useUpdateCampaign } from '@/hooks/useCampaigns'
import { useSegments } from '@/hooks/useSegments'
import { cn } from '@/lib/utils'
import type { ConversionGoal, PeriodicSchedule } from '@storees/shared'
import {
  ArrowLeft,
  Mail,
  Users,
  Eye,
  Loader2,
  Clock,
  Zap,
  Target,
  Plus,
  X,
  FlaskConical,
  SplitSquareHorizontal,
  Trophy,
  CalendarClock,
  Repeat,
  Settings2,
} from 'lucide-react'

const inputClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-text-muted'
const selectClass = cn(inputClass, 'appearance-none cursor-pointer')

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const EVENT_OPTIONS = ['order_completed', 'product_viewed', 'added_to_cart', 'checkout_started', 'page_viewed', 'app_opened', 'signed_up']

export default function EditCampaignPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const { data, isLoading, isError } = useCampaignDetail(id)
  const { data: segmentsData } = useSegments()
  const updateCampaign = useUpdateCampaign()

  // Basic fields
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [fromName, setFromName] = useState('')
  const [segmentId, setSegmentId] = useState('')
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')

  // Schedule
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')

  // Periodic
  const [periodicFrequency, setPeriodicFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [periodicDayOfWeek, setPeriodicDayOfWeek] = useState(1)
  const [periodicDayOfMonth, setPeriodicDayOfMonth] = useState(1)
  const [periodicTime, setPeriodicTime] = useState('09:00')
  const [periodicEndsAt, setPeriodicEndsAt] = useState('')

  // Goals
  const [conversionGoals, setConversionGoals] = useState<ConversionGoal[]>([])
  const [goalTrackingHours, setGoalTrackingHours] = useState(36)
  const [deliveryLimit, setDeliveryLimit] = useState<string>('')

  // A/B Testing
  const [abTestEnabled, setAbTestEnabled] = useState(false)
  const [abSplitPct, setAbSplitPct] = useState(50)
  const [abVariantBSubject, setAbVariantBSubject] = useState('')
  const [abVariantBHtmlBody, setAbVariantBHtmlBody] = useState('')
  const [abVariantBBodyText, setAbVariantBBodyText] = useState('')
  const [abWinnerMetric, setAbWinnerMetric] = useState('open_rate')
  const [abAutoSendWinner, setAbAutoSendWinner] = useState(false)
  const [abTestDurationHours, setAbTestDurationHours] = useState(4)

  const segments = segmentsData?.data ?? []

  // Populate form from campaign data
  useEffect(() => {
    if (data?.data) {
      const c = data.data
      setName(c.name)
      setSubject(c.subject ?? '')
      setPreviewText(c.previewText ?? '')
      setHtmlBody(c.htmlBody ?? '')
      setBodyText(c.bodyText ?? '')
      setFromName(c.fromName ?? '')
      setSegmentId(c.segmentId ?? '')
      setGoalTrackingHours(c.goalTrackingHours ?? 36)
      setDeliveryLimit(c.deliveryLimit != null ? String(c.deliveryLimit) : '')

      // Conversion goals
      const goals = (c.conversionGoals as ConversionGoal[] | undefined) ?? []
      setConversionGoals(goals.length > 0 ? goals : [{ name: 'Goal 1', eventName: '' }])

      // Schedule
      if (c.scheduledAt) {
        const d = new Date(c.scheduledAt)
        setScheduledDate(d.toISOString().slice(0, 10))
        setScheduledTime(d.toISOString().slice(11, 16))
      }

      // Periodic schedule
      const ps = c.periodicSchedule as PeriodicSchedule | null
      if (ps) {
        setPeriodicFrequency(ps.frequency ?? 'daily')
        setPeriodicDayOfWeek(ps.dayOfWeek ?? 1)
        setPeriodicDayOfMonth(ps.dayOfMonth ?? 1)
        setPeriodicTime(ps.time ?? '09:00')
        setPeriodicEndsAt(ps.endsAt ?? '')
      }

      // A/B testing
      setAbTestEnabled(c.abTestEnabled ?? false)
      setAbSplitPct(c.abSplitPct ?? 50)
      setAbVariantBSubject(c.abVariantBSubject ?? '')
      setAbVariantBHtmlBody(c.abVariantBHtmlBody ?? '')
      setAbVariantBBodyText(c.abVariantBBodyText ?? '')
      setAbWinnerMetric(c.abWinnerMetric ?? 'open_rate')
      setAbAutoSendWinner(c.abAutoSendWinner ?? false)
      setAbTestDurationHours(c.abTestDurationHours ?? 4)
    }
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    )
  }

  if (isError || !data?.data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 text-sm">Campaign not found.</p>
      </div>
    )
  }

  const campaign = data.data
  const isEmail = campaign.channel === 'email'
  const isPeriodic = campaign.deliveryType === 'periodic'

  if (!['draft', 'scheduled'].includes(campaign.status)) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-text-secondary">Only draft or scheduled campaigns can be edited.</p>
        <button
          onClick={() => router.push(`/campaigns/${id}`)}
          className="mt-4 px-4 py-2 text-sm font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors"
        >
          Back to Campaign
        </button>
      </div>
    )
  }

  const canSave = name.trim() && (isEmail ? subject.trim() && htmlBody.trim() : bodyText.trim())

  const handleSave = () => {
    const goals = conversionGoals.filter(g => g.eventName.trim())

    const periodicSchedule: PeriodicSchedule | null = isPeriodic ? {
      frequency: periodicFrequency,
      ...(periodicFrequency === 'weekly' ? { dayOfWeek: periodicDayOfWeek } : {}),
      ...(periodicFrequency === 'monthly' ? { dayOfMonth: periodicDayOfMonth } : {}),
      time: periodicTime,
      ...(periodicEndsAt ? { endsAt: periodicEndsAt } : {}),
    } : null

    updateCampaign.mutate(
      {
        id,
        name,
        subject: isEmail ? subject : undefined,
        htmlBody: isEmail ? htmlBody : undefined,
        previewText: isEmail ? previewText || null : undefined,
        bodyText: !isEmail ? bodyText : undefined,
        fromName: fromName || null,
        segmentId: segmentId || null,
        conversionGoals: goals,
        goalTrackingHours,
        deliveryLimit: deliveryLimit ? parseInt(deliveryLimit) : null,
        periodicSchedule,
        scheduledAt: !isPeriodic && scheduledDate && scheduledTime
          ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
          : !isPeriodic ? null : undefined,
        // A/B Testing
        abTestEnabled,
        abSplitPct: abTestEnabled ? abSplitPct : undefined,
        abVariantBSubject: abTestEnabled && isEmail ? abVariantBSubject || null : undefined,
        abVariantBHtmlBody: abTestEnabled && isEmail ? abVariantBHtmlBody || null : undefined,
        abVariantBBodyText: abTestEnabled && !isEmail ? abVariantBBodyText || null : undefined,
        abWinnerMetric: abTestEnabled ? abWinnerMetric : undefined,
        abAutoSendWinner: abTestEnabled ? abAutoSendWinner : undefined,
        abTestDurationHours: abTestEnabled ? abTestDurationHours : undefined,
      },
      { onSuccess: () => router.push(`/campaigns/${id}`) },
    )
  }

  const addGoal = () => setConversionGoals([...conversionGoals, { name: `Goal ${conversionGoals.length + 1}`, eventName: '' }])
  const removeGoal = (idx: number) => setConversionGoals(conversionGoals.filter((_, i) => i !== idx))
  const updateGoal = (idx: number, field: keyof ConversionGoal, value: string) => {
    setConversionGoals(conversionGoals.map((g, i) => i === idx ? { ...g, [field]: value } : g))
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/campaigns/${id}`)} className="p-2 rounded-lg border border-border hover:bg-surface transition-colors">
            <ArrowLeft className="h-4 w-4 text-text-secondary" />
          </button>
          <div>
            <p className="text-xs text-text-muted">Campaigns &gt; {campaign.name} &gt; Edit</p>
            <h1 className="text-lg font-semibold text-heading mt-0.5">Edit Campaign</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/campaigns/${id}`)} className="px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || updateCampaign.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateCampaign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left: Content */}
        <div className="space-y-6 min-w-0">
          {/* Campaign Name */}
          <div className="bg-white border border-border rounded-xl p-5">
            <label className="block text-sm font-medium text-text-primary mb-1.5">Campaign Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </div>

          {/* Email Content */}
          {isEmail ? (
            <>
              <div className="bg-white border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
                  <Mail className="h-4 w-4 text-text-muted" />
                  <h2 className="text-sm font-semibold text-text-primary">Email Details</h2>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Subject<span className="text-red-400">*</span></label>
                    <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line..." className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">Preview Text</label>
                    <input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Inbox preview text..." className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">From Name</label>
                    <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Sender name..." className={inputClass} />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
                  <h2 className="text-sm font-semibold text-text-primary">Email Body</h2>
                  <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-0.5">
                    <button onClick={() => setTab('edit')} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-colors', tab === 'edit' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}>
                      Edit HTML
                    </button>
                    <button onClick={() => setTab('preview')} className={cn('inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors', tab === 'preview' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}>
                      <Eye className="h-3 w-3" /> Preview
                    </button>
                  </div>
                </div>
                {tab === 'edit' ? (
                  <div className="p-5">
                    <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={16}
                      className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" spellCheck={false} />
                    <p className="text-xs text-text-muted mt-2">Variables: {'{{customer_name}}'}, {'{{customer_email}}'}, {'{{store_name}}'}</p>
                  </div>
                ) : (
                  <div className="p-5">
                    <div className="border border-border rounded-lg overflow-hidden">
                      <iframe srcDoc={htmlBody} title="Preview" className="w-full h-[400px]" sandbox="allow-same-origin" />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* SMS/Push Content */
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
                <Mail className="h-4 w-4 text-text-muted" />
                <h2 className="text-sm font-semibold text-text-primary">{campaign.channel === 'sms' ? 'SMS' : 'Push'} Message</h2>
              </div>
              <div className="p-5">
                <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={6}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
              </div>
            </div>
          )}

          {/* A/B Testing */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-purple-500" />
                <h2 className="text-sm font-semibold text-text-primary">A/B Testing</h2>
              </div>
              <button
                onClick={() => setAbTestEnabled(!abTestEnabled)}
                className={cn('relative w-10 h-5 rounded-full transition-colors', abTestEnabled ? 'bg-purple-500' : 'bg-gray-200')}
              >
                <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', abTestEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
            </div>

            {abTestEnabled && (
              <div className="p-5 space-y-5">
                {/* Split ratio */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-2">Traffic Split</label>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-blue-600">Variant A — {abSplitPct}%</span>
                    <span className="text-xs font-semibold text-purple-600">Variant B — {100 - abSplitPct}%</span>
                  </div>
                  <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-blue-400 rounded-l-full" style={{ width: `${abSplitPct}%` }} />
                    <div className="absolute inset-y-0 right-0 bg-purple-400 rounded-r-full" style={{ width: `${100 - abSplitPct}%` }} />
                  </div>
                  <input type="range" min={10} max={90} step={5} value={abSplitPct} onChange={e => setAbSplitPct(parseInt(e.target.value))} className="w-full mt-1 accent-purple-500" />
                </div>

                {/* Variant B content */}
                <div className="p-4 bg-purple-50/50 rounded-lg border border-purple-100">
                  <div className="flex items-center gap-2 mb-3">
                    <SplitSquareHorizontal className="h-4 w-4 text-purple-500" />
                    <h3 className="text-sm font-semibold text-text-primary">Variant B Content</h3>
                  </div>
                  {isEmail ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Subject Line (B)</label>
                        <input value={abVariantBSubject} onChange={e => setAbVariantBSubject(e.target.value)} placeholder="Alternative subject..." className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">HTML Body (B)</label>
                        <textarea value={abVariantBHtmlBody} onChange={e => setAbVariantBHtmlBody(e.target.value)} rows={6}
                          className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-300/50 resize-none" spellCheck={false} />
                        <p className="text-xs text-text-muted mt-1">Leave empty to only test the subject line</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Message Body (B)</label>
                      <textarea value={abVariantBBodyText} onChange={e => setAbVariantBBodyText(e.target.value)} rows={4}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-300/50 resize-none" />
                    </div>
                  )}
                </div>

                {/* Winner config */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Winner Metric</label>
                    <select value={abWinnerMetric} onChange={e => setAbWinnerMetric(e.target.value)} className={selectClass}>
                      <option value="open_rate">Open Rate</option>
                      <option value="click_rate">Click Rate</option>
                      <option value="conversion_rate">Conversion Rate</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Test Duration</label>
                    <div className="flex items-center gap-2">
                      <input type="number" value={abTestDurationHours} onChange={e => setAbTestDurationHours(parseInt(e.target.value) || 4)} min={1} max={72}
                        className="w-20 h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30" />
                      <span className="text-xs text-text-secondary">hours</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Auto-send winner</label>
                    <button onClick={() => setAbAutoSendWinner(!abAutoSendWinner)}
                      className={cn('relative w-10 h-5 rounded-full transition-colors mt-2', abAutoSendWinner ? 'bg-accent' : 'bg-gray-200')}>
                      <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', abAutoSendWinner ? 'translate-x-5' : 'translate-x-0.5')} />
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2">
                  <Trophy className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-purple-700">
                    <strong>{abSplitPct}%</strong> Variant A, <strong>{100 - abSplitPct}%</strong> Variant B.
                    Winner by <strong>{abWinnerMetric.replace(/_/g, ' ')}</strong> after <strong>{abTestDurationHours}h</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Audience */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Users className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Audience</h2>
            </div>
            <div className="p-5">
              <select value={segmentId} onChange={e => setSegmentId(e.target.value)} className={selectClass}>
                <option value="">All users (no segment)</option>
                {segments.map(s => <option key={s.id} value={s.id}>{s.name} ({s.memberCount.toLocaleString()})</option>)}
              </select>
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              {isPeriodic ? <CalendarClock className="h-4 w-4 text-blue-600" /> : <Clock className="h-4 w-4 text-text-muted" />}
              <h2 className="text-sm font-semibold text-text-primary">{isPeriodic ? 'Recurring Schedule' : 'Schedule'}</h2>
            </div>
            <div className="p-5 space-y-3">
              {isPeriodic ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Frequency</label>
                    <div className="flex gap-2">
                      {(['daily', 'weekly', 'monthly'] as const).map(f => (
                        <button key={f} onClick={() => setPeriodicFrequency(f)}
                          className={cn('px-3 py-1.5 text-xs font-medium rounded-lg border transition-all capitalize',
                            periodicFrequency === f ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:border-gray-300')}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  {periodicFrequency === 'weekly' && (
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Day</label>
                      <select value={periodicDayOfWeek} onChange={e => setPeriodicDayOfWeek(parseInt(e.target.value))} className={selectClass}>
                        {DAYS_OF_WEEK.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}
                  {periodicFrequency === 'monthly' && (
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Day of month</label>
                      <select value={periodicDayOfMonth} onChange={e => setPeriodicDayOfMonth(parseInt(e.target.value))} className={selectClass}>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Send time</label>
                    <input type="time" value={periodicTime} onChange={e => setPeriodicTime(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">End date (optional)</label>
                    <input type="date" value={periodicEndsAt} onChange={e => setPeriodicEndsAt(e.target.value)} className={inputClass} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Date</label>
                    <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Time</label>
                    <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className={inputClass} />
                  </div>
                  <p className="text-[10px] text-text-muted">Leave empty for manual send. Setting both saves as scheduled.</p>
                </>
              )}
            </div>
          </div>

          {/* Conversion Goals */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Target className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Conversion Goals</h2>
            </div>
            <div className="p-5 space-y-3">
              {conversionGoals.map((goal, idx) => (
                <div key={idx} className="p-3 bg-surface rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Goal {idx + 1}</span>
                    {conversionGoals.length > 1 && (
                      <button onClick={() => removeGoal(idx)} className="text-text-muted hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                  <input value={goal.name} onChange={e => updateGoal(idx, 'name', e.target.value)} placeholder="Goal name" className={cn(inputClass, 'mb-2 h-8 text-xs')} />
                  <select value={goal.eventName} onChange={e => updateGoal(idx, 'eventName', e.target.value)} className={cn(selectClass, 'h-8 text-xs')}>
                    <option value="">Select event...</option>
                    {EVENT_OPTIONS.map(ev => <option key={ev} value={ev}>{ev.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              ))}
              <button onClick={addGoal} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover">
                <Plus className="h-3 w-3" /> Add goal
              </button>
              <div className="pt-3 border-t border-border flex items-center gap-2">
                <span className="text-[10px] text-text-secondary">Track for</span>
                <input type="number" value={goalTrackingHours} onChange={e => setGoalTrackingHours(parseInt(e.target.value) || 36)}
                  className="w-14 h-7 px-2 text-xs text-center border border-border rounded bg-white" />
                <span className="text-[10px] text-text-secondary">hours</span>
              </div>
            </div>
          </div>

          {/* Delivery Controls */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Settings2 className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Delivery</h2>
            </div>
            <div className="p-5">
              <label className="block text-xs font-medium text-text-secondary mb-1">Rate limit (per minute)</label>
              <input type="number" value={deliveryLimit} onChange={e => setDeliveryLimit(e.target.value)} placeholder="No limit" className={inputClass} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
