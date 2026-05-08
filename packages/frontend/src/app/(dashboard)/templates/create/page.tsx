'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateTemplate } from '@/hooks/useTemplates'
import { VariablePanel } from '@/components/templates/VariablePanel'
import { EmailBuilder } from '@/components/email-builder/EmailBuilder'
import { compileToHtml } from '@/lib/emailCompiler'
import { DEFAULT_TEMPLATE, generateBlockId } from '@/lib/emailTypes'
import { ArrowLeft, Mail, MessageSquare, Bell, Phone, Eye, Loader2, Columns2, Columns3, Columns4, LayoutTemplate } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmailBlock, EmailTemplate } from '@/lib/emailTypes'
import type { TemplateChannel, TemplateVariable } from '@storees/shared'

const CHANNELS: { value: TemplateChannel; label: string; icon: typeof Mail; description: string }[] = [
  { value: 'email',    label: 'Email',    icon: Mail,          description: 'HTML email with subject line' },
  { value: 'sms',      label: 'SMS',      icon: MessageSquare, description: 'Plain text, up to 160 chars' },
  { value: 'push',     label: 'Push',     icon: Bell,          description: 'Title + body notification' },
  { value: 'whatsapp', label: 'WhatsApp', icon: Phone,         description: 'Text message with variables' },
]

const BLANK_HTML = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #111; font-size: 24px; margin-bottom: 16px;">Hi {{customer_name}},</h1>
  <p style="color: #555; font-size: 16px; line-height: 1.6;">
    Write your message here.
  </p>
  <a href="#" style="display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
    Learn More
  </a>
</div>`

const TWO_COL_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <tr><td style="padding: 24px;">
    <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Hi {{customer_name}},</h1>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="50%" valign="top" style="padding-right: 12px;">
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; min-height: 120px;">
            <h3 style="margin: 0 0 8px; color: #111;">Column 1</h3>
            <p style="margin: 0; color: #555; font-size: 14px;">Content here</p>
          </div>
        </td>
        <td width="50%" valign="top" style="padding-left: 12px;">
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; min-height: 120px;">
            <h3 style="margin: 0 0 8px; color: #111;">Column 2</h3>
            <p style="margin: 0; color: #555; font-size: 14px;">Content here</p>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`

const THREE_COL_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <tr><td style="padding: 24px;">
    <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Hi {{customer_name}},</h1>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="33%" valign="top" style="padding-right: 8px;">
          <div style="background: #f3f4f6; border-radius: 8px; padding: 12px; min-height: 100px;">
            <h3 style="margin: 0 0 8px; color: #111; font-size: 14px;">Col 1</h3>
            <p style="margin: 0; color: #555; font-size: 13px;">Content</p>
          </div>
        </td>
        <td width="34%" valign="top" style="padding: 0 4px;">
          <div style="background: #f3f4f6; border-radius: 8px; padding: 12px; min-height: 100px;">
            <h3 style="margin: 0 0 8px; color: #111; font-size: 14px;">Col 2</h3>
            <p style="margin: 0; color: #555; font-size: 13px;">Content</p>
          </div>
        </td>
        <td width="33%" valign="top" style="padding-left: 8px;">
          <div style="background: #f3f4f6; border-radius: 8px; padding: 12px; min-height: 100px;">
            <h3 style="margin: 0 0 8px; color: #111; font-size: 14px;">Col 3</h3>
            <p style="margin: 0; color: #555; font-size: 13px;">Content</p>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`

const FOUR_COL_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <tr><td style="padding: 24px;">
    <h1 style="color: #111; font-size: 24px; margin: 0 0 16px;">Hi {{customer_name}},</h1>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="25%" valign="top" style="padding-right: 6px;">
          <div style="background: #f3f4f6; border-radius: 8px; padding: 10px; min-height: 80px; text-align: center;">
            <p style="margin: 0; color: #111; font-weight: 600; font-size: 13px;">1</p>
          </div>
        </td>
        <td width="25%" valign="top" style="padding: 0 3px;">
          <div style="background: #f3f4f6; border-radius: 8px; padding: 10px; min-height: 80px; text-align: center;">
            <p style="margin: 0; color: #111; font-weight: 600; font-size: 13px;">2</p>
          </div>
        </td>
        <td width="25%" valign="top" style="padding: 0 3px;">
          <div style="background: #f3f4f6; border-radius: 8px; padding: 10px; min-height: 80px; text-align: center;">
            <p style="margin: 0; color: #111; font-weight: 600; font-size: 13px;">3</p>
          </div>
        </td>
        <td width="25%" valign="top" style="padding-left: 6px;">
          <div style="background: #f3f4f6; border-radius: 8px; padding: 10px; min-height: 80px; text-align: center;">
            <p style="margin: 0; color: #111; font-weight: 600; font-size: 13px;">4</p>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`

