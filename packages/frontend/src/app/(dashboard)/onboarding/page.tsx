'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  useCreateProject,
  useIntegrationStatus,
  useIntegrationGuide,
  useSendTestEvent,
} from '@/hooks/useOnboarding'
import type { ProjectCreateResponse } from '@/hooks/useOnboarding'
import type { DomainType } from '@storees/shared'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Building2,
  TrendingUp,
  Laptop,
  Puzzle,
  GraduationCap,
  Check,
  Copy,
  ChevronRight,
  ArrowLeft,
  Loader2,
  CircleCheck,
  Circle,
  ShieldCheck,
  Zap,
  GripVertical,
  Package,
  Route,
  Target,
  MessageSquare,
  Users,
  Rocket,
  Store,
  Plug,
  ShoppingBag,
  Globe,
} from 'lucide-react'

// ============ TYPES ============

type PackSummary = {
  id: string
  name: string
  icon: string
  description: string
}

type WizardQuestions = {
  products_label: string
  products_options: string[]
  journey_steps: string[]
  priorities: { label: string; maps_to: string | null }[]
}

// ============ CONSTANTS ============

// Steps are keyed (not positional) so the ecommerce-only "Connect" step can be
// inserted without renumbering every render branch. The active flow is computed
// from the chosen pack — see `stepKeys` below.
type StepKey =
  | 'industry'
  | 'connect'
  | 'products'
  | 'journey'
  | 'priorities'
  | 'channels'
  | 'volume'
  | 'launch'

const STEP_META: Record<StepKey, { label: string; icon: typeof Building2 }> = {
  industry: { label: 'Industry', icon: Building2 },
  connect: { label: 'Connect', icon: Store },
  products: { label: 'Products', icon: Package },
  journey: { label: 'Journey', icon: Route },
  priorities: { label: 'Priorities', icon: Target },
  channels: { label: 'Channels', icon: MessageSquare },
  volume: { label: 'Volume', icon: Users },
  launch: { label: 'Launch', icon: Rocket },
}

// Store platforms shown on the Connect step (ecommerce only). Only Shopify has an
// inline connect flow today; the rest are selectable and deferred to Connected Stores.
const PLATFORM_OPTIONS = [
  { id: 'shopify', label: 'Shopify', description: 'Connect a live store via a custom app', icon: ShoppingBag },
  { id: 'virpanai', label: 'VirpanAI', description: 'Sync through a VirpanAI connector', icon: Plug },
  { id: 'woocommerce', label: 'WooCommerce', description: 'WordPress / WooCommerce store', icon: Store },
  { id: 'other', label: 'Other / Manual', description: 'Send events directly via our API', icon: Globe },
] as const

/** Strip protocol/path so "https://store.myshopify.com/admin" → "store.myshopify.com". */
function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

const PACK_ICONS: Record<string, typeof Building2> = {
  ecommerce: Building2,
  nbfc: TrendingUp,
  fintech: TrendingUp,
  saas: Laptop,
  edtech: GraduationCap,
  custom: Puzzle,
}

const CHANNEL_OPTIONS = [
  { id: 'email', label: 'Email', emoji: '📧' },
  { id: 'sms', label: 'SMS', emoji: '💬' },
  { id: 'whatsapp', label: 'WhatsApp', emoji: '📱' },
  { id: 'push', label: 'Push Notifications', emoji: '🔔' },
  { id: 'inapp', label: 'In-App Messages', emoji: '💡' },
]

const VOLUME_OPTIONS = [
  { id: 'starter', label: 'Up to 1,000', description: 'Just getting started' },
  { id: 'growing', label: '1,000 – 10,000', description: 'Growing business' },
  { id: 'scaling', label: '10,000 – 100,000', description: 'Scaling fast' },
  { id: 'enterprise', label: '100,000+', description: 'Enterprise scale' },
]

// ============ COMPONENT ============

