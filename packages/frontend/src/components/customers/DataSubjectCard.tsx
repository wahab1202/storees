'use client'

import { useState } from 'react'
import { Download, Loader2, ShieldAlert, Trash2 } from 'lucide-react'
import { useExportCustomerData, useEraseCustomer, useIsAdmin } from '@/hooks/useDataSubject'
import { cn } from '@/lib/utils'

/**
 * Admin-only data-subject (DSAR) controls on the customer profile — right of
 * access (export) and right to erasure (anonymise). Backend enforces
 * requireRole('admin') independently; this card self-hides for non-admins.
 */
export function DataSubjectCard({ customerId }: { customerId: string }) {
  const isAdmin = useIsAdmin()
  const exportData = useExportCustomerData(customerId)
  const erase = useEraseCustomer(customerId)
  const [confirming, setConfirming] = useState(false)

  if (!isAdmin) return null

  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-heading">Data &amp; privacy</h3>
      </div>
      <p className="text-xs text-text-muted mb-4">
        Data-subject requests (GDPR Art. 15/17 · DPDP §11/§12). Actions are audited.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {/* Right of access — export */}
        <button
          onClick={() => exportData.mutate()}
          disabled={exportData.isPending}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-border text-text-primary hover:bg-surface transition-colors disabled:opacity-50"
        >
          {exportData.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export data
        </button>

        {/* Right to erasure — two-step confirm */}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={erase.isPending || erase.isSuccess}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {erase.isSuccess ? 'Erased' : 'Erase customer'}
          </button>
        ) : (
          <div className="inline-flex items-center gap-2">
            <span className="text-xs text-text-secondary">Irreversible. Anonymise all PII?</span>
            <button
              onClick={() => { erase.mutate(); setConfirming(false) }}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Confirm erase
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {exportData.isError && (
        <p className="mt-3 text-xs text-red-600">Export failed. You may not have permission.</p>
      )}
      {erase.isError && (
        <p className="mt-3 text-xs text-red-600">Erase failed. You may not have permission.</p>
      )}
      {erase.isSuccess && (
        <p className={cn('mt-3 text-xs text-green-600')}>Customer data anonymised across all stores.</p>
      )}
    </div>
  )
}
