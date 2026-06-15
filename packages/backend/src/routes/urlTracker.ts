import { Router } from 'express'
import { resolveAndLogClick } from '../services/shortLinkService.js'

const router = Router()

/**
 * Public click redirect. Mounted at both /c/:slug (the short-link form baked into
 * WhatsApp button URLs) and /api/t/:slug (legacy alias). Resolves the slug, logs
 * the click via the durable short-link service, then 302s to the destination.
 */
router.get('/:slug', async (req, res) => {
  const slug = req.params.slug as string
  try {
    const originalUrl = await resolveAndLogClick(slug)
    if (!originalUrl) return res.status(404).send('Link expired or not found')
    return res.redirect(302, originalUrl)
  } catch (err) {
    console.error('Short-link redirect error:', err)
    return res.status(404).send('Link expired or not found')
  }
})

export default router
