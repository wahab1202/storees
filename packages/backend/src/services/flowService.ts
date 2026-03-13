import { eq } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { flows, emailTemplates, projects } from '../db/schema.js'
import { FLOW_TEMPLATE_DEFINITIONS } from '@storees/flows'
import type { DomainType } from '@storees/shared'

const abandonedCartEmailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Order</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b; padding:32px 40px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:700; letter-spacing:-0.5px;">{{shop_name}}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px; color:#18181b; font-size:22px; font-weight:600;">Hi {{customer_name}},</h2>
              <p style="margin:0 0 12px; color:#3f3f46; font-size:16px; line-height:1.6;">
                We noticed you left some items in your cart. No worries — we've saved everything for you.
              </p>
              <p style="margin:0 0 28px; color:#3f3f46; font-size:16px; line-height:1.6;">
                Complete your purchase before your items sell out!
              </p>
              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:8px; background-color:#D9A441;">
                    <a href="{{checkout_url}}" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; border-radius:8px;">
                      Complete Your Order &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none; border-top:1px solid #e4e4e7; margin:0;">
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;">
              <p style="margin:0 0 8px; color:#a1a1aa; font-size:13px; line-height:1.5; text-align:center;">
                If you've already completed your purchase, please disregard this email.
              </p>
              <p style="margin:0; color:#a1a1aa; font-size:13px; line-height:1.5; text-align:center;">
                Questions? Just reply to this email — we're happy to help.
              </p>
            </td>
          </tr>
        </table>
        <!-- Unsubscribe -->
        <p style="margin:24px 0 0; color:#a1a1aa; font-size:12px; text-align:center;">
          You're receiving this because you started a checkout at {{shop_name}}.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`

/**
 * Create default flows and their email templates for a new project.
 * Filters templates by the project's domain type.
 * Idempotent — skips if flows already exist for the project.
 */
export async function instantiateDefaultFlows(projectId: string, domainType?: DomainType): Promise<void> {
  const existing = await db
    .select({ id: flows.id })
    .from(flows)
    .where(eq(flows.projectId, projectId))
    .limit(1)

  if (existing.length > 0) return

  // If domainType not passed, look it up
  let domain = domainType
  if (!domain) {
    const [project] = await db
      .select({ domainType: projects.domainType })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    domain = (project?.domainType as DomainType) ?? 'ecommerce'
  }

  // Filter templates for this domain
  const templates = FLOW_TEMPLATE_DEFINITIONS.filter(t => t.domainTypes.includes(domain!))

  for (const template of templates) {
    // Create email template
    const subject = getTemplateSubject(template.slug)
    await db.insert(emailTemplates).values({
      projectId,
      name: template.emailTemplateId,
      subject,
      htmlBody: getTemplateHtml(template.slug),
    }).onConflictDoNothing()

    // Create flow (starts as draft — must be manually activated)
    await db.insert(flows).values({
      projectId,
      name: template.name,
      description: template.description,
      triggerConfig: template.triggerConfig,
      exitConfig: template.exitConfig,
      nodes: template.nodes,
      status: 'draft',
    })
  }

  console.log(`Created ${templates.length} default flows (${domain}) for project ${projectId}`)
}

function getTemplateSubject(slug: string): string {
  switch (slug) {
    case 'abandoned_cart': return 'You left something behind!'
    case 'emi_overdue_reminder': return 'Your EMI payment is overdue'
    case 'kyc_reverification': return 'Action required: Re-verify your KYC'
    case 'dormant_reactivation': return 'We miss you! Come back and transact'
    case 'trial_expiry': return 'Your trial is ending soon'
    default: return 'Important update from {{app_name}}'
  }
}

function getTemplateHtml(slug: string): string {
  // Ecommerce template already exists as the default
  if (slug === 'abandoned_cart') return abandonedCartEmailHtml

  // Generic template for all other flows
  return genericEmailTemplate
}

const genericEmailTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#0F1D40; padding:32px 40px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:700;">{{app_name}}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px; color:#18181b; font-size:22px; font-weight:600;">Hi {{customer_name}},</h2>
              <p style="margin:0 0 28px; color:#3f3f46; font-size:16px; line-height:1.6;">
                {{message_body}}
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:8px; background-color:#D9A441;">
                    <a href="{{action_url}}" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; border-radius:8px;">
                      {{action_label}}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px;">
              <p style="margin:0; color:#a1a1aa; font-size:13px; line-height:1.5; text-align:center;">
                Questions? Just reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
