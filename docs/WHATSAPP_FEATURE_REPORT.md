# Storees — WhatsApp Capability Report

_Detailed feature catalog · 2026-10-16 · Owner: Wahab_
_Purpose: a complete, code-verified inventory of everything Storees has built on WhatsApp, with a comparison against the typical WhatsApp-CRM (AskAva / AI Sensei / Wati / Interakt) category._

> **Headline:** Storees is not a "WhatsApp CRM wrapper" — it's a full **multi-provider WhatsApp engine** sitting on top of a **CDP + segmentation + flows + AI** platform. The table counts: **11 WhatsApp-specific data tables**, **6 providers**, the full Meta template lifecycle (incl. carousel + OTP/auth), click-level tracking, conversation-based billing metering, CTWA ad attribution, an AI chatbot, and a support inbox. That is materially more surface than the category's typical "templates + broadcast + shared inbox + basic bot."

---

## 1. Multi-provider WhatsApp engine

One provider abstraction, **6 WhatsApp providers** implemented, selected per project from `projects.settings.channels.whatsapp` (JSONB, encrypted creds, 5-min cache).

| Provider | Send template | Free-form session text | Parse inbound | Sync templates | Submit template | Status |
|---|---|---|---|---|---|---|
| **Meta** (Cloud API) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Pinnacle** (BSP) | ✓ | — | via webhook | ✓ | ✓ | ✓ |
| **Gupshup** | ✓ | ✓ | ✓ | ✓ | — | — |
| **Twilio** | ✓ | ✓ | ✓ | — | — | — |
| **Bird** (MessageBird) | ✓ | ✓ | ✓ | — | — | — |
| **Vonage** (Messages v1) | ✓ | ✓ | ✓ | — | — | — |

- Registry: `services/channelProviderRegistry.ts` (`getChannelProvider`, capability flags). Impls: `services/providers/*`.
- E.164 normalization with default country code; env fallback for a zero-config Meta setup.
- *Most WhatsApp CRMs are single-BSP (one of Meta/Gupshup/360dialog).* Storees abstracts six and can switch per tenant.

---

## 2. Template management (full Meta lifecycle)

- **Lifecycle**: draft → lint → submit for approval → track status → sync from provider → refresh → edit (draft/rejected) → test-send. Routes under `/api/whatsapp/templates*`.
- **Categories**: Marketing / Utility / **Authentication (OTP)**.
- **Components**: header (TEXT / IMAGE / VIDEO / DOCUMENT), body with positional `{{1..N}}` variables, footer, and **buttons**: Quick-Reply, URL (static + **dynamic/tracked**), Phone, **Copy-Code**, **OTP** (copy-code / one-tap).
- **Carousel templates**: up to 10 cards, each with media header + body + buttons (`whatsapp_templates.carousel` JSONB; built + linted + submittable today).
- **A real template linter** (`services/templateLinter.ts`) — ~30 rules with error/warning severity: name/format, body length + sequential-param checks, **"marketing phrase in a Utility template"** detection (sale/%-off/limited-time/etc.), emoji-in-utility warnings, header/footer length, button counts and per-type limits, phone/URL/copy-code validation, full carousel rules (card count, uniform headers, even buttons, sample media). This catches Meta rejections **before** submission — most CRMs submit blind and let Meta reject.
- **Quality score** tracking (GREEN/YELLOW/RED) per template + number-level quality rating.
- **Status automation**: webhook handler for `message_template_status_update` (approved/rejected/flagged/paused/in-appeal/disabled), **category-change detection** with an email alert to admins, plus a 4-hourly BullMQ poller for pending templates.
- **AI copilot**: `POST /api/ai/whatsapp-template` drafts a compliant template (tone presets) → category/body/vars/header/footer/buttons.
- **Visual builder** (frontend): `WhatsAppTemplateBuilder` + live `WhatsAppBubblePreview`, media upload, variable panel.
- **Prebuilt template library**: ~11 ready flows (CTWA welcome, cart reminder, browse nudge, thank-you, winback…) seeded when automations are installed.

---

## 3. Sending & orchestration

