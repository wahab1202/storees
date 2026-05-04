# WhatsApp Growth + Compliance — Implementation Plan

> Honest version, not the gray-channel fantasy. Five capabilities, sequenced
> by dependency. DPDP compliance and template lifecycle ship first — they're
> the foundation everything else stands on. Without them, the WABA gets
> torched the first time a user complains.

---

## Sequencing logic

```
Phase F1 — Foundation (DPDP + template lifecycle)
  ├── F1a: Consent audit log UI + per-project frequency caps  (capability 4)
  └── F1b: Template submission + re-categorisation handling   (capability 5)
       │
       ▼
Phase F2 — Growth levers (the actual revenue features)
  ├── F2a: CTWA campaign integration  (capability 1)
  └── F2b: On-site opt-in widgets     (capability 2)
       │
       ▼
Phase F3 — Recovery
  └── F3:  Retroactive identity-resolution flow re-eval  (capability 3)
```

**Why this order:**
- Shipping CTWA without an audit log = WABA quality rating crater the first time someone complains to Meta and we can't show source/timestamp/text.
- Shipping CTWA without a template approval pipeline = workflow breaks every time Meta re-categorises a template (frequent).
- F2 capabilities depend on F1 for compliance + working templates.
- F3 is the most complex (replay engine) and the cherry on top — it makes browse-abandonment work right, but it doesn't unblock revenue on its own.

---

## What's already in the codebase

Survey result before planning, so each capability spec is accurate:

| Component | State | File |
|---|---|---|
| 5 WhatsApp providers (Bird, Gupshup, Twilio, Vonage, Meta) | ✅ Wired | `packages/backend/src/services/providers/` |
| Inbound WhatsApp ingestion | ✅ Persists messages | `packages/backend/src/services/whatsappInboundService.ts` |
| `consents` table (channel + purpose + status) | ✅ Schema | `schema.ts:412` |
| `consent_audit_log` table (action, source, text, IP) | ✅ Schema **but never written to anywhere in code** | `schema.ts:567` |
| Frequency cap enforcement in `deliveryService` | ⚠️ Hardcoded 5/day promo, not per-project | `deliveryService.ts:225` |
| `whatsapp_templates` table | ✅ Schema, sync from provider | `schema.ts:724` |
| `identities` table (cross-identifier merge) | ✅ Schema | `schema.ts:396` |
| Flow trigger evaluator | ⚠️ Stub — `_event` + `_projectId` unused | `packages/flows/src/trigger.ts` |
| CTWA referral payload parsing | ❌ Not handled in inbound service | — |
| On-site widgets | ❌ Not in repo | — |
| Retroactive identity-merge flow re-eval | ❌ Not implemented | — |
| Template submission UI | ❌ Sync exists, submit doesn't | — |
| Template re-categorisation webhook handler | ❌ | — |

---

## Capability 4 — Opt-in audit log + frequency caps (FOUNDATION, ship first)

**Goal:** Every consent change is auditable. When a user complains to Meta
about an unwanted message, the merchant produces the consent log within
seconds: source, timestamp, exact text shown, IP. Frequency caps are
configurable per project, enforced cross-channel.

**Why first:** DPDP Act is in force. Storees is liable as a data processor;
merchants are liable as data fiduciaries. An audit log isn't a feature —
it's a regulatory floor. Frequency caps are the easiest preventive measure
against the user complaints that trigger the audits.

### What's in place
- `consent_audit_log` schema exists (✅) but **no write path in code** — needs to be wired everywhere consent changes
- `consents` table tracks current state
- `deliveryService.checkFrequencyCap` exists but is hardcoded (5/day, promotional only)

### What's missing
- Audit log write path on every consent transition
- Audit log read API + admin panel UI per customer
- Per-project frequency cap config (currently global hardcoded constant)
- Per-channel + per-purpose cap (e.g. WhatsApp marketing 1/week vs SMS marketing 3/week)
- DPDP-required consent text display (capture the exact wording the user agreed to)
- Export endpoint for compliance audits

### Tasks (~3-4 days)

