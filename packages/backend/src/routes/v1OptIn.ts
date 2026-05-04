import { Router, Response } from 'express'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/connection.js'
import { optinWidgets, events } from '../db/schema.js'
import { redis } from '../services/redis.js'
import { resolveCustomer } from '../services/customerService.js'
import { updateConsent, type ConsentChannel } from '../services/consentService.js'
import { eventsQueue } from '../services/queue.js'
import { requirePublicKeyAuth, type ApiKeyAuthRequest } from '../middleware/apiKeyAuth.js'

const router = Router()

// Public storefront endpoints — same auth model as v1Events: project-scoped public API key
// passed via X-API-Key header, Authorization: Bearer, or ?api_key= query string.
router.use(requirePublicKeyAuth())

/**
 * GET /api/v1/widgets — public, API-key authed. Returns the project's active
 * opt-in widgets so the SDK can decide which to render and when.
 *
 * Response trims internal fields and exposes only what the SDK needs to render.
 */
router.get('/widgets', async (req: ApiKeyAuthRequest, res: Response) => {
  try {
    const projectId = req.projectId
    if (!projectId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const rows = await db
      .select()
      .from(optinWidgets)
      .where(and(
        eq(optinWidgets.projectId, projectId),
        eq(optinWidgets.isActive, true),
      ))

    res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id,
        name: r.name,
        headline: r.headline,
        body: r.body,
        buttonLabel: r.buttonLabel,
        consentText: r.consentText,
        triggerType: r.triggerType,
        triggerConfig: r.triggerConfig,
        targetPages: r.targetPages,
        showOnce: r.showOnce,
        collectEmail: r.collectEmail,
        collectName: r.collectName,
        phoneRequired: r.phoneRequired,
        preCheckConsent: r.preCheckConsent,
      })),
    })
  } catch (err) {
    console.error('GET /v1/widgets error:', err)
    res.status(500).json({ success: false, error: 'Failed to load widgets' })
  }
})

/**
 * POST /api/v1/optin — public, API-key authed. Storefront widget submission.
 *
 * Body: { widgetId, phone, email?, name?, sourceUrl, hp? (honeypot) }
 *
 * Effects:
 *   1. Honeypot: if `hp` is non-empty, return 200 silently (don't help bots)
 *   2. Per-IP rate limit (5 submissions/hour per IP)
 *   3. Look up the widget for consent_text + collect_* config
 *   4. Normalise phone to E.164
 *   5. resolveCustomer (creates if new) by phone+email
 *   6. recordConsent (channel=whatsapp, opt_in, source='widget') with the
 *      widget's consent_text as the audit text + IP
 *   7. Emit `optin_received` event so flows can fire welcome immediately
 */

const OPTIN_RATE_LIMIT_PER_IP = 5
const OPTIN_RATE_WINDOW_S = 3600 // 1 hour
const OPTIN_RATE_PREFIX = 'optin_rate:'

router.post('/optin', async (req: ApiKeyAuthRequest, res: Response) => {
  try {
    const projectId = req.projectId
    if (!projectId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const body = req.body as {
      widgetId?: string
      phone?: string
      email?: string
      name?: string
      sourceUrl?: string
      hp?: string  // honeypot
    }

    // 1. Honeypot — bots fill every input. Real users see a hidden field and skip it.
    //    We respond 200 to not give bots feedback that they were caught.
    if (body.hp && body.hp.length > 0) {
      return res.status(200).json({ success: true })
    }

    // 2. Per-IP rate limit
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()) ?? req.socket?.remoteAddress ?? 'unknown'
    const rateKey = `${OPTIN_RATE_PREFIX}${ip}`
    const count = await redis.incr(rateKey)
    if (count === 1) await redis.expire(rateKey, OPTIN_RATE_WINDOW_S)
    if (count > OPTIN_RATE_LIMIT_PER_IP) {
      return res.status(429).json({ success: false, error: 'Too many submissions; try again later.' })
    }

    // 3. Resolve widget for consent_text + form config
    if (!body.widgetId) {
      return res.status(400).json({ success: false, error: 'widgetId is required' })
    }
    const [widget] = await db
      .select()
      .from(optinWidgets)
      .where(and(
        eq(optinWidgets.id, body.widgetId),
        eq(optinWidgets.projectId, projectId),
        eq(optinWidgets.isActive, true),
      ))
      .limit(1)

    if (!widget) {
      return res.status(404).json({ success: false, error: 'Widget not found or inactive' })
    }

    // 4. Phone validation. Lightweight E.164 normalisation: strip spaces/dashes/parens,
    //    require leading + and 8-15 digits. Indian phones often arrive without `+91`;
    //    we accept 10-digit Indian numbers as a special case and prefix.
    let phone = (body.phone ?? '').replace(/[\s\-()]/g, '')
    if (!phone) {
      return res.status(400).json({ success: false, error: 'phone is required' })
    }
    if (/^[6-9]\d{9}$/.test(phone)) phone = `+91${phone}` // Indian 10-digit fallback
    else if (!phone.startsWith('+')) phone = `+${phone}`
    if (!/^\+\d{8,15}$/.test(phone)) {
      return res.status(400).json({ success: false, error: 'phone must be a valid international number' })
    }

    // Optional email validation — basic regex; real validation happens on first send
    const email = (body.email ?? '').trim() || null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'email format invalid' })
    }
    const name = (body.name ?? '').trim() || null

    // 5. Resolve / create customer
    const customerId = await resolveCustomer({
      projectId,
      phone,
      email,
      name,
    })

    // 6. Record consent with the widget's exact text — DPDP-compliant audit trail.
    //    We default to opting in for WhatsApp + email if either was collected; the
    //    consent text on the widget should disclose all channels covered.
    await updateConsent(
      projectId,
      customerId,
      'whatsapp' as ConsentChannel,
      'opt_in',
      'widget',
      {
        purpose: 'promotional',
        consentText: widget.consentText,
        ipAddress: ip,
      },
    )
    if (email) {
      await updateConsent(
        projectId,
        customerId,
        'email' as ConsentChannel,
        'opt_in',
        'widget',
        {
          purpose: 'promotional',
          consentText: widget.consentText,
          ipAddress: ip,
        },
      )
    }

    // 7. Fire optin_received event for flow triggering. Properties carry widget
    //    metadata so the merchant can branch flows per widget (e.g. exit-intent
    //    vs scroll-depth get different welcomes).
    const now = new Date()
    await db.insert(events).values({
      projectId,
      customerId,
      eventName: 'optin_received',
      properties: {
        widget_id: widget.id,
        widget_name: widget.name,
        trigger_type: widget.triggerType,
        source_url: body.sourceUrl ?? null,
        collected_email: !!email,
        collected_name: !!name,
      },
      platform: 'web',
      source: 'widget',
      idempotencyKey: `optin_${widget.id}_${customerId}_${now.getTime()}`,
      timestamp: now,
    }).onConflictDoNothing()

    await eventsQueue.add('optin_received', {
      projectId,
      customerId,
      eventName: 'optin_received',
      properties: { widget_id: widget.id, widget_name: widget.name },
      platform: 'web',
      timestamp: now.toISOString(),
    }).catch(err => console.error('[optin] queue publish failed:', err))

    res.status(201).json({ success: true, data: { customerId } })
  } catch (err) {
    console.error('POST /v1/optin error:', err)
    res.status(500).json({ success: false, error: 'Failed to process opt-in' })
  }
})

export default router
