'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useCustomerDetail, useCustomerOrders, useCustomerEvents, useCustomerTrips, useCustomerMessages } from '@/hooks/useCustomerDetail'
import { useDashboardStats } from '@/hooks/useDashboard'
import { UserInfoTab } from '@/components/customers/UserInfoTab'
import { ActivityTab } from '@/components/customers/ActivityTab'
import { OrdersTab } from '@/components/customers/OrdersTab'
import { JourneysTab } from '@/components/customers/JourneysTab'
import { MessagesTab } from '@/components/customers/MessagesTab'
import { PredictionsTab } from '@/components/customers/PredictionsTab'
import { JourneyTimelineTab } from '@/components/customers/JourneyTimelineTab'
import { cn } from '@/lib/utils'

const TABS = ['User Info', 'Journey', 'Activity', 'Orders', 'Journeys', 'Messages', 'Predictions'] as const
type Tab = (typeof TABS)[number]

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0][0].toUpperCase()
  }
  if (email) return email[0].toUpperCase()
  return '?'
}

function daysSince(date: Date | string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function CustomerProfilePage() {
  const params = useParams()
  const id = params.id as string
  const [activeTab, setActiveTab] = useState<Tab>('User Info')

  const { data: customerRes, isLoading } = useCustomerDetail(id)
  const { data: ordersRes, isLoading: ordersLoading } = useCustomerOrders(id)
  const { data: eventsRes, isLoading: eventsLoading } = useCustomerEvents(id, 200)
  const { data: tripsRes, isLoading: tripsLoading } = useCustomerTrips(id)
  const { data: messagesRes, isLoading: messagesLoading } = useCustomerMessages(id)
  const { data: statsData } = useDashboardStats()

  const domain = statsData?.data?.domainType ?? 'ecommerce'
  const customer = customerRes?.data

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted text-sm">Customer not found.</p>
        <Link href="/customers" className="text-accent text-sm hover:underline mt-2 inline-block">
          Back to Customers
        </Link>
      </div>
    )
  }

  const isActive = daysSince(customer.lastSeen) <= 30

  return (
    <div>
      {/* Back link */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Customers
      </Link>

      {/* Profile Header */}
      <div className="bg-white border border-border rounded-xl p-6 mb-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xl font-bold shrink-0">
            {getInitials(customer.name, customer.email)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-heading truncate">
                {customer.name ?? 'Unnamed Customer'}
              </h1>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wide',
                  isActive
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500',
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-green-500' : 'bg-gray-400')} />
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
              {customer.email && <span>{customer.email}</span>}
              {customer.phone && <span>{customer.phone}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-text-muted">
              <span>ID: {customer.id.slice(0, 8)}...</span>
              {customer.externalId && <span>External: {customer.externalId}</span>}
              <span>First seen {formatDate(customer.firstSeen)}</span>
              <span>Last seen {formatDate(customer.lastSeen)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-5 py-2.5 text-sm font-medium transition-colors relative',
              activeTab === tab
                ? 'text-accent'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'User Info' && (
        <UserInfoTab customer={customer} domain={domain} />
      )}
      {activeTab === 'Journey' && (
        <JourneyTimelineTab customerId={id} />
      )}
      {activeTab === 'Activity' && (
        <ActivityTab events={eventsRes?.data ?? []} isLoading={eventsLoading} />
      )}
      {activeTab === 'Orders' && (
        <OrdersTab orders={ordersRes?.data ?? []} isLoading={ordersLoading} />
      )}
      {activeTab === 'Journeys' && (
        <JourneysTab trips={tripsRes?.data ?? []} isLoading={tripsLoading} />
      )}
      {activeTab === 'Messages' && (
        <MessagesTab messages={messagesRes?.data ?? []} isLoading={messagesLoading} />
      )}
      {activeTab === 'Predictions' && (
        <PredictionsTab customerId={id} />
      )}
    </div>
  )
}
