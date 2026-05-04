# Storees Email Deliverability — DevOps Configuration Runbook

> **Audience:** DevOps engineer setting up email infrastructure for a Storees
> deployment (production or staging). Read top-to-bottom in order; each
> section has explicit verification steps.
>
> **Time required:** ~45 min for a fresh setup, plus ~24-72h for first
> domain warming. Mostly DNS propagation waits, not active work.
>
> **Pre-read:** [`docs/strategy/EMAIL_PROVIDER_PHASES.md`](../strategy/EMAIL_PROVIDER_PHASES.md)
> for the bigger picture of where email infra is going (Resend now → SES later).

---

## What's already done by engineering

The application code already implements:

- ✅ Per-tenant Resend sending domain (`Settings → Project → Email`)
- ✅ Suppression list — auto-populated on hard bounces + complaints
- ✅ Consent gate — opted-out customers excluded from sends
- ✅ List-Unsubscribe header (RFC 8058 compliant for Gmail/Yahoo)
- ✅ Resend webhook signature verification (svix HMAC)
- ✅ Webhook idempotency (24h dedup)
- ✅ Per-tenant rate budget (configurable, default 60 emails/min)
- ✅ Pre-send stale-list audit (blocks if >30% of recipients haven't
      opened email in 90 days)
- ✅ Pre-send content lint (spam triggers, image-only bodies, missing
      unsubscribe link)

**Your job:** wire up the external dependencies (Resend account, DNS
records, env vars) and verify end-to-end.

---

## Required external accounts

| Service | What for | Cost (current scale) |
|---|---|---|
| **Resend** | Email sending API (marketing + transactional, Phase 1) | Free tier: 3K/mo, 100/day. $20/mo for 50K. |
| **Cloudflare** (or other DNS) | DNS records for sending domain authentication | Free |
| **An inbox for DMARC reports** | Receives daily aggregate DMARC reports | Free (use existing) |

Phase 2+ (after 500K emails/mo) introduces AWS SES — see strategy doc.

---

## Step 1: Create Resend account + API key

1. Sign up at https://resend.com (use a shared `infra@yourcompany` mailbox if possible — single-person ownership creates a bus factor)
2. Verify your account email
3. **API Keys** → **Create API Key**
   - Name: `storees-prod` (or `storees-staging`)
   - **Permission: "Sending access"** *(NOT "Full access" for prod — narrowest permission that works)*
   - Copy the key (`re_...`) — Resend shows it once

**Verification:** key starts with `re_` and is ~28 characters.

---

## Step 2: Configure DNS for the sending domain

> **Use a subdomain**, not the apex. Recommended: `mail.YOUR_DOMAIN.com`. This
> isolates email-sending DKIM/SPF from your regular domain mail and lets you
> tighten DMARC on the subdomain without affecting other email systems.

### 2a. Register the domain in Resend

1. Resend dashboard → **Domains** → **Add Domain**
2. Enter the subdomain: e.g. `mail.storees.io`
3. Region: **us-east-1** (default; switch only for data-residency requirements like Indian fintech compliance, where `ap-south-1` may be preferred)
4. Click **Add**
5. Resend shows 3-4 DNS records — leave the page open

### 2b. Add records to Cloudflare (or your DNS provider)

For **each record** Resend lists, add it to DNS:

