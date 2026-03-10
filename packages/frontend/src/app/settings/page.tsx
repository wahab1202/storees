'use client'

import { PageHeader } from '@/components/layout/PageHeader'
import { getProjectId } from '@/lib/project'

export default function SettingsPage() {
  let projectId: string | null = null
  try {
    projectId = getProjectId()
  } catch {
    // not set
  }

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="max-w-lg space-y-6">
        {/* Project info */}
        <div className="bg-surface-elevated border border-border rounded-lg p-6">
          <h3 className="font-semibold text-text-primary mb-4">Project</h3>
          <div className="space-y-3">
            <Field label="Project ID" value={projectId ?? 'Not configured'} />
            <Field
              label="API URL"
              value={process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}
            />
          </div>
        </div>

        {/* Environment */}
        <div className="bg-surface-elevated border border-border rounded-lg p-6">
          <h3 className="font-semibold text-text-primary mb-4">Environment</h3>
          <div className="space-y-3">
            <Field label="Frontend" value={typeof window !== 'undefined' ? window.location.origin : '—'} />
            <Field label="Node Env" value={process.env.NODE_ENV ?? 'development'} />
          </div>
          <p className="text-xs text-text-muted mt-4">
            Set <code className="px-1 py-0.5 bg-surface rounded text-xs">NEXT_PUBLIC_PROJECT_ID</code> in your <code className="px-1 py-0.5 bg-surface rounded text-xs">.env.local</code> to connect to a project.
          </p>
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