const LAYOUT_STARTERS = [
  { key: 'blank', label: 'Blank', icon: LayoutTemplate, html: BLANK_HTML },
  { key: '2col', label: '2 Columns', icon: Columns2, html: TWO_COL_HTML },
  { key: '3col', label: '3 Columns', icon: Columns3, html: THREE_COL_HTML },
  { key: '4col', label: '4 Columns', icon: Columns4, html: FOUR_COL_HTML },
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
  const [tab, setTab] = useState<'visual' | 'html' | 'preview'>('visual')
  const [selectedLayout, setSelectedLayout] = useState('blank')

  const isEmail = channel === 'email'
  const canSave = name.trim() && (isEmail ? subject.trim() && htmlBody.trim() : bodyText.trim())

  const handleSave = () => {
    createTemplate.mutate(
      {
        name,
        channel,
        subject: isEmail ? subject : undefined,
        htmlBody: isEmail ? htmlBody : undefined,
        emailBuilderTemplate: isEmail ? { ...emailTemplate, subject, previewText: '' } : undefined,
        bodyText: !isEmail ? bodyText : undefined,
        variables,
      },
      { onSuccess: () => router.push('/templates') },
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/templates')}
            className="p-2 rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-text-secondary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-heading">New Template</h1>
            <p className="text-sm text-text-secondary mt-0.5">Create a reusable message template</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/templates')}
            className="px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || createTemplate.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Left: Editor */}
        <div className="space-y-6 min-w-0">
          {/* Name */}
          <div className="bg-white border border-border rounded-xl p-5">
            <label className="block text-sm font-medium text-text-primary mb-1.5">Template Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. KYC Verified Welcome, EMI Reminder"
              autoFocus
              className={inputClass}
            />
          </div>

          {/* Email-specific fields */}
          {isEmail && (
            <div className="bg-white border border-border rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Subject Line</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Your KYC is verified, {{customer_name}} 🎉"
                  className={inputClass}
                />
                <p className="text-xs text-text-muted mt-1">Supports: {'{{customer_name}}'}, {'{{customer_email}}'}</p>
              </div>
            </div>
          )}

          {/* Layout starter cards — email only */}
          {isEmail && (
            <div className="bg-white border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-text-primary mb-3">Start from a layout</h2>
              <div className="grid grid-cols-4 gap-3">
                {LAYOUT_STARTERS.map(layout => {
                  const Icon = layout.icon
                return (
                    <button
                      key={layout.label}
                      onClick={() => {
                        const nextTemplate = starterTemplateForLayout(layout.key, subject)
                        setEmailTemplate(nextTemplate)
                        setHtmlBody(compileToHtml(nextTemplate))
                        setSelectedLayout(layout.key)
                        setTab('visual')
                      }}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover:border-accent hover:bg-accent/5',
                        selectedLayout === layout.key
                          ? 'border-accent bg-accent/5'
                          : 'border-border',
                      )}
                    >
                      <div className="w-12 h-12 rounded-lg bg-surface flex items-center justify-center">
                        <Icon className="h-5 w-5 text-text-secondary" />
                      </div>
                      <span className="text-xs font-medium text-text-primary">{layout.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">
                {isEmail ? 'Email Body' : 'Message Body'}
              </h2>
              {isEmail && (
                <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-0.5">
                  <button
                    onClick={() => setTab('visual')}
                    className={cn('px-3 py-1 text-xs font-medium rounded-md transition-colors', tab === 'visual' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}
                  >
                    Visual Builder
                  </button>
                  <button
                    onClick={() => setTab('html')}
                    className={cn('px-3 py-1 text-xs font-medium rounded-md transition-colors', tab === 'html' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}
                  >
                    Edit HTML
                  </button>
                  <button
                    onClick={() => setTab('preview')}
                    className={cn('inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors', tab === 'preview' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                </div>
              )}
            </div>

            <div className="p-5">
              {isEmail ? (
                tab === 'visual' ? (
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
                ) : tab === 'html' ? (
                  <>
                    <textarea
                      value={htmlBody}
                      onChange={e => {
                        setHtmlBody(e.target.value)
                        setEmailTemplate(emailTemplateFromHtml(subject, e.target.value))
                      }}
                      rows={18}
                      className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
                      spellCheck={false}
                    />
                    <p className="text-xs text-text-muted mt-2">
                      Variables: {'{{customer_name}}'}, {'{{customer_email}}'}
                    </p>
                  </>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <iframe
                      srcDoc={htmlBody}
                      title="Preview"
                      className="w-full h-[400px]"
                      sandbox="allow-same-origin"
                    />
                  </div>
                )
              ) : (
                <>
                  <textarea
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    rows={6}
                    placeholder={
                      channel === 'sms'
                        ? 'Hi {{customer_name}}, your transaction of ₹{{amount}} is complete.'
                        : channel === 'push'
                        ? 'Your SIP of ₹{{amount}} has been debited successfully.'
                        : 'Hi {{customer_name}}, we have an update for your account.'
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none placeholder:text-text-muted"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-text-muted">Variables: {'{{customer_name}}'}, {'{{amount}}'}</p>
                    {channel === 'sms' && (
                      <p className={cn('text-xs font-medium', bodyText.length > 160 ? 'text-red-500' : 'text-text-muted')}>
                        {bodyText.length}/160
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Channel selector + Variable panel */}
        <div className="space-y-4">
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-surface border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">Channel</h2>
            </div>
            <div className="p-4 space-y-2">
              {CHANNELS.map(ch => {
                const Icon = ch.icon
                return (
                  <button
                    key={ch.value}
                    onClick={() => setChannel(ch.value)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                      channel === ch.value
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-text-muted hover:bg-surface',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 flex-shrink-0', channel === ch.value ? 'text-accent' : 'text-text-muted')} />
                    <div>
                      <p className={cn('text-sm font-medium', channel === ch.value ? 'text-accent' : 'text-text-primary')}>
                        {ch.label}
                      </p>
                      <p className="text-xs text-text-muted">{ch.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

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
        </div>
      </div>
    </div>
  )
}
