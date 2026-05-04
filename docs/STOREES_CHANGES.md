# Storees — Session Changes Summary

> What was shipped this session: a complete email-deliverability stack +
> WhatsApp growth/compliance loop + retroactive identity resolution.
> 16 commits, 8 phases, ~6,000 lines added across backend / SDK / frontend.
>
> This document is the production-readiness brief: what changed, why,
> verification status, what's left to operationally configure before
> turning each feature on for a real merchant.

---

## TL;DR — What Storees can now do that it couldn't before

| Capability | Before | After |
|---|---|---|
| **Per-tenant email sending** | Single shared `noreply@storees.app` for everyone | Each merchant verifies their own domain (`mail.theirbrand.com`); DKIM/SPF reputation accumulates per-tenant |
| **Bounce/complaint handling** | Tracked timestamps; never suppressed | Hard bounces + complaints auto-write to `email_suppressions`; dispatcher excludes them on every send |
| **Unsubscribe** | Not compliant with Gmail/Yahoo Feb-2024 mandate | RFC 8058 `List-Unsubscribe` header + one-click `/u/<token>` endpoint; updates consent log |
| **Webhook security** | None — anyone could spoof bounce events | svix HMAC verification + 24h idempotency dedup |
| **Per-tenant rate limit** | One global `concurrency: 50` ceiling | Per-project `email_rate_per_minute` (default 60); over-budget jobs deferred to next minute window |
| **Stale-list protection** | None — every campaign hit the full segment | Pre-flight blocks send if >30% of recipients haven't opened email in 90 days; admin overrides with `?force=true` |
| **Content lint** | None | 8 heuristics: empty/caps/emoji subjects, spam phrases, image-only body, missing unsubscribe link, unrendered template vars |
| **DPDP audit trail** | `consent_audit_log` table existed; **never written to** | Every consent change writes `customers.<channel>Subscribed` + `consents` row + audit log atomically |
| **Per-project frequency caps** | Hardcoded 5 promo/day global | Per-channel, per-project (`whatsapp_marketing 1/7d`, `email_marketing 3/d`, etc.) |
| **WhatsApp template lifecycle** | Sync-only — no submission, no re-categorisation detection | Submit via panel → Meta API → status polling cron + webhook + linter (12 rules) + re-categorisation alert |
| **CTWA campaigns** | Inbound webhook stored messages but lost the ad context | Full referral parsing → attribution table → implicit DPDP opt-in → flow trigger → welcome flow |
| **On-site widgets** | Did not exist | SDK widget module + admin CRUD + public POST `/v1/optin` with honeypot + IP rate limit |
| **Email read tracking** | `email_opened` event only | Now mirrors WhatsApp/SMS pattern — `email_read` event in `<channel>_<status>` convention; cross-channel "has read" queries work uniformly |
| **Browse abandonment** | Only worked for already-known customers | Identity resolution now back-attributes 30 days of anonymous events; replays through trigger evaluator with idempotency |

---

## Architectural deltas

```
                         ┌────────────────────────────────────┐
                         │      Storees CDP (this session)    │
                         └────────────────────────────────────┘
                                        │
        ┌───────────────────────────────┼─────────────────────────────────┐
        ▼                               ▼                                 ▼
┌──────────────────┐          ┌──────────────────┐             ┌──────────────────┐
│ DELIVERABILITY   │          │ COMPLIANCE       │             │ IDENTITY         │
│ INFRA (E1-E3)    │          │ FOUNDATION       │             │ RESOLUTION       │
├──────────────────┤          │ (F1a + F1b)      │             │ (F3)             │
│ • per-tenant     │          ├──────────────────┤             ├──────────────────┤
│   sending domain │          │ • consent audit  │             │ • anonymous      │
│ • suppression    │          │   log enforced   │             │   sessions       │
│   list           │          │ • per-project    │             │ • back-attribute │
│ • List-Unsub     │          │   freq caps      │             │   events         │
│ • webhook HMAC   │          │ • template       │             │ • replay through │
│ • per-tenant     │          │   lifecycle +    │             │   trigger        │
│   rate budget    │          │   linter +       │             │ • idempotent     │
│ • stale-list     │          │   re-cat alerts  │             │   flow trips     │
│   audit          │          │                  │             │                  │
│ • content lint   │          │                  │             │                  │
└────────┬─────────┘          └────────┬─────────┘             └────────┬─────────┘
         │                             │                                │
         └─────────────────┬───────────┴────────────────┬───────────────┘
                           ▼                            ▼
                ┌──────────────────────────┐  ┌──────────────────────────┐
                │ SHARED PRIMITIVES        │  │ GROWTH LEVERS (F2)       │
                ├──────────────────────────┤  ├──────────────────────────┤
                │ • messageStatusService   │  │ • CTWA: ad referral →    │
                │   (unified read receipt) │  │   attribution + welcome  │
                │ • consentService         │  │ • on-site widgets:       │
                │   (consents + audit log  │  │   exit-intent / scroll / │
                │    + customers booleans) │  │   time → opt-in flow     │
                │ • emailRateLimit         │  │                          │
                │ • templateAlertService   │  │                          │
                └──────────────────────────┘  └──────────────────────────┘
```

