import { eq, and, asc, isNotNull, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { agents, customers } from '../db/schema.js'
import { agentRbacEnabled } from '../config/features.js'
import { projects } from '../db/schema.js'
import type { DomainFieldDef, FilterOperator } from '@storees/shared'

/**
 * Build the B2B / dealer-scope field defs for a project.
 *
 * Six fields, conditionally included when the project has agentScopedAccess:
 *   - agent_id    (Dealer = pick from dropdown)
 *   - region      (Customer's region — postal/state)
 *   - city        (Customer's city)
 *   - dealer_name (string contains/is — JOIN against agents.name)
 *   - dealer_city (string contains/is — JOIN against agents.city)
 *   - dealer_region (string contains/is — JOIN against agents.region)
 *
 * The last three are "virtual" fields: the segment evaluator translates
 * them to EXISTS subqueries against the agents table. Lets segments like
 * "Customers whose dealers are from Tiruvarur" / "Customers under
 * dealers in Tamil Nadu" work without a hardcoded dealer-id list.
 *
 * Used by both:
 *   - GET /api/schema/fields  (segment builder UI)
 *   - aiSegmentService.generateSegmentFilter  (Segment AI)
 *
 * The dropdown options for agent_id/region/city come from the project's
 * actual data; dealer_name/dealer_city/dealer_region are free-text contains.
 */
export async function buildAgentFieldDefs(projectId: string): Promise<DomainFieldDef[]> {
  const [agentRows, regionRows, cityRows] = await Promise.all([
    db
      .select({ id: agents.id, name: agents.name, region: agents.region })
      .from(agents)
      .where(and(eq(agents.projectId, projectId), eq(agents.isActive, true)))
      .orderBy(asc(agents.name)),
    db
      .selectDistinct({ region: customers.region })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), isNotNull(customers.region)))
      .orderBy(asc(customers.region)),
    db
      .selectDistinct({ city: customers.city })
      .from(customers)
      .where(and(eq(customers.projectId, projectId), isNotNull(customers.city)))
      .orderBy(asc(customers.city)),
  ])

  const agentField: DomainFieldDef = {
    field: 'agent_id',
    label: 'Dealer',
    type: 'select',
    category: 'Dealer & Region',
    operators: ['is', 'is_not'] as FilterOperator[],
    optionPairs: agentRows.map(a => ({
      value: a.id,
      label: a.region ? `${a.name} (${a.region})` : a.name,
    })),
  }

  const regionField: DomainFieldDef = {
    field: 'region',
    label: 'Region',
    type: 'select',
    category: 'Dealer & Region',
    operators: ['is', 'is_not'] as FilterOperator[],
    options: regionRows.map(r => r.region!).filter(Boolean),
  }

  const cityField: DomainFieldDef = {
    field: 'city',
    label: 'City',
    type: 'select',
    category: 'Dealer & Region',
    operators: ['is', 'is_not', 'contains'] as FilterOperator[],
    options: cityRows.map(r => r.city!).filter(Boolean),
  }

  // Virtual fields: filter customers by attributes of THEIR DEALER.
  // Resolved at evaluator time as EXISTS (SELECT 1 FROM agents a WHERE
  // a.id = customers.agent_id AND a.<col> ILIKE '%X%').
  const dealerNameField: DomainFieldDef = {
    field: 'dealer_name',
    label: 'Dealer Name',
    type: 'string',
    category: 'Dealer & Region',
    operators: ['is', 'is_not', 'contains', 'begins_with', 'ends_with'] as FilterOperator[],
  }
  const dealerCityField: DomainFieldDef = {
    field: 'dealer_city',
    label: 'Dealer City',
    type: 'string',
    category: 'Dealer & Region',
    operators: ['is', 'is_not', 'contains'] as FilterOperator[],
  }
  const dealerRegionField: DomainFieldDef = {
    field: 'dealer_region',
    label: 'Dealer Region',
    type: 'string',
    category: 'Dealer & Region',
    operators: ['is', 'is_not', 'contains'] as FilterOperator[],
  }

  return [agentField, regionField, cityField, dealerNameField, dealerCityField, dealerRegionField]
}

/**
 * Returns the project's full field set including dynamic B2B fields when
 * the project has agentScopedAccess enabled. This is what the AI segment
 * service uses to know which fields are available.
 */
export async function getProjectFieldDefs(projectId: string, baseFields: DomainFieldDef[]): Promise<DomainFieldDef[]> {
  const [project] = await db
    .select({ features: projects.features })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  const features = (project?.features ?? {}) as Record<string, unknown>
  if (!agentRbacEnabled(features)) return baseFields

  const agentFields = await buildAgentFieldDefs(projectId)
  return [...baseFields, ...agentFields]
}

// Re-export sql for the v1Schema route (which used to declare it via drizzle directly)
export { sql }
