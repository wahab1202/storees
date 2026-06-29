'use client'

import { useEffect, useState } from 'react'
import { SlidePanel } from '@/components/shared/SlidePanel'
import {
  useConnectorTemplates,
  useCreateConnector,
  useUpdateConnector,
  useConnectShopify,
  type Connector,
} from '@/hooks/useDataConnectors'

type Props = {
  open: boolean
  onClose: () => void
  projectId: string
  // When provided, the dialog runs in EDIT mode: pre-fills name/baseUrl,
  // locks the template (can't change post-creation — different field maps),
  // and leaves the API-key field empty (server never returns it, but the
  // existing one stays in place unless the user types a new one).
  connector?: Connector | null
}

/** Strip protocol/path so "https://store.myshopify.com/admin" → "store.myshopify.com". */
function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

export function AddConnectorDialog({ open, onClose, projectId, connector }: Props) {
  const isEdit = !!connector
  const { data: templatesRes } = useConnectorTemplates()
  const templates = templatesRes?.data ?? []

  const [template, setTemplate] = useState('virpanai')
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [authValue, setAuthValue] = useState('')

  // Shopify-only fields (native source — custom-app credentials).
  const [shopDomain, setShopDomain] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')

  const isShopify = template === 'shopify'

  // Sync form state with the connector being edited each time the dialog
  // opens or the target connector changes.
  useEffect(() => {
    if (!open) return
    if (connector) {
      setTemplate(connector.template)
      setName(connector.name)
      setBaseUrl(connector.baseUrl)
      setAuthValue('')   // never pre-fill; leave blank to keep existing key
      setShopDomain(connector.template === 'shopify' ? normalizeDomain(connector.baseUrl) : '')
      setClientId('')
      setClientSecret('')
    } else {
      setTemplate('virpanai')
      setName('')
      setBaseUrl('')
      setAuthValue('')
      setShopDomain('')
      setClientId('')
      setClientSecret('')
    }
  }, [open, connector])

  const createMutation = useCreateConnector(projectId)
  const updateMutation = useUpdateConnector(projectId)
  const connectShopify = useConnectShopify(projectId)

  async function handleSave() {
    // Shopify — native connect (custom-app credentials). Edit == reconnect.
    if (isShopify) {
      const shop = normalizeDomain(shopDomain)
      if (!shop.endsWith('.myshopify.com') || !clientId.trim() || !clientSecret.trim()) return
      await connectShopify.mutateAsync({ shop, client_id: clientId.trim(), client_secret: clientSecret.trim() })
      onClose()
      return
    }

    if (!name.trim() || !baseUrl.trim()) return

    if (isEdit && connector) {
      // In edit mode only send authValue if the user typed a new one.
      const payload: Parameters<typeof updateMutation.mutateAsync>[0] = {
        id: connector.id,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
      }
      if (authValue.trim()) payload.authValue = authValue.trim()
      await updateMutation.mutateAsync(payload)
    } else {
      if (!authValue.trim()) return   // API key required for new connectors
      await createMutation.mutateAsync({
        template,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        authValue: authValue.trim(),
      })
    }
    onClose()
  }

  const isPending = createMutation.isPending || updateMutation.isPending || connectShopify.isPending
  const canSave = isPending
    ? false
    : isShopify
      ? !!(normalizeDomain(shopDomain).endsWith('.myshopify.com') && clientId.trim() && clientSecret.trim())
      : !!(name.trim() && baseUrl.trim() && (isEdit || authValue.trim()))

  const title = isEdit ? 'Edit data source' : 'Add data source'
  const saveLabel = isPending
    ? 'Saving…'
    : isShopify
      ? (isEdit ? 'Reconnect store' : 'Connect store')
      : isEdit
        ? 'Save changes'
        : 'Save & continue'

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border bg-surface">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Source type picker */}
        <div>
          <label className="block text-sm font-medium text-heading mb-1.5">Source type</label>
          {isEdit ? (
            <div className="px-4 py-3 rounded-lg border border-border bg-surface/40">
              <div className="text-sm font-medium text-heading">
                {templates.find((t) => t.id === template)?.label ?? template}
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                Source type can't be changed after creation. Remove this source and add a new one if you need to switch.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    template === t.id ? 'border-text-primary bg-surface' : 'border-border hover:border-text-muted'
                  }`}
                >
                  <div className="text-sm font-medium text-heading">{t.label}</div>
                  <div className="text-xs text-text-muted mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {isShopify ? (
          /* ── Shopify (native custom-app) ── */
          <>
            <div>
              <label className="block text-sm font-medium text-heading mb-1.5">Store domain</label>
              <input
                type="text"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="mystore.myshopify.com"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-text-primary/20 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1.5">Client ID</label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="from the Shopify app → Settings → Credentials"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-text-primary/20 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1.5">Client secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="shpss_…"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-text-primary/20 font-mono"
              />
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              Create a custom-distribution app in Shopify (Settings → Apps → Develop apps), install it, then paste its Client ID + secret. We connect, register webhooks, and start a full sync immediately.
              {isEdit && ' Editing re-mints the token — re-enter the credentials to reconnect.'}
            </div>
          </>
        ) : (
          /* ── Generic HTTP connector ── */
          <>
            <div>
              <label className="block text-sm font-medium text-heading mb-1.5">Connector name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. VirpanAI Production"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-text-primary/20"
              />
              <p className="text-xs text-text-muted mt-1">Just a label for the admin UI — clients never see this.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1.5">Base URL</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.client-system.com"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-text-primary/20 font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                The root of the client's API. Endpoint paths from the template ({template}) will be appended.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1.5">
                API key / Bearer token {isEdit && <span className="font-normal text-text-muted">(optional)</span>}
              </label>
              <input
                type="password"
                value={authValue}
                onChange={(e) => setAuthValue(e.target.value)}
                placeholder={isEdit ? 'Leave blank to keep current key' : 'sk_live_...'}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-text-primary/20 font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                {isEdit
                  ? 'The existing encrypted key stays in place unless you enter a new value here.'
                  : 'Encrypted at rest. The value is never returned to the UI once saved.'}
              </p>
            </div>
            {!isEdit && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                <strong>Next step:</strong> After saving, run <em>Test Connection</em> from the connector card to verify the field mapping before a full sync.
              </div>
            )}
          </>
        )}
      </div>
    </SlidePanel>
  )
}