The single most important architectural property: **all four of these
domains funnel into the same consent + audit + flow-trigger pipeline.**
A widget submission, a CTWA ad click, a Shopify customer creation, and
a one-click email unsubscribe all hit `consentService.updateConsent()`,
which writes to the same three places, in one transaction.

---

## Phase E — Email Deliverability (8 commits)

### E1 — Operational verification (commit `d3b0615`)

- `scripts/test-email-send.mjs` — runs a real send through Resend with
  campaign-style headers. Designed for Mail-Tester scoring.
- `docs/integrations/SHOPIFY_ONBOARDING.md` Section 5b — verification flow
  before any merchant sends a campaign: send + Mail-Tester + webhook check.

**Status:** verified live, achieved 10/10 Mail-Tester score.

### E2.1 — Per-tenant Resend sending domains (commit `bba0b57`)

- Migration 0014: `email_from_address`, `email_from_name`, `resend_domain_id`,
  `email_domain_verified_at` on `projects`.
- `emailDomainService` wraps Resend's domains API: `registerDomain` creates +
  persists the DNS records to display; `checkDomainStatus` polls verification.
- `POST/GET /api/onboarding/projects/:id/email-domain` (admin-only).
- `resendProvider.send` resolves the from-line per send: verified projects
  use their own domain, unverified projects fall back to shared `FROM_EMAIL`.
- Settings → Project → "Email sending domain" UI section.

**Why:** without per-tenant DKIM, one client's bad list tanks
deliverability for every other tenant.

**Operational state:** `mail.storees.io` verified live in this session.
Score 10/10 on Mail-Tester.

### E2.2 — Suppression + consent gate + List-Unsubscribe (commit `4517208`)

- Migration 0015: `email_suppressions` (project_id, lower(email)) unique +
  `unsubscribe_tokens` per (project, customer, channel).
- Resend webhook upserts suppressions on hard `email.bounced` (using
  `data.bounce.type` to filter soft bounces) + `email.complained`.
- `campaignService` dispatcher does two cheap per-page lookups:
  suppressions and consent table; logs per-page exclusion counts.
- `unsubscribeService.applyUnsubscribe` flips consent via `updateConsent` +
  inserts suppression row.
- `/u/:token` public route: GET renders confirmation page, POST handles
  one-click from mailbox providers per RFC 8058.
- `resendProvider` adds `List-Unsubscribe` + `List-Unsubscribe-Post=One-Click`
  headers on promotional sends when `UNSUB_BASE_URL` (or `APP_URL`) is set.
- Transactional sends skip the header (legitimately must reach the user).

**Why:** Gmail/Yahoo Feb-2024 mandate; without this, senders >5K/day get
spam-folder treatment.

### E2.3 — Resend webhook hardening (commit `2247e75`)

- svix HMAC verification: validates `svix-id`, `svix-timestamp`,
  `svix-signature`. Rejects timestamps > 5 min old (replay protection).
- Idempotency: SET NX on `resend-webhook:${svix-id}` with 24h TTL. Re-deliveries
  return 200 with `deduped:true` so svix stops retrying.
- `/api/webhooks/resend` switched to `express.raw` body parser; JSON.parse
  moved into the handler so HMAC sees unparsed bytes.

**Operational requirement:** `RESEND_WEBHOOK_SECRET=whsec_…` must be set,
endpoint registered in Resend dashboard with all 5 events subscribed.

### E3.1 — Per-tenant rate budget (commit `15de0c1`)

