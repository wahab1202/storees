import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projectEmailSenders, projects } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'

const router = Router()

router.get('/', requireProjectId, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(projectEmailSenders)
      .where(eq(projectEmailSenders.projectId, req.projectId!))
      .orderBy(projectEmailSenders.address)

    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Email senders list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch email senders' })
  }
})

router.post('/sync-default', requireProjectId, async (req, res) => {
  try {
    const [project] = await db
      .select({
        id: projects.id,
        emailFromAddress: projects.emailFromAddress,
        emailFromName: projects.emailFromName,
        emailDomainVerifiedAt: projects.emailDomainVerifiedAt,
      })
      .from(projects)
      .where(eq(projects.id, req.projectId!))
      .limit(1)

    if (!project?.emailFromAddress) {
      return res.status(400).json({ success: false, error: 'No project sender address configured' })
    }

    const [sender] = await db
      .insert(projectEmailSenders)
      .values({
        projectId: project.id,
        address: project.emailFromAddress,
        displayName: project.emailFromName,
        verifiedAt: project.emailDomainVerifiedAt,
      })
      .onConflictDoUpdate({
        target: [projectEmailSenders.projectId, projectEmailSenders.address],
        set: {
          displayName: project.emailFromName,
          verifiedAt: project.emailDomainVerifiedAt,
          updatedAt: new Date(),
        },
      })
      .returning()

    res.json({ success: true, data: sender })
  } catch (err) {
    console.error('Email sender sync error:', err)
    res.status(500).json({ success: false, error: 'Failed to sync email sender' })
  }
})

export default router
