# Storees WhatsApp Platform — Multi-Provider Build Plan

Companion to `PINNACLE_WHATSAPP_BUILD_PLAN.md`. Where that plan is a Pinnacle-only
connector, this plan makes WhatsApp **provider-choice** and adds the two pillars a
brand-owned WhatsApp platform needs: **business-profile management** and
**per-brand usage metering**.

## Model (from the product decision)

At WhatsApp onboarding, **the brand chooses their provider**:

| Choice | Path | Meta approval needed? |
|---|---|---|
| "I use Meta Cloud API directly" | **Connect-Meta (BYO token)** — paste `phone_number_id` + `waba_id` + system-user token | No |
| "I use Pinnacle" | Existing `connect-pinnacle` (paste apikey) | No |
| "I don't have a provider — use Storees" | **Storees-provisioned (ops-assisted)** — intake form → admin provisioning queue → team links the created WABA | No app-review in-app; Storees must be a Meta Tech Provider/BSP at the **account** level (ops/business setup, not code) |

Sends always go from the **brand's own number, under their own verified name**.
Metering is **visibility only** (category counts + cost estimate) — no quotas, no
billing enforcement in this scope.

### How Storees-provisioning actually works (KwikEngage-style)

This is **ops-assisted, not self-serve Embedded Signup**, which is what real BSPs do:

1. Brand fills a **form**: a phone number **not already associated with any Meta/
   WhatsApp Business account**, plus business name, category, address, website, and
   a logo image.
2. The **onboarding team provisions** the WABA on the Meta side (create business/
   WABA, register the number, OTP-verify) — a back-office step, human-in-the-loop.
3. Team records the resulting `phone_number_id` / `waba_id` / token into the brand's
   config (reuses the connect-meta linking internals) → account goes **active**.
4. The **profile section** then manages the image + details on that WABA.

Because a human bridges the Meta steps, the in-app flow has **no Meta app-review
dependency** — it ships in the no-approval tier. Self-serve Embedded Signup is a
later *upgrade* to this flow, not a prerequisite.

**Profile editability (lock this in the UI):** photo / about / address / website /
description are freely editable via the Cloud API; the **display name is the
Meta-approved verified name** (set at registration, changes need re-approval). The
profile UI shows the name as approved with a "request name change" path — not a
free-text field.

## What already exists (reuse — do NOT rebuild)

- `providers/metaWhatsappProvider.ts` — full direct Cloud API provider (`graph.facebook.com/v23.0`): send, sendTemplate, submitTemplate, getTemplateStatus, syncTemplates. `whatsapp_meta` is a registered provider.
- Per-tenant creds resolve per `projectId` from `projects.settings.channels.whatsapp.config = { phoneNumberId, accessToken, wabaId }`, encrypted, 5-min cached (`channelProviderRegistry.ts`).
- Meta webhook endpoint + `hub.verify_token` handshake + status/inbound handling (`channelWebhooks.ts`).
- Template lifecycle (`whatsapp_templates` table + create/submit/sync/status routes + only-APPROVED send guard).
- Connect-wizard pattern to mirror: `connect-pinnacle` route (`whatsappAdmin.ts:743`) + `PinnacleConnect.tsx`.
- Encrypted credential store (`services/encryption.ts` encrypt/decrypt).

## Net-new (this build)

### Pillar 1 — Provider-choice onboarding + Connect-Meta (BYO)
- Frontend: a **provider picker** step (Meta / Pinnacle / Use Storees) ahead of the connect form.
- `POST /api/whatsapp/connect-meta` — mirror `connect-pinnacle`: validate the token against `GET /{phone_number_id}?fields=verified_name,display_phone_number,quality_rating`, encrypt token, persist `{ provider: 'meta', config }`, subscribe the app to the WABA (`POST /{waba_id}/subscribed_apps`), sync templates. `401/190` → `credential_error`, no blind retry.
- Extend `GET /provider-status` to report the Meta connection + `missingConfig`.

### Pillar 2 — Business-profile management ("brand image")
- `GET/PUT /api/whatsapp/profile` → `GET/POST /{phone_number_id}/whatsapp_business_profile` (about, address, description, email, websites[], vertical).
- Profile **photo**: resumable upload (`/{app_id}/uploads` → session) → set the profile picture handle. Brand logo → their WhatsApp avatar.
- Frontend: a "WhatsApp Profile" settings panel (logo, about, website, address, category, description).
- Provider-agnostic where the endpoint exists (Meta-direct; Storees-hosted reuses it).

### Pillar 3 — Usage metering (visibility)
- **New table `whatsapp_usage`** — one row per **billable conversation** (Meta bills per conversation, not per message), captured from the status webhook's `pricing.category` + `conversation.*` (currently **dropped**). Idempotent per `(project_id, conversation_id)`.
- Extend the Meta status webhook handler to persist `pricing` + `conversation`.
- `GET /api/whatsapp/usage?range=` → per-brand counts by category (marketing / utility / authentication / service) + billable-conversation count + cost estimate (rate card).
- Frontend: a **WhatsApp Usage** dashboard — category breakdown, trend, estimated spend.

### Pillar 4 — Storees-provisioned onboarding (ops-assisted; ships without app review)
- **New table `whatsapp_provisioning_requests`** — the intake/provisioning lifecycle before credentials exist: `status` (`submitted → provisioning → active | error`), requested phone number, business name/category/address/website, logo asset ref, notes, assigned ops user, timestamps. One per project.
- **Brand intake form** ("Get a WhatsApp number through Storees") — validates the number isn't already on a Meta/WhatsApp Business account (instructional + a check where possible), collects business details + logo, creates a `submitted` request.
- **Admin provisioning queue** (back-office) — ops sees requests, does the Meta-side WABA creation/number registration out-of-band, then records `phone_number_id` / `waba_id` / token → reuses the connect-meta linking internals to write `settings.channels.whatsapp` and flip the request `active`.
- Pillars 2 (profile) + 3 (metering) then apply unchanged.

### Pillar 5 — Self-serve Embedded Signup (FLAGGED — needs Meta Tech Provider status)
- An *upgrade* to Pillar 4: Storees' own Meta App + System User + Embedded Signup so a brand self-onboards via FB login instead of the ops queue. Gated behind Meta Business Verification + App Review (`whatsapp_business_management`, `whatsapp_business_messaging`). Not required for the platform to work.

## Build order

- **Phase 0 ✅** — schema + types: `whatsapp_usage` table (migration `0079`), `WhatsappUsage*` shared types. *(foundation)*
- **Phase 1** — Connect-Meta backend route (BYO token) + provider-status; provider-picker + Meta form UI. Shared linking internals reused by Pillar 4.
- **Phase 2** — Storees-provisioned onboarding: `whatsapp_provisioning_requests` table + brand intake form + admin provisioning queue (records creds via the Phase-1 linking internals).
- **Phase 3** — Business-profile route + UI (photo upload = brand image; name shown as approved verified name).
- **Phase 4** — Usage metering capture (webhook → `whatsapp_usage`) + read API + dashboard.
- **Phase 5** — Self-serve Embedded Signup. *(flagged; Meta Tech Provider approval)*

## Hard rules
No global send · per-tenant `phone_number_id` on every call · only send APPROVED templates · encrypt tokens, never log/expose · `401/190` → `credential_error` + alert, no blind retry · meter by **conversation**, not message · brand's own number + verified name only.
