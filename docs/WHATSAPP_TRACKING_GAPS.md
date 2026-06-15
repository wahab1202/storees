# WhatsApp / Meta tracking — gaps & scope

Status as of 2026-06-15. Grounded in the current code, after the webhook-secret
fix (`126f5be`). Ordered by value-vs-effort. "Built" items are noted so we don't
re-scope them.

---

## 0. Already working (don't rebuild)
- **Delivery + read receipts** — flow once the callback is registered (now automatic
  per-project, `126f5be`). `delivered`/`read` update `messages` + mirror to `campaign_sends`.
- **CTWA attribution** — inbound click-to-WhatsApp ad referrals are captured
  (`ctwa_attributions` + `ctwa_lead_received` event) in `whatsappInboundService`.
- **Template status/category sync** — webhook + poll reconcile approval status.

## Platform limits (cannot fix, set expectations)
- **Call (PHONE_NUMBER) buttons emit no event** — tapping "Call" dials the device;
  Meta sends nothing. Click is unobservable by design.
- **"Opened" = read receipt** — only fires if the recipient has blue-tick read
  receipts enabled. 0 opens can be legitimate.

---

## P1 — Click tracking for WhatsApp (the asked item)

**Problem.** WhatsApp URL buttons open a link but Meta sends no click event. The only
way to attribute a tap is to route the URL through our own redirect that logs then
302s. Two hard constraints:
1. Template button URLs are **baked at Meta approval** — the redirect **domain must be
   final and durable before submitting templates** (already called out as a hard rule in
   the carousel-engine spec).
2. The current `urlTracker` is **in-memory** (`Map` in `routes/urlTracker.ts`) — links die
   on restart and don't work across the two pm2 checkouts. Unusable for permanent,
   baked-in WhatsApp button URLs.

**Scope.**
- **Durable short-link service** — a `tracked_links` table (`id`, `project_id`,
  `message_id`/`campaign_id`, `customer_id`, `original_url`, `created_at`, `click_count`,
  `first_clicked_at`). Replace the in-memory Map; key by a short slug.
- **Stable redirect domain** — decide + lock (e.g. `go.storees.io/c/<slug>`). Must be set
  before any template with URL buttons is submitted.
- **Redirect endpoint** — `GET /c/:slug` → log click (`messages.clicked_at`/status,
  per-channel `${channel}_clicked` event) → 302 to original. Generalize the SMS-only
  `sms_clicked` to the message's channel.
- **Wrap button URLs at template build/send** — when a template has a URL button, store the
  destination and submit the short-link as the button URL (dynamic suffix for per-recipient
  attribution where the template allows a URL variable).
- **Campaign "Clicked" stat** already reads `clicked_at` — populates for free once the above lands.

**Effort:** M–L (schema + service + redirect + template-build wiring + domain/DNS).
**Note:** this is also the carousel-engine prerequisite — build once, both benefit.

## P1 — Thread webhook `failed` error into `failure_reason`

**Problem.** `handleDeliveryReceipt(providerMessageId, status, …)` takes **no error text**,
so an async (webhook-reported) failure sets `status='failed'` but leaves
`failure_reason` blank. `cdaddc2` only fixed the *synchronous* block path. This is
handover loose-end #2.

**Scope.** Parse `statuses[].errors[]` (Meta `{ code, title }`) in the Pinnacle webhook,
pass the text to `handleDeliveryReceipt`, persist to `messages.failure_reason`, and mirror
to `campaign_sends.failure_reason` (reuse `mirrorCampaignReceipt`).

**Effort:** S. **High value** — closes the "failed with no reason" gap end-to-end.

## P2 — Capture `conversation` + `pricing` from status webhooks

**Problem.** The webhook discards `value.statuses[].conversation` and `.pricing` — so there's
no WhatsApp **cost / conversation-category** analytics (Meta bills per 24h conversation:
marketing/utility/auth/service).

**Scope.** Persist conversation id + category + pricing on a per-message basis (new columns
or a `whatsapp_conversations` table); surface spend in campaign analytics.

**Effort:** M. Value depends on whether cost reporting matters for the demo.

## P2 — Media-header resumable upload (real `header_handle`)

**Problem.** Media-header template submission passes a public sample URL as
`example.header_handle`; if Meta rejects it, image/video/doc headers fail. Handover
loose-end #1, and a carousel-engine blocker (carousel cards are media-headed).

**Scope.** Implement Meta resumable-upload to mint a real `header_handle` at submit time.

**Effort:** M. Needed before dynamic carousels; optional for simple text templates.

## P3 — Inbound opt-out (STOP) → consent

**Problem.** Inbound replies are persisted, but opt-out keywords (STOP/UNSUBSCRIBE) aren't
mapped to a consent opt-out. Marketing sends could continue to someone who said STOP —
a compliance risk.

**Scope.** Detect opt-out keywords in `whatsappInboundService`, write a `consents` opt-out
row for (project, customer, whatsapp, promotional). Optionally an opt-in keyword too.

**Effort:** S–M. Compliance-driven priority.

## P3 — Number quality / messaging limits visibility

**Problem.** No surfacing of WABA quality rating, messaging tier, or per-number health, so a
flagged/limited number fails silently.

**Scope.** Poll WABA phone-number quality + tier; show on the Settings connected card next
to the delivery-tracking health indicator.

**Effort:** M.

---

## Suggested order
1. **P1 webhook `failed` reason** (small, finishes the failure-visibility story).
2. **P1 durable short-link + click tracking** (unblocks WhatsApp clicks *and* the carousel engine).
3. P2 conversation/pricing, P2 media-handle, P3 opt-out, P3 quality — as the roadmap needs.