| # | Task | Files |
|---|---|---|
| F1a-1 | Migration: `projects.frequency_caps` JSONB column with shape `{ "whatsapp_marketing": { perDays: 7, max: 1 }, "email_marketing": {...}, ... }` and sensible defaults | new `0017_frequency_caps.sql` |
| F1a-2 | Replace `checkFrequencyCap` hardcoded constant with config lookup; cache per-project | `deliveryService.ts` |
| F1a-3 | Wire `consent_audit_log` writes into every consent change point: SDK opt-in API, admin UI toggle, webhook STOP keyword, one-click unsubscribe (we already write to `consents` in `unsubscribeService` — extend to also write the audit row) | `consentService.ts` (new), `unsubscribeService.ts`, `whatsappInboundService.ts` (STOP keyword detection) |
| F1a-4 | Backend: `GET /api/customers/:id/consent-history` returns audit log (admin-only) | `routes/customers.ts` |
| F1a-5 | Backend: `GET /api/projects/:id/consent-export?from=&to=` streams CSV of audit log for date range (DPDP audit) | `routes/v1Onboarding.ts` |
| F1a-6 | Frontend: customer detail page → new "Consent" tab showing log table (date, channel, action, source, IP, text) | `ConsentTab.tsx` |
| F1a-7 | Frontend: Settings → Project → "Frequency Caps" section with per-channel cap UI | `settings/project/page.tsx` extension |

### Risks
- **Migration risk:** existing consent changes haven't been audited. Backfill from `consents.consentedAt`/`revokedAt` with `source='backfill'`, `consent_text=null`. Document the discontinuity.
- **STOP keyword detection** is non-trivial — message body parsing across providers. Defer to F1a-8 follow-up if needed.

---

## Capability 5 — Template lifecycle (FOUNDATION, parallel with capability 4)

**Goal:** Merchants submit a template through the panel, Storees pushes it to
Meta via the configured provider (Meta Cloud, Pinnacle, Gupshup, Twilio),
tracks approval status, surfaces re-categorisation events, and prevents
campaign sends against templates Meta has invalidated.

**Why parallel with capability 4:** F2 (CTWA, widgets) depends on having
welcome templates that are actually approved. Without this, F2 launches and
then stops sending the moment Meta auto-recategorises a template — which
they do, frequently, with zero notice.

### What's in place
- `whatsapp_templates` table with status, body, params, raw payload
- Providers can sync existing templates back from Meta (read path)
- Campaign send picks a template by `providerTemplateId`

### What's missing
- Submission flow (admin UI → backend → Meta API via provider)
- Status polling / webhook for approval
- Re-categorisation handler (Meta moves Marketing → Utility, breaks campaigns)
- Linter (flag likely-rejection patterns before submit — promotional content in Utility category, > 1024 char body, missing variables, etc.)
- Frontend "Templates" page (probably exists in some form — verify before scoping UI work)

### Tasks (~5-7 days)

| # | Task | Files |
|---|---|---|
| F1b-1 | Migration: add `whatsapp_templates.submitted_at`, `last_status_check_at`, `rejection_reason`, `previous_category` (for tracking re-categorisations) | new `0018_template_lifecycle.sql` |
| F1b-2 | Provider interface extension: `submitTemplate(template) → providerTemplateId`, `getTemplateStatus(id) → status` (Meta Cloud, Pinnacle have this; Bird/Gupshup/Twilio differ) | provider files in `services/providers/` |
| F1b-3 | Submission API: `POST /api/whatsapp/templates` (admin) — write `PENDING` row, async submit to provider, update status on response | `routes/whatsappAdmin.ts` |
| F1b-4 | Status polling cron — every 4h, refresh status for `PENDING` rows older than 1h | new `workers/templateStatusWorker.ts` |
| F1b-5 | Provider webhook handler for status changes (Meta sends `template_status_update` webhook with new category, old category, rejection reason) | `routes/channelWebhooks.ts` extension |
| F1b-6 | Re-categorisation alert: when category changes Marketing → Utility (or vice versa), email project admins + flag affected campaigns/flows in the UI | `services/templateAlertService.ts` (new) |
| F1b-7 | Linter: synchronous validation before submit. Rules: body length, parameter count match, no emojis in Utility, no marketing-y phrases ("flat 50% off") in Utility, header type matches body | `services/templateLinter.ts` (new) |
| F1b-8 | Frontend: Templates page → "New Template" form → preview + lint warnings → submit → status pill (PENDING/APPROVED/REJECTED) | `templates/page.tsx`, new component `TemplateSubmitForm.tsx` |

### Risks
- Different providers have different submission shapes. Meta Cloud is the cleanest; Pinnacle wraps it; Gupshup/Twilio require partner-side approval workflows. **Start with Meta Cloud only**; defer multi-provider abstraction until we have a real second-provider customer.
- Re-categorisation events are rare but devastating. Even if F1b-6 isn't perfect, the *detection* of the change in `previous_category` column is enough to flag it via a daily cron.

