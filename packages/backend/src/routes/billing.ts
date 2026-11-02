import { Router, type Request, type Response } from 'express'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'
import { BILLING_PLANS, createSubscription, activateFromShopify } from '../services/billingService.js'

const FRONTEND_URL = process.env.MERCHANT_PANEL_URL ?? process.env.FRONTEND_URL ?? ''

const router = Router()
router.use(requireProjectId)

// GET /api/billing/plans — the upgrade plan picker
router.get('/plans', (_req, res) => {
  res.json({ success: true, data: BILLING_PLANS })
})

// POST /api/billing/subscribe — body { plan } → Shopify confirmation URL to redirect to
router.post('/subscribe', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const plan = String(req.body?.plan ?? '')
    const { confirmationUrl } = await createSubscription(req.projectId!, plan)
    res.json({ success: true, data: { confirmationUrl } })
  } catch (err) {
    console.error('POST /billing/subscribe error:', err)
    res.status(400).json({ success: false, error: (err as Error).message || 'Failed to start subscription' })
  }
})

/**
 * GET /api/billing/callback?projectId=&plan= — PUBLIC (Shopify redirects the
 * merchant's browser here after they approve). Verifies the real active
 * subscription, flips the project to paid, then bounces to the app.
 */
export async function billingCallback(req: Request, res: Response): Promise<void> {
  const projectId = String(req.query.projectId ?? '')
  try {
    if (!projectId) {
      res.redirect(`${FRONTEND_URL}/settings/billing?billing=error`)
      return
    }
    const result = await activateFromShopify(projectId)
    res.redirect(`${FRONTEND_URL}/settings/billing?billing=${result.activated ? 'success' : 'pending'}`)
  } catch (err) {
    console.error('GET /billing/callback error:', err)
    res.redirect(`${FRONTEND_URL}/settings/billing?billing=error`)
  }
}

export default router
