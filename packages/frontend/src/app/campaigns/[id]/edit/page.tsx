'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCampaignDetail, useUpdateCampaign } from '@/hooks/useCampaigns'
import { useSegments } from '@/hooks/useSegments'
import { ArrowLeft, Mail, Users, Megaphone, Eye, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const inputClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted'
const selectClass = 'w-full h-10 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus appearance-none cursor-pointer'

export default function EditCampaignPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const { data, isLoading, isError } = useCampaignDetail(id)
  const { data: segmentsData } = useSegments()
  const updateCampaign = useUpdateCampaign()

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [fromName, setFromName] = useState('')
  const [segmentId, setSegmentId] = useState('')
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')

  const segments = segmentsData?.data ?? []

  useEffect(() => {
    if (data?.data) {
      const c = data.data
      setName(c.name)
      setSubject(c.subject ?? '')
      setHtmlBody(c.htmlBody ?? '')
      setFromName(c.fromName ?? '')
      setSegmentId(c.segmentId ?? '')
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

  // Only draft/scheduled campaigns can be edited
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

  const canSave = name.trim() && subject.trim() && htmlBody.trim()

  const handleSave = () => {
    updateCampaign.mutate(
      {
        id,
        name,
        subject,
        htmlBody,
        fromName: fromName || undefined,
        segmentId: segmentId || undefined,
      },
      { onSuccess: () => router.push(`/campaigns/${id}`) },
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/campaigns/${id}`)}
            className="p-2 rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-text-secondary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-heading">Edit Campaign</h1>
            <p className="text-sm text-text-secondary mt-0.5">{campaign.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/campaigns/${id}`)}
            className="px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
          >
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: Email Editor */}
        <div className="space-y-6 min-w-0">
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Mail className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Email Details</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Campaign Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
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
                  From Name <span className="text-text-muted font-normal">(optional)</span>
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

          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">Email Body</h2>
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
            </div>

            {tab === 'edit' ? (
              <div className="p-5">
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
              </div>
            ) : (
              <div className="p-5">
                <div className="border border-border rounded-lg overflow-hidden">
                  <iframe srcDoc={htmlBody} title="Preview" className="w-full h-[400px]" sandbox="allow-same-origin" />
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
              <select value={segmentId} onChange={e => setSegmentId(e.target.value)} className={selectClass}>
                <option value="">Select a segment...</option>
                {segments.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.memberCount.toLocaleString()} members)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
              <Megaphone className="h-4 w-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Status</h2>
            </div>
            <div className="p-5">
              <p className="text-xs text-text-secondary leading-relaxed">
                This campaign is currently <strong>{campaign.status}</strong>.
                Changes will be saved. You can send it from the campaign detail page.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
