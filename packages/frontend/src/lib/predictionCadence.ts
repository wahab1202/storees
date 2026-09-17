/**
 * How a goal's prediction WINDOW changes what the screen has to say.
 *
 * Mirrors `packages/backend/src/services/predictionCadence.ts`. Both derive everything
 * from the window and neither names a goal, so a page does not have to know which model
 * it is showing — only how long that model's answer stays true.
 *
 * A goal whose window is measured in weeks produces a list that is good all day: the
 * nightly batch wrote it and nothing about it changes before the next one. A goal whose
 * window is measured in hours produces a list that is DECAYING while it is on screen,
 * and a page that renders the two identically is telling the reader something false
 * about the second one.
 *
 * Measured on GoWelmart, the cart goal's window derives to five hours. A score written
 * this morning is not stale, it is WRONG — the cart it describes was bought or
 * abandoned hours ago. Hence a remaining-time column, a sort by urgency rather than
 * score, and expired rows removed rather than greyed.
 */

/** Below this many days, a goal is scored on its own events rather than nightly, and
 *  its scores expire. Same constant as the backend, for the same reason: a window
 *  shorter than the batch's period opens and closes between two runs. */
export const EVENT_DRIVEN_BELOW_DAYS = 1

export function isEventDriven(predictionWindowDays: number | null | undefined): boolean {
  return predictionWindowDays != null && predictionWindowDays < EVENT_DRIVEN_BELOW_DAYS
}

/** The unit somebody TYPED a window in.
 *
 *  Storage is always days — fractional for anything shorter than one — so this is a
 *  presentation concern and nothing downstream ever sees it. A form that only offered
 *  days could not express the window the cart goal actually derives to (five hours),
 *  so the one place a person can pin a window by hand could not reach the range the
 *  automatic path reaches. Not named for carts: any goal whose occasion opens and
 *  closes inside a day needs this, and the next one will not be a basket. */
export type WindowUnit = 'hours' | 'days'

/** Whatever they typed, in the days the column stores. One definition, so the hint
 *  under the field and the value that gets saved can never disagree. */
export function toDays(value: number, unit: WindowUnit): number {
  return unit === 'hours' ? value / 24 : value
}

/** "5h" / "4.2h" / "14d" — never "0d".
 *
 *  A sub-day window formatted with the old `${days}d` reads as "0d prediction", which
 *  is both wrong and alarming: it says the model looks nowhere ahead. */
export function formatWindow(days: number | null | undefined): string {
  if (days == null) return '—'
  if (days >= EVENT_DRIVEN_BELOW_DAYS) return `${Math.round(days)}d`
  const hours = days * 24
  return hours >= 10 || Number.isInteger(hours) ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`
}

/** When a score stops describing anything: written-at + the goal's own window.
 *
 *  Derived rather than stored, so it cannot drift from the window it came from. */
export function expiresAt(scoredAt: string | Date, predictionWindowDays: number): Date {
  const t = typeof scoredAt === 'string' ? new Date(scoredAt) : scoredAt
  return new Date(t.getTime() + predictionWindowDays * 86_400_000)
}

/** When the OCCASION started, not when we wrote the row about it.
 *
 *  A cart's window runs from the moment the basket opened. Counting from the score's
 *  write time made every row in a fourteen-day collection show the same "4h 49m left",
 *  a week after the last of them had died — the countdown was measuring how long ago
 *  publish ran, which is the same for every row by construction.
 *
 *  `occasion_started_at` rides in `factors`, the free-form jsonb the table already
 *  reads for its extra columns. NOT named for carts: the concept is "this row is an
 *  event with a clock running", and a two-hour checkout goal built next year needs the
 *  same mechanism without inheriting somebody else's noun.
 *
 *  Falling back to the write time keeps rows scored before this existed rendering as
 *  they did, rather than blank. */
export function occasionStartedAt(row: { factors?: unknown; createdAt?: string | null }): string | null {
  const factors = Array.isArray(row?.factors) ? row.factors as Array<Record<string, unknown>> : []
  const opened = factors.find(f => f?.feature === 'occasion_started_at')?.at
  return (typeof opened === 'string' ? opened : null) ?? row?.createdAt ?? null
}

/** "1h 12m", "48m", "expired". Rounded down — a row saying "1m" with 20 seconds left
 *  is a promise the reader cannot keep. */
export function formatRemaining(until: Date, now: Date = new Date()): string {
  const ms = until.getTime() - now.getTime()
  if (ms <= 0) return 'expired'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m`
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
}


/** A factor value by name, or null. `factors` is free-form jsonb; a row scored before a
 *  given key existed simply has not got it, and every reader must cope rather than
 *  render NaN. */
export function factorValue(row: { factors?: unknown }, feature: string): number | null {
  const factors = Array.isArray(row?.factors) ? row.factors as Array<Record<string, unknown>> : []
  const v = factors.find(f => f?.feature === feature)?.value
  return typeof v === 'number' ? v : null
}

/** WHAT ACTUALLY HAPPENED, where it is known.
 *
 *  Present only on evaluation rows — a sealed period whose answers have since played
 *  out. A live score cannot have one, and the absence is the signal: it is what lets
 *  one table show a prediction and a verdict without ever confusing them. */
export function outcomeOf(row: { factors?: unknown }): 'happened' | 'converted' | null {
  const v = factorValue(row, 'outcome')
  return v == null ? null : (v === 1 ? 'happened' : 'converted')
}