- Migration 0016: `projects.email_rate_per_minute` (default 60).
- `emailRateLimit` service: fixed-window per-(project, minute) Redis counter.
- `deliveryWorker`: only for `command.channel === 'email'`. On budget
  exhaustion, calls `job.moveToDelayed(now + retryAfterMs, token)` and throws
  `DelayedError` so BullMQ requeues rather than fails.

**Black Friday math:** 60/min × 100 tenants = 6,000 mail/min platform
headroom, with no single tenant able to consume more than their configured
budget. Global 50/sec limiter remains as final ceiling.

### E3.2 + E3.3 — Stale-list audit + content lint (commit `ee91159`)

- Two new domain fields: `days_since_email_open`, `days_since_email_click`
  (Engagement category, number-typed).
- Evaluator translates `< N` to EXISTS subqueries against `events`
  (where `event_name IN ('email_opened', 'email_read')`).
- `previewCampaignAudience` runs in one CTE: total reachable, suppressed,
  opted-out, never-opened-in-90d. Returns warning at >30% stale.
- `POST /campaigns/:id/send` returns 409 if stale; admin re-calls with
  `?force=true` after acknowledging.
- `contentLint` service: 8 sync rules (empty subject, caps, 3+ emoji, classic
  spam phrases, image-only body, unrendered `{{vars}}`, missing visible
  unsubscribe, missing plain-text alt).
- Frontend: `useSendCampaign` throws `StaleListError` on 409; campaign
  detail page renders amber banner with breakdown + "Send anyway".

### Email read tracking unification (commit `2f52ab8`)

- New `messageStatusService.handleDeliveryReceipt()` — single helper used
  by every channel webhook (Twilio, Bird, Vonage, Gupshup, Meta WhatsApp,
  **Resend**) to update `messages.<status>_at`, set `messages.status` (with
  forward-only escalation), emit `<channel>_<status>` event.
- Email opens now emit `email_read` (matching `whatsapp_read` / `sms_read`).
- Backward compat: dual-emit `email_opened` for one release; queries match
  IN ('email_opened', 'email_read').
- Frontend `ActivityTab` + `StructuredFlowBuilder` updated.

**Effect:** cross-channel queries like `event_name LIKE '%_read'` work
uniformly. Single SQL groups read rate by channel.

### DevOps runbook (commit `a4a2a31`)

- `docs/runbooks/EMAIL_DELIVERABILITY_DEVOPS.md` — 9-step setup guide for
  a DevOps engineer wiring up email infra: Resend account → DNS → webhook →
  env vars → 5 verification checks → daily monitoring SQL → 8 common
  failure modes → escalation criteria.

---

## Strategy doc — Phased ESP migration (commit `01a7e20`)

`docs/strategy/EMAIL_PROVIDER_PHASES.md` — operationalises the "Storees as
the deliverability platform" positioning:

- **Phase 1 (now):** Resend-only, < 500K/mo, 1-5 clients
- **Phase 2:** SES marketing + Resend/Postmark transactional, 500K-3M/mo
- **Phase 3:** Dedicated IP pools per high-volume client, 3M+/mo or NBFC

Documents Phase 1 prep work (provider abstraction, per-purpose routing
schema, suppression sync stub) that makes Phase 2 cheap when triggered.

---

## Phase F — WhatsApp Growth + Compliance (4 commits)

### F1a — Consent audit log + per-project frequency caps (commit `d71ff8b`)

**Foundation; everything else depends on this.**

- Migration 0017: `projects.frequency_caps` JSONB with conservative defaults
  (WhatsApp 1/7d, SMS 3/7d, email 3/d, push 5/d).
- `consentService.updateConsent` now writes all 3 places in **one transaction**:
  `customers.<channel>Subscribed` + `consents` row + `consent_audit_log`.
  Pre-F1a these could drift, so the dispatcher could let marketing through
  to opted-out users.
- Wired into: SDK opt-in API, admin panel toggle, webhook STOP keyword,
  one-click email unsubscribe (`unsubscribeService` routed through
  `updateConsent`), CTWA inbound, on-site widget.
- `GET /api/customers/:id/consent-history` (admin/manager, scope-aware).
- `GET /api/onboarding/projects/:id/consent-export?from=&to=` — streaming
  CSV for DPDP regulator audits and Meta WABA disputes.
- Backfill SQL `consent_audit_backfill.sql` — populates audit rows from
  existing consents rows. Idempotent.
