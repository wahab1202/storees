#!/usr/bin/env node
/**
 * Operational verification of the Resend send path.
 *
 *   Usage:
 *     node scripts/test-email-send.mjs <to-email> [--subject "..."] [--from "..."]
 *
 *   Examples:
 *     node scripts/test-email-send.mjs you@example.com
 *     node scripts/test-email-send.mjs test-xyz@srv1.mail-tester.com --subject "Storees deliverability check"
 *
 * What it does:
 *   1. Loads RESEND_API_KEY + FROM_EMAIL from packages/backend/.env
 *   2. Sends one HTML+text test email through Resend (uses identical headers/branding
 *      to a real Storees campaign so the score reflects real-world deliverability)
 *   3. Prints the Resend message id — paste this into the Resend dashboard to verify
 *      delivery, bounces, etc.
 *
 * Recommended workflow:
 *   - Run once against your own inbox to sanity check
 *   - Then run against a fresh address from https://www.mail-tester.com/ —
 *     they give you a one-time inbox; visit the URL after sending to see the
 *     deliverability score (target 9-10/10). A poor score points at config issues
 *     (missing SPF/DKIM, suspicious content, etc.) BEFORE we go production-multi-tenant.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resend } from 'resend'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../packages/backend/.env')

// Tiny .env loader so we don't pull dotenv as a script dep
function loadEnv(path) {
  try {
    const text = readFileSync(path, 'utf-8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
    }
  } catch (err) {
    console.warn(`[!] Could not read ${path}: ${err.message}`)
  }
}
loadEnv(envPath)

const args = process.argv.slice(2)
const to = args.find(a => !a.startsWith('--'))
const subjectArgIdx = args.indexOf('--subject')
const subject = subjectArgIdx >= 0 ? args[subjectArgIdx + 1] : 'Storees deliverability test'
const fromArgIdx = args.indexOf('--from')
const from = fromArgIdx >= 0 ? args[fromArgIdx + 1] : (process.env.FROM_EMAIL ?? 'Storees <noreply@storees.app>')

if (!to) {
  console.error('Usage: node scripts/test-email-send.mjs <to-email> [--subject "..."] [--from "..."]')
  process.exit(2)
}

if (!process.env.RESEND_API_KEY) {
  console.error('[!] RESEND_API_KEY not set in packages/backend/.env')
  console.error('    Get a key at https://resend.com/api-keys, then add to .env:')
  console.error('    RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
  process.exit(1)
}

const resend = new Resend(process.env.RESEND_API_KEY)

const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f6ff;padding:32px;color:#1e293b;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 16px;color:#4F46E5;">Storees deliverability test</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      This is an operational test of the Storees email send path via Resend.
      If you received this, the basic send path works. Reply to confirm receipt.
    </p>
    <p style="font-size:13px;color:#64748b;margin:0;">
      Sent at ${new Date().toISOString()} from ${from}
    </p>
  </div>
  <p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:24px;">
    Storees CDP &middot; This is a system-generated test message.
  </p>
</body>
</html>
`.trim()

const text = `Storees deliverability test\n\nThis is an operational test of the Storees email send path via Resend. If you received this, the basic send path works.\n\nSent at ${new Date().toISOString()} from ${from}\n`

console.log(`Sending test email...`)
console.log(`  from:    ${from}`)
console.log(`  to:      ${to}`)
console.log(`  subject: ${subject}`)

try {
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    text,
  })

  if (error) {
    console.error('\n[X] Resend rejected the send:')
    console.error('   ', error.message ?? JSON.stringify(error))
    process.exit(1)
  }

  console.log('\n[OK] Sent.')
  console.log('   message id:', data?.id)
  console.log('\nNext steps:')
  console.log('  1. Check the recipient inbox (and spam folder) within 30 seconds.')
  console.log('  2. If you sent to a mail-tester.com address, visit the URL they gave you')
  console.log('     to see the deliverability score. Target: 9-10/10.')
  console.log('  3. Open the Resend dashboard → find this message id → confirm "delivered" event.')
} catch (err) {
  console.error('\n[X] Network/SDK error:')
  console.error('   ', err.message ?? String(err))
  process.exit(1)
}
