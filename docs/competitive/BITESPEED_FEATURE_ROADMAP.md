# Bitespeed → Storees: Feature Gap Analysis & Roadmap

_Last updated: 2026-10-12 · Owner: Wahab · Status: draft for product + sales + eng review_

## 1. Why this exists

A prospect (Saranya S, Instant Infinity) told us they're moving to **Bitespeed** and named the exact feature set driving the decision:

> "WhatsApp Automation, Chatbot, AI customer segmentation, AI voice call, RCS messages, and Email marketing."

Multiple clients we speak to mention Bitespeed. This doc maps **everything Bitespeed sells**, scores it against **what Storees has today**, and lays out a **prioritized roadmap** to close the gaps that actually move switching decisions — while leaning on where Storees is already ahead.

> Bitespeed positions itself as an "AI-native marketing, sales & support OS for e-commerce," Shopify-first, ~5,000–6,000 brands in 50+ countries (vendor-reported). Pricing (their help centre): Free tier, **Business $249.99/mo**, **Enterprise $499.99/mo**, plus per-message WhatsApp fees from ~$0.01. Performance numbers below are vendor marketing — treat as directional.

---

## 2. Bitespeed feature inventory

### Marketing — "AI agents" (their headline story)
Six agents that research → plan → create → launch → analyse campaigns:
- **Research Agent** — finds what's working across brands in your category
- **Opportunity Agent** — identifies the highest-impact next campaign
- **Segment Agent** — auto-detects high / low-ROI segments in real time
- **Creative Agent** — generates on-brand copy + creative from a prompt
- **Campaign Agent** — assembles ready-to-launch campaigns
- **Insights Agent** — post-hoc "what worked / what didn't" reporting

Plus: **Omnichannel Journey Builder** (drag-and-drop cross-channel flows) and **AI Segmentation & RFM** (auto-segments on purchase history + browsing + engagement).

### Channels
Voice (AI), WhatsApp, Email, **SMS & RCS**, **Web & App Push**, on-site pop-ups / dynamic bars, Instagram/social.

### Sales — conversational AI
- **AI Voice Agents** — cart-recovery calls, **COD confirmation** (reduce RTO), inbound support, outbound campaigns. (Launched Nov 2025; headline claim: up to 10% of revenue, 65% connect rate, ~⅓ the cost of a calling team.)
- **AI WhatsApp Chatbot** — queries, order tracking, product recs, **shopping on WhatsApp**
- **AI Instagram Chatbot** — replies to comments/DMs, shares product + checkout links, FAQs
- **AI Website Agent** — pre-sales Q&A, product recs, human handoff

### Support — agentic support suite
- **Unified Inbox** across WhatsApp, email, Instagram, website chat
- **Live agent analytics** (volume, unattended/open/unassigned, workload)
- **Workflow automations** — auto-resolve + route to the right agent

### Platform
Shopify app; **100+ plug-and-play integrations** (Klaviyo, Omnisend, Attentive, Postscript, HubSpot, Zendesk, Judge.me, Yotpo, Smile, Shiprocket, Loop, Privy, Justuno, Canva, Meta…).

---

## 3. Storees today vs Bitespeed — gap matrix

Legend: ✅ Have · 🟡 Partial / not productized · ❌ Gap

| Capability | Bitespeed | Storees today | Status |
|---|---|---|---|
| **WhatsApp automation** (broadcasts, cart recovery, order updates) | ✅ | Pinnacle V3 multi-tenant send, templates, flow-driven sends, **dynamic carousel engine** in build | ✅ |
| **WhatsApp commerce** (catalog, shop on WhatsApp) | ✅ | Carousel bound to catalog fields (in progress); no in-chat checkout | 🟡 |
| **Inbound WhatsApp / conversation capture** | ✅ | Captured + emits `whatsapp_inbound` events, CTWA attribution | ✅ |
| **AI chatbot** (auto-reply, product recs, support) | ✅ | Inbound stored but **no AI auto-responder** | ❌ |
| **AI customer segmentation + RFM** | ✅ | SQL filter engine, **RFM lifecycle chart**, segment templates, **NL→segment AI** (`/ai/segment`) | ✅ |
| **Email marketing** | ✅ | Resend, templates, campaigns, flows | ✅ |
| **AI voice calls** (cart recovery, COD confirm) | ✅ | — | ❌ |
| **SMS** | ✅ | Channel **modeled** (`sms` in campaign/template/message types) but no provider wired | 🟡 |
| **RCS** | ✅ | — | ❌ |
| **Web / App push** | ✅ | `push` channel modeled; SDK exists; not provider-wired | 🟡 |
| **On-site pop-ups / dynamic bars** | ✅ | SDK present; no pop-up/personalization builder | ❌ |
| **Instagram DMs/comments** | ✅ | — | ❌ |
| **Omnichannel journey builder** | ✅ | **Flow builder** (triggers, trip state machine, templates, abandoned-cart) | ✅ |
| **Unified support inbox + agent analytics** | ✅ | — (we have agent RBAC + roles, not a chat inbox) | ❌ |
| **AI marketing copilot** (research/opportunity/creative/insights agents) | ✅ | AI copywriter, WhatsApp-template gen, campaign variations, next-best-action | 🟡 |
| **Predictive ML** (CLV, churn, propensity) | partial | **Scoring worker, prediction goals, CLV, abandonment prediction, next-best-action** | ✅ (ahead) |
| **CDP / identity resolution** | partial | Full ingest, **identity graph + anonymous session stitching** | ✅ (ahead) |
| **Ad-audience export** (Meta/Google/TikTok/Snap/Pinterest) | — | ✅ | ✅ (ahead) |
| **Data governance** (field-level PII masking, custom roles) | — | ✅ **just shipped** | ✅ (ahead) |
| **Shopify app + integrations** | ✅ 100+ | Shopify OAuth/webhooks/sync; fewer third-party integrations | 🟡 |

