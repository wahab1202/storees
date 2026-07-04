import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { whatsappTemplates } from '../db/schema.js'
import { getChannelProvider, getProviderCapabilities } from './channelProviderRegistry.js'

export async function syncWhatsappTemplatesForProject(projectId: string): Promise<{ provider: string; count: number }> {
  const channelResult = await getChannelProvider(projectId, 'whatsapp')
  if (!channelResult) {
    throw new Error('No WhatsApp provider configured for this project')
  }

  const { provider, config } = channelResult
  const caps = getProviderCapabilities(provider)
  if (!caps.syncTemplates || !provider.syncTemplates) {
    throw new Error(`Provider '${provider.name}' does not support template sync`)
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
      qualityScore: t.qualityScore ?? null,
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
        ...(t.qualityScore !== undefined ? { qualityScore: t.qualityScore } : {}),
        rawPayload: t.rawPayload as object | null,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    upserted++
  }

  return { provider: provider.name, count: upserted }
}
