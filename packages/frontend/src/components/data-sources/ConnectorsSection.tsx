'use client'

import { useState } from 'react'
import { Plus, RefreshCw, FlaskConical, Trash2, Database } from 'lucide-react'
import { AddConnectorDialog } from './AddConnectorDialog'
import { SyncHistoryTable } from './SyncHistoryTable'
import {
  useConnectors,
  useTriggerSync,
  useTestConnector,
  useDeleteConnector,
  type Connector,
} from '@/hooks/useDataConnectors'

// Per-project data-source connectors. Rendered inline inside the expanded
// project card on /projects (the same place API Keys live), so onboarding can
// commission a connector while looking at the rest of the project's setup
// in one place.

export function ConnectorsSection({ projectId }: { projectId: string }) {
  const { data: connectorsRes, isLoading } = useConnectors(projectId)
  const connectors: Connector[] = connectorsRes?.data ?? []

  const [addOpen, setAddOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted max-w-2xl">
          Connectors pull customers, products, and orders from this client's stack on demand. Works for any vertical (BFSI, sporttech, edtech, ecommerce) and any tech stack.
        </p>
        {connectors.length > 0 && (
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-border rounded-md hover:bg-surface"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-text-muted py-3">Loading connectors…</div>
      ) : connectors.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <div className="space-y-2">
          {connectors.map((c) => (
            <ConnectorCard
              key={c.id}
              connector={c}
              projectId={projectId}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
            />
          ))}
        </div>
      )}

      <AddConnectorDialog open={addOpen} onClose={() => setAddOpen(false)} projectId={projectId} />
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border border-dashed border-border rounded-lg px-4 py-6 text-center">
      <Database className="h-7 w-7 text-text-muted mx-auto mb-2" />
      <h4 className="text-sm font-medium text-heading mb-1">No data sources yet</h4>
      <p className="text-xs text-text-muted mb-3 max-w-md mx-auto">
        Add a connector to pull historical and ongoing data from this client's stack.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-text-primary text-white rounded-lg hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> Add your first connector
      </button>
    </div>
  )
}

function ConnectorCard({
  connector,
  projectId,
  expanded,
  onToggle,
}: {
  connector: Connector
  projectId: string
  expanded: boolean
  onToggle: () => void
}) {
  const triggerSync = useTriggerSync(projectId)
  const testConn = useTestConnector(projectId)
  const deleteConn = useDeleteConnector(projectId)
  const [testResult, setTestResult] = useState<unknown | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const lastSynced = Object.entries(connector.lastSyncedAt ?? {})
    .filter(([, v]) => !!v)
    .sort(([, a], [, b]) => String(b).localeCompare(String(a)))[0]?.[1]

  async function handleSync(kind: 'full' | 'incremental') {
    await triggerSync.mutateAsync({ connectorId: connector.id, kind })
    if (!expanded) onToggle()
  }

  async function handleTest() {
    const result = await testConn.mutateAsync(connector.id)
    setTestResult(result.data)
  }

  async function handleDelete() {
    await deleteConn.mutateAsync(connector.id)
  }

  return (
    <div className="border border-border rounded-lg bg-white overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between gap-3">
        <button onClick={onToggle} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-heading truncate">{connector.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-text-muted font-medium uppercase tracking-wider">
              {connector.template}
            </span>
            <StatusDot status={connector.status} />
          </div>
          <div className="mt-0.5 text-[11px] text-text-muted font-mono truncate">{connector.baseUrl}</div>
          <div className="mt-0.5 text-[11px] text-text-muted">
            {lastSynced ? `Last synced ${new Date(lastSynced).toLocaleString()}` : 'Never synced'}
          </div>
        </button>

        <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
          <button
            onClick={handleTest}
            disabled={testConn.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-border rounded-md hover:bg-surface disabled:opacity-50"
            title="Fetch one record from each endpoint to validate field mapping"
          >
            <FlaskConical className="h-3 w-3" /> Test
          </button>
          <button
            onClick={() => handleSync('incremental')}
            disabled={triggerSync.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-text-primary text-white rounded-md hover:opacity-90 disabled:opacity-50"
            title="Pull only records changed since the last successful sync"
          >
            <RefreshCw className="h-3 w-3" /> Sync Now
          </button>
          <button
            onClick={() => handleSync('full')}
            disabled={triggerSync.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-border rounded-md hover:bg-surface disabled:opacity-50"
            title="Emergency button — pulls every record regardless of last_synced_at"
          >
            Full Resync
          </button>
          {confirmingDelete ? (
            <>
              <button
                onClick={handleDelete}
                disabled={deleteConn.isPending}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="px-2 py-1 text-[11px] font-medium text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="p-1 text-text-muted hover:text-red-600 rounded-md hover:bg-surface"
              title="Remove connector"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {testResult ? <TestResultPanel result={testResult} onDismiss={() => setTestResult(null)} /> : null}

      {expanded && (
        <div className="border-t border-border px-3 py-3 bg-surface/30">
          <h5 className="text-xs font-medium text-heading mb-2">Sync history</h5>
          <SyncHistoryTable connectorId={connector.id} projectId={projectId} />
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: Connector['status'] }) {
  const color =
    status === 'active' ? 'bg-emerald-500' :
    status === 'paused' ? 'bg-amber-500' :
    'bg-red-500'
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={status} />
}

function TestResultPanel({ result, onDismiss }: { result: unknown; onDismiss: () => void }) {
  const data = result as { ok: boolean; results: Record<string, { ok: boolean; sample?: unknown; mapped?: unknown; error?: string }> }
  const entries = Object.entries(data.results ?? {})

  return (
    <div className="border-t border-border bg-surface/30 px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-xs font-medium text-heading">
          Test result {data.ok ? '— all endpoints OK' : '— some failed'}
        </h5>
        <button onClick={onDismiss} className="text-[11px] text-text-muted hover:text-text-primary">Dismiss</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {entries.map(([entity, r]) => (
          <div
            key={entity}
            className={`border rounded-md p-2 ${r.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}
          >
            <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted mb-1">{entity}</div>
            {r.ok ? (
              <>
                <div className="text-[11px] text-emerald-700 mb-1">✓ Fetched 1 record</div>
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-text-muted">Mapped preview</summary>
                  <pre className="mt-1 text-[10px] overflow-auto max-h-32 bg-white border border-border rounded p-1.5">
                    {JSON.stringify(r.mapped, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <div className="text-[11px] text-red-700">{r.error}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
