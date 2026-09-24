'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSuperAdminGuard } from '@/components/auth/RequireSuperAdmin'
import {
  useEventMapping, useSaveEventMapping, useReplayStatus, usePreviewEventMapping,
  MEANING_ORDER, emptyAssignment,
  type MeaningKey, type SentEvent,
} from '@/hooks/useEventMapping'

function fmtCount(n: number): string {
  return n.toLocaleString('en-IN')
}

/** Crore and lakh, because ₹857094239.02 is a number nobody can weigh at a glance —
 *  and weighing it is the entire point of showing it before a rebuild. */
function fmtMoney(raw: string | number): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

/** Eight boxes in one flat list reads as a wall. They split cleanly in two: what the
 *  customer chose to do, and what then happened to the order. The second group is the
 *  one people skip, so it gets a heading that says why it is worth filling in. */
const MEANING_GROUPS: Array<{ title: string; help: string; keys: MeaningKey[] }> = [
  {
    title: 'What the customer did',
    help: 'The behaviour predictions are built from.',
    keys: ['purchase', 'product_viewed', 'add_to_cart', 'cart_remove', 'cart_snapshot'],
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
  // Nav hides this already; this is what stops a pasted URL from rendering the form.
  // Deliberately a wrapper rather than a check inside the page, so none of the page's
  // queries fire for someone who may not see the answer.
  const guard = useSuperAdminGuard()
  if (guard) return guard
  return <EventMappingScreen />
}

function EventMappingScreen() {
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

  // WHO MAY SAVE, AND WHETHER THEY MEANT TO.
  //
  // A save rebuilds this client's order history from their stored events — on GoWelmart,
  // correcting the purchase event moved reported revenue from ₹16.3 crore to ₹101 crore,
  // and a wrong save moves it as far the other way.
  //
  // This used to be a one-remap LOCK reopened only by `npm run mapping:unlock` on the
  // server. It guarded the right thing the wrong way: the screen was reachable by every
  // admin, so a lock was standing in for a permission — and the danger is a WRONG save,
  // not a second one, which a one-shot fuse does nothing about. Now the permission says
  // who, and the preview below says what, with the damage in rupees before anyone
  // commits to it.
  const canEdit = data?.data?.canEdit === true
  const canSave = assigned.purchase.length > 0 && !save.isPending && !rebuilding && canEdit

  const preview = usePreviewEventMapping()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const payload = () => ({ ...emptyAssignment(), ...assigned, signals, ignore_events: ignored })
  const impact = preview.data?.data
  const nameMatches = impact ? typed.trim() === impact.projectName : false

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
          {/* A SLOT THE SERVER SENDS AND NO GROUP CLAIMS MUST STILL BE VISIBLE.
              The groups above are a hand-written list, and a ninth meaning was added to
              the server, the vocabulary, the packs and the pipeline while this list was
              not touched — so the box simply did not render. Nothing failed: the screen
              looked complete, and the slot was unreachable. Grouping is presentation;
              dropping a meaning is not, so anything unclaimed falls through below. */}
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

          {/* The catch-all described above. Renders nothing in the normal case. */}
          {(() => {
            const claimed = new Set(MEANING_GROUPS.flatMap(g => g.keys as string[]))
            const orphans = (mapping?.meanings ?? []).filter(m => !claimed.has(m.key))
            if (!orphans.length) return null
            return (
              <section className="rounded-xl border border-amber-300 bg-white p-5">
                <h2 className="text-sm font-medium text-heading">Other meanings</h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  These are read by the pipeline but have not been given a place on this
                  screen yet. They work exactly as the boxes above.
                </p>
                <div className="mt-3 space-y-3">
                  {orphans.map(m => (
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
          })()}

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
              // Opens the preview rather than saving. Nothing is written until the
              // damage has been shown and the project's name typed back.
              onClick={() => {
                setTyped('')
                setConfirmOpen(true)
                preview.mutate(payload())
              }}
              className={cn(
                'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                canSave ? 'bg-accent text-white hover:bg-accent-hover'
                        : 'cursor-not-allowed bg-surface text-text-muted',
              )}
            >
              {(save.isPending || rebuilding) && <Loader2 className="h-4 w-4 animate-spin" />}
              {rebuilding ? 'Rebuilding…' : !canEdit ? 'Read only' : 'Review and save…'}
            </button>

            {/* Say WHY it cannot be saved. A disabled button with no explanation is the
                thing people file tickets about. */}
            {!canEdit && (
              <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-[11px] leading-relaxed text-text-muted">
                <span className="font-medium text-text-secondary">Read only.</span>{' '}
                Saving rebuilds this project&rsquo;s order history and changes its reported
                revenue, so it is limited to super-admins. Ask one to make the change —
                everything above is accurate to what the pipeline is using today.
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

      {/* WHAT THIS SAVE WOULD DO, BEFORE IT DOES IT.
          The screen used to say "revenue and order counts will change" and leave the
          direction and the size to the imagination. The numbers were always available —
          the save computes them to decide what to retire — they were simply never shown
          to the one person who could still change their mind. */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-base font-semibold text-heading">Review this rebuild</h2>
              <button onClick={() => setConfirmOpen(false)}
                      className="rounded p-1 text-text-muted hover:bg-surface">
                <X className="h-4 w-4" />
              </button>
            </div>

            {preview.isPending && (
              <p className="mt-5 flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Working out what would change…
              </p>
            )}

            {preview.isError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {(preview.error as Error)?.message ?? 'Could not preview this change.'}
              </p>
            )}

            {impact && !impact.willRebuild && (
              <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-sm text-text-secondary">
                No meaning changed, so nothing is rebuilt. Signals and ignored events are
                saved on their own and take effect at the next training run.
              </p>
            )}

            {impact && impact.willRebuild && (
              <>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-text-muted">Orders today</dt>
                    <dd className="font-mono text-heading">
                      {fmtCount(impact.current.orders)} · {fmtMoney(impact.current.revenue)}
                    </dd>
                  </div>
                  {impact.retiring.orders > 0 && (
                    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-red-50 px-3 py-2">
                      <dt className="text-red-700">
                        Deleted — built from {impact.retiring.events.join(', ')}
                      </dt>
                      <dd className="font-mono font-medium text-red-700">
                        −{fmtCount(impact.retiring.orders)} · −{fmtMoney(impact.retiring.revenue)}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-3 rounded-lg bg-surface px-3 py-2">
                    <dt className="text-text-secondary">Rebuilt from events</dt>
                    <dd className="font-mono text-heading">
                      at least {fmtCount(impact.building.atLeastOrders)} · {fmtMoney(impact.building.revenue)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-text-muted">Events replayed</dt>
                    <dd className="font-mono text-heading">
                      {fmtCount(impact.replaying.purchases + impact.replaying.statuses)}
                    </dd>
                  </div>
                </dl>

                {/* The failure this catches. A purchase event carrying no amount rebuilds
                    the right number of orders worth nothing at all, and every screen then
                    reports a collapse nobody ordered. */}
                {Number(impact.building.revenue) === 0 && impact.building.atLeastOrders > 0 && (
                  <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      The event you picked carries <strong>no amount</strong> on any of its rows.
                      This rebuilds orders worth <strong>₹0</strong> and your reported revenue
                      collapses. Almost certainly the wrong event.
                    </span>
                  </p>
                )}

                <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
                  &ldquo;At least&rdquo; because orders pulled in by a store sync have no event behind
                  them and cannot be rebuilt from the ledger — they are left untouched.
                </p>

                <label className="mt-4 block text-xs text-text-secondary">
                  Type <span className="font-medium text-heading">{impact.projectName}</span> to confirm
                  <input
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    placeholder={impact.projectName}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm text-heading outline-none focus:border-accent"
                  />
                </label>
              </>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)}
                      className="rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface">
                Cancel
              </button>
              <button
                disabled={!impact || (impact.willRebuild && !nameMatches) || save.isPending}
                onClick={() => {
                  save.mutate({ ...payload(), confirm: impact?.projectName ?? '' },
                               { onSuccess: () => setConfirmOpen(false) })
                }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                  impact && (!impact.willRebuild || nameMatches) && !save.isPending
                    ? 'bg-accent text-white hover:bg-accent-hover'
                    : 'cursor-not-allowed bg-surface text-text-muted',
                )}
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {impact && !impact.willRebuild ? 'Save' : 'Rebuild order history'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
