import { eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { projects } from '../db/schema.js'
import { encrypt } from './encryption.js'
import { clearProjectChannelProviderCache } from './channelProviderRegistry.js'
import { syncWhatsappTemplatesForProject } from './whatsappTemplateSyncService.js'

const GRAPH_BASE = 'https://graph.facebook.com/v23.0'

export type MetaWaCreds = { phoneNumberId: string; wabaId: string; accessToken: string }

export type MetaLinkResult = {
  provider: 'meta'
  number: {
    phoneNumberId: string
    wabaId: string
    waNumber: string | null
    verifiedName: string | null
    qualityRating: string | null
  }
  webhookRegistered: boolean
  templatesImported: number
}

/**
 * Link a Meta Cloud API WhatsApp account to a project: validate the token
 * against the number, subscribe our app to the WABA so status/inbound webhooks
 * flow, encrypt the token into `settings.channels.whatsapp`, and import existing
 * templates. The single chokepoint shared by the BYO connect-meta route AND the
 * Storees-provisioning admin queue — so both paths behave identically.
 *
 * `401/190` (bad/expired token) surfaces as an error, never a blind retry.
 */
export async function linkMetaWhatsappAccount(
  projectId: string,
  creds: MetaWaCreds,
): Promise<{ ok: true; data: MetaLinkResult } | { ok: false; error: string }> {
  const pnid = String(creds.phoneNumberId ?? '').trim()
  const waba = String(creds.wabaId ?? '').trim()
  const token = String(creds.accessToken ?? '').trim()
  if (!pnid || !waba || !token) {
    return { ok: false, error: 'phoneNumberId, wabaId and accessToken are all required' }
  }

  // 1. Validate credentials against the number itself.
  let numberInfo: { verified_name?: string; display_phone_number?: string; quality_rating?: string; code_verification_status?: string }
  try {
    const resp = await fetch(
      `${GRAPH_BASE}/${pnid}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const data = await resp.json() as typeof numberInfo & { error?: { message: string; code?: number } }
    if (!resp.ok) {
      return { ok: false, error: data.error?.message ?? `Meta rejected the credentials (HTTP ${resp.status})` }
    }
    numberInfo = data
  } catch (err) {
    console.warn('[whatsapp/link-meta] number validation failed:', (err as Error).message)
    return { ok: false, error: 'Could not reach Meta to validate the credentials' }
  }

  // 2. Build config. Token encrypted; ids + verified name plaintext.
  const waConfig: Record<string, string> = {
    accessToken: encrypt(token),
    phoneNumberId: pnid,
    wabaId: waba,
  }
  if (numberInfo.display_phone_number) waConfig.waNumber = numberInfo.display_phone_number
  if (numberInfo.verified_name) waConfig.verifiedName = numberInfo.verified_name

  // 3. Subscribe our app to the WABA for status + inbound webhooks (non-fatal).
  let webhookRegistered = false
  try {
    const sub = await fetch(`${GRAPH_BASE}/${waba}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const subData = await sub.json() as { success?: boolean; error?: { message: string } }
    webhookRegistered = sub.ok && subData.success !== false
    if (webhookRegistered) waConfig.webhookRegisteredAt = new Date().toISOString()
    else console.warn('[whatsapp/link-meta] subscribed_apps failed:', subData.error?.message)
  } catch (err) {
    console.warn('[whatsapp/link-meta] subscribed_apps error:', (err as Error).message)
  }

  // 4. Persist channel config, preserving other channels.
  const [project] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, projectId)).limit(1)
  const settings = (project?.settings ?? {}) as Record<string, unknown>
  const existingChannels = (settings.channels ?? {}) as Record<string, unknown>
  const mergedChannels = { ...existingChannels, whatsapp: { provider: 'meta', config: waConfig } }
  await db.execute(sql`
    UPDATE projects SET
      settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{channels}', ${JSON.stringify(mergedChannels)}::jsonb),
      updated_at = NOW()
    WHERE id = ${projectId}
  `)
  clearProjectChannelProviderCache(projectId)

  // 5. Import existing templates (non-fatal).
  let templatesImported = 0
  try {
    const syncResult = await syncWhatsappTemplatesForProject(projectId)
    templatesImported = syncResult.count
  } catch (err) {
    console.warn('[whatsapp/link-meta] template import failed:', (err as Error).message)
  }

  return {
    ok: true,
    data: {
      provider: 'meta',
      number: {
        phoneNumberId: pnid,
        wabaId: waba,
        waNumber: numberInfo.display_phone_number ?? null,
        verifiedName: numberInfo.verified_name ?? null,
        qualityRating: numberInfo.quality_rating ?? null,
      },
      webhookRegistered,
      templatesImported,
    },
  }
}
