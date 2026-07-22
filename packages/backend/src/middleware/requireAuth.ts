import { Request, Response, NextFunction } from 'express'
import { verifyJwt, type JwtPayload } from '../services/authService.js'

export type AuthenticatedRequest = Request & {
  adminUser?: JwtPayload
}

/**
 * Middleware: Authenticate admin panel requests via JWT Bearer token.
 * Sets req.adminUser = { userId, email, projectId } on success.
 * Rejects tokens with pending2FA claim (must complete 2FA first).
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid Authorization header',
    })
  }

  const token = authHeader.slice(7)
  const payload = verifyJwt(token)

  if (!payload) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    })
  }

  // Reject temp tokens (pending 2FA verification)
  if (payload.pending2FA) {
    return res.status(403).json({
      success: false,
      error: '2FA verification required',
    })
  }

  req.adminUser = payload

  // Bind the request to the token's project. The JWT is the source of truth for
  // tenant identity — a client-supplied ?projectId= must never override it
  // (requireProjectId rejects any mismatch).
  if (payload.projectId) {
    (req as Request & { projectId?: string }).projectId = payload.projectId
  }

  next()
}
