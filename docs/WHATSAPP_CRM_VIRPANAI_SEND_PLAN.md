# Virpanai Send — WhatsApp CRM on the Storees Engine

_Report + build plan · 2026-10-16 · Owner: Wahab_
_Audience: the engineers (incl. the separate Claude build) who will build the CRM product, and whoever executes the Storees-side API work._

---

## 0. TL;DR

A client wants a WhatsApp CRM (the AskAva / AI Sensei / Wati / Interakt category): connect their e-commerce catalog + orders, send **order-completion and other notifications via approved templates**, **manage templates**, and do the **sending setup** (number, provider, business profile).

**Almost all of that already exists inside Storees** as a multi-provider WhatsApp engine. The leverage is to build **Virpanai Send** as a separate CRM product (its own UI, onboarding, billing, brand) that drives Storees as a **headless WhatsApp backend over an API**, where each CRM customer is a Storees **project (tenant)**.

The only real engineering prerequisite is **widening the Storees API surface** so an external product can drive it with an API key (today most control lives behind the admin JWT UI). That Storees-side work is Section 5 — the "essential" part to execute here before/alongside the CRM build.

---

## 1. What Storees already has (the engine inventory)

Everything below is live in `packages/backend` today.

### 1.1 Multi-provider WhatsApp send
- **Provider abstraction**: `services/channelProviderRegistry.ts` — `getChannelProvider(projectId, channel)` resolves a per-project provider + config (`settings.channels.whatsapp`). Capability flags via `getProviderCapabilities`.
- **Providers implemented**: **Meta** (Cloud API), **Gupshup**, **Twilio**, **Bird**, **Vonage**, **Pinnacle** (`services/providers/*`). Each supports `send` (template/content), `sendTemplate` (HSM), `parseInbound`, and now `sendSessionText` (free-form 24h-window text) — all except Pinnacle, whose session-text is pending its rewrite.
- **Delivery orchestration**: `services/deliveryService.ts` — resolves template → provider, tracked URL short-links (`/c/:slug`), frequency caps, consent gates, delivery receipts. Sends land in the `messages` table (campaign / flow / **transactional** source).

### 1.2 Template lifecycle (full)
Routes under `/api/whatsapp` (`routes/whatsappAdmin.ts`):
- `GET /templates`, `POST /templates` (create), `POST /templates/lint`, `POST /templates/:id/submit` (submit for approval to Meta/provider), `PATCH /templates/:id`, `POST /templates/:id/refresh-status`, `POST /sync-templates` (import from provider), `POST /templates/:id/test-send`.
- Approval lifecycle + status tracking (`whatsapp_templates`); **dynamic carousel engine** in progress (`docs/whatsapp-dynamic-carousel-engine.md`).

### 1.3 Sending setup / onboarding
- `POST /connect-meta` (Meta embedded-signup / account link), `POST /connect-pinnacle`, provisioning queue (`GET/POST /provisioning`, `/provisioning/register`, `/provisioning-queue`), number registration, **business profile** (`GET/PUT /profile`, `POST /profile/photo`), **usage** (`GET /usage`).

### 1.4 Inbound + conversations
- Webhook in: `/api/webhooks/channel/whatsapp/:provider` → `services/whatsappInboundService.ts::persistInboundMessages` → `whatsapp_inbound_messages` + `whatsapp_inbound` events.
- **CTWA** (click-to-WhatsApp ad) attribution + implicit opt-in; **consent** keywords (STOP/START) → `consents`.

### 1.5 AI chatbot + support inbox (recently built)
- Auto-reply (FAQ / order status / product recs / human handoff) with **conversation memory**, grounded only on the project's FAQ KB + order data; `whatsapp_conversations` state machine (bot/human/closed); `whatsapp_outbound_messages`.
- **Support inbox**: `/api/whatsapp/inbox` — list conversations (+attention count), unified thread, agent reply (session text), status (take over / close / back-to-bot); per-agent scoping; multi-provider.
- Config at `settings.channels.whatsapp.chatbot` + `GET/PUT /api/whatsapp/chatbot-config`.

### 1.6 E-commerce data (the CRM's substrate)
- **Shopify** OAuth + sync (`services/shopifyService.ts`): customers, orders, products, brand kit. Webhooks `/api/webhooks/shopify`.
- **CDP / identity resolution**, **segments** (`/api/segments`), **recommendations** (`/api/recommendations`), **products** (`/api/products`), **orders** in the `orders` table with status/fulfilment timestamps.

### 1.7 Automation (order-completion notifications)
- **Flows** (`/api/flows`, `services/flowExecutor.ts`): trigger (event) → nodes → `deliveryService`. An **order event → send WhatsApp template** flow is exactly the client's "order completion notification via template." Frequency caps + consent enforced. Triggering event properties are carried into template variables.
- **Campaigns** (`/api/campaigns`): broadcast sends with audience, A/B, UTM, per-recipient decisioning.

