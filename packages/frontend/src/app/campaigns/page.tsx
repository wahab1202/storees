'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { StatusStrip } from '@/components/shared/StatusStrip'
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
  MailOpen,
  MousePointerClick,
  Mail,
  MessageSquare,
  Bell,
  CalendarClock,
  Zap,
  Smartphone,
  Trophy,
  Search,
} from 'lucide-react'
import type { Campaign } from '@storees/shared'

/* ─── Status Config ─── */

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

/* ─── Channel / Delivery Type cards for modal ─── */

const CHANNELS = [
  { key: 'push', label: 'Push', icon: Bell, enabled: true },
  { key: 'email', label: 'Email', icon: Mail, enabled: true },
  { key: 'sms', label: 'SMS', icon: MessageSquare, enabled: true },
] as const

const DELIVERY_TYPES = [
  { key: 'one-time', label: 'One Time', icon: Trophy, desc: 'Send once to a segment', color: 'bg-amber-50 text-amber-600', enabled: true },
  { key: 'periodic', label: 'Periodic', icon: CalendarClock, desc: 'Recurring schedule', color: 'bg-blue-50 text-blue-600', enabled: true },
  { key: 'event-triggered', label: 'Event Triggered', icon: Zap, desc: 'React to user events', color: 'bg-violet-50 text-violet-600', enabled: false },
  { key: 'device-triggered', label: 'Device Triggered', icon: Smartphone, desc: 'On app open, etc.', color: 'bg-emerald-50 text-emerald-600', enabled: false },
] as const

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  sms: MessageSquare,
  push: Bell,
}

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
}

const DELIVERY_LABELS: Record<string, string> = {
  'one-time': 'One-time',
  'periodic': 'Periodic',
}

/* ─── Components ─── */

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

function MiniProgress({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-text-secondary">{value.toFixed(0)}%</span>
    </div>
  )
}

/* ─── Main Page ─── */

