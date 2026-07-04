import type { FilterConfig, FilterRule } from './types.js'
import { readPath } from './utils.js'

/**
 * Evaluate trigger/condition filters against an event's `properties` JSON.
 *
 * Pure JS matcher — used both by the live trigger worker (to gate trip
 * creation on the incoming event) and the flow executor's `event_occurred`
 * condition (to gate a Yes/No branch on past events of the trip's customer).
 *
 * Nested groups are tolerated but ignored (the panel never authors them for
 * events). Field paths may be prefixed with `properties.` for back-compat
 * with older trigger configs that stored fully-qualified paths.
 */
export function evaluateEventFilters(
  filters: FilterConfig,
  properties: Record<string, unknown>,
): boolean {
  if (!filters.rules.length) return true

  const results = filters.rules.map(item => {
    if ('type' in item && item.type === 'group') return true

    const rule = item as FilterRule
    const fieldPath = rule.field.replace(/^properties\./, '')
    // Dot-paths traverse nested objects/arrays (line_items.0.price);
    // flat keys behave exactly as before.
    const value = readPath(properties, fieldPath)

    switch (rule.operator) {
      case 'is':           return value === rule.value
      case 'is_not':       return value !== rule.value
      case 'greater_than': return Number(value) > Number(rule.value)
      case 'less_than':    return Number(value) < Number(rule.value)
      case 'contains':     return String(value ?? '').includes(String(rule.value))
      case 'is_true':      return value === true
      case 'is_false':     return value === false
      default:             return false
    }
  })

  return filters.logic === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean)
}
