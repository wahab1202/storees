'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  useCampaignDetail,
  useCampaignSends,
  useSendCampaign,
  useDeleteCampaign,
  useCampaignAnalytics,
  useCampaignAbResults,
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
  Target,
  DollarSign,
  TrendingUp,
  FlaskConical,
  Trophy,
  BarChart3,
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
  const { data: analyticsData } = useCampaignAnalytics(id)
  const sendCampaign = useSendCampaign()
  const deleteCampaign = useDeleteCampaign()

  const [showPreview, setShowPreview] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showSendConfirm, setShowSendConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'recipients' | 'ab'>('overview')

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
  const analytics = analyticsData?.data ?? null
  const canSend = ['draft', 'scheduled'].includes(campaign.status) && !!campaign.segmentId
  const hasSent = campaign.status === 'sent' || campaign.status === 'sending'

  const handleSend = () => {
    sendCampaign.mutate(id, { onSuccess: () => setShowSendConfirm(false) })
  }

  const handleDelete = () => {
    deleteCampaign.mutate(id, { onSuccess: () => router.push('/campaigns') })
  }

  // Compute rates from analytics or campaign counters
  const total = campaign.totalRecipients
  const funnel = analytics?.funnel
  const deliveryRate = funnel?.deliveryRate ?? (total > 0 ? (campaign.deliveredCount / total) * 100 : 0)
  const openRate = funnel?.openRate ?? (campaign.deliveredCount > 0 ? (campaign.openedCount / campaign.deliveredCount) * 100 : 0)
  const clickRate = funnel?.clickRate ?? (campaign.openedCount > 0 ? (campaign.clickedCount / campaign.openedCount) * 100 : 0)
  const bounceRate = funnel?.bounceRate ?? (total > 0 ? (campaign.bouncedCount / total) * 100 : 0)
  const conversionRate = funnel?.conversionRate ?? 0
  const totalRevenue = analytics?.summary?.totalRevenue ?? 0

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
              {campaign.abTestEnabled && (
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-50 text-purple-600">
                  A/B Test
                </span>
              )}
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

      {/* Performance Metrics — top-level cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <MetricCard icon={Users} label="Recipients" value={total > 0 ? total.toLocaleString() : '—'} />
        <MetricCard icon={CheckCircle} label="Delivered" value={campaign.deliveredCount > 0 ? campaign.deliveredCount.toLocaleString() : '—'} progress={deliveryRate} progressColor="bg-green-500" sub={hasSent ? `${deliveryRate.toFixed(1)}%` : undefined} valueColor="text-green-600" />
        <MetricCard icon={MailOpen} label="Opened" value={campaign.openedCount > 0 ? campaign.openedCount.toLocaleString() : '—'} progress={openRate} progressColor="bg-indigo-500" sub={hasSent ? `${openRate.toFixed(1)}%` : undefined} valueColor="text-indigo-600" />
        <MetricCard icon={MousePointerClick} label="Clicked" value={campaign.clickedCount > 0 ? campaign.clickedCount.toLocaleString() : '—'} progress={clickRate} progressColor="bg-violet-500" sub={hasSent ? `${clickRate.toFixed(1)}%` : undefined} valueColor="text-violet-600" />
        <MetricCard icon={Ban} label="Bounced" value={campaign.bouncedCount > 0 ? campaign.bouncedCount.toLocaleString() : '—'} progress={bounceRate} progressColor="bg-red-500" sub={hasSent && campaign.bouncedCount > 0 ? `${bounceRate.toFixed(1)}%` : undefined} valueColor={campaign.bouncedCount > 0 ? 'text-red-500' : undefined} />
        <MetricCard icon={Target} label="Converted" value={funnel?.converted ? funnel.converted.toLocaleString() : '—'} progress={conversionRate} progressColor="bg-emerald-500" sub={conversionRate > 0 ? `${conversionRate.toFixed(1)}%` : undefined} valueColor="text-emerald-600" />
        <MetricCard icon={DollarSign} label="Revenue" value={totalRevenue > 0 ? `$${totalRevenue.toLocaleString()}` : '—'} sub={analytics?.summary?.avgRevenuePerConversion ? `$${analytics.summary.avgRevenuePerConversion.toFixed(0)} per conv.` : undefined} valueColor="text-emerald-600" />
      </div>

      {/* Tabs */}
      {hasSent && (
        <div className="flex gap-1 mb-6 border-b border-border">
          {[
            { key: 'overview' as const, label: 'Overview', icon: BarChart3 },
            { key: 'recipients' as const, label: 'Recipients', icon: Users },
            ...(campaign.abTestEnabled ? [{ key: 'ab' as const, label: 'A/B Results', icon: FlaskConical }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-primary',
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Delivery Funnel */}
          {hasSent && total > 0 && (
            <div className="bg-white border border-border rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-heading mb-4">Delivery Funnel</h3>
              <div className="space-y-3">
                <FunnelBar label="Sent" count={campaign.sentCount} total={total} color="bg-blue-500" />
                <FunnelBar label="Delivered" count={campaign.deliveredCount} total={total} color="bg-green-500" />
                <FunnelBar label="Opened" count={campaign.openedCount} total={total} color="bg-indigo-500" />
                <FunnelBar label="Clicked" count={campaign.clickedCount} total={total} color="bg-violet-500" />
                {(funnel?.converted ?? 0) > 0 && (
                  <FunnelBar label="Converted" count={funnel!.converted} total={total} color="bg-emerald-500" />
                )}
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

          {/* Conversion Goals */}
          {analytics && analytics.conversions.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-heading mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-600" />
                Conversion Goals
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics.conversions.map(goal => (
                  <div key={goal.goalName} className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-text-primary">{goal.goalName}</span>
                      {analytics.summary.bestPerformingGoal === goal.goalName && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
                          <Trophy className="h-3 w-3" /> Best
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-emerald-600 tabular-nums">{goal.conversions}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-text-muted">{goal.conversionRate.toFixed(1)}% rate</span>
                      {goal.revenue > 0 && (
                        <span className="text-xs font-medium text-emerald-600">
                          ${goal.revenue.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.min(goal.conversionRate, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-text-muted mt-1">Event: {goal.eventName}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Engagement Timeline */}
          {analytics && analytics.timeline.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-heading mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-600" />
                Engagement Over Time
              </h3>
              <div className="space-y-2">
                {analytics.timeline.slice(0, 24).map((t, i) => {
                  const maxVal = Math.max(...analytics.timeline.map(x => x.delivered + x.opened + x.clicked), 1)
                  const totalBar = t.delivered + t.opened + t.clicked
                  const pct = (totalBar / maxVal) * 100
                  const hourLabel = new Date(t.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-text-muted w-14 text-right tabular-nums">{hourLabel}</span>
                      <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden flex">
                        {t.delivered > 0 && (
                          <div className="h-full bg-green-400" style={{ width: `${(t.delivered / maxVal) * 100}%` }} />
                        )}
                        {t.opened > 0 && (
                          <div className="h-full bg-indigo-400" style={{ width: `${(t.opened / maxVal) * 100}%` }} />
                        )}
                        {t.clicked > 0 && (
                          <div className="h-full bg-violet-400" style={{ width: `${(t.clicked / maxVal) * 100}%` }} />
                        )}
                      </div>
                      <span className="text-[10px] text-text-muted w-8 tabular-nums">{totalBar}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 text-[10px] text-text-muted">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-400" /> Delivered</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-400" /> Opened</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-400" /> Clicked</span>
              </div>
            </div>
          )}

          {/* Top Engaged Recipients */}
          {analytics && analytics.topRecipients.length > 0 && (
            <div className="bg-white border border-border rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 bg-surface border-b border-border">
                <h3 className="text-sm font-semibold text-text-primary">Top Engaged Recipients</h3>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-surface border-b border-border">
                    <tr>
                      <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Recipient</th>
                      <th className="px-5 py-2 text-center text-xs font-semibold text-text-muted">Opened</th>
                      <th className="px-5 py-2 text-center text-xs font-semibold text-text-muted">Clicked</th>
                      <th className="px-5 py-2 text-center text-xs font-semibold text-text-muted">Converted</th>
                      <th className="px-5 py-2 text-right text-xs font-semibold text-text-muted">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analytics.topRecipients.slice(0, 20).map(r => (
                      <tr key={r.customerId} className="hover:bg-surface/50">
                        <td className="px-5 py-2.5">
                          <p className="text-sm text-text-primary">{r.name ?? r.email}</p>
                          {r.name && <p className="text-[11px] text-text-muted">{r.email}</p>}
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          {r.opened ? <CheckCircle className="h-3.5 w-3.5 text-indigo-500 mx-auto" /> : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          {r.clicked ? <CheckCircle className="h-3.5 w-3.5 text-violet-500 mx-auto" /> : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          {r.converted ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mx-auto" /> : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-right text-sm tabular-nums text-text-primary">
                          {r.revenue > 0 ? `$${r.revenue.toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Date/time info */}
          <div className="flex items-center gap-6 text-xs text-text-muted">
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
        </>
      )}

      {/* Recipients Tab */}
      {activeTab === 'recipients' && sends.length > 0 && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-surface border-b border-border">
            <Mail className="h-4 w-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">All Recipients</h2>
            <span className="text-xs text-text-muted ml-auto">{sends.length} total</span>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface border-b border-border">
                <tr>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Email</th>
                  <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Status</th>
                  {campaign.abTestEnabled && (
                    <th className="px-5 py-2 text-left text-xs font-semibold text-text-muted">Variant</th>
                  )}
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
                    {campaign.abTestEnabled && (
                      <td className="px-5 py-2.5">
                        {send.variant ? (
                          <span className={cn(
                            'px-2 py-0.5 text-[10px] font-bold rounded-full',
                            send.variant === 'A' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600',
                          )}>
                            {send.variant}
                          </span>
                        ) : '—'}
                      </td>
                    )}
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

      {/* A/B Results Tab */}
      {activeTab === 'ab' && campaign.abTestEnabled && (
        <AbResultsPanel campaignId={id} />
      )}
    </div>
  )
}

/* ─── A/B Results Panel ─── */

function AbResultsPanel({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useCampaignAbResults(campaignId, true)
  const results = data?.data

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (!results) return <p className="text-sm text-text-muted py-10 text-center">Not enough data for A/B comparison yet.</p>

  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-heading mb-6 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-purple-600" />
        A/B Test Results
        {results.winner !== 'tie' && (
          <span className="ml-2 px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-full flex items-center gap-1">
            <Trophy className="h-3 w-3" />
            Variant {results.winner} wins
          </span>
        )}
        {results.confidence > 0 && (
          <span className="text-xs text-text-muted font-normal">
            ({results.confidence.toFixed(0)}% confidence)
          </span>
        )}
      </h3>

      <div className="grid grid-cols-2 gap-6">
        {/* Variant A */}
        <div className={cn(
          'border rounded-xl p-5',
          results.winner === 'A' ? 'border-emerald-300 bg-emerald-50/30' : 'border-border',
        )}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">A</span>
            <span className="text-sm font-semibold text-text-primary">Variant A (Control)</span>
            {results.winner === 'A' && <Trophy className="h-4 w-4 text-amber-500 ml-auto" />}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-text-primary tabular-nums">{results.variantA.sent}</p>
              <p className="text-[10px] text-text-muted">Sent</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-600 tabular-nums">{results.variantA.openRate.toFixed(1)}%</p>
              <p className="text-[10px] text-text-muted">Open Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-violet-600 tabular-nums">{results.variantA.clickRate.toFixed(1)}%</p>
              <p className="text-[10px] text-text-muted">Click Rate</p>
            </div>
          </div>
        </div>

        {/* Variant B */}
        <div className={cn(
          'border rounded-xl p-5',
          results.winner === 'B' ? 'border-emerald-300 bg-emerald-50/30' : 'border-border',
        )}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600">B</span>
            <span className="text-sm font-semibold text-text-primary">Variant B</span>
            {results.winner === 'B' && <Trophy className="h-4 w-4 text-amber-500 ml-auto" />}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-text-primary tabular-nums">{results.variantB.sent}</p>
              <p className="text-[10px] text-text-muted">Sent</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-600 tabular-nums">{results.variantB.openRate.toFixed(1)}%</p>
              <p className="text-[10px] text-text-muted">Open Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-violet-600 tabular-nums">{results.variantB.clickRate.toFixed(1)}%</p>
              <p className="text-[10px] text-text-muted">Click Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Visual comparison bars */}
      <div className="mt-6 space-y-3">
        <ComparisonBar label="Open Rate" a={results.variantA.openRate} b={results.variantB.openRate} />
        <ComparisonBar label="Click Rate" a={results.variantA.clickRate} b={results.variantB.clickRate} />
      </div>
    </div>
  )
}

function ComparisonBar({ label, a, b }: { label: string; a: number; b: number }) {
  const max = Math.max(a, b, 1)
  return (
    <div>
      <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-xs font-bold text-blue-600 w-12 text-right">{a.toFixed(1)}%</span>
        <div className="flex-1 flex gap-1">
          <div className="h-5 bg-blue-400 rounded-l" style={{ width: `${(a / max) * 50}%` }} />
          <div className="h-5 bg-purple-400 rounded-r" style={{ width: `${(b / max) * 50}%` }} />
        </div>
        <span className="text-xs font-bold text-purple-600 w-12">{b.toFixed(1)}%</span>
      </div>
      <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
        <span>Variant A</span>
        <span>Variant B</span>
      </div>
    </div>
  )
}

/* ─── Shared Components ─── */

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