- **Three send modes**: campaigns (broadcast), flows (automations), and transactional — all through one `deliveryService` with a consistent gate pipeline.
- **Pre-send gates** (evaluated in order, with explicit block reasons): **consent → frequency cap → reachability**. Utility/Auth = transactional (bypass marketing consent + cap); Marketing = capped.
- **24h service-window enforcement**: non-marketing templates are filtered to recipients who messaged in the last 24h; free-form replies only inside the window. (Compliance most CRMs leave to the user.)
- **Click-level tracking**: every tracked URL button mints a **per-recipient durable short link** (`/c/:slug`), logs clicks to `tracked_links`, flips the message to `clicked`, and emits a `whatsapp_clicked` event — true per-recipient link analytics, not just "sent/delivered/read."
- **Per-recipient personalization / decisioning**: template variables resolved from the CDP + a recommendation engine (`recommendForCustomer`) — e.g. a product pick per recipient in one template.
- **Campaign features**: approved-template validation, **A/B testing** (deterministic split), **holdout groups**, **send-time optimization**, UTM tagging, scheduling.
- **Dealer/agent-directed sends**: deliver a message *about* a customer to their assigned dealer (B2B2C).
- **Automations (flows)**: order-completion, abandoned cart, browse abandonment, thank-you, winback, payment retry, reorder/replenishment, review request — plus vertical packs (NBFC: KYC/EMI/disbursal; EdTech: enrollment/lesson nudges). Carousel flow node included.

---

## 4. Inbound & conversations

- **Webhooks** for Meta (verify + status + usage + template-status + inbound) and Pinnacle (per-project secret-verified), plus Twilio/Gupshup/Bird/Vonage/FCM.
- **Inbound pipeline**: project resolution by phone-number-id / app / WABA / from-number; idempotent persistence to `whatsapp_inbound_messages`; emits a `whatsapp_inbound` event (so flows can branch on replies); media + reply-context handling.
- **CTWA (Click-to-WhatsApp ad) attribution** — a standout: captures the ad a lead came from (`ctwa_attributions`: headline/body/URL/click-id), records **implicit DPDP-compliant opt-in** with the ad context as the consent artifact, auto-creates the customer, fires a welcome flow, and tracks the **funnel** (leads → engaged → converted → **attributed revenue**) via `GET /api/whatsapp/ctwa-attributions`.
- **Consent keywords**: STOP/UNSUBSCRIBE/… and START/YES/… flip consent + the legacy subscribed flag and emit audit events.

---

## 5. AI chatbot + support inbox

- **AI auto-reply**: answers FAQs, order status, and product recommendations, grounded only in the project's FAQ KB + real order data; **conversation memory** (last 8 turns), **relevance-ranked FAQ selection**, and **human handoff** on low confidence / explicit ask / turn cap. Replies as free-form session text. Config: enable, greeting, handoff keywords, FAQ KB, `answerUnknown` (reply to cold leads, FAQ-only).
- **Support inbox** (`/api/whatsapp/inbox`): conversation list with a "needs reply" badge, the merged two-sided thread, agent reply, and status (take over / close / back-to-bot). **Per-agent scoping** (dealers see only their customers). State machine: `whatsapp_conversations` (bot/human/closed).
- *This is two of the category's headline features (chatbot + shared inbox) in one, with the chatbot grounded in live commerce data.*

---

## 6. Onboarding, provisioning & setup

- **Self-serve connect**: BYO **Meta** (phone-number-id / WABA / token, validated against the Graph API, app subscribed to the WABA, templates imported) or **Pinnacle** (paste one API key → auto-discovers numbers → registers the webhook → imports templates).
- **Ops-assisted provisioning queue**: intake → status (submitted/provisioning/active/error) → link creds → **number registration with 2-step PIN** → cross-tenant platform-admin queue.
- **Business profile management**: about/address/description/email/vertical/websites + **profile photo** upload (Meta resumable upload).
- **Provider status** panel: resolved provider, capabilities, missing config, webhook-registered health.

---

## 7. Consent, compliance & deliverability

- **Consent store** + **audit log** per customer/channel/purpose (promotional vs transactional), with API + bulk ops.
- **Subscription categories** (topic-level opt-in) and **campaign category gating**.
- **Opt-in widgets**: hosted on-site widgets (headline/body/consent text, triggers, target pages, collect name/email) with a public, API-key-authed submission endpoint (honeypot + rate-limit + E.164) that records consent with IP and fires a welcome flow.
- **DPDP-ready**: CTWA and widget opt-ins store the exact consent artifact.
- **Quality & window safety**: template quality score, 24h-window gating, frequency caps.

---

## 8. Usage & billing analytics

- **Conversation-based metering** from Meta's pricing webhooks: records each billable conversation with **category** (marketing/utility/authentication/service), pricing model, origin, and billable flag → `whatsapp_usage`.
- **Usage summary API** with an optional **rate card** (per-category rates + currency) → cost estimation per project. Most CRMs show message counts; Storees meters Meta's actual **conversation** billing model.

---

## 9. Data model (11 WhatsApp-related tables)

