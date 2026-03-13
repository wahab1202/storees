'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { getProjectId } from '@/lib/project'
import { useSdkConfig } from '@/hooks/useSdkConfig'
import { cn } from '@/lib/utils'

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
          <div className="grid grid-cols-2 gap-3">
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
      </div>
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