---

## Capability 1 — CTWA campaign integration (THE GROWTH LEVER)

**Goal:** Merchant runs a Click-to-WhatsApp ad in Meta Ads Manager. User
taps → opens WhatsApp thread → Meta forwards the inbound to Storees via
webhook. Storees creates/merges the contact, writes consent with
`source = ctwa_ad_<campaign_id>` and the exact ad creative/click metadata,
fires the welcome template instantly, and queues a 24h browse-abandon
follow-up if no purchase.

**Why this matters:** This is the single highest-leverage feature. Without
it, merchants are paying Meta for ad clicks but losing the contact the
moment they don't reply. With it, every ad click becomes a list addition
with full attribution.

### What's in place
- Meta Cloud provider (`metaWhatsappProvider.ts`) — sends, but inbound CTWA referrals not parsed
- `whatsappInboundService.persistInboundMessages` — persists messages but doesn't extract CTWA referral fields

### What's missing
- CTWA referral payload parsing in the inbound flow
- Linkage table: `ctwa_attributions` (customer ↔ ad campaign ↔ first inbound timestamp)
- Flow trigger that fires on `whatsapp_inbound_first_from_ad` event with the ad metadata bound
- Welcome template send-immediate flow (depends on F1b approved templates)
- Consent record with full ad context (`source = 'ctwa_ad_<adId>'`, `metadata = { campaign_id, ad_id, headline, body, click_url, click_token, source_url }`)

### How CTWA actually works (Meta Cloud API)

When a user taps a CTWA ad and sends their first message, the inbound webhook
payload includes a `referral` object:

```json
{
  "messages": [{
    "from": "919999999999",
    "id": "wamid.xyz...",
    "timestamp": "1717000000",
    "type": "text",
    "text": { "body": "Hi" },
    "referral": {
      "source_url": "https://fb.me/abc123",
      "source_type": "ad",
      "source_id": "23857..." ,           // Meta ad/campaign id
      "headline": "Chat to claim ₹150 off",
      "body": "Tap to start your order",
      "media_type": "image",
      "image_url": "https://...",
      "ctwa_clid": "click_token_xyz"      // unique per click
    }
  }]
}
```

The `referral` object is ONLY present on the first message after a CTWA ad
click (or possibly on subsequent messages within the same conversation —
verify against Meta docs at implementation time). Storees treats this as
the implicit DPDP-compliant opt-in for marketing messages, since the user
clicked an ad acknowledging marketing intent.

### Tasks (~4-5 days)

| # | Task | Files |
|---|---|---|
| F2a-1 | Migration: `ctwa_attributions` table (project_id, customer_id, ad_id, campaign_id, headline, body, source_url, ctwa_clid, click_url, first_inbound_at) — uniq on (project_id, customer_id, ad_id) | new `0019_ctwa_attribution.sql` |
| F2a-2 | Extend Meta inbound parser to extract `referral` object | `services/providers/metaWhatsappProvider.ts` |
| F2a-3 | In `whatsappInboundService.persistInboundMessages`: if message carries CTWA referral, write `ctwa_attributions` row + insert `ctwa_lead_received` event with full ad metadata as event properties + write `consents` row (channel=whatsapp, purpose=promotional, status=opted_in, source='ctwa_ad', provider='meta') + `consent_audit_log` row (with `source_url` as the consent text per DPDP) | `whatsappInboundService.ts` |
| F2a-4 | Flow trigger: `event_name = 'ctwa_lead_received'` becomes a first-class trigger type in the flow builder. Conditions can branch on `properties.campaign_id` so the merchant runs different welcome flows per campaign | `packages/flows/src/trigger.ts`, frontend builder |
| F2a-5 | Default flow template: "CTWA Welcome" with two nodes (welcome template send, 24h delayed browse-abandon condition + offer) — installable via wizard | `services/flowTemplates.ts` (new) |
| F2a-6 | Frontend: Campaigns page → new "CTWA Attribution" view showing leads-by-ad table, with funnel (lead → conversation → purchase) | `campaigns/ctwa/page.tsx` (new) |

### Risks
- **Pinnacle / Gupshup / Twilio CTWA support varies.** Meta Cloud has the cleanest referral payload. Phase scope to Meta Cloud only first; partner providers usually pass through the referral but field naming differs. Document explicitly and don't promise CTWA on other providers until tested.
- **The 24h messaging window.** Once a user messages a business, Meta opens a 24h window where the business can send free-form messages. After 24h, only approved templates can be sent. Welcome flow logic must respect this window.
- **`ctwa_clid` deduplication.** Same user can click the same ad multiple times. Use it for conversion attribution, not for deduping leads (a returning lead is still an interesting signal).

