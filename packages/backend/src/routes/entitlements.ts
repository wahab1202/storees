import { Router, Response } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'
import { getEntitlements } from '../services/entitlementService.js'

const router = Router()

// GET /api/entitlements?projectId= — plan, status, trial days left, features + limits
// for the operational project. The UI uses this to lock premium features and show
// trial/upgrade banners (enforcement is server-side regardless).
router.get('/', requireProjectId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ent = await getEntitlements(req.projectId!)
    res.json({ success: true, data: ent })
  } catch (err) {
    console.error('GET /entitlements error:', err)
    res.status(500).json({ success: false, error: 'Failed to load entitlements' })
  }
})

export default router
