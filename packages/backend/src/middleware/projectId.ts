import type { Request, Response, NextFunction } from 'express'
import { mayAccessProject } from './membership.js'

declare global {
  namespace Express {
    interface Request {
      projectId?: string
    }
  }
}

/**
 * Resolve the operational project and enforce per-user access.
 *
 * The client selects the project via ?projectId= (kept as-is — we do NOT force
 * the JWT project, which is what broke GWM on 2026-07-22). The tenant boundary is
 * enforced by validating the selected project against the caller's membership
 * set: super admins pass any project; clients must be a member or get 403. When
 * ENFORCE_PROJECT_MEMBERSHIP is off, mayAccessProject() is a pass-through.
 */
export async function requireProjectId(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Check query/body first, then fall back to value set by requireAuth (from JWT)
  const projectId = (req.query.projectId as string) ?? req.body?.projectId ?? req.projectId

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: 'projectId is required',
    })
    return
  }

  try {
    if (!(await mayAccessProject(req, projectId))) {
      res.status(403).json({ success: false, error: 'You do not have access to this project' })
      return
    }
  } catch (err) {
    console.error('requireProjectId membership check failed:', err)
    res.status(500).json({ success: false, error: 'Authorization check failed' })
    return
  }

  req.projectId = projectId
  next()
}