`whatsapp_templates`, `whatsapp_inbound_messages`, `whatsapp_outbound_messages`, `whatsapp_conversations`, `whatsapp_usage`, `whatsapp_provisioning_requests`, `ctwa_attributions`, `optin_widgets`, `consents` (+`consent_audit_log`), `subscription_categories` (+`customer_subscriptions`), `tracked_links` — plus per-project channel config in `projects.settings.channels.whatsapp`. All multi-tenant (`project_id`), with **field-level PII masking + custom roles** layered on top.

---

## 10. Storees vs the WhatsApp-CRM category (AskAva / AI Sensei / Wati / Interakt)

> The right column is the category's *typical* feature set — verify specifics against your AskAva access. "✓✓" = Storees does materially more.

| Capability | Typical WhatsApp CRM | Storees |
|---|---|---|
| Template create + submit + status | ✓ | ✓ |
| **Pre-submit lint (catch rejections)** | rare | **✓✓** (~30 rules) |
| Carousel templates | some | ✓ |
| OTP / Authentication templates | some | ✓ |
| Broadcasts + A/B + scheduling | ✓ | ✓ (+ holdouts, send-time opt) |
| **Per-recipient tracked links + click analytics** | basic | **✓✓** |
| **Per-recipient personalization via CDP + recs** | limited | **✓✓** |
| Shared team inbox | ✓ | ✓ (+ per-agent scoping) |
| AI chatbot | basic | ✓ (**grounded in live orders + memory**) |
| Automations / flows | ✓ | ✓ (+ vertical packs, carousel node) |
| **CTWA ad attribution + revenue funnel** | rare | **✓✓** |
| Opt-in widgets + consent + audit | some | ✓ (+ DPDP artifacts) |
| **Conversation-based billing metering + rate card** | rare | **✓✓** |
| **Multi-provider (6 BSPs, switchable)** | single BSP | **✓✓** |
| Underlying **CDP + segmentation + predictions** | no | **✓✓** |
| Multi-tenant + roles + **field-level PII masking** | basic | **✓✓** |

**Where Storees is uniquely strong:** the WhatsApp features ride on a real **CDP + segmentation + predictive ML + flows + email/SMS** platform, so WhatsApp is one channel in an omnichannel engine — not a standalone tool. CTWA attribution, click-level tracking, conversation billing analytics, the pre-submit linter, and multi-provider are things most WhatsApp CRMs simply don't have.

---

## 11. Honest gaps / spec-stage (so the report is credible)

- **Dynamic carousel engine**: the static carousel (build/lint/submit) is live; the full **catalog-bound** dynamic carousel (bind cards to collections/best-sellers/abandoned-cart with filter/rank/backfill + `/api/v1/carousel/preview`) is **spec-stage** (`docs/whatsapp-dynamic-carousel-engine.md`), not yet in code.
- **Pinnacle** lacks free-form `sendSessionText`, so on a Pinnacle project the **AI chatbot/inbox reply hands off to a human** instead of auto-replying (pending the Pinnacle rewrite). Meta + the other four support it.
- No template **delete** route (lifecycle is draft/submit/sync/patch/refresh).
- The external **API surface** for an outside product to drive all this is partial (admin-JWT today) — see the companion `docs/WHATSAPP_CRM_VIRPANAI_SEND_PLAN.md`.

---

## 12. Pointers (file references)

- Providers: `services/providers/*`, registry `services/channelProviderRegistry.ts`
- Templates: `routes/whatsappAdmin.ts`, linter `services/templateLinter.ts`, sync `services/whatsappTemplateSyncService.ts`, status `services/templateStatusService.ts`, library `services/whatsappTemplateLibrary.ts`
- Sending: `services/deliveryService.ts`, short links `services/shortLinkService.ts` (+ `routes/urlTracker.ts`), campaigns `services/campaignService.ts`, flows `services/flowExecutor.ts`
- Inbound/CTWA: `routes/channelWebhooks.ts`, `services/whatsappInboundService.ts`
- Chatbot/inbox: `services/whatsappChatbotService.ts`, `routes/whatsappInbox.ts`
- Onboarding/usage/profile: `services/whatsappMetaConnectService.ts`, `services/whatsappUsageService.ts`, `services/whatsappProfileService.ts`
- Consent/widgets: `routes/consent.ts`, `routes/optinWidgets.ts`, `routes/v1OptIn.ts`
- Schema: `packages/backend/src/db/schema.ts` (search `whatsapp_`)
- Frontend: `app/(dashboard)/{whatsapp-templates,templates/whatsapp,whatsapp-provisioning,inbox,campaigns/ctwa,widgets}`, `app/(dashboard)/settings/Whatsapp*`, `components/whatsapp/*`