export default function CampaignsPage() {
  const router = useRouter()
  const { data, isLoading, isError } = useCampaigns()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState('email')
  const [selectedType, setSelectedType] = useState('one-time')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const campaigns = data?.data ?? []

  // Status counts for the strip
  const statusTabs = useMemo(() => [
    { key: 'all', label: 'All', count: campaigns.length },
    { key: 'sending', label: 'Active', count: campaigns.filter(c => c.status === 'sending').length },
    { key: 'scheduled', label: 'Scheduled', count: campaigns.filter(c => c.status === 'scheduled').length },
    { key: 'sent', label: 'Sent', count: campaigns.filter(c => c.status === 'sent').length },
    { key: 'draft', label: 'Drafts', count: campaigns.filter(c => c.status === 'draft').length },
  ], [campaigns])

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    let result = campaigns
    if (statusFilter) result = result.filter(c => c.status === statusFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q) || (c.subject && c.subject.toLowerCase().includes(q)))
    }
    return result
  }, [campaigns, statusFilter, searchQuery])

  const handleContinueCreate = () => {
    setShowCreateModal(false)
    router.push(`/campaigns/create?channel=${selectedChannel}&type=${selectedType}`)
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Campaign
          </button>
        }
      />

      {/* Create Campaign Slide-Over */}
      <SlidePanel
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Campaign"
        footer={
          <button
            onClick={handleContinueCreate}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        }
      >
        {/* Channel Selector */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Outbound</h3>
          <div className="grid grid-cols-3 gap-3">
            {CHANNELS.map(ch => {
              const Icon = ch.icon
              const isSelected = selectedChannel === ch.key
              return (
                <button
                  key={ch.key}
                  onClick={() => ch.enabled && setSelectedChannel(ch.key)}
                  disabled={!ch.enabled}
                  className={cn(
                    'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                    isSelected ? 'border-accent bg-accent/5' : 'border-border',
                    ch.enabled ? 'hover:border-gray-300 cursor-pointer' : 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    isSelected ? 'bg-accent/10' : 'bg-gray-100',
                  )}>
                    <Icon className={cn('h-5 w-5', isSelected ? 'text-accent' : 'text-text-muted')} />
                  </div>
                  <span className={cn('text-sm font-medium', isSelected ? 'text-accent' : 'text-text-primary')}>
                    {ch.label}
                  </span>
                  {!ch.enabled && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] font-medium text-text-muted bg-gray-100 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Delivery Type Cards */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Delivery Type</h3>
          <div className="grid grid-cols-2 gap-3">
            {DELIVERY_TYPES.map(dt => {
              const Icon = dt.icon
              const isSelected = selectedType === dt.key
              return (
                <button
                  key={dt.key}
                  onClick={() => dt.enabled && setSelectedType(dt.key)}
                  disabled={!dt.enabled}
                  className={cn(
                    'relative flex flex-col items-center text-center p-5 rounded-xl border-2 transition-all h-40',
                    isSelected ? 'border-accent bg-accent/5' : 'border-border',
                    dt.enabled ? 'hover:border-gray-300 cursor-pointer' : 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <div className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center mb-3',
                    isSelected ? 'bg-accent/10' : dt.color.split(' ')[0],
                  )}>
                    <Icon className={cn(
                      'h-7 w-7',
                      isSelected ? 'text-accent' : dt.color.split(' ')[1],
                    )} />
                  </div>
                  <span className={cn('text-sm font-semibold', isSelected ? 'text-accent' : 'text-text-primary')}>
                    {dt.label}
                  </span>
                  <span className="text-[10px] text-text-muted mt-0.5">{dt.desc}</span>
                  {!dt.enabled && (
                    <span className="absolute top-2 right-2 text-[9px] font-medium text-text-muted bg-gray-100 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </SlidePanel>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load campaigns.</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 bg-white border border-border rounded-xl">
          <Megaphone className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-text-primary mb-1">No campaigns yet</h3>
          <p className="text-sm text-text-secondary mb-4">
            Send one-time email broadcasts to a customer segment.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Status Summary Strip */}
          <StatusStrip tabs={statusTabs} active={statusFilter} onChange={setStatusFilter} />

          {/* Search Bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search campaigns..."
                className="w-full h-9 pl-9 pr-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-text-muted"
              />
            </div>
            <span className="text-xs text-text-muted">
              Showing {filteredCampaigns.length} of {campaigns.length} campaigns
            </span>
          </div>

          {/* Campaign Table */}
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Campaign</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Recipients</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Campaign Performance</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Goals & Engagement</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Created</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCampaigns.map(campaign => {
                  const isSent = campaign.status === 'sent' || campaign.status === 'sending'
                  const total = campaign.totalRecipients
                  const deliveryPct = total > 0 ? (campaign.deliveredCount / total) * 100 : 0
                  const openPct = campaign.deliveredCount > 0 ? (campaign.openedCount / campaign.deliveredCount) * 100 : 0
                  const clickPct = campaign.openedCount > 0 ? (campaign.clickedCount / campaign.openedCount) * 100 : 0

                  return (
                    <tr key={campaign.id} className="hover:bg-surface/50 transition-colors">
                      <td className="px-5 py-4">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{campaign.name}</p>
                          <p className="text-xs text-text-muted truncate max-w-[200px]">
                            {campaign.subject ?? campaign.bodyText ?? '—'}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {(() => {
                          const ChIcon = CHANNEL_ICONS[campaign.channel] ?? Mail
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-text-secondary">
                              <ChIcon className="h-3 w-3" />
                              {CHANNEL_LABELS[campaign.channel] ?? 'Email'} · {DELIVERY_LABELS[campaign.deliveryType] ?? 'One-time'}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-5 py-4">
                        <CampaignStatusBadge status={campaign.status} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-text-muted" />
                          <span className="text-sm tabular-nums text-text-primary">
                            {total > 0 ? total.toLocaleString() : '—'}
                          </span>
                        </div>
                        {campaign.segmentName && (
                          <p className="text-[11px] text-text-muted mt-0.5">{campaign.segmentName}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {isSent && total > 0 ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-text-muted w-14">Delivered</span>
                              <MiniProgress value={deliveryPct} color="bg-green-500" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-text-muted w-14">Opened</span>
                              <MiniProgress value={openPct} color="bg-indigo-500" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-text-muted w-14">Clicked</span>
                              <MiniProgress value={clickPct} color="bg-violet-500" />
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {isSent && total > 0 ? (
                          <div className="space-y-1">
                            <div>
                              <span className="text-base font-bold text-accent tabular-nums">{openPct.toFixed(1)}%</span>
                              <p className="text-[10px] text-text-muted">Open Rate</p>
                            </div>
                            <div>
                              <span className="text-base font-bold text-violet-600 tabular-nums">{clickPct.toFixed(1)}%</span>
                              <p className="text-[10px] text-text-muted">Click Rate</p>
                            </div>
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
                            ? `Sched. ${new Date(campaign.scheduledAt).toLocaleDateString()}`
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
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
