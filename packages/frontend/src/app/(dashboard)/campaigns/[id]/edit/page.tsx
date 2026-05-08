'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCampaignDetail, usePreviewCampaignAudience, useUpdateCampaign, type CampaignAttachmentUpload, type CampaignAudiencePreview } from '@/hooks/useCampaigns'
import { useSegments } from '@/hooks/useSegments'
import { usePreviewTemplate } from '@/hooks/useTemplates'
import { useCustomers } from '@/hooks/useCustomers'
import { useSubscriptionCategories } from '@/hooks/useSubscriptionCategories'
import { useEmailSenders } from '@/hooks/useEmailSenders'
import {
  useRefreshTemplateStatus,
  useSubmitWhatsappTemplate,
  useSyncWhatsappTemplates,
  useWhatsappProviderStatus,
  useWhatsappTemplates,
  type SubmitInput,
} from '@/hooks/useWhatsappTemplates'
import { CampaignAiCopywriter } from '@/components/campaigns/CampaignAiCopywriter'
import { SegmentFilterBuilder } from '@/components/segments/SegmentFilterBuilder'
import { VariablePanel } from '@/components/templates/VariablePanel'
import { EmailBuilder } from '@/components/email-builder/EmailBuilder'
import { compileToHtml } from '@/lib/emailCompiler'
import { DEFAULT_TEMPLATE, generateBlockId } from '@/lib/emailTypes'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import type { EmailTemplate } from '@/lib/emailTypes'
import type { CampaignAttachment, CampaignChannel, CampaignSendTimeMode, CampaignUtmParameter, CampaignUtmParameters, ConversionGoal, FilterConfig, GmailAnnotation, PeriodicSchedule, TemplateVariable } from '@storees/shared'
import {
  ArrowLeft,
  Mail,
  MessageSquare,
  Bell,
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
  ShieldCheck,
  Paperclip,
  Trash2,
  Upload,
  Monitor,
  Smartphone,
  Moon,
  Sun,
  Link2,
  RefreshCw,
  Send,
} from 'lucide-react'

const inputClass = 'w-full h-10 px-3.5 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/60 transition-colors duration-150'
const selectClass = cn(inputClass, 'appearance-none cursor-pointer pr-10 bg-[length:16px] bg-[right_12px_center] bg-no-repeat bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")]')

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const EVENT_OPTIONS = ['order_completed', 'product_viewed', 'added_to_cart', 'checkout_started', 'page_viewed', 'app_opened', 'signed_up']
const TIMEZONE_OPTIONS = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney']
type DraftAttachment = CampaignAttachmentUpload & { localId: string }
type PreviewDevice = 'desktop' | 'mobile'
type PreviewTheme = 'light' | 'dark'
type EmailEditorMode = 'visual' | 'html' | 'preview'
type ValidationIssue = { severity?: string; message?: string; key?: string; code?: string }

type WhatsappTemplateForEdit = {
  id: string
  parameterCount: number
  header: { type?: string; format?: string } | null
  buttons: Array<{ type: string; text: string; url?: string; phone?: string }> | null
}

function seedWhatsappTemplateVariables(template: WhatsappTemplateForEdit): TemplateVariable[] {
  const vars: TemplateVariable[] = Array.from({ length: template.parameterCount ?? 0 }, (_, idx) => ({
    key: String(idx + 1),
    source: { kind: 'customer', field: idx === 0 ? 'name' : 'city' },
    defaultValue: idx === 0 ? 'there' : '',
  }))
  const headerType = (template.header?.format ?? template.header?.type ?? '').toUpperCase()
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
    vars.push({ key: 'wa_header_media_url', source: { kind: 'literal', value: '' } })
  }
  const urlButtons = template.buttons?.filter(button => button.type?.toUpperCase() === 'URL') ?? []
  urlButtons.forEach((_button, idx) => {
    vars.push({ key: `wa_button_url_${idx + 1}`, source: { kind: 'literal', value: '' } })
  })
  return vars
}

function countWhatsappTemplateParameters(body: string): number {
  const matches = Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(match => Number(match[1]))
  return matches.length > 0 ? Math.max(...matches) : 0
}

function whatsappSampleValue(idx: number): string {
  return ['Wahab', 'ORD-1001', 'Storees', '20%'][idx] ?? `sample ${idx + 1}`
}

function getApiIssues(error: unknown): ValidationIssue[] {
  if (!(error instanceof ApiError)) return []
  const payload = error.payload as { issues?: ValidationIssue[] } | undefined
  return Array.isArray(payload?.issues) ? payload.issues : []
}

function splitEmails(value: string): string[] {
  return value.split(',').map(v => v.trim()).filter(Boolean)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileToAttachment(file: File): Promise<DraftAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.onload = () => resolve({
      localId: `${file.name}-${file.size}-${file.lastModified}`,
      filename: file.name,
      mime: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      contentBase64: String(reader.result ?? ''),
    })
    reader.readAsDataURL(file)
  })
}

function emailPreviewSrcDoc(html: string, theme: PreviewTheme): string {
  if (theme === 'light') return html
  return `
    <style>
      :root { color-scheme: dark; }
      html, body { background: #111827 !important; }
      body { filter: invert(1) hue-rotate(180deg); }
      img, picture, video { filter: invert(1) hue-rotate(180deg); }
    </style>
    ${html}
  `
}

function buildUtmParameters(input: {
  enabled: boolean
  source: string
  medium: string
  campaign: string
  custom: CampaignUtmParameter[]
}): CampaignUtmParameters | null {
  if (!input.enabled) return null
  const params = [
    { key: 'utm_source', value: input.source },
    { key: 'utm_medium', value: input.medium },
    { key: 'utm_campaign', value: input.campaign },
    ...input.custom,
  ].map(p => ({ key: p.key.trim(), value: p.value.trim() })).filter(p => p.key && p.value)
  return params.length > 0 ? { enabled: true, params } : null
}

function emailTemplateFromHtml(subject: string, previewText: string, htmlBody: string): EmailTemplate {
  const body = htmlBody.trim()
  return {
    ...DEFAULT_TEMPLATE,
    subject,
    previewText,
    blocks: [
      {
        id: generateBlockId(),
        type: 'text',
        props: {
          html: body || '<p>Write your campaign message here.</p>',
          align: 'left',
          color: '#374151',
          fontSize: 16,
        },
      },
    ],
    globalStyles: { ...DEFAULT_TEMPLATE.globalStyles },
  }
}

function isEmailTemplate(value: unknown): value is EmailTemplate {
  if (!value || typeof value !== 'object') return false
  const template = value as Partial<EmailTemplate>
  return Array.isArray(template.blocks)
    && !!template.globalStyles
    && typeof template.globalStyles === 'object'
}

