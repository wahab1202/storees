'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useProductAnalytics } from '@/hooks/useAnalytics'
import {
  Loader2,
  ShoppingBag,
  ArrowUpDown,
  Eye,
  ShoppingCart,
  TrendingUp,
  XCircle,
} from 'lucide-react'

const SORT_OPTIONS = [
  { value: 'views', label: 'Most Viewed', icon: Eye },
  { value: 'conversions', label: 'Most Purchased', icon: ShoppingCart },
  { value: 'conversion_rate', label: 'Highest Conversion', icon: TrendingUp },
  { value: 'revenue', label: 'Top Revenue', icon: ShoppingBag },
  { value: 'abandonment', label: 'Most Abandoned', icon: XCircle },
]

export default function ProductAnalyticsPage() {
  const [sort, setSort] = useState('views')
  const [dateRange, setDateRange] = useState('30')

  const endDate = new Date()
  const startDate = new Date(Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000)

  const { data, isLoading } = useProductAnalytics({
    sort,
    limit: 50,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  })

  const products = data?.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-heading">Product Analytics</h1>
          <p className="text-sm text-text-secondary mt-1">Analyze product performance, conversions, and abandonment</p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="text-xs border border-border rounded-lg px-3 py-1.5 text-text-secondary"
        >
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {/* Sort tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {SORT_OPTIONS.map(opt => {
          const Icon = opt.icon
          return (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                sort === opt.value
                  ? 'bg-accent text-white'
                  : 'bg-white border border-border text-text-secondary hover:border-accent/30',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      ) : products.length > 0 ? (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <th className="text-left py-3 px-4 text-text-secondary font-medium">#</th>
                <th className="text-left py-3 px-4 text-text-secondary font-medium">Product</th>
                <th className="text-left py-3 px-4 text-text-secondary font-medium">Category</th>
                <th className="text-right py-3 px-4 text-text-secondary font-medium">Views</th>
                <th className="text-right py-3 px-4 text-text-secondary font-medium">Purchases</th>
                <th className="text-right py-3 px-4 text-text-secondary font-medium">Conv. Rate</th>
                <th className="text-right py-3 px-4 text-text-secondary font-medium">Revenue</th>
                <th className="text-right py-3 px-4 text-text-secondary font-medium">Abandoned</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.itemId} className="border-b border-border/50 hover:bg-gray-50/30">
                  <td className="py-3 px-4 text-text-muted">{i + 1}</td>
                  <td className="py-3 px-4 font-medium text-heading max-w-[200px] truncate">{p.name}</td>
                  <td className="py-3 px-4 text-text-secondary">
                    {p.category ? (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs">{p.category}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-text-primary">{p.views.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-text-primary">{p.conversions.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={cn(
                      'text-sm font-medium',
                      p.conversionRate >= 10 ? 'text-green-600' : p.conversionRate >= 3 ? 'text-amber-600' : 'text-text-primary',
                    )}>
                      {p.conversionRate}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-text-primary">${p.revenue.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={cn(
                      'text-sm',
                      p.abandonment > 0 ? 'text-red-500' : 'text-text-muted',
                    )}>
                      {p.abandonment > 0 ? p.abandonment.toLocaleString() : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <ShoppingBag className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No product data found for this period</p>
          <p className="text-xs text-text-muted mt-1">Product analytics require interaction data from your item catalogue</p>
        </div>
      )}
    </div>
  )
}
