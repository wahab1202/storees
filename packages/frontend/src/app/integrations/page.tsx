'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useShopifyStatus } from '@/hooks/useIntegrations'
import { Loader2, CheckCircle2, Store, ExternalLink } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function IntegrationsPage() {
  const { data, isLoading } = useShopifyStatus()
  const [shopDomain, setShopDomain] = useState('')

  const connected = data?.data.connected ?? false
  const domain = data?.data.shopifyDomain

  function handleInstall(e: React.FormEvent) {
    e.preventDefault()
    const shop = shopDomain.includes('.myshopify.com')
      ? shopDomain
      : `${shopDomain}.myshopify.com`
    window.location.href = `${API_URL}/api/integrations/shopify/install?shop=${encodeURIComponent(shop)}`
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
            <form onSubmit={handleInstall} className="space-y-3">
              <div>
                <label htmlFor="shop" className="block text-sm font-medium text-text-primary mb-1">
                  Store domain
                </label>
                <div className="flex gap-2">
                  <input
                    id="shop"
                    type="text"
                    placeholder="mystore"
                    value={shopDomain}
                    onChange={e => setShopDomain(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-white
                               focus:outline-none focus:ring-2 focus:ring-border-focus placeholder:text-text-muted"
                  />
                  <span className="flex items-center text-sm text-text-muted">.myshopify.com</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={!shopDomain.trim()}
                className="w-full px-4 py-2.5 text-sm font-medium bg-accent text-white rounded-lg
                           hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Connect Store
              </button>
              <p className="text-xs text-text-muted">
                You&apos;ll be redirected to Shopify to authorize the connection.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