**Takeaway:** Storees already matches Bitespeed on WhatsApp automation, email, segmentation/RFM, flows, and **beats it** on predictive ML, CDP/identity, ad-audience export, and data governance. The switching-decision gaps are concentrated in **AI Voice, AI Chatbot, RCS/SMS delivery, and a support inbox**.

---

## 4. The prospect's switching checklist (score the 6 named features)

| Named feature | Storees status | Gap to close |
|---|---|---|
| WhatsApp Automation | ✅ Have | None — demo it |
| Chatbot | ❌ Gap | Build AI WhatsApp chatbot (auto-reply + recs + handoff) |
| AI customer segmentation | ✅ Have (+NL→segment) | None — surface/brand it as "AI segmentation" |
| AI voice call | ❌ Gap | Build voice cart-recovery + COD confirmation |
| RCS messages | ❌ Gap | Add RCS as a channel (aggregator) |
| Email marketing | ✅ Have | None — demo it |

**4 of 6 are already live or nearly so; 3 are genuine builds (chatbot, voice, RCS).** That's a winnable story if we close those three.

---

## 5. Roadmap

Phasing is by **retention impact** (does it stop a client leaving?) vs **effort**. Each item notes what we build on.

### Phase 0 — Quick wins (weeks, mostly surfacing/wiring what exists)
Goal: stop losing deals on features we almost have.
1. **Brand & surface "AI Segmentation"** — we have NL→segment + RFM; package it in the UI and sales deck as an AI capability. _Effort: XS · Impact: high (it's on the checklist)._
2. **Wire SMS delivery** — `sms` is already modeled end-to-end (templates/campaigns/messages); add one provider (India: Exotel/Karix/Gupshup; global: Twilio) to `deliveryWorker`. _Effort: S · Impact: med._
3. **Wire Web/App push** — `push` modeled + SDK exists; add a push provider + opt-in capture. _Effort: S–M · Impact: med._
4. **Integrations quick-hits** — the few third-party connectors clients ask for most (reviews/loyalty/shipping). _Effort: S each · Impact: med._

### Phase 1 — Retention-critical (the switching gaps)
Goal: match the three features clients actually leave for.
1. **AI WhatsApp Chatbot** — auto-respond to inbound (we already capture inbound + emit events), product recommendations (reuse recommendations service), order tracking (Shopify data we hold), human handoff. Our AI stack (`/ai/*`) + recommendations + CDP make this a composition, not a greenfield build. _Effort: M–L · Impact: very high._
2. **AI Voice — cart recovery + COD confirmation** — highest-ROI voice use cases per Bitespeed. Needs a voice/telephony provider with TTS + call flow (Exotel/Twilio/Bland/Vapi). Trigger from existing abandoned-cart flow + COD order events. _Effort: L · Impact: very high (named, revenue-linked)._
3. **RCS channel** — add RCS alongside WhatsApp via an aggregator (Google RBM via Gupshup/Karix/Sinch). Reuse template + delivery pipeline. _Effort: M · Impact: med–high (on the checklist, lower usage than voice/chatbot)._

### Phase 2 — Agentic + support story (close the "OS" positioning)
1. **Unified support inbox** — agent inbox across WhatsApp (+ email, later IG) with assignment, status, and live agent analytics. Leverages the roles/RBAC + PII-masking we just shipped (enterprise angle: agents without contact-PII access). _Effort: L · Impact: high for support-led buyers._
2. **AI marketing copilot** — reframe our AI pieces (copywriter, campaign variations, next-best-action, predictions) as named "agents": Opportunity (from predictions), Creative (copywriter), Insights (analytics). Mostly orchestration + UX over existing capability. _Effort: M · Impact: med–high (matches their headline narrative)._
3. **Instagram channel** — DM/comment automation via Meta Graph. _Effort: M · Impact: med._
4. **On-site pop-ups / dynamic bars** — SDK-driven, behaviour-triggered. _Effort: M · Impact: med._

### Phase 3 — Lean into where we already win (differentiation)
Not catch-up — the reasons to pick Storees *over* Bitespeed. Productize and put front-and-centre:
- **Predictive ML** (CLV, churn, propensity, next-best-action) — deeper than Bitespeed's RFM.
- **True CDP + identity resolution** (anonymous stitching) — richer targeting.
- **Dynamic WhatsApp carousel engine** — catalog-driven product carousels.
- **Enterprise data governance** — field-level PII masking + custom roles (just shipped); a real differentiator for larger/regulated buyers.
- **Ad-audience export** across 5 ad platforms.

---

## 6. Recommended sequencing (one-line version)

**Now:** surface AI segmentation; wire SMS + push (Phase 0). → **Next:** WhatsApp AI chatbot, then AI voice (cart recovery + COD), then RCS (Phase 1). → **Then:** support inbox + AI copilot framing + Instagram (Phase 2). Throughout: hammer the ML/CDP/governance advantages (Phase 3).

This closes **all 6** of the prospect's named features by end of Phase 1, while the differentiators give sales a reason to position Storees as the upgrade, not the copy.

---

## 6a. Email & template engine (teardown + build plan)

Separate from channel coverage, the **quality** of what our template engine produces is a gap in its own right — and it's visible to every prospect who opens a demo email. Visual teardown (current vs best-in-class): https://claude.ai/artifact/EQSoM3PaA5SwbUGp3Z7xsr

**What we have (good bones):**
- Clean multi-source **merge-variable resolver** (`templateContext.ts`) with formatting + save-time lint.
- Responsive hand-authored **seed templates** (`seedTemplates.ts`).
- **AI copywriter** (`copywriterService.ts`) — channel-aware subject/body text, tone/language/keywords.

**The gaps (this is why our emails look a tier below Klaviyo/Bitespeed):**
- **AI generates copy, not design** — it writes words; a human places them in a fixed template. No AI layout generation.
- **No brand/inspiration ingestion** — the only inputs are a use-case string + tone preset. We don't pull the store's logo, colours, fonts or product photography.
- **Product rendering is single-token** — `{{recommended_product}}` via rule-based pairing (`decisioningService.ts`, `limit=1`), not a dynamic multi-product grid. The abandoned-cart email doesn't even show the items left behind.
- Single currency (₹ hardcoded in the money formatter).

**Build plan (each builds on existing code):**
1. **Dynamic product block** — reusable component rendering N products (cart line items + recs) with image/title/variant/price/button. _Lift the 1-product resolver in `decisioningService` to an array._
2. **Brand-kit ingestion** — pull logo/palette/fonts/photography from the connected Shopify store so emails auto-style to the brand. _Builds on Shopify sync + the `products` catalog._
3. **AI layout generation** — AI emits a branded, responsive block layout (not just a paragraph) from a prompt. _Builds on `copywriterService` + `llmService`, emitting a block schema._

This slots alongside Phase 0/1: Step 1 (dynamic product block) is a quick, high-visibility win and should ship early.

## 7. Risks & notes
- **Voice & RCS need telecom providers** — procurement + per-use cost + (RCS) Google RBM brand verification; build time dominated by provider onboarding, not code.
- **WhatsApp commerce / in-chat checkout** needs catalog sync + payment flow — scope carefully; carousel engine is the first step.
- **AI chatbot quality** is a support-risk if it answers wrong — ship with confidence thresholds + human handoff from day one.
- **All Bitespeed metrics are vendor-reported** — don't repeat them as fact in sales material; cite our own results once we have them.
- Feature availability/pricing should be re-verified on bitespeed.co before any sales collateral quotes it.

---

## Sources
- [Bitespeed homepage](https://www.bitespeed.co/)
- [Bitespeed pricing (help centre)](https://help.bitespeed.co/en/articles/3598720-how-our-pricing-works)
- [Bitespeed launches AI Voice Agents (press, Nov 2025)](https://www.theweek.in/wire-updates/business/2025/11/20/dcm29-bitespeed.html)
- [Capterra — BiteSpeed](https://www.capterra.com/p/10035358/BiteSpeed/)
- [Shopify App Store — BiteSpeed reviews](https://apps.shopify.com/bitespeed-fb-messenger-chatbot/reviews)
