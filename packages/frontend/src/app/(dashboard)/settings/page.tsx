'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/PageHeader'
import { getProjectId, withProject } from '@/lib/project'
import { api } from '@/lib/api'
import { useSdkConfig } from '@/hooks/useSdkConfig'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, XCircle, Sparkles, Smartphone, MessageSquare, Bell, Activity } from 'lucide-react'

type TabId = 'script' | 'npm' | 'api'

const DOMAIN_EVENTS: Record<string, Array<{ name: string; example: string }>> = {
  ecommerce: [
    { name: 'product_viewed', example: "Storees.track('product_viewed', { product_id: 'SKU-123', name: 'Blue T-Shirt', price: 2999 })" },
    { name: 'add_to_cart', example: "Storees.track('add_to_cart', { product_id: 'SKU-123', quantity: 1, price: 2999 })" },
    { name: 'checkout_started', example: "Storees.track('checkout_started', { cart_total: 5998, item_count: 2 })" },
    { name: 'order_placed', example: "Storees.track('order_placed', { order_id: 'ORD-456', total: 5998 })" },
  ],
  fintech: [
    { name: 'transaction_completed', example: "Storees.track('transaction_completed', { amount: 5000, type: 'debit', category: 'transfer' })" },
    { name: 'app_login', example: "Storees.track('app_login', { method: 'biometric' })" },
    { name: 'bill_payment_completed', example: "Storees.track('bill_payment_completed', { biller: 'electricity', amount: 1200 })" },
    { name: 'kyc_verified', example: "Storees.track('kyc_verified', { type: 'aadhaar' })" },
  ],
  saas: [
    { name: 'feature_used', example: "Storees.track('feature_used', { feature: 'export_csv', plan: 'pro' })" },
    { name: 'subscription_started', example: "Storees.track('subscription_started', { plan: 'pro', mrr: 4900 })" },
    { name: 'user_invited', example: "Storees.track('user_invited', { role: 'editor' })" },
  ],
  custom: [
    { name: 'button_clicked', example: "Storees.track('button_clicked', { button_id: 'cta-hero', page: '/pricing' })" },
    { name: 'form_submitted', example: "Storees.track('form_submitted', { form_id: 'contact', fields: 3 })" },
  ],
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('script')
  const [copied, setCopied] = useState<string | null>(null)

  let projectId: string | null = null
  try {
    projectId = getProjectId()
  } catch {
    // not set
  }

  const { data: sdkConfig, isLoading } = useSdkConfig()
  const config = sdkConfig?.data
  const apiKey = config?.apiKey ?? 'YOUR_API_KEY'
  const apiUrl = config?.apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  const domainType = config?.domainType ?? 'custom'
  const sdkConnected = config?.sdkConnected ?? false

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const scriptSnippet = `<script>
  !function(s,t,o,r){s.Storees=s.Storees||function(){
  (s.Storees.q=s.Storees.q||[]).push(arguments)};
  var e=t.createElement('script');e.src=r;e.async=1;
  t.head.appendChild(e)}(window,document,'script',
  '${apiUrl}/sdk/storees.min.js');

  Storees('init', {
    apiKey: '${apiKey}',
    apiUrl: '${apiUrl}',
    autoTrack: { pageViews: true, sessions: true, utm: true }
  });
</script>`

  const npmSnippet = `npm install @storees/sdk`

  const npmInitSnippet = `import Storees from '@storees/sdk'

Storees.init({
  apiKey: '${apiKey}',
  apiUrl: '${apiUrl}',
  autoTrack: {
    pageViews: true,
    sessions: true,
    clicks: true,
    scroll: true,
    utm: true,
  },
})

// Identify user after login
Storees.identify('user-123', {
  email: 'user@example.com',
  name: 'John Doe',
})`

  const curlSnippet = `curl -X POST ${apiUrl}/api/v1/events \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_name": "test_event",
    "customer_id": "test-user-1",
    "properties": { "source": "curl_test" }
  }'`

  const tabs: { id: TabId; label: string }[] = [
    { id: 'script', label: 'Script Tag' },
    { id: 'npm', label: 'NPM Package' },
    { id: 'api', label: 'REST API' },
  ]

  const domainEvents = DOMAIN_EVENTS[domainType] ?? DOMAIN_EVENTS.custom

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="max-w-3xl space-y-6">
        {/* Project Info */}
        <div className="bg-surface-elevated border border-border rounded-lg p-6">
          <h3 className="font-semibold text-text-primary mb-4">Project</h3>
          <div className="space-y-3">
            <Field label="Project ID" value={projectId ?? 'Not configured'} />
            <Field label="API URL" value={apiUrl} />
            <Field label="Domain" value={domainType} />
          </div>
        </div>

        {/* Connection Status */}
        <div className="bg-surface-elevated border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-text-primary">SDK Connection</h3>
              <p className="text-sm text-text-secondary mt-1">
                {sdkConnected
                  ? 'Your SDK is sending events successfully.'
                  : 'No SDK events received yet. Add the snippet below to your app.'}
              </p>
            </div>
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
              sdkConnected
                ? 'bg-green-500/10 text-green-400'
                : 'bg-yellow-500/10 text-yellow-400'
            )}>
              <span className={cn(
                'w-2 h-2 rounded-full',
                sdkConnected ? 'bg-green-400' : 'bg-yellow-400'
              )} />
              {isLoading ? 'Checking...' : sdkConnected ? 'Connected' : 'Not Connected'}
            </div>
          </div>
        </div>

        {/* API Key */}
        {config?.apiKey && (
          <div className="bg-surface-elevated border border-border rounded-lg p-6">
            <h3 className="font-semibold text-text-primary mb-3">API Key</h3>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-surface px-3 py-2 rounded text-sm font-mono text-text-primary truncate">
                {config.apiKey}
              </code>
              <button
                onClick={() => copyToClipboard(config.apiKey!, 'apikey')}
                className="px-3 py-2 bg-accent-primary text-white text-sm rounded hover:bg-accent-primary/90 transition-colors whitespace-nowrap"
              >
                {copied === 'apikey' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-2">
              This is your public key (safe to embed in client-side code). No secret needed for SDK.
            </p>
          </div>
        )}

        {/* SDK Integration */}
        <div className="bg-surface-elevated border border-border rounded-lg p-6">
          <h3 className="font-semibold text-text-primary mb-4">SDK Integration</h3>

          {/* Tabs */}
          <div className="flex gap-1 bg-surface rounded-lg p-1 mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 px-3 py-1.5 text-sm rounded-md transition-colors',
                  activeTab === tab.id
                    ? 'bg-accent-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'script' && (
            <div>
              <p className="text-sm text-text-secondary mb-3">
                Add this snippet before the closing <code className="text-xs bg-surface px-1 py-0.5 rounded">&lt;/head&gt;</code> tag on every page.
              </p>
              <CodeBlock code={scriptSnippet} id="script" copied={copied} onCopy={copyToClipboard} />
            </div>
          )}

          {activeTab === 'npm' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-text-secondary mb-2">Install the package:</p>
                <CodeBlock code={npmSnippet} id="npm-install" copied={copied} onCopy={copyToClipboard} />
              </div>
              <div>
                <p className="text-sm text-text-secondary mb-2">Initialize in your app entry point:</p>
                <CodeBlock code={npmInitSnippet} id="npm-init" copied={copied} onCopy={copyToClipboard} />
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div>
              <p className="text-sm text-text-secondary mb-3">
                Send events directly via REST API (server-side or testing):
              </p>
              <CodeBlock code={curlSnippet} id="curl" copied={copied} onCopy={copyToClipboard} />
            </div>
          )}
        </div>

        {/* Domain-specific Events */}
        <div className="bg-surface-elevated border border-border rounded-lg p-6">
          <h3 className="font-semibold text-text-primary mb-2">
            Recommended Events
            <span className="ml-2 text-xs font-normal text-text-muted px-2 py-0.5 bg-surface rounded-full">
              {domainType}
            </span>
          </h3>
          <p className="text-sm text-text-secondary mb-4">
            Track these events to get the most out of your {domainType} analytics.
          </p>

          <div className="space-y-3">
            {domainEvents.map((event) => (
              <div key={event.name} className="bg-surface rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <code className="text-sm font-mono text-accent-primary">{event.name}</code>
                  <button
                    onClick={() => copyToClipboard(event.example, `event-${event.name}`)}
                    className="text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    {copied === `event-${event.name}` ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="text-xs text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap">
                  {event.example}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* Auto-tracked Events */}
        <div className="bg-surface-elevated border border-border rounded-lg p-6">
          <h3 className="font-semibold text-text-primary mb-2">Auto-Tracked Events</h3>
          <p className="text-sm text-text-secondary mb-4">
            These are tracked automatically when you enable autoTrack in your SDK config:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { name: 'page_viewed', desc: 'Every page navigation (SPA-aware)', config: 'pageViews' },
              { name: 'session_started', desc: 'New session (30min inactivity timeout)', config: 'sessions' },
              { name: 'session_ended', desc: 'Session ends on page hide', config: 'sessions' },
              { name: 'element_clicked', desc: 'Click on links, buttons, [data-track]', config: 'clicks' },
              { name: 'scroll_depth_reached', desc: '25%, 50%, 75%, 100% thresholds', config: 'scroll' },
              { name: 'UTM params', desc: 'Attached to all events from URL', config: 'utm' },
            ].map(item => (
              <div key={item.name} className="bg-surface rounded p-3">
                <code className="text-xs font-mono text-accent-primary">{item.name}</code>
                <p className="text-xs text-text-muted mt-1">{item.desc}</p>
                <span className="text-[10px] text-text-muted mt-1 inline-block">
                  autoTrack.{item.config}
                </span>
              </div>
            ))}
          </div>
        </div>
        {/* Channel Provider Configuration */}
        <ChannelProviderSettings />

        {/* AI Provider Configuration */}
        <AiProviderSettings />
      </div>
    </div>
  )
}

