'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { useProjects, useProjectApiKeys } from '@/hooks/useProjects'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useSwitchProject } from '@/lib/projectContext'
import {
  FolderOpen,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  ArrowRightCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  ShoppingBag,
  Landmark,
  Monitor,
  Globe,
  Calendar,
  Shield,
  Activity,
} from 'lucide-react'
import type { DomainType } from '@storees/shared'

const DOMAIN_CONFIG: Record<string, { label: string; icon: typeof Globe; color: string }> = {
  ecommerce: { label: 'E-Commerce', icon: ShoppingBag, color: 'bg-orange-50 text-orange-600' },
  fintech: { label: 'Fintech', icon: Landmark, color: 'bg-blue-50 text-blue-600' },
  saas: { label: 'SaaS', icon: Monitor, color: 'bg-purple-50 text-purple-600' },
  custom: { label: 'Custom', icon: Globe, color: 'bg-gray-100 text-gray-600' },
}

type ApiKeyInfo = {
  id: string
  name: string
  keyPublic: string
  permissions: string[]
  rateLimit: number
  isActive: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

function ApiKeysSection({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectApiKeys(projectId)
  const [copied, setCopied] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const keys: ApiKeyInfo[] = data?.data ?? []

  function copyKey(key: string, id: string) {
    navigator.clipboard.writeText(key)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function toggleReveal(id: string) {
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (isLoading) {
    return <div className="text-xs text-text-muted px-4 py-2">Loading keys...</div>
  }

  if (keys.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-text-muted">
        No API keys found for this project.
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {keys.map(key => {
        const isRevealed = revealed.has(key.id)
        const maskedKey = key.keyPublic.slice(0, 12) + '••••••••••••' + key.keyPublic.slice(-6)

        return (
          <div key={key.id} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Key size={13} className={key.isActive ? 'text-green-500' : 'text-text-muted'} />
              <span className="text-xs font-medium text-text-primary">{key.name}</span>
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                key.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
              )}>
                {key.isActive ? 'Active' : 'Revoked'}
              </span>
              {key.permissions.map(p => (
                <span key={p} className="text-[10px] bg-surface px-1.5 py-0.5 rounded text-text-muted">{p}</span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-surface px-2.5 py-1.5 rounded text-text-primary truncate">
                {isRevealed ? key.keyPublic : maskedKey}
              </code>
              <button
                onClick={() => toggleReveal(key.id)}
                className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
                title={isRevealed ? 'Hide' : 'Reveal'}
              >
                {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                onClick={() => copyKey(key.keyPublic, key.id)}
                className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
                title="Copy"
              >
                {copied === key.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>

            <div className="flex items-center gap-4 mt-2 text-[10px] text-text-muted">
              <span>Rate: {key.rateLimit}/min</span>
              {key.lastUsedAt && (
                <span>Last used: {new Date(key.lastUsedAt).toLocaleDateString()}</span>
              )}
              <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const { data, isLoading, isError } = useProjects()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const switchProject = useSwitchProject()
  const currentProjectId = typeof window !== 'undefined' ? localStorage.getItem('storees-active-project') : null

  const projects = data?.data ?? []

  return (
    <div>
      <PageHeader
        title="Projects"
        actions={
          <button
            onClick={() => router.push('/onboarding')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm">Failed to load projects.</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 bg-surface-elevated border border-border rounded-xl">
          <FolderOpen className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-text-primary mb-1">No projects yet</h3>
          <p className="text-sm text-text-secondary mb-4">
            Create your first project to start tracking events.
          </p>
          <button
            onClick={() => router.push('/onboarding')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Project
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(project => {
            const domain = DOMAIN_CONFIG[project.domainType] || DOMAIN_CONFIG.custom
            const DomainIcon = domain.icon
            const isExpanded = expandedId === project.id

            return (
              <div
                key={project.id}
                className="bg-surface-elevated border border-border rounded-xl overflow-hidden"
              >
                {/* Project Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : project.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-surface/50 transition-colors text-left"
                >
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', domain.color)}>
                    <DomainIcon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">{project.name}</h3>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', domain.color)}>
                        {domain.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <Shield size={10} />
                        {project.integrationType === 'shopify' ? 'Shopify' : 'API Key'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(project.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Project ID (always visible) */}
                  <code className="hidden sm:block text-[10px] font-mono text-text-muted bg-surface px-2 py-1 rounded">
                    {project.id.slice(0, 8)}...
                  </code>

                  {isExpanded ? (
                    <ChevronDown size={16} className="text-text-muted" />
                  ) : (
                    <ChevronRight size={16} className="text-text-muted" />
                  )}
                </button>

                {/* Expanded: Project ID + API Keys */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Switch to project button */}
                    <div className="px-4 py-3 bg-surface/30 flex items-center justify-between">
                      {currentProjectId === project.id ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                          <Check size={12} />
                          Active Project
                        </span>
                      ) : (
                        <button
                          onClick={() => switchProject(project.id, project.name)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                        >
                          <ArrowRightCircle size={12} />
                          Switch to this Project
                        </button>
                      )}
                    </div>

                    {/* Full Project ID */}
                    <div className="px-4 py-3 bg-surface/30 border-t border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <Activity size={12} className="text-text-muted" />
                        <span className="text-xs font-medium text-text-secondary">Project ID</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs font-mono text-text-primary bg-surface px-2.5 py-1.5 rounded truncate">
                          {project.id}
                        </code>
                        <CopyButton text={project.id} />
                      </div>
                    </div>

                    {/* API Keys */}
                    <div className="border-t border-border">
                      <div className="px-4 py-2 bg-surface/30 flex items-center gap-2">
                        <Key size={12} className="text-text-muted" />
                        <span className="text-xs font-medium text-text-secondary">API Keys</span>
                      </div>
                      <ApiKeysSection projectId={project.id} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  )
}
