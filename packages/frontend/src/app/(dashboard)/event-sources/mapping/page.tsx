'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useEventMapping, useSaveEventMapping, useReplayStatus, MEANING_ORDER, emptyAssignment,
  type MeaningKey, type SentEvent,
} from '@/hooks/useEventMapping'

function fmtCount(n: number): string {
  return n.toLocaleString('en-IN')
}

/** Eight boxes in one flat list reads as a wall. They split cleanly in two: what the
 *  customer chose to do, and what then happened to the order. The second group is the
 *  one people skip, so it gets a heading that says why it is worth filling in. */
const MEANING_GROUPS: Array<{ title: string; help: string; keys: MeaningKey[] }> = [
  {
    title: 'What the customer did',
    help: 'The behaviour predictions are built from.',
    keys: ['purchase', 'product_viewed', 'add_to_cart', 'cart_remove'],
  },
  {
    title: 'What happened to the order',
    help: 'How an order moves after it is placed. Each kind is asked for separately '
        + 'because they are not the same outcome — a cancellation never shipped, a '
        + 'return came back, a refund may be partial. Left blank, the order stays '
        + 'pending and a reversal is recorded only as "cancelled".',
    keys: ['fulfilment', 'cancellation', 'return', 'refund'],
  },
]

/** One meaning, and the events assigned to it. */
function MeaningRow({
  label, help, required, source, selected, available, onToggle,
}: {
  label: string
  help: string
  required: boolean
  source: 'project' | 'industry' | 'none'
  selected: string[]
  available: SentEvent[]
  onToggle: (name: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-heading">{label}</span>
        {required && (
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            required
          </span>
        )}
        {source === 'industry' && selected.length > 0 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            from your industry — not confirmed
          </span>
        )}
        {required && selected.length === 0 && (
          <span className="text-xs text-red-600">nothing selected</span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-text-muted">{help}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {selected.map(name => (
          <button
            key={name}
            onClick={() => onToggle(name)}
            className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 font-mono text-xs text-accent hover:bg-accent/20"
          >
            {name}
            <X className="h-3 w-3" />
          </button>
        ))}
        <button
          onClick={() => setOpen(v => !v)}
          className="rounded-md border border-dashed border-border px-2 py-1 text-xs text-text-muted hover:border-accent hover:text-accent"
        >
          {open ? 'Close' : '+ Assign event'}
        </button>
      </div>

      {open && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-white">
          {available.length === 0 && (
            <p className="px-3 py-3 text-xs text-text-muted">
              This project has not sent any events yet.
            </p>
          )}
          {available.map(e => {
            const on = selected.includes(e.eventName)
            return (
              <button
                key={e.eventName}
                onClick={() => onToggle(e.eventName)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent/5',
                  on && 'bg-accent/5',
                )}
              >
                <span className="flex items-center gap-2 font-mono text-xs text-heading">
                  {on && <Check className="h-3 w-3 text-accent" />}
                  {e.eventName}
                </span>
                <span className="flex-shrink-0 text-xs tabular-nums text-text-muted">
                  {fmtCount(e.count)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function EventMappingPage() {
  const { data, isLoading } = useEventMapping()
  const save = useSaveEventMapping()
  // A save re-queues every stored event the meanings cover — minutes of work on a large
  // project. Held here so Save can be shut and the drain can be seen happening.
  const replay = useReplayStatus()
  const rebuilding = replay.data?.data?.running ?? false
  const remaining = replay.data?.data?.remaining ?? 0
  const mapping = data?.data

  const [assigned, setAssigned] = useState<Record<MeaningKey, string[]>>(emptyAssignment)
  const [signals, setSignals] = useState<string[]>([])
  const [ignored, setIgnored] = useState<string[]>([])

  useEffect(() => {
    if (!mapping) return
    const next = emptyAssignment()
    for (const m of mapping.meanings) if (next[m.key]) next[m.key] = m.events
    setAssigned(next)
    setSignals(mapping.signals)
    setIgnored(mapping.ignored)
  }, [mapping])

  const available = mapping?.available ?? []

  // An event assigned to a meaning cannot also be a signal — it already has one.
  const takenByMeaning = useMemo(
    () => new Set(MEANING_ORDER.flatMap(k => assigned[k] ?? [])),
    [assigned],
  )

  const toggleMeaning = (key: MeaningKey, name: string) => {
    setAssigned(prev => {
      const has = prev[key].includes(name)
      const next = { ...prev, [key]: has ? prev[key].filter(n => n !== name) : [...prev[key], name] }
      if (!has) {
        for (const other of MEANING_ORDER) {
          if (other !== key) next[other] = next[other].filter(n => n !== name)
        }
      }
      return next
    })
    setSignals(prev => prev.filter(n => n !== name))
    setIgnored(prev => prev.filter(n => n !== name))
  }

  const toggleSignal = (name: string) => {
    setSignals(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
    setIgnored(prev => prev.filter(n => n !== name))
  }

  // ONE REMAP PER PROJECT. The save that gets the mapping right closes the door.
  //
  // A save rebuilds this client's order history from their stored events — on GoWelmart,
  // correcting the purchase event moved reported revenue from ₹16.3 crore to ₹101 crore,
  // and a wrong save moves it as far the other way. Mapping is declared once at
  // onboarding and changes about never, so the button stops being available afterwards
  // rather than sitting there inviting a second opinion.
  const lock = data?.data?.lock
  const locked = lock?.locked === true
  const canSave = assigned.purchase.length > 0 && !save.isPending && !rebuilding && !locked

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-heading">Event Mapping</h1>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">
          Which of this project&rsquo;s events carries which meaning. Predictions are built from these —
          a purchase mapped to the wrong name trains a model on almost nothing and still reports a
          score. You can only choose events this project has actually sent.
        </p>
      </div>

      {rebuilding && (
        // Without this the page looks broken. The order count climbs for minutes with
        // nothing said, and pressing Save again interleaves two rebuilds — one deleting
        // rows the other is inserting.
        <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
          <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-accent" />
          <div className="text-sm text-heading">
            <p className="font-medium">Rebuilding order history</p>
            <p className="mt-0.5 text-text-muted">
              About {remaining.toLocaleString('en-IN')} event{remaining === 1 ? '' : 's'} left.
              Order and revenue figures will keep moving until this finishes. Saving is
              paused so a second rebuild can&rsquo;t run on top of this one.
            </p>
          </div>
        </div>
      )}

      {mapping?.unmatched?.length ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Mapped to events with no data</p>
            <p className="mt-0.5">
              <span className="font-mono text-xs">{mapping.unmatched.join(', ')}</span>
              {' '}— nothing has ever arrived under {mapping.unmatched.length > 1 ? 'these names' : 'this name'}.
              Anything built from {mapping.unmatched.length > 1 ? 'them' : 'it'} will be empty.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {MEANING_GROUPS.map(group => {
            const rows = (mapping?.meanings ?? []).filter(m => group.keys.includes(m.key))
            if (!rows.length) return null
            return (
              <section key={group.title} className="rounded-xl border border-border bg-white px-5 pb-1 pt-4">
                <h2 className="text-sm font-medium text-heading">{group.title}</h2>
                <p className="mt-0.5 text-xs text-text-muted">{group.help}</p>
                <div className="mt-1">
                  {rows.map(m => (
                    <MeaningRow
                      key={m.key}
                      label={m.label}
                      help={m.help}
                      required={m.required}
                      source={m.source}
                      selected={assigned[m.key] ?? []}
                      available={available}
                      onToggle={name => toggleMeaning(m.key, name)}
                    />
                  ))}
                </div>
              </section>
            )
          })}

          <section className="rounded-xl border border-border bg-white p-5">
            <h2 className="text-sm font-medium text-heading">Other signals</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Anything else worth watching. Each one gets its own features — how often, how recently,
              whether it&rsquo;s rising, and what share of activity it is. Mapping something that turns
              out not to help costs nothing; leaving it out is the only real mistake.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {available.map(e => {
                const taken = takenByMeaning.has(e.eventName)
                const on = signals.includes(e.eventName)
                // Still shown struck through when an event IS ignored — the value can be
                // set from the server even though this screen no longer offers the choice.
                const ign = ignored.includes(e.eventName)
                return (
                  <button
                    key={e.eventName}
                    disabled={taken}
                    onClick={() => toggleSignal(e.eventName)}
                    title={taken ? 'Already assigned a meaning above' : `${fmtCount(e.count)} events`}
                    className={cn(
                      'rounded-md border px-2 py-1 font-mono text-xs transition-colors',
                      taken && 'cursor-not-allowed border-border bg-surface text-text-muted/40',
                      !taken && on && 'border-accent/30 bg-accent/10 text-accent',
                      !taken && !on && !ign && 'border-border text-text-muted hover:border-accent hover:text-accent',
                      !taken && ign && 'border-border text-text-muted/50 line-through',
                    )}
                  >
                    {e.eventName}
                    <span className="ml-1.5 tabular-nums opacity-60">{fmtCount(e.count)}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* THE "IGNORE" BOX WAS REMOVED FROM THIS SCREEN — 2026-09-01.
              It let someone mark events the model should never see: our OWN outbound
              messages. Predicting a customer from messages we chose to send them teaches
              the model our targeting rather than their behaviour.

              Taken off the page because it was never used — zero ignored events across
              every project — and because nothing stopped somebody dropping their PURCHASE
              event in it, which would delete every sale from the model's view with no
              warning. An unused control that can destroy a client's revenue data does not
              belong on the most dangerous screen in the product.

              THE CAPABILITY IS INTACT. `ignore_events` is still read by the save route,
              still stored in the mapping, and still honoured by the pipeline
              (`normalise.py` drops those rows before anything else runs). A project that
              needs it can be set from the server. Restoring the box means putting this
              block back and adding the guard it never had: refuse to save an event that
              is both mapped to a meaning AND ignored.

              Worth revisiting when messaging scales. GoWelmart sends 49 outbound events
              today out of 1.17M — noise. At campaign volume it stops being noise. */}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-border bg-white p-5">
            <h2 className="text-sm font-medium text-heading">This mapping</h2>
            <dl className="mt-3 space-y-2 text-xs">
              {MEANING_ORDER.map(k => {
                const m = mapping?.meanings.find(x => x.key === k)
                return (
                  <div
                    key={k}
                    className={cn(
                      'flex items-baseline justify-between gap-3',
                      // the line where behaviour ends and order lifecycle begins
                      k === 'fulfilment' && 'border-t border-border pt-2',
                    )}
                  >
                    <dt className="flex-shrink-0 text-text-muted">{m?.label ?? k}</dt>
                    <dd className="min-w-0 break-words text-right font-mono text-heading">
                      {assigned[k]?.length ? assigned[k].join(', ') : <span className="text-text-muted/50">—</span>}
                    </dd>
                  </div>
                )
              })}
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                <dt className="text-text-muted">Signals</dt>
                <dd className="font-mono text-heading">{signals.length}</dd>
              </div>
              {/* Shown only when something IS ignored. The value can still be set from
                  the server, but this screen no longer offers the choice — and a
                  permanent "Ignored 0" invites the question "how do I change that?" */}
              {ignored.length > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-text-muted">Ignored</dt>
                  <dd className="font-mono text-heading">{ignored.length}</dd>
                </div>
              )}
            </dl>

            <button
              disabled={!canSave}
              // Spread every box rather than listing four by hand — the version that
              // listed them is how a new meaning would reach the screen, be assignable,
              // and then silently not be sent.
              onClick={() => save.mutate({
                ...emptyAssignment(), ...assigned,
                signals, ignore_events: ignored,
              })}
              className={cn(
                'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                canSave ? 'bg-accent text-white hover:bg-accent-hover'
                        : 'cursor-not-allowed bg-surface text-text-muted',
              )}
            >
              {(save.isPending || rebuilding) && <Loader2 className="h-4 w-4 animate-spin" />}
              {rebuilding ? 'Rebuilding…' : locked ? 'Mapping locked' : 'Save mapping'}
            </button>

            {/* Say WHY it cannot be saved, and how to reopen it. A disabled button with
                no explanation is the thing people file tickets about. */}
            {locked && (
              <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-[11px] leading-relaxed text-text-muted">
                <span className="font-medium text-text-secondary">One remap per project.</span>{' '}
                Set {lock?.lockedAt ? `on ${new Date(lock.lockedAt).toLocaleString()}` : 'at onboarding'}
                {lock?.lockedBy ? ` by ${lock.lockedBy}` : ''}. Reopen it from the server with{' '}
                <code className="rounded bg-white px-1 py-0.5">npm run mapping:unlock</code>.
              </p>
            )}
            {!locked && lock?.unlockedUntil && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                Unlocked until {new Date(lock.unlockedUntil).toLocaleTimeString()}
                {lock.unlockedBy ? ` by ${lock.unlockedBy}` : ''} — this buys one save.
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
              Saving REBUILDS order history from stored events — orders created by a purchase
              event you remove are retired, and orders for the new one are created. Revenue and
              order counts will change. Predictions use the new mapping on the next training run.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