export default function EditCampaignPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const { data, isLoading, isError } = useCampaignDetail(id)
  const { data: segmentsData } = useSegments()
  const { data: subscriptionCategoriesData } = useSubscriptionCategories()
  const { data: sendersData } = useEmailSenders()
  const { data: whatsappTemplatesData } = useWhatsappTemplates()
  const whatsappProviderStatus = useWhatsappProviderStatus()
  const syncWhatsappTemplates = useSyncWhatsappTemplates()
  const submitWhatsappTemplate = useSubmitWhatsappTemplate()
  const refreshWhatsappTemplateStatus = useRefreshTemplateStatus()
  const previewAudience = usePreviewCampaignAudience()
  const customers = useCustomers({ page: 1, pageSize: 20, sortBy: 'lastSeen', sortOrder: 'desc' })
  const renderedPreview = usePreviewTemplate()
  const updateCampaign = useUpdateCampaign()

  // Basic fields
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [showWhatsappTemplateForm, setShowWhatsappTemplateForm] = useState(false)
  const [draftWhatsappTemplate, setDraftWhatsappTemplate] = useState<SubmitInput>({
    name: '',
    language: 'en_US',
    category: 'MARKETING',
    bodyText: '',
    footer: '',
  })
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [replyToEmail, setReplyToEmail] = useState('')
  const [ccEmails, setCcEmails] = useState('')
  const [bccEmails, setBccEmails] = useState('')
  const [existingAttachments, setExistingAttachments] = useState<CampaignAttachment[]>([])
  const [newAttachments, setNewAttachments] = useState<DraftAttachment[]>([])
  const [deleteAttachmentIds, setDeleteAttachmentIds] = useState<string[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [gmailAnnotationEnabled, setGmailAnnotationEnabled] = useState(false)
  const [gmailImageUrl, setGmailImageUrl] = useState('')
  const [gmailDealText, setGmailDealText] = useState('')
  const [gmailDescription, setGmailDescription] = useState('')
  const [gmailOfferCode, setGmailOfferCode] = useState('')
  const [gmailStartsAt, setGmailStartsAt] = useState('')
  const [gmailExpiresAt, setGmailExpiresAt] = useState('')
  const [utmEnabled, setUtmEnabled] = useState(false)
  const [utmSource, setUtmSource] = useState('storees')
  const [utmMedium, setUtmMedium] = useState('email')
  const [utmCampaign, setUtmCampaign] = useState('{{campaign_name}}')
  const [utmCustomParams, setUtmCustomParams] = useState<CampaignUtmParameter[]>([])
  const [segmentId, setSegmentId] = useState('')
  const [audienceMode, setAudienceMode] = useState<'all' | 'segment' | 'filter'>('all')
  const [audienceFilter, setAudienceFilter] = useState<FilterConfig>({ logic: 'AND', rules: [] })
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [emailEditorMode, setEmailEditorMode] = useState<EmailEditorMode>('html')
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('light')
  const [sampleCustomerId, setSampleCustomerId] = useState('')
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [subscriptionCategoryIds, setSubscriptionCategoryIds] = useState<string[]>([])
  const [excludeAudienceFilter, setExcludeAudienceFilter] = useState<FilterConfig>({ logic: 'AND', rules: [] })
  const [audienceCapEnabled, setAudienceCapEnabled] = useState(false)
  const [audienceCap, setAudienceCap] = useState('')
  const [controlGroupEnabled, setControlGroupEnabled] = useState(false)
  const [controlGroupPct, setControlGroupPct] = useState(10)
  const [audiencePreview, setAudiencePreview] = useState<CampaignAudiencePreview | null>(null)

  // Schedule
  const [sendTimeMode, setSendTimeMode] = useState<CampaignSendTimeMode>('asap')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [scheduleTimezone, setScheduleTimezone] = useState('Asia/Kolkata')

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
  const [ignoreFreqCapping, setIgnoreFreqCapping] = useState(false)
  const [countForFreqCapping, setCountForFreqCapping] = useState(true)

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
      const storedEmailTemplate = isEmailTemplate(c.emailBuilderTemplate) ? c.emailBuilderTemplate : null
      setEmailTemplate(storedEmailTemplate ?? emailTemplateFromHtml(c.subject ?? '', c.previewText ?? '', c.htmlBody ?? ''))
      setEmailEditorMode(storedEmailTemplate ? 'visual' : 'html')
      setBodyText(c.bodyText ?? '')
      setTemplateId(c.templateId ?? null)
      setFromName(c.fromName ?? '')
      setFromEmail(c.fromEmail ?? '')
      setReplyToEmail(c.replyToEmail ?? '')
      setCcEmails((c.ccEmails ?? []).join(', '))
      setBccEmails((c.bccEmails ?? []).join(', '))
      setExistingAttachments(c.attachments ?? [])
      setNewAttachments([])
      setDeleteAttachmentIds([])
      setAttachmentError(null)
      const annotation = c.gmailAnnotation
      setGmailAnnotationEnabled(annotation?.enabled ?? false)
      setGmailImageUrl(annotation?.imageUrl ?? '')
      setGmailDealText(annotation?.dealText ?? '')
      setGmailDescription(annotation?.description ?? '')
      setGmailOfferCode(annotation?.offerCode ?? '')
      setGmailStartsAt(annotation?.startsAt ? annotation.startsAt.slice(0, 16) : '')
      setGmailExpiresAt(annotation?.expiresAt ? annotation.expiresAt.slice(0, 16) : '')
      const utm = c.utmParameters
      const params = utm?.params ?? []
      const findUtm = (key: string, fallback: string) => params.find(p => p.key === key)?.value ?? fallback
      setUtmEnabled(utm?.enabled ?? false)
      setUtmSource(findUtm('utm_source', 'storees'))
      setUtmMedium(findUtm('utm_medium', c.channel))
      setUtmCampaign(findUtm('utm_campaign', '{{campaign_name}}'))
      setUtmCustomParams(params.filter(p => !['utm_source', 'utm_medium', 'utm_campaign'].includes(p.key)))
      setSegmentId(c.segmentId ?? '')
      setAudienceFilter(c.audienceFilter ?? { logic: 'AND', rules: [] })
      setAudienceMode((c.audienceFilter?.rules?.length ?? 0) > 0 ? 'filter' : c.segmentId ? 'segment' : 'all')
      const existingVariables = c.variables ?? []
      const selectedWaTemplate = (whatsappTemplatesData?.data ?? []).find(t => t.id === c.templateId)
      setVariables(existingVariables.length > 0 ? existingVariables : selectedWaTemplate ? seedWhatsappTemplateVariables(selectedWaTemplate) : [])
      setSubscriptionCategoryIds(c.subscriptionCategoryIds ?? [])
      setExcludeAudienceFilter(c.excludeAudienceFilter ?? { logic: 'AND', rules: [] })
      setAudienceCapEnabled(c.audienceCap != null)
      setAudienceCap(c.audienceCap != null ? String(c.audienceCap) : '')
      setControlGroupEnabled((c.controlGroupPct ?? 0) > 0)
      setControlGroupPct(c.controlGroupPct ?? 10)
      setAudiencePreview(null)
      setGoalTrackingHours(c.goalTrackingHours ?? 36)
      setDeliveryLimit(c.deliveryLimit != null ? String(c.deliveryLimit) : '')
      setIgnoreFreqCapping(c.ignoreFrequencyCap ?? false)
      setCountForFreqCapping(c.countForFrequencyCap ?? true)

      // Conversion goals
      const goals = (c.conversionGoals as ConversionGoal[] | undefined) ?? []
      setConversionGoals(goals.length > 0 ? goals : [{ name: 'Goal 1', eventName: '' }])

      // Schedule
      setSendTimeMode(c.sendTimeMode ?? (c.scheduledAt ? 'fixed' : 'asap'))
      setScheduleTimezone(c.scheduleTimezone ?? 'Asia/Kolkata')
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
  }, [data, whatsappTemplatesData])

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
  const isWhatsapp = campaign.channel === 'whatsapp'
  const isPeriodic = campaign.deliveryType === 'periodic'
  const supportsLinkTracking = campaign.channel !== 'whatsapp'
  const subscriptionCategories = (subscriptionCategoriesData?.data ?? [])
    .filter(c => c.channel == null || c.channel === campaign.channel)
  const verifiedSenders = (sendersData?.data ?? []).filter(sender => !!sender.verifiedAt)
  const approvedWhatsappTemplates = (whatsappTemplatesData?.data ?? []).filter(t => t.status === 'APPROVED')
  const pendingWhatsappTemplates = (whatsappTemplatesData?.data ?? []).filter(t => t.status !== 'APPROVED')
  const selectedWhatsappTemplate = approvedWhatsappTemplates.find(t => t.id === templateId) ?? null
  const selectedWhatsappHeaderType = (selectedWhatsappTemplate?.header?.format ?? selectedWhatsappTemplate?.header?.type ?? '').toUpperCase()
  const selectedWhatsappMediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedWhatsappHeaderType)
  const selectedWhatsappUrlButtons = selectedWhatsappTemplate?.buttons?.filter(b => b.type?.toUpperCase() === 'URL') ?? []
  const whatsappProvider = whatsappProviderStatus.data?.data
  const canSubmitWhatsappTemplate = !!whatsappProvider?.configured && !!whatsappProvider.capabilities.submitTemplate
  const draftWhatsappParamCount = countWhatsappTemplateParameters(draftWhatsappTemplate.bodyText)
  const sampleCustomers = customers.data?.data ?? []
  const rendered = renderedPreview.data?.data.rendered
  const previewHtml = rendered?.htmlBody ?? htmlBody
  const previewSubject = rendered?.subject ?? subject
  const previewBody = rendered?.bodyText ?? bodyText
  const saveValidationIssues = getApiIssues(updateCampaign.error)

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

  const canSave = name.trim() && (isEmail ? subject.trim() && htmlBody.trim() : isWhatsapp ? templateId && bodyText.trim() : bodyText.trim())
  const submitWhatsappTemplateForApproval = () => {
    submitWhatsappTemplate.mutate({
      ...draftWhatsappTemplate,
      bodyExample: draftWhatsappParamCount > 0
        ? Array.from({ length: draftWhatsappParamCount }, (_, idx) => draftWhatsappTemplate.bodyExample?.[idx]?.trim() || whatsappSampleValue(idx))
        : undefined,
    }, {
      onSuccess: () => {
        setShowWhatsappTemplateForm(false)
        setDraftWhatsappTemplate({
          name: '',
          language: 'en_US',
          category: 'MARKETING',
          bodyText: '',
          footer: '',
        })
      },
    })
  }
  const buildAiGoal = (channel: CampaignChannel) => [
    `Rewrite copy for an existing ${channel} campaign.`,
    `Campaign name: ${name || campaign.name}`,
    previewText && `Preview text: ${previewText}`,
    audienceMode === 'segment' && segmentId && `Audience segment: ${segments.find(s => s.id === segmentId)?.name ?? segmentId}`,
    audienceMode === 'filter' && 'Audience is built from inline filters.',
    subscriptionCategoryIds.length > 0 && `Subscription categories selected: ${subscriptionCategoryIds.length}`,
    controlGroupEnabled && `Control group: ${controlGroupPct}% holdout`,
    utmEnabled && `UTM tracking enabled with source ${utmSource}, medium ${utmMedium}, campaign ${utmCampaign}.`,
    conversionGoals.some(goal => goal.eventName.trim()) && `Conversion goals: ${conversionGoals.map(goal => goal.eventName).filter(Boolean).join(', ')}`,
    'Preserve valid {{variable}} placeholders and do not invent fields.',
  ].filter(Boolean).join('\n')

  const handleSave = () => {
    const goals = conversionGoals.filter(g => g.eventName.trim())

    const periodicSchedule: PeriodicSchedule | null = isPeriodic ? {
      frequency: periodicFrequency,
      ...(periodicFrequency === 'weekly' ? { dayOfWeek: periodicDayOfWeek } : {}),
      ...(periodicFrequency === 'monthly' ? { dayOfMonth: periodicDayOfMonth } : {}),
      time: periodicTime,
      ...(periodicEndsAt ? { endsAt: periodicEndsAt } : {}),
    } : null
    const gmailAnnotation: GmailAnnotation | null = gmailAnnotationEnabled ? {
      enabled: true,
      imageUrl: gmailImageUrl || undefined,
      dealText: gmailDealText || undefined,
      description: gmailDescription || undefined,
      offerCode: gmailOfferCode || undefined,
      startsAt: gmailStartsAt ? new Date(gmailStartsAt).toISOString() : undefined,
      expiresAt: gmailExpiresAt ? new Date(gmailExpiresAt).toISOString() : undefined,
    } : null
    const utmParameters: CampaignUtmParameters | null = supportsLinkTracking ? buildUtmParameters({
      enabled: utmEnabled,
      source: utmSource,
      medium: utmMedium,
      campaign: utmCampaign,
      custom: utmCustomParams,
    }) : null

    updateCampaign.mutate(
      {
        id,
        name,
        subject: isEmail || campaign.channel === 'push' ? subject : undefined,
        htmlBody: isEmail ? htmlBody : undefined,
        emailBuilderTemplate: isEmail ? { ...emailTemplate, subject, previewText } : undefined,
        previewText: isEmail || campaign.channel === 'push' ? previewText || null : undefined,
        templateId: isWhatsapp ? templateId : undefined,
        bodyText: !isEmail ? bodyText : undefined,
        fromName: fromName || null,
        fromEmail: isEmail ? fromEmail || null : undefined,
        replyToEmail: isEmail ? replyToEmail || null : undefined,
        ccEmails: isEmail ? splitEmails(ccEmails) : undefined,
        bccEmails: isEmail ? splitEmails(bccEmails) : undefined,
        gmailAnnotation: isEmail ? gmailAnnotation : undefined,
        utmParameters: supportsLinkTracking ? utmParameters : undefined,
        attachmentUploads: isEmail ? newAttachments.map(attachment => ({
          filename: attachment.filename,
          mime: attachment.mime,
          sizeBytes: attachment.sizeBytes,
          contentBase64: attachment.contentBase64,
        })) : undefined,
        deleteAttachmentIds: isEmail ? deleteAttachmentIds : undefined,
        segmentId: audienceMode === 'segment' ? segmentId || null : null,
        audienceFilter: audienceMode === 'filter' && audienceFilter.rules.length > 0 ? audienceFilter : null,
        excludeAudienceFilter: excludeAudienceFilter.rules.length > 0 ? excludeAudienceFilter : null,
        audienceCap: audienceCapEnabled && audienceCap ? parseInt(audienceCap) : null,
        controlGroupPct: controlGroupEnabled ? controlGroupPct : 0,
        subscriptionCategoryIds,
        conversionGoals: goals,
        goalTrackingHours,
        deliveryLimit: deliveryLimit ? parseInt(deliveryLimit) : null,
        ignoreFrequencyCap: ignoreFreqCapping,
        countForFrequencyCap: countForFreqCapping,
        sendTimeMode,
        scheduleTimezone: sendTimeMode !== 'asap' ? scheduleTimezone : null,
        periodicSchedule,
        scheduledAt: !isPeriodic && sendTimeMode !== 'asap' && scheduledDate && scheduledTime
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
        variables,
      },
      { onSuccess: () => router.push(`/campaigns/${id}`) },
    )
  }

  const addGoal = () => setConversionGoals([...conversionGoals, { name: `Goal ${conversionGoals.length + 1}`, eventName: '' }])
  const removeGoal = (idx: number) => setConversionGoals(conversionGoals.filter((_, i) => i !== idx))
  const updateGoal = (idx: number, field: keyof ConversionGoal, value: string) => {
    setConversionGoals(conversionGoals.map((g, i) => i === idx ? { ...g, [field]: value } : g))
  }
  const addGoalAttribute = (idx: number) => {
    setConversionGoals(conversionGoals.map((goal, goalIdx) => {
      if (goalIdx !== idx) return goal
      const attrs = { ...(goal.attributes ?? {}) }
      let key = 'property_1'
      let n = 1
      while (key in attrs) {
        n += 1
        key = `property_${n}`
      }
      return { ...goal, attributes: { ...attrs, [key]: '' } }
    }))
  }
  const updateGoalAttribute = (idx: number, oldKey: string, nextKey: string, value: string) => {
    setConversionGoals(conversionGoals.map((goal, goalIdx) => {
      if (goalIdx !== idx) return goal
      const attrs = { ...(goal.attributes ?? {}) }
      delete attrs[oldKey]
      return { ...goal, attributes: { ...attrs, [nextKey.trim() || oldKey]: value } }
    }))
  }
  const removeGoalAttribute = (idx: number, key: string) => {
    setConversionGoals(conversionGoals.map((goal, goalIdx) => {
      if (goalIdx !== idx) return goal
      const attrs = { ...(goal.attributes ?? {}) }
      delete attrs[key]
      return { ...goal, attributes: Object.keys(attrs).length > 0 ? attrs : undefined }
    }))
  }
  const toggleSubscriptionCategory = (categoryId: string) => {
    setSubscriptionCategoryIds(
      subscriptionCategoryIds.includes(categoryId)
        ? subscriptionCategoryIds.filter(id => id !== categoryId)
        : [...subscriptionCategoryIds, categoryId],
    )
  }
  const runAudiencePreview = () => {
    previewAudience.mutate(
      {
        channel: campaign.channel,
        templateId: campaign.channel === 'whatsapp' ? templateId : undefined,
        segmentId: audienceMode === 'segment' ? segmentId || null : null,
        audienceFilter: audienceMode === 'filter' && audienceFilter.rules.length > 0 ? audienceFilter : null,
        excludeAudienceFilter: excludeAudienceFilter.rules.length > 0 ? excludeAudienceFilter : null,
        audienceCap: audienceCapEnabled && audienceCap ? parseInt(audienceCap) : null,
        controlGroupPct: controlGroupEnabled ? controlGroupPct : 0,
        subscriptionCategoryIds,
      },
      { onSuccess: res => setAudiencePreview(res.data ?? null) },
    )
  }
  const addAttachments = async (files: FileList | null) => {
    if (!files?.length) return
    setAttachmentError(null)
    const next: DraftAttachment[] = []
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) {
        setAttachmentError(`${file.name} is larger than 25MB`)
        continue
      }
      next.push(await fileToAttachment(file))
    }
    if (next.length > 0) setNewAttachments([...newAttachments, ...next])
  }
  const removeExistingAttachment = (attachmentId: string) => {
    setDeleteAttachmentIds([...deleteAttachmentIds, attachmentId])
    setExistingAttachments(existingAttachments.filter(attachment => attachment.id !== attachmentId))
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">From email</label>
                      {verifiedSenders.length > 0 ? (
                        <select value={fromEmail} onChange={e => setFromEmail(e.target.value)} className={inputClass}>
                          <option value="">Use project default sender</option>
                          {verifiedSenders.map(sender => (
                            <option key={sender.id} value={sender.address}>
                              {sender.displayName ? `${sender.displayName} <${sender.address}>` : sender.address}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="Uses project/shared default until a domain is verified" className={inputClass} />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Reply-to email</label>
                      <input value={replyToEmail} onChange={e => setReplyToEmail(e.target.value)} placeholder="Same as from email" className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Cc</label>
                      <input value={ccEmails} onChange={e => setCcEmails(e.target.value)} placeholder="ops@example.com" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Bcc</label>
                      <input value={bccEmails} onChange={e => setBccEmails(e.target.value)} placeholder="archive@example.com" className={inputClass} />
                    </div>
                  </div>
                </div>
              </div>

              <CampaignAiCopywriter
                channel="email"
                subject={subject}
                body={htmlBody}
                onApplySubject={setSubject}
                onApplyBody={setHtmlBody}
                inputClass={inputClass}
                extraGoal={buildAiGoal('email')}
              />

              <div className="bg-white border border-border rounded-xl overflow-hidden">
                <div className="flex flex-col gap-3 px-5 py-3 bg-surface border-b border-border xl:flex-row xl:items-center xl:justify-between">
                  <h2 className="text-sm font-semibold text-text-primary">Email Body</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {emailEditorMode === 'preview' && (
                      <>
                        <span className="text-xs text-text-muted">Subject: <strong className="text-text-primary">{previewSubject || '(empty)'}</strong></span>
                        <select
                          value={sampleCustomerId}
                          onChange={e => setSampleCustomerId(e.target.value)}
                          className="h-8 min-w-[220px] rounded-lg border border-border bg-white px-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
                        >
                          <option value="">Auto sample customer</option>
                          {sampleCustomers.map(customer => (
                            <option key={customer.id} value={customer.id}>
                              {customer.name || customer.email || customer.phone || customer.id}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => renderedPreview.mutate({
                            subject,
                            htmlBody,
                            variables,
                            sampleCustomerId: sampleCustomerId || undefined,
                          })}
                          disabled={renderedPreview.isPending}
                          className="inline-flex h-8 items-center gap-2 rounded-lg border border-accent/30 px-3 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-60"
                        >
                          {renderedPreview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          Render data
                        </button>
                        <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-0.5">
                          <button type="button" onClick={() => setPreviewDevice('desktop')} className={cn('p-1.5 rounded-md transition-colors', previewDevice === 'desktop' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')} title="Desktop preview">
                            <Monitor className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setPreviewDevice('mobile')} className={cn('p-1.5 rounded-md transition-colors', previewDevice === 'mobile' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')} title="Mobile preview">
                            <Smartphone className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-0.5">
                          <button type="button" onClick={() => setPreviewTheme('light')} className={cn('p-1.5 rounded-md transition-colors', previewTheme === 'light' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')} title="Light preview">
                            <Sun className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setPreviewTheme('dark')} className={cn('p-1.5 rounded-md transition-colors', previewTheme === 'dark' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')} title="Dark preview">
                            <Moon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                    <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-0.5">
                      <button onClick={() => setEmailEditorMode('visual')} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-colors', emailEditorMode === 'visual' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}>
                        Visual
                      </button>
                      <button onClick={() => setEmailEditorMode('html')} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-colors', emailEditorMode === 'html' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}>
                        HTML
                      </button>
                      <button onClick={() => setEmailEditorMode('preview')} className={cn('inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors', emailEditorMode === 'preview' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}>
                        <Eye className="h-3 w-3" /> Preview
                      </button>
                    </div>
                  </div>
                </div>
                {emailEditorMode === 'visual' ? (
                  <div className="p-5">
                    {!campaign.emailBuilderTemplate && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        This older campaign did not store builder JSON, so the visual builder opened the saved HTML as one editable block. Saving now will preserve the builder structure.
                      </div>
                    )}
                    <EmailBuilder
                      value={emailTemplate}
                      aiContext={{
                        subject,
                        previewText,
                        fullHtml: htmlBody,
                        campaignGoal: `Edit existing ${campaign.channel} campaign named ${name || campaign.name}`,
                      }}
                      onChange={(template) => {
                        const next = { ...template, subject, previewText }
                        setEmailTemplate(next)
                        setHtmlBody(compileToHtml(next))
                      }}
                    />
                  </div>
                ) : emailEditorMode === 'html' ? (
                  <div className="p-5">
                    <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={16}
                      className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" spellCheck={false} />
                    <p className="text-xs text-text-muted mt-2">Variables: {'{{customer_name}}'}, {'{{customer_email}}'}, {'{{store_name}}'}</p>
                  </div>
                ) : (
                  <>
                    {renderedPreview.data?.data && (
                      <div className="border-b border-border bg-emerald-50 px-5 py-2 text-xs text-emerald-700">
                        Rendered with {renderedPreview.data.data.sampleCustomer.name || renderedPreview.data.data.sampleCustomer.email || renderedPreview.data.data.sampleSource}.
                      </div>
                    )}
                    <div className="p-5 bg-surface/40">
                      <div className={cn('mx-auto border border-border rounded-lg overflow-hidden bg-white transition-all', previewDevice === 'mobile' ? 'w-[375px] max-w-full' : 'w-full max-w-[640px]')}>
                        <iframe srcDoc={emailPreviewSrcDoc(previewHtml, previewTheme)} title="Preview" className="w-full h-[400px]" sandbox="allow-same-origin" />
                      </div>
                    </div>
                  </>
                )}
              </div>

	              <div className="bg-white border border-border rounded-xl overflow-hidden">
	                <div className="flex items-center justify-between gap-4 px-5 py-3 bg-surface border-b border-border">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-text-muted" />
                    <h2 className="text-sm font-semibold text-text-primary">Gmail Annotation</h2>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={gmailAnnotationEnabled}
                    onClick={() => setGmailAnnotationEnabled(!gmailAnnotationEnabled)}
                    className={cn('relative h-5 w-9 rounded-full transition-colors', gmailAnnotationEnabled ? 'bg-accent' : 'bg-border')}
                  >
                    <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', gmailAnnotationEnabled ? 'translate-x-4' : 'translate-x-0')} />
                  </button>
                </div>
                {gmailAnnotationEnabled && (
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Promo image URL</label>
                      <input value={gmailImageUrl} onChange={e => setGmailImageUrl(e.target.value)} placeholder="https://cdn.example.com/sale.jpg" className={inputClass} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">Deal text</label>
                        <input value={gmailDealText} onChange={e => setGmailDealText(e.target.value)} placeholder="20% off today" className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">Offer code</label>
                        <input value={gmailOfferCode} onChange={e => setGmailOfferCode(e.target.value)} placeholder="SUMMER20" className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">Short description</label>
                      <input value={gmailDescription} onChange={e => setGmailDescription(e.target.value)} placeholder="Limited-time summer collection offer" className={inputClass} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">Starts</label>
                        <input type="datetime-local" value={gmailStartsAt} onChange={e => setGmailStartsAt(e.target.value)} className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1.5">Expires</label>
                        <input type="datetime-local" value={gmailExpiresAt} onChange={e => setGmailExpiresAt(e.target.value)} className={inputClass} />
                      </div>
                    </div>
                  </div>
	                )}
	              </div>

	              <div className="bg-white border border-border rounded-xl overflow-hidden">
	                <div className="flex items-center justify-between gap-4 px-5 py-3 bg-surface border-b border-border">
	                  <div className="flex items-center gap-2">
	                    <Link2 className="h-4 w-4 text-text-muted" />
	                    <h2 className="text-sm font-semibold text-text-primary">UTM Parameters</h2>
	                  </div>
	                  <button
	                    type="button"
	                    role="switch"
	                    aria-checked={utmEnabled}
	                    onClick={() => setUtmEnabled(!utmEnabled)}
	                    className={cn('relative h-5 w-9 rounded-full transition-colors', utmEnabled ? 'bg-accent' : 'bg-border')}
	                  >
	                    <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', utmEnabled ? 'translate-x-4' : 'translate-x-0')} />
	                  </button>
	                </div>
	                {utmEnabled && (
	                  <div className="p-5 space-y-4">
	                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
	                      <div>
	                        <label className="block text-sm font-medium text-text-primary mb-1.5">Source</label>
	                        <input value={utmSource} onChange={e => setUtmSource(e.target.value)} placeholder="storees" className={inputClass} />
	                      </div>
	                      <div>
	                        <label className="block text-sm font-medium text-text-primary mb-1.5">Medium</label>
	                        <input value={utmMedium} onChange={e => setUtmMedium(e.target.value)} placeholder="email" className={inputClass} />
	                      </div>
	                      <div>
	                        <label className="block text-sm font-medium text-text-primary mb-1.5">Campaign</label>
	                        <input value={utmCampaign} onChange={e => setUtmCampaign(e.target.value)} placeholder="{{campaign_name}}" className={inputClass} />
	                      </div>
	                    </div>
	                    <div className="space-y-2">
	                      {utmCustomParams.map((param, idx) => (
	                        <div key={idx} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2">
	                          <input value={param.key} onChange={e => setUtmCustomParams(utmCustomParams.map((p, i) => i === idx ? { ...p, key: e.target.value } : p))} placeholder="utm_term" className={inputClass} />
	                          <input value={param.value} onChange={e => setUtmCustomParams(utmCustomParams.map((p, i) => i === idx ? { ...p, value: e.target.value } : p))} placeholder="{{customer_region}}" className={inputClass} />
	                          <button type="button" onClick={() => setUtmCustomParams(utmCustomParams.filter((_, i) => i !== idx))} className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors" title="Remove parameter">
	                            <X className="h-4 w-4" />
	                          </button>
	                        </div>
	                      ))}
	                      <button type="button" onClick={() => setUtmCustomParams([...utmCustomParams, { key: '', value: '' }])} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">
	                        <Plus className="h-4 w-4" />
	                        Custom parameter
	                      </button>
	                    </div>
	                  </div>
	                )}
	              </div>

	              <div className="bg-white border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
                  <Paperclip className="h-4 w-4 text-text-muted" />
                  <h2 className="text-sm font-semibold text-text-primary">Attachments</h2>
                  <span className="text-xs text-text-muted">Up to 25MB each</span>
                </div>
                <div className="p-5 space-y-3">
                  <label className="flex h-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-surface/50 text-sm text-text-secondary hover:border-accent/40 hover:bg-accent/5 transition-colors">
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={e => {
                        void addAttachments(e.target.files)
                        e.currentTarget.value = ''
                      }}
                    />
                    <span className="inline-flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Add files
                    </span>
                  </label>
                  {attachmentError && <p className="text-xs text-red-600">{attachmentError}</p>}
                  {(existingAttachments.length > 0 || newAttachments.length > 0) && (
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {existingAttachments.map(file => (
                        <div key={file.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-text-primary">{file.filename}</p>
                            <p className="text-xs text-text-muted">{formatBytes(file.sizeBytes)} · {file.mime}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeExistingAttachment(file.id)}
                            className="p-1.5 rounded-md text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove attachment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      {newAttachments.map(file => (
                        <div key={file.localId} className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-text-primary">{file.filename}</p>
                            <p className="text-xs text-text-muted">{formatBytes(file.sizeBytes)} · {file.mime}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNewAttachments(newAttachments.filter(item => item.localId !== file.localId))}
                            className="p-1.5 rounded-md text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove attachment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : isWhatsapp ? (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
                <Mail className="h-4 w-4 text-text-muted" />
                <h2 className="text-sm font-semibold text-text-primary">WhatsApp Template</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className={cn('rounded-lg border p-4', canSubmitWhatsappTemplate ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70')}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className={cn('text-sm font-semibold', canSubmitWhatsappTemplate ? 'text-emerald-900' : 'text-amber-900')}>
                        {whatsappProvider?.provider ? `Connected provider: ${whatsappProvider.provider}` : 'No WhatsApp provider connected'}
                      </p>
                      <p className={cn('mt-1 text-xs', canSubmitWhatsappTemplate ? 'text-emerald-700' : 'text-amber-800')}>
                        Submit a new template for provider approval, then sync/refresh until it becomes selectable.
                      </p>
                      {whatsappProvider?.missingConfig?.length ? (
                        <p className="mt-1 text-xs text-amber-800">Missing config: {whatsappProvider.missingConfig.join(', ')}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowWhatsappTemplateForm(v => !v)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-accent/30 bg-white px-3 text-xs font-semibold text-accent hover:bg-accent/5"
                    >
                      {showWhatsappTemplateForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {showWhatsappTemplateForm ? 'Close' : 'Create template'}
                    </button>
                  </div>

                  {showWhatsappTemplateForm && (
                    <div className="mt-4 rounded-lg border border-border bg-white p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-text-secondary">Name</label>
                          <input
                            value={draftWhatsappTemplate.name}
                            onChange={e => setDraftWhatsappTemplate(t => ({ ...t, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                            placeholder="campaign_offer"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-text-secondary">Language</label>
                          <input
                            value={draftWhatsappTemplate.language}
                            onChange={e => setDraftWhatsappTemplate(t => ({ ...t, language: e.target.value }))}
                            placeholder="en_US"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-text-secondary">Category</label>
                          <select
                            value={draftWhatsappTemplate.category}
                            onChange={e => setDraftWhatsappTemplate(t => ({ ...t, category: e.target.value as SubmitInput['category'] }))}
                            className={inputClass}
                          >
                            <option value="MARKETING">Marketing</option>
                            <option value="UTILITY">Utility</option>
                            <option value="AUTHENTICATION">Authentication</option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-medium text-text-secondary">Template body</label>
                        <textarea
                          value={draftWhatsappTemplate.bodyText}
                          onChange={e => setDraftWhatsappTemplate(t => ({ ...t, bodyText: e.target.value }))}
                          rows={5}
                          placeholder="Hi {{1}}, your exclusive offer is ready."
                          className={cn(inputClass, 'h-28 resize-none')}
                        />
                        <p className="mt-1 text-xs text-text-muted">Use numbered Meta parameters like {'{{1}}'}, {'{{2}}'}.</p>
                      </div>
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-medium text-text-secondary">Footer</label>
                        <input
                          value={draftWhatsappTemplate.footer ?? ''}
                          onChange={e => setDraftWhatsappTemplate(t => ({ ...t, footer: e.target.value }))}
                          placeholder="Reply STOP to unsubscribe"
                          className={inputClass}
                        />
                      </div>
                      {draftWhatsappParamCount > 0 && (
                        <div className="mt-3 rounded-lg border border-border bg-surface/60 p-3">
                          <p className="text-xs font-semibold text-text-primary">Meta review examples</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {Array.from({ length: draftWhatsappParamCount }, (_, idx) => (
                              <div key={idx}>
                                <label className="mb-1 block text-xs font-medium text-text-secondary">{`{{${idx + 1}}}`} example</label>
                                <input
                                  value={draftWhatsappTemplate.bodyExample?.[idx] ?? ''}
                                  onChange={e => setDraftWhatsappTemplate(t => {
                                    const examples = Array.from({ length: draftWhatsappParamCount }, (_, i) => t.bodyExample?.[i] ?? whatsappSampleValue(i))
                                    examples[idx] = e.target.value
                                    return { ...t, bodyExample: examples }
                                  })}
                                  placeholder={whatsappSampleValue(idx)}
                                  className={inputClass}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={submitWhatsappTemplateForApproval}
                          disabled={submitWhatsappTemplate.isPending || !canSubmitWhatsappTemplate || !draftWhatsappTemplate.name.trim() || !draftWhatsappTemplate.bodyText.trim()}
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                        >
                          {submitWhatsappTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Submit for approval
                        </button>
                        {!canSubmitWhatsappTemplate && <span className="text-xs text-amber-700">Provider cannot submit templates or is missing required config.</span>}
                      </div>
                    </div>
                  )}
                </div>

                {pendingWhatsappTemplates.length > 0 && (
                  <div className="rounded-lg border border-border bg-surface/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-text-primary">Pending provider approval</p>
                      <button
                        type="button"
                        onClick={() => syncWhatsappTemplates.mutate()}
                        disabled={syncWhatsappTemplates.isPending}
                        className="text-xs font-medium text-accent hover:text-accent-hover disabled:opacity-60"
                      >
                        Sync all
                      </button>
                    </div>
                    <div className="space-y-2">
                      {pendingWhatsappTemplates.map(template => (
                        <div key={template.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-text-primary">{template.name} · {template.language}</p>
                            <p className={cn('mt-0.5 text-[11px]', template.status === 'REJECTED' ? 'text-red-600' : 'text-amber-700')}>
                              {template.status}{template.rejectionReason ? `: ${template.rejectionReason}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => refreshWhatsappTemplateStatus.mutate(template.id)}
                            disabled={refreshWhatsappTemplateStatus.isPending && refreshWhatsappTemplateStatus.variables === template.id}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] font-medium text-text-secondary hover:bg-surface disabled:opacity-60"
                          >
                            {refreshWhatsappTemplateStatus.isPending && refreshWhatsappTemplateStatus.variables === template.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            Status
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">Approved template</label>
                  <select
                    value={templateId ?? ''}
                    onChange={e => {
                      const next = approvedWhatsappTemplates.find(t => t.id === e.target.value)
                      setTemplateId(next?.id ?? null)
                      if (next) {
                        setBodyText(next.bodyText)
                        setVariables(seedWhatsappTemplateVariables(next))
                      }
                    }}
                    className={selectClass}
                  >
                    <option value="">Select template...</option>
                    {approvedWhatsappTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} · {t.language}</option>
                    ))}
                  </select>
                </div>
                <CampaignAiCopywriter
                  channel="whatsapp"
                  body={bodyText || draftWhatsappTemplate.bodyText}
                  onApplyBody={(value) => {
                    setShowWhatsappTemplateForm(true)
                    setDraftWhatsappTemplate(template => ({ ...template, bodyText: value }))
                  }}
                  inputClass={inputClass}
                  extraGoal={buildAiGoal('whatsapp')}
                  lockedReason="WhatsApp sends only approved template text. Apply generated copy into the template form, submit for approval, then select it after approval."
                />
                <div className="rounded-lg border border-border bg-surface/60">
                  <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <p className="text-sm font-semibold text-text-primary">Rendered preview</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={sampleCustomerId} onChange={e => setSampleCustomerId(e.target.value)} className="h-8 min-w-[190px] rounded-lg border border-border bg-white px-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20">
                        <option value="">Auto sample customer</option>
                        {sampleCustomers.map(customer => (
                          <option key={customer.id} value={customer.id}>{customer.name || customer.email || customer.phone || customer.id}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => renderedPreview.mutate({
                          bodyText,
                          variables,
                          sampleCustomerId: sampleCustomerId || undefined,
                        })}
                        disabled={renderedPreview.isPending || !bodyText.trim()}
                        className="inline-flex h-8 items-center gap-2 rounded-lg border border-accent/30 px-3 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-60"
                      >
                        {renderedPreview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Render data
                      </button>
                    </div>
                  </div>
                  {renderedPreview.data?.data && (
                    <div className="border-t border-border bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
                      Rendered with {renderedPreview.data.data.sampleCustomer.name || renderedPreview.data.data.sampleCustomer.email || renderedPreview.data.data.sampleSource}.
                    </div>
                  )}
                </div>
                <div className="rounded-xl bg-[#e5ddd5] p-5">
                  <div className="ml-auto max-w-[320px] rounded-lg bg-[#dcf8c6] px-3 py-2 shadow-sm">
                    <p className="whitespace-pre-wrap text-sm text-slate-900">{previewBody || 'Select an approved template to preview it.'}</p>
                    <p className="mt-1 text-right text-[10px] text-slate-500">12:45</p>
                  </div>
                </div>
                {(selectedWhatsappMediaHeader || selectedWhatsappUrlButtons.length > 0) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {selectedWhatsappMediaHeader && <p>Map <code>wa_header_media_url</code> for the {selectedWhatsappHeaderType.toLowerCase()} header.</p>}
                    {selectedWhatsappUrlButtons.map((button, idx) => (
                      <p key={`${button.text}-${idx}`}>Map <code>{`wa_button_url_${idx + 1}`}</code> for URL button "{button.text}".</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* SMS/Push Content */
	              <div className="bg-white border border-border rounded-xl overflow-hidden">
	                <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
	                  {campaign.channel === 'sms' ? <MessageSquare className="h-4 w-4 text-text-muted" /> : <Bell className="h-4 w-4 text-text-muted" />}
	                  <h2 className="text-sm font-semibold text-text-primary">{campaign.channel === 'sms' ? 'SMS' : 'Push'} Message</h2>
	                </div>
	              <div className="p-5 space-y-4">
	                {campaign.channel === 'push' && (
	                  <>
	                    <div>
	                      <label className="block text-sm font-medium text-text-primary mb-1.5">Notification Title</label>
	                      <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your order has shipped" className={inputClass} />
	                    </div>
	                    <div>
	                      <label className="block text-sm font-medium text-text-primary mb-1.5">Image URL</label>
	                      <input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="{{recipient_image:promo}}" className={inputClass} />
	                      <p className="text-xs text-text-muted mt-1">Use {'{{recipient_image:promo}}'} to pull from customer attribute images.promo.</p>
	                    </div>
	                  </>
	                )}
	                <div>
	                  <label className="block text-sm font-medium text-text-primary mb-1.5">Message</label>
	                  <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={campaign.channel === 'sms' ? 4 : 6}
	                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
	                  {campaign.channel === 'sms' && (
	                    <p className={cn('mt-2 text-xs font-medium', bodyText.length > 160 ? 'text-red-500' : 'text-text-muted')}>
	                      {bodyText.length}/160{bodyText.length > 160 && ` (${Math.ceil(bodyText.length / 153)} segments)`}
	                    </p>
	                  )}
	                </div>
		                <CampaignAiCopywriter
		                  channel={campaign.channel}
		                  subject={campaign.channel === 'push' ? subject : undefined}
		                  body={bodyText}
		                  onApplySubject={campaign.channel === 'push' ? setSubject : undefined}
		                  onApplyBody={setBodyText}
		                  inputClass={inputClass}
		                  extraGoal={buildAiGoal(campaign.channel)}
		                />
	                {bodyText.trim() && (
	                  <div className="rounded-lg border border-border bg-white">
	                    <div className="flex flex-col gap-3 border-b border-border bg-surface/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
	                      <p className="text-sm font-semibold text-text-primary">Rendered preview</p>
	                      <div className="flex flex-wrap items-center gap-2">
	                        <select value={sampleCustomerId} onChange={e => setSampleCustomerId(e.target.value)} className="h-8 min-w-[190px] rounded-lg border border-border bg-white px-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20">
	                          <option value="">Auto sample customer</option>
	                          {sampleCustomers.map(customer => (
	                            <option key={customer.id} value={customer.id}>{customer.name || customer.email || customer.phone || customer.id}</option>
	                          ))}
	                        </select>
	                        <button
	                          type="button"
	                          onClick={() => renderedPreview.mutate({
	                            subject: campaign.channel === 'push' ? subject : undefined,
	                            bodyText,
	                            variables,
	                            sampleCustomerId: sampleCustomerId || undefined,
	                          })}
	                          disabled={renderedPreview.isPending || (!bodyText.trim() && !(campaign.channel === 'push' && subject.trim()))}
	                          className="inline-flex h-8 items-center gap-2 rounded-lg border border-accent/30 px-3 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-60"
	                        >
	                          {renderedPreview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
	                          Render data
	                        </button>
	                      </div>
	                    </div>
	                    {renderedPreview.data?.data && (
	                      <div className="border-b border-border bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
	                        Rendered with {renderedPreview.data.data.sampleCustomer.name || renderedPreview.data.data.sampleCustomer.email || renderedPreview.data.data.sampleSource}.
	                      </div>
	                    )}
	                    <div className="p-4">
	                      {campaign.channel === 'push' ? (
	                        <div className="mx-auto max-w-xs rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
	                          <div className="flex items-start gap-3">
	                            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
	                              <Bell className="h-4 w-4 text-accent" />
	                            </div>
	                            <div className="min-w-0">
	                              <p className="text-xs font-semibold text-text-primary">{previewSubject || 'App Name'}</p>
	                              <p className="mt-0.5 line-clamp-3 text-xs text-text-secondary">{previewBody}</p>
	                              <p className="mt-1 text-[10px] text-text-muted">now</p>
	                            </div>
	                          </div>
	                        </div>
	                      ) : (
	                        <div className="mx-auto max-w-xs rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
	                          <div className="flex items-start gap-3">
	                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
	                              <MessageSquare className="h-4 w-4 text-green-600" />
	                            </div>
	                            <div className="max-w-[240px] rounded-xl rounded-tl-none border border-gray-100 bg-white p-3 shadow-sm">
	                              <p className="whitespace-pre-wrap text-sm text-text-primary">{previewBody}</p>
	                            </div>
	                          </div>
	                        </div>
	                      )}
	                    </div>
	                  </div>
	                )}
	              </div>
	            </div>
	          )}

	          {!isWhatsapp && !isEmail && (
	            <div className="bg-white border border-border rounded-xl overflow-hidden">
	              <div className="flex items-center justify-between gap-4 px-5 py-3 bg-surface border-b border-border">
	                <div className="flex items-center gap-2">
	                  <Link2 className="h-4 w-4 text-text-muted" />
	                  <h2 className="text-sm font-semibold text-text-primary">Link Tracking</h2>
	                </div>
	                <button
	                  type="button"
	                  role="switch"
	                  aria-checked={utmEnabled}
	                  onClick={() => setUtmEnabled(!utmEnabled)}
	                  className={cn('relative h-5 w-9 rounded-full transition-colors', utmEnabled ? 'bg-accent' : 'bg-border')}
	                >
	                  <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', utmEnabled ? 'translate-x-4' : 'translate-x-0')} />
	                </button>
	              </div>
	              {utmEnabled && (
	                <div className="p-5 space-y-4">
	                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
	                    <div>
	                      <label className="block text-sm font-medium text-text-primary mb-1.5">Source</label>
	                      <input value={utmSource} onChange={e => setUtmSource(e.target.value)} placeholder="storees" className={inputClass} />
	                    </div>
	                    <div>
	                      <label className="block text-sm font-medium text-text-primary mb-1.5">Medium</label>
	                      <input value={utmMedium} onChange={e => setUtmMedium(e.target.value)} placeholder={campaign.channel} className={inputClass} />
	                    </div>
	                    <div>
	                      <label className="block text-sm font-medium text-text-primary mb-1.5">Campaign</label>
	                      <input value={utmCampaign} onChange={e => setUtmCampaign(e.target.value)} placeholder="{{campaign_name}}" className={inputClass} />
	                    </div>
	                  </div>
	                  <div className="space-y-2">
	                    {utmCustomParams.map((param, idx) => (
	                      <div key={idx} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2">
	                        <input value={param.key} onChange={e => setUtmCustomParams(utmCustomParams.map((p, i) => i === idx ? { ...p, key: e.target.value } : p))} placeholder="utm_term" className={inputClass} />
	                        <input value={param.value} onChange={e => setUtmCustomParams(utmCustomParams.map((p, i) => i === idx ? { ...p, value: e.target.value } : p))} placeholder="{{customer_city}}" className={inputClass} />
	                        <button type="button" onClick={() => setUtmCustomParams(utmCustomParams.filter((_, i) => i !== idx))} className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors" title="Remove parameter">
	                          <X className="h-4 w-4" />
	                        </button>
	                      </div>
	                    ))}
	                    <button type="button" onClick={() => setUtmCustomParams([...utmCustomParams, { key: '', value: '' }])} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">
	                      <Plus className="h-4 w-4" />
	                      Custom parameter
	                    </button>
	                  </div>
	                </div>
	              )}
	            </div>
	          )}

	          <VariablePanel
            variables={variables}
            onChange={setVariables}
            contentSources={[
              subject,
              htmlBody,
              bodyText,
              supportsLinkTracking ? utmSource : null,
              supportsLinkTracking ? utmMedium : null,
              supportsLinkTracking ? utmCampaign : null,
              ...utmCustomParams.map(p => p.value),
              abTestEnabled ? abVariantBSubject : null,
              abTestEnabled ? abVariantBHtmlBody : null,
              abTestEnabled ? abVariantBBodyText : null,
            ]}
            preview={{
              subject: isEmail ? subject : null,
              htmlBody: isEmail ? htmlBody : null,
              bodyText: !isEmail ? bodyText : null,
            }}
          />
          {saveValidationIssues.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <Settings2 className="h-4 w-4" />
                Fix these variable mappings before saving
              </div>
              <ul className="mt-2 space-y-1 text-sm text-red-700">
                {saveValidationIssues.map((issue, idx) => (
                  <li key={`${issue.code ?? issue.key ?? 'issue'}-${idx}`}>
                    {issue.key ? <code className="mr-1 rounded bg-red-100 px-1 py-0.5 text-xs">{`{{${issue.key}}}`}</code> : null}
                    {issue.message ?? 'Invalid variable mapping'}
                  </li>
                ))}
              </ul>
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
                <div className={cn('absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', abTestEnabled ? 'translate-x-4' : 'translate-x-0')} />
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
                      <div className={cn('absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', abAutoSendWinner ? 'translate-x-4' : 'translate-x-0')} />
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
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'all' as const, label: 'All' },
                  { value: 'segment' as const, label: 'Segment' },
                  { value: 'filter' as const, label: 'Filter' },
                ]).map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAudienceMode(option.value)}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                      audienceMode === option.value ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:bg-surface',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {audienceMode === 'segment' && (
                <select value={segmentId} onChange={e => setSegmentId(e.target.value)} className={selectClass}>
                  <option value="">Select saved segment...</option>
                  {segments.map(s => <option key={s.id} value={s.id}>{s.name} ({s.memberCount.toLocaleString()})</option>)}
                </select>
              )}

              {audienceMode === 'filter' && (
                <div className="rounded-lg border border-border bg-surface/40 p-3">
                  <SegmentFilterBuilder filters={audienceFilter} onChange={setAudienceFilter} />
                </div>
              )}

              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-text-primary">Audience cap</p>
                    <p className="text-[10px] text-text-muted">Limit staged recipients.</p>
                  </div>
                  <button type="button" onClick={() => setAudienceCapEnabled(!audienceCapEnabled)} className={cn('relative h-5 w-9 rounded-full transition-colors', audienceCapEnabled ? 'bg-accent' : 'bg-border')}>
                    <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', audienceCapEnabled ? 'translate-x-4' : 'translate-x-0')} />
                  </button>
                </div>
                {audienceCapEnabled && (
                  <input
                    type="number"
                    min={1}
                    value={audienceCap}
                    onChange={e => setAudienceCap(e.target.value)}
                    placeholder="Max recipients"
                    className={inputClass}
                  />
                )}

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-text-primary">Control group</p>
                    <p className="text-[10px] text-text-muted">Hold out a deterministic sample.</p>
                  </div>
                  <button type="button" onClick={() => setControlGroupEnabled(!controlGroupEnabled)} className={cn('relative h-5 w-9 rounded-full transition-colors', controlGroupEnabled ? 'bg-accent' : 'bg-border')}>
                    <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', controlGroupEnabled ? 'translate-x-4' : 'translate-x-0')} />
                  </button>
                </div>
                {controlGroupEnabled && (
                  <div className="space-y-2">
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={controlGroupPct}
                      onChange={e => setControlGroupPct(parseInt(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <div className="flex items-center justify-between text-[10px] text-text-muted">
                      <span>{controlGroupPct}% held back</span>
                      <span>{100 - controlGroupPct}% receive</span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={runAudiencePreview}
                  disabled={previewAudience.isPending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/30 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-60"
                >
                  {previewAudience.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                  Preview audience
                </button>

                {audiencePreview && (
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface/60 p-3 text-[11px]">
                    <span className="text-text-muted">Candidates</span><span className="text-right font-medium text-text-primary">{audiencePreview.totalCandidates.toLocaleString()}</span>
                    <span className="text-text-muted">Deliverable</span><span className="text-right font-medium text-text-primary">{audiencePreview.deliverable.toLocaleString()}</span>
                    {audiencePreview.serviceWindowBlocked > 0 && (
                      <>
                        <span className="text-text-muted">24h blocked</span><span className="text-right font-medium text-amber-600">{audiencePreview.serviceWindowBlocked.toLocaleString()}</span>
                      </>
                    )}
                    <span className="text-text-muted">Holdouts</span><span className="text-right font-medium text-text-primary">{audiencePreview.estimatedHoldouts.toLocaleString()}</span>
                    <span className="text-text-muted">Recipients</span><span className="text-right font-semibold text-accent">{audiencePreview.estimatedRecipients.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Users className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Exclude Users</h2>
            </div>
            <div className="p-5">
              <SegmentFilterBuilder filters={excludeAudienceFilter} onChange={setExcludeAudienceFilter} />
            </div>
          </div>

          {campaign.contentType === 'promotional' && (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
                <ShieldCheck className="h-4 w-4 text-text-muted" />
                <h2 className="text-sm font-semibold text-text-primary">Subscription Categories</h2>
              </div>
              <div className="p-5 space-y-2">
                {subscriptionCategories.map(category => {
                  const selected = subscriptionCategoryIds.includes(category.id)
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleSubscriptionCategory(category.id)}
                      className={cn(
                        'w-full flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all duration-150',
                        selected ? 'border-accent bg-accent/[0.03]' : 'border-border hover:border-text-muted/30',
                      )}
                    >
                      <span className={cn(
                        'mt-0.5 h-4 w-4 rounded border flex-shrink-0',
                        selected ? 'border-accent bg-accent' : 'border-border bg-white',
                      )}>
                        {selected && <span className="block h-2 w-2 rounded-sm bg-white m-[3px]" />}
                      </span>
                      <span>
                        <span className="block text-xs font-medium text-text-primary">{category.name}</span>
                        {category.description && (
                          <span className="block text-[10px] text-text-muted mt-0.5">{category.description}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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
	                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
	                    {([
	                      { value: 'asap' as const, label: 'ASAP' },
	                      { value: 'fixed' as const, label: 'Fixed' },
	                      { value: 'user_timezone' as const, label: 'User timezone' },
	                      { value: 'best_time' as const, label: 'Best time' },
	                    ]).map(option => (
	                      <button
	                        key={option.value}
	                        type="button"
	                        onClick={() => setSendTimeMode(option.value)}
	                        className={cn('px-3 py-2 text-xs font-medium rounded-lg border transition-all', sendTimeMode === option.value ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text-secondary hover:border-gray-300')}
	                      >
	                        {option.label}
	                      </button>
	                    ))}
	                  </div>
	                  {sendTimeMode !== 'asap' && (
	                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
	                      <div>
	                        <label className="block text-xs font-medium text-text-secondary mb-1">Anchor date</label>
	                        <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className={inputClass} />
	                      </div>
	                      <div>
	                        <label className="block text-xs font-medium text-text-secondary mb-1">Time</label>
	                        <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className={inputClass} />
	                      </div>
	                      <div>
	                        <label className="block text-xs font-medium text-text-secondary mb-1">Timezone</label>
	                        <select value={scheduleTimezone} onChange={e => setScheduleTimezone(e.target.value)} className={selectClass}>
	                          {TIMEZONE_OPTIONS.map(tz => <option key={tz} value={tz}>{tz}</option>)}
	                        </select>
	                      </div>
	                    </div>
	                  )}
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
                  <div className="mt-3 rounded-lg border border-border bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-medium text-text-secondary">Event attributes</span>
                      <button type="button" onClick={() => addGoalAttribute(idx)} className="text-[10px] font-medium text-accent hover:text-accent-hover">
                        Add filter
                      </button>
                    </div>
                    {Object.entries(goal.attributes ?? {}).length > 0 && (
                      <div className="mt-2 space-y-2">
                        {Object.entries(goal.attributes ?? {}).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <input value={key} onChange={e => updateGoalAttribute(idx, key, e.target.value, value)} placeholder="property" className={cn(inputClass, 'h-8 text-xs')} />
                            <input value={value} onChange={e => updateGoalAttribute(idx, key, key, e.target.value)} placeholder="value" className={cn(inputClass, 'h-8 text-xs')} />
                            <button type="button" onClick={() => removeGoalAttribute(idx, key)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border text-text-muted hover:text-red-600 hover:bg-red-50">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div>
                    <p className="text-sm text-text-primary">Ignore frequency capping</p>
                    <p className="text-xs text-text-muted">Bypass project caps for this campaign.</p>
                  </div>
                  <button type="button" onClick={() => setIgnoreFreqCapping(!ignoreFreqCapping)} className={cn('relative w-10 h-5 rounded-full transition-colors', ignoreFreqCapping ? 'bg-accent' : 'bg-gray-200')}>
                    <span className={cn('absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', ignoreFreqCapping ? 'translate-x-4' : 'translate-x-0')} />
                  </button>
                </div>
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div>
                    <p className="text-sm text-text-primary">Count toward frequency capping</p>
                    <p className="text-xs text-text-muted">Include this send in future cap checks.</p>
                  </div>
                  <button type="button" onClick={() => setCountForFreqCapping(!countForFreqCapping)} className={cn('relative w-10 h-5 rounded-full transition-colors', countForFreqCapping ? 'bg-accent' : 'bg-gray-200')}>
                    <span className={cn('absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', countForFreqCapping ? 'translate-x-4' : 'translate-x-0')} />
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Rate limit (per minute)</label>
                  <input type="number" value={deliveryLimit} onChange={e => setDeliveryLimit(e.target.value)} placeholder="No limit" className={inputClass} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
