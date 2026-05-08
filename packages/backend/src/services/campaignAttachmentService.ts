import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { campaignAttachments } from '../db/schema.js'

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const ATTACHMENT_DIR = process.env.CAMPAIGN_ATTACHMENT_DIR
  ?? path.resolve(process.cwd(), '.storees/uploads/campaign-attachments')

const ALLOWED_MIME_PREFIXES = ['image/']
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

export type CampaignAttachmentUpload = {
  filename: string
  mime: string
  sizeBytes?: number
  contentBase64: string
}

export type ResendAttachment = {
  filename: string
  content: string
  contentType: string
}

type AttachmentRow = typeof campaignAttachments.$inferSelect

function safeFilename(filename: string): string {
  const cleaned = filename.trim().replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_')
  return cleaned.slice(0, 180) || 'attachment'
}

function decodeBase64(contentBase64: string): Buffer {
  const match = contentBase64.match(/^data:[^;]+;base64,(.+)$/)
  const payload = match?.[1] ?? contentBase64
  return Buffer.from(payload, 'base64')
}

function assertAllowedAttachment(upload: CampaignAttachmentUpload, bytes: Buffer) {
  const mime = upload.mime.trim().toLowerCase()
  const allowed = ALLOWED_MIME_TYPES.has(mime) || ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix))
  if (!allowed) throw new Error(`Attachment type not allowed: ${upload.mime}`)
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('Attachments must be 25MB or smaller')
}

async function ensureAttachmentDir() {
  await mkdir(ATTACHMENT_DIR, { recursive: true })
}

function attachmentPath(storageKey: string) {
  return path.join(ATTACHMENT_DIR, storageKey)
}

export async function persistCampaignAttachments(campaignId: string, uploads: CampaignAttachmentUpload[] = []): Promise<AttachmentRow[]> {
  if (uploads.length === 0) return []
  await ensureAttachmentDir()

  const rows: Array<typeof campaignAttachments.$inferInsert> = []
  for (const upload of uploads) {
    const bytes = decodeBase64(upload.contentBase64)
    assertAllowedAttachment(upload, bytes)
    const filename = safeFilename(upload.filename)
    const storageKey = `${campaignId}/${crypto.randomUUID()}-${filename}`
    const fullPath = attachmentPath(storageKey)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, bytes)
    rows.push({
      campaignId,
      filename,
      mime: upload.mime.trim().toLowerCase(),
      sizeBytes: bytes.byteLength,
      s3Key: storageKey,
    })
  }

  return db.insert(campaignAttachments).values(rows).returning()
}

export async function listCampaignAttachments(campaignId: string): Promise<AttachmentRow[]> {
  return db
    .select()
    .from(campaignAttachments)
    .where(eq(campaignAttachments.campaignId, campaignId))
}

export async function deleteCampaignAttachments(campaignId: string, attachmentIds: string[]): Promise<void> {
  const ids = [...new Set(attachmentIds.filter(Boolean))]
  if (ids.length === 0) return
  const rows = await db
    .select()
    .from(campaignAttachments)
    .where(inArray(campaignAttachments.id, ids))
  const owned = rows.filter(row => row.campaignId === campaignId)
  if (owned.length === 0) return
  await db.delete(campaignAttachments).where(inArray(campaignAttachments.id, owned.map(row => row.id)))
  await Promise.all(owned.map(row => unlink(attachmentPath(row.s3Key)).catch(() => undefined)))
}

export async function loadResendAttachments(campaignId: string): Promise<ResendAttachment[]> {
  const rows = await listCampaignAttachments(campaignId)
  return Promise.all(rows.map(async row => ({
    filename: row.filename,
    contentType: row.mime,
    content: (await readFile(attachmentPath(row.s3Key))).toString('base64'),
  })))
}

export async function copyCampaignAttachments(sourceCampaignId: string, targetCampaignId: string): Promise<AttachmentRow[]> {
  const rows = await listCampaignAttachments(sourceCampaignId)
  if (rows.length === 0) return []
  await ensureAttachmentDir()

  const inserts: Array<typeof campaignAttachments.$inferInsert> = []
  for (const row of rows) {
    const filename = safeFilename(row.filename)
    const storageKey = `${targetCampaignId}/${crypto.randomUUID()}-${filename}`
    const fullPath = attachmentPath(storageKey)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await copyFile(attachmentPath(row.s3Key), fullPath)
    inserts.push({
      campaignId: targetCampaignId,
      filename,
      mime: row.mime,
      sizeBytes: row.sizeBytes,
      s3Key: storageKey,
    })
  }
  return db.insert(campaignAttachments).values(inserts).returning()
}
