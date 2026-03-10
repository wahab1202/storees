'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  useCampaignDetail,
  useCampaignSends,
  useSendCampaign,
  useDeleteCampaign,
} from '@/hooks/useCampaigns'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Send,
  Trash2,
  Users,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  Mail,
  Clock,
  Megaphone,
} from 'lucide-react'
import Link from 'next/link'
import type { Campaign } from '@storees/shared'

const STATUS_COLORS: Record<Campaign['status'], string> = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-50 text-blue-600',
  sending: 'bg-yellow-50 text-yellow-600',
  sent: 'bg-green-50 text-green-700',
  paused: 'bg-orange-50 text-orange-600',
}

const SEND_STATUS_COLORS: Record<string, string> = {
  pending: 'text-text-muted',
  sent: 'text-green-600',
  failed: 'text-red-500',
}

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const { data, isLoading, isError } = useCampaignDetail(id)
  const { data: sendsData } = useCampaignSends(id)
  const sendCampaign = useSendCampaign()
  const deleteCampaign = useDeleteCampaign()

  const [showPreview, setShowPreview] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showSendConfirm, setShowSendConfirm] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-60 w-full" />
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
  const sends = sendsData?.data ?? []
  const canSend = ['draft', 'scheduled'].includes(campaign.status) && !!campaign.segmentId

  const handleSend = () => {
    sendCampaign.mutate(id, { onSuccess: () => setShowSendConfirm(false) })
  }

  const handleDelete = () => {
    deleteCampaign.mutate(id, { onSuccess: () => router.push('/campaigns') })
  }

  const deliveryRate = campaign.totalRecipients > 0
    ? Math.round((campaign.sentCount / campaign.totalRecipients) * 100)
    : 0

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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-heading">{campaign.name}</h1>
              <span className={cn('px-2.5 py-0.5 text-xs font-semibold rounded-full', STATUS_COLORS[campaign.status])}>
                {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-0.5">{campaign.subject}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
          {campaign.status !== 'sent' && campaign.status !== 'sending' && (
            <>
              <Link
                href={`/campaigns/${id}/edit`}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface transition-colors"
              >
                Edit
              </Link>
              <button
                onClick={() => setShowDelete(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          )}
          {canSend && (
            <button
              onClick={() => setShowSendConfirm(true)}
              disabled={sendCampaign.isPending}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {sendCampaign.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Now
            </button>
          )}
        </div>
      </div>

      {/* Send confirmation banner */}
      {showSendConfirm && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-accent/5 border border-accent/20 rounded-xl">
          <Megaphone className="h-5 w-5 text-accent flex-shrink-0" />
          <p className="text-sm text-text-primary flex-1">
            This will send to <strong>{campaign.segmentName ?? 'the selected segment'}</strong> immediately. This cannot be undone.
          </p>
          <button
            onClick={() => setShowSendConfirm(false)}
            className="px-3 py-1.5 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sendCampaign.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {sendCampaign.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirm Send
          </button>
        </div>
      )}

      {/* Delete confirmation banner */}
      {showDelete && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700 flex-1">Permanently delete this campaign? This cannot be undone.</p>
          <button
            onClick={() => setShowDelete(false)}
            className="px-3 py-1.5 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteCampaign.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleteCampaign.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
        </div>
      )}

      {/* Email preview panel */}
      {showPreview && (
        <div className="mb-6 bg-white border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-surface border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary">Email Preview</h2>
            <button onClick={() => setShowPreview(false)} className="text-xs text-text-muted hover:text-text-primary">
              Close
            </button>
          </div>
          <div className="p-5">
            <div className="text-xs text-text-muted mb-3 flex items-center gap-4">
              <span><strong>From:</strong> {campaign.fromName ?? 'Storees'}</span>
              <span><strong>Subject:</strong> {campaign.subject}</span>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <iframe
                srcDoc={campaign.htmlBody}
                title="Email Preview"
                className="w-full h-[400px]"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Users}
          label="Total Recipients"
          value={campaign.totalRecipients > 0 ? campaign.totalRecipients.toLocaleString() : '—'}
          sub={campaign.segmentName ? `From "${campaign.segmentName}"` : 'No segment'}
        />
        <StatCard
          icon={CheckCircle}
          label="Delivered"
          value={campaign.sentCount > 0 ? campaign.sentCount.toLocaleString() : '—'}
          sub={campaign.sentCount > 0 ? `${deliveryRate}% delivery rate` : undefined}
          valueColor="text-green-600"
        />
        <StatCard
          icon={XCircle}
          label="Failed"
          value={campaign.failedCount > 0 ? campaign.failedCount.toLocaleString() : '—'}
          valueColor={campaign.failedCount > 0 ? 'text-red-500' : undefined}
        />
        <StatCard
          icon={Clock}
          label={campaign.sentAt ? 'Sent At' : campaign.scheduledAt ? 'Scheduled' : 'Created'}
          value={
            campaign.sentAt
              ? new Date(campaign.sentAt).toLocaleDateString()
              : campaign.scheduledAt
              ? new Date(campaign.scheduledAt).toLocaleDateString()
              : new Date(campaign.createdAt).toLocaleDateString()
          }
          sub={
            campaign.sentAt
              ? new Date(campaign.sentAt).toLocaleTimeString()
              : undefined
          }
        />
      </div>

      {/* Recipients table */}
      {sends.length > 0 && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
            <Mail className="h-4 w-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Recipients</h2>
            <span className="text-xs text-text-muted ml-auto">{sends.length} total</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface border-b border-border">
                <tr>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Email</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Status</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sends.map(send => (
                  <tr key={send.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-5 py-2.5 text-sm text-text-primary">{send.email}</td>
                    <td className="px-5 py-2.5">
                      <span className={cn('text-xs font-medium capitalize', SEND_STATUS_COLORS[send.status])}>
                        {send.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-text-muted">
                      {send.sentAt ? new Date(send.sentAt).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  valueColor,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  valueColor?: string
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-text-muted" />
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', valueColor ?? 'text-heading')}>{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  )
}
