'use client'

import { PageHeader } from '@/components/layout/PageHeader'
import { useCtwaAttributions, type CtwaAdRow } from '@/hooks/useCtwa'
import { cn } from '@/lib/utils'
import { Loader2, MessageCircle, TrendingUp, IndianRupee, Megaphone } from 'lucide-react'

export default function CtwaAttributionPage() {
  const { data, isLoading } = useCtwaAttributions()
  const ads = data?.data?.ads ?? []
  const totals = data?.data?.totals ?? { leads: 0, engaged: 0, converted: 0, attributedRevenue: 0 }

  return (
    <div className="space-y-6">
      <PageHeader
        title="CTWA Attribution"
        description="Click-to-WhatsApp leads from your Meta Ads. One row per ad — funnel: lead → engaged → converted."
      />

      {/* Top-level totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={MessageCircle} label="Leads (last 30d)" value={totals.leads} color="indigo" />
        <StatCard icon={TrendingUp} label="Engaged" value={totals.engaged} color="emerald"
          hint={totals.leads > 0 ? `${Math.round((totals.engaged / totals.leads) * 100)}% of leads` : undefined} />
        <StatCard icon={Megaphone} label="Converted" value={totals.converted} color="violet"
          hint={totals.leads > 0 ? `${Math.round((totals.converted / totals.leads) * 100)}% of leads` : undefined} />
        <StatCard icon={IndianRupee} label="Attributed revenue" value={`₹${totals.attributedRevenue.toLocaleString('en-IN')}`} color="amber" />
      </div>

      {/* Per-ad table */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Per-ad funnel</h2>
          <p className="mt-1 text-sm text-slate-500">
            Each row = one Meta ad creative that's brought in CTWA leads. Engaged = customer replied beyond
            the first hello. Converted = at least one attributed order.
          </p>
        </header>

        {isLoading ? (
          <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading CTWA attribution…
          </div>
        ) : ads.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <p>No CTWA leads yet in the last 30 days.</p>
            <p className="mt-2 text-xs text-slate-400">
              Run a Click-to-WhatsApp ad in Meta Ads Manager. Leads automatically appear here once they message in.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Ad</th>
                <th className="px-4 py-2 text-right font-medium">Leads</th>
                <th className="px-4 py-2 text-right font-medium">Engaged</th>
                <th className="px-4 py-2 text-right font-medium">Converted</th>
                <th className="px-4 py-2 text-right font-medium">Revenue</th>
                <th className="px-4 py-2 text-left font-medium">Last lead</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ads.map(ad => <AdRow key={ad.adId} ad={ad} />)}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, hint, color }: {
  icon: typeof MessageCircle
  label: string
  value: string | number
  hint?: string
  color: 'indigo' | 'emerald' | 'violet' | 'amber'
}) {
  const colorMap = {
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    violet:  { bg: 'bg-violet-50',  text: 'text-violet-600' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600' },
  }[color]
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', colorMap.bg)}>
          <Icon className={cn('h-3.5 w-3.5', colorMap.text)} />
        </div>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  )
}

function AdRow({ ad }: { ad: CtwaAdRow }) {
  const engagementRate = ad.leads > 0 ? Math.round((ad.engaged / ad.leads) * 100) : 0
  const conversionRate = ad.leads > 0 ? Math.round((ad.converted / ad.leads) * 100) : 0

  return (
    <tr className="hover:bg-slate-50 align-top">
      <td className="px-4 py-3 max-w-md">
        <div className="flex items-start gap-3">
          {ad.imageUrl && (
            <img src={ad.imageUrl} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0 bg-slate-100" />
          )}
          <div className="min-w-0 flex-1">
            {ad.headline ? (
              <div className="text-sm font-medium text-slate-900 truncate">{ad.headline}</div>
            ) : (
              <div className="text-sm font-mono text-slate-500">ad #{ad.adId}</div>
            )}
            {ad.body && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{ad.body}</div>}
            <div className="text-[11px] text-slate-400 mt-1 font-mono">id: {ad.adId}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">{ad.leads}</td>
      <td className="px-4 py-3 text-right">
        <div className="text-sm text-slate-900">{ad.engaged}</div>
        <div className="text-xs text-slate-500">{engagementRate}%</div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="text-sm text-slate-900">{ad.converted}</div>
        <div className={cn('text-xs', conversionRate >= 5 ? 'text-emerald-600' : 'text-slate-500')}>
          {conversionRate}%
        </div>
      </td>
      <td className="px-4 py-3 text-right text-sm text-slate-900">
        ₹{ad.attributedRevenue.toLocaleString('en-IN')}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {new Date(ad.lastSeen).toLocaleDateString()}
      </td>
    </tr>
  )
}