// ─── Channel Provider Settings ───────────────────────────

type ProviderField = { key: string; label: string; type?: string; placeholder?: string }
type ProviderDef = { value: string; label: string; description: string; initials: string; color: string; fields: ProviderField[] }

const CHANNEL_PROVIDERS: Record<string, ProviderDef[]> = {
  sms: [
    { value: 'twilio', label: 'Twilio', description: 'Global SMS delivery with delivery receipts', initials: 'Tw', color: 'bg-red-500',
      fields: [{ key: 'accountSid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }, { key: 'authToken', label: 'Auth Token', type: 'password' }, { key: 'fromNumber', label: 'From Number', placeholder: '+1234567890' }] },
    { value: 'gupshup', label: 'Gupshup', description: 'India-focused SMS with high throughput', initials: 'Gs', color: 'bg-green-600',
      fields: [{ key: 'userid', label: 'User ID' }, { key: 'password', label: 'Password', type: 'password' }] },
    { value: 'bird', label: 'Bird', description: 'Formerly MessageBird — global SMS coverage', initials: 'Bd', color: 'bg-blue-600',
      fields: [{ key: 'accessKey', label: 'Access Key', type: 'password' }, { key: 'originator', label: 'Sender Name', placeholder: 'Storees' }] },
    { value: 'vonage', label: 'Vonage', description: 'Nexmo SMS API with delivery tracking', initials: 'Vn', color: 'bg-purple-600',
      fields: [{ key: 'apiKey', label: 'API Key' }, { key: 'apiSecret', label: 'API Secret', type: 'password' }, { key: 'from', label: 'From Name', placeholder: 'Storees' }] },
    { value: 'pinnacle', label: 'Pinnacle', description: 'SMS + RCS messaging with rich media', initials: 'Pn', color: 'bg-indigo-600',
      fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }, { key: 'fromNumber', label: 'From Number', placeholder: '+1234567890' }] },
  ],
  whatsapp: [
    { value: 'meta', label: 'WhatsApp Cloud API', description: 'Direct Meta integration — official WhatsApp Business', initials: 'WA', color: 'bg-green-500',
      fields: [{ key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '1234567890' }, { key: 'accessToken', label: 'Access Token', type: 'password' }] },
    { value: 'twilio', label: 'Twilio', description: 'WhatsApp via Twilio — same credentials as SMS', initials: 'Tw', color: 'bg-red-500',
      fields: [{ key: 'accountSid', label: 'Account SID' }, { key: 'authToken', label: 'Auth Token', type: 'password' }, { key: 'fromNumber', label: 'WhatsApp Number', placeholder: '+1234567890' }] },
    { value: 'gupshup', label: 'Gupshup', description: 'WhatsApp Business API with template support', initials: 'Gs', color: 'bg-green-600',
      fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }, { key: 'appName', label: 'App Name' }, { key: 'sourceNumber', label: 'Source Number', placeholder: '+91...' }] },
    { value: 'bird', label: 'Bird', description: 'WhatsApp via Conversations API', initials: 'Bd', color: 'bg-blue-600',
      fields: [{ key: 'accessKey', label: 'Access Key', type: 'password' }, { key: 'channelId', label: 'WA Channel ID' }] },
    { value: 'vonage', label: 'Vonage', description: 'WhatsApp via Messages API v1', initials: 'Vn', color: 'bg-purple-600',
      fields: [{ key: 'apiKey', label: 'API Key' }, { key: 'apiSecret', label: 'API Secret', type: 'password' }, { key: 'from', label: 'From Number' }] },
  ],
  push: [
    { value: 'fcm', label: 'Firebase Cloud Messaging', description: 'Android + iOS + Web push via Google Firebase', initials: 'FB', color: 'bg-amber-500',
      fields: [{ key: 'projectId', label: 'Firebase Project ID', placeholder: 'my-app-12345' }, { key: 'serviceAccountKey', label: 'Service Account Key (JSON)', type: 'password', placeholder: 'Paste the full JSON key' }] },
  ],
}

