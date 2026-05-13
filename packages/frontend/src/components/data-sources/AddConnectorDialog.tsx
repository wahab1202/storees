'use client'

import { useState } from 'react'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { useConnectorTemplates, useCreateConnector } from '@/hooks/useDataConnectors'

type Props = {
  open: boolean
  onClose: () => void
}

export function AddConnectorDialog({ open, onClose }: Props) {
  const { data: templatesRes } = useConnectorTemplates()
  const templates = templatesRes?.data ?? []

  const [template, setTemplate] = useState('virpanai')
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [authValue, setAuthValue] = useState('')

  const createMutation = useCreateConnector()

  function reset() {
    setTemplate('virpanai')
    setName('')
    setBaseUrl('')
    setAuthValue('')
  }

  async function handleSave() {
    if (!name.trim() || !baseUrl.trim() || !authValue.trim()) return
    await createMutation.mutateAsync({
      template,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      authValue: authValue.trim(),
    })
    reset()
    onClose()
  }

  const canSave = name.trim() && baseUrl.trim() && authValue.trim() && !createMutation.isPending

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Add data source"
      footer={
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border bg-surface">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? 'Saving…' : 'Save & continue'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Template picker */}
        <div>
          <label className="block text-sm font-medium text-heading mb-1.5">Template</label>
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  template === t.id
                    ? 'border-text-primary bg-surface'
                    : 'border-border hover:border-text-muted'
                }`}
              >
                <div className="text-sm font-medium text-heading">{t.label}</div>
                <div className="text-xs text-text-muted mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Display name */}
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

        {/* Base URL */}
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

        {/* Auth */}
        <div>
          <label className="block text-sm font-medium text-heading mb-1.5">API key / Bearer token</label>
          <input
            type="password"
            value={authValue}
            onChange={(e) => setAuthValue(e.target.value)}
            placeholder="sk_live_..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-text-primary/20 font-mono"
          />
          <p className="text-xs text-text-muted mt-1">
            Encrypted at rest. The value is never returned to the UI once saved.
          </p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          <strong>Next step:</strong> After saving, run <em>Test Connection</em> from the connector card. This fetches one record from each endpoint so you can verify the field mapping before triggering a full sync.
        </div>
      </div>
    </SlidePanel>
  )
}
