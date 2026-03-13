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
  MousePointerClick,
  MailOpen,
  Ban,
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
  sent: 'text-blue-500',
  delivered: 'text-green-600',
  failed: 'text-red-500',
  bounced: 'text-orange-500',
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
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
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

  // Compute rates
  const total = campaign.totalRecipients
  const deliveryRate = total > 0 ? (campaign.deliveredCount / total) * 100 : 0
  const openRate = campaign.deliveredCount > 0 ? (campaign.openedCount / campaign.deliveredCount) * 100 : 0
  const clickRate = campaign.openedCount > 0 ? (campaign.clickedCount / campaign.openedCount) * 100 : 0
  const bounceRate = total > 0 ? (campaign.bouncedCount / total) * 100 : 0
  const hasSent = campaign.status === 'sent' || campaign.status === 'sending'

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
                srcDoc={campaign.htmlBody ?? ''}
                title="Email Preview"
                className="w-full h-[400px]"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}

      {/* Performance Metrics — MoEngage-style cards with progress bars */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <MetricCard
          icon={Users}
          label="Recipients"
          value={total > 0 ? total.toLocaleString() : '—'}
          sub={campaign.segmentName ? `"${campaign.segmentName}"` : undefined}
        />
        <MetricCard
          icon={Send}
          label="Sent"
          value={campaign.sentCount > 0 ? campaign.sentCount.toLocaleString() : '—'}
          progress={total > 0 ? (campaign.sentCount / total) * 100 : 0}
          progressColor="bg-blue-500"
          sub={total > 0 ? `${Math.round((campaign.sentCount / total) * 100)}%` : undefined}
        />
        <MetricCard
          icon={CheckCircle}
          label="Delivered"
          value={campaign.deliveredCount > 0 ? campaign.deliveredCount.toLocaleString() : '—'}
          progress={deliveryRate}
          progressColor="bg-green-500"
          sub={hasSent ? `${deliveryRate.toFixed(1)}%` : undefined}
          valueColor="text-green-600"
        />
        <MetricCard
          icon={MailOpen}
          label="Opened"
          value={campaign.openedCount > 0 ? campaign.openedCount.toLocaleString() : '—'}
          progress={openRate}
          progressColor="bg-indigo-500"
          sub={hasSent ? `${openRate.toFixed(1)}% open rate` : undefined}
          valueColor="text-indigo-600"
        />
        <MetricCard
          icon={MousePointerClick}
          label="Clicked"
          value={campaign.clickedCount > 0 ? campaign.clickedCount.toLocaleString() : '—'}
          progress={clickRate}
          progressColor="bg-violet-500"
          sub={hasSent ? `${clickRate.toFixed(1)}% CTR` : undefined}
          valueColor="text-violet-600"
        />
        <MetricCard
          icon={Ban}
          label="Bounced"
          value={campaign.bouncedCount > 0 ? campaign.bouncedCount.toLocaleString() : '—'}
          progress={bounceRate}
          progressColor="bg-red-500"
          sub={hasSent && campaign.bouncedCount > 0 ? `${bounceRate.toFixed(1)}%` : undefined}
          valueColor={campaign.bouncedCount > 0 ? 'text-red-500' : undefined}
        />
      </div>

      {/* Delivery funnel — visual progress */}
      {hasSent && total > 0 && (
        <div className="bg-white border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-heading mb-4">Delivery Funnel</h3>
          <div className="space-y-3">
            <FunnelBar label="Sent" count={campaign.sentCount} total={total} color="bg-blue-500" />
            <FunnelBar label="Delivered" count={campaign.deliveredCount} total={total} color="bg-green-500" />
            <FunnelBar label="Opened" count={campaign.openedCount} total={total} color="bg-indigo-500" />
            <FunnelBar label="Clicked" count={campaign.clickedCount} total={total} color="bg-violet-500" />
          </div>
          {(campaign.failedCount > 0 || campaign.bouncedCount > 0 || campaign.complainedCount > 0) && (
            <div className="mt-4 pt-4 border-t border-border flex items-center gap-6 text-xs">
              {campaign.failedCount > 0 && (
                <span className="text-red-500 flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> {campaign.failedCount} Failed
                </span>
              )}
              {campaign.bouncedCount > 0 && (
                <span className="text-orange-500 flex items-center gap-1">
                  <Ban className="h-3.5 w-3.5" /> {campaign.bouncedCount} Bounced
                </span>
              )}
              {campaign.complainedCount > 0 && (
                <span className="text-red-600 flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> {campaign.complainedCount} Complaints
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Date/time info */}
      <div className="flex items-center gap-6 mb-6 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Created {new Date(campaign.createdAt).toLocaleDateString()}
        </span>
        {campaign.sentAt && (
          <span className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Sent {new Date(campaign.sentAt).toLocaleString()}
          </span>
        )}
        {campaign.scheduledAt && !campaign.sentAt && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Scheduled for {new Date(campaign.scheduledAt).toLocaleString()}
          </span>
        )}
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
                  <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Delivered</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Opened</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Clicked</th>
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
                      {send.deliveredAt ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {new Date(send.deliveredAt).toLocaleTimeString()}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-text-muted">
                      {send.openedAt ? (
                        <span className="text-indigo-600 flex items-center gap-1">
                          <MailOpen className="h-3 w-3" />
                          {new Date(send.openedAt).toLocaleTimeString()}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-text-muted">
                      {send.clickedAt ? (
                        <span className="text-violet-600 flex items-center gap-1">
                          <MousePointerClick className="h-3 w-3" />
                          {new Date(send.clickedAt).toLocaleTimeString()}
                        </span>
                      ) : '—'}
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

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  valueColor,
  progress,
  progressColor,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  valueColor?: string
  progress?: number
  progressColor?: string
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-text-muted" />
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-xl font-bold tabular-nums', valueColor ?? 'text-heading')}>{value}</p>
      {progress !== undefined && progress > 0 && (
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', progressColor ?? 'bg-accent')}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
      {sub && <p className="text-[11px] text-text-muted mt-1">{sub}</p>}
    </div>
  )
}

function FunnelBar({
  label,
  count,
  total,
  color,
}: {
  label: string
  count: number
  total: number
  color: string
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-text-secondary w-16 text-right">{label}</span>
      <div className="flex-1 h-6 bg-gray-50 rounded-md overflow-hidden relative">
        <div
          className={cn('h-full rounded-md transition-all', color)}
          style={{ width: `${Math.max(pct, 1)}%`, opacity: pct > 0 ? 1 : 0.2 }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-text-primary">
          {count.toLocaleString()} ({pct.toFixed(1)}%)
        </span>
      </div>
    </div>
  )
}
