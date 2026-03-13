import { Router } from 'express'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { getDomainConfig, getDomainFields, getDomainCategories } from '../services/domainRegistry.js'
import { requireProjectId } from '../middleware/projectId.js'
import type { DomainType } from '@storees/shared'

const router = Router()

router.use(requireProjectId)

/**
 * GET /api/schema/fields — Get field definitions for this project's domain
 */
router.get('/fields', async (req, res) => {
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
    const fields = getDomainFields(domainType)
    const categories = getDomainCategories(domainType)

    res.json({
      success: true,
      data: {
        domainType,
        categories,
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