### 1.8 Ingestion + auth model
- **Data-in API**: `/api/v1/*` (`v1Events`, `v1Import`, `v1OptIn`, `v1Recognize`, `v1InAppMessage`) — **API-key auth** (`middleware/apiKeyAuth.ts`, `x-api-key` + secret, scoped read/write), permissive CORS. This is the external-facing plane.
- **Admin API**: everything else — **JWT auth** (`requireAuth`) + operational project via `?projectId=`. Multi-tenant (`project_id` on every table), **roles + field-level PII masking**, **multi-client access** (super-admin + `user_projects`).
- **Webhooks out**: `/api/outbound-webhooks` (push events to external systems).
- **API-key management**: `/api/api-keys`.

---

## 2. Client asks → Storees coverage

| Client ask | Storees today | Status |
|---|---|---|
| Connect e-commerce products/catalog | Shopify sync + `/api/products` + `/api/v1` import | ✅ |
| Connect orders | Shopify sync + `orders` table + order events | ✅ |
| Order-completion notification via template | Flow: order event → send WhatsApp template | ✅ (needs packaging) |
| Manage templates (create/submit/status) | Full template lifecycle routes | ✅ (admin-only) |
| Sending setup (number/provider/profile) | connect-meta/pinnacle, provisioning, profile | ✅ (admin-only) |
| Broadcasts / campaigns | `/api/campaigns` | ✅ |
| Two-way inbox / support | `/api/whatsapp/inbox` + AI chatbot | ✅ |
| Contacts / segments | customers + `/api/segments` | ✅ |

**Conclusion:** the *engine* is ~complete. The gap is **packaging + API exposure** for an external product to drive it.

---

## 3. Product architecture — Virpanai Send + Storees

```
          ┌─────────────────────────────┐        ┌──────────────────────────────┐
          │   VIRPANAI SEND (new CRM)   │        │   STOREES (headless engine)  │
          │  own UI / brand / billing   │        │  multi-tenant WhatsApp back  │
          │                             │        │                              │
 e-comm → │  onboarding wizard          │ ──API→ │  provision tenant + connect  │
 store    │  contacts & segments        │ key +  │  WhatsApp (provider/number)  │
          │  template manager           │ /admin │  templates (submit/approve)  │
 orders → │  automations (order done,   │        │  flows + campaigns + delivery│
          │   abandoned cart…)          │        │  providers: Meta/Gupshup/... │
          │  broadcast composer         │        │  inbound + chatbot + inbox   │
          │  conversation inbox         │ ←webhk │  events/receipts/handoffs    │
          │  analytics / billing        │  out   │  CDP / segments / recs       │
          └─────────────────────────────┘        └──────────────────────────────┘
```

- **Tenancy**: each Virpanai Send customer = one Storees **project**. Virpanai holds its own account/billing/branding; Storees holds the WhatsApp assets, contacts, messages.
- **Two planes**:
  - **Data-in** (API key): push contacts/orders/events to `/api/v1`, or connect Shopify.
  - **Control** (today admin JWT): templates, flows, campaigns, inbox, provisioning — *this is what must become API-key-drivable* (Section 5).
- **Events-out** (webhooks): delivery receipts, inbound messages, handoffs, status → Virpanai.

**Build the CRM thin.** Storees already owns the hard parts (providers, approval, delivery, consent, inbox, chatbot). Virpanai Send should be mostly a UX + orchestration layer, not a second messaging stack.

---

## 4. Order-completion notification — the concrete flow

1. Order is completed in the store → Shopify webhook **or** Virpanai posts an `order_completed` event to `POST /api/v1/events` (API key).
2. Storees normalizes → `events` + `orders`; a **flow** (trigger: `order_completed`) fires.
3. Flow node sends an approved WhatsApp **template** (e.g. "Order #{{order_id}} confirmed") via the project's provider; variables resolved from the order; consent + frequency caps applied.
4. Delivery receipt → `messages` status → pushed to Virpanai via outbound webhook.

So the CRM doesn't need its own sender — it **ingests the order event and configures the flow/template**. (A direct transactional send API is still worth adding for non-event sends — see §5.1.)

---

## 5. Storees-side work to execute (the ESSENTIAL prerequisite)

These make Storees drivable by an external CRM with a scoped API key. **This is the part to build in *this* repo before/while the CRM is built elsewhere.**

