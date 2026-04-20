import { Router } from 'express'
import { db } from '../db/connection.js'
import { projects, agents, customers } from '../db/schema.js'
import { eq, and, isNotNull, asc, sql } from 'drizzle-orm'
import { getDomainConfig, getDomainFields, getDomainCategories } from '../services/domainRegistry.js'
import { requireProjectId } from '../middleware/projectId.js'
import { agentRbacEnabled } from '../config/features.js'
import type { DomainType, DomainFieldDef, FilterOperator } from '@storees/shared'

const router = Router()

router.use(requireProjectId)

/**
 * Build the agent-scope field definitions (Dealer / Region / City) for a project,
 * populated with that project's real agents + observed regions/cities. Only
 * invoked for projects that have the agentScopedAccess feature flag enabled —
 * keeps default ecommerce projects free of B2B clutter.
 */
async function buildAgentFieldDefs(projectId: string): Promise<DomainFieldDef[]> {
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

  return [agentField, regionField, cityField]
}

/**
 * GET /api/schema/fields — Get field definitions for this project's domain
 */
router.get('/fields', async (req, res) => {
  try {
    const [project] = await db
      .select({ domainType: projects.domainType, features: projects.features })
      .from(projects)
      .where(eq(projects.id, req.projectId!))
      .limit(1)

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    const domainType = (project.domainType ?? 'ecommerce') as DomainType
    const baseFields = getDomainFields(domainType)
    const categories = getDomainCategories(domainType)

    const features = (project.features ?? {}) as Record<string, unknown>
    const extraFields = agentRbacEnabled(features)
      ? await buildAgentFieldDefs(req.projectId!)
      : []

    const fields = [...baseFields, ...extraFields]
    const extraCategories = extraFields
      .map(f => f.category)
      .filter((c, i, a) => a.indexOf(c) === i && !categories.includes(c))

    res.json({
      success: true,
      data: {
        domainType,
        categories: [...categories, ...extraCategories],
        fields,
      },
    })
  } catch (err) {
    console.error('Schema fields error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch schema fields' })
  }
})

/**
 * GET /api/schema/config — Get full domain configuration for this project
 */
router.get('/config', async (req, res) => {
  try {
    const [project] = await db
      .select({ domainType: projects.domainType })
      .from(projects)
      .where(eq(projects.id, req.projectId!))
      .limit(1)

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' })
    }

    const domainType = (project.domainType ?? 'ecommerce') as DomainType
    const config = getDomainConfig(domainType)

    res.json({ success: true, data: config })
  } catch (err) {
    console.error('Schema config error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch schema config' })
  }
})

export default router
