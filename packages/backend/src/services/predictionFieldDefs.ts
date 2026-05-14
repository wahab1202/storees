import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { predictionGoals } from '../db/schema.js'
import type { DomainFieldDef, FilterOperator } from '@storees/shared'

/**
 * Build per-prediction-goal field defs for a project. Each active
 * prediction goal gets TWO filter fields surfaced under the
 * "AI & Predictions" category in the segment builder:
 *
 *   prediction:<goalId>:bucket    — High / Medium / Low select
 *   prediction:<goalId>:score     — 0–100 numeric (greater/less/between)
 *
 * The colon-namespaced field names are parsed by the segment evaluator
 * which translates them into a JOIN against prediction_scores ON
 * (customer_id, goal_id). That way "users in High bucket of Predict
 * Dormancy AND Low bucket of Predict Churn" works without any new
 * static metric columns or precomputed JSONB on customers.
 *
 * Used by both:
 *   - GET /api/schema/fields  (segment builder UI)
 *   - aiSegmentService.generateSegmentFilter (Segment AI — eventually)
 */
export async function buildPredictionGoalFields(projectId: string): Promise<DomainFieldDef[]> {
  const goals = await db
    .select({ id: predictionGoals.id, name: predictionGoals.name })
    .from(predictionGoals)
    .where(and(eq(predictionGoals.projectId, projectId), eq(predictionGoals.status, 'active')))

  if (goals.length === 0) return []

  const fields: DomainFieldDef[] = []
  for (const g of goals) {
    fields.push({
      field: `prediction:${g.id}:bucket`,
      label: `${g.name} — bucket`,
      type: 'select',
      category: 'AI & Predictions',
      operators: ['is', 'is_not'] as FilterOperator[],
      options: ['high', 'medium', 'low'],
    })
    fields.push({
      field: `prediction:${g.id}:score`,
      label: `${g.name} — score`,
      type: 'number',
      category: 'AI & Predictions',
      operators: ['greater_than', 'less_than', 'between'] as FilterOperator[],
    })
  }
  return fields
}
