import { Worker } from 'bullmq'
import { eq, and, or, isNull, lte, sql } from 'drizzle-orm'
import { redisConnection } from '../services/redis.js'
import { db } from '../db/connection.js'
import { projects, whatsappTemplates } from '../db/schema.js'
import { getChannelProvider } from '../services/channelProviderRegistry.js'
import { templateStatusQueue } from '../services/queue.js'
import { handleTemplateRecategorisation } from '../services/templateAlertService.js'
import { syncWhatsappTemplatesForProject } from '../services/whatsappTemplateSyncService.js'

/**
 * Phase F1b-4 — periodic poller for WhatsApp template approval status.
 *
 * Why poll instead of relying purely on webhooks: Meta's
 * `message_template_status_update` webhook is real but optional, requires
 * separate setup, and historically Meta has been inconsistent about firing
 * it for all status transitions (especially category changes that aren't
 * approval-related). We treat the webhook as authoritative when it arrives
 * (cheaper) and poll as a backstop.
 *
 * Targets: rows where status IN ('PENDING', 'IN_APPEAL') OR last_status_check_at
 * older than 7 days (catches re-categorisations of long-approved templates).
 *
 * Schedule: every 4h via BullMQ repeatable. One job per project.
 */

const WORKER_NAME = 'template-status'
const POLL_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4h
const SYNC_INTERVAL_MS = 60 * 60 * 1000 // 1h
const REVERIFY_AFTER_MS = 7 * 24 * 60 * 60 * 1000 // 7d

export function startTemplateStatusWorker(): Worker {
  const worker = new Worker(
    WORKER_NAME,
    async (job) => {
      if (job.name === 'sync') {
        const projectRows = await db.select({ id: projects.id }).from(projects)
        let syncedProjects = 0
        let syncedTemplates = 0
        for (const project of projectRows) {
          try {
            const result = await syncWhatsappTemplatesForProject(project.id)
            syncedProjects++
            syncedTemplates += result.count
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!msg.includes('No WhatsApp provider configured')) {
              console.error(`[templateStatus] template sync failed for project ${project.id}:`, err)
            }
          }
        }
        return { mode: 'sync', syncedProjects, syncedTemplates }
      }

      const reverifyCutoff = new Date(Date.now() - REVERIFY_AFTER_MS)
      const rows = await db
        .select()
        .from(whatsappTemplates)
        .where(or(
          // Pending or appealing — must check
          sql`${whatsappTemplates.status} IN ('PENDING', 'IN_APPEAL')`,
          // Or approved but not checked recently — catches re-categorisation
          and(
            eq(whatsappTemplates.status, 'APPROVED'),
            or(isNull(whatsappTemplates.lastStatusCheckAt), lte(whatsappTemplates.lastStatusCheckAt, reverifyCutoff)),
          ),
        ))
        .limit(500) // bound the work — if more, next tick handles them

      let polled = 0
      let changed = 0
      let recategorised = 0

      for (const tmpl of rows) {
        try {
          const channelResult = await getChannelProvider(tmpl.projectId, 'whatsapp')
          if (!channelResult || !channelResult.provider.getTemplateStatus) continue

          const status = await channelResult.provider.getTemplateStatus(tmpl.providerTemplateId, channelResult.config)
          const newCategory = status.category ?? tmpl.category
          const categoryChanged = !!tmpl.category && !!newCategory && tmpl.category !== newCategory
          const statusChanged = status.status !== tmpl.status

          if (statusChanged || categoryChanged || status.rejectionReason !== tmpl.rejectionReason) {
            await db.update(whatsappTemplates).set({
              status: status.status,
              category: newCategory,
              previousCategory: categoryChanged ? tmpl.category : tmpl.previousCategory,
              rejectionReason: status.rejectionReason ?? null,
              lastStatusCheckAt: new Date(),
              updatedAt: new Date(),
            }).where(eq(whatsappTemplates.id, tmpl.id))
            changed++

            if (categoryChanged) {
              recategorised++
              // Don't await — alert path can run in background, shouldn't gate the poll
              handleTemplateRecategorisation({
                projectId: tmpl.projectId,
                templateId: tmpl.id,
                templateName: tmpl.name,
                previousCategory: tmpl.category!,
                newCategory,
              }).catch(err => console.error('[templateStatus] alert failed:', err))
            }
          } else {
            // No change but stamp the check time
            await db.update(whatsappTemplates)
              .set({ lastStatusCheckAt: new Date() })
              .where(eq(whatsappTemplates.id, tmpl.id))
          }
          polled++
        } catch (err) {
          console.error(`[templateStatus] poll failed for template ${tmpl.id}:`, err)
        }
      }

      return { mode: 'poll', polled, changed, recategorised }
    },
    { connection: redisConnection, concurrency: 1 },
  )

  worker.on('completed', (job, result) => {
    const typed = result as { mode?: string; polled?: number; syncedTemplates?: number }
    if ((typed.polled ?? 0) > 0 || (typed.syncedTemplates ?? 0) > 0) {
      console.log(`[templateStatus] job ${job.id} completed:`, result)
    }
  })
  worker.on('failed', (job, err) => {
    console.error(`[templateStatus] job ${job?.id} failed:`, err.message)
  })

  // Schedule the repeatable. BullMQ keeps a single repeat key alive even if we
  // re-add it on every boot — addJobScheduler is idempotent.
  templateStatusQueue.upsertJobScheduler(
    'poll-template-status',
    { every: POLL_INTERVAL_MS },
    {
      name: 'poll',
      data: {},
      opts: { removeOnComplete: true, removeOnFail: { count: 5 } },
    },
  ).catch(err => console.error('[templateStatus] failed to schedule:', err))
  templateStatusQueue.upsertJobScheduler(
    'sync-whatsapp-templates',
    { every: SYNC_INTERVAL_MS },
    {
      name: 'sync',
      data: {},
      opts: { removeOnComplete: true, removeOnFail: { count: 5 } },
    },
  ).catch(err => console.error('[templateStatus] failed to schedule sync:', err))

  console.log('[templateStatus] worker started, polling every', POLL_INTERVAL_MS / 1000 / 60, 'min, syncing every', SYNC_INTERVAL_MS / 1000 / 60, 'min')
  return worker
}
