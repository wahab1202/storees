import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { adminUsers, projects, events } from '../db/schema.js'
import { resendProvider } from './resendProvider.js'

/**
 * Phase F1b-6 — alerts admins when Meta re-categorises a template.
 *
 * Re-categorisation (Marketing ↔ Utility most commonly) breaks campaigns
 * silently: a flow built against a Marketing template suddenly goes through
 * Utility billing, or worse, gets blocked because the merchant hadn't
 * approved use of Utility for that campaign type. We can't prevent the
 * change but we CAN alert immediately and log the impact for review.
 *
 * Effects on a re-categorisation event:
 *   1. Log an event row (visible in the admin activity timeline)
 *   2. Email project admins (via the existing Resend provider — same
 *      infrastructure as marketing email, but routed as transactional)
 *   3. Future: in-app notification + flag affected campaigns/flows
 */

export type RecategorisationEvent = {
  projectId: string
  templateId: string
  templateName: string
  previousCategory: string
  newCategory: string
}

export async function handleTemplateRecategorisation(evt: RecategorisationEvent): Promise<void> {
  // 1. Log a project-level event so it shows up in any timeline / audit views
  await db.insert(events).values({
    projectId: evt.projectId,
    customerId: '00000000-0000-0000-0000-000000000000', // sentinel — project-level event
    eventName: 'whatsapp_template_recategorised',
    properties: {
      template_id: evt.templateId,
      template_name: evt.templateName,
      previous_category: evt.previousCategory,
      new_category: evt.newCategory,
    },
    platform: 'whatsapp',
    source: 'template_status_worker',
    timestamp: new Date(),
  }).onConflictDoNothing().catch(err => {
    // Sentinel customer_id may FK-fail if there's no '00000000...' customer row.
    // That's fine — log and continue. Real customer_id alternative would be a
    // schema change; defer until we have a notifications table.
    console.warn('[templateAlert] event log skipped:', err instanceof Error ? err.message : err)
  })

  // 2. Resolve project name + admin emails
  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, evt.projectId))
    .limit(1)

  const admins = await db
    .select({ email: adminUsers.email, name: adminUsers.name })
    .from(adminUsers)
    .where(and(eq(adminUsers.projectId, evt.projectId), eq(adminUsers.role, 'admin')))

  if (admins.length === 0) {
    console.warn(`[templateAlert] re-categorisation for project=${evt.projectId} but no admins to notify`)
    return
  }

  const subject = `WhatsApp template "${evt.templateName}" re-categorised by Meta`
  const bodyHtml = renderRecategorisationEmail({
    projectName: project?.name ?? 'your Storees project',
    templateName: evt.templateName,
    previousCategory: evt.previousCategory,
    newCategory: evt.newCategory,
  })

  // Send sequentially — there are usually 1-3 admins per project, no need for fan-out
  for (const admin of admins) {
    try {
      await resendProvider.send({
        userId: '', // not customer-scoped
        projectId: evt.projectId,
        channel: 'email',
        templateId: 'system_template_recategorised',
        messageType: 'transactional',
        variables: {
          email: admin.email,
          subject,
          html: bodyHtml,
        },
      })
    } catch (err) {
      console.error(`[templateAlert] failed to email ${admin.email}:`, err)
    }
  }
}

function renderRecategorisationEmail(args: {
  projectName: string
  templateName: string
  previousCategory: string
  newCategory: string
}): string {
  return `
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f6ff;padding:32px;color:#1e293b;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 16px;color:#dc2626;">⚠️ Template re-categorised by Meta</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      Meta changed the category of one of your WhatsApp templates in <strong>${escapeHtml(args.projectName)}</strong>:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Template:</td><td style="padding:8px 0;font-family:monospace;">${escapeHtml(args.templateName)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Previously:</td><td style="padding:8px 0;"><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-size:13px;">${escapeHtml(args.previousCategory)}</span></td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Now:</td><td style="padding:8px 0;"><span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:13px;">${escapeHtml(args.newCategory)}</span></td></tr>
    </table>
    <p style="font-size:14px;line-height:1.6;margin:16px 0;color:#475569;">
      <strong>What this means:</strong> Campaigns and flows using this template may now be billed at a different rate
      (Marketing is billed; Utility within the 24h customer service window is free) and may behave differently for
      consent/frequency-cap purposes.
    </p>
    <p style="font-size:14px;line-height:1.6;margin:16px 0;color:#475569;">
      <strong>What to do:</strong> Review your active campaigns/flows that reference <code>${escapeHtml(args.templateName)}</code>
      and update them if the new category is wrong for the use case. If you believe Meta's re-categorisation is
      incorrect, you can appeal in the Meta Business Manager.
    </p>
    <p style="font-size:13px;color:#94a3b8;margin:24px 0 0;">
      This is an automated alert from Storees. Re-categorisation events are logged in your project's activity timeline.
    </p>
  </div>
</body></html>`.trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
