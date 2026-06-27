'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/PageHeader'
import { useShopifyStatus, useShopifySyncStatus, useTriggerShopifySync } from '@/hooks/useIntegrations'
import { api } from '@/lib/api'
import { withProject } from '@/lib/project'
import { useProjectContext } from '@/lib/projectContext'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, Store, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

export default function IntegrationsPage() {
  const { data, isLoading } = useShopifyStatus()
  const queryClient = useQueryClient()
  const { projectName } = useProjectContext()
  const [shopDomain, setShopDomain] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connected = data?.data.connected ?? false
  const domain = data?.data.shopifyDomain

  const syncStatus = useShopifySyncStatus(connected)
  const triggerSync = useTriggerShopifySync()
  const sync = syncStatus.data?.data
  const syncing = sync?.status === 'waiting' || sync?.status === 'active' || triggerSync.isPending

  async function handleSync() {
    try {
      await triggerSync.mutateAsync()
      toast.success('Sync started — this can take a minute')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start sync'
      // 409 = a sync is already running; treat that as informational, not an error
      if (/in progress/i.test(msg)) toast.info('A sync is already running')
      else toast.error(msg)
    }
  }

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

  async function handleDisconnect() {
    if (!confirm('Disconnect this Shopify store from the current project?')) return
    setSubmitting(true)
    try {
      await api.post(withProject('/api/integrations/shopify/disconnect'), {})
      await queryClient.invalidateQueries({ queryKey: ['shopify-status'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Connected Stores" />

      <div className="max-w-lg mb-4 text-xs text-text-muted bg-surface border border-border rounded-lg px-4 py-3">
        A store connects to your <span className="font-medium text-text-secondary">active project{projectName ? `: ${projectName}` : ''}</span>. To keep each client separate, create a <span className="font-medium">New Project</span> and switch to it before connecting.
      </div>

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
              <div className="flex items-center justify-between">
                <a
                  href={`https://${domain}/admin`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
                >
                  Open Shopify Admin
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={handleDisconnect}
                  disabled={submitting}
                  className="text-sm text-text-muted hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>

              {/* Sync control + last-sync status */}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <div className="text-xs text-text-muted">
                  {syncing ? (
                    <span className="flex items-center gap-1.5 text-accent">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing customers, orders & products…
                    </span>
                  ) : sync?.status === 'completed' ? (
                    <span className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Last sync completed
                    </span>
                  ) : sync?.status === 'failed' ? (
                    <span className="flex items-center gap-1.5 text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" /> Last sync failed: {sync.failedReason ?? 'unknown error'}
                    </span>
                  ) : (
                    <span>No sync has run yet</span>
                  )}
                </div>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
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
