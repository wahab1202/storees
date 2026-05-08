import { Resend } from 'resend'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projectEmailSenders, projects } from '../db/schema.js'

/**
 * Per-tenant Resend sending domain management. Each project can register
 * a from-domain (e.g. mail.tenantbrand.com); DKIM/SPF reputation accumulates
 * against the tenant's own domain so one bad list never tanks deliverability
 * for the rest of the platform.
 *
 * Lifecycle:
 *   1. Tenant calls registerDomain(projectId, 'mail.tenantbrand.com')
 *      → we hit Resend domains.create, store the id + DNS records to display
 *   2. Tenant pastes the records into their DNS (Cloudflare/Route53)
 *   3. Tenant clicks "Check verification" → checkDomainStatus(projectId)
 *      → we hit Resend domains.get; on status='verified' we stamp
 *        email_domain_verified_at; resendProvider then uses this domain
 *
 * Until verified, sends fall back to the shared pool (rate-capped).
 */

let resendClient: Resend | null = null
function getResend(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured')
    }
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

export type DnsRecord = {
  type: string
  name: string
  value: string
  ttl?: number | string
  priority?: number
  status?: string
}

export type DomainStatusResult = {
  domainId: string
  domain: string
  status: string // 'not_started' | 'pending' | 'verified' | 'failed' | 'temporary_failure'
  records: DnsRecord[]
  verified: boolean
}

async function upsertDefaultSender(projectId: string, verifiedAt: Date | null = null) {
  const [project] = await db
    .select({
      id: projects.id,
      emailFromAddress: projects.emailFromAddress,
      emailFromName: projects.emailFromName,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!project?.emailFromAddress) return

  await db
    .insert(projectEmailSenders)
    .values({
      projectId,
      address: project.emailFromAddress,
      displayName: project.emailFromName,
      verifiedAt,
    })
    .onConflictDoUpdate({
      target: [projectEmailSenders.projectId, projectEmailSenders.address],
      set: {
        displayName: project.emailFromName,
        verifiedAt,
        updatedAt: new Date(),
      },
    })
}

/** Register a new sending domain with Resend and persist the resend_domain_id on the project.
 *  fromLocalPart is the inbox name (the part before @). We default to 'hello' rather than
 *  'noreply' because mailbox providers treat unrepliable senders as a small negative trust
 *  signal — noreply increases the chance recipients hit "Mark as spam" instead of replying.
 *  Resend's Insights tab flags `noreply` for the same reason.
 */
export async function registerDomain(
  projectId: string,
  domain: string,
  fromName: string,
  fromLocalPart: string = 'hello',
): Promise<DomainStatusResult> {
  // Validate the domain shape early — Resend's error message is opaque
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
    throw new Error(`Invalid domain format: ${domain}`)
  }

  // RFC 5322 local-part is more permissive but we accept the safe subset that
  // works everywhere: letters, digits, dots, hyphens, underscores, plus.
  const safeLocal = fromLocalPart.trim().toLowerCase()
  if (!/^[a-z0-9._+-]{1,64}$/.test(safeLocal)) {
    throw new Error(`Invalid local-part: "${fromLocalPart}". Use letters, digits, dots, hyphens, underscores, plus.`)
  }

  const [project] = await db
    .select({ id: projects.id, resendDomainId: projects.resendDomainId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!project) {
    throw new Error('Project not found')
  }

  const fromAddress = `${safeLocal}@${domain}`

  // If we already registered this project, return the existing domain status
  // rather than creating a duplicate (Resend returns an error on duplicate names).
  if (project.resendDomainId) {
    const existing = await checkDomainStatus(projectId)
    // Update the from-name if changed
    await db
      .update(projects)
      .set({ emailFromName: fromName, emailFromAddress: fromAddress, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
    return existing
  }

  const created = await getResend().domains.create({ name: domain })
  if (created.error || !created.data) {
    throw new Error(`Resend domain create failed: ${created.error?.message ?? 'unknown error'}`)
  }

  const { id: resendDomainId, records } = created.data as { id: string; records?: DnsRecord[] }

  await db
    .update(projects)
    .set({
      resendDomainId,
      emailDomainProvider: 'resend',
      emailDomainProviderId: resendDomainId,
      emailFromAddress: fromAddress,
      emailFromName: fromName,
      emailDomainVerifiedAt: null, // freshly registered — not yet verified
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
  await upsertDefaultSender(projectId, null)

  return {
    domainId: resendDomainId,
    domain,
    status: 'pending',
    records: records ?? [],
    verified: false,
  }
}

/** Hit Resend to refresh the verification status. On success, stamp email_domain_verified_at. */
export async function checkDomainStatus(projectId: string): Promise<DomainStatusResult> {
  const [project] = await db
    .select({
      id: projects.id,
      resendDomainId: projects.resendDomainId,
      emailDomainProviderId: projects.emailDomainProviderId,
      emailFromAddress: projects.emailFromAddress,
      emailDomainVerifiedAt: projects.emailDomainVerifiedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!project) {
    throw new Error('Project not found')
  }

  const domainProviderId = project.emailDomainProviderId ?? project.resendDomainId
  if (!domainProviderId) {
    throw new Error('No domain registered for this project — call registerDomain first')
  }

  const resp = await getResend().domains.get(domainProviderId)
  if (resp.error || !resp.data) {
    throw new Error(`Resend domain lookup failed: ${resp.error?.message ?? 'unknown error'}`)
  }

  const data = resp.data as { id: string; name: string; status: string; records?: DnsRecord[] }
  const verified = data.status === 'verified'

  // Stamp verified-at the first time we see it verified; clear it if Resend reports otherwise
  // so a previously-verified-then-broken domain stops being treated as verified.
  if (verified && !project.emailDomainVerifiedAt) {
    const verifiedAt = new Date()
    await db
      .update(projects)
      .set({ emailDomainVerifiedAt: verifiedAt, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
    await upsertDefaultSender(projectId, verifiedAt)
  } else if (!verified && project.emailDomainVerifiedAt) {
    await db
      .update(projects)
      .set({ emailDomainVerifiedAt: null, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
    await upsertDefaultSender(projectId, null)
  } else {
    await upsertDefaultSender(projectId, project.emailDomainVerifiedAt)
  }

  return {
    domainId: data.id,
    domain: data.name,
    status: data.status,
    records: data.records ?? [],
    verified,
  }
}
