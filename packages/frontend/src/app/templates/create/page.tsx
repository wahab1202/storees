'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateTemplate } from '@/hooks/useTemplates'
import { ArrowLeft, Mail, MessageSquare, Bell, Phone, Eye, Loader2, Columns2, Columns3, Columns4, LayoutTemplate } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TemplateChannel } from '@storees/shared'

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
  { label: 'Blank', icon: LayoutTemplate, html: BLANK_HTML },
  { label: '2 Columns', icon: Columns2, html: TWO_COL_HTML },
  { label: '3 Columns', icon: Columns3, html: THREE_COL_HTML },
  { label: '4 Columns', icon: Columns4, html: FOUR_COL_HTML },
]

const inputClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted'

export default function CreateTemplatePage() {
  const router = useRouter()
  const createTemplate = useCreateTemplate()

  const [channel, setChannel] = useState<TemplateChannel>('email')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState(BLANK_HTML)
  const [bodyText, setBodyText] = useState('')
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')

  const isEmail = channel === 'email'
  const canSave = name.trim() && (isEmail ? subject.trim() && htmlBody.trim() : bodyText.trim())

  const handleSave = () => {
    createTemplate.mutate(
      {
        name,
        channel,
        subject: isEmail ? subject : undefined,
        htmlBody: isEmail ? htmlBody : undefined,
        bodyText: !isEmail ? bodyText : undefined,
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
                      onClick={() => setHtmlBody(layout.html)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover:border-accent hover:bg-accent/5',
                        htmlBody === layout.html
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
                {isEmail ? 'Email Body (HTML)' : 'Message Body'}
              </h2>
              {isEmail && (
                <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-0.5">
                  <button
                    onClick={() => setTab('edit')}
                    className={cn('px-3 py-1 text-xs font-medium rounded-md transition-colors', tab === 'edit' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}
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
                tab === 'edit' ? (
                  <>
                    <textarea
                      value={htmlBody}
                      onChange={e => setHtmlBody(e.target.value)}
                      rows={18}
                      className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus resize-none"
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
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus resize-none placeholder:text-text-muted"
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

        {/* Right: Channel selector */}
        <div>
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
        </div>
      </div>
    </div>
  )
}
