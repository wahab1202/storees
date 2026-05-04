import { Resend } from 'resend'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'

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

/** Register a new sending domain with Resend and persist the resend_domain_id on the project. */
export async function registerDomain(
  projectId: string,
  domain: string,
  fromName: string,
): Promise<DomainStatusResult> {
  // Validate the domain shape early — Resend's error message is opaque
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
    throw new Error(`Invalid domain format: ${domain}`)
  }

  const [project] = await db
    .select({ id: projects.id, resendDomainId: projects.resendDomainId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!project) {
    throw new Error('Project not found')
  }

  const fromAddress = `noreply@${domain}`

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
      emailFromAddress: fromAddress,
      emailFromName: fromName,
      emailDomainVerifiedAt: null, // freshly registered — not yet verified
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))

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
      emailFromAddress: projects.emailFromAddress,
      emailDomainVerifiedAt: projects.emailDomainVerifiedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!project) {
    throw new Error('Project not found')
  }

  if (!project.resendDomainId) {
    throw new Error('No domain registered for this project — call registerDomain first')
  }

  const resp = await getResend().domains.get(project.resendDomainId)
  if (resp.error || !resp.data) {
    throw new Error(`Resend domain lookup failed: ${resp.error?.message ?? 'unknown error'}`)
  }

  const data = resp.data as { id: string; name: string; status: string; records?: DnsRecord[] }
  const verified = data.status === 'verified'

  // Stamp verified-at the first time we see it verified; clear it if Resend reports otherwise
  // so a previously-verified-then-broken domain stops being treated as verified.
  if (verified && !project.emailDomainVerifiedAt) {
    await db
      .update(projects)
      .set({ emailDomainVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, projectId))
  } else if (!verified && project.emailDomainVerifiedAt) {
    await db
      .update(projects)
      .set({ emailDomainVerifiedAt: null, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
  }

  return {
    domainId: data.id,
    domain: data.name,
    status: data.status,
    records: data.records ?? [],
    verified,
  }
}
