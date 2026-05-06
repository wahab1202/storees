import { Router } from 'express'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { getDomainConfig, getDomainFields, getDomainCategories } from '../services/domainRegistry.js'
import { requireProjectId } from '../middleware/projectId.js'
import { agentRbacEnabled } from '../config/features.js'
import { buildAgentFieldDefs } from '../services/agentFieldDefs.js'
import type { DomainType } from '@storees/shared'

const router = Router()

router.use(requireProjectId)

// buildAgentFieldDefs is now shared at services/agentFieldDefs.ts so the
// segment-builder UI (this route) and the Segment AI both see identical fields.

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
