'use client'

import { useState } from 'react'
import { useCustomerDetail, useCustomerOrders, useCustomerEvents } from '@/hooks/useCustomerDetail'
import { DetailsTab } from './DetailsTab'
import { OrdersTab } from './OrdersTab'
import { ActivityTab } from './ActivityTab'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type Props = {
  customerId: string
}

const TABS = ['Details', 'Orders', 'Activity'] as const
type Tab = (typeof TABS)[number]

export function CustomerDetail({ customerId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Details')
  const { data: customerRes, isLoading } = useCustomerDetail(customerId)
  const { data: ordersRes, isLoading: ordersLoading } = useCustomerOrders(customerId)
  const { data: eventsRes, isLoading: eventsLoading } = useCustomerEvents(customerId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    )
  }

  const customer = customerRes?.data
  if (!customer) return null

  return (
    <div className="bg-surface px-6 py-4 border-t border-border">
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors relative',
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

      {/* Tab content */}
      {activeTab === 'Details' && <DetailsTab customer={customer} />}
      {activeTab === 'Orders' && (
        <OrdersTab orders={ordersRes?.data ?? []} isLoading={ordersLoading} />
      )}
      {activeTab === 'Activity' && (
        <ActivityTab events={eventsRes?.data ?? []} isLoading={eventsLoading} />
      )}
    </div>
  )
}