**Cloudflare specifics:**
- Type: TXT or CNAME (Resend specifies)
- Name: enter ONLY the prefix Resend shows (e.g. `send.mail`) — Cloudflare auto-appends the apex domain. **Do NOT include the apex.**
- Content: paste verbatim from Resend (don't add quotes)
- TTL: Auto
- Proxy status: **DNS only (gray cloud)**. Never Proxied (orange cloud) — Cloudflare's proxy strips DKIM signatures.

**Other providers:** "Name" field handling differs. AWS Route53 wants the FQDN (`send.mail.storees.io`). GoDaddy/Namecheap/Squarespace expect the prefix only. If unclear, try with prefix first; if `dig` shows nothing after 5 min, retry with FQDN.

**Records you'll typically add:**

| Type | Purpose |
|---|---|
| MX (1) | Bounce/return-path routing |
| TXT (1) | SPF authorisation for Resend's IPs |
| TXT (2) | DKIM public keys (selectors `resend._domainkey` etc.) — sometimes given as CNAMEs |

### 2c. Add DMARC record (Resend doesn't auto-create this)

In Cloudflare:

| Field | Value |
|---|---|
| Type | TXT |
| Name | `_dmarc.mail` (assuming `mail.YOUR_DOMAIN.com` is the sending subdomain) |
| Content | `v=DMARC1; p=none; pct=100; rua=mailto:dmarc@YOUR_DOMAIN.com; aspf=r; adkim=r; fo=1` |
| TTL | Auto |

**Replace `dmarc@YOUR_DOMAIN.com`** with an inbox you actually monitor. DMARC reports arrive daily from each receiving mailbox provider — Gmail, Yahoo, Outlook, etc. Plan for ~10-30 emails/day during Phase 1.

**Why `p=none`:** monitor-only mode. After 30 days of clean traffic without SPF/DKIM failures, tighten to `p=quarantine`, then `p=reject` 30 days after that. Skipping this ladder risks blocking legitimate mail during the initial warming window.

### 2d. Verify domain in Resend

1. Back at the Resend dashboard domain page → click **Verify DNS Records**
2. Wait 1-30 min depending on DNS provider speed (Cloudflare is usually <5 min)
3. Status flips from `pending` to `verified` ✅

If verification fails after 30 min:

```bash
# Sanity-check the records actually propagated
dig TXT send.mail.YOUR_DOMAIN.com @8.8.8.8
dig CNAME resend._domainkey.mail.YOUR_DOMAIN.com @8.8.8.8
dig TXT _dmarc.mail.YOUR_DOMAIN.com @8.8.8.8
```

If any return empty: DNS hasn't propagated, or the record was added under the wrong host. Check Cloudflare DNS records list, confirm `Name` field matches Resend's expected value.

---

## Step 3: Register the Resend webhook endpoint

This is what activates the suppression-on-bounce flow. Without it, the
backend never learns about bounces and complaints, so we keep re-sending
to bad addresses — exactly what kills sender reputation.

1. Resend dashboard → **Webhooks** → **Add Endpoint**
2. **Endpoint URL:** `https://YOUR_PROD_API_DOMAIN/api/webhooks/resend`
   - Must be HTTPS
   - Must be reachable from public internet (Resend → your server)
   - Path is exactly `/api/webhooks/resend`
3. **Events to subscribe** (check all 5):
   - `email.delivered` (updates `messages.delivered_at`)
   - `email.opened` (updates `messages.read_at`, increments `campaigns.opened_count`)
   - `email.clicked` (updates `messages.clicked_at`)
   - `email.bounced` (writes hard bounces to `email_suppressions`)
   - `email.complained` (writes complaints to `email_suppressions`)
4. Click **Add**
5. Resend shows the **Signing Secret** (`whsec_...`) — copy it immediately, you'll need it for env config

---

## Step 4: Environment variables

All of these go in the backend's environment (Vercel env, Railway env, .env file — wherever your deploy reads from). **Do not commit them.**

### Required for any send

| Variable | Source | Required | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | Step 1 | **Required** | Sending access only. Rotate quarterly. |
| `FROM_EMAIL` | After Step 2d | **Required** | Format: `Brand Name <noreply@mail.YOUR_DOMAIN.com>`. Used as fallback for projects without their own verified domain. |

### Required for production (suppression flow + unsubscribe)

| Variable | Source | Required | Notes |
|---|---|---|---|
| `RESEND_WEBHOOK_SECRET` | Step 3 | **Required for prod** | Webhook handler fails closed without this — rejects all events as unsigned. |
| `UNSUB_BASE_URL` | Your call | **Required for prod** | Base URL for the unsubscribe link in `List-Unsubscribe` header. Format: `https://app.YOUR_DOMAIN.com` (no trailing slash). The `/u/<token>` path is appended automatically. Falls back to `APP_URL` if unset. |
| `APP_URL` | Existing | Recommended | Already used elsewhere in the codebase. UNSUB_BASE_URL takes precedence if both are set. |

### Pre-existing — must already be set

These are wired in before email work and remain required:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Required for webhook idempotency + per-tenant rate budgets |
| `ENCRYPTION_KEY` | Used by Shopify token storage; required for project lookups |

### Verifying env config

```bash
# Print the env vars the backend will read (sanitized)
cd packages/backend
node -e "
  require('dotenv').config();
  const required = ['RESEND_API_KEY', 'FROM_EMAIL', 'RESEND_WEBHOOK_SECRET', 'UNSUB_BASE_URL'];
  for (const k of required) {
    const v = process.env[k];
    if (!v) {
      console.log('MISSING: ' + k);
    } else {
      console.log(k + ' = ' + (k.includes('KEY') || k.includes('SECRET') ? v.slice(0, 6) + '...' : v));
    }
  }
"
```

Expected: all four lines show a real value (or first 6 chars of a secret), no `MISSING` lines.

---

## Step 5: End-to-end verification

### 5a. Basic send

From the deployed environment (or locally with prod env vars):

```bash
node scripts/test-email-send.mjs your-real-email@example.com
```

**Expected:**
- Script prints `[OK] Sent.` with a Resend message id
- Email arrives in **inbox** (not spam) within 30 sec
- Resend dashboard → Emails shows the message id with status "Delivered"

**If it lands in spam:**
- Re-check DKIM/SPF: `dig TXT send.mail.YOUR_DOMAIN.com` should return Resend's SPF
- Re-check DMARC: `dig TXT _dmarc.mail.YOUR_DOMAIN.com` should return your DMARC TXT
- Use https://www.mail-tester.com to get a deliverability score (target: 9-10/10)

### 5b. Mail-Tester score

```bash
# 1. Open https://www.mail-tester.com to get a one-time address
# 2. Send to it (replace placeholder):
node scripts/test-email-send.mjs test-XXXXX@srv1.mail-tester.com
# 3. Within 30 seconds, click "Then check your score" on Mail-Tester page
```

**Expected: 10/10** with all green sections (SPF, DKIM, DMARC, content).

If DMARC is yellow with the message *"can not verify a DMARC if it is applied to the parent domain"*: the apex `_dmarc.YOUR_DOMAIN.com` exists but `_dmarc.mail.YOUR_DOMAIN.com` doesn't. Add the subdomain-specific record (Step 2c). Mail-Tester quirk — real mailbox providers handle inheritance correctly, but adding the explicit record clears the warning.

### 5c. Webhook flow

After a real send, within 30 seconds:

```sql
-- Should show one row per delivered/opened event
SELECT event_name, properties->>'message_id', timestamp
FROM events
WHERE event_name LIKE 'email_%'
ORDER BY timestamp DESC LIMIT 10;
```

If no rows appear:
- Check the Resend dashboard → Webhooks → your endpoint → recent deliveries. Resend logs every webhook attempt + response code.
- Backend logs should show `Webhook received: email.delivered → email_delivered for project ...`
- 401 in webhook deliveries = `RESEND_WEBHOOK_SECRET` mismatch
- 5xx in webhook deliveries = backend exception (check logs)

### 5d. Suppression flow

Test that hard bounces actually populate `email_suppressions`:

```bash
# Resend's bounce simulator (delivers a real hard-bounce webhook event)
node scripts/test-email-send.mjs bounced@resend.dev
```

After ~1 minute:

```sql
SELECT * FROM email_suppressions
WHERE email = 'bounced@resend.dev'
ORDER BY suppressed_at DESC LIMIT 1;
```

Expected: one row with `reason = 'hard_bounce'`, `source = 'resend_webhook'`.

Same test for complaints — change `bounced@resend.dev` to `complained@resend.dev`. Expected: row with `reason = 'complained'`.

### 5e. Per-tenant rate budget

Pick a project; lower its rate budget for testing:

```sql
UPDATE projects SET email_rate_per_minute = 5 WHERE id = '<TEST_PROJECT_ID>';
```

Send 10+ emails through the campaign system in <60 sec. Backend logs should show:

```
[delivery] project <id> over email budget (6/5); deferring 47000ms
```

Sends 6+ get deferred to the next minute window. **Reset the budget** after testing:

```sql
UPDATE projects SET email_rate_per_minute = 60 WHERE id = '<TEST_PROJECT_ID>';
```

---

## Step 6: First production campaign — pre-flight checklist

Before any client's first real campaign:

- [ ] `RESEND_API_KEY` set, valid (test send works)
- [ ] `FROM_EMAIL` set, points to a verified domain
- [ ] `RESEND_WEBHOOK_SECRET` set, webhook delivers events to backend
- [ ] `UNSUB_BASE_URL` set, `/u/<token>` returns the unsubscribe page
- [ ] DNS shows valid SPF + DKIM + DMARC
- [ ] Mail-Tester score 9-10/10
- [ ] Suppression test confirmed: bounced address in `email_suppressions`
- [ ] Project's `email_rate_per_minute` set per warming plan (60 default; can go higher after 7d clean traffic)
- [ ] Project's domain verified at Resend (per-tenant DKIM)
- [ ] Email body has visible `<a href="{{unsubscribe_url}}">Unsubscribe</a>` (the campaign builder warns if missing)

---

## Step 7: Operational monitoring

### Daily checks (or set up alerts)

```sql
-- Bounce rate over last 24h. Should be <2%. >5% triggers Resend throttling.
SELECT
  ROUND(100.0 * SUM(bounced_count)::numeric / NULLIF(SUM(total_recipients), 0), 2) AS bounce_pct,
  SUM(total_recipients) AS sent,
  SUM(bounced_count) AS bounced
FROM campaigns
WHERE updated_at > NOW() - INTERVAL '24 hours'
  AND status IN ('sent', 'sending');

-- Complaint rate. Must stay <0.3% for ESP not to suspend the account.
SELECT
  ROUND(100.0 * SUM(complained_count)::numeric / NULLIF(SUM(delivered_count), 0), 4) AS complaint_pct,
  SUM(delivered_count) AS delivered,
  SUM(complained_count) AS complaints
FROM campaigns
WHERE updated_at > NOW() - INTERVAL '24 hours';

-- Suppression list growth (sanity-check: should be <1% of total sends)
SELECT reason, COUNT(*) FROM email_suppressions
WHERE suppressed_at > NOW() - INTERVAL '7 days'
GROUP BY reason
ORDER BY count DESC;
```

### Alerts to wire up (Phase 2+, but consider now)

- Bounce rate > 5% (last 1h) → page oncall
- Complaint rate > 0.1% (last 24h) → email engineering
- Webhook delivery success < 99% (Resend dashboard has this metric)
- `RESEND_API_KEY` rate-limit headers near saturation (Resend returns `x-ratelimit-remaining` headers)

---

## Step 8: Common failure modes + fixes

| Symptom | Most likely cause | Fix |
|---|---|---|
| Sends succeed but emails land in spam | DKIM/SPF/DMARC misconfigured | Mail-Tester to identify which; usually CNAME proxy was left on Cloudflare |
| Webhook 401 in Resend dashboard | `RESEND_WEBHOOK_SECRET` mismatch | Re-copy from Resend → Webhooks → Signing Secret; don't paste with surrounding quotes |
| Webhook 5xx in Resend dashboard | Backend exception | Check backend logs around the timestamp Resend retried |
| `email_suppressions` not growing | Webhook not registered, or events not subscribed | Resend dashboard → Webhooks → confirm endpoint exists + 5 events checked |
| Resend `domain_not_verified` errors mid-send | DNS record was removed/edited | `dig` the records; re-verify in Resend dashboard |
| Rate-limit deferrals never end | Project's `email_rate_per_minute` set too low | Raise via `Settings → Project → Email rate` (admin UI), or `UPDATE projects SET email_rate_per_minute = N` |
| Campaign blocked with "stale_list_warning" 409 | >30% recipients have no email_opened in 90d | Either: add `Days Since Email Open < 90` segment filter, OR re-call send with `?force=true` after acknowledging |
| Unsubscribe links 404 | `UNSUB_BASE_URL` unset or wrong | Set to your public app URL (no trailing slash); restart backend |

---

## Step 9: When to escalate to engineering

- Bounce rate consistently > 3% across multiple campaigns (could be a list-quality issue, but also could be a rendering bug producing broken from-addresses)
- Complaint rate > 0.2% on any single campaign (immediate review of the recipient list + opt-in source)
- Resend account suspended (engineering ticket + immediate dashboard review)
- Webhook deliveries stop entirely for >15 min (Resend status page + your infra + endpoint health)
- Any client requesting compliance attestation (SOC 2, ISO 27001, NDPR for India fintech) — engineering needs to gather audit evidence

---

## Phase-2 trigger — when to start planning SES migration

Watch these monthly. Any one crossing → engineering ticket to start Phase 2.

- [ ] Aggregate Storees email volume / mo > 500K
- [ ] Any single client volume / mo > 200K
- [ ] 5th paying client signs
- [ ] Resend bill / mo > $1,000
- [ ] First NBFC / regulated-industry client (parallel Phase 3 prep)

See [`docs/strategy/EMAIL_PROVIDER_PHASES.md`](../strategy/EMAIL_PROVIDER_PHASES.md) for migration plan.

---

## Quick reference: file locations in the repo

For reading the implementation:

| Component | File |
|---|---|
| Resend send + per-tenant from-line | `packages/backend/src/services/resendProvider.ts` |
| Domain registration + verification | `packages/backend/src/services/emailDomainService.ts` |
| Webhook handler (HMAC + idempotency) | `packages/backend/src/routes/resendWebhook.ts` |
| Suppression list + consent gate | `packages/backend/src/services/campaignService.ts` |
| Unsubscribe endpoint | `packages/backend/src/routes/unsubscribe.ts` |
| Per-tenant rate budget | `packages/backend/src/services/emailRateLimit.ts` |
| Pre-send content lint | `packages/backend/src/services/contentLint.ts` |
| Test send script | `scripts/test-email-send.mjs` |

---

**Questions during setup:** include the relevant log line, env-var name (sanitized), and Mail-Tester URL or webhook attempt id from the Resend dashboard. Most issues are diagnosable in <5 min if those three are in hand.
