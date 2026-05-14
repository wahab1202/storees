'use client'

import { useState, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCreateCampaign, usePreviewCampaignAudience, type CampaignAttachmentUpload, type CampaignAudiencePreview } from '@/hooks/useCampaigns'
import { useSegments } from '@/hooks/useSegments'
import { useCreateTemplate, usePreviewTemplate, useTemplates } from '@/hooks/useTemplates'
import { useCustomers } from '@/hooks/useCustomers'
import { useSubscriptionCategories } from '@/hooks/useSubscriptionCategories'
import { useEmailSenders } from '@/hooks/useEmailSenders'
import {
  useRefreshTemplateStatus,
  useSubmitWhatsappTemplate,
  useTestSendWhatsappTemplate,
  useWhatsappProviderStatus,
  useWhatsappTemplates,
  useSyncWhatsappTemplates,
  type SubmitInput,
  type WhatsappTemplate,
} from '@/hooks/useWhatsappTemplates'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { TemplatePreviewCard } from '@/components/shared/TemplatePreviewCard'
import { CampaignAiCopywriter } from '@/components/campaigns/CampaignAiCopywriter'
import { cn } from '@/lib/utils'
import { EmailBuilder } from '@/components/email-builder/EmailBuilder'
import { compileToHtml } from '@/lib/emailCompiler'
import { DEFAULT_TEMPLATE, generateBlockId } from '@/lib/emailTypes'
import type { EmailBlock, EmailTemplate } from '@/lib/emailTypes'
import { SegmentFilterBuilder } from '@/components/segments/SegmentFilterBuilder'
import { VariablePanel } from '@/components/templates/VariablePanel'
import { ApiError } from '@/lib/api'
import type { CampaignContentType, CampaignChannel, CampaignDeliveryType, CampaignSendTimeMode, CampaignUtmParameter, CampaignUtmParameters, ConversionGoal, GmailAnnotation, PeriodicSchedule, FilterConfig, ProjectEmailSender, TemplateVariable } from '@storees/shared'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Users,
  Mail,
  MessageSquare,
  Phone,
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
  Save,
  Send,
  Info,
  BarChart3,
  Layout,
  CalendarClock,
  Repeat,
  FlaskConical,
  SplitSquareHorizontal,
  Trophy,
  Layers,
  RefreshCw,
  Paperclip,
  Trash2,
  Upload,
  Monitor,
  Smartphone,
  Moon,
  Sun,
  Link2,
  Search,
  Filter,
  ShoppingBag,
  Copy,
} from 'lucide-react'

type Step = 1 | 2 | 3
type SendTiming = CampaignSendTimeMode
type EditorMode = 'templates' | 'visual' | 'html' | 'preview'
type PreviewDevice = 'desktop' | 'mobile'
type PreviewTheme = 'light' | 'dark'
type DraftAttachment = CampaignAttachmentUpload & { localId: string }
type ValidationIssue = { severity?: string; message?: string; key?: string; code?: string }

const STEPS = [
  { num: 1 as Step, label: 'Target Users' },
  { num: 2 as Step, label: 'Content' },
  { num: 3 as Step, label: 'Schedule and Goals' },
]

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email', sms: 'SMS', push: 'Push', whatsapp: 'WhatsApp',
}

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail, sms: MessageSquare, push: Bell, whatsapp: Phone,
}

