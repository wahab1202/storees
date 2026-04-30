import { Router } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { whatsappTemplates } from '../db/schema.js'
import { requireProjectId } from '../middleware/projectId.js'
import { getChannelProvider, getProviderCapabilities } from '../services/channelProviderRegistry.js'

const router = Router()

/**
 * GET /api/whatsapp/templates?projectId=...
 * Lists all synced WhatsApp templates for the project.
 */
router.get('/templates', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!
    const rows = await db
      .select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.projectId, projectId))
      .orderBy(desc(whatsappTemplates.syncedAt))
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('GET /whatsapp/templates error:', err)
    res.status(500).json({ success: false, error: 'Failed to load templates' })
  }
})

/**
 * POST /api/whatsapp/sync-templates?projectId=...
 * Triggers a template sync from the project's configured WhatsApp provider.
 * Upserts each template into whatsapp_templates (unique on project_id+provider+name+language).
 */
router.post('/sync-templates', requireProjectId, async (req, res) => {
  try {
    const projectId = req.projectId!

    const channelResult = await getChannelProvider(projectId, 'whatsapp')
    if (!channelResult) {
      return res.status(400).json({ success: false, error: 'No WhatsApp provider configured for this project' })
    }
    const { provider, config } = channelResult
    const caps = getProviderCapabilities(provider)
    if (!caps.syncTemplates || !provider.syncTemplates) {
      return res.status(400).json({ success: false, error: `Provider '${provider.name}' does not support template sync` })
    }

    const templates = await provider.syncTemplates(config)

    let upserted = 0
    for (const t of templates) {
      await db.insert(whatsappTemplates).values({
        projectId,
        provider: provider.name,
        providerTemplateId: t.providerTemplateId,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        bodyText: t.bodyText,
        header: t.header as object | null,
        footer: t.footer,
        buttons: t.buttons as object | null,
        parameterCount: t.parameterCount,
        rawPayload: t.rawPayload as object | null,
      }).onConflictDoUpdate({
        target: [whatsappTemplates.projectId, whatsappTemplates.provider, whatsappTemplates.name, whatsappTemplates.language],
        set: {
          providerTemplateId: t.providerTemplateId,
          category: t.category,
          status: t.status,
          bodyText: t.bodyText,
          header: t.header as object | null,
          footer: t.footer,
          buttons: t.buttons as object | null,
          parameterCount: t.parameterCount,
          rawPayload: t.rawPayload as object | null,
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      upserted++
    }

    res.json({ success: true, data: { provider: provider.name, count: upserted } })
  } catch (err) {
    console.error('POST /whatsapp/sync-templates error:', err)
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Sync failed' })
  }
})

export default router
