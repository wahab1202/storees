import path from 'path'
import { randomUUID } from 'crypto'
import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises'
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { requireProjectId } from '../middleware/projectId.js'

const router = Router()

const UPLOAD_ROOT = process.env.ASSET_UPLOAD_ROOT
  ?? path.resolve(process.cwd(), '.storees/uploads/email-assets')

// ── WhatsApp header media (image/video/document). Uses multipart streaming so we
// can accept large files (video 16MB, document 100MB) that the base64/JSON path
// (8MB cap) can't handle. Stored on the same public /uploads/email-assets root.
const WA_MEDIA_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/3gpp': '3gp',
  'application/pdf': 'pdf',
}
const WA_MEDIA_MAX: Record<'image' | 'video' | 'document', number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
}
function waMediaKind(mime: string): 'image' | 'video' | 'document' | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'document'
  return null
}
const waUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, (req as Request).projectId ?? '_orphan')
      mkdir(dir, { recursive: true }).then(() => cb(null, dir)).catch((e) => cb(e as Error, dir))
    },
    filename: (_req, file, cb) => {
      const ext = WA_MEDIA_EXT[file.mimetype] ?? 'bin'
      cb(null, `${Date.now()}-${randomUUID()}.${ext}`)
    },
  }),
  limits: { fileSize: WA_MEDIA_MAX.document },  // hard ceiling; per-type checked after
  fileFilter: (_req, file, cb) => cb(null, !!WA_MEDIA_EXT[file.mimetype]),
})

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function decodeBase64(contentBase64: string): Buffer {
  const raw = contentBase64.includes(',') ? contentBase64.split(',').pop() ?? '' : contentBase64
  return Buffer.from(raw, 'base64')
}

function publicUrl(req: Request, projectId: string, filename: string): string {
  return `${req.protocol}://${req.get('host')}/uploads/email-assets/${projectId}/${filename}`
}

function safeAssetFilename(value: string): string | null {
  const filename = path.basename(value)
  if (!filename || filename !== value || filename.includes('..')) return null
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return null
  return filename
}

router.post('/email-image', requireProjectId, async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId
    const input = req.body as { filename?: unknown; mime?: unknown; contentBase64?: unknown }
    const mime = String(input.mime ?? '').trim().toLowerCase()
    const contentBase64 = String(input.contentBase64 ?? '')

    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' })
    }
    if (!ALLOWED_IMAGE_TYPES.has(mime)) {
      return res.status(400).json({ success: false, error: 'Only JPG, PNG, GIF, and WebP images are supported' })
    }
    if (!contentBase64) {
      return res.status(400).json({ success: false, error: 'Image content is required' })
    }

    const bytes = decodeBase64(contentBase64)
    if (bytes.length === 0) {
      return res.status(400).json({ success: false, error: 'Image content is empty' })
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      return res.status(400).json({ success: false, error: 'Image must be 5MB or smaller' })
    }

    const ext = EXTENSIONS[mime]
    const filename = `${Date.now()}-${randomUUID()}.${ext}`
    const dir = path.join(UPLOAD_ROOT, projectId)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), bytes)

    res.status(201).json({
      success: true,
      data: {
        url: publicUrl(req, projectId, filename),
        filename,
        mime,
        size: bytes.length,
      },
    })
  } catch (error) {
    console.error('email image upload failed', error)
    res.status(500).json({ success: false, error: 'Failed to upload image' })
  }
})

router.get('/email-images', requireProjectId, async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' })
    }

    const dir = path.join(UPLOAD_ROOT, projectId)
    const files = await readdir(dir).catch(() => [])
    const rows = await Promise.all(files.map(async (filename) => {
      const info = await stat(path.join(dir, filename)).catch(() => null)
      if (!info?.isFile()) return null
      return {
        filename,
        url: publicUrl(req, projectId, filename),
        size: info.size,
        uploadedAt: info.mtime.toISOString(),
      }
    }))

    res.json({
      success: true,
      data: rows
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        .slice(0, 60),
    })
  } catch (error) {
    console.error('email image list failed', error)
    res.status(500).json({ success: false, error: 'Failed to list images' })
  }
})

// POST /api/assets/whatsapp-media — multipart upload for WhatsApp header media.
// Field name: "file". Returns a public URL usable as a header sample.
router.post('/whatsapp-media', requireProjectId, (req: Request, res: Response) => {
  waUpload.single('file')(req, res, async (err: unknown) => {
    try {
      if (err) {
        const msg = (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
          ? 'File exceeds the maximum size'
          : (err instanceof Error ? err.message : 'Upload failed')
        return res.status(400).json({ success: false, error: msg })
      }
      const file = req.file
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file uploaded, or unsupported type (image/video/PDF only)' })
      }
      const kind = waMediaKind(file.mimetype)
      if (!kind || file.size > WA_MEDIA_MAX[kind]) {
        await unlink(file.path).catch(() => {})
        const cap = kind ? Math.round(WA_MEDIA_MAX[kind] / (1024 * 1024)) : 0
        return res.status(400).json({ success: false, error: `${kind ?? 'File'} exceeds the ${cap}MB limit for that media type` })
      }
      res.status(201).json({
        success: true,
        data: {
          url: publicUrl(req, req.projectId!, file.filename),
          filename: file.filename,
          mime: file.mimetype,
          size: file.size,
          kind,
        },
      })
    } catch (error) {
      console.error('whatsapp media upload failed', error)
      res.status(500).json({ success: false, error: 'Failed to upload media' })
    }
  })
})

router.delete('/email-images/:filename', requireProjectId, async (req: Request, res: Response) => {
  try {
    const projectId = req.projectId
    const filename = safeAssetFilename(req.params.filename as string)
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' })
    }
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Invalid image filename' })
    }

    await unlink(path.join(UPLOAD_ROOT, projectId, filename)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return
      throw error
    })

    res.json({ success: true, data: { filename } })
  } catch (error) {
    console.error('email image delete failed', error)
    res.status(500).json({ success: false, error: 'Failed to delete image' })
  }
})

export default router