const CHANNEL_META: Record<string, { label: string; description: string; icon: typeof Activity }> = {
  sms: { label: 'SMS', description: '5 providers available', icon: Smartphone },
  whatsapp: { label: 'WhatsApp', description: '5 providers available', icon: MessageSquare },
  push: { label: 'Push Notifications', description: '1 provider available', icon: Bell },
}

function ChannelProviderSettings() {
  const [activeChannel, setActiveChannel] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<Record<string, string>>({})
  const [configValues, setConfigValues] = useState<Record<string, Record<string, string>>>({})
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})

  const handleSaveChannel = async (channel: string) => {
    const provider = selectedProvider[channel]
    const config = configValues[channel] ?? {}
    if (!provider) return

    setSaveStatus(prev => ({ ...prev, [channel]: 'saving' }))
    try {
      await api.post(withProject('/api/ai/config'), {
        provider: 'channel_config',
        apiKey: 'na',
        channelConfig: { [channel]: { provider, config } },
      })
      setSaveStatus(prev => ({ ...prev, [channel]: 'saved' }))
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [channel]: 'idle' })), 2000)
    } catch {
      setSaveStatus(prev => ({ ...prev, [channel]: 'error' }))
    }
  }

  return (
    <div className="bg-surface-elevated border border-border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="font-semibold text-text-primary">Messaging Channels</h3>
      </div>
      <p className="text-sm text-text-secondary mb-5">
        Connect your preferred provider for each channel. Configure one provider per channel.
      </p>

      {/* Channel Tabs */}
      <div className="flex gap-2 mb-5">
        {Object.entries(CHANNEL_META).map(([channel, meta]) => {
          const Icon = meta.icon
          const isActive = activeChannel === channel
          const hasProvider = !!selectedProvider[channel]
          return (
            <button
              key={channel}
              onClick={() => setActiveChannel(isActive ? null : channel)}
              className={cn(
                'flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all text-left flex-1',
                isActive
                  ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                  : 'border-border hover:border-border-focus hover:bg-surface',
              )}
            >
              <div className={cn(
                'p-2 rounded-lg',
                isActive ? 'bg-accent/10' : 'bg-surface',
              )}>
                <Icon className={cn('h-4 w-4', isActive ? 'text-accent' : 'text-text-muted')} />
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary">{meta.label}</div>
                <div className="text-[11px] text-text-muted">
                  {hasProvider ? (
                    <span className="text-green-600 font-medium">
                      {CHANNEL_PROVIDERS[channel]?.find(p => p.value === selectedProvider[channel])?.label}
                    </span>
                  ) : meta.description}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Provider Selection Panel */}
      {activeChannel && (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Provider Grid */}
          <div className="p-4 border-b border-border bg-surface/30">
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Select Provider</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CHANNEL_PROVIDERS[activeChannel]?.map(provider => {
                const isSelected = selectedProvider[activeChannel] === provider.value
                return (
                  <button
                    key={provider.value}
                    onClick={() => setSelectedProvider(prev => ({ ...prev, [activeChannel]: provider.value }))}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
                      isSelected
                        ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                        : 'border-border hover:border-border-focus hover:bg-white',
                    )}
                  >
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0', provider.color)}>
                      {provider.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">{provider.label}</div>
                      <div className="text-[10px] text-text-muted leading-tight truncate">{provider.description}</div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 ml-auto" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Configuration Form */}
          {selectedProvider[activeChannel] && (() => {
            const providerDef = CHANNEL_PROVIDERS[activeChannel]?.find(p => p.value === selectedProvider[activeChannel])
            if (!providerDef) return null
            const status = saveStatus[activeChannel] ?? 'idle'

            return (
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn('w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold', providerDef.color)}>
                    {providerDef.initials}
                  </div>
                  <span className="text-sm font-medium text-text-primary">{providerDef.label} Configuration</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {providerDef.fields.map(field => {
                    const isLargeField = field.key === 'serviceAccountKey'
                    return (
                      <div key={field.key} className={isLargeField ? 'sm:col-span-2' : ''}>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">{field.label}</label>
                        {isLargeField ? (
                          <div className="space-y-2">
                            {/* File upload */}
                            <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-accent/40 hover:bg-accent/[0.02] transition-colors">
                              <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                              <span className="text-sm text-text-secondary">
                                {configValues[activeChannel]?.[field.key] ? 'JSON file loaded' : 'Upload .json file'}
                              </span>
                              <input
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                onChange={e => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  const reader = new FileReader()
                                  reader.onload = () => {
                                    const content = reader.result as string
                                    setConfigValues(prev => ({
                                      ...prev,
                                      [activeChannel]: { ...prev[activeChannel], [field.key]: content },
                                    }))
                                  }
                                  reader.readAsText(file)
                                }}
                              />
                            </label>
                            {/* Or paste manually */}
                            <textarea
                              value={configValues[activeChannel]?.[field.key] ?? ''}
                              onChange={e => setConfigValues(prev => ({
                                ...prev,
                                [activeChannel]: { ...prev[activeChannel], [field.key]: e.target.value },
                              }))}
                              placeholder="Or paste the JSON content here"
                              rows={4}
                              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50 resize-y"
                            />
                            {configValues[activeChannel]?.[field.key] && (
                              <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                JSON loaded ({Math.round((configValues[activeChannel][field.key]?.length ?? 0) / 1024 * 10) / 10} KB)
                              </p>
                            )}
                          </div>
                        ) : (
                          <input
                            type={field.type ?? 'text'}
                            value={configValues[activeChannel]?.[field.key] ?? ''}
                            onChange={e => setConfigValues(prev => ({
                              ...prev,
                              [activeChannel]: { ...prev[activeChannel], [field.key]: e.target.value },
                            }))}
                            placeholder={field.placeholder ?? field.label}
                            className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-text-muted/50"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => handleSaveChannel(activeChannel)}
                    disabled={status === 'saving'}
                    className={cn(
                      'px-5 py-2 text-sm font-medium rounded-lg transition-colors',
                      status === 'saved'
                        ? 'bg-green-500 text-white'
                        : 'bg-accent text-white hover:bg-accent/90 disabled:opacity-50',
                    )}
                  >
                    {status === 'saving' ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</span>
                    ) : status === 'saved' ? (
                      <span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" />Saved</span>
                    ) : 'Save Configuration'}
                  </button>
                  {status === 'error' && (
                    <span className="text-xs text-red-600 flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" /> Failed to save
                    </span>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── AI Provider Settings ────────────────────────────────

const AI_PROVIDERS = [
  { value: 'groq', label: 'Groq', initials: 'Gq', color: 'bg-orange-500', description: 'Ultra-fast inference with Llama & Mixtral models', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
  { value: 'openai', label: 'OpenAI', initials: 'OA', color: 'bg-emerald-600', description: 'GPT-4o and GPT-4 Turbo — highest capability', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic', initials: 'An', color: 'bg-amber-700', description: 'Claude models — thoughtful, safe, and capable', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-20250514'] },
]

type AiConfig = {
  configured: boolean
  provider?: string
  model?: string
  apiKey?: string
}

function AiProviderSettings() {
  const queryClient = useQueryClient()
  const { data: configData, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api.get<AiConfig>(withProject('/api/ai/config')),
    staleTime: 60_000,
  })

  const config = configData?.data
  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    if (config?.configured) {
      setProvider(config.provider ?? '')
      setModel(config.model ?? '')
    }
  }, [config])

  const selectedProvider = AI_PROVIDERS.find(p => p.value === provider)

  const saveMutation = useMutation({
    mutationFn: () => api.post(withProject('/api/ai/config'), { provider, apiKey, model }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config'] })
      setApiKey('')
    },
  })

  const testMutation = useMutation({
    mutationFn: () => api.post<{ ok: boolean; error?: string; model: string }>(withProject('/api/ai/test-connection'), {}),
    onSuccess: (data) => setTestResult(data.data),
  })

  if (isLoading) {
    return (
      <div className="bg-surface-elevated border border-border rounded-lg p-6">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AI config...
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-elevated border border-border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 rounded-lg bg-purple-50">
          <Sparkles className="h-4 w-4 text-purple-600" />
        </div>
        <h3 className="font-semibold text-text-primary">AI Provider</h3>
        {config?.configured && (
          <span className="px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full">
            Connected
          </span>
        )}
      </div>
      <p className="text-sm text-text-secondary mb-5">
        Powers Next Best Action, smart segments, and natural language queries.
      </p>

      {/* Provider Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
        {AI_PROVIDERS.map(p => {
          const isSelected = provider === p.value
          return (
            <button
              key={p.value}
              onClick={() => { setProvider(p.value); setModel(''); setTestResult(null) }}
              className={cn(
                'flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all',
                isSelected
                  ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                  : 'border-border hover:border-border-focus hover:bg-white',
              )}
            >
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0', p.color)}>
                {p.initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary">{p.label}</div>
                <div className="text-[10px] text-text-muted leading-tight">{p.description}</div>
              </div>
              {isSelected && <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 ml-auto" />}
            </button>
          )
        })}
      </div>

      {/* Config Panel */}
      {selectedProvider && (
        <div className="border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn('w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold', selectedProvider.color)}>
              {selectedProvider.initials}
            </div>
            <span className="text-sm font-medium text-text-primary">{selectedProvider.label} Configuration</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={config?.configured && config.provider === provider ? `Current: ${config.apiKey}` : `Enter ${selectedProvider.label} API key...`}
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted/50"
              />
            </div>

            {/* Model Select */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Model</label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus appearance-none"
              >
                <option value="">Default ({selectedProvider.models[0]})</option>
                {selectedProvider.models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!provider || saveMutation.isPending}
              className={cn(
                'px-5 py-2 text-sm font-medium rounded-lg transition-colors',
                saveMutation.isSuccess
                  ? 'bg-green-500 text-white'
                  : 'bg-accent text-white hover:bg-accent/90 disabled:opacity-50',
              )}
            >
              {saveMutation.isPending ? (
                <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</span>
              ) : saveMutation.isSuccess ? (
                <span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" />Saved</span>
              ) : 'Save Configuration'}
            </button>

            {config?.configured && (
              <button
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-text-primary bg-white border border-border rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
              >
                {testMutation.isPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Testing...</span>
                ) : 'Test Connection'}
              </button>
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={cn(
              'flex items-center gap-2 text-sm px-3 py-2 rounded-lg',
              testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
            )}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {testResult.ok ? 'Connection successful — LLM is reachable.' : `Failed: ${testResult.error}`}
            </div>
          )}
        </div>
      )}

      {/* Current config summary (when no provider is actively selected) */}
      {config?.configured && !provider && (
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold',
              AI_PROVIDERS.find(p => p.value === config.provider)?.color ?? 'bg-gray-500',
            )}>
              {AI_PROVIDERS.find(p => p.value === config.provider)?.initials ?? '?'}
            </div>
            <div>
              <div className="text-sm font-medium text-text-primary capitalize">{config.provider}</div>
              <div className="text-xs text-text-muted">{config.model} &middot; Key: {config.apiKey}</div>
            </div>
            <button
              onClick={() => setProvider(config.provider ?? '')}
              className="ml-auto text-xs text-accent hover:text-accent/80 font-medium"
            >
              Change
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-mono text-text-primary">{value}</span>
    </div>
  )
}

function CodeBlock({
  code,
  id,
  copied,
  onCopy,
}: {
  code: string
  id: string
  copied: string | null
  onCopy: (text: string, id: string) => void
}) {
  return (
    <div className="relative bg-surface rounded-lg">
      <pre className="p-4 text-sm font-mono text-text-primary overflow-x-auto whitespace-pre-wrap">
        {code}
      </pre>
      <button
        onClick={() => onCopy(code, id)}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-surface-elevated border border-border rounded hover:bg-border transition-colors"
      >
        {copied === id ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}
