import { Router } from 'express'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { campaigns, campaignSends } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import {
  listCampaigns,
  getCampaignWithSegment,
  dispatchCampaign,
} from '../services/campaignService.js'

const router = Router()

// GET /api/campaigns?projectId=
router.get('/', requireProjectId, async (req, res) => {
  try {
    const rows = await listCampaigns(req.projectId!)
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Campaign list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch campaigns' })
  }
})

// GET /api/campaigns/:id?projectId=
router.get('/:id', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string
    const campaign = await getCampaignWithSegment(id)
    if (!campaign || campaign.projectId !== req.projectId) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }
    res.json({ success: true, data: campaign })
  } catch (err) {
    console.error('Campaign detail error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch campaign' })
  }
})

// POST /api/campaigns?projectId=
router.post('/', requireProjectId, async (req, res) => {
  try {
    const { name, subject, htmlBody, segmentId, fromName, scheduledAt } = req.body as {
      name: string
      subject: string
      htmlBody: string
      segmentId?: string
      fromName?: string
      scheduledAt?: string
    }

    if (!name?.trim() || !subject?.trim() || !htmlBody?.trim()) {
      return res.status(400).json({ success: false, error: 'name, subject, and htmlBody are required' })
    }

    const [campaign] = await db.insert(campaigns).values({
      projectId: req.projectId!,
      name: name.trim(),
      subject: subject.trim(),
      htmlBody,
      segmentId: segmentId ?? null,
      fromName: fromName?.trim() ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : 'draft',
    }).returning()

    res.status(201).json({ success: true, data: campaign })
  } catch (err) {
    console.error('Campaign create error:', err)
    res.status(500).json({ success: false, error: 'Failed to create campaign' })
  }
})

// PATCH /api/campaigns/:id?projectId=
router.patch('/:id', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string
    const { name, subject, htmlBody, segmentId, fromName, scheduledAt } = req.body as {
      name?: string
      subject?: string
      htmlBody?: string
      segmentId?: string | null
      fromName?: string | null
      scheduledAt?: string | null
    }

    const [existing] = await db
      .select({ status: campaigns.status, projectId: campaigns.projectId })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)

    if (!existing || existing.projectId !== req.projectId) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    if (!['draft', 'scheduled'].includes(existing.status)) {
      return res.status(400).json({ success: false, error: 'Only draft or scheduled campaigns can be edited' })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name.trim()
    if (subject !== undefined) updates.subject = subject.trim()
    if (htmlBody !== undefined) updates.htmlBody = htmlBody
    if (segmentId !== undefined) updates.segmentId = segmentId
    if (fromName !== undefined) updates.fromName = fromName
    if (scheduledAt !== undefined) {
      updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null
      updates.status = scheduledAt ? 'scheduled' : 'draft'
    }

    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(eq(campaigns.id, id))
      .returning()

    res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Campaign update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update campaign' })
  }
})

// DELETE /api/campaigns/:id?projectId=
router.delete('/:id', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string

    const [existing] = await db
      .select({ status: campaigns.status, projectId: campaigns.projectId })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)

    if (!existing || existing.projectId !== req.projectId) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    if (existing.status === 'sending') {
      return res.status(400).json({ success: false, error: 'Cannot delete a campaign that is currently sending' })
    }

    await db.delete(campaigns).where(eq(campaigns.id, id))
    res.json({ success: true, data: { message: 'Campaign deleted' } })
  } catch (err) {
    console.error('Campaign delete error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete campaign' })
  }
})

// POST /api/campaigns/:id/send?projectId=
router.post('/:id/send', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string
    const totalRecipients = await dispatchCampaign(id)
    res.json({ success: true, data: { message: `Campaign dispatched to ${totalRecipients} recipients`, totalRecipients } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to dispatch campaign'
    console.error('Campaign send error:', err)
    res.status(400).json({ success: false, error: msg })
  }
})

// GET /api/campaigns/:id/sends?projectId=
router.get('/:id/sends', requireProjectId, async (req, res) => {
  try {
    const id = req.params.id as string

    const [campaign] = await db
      .select({ projectId: campaigns.projectId })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)

    if (!campaign || campaign.projectId !== req.projectId) {
      return res.status(404).json({ success: false, error: 'Campaign not found' })
    }

    const sends = await db
      .select()
      .from(campaignSends)
      .where(eq(campaignSends.campaignId, id))
      .orderBy(desc(campaignSends.createdAt))
      .limit(500)

    res.json({ success: true, data: sends })
  } catch (err) {
    console.error('Campaign sends error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch campaign sends' })
  }
})

export default router
