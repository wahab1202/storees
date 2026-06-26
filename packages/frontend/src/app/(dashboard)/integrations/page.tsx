'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/PageHeader'
import { useShopifyStatus } from '@/hooks/useIntegrations'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { Loader2, CheckCircle2, Store, ExternalLink } from 'lucide-react'

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

export default function IntegrationsPage() {
  const { data, isLoading } = useShopifyStatus()
  const queryClient = useQueryClient()
  const [shopDomain, setShopDomain] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connected = data?.data.connected ?? false
  const domain = data?.data.shopifyDomain

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const shop = normalizeDomain(shopDomain)
    if (!shop.endsWith('.myshopify.com')) {
      setError('Enter the store’s *.myshopify.com domain')
      return
    }
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Client ID and client secret are required')
      return
    }
    setSubmitting(true)
    try {
      await api.post(withProject('/api/integrations/shopify/connect'), {
        shop,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      })
      setClientSecret('')
      await queryClient.invalidateQueries({ queryKey: ['shopify-status'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed — check the credentials')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Connected Stores" />

      <div className="max-w-lg">
        {/* Shopify connection card */}
        <div className="bg-surface-elevated border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[#96bf48]/10">
              <Store className="h-6 w-6 text-[#96bf48]" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Shopify</h3>
              <p className="text-xs text-text-muted">Connect your Shopify store to sync customers and orders</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800">Connected</p>
                  <p className="text-xs text-green-600">{domain}</p>
                </div>
              </div>
              <a
                href={`https://${domain}/admin`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
              >
                Open Shopify Admin
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : (
            <form onSubmit={handleConnect} className="space-y-3">
              <div>
                <label htmlFor="shop" className="block text-sm font-medium text-text-primary mb-1">
                  Store domain
                </label>
                <input
                  id="shop"
                  type="text"
                  placeholder="mystore.myshopify.com"
                  value={shopDomain}
                  onChange={e => setShopDomain(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white
                             focus:outline-none focus:ring-2 focus:ring-accent/20 placeholder:text-text-muted"
                />
              </div>
              <div>
                <label htmlFor="clientId" className="block text-sm font-medium text-text-primary mb-1">
                  Client ID
                </label>
                <input
                  id="clientId"
                  type="text"
                  placeholder="from the Shopify app → Settings → Credentials"
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white
                             focus:outline-none focus:ring-2 focus:ring-accent/20 placeholder:text-text-muted"
                />
              </div>
              <div>
                <label htmlFor="clientSecret" className="block text-sm font-medium text-text-primary mb-1">
                  Client secret
                </label>
                <input
                  id="clientSecret"
                  type="password"
                  placeholder="shpss_…"
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white
                             focus:outline-none focus:ring-2 focus:ring-accent/20 placeholder:text-text-muted"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !shopDomain.trim() || !clientId.trim() || !clientSecret.trim()}
                className="w-full px-4 py-2.5 text-sm font-medium bg-accent text-white rounded-lg
                           hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                           inline-flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Connecting…' : 'Connect Store'}
              </button>
              <p className="text-xs text-text-muted">
                Create a custom-distribution app in your Shopify admin (Settings → Apps → Develop apps),
                install it, then paste its Client ID + secret here. We sync customers, orders and products,
                and keep your store live.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
