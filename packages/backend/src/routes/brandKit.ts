import { Router, Response } from 'express'
import type { BrandKit } from '@storees/shared'
import { requireProjectId } from '../middleware/projectId.js'
import { requireRole } from '../middleware/agentScope.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'
import { getBrandKit, syncBrandKit, syncBrandFromUrl, updateBrandKit, DEFAULT_BRAND } from '../services/brandKitService.js'

const router = Router()
router.use(requireProjectId)

/** GET /api/brand-kit?projectId= — current kit + the effective (default-filled) values. */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const kit = await getBrandKit(req.projectId!)
    res.json({
      success: true,
      data: {
        kit,
        effective: {
          logoUrl: kit?.logoUrl ?? null,
          primaryColor: kit?.primaryColor || DEFAULT_BRAND.primaryColor,
          accentColor: kit?.accentColor || DEFAULT_BRAND.accentColor,
          slogan: kit?.slogan ?? null,
        },
      },
    })
  } catch (err) {
    console.error('Brand kit get error:', err)
    res.status(500).json({ success: false, error: 'Failed to load brand kit' })
  }
})

/**
 * POST /api/brand-kit/sync?projectId= — detect brand assets.
 *   body { url } → scrape that website (works for ANY vertical: fintech, edtech…)
 *   no url       → pull from the connected Shopify store (shop.brand)
 */
router.post('/sync', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
  try {
    if (url) {
      const kit = await syncBrandFromUrl(req.projectId!, url)
      return res.json({ success: true, data: kit })
    }
    const kit = await syncBrandKit(req.projectId!)
    if (!kit) {
      return res.status(400).json({
        success: false,
        error: 'No Shopify store connected. Pass a website URL to detect your brand, or set it manually.',
      })
    }
    res.json({ success: true, data: kit })
  } catch (err) {
    console.error('Brand kit sync error:', err)
    res.status(400).json({ success: false, error: (err as Error).message || 'Failed to detect brand' })
  }
})

const HEX = /^#[0-9a-fA-F]{3,8}$/

/** PATCH /api/brand-kit?projectId= — manual overrides from settings. */
router.patch('/', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { logoUrl, primaryColor, accentColor, slogan, fontFamily } = req.body ?? {}
    for (const [k, v] of Object.entries({ primaryColor, accentColor })) {
      if (v != null && v !== '' && !HEX.test(String(v))) {
        return res.status(400).json({ success: false, error: `${k} must be a hex colour like #4F46E5` })
      }
    }
    const patch: Partial<BrandKit> = {}
    if (logoUrl !== undefined) patch.logoUrl = logoUrl || null
    if (primaryColor !== undefined) patch.primaryColor = primaryColor || null
    if (accentColor !== undefined) patch.accentColor = accentColor || null
    if (slogan !== undefined) patch.slogan = slogan || null
    if (fontFamily !== undefined) patch.fontFamily = fontFamily || null
    const kit = await updateBrandKit(req.projectId!, patch)
    res.json({ success: true, data: kit })
  } catch (err) {
    console.error('Brand kit update error:', err)
    res.status(500).json({ success: false, error: 'Failed to update brand kit' })
  }
})

export default router
