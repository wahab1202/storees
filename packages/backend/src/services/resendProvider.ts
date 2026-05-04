import { Resend } from 'resend'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import type { SendCommand } from '@storees/shared'

let resend: Resend | null = null

function getResend(): Resend {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — emails will not be sent')
    }
    resend = new Resend(process.env.RESEND_API_KEY ?? '')
  }
  return resend
}

const SHARED_FROM_EMAIL = process.env.FROM_EMAIL ?? 'Storees <noreply@storees.app>'

type FromInfo = {
  from: string
  /** True when the project has its own verified Resend domain. False = sending from shared pool. */
  verified: boolean
}

/**
 * Resolve the from-line for a given project.
 *
 * Verified per-tenant domain:  "Tenant Brand <noreply@mail.tenantbrand.com>"
 * Unverified / not registered: shared SHARED_FROM_EMAIL (rate-capped by E3.1)
 *
 * Cached per-process per-project for the duration of a campaign batch — the
 * project row is read for every send today, which is cheap but redundant.
 * Trade simplicity for the negligible perf cost; revisit if it shows up in
 * a flame graph.
 */
async function resolveFrom(projectId: string): Promise<FromInfo> {
  const [project] = await db
    .select({
      emailFromAddress: projects.emailFromAddress,
      emailFromName: projects.emailFromName,
      emailDomainVerifiedAt: projects.emailDomainVerifiedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  const verified = !!project?.emailDomainVerifiedAt && !!project.emailFromAddress

  if (verified) {
    const name = project!.emailFromName ?? 'Storees'
    return { from: `${name} <${project!.emailFromAddress}>`, verified: true }
  }

  return { from: SHARED_FROM_EMAIL, verified: false }
}

export const resendProvider = {
  name: 'resend' as const,

  async send(command: SendCommand): Promise<{ messageId: string; status: string; error?: string }> {
    if (command.channel !== 'email') {
      return { messageId: '', status: 'failed', error: `Resend only supports email, got ${command.channel}` }
    }

    const to = command.variables.email ?? command.variables.to
    if (!to) {
      return { messageId: '', status: 'failed', error: 'No email address in variables' }
    }

    const subject = command.variables.subject ?? 'Message from Storees'
    const html = command.variables.html ?? command.variables.body ?? ''

    let fromInfo: FromInfo
    try {
      fromInfo = await resolveFrom(command.projectId)
    } catch (err) {
      return { messageId: '', status: 'failed', error: `Failed to resolve from-address: ${(err as Error).message}` }
    }

    try {
      const { data, error } = await getResend().emails.send({
        from: fromInfo.from,
        to,
        subject,
        html,
        // Tag with the project so the Resend dashboard makes multi-tenant analytics
        // legible. Resend supports tags at send-time.
        tags: [
          { name: 'project_id', value: command.projectId },
          { name: 'verified_domain', value: String(fromInfo.verified) },
          ...(command.campaignId ? [{ name: 'campaign_id', value: command.campaignId }] : []),
        ],
      })

      if (error) {
        return { messageId: '', status: 'failed', error: error.message }
      }

      return { messageId: data?.id ?? '', status: 'sent' }
    } catch (err) {
      return { messageId: '', status: 'failed', error: (err as Error).message }
    }
  },
}