---

## Capability 2 — On-site opt-in widgets

**Goal:** A configurable Storees-managed widget the merchant drops on their
storefront. Triggers (exit-intent / time-on-page / scroll-depth), phone
field, pre-checked WhatsApp consent (legal under DPDP if disclosed). On
submit: contact created/merged + consent recorded + welcome template fires.

### What's in place
- `packages/sdk/` JS SDK (already used for storefront event tracking)
- `events` v1 ingestion endpoint
- `resolveCustomer` identity resolution

### What's missing
- A widget render layer in the SDK (popup/inline form)
- Widget config UI in the panel (trigger type, copy, consent text, target page rules)
- Public ingestion endpoint `POST /v1/optin` with rate limit + recaptcha-style abuse prevention
- Phone E.164 normalisation + per-country prefix UI

### Tasks (~5-6 days)

| # | Task | Files |
|---|---|---|
| F2b-1 | Migration: `optin_widgets` table (project_id, name, trigger_type, trigger_config JSONB, headline, body, button_label, consent_text, target_pages, is_active) | new `0020_optin_widgets.sql` |
| F2b-2 | SDK: new `Storees('widget', config)` API. Renders an injected DOM element. Modal with phone field + consent checkbox + submit. POSTs to `/v1/optin` | `packages/sdk/src/widget.ts` (new) |
| F2b-3 | Backend: `POST /v1/optin` (public, API key auth via apiKey query param). Body: `{ phone, name?, consent_text, source_url, widget_id }`. Normalises phone to E.164, calls `resolveCustomer`, writes `consents` + `consent_audit_log` with IP from request, fires `optin_received` event for flow triggering | `routes/v1OptIn.ts` (new) |
| F2b-4 | Rate limit: per-IP 5/hour and per-project-API-key configurable; basic recaptcha-equivalent honeypot field | abuse-prevention middleware |
| F2b-5 | Frontend: Marketing → Widgets page → list/create/edit widget with live preview and embed snippet | new `widgets/` page |
| F2b-6 | Default flow template: "Widget Opt-in Welcome" — wired the same way as CTWA welcome | `services/flowTemplates.ts` |

### Risks
- **DPDP pre-checked checkboxes.** Legal in India *if disclosed*. The consent text must explicitly say "By submitting your phone, you agree to receive WhatsApp messages from <brand>." Linter validates this on widget create.
- **Phone normalisation.** India numbers come in 6 different formats (`+91...`, `91...`, `0...`, 10-digit raw, with/without spaces). Use `libphonenumber-js` (already a common JS dep). Validate country prefix matches widget config.

---

## Capability 3 — Retroactive identity-resolution flow re-evaluation

**Goal:** When an anonymous browser_id resolves to a known customer (UTM
token from a prior email click, form submission, Shopify login), the
workflow engine re-evaluates the last 30 days of events for that browser
and triggers eligible flows. This is what makes "browse abandonment"
actually work — most browses are anonymous at first and resolve later.

**Why last:** This is the most complex piece (replay engine, idempotency on
already-fired triggers, lookback windows). Worth shipping after F1+F2 are
proven. Without it, browse-abandonment flows fire on a small slice of
already-known customers — useful but limited. With it, browse-abandonment
catches the much bigger anonymous-then-resolved cohort.

### What's in place
- `identities` table (project_id, customer_id, identifier_type, identifier_value)
- `resolveCustomer` already merges by external_id / email / phone
- Events have a customer_id but anonymous events probably don't (verify) — they may use a session id or be dropped

### What's missing
- An **anonymous_id concept** in the events ingestion — events from un-identified browsers tagged with browser/session id, customer_id NULL
- An identity-resolution trigger: when a browser session resolves to a customer (via email click → UTM token → cookie set, or form submit, or Shopify login), enqueue a "backfill" job
- The backfill worker: assign customer_id to last 30 days of events for that session, then replay them through the trigger evaluator with idempotency keys to prevent duplicate flow trips
- A flow_trip-level dedup key: (flow_id, customer_id, trigger_event_id) → unique, so replaying an already-fired trigger doesn't double-enroll

### Tasks (~7-10 days — biggest piece)