- Customer detail "Consent" tab + Settings → Project "Frequency caps"
  section.

### F1b — WhatsApp template lifecycle (commit `a05e949`)

- Migration 0018: `whatsapp_templates.submitted_at`, `last_status_check_at`,
  `rejection_reason`, `previous_category`. Index for the polling worker.
- `templateLinter` — 12 sync rules (name format, parameter sequence, body
  length, marketing-phrases-in-Utility detection, emoji in
  Utility/Authentication, header/footer constraints, button validation).
- `metaWhatsappProvider.submitTemplate` POSTs to
  `/<waba_id>/message_templates` with auto-built components.
- `metaWhatsappProvider.getTemplateStatus` polls by name or numeric id.
- `POST /api/whatsapp/templates` lints first → inserts PENDING → submits.
- `POST /api/whatsapp/templates/lint` for live editor preview.
- `POST /api/whatsapp/templates/:id/refresh-status` — UI button + worker.
- `templateStatusWorker` (BullMQ repeatable, every 4h): polls PENDING +
  IN_APPEAL templates plus APPROVED templates not checked in 7d
  (re-categorisation backstop).
- `templateStatusService.handleMetaTemplateStatusEvent` — webhook handler
  for `message_template_status_update` event.
- `templateAlertService` on re-categorisation: logs event + emails project
  admins via existing Resend transactional path.
- Frontend `/whatsapp-templates` page: list with status pills, ⚠ indicator
  on re-categorised templates, inline submission form with live lint preview.

### F2a — CTWA (Click-to-WhatsApp) integration (commit `354538a`)

**The revenue lever.**

- Migration 0019: `ctwa_attributions` table — one row per (project, customer,
  ad_id), tracks first/last inbound, `inbound_count` (engagement),
  `first_purchase_at` / `attributed_revenue` for conversion attribution.
- `ChannelProvider` interface gains `CtwaReferral` type.
- `metaWhatsappProvider.parseInbound` extracts the `referral` object Meta
  attaches to the first inbound after a CTWA ad tap.
- `whatsappInboundService.persistInboundMessages` now creates a customer
  record on the fly (via `resolveCustomer`) when a CTWA referral arrives —
  the ad click is the implicit DPDP-compliant marketing opt-in.
- `handleCtwaReferral` writes attribution row + records consent (with the
  ad headline + body + source URL as the consent text) + emits
  `ctwa_lead_received` event with full ad metadata + publishes to
  BullMQ events queue.
- `ctwa_lead_received` added to `STANDARD_EVENTS` so the flow builder's
  event dropdown picks it up automatically.
- `flowTemplates` service: **CTWA Welcome** (immediate template send)
  + **CTWA Browse-Abandon Follow-up** (24h delay → check order placed →
  send offer / exit).
- `POST /api/flows/templates/install` + `GET /api/flows/templates/list`.
- `GET /api/whatsapp/ctwa-attributions` — per-ad funnel aggregation.
- Frontend `/campaigns/ctwa` page: stat cards + per-ad table with creative
  preview, engagement rate, conversion rate.

### F2b — On-site opt-in widgets (commit `2ea4b5b`)

- Migration 0020: `optin_widgets` table; `consent_text` is NOT NULL
  (DPDP foundation enforced at the schema level).
