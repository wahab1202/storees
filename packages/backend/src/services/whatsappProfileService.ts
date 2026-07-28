import { getChannelProvider } from './channelProviderRegistry.js'
import { decrypt } from './encryption.js'

const GRAPH_BASE = 'https://graph.facebook.com/v23.0'

/**
 * WhatsApp Business profile management — the brand's public identity on their
 * number (photo, about, address, website, description). The display NAME is the
 * Meta-approved verified name (set at registration, changes need re-approval),
 * so it is read-only here and returned separately.
 *
 * Only works when the project's WhatsApp provider is Meta Cloud API (direct or
 * Storees-provisioned) — a BSP-relayed provider manages its own profile.
 */

export type WhatsappBusinessProfile = {
  about: string | null
  address: string | null
  description: string | null
  email: string | null
  websites: string[]
  vertical: string | null
  profilePictureUrl: string | null
}

export type WhatsappProfileView = WhatsappBusinessProfile & {
  /** Meta-approved verified business name (read-only). */
  verifiedName: string | null
  displayNumber: string | null
}

type MetaCtx = { phoneNumberId: string; token: string; appId: string | null }

/** Resolve the project's Meta WhatsApp context (decrypted token). */
async function metaContext(projectId: string): Promise<MetaCtx> {
  const resolved = await getChannelProvider(projectId, 'whatsapp')
  if (!resolved || resolved.provider.name !== 'meta') {
    throw new Error('Profile management requires a connected Meta WhatsApp account')
  }
  const { config } = resolved
  const phoneNumberId = config.phoneNumberId
  if (!phoneNumberId) throw new Error('No WhatsApp number configured')
  return {
    phoneNumberId,
    token: decrypt(config.accessToken ?? ''),
    appId: config.appId || process.env.META_APP_ID || process.env.WHATSAPP_APP_ID || null,
  }
}

async function graph<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } })
  const data = await resp.json() as T & { error?: { message: string } }
  if (!resp.ok) throw new Error((data as { error?: { message: string } }).error?.message ?? `Meta HTTP ${resp.status}`)
  return data
}

export async function getBusinessProfile(projectId: string): Promise<WhatsappProfileView> {
  const { phoneNumberId, token } = await metaContext(projectId)

  const profileResp = await graph<{ data?: Array<Record<string, unknown>> }>(
    `${GRAPH_BASE}/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
    token,
  )
  const p = profileResp.data?.[0] ?? {}

  const numberResp = await graph<{ verified_name?: string; display_phone_number?: string }>(
    `${GRAPH_BASE}/${phoneNumberId}?fields=verified_name,display_phone_number`,
    token,
  ).catch(() => ({} as { verified_name?: string; display_phone_number?: string }))

  return {
    about: (p.about as string) ?? null,
    address: (p.address as string) ?? null,
    description: (p.description as string) ?? null,
    email: (p.email as string) ?? null,
    websites: (p.websites as string[]) ?? [],
    vertical: (p.vertical as string) ?? null,
    profilePictureUrl: (p.profile_picture_url as string) ?? null,
    verifiedName: numberResp.verified_name ?? null,
    displayNumber: numberResp.display_phone_number ?? null,
  }
}

export type BusinessProfilePatch = Partial<Pick<WhatsappBusinessProfile, 'about' | 'address' | 'description' | 'email' | 'websites' | 'vertical'>>

export async function updateBusinessProfile(projectId: string, patch: BusinessProfilePatch): Promise<void> {
  const { phoneNumberId, token } = await metaContext(projectId)
  const body: Record<string, unknown> = { messaging_product: 'whatsapp' }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) body[k] = v
  }
  await graph(`${GRAPH_BASE}/${phoneNumberId}/whatsapp_business_profile`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Set the profile photo (the "brand image") from a public image URL via Meta's
 * resumable upload: fetch the bytes → open an upload session on the app → upload
 * → set the returned handle on the business profile. Needs the Meta app id
 * (config.appId or META_APP_ID env).
 */
export async function setProfilePhotoFromUrl(projectId: string, imageUrl: string): Promise<void> {
  const { phoneNumberId, token, appId } = await metaContext(projectId)
  if (!appId) throw new Error('Profile photo upload needs a Meta app id — set META_APP_ID (or config.appId)')

  // 1. Fetch the image bytes.
  const imgResp = await fetch(imageUrl)
  if (!imgResp.ok) throw new Error(`Could not fetch the image (HTTP ${imgResp.status})`)
  const contentType = imgResp.headers.get('content-type') ?? 'image/jpeg'
  const bytes = Buffer.from(await imgResp.arrayBuffer())

  // 2. Open a resumable upload session.
  const session = await graph<{ id: string }>(
    `${GRAPH_BASE}/${appId}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(contentType)}`,
    token,
    { method: 'POST' },
  )

  // 3. Upload the bytes — this endpoint uses the OAuth scheme + file_offset.
  const uploadResp = await fetch(`${GRAPH_BASE}/${session.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_offset: '0', 'Content-Type': contentType },
    body: bytes,
  })
  const uploaded = await uploadResp.json() as { h?: string; error?: { message: string } }
  if (!uploadResp.ok || !uploaded.h) throw new Error(uploaded.error?.message ?? 'Image upload failed')

  // 4. Set the handle on the business profile.
  await graph(`${GRAPH_BASE}/${phoneNumberId}/whatsapp_business_profile`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', profile_picture_handle: uploaded.h }),
  })
}
