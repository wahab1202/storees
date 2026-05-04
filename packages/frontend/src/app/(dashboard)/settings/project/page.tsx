'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useProjects, useUpdateProjectFeatures } from '@/hooks/useProjects'
import { getProjectId } from '@/lib/project'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ProjectSettingsPage() {
  const { data: projectsResp, isLoading } = useProjects()
  const projects = projectsResp?.data ?? []

  let activeId: string | null = null
  try {
    activeId = getProjectId()
  } catch {
    // no active project
  }

  const project = projects.find(p => p.id === activeId) ?? null
  const updateFeatures = useUpdateProjectFeatures(activeId ?? '')

  const [agentScoped, setAgentScoped] = useState(false)
  useEffect(() => {
    setAgentScoped(!!project?.features?.agentScopedAccess)
  }, [project?.id, project?.features?.agentScopedAccess])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading project settings…
      </div>
    )
  }

  if (!project) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No active project selected.
      </div>
    )
  }

  const handleToggleAgentScoped = (next: boolean) => {
    setAgentScoped(next)
    updateFeatures.mutate(
      { agentScopedAccess: next },
      {
        onSuccess: () => {
          toast.success(next ? 'Dealer-scoped access enabled' : 'Dealer-scoped access disabled')
        },
        onError: (err: Error) => {
          setAgentScoped(!next) // revert
          toast.error(err.message || 'Failed to update setting')
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Settings"
        description={`Per-project configuration for ${project.name}`}
      />

      <section className="rounded-lg border border-slate-200 bg-white">
        <header className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">B2B / Dealer access</h2>
          <p className="mt-1 text-sm text-slate-500">
            Required for distributors with multi-region/dealer hierarchies (e.g. GowelMart).
          </p>
        </header>

        <div className="px-6 py-5 flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-900">Enable dealer-scoped access</div>
            <p className="mt-1 text-sm text-slate-500">
              When enabled: agent/manager logins see only their assigned dealer&apos;s customers, the
              segment builder gains <strong>Dealer / Region / City</strong> filters, and the Dealers
              and Team settings tabs become available.
            </p>
          </div>

          <Toggle
            checked={agentScoped}
            onChange={handleToggleAgentScoped}
            disabled={updateFeatures.isPending}
          />
        </div>
      </section>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
        checked ? 'bg-indigo-600' : 'bg-slate-300',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