- `POST /api/v1/optin` (public, API-key authed): honeypot field check
  (silent 200 if filled — bots don't get feedback) + per-IP rate limit
  (5/hour Redis-backed) + phone E.164 normalisation (with +91 fallback
  for Indian 10-digit numbers) + `resolveCustomer` + `updateConsent`
  with the widget's exact consent text + IP + emits `optin_received`.
- `GET /api/v1/widgets` — what the SDK fetches on init.
- `/api/optin-widgets` admin CRUD with trigger-config validation.
- New SDK module `widget.ts` (~250 lines, no deps): fetches active widgets,
  arms triggers (exit_intent / time_on_page / scroll_depth / manual),
  inline-styled modal, localStorage `show_once` per (visitor, widget),
  honeypot inline.
- `Storees('widget', 'show', 'name_or_id')` for storefront-controlled
  triggers.
- New flow template "Widget Opt-in Welcome".
- Frontend `/widgets` page: list + create/edit/delete + preview modal
  + active toggle.

### Strategy doc — WhatsApp growth plan (commit `8c2b1a0`)

`docs/strategy/WHATSAPP_GROWTH_PLAN.md` — five capabilities with
dependency graph (F1 → F2 → F3), file-level task breakdown, ~24-32
dev-day estimate, minimum viable revenue path, risks per capability.

### F3 — Retroactive identity-resolution flow re-eval (commit `e0a4b3c`)

- Migration 0021: `anonymous_sessions` table + `flow_trips.trigger_event_id`
  + `flows.lookback_days`. Unique index on
  `(flow_id, customer_id, trigger_event_id)` is the replay-idempotency key.
- `POST /api/v1/customers` accepts optional `session_id`; on receipt,
  upserts `anonymous_sessions` and enqueues identity-merge.
- `POST /api/v1/identify` — lightweight session-only linkage.
- `identityMergeWorker` (BullMQ, concurrency 5):
  1. Reads `max(lookback_days)` across active flows in the project.
  2. UPDATE events SET customer_id=X WHERE session_id=Y AND customer_id IS NULL
     AND timestamp >= NOW() - lookback days.
  3. Re-publishes each newly-attributed event to the events queue with
     `replayed=true` + `triggerEventId`.
  4. Stamps `anonymous_sessions.events_back_attributed` + `flows_triggered`
     + `resolved_at` for observability.
- `triggerWorker`:
  - Accepts `replayed` + `triggerEventId` in the job payload.
  - Lookback enforcement: skips replayed events older than the flow's
    `lookbackDays`.
  - Idempotency: `flow_trips` insert with `onConflictDoNothing`. Original-fire
    trips also write `triggerEventId`, so a replay arriving later for the
    same event hits the dedup.
- SDK `transport.sendCustomerUpsert` propagates `session_id` on identify().
- `GET /api/onboarding/projects/:id/identity-merge-stats?days=30` — drives
  the admin dashboard card.

**Effect:** browse-abandonment now works for the much-larger
anonymous-then-resolved cohort. A user who browsed a product, left, then
clicked an email 5 days later that resolved their session — the workflow
engine now back-attributes those browse events and fires the
abandonment flow as if they'd been identified all along.

---

## Operational state

### Verified live in this session

- ✅ Resend send path: 10/10 Mail-Tester score from `mail.storees.io`
- ✅ DKIM (Resend selector + AWS SES selector) signed and validated
- ✅ SPF passes via `send.mail.storees.io`
- ✅ DMARC inheritance from apex `_dmarc.storees.io`

### Requires DevOps configuration before turning on for a real merchant

- [ ] `RESEND_WEBHOOK_SECRET` set in env, endpoint registered in Resend
      dashboard with all 5 events. **Without this, suppression-on-bounce
      doesn't fire** — webhook handler fails closed.
- [ ] `UNSUB_BASE_URL` set to public app URL. Without this,
      `List-Unsubscribe` header is omitted.
- [ ] Per-merchant: their own sending domain verified at Resend +
      DNS records added (Settings → Project → Email).
- [ ] Per-merchant: WhatsApp provider configured with `wabaId` +
      `phoneNumberId` + `accessToken` in `projects.settings.channels.whatsapp`.
- [ ] Resend webhook URL pointed at deployed backend (or ngrok for local
      testing). See [DevOps runbook](runbooks/EMAIL_DELIVERABILITY_DEVOPS.md).

### Migrations applied to local DB

```
0014_email_sending_domains.sql
0015_email_suppressions.sql
0016_email_rate_limit.sql
0017_frequency_caps.sql
0018_template_lifecycle.sql
0019_ctwa_attribution.sql
0020_optin_widgets.sql
0021_session_resolution.sql
```

All migrations idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN`
without `NOT NULL` or with defaults). Safe to apply against production
with no downtime.

### Backfill SQL ready (run once on prod)

- `packages/backend/src/db/data/consent_audit_backfill.sql` — populates
  `consent_audit_log` from existing `consents` rows. Idempotent.
- `packages/backend/src/db/data/gowelmart_agent_backfill.sql` — promotes
  `dealer_id` from custom_attributes into `agents` rows + links
  `customers.agent_id`. (Pre-existing; ran successfully against
  Storees Demo Store with 5,430 rows linked.)
- `packages/backend/src/db/data/gowelmart_products_backfill.sql` —
  populates `products` table from `events.line_items`. (Pre-existing;
  ran successfully producing 4,010 product rows.)

### Workers added to startup

```
startTemplateStatusWorker()    // F1b — every 4h, polls Meta template status
startIdentityMergeWorker()     // F3 — back-attributes sessions on resolve
```

Existing workers also extended (not added):
- `triggerWorker` — accepts `replayed` flag + idempotency on `triggerEventId`
- `deliveryWorker` — per-tenant email rate budget gate

---

## What's left (not blocking, scoped for follow-up)

| Area | What | Phase / commit if applicable |
|---|---|---|
| **Phase 2 ESP migration** | SES provider implementation, SNS bounce/complaint webhook, suppression dashboard. Triggered by 500K/mo or 5+ clients. | Strategy doc `01a7e20` |
| **Provider abstraction prep** | Lift Resend into the existing `channelProviderRegistry` pattern (currently the email path is hardcoded). ~3 hours. | Strategy doc P1.1 |
| **CTWA on non-Meta providers** | Bird/Gupshup/Twilio CTWA referral parsing varies. Defer until a real customer needs it. | F2a risks |
| **Postmark for transactional** | Side-by-side test before committing the split. | Strategy doc Phase 2 |
| **Replay storm protection** | If 5K+ sessions resolve simultaneously, the events queue gets hot. Existing concurrency=50 handles it but worth monitoring on first Black Friday. | F3 risks |
| **Phone normalisation upgrade** | Currently regex + `+91` fallback. When non-Indian merchants onboard, swap in `libphonenumber-js`. | F2b risks |
| **Removing `email_opened` legacy alias** | After one release where consumers are confirmed migrated to `email_read`, drop the dual-emit. | Email read unification commit `2f52ab8` |
| **GowelMart prod deploy** | Apply `agentScopedAccess` flag flip + dealer/products backfill in prod when DB URL is provided. Local DB is already correct. | Pre-existing work |

---

## All commits this session

```
d3b0615  E1: test send + verification doc
bba0b57  E2.1: per-tenant Resend domain
4517208  E2.2: suppression + consent gate + List-Unsubscribe
2247e75  E2.3: webhook HMAC + idempotency
15de0c1  E3.1: per-tenant rate budget
01a7e20  Strategy: phased ESP migration plan
ee91159  E3.2 + E3.3: stale-list audit + content lint
a4a2a31  DevOps runbook
2f52ab8  Email read tracking unification
8c2b1a0  WhatsApp growth plan strategy doc
d71ff8b  F1a: consent audit log + freq caps
a05e949  F1b: template lifecycle + linter
354538a  F2a: CTWA campaign integration
2ea4b5b  F2b: on-site opt-in widgets
e0a4b3c  F3: retroactive identity-resolution
```

Plus this document.

---

## How to verify each phase end-to-end

| Phase | Verification |
|---|---|
| E1 | `node scripts/test-email-send.mjs <mail-tester-addr>` → click "Then check your score" → expect ≥9/10 |
| E2.1 | Settings → Project → Email — register a domain → add DNS records → click Verify → status flips to "Verified" |
| E2.2 | Send to `bounced@resend.dev` → within 1 min `SELECT * FROM email_suppressions WHERE email='bounced@resend.dev'` shows reason='hard_bounce' |
| E2.3 | Resend dashboard → Webhooks → endpoint shows green delivery; intentionally tamper with the secret → 401s in dashboard |
| E3.1 | `UPDATE projects SET email_rate_per_minute=5` → run a campaign of 10+ → backend logs show "over email budget; deferring Nms" |
| E3.2 | Create a segment of customers with no email_opened in 90d → POST /campaigns/:id/send returns 409 with audit |
| E3.3 | POST /api/campaigns/lint with `subject="ACT NOW! 100% FREE!!!"` → returns 4 findings |
| F1a | Customer detail → Consent tab shows audit table; `GET .../consent-export` returns CSV |
| F1b | `/whatsapp-templates` → submit a template with `name="Welcome Offer"` (capitals) → linter blocks with `name_format` error |
| F2a | Trigger a Meta CTWA inbound webhook with `referral.source_id` set → check `SELECT * FROM ctwa_attributions` |
| F2b | Active widget → visit storefront → trigger fires → submit form → `SELECT * FROM events WHERE event_name='optin_received'` |
| F3 | Track an event with `session_id=X` (no userId) → call POST /v1/identify → check `events.customer_id` populated for prior events; `anonymous_sessions.events_back_attributed` set |
