'use client'

import { useState } from 'react'
import { Plus, RefreshCw, FlaskConical, Trash2, Database } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { AddConnectorDialog } from '@/components/data-sources/AddConnectorDialog'
import { SyncHistoryTable } from '@/components/data-sources/SyncHistoryTable'
import {
  useConnectors,
  useTriggerSync,
  useTestConnector,
  useDeleteConnector,
  type Connector,
} from '@/hooks/useDataConnectors'

export default function DataSourcesPage() {
  const { data: connectorsRes, isLoading } = useConnectors()
  const connectors: Connector[] = connectorsRes?.data ?? []

  const [addOpen, setAddOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Sources"
        actions={
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add Connector
          </button>
        }
      />

      <p className="text-sm text-text-muted max-w-3xl">
        Connectors pull customers, products, and orders from a client's stack on demand. Onboarding team commissions one per project — clients don't need to ship any code. After setup, marketing presses <strong>Sync Now</strong> from this page whenever they want fresh data.
      </p>

      {isLoading ? (
        <div className="text-sm text-text-muted py-8 text-center">Loading connectors…</div>
      ) : connectors.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <div className="space-y-4">
          {connectors.map((c) => (
            <ConnectorCard
              key={c.id}
              connector={c}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
            />
          ))}
        </div>
      )}

      <AddConnectorDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border border-dashed border-border rounded-xl px-8 py-12 text-center">
      <Database className="h-10 w-10 text-text-muted mx-auto mb-3" />
      <h3 className="text-base font-semibold text-heading mb-1">No data sources yet</h3>
      <p className="text-sm text-text-muted mb-4 max-w-md mx-auto">
        Add a connector to pull historical and ongoing data (customers, products, orders) from a client's stack into this project.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-text-primary text-white rounded-lg hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> Add your first connector
      </button>
    </div>
  )
}

function ConnectorCard({
  connector,
  expanded,
  onToggle,
}: {
  connector: Connector
  expanded: boolean
  onToggle: () => void
}) {
  const triggerSync = useTriggerSync()
  const testConn = useTestConnector()
  const deleteConn = useDeleteConnector()
  const [testResult, setTestResult] = useState<unknown | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const lastSynced = Object.entries(connector.lastSyncedAt ?? {})
    .filter(([, v]) => !!v)
    .sort(([, a], [, b]) => String(b).localeCompare(String(a)))[0]?.[1]

  async function handleSync(kind: 'full' | 'incremental') {
    await triggerSync.mutateAsync({ connectorId: connector.id, kind })
    // Auto-expand the card so they see the sync appear in history
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
    <div className="border border-border rounded-xl bg-white overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-4">
        <button onClick={onToggle} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-heading">{connector.name}</h3>
            <span className="text-xs px-1.5 py-0.5 rounded bg-surface text-text-muted font-medium uppercase tracking-wider">
              {connector.template}
            </span>
            <StatusDot status={connector.status} />
          </div>
          <div className="mt-1 text-xs text-text-muted font-mono">{connector.baseUrl}</div>
          <div className="mt-1 text-xs text-text-muted">
            {lastSynced ? `Last synced ${new Date(lastSynced).toLocaleString()}` : 'Never synced'}
          </div>
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={handleTest}
            disabled={testConn.isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-surface disabled:opacity-50"
            title="Fetch one record from each endpoint to validate field mapping"
          >
            <FlaskConical className="h-3.5 w-3.5" /> Test
          </button>
          <button
            onClick={() => handleSync('incremental')}
            disabled={triggerSync.isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-text-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            title="Pull only records changed since the last successful sync"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Sync Now
          </button>
          <button
            onClick={() => handleSync('full')}
            disabled={triggerSync.isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-surface disabled:opacity-50"
            title="Emergency button — pulls every record regardless of last_synced_at"
          >
            Full Resync
          </button>
          {confirmingDelete ? (
            <>
              <button
                onClick={handleDelete}
                disabled={deleteConn.isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="p-1.5 text-text-muted hover:text-red-600 rounded-md hover:bg-surface"
              title="Remove connector"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {testResult ? <TestResultPanel result={testResult} onDismiss={() => setTestResult(null)} /> : null}

      {expanded && (
        <div className="border-t border-border px-5 py-4 bg-surface/30">
          <h4 className="text-sm font-medium text-heading mb-3">Sync history</h4>
          <SyncHistoryTable connectorId={connector.id} />
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
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={status} />
  )
}

function TestResultPanel({ result, onDismiss }: { result: unknown; onDismiss: () => void }) {
  const data = result as { ok: boolean; results: Record<string, { ok: boolean; sample?: unknown; mapped?: unknown; error?: string }> }
  const entries = Object.entries(data.results ?? {})

  return (
    <div className="border-t border-border bg-surface/30 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-heading">
          Test result {data.ok ? '— all endpoints OK' : '— some failed'}
        </h4>
        <button onClick={onDismiss} className="text-xs text-text-muted hover:text-text-primary">Dismiss</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {entries.map(([entity, r]) => (
          <div
            key={entity}
            className={`border rounded-lg p-3 ${r.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}
          >
            <div className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">{entity}</div>
            {r.ok ? (
              <>
                <div className="text-xs text-emerald-700 mb-2">✓ Fetched 1 record</div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-text-muted">Mapped preview</summary>
                  <pre className="mt-2 text-[10px] overflow-auto max-h-40 bg-white border border-border rounded p-2">
                    {JSON.stringify(r.mapped, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <div className="text-xs text-red-700">{r.error}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
