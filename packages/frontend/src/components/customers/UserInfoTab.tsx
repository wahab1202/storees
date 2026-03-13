'use client'

import {
  Activity, Calendar, CheckCircle2, XCircle,
  Mail, MessageSquare, Bell, Smartphone,
  TrendingUp, ShoppingCart, CreditCard, Users,
  Clock, Briefcase, Shield,
} from 'lucide-react'
import { formatCurrency } from '@storees/shared'
import { cn } from '@/lib/utils'
import type { Customer } from '@storees/shared'

type CustomerDetail = Customer & {
  segments: Array<{ segmentId: string; segmentName: string; joinedAt: string }>
}

type Props = {
  customer: CustomerDetail
  domain: string
}

// ─── Helpers ──────────────────────────────────────────────

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatShortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function snakeToTitle(str: string): string {
  return str
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    if (Math.abs(value) >= 100) return value.toLocaleString()
    return String(value)
  }
  if (value instanceof Date) return formatShortDate(value)
  if (typeof value === 'string') {
    // Check if it looks like a date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return formatShortDate(d)
    }
    return value
  }
  return String(value)
}

// ─── Domain-specific metric definitions ──────────────────

type MetricItem = { label: string; value: string }
type MetricGroup = { title: string; icon: typeof Activity; items: MetricItem[] }

function getMetricGroups(customer: CustomerDetail, domain: string): MetricGroup[] {
  const m = customer.metrics ?? {}
  const ca = customer.customAttributes ?? {}

  switch (domain) {
    case 'ecommerce':
      return [
        {
          title: 'Lifecycle',
          icon: Clock,
          items: [
            { label: 'Last Active', value: formatShortDate(customer.lastSeen) },
            { label: 'Days Since Last Order', value: m.days_since_last_order != null ? String(m.days_since_last_order) : '—' },
          ],
        },
        {
          title: 'Conversion',
          icon: ShoppingCart,
          items: [
            { label: 'Orders', value: String(customer.totalOrders) },
            { label: 'Lifetime Value', value: formatCurrency(customer.clv) },
          ],
        },
        {
          title: 'Acquisition',
          icon: TrendingUp,
          items: [
            { label: 'First Seen', value: formatShortDate(customer.firstSeen) },
            { label: 'Avg Order Value', value: formatCurrency(customer.avgOrderValue) },
          ],
        },
      ]

    case 'fintech':
      return [
        {
          title: 'Lifecycle',
          icon: Clock,
          items: [
            { label: 'Last Active', value: formatShortDate(customer.lastSeen) },
            { label: 'Lifecycle Stage', value: snakeToTitle(String(m.lifecycle_stage ?? 'new')) },
            { label: 'Days Since Last Txn', value: m.days_since_last_txn != null ? String(m.days_since_last_txn) : '—' },
          ],
        },
        {
          title: 'Conversion',
          icon: CreditCard,
          items: [
            { label: 'Transactions', value: String(m.total_transactions ?? 0) },
            { label: 'Total Debit', value: formatCurrency(Number(m.total_debit ?? 0)) },
            { label: 'Total Credit', value: formatCurrency(Number(m.total_credit ?? 0)) },
          ],
        },
        {
          title: 'Acquisition',
          icon: Shield,
          items: [
            { label: 'First Seen', value: formatShortDate(customer.firstSeen) },
            { label: 'KYC Status', value: snakeToTitle(String(m.kyc_status ?? 'pending')) },
            { label: 'Account Type', value: snakeToTitle(String(ca.account_type ?? '—')) },
          ],
        },
      ]

    case 'saas':
      return [
        {
          title: 'Lifecycle',
          icon: Clock,
          items: [
            { label: 'Last Active', value: formatShortDate(customer.lastSeen) },
            { label: 'Days Since Signup', value: String(m.days_since_signup ?? '—') },
          ],
        },
        {
          title: 'Conversion',
          icon: Briefcase,
          items: [
            { label: 'Feature Usage', value: String(m.feature_usage_count ?? 0) },
            { label: 'MRR', value: formatCurrency(Number(m.mrr ?? 0)) },
          ],
        },
        {
          title: 'Acquisition',
          icon: TrendingUp,
          items: [
            { label: 'First Seen', value: formatShortDate(customer.firstSeen) },
            { label: 'Plan', value: snakeToTitle(String(m.plan ?? 'free')) },
            { label: 'Trial Status', value: snakeToTitle(String(m.trial_status ?? 'no_trial')) },
          ],
        },
      ]

    default: // custom
      return [
        {
          title: 'Lifecycle',
          icon: Clock,
          items: [
            { label: 'Last Active', value: formatShortDate(customer.lastSeen) },
          ],
        },
        {
          title: 'Conversion',
          icon: Activity,
          items: [
            { label: 'Total Events', value: String(m.total_events ?? 0) },
          ],
        },
        {
          title: 'Acquisition',
          icon: TrendingUp,
          items: [
            { label: 'First Seen', value: formatShortDate(customer.firstSeen) },
          ],
        },
      ]
  }
}

