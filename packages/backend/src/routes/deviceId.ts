import { Router, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { rateLimiter } from '../middleware/rateLimiter.js'

/**
 * Server-set first-party device id (Phase 2, step 2c). A cookie set by the
 * server in an HTTP response survives Safari/ITP far longer than a JS-set one —
 * but ONLY in first-party context, so this must be reached via a merchant CNAME
 * (id.<merchant>.com -> Storees). Cross-origin it degrades gracefully: the
 * cookie won't stick, so the endpoint just echoes the id the SDK supplied.
 *
 * Resolution order (churn-safe): existing cookie -> supplied ?d -> new uuid.
 */
const COOKIE = 'storees_did'
const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000

const router = Router()

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  const m = header.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : undefined
}

router.get('/', rateLimiter(120), (req: Request, res: Response) => {
  let deviceId = readCookie(req, COOKIE)
  if (!deviceId) {
    const supplied = typeof req.query.d === 'string' ? req.query.d : ''
    deviceId = /^[A-Za-z0-9_-]{8,64}$/.test(supplied) ? supplied : randomUUID()
  }
  res.cookie(COOKIE, deviceId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  })
  res.json({ success: true, data: { deviceId } })
})

export default router