export default function OnboardingPage() {
  const [step, setStep] = useState(0)

  // Step 0: Industry
  const [projectName, setProjectName] = useState('')
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [selectedPack, setSelectedPack] = useState<string | null>(null)
  const [wizardQuestions, setWizardQuestions] = useState<WizardQuestions | null>(null)

  // Connect step (ecommerce only)
  const [platform, setPlatform] = useState<string | null>(null)
  const [shopDomain, setShopDomain] = useState('')
  const [shopClientId, setShopClientId] = useState('')
  const [shopClientSecret, setShopClientSecret] = useState('')
  const [connectResult, setConnectResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Step 1: Products
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])

  // Step 2: Journey
  const [selectedJourney, setSelectedJourney] = useState<string[]>([])

  // Step 3: Priorities (ranked)
  const [rankedPriorities, setRankedPriorities] = useState<{ label: string; maps_to: string | null }[]>([])

  // Step 4: Channels
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['email'])

  // Step 5: Volume
  const [selectedVolume, setSelectedVolume] = useState('growing')

  // Drag state for priorities
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Step 6: Launch
  const [projectData, setProjectData] = useState<ProjectCreateResponse | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [launchResult, setLaunchResult] = useState<Record<string, unknown> | null>(null)

  const createProject = useCreateProject()
  const integrationStatus = useIntegrationStatus(projectData?.project.id ?? null)
  const integrationGuide = useIntegrationGuide(projectData?.project.id ?? null)
  const sendTestEvent = useSendTestEvent()

  const [packsLoadError, setPacksLoadError] = useState<string | null>(null)

  // Load packs on mount
  useEffect(() => {
    api.get<PackSummary[]>('/api/packs')
      .then(res => {
        if (!res.success) {
          setPacksLoadError('Could not load industries. Check backend logs.')
          return
        }
        if (res.data.length === 0) {
          setPacksLoadError('No industries available. The backend is reachable but its pack catalogue is empty — usually means dist/packs/*.json is missing on the server.')
          return
        }
        setPacks(res.data)
      })
      .catch(err => {
        console.error('[onboarding] /api/packs failed:', err)
        setPacksLoadError('Could not reach /api/packs. Check the backend is running and CORS is configured.')
      })
  }, [])

  // Load wizard questions when pack is selected
  useEffect(() => {
    if (!selectedPack) return
    api.get<WizardQuestions>(`/api/packs/${selectedPack}/wizard`).then(res => {
      if (res.success) {
        setWizardQuestions(res.data)
        setRankedPriorities(res.data.priorities)
      }
    }).catch(() => {})
  }, [selectedPack])

  // Active step flow — the Connect step only exists for ecommerce projects.
  const isEcom = selectedPack === 'ecommerce'
  const stepKeys: StepKey[] = isEcom
    ? ['industry', 'connect', 'products', 'journey', 'priorities', 'channels', 'volume', 'launch']
    : ['industry', 'products', 'journey', 'priorities', 'channels', 'volume', 'launch']
  const currentStep: StepKey = stepKeys[step] ?? 'industry'
  const lastIndex = stepKeys.length - 1

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'industry': return !!projectName.trim() && !!selectedPack
      case 'connect': return true // optional — a store can be connected later
      case 'products': return selectedProducts.length > 0
      case 'journey': return selectedJourney.length > 0
      case 'priorities': return rankedPriorities.length > 0
      case 'channels': return selectedChannels.length > 0
      case 'volume': return !!selectedVolume
      default: return false
    }
  }

  const handleNext = () => {
    if (step < lastIndex && canProceed()) setStep(step + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const toggleMultiSelect = (
    value: string,
    selected: string[],
    setSelected: (v: string[]) => void,
  ) => {
    setSelected(
      selected.includes(value)
        ? selected.filter(v => v !== value)
        : [...selected, value],
    )
  }

  // Once the project is created + configured, make it the ACTIVE project so the
  // dashboard, Connected Stores, etc. reflect the NEW project — not the old one.
  useEffect(() => {
    if (launchResult && projectData?.project) {
      localStorage.setItem('storees-active-project', projectData.project.id)
      localStorage.setItem('storees-active-project-name', projectData.project.name)
    }
  }, [launchResult, projectData])

  const handleLaunch = async () => {
    if (!selectedPack || !projectName.trim()) return
    setIsLaunching(true)

    try {
      // 1. Create the project first
      const projectRes = await createProject.mutateAsync({
        name: projectName.trim(),
        domain_type: (selectedPack === 'nbfc' ? 'fintech' : selectedPack === 'edtech' ? 'custom' : selectedPack) as DomainType,
      })
      setProjectData(projectRes.data)

      // 2. Activate the vertical pack via wizard/complete
      const wizardRes = await api.post<Record<string, unknown>>('/api/wizard/complete', {
        projectId: projectRes.data.project.id,
        packId: selectedPack,
        products: selectedProducts,
        journeySteps: selectedJourney,
        priorities: rankedPriorities,
        channels: selectedChannels,
        customerVolume: selectedVolume,
      })

      if (wizardRes.success) {
        setLaunchResult(wizardRes.data)
        toast.success('Project configured successfully!')

        // 3. Attach the Shopify store to the freshly-created project, if one was
        // configured on the Connect step. Pass projectId explicitly — the connect
        // route reads it from the query (requireAuth does NOT populate it).
        if (
          platform === 'shopify' &&
          shopDomain.trim() && shopClientId.trim() && shopClientSecret.trim()
        ) {
          const shop = normalizeDomain(shopDomain)
          try {
            await api.post(
              `/api/integrations/shopify/connect?projectId=${projectRes.data.project.id}`,
              { shop, client_id: shopClientId.trim(), client_secret: shopClientSecret.trim() },
            )
            setConnectResult({ ok: true, message: `${shop} connected — syncing now` })
            toast.success('Shopify store connected')
          } catch (err) {
            setConnectResult({
              ok: false,
              message: err instanceof Error ? err.message : 'Store connection failed',
            })
            toast.error('Project created, but the store connection failed')
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setIsLaunching(false)
    }
  }

  const handleSendTestEvent = async () => {
    if (!projectData) return
    try {
      await sendTestEvent.mutateAsync(projectData.project.id)
      toast.success('Test event sent!')
    } catch {
      toast.error('Failed to send test event')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-semibold text-heading mb-1">Set up your workspace</h1>
      <p className="text-text-secondary mb-8">Answer a few questions and we'll configure everything for you</p>

      {/* Step indicator */}
      <div className="flex items-center mb-10 overflow-x-auto pb-2">
        {stepKeys.map((key, i) => {
          const meta = STEP_META[key]
          const Icon = meta.icon
          return (
            <div key={key} className="flex items-center flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                    i < step ? 'bg-green-500 text-white' :
                    i === step ? 'bg-accent text-white' :
                    'bg-surface text-text-muted border border-border'
                  )}
                >
                  {i < step ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <span className={cn(
                  'text-xs font-medium hidden sm:inline',
                  i <= step ? 'text-heading' : 'text-text-muted',
                )}>
                  {meta.label}
                </span>
              </div>
              {i < stepKeys.length - 1 && (
                <div className={cn('w-8 h-px mx-2', i < step ? 'bg-green-500' : 'bg-border')} />
              )}
            </div>
          )
        })}
      </div>

      {/* ============ STEP: INDUSTRY ============ */}
      {currentStep === 'industry' && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-heading mb-2">Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My Awesome App"
              className="w-full px-4 py-2.5 border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-heading mb-3">What industry are you in?</label>
            {packsLoadError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {packsLoadError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {packs.map((pack) => {
                const Icon = PACK_ICONS[pack.id] ?? Puzzle
                const selected = selectedPack === pack.id
                return (
                  <button
                    key={pack.id}
                    onClick={() => setSelectedPack(pack.id)}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-lg border text-left transition-all',
                      selected
                        ? 'border-accent bg-accent/5 ring-1 ring-accent'
                        : 'border-border hover:border-text-muted'
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      selected ? 'bg-accent/10' : 'bg-surface',
                    )}>
                      <Icon className={cn('w-5 h-5', selected ? 'text-accent' : 'text-text-secondary')} />
                    </div>
                    <div>
                      <p className={cn('font-medium text-sm', selected ? 'text-accent' : 'text-heading')}>
                        {pack.name}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">{pack.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP: CONNECT (ecommerce only) ============ */}
      {currentStep === 'connect' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-heading mb-1">Connect your store</h2>
            <p className="text-sm text-text-secondary mb-4">
              Where do your customers and orders live? We'll sync them automatically. You can skip this and connect later from Connected Stores.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORM_OPTIONS.map((p) => {
                const Icon = p.icon
                const selected = platform === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(selected ? null : p.id)}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-lg border text-left transition-all',
                      selected
                        ? 'border-accent bg-accent/5 ring-1 ring-accent'
                        : 'border-border hover:border-text-muted'
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      selected ? 'bg-accent/10' : 'bg-surface',
                    )}>
                      <Icon className={cn('w-5 h-5', selected ? 'text-accent' : 'text-text-secondary')} />
                    </div>
                    <div>
                      <p className={cn('font-medium text-sm', selected ? 'text-accent' : 'text-heading')}>{p.label}</p>
                      <p className="text-xs text-text-secondary mt-0.5">{p.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Shopify inline credentials — connected at Launch */}
          {platform === 'shopify' && (
            <div className="space-y-3 rounded-lg border border-border bg-surface/50 p-4">
              <div>
                <label htmlFor="ob-shop" className="block text-sm font-medium text-heading mb-1">Store domain</label>
                <input
                  id="ob-shop"
                  type="text"
                  placeholder="mystore.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor="ob-cid" className="block text-sm font-medium text-heading mb-1">Client ID</label>
                <input
                  id="ob-cid"
                  type="text"
                  placeholder="from the Shopify app → Settings → Credentials"
                  value={shopClientId}
                  onChange={(e) => setShopClientId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor="ob-secret" className="block text-sm font-medium text-heading mb-1">Client secret</label>
                <input
                  id="ob-secret"
                  type="password"
                  placeholder="shpss_…"
                  value={shopClientSecret}
                  onChange={(e) => setShopClientSecret(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-accent"
                />
              </div>
              <p className="text-xs text-text-muted">
                Create a custom-distribution app in Shopify (Settings → Apps → Develop apps), install it, then paste its Client ID + secret. We'll connect it when you launch.
              </p>
            </div>
          )}

          {/* Non-Shopify platforms — deferred to Connected Stores */}
          {platform && platform !== 'shopify' && (
            <div className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-text-secondary">
              We'll help you connect <span className="font-medium text-heading">{PLATFORM_OPTIONS.find(p => p.id === platform)?.label}</span> from <span className="font-medium">Connected Stores</span> right after your workspace is set up.
            </div>
          )}
        </div>
      )}

      {/* ============ STEP: PRODUCTS ============ */}
      {currentStep === 'products' && wizardQuestions && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-heading mb-1">{wizardQuestions.products_label}</h2>
            <p className="text-sm text-text-secondary mb-4">Select all that apply. We'll set up your item catalogue automatically.</p>
            <div className="grid grid-cols-2 gap-3">
              {wizardQuestions.products_options.map((product) => {
                const selected = selectedProducts.includes(product)
                return (
                  <button
                    key={product}
                    onClick={() => toggleMultiSelect(product, selectedProducts, setSelectedProducts)}
                    className={cn(
                      'flex items-center gap-3 p-4 rounded-lg border text-left transition-all',
                      selected
                        ? 'border-accent bg-accent/5 ring-1 ring-accent'
                        : 'border-border hover:border-text-muted'
                    )}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0',
                      selected ? 'bg-accent border-accent' : 'border-border',
                    )}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={cn('text-sm font-medium', selected ? 'text-accent' : 'text-heading')}>
                      {product}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP: JOURNEY ============ */}
      {currentStep === 'journey' && wizardQuestions && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-heading mb-1">Map your customer journey</h2>
            <p className="text-sm text-text-secondary mb-4">
              Select the key steps in your customer lifecycle. This configures event tracking and interaction weights.
            </p>
            <div className="space-y-2">
              {wizardQuestions.journey_steps.map((step, i) => {
                const selected = selectedJourney.includes(step)
                return (
                  <button
                    key={step}
                    onClick={() => toggleMultiSelect(step, selectedJourney, setSelectedJourney)}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-all',
                      selected
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-text-muted'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
                      selected ? 'bg-accent text-white' : 'bg-surface text-text-muted',
                    )}>
                      {i + 1}
                    </div>
                    <div className={cn(
                      'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0',
                      selected ? 'bg-accent border-accent' : 'border-border',
                    )}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={cn('text-sm font-medium', selected ? 'text-heading' : 'text-text-secondary')}>
                      {step}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP: PRIORITIES ============ */}
      {currentStep === 'priorities' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-heading mb-1">What are your business priorities?</h2>
            <p className="text-sm text-text-secondary mb-4">
              Drag to rank in order of importance. Your top 3 become active AI prediction goals.
            </p>
            <div className="space-y-2">
              {rankedPriorities.map((priority, i) => (
                <div
                  key={priority.label}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i)
                    e.dataTransfer.effectAllowed = 'move'
                    // Make the drag image slightly transparent
                    if (e.currentTarget instanceof HTMLElement) {
                      e.currentTarget.style.opacity = '0.5'
                    }
                  }}
                  onDragEnd={(e) => {
                    setDragIndex(null)
                    setDragOverIndex(null)
                    if (e.currentTarget instanceof HTMLElement) {
                      e.currentTarget.style.opacity = '1'
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverIndex(i)
                  }}
                  onDragLeave={() => {
                    setDragOverIndex(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIndex === null || dragIndex === i) return
                    const newList = [...rankedPriorities]
                    const [dragged] = newList.splice(dragIndex, 1)
                    newList.splice(i, 0, dragged)
                    setRankedPriorities(newList)
                    setDragIndex(null)
                    setDragOverIndex(null)
                  }}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-lg border transition-all cursor-grab active:cursor-grabbing select-none',
                    dragOverIndex === i && dragIndex !== i
                      ? 'border-accent border-dashed bg-accent/10 scale-[1.02]'
                      : i < 3
                        ? 'border-accent/30 bg-accent/5'
                        : 'border-border bg-white',
                    dragIndex === i && 'opacity-50',
                  )}
                >
                  <GripVertical className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    i < 3 ? 'bg-accent text-white' : 'bg-surface text-text-muted',
                  )}>
                    {i + 1}
                  </div>
                  <span className={cn('text-sm font-medium flex-1', i < 3 ? 'text-heading' : 'text-text-secondary')}>
                    {priority.label}
                  </span>
                  {i < 3 && (
                    <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded">
                      Active
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP: CHANNELS ============ */}
      {currentStep === 'channels' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-heading mb-1">Communication channels</h2>
            <p className="text-sm text-text-secondary mb-4">
              Which channels do you want to use to reach your customers?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CHANNEL_OPTIONS.map((channel) => {
                const selected = selectedChannels.includes(channel.id)
                return (
                  <button
                    key={channel.id}
                    onClick={() => toggleMultiSelect(channel.id, selectedChannels, setSelectedChannels)}
                    className={cn(
                      'flex items-center gap-4 p-4 rounded-lg border text-left transition-all',
                      selected
                        ? 'border-accent bg-accent/5 ring-1 ring-accent'
                        : 'border-border hover:border-text-muted'
                    )}
                  >
                    <span className="text-2xl">{channel.emoji}</span>
                    <div className="flex-1">
                      <p className={cn('text-sm font-medium', selected ? 'text-heading' : 'text-text-secondary')}>
                        {channel.label}
                      </p>
                    </div>
                    <div className={cn(
                      'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0',
                      selected ? 'bg-accent border-accent' : 'border-border',
                    )}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP: VOLUME ============ */}
      {currentStep === 'volume' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-heading mb-1">Customer volume</h2>
            <p className="text-sm text-text-secondary mb-4">
              How many customers do you have? This helps us optimize data processing and model thresholds.
            </p>
            <div className="space-y-2">
              {VOLUME_OPTIONS.map((vol) => {
                const selected = selectedVolume === vol.id
                return (
                  <button
                    key={vol.id}
                    onClick={() => setSelectedVolume(vol.id)}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-all',
                      selected
                        ? 'border-accent bg-accent/5 ring-1 ring-accent'
                        : 'border-border hover:border-text-muted'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                      selected ? 'border-accent' : 'border-border',
                    )}>
                      {selected && <div className="w-2 h-2 rounded-full bg-accent" />}
                    </div>
                    <div>
                      <p className={cn('text-sm font-medium', selected ? 'text-heading' : 'text-text-secondary')}>
                        {vol.label}
                      </p>
                      <p className="text-xs text-text-muted">{vol.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP: LAUNCH (review) ============ */}
      {currentStep === 'launch' && !launchResult && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-heading mb-1">Review & Launch</h2>
          <p className="text-sm text-text-secondary mb-4">
            Here's what we'll configure for <span className="font-medium text-heading">{projectName}</span>:
          </p>

          <div className="space-y-3">
            <SummaryRow label="Industry" value={packs.find(p => p.id === selectedPack)?.name ?? selectedPack ?? ''} />
            <SummaryRow label="Products" value={selectedProducts.join(', ')} />
            <SummaryRow label="Journey steps" value={`${selectedJourney.length} steps selected`} />
            <SummaryRow label="Top priorities" value={rankedPriorities.slice(0, 3).map(p => p.label).join(', ')} />
            <SummaryRow label="Channels" value={selectedChannels.map(c => CHANNEL_OPTIONS.find(o => o.id === c)?.label ?? c).join(', ')} />
            <SummaryRow label="Customer volume" value={VOLUME_OPTIONS.find(v => v.id === selectedVolume)?.label ?? selectedVolume} />
            {isEcom && (
              <SummaryRow
                label="Store"
                value={
                  platform === 'shopify' && shopDomain.trim()
                    ? `Shopify · ${normalizeDomain(shopDomain)}`
                    : platform && platform !== 'shopify'
                      ? `${PLATFORM_OPTIONS.find(p => p.id === platform)?.label} · connect later`
                      : 'Connect later'
                }
              />
            )}
          </div>

          <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
            <p className="text-sm text-text-secondary">
              This will create your project, set up an <span className="font-medium text-heading">item catalogue</span>,
              configure <span className="font-medium text-heading">interaction weights</span>,
              activate <span className="font-medium text-heading">AI prediction goals</span>,
              and seed <span className="font-medium text-heading">segment templates</span> — all based on your answers.
            </p>
          </div>

          <button
            onClick={handleLaunch}
            disabled={isLaunching}
            className="w-full py-3 rounded-lg font-medium text-sm bg-accent text-white hover:bg-accent-hover flex items-center justify-center gap-2 transition-colors"
          >
            {isLaunching ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Configuring your workspace...</>
            ) : (
              <><Rocket className="w-4 h-4" /> Launch Workspace</>
            )}
          </button>
        </div>
      )}

      {/* ============ STEP: POST-LAUNCH ============ */}
      {currentStep === 'launch' && launchResult && projectData && (
        <div className="space-y-6">
          {/* Success banner */}
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CircleCheck className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-heading mb-2">Workspace configured!</h2>
            <p className="text-text-secondary text-sm">
              <span className="font-medium text-heading">{projectData.project.name}</span> is ready.
              Here's what was set up:
            </p>
          </div>

          {/* What was created */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Catalogue Items" value={String(launchResult.itemsCreated ?? 0)} />
            <StatCard label="Interaction Rules" value={String(launchResult.interactionConfigs ?? 0)} />
            <StatCard label="Prediction Goals" value={String(launchResult.predictionGoals ?? 0)} />
            <StatCard label="Segment Templates" value={String(launchResult.segmentTemplates ?? 0)} />
          </div>

          {/* API Keys (if generated) */}
          {projectData.api_keys && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-green-600" />
                <h3 className="font-medium text-green-900">API Keys Generated</h3>
              </div>
              <p className="text-sm text-green-800 mb-3">Save your API secret now — it won't be shown again.</p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-green-700 uppercase tracking-wide">API Key</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 bg-white px-3 py-2 rounded border border-green-200 text-sm font-mono text-heading break-all">
                      {projectData.api_keys.key_public}
                    </code>
                    <button onClick={() => copyToClipboard(projectData.api_keys!.key_public)} className="p-2 hover:bg-green-100 rounded">
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
                    <button onClick={() => copyToClipboard(projectData.api_keys!.key_secret)} className="p-2 hover:bg-green-100 rounded">
                      <Copy className="w-4 h-4 text-green-600" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Integration guide */}
          {projectData.integration_guide && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-heading">Quick Start — Send your first event</h3>
              {projectData.integration_guide.endpoints.slice(0, 1).map((endpoint) => (
                <div key={endpoint.path} className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-surface">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium bg-accent/10 text-accent px-2 py-0.5 rounded">
                        {endpoint.method}
                      </span>
                      <span className="text-sm font-medium text-heading">{endpoint.name}</span>
                    </div>
                    <button onClick={() => copyToClipboard(endpoint.curl)} className="flex items-center gap-1 text-xs text-text-secondary hover:text-heading">
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

          {/* Test event */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-3">
              <Zap className="w-5 h-5 text-accent" />
              <h3 className="font-medium text-heading">Test your integration</h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSendTestEvent}
                disabled={sendTestEvent.isPending}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover flex items-center gap-2"
              >
                {sendTestEvent.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                ) : 'Send Test Event'}
              </button>
              {sendTestEvent.isSuccess && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CircleCheck className="w-4 h-4" /> Event received!
                </span>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3 pt-2">
            {connectResult?.ok && (
              <div className="w-full max-w-sm flex items-center justify-center gap-2 px-6 py-2.5 bg-green-50 border border-green-200 text-green-800 rounded-lg font-medium text-sm">
                <CircleCheck className="w-4 h-4 text-green-600" /> {connectResult.message}
              </div>
            )}
            {connectResult && !connectResult.ok && (
              <div className="w-full max-w-sm text-center">
                <p className="text-xs text-red-600 mb-2">Store connection failed: {connectResult.message}</p>
                <a
                  href="/integrations"
                  className="inline-block px-6 py-2.5 bg-[#96bf48] text-white rounded-lg font-medium text-sm hover:opacity-90"
                >
                  Retry from Connected Stores →
                </a>
              </div>
            )}
            {selectedPack === 'ecommerce' && !connectResult && (
              <a
                href="/integrations"
                className="w-full max-w-sm text-center px-6 py-2.5 bg-[#96bf48] text-white rounded-lg font-medium text-sm hover:opacity-90"
              >
                Connect your store →
              </a>
            )}
            <div className="flex items-center justify-center gap-3">
              <a
                href={`/dashboard`}
                className="px-6 py-2.5 bg-accent text-white rounded-lg font-medium text-sm hover:bg-accent-hover"
              >
                Go to Dashboard
              </a>
              <a
                href={`/segments`}
                className="px-6 py-2.5 border border-border rounded-lg text-sm font-medium text-heading hover:bg-surface"
              >
                View Segments
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ============ NAVIGATION BUTTONS (all steps before Launch) ============ */}
      {currentStep !== 'launch' && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className={cn(
              'flex items-center gap-1 text-sm font-medium transition-colors',
              step === 0 ? 'text-text-muted cursor-not-allowed' : 'text-text-secondary hover:text-heading',
            )}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className={cn(
              'px-6 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors',
              canProceed()
                ? 'bg-accent text-white hover:bg-accent-hover'
                : 'bg-surface text-text-muted cursor-not-allowed',
            )}
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// ============ HELPER COMPONENTS ============

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-medium text-heading text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4 text-center">
      <p className="text-2xl font-bold text-heading">{value}</p>
      <p className="text-xs text-text-secondary mt-1">{label}</p>
    </div>
  )
}
