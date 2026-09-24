/**
 * Quality-label classification for prediction-goal AUC values.
 *
 * Single source of truth so the dashboard card, the predictions list,
 * the goal-detail page, etc. all bucket AUCs the same way — and so
 * "rename Needs Data → Fair" type changes touch one file, not five.
 *
 * Thresholds match the ML eval guardrails in packages/ml/shared/eval.py:
 *   AUC < 0.5  → genuinely worse than random ("Needs Data", red)
 *   AUC < 0.78 → real predictive lift, just not strong ("Fair", amber)
 *   AUC < 0.90 → solid model ("Good", blue)
 *   AUC < 0.95 → high discrimination ("Strong", green)
 *   AUC >= 0.95 → typically cycle-dominated for cycle-based goals;
 *                 stays "Strong" for behavior-based goals.
 */

export type QualityLabel = 'Not trained' | 'Needs Data' | 'Fair' | 'Good' | 'Strong' | 'Cycle-Based'

const BEHAVIOR_TARGETS = [
  'dormancy', 'dormant', 'churn', 'cancel', 'default', 'missed', 'expired', 'abandon',
] as const

export function isBehaviorBasedGoal(targetEvent?: string | null, name?: string | null): boolean {
  const t = (targetEvent ?? '').toLowerCase()
  const n = (name ?? '').toLowerCase()
  return BEHAVIOR_TARGETS.some(k => t.includes(k) || n.includes(k))
}

export type AucQuality = {
  label: QualityLabel
  /** Tailwind text-color class for the label */
  colorClass: string
}

export function getAucQuality(metric: number | null | undefined, isBehavior: boolean): AucQuality {
  if (metric === null || metric === undefined) {
    return { label: 'Not trained', colorClass: 'text-text-muted' }
  }
  if (metric < 0.5) {
    return { label: 'Needs Data', colorClass: 'text-red-600' }
  }
  if (metric < 0.78) {
    return { label: 'Fair', colorClass: 'text-amber-600' }
  }
  if (metric < 0.90) {
    return { label: 'Good', colorClass: 'text-blue-600' }
  }
  // Cycle-based goals at AUC ≥ 0.95 are usually detecting recurring patterns
  // rather than predicting intent — label them explicitly. Behavior-based
  // goals at high AUC stay "Strong".
  if (!isBehavior && metric >= 0.95) {
    return { label: 'Cycle-Based', colorClass: 'text-violet-600' }
  }
  return { label: 'Strong', colorClass: 'text-emerald-600' }
}


/** The five goals whose `target_event` is a GOAL NAME, not an event anybody sends.
 *
 *  `dormancy`, `churn` and `cart_abandoned` are questions the pipeline works out from a
 *  project's mapped events — a cart with no order after it, activity that stopped. No
 *  shop emits them. The card showed them under "Target:" beside real event names like
 *  `order_placed`, so an internal word read as something the shop was expected to send,
 *  and a reasonable person asked why they were never receiving it.
 */
export const PSEUDO_GOAL_EVENTS: Record<string, { label: string; from: string[] }> = {
  purchase:        { label: 'Purchase',            from: ['purchase'] },
  repeat_purchase: { label: 'Repeat purchase',     from: ['purchase'] },
  dormancy:        { label: 'Dormancy',            from: ['purchase', 'product_viewed', 'add_to_cart'] },
  churn:           { label: 'Churn',               from: ['purchase'] },
  cart_abandoned:  { label: 'Cart abandonment',    from: ['add_to_cart', 'purchase'] },
}

/** Whether this goal watches a real event the shop sends, or is derived from meanings. */
export const isPseudoGoal = (targetEvent: string) =>
  Object.prototype.hasOwnProperty.call(PSEUDO_GOAL_EVENTS, targetEvent)
