import path from 'node:path'
import { mkdir, writeFile, unlink, readdir, stat, readFile, copyFile } from 'node:fs/promises'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

/**
 * Object storage for uploaded assets (email images, WhatsApp media, call
 * transcripts). Uses S3-compatible object storage when configured (AWS S3,
 * Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO), else falls back to
 * local disk — so dev and unconfigured deploys keep working exactly as before.
 *
 * WHY: on ephemeral container disks (e.g. Railway) local uploads are lost on
 * redeploy. Point S3_* at a bucket to make them durable.
 *
 * Env: S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (required to enable),
 * S3_REGION (default us-east-1), S3_ENDPOINT (for R2/B2/Spaces/MinIO — omit for
 * AWS), S3_PUBLIC_BASE_URL (CDN/public base; omit to derive), S3_KEY_PREFIX
 * (default 'assets').
 */

const BUCKET = process.env.S3_BUCKET ?? ''
const REGION = process.env.S3_REGION ?? 'us-east-1'
const ENDPOINT = (process.env.S3_ENDPOINT ?? '').replace(/\/$/, '')
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID ?? ''
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY ?? ''
const PUBLIC_BASE = (process.env.S3_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
const KEY_PREFIX = (process.env.S3_KEY_PREFIX ?? 'assets').replace(/(^\/|\/$)/g, '')

const S3_ENABLED = !!BUCKET && !!ACCESS_KEY && !!SECRET_KEY

/** Local fallback root — the same directory the app serves at /uploads/email-assets. */
export const LOCAL_UPLOAD_ROOT = process.env.ASSET_UPLOAD_ROOT
  ?? path.resolve(process.cwd(), '.storees/uploads/email-assets')

/**
 * Local root for PRIVATE objects (campaign attachments) — never HTTP-served.
 * Kept distinct from the public LOCAL_UPLOAD_ROOT and reading the same env the
 * campaign-attachment service already used, so pre-existing local `s3Key`
 * values resolve unchanged after this migration.
 */
export const PRIVATE_UPLOAD_ROOT = process.env.CAMPAIGN_ATTACHMENT_DIR
  ?? path.resolve(process.cwd(), '.storees/uploads/campaign-attachments')

/** S3 key prefix for private objects (under KEY_PREFIX). */
const PRIVATE_PREFIX = (process.env.S3_ATTACHMENT_PREFIX ?? 'campaign-attachments').replace(/(^\/|\/$)/g, '')

let client: S3Client | null = null
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: REGION,
      ...(ENDPOINT ? { endpoint: ENDPOINT, forcePathStyle: true } : {}),
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    })
  }
  return client
}

export function storageEnabled(): boolean { return S3_ENABLED }

function fullKey(key: string): string { return `${KEY_PREFIX}/${key}` }

function s3Url(fk: string): string {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${fk}`
  if (ENDPOINT) return `${ENDPOINT}/${BUCKET}/${fk}`
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${fk}`
}

function localUrl(key: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/uploads/email-assets/${key}`
}

export type StoredAsset = { filename: string; url: string; size: number; uploadedAt: string }

/**
 * Store `body` at `key` (`<projectId>/<filename>`) and return its public URL.
 * `localBaseUrl` (e.g. `${req.protocol}://${req.get('host')}`) builds the local URL.
 */
export async function putObject(key: string, body: Buffer, contentType: string, localBaseUrl: string): Promise<string> {
  if (S3_ENABLED) {
    const fk = fullKey(key)
    await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: fk, Body: body, ContentType: contentType }))
    return s3Url(fk)
  }
  const full = path.join(LOCAL_UPLOAD_ROOT, key)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, body)
  return localUrl(key, localBaseUrl)
}

export async function deleteObject(key: string): Promise<void> {
  if (S3_ENABLED) {
    await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: fullKey(key) })).catch(() => {})
    return
  }
  await unlink(path.join(LOCAL_UPLOAD_ROOT, key)).catch(() => {})
}

/** List assets under a project prefix (for the email-image picker). */
export async function listObjects(projectId: string, localBaseUrl: string): Promise<StoredAsset[]> {
  if (S3_ENABLED) {
    const prefix = `${KEY_PREFIX}/${projectId}/`
    const out = await s3().send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: 500 }))
    return (out.Contents ?? [])
      .filter(o => !!o.Key && !o.Key.endsWith('/'))
      .map(o => {
        const filename = path.posix.basename(o.Key!)
        return {
          filename,
          url: s3Url(o.Key!),
          size: o.Size ?? 0,
          uploadedAt: (o.LastModified ?? new Date(0)).toISOString(),
        }
      })
  }
  const dir = path.join(LOCAL_UPLOAD_ROOT, projectId)
  const files = await readdir(dir).catch(() => [])
  const rows = await Promise.all(files.map(async filename => {
    const info = await stat(path.join(dir, filename)).catch(() => null)
    if (!info?.isFile()) return null
    return { filename, url: localUrl(`${projectId}/${filename}`, localBaseUrl), size: info.size, uploadedAt: info.mtime.toISOString() }
  }))
  return rows.filter((r): r is StoredAsset => r !== null)
}

// ── Private objects (campaign attachments) ────────────────────────────────────
// These are read back as raw bytes at send time and base64-inlined into email
// payloads — they are never HTTP-served, so they get their own key namespace and
// (in local mode) their own root outside the public static mount. `key` is the
// logical storage key stored in the DB (`<campaignId>/<uuid>-<filename>`).

function privateKey(key: string): string { return `${KEY_PREFIX}/${PRIVATE_PREFIX}/${key}` }

/** Store a private object at `key`. */
export async function putPrivateObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (S3_ENABLED) {
    await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: privateKey(key), Body: body, ContentType: contentType }))
    return
  }
  const full = path.join(PRIVATE_UPLOAD_ROOT, key)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, body)
}

/** Read a private object's raw bytes. */
export async function getPrivateObject(key: string): Promise<Buffer> {
  if (S3_ENABLED) {
    const out = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: privateKey(key) }))
    const bytes = await out.Body!.transformToByteArray()
    return Buffer.from(bytes)
  }
  return readFile(path.join(PRIVATE_UPLOAD_ROOT, key))
}

/** Delete a private object (best-effort). */
export async function deletePrivateObject(key: string): Promise<void> {
  if (S3_ENABLED) {
    await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: privateKey(key) })).catch(() => {})
    return
  }
  await unlink(path.join(PRIVATE_UPLOAD_ROOT, key)).catch(() => {})
}

/** Copy a private object (used when duplicating a campaign). */
export async function copyPrivateObject(srcKey: string, destKey: string): Promise<void> {
  if (S3_ENABLED) {
    await s3().send(new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${privateKey(srcKey)}`,
      Key: privateKey(destKey),
    }))
    return
  }
  const dest = path.join(PRIVATE_UPLOAD_ROOT, destKey)
  await mkdir(path.dirname(dest), { recursive: true })
  await copyFile(path.join(PRIVATE_UPLOAD_ROOT, srcKey), dest)
}
