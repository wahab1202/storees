'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateTemplate } from '@/hooks/useTemplates'
import { VariablePanel } from '@/components/templates/VariablePanel'
import { EmailBuilder } from '@/components/email-builder/EmailBuilder'
import { compileToHtml } from '@/lib/emailCompiler'
import { DEFAULT_TEMPLATE, generateBlockId } from '@/lib/emailTypes'
import { ArrowLeft, Mail, MessageSquare, Bell, Loader2, Columns2, Columns3, Columns4, LayoutTemplate, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmailBlock, EmailTemplate } from '@/lib/emailTypes'
import type { TemplateChannel, TemplateVariable } from '@storees/shared'

// WhatsApp is intentionally excluded — it has its own Meta-structured builder at
// /templates/whatsapp/new (category, header/body/footer/buttons, approval lifecycle).
const CHANNELS: { value: TemplateChannel; label: string; icon: typeof Mail; description: string }[] = [
  { value: 'email',    label: 'Email',    icon: Mail,          description: 'HTML email with subject line' },
  { value: 'sms',      label: 'SMS',      icon: MessageSquare, description: 'Plain text, up to 160 chars' },
  { value: 'push',     label: 'Push',     icon: Bell,          description: 'Title + body notification' },
  { value: 'in_app',   label: 'In-App',   icon: Layers,        description: 'Modal, banner, toast, or inbox card rendered inside the storefront' },
]

const CHANNEL_LABELS: Record<TemplateChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
  whatsapp: 'WhatsApp',
  in_app: 'In-App',
}

const LAYOUT_STARTERS = [
  { key: 'blank', label: 'Blank', icon: LayoutTemplate },
  { key: '2col', label: '2 Columns', icon: Columns2 },
  { key: '3col', label: '3 Columns', icon: Columns3 },
  { key: '4col', label: '4 Columns', icon: Columns4 },
]

const inputClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted'

function emailTemplateFromHtml(subject: string, htmlBody: string): EmailTemplate {
  return {
    ...DEFAULT_TEMPLATE,
    subject,
    previewText: '',
    blocks: [
      {
        id: generateBlockId(),
        type: 'text',
        props: {
          html: htmlBody.trim() || '<p>Write your message here.</p>',
          align: 'left',
          color: '#374151',
          fontSize: 16,
        },
      },
    ],
    globalStyles: { ...DEFAULT_TEMPLATE.globalStyles },
  }
}

