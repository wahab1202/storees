'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useCreateProject,
  useIntegrationStatus,
  useIntegrationGuide,
  useSendTestEvent,
} from '@/hooks/useOnboarding'
import type { ProjectCreateResponse } from '@/hooks/useOnboarding'
import type { DomainType } from '@storees/shared'
import { toast } from 'sonner'
import {
  Building2,
  TrendingUp,
  Laptop,
  Puzzle,
  Check,
  Copy,
  ChevronRight,
  ArrowLeft,
  Loader2,
  CircleCheck,
  Circle,
  ShieldCheck,
  Zap,
} from 'lucide-react'

const STEPS = [
  { label: 'Create Project', description: 'Name & domain type' },
  { label: 'Connect Data', description: 'API keys or Shopify' },
  { label: 'Integration Guide', description: 'Send your first event' },
  { label: 'Verified', description: 'You\'re all set' },
]

const DOMAIN_OPTIONS: { type: DomainType; label: string; description: string; icon: typeof Building2 }[] = [
  { type: 'ecommerce', label: 'Ecommerce', description: 'Shopify, online stores', icon: Building2 },
  { type: 'fintech', label: 'Fintech', description: 'Banks, trading, payments', icon: TrendingUp },
  { type: 'saas', label: 'SaaS', description: 'Web apps, subscriptions', icon: Laptop },
  { type: 'custom', label: 'Custom', description: 'Any other business', icon: Puzzle },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [projectName, setProjectName] = useState('')
  const [domainType, setDomainType] = useState<DomainType | null>(null)
  const [projectData, setProjectData] = useState<ProjectCreateResponse | null>(null)

  const createProject = useCreateProject()
  const integrationStatus = useIntegrationStatus(projectData?.project.id ?? null)
  const integrationGuide = useIntegrationGuide(projectData?.project.id ?? null)
  const sendTestEvent = useSendTestEvent()

  const handleCreateProject = async () => {
    if (!projectName.trim() || !domainType) return

    try {
      const result = await createProject.mutateAsync({
        name: projectName.trim(),
        domain_type: domainType,
      })
      setProjectData(result.data)
      setStep(1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  const handleSendTestEvent = async () => {
    if (!projectData) return
    try {
      await sendTestEvent.mutateAsync(projectData.project.id)
      toast.success('Test event sent!')
    } catch (err) {
      toast.error('Failed to send test event')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-semibold text-heading mb-2">Set up your project</h1>
      <p className="text-text-secondary mb-8">Connect your data source in a few steps</p>

      {/* Step indicator */}
      <div className="flex items-center mb-10">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  i < step ? 'bg-green-500 text-white' :
                  i === step ? 'bg-accent text-white' :
                  'bg-surface text-text-muted border border-border'
                )}
              >
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <div className="hidden sm:block">
                <p className={cn('text-sm font-medium', i <= step ? 'text-heading' : 'text-text-muted')}>
                  {s.label}
                </p>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('w-12 h-px mx-3', i < step ? 'bg-green-500' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Create Project */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-heading mb-2">Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My Banking App"
              className="w-full px-4 py-2.5 border border-border rounded-lg text-text-primary focus:outline-none focus:border-border-focus"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-heading mb-3">Domain Type</label>
            <div className="grid grid-cols-2 gap-3">
              {DOMAIN_OPTIONS.map((option) => {
                const Icon = option.icon
                const selected = domainType === option.type
                return (
                  <button
                    key={option.type}
                    onClick={() => setDomainType(option.type)}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-lg border text-left transition-colors',
                      selected
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-text-muted'
                    )}
                  >
                    <Icon className={cn('w-5 h-5 mt-0.5', selected ? 'text-accent' : 'text-text-secondary')} />
                    <div>
                      <p className={cn('font-medium text-sm', selected ? 'text-accent' : 'text-heading')}>
                        {option.label}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">{option.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <button
            onClick={handleCreateProject}
            disabled={!projectName.trim() || !domainType || createProject.isPending}
            className={cn(
              'w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2',
              projectName.trim() && domainType
                ? 'bg-accent text-white hover:bg-accent-hover'
                : 'bg-surface text-text-muted cursor-not-allowed'
            )}
          >
            {createProject.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
            ) : (
              <>Create Project <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      )}

      {/* Step 1: Connect Data */}
      {step === 1 && projectData && (
        <div className="space-y-6">
          {projectData.api_keys ? (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                  <h3 className="font-medium text-green-900">API Keys Generated</h3>
                </div>
                <p className="text-sm text-green-800 mb-4">
                  Save your API secret now — it won't be shown again.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-green-700 uppercase tracking-wide">API Key (Public)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-white px-3 py-2 rounded border border-green-200 text-sm font-mono text-heading break-all">
                        {projectData.api_keys.key_public}
                      </code>
                      <button
                        onClick={() => copyToClipboard(projectData.api_keys!.key_public)}
                        className="p-2 hover:bg-green-100 rounded"
                      >
                        <Copy className="w-4 h-4 text-green-600" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-green-700 uppercase tracking-wide">API Secret</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-white px-3 py-2 rounded border border-green-200 text-sm font-mono text-heading break-all">
                        {projectData.api_keys.key_secret}
                      </code>
                      <button
                        onClick={() => copyToClipboard(projectData.api_keys!.key_secret)}
                        className="p-2 hover:bg-green-100 rounded"
                      >
                        <Copy className="w-4 h-4 text-green-600" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full py-2.5 rounded-lg font-medium text-sm bg-accent text-white hover:bg-accent-hover flex items-center justify-center gap-2"
              >
                I've saved my keys <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : projectData.shopify ? (
            <>
              <div className="bg-surface rounded-lg border border-border p-6 text-center">
                <Building2 className="w-10 h-10 text-accent mx-auto mb-3" />
                <h3 className="font-medium text-heading mb-2">Connect your Shopify store</h3>
                <p className="text-sm text-text-secondary mb-4">
                  Click below to install the Storees app on your Shopify store.
                  This will sync your customers, orders, and products automatically.
                </p>
                {projectData.shopify.install_url ? (
                  <a
                    href={projectData.shopify.install_url}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-white rounded-lg font-medium text-sm hover:bg-accent-hover"
                  >
                    Connect Shopify <ChevronRight className="w-4 h-4" />
                  </a>
                ) : (
                  <p className="text-sm text-text-muted">
                    Shopify API key not configured. Set SHOPIFY_API_KEY in your backend environment.
                  </p>
                )}
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full py-2 rounded-lg text-sm text-text-secondary hover:text-heading transition-colors"
              >
                Skip for now
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* Step 2: Integration Guide */}
      {step === 2 && projectData && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1 text-sm text-text-secondary hover:text-heading"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>

          {/* Quick start guide */}
          {projectData.integration_guide && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-heading">Quick Start Guide</h2>
              <p className="text-sm text-text-secondary">
                Use the cURL examples below to send your first event. Replace the sample data with your own.
              </p>

              {projectData.integration_guide.endpoints.map((endpoint) => (
                <div key={endpoint.path} className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-surface">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium bg-accent/10 text-accent px-2 py-0.5 rounded">
                        {endpoint.method}
                      </span>
                      <span className="text-sm font-medium text-heading">{endpoint.name}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(endpoint.curl)}
                      className="flex items-center gap-1 text-xs text-text-secondary hover:text-heading"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono text-text-primary bg-white overflow-x-auto whitespace-pre-wrap">
                    {endpoint.curl}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Fallback: load guide from API if not in create response */}
          {!projectData.integration_guide && integrationGuide.data && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-heading">Integration Guide</h2>
              {integrationGuide.data.data.endpoints.map((endpoint) => (
                <div key={endpoint.path} className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-surface">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium bg-accent/10 text-accent px-2 py-0.5 rounded">
                        {endpoint.method}
                      </span>
                      <span className="text-sm font-medium text-heading">{endpoint.name}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(endpoint.curl)}
                      className="flex items-center gap-1 text-xs text-text-secondary hover:text-heading"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono text-text-primary bg-white overflow-x-auto whitespace-pre-wrap">
                    {endpoint.curl}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Test event button */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-3">
              <Zap className="w-5 h-5 text-accent" />
              <h3 className="font-medium text-heading">Test your integration</h3>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              Click below to send a test event from the dashboard, or use the cURL command above from your terminal.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSendTestEvent}
                disabled={sendTestEvent.isPending}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover flex items-center gap-2"
              >
                {sendTestEvent.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                ) : (
                  'Send Test Event'
                )}
              </button>
              {sendTestEvent.isSuccess && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CircleCheck className="w-4 h-4" /> Event received!
                </span>
              )}
            </div>
          </div>

          {/* Verification status */}
          {integrationStatus.data && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-heading">Setup Checklist</h3>
              {integrationStatus.data.data.checklist.map((item) => (
                <div key={item.step} className="flex items-center gap-3">
                  {item.done ? (
                    <CircleCheck className="w-5 h-5 text-green-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-text-muted" />
                  )}
                  <span className={cn('text-sm', item.done ? 'text-heading' : 'text-text-secondary')}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setStep(3)}
            disabled={!integrationStatus.data?.data.has_received_first_event}
            className={cn(
              'w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2',
              integrationStatus.data?.data.has_received_first_event
                ? 'bg-accent text-white hover:bg-accent-hover'
                : 'bg-surface text-text-muted cursor-not-allowed'
            )}
          >
            {integrationStatus.data?.data.has_received_first_event
              ? <>Continue to Dashboard <ChevronRight className="w-4 h-4" /></>
              : 'Waiting for first event...'}
          </button>
        </div>
      )}

      {/* Step 3: Verified */}
      {step === 3 && projectData && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CircleCheck className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-heading mb-2">You're all set!</h2>
          <p className="text-text-secondary mb-2">
            Project <span className="font-medium text-heading">{projectData.project.name}</span> is
            connected and receiving events.
          </p>
          <p className="text-sm text-text-muted mb-8">
            We've pre-created segment templates for your {projectData.project.domain_type} use case.
          </p>

          <div className="flex items-center justify-center gap-3">
            <a
              href={`/dashboard?projectId=${projectData.project.id}`}
              className="px-6 py-2.5 bg-accent text-white rounded-lg font-medium text-sm hover:bg-accent-hover"
            >
              Go to Dashboard
            </a>
            <a
              href={`/segments?projectId=${projectData.project.id}`}
              className="px-6 py-2.5 border border-border rounded-lg text-sm font-medium text-heading hover:bg-surface"
            >
              View Segments
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
