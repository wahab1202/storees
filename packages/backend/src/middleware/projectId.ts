import type { Request, Response, NextFunction } from 'express'

declare global {
  namespace Express {
    interface Request {
      projectId?: string
    }
  }
}

export function requireProjectId(req: Request, res: Response, next: NextFunction): void {
  // Check query/body first, then fall back to value set by requireAuth (from JWT)
  const projectId = (req.query.projectId as string) ?? req.body?.projectId ?? req.projectId

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: 'projectId is required',
    })
    return
  }

  req.projectId = projectId
  next()
}
