import { Router } from 'express'
import { applyUnsubscribe } from '../services/unsubscribeService.js'

const router = Router()

/**
 * Public unsubscribe endpoint. Mounted at /u so the URL can fit comfortably
 * in the List-Unsubscribe header. Two paths:
 *
 *   GET  /u/:token  → renders a tiny confirmation page (browser flow)
 *   POST /u/:token  → one-click unsubscribe per RFC 8058 (mailbox provider
 *                     fires this without user interaction; must respond 200)
 *
 * Both apply the unsubscribe; the GET also displays a result page so a human
 * who clicks the link in the footer sees confirmation.
 *
 * NOT under requireAuth — recipients can't be expected to be logged in.
 */
router.post('/:token', async (req, res) => {
  const token = req.params.token
  // Mailbox-provider one-click POSTs include "List-Unsubscribe=One-Click" in
  // the body per RFC 8058; we don't need to validate it (presence of token is
  // enough), but we do require a token.
  if (!token) {
    return res.status(400).json({ ok: false, error: 'missing_token' })
  }

  const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()) ?? req.socket?.remoteAddress ?? null
  const result = await applyUnsubscribe(token, null, ip)
  if (!result.ok) {
    return res.status(404).json({ ok: false, error: result.reason ?? 'failed' })
  }
  res.status(200).json({ ok: true })
})

router.get('/:token', async (req, res) => {
  const token = req.params.token
  if (!token) {
    return renderHtmlError(res, 'Invalid unsubscribe link.')
  }

  const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()) ?? req.socket?.remoteAddress ?? null
  const result = await applyUnsubscribe(token, null, ip)
  if (!result.ok) {
    return renderHtmlError(res, 'This unsubscribe link is invalid or has already been used.')
  }

  res.status(200).set('Content-Type', 'text/html').send(`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed</title>
<style>
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f6ff;color:#1e293b;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:420px;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);text-align:center}
  h1{font-size:20px;margin:0 0 12px;color:#4F46E5}
  p{font-size:15px;line-height:1.6;margin:0 0 8px;color:#475569}
  .check{width:48px;height:48px;border-radius:50%;background:#d1fae5;color:#059669;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px}
</style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>You've been unsubscribed</h1>
    <p>You will no longer receive promotional emails from this sender.</p>
    <p style="font-size:13px;color:#94a3b8;margin-top:16px">Transactional messages (order confirmations, password resets, etc.) may still be delivered as required by law.</p>
  </div>
</body>
</html>`)
})

function renderHtmlError(res: import('express').Response, message: string) {
  res.status(400).set('Content-Type', 'text/html').send(`
<!doctype html>
<html><head><meta charset="utf-8"><title>Unsubscribe failed</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;background:#f5f6ff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.c{max-width:420px;background:#fff;border-radius:12px;padding:32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.06)}h1{color:#dc2626;font-size:18px;margin:0 0 12px}p{color:#475569;font-size:15px;margin:0}</style>
</head><body><div class="c"><h1>Unsubscribe failed</h1><p>${message}</p></div></body></html>`)
}

export default router