1. **Transactional send API** — `POST /api/v1/whatsapp/send` (API key): `{ to, templateId|templateName, variables, idempotencyKey }` → sends an approved template now, returns `{ messageId, status }`. Wraps `deliveryService` with `messageType: 'transactional'`, bypassing campaign/flow. (Today there is no direct send endpoint.)
2. **API-key-scoped control endpoints** (or `/api/v1` wrappers) for: list/create/submit templates + status; list/read/reply inbox conversations; read delivery status/logs; read/write customers (contacts). Extend `requireApiKeyAuth` with finer scopes (`templates`, `messaging`, `inbox`, `contacts`).
3. **Tenant provisioning API** — `POST /api/v1/tenants` (platform key): create a project + return its API key; `POST /api/v1/whatsapp/connect` to attach a provider/number programmatically, so Virpanai can onboard a customer without the Storees admin UI.
4. **Outbound webhooks for the CRM** — subscribe Virpanai to: `message.delivered/read/failed`, `whatsapp.inbound`, `whatsapp.handoff`, `template.status_changed`. (`/api/outbound-webhooks` exists — add these event types.)
5. **Prebuilt automations as API** — a "notifications" API to enable/configure the standard flows (order confirmed, shipped, delivered, abandoned cart) without hand-building flow nodes.
6. **Security** — per-tenant key isolation (already: `project_id` everywhere + roles + PII masking), rate limits per key, idempotency on send, audit.

Suggested order: **§5.1 (transactional send) → §5.2 (template + inbox + contacts scopes) → §5.4 (webhooks out) → §5.3 (provisioning) → §5.5 (notification presets)**.

---

## 6. What Virpanai Send (the separate build) owns

- **Onboarding wizard**: sign up → provision Storees tenant → connect WhatsApp (embedded signup) → import contacts → pick notification templates.
- **Contacts & segments** UI over Storees customers/segments.
- **Template manager** UI over the template lifecycle (create → submit → track approval).
- **Automations**: order-completion, shipped/delivered, abandoned cart, win-back — configured via the §5.5 presets or the flow API.
- **Broadcast composer** over `/api/campaigns`.
- **Conversation inbox**: reuse Storees `/api/whatsapp/inbox` (list/thread/reply) + optionally the AI chatbot — do **not** rebuild the messaging stack.
- **Analytics, billing, branding** ("Virpanai Send").
- Minimal CRM-local state; Storees is the source of truth for WhatsApp assets + messages.

---

## 7. Build sequence

- **Phase 0 (Storees, here):** §5.1 transactional send + §5.2 scoped template/inbox/contacts APIs + §5.4 outbound webhooks. _This unblocks everything._
- **Phase 1 (Virpanai MVP):** onboarding + tenant provisioning (§5.3), contact import, template manager, **order-completion automation**, broadcast, inbox.
- **Phase 2:** AI chatbot reuse, analytics, billing, more automations (§5.5), self-serve provider connect.

---

## 8. Decisions & risks

- **Direct send vs event-driven**: build **both** — event-driven flows for automations (order lifecycle), a direct transactional send API (§5.1) for ad-hoc/programmatic sends.
- **Tenancy model**: CRM-customer = Storees-project (recommended) vs one shared project. Pick per-customer projects for isolation (roles/PII/consent are already per-project).
- **WhatsApp compliance**: template pre-approval, 24h session window, opt-in/consent — Storees enforces these; Virpanai must **surface** them (template status, opt-in capture, session-window hints) so users aren't confused.
- **Provider for the first client**: confirm which (Meta vs Gupshup vs Pinnacle). Session-text replies work on all except **Pinnacle** (pending rewrite) — matters if the inbox/chatbot is in scope for v1.
- **Benchmark**: you have access to AskAva — map its template manager + automation + inbox UX as the bar; most of its backend equivalents already exist here.
- **Don't fork the engine**: resist rebuilding providers/templates/delivery in the CRM; every such feature already exists and is multi-tenant.

---

## 9. Pointers (for the separate build)

- API auth: `packages/backend/src/middleware/apiKeyAuth.ts` (x-api-key + secret, scopes); admin JWT: `middleware/requireAuth.ts` + `?projectId=`.
- WhatsApp routes: `routes/whatsappAdmin.ts`, `routes/whatsappInbox.ts`, inbound `routes/channelWebhooks.ts`.
- Send path: `services/deliveryService.ts`, providers `services/providers/*`, registry `services/channelProviderRegistry.ts`.
- Ingestion: `routes/v1Events.ts` + `/api/v1/*`.
- Data model: `packages/backend/src/db/schema.ts` (customers, orders, products, whatsapp_templates, messages, whatsapp_inbound_messages, whatsapp_outbound_messages, whatsapp_conversations, consents, flows, campaigns).
- Existing docs: `docs/domains/integrations/`, `docs/whatsapp-dynamic-carousel-engine.md`, `docs/PINNACLE_WHATSAPP_BUILD_PLAN.md`.
