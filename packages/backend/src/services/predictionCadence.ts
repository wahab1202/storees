/**
 * WHEN a prediction goal should be scored, and for how long its answer is good for.
 *
 * Both are DERIVED from the goal's own prediction window. Nothing here asks which goal
 * it is, and nothing here contains an event name.
 *
 * WHY THIS EXISTS.
 *
 * Scoring has always been a nightly batch: wake up, score every customer of every
 * active goal, sleep. That is right for a question whose answer plays out over weeks —
 * "will they buy this month" does not change between midnights.
 *
 * It cannot serve a question measured in hours. A cart's window is five hours; a score
 * written at midnight describes carts that opened and died before the job ran. The
 * model is finished and good (global AUC 0.791, top-decile lift 1.63x on GoWelmart),
 * and a nightly batch would deliver every one of its answers too late to act on.
 *
 * WHY IT IS NOT AN `if (goal === 'cart_abandoned')`.
 *
 * That would be a constant standing in for a measurement, which is the mistake this
 * pipeline avoids everywhere else — windows are derived, look-backs are searched, event
 * names come from the project. The cadence follows the same rule: a goal is
 * event-driven because its WINDOW IS SHORT, not because of its name. Cart is simply the
 * first goal short enough to qualify. A "will they cancel in the next two hours" goal
 * built next year gets the fast path with no code change, and a cart goal on a slow
 * storefront that derives a two-day horizon correctly stays on the nightly batch.
 */

import { projectVocabulary } from './projectVocabulary.js'
import type { ProjectVocabulary } from './projectVocabulary.js'

/**
 * Below this many days, a goal is scored when its event arrives instead of nightly.
 *
 * One day, because that is the batch's own period: a window shorter than the gap
 * between runs cannot be served by them at all — it opens and closes between two
 * wake-ups. At exactly one day the batch still lands inside the window, so the bar sits
 * strictly below it rather than at it.
 */
export const EVENT_DRIVEN_BELOW_DAYS = 1

export function isEventDriven(predictionWindowDays: number | null | undefined): boolean {
  return predictionWindowDays != null && predictionWindowDays < EVENT_DRIVEN_BELOW_DAYS
}

/** When a score stops describing anything. `computedAt` + the goal's own window.
 *
 *  Not stored — derived wherever it is needed, so it cannot drift from the window it
 *  came from. A cart score is stale after five hours; a purchase score after fourteen
 *  days. Same line, both answers. */
export function scoreExpiresAt(computedAt: Date, predictionWindowDays: number): Date {
  return new Date(computedAt.getTime() + predictionWindowDays * 86_400_000)
}

/**
 * Which of THIS PROJECT'S event names should re-score this goal when one arrives.
 *
 * The five built-in goals name a QUESTION rather than an event, so each maps to the
 * vocabulary slot its population is defined by — product knowledge, the same mapping
 * `shared/windows.ONSET_SIGNAL` already encodes on the ML side, and deliberately not a
 * client's vocabulary. The slot is then resolved through `projectVocabulary`, so a shop
 * calling its add-to-cart `basket_touched` needs no code change here.
 *
 * Any other `target_event` is already an event name — that is what an `event:<name>`
 * goal is — and triggers on itself.
 */
const GOAL_POPULATION_SLOT: Record<string, keyof ProjectVocabulary> = {
  cart_abandoned: 'cartEvents',
  purchase: 'purchaseEvents',
  repeat_purchase: 'purchaseEvents',
  churn: 'purchaseEvents',
  // `dormancy` is deliberately absent: its population is anyone active at all, so no
  // single slot describes it. It is also never event-driven — a goal about going quiet
  // cannot be re-scored by activity arriving — so it never reaches this function.
}

/** Slots that also count as ACTIVITY on the same population, without defining it.
 *
 *  A cart's population is the adds — that is what a cart row is made of. But taking an
 *  item back out is the same shopper, still shopping, and the basket it leaves behind
 *  is a different basket. Scoring only on adds meant a removal changed what was in the
 *  cart and nothing on the screen moved, because nothing asked the question again.
 *
 *  Kept separate from `GOAL_POPULATION_SLOT` so the distinction stays visible: these
 *  events re-open the question, they do not create the population. */
const GOAL_ACTIVITY_SLOTS: Record<string, Array<keyof ProjectVocabulary>> = {
  // BUYING ENDS A CART, so it has to re-open the question too.
  //
  // Only two things close a live cart: the shopper buys, or the window runs out.
  // The window is handled by a scheduled alarm, and removals were already here — but
  // a PURCHASE, the most decisive of the three, woke nothing at all. The basket was
  // correctly emptied in the data and the worklist went on showing the old row,
  // because nothing asked the question again.
  //
  // Measured: a shopper checked out at 12:11 and the page still showed their Rs9,396
  // cart, from a score written at 12:05. Recomputing by hand returned "no live cart" —
  // the arithmetic was right the whole time and simply had not been run.
  //
  // It survived because a sweep every few minutes used to re-ask on everyone's behalf;
  // replacing that sweep with per-cart alarms removed the cover and left the gap
  // visible for a full five-hour window instead of three minutes.
  cart_abandoned: ['cartRemoveEvents', 'purchaseEvents'],
}

export async function triggerEventsFor(
  projectId: string,
  targetEvent: string,
): Promise<string[]> {
  const slot = GOAL_POPULATION_SLOT[targetEvent]
  if (!slot) return [targetEvent]
  const vocab = await projectVocabulary(projectId)
  const names = Array.isArray(vocab[slot]) ? (vocab[slot] as string[]) : []
  const extra = (GOAL_ACTIVITY_SLOTS[targetEvent] ?? [])
    .flatMap(k => (Array.isArray(vocab[k]) ? (vocab[k] as string[]) : []))
  return [...new Set([...names, ...extra])]
}
