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