| # | Task | Files |
|---|---|---|
| F3-1 | Migration: `events` add `session_id` column (nullable, indexed) for anon browser tracking. New `anonymous_sessions` table mapping session_id ↔ customer_id once resolved | new `0021_session_resolution.sql` |
| F3-2 | SDK: send session_id with every event (cookie, 30d sliding) when no `userId` is identified. On `Storees.identify()`, the SDK calls a new `/v1/identify` endpoint that links session_id → external_id | `packages/sdk/src/core.ts`, `packages/sdk/src/identity.ts` |
| F3-3 | Backend: `POST /v1/identify` — resolves customer (existing `resolveCustomer`), writes `anonymous_sessions` row, enqueues `identity-merged` BullMQ job | new `routes/v1Identity.ts` |
| F3-4 | Identity-merge worker: reads last 30 days of events with `session_id = X AND customer_id IS NULL`, sets `customer_id = Y`, then for each previously-anonymous event re-publishes to the events queue with a `replayed = true` flag | new `workers/identityMergeWorker.ts` |
| F3-5 | Flow trigger evaluator: accept `replayed` flag, use `(flowId, customerId, triggerEventId)` as idempotency key in `flow_trips` so re-entry is prevented | `packages/flows/src/trigger.ts`, migration adding unique index on flow_trips |
| F3-6 | Lookback window enforcement: events older than the flow's `lookbackDays` (default 30, configurable) are skipped during replay | flow trigger evaluator |
| F3-7 | Observability: per-resolution metric "events back-attributed" + "flows triggered from replay" so we can prove the feature is working | dashboard query + metric card |

### Risks
- **Replay storms.** A merchant with 100K active anonymous sessions per day suddenly identifies 5K of them via a campaign click. Worker must rate-limit replays so it doesn't saturate the events queue.
- **Idempotency at the flow_trip level is critical.** Without the unique index on (flow_id, customer_id, trigger_event_id), replays will double-enroll customers in flows.
- **Session expiration.** If the cookie's 30-day window has elapsed before identification, lookback is bounded by what events still carry the session_id. Document this limitation; don't promise lookback longer than the cookie window.

---

## Cross-cutting infrastructure (build once, used by 1-3)

These show up in multiple capabilities — implement once during F1, share:

| Component | First needed by | Used by |
|---|---|---|
| Per-project frequency caps config | F1a | F2a, F2b, F3 |
| Audit-log write helper (`logConsentChange()`) | F1a | F2a, F2b, F3 (re-attribution writes audit) |
| Consent-recording helper that does both `consents` upsert AND audit log | F1a | F2a, F2b |
| Flow trip idempotency key | F3 | F2a (CTWA welcome must dedupe), F2b (widget welcome dedupe) |
| Event publication with metadata (ad_id, source_url, ctwa_clid) | F2a | F2b (widget metadata), F3 (replayed flag) |

**Implication:** F1a should land first because it forces the consent-recording
helper into existence, which both F2 capabilities need.

---

## Time estimate (one engineer, focused)

| Phase | Days | Notes |
|---|---|---|
| F1a — audit log + freq caps | 3-4 | Schema mostly done; UI is the bulk |
| F1b — template lifecycle | 5-7 | Provider abstraction + linter + UI |
| F2a — CTWA integration | 4-5 | Webhook parsing + flow template + attribution UI |
| F2b — on-site widgets | 5-6 | SDK widget + config UI + public ingestion |
| F3 — retroactive replay | 7-10 | Most complex; idempotency + replay storms + observability |
| **Total** | **24-32 days** | ~5-6 weeks if dedicated; longer interleaved |

Realistic shippable order with buffer:
- **Week 1-2:** F1a + F1b in parallel (compliance unblock)
- **Week 3:** F2a (CTWA) — the revenue lever
- **Week 4:** F2b (widgets)
- **Week 5-6:** F3 (replay engine)

---

## What to build first if budget is one feature

**F2a (CTWA integration)** *only if F1a is already done or can be done as a prereq subtask.* CTWA is the highest-revenue-impact feature; F1a is the legal floor. F1b is a hard dependency only if you intend to send marketing templates immediately on lead arrival; for an MVP you can use the auto-approved Meta utility templates ("Welcome to <brand>! Reply 1 for catalog.") without going through F1b.

So minimal viable revenue path: F1a (3 days) → F2a-1 through F2a-5 with hardcoded utility welcome template (3 days) = **6 days to first CTWA campaign live**. F1b and F2a-6 (attribution UI) follow in week 2.
