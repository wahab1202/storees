'use client'

import { Mail, Phone, Calendar, CheckCircle2, XCircle } from 'lucide-react'
import { formatCurrency } from '@storees/shared'
import type { Customer } from '@storees/shared'

type CustomerDetail = Customer & {
  segments: Array<{ segmentId: string; segmentName: string; joinedAt: string }>
}

type Props = {
  customer: CustomerDetail
}

function SubscriptionBadge({ subscribed, label }: { subscribed: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {subscribed ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400" />
      )}
      <span className={subscribed ? 'text-text-primary' : 'text-text-muted'}>{label}</span>
    </div>
  )
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DetailsTab({ customer }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Profile info */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Profile</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-text-muted" />
            <span className="text-text-primary">{customer.email ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-text-muted" />
            <span className="text-text-primary">{customer.phone ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-text-muted" />
            <span className="text-text-secondary">
              First seen {formatDate(customer.firstSeen)}
            </span>
          </div>
        </div>

        {/* Segments */}
        {customer.segments.length > 0 && (
          <div className="pt-2">
            <span className="text-xs font-medium text-text-secondary">Segments</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {customer.segments.map(seg => (
                <span
                  key={seg.segmentId}
                  className="inline-block px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent font-medium"
                >
                  {seg.segmentName}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Metrics</h3>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Total Spent" value={formatCurrency(customer.totalSpent)} />
          <Metric label="Orders" value={String(customer.totalOrders)} />
          <Metric label="Avg Order" value={formatCurrency(customer.avgOrderValue)} />
          <Metric label="CLV" value={formatCurrency(customer.clv)} />
        </div>
      </div>

      {/* Subscriptions */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Subscriptions</h3>
        <div className="space-y-2">
          <SubscriptionBadge subscribed={customer.emailSubscribed} label="Email" />
          <SubscriptionBadge subscribed={customer.smsSubscribed} label="SMS" />
          <SubscriptionBadge subscribed={customer.whatsappSubscribed} label="WhatsApp" />
          <SubscriptionBadge subscribed={customer.pushSubscribed} label="Push" />
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-sm font-medium text-text-primary">{value}</div>
    </div>
  )
}