// ─── Reachability channels by domain ─────────────────────

type ChannelInfo = {
  key: 'emailSubscribed' | 'smsSubscribed' | 'pushSubscribed' | 'whatsappSubscribed'
  label: string
  icon: typeof Mail
}

const ALL_CHANNELS: ChannelInfo[] = [
  { key: 'emailSubscribed', label: 'Email', icon: Mail },
  { key: 'smsSubscribed', label: 'SMS', icon: MessageSquare },
  { key: 'pushSubscribed', label: 'Push', icon: Bell },
  { key: 'whatsappSubscribed', label: 'WhatsApp', icon: Smartphone },
]

const DOMAIN_CHANNELS: Record<string, string[]> = {
  ecommerce: ['Email'],
  fintech: ['Email', 'SMS', 'Push', 'WhatsApp'],
  saas: ['Email', 'Push'],
  custom: ['Email'],
}

function getChannels(domain: string): ChannelInfo[] {
  const allowed = DOMAIN_CHANNELS[domain] ?? DOMAIN_CHANNELS.custom
  return ALL_CHANNELS.filter(ch => allowed.includes(ch.label))
}

// ─── Component ────────────────────────────────────────────

export function UserInfoTab({ customer, domain }: Props) {
  const metricGroups = getMetricGroups(customer, domain)
  const channels = getChannels(domain)

  const customAttrs = customer.customAttributes ?? {}
  const metrics = customer.metrics ?? {}

  const customAttrEntries = Object.entries(customAttrs).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  )
  const metricEntries = Object.entries(metrics).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  )

  return (
    <div className="space-y-6">
      {/* Metric Card Groups */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metricGroups.map(group => {
          const Icon = group.icon
          return (
            <div key={group.title} className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-surface">
                  <Icon className="h-4 w-4 text-text-muted" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">{group.title}</h3>
              </div>
              <div className="space-y-3">
                {group.items.map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-text-muted">{item.label}</span>
                    <span className="text-sm font-medium text-text-primary">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Reachability */}
      <div className="bg-white border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Reachability</h3>
        <div className="flex flex-wrap gap-4">
          {channels.map(ch => {
            const Icon = ch.icon
            const subscribed = customer[ch.key]
            return (
              <div
                key={ch.label}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border min-w-[140px]',
                  subscribed
                    ? 'border-green-200 bg-green-50/50'
                    : 'border-border bg-surface',
                )}
              >
                <Icon className={cn('h-5 w-5', subscribed ? 'text-green-600' : 'text-text-muted')} />
                <div>
                  <div className="text-sm font-medium text-text-primary">{ch.label}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {subscribed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                    )}
                    <span className={cn('text-xs', subscribed ? 'text-green-700' : 'text-text-muted')}>
                      {subscribed ? 'Reachable' : 'Not subscribed'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Segments */}
      {customer.segments.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-text-muted" />
            <h3 className="text-sm font-semibold text-text-primary">Segments</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {customer.segments.map(seg => (
              <div
                key={seg.segmentId}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 text-accent"
              >
                <span className="text-sm font-medium">{seg.segmentName}</span>
                <span className="text-xs text-accent/60">
                  joined {formatShortDate(seg.joinedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Properties Tables */}
      {(customAttrEntries.length > 0 || metricEntries.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Custom Attributes */}
          {customAttrEntries.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Custom Attributes</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">
                      Property Name
                    </th>
                    <th className="text-right py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customAttrEntries.map(([key, val]) => (
                    <tr key={key} className="border-b border-border/50">
                      <td className="py-2 text-text-secondary">{snakeToTitle(key)}</td>
                      <td className="py-2 text-right font-medium text-text-primary">
                        {formatValue(val)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Computed Metrics */}
          {metricEntries.length > 0 && (
            <div className="bg-white border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Computed Metrics</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">
                      Property Name
                    </th>
                    <th className="text-right py-2 text-xs font-semibold text-text-muted uppercase tracking-wide">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metricEntries.map(([key, val]) => (
                    <tr key={key} className="border-b border-border/50">
                      <td className="py-2 text-text-secondary">{snakeToTitle(key)}</td>
                      <td className="py-2 text-right font-medium text-text-primary">
                        {formatValue(val)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
