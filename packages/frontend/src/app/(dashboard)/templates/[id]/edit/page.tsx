'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTemplateDetail, useUpdateTemplate } from '@/hooks/useTemplates'
import { VariablePanel } from '@/components/templates/VariablePanel'
import { EmailBuilder } from '@/components/email-builder/EmailBuilder'
import { compileToHtml } from '@/lib/emailCompiler'
import { DEFAULT_TEMPLATE, generateBlockId } from '@/lib/emailTypes'
import { ArrowLeft, Eye, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmailTemplate } from '@/lib/emailTypes'
import type { TemplateVariable } from '@storees/shared'

const inputClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted'

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email', sms: 'SMS', push: 'Push', whatsapp: 'WhatsApp',
}

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

function isEmailBuilderTemplate(value: unknown): value is EmailTemplate {
  if (!value || typeof value !== 'object') return false
  const template = value as Partial<EmailTemplate>
  return Array.isArray(template.blocks)
    && !!template.globalStyles
    && typeof template.globalStyles === 'object'
}

export default function EditTemplatePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const { data, isLoading, isError } = useTemplateDetail(id)
  const updateTemplate = useUpdateTemplate()

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate>(() => emailTemplateFromHtml('', ''))
  const [bodyText, setBodyText] = useState('')
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [tab, setTab] = useState<'visual' | 'html' | 'preview'>('visual')

  useEffect(() => {
    if (data?.data) {
      const t = data.data
      setName(t.name)
      setSubject(t.subject ?? '')
      setHtmlBody(t.htmlBody ?? '')
      setBodyText(t.bodyText ?? '')
      setVariables(t.variables ?? [])
      if (t.channel === 'email') {
        const storedTemplate = isEmailBuilderTemplate(t.emailBuilderTemplate) ? t.emailBuilderTemplate : null
        setEmailTemplate(storedTemplate ?? emailTemplateFromHtml(t.subject ?? '', t.htmlBody ?? ''))
        setTab(storedTemplate ? 'visual' : 'html')
      }
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
        <p className="text-red-600 text-sm">Template not found.</p>
      </div>
    )
  }

  const template = data.data
  const isEmail = template.channel === 'email'
  const canSave = name.trim() && (isEmail ? subject.trim() && htmlBody.trim() : bodyText.trim())

  const handleSave = () => {
    updateTemplate.mutate(
      {
        id,
        name,
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/templates')}
            className="p-2 rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-text-secondary" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-heading">Edit Template</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-surface border border-border text-text-secondary">
                {CHANNEL_LABELS[template.channel] ?? template.channel}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-0.5">{template.name}</p>
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
            disabled={!canSave || updateTemplate.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Name */}
      <div className="bg-white border border-border rounded-xl p-5 mb-5">
        <label className="block text-sm font-medium text-text-primary mb-1.5">Template Name</label>
        <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
      </div>

      {/* Subject (email only) */}
      {isEmail && (
        <div className="bg-white border border-border rounded-xl p-5 mb-5">
          <label className="block text-sm font-medium text-text-primary mb-1.5">Subject Line</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="e.g. Hi {{customer_name}}, your account update"
            className={inputClass}
          />
          <p className="text-xs text-text-muted mt-1">Supports: {'{{customer_name}}'}, {'{{customer_email}}'}</p>
        </div>
      )}

      {/* Body + Variable panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="min-w-0">
          {isEmail ? (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
                <h2 className="text-sm font-semibold text-text-primary">Email Body</h2>
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
              </div>
              <div className="p-5">
                {tab === 'visual' ? (
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
                  <textarea
                    value={htmlBody}
                    onChange={e => {
                      setHtmlBody(e.target.value)
                      setEmailTemplate(emailTemplateFromHtml(subject, e.target.value))
                    }}
                    rows={24}
                    className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
                    spellCheck={false}
                  />
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden bg-white">
                    <iframe
                      srcDoc={htmlBody}
                      title="Preview"
                      className="w-full h-[520px]"
                      sandbox="allow-same-origin"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-surface border-b border-border">
                <h2 className="text-sm font-semibold text-text-primary">Message Body</h2>
              </div>
              <div className="p-5">
                <textarea
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none placeholder:text-text-muted"
                />
                {template.channel === 'sms' && (
                  <div className="flex items-center justify-end mt-2">
                    <p className={cn('text-xs font-medium', bodyText.length > 160 ? 'text-red-500' : 'text-text-muted')}>
                      {bodyText.length}/160
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
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
  )
}