function makeTemplateColumn(index: number): EmailBlock[] {
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

function makeColumnBlock(columnCount: 2 | 3 | 4, columnFactory: (index: number) => EmailBlock[] = makeTemplateColumn): EmailBlock {
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

function starterTemplateForLayout(key: string, subject: string): EmailTemplate {
  const base: EmailTemplate = {
    ...DEFAULT_TEMPLATE,
    subject,
    previewText: '',
    blocks: [],
    globalStyles: { ...DEFAULT_TEMPLATE.globalStyles },
  }
  const introBlocks: EmailBlock[] = [
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
  if (key === 'blank') {
    return {
      ...base,
      blocks: [
        ...introBlocks,
        {
          id: generateBlockId(),
          type: 'button',
          props: { text: 'Learn More', url: 'https://', bgColor: '#4F46E5', textColor: '#ffffff', align: 'center', borderRadius: 8, fullWidth: false },
        },
      ],
    }
  }
  const columnCount = key === '4col' ? 4 : key === '3col' ? 3 : 2
  return {
    ...base,
    blocks: [
      ...introBlocks,
      makeColumnBlock(columnCount, key === '4col' ? makeProductColumn : makeTemplateColumn),
      {
        id: generateBlockId(),
        type: 'button',
        props: { text: 'Shop Now', url: 'https://', bgColor: '#4F46E5', textColor: '#ffffff', align: 'center', borderRadius: 8, fullWidth: false },
      },
    ],
  }
}

export default function CreateTemplatePage() {
  const router = useRouter()
  const createTemplate = useCreateTemplate()

  const [channel, setChannel] = useState<TemplateChannel>('email')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState(() => compileToHtml(starterTemplateForLayout('blank', '')))
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate>(() => starterTemplateForLayout('blank', ''))
  const [bodyText, setBodyText] = useState('')
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [selectedLayout, setSelectedLayout] = useState('blank')

  // In-app channel extras
  const [imageUrl, setImageUrl] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [inAppPosition, setInAppPosition] = useState<'modal' | 'banner' | 'toast' | 'inbox'>('modal')
  const [inAppFrequency, setInAppFrequency] = useState<'always' | 'once' | 'daily'>('once')
  const [inAppTargetPagesText, setInAppTargetPagesText] = useState('')

  const isEmail = channel === 'email'
  const isInApp = channel === 'in_app'
  // For in_app: subject is reused as the title. Title + body required.
  const canSave = name.trim() && (
    isEmail ? subject.trim() && htmlBody.trim()
      : isInApp ? subject.trim() && bodyText.trim()
      : bodyText.trim()
  )

  const handleSave = () => {
    createTemplate.mutate(
      {
        name,
        channel,
        subject: isEmail || isInApp ? subject : undefined,
        htmlBody: isEmail ? htmlBody : undefined,
        emailBuilderTemplate: isEmail ? { ...emailTemplate, subject, previewText: '' } : undefined,
        bodyText: !isEmail ? bodyText : undefined,
        variables,
        // In-app extras only sent when relevant
        ...(isInApp ? {
          imageUrl: imageUrl.trim() || null,
          ctaLabel: ctaLabel.trim() || null,
          ctaUrl: ctaUrl.trim() || null,
          inAppPosition,
          inAppFrequency,
          inAppTargetPages: inAppTargetPagesText.split('\n').map(s => s.trim()).filter(Boolean),
        } : {}),
      },
      { onSuccess: () => router.push('/templates') },
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/templates')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-text-secondary transition-colors hover:bg-surface"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Templates</p>
            <h1 className="text-2xl font-bold text-heading">New Template</h1>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            onClick={() => router.push('/templates')}
            className="h-10 rounded-lg border border-border bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || createTemplate.isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Template
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-white">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-text-primary">Setup</h2>
            <p className="text-xs text-text-muted">Choose the channel and name this reusable template.</p>
          </div>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CHANNELS.map(ch => {
              const Icon = ch.icon
              const active = channel === ch.value
              return (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => setChannel(ch.value)}
                  className={cn(
                    'flex min-h-[96px] flex-col items-start justify-between rounded-lg border p-4 text-left transition-colors',
                    active
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-border text-text-secondary hover:border-text-muted hover:bg-surface',
                  )}
                >
                  <Icon className={cn('h-5 w-5', active ? 'text-accent' : 'text-text-muted')} />
                  <div>
                    <p className={cn('text-sm font-semibold', active ? 'text-accent' : 'text-text-primary')}>{ch.label}</p>
                    <p className="mt-1 text-xs leading-5 text-text-muted">{ch.description}</p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Template Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Welcome offer, EMI reminder"
                autoFocus
                className={inputClass}
              />
            </div>
            {isEmail ? (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Subject Line</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Hi {{customer_name}}, your offer is ready"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-text-muted">Supports {'{{customer_name}}'} and {'{{customer_email}}'}.</p>
              </div>
            ) : isInApp ? (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Title</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Welcome back, {{customer_name}}"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-text-muted">Shown as the heading of the in-app message.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-surface px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Selected Channel</p>
                <p className="mt-1 text-sm font-medium text-text-primary">{CHANNEL_LABELS[channel]}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {isEmail && (
        <section className="rounded-xl border border-border bg-white p-5">
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-text-primary">Start From A Layout</h2>
            <p className="text-xs text-text-muted">These layouts create editable visual-builder blocks.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {LAYOUT_STARTERS.map(layout => {
              const Icon = layout.icon
              return (
                <button
                  key={layout.key}
                  type="button"
                  onClick={() => {
                    const nextTemplate = starterTemplateForLayout(layout.key, subject)
                    setEmailTemplate(nextTemplate)
                    setHtmlBody(compileToHtml(nextTemplate))
                    setSelectedLayout(layout.key)
                  }}
                  className={cn(
                    'flex h-24 items-center gap-3 rounded-lg border p-4 text-left transition-colors',
                    selectedLayout === layout.key
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent hover:bg-accent/5',
                  )}
                >
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface">
                    <Icon className="h-5 w-5 text-text-secondary" />
                  </span>
                  <span className="text-sm font-medium text-text-primary">{layout.label}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {isInApp && (
        <section className="rounded-xl border border-border bg-white">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-text-primary">Display & Behaviour</h2>
            <p className="text-xs text-text-muted">How and where the message renders inside the storefront.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Image URL (optional)</label>
                <input
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://cdn.example.com/banner.png"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">CTA Label</label>
                  <input
                    value={ctaLabel}
                    onChange={e => setCtaLabel(e.target.value)}
                    placeholder="e.g. Shop now"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">CTA URL</label>
                  <input
                    value={ctaUrl}
                    onChange={e => setCtaUrl(e.target.value)}
                    placeholder="https://shop.example.com/sale"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Position</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['modal', 'banner', 'toast', 'inbox'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setInAppPosition(p)}
                      className={cn(
                        'h-10 rounded-lg border text-xs font-medium capitalize transition-colors',
                        inAppPosition === p
                          ? 'border-accent bg-accent/5 text-accent'
                          : 'border-border bg-white text-text-secondary hover:border-text-muted',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Frequency</label>
                <select
                  value={inAppFrequency}
                  onChange={e => setInAppFrequency(e.target.value as 'always' | 'once' | 'daily')}
                  className={inputClass}
                >
                  <option value="always">Always (every page load)</option>
                  <option value="once">Once per customer</option>
                  <option value="daily">Once per day</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Target Pages (optional)</label>
                <textarea
                  value={inAppTargetPagesText}
                  onChange={e => setInAppTargetPagesText(e.target.value)}
                  rows={3}
                  placeholder={'/cart\n/checkout\n/products/*'}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <p className="mt-1 text-xs text-text-muted">One path pattern per line. Leave empty to show on every page.</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Preview</p>
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className={cn(
                  'mx-auto overflow-hidden rounded-lg border border-border bg-white shadow-sm',
                  inAppPosition === 'banner' ? 'w-full' :
                    inAppPosition === 'toast' ? 'w-72' :
                      inAppPosition === 'inbox' ? 'w-full' :
                        'w-full max-w-sm',
                )}>
                  {imageUrl && inAppPosition !== 'toast' && (
                    <img src={imageUrl} alt="" className="h-32 w-full object-cover" />
                  )}
                  <div className="p-4">
                    <p className="text-sm font-semibold text-text-primary">{subject || 'Title appears here'}</p>
                    <p className="mt-1 text-xs text-text-secondary whitespace-pre-wrap">
                      {bodyText || 'Body text appears here.'}
                    </p>
                    {(ctaLabel || ctaUrl) && (
                      <button
                        type="button"
                        className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-xs font-medium text-white"
                      >
                        {ctaLabel || 'Action'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-center text-[11px] text-text-muted capitalize">
                  {inAppPosition} · {inAppFrequency}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className={cn(
        'grid grid-cols-1 gap-5',
        !isEmail && 'xl:grid-cols-[minmax(0,1fr)_300px]',
      )}>
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-white">
          {isEmail ? (
            <EmailBuilder
              value={{ ...emailTemplate, subject, previewText: '' }}
              aiContext={{
                subject,
                fullHtml: htmlBody,
                campaignGoal: `Reusable ${name || 'email'} template`,
              }}
              onChange={nextTemplate => {
                const synced = { ...nextTemplate, subject, previewText: '' }
                setEmailTemplate(synced)
                setHtmlBody(compileToHtml(synced))
              }}
            />
          ) : (
            <>
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-text-primary">
                  {isInApp ? 'Body' : 'Message Content'}
                </h2>
              </div>
              <div className="p-5">
                <textarea
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  rows={8}
                  placeholder={
                    channel === 'sms'
                      ? 'Hi {{customer_name}}, your transaction of {{amount}} is complete.'
                      : channel === 'push'
                        ? 'Your order update is ready, {{customer_name}}.'
                        : channel === 'in_app'
                          ? 'Hey {{customer_name}}, just for you — {{offer}}.'
                          : 'Hi {{customer_name}}, we have an update for your account.'
                  }
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-text-muted">Variables: {'{{customer_name}}'}, {'{{amount}}'}</p>
                  {channel === 'sms' && (
                    <p className={cn('text-xs font-medium', bodyText.length > 160 ? 'text-red-500' : 'text-text-muted')}>
                      {bodyText.length}/160
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <aside className={cn(
          isEmail ? 'mx-auto w-full max-w-2xl' : 'xl:sticky xl:top-4 xl:self-start',
        )}>
          <VariablePanel
            variables={variables}
            onChange={setVariables}
            contentSources={[subject, htmlBody, bodyText]}
            preview={{
              subject: isEmail ? subject : null,
              htmlBody: isEmail ? htmlBody : null,
              bodyText: !isEmail ? bodyText : null,
            }}
          />
        </aside>
      </div>
    </div>
  )
}
