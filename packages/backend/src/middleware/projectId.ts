import type { Request, Response, NextFunction } from 'express'

declare global {
  namespace Express {
    interface Request {
      projectId?: string
    }
  }
}

export function requireProjectId(req: Request, res: Response, next: NextFunction): void {
  // A project set upstream by an auth middleware (requireAuth from the JWT, or
  // apiKeyAuth from the API key) is authoritative and defines the tenant boundary.
  // Clients must not be able to widen it by passing a different projectId.
  const trusted = req.projectId
  const clientProjectId = (req.query.projectId as string) ?? (req.body?.projectId as string | undefined)

  if (trusted) {
    if (clientProjectId && clientProjectId !== trusted) {
      res.status(403).json({
        success: false,
        error: 'projectId does not match your credentials',
      })
      return
    }
    req.projectId = trusted
    next()
    return
  }

  // No authenticated project on the request — fall back to the supplied value.
  if (!clientProjectId) {
    res.status(400).json({
      success: false,
      error: 'projectId is required',
    })
    return
  }

  req.projectId = clientProjectId
  next()
}
