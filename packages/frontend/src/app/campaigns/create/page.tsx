'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateCampaign } from '@/hooks/useCampaigns'
import { useSegments } from '@/hooks/useSegments'
import { ArrowLeft, Megaphone, Users, Mail, Loader2, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

const DEFAULT_HTML = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #111; font-size: 24px; margin-bottom: 16px;">Hi {{customer_name}},</h1>
  <p style="color: #555; font-size: 16px; line-height: 1.6;">
    Write your campaign message here. You can use template variables like
    <strong>{{customer_name}}</strong>, <strong>{{customer_email}}</strong>, and
    <strong>{{store_name}}</strong>.
  </p>
  <a href="#" style="display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
    Shop Now
  </a>
</div>`

export default function CreateCampaignPage() {
  const router = useRouter()
  const createCampaign = useCreateCampaign()
  const { data: segmentsData } = useSegments()

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState(DEFAULT_HTML)
  const [segmentId, setSegmentId] = useState('')
  const [fromName, setFromName] = useState('')
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')

  const segments = segmentsData?.data ?? []

  const canSave = name.trim() && subject.trim() && htmlBody.trim()

  const handleSave = () => {
    createCampaign.mutate(
      {
        name,
        subject,
        htmlBody,
        segmentId: segmentId || undefined,
        fromName: fromName || undefined,
      },
      { onSuccess: (res) => router.push(`/campaigns/${res.data?.id}`) },
    )
  }

  const inputClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted'
  const selectClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus appearance-none cursor-pointer'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/campaigns')}
            className="p-2 rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-text-secondary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-heading">New Campaign</h1>
            <p className="text-sm text-text-secondary mt-0.5">Send a one-time email to a segment</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/campaigns')}
            className="px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || createCampaign.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createCampaign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save as Draft
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: Email Editor */}
        <div className="space-y-6 min-w-0">
          {/* Subject Line */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Mail className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Email Details</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Campaign Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Summer Sale Announcement"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Subject Line</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. 🎉 Exclusive offer just for you, {{customer_name}}"
                  className={inputClass}
                />
                <p className="text-xs text-text-muted mt-1">Supports template variables: {'{{customer_name}}'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  From Name
                  <span className="text-text-muted font-normal ml-1">(optional)</span>
                </label>
                <input
                  value={fromName}
                  onChange={e => setFromName(e.target.value)}
                  placeholder="e.g. Priya from Storees"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* HTML Editor / Preview */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">Email Body</h2>
              <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-0.5">
                <button
                  onClick={() => setTab('edit')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                    tab === 'edit' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  Edit HTML
                </button>
                <button
                  onClick={() => setTab('preview')}
                  className={cn(
                    'inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors',
                    tab === 'preview' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </button>
              </div>
            </div>

            {tab === 'edit' ? (
              <div className="p-5">
                <textarea
                  value={htmlBody}
                  onChange={e => setHtmlBody(e.target.value)}
                  rows={18}
                  className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus resize-none"
                  spellCheck={false}
                />
                <p className="text-xs text-text-muted mt-2">
                  Available variables: {'{{customer_name}}'}, {'{{customer_email}}'}, {'{{store_name}}'}
                </p>
              </div>
            ) : (
              <div className="p-5">
                <div className="border border-border rounded-lg overflow-hidden">
                  <iframe
                    srcDoc={htmlBody}
                    title="Email Preview"
                    className="w-full h-[400px]"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Settings */}
        <div className="space-y-6">
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Users className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Audience</h2>
            </div>
            <div className="p-5">
              <label className="block text-sm font-medium text-text-primary mb-1.5">Target Segment</label>
              <select
                value={segmentId}
                onChange={e => setSegmentId(e.target.value)}
                className={selectClass}
              >
                <option value="">Select a segment...</option>
                {segments.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.memberCount.toLocaleString()} members)
                  </option>
                ))}
              </select>
              {segmentId && (
                <p className="text-xs text-text-muted mt-2">
                  Only customers with an email address will receive this campaign.
                </p>
              )}
            </div>
          </div>

          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Megaphone className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Send Settings</h2>
            </div>
            <div className="p-5">
              <p className="text-xs text-text-secondary leading-relaxed">
                Save as draft now, then open the campaign to preview and send when ready.
                Campaigns can only be sent once per draft.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
