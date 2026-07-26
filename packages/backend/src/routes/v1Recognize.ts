import { Router, Response } from 'express'
import { requirePublicKeyAuth, type ApiKeyAuthRequest } from '../middleware/apiKeyAuth.js'
import { rateLimiter } from '../middleware/rateLimiter.js'
import { recognize, registerToNetwork } from '../services/globalIdentityService.js'
import { resolveCustomer } from '../services/customerService.js'

// Cross-brand recognition (Phase 2 · 2d-3). Public storefront endpoint — same
// project-scoped public API key as v1Events.
const router = Router()
router.use(requirePublicKeyAuth())

/**
 * POST /api/v1/recognize — given a key (phone/email) the visitor provided at
 * THIS brand, report whether they're a known networked person and return this
 * brand's own customer for them (creating + linking it if they're new here).
 * No behavioural data from other brands is ever returned. No-op
 * (recognized:false) unless the network is enabled and they consented.
 */
router.post('/recognize', rateLimiter(60), async (req: ApiKeyAuthRequest, res: Response) => {
  try {
    const projectId = req.projectId!
    const { phone, email } = req.body as { phone?: string; email?: string }
    if (!phone?.trim() && !email?.trim()) {
      return res.status(400).json({ success: false, error: 'phone or email is required' })
    }

    const result = await recognize(projectId, { phone, email })
    if (!result.inNetwork) {
      return res.json({ success: true, data: { recognized: false } })
    }

    let customerId = result.customerId
    let returning = result.returning
    if (!customerId) {
      // Known person, new to this brand → create + link this brand's own customer.
      customerId = await resolveCustomer({ projectId, email: email ?? null, phone: phone ?? null })
      await registerToNetwork(projectId, customerId, { phone, email }, true)
      returning = false
    }

    res.json({ success: true, data: { recognized: true, returning, customerId } })
  } catch (err) {
    console.error('Recognize error:', err)
    res.status(500).json({ success: false, error: 'Recognition failed' })
  }
})

export default router