function seedWhatsappTemplateVariables(template: WhatsappTemplate): TemplateVariable[] {
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

function getApiIssues(error: unknown): ValidationIssue[] {
  if (!(error instanceof ApiError)) return []
  const payload = error.payload as { issues?: ValidationIssue[] } | undefined
  return Array.isArray(payload?.issues) ? payload.issues : []
}

function countWhatsappTemplateParameters(body: string): number {
  const matches = Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(match => Number(match[1]))
  return matches.length > 0 ? Math.max(...matches) : 0
}

function whatsappSampleValue(idx: number): string {
  return ['Wahab', 'ORD-1001', 'Storees', '20%'][idx] ?? `sample ${idx + 1}`
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
  { key: 'blank', label: 'Blank Template', description: 'Start with a clean email shell', icon: Plus, html: BLANK_HTML, group: 'Basic templates' },
  { key: '2col', label: '2 Columns', description: 'Two equal content columns', icon: Columns2, html: TWO_COL_HTML, group: 'Basic templates' },
  { key: '3col', label: '3 Columns', description: 'Three feature or product columns', icon: Columns3, html: THREE_COL_HTML, group: 'Basic templates' },
  { key: '4col', label: '4 Columns', description: 'Compact four-column product grid', icon: Columns4, html: FOUR_COL_HTML, group: 'Basic templates' },
  { key: 'promo', label: 'Promo Hero', description: 'Hero, offer copy, CTA, and benefits', icon: Trophy, html: BLANK_HTML, group: 'Prebuilt templates' },
  { key: 'cart', label: 'Abandoned Cart', description: 'Cart reminder with product rows', icon: ShoppingBag, html: BLANK_HTML, group: 'Prebuilt templates' },
  { key: 'newsletter', label: 'Newsletter', description: 'Editorial update with sections', icon: Layout, html: BLANK_HTML, group: 'Prebuilt templates' },
  { key: 'product-grid', label: 'Product Grid', description: 'Featured products and CTA buttons', icon: SplitSquareHorizontal, html: BLANK_HTML, group: 'Prebuilt templates' },
]

function makeTextColumn(index: number): EmailBlock[] {
  return [
    {
      id: generateBlockId(),
      type: 'image',
      props: { src: '', alt: `Feature ${index}`, width: '82%', align: 'center' },
    },
    {
      id: generateBlockId(),
      type: 'header',
      props: { text: `Feature ${index}`, level: 3, align: 'center', color: '#111827' },
    },
    {
      id: generateBlockId(),
      type: 'text',
      props: { html: '<p>Description here</p>', align: 'center', color: '#4b5563', fontSize: 14 },
    },
  ]
}

function makeProductColumn(index: number): EmailBlock[] {
  return [
    {
      id: generateBlockId(),
      type: 'image',
      props: { src: '', alt: `Product ${index}`, width: '86%', align: 'center' },
    },
    {
      id: generateBlockId(),
      type: 'text',
      props: { html: `<p><strong>Product ${index}</strong><br/>Fresh pick for {{customer_name}}</p>`, align: 'center', color: '#374151', fontSize: 14 },
    },
    {
      id: generateBlockId(),
      type: 'button',
      props: { text: 'View', url: 'https://', bgColor: '#38A9D6', textColor: '#ffffff', align: 'center', borderRadius: 6, fullWidth: false },
    },
  ]
}

function makeColumnBlock(columnCount: 2 | 3 | 4, columnFactory: (index: number) => EmailBlock[] = makeTextColumn): EmailBlock {
  const ratio: '1:1:1:1' | '1:1:1' | '1:1' = columnCount === 4 ? '1:1:1:1' : columnCount === 3 ? '1:1:1' : '1:1'
  return {
    id: generateBlockId(),
    type: 'columns',
    props: {
      ratio,
      columns: Array.from({ length: columnCount }, (_, idx) => columnFactory(idx + 1)),
      padding: 8,
      gap: 16,
      rowBgColor: 'transparent',
      contentBgColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      borderRadius: 0,
      stackOnMobile: true,
    },
  }
}

function starterTemplateForLayout(key: string): EmailTemplate {
  const base: EmailTemplate = {
    ...DEFAULT_TEMPLATE,
    blocks: [],
    globalStyles: { ...DEFAULT_TEMPLATE.globalStyles },
  }

  const commonBlocks: EmailBlock[] = [
    {
      id: generateBlockId(),
      type: 'header',
      props: { text: 'Hi {{customer_name}},', level: 1, align: 'center', color: '#111827' },
    },
    {
      id: generateBlockId(),
      type: 'text',
      props: { html: '<p>Use this section to introduce the offer, update, or announcement.</p>', align: 'center', color: '#4b5563', fontSize: 16 },
    },
  ]

  if (key === 'blank') return { ...base, blocks: commonBlocks }

  if (key === 'promo') {
    return {
      ...base,
      subject: 'A special offer for {{customer_name}}',
      previewText: 'Your limited-time offer is ready.',
      blocks: [
        {
          id: generateBlockId(),
          type: 'image',
          props: { src: '', alt: 'Campaign hero', width: '100%', align: 'center' },
        },
        {
          id: generateBlockId(),
          type: 'header',
          props: { text: 'Time for great email design', level: 1, align: 'center', color: '#111827' },
        },
        {
          id: generateBlockId(),
          type: 'text',
          props: { html: '<p>Tell customers what is new, why it matters, and what they should do next.</p>', align: 'center', color: '#4b5563', fontSize: 16 },
        },
        {
          id: generateBlockId(),
          type: 'button',
          props: { text: 'Shop Now', url: 'https://', bgColor: '#38A9D6', textColor: '#ffffff', align: 'center', borderRadius: 6, fullWidth: false },
        },
        makeColumnBlock(3),
        { id: generateBlockId(), type: 'footer', props: { text: '{{store_name}}', unsubscribeText: 'Unsubscribe', align: 'center' } },
      ],
    }
  }

  if (key === 'cart') {
    return {
      ...base,
      subject: 'Still thinking it over?',
      previewText: 'Your cart is waiting.',
      blocks: [
        {
          id: generateBlockId(),
          type: 'header',
          props: { text: 'Your cart is waiting', level: 1, align: 'center', color: '#111827' },
        },
        {
          id: generateBlockId(),
          type: 'text',
          props: { html: '<p>Hi {{customer_name}}, the items you liked are still available. Complete your order before they sell out.</p>', align: 'center', color: '#4b5563', fontSize: 16 },
        },
        makeColumnBlock(2, makeProductColumn),
        {
          id: generateBlockId(),
          type: 'button',
          props: { text: 'Return to Cart', url: 'https://', bgColor: '#111827', textColor: '#ffffff', align: 'center', borderRadius: 6, fullWidth: false },
        },
        { id: generateBlockId(), type: 'footer', props: { text: 'Need help? Reply to this email and we will help you finish checkout.', unsubscribeText: 'Unsubscribe', align: 'center' } },
      ],
    }
  }

  if (key === 'newsletter') {
    return {
      ...base,
      subject: '{{store_name}} weekly update',
      previewText: 'New launches, stories, and recommendations.',
      blocks: [
        {
          id: generateBlockId(),
          type: 'header',
          props: { text: '{{store_name}} Weekly', level: 1, align: 'left', color: '#111827' },
        },
        {
          id: generateBlockId(),
          type: 'text',
          props: { html: '<p>A short editor note goes here. Keep it direct, useful, and tuned to the segment.</p>', align: 'left', color: '#4b5563', fontSize: 16 },
        },
        { id: generateBlockId(), type: 'divider', props: { color: '#e5e7eb', thickness: 1, padding: 16 } },
        makeColumnBlock(2),
        {
          id: generateBlockId(),
          type: 'text',
          props: { html: '<p><strong>What else is new?</strong><br/>Add campaign highlights, content links, or announcements here.</p>', align: 'left', color: '#374151', fontSize: 15 },
        },
        { id: generateBlockId(), type: 'footer', props: { text: '{{store_name}} newsletter', unsubscribeText: 'Unsubscribe', align: 'center' } },
      ],
    }
  }

  if (key === 'product-grid') {
    return {
      ...base,
      subject: 'Picked for you, {{customer_name}}',
      previewText: 'Browse today\'s featured products.',
      blocks: [
        {
          id: generateBlockId(),
          type: 'header',
          props: { text: 'Featured products', level: 1, align: 'center', color: '#111827' },
        },
        {
          id: generateBlockId(),
          type: 'text',
          props: { html: '<p>Highlight bestsellers, new arrivals, or personalized recommendations.</p>', align: 'center', color: '#4b5563', fontSize: 16 },
        },
        makeColumnBlock(4, makeProductColumn),
        makeColumnBlock(4, makeProductColumn),
        {
          id: generateBlockId(),
          type: 'button',
          props: { text: 'Browse Collection', url: 'https://', bgColor: '#4F46E5', textColor: '#ffffff', align: 'center', borderRadius: 6, fullWidth: false },
        },
      ],
    }
  }

  const columnCount = key === '4col' ? 4 : key === '3col' ? 3 : 2
  return {
    ...base,
    blocks: [
      ...commonBlocks,
      makeColumnBlock(columnCount, key === '4col' ? makeProductColumn : makeTextColumn),
      {
        id: generateBlockId(),
        type: 'button',
        props: { text: 'Shop Now', url: 'https://', bgColor: '#4F46E5', textColor: '#ffffff', align: 'center', borderRadius: 8, fullWidth: false },
      },
    ],
  }
}

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
  const previewAudience = usePreviewCampaignAudience()
  const { data: segmentsData } = useSegments()
  const { data: templatesData } = useTemplates()
  const { data: subscriptionCategoriesData } = useSubscriptionCategories()
  const { data: sendersData } = useEmailSenders()
  const { data: whatsappTemplatesData } = useWhatsappTemplates()
  const syncWhatsappTemplates = useSyncWhatsappTemplates()

  // Read channel and delivery type from URL params
  const channel = (searchParams.get('channel') ?? 'email') as CampaignChannel
  const deliveryType = (searchParams.get('type') ?? 'one-time') as CampaignDeliveryType
  const isEmail = channel === 'email'
  const isWhatsapp = channel === 'whatsapp'
  const isPeriodic = deliveryType === 'periodic'
  const supportsLinkTracking = channel !== 'whatsapp'
  const ChannelIcon = CHANNEL_ICONS[channel] ?? Mail

  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [name, setName] = useState('')
  const [contentType, setContentType] = useState<CampaignContentType>('promotional')
  const [subscriptionCategoryIds, setSubscriptionCategoryIds] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [segmentId, setSegmentId] = useState('')
  const [audienceMode, setAudienceMode] = useState<'all' | 'segment' | 'filter'>('segment')
  const [audienceFilter, setAudienceFilter] = useState<FilterConfig>({ logic: 'AND', rules: [] })
  const [excludeAudienceEnabled, setExcludeAudienceEnabled] = useState(false)
  const [excludeAudienceFilter, setExcludeAudienceFilter] = useState<FilterConfig>({ logic: 'AND', rules: [] })
  const [audienceCapEnabled, setAudienceCapEnabled] = useState(false)
  const [audienceCap, setAudienceCap] = useState<string>('')
  const [controlGroupEnabled, setControlGroupEnabled] = useState(false)
  const [controlGroupPct, setControlGroupPct] = useState(10)
  const [showReachability, setShowReachability] = useState(false)
  const [audiencePreview, setAudiencePreview] = useState<CampaignAudiencePreview | null>(null)

  // Step 2 — email
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [replyToEmail, setReplyToEmail] = useState('')
  const [ccEmails, setCcEmails] = useState('')
  const [bccEmails, setBccEmails] = useState('')
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const [gmailAnnotationEnabled, setGmailAnnotationEnabled] = useState(false)
  const [gmailImageUrl, setGmailImageUrl] = useState('')
  const [gmailDealText, setGmailDealText] = useState('')
  const [gmailDescription, setGmailDescription] = useState('')
  const [gmailOfferCode, setGmailOfferCode] = useState('')
  const [gmailStartsAt, setGmailStartsAt] = useState('')
  const [gmailExpiresAt, setGmailExpiresAt] = useState('')
  const [utmEnabled, setUtmEnabled] = useState(true)
  const [utmSource, setUtmSource] = useState('storees')
  const [utmMedium, setUtmMedium] = useState<string>(channel)
  const [utmCampaign, setUtmCampaign] = useState('{{campaign_name}}')
  const [utmCustomParams, setUtmCustomParams] = useState<CampaignUtmParameter[]>([])
  const [htmlBody, setHtmlBody] = useState(BLANK_HTML)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedLayout, setSelectedLayout] = useState<string>('blank')
  const [editorMode, setEditorMode] = useState<EditorMode>('templates')
  const [previewTemplate, setPreviewTemplate] = useState<{ name: string; html: string } | null>(null)
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE)
  const [variables, setVariables] = useState<TemplateVariable[]>([])

  // Step 2 — SMS / Push
  const [bodyText, setBodyText] = useState('')
  const [pushTitle, setPushTitle] = useState('')
  const [pushImageUrl, setPushImageUrl] = useState('')

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
  const [scheduleTimezone, setScheduleTimezone] = useState('Asia/Kolkata')
  const [conversionGoals, setConversionGoals] = useState<ConversionGoal[]>([
    { name: 'Goal 1', eventName: '', revenueEnabled: true, revenueAttribute: 'total', isPrimary: true },
  ])
  const [goalTrackingHours, setGoalTrackingHours] = useState(36)
  const [currency, setCurrency] = useState('INR')
  const [deliveryLimit, setDeliveryLimit] = useState<string>('')
  const [ignoreFreqCapping, setIgnoreFreqCapping] = useState(false)
  const [countForFreqCapping, setCountForFreqCapping] = useState(true)

  // Step 3 — periodic
  const [periodicFrequency, setPeriodicFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [periodicDayOfWeek, setPeriodicDayOfWeek] = useState(1)
  const [periodicDayOfMonth, setPeriodicDayOfMonth] = useState(1)
  const [periodicTime, setPeriodicTime] = useState('09:00')
  const [periodicEndsAt, setPeriodicEndsAt] = useState('')

  const segments = segmentsData?.data ?? []
  const templates = (templatesData?.data ?? []).filter(t => t.channel === channel)
  const whatsappTemplates = whatsappTemplatesData?.data ?? []
  const subscriptionCategories = (subscriptionCategoriesData?.data ?? [])
    .filter(c => c.channel == null || c.channel === channel)
  const verifiedSenders = (sendersData?.data ?? []).filter(sender => !!sender.verifiedAt)
  const selectedSegment = segments.find(s => s.id === segmentId)
  const saveValidationIssues = getApiIssues(createCampaign.error)

  // Validation
  const step1Valid = name.trim().length > 0
  const step2Valid = isEmail
    ? subject.trim().length > 0 && htmlBody.trim().length > 0
    : isWhatsapp
    ? !!selectedTemplateId && bodyText.trim().length > 0
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
    const needsScheduleAnchor = ['fixed', 'user_timezone', 'best_time'].includes(sendTiming)

    const periodicSchedule: PeriodicSchedule | undefined = isPeriodic ? {
      frequency: periodicFrequency,
      ...(periodicFrequency === 'weekly' ? { dayOfWeek: periodicDayOfWeek } : {}),
      ...(periodicFrequency === 'monthly' ? { dayOfMonth: periodicDayOfMonth } : {}),
      time: periodicTime,
      ...(periodicEndsAt ? { endsAt: periodicEndsAt } : {}),
    } : undefined
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

    createCampaign.mutate(
      {
        name,
        channel,
        deliveryType,
        contentType,
        // Email fields
        subject: isEmail ? subject : (channel === 'push' ? pushTitle : undefined),
        htmlBody: isEmail ? htmlBody : undefined,
        emailBuilderTemplate: isEmail ? { ...emailTemplate, subject, previewText } : undefined,
        previewText: isEmail ? (previewText || undefined) : (channel === 'push' ? (pushImageUrl || undefined) : undefined),
        fromName: isEmail ? (fromName || undefined) : undefined,
        fromEmail: isEmail ? (fromEmail || undefined) : undefined,
        replyToEmail: isEmail ? (replyToEmail || undefined) : undefined,
        ccEmails: isEmail ? splitEmails(ccEmails) : undefined,
        bccEmails: isEmail ? splitEmails(bccEmails) : undefined,
        gmailAnnotation: isEmail ? gmailAnnotation : undefined,
        utmParameters: supportsLinkTracking ? utmParameters : undefined,
        attachmentUploads: isEmail ? attachments.map(attachment => ({
          filename: attachment.filename,
          mime: attachment.mime,
          sizeBytes: attachment.sizeBytes,
          contentBase64: attachment.contentBase64,
        })) : undefined,
        templateId: (isEmail || isWhatsapp) ? (selectedTemplateId || undefined) : undefined,
        // SMS/Push fields
        bodyText: !isEmail ? bodyText : undefined,
        // Audience-v2
        segmentId: audienceMode === 'segment' ? segmentId || undefined : undefined,
        audienceFilter: audienceMode === 'filter' && audienceFilter.rules.length > 0 ? audienceFilter : undefined,
        excludeAudienceFilter: excludeAudienceEnabled && excludeAudienceFilter.rules.length > 0 ? excludeAudienceFilter : undefined,
        audienceCap: audienceCapEnabled && audienceCap ? parseInt(audienceCap) : undefined,
        controlGroupPct: controlGroupEnabled ? controlGroupPct : 0,
        tags: tags.length > 0 ? tags : undefined,
        subscriptionCategoryIds: subscriptionCategoryIds.length > 0 ? subscriptionCategoryIds : undefined,
        // Goals
        conversionGoals: goals.length > 0 ? goals : undefined,
        goalTrackingHours,
        currency: currency || 'INR',
        deliveryLimit: deliveryLimit ? parseInt(deliveryLimit) : undefined,
        ignoreFrequencyCap: ignoreFreqCapping,
        countForFrequencyCap: countForFreqCapping,
        sendTimeMode: isPeriodic ? 'fixed' : sendTiming,
        scheduleTimezone: !isPeriodic && sendTiming !== 'asap' ? scheduleTimezone : undefined,
        // Schedule
        periodicSchedule,
        scheduledAt: !isPeriodic && needsScheduleAnchor && scheduledDate && scheduledTime
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
        variables,
      },
      { onSuccess: (res) => router.push(`/campaigns/${res.data?.id}`) },
    )
  }

  const goNext = () => setStep(s => Math.min(s + 1, 3) as Step)
  const goPrev = () => setStep(s => Math.max(s - 1, 1) as Step)
  const runAudiencePreview = () => {
    previewAudience.mutate(
      {
        channel,
        templateId: channel === 'whatsapp' ? selectedTemplateId : undefined,
        segmentId: audienceMode === 'segment' ? segmentId || null : null,
        audienceFilter: audienceMode === 'filter' && audienceFilter.rules.length > 0 ? audienceFilter : null,
        excludeAudienceFilter: excludeAudienceEnabled && excludeAudienceFilter.rules.length > 0 ? excludeAudienceFilter : null,
        audienceCap: audienceCapEnabled && audienceCap ? parseInt(audienceCap) : null,
        controlGroupPct: controlGroupEnabled ? controlGroupPct : 0,
        subscriptionCategoryIds,
      },
      { onSuccess: res => setAudiencePreview(res.data ?? null) },
    )
  }

  const inputClass = 'w-full h-10 px-3.5 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/60 transition-colors duration-150'
  const selectClass = cn(inputClass, 'appearance-none cursor-pointer pr-10 bg-[length:16px] bg-[right_12px_center] bg-no-repeat bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")]')

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
      <div className="flex items-center mb-8 px-2">
        {STEPS.map((s, i) => {
          const isActive = step === s.num
          const isCompleted = completedSteps.has(s.num) && step > s.num
          const isPast = step > s.num
          return (
            <div key={s.num} className="flex items-center flex-1">
              <button onClick={() => setStep(s.num)} className="flex items-center gap-2.5 group">
                <span className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200',
                  isActive
                    ? 'bg-accent text-white shadow-sm shadow-accent/25'
                    : isCompleted
                      ? 'bg-accent/10 text-accent'
                      : 'bg-surface text-text-muted',
                )}>
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : s.num}
                </span>
                <div className="text-left">
                  <span className={cn(
                    'text-sm font-medium transition-colors duration-150 block',
                    isActive ? 'text-text-primary' : isPast ? 'text-text-secondary' : 'text-text-muted group-hover:text-text-secondary',
                  )}>
                    {s.label}
                  </span>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <div className="flex-1 mx-4">
                  <div className={cn(
                    'h-px transition-colors duration-300',
                    isPast ? 'bg-accent/40' : 'bg-border',
                  )} />
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
            tags={tags} setTags={setTags}
            contentType={contentType} setContentType={setContentType}
            subscriptionCategories={subscriptionCategories}
            subscriptionCategoryIds={subscriptionCategoryIds}
            setSubscriptionCategoryIds={setSubscriptionCategoryIds}
            audienceMode={audienceMode} setAudienceMode={setAudienceMode}
            segmentId={segmentId} setSegmentId={setSegmentId}
            audienceFilter={audienceFilter} setAudienceFilter={setAudienceFilter}
            excludeAudienceEnabled={excludeAudienceEnabled} setExcludeAudienceEnabled={setExcludeAudienceEnabled}
            excludeAudienceFilter={excludeAudienceFilter} setExcludeAudienceFilter={setExcludeAudienceFilter}
            audienceCapEnabled={audienceCapEnabled} setAudienceCapEnabled={setAudienceCapEnabled}
            audienceCap={audienceCap} setAudienceCap={setAudienceCap}
            controlGroupEnabled={controlGroupEnabled} setControlGroupEnabled={setControlGroupEnabled}
            controlGroupPct={controlGroupPct} setControlGroupPct={setControlGroupPct}
            segments={segments} selectedSegment={selectedSegment}
            showReachability={showReachability} setShowReachability={setShowReachability}
            audiencePreview={audiencePreview}
            onPreviewAudience={runAudiencePreview}
            previewPending={previewAudience.isPending}
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
                fromEmail={fromEmail} setFromEmail={setFromEmail}
                replyToEmail={replyToEmail} setReplyToEmail={setReplyToEmail}
                ccEmails={ccEmails} setCcEmails={setCcEmails}
                bccEmails={bccEmails} setBccEmails={setBccEmails}
                verifiedSenders={verifiedSenders}
                attachments={attachments} setAttachments={setAttachments}
                gmailAnnotationEnabled={gmailAnnotationEnabled} setGmailAnnotationEnabled={setGmailAnnotationEnabled}
                gmailImageUrl={gmailImageUrl} setGmailImageUrl={setGmailImageUrl}
                gmailDealText={gmailDealText} setGmailDealText={setGmailDealText}
                gmailDescription={gmailDescription} setGmailDescription={setGmailDescription}
                gmailOfferCode={gmailOfferCode} setGmailOfferCode={setGmailOfferCode}
                gmailStartsAt={gmailStartsAt} setGmailStartsAt={setGmailStartsAt}
                gmailExpiresAt={gmailExpiresAt} setGmailExpiresAt={setGmailExpiresAt}
                utmEnabled={utmEnabled} setUtmEnabled={setUtmEnabled}
                utmSource={utmSource} setUtmSource={setUtmSource}
                utmMedium={utmMedium} setUtmMedium={setUtmMedium}
                utmCampaign={utmCampaign} setUtmCampaign={setUtmCampaign}
                utmCustomParams={utmCustomParams} setUtmCustomParams={setUtmCustomParams}
                htmlBody={htmlBody} setHtmlBody={setHtmlBody}
                variables={variables}
                emailTemplate={emailTemplate} setEmailTemplate={setEmailTemplate}
                selectedTemplateId={selectedTemplateId}
                selectedLayout={selectedLayout}
                editorMode={editorMode} setEditorMode={setEditorMode}
                templates={templates}
                onSelectLayout={(key) => {
                  const template = starterTemplateForLayout(key)
                  setSelectedLayout(key)
                  setSelectedTemplateId(null)
                  setEmailTemplate(template)
                  setHtmlBody(compileToHtml(template))
                  setVariables([])
                }}
                onSelectTemplate={(template) => {
                  const storedEmailTemplate = isEmailTemplate(template.emailBuilderTemplate) ? template.emailBuilderTemplate : null
                  setSelectedTemplateId(template.id)
                  setSelectedLayout('')
                  if (storedEmailTemplate) {
                    const syncedTemplate = {
                      ...storedEmailTemplate,
                      subject: template.subject ?? subject,
                      previewText,
                    }
                    setEmailTemplate(syncedTemplate)
                    setHtmlBody(compileToHtml(syncedTemplate))
                  } else {
                    setHtmlBody(template.htmlBody ?? BLANK_HTML)
                  }
                  setSubject(template.subject ?? subject)
                  setVariables(template.variables ?? [])
                  setEditorMode(storedEmailTemplate ? 'visual' : 'preview')
                }}
                onPreviewTemplate={setPreviewTemplate}
                inputClass={inputClass}
              />
            ) : isWhatsapp ? (
              <Step2WhatsappContent
                templates={whatsappTemplates}
                selectedTemplateId={selectedTemplateId}
                variables={variables}
                onSelectTemplate={(template) => {
                  setSelectedTemplateId(template.id)
                  setBodyText(template.bodyText)
                  setVariables(seedWhatsappTemplateVariables(template))
                }}
                onSync={() => syncWhatsappTemplates.mutate()}
                syncing={syncWhatsappTemplates.isPending}
                inputClass={inputClass}
              />
            ) : (
              <Step2TextContent
                channel={channel}
                bodyText={bodyText} setBodyText={setBodyText}
                pushTitle={pushTitle} setPushTitle={setPushTitle}
                pushImageUrl={pushImageUrl} setPushImageUrl={setPushImageUrl}
                templates={templates}
                variables={variables}
                setVariables={setVariables}
                utmEnabled={utmEnabled} setUtmEnabled={setUtmEnabled}
                utmSource={utmSource} setUtmSource={setUtmSource}
                utmMedium={utmMedium} setUtmMedium={setUtmMedium}
                utmCampaign={utmCampaign} setUtmCampaign={setUtmCampaign}
                utmCustomParams={utmCustomParams} setUtmCustomParams={setUtmCustomParams}
                inputClass={inputClass}
              />
            )}

            <VariablePanel
              variables={variables}
              onChange={setVariables}
              contentSources={[
                isEmail ? subject : channel === 'push' ? pushTitle : null,
                isEmail ? htmlBody : bodyText,
                supportsLinkTracking ? utmSource : null,
                supportsLinkTracking ? utmMedium : null,
                supportsLinkTracking ? utmCampaign : null,
                ...utmCustomParams.map(p => p.value),
                abTestEnabled ? abVariantBSubject : null,
                abTestEnabled ? abVariantBHtmlBody : null,
                abTestEnabled ? abVariantBBodyText : null,
              ]}
              preview={{
                subject: isEmail ? subject : channel === 'push' ? pushTitle : null,
                htmlBody: isEmail ? htmlBody : null,
                bodyText: !isEmail ? bodyText : null,
              }}
            />
            {saveValidationIssues.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
                  <Info className="h-4 w-4" />
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
            scheduleTimezone={scheduleTimezone} setScheduleTimezone={setScheduleTimezone}
            periodicFrequency={periodicFrequency} setPeriodicFrequency={setPeriodicFrequency}
            periodicDayOfWeek={periodicDayOfWeek} setPeriodicDayOfWeek={setPeriodicDayOfWeek}
            periodicDayOfMonth={periodicDayOfMonth} setPeriodicDayOfMonth={setPeriodicDayOfMonth}
            periodicTime={periodicTime} setPeriodicTime={setPeriodicTime}
            periodicEndsAt={periodicEndsAt} setPeriodicEndsAt={setPeriodicEndsAt}
            conversionGoals={conversionGoals} setConversionGoals={setConversionGoals}
            goalTrackingHours={goalTrackingHours} setGoalTrackingHours={setGoalTrackingHours}
            currency={currency} setCurrency={setCurrency}
            deliveryLimit={deliveryLimit} setDeliveryLimit={setDeliveryLimit}
            ignoreFreqCapping={ignoreFreqCapping} setIgnoreFreqCapping={setIgnoreFreqCapping}
            countForFreqCapping={countForFreqCapping} setCountForFreqCapping={setCountForFreqCapping}
            inputClass={inputClass} selectClass={selectClass}
          />
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex items-center justify-between mt-8 pt-5 border-t border-border">
        <button
          onClick={goPrev}
          disabled={step === 1}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface hover:border-text-muted/30 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-4 w-4" />
          {step > 1 ? STEPS[step - 2]?.label ?? 'Previous' : 'Previous'}
        </button>
        <div className="flex items-center gap-3">
          {step < 3 ? (
            <button
              onClick={goNext}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-accent/10 hover:shadow-md hover:shadow-accent/15"
            >
              {STEPS[step]?.label ?? 'Next'}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSaveDraft}
              disabled={!canSave || createCampaign.isPending}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-accent/10 hover:shadow-md hover:shadow-accent/15"
            >
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
  channel, name, setName, tags, setTags, contentType, setContentType,
  subscriptionCategories, subscriptionCategoryIds, setSubscriptionCategoryIds,
  audienceMode, setAudienceMode, segmentId, setSegmentId,
  audienceFilter, setAudienceFilter,
  excludeAudienceEnabled, setExcludeAudienceEnabled, excludeAudienceFilter, setExcludeAudienceFilter,
  audienceCapEnabled, setAudienceCapEnabled, audienceCap, setAudienceCap,
  controlGroupEnabled, setControlGroupEnabled, controlGroupPct, setControlGroupPct,
  segments, selectedSegment,
  showReachability, setShowReachability,
  audiencePreview, onPreviewAudience, previewPending,
  inputClass, selectClass,
}: {
  channel: CampaignChannel
  name: string; setName: (v: string) => void
  tags: string[]; setTags: (v: string[]) => void
  contentType: CampaignContentType; setContentType: (v: CampaignContentType) => void
  subscriptionCategories: Array<{ id: string; name: string; description: string | null; channel: CampaignChannel | 'whatsapp' | null }>
  subscriptionCategoryIds: string[]; setSubscriptionCategoryIds: (v: string[]) => void
  audienceMode: 'all' | 'segment' | 'filter'; setAudienceMode: (v: 'all' | 'segment' | 'filter') => void
  segmentId: string; setSegmentId: (v: string) => void
  audienceFilter: FilterConfig; setAudienceFilter: (v: FilterConfig) => void
  excludeAudienceEnabled: boolean; setExcludeAudienceEnabled: (v: boolean) => void
  excludeAudienceFilter: FilterConfig; setExcludeAudienceFilter: (v: FilterConfig) => void
  audienceCapEnabled: boolean; setAudienceCapEnabled: (v: boolean) => void
  audienceCap: string; setAudienceCap: (v: string) => void
  controlGroupEnabled: boolean; setControlGroupEnabled: (v: boolean) => void
  controlGroupPct: number; setControlGroupPct: (v: number) => void
  segments: Array<{ id: string; name: string; memberCount: number }>
  selectedSegment?: { id: string; name: string; memberCount: number }
  showReachability: boolean; setShowReachability: (v: boolean) => void
  audiencePreview: CampaignAudiencePreview | null
  onPreviewAudience: () => void
  previewPending: boolean
  inputClass: string; selectClass: string
}) {
  const reachable = selectedSegment ? Math.round(selectedSegment.memberCount * 0.9) : 0
  const reachablePct = selectedSegment && selectedSegment.memberCount > 0
    ? ((reachable / selectedSegment.memberCount) * 100).toFixed(1) : '0'

  const channelLabel = CHANNEL_LABELS[channel] ?? 'Email'

  // Inline tag input — comma + Enter both commit; backspace on empty input
  // pops the last chip. Same UX as Linear / Notion / Stripe tag pickers.
  const [tagDraft, setTagDraft] = useState('')
  const commitTag = () => {
    const next = tagDraft.trim()
    if (!next || tags.includes(next)) { setTagDraft(''); return }
    setTags([...tags, next])
    setTagDraft('')
  }
  const removeTag = (t: string) => setTags(tags.filter(x => x !== t))
  const toggleSubscriptionCategory = (id: string) => {
    setSubscriptionCategoryIds(
      subscriptionCategoryIds.includes(id)
        ? subscriptionCategoryIds.filter(x => x !== id)
        : [...subscriptionCategoryIds, id],
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Campaign Name */}
      <div className="bg-white border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          Campaign Name<span className="text-red-400">*</span>
        </label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. Summer Sale 2024 ${channelLabel}`} className={inputClass} autoFocus />
      </div>

      {/* Tags */}
      <div className="bg-white border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-text-primary mb-1.5">Tags</label>
        <p className="text-xs text-text-muted mb-3">Optional labels for organising the campaign list. Press Enter or comma to add.</p>
        <div className={cn(inputClass, 'h-auto min-h-10 flex flex-wrap items-center gap-1.5 py-1.5')}>
          {tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 text-accent text-xs font-medium">
              {t}
              <button type="button" onClick={() => removeTag(t)} className="hover:opacity-70" aria-label={`Remove ${t}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTag() }
              else if (e.key === 'Backspace' && tagDraft === '' && tags.length > 0) { removeTag(tags[tags.length - 1]) }
            }}
            onBlur={commitTag}
            placeholder={tags.length === 0 ? 'e.g. q3-launch, india' : ''}
            className="flex-1 min-w-[120px] outline-none bg-transparent text-sm placeholder:text-text-muted/60"
          />
        </div>
      </div>

      {/* Content Type — selectable cards */}
      <div className="bg-white border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-text-primary mb-3">
          Content type
        </label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'promotional' as const, label: 'Promotional', description: 'Marketing messages with frequency capping', icon: Zap },
            { value: 'transactional' as const, label: 'Transactional', description: 'Always delivered, bypasses frequency caps', icon: ShieldCheck },
          ]).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setContentType(opt.value)}
              className={cn(
                'flex items-start gap-3 p-4 rounded-lg border text-left transition-all duration-150',
                contentType === opt.value
                  ? 'border-accent bg-accent/[0.03] ring-1 ring-accent/20'
                  : 'border-border hover:border-text-muted/30',
              )}
            >
              <div className={cn(
                'mt-0.5 p-2 rounded-lg transition-colors duration-150',
                contentType === opt.value ? 'bg-accent/10' : 'bg-surface',
              )}>
                <opt.icon className={cn('h-4 w-4', contentType === opt.value ? 'text-accent' : 'text-text-muted')} />
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary">{opt.label}</div>
                <div className="text-xs text-text-muted mt-0.5 leading-relaxed">{opt.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Subscription categories */}
      {contentType === 'promotional' && (
        <div className="bg-white border border-border rounded-xl p-6">
          <label className="block text-sm font-medium text-text-primary mb-1.5">Subscription category</label>
          <p className="text-xs text-text-muted mb-3">Restrict this campaign to users opted into specific message categories.</p>
          <div className="space-y-2">
            {subscriptionCategories.map(category => {
              const selected = subscriptionCategoryIds.includes(category.id)
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleSubscriptionCategory(category.id)}
                  className={cn(
                    'w-full flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all duration-150',
                    selected
                      ? 'border-accent bg-accent/[0.03] ring-1 ring-accent/20'
                      : 'border-border hover:border-text-muted/30',
                  )}
                >
                  <span className={cn(
                    'mt-0.5 h-4 w-4 rounded border flex-shrink-0',
                    selected ? 'border-accent bg-accent shadow-inner' : 'border-border bg-white',
                  )}>
                    {selected && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-text-primary">{category.name}</span>
                    {category.description && (
                      <span className="block text-xs text-text-muted mt-0.5">{category.description}</span>
                    )}
                  </span>
                </button>
              )
            })}
            {subscriptionCategories.length === 0 && (
              <p className="text-xs text-text-muted rounded-lg border border-dashed border-border p-3">
                No subscription categories have been configured yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Audience */}
      <div className="bg-white border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-text-primary mb-3">Audience</label>

        {/* Audience mode — three modes: all users / saved segment / inline filter */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {([
            { value: 'all' as const, label: 'All users', description: 'Everyone in this project', icon: Users },
            { value: 'segment' as const, label: 'Saved segment', description: 'Pick from existing segments', icon: Target },
            { value: 'filter' as const, label: 'Custom filter', description: 'Build inline — no save needed', icon: Layers },
          ]).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAudienceMode(opt.value)}
              className={cn(
                'flex flex-col items-start gap-2 p-3.5 rounded-lg border text-left transition-all duration-150',
                audienceMode === opt.value
                  ? 'border-accent bg-accent/[0.03] ring-1 ring-accent/20'
                  : 'border-border hover:border-text-muted/30',
              )}
            >
              <div className={cn(
                'p-1.5 rounded-md transition-colors duration-150',
                audienceMode === opt.value ? 'bg-accent/10' : 'bg-surface',
              )}>
                <opt.icon className={cn('h-3.5 w-3.5', audienceMode === opt.value ? 'text-accent' : 'text-text-muted')} />
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary">{opt.label}</div>
                <div className="text-[11px] text-text-muted mt-0.5 leading-tight">{opt.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Saved segment selector */}
        {audienceMode === 'segment' && (
          <div className="space-y-3">
            <select value={segmentId} onChange={e => { setSegmentId(e.target.value); setShowReachability(true) }} className={selectClass}>
              <option value="">Choose a segment...</option>
              {segments.map(s => <option key={s.id} value={s.id}>{s.name} — {s.memberCount.toLocaleString()} members</option>)}
            </select>

            {segmentId && selectedSegment && (
              <div className="flex items-center gap-4 p-4 bg-surface rounded-lg">
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-text-primary tabular-nums">{reachable.toLocaleString()}</span>
                    <span className="text-xs text-text-muted">reachable via {channelLabel}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${reachablePct}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-accent tabular-nums">{reachablePct}%</div>
                  <div className="text-[11px] text-text-muted">of {selectedSegment.memberCount.toLocaleString()}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Inline filter — same builder the segments page uses, evaluated by
            the same engine at staging time. No "save segment" step required. */}
        {audienceMode === 'filter' && (
          <div className="rounded-lg border border-border bg-surface/40 p-3">
            <SegmentFilterBuilder filters={audienceFilter} onChange={setAudienceFilter} />
            {audienceFilter.rules.length === 0 && (
              <p className="text-xs text-text-muted mt-3">
                Add at least one rule above. Without rules, the filter has no effect — use "All users" instead.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <label className="block text-sm font-medium text-text-primary">Exclude users</label>
            <p className="text-xs text-text-muted mt-0.5">Remove users matching a filter from the selected audience.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={excludeAudienceEnabled}
            onClick={() => setExcludeAudienceEnabled(!excludeAudienceEnabled)}
            className={cn(
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-150',
              excludeAudienceEnabled ? 'bg-accent' : 'bg-border',
            )}
          >
            <span className={cn(
              'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150',
              excludeAudienceEnabled ? 'translate-x-4' : 'translate-x-0',
            )} />
          </button>
        </div>
        {excludeAudienceEnabled && (
          <div className="rounded-lg border border-border bg-surface/40 p-3">
            <SegmentFilterBuilder filters={excludeAudienceFilter} onChange={setExcludeAudienceFilter} />
            {excludeAudienceFilter.rules.length === 0 && (
              <p className="text-xs text-text-muted mt-3">Add rules to exclude users from this campaign.</p>
            )}
          </div>
        )}
      </div>

      {/* Audience cap — limit recipient count even if audience is larger.
          Useful for staged rollouts ("send to 1,000 first") and rate-limit
          tests. Cap is enforced at staging time as a LIMIT on the page query. */}
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <label className="block text-sm font-medium text-text-primary">Audience cap</label>
            <p className="text-xs text-text-muted mt-0.5">Limit total recipients regardless of audience size.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={audienceCapEnabled}
            onClick={() => setAudienceCapEnabled(!audienceCapEnabled)}
            className={cn(
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-150',
              audienceCapEnabled ? 'bg-accent' : 'bg-border',
            )}
          >
            <span className={cn(
              'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150',
              audienceCapEnabled ? 'translate-x-4' : 'translate-x-0',
            )} />
          </button>
        </div>
        {audienceCapEnabled && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={audienceCap}
              onChange={e => setAudienceCap(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 1000"
              className={cn(inputClass, 'max-w-xs')}
            />
            <span className="text-sm text-text-muted">recipients max</span>
          </div>
        )}
      </div>

      {/* Control group — deterministic holdout split for lift measurement.
          Same customer always falls in the same bucket for a given seed, so
          re-running the campaign produces identical splits (audit-safe).
          Cap is 50% — anything higher means you're testing "send" as the
          experiment, which inverts the analysis. */}
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <label className="block text-sm font-medium text-text-primary">Control group</label>
            <p className="text-xs text-text-muted mt-0.5">Hold a % of the audience back to measure incremental lift vs no-send.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={controlGroupEnabled}
            onClick={() => setControlGroupEnabled(!controlGroupEnabled)}
            className={cn(
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-150',
              controlGroupEnabled ? 'bg-accent' : 'bg-border',
            )}
          >
            <span className={cn(
              'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150',
              controlGroupEnabled ? 'translate-x-4' : 'translate-x-0',
            )} />
          </button>
        </div>
        {controlGroupEnabled && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={50}
                value={controlGroupPct}
                onChange={e => setControlGroupPct(parseInt(e.target.value))}
                className="flex-1 accent-accent"
              />
              <div className="flex items-center gap-1 w-16">
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(controlGroupPct)}
                  onChange={e => setControlGroupPct(Math.max(1, Math.min(50, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)))}
                  className={cn(inputClass, 'w-14 h-8 text-center')}
                />
                <span className="text-xs text-text-muted">%</span>
              </div>
            </div>
            <p className="text-[11px] text-text-muted">
              {controlGroupPct}% held back, {100 - controlGroupPct}% receive the campaign. Split is deterministic per customer.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary">Audience preview</label>
            <p className="text-xs text-text-muted mt-0.5">Calculate reachability, consent blocks, category blocks, holdout, and cap before saving.</p>
          </div>
          <button
            type="button"
            onClick={onPreviewAudience}
            disabled={previewPending}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-border rounded-lg bg-white hover:bg-surface transition-colors disabled:opacity-50"
          >
            {previewPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Preview
          </button>
        </div>
        {audiencePreview && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Candidates', audiencePreview.totalCandidates],
              ['Reachable', audiencePreview.reachable],
              ['Deliverable', audiencePreview.deliverable],
              ['Recipients', audiencePreview.estimatedRecipients],
              ['Suppressed', audiencePreview.suppressed],
              ['Opted out', audiencePreview.optedOut],
              ['Category blocked', audiencePreview.subscriptionBlocked],
              ['24h window blocked', audiencePreview.serviceWindowBlocked],
              ['Holdouts', audiencePreview.estimatedHoldouts],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-surface/40 p-3">
                <div className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">{label}</div>
                <div className="text-lg font-semibold text-text-primary tabular-nums mt-0.5">{Number(value).toLocaleString()}</div>
              </div>
            ))}
            {audiencePreview.warning && (
              <div className="col-span-2 sm:col-span-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {audiencePreview.warning}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Step 2: Email Content (unchanged from before) ─── */

type TemplateItem = {
  id: string
  name: string
  htmlBody?: string | null
  emailBuilderTemplate?: Record<string, unknown> | null
  subject?: string | null
  bodyText?: string | null
  variables?: TemplateVariable[]
}

function isEmailTemplate(value: unknown): value is EmailTemplate {
  if (!value || typeof value !== 'object') return false
  const template = value as Partial<EmailTemplate>
  return Array.isArray(template.blocks)
    && !!template.globalStyles
    && typeof template.globalStyles === 'object'
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

function BasicLayoutPreview({ layoutKey }: { layoutKey: string }) {
  const columns = layoutKey === '4col' || layoutKey === 'product-grid' ? 4 : layoutKey === '3col' ? 3 : layoutKey === '2col' || layoutKey === 'cart' || layoutKey === 'newsletter' ? 2 : 0

  if (layoutKey === 'blank') {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <Plus className="h-14 w-14 text-text-secondary" />
      </div>
    )
  }

  if (layoutKey === 'promo') {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex h-24 items-center justify-center bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100">
          <div className="h-14 w-20 rounded-lg border-4 border-gray-300 bg-gray-100 shadow-sm" />
        </div>
        <div className="space-y-3 px-8 py-6 text-center">
          <div className="mx-auto h-4 w-40 rounded bg-gray-300" />
          <div className="mx-auto h-2.5 w-52 rounded bg-gray-200" />
          <div className="mx-auto h-8 w-24 rounded-md bg-sky-400" />
        </div>
        <div className="grid flex-1 grid-cols-3 gap-3 px-6 pb-5">
          {Array.from({ length: 3 }).map((_, idx) => <div key={idx} className="rounded-md bg-gray-100" />)}
        </div>
      </div>
    )
  }

  if (layoutKey === 'cart') {
    return (
      <div className="flex h-full flex-col bg-white px-7 py-6">
        <div className="mx-auto mb-3 h-4 w-36 rounded bg-gray-300" />
        <div className="mx-auto mb-6 h-2.5 w-48 rounded bg-gray-200" />
        <div className="grid flex-1 grid-cols-2 gap-5">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              <div className="aspect-square rounded-lg bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100" />
              <div className="h-2.5 rounded bg-gray-200" />
              <div className="h-7 rounded-md bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (layoutKey === 'newsletter') {
    return (
      <div className="flex h-full flex-col bg-white px-7 py-6">
        <div className="mb-3 h-4 w-36 rounded bg-gray-300" />
        <div className="mb-2 h-2.5 w-full rounded bg-gray-200" />
        <div className="mb-5 h-2.5 w-3/4 rounded bg-gray-200" />
        <div className="h-px bg-gray-200" />
        <div className="grid flex-1 grid-cols-2 gap-5 py-5">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              <div className="h-20 rounded-lg bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100" />
              <div className="h-2.5 rounded bg-gray-300" />
              <div className="h-2 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="h-12 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100" />
      <div className="h-4 bg-white" />
      <div className="grid flex-1 gap-4 px-7 py-5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, idx) => (
          <div key={idx} className="space-y-2">
            <div className="aspect-square rounded-md bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100 shadow-sm" />
            <div className="h-2.5 rounded bg-gray-200" />
            {(layoutKey === '4col' || layoutKey === 'product-grid') && <div className="h-6 rounded-md bg-sky-400" />}
          </div>
        ))}
      </div>
    </div>
  )
}

function Step2EmailContent({
  subject, setSubject, previewText, setPreviewText,
  fromName, setFromName, fromEmail, setFromEmail, replyToEmail, setReplyToEmail,
  ccEmails, setCcEmails, bccEmails, setBccEmails,
  verifiedSenders,
  attachments, setAttachments,
  gmailAnnotationEnabled, setGmailAnnotationEnabled,
  gmailImageUrl, setGmailImageUrl,
  gmailDealText, setGmailDealText,
  gmailDescription, setGmailDescription,
  gmailOfferCode, setGmailOfferCode,
  gmailStartsAt, setGmailStartsAt,
  gmailExpiresAt, setGmailExpiresAt,
  utmEnabled, setUtmEnabled,
  utmSource, setUtmSource,
  utmMedium, setUtmMedium,
  utmCampaign, setUtmCampaign,
  utmCustomParams, setUtmCustomParams,
  htmlBody, setHtmlBody, variables, emailTemplate, setEmailTemplate,
  selectedTemplateId, selectedLayout,
  editorMode, setEditorMode,
  templates, onSelectLayout, onSelectTemplate, onPreviewTemplate,
  inputClass,
}: {
  subject: string; setSubject: (v: string) => void
  previewText: string; setPreviewText: (v: string) => void
  fromName: string; setFromName: (v: string) => void
  fromEmail: string; setFromEmail: (v: string) => void
  replyToEmail: string; setReplyToEmail: (v: string) => void
  ccEmails: string; setCcEmails: (v: string) => void
  bccEmails: string; setBccEmails: (v: string) => void
  verifiedSenders: ProjectEmailSender[]
  attachments: DraftAttachment[]; setAttachments: (v: DraftAttachment[]) => void
  gmailAnnotationEnabled: boolean; setGmailAnnotationEnabled: (v: boolean) => void
  gmailImageUrl: string; setGmailImageUrl: (v: string) => void
  gmailDealText: string; setGmailDealText: (v: string) => void
  gmailDescription: string; setGmailDescription: (v: string) => void
  gmailOfferCode: string; setGmailOfferCode: (v: string) => void
  gmailStartsAt: string; setGmailStartsAt: (v: string) => void
  gmailExpiresAt: string; setGmailExpiresAt: (v: string) => void
  utmEnabled: boolean; setUtmEnabled: (v: boolean) => void
  utmSource: string; setUtmSource: (v: string) => void
  utmMedium: string; setUtmMedium: (v: string) => void
  utmCampaign: string; setUtmCampaign: (v: string) => void
  utmCustomParams: CampaignUtmParameter[]; setUtmCustomParams: (v: CampaignUtmParameter[]) => void
  htmlBody: string; setHtmlBody: (v: string) => void
  variables: TemplateVariable[]
  emailTemplate: EmailTemplate; setEmailTemplate: (v: EmailTemplate) => void
  selectedTemplateId: string | null
  selectedLayout: string
  editorMode: EditorMode; setEditorMode: (v: EditorMode) => void
  templates: TemplateItem[]
  onSelectLayout: (key: string) => void
  onSelectTemplate: (template: TemplateItem) => void
  onPreviewTemplate: (t: { name: string; html: string } | null) => void
  inputClass: string
}) {
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('light')
  const [sampleCustomerId, setSampleCustomerId] = useState('')
  const [templateSource, setTemplateSource] = useState<'prebuilt' | 'saved' | 'api'>('prebuilt')
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [saveTemplateMessage, setSaveTemplateMessage] = useState<string | null>(null)
  const createTemplate = useCreateTemplate()
  const customers = useCustomers({ page: 1, pageSize: 20, sortBy: 'lastSeen', sortOrder: 'desc' })
  const renderedPreview = usePreviewTemplate()
  const sampleCustomers = customers.data?.data ?? []
  const rendered = renderedPreview.data?.data.rendered
  const previewHtml = rendered?.htmlBody ?? htmlBody
  const previewSubject = rendered?.subject ?? subject
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
    if (next.length > 0) setAttachments([...attachments, ...next])
  }

  return (
    <div className="space-y-6">
      {/* Editor Mode Tabs */}
      <div className="flex flex-col gap-3 border-b border-border pb-0 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-1">
          {([
            { key: 'templates' as EditorMode, label: 'My Templates', icon: Layout },
            { key: 'visual' as EditorMode, label: 'Visual Builder', icon: Layers },
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
        <div className="flex items-center gap-2 pb-2">
          {saveTemplateMessage && <span className="text-xs text-emerald-600">{saveTemplateMessage}</span>}
          <button
            type="button"
            onClick={() => {
              onSelectLayout(selectedLayout || 'blank')
              setEditorMode('visual')
              setSaveTemplateMessage('Starter reset')
            }}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-medium text-text-primary hover:border-accent hover:text-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset starter
          </button>
          <button
            type="button"
            disabled={createTemplate.isPending}
            onClick={() => {
              setSaveTemplateMessage(null)
              createTemplate.mutate({
                name: `${subject || 'Campaign email template'} copy`,
                channel: 'email',
                subject,
                htmlBody,
                emailBuilderTemplate: { ...emailTemplate, subject, previewText },
                variables,
              }, {
                onSuccess: () => {
                  setSaveTemplateMessage('Template duplicated')
                  setTemplateSource('saved')
                },
                onError: (error) => setSaveTemplateMessage(error instanceof Error ? error.message : 'Failed to duplicate template'),
              })
            }}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-medium text-text-primary hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {createTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              setSaveTemplateOpen(v => !v)
              setSaveTemplateMessage(null)
              if (!saveTemplateName) setSaveTemplateName(subject || 'Campaign email template')
            }}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-medium text-text-primary hover:border-accent hover:text-accent"
          >
            <Save className="h-3.5 w-3.5" />
            Save as template
          </button>
        </div>
      </div>

      {saveTemplateOpen && (
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Template name</label>
              <input
                value={saveTemplateName}
                onChange={e => setSaveTemplateName(e.target.value)}
                placeholder="Campaign email template"
                className={inputClass}
              />
            </div>
            <button
              type="button"
              disabled={createTemplate.isPending || !saveTemplateName.trim()}
              onClick={() => {
                setSaveTemplateMessage(null)
                createTemplate.mutate({
                  name: saveTemplateName.trim(),
                  channel: 'email',
                  subject,
                  htmlBody,
                  emailBuilderTemplate: { ...emailTemplate, subject, previewText },
                  variables,
                }, {
                  onSuccess: () => {
                    setSaveTemplateMessage('Template saved')
                    setSaveTemplateOpen(false)
                    setTemplateSource('saved')
                  },
                  onError: (error) => setSaveTemplateMessage(error instanceof Error ? error.message : 'Failed to save template'),
                })
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {createTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save template
            </button>
          </div>
        </div>
      )}

      {editorMode === 'templates' && (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="grid min-h-[640px] grid-cols-[280px_minmax(0,1fr)]">
            <aside className="border-r border-border bg-surface/30">
              <div className="border-b border-border p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input placeholder="Search template & folder" className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20" />
                </div>
              </div>
              <div className="border-b border-border p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Filter className="h-4 w-4 text-text-muted" />
                    Filters
                  </div>
                  <button type="button" onClick={() => setTemplateSource('prebuilt')} className="text-xs font-medium text-accent">Reset</button>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-text-muted uppercase">Template source</p>
                  {([
                    { key: 'prebuilt' as const, label: 'Pre-built' },
                    { key: 'saved' as const, label: 'Saved templates' },
                    { key: 'api' as const, label: 'API templates' },
                  ]).map(source => (
                    <button
                      key={source.key}
                      type="button"
                      onClick={() => setTemplateSource(source.key)}
                      className="flex w-full items-center gap-3 text-left text-sm text-text-primary"
                    >
                      <span className={cn('h-5 w-5 rounded-full border flex items-center justify-center', templateSource === source.key ? 'border-accent' : 'border-border')}>
                        {templateSource === source.key && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                      </span>
                      {source.label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <section className="min-w-0">
              <div className="flex items-center gap-6 border-b border-border px-5 pt-4">
                {([
                  { key: 'drag' as const, label: 'Drag and drop editor' },
                  { key: 'html' as const, label: 'Custom HTML editor' },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => tab.key === 'html' ? setEditorMode('html') : setEditorMode('templates')}
                    className={cn(
                      'border-b-2 px-1 pb-3 text-sm font-medium',
                      tab.key === 'drag' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {templateSource === 'prebuilt' && (
                  <div>
                    {['Basic templates', 'Prebuilt templates'].map(group => (
                      <div key={group} className="mb-8 last:mb-0">
                        <h3 className="mb-4 text-sm font-semibold text-text-secondary">{group}</h3>
                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                          {LAYOUT_STARTERS.filter(layout => layout.group === group).map(layout => {
                            const isSelected = selectedLayout === layout.key && !selectedTemplateId
                            const LayoutIcon = layout.icon
                            return (
                              <button
                                key={layout.key}
                                type="button"
                                onClick={() => {
                                  onSelectLayout(layout.key)
                                  setEditorMode('visual')
                                }}
                                className={cn(
                                  'overflow-hidden rounded-lg border bg-white text-left transition-all hover:border-accent hover:shadow-sm',
                                  isSelected ? 'border-accent ring-1 ring-accent/20' : 'border-border',
                                )}
                              >
                                <div className="h-52 border-b border-border bg-white">
                                  <BasicLayoutPreview layoutKey={layout.key} />
                                </div>
                                <div className="flex items-start gap-3 px-4 py-3">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100">
                                    <LayoutIcon className="h-4 w-4 text-cyan-700" />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium text-text-primary">{layout.label}</span>
                                    <span className="mt-0.5 block text-xs leading-5 text-text-muted">{layout.description}</span>
                                  </span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {templateSource === 'saved' && (
                  <div>
                    <h3 className="mb-4 text-sm font-semibold text-text-secondary">Saved templates</h3>
                    {templates.length > 0 ? (
                      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                        {templates.map(t => (
                          <TemplatePreviewCard key={t.id} name={t.name} htmlBody={t.htmlBody} subject={t.subject}
                            selected={selectedTemplateId === t.id}
                            onChoose={() => {
                              onSelectTemplate(t)
                            }}
                            onPreview={() => onPreviewTemplate({ name: t.name, html: t.htmlBody ?? '' })}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-muted">No saved templates yet.</div>
                    )}
                  </div>
                )}

                {templateSource === 'api' && (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-muted">
                    API templates will appear here once external template sync is configured.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {editorMode === 'visual' && (
        <EmailBuilder
          value={emailTemplate}
          aiContext={{
            subject,
            previewText,
            fullHtml: htmlBody,
            campaignGoal: `Email campaign${subject ? ` about ${subject}` : ''}`,
          }}
          onChange={(t) => {
            setEmailTemplate(t)
            setHtmlBody(compileToHtml(t))
          }}
        />
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
          <div className="px-5 py-3 bg-surface border-b border-border flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Email Preview</h2>
            <div className="flex flex-wrap items-center gap-3">
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
            </div>
          </div>
          {renderedPreview.data?.data && (
            <div className="border-b border-border bg-emerald-50 px-5 py-2 text-xs text-emerald-700">
              Rendered with {renderedPreview.data.data.sampleCustomer.name || renderedPreview.data.data.sampleCustomer.email || renderedPreview.data.data.sampleSource}.
            </div>
          )}
          <div className="p-5 bg-surface/40">
            <div className={cn('mx-auto border border-border rounded-lg overflow-hidden bg-white transition-all', previewDevice === 'mobile' ? 'w-[375px] max-w-full' : 'w-full max-w-[640px]')}>
              <iframe srcDoc={emailPreviewSrcDoc(previewHtml, previewTheme)} title="Email Preview" className="w-full h-[500px]" sandbox="allow-same-origin" />
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
              <input value={ccEmails} onChange={e => setCcEmails(e.target.value)} placeholder="ops@example.com, finance@example.com" className={inputClass} />
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
      />

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
          {attachments.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border">
              {attachments.map(file => (
                <div key={file.localId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{file.filename}</p>
                    <p className="text-xs text-text-muted">{formatBytes(file.sizeBytes)} · {file.mime}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachments(attachments.filter(item => item.localId !== file.localId))}
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
    </div>
  )
}

/* ─── Step 2: WhatsApp Template Content ─── */

function Step2WhatsappContent({
  templates,
  selectedTemplateId,
  variables,
  onSelectTemplate,
  onSync,
  syncing,
  inputClass,
}: {
  templates: WhatsappTemplate[]
  selectedTemplateId: string | null
  variables: TemplateVariable[]
  onSelectTemplate: (template: WhatsappTemplate) => void
  onSync: () => void
  syncing: boolean
  inputClass: string
}) {
  const providerStatus = useWhatsappProviderStatus()
  const submitTemplate = useSubmitWhatsappTemplate()
  const refreshStatus = useRefreshTemplateStatus()
  const testSend = useTestSendWhatsappTemplate()
  const [testPhone, setTestPhone] = useState('')
  const approved = templates.filter(t => t.status === 'APPROVED')
  const pending = templates.filter(t => !['APPROVED'].includes(t.status))
  const selected = approved.find(t => t.id === selectedTemplateId) ?? null
  const headerType = (selected?.header?.format ?? selected?.header?.type ?? '').toUpperCase()
  const mediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)
  const urlButtons = selected?.buttons?.filter(b => b.type?.toUpperCase() === 'URL') ?? []
  const customers = useCustomers({ page: 1, pageSize: 20, sortBy: 'lastSeen', sortOrder: 'desc' })
  const renderedPreview = usePreviewTemplate()
  const sampleCustomers = customers.data?.data ?? []
  const [sampleCustomerId, setSampleCustomerId] = useState('')
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [draftTemplate, setDraftTemplate] = useState<SubmitInput>({
    name: '',
    language: 'en_US',
    category: 'MARKETING',
    bodyText: '',
    footer: '',
  })
  const provider = providerStatus.data?.data
  const canSubmitTemplate = !!provider?.configured && !!provider.capabilities.submitTemplate
  const draftParamCount = countWhatsappTemplateParameters(draftTemplate.bodyText)
  const previewBody = renderedPreview.data?.data.rendered.bodyText ?? selected?.bodyText ?? ''
  const grouped = approved.reduce<Record<string, WhatsappTemplate[]>>((acc, template) => {
    acc[template.name] = [...(acc[template.name] ?? []), template]
    return acc
  }, {})
  const submitForApproval = () => {
    submitTemplate.mutate({
      ...draftTemplate,
      bodyExample: draftParamCount > 0
        ? Array.from({ length: draftParamCount }, (_, idx) => draftTemplate.bodyExample?.[idx]?.trim() || whatsappSampleValue(idx))
        : undefined,
    }, {
      onSuccess: () => {
        setShowTemplateForm(false)
        setDraftTemplate({
          name: '',
          language: 'en_US',
          category: 'MARKETING',
          bodyText: '',
          footer: '',
        })
      },
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-3 bg-surface border-b border-border">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">WhatsApp Template</h2>
          </div>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary border border-border rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div className={cn('rounded-lg border p-4', canSubmitTemplate ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={cn('text-sm font-semibold', canSubmitTemplate ? 'text-emerald-900' : 'text-amber-900')}>
                  {provider?.provider ? `Connected provider: ${provider.provider}` : 'No WhatsApp provider connected'}
                </p>
                <p className={cn('mt-1 text-xs', canSubmitTemplate ? 'text-emerald-700' : 'text-amber-800')}>
                  Create a template here, submit it for provider approval, then sync/refresh until it is approved and selectable.
                </p>
                {provider?.missingConfig?.length ? (
                  <p className="mt-1 text-xs text-amber-800">Missing config: {provider.missingConfig.join(', ')}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowTemplateForm(v => !v)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-accent/30 bg-white px-3 text-xs font-semibold text-accent hover:bg-accent/5"
              >
                {showTemplateForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {showTemplateForm ? 'Close' : 'Create template'}
              </button>
            </div>

            {showTemplateForm && (
              <div className="mt-4 rounded-lg border border-border bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">Name</label>
                    <input
                      value={draftTemplate.name}
                      onChange={e => setDraftTemplate(t => ({ ...t, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                      placeholder="campaign_offer"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">Language</label>
                    <input
                      value={draftTemplate.language}
                      onChange={e => setDraftTemplate(t => ({ ...t, language: e.target.value }))}
                      placeholder="en_US"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">Category</label>
                    <select
                      value={draftTemplate.category}
                      onChange={e => setDraftTemplate(t => ({ ...t, category: e.target.value as SubmitInput['category'] }))}
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
                    value={draftTemplate.bodyText}
                    onChange={e => setDraftTemplate(t => ({ ...t, bodyText: e.target.value }))}
                    rows={5}
                    placeholder="Hi {{1}}, your exclusive offer is ready."
                    className={cn(inputClass, 'h-28 resize-none')}
                  />
                  <p className="mt-1 text-xs text-text-muted">Use numbered Meta parameters like {'{{1}}'}, {'{{2}}'}.</p>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Footer</label>
                  <input
                    value={draftTemplate.footer ?? ''}
                    onChange={e => setDraftTemplate(t => ({ ...t, footer: e.target.value }))}
                    placeholder="Reply STOP to unsubscribe"
                    className={inputClass}
                  />
                </div>
                {draftParamCount > 0 && (
                  <div className="mt-3 rounded-lg border border-border bg-surface/60 p-3">
                    <p className="text-xs font-semibold text-text-primary">Meta review examples</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: draftParamCount }, (_, idx) => (
                        <div key={idx}>
                          <label className="mb-1 block text-xs font-medium text-text-secondary">{`{{${idx + 1}}}`} example</label>
                          <input
                            value={draftTemplate.bodyExample?.[idx] ?? ''}
                            onChange={e => setDraftTemplate(t => {
                              const examples = Array.from({ length: draftParamCount }, (_, i) => t.bodyExample?.[i] ?? whatsappSampleValue(i))
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
                    onClick={submitForApproval}
                    disabled={submitTemplate.isPending || !canSubmitTemplate || !draftTemplate.name.trim() || !draftTemplate.bodyText.trim()}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                  >
                    {submitTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Submit for approval
                  </button>
                  {!canSubmitTemplate && <span className="text-xs text-amber-700">Provider cannot submit templates or is missing required config.</span>}
                </div>
              </div>
            )}
          </div>

          {pending.length > 0 && (
            <div className="rounded-lg border border-border bg-surface/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text-primary">Pending provider approval</p>
                <button type="button" onClick={onSync} disabled={syncing} className="text-xs font-medium text-accent hover:text-accent-hover disabled:opacity-60">
                  Sync all
                </button>
              </div>
              <div className="space-y-2">
                {pending.map(template => (
                  <div key={template.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-text-primary">{template.name} · {template.language}</p>
                      <p className={cn('mt-0.5 text-[11px]', template.status === 'REJECTED' ? 'text-red-600' : 'text-amber-700')}>
                        {template.status}{template.rejectionReason ? `: ${template.rejectionReason}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => refreshStatus.mutate(template.id)}
                      disabled={refreshStatus.isPending && refreshStatus.variables === template.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] font-medium text-text-secondary hover:bg-surface disabled:opacity-60"
                    >
                      {refreshStatus.isPending && refreshStatus.variables === template.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Status
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {approved.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm font-medium text-text-primary">No approved WhatsApp templates yet</p>
              <p className="mt-1 text-xs text-text-muted">Create one above or sync templates from your provider.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([name, variants]) => (
                <div key={name} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-surface/70 border-b border-border">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{name}</p>
                      <p className="text-xs text-text-muted">{variants.length} language variant{variants.length === 1 ? '' : 's'}</p>
                    </div>
                    <span className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">APPROVED</span>
                  </div>
                  <div className="divide-y divide-border">
                    {variants.map(template => {
                      const isSelected = template.id === selectedTemplateId
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => onSelectTemplate(template)}
                          className={cn('w-full text-left px-4 py-3 transition-colors', isSelected ? 'bg-accent/5' : 'hover:bg-surface/60')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={cn('h-2 w-2 rounded-full', isSelected ? 'bg-accent' : 'bg-border')} />
                                <span className="text-xs font-semibold text-text-primary">{template.language}</span>
                                {template.category && <span className="text-[10px] text-text-muted uppercase">{template.category}</span>}
                              </div>
                              <p className="mt-1 text-xs text-text-secondary line-clamp-2">{template.bodyText}</p>
                            </div>
                            <span className="shrink-0 text-[11px] text-text-muted">{template.parameterCount} vars</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CampaignAiCopywriter
        channel="whatsapp"
        body={selected?.bodyText ?? draftTemplate.bodyText}
        onApplyBody={(value) => {
          setShowTemplateForm(true)
          setDraftTemplate(template => ({ ...template, bodyText: value }))
        }}
        inputClass={inputClass}
        lockedReason="WhatsApp sends only approved template text. Apply generated copy into the template form, submit for approval, then select it after approval."
      />

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-surface border-b border-border flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Live Preview</h2>
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
                bodyText: selected?.bodyText ?? '',
                variables,
                sampleCustomerId: sampleCustomerId || undefined,
              })}
              disabled={renderedPreview.isPending || !selected}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-accent/30 px-3 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-60"
            >
              {renderedPreview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Render data
            </button>
          </div>
        </div>
        {renderedPreview.data?.data && (
          <div className="border-b border-border bg-emerald-50 px-5 py-2 text-xs text-emerald-700">
            Rendered with {renderedPreview.data.data.sampleCustomer.name || renderedPreview.data.data.sampleCustomer.email || renderedPreview.data.data.sampleSource}.
          </div>
        )}
        <div className="p-5 bg-[#e5ddd5] min-h-[360px]">
          <WhatsappBubblePreview
            template={selected}
            previewBody={previewBody}
            substitutions={renderedPreview.data?.data.substitutions}
          />
          {selected && (
            <div className="mt-4 rounded-lg bg-white/80 border border-white/70 p-3">
              <p className="text-xs font-medium text-slate-700">Template details</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <span>Language: {selected.language}</span>
                <span>Provider: {selected.provider}</span>
                <span>Header: {selected.header?.type ?? selected.header?.format ?? 'none'}</span>
                <span>Variables: {selected.parameterCount}</span>
              </div>
              {(mediaHeader || urlButtons.length > 0) && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                  {mediaHeader && <p>Map <code>wa_header_media_url</code> for the {headerType.toLowerCase()} header.</p>}
                  {urlButtons.map((button, idx) => (
                    <p key={`${button.text}-${idx}`}>Map <code>{`wa_button_url_${idx + 1}`}</code> for URL button "{button.text}".</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Test send panel — fires a single rendered template to an
              admin-provided phone before launching the campaign. Doesn't
              touch the campaign send pipeline or frequency caps; pure
              "let me eyeball it on my phone first". */}
          {selected && (
            <div className="mt-4 rounded-lg bg-white border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-text-primary">Send a test message</p>
                <span className="text-[10px] text-text-muted">E.164 format · doesn't count against caps</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="tel"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="+919876543210"
                  className={cn(inputClass, 'h-8 flex-1 min-w-[180px]')}
                />
                <button
                  type="button"
                  onClick={() => testSend.mutate({
                    templateId: selected.id,
                    phone: testPhone.trim(),
                    variables,
                    sampleCustomerId: sampleCustomerId || undefined,
                  })}
                  disabled={!testPhone.trim() || testSend.isPending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {testSend.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send test
                </button>
              </div>
              {testSend.data?.data && (
                <p className="text-[11px] text-emerald-700">
                  ✓ Delivered to {testSend.data.data.to} (message {testSend.data.data.messageId.slice(0, 18)}…)
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * WhatsApp message bubble preview — renders a Meta-style template card so
 * the admin can eyeball the final result inside the campaign builder before
 * pressing send. Mimics what the recipient will see on their phone:
 *   - Header: text (bold) / image / video / document placeholder
 *   - Body: with variables interpolated from the preview substitutions map
 *   - Footer (if set on the template)
 *   - Buttons: distinguished by type (URL → ↗, Phone → phone icon, Quick Reply → reply)
 */
function WhatsappBubblePreview({
  template,
  previewBody,
  substitutions,
}: {
  template: WhatsappTemplate | null
  previewBody: string
  substitutions?: Record<string, string>
}) {
  const headerFormat = (template?.header?.format ?? template?.header?.type ?? '').toUpperCase()
  const headerText = template?.header?.text ?? ''
  const headerMediaUrl = substitutions?.wa_header_media_url || substitutions?.header_media_url || ''

  return (
    <div className="ml-auto max-w-[280px] rounded-lg bg-[#dcf8c6] px-3 py-2 shadow-sm">
      {/* Header — TEXT format shows bold text at top; media formats show a
          preview tile that uses the resolved media URL when available. */}
      {headerFormat === 'TEXT' && headerText && (
        <p className="mb-1.5 text-sm font-semibold text-slate-900">{headerText}</p>
      )}
      {headerFormat === 'IMAGE' && (
        headerMediaUrl
          ? <img src={headerMediaUrl} alt="" className="mb-1.5 w-full rounded object-cover max-h-40" />
          : <div className="mb-1.5 flex h-32 items-center justify-center rounded bg-slate-200 text-[11px] text-slate-500">Image header (map wa_header_media_url)</div>
      )}
      {headerFormat === 'VIDEO' && (
        <div className="mb-1.5 flex h-32 items-center justify-center rounded bg-slate-200 text-[11px] text-slate-500">
          {headerMediaUrl ? '▶ Video header' : 'Video header (map wa_header_media_url)'}
        </div>
      )}
      {headerFormat === 'DOCUMENT' && (
        <div className="mb-1.5 flex items-center gap-2 rounded bg-slate-100 px-2 py-1.5 text-[11px] text-slate-700">
          📎 {headerMediaUrl ? 'Document attached' : 'Document header (map wa_header_media_url)'}
        </div>
      )}

      <p className="whitespace-pre-wrap text-sm text-slate-900">{previewBody || 'Select an approved template to preview it.'}</p>

      {template?.footer && <p className="mt-2 text-[11px] text-slate-500">{template.footer}</p>}

      {template?.buttons && template.buttons.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-green-200 pt-2">
          {template.buttons.map((button, idx) => {
            const type = button.type?.toUpperCase() ?? 'QUICK_REPLY'
            const icon = type === 'URL' ? '↗' : type === 'PHONE_NUMBER' ? '📞' : '↩'
            return (
              <div
                key={`${button.text}-${idx}`}
                className="flex items-center justify-center gap-1 py-1 text-center text-xs font-medium text-blue-600"
              >
                <span className="text-[10px] opacity-70">{icon}</span>
                <span>{button.text}</span>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-1 text-right text-[10px] text-slate-500">12:45</p>
    </div>
  )
}

/* ─── Step 2: SMS / Push Content ─── */

function Step2TextContent({
  channel, bodyText, setBodyText, pushTitle, setPushTitle, pushImageUrl, setPushImageUrl, templates, variables, setVariables,
  utmEnabled, setUtmEnabled, utmSource, setUtmSource, utmMedium, setUtmMedium, utmCampaign, setUtmCampaign,
  utmCustomParams, setUtmCustomParams, inputClass,
}: {
  channel: CampaignChannel
  bodyText: string; setBodyText: (v: string) => void
  pushTitle: string; setPushTitle: (v: string) => void
  pushImageUrl: string; setPushImageUrl: (v: string) => void
  templates: TemplateItem[]
  variables: TemplateVariable[]
  setVariables: (v: TemplateVariable[]) => void
  utmEnabled: boolean; setUtmEnabled: (v: boolean) => void
  utmSource: string; setUtmSource: (v: string) => void
  utmMedium: string; setUtmMedium: (v: string) => void
  utmCampaign: string; setUtmCampaign: (v: string) => void
  utmCustomParams: CampaignUtmParameter[]; setUtmCustomParams: (v: CampaignUtmParameter[]) => void
  inputClass: string
}) {
  const isSms = channel === 'sms'
  const isPush = channel === 'push'
  const ChannelIcon = CHANNEL_ICONS[channel] ?? MessageSquare
  const channelLabel = CHANNEL_LABELS[channel] ?? channel
  const customers = useCustomers({ page: 1, pageSize: 20, sortBy: 'lastSeen', sortOrder: 'desc' })
  const renderedPreview = usePreviewTemplate()
  const sampleCustomers = customers.data?.data ?? []
  const [sampleCustomerId, setSampleCustomerId] = useState('')
  const rendered = renderedPreview.data?.data.rendered
  const previewSubject = rendered?.subject ?? pushTitle
  const previewBody = rendered?.bodyText ?? bodyText

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
                  setVariables(t.variables ?? [])
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

      {/* Push: Title + Image */}
      {isPush && (
        <div className="bg-white border border-border rounded-xl p-6 space-y-4">
          <div>
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
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Image URL <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              value={pushImageUrl}
              onChange={e => setPushImageUrl(e.target.value)}
              placeholder="https://example.com/banner.jpg"
              className={inputClass}
            />
            <p className="text-xs text-text-muted mt-1">Use {'{{recipient_image:promo}}'} to pull from customer attribute images.promo.</p>
          </div>
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

      <CampaignAiCopywriter
        channel={channel}
        subject={isPush ? pushTitle : undefined}
        body={bodyText}
        onApplySubject={isPush ? setPushTitle : undefined}
        onApplyBody={setBodyText}
        inputClass={inputClass}
      />

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
                <input value={utmMedium} onChange={e => setUtmMedium(e.target.value)} placeholder={channel} className={inputClass} />
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

      {/* Preview card */}
      {(isPush || isSms) && bodyText.trim() && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border bg-surface px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-sm font-medium text-text-primary">Preview</h3>
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
                  subject: isPush ? pushTitle : undefined,
                  bodyText,
                  variables,
                  sampleCustomerId: sampleCustomerId || undefined,
                })}
                disabled={renderedPreview.isPending || (!bodyText.trim() && !(isPush && pushTitle.trim()))}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-accent/30 px-3 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-60"
              >
                {renderedPreview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Render data
              </button>
            </div>
          </div>
          {renderedPreview.data?.data && (
            <div className="border-b border-border bg-emerald-50 px-5 py-2 text-xs text-emerald-700">
              Rendered with {renderedPreview.data.data.sampleCustomer.name || renderedPreview.data.data.sampleCustomer.email || renderedPreview.data.data.sampleSource}.
            </div>
          )}
          <div className="p-5">
          {isPush ? (
            <div className="max-w-xs mx-auto bg-gray-50 rounded-2xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bell className="h-4 w-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary">{previewSubject || 'App Name'}</p>
                  <p className="text-xs text-text-secondary mt-0.5 line-clamp-3">{previewBody}</p>
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
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{previewBody}</p>
                </div>
              </div>
            </div>
          )}
          </div>
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
          <div className={cn('absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-4' : 'translate-x-0')} />
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
                <div className={cn('absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', autoSendWinner ? 'translate-x-4' : 'translate-x-0')} />
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
const TIMEZONE_OPTIONS = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney']

function Step3ScheduleGoals({
  isPeriodic, channel,
  sendTiming, setSendTiming, scheduledDate, setScheduledDate,
  scheduledTime, setScheduledTime,
  scheduleTimezone, setScheduleTimezone,
  periodicFrequency, setPeriodicFrequency,
  periodicDayOfWeek, setPeriodicDayOfWeek,
  periodicDayOfMonth, setPeriodicDayOfMonth,
  periodicTime, setPeriodicTime,
  periodicEndsAt, setPeriodicEndsAt,
  conversionGoals, setConversionGoals,
  goalTrackingHours, setGoalTrackingHours,
  currency, setCurrency,
  deliveryLimit, setDeliveryLimit,
  ignoreFreqCapping, setIgnoreFreqCapping,
  countForFreqCapping, setCountForFreqCapping,
  inputClass, selectClass,
}: {
  isPeriodic: boolean
  channel: CampaignChannel
  sendTiming: SendTiming; setSendTiming: (v: SendTiming) => void
  scheduledDate: string; setScheduledDate: (v: string) => void
  scheduledTime: string; setScheduledTime: (v: string) => void
  scheduleTimezone: string; setScheduleTimezone: (v: string) => void
  periodicFrequency: 'daily' | 'weekly' | 'monthly'; setPeriodicFrequency: (v: 'daily' | 'weekly' | 'monthly') => void
  periodicDayOfWeek: number; setPeriodicDayOfWeek: (v: number) => void
  periodicDayOfMonth: number; setPeriodicDayOfMonth: (v: number) => void
  periodicTime: string; setPeriodicTime: (v: string) => void
  periodicEndsAt: string; setPeriodicEndsAt: (v: string) => void
  conversionGoals: ConversionGoal[]; setConversionGoals: (v: ConversionGoal[]) => void
  goalTrackingHours: number; setGoalTrackingHours: (v: number) => void
  currency: string; setCurrency: (v: string) => void
  deliveryLimit: string; setDeliveryLimit: (v: string) => void
  ignoreFreqCapping: boolean; setIgnoreFreqCapping: (v: boolean) => void
  countForFreqCapping: boolean; setCountForFreqCapping: (v: boolean) => void
  inputClass: string; selectClass: string
}) {
  const eventOptions = ['order_completed', 'product_viewed', 'added_to_cart', 'checkout_started', 'page_viewed', 'app_opened', 'signed_up']

  const addGoal = () => setConversionGoals([
    ...conversionGoals,
    { name: `Goal ${conversionGoals.length + 1}`, eventName: '', revenueEnabled: true, revenueAttribute: 'total', isPrimary: false },
  ])
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
	                { value: 'fixed' as const, label: 'Fixed date and time', icon: Clock },
	                { value: 'user_timezone' as const, label: "User's timezone", icon: CalendarClock },
	                { value: 'best_time' as const, label: 'Best time for user', icon: Target },
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
	            {sendTiming !== 'asap' && (
	              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-surface rounded-lg border border-border">
	                <div>
	                  <label className="block text-xs font-medium text-text-secondary mb-1">Anchor date</label>
	                  <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className={inputClass} />
	                </div>
	                <div>
	                  <label className="block text-xs font-medium text-text-secondary mb-1">Send time</label>
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

      {/* Conversion Goals */}
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-text-muted" />
            <h3 className="text-sm font-semibold text-heading">Conversion Goals</h3>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-text-secondary">Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="h-8 px-2 text-xs border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-text-muted mb-4">Track which events users perform after receiving this campaign. Revenue numbers will be shown in {currency}.</p>

        <div className="space-y-4">
          {conversionGoals.map((goal, idx) => (
            <div key={idx} className="relative p-4 bg-surface rounded-lg border border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Goal {idx + 1}</span>
                  <label className="inline-flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
                    <input
                      type="radio"
                      name="primary-goal"
                      checked={goal.isPrimary === true}
                      onChange={() => setConversionGoals(conversionGoals.map((g, i) => ({ ...g, isPrimary: i === idx })))}
                      className="h-3 w-3 accent-accent"
                    />
                    Primary
                  </label>
                </div>
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

              {/* Revenue attribution */}
              <div className="mt-3 rounded-lg border border-border bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={goal.revenueEnabled !== false}
                      onChange={e => setConversionGoals(
                        conversionGoals.map((g, i) => i === idx ? { ...g, revenueEnabled: e.target.checked } : g),
                      )}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    <span className="text-xs font-medium text-text-secondary">Track revenue from this goal</span>
                  </label>
                  {goal.revenueEnabled !== false && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">from event property</span>
                      <input
                        value={goal.revenueAttribute ?? 'total'}
                        onChange={e => setConversionGoals(
                          conversionGoals.map((g, i) => i === idx ? { ...g, revenueAttribute: e.target.value } : g),
                        )}
                        placeholder="total"
                        className="w-32 h-8 px-2 text-xs font-mono border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  )}
                </div>
                {goal.revenueEnabled !== false && (
                  <p className="text-[11px] text-text-muted mt-1.5">
                    Storees will sum <code className="font-mono">properties.{goal.revenueAttribute || 'total'}</code> across matching events and report total revenue attributed to this campaign in {currency}.
                  </p>
                )}
              </div>

              <div className="mt-3 rounded-lg border border-border bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-text-secondary">Event attributes</span>
                  <button type="button" onClick={() => addGoalAttribute(idx)} className="text-xs font-medium text-accent hover:text-accent-hover">
                    Add filter
                  </button>
                </div>
                {Object.entries(goal.attributes ?? {}).length > 0 && (
                  <div className="mt-2 space-y-2">
                    {Object.entries(goal.attributes ?? {}).map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input value={key} onChange={e => updateGoalAttribute(idx, key, e.target.value, value)} placeholder="property" className={inputClass} />
                        <input value={value} onChange={e => updateGoalAttribute(idx, key, key, e.target.value)} placeholder="value" className={inputClass} />
                        <button type="button" onClick={() => removeGoalAttribute(idx, key)} className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border text-text-muted hover:text-red-600 hover:bg-red-50">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
            <div className={cn('absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', ignoreFreqCapping ? 'translate-x-4' : 'translate-x-0')} />
          </button>
        </div>

        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
          <div>
            <p className="text-sm text-text-primary">Count toward frequency capping</p>
            <p className="text-xs text-text-muted">Future campaigns will include this send when checking caps.</p>
          </div>
          <button
            type="button"
            onClick={() => setCountForFreqCapping(!countForFreqCapping)}
            className={cn('relative w-10 h-5 rounded-full transition-colors', countForFreqCapping ? 'bg-accent' : 'bg-gray-200')}
          >
            <div className={cn('absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', countForFreqCapping ? 'translate-x-4' : 'translate-x-0')} />
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
