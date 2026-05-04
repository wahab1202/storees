import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { whatsappTemplates } from '../db/schema.js'
import { handleTemplateRecategorisation } from './templateAlertService.js'

/**
 * Phase F1b-5 — handle Meta's `message_template_status_update` webhook event.
 *
 * Maps Meta's `event` strings into our internal status + handles
 * re-categorisation alerts. Idempotent: re-processing the same event
 * is a no-op because the row's current state already reflects it.
 */

type MetaTemplateStatusEvent = {
  event?: string
  message_template_id?: string | number
  message_template_name?: string
  message_template_language?: string
  reason?: string
  previous_category?: string
  new_category?: string
}

// Meta uses event strings like APPROVED, REJECTED, FLAGGED, PAUSED,
// CATEGORY_UPDATE, IN_APPEAL, DISABLED — we map most of these to our
// status enum directly. CATEGORY_UPDATE doesn't change status.
const EVENT_STATUS_MAP: Record<string, string> = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  FLAGGED: 'FLAGGED',
  PAUSED: 'PAUSED',
  IN_APPEAL: 'IN_APPEAL',
  DISABLED: 'DISABLED',
}

export async function handleMetaTemplateStatusEvent(
  projectId: string,
  evt: MetaTemplateStatusEvent,
): Promise<void> {
  const name = evt.message_template_name
  const language = evt.message_template_language
  if (!name || !language) {
    console.warn('[templateStatus] webhook missing template name/language:', evt)
    return
  }

  const [tmpl] = await db
    .select()
    .from(whatsappTemplates)
    .where(and(
      eq(whatsappTemplates.projectId, projectId),
      eq(whatsappTemplates.provider, 'meta'),
      eq(whatsappTemplates.name, name),
      eq(whatsappTemplates.language, language),
    ))
    .limit(1)

  if (!tmpl) {
    // Webhook arrived before the row exists (rare — could happen if a merchant
    // submitted via Meta Business Manager directly without using our API).
    // Log and rely on the next syncTemplates run to backfill.
    console.warn(`[templateStatus] webhook for unknown template name="${name}" lang=${language} project=${projectId}`)
    return
  }

  const newEvent = (evt.event ?? '').toUpperCase()
  const newStatus = EVENT_STATUS_MAP[newEvent]

  // Detect category change — either explicit (CATEGORY_UPDATE event with prev/new)
  // or implicit (any event that carries new_category). Meta's payloads vary.
  const hasCategoryChange =
    !!evt.new_category && !!evt.previous_category && evt.new_category !== evt.previous_category

  const updates: Partial<typeof whatsappTemplates.$inferInsert> = {
    lastStatusCheckAt: new Date(),
    updatedAt: new Date(),
  }
  if (newStatus) updates.status = newStatus
  if (evt.reason) updates.rejectionReason = evt.reason
  if (hasCategoryChange) {
    updates.previousCategory = evt.previous_category
    updates.category = evt.new_category
  }

  await db.update(whatsappTemplates).set(updates).where(eq(whatsappTemplates.id, tmpl.id))

  if (hasCategoryChange) {
    handleTemplateRecategorisation({
      projectId,
      templateId: tmpl.id,
      templateName: tmpl.name,
      previousCategory: evt.previous_category!,
      newCategory: evt.new_category!,
    }).catch(err => console.error('[templateStatus] alert failed:', err))
  }
}
