'use client'

import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCampaigns } from '@/hooks/useCampaigns'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  Plus,
  Megaphone,
  Users,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import type { Campaign } from '@storees/shared'

const STATUS_CONFIG: Record<
  Campaign['status'],
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  draft: { label: 'Draft', icon: Clock, className: 'bg-gray-100 text-gray-600' },
  scheduled: { label: 'Scheduled', icon: Clock, className: 'bg-blue-50 text-blue-600' },
  sending: { label: 'Sending', icon: Loader2, className: 'bg-yellow-50 text-yellow-600' },
  sent: { label: 'Sent', icon: CheckCircle, className: 'bg-green-50 text-green-700' },
  paused: { label: 'Paused', icon: AlertCircle, className: 'bg-orange-50 text-orange-600' },
}

function CampaignStatusBadge({ status }: { status: Campaign['status'] }) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full', config.className)}>
      <Icon className={cn('h-3 w-3', status === 'sending' && 'animate-spin')} />
      {config.label}
    </span>
  )
}

export default function CampaignsPage() {
  const { data, isLoading, isError } = useCampaigns()

  return (
    <div>
      <PageHeader
        title="Campaigns"
        actions={
          <Link
            href="/campaigns/create"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Campaign
          </Link>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load campaigns.</p>
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="text-center py-20 bg-white border border-border rounded-xl">
          <Megaphone className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-text-primary mb-1">No campaigns yet</h3>
          <p className="text-sm text-text-secondary mb-4">
            Send one-time email broadcasts to a customer segment.
          </p>
          <Link
            href="/campaigns/create"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Campaign
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Campaign</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Segment</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Recipients</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Sent</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Date</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.data.map(campaign => (
                <tr key={campaign.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{campaign.name}</p>
                      <p className="text-xs text-text-muted truncate max-w-[200px]">{campaign.subject}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {campaign.segmentName ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                        <Users className="h-3.5 w-3.5 text-text-muted" />
                        {campaign.segmentName}
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <CampaignStatusBadge status={campaign.status} />
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm tabular-nums text-text-primary">
                      {campaign.totalRecipients > 0 ? campaign.totalRecipients.toLocaleString() : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {campaign.status === 'sent' ? (
                      <div className="flex items-center gap-2">
                        <Send className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-sm tabular-nums text-text-primary">
                          {campaign.sentCount.toLocaleString()}
                        </span>
                        {campaign.failedCount > 0 && (
                          <span className="text-xs text-red-500">({campaign.failedCount} failed)</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs text-text-muted">
                      {campaign.sentAt
                        ? new Date(campaign.sentAt).toLocaleDateString()
                        : campaign.scheduledAt
                        ? `Scheduled ${new Date(campaign.scheduledAt).toLocaleDateString()}`
                        : new Date(campaign.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="text-text-muted hover:text-text-primary transition-colors"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
