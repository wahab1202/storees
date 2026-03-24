'use client'

import { Loader2, Workflow, Clock, CheckCircle2, XCircle, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'

type FlowTrip = {
  id: string
  flowId: string
  flowName: string
  status: string
  currentNodeId: string
  enteredAt: string
  exitedAt: string | null
  context: Record<string, unknown>
}

type Props = {
  trips: FlowTrip[]
  isLoading: boolean
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function timeSince(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
  active: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' },
  completed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
  exited: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-100' },
  paused: { icon: Pause, color: 'text-yellow-600', bg: 'bg-yellow-100' },
}

export function JourneysTab({ trips, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    )
  }

  if (trips.length === 0) {
    return (
      <div className="bg-white border border-border rounded-xl p-12 text-center">
        <Workflow className="h-10 w-10 text-text-muted mx-auto mb-3" />
        <p className="text-sm text-text-secondary">No flow journeys yet</p>
      </div>
    )
  }

  const active = trips.filter(t => t.status === 'active')
  const past = trips.filter(t => t.status !== 'active')

  return (
    <div className="space-y-6">
      {/* Active Journeys */}
      {active.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-heading mb-3">
            Active Journeys
            <span className="ml-2 text-xs font-normal text-text-muted">({active.length})</span>
          </h3>
          <div className="space-y-3">
            {active.map(trip => {
              const config = STATUS_CONFIG[trip.status] ?? STATUS_CONFIG.active
              const Icon = config.icon
              return (
                <div key={trip.id} className="bg-white border border-blue-200 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg', config.bg)}>
                        <Workflow className={cn('h-4 w-4', config.color)} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-heading">{trip.flowName}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          Current node: <span className="font-medium text-text-secondary">{trip.currentNodeId}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('h-3.5 w-3.5', config.color)} />
                      <span className={cn('text-xs font-medium capitalize', config.color)}>{trip.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3 pl-11 text-xs text-text-muted">
                    <span>Entered {formatDate(trip.enteredAt)}</span>
                    <span>Duration: {timeSince(trip.enteredAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Past Journeys */}
      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-heading mb-3">
            Past Journeys
            <span className="ml-2 text-xs font-normal text-text-muted">({past.length})</span>
          </h3>
          <div className="space-y-2">
            {past.map(trip => {
              const config = STATUS_CONFIG[trip.status] ?? STATUS_CONFIG.exited
              const Icon = config.icon
              return (
                <div key={trip.id} className="bg-white border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg', config.bg)}>
                        <Workflow className={cn('h-4 w-4', config.color)} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-heading">{trip.flowName}</p>
                        <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                          <span>Entered {formatDate(trip.enteredAt)}</span>
                          {trip.exitedAt && <span>Exited {formatDate(trip.exitedAt)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('h-3.5 w-3.5', config.color)} />
                      <span className={cn('text-xs font-medium capitalize', config.color)}>{trip.status}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
