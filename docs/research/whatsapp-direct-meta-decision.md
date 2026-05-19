# WhatsApp: Direct-Meta vs BSP — Decision Report

**Audience:** Storees ownership
**Author:** Research note, May 2026
**Status:** Decision-grade. Not promotional. Argues against the proposal where the math fails.

---

## TL;DR (5 lines)

1. **You can already sign up direct on Meta Cloud API today** — no "license" needed. `metaWhatsappProvider.ts` proves it. That's the easy part.
2. The owner is conflating two questions: (a) "can we deliver via Meta directly?" — yes, and we already do; (b) "can we become the billing intermediary and mark up Meta's rates to D2C brands?" — **no, not without becoming a Solution Partner**, and that program is invite-only with a multi-week review and meaningful prerequisites.
3. **Tech Provider status (the realistic near-term tier) does NOT let Storees invoice Meta's conversation charges.** Meta bills the brand's card directly. Storees can only charge a SaaS fee on top. The "increase the markup" thesis only works in the Solution Partner tier.
4. After accounting for the operational layer BSPs give us today (queue/retry/template ops/24x7 support/credit line), **direct-Meta only outearns BSP routing above roughly 1M marketing conversations/month aggregated across tenants** — which Storees is not close to.
5. **Recommended:** Stay BSP-primary for path-of-record. Enroll as Meta Tech Provider in parallel (it's required of every ISV anyway, and unlocks unbranded embedded signup). Defer the Solution Partner / reseller play until volume and ops maturity justify it.

---

## 1. The actual options — precise tier definitions

Meta runs three relevant tiers for companies in our position. Names matter; the owner used "license" loosely.

| Tier | Who can join | What it unlocks | Billing relationship |
|---|---|---|---|
| **Cloud API direct (end-business)** | Anyone with Facebook Business Manager + verified business | Send/receive on your own WABA. This is what `metaWhatsappProvider.ts` already uses. | End-business pays Meta directly. |
| **Tech Provider (ISV)** | Anyone after self-enrollment + Meta technical review (1–4 weeks). **Mandatory for every ISV** that lets clients send WhatsApp via the ISV's product — Meta's June 30, 2025 deadline. | Unbranded embedded signup, ability to onboard up to 200 clients per Solution ID per rolling 7-day window, programmatic WABA creation on behalf of clients. | **Client pays Meta directly with their own card.** Tech Provider invoices the client only for its own SaaS. |
| **Solution Partner (BSP)** | Invitation / approval-only after demonstrating volume (the published bar for moving up is "10+ clients and ~2,500 conversations/day average" — that is a tier-up benchmark, not the only criterion). Lengthy review. | Credit line extended to clients (no client card required), **direct invoicing of Meta conversation charges to clients**, direct support, partner channels for ban appeals. | **Solution Partner is the merchant of record.** Pays Meta, marks up, invoices the brand. |

On-Premise API: EOL by Meta. Skip.

**What the owner needs for the markup play is Solution Partner status**, not just "a license." Tech Provider does not enable Storees to be in the money path of conversation charges.

*Sources: Meta Solution Partner overview ([developers.facebook.com](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview)); 360Dialog Tech Provider program docs; Infobip Tech Provider Program guide.*

---

## 2. Reliability — is the framing even right?

**It is not.** This is where most BSP-vs-direct pitches mislead.

All paths — Gupshup, Twilio, Bird, Vonage, and our direct `metaWhatsappProvider.ts` — terminate at the same Meta Cloud API endpoint (`graph.facebook.com/.../messages`). BSPs do not have a faster pipe, a preferential queue, or a different Meta. The delivery hop is identical.

What BSPs actually sell beyond delivery (and what Storees would have to build or absorb if going direct-only):

| Capability | BSP-provided today | Storees direct-mode requirement |
|---|---|---|
| Token + WABA + phone number registration ceremony | Embedded signup wizard, handhold | We build embedded signup (Tech Provider gives us the SDK; UX is on us) |
| Rate-limit handling (per-WABA, per-phone, per-template tier caps) | Implemented | We build adaptive throttling and back-pressure in BullMQ workers |
| Retries with exponential backoff against transient Meta errors | Implemented | We build (partly present in `metaWhatsappProvider.ts`, not battle-tested) |
| Template lint / pre-submission heuristics | Most BSPs have | We already have a lint path; **60%+ of templates get rejected on first submission industry-wide** ([WUSeller](https://www.wuseller.com/blog/whatsapp-template-approval-checklist-27-reasons-meta-rejects-messages/)) — this is real ongoing operational load |
| Template approval expediting via partner rep | Yes for senior BSPs | None. We are in the same queue as any direct user. |
| Status webhook normalization across event types | Yes | We already partly do this in `whatsappInboundService.ts` |
| Phone number quality rating monitoring + alerts | Yes | Build dashboards, alerting; 7-day rolling assessment per Meta |
| 24×7 on-call for incidents (when Meta API has an outage) | Yes for senior BSPs | We are on the hook |
| Number recovery / un-ban / appeal support | Partner-channel access | Tech Providers can review, prepare appeals, escalate — but **final decisions are Meta's** ([Wati](https://support.wati.io/en/articles/11463217-why-your-whatsapp-business-account-waba-may-get-banned-or-restricted-and-how-to-avoid-it)) |
| Credit line for clients (defer card-on-file) | Solution Partners only | Not available to us as Tech Provider |

**Honest count:** the "direct is more reliable" claim is largely false. The reliability gap usually runs in the **opposite direction** for any vendor below ~1M conversations/month: BSPs have hardened the boring ops layer over years and have a partner-rep relationship at Meta that an unproven ISV does not.

---

## 3. Conversation pricing — markup math

### Meta's India per-message rates (effective Jan 1, 2026, after the ~10% Jan 2026 hike)

- Marketing: **₹0.8631** per delivered template message
- Utility (outside 24h service window): **~₹0.115** per message
- Utility (inside 24h service window): **free**
- Authentication: **~₹0.115**
- Service / free-form replies within 24h customer-care window: **free**
- 18% GST applies on top.

Meta moved from "conversation pricing" (24h windowed bundles per category) to **per-template-message pricing on July 1, 2025** — every delivered template message is now billed individually ([Meta updates page](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing/); cross-referenced in [Whautomate](https://whautomate.com/whatsapp-business-api-pricing-india)).

### What Indian BSPs add on top (publicly cited rates)

| BSP | Marketing markup (India) | Effective marketing rate to brand | Platform fee/month |
|---|---|---|---|
| Gupshup | +₹0.08 flat | ~₹0.94 | tiered |
| Interakt | ~12% | ~₹0.97 | ₹2.5k–6k |
| Wati | ~20% | ~₹1.04 | ₹2.5k–10k |
| AiSensy | ~26% | ~₹1.09 | ₹1.5k–8k |
| Whautomate / a few zero-markup BSPs | 0% | ₹0.8631 | flat subscription |

### The spread

The realistic spread Storees could extract IF (and only if) it becomes a Solution Partner:
- Per marketing message: **₹0.05–₹0.20 net** after Meta's rate, depending on segment of the BSP market we undercut/match.
- At **100,000 marketing msgs/month**: ~₹5,000–₹20,000 gross spread.
- At **1,000,000/month**: ~₹50,000–₹2,00,000 gross spread.

Subtract:
- Tech Provider compliance + ongoing Meta partner ops cost (lower-bound a senior engineer at 20% time = ~₹40k/mo).
- Bad-debt risk: brands fail to pay, Storees is on the hook to Meta.
- Refund/credit risk: Meta charges for delivered messages even if the brand later disputes.
- 18% GST on the gross — but GST is generally pass-through if invoicing is correct.

**At <500k marketing msgs/mo across the entire Storees tenant base, the markup-as-Solution-Partner play is net-negative once you load engineering, support, and bad-debt.** This is the math the owner needs to internalize.

---

## 4. The "we're the tech provider, we'll mark it up" pitch — does it hold?

**No, not at Tech Provider tier. Yes, only at Solution Partner tier.**

From Meta's own ecosystem docs and confirmed across 360Dialog and Infobip's published Tech Provider guides:

> "Tech Providers... do not have credit lines. Clients onboarded by Tech Providers must provide their own payment method after onboarding is complete. Meta will then bill these clients for API usage, and the Tech Provider will bill for other services."

In plain language: under Tech Provider status (which is what's actually achievable in the next 1–3 months), Storees CANNOT insert itself into the money path for conversation charges. The brand puts their credit card on Meta's billing surface. Meta charges them ₹0.8631 directly. Storees can charge a SaaS subscription, a per-flow fee, a per-active-customer fee — but it cannot charge a per-message markup on the WhatsApp conversation itself, because we are not the merchant of record for the conversation.

The only way to be merchant of record is Solution Partner — which is a multi-month application, requires demonstrated volume, and is described in Meta's own docs as "a lengthy process."

**Verdict on the owner's premise:** "If we have our own setup with Meta, we increase the markup" — **this is partially false as stated.** Direct-on-Meta as a Tech Provider does NOT increase markup capability vs. being a BSP customer. It eliminates one party (Gupshup) from the brand's WhatsApp stack, lets us white-label the onboarding, and removes the Gupshup-style ₹0.08/msg surcharge — but the brand keeps that saving, not Storees, because the brand is billed by Meta directly.

To capture markup, we'd need to either (a) graduate to Solution Partner, or (b) bundle WhatsApp pricing inside Storees' SaaS in a way that's economically equivalent — e.g., "Storees Pro tier ₹X/mo includes up to N WhatsApp marketing messages." But (b) means Storees front-funds Meta charges from its own pocket, which is the same risk profile as being a BSP without the official protection.

---

## 5. Compliance / licensing burden

What the owner means by "licenses" is most likely:
- **Facebook Business Verification** (org-level). Documents: certificate of incorporation, GST cert, utility bill or bank statement for address verification, business website matching. Common rejections: name/address mismatch with public records, low-traffic website, inactive social presence. Timeline: 2–15 business days but often longer with revisions.
- **WABA-level display-name and green-tick (now blue-tick) verification.** Brand notability gate: typically requires 3–5 organic press mentions in reputable publications. Most early-stage D2C brands fail this bar. Storees-as-host cannot manufacture this.

There is **no separate "Meta partner license" beyond program enrollment**. The owner's belief that "we can get the license" suggests a misread — there isn't a SEBI/RBI-style instrument. There is application + approval.

**India regulatory layer (2026):**
- **TRAI / DLT** is for SMS via Indian telcos. **WhatsApp is exempt** — confirmed. Do not register WhatsApp content templates on DLT; that's an SMS workflow.
- **DPDP Act 2023**: notified, Consent Management Rules published 2025, **substantive compliance enforced from May 13, 2027** ([India Briefing](https://www.india-briefing.com/news/dpdp-rules-2025-india-data-protection-law-compliance-40769.html/)). We have a runway, but the requirements are real: documented consent timestamp + source + purpose-specific opt-in; opt-out honored; separate consents for transactional vs marketing. **This applies regardless of whether we go direct-Meta or BSP** — DPDP holds the Data Fiduciary liable, and Storees acts as Data Processor when sending on behalf of a brand. Direct-Meta does not change this exposure.
- **Meta's opt-in policy** is enforced against the Brand's WABA (their phone number quality rating and ban risk). Meta will sanction the WABA, which under a Solution Partner structure means **sanctioning Storees if we own the shared WABA**.

---

## 6. Operational risk if Storees becomes the WABA host

The Q2 2025 change to "Shared WABA always created under the end-business's portfolio" ([Vonage docs](https://api.support.vonage.com/hc/en-us/articles/21336595205532-Difference-Between-Shared-and-Non-Shared-WhatsApp-Business-Accounts-WABAs)) reduces but does not eliminate this risk for Tech Providers, because the brand owns the WABA. Under Solution Partner with credit-line setup, the relationship structure differs and Storees can have more direct WABA-level exposure.

Specific risks worth pricing in:

- **Phone number quality rating (Green/Yellow/Red)** is per-phone-number, assessed on rolling 7 days. A single bad campaign by one tenant drops the rating. **As of October 2025, Meta no longer automatically downgrades messaging tiers when quality drops — quality rating only blocks tier-up, not tier-down** ([Meta docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)). This is a meaningful 2025 improvement for shared-infrastructure operators.
- **Messaging tiers (1k → 10k → 100k → unlimited)** are now portfolio-shared as of Oct 7, 2025. If we host multiple tenants under one portfolio (we wouldn't, but worth noting), they share the limit pool.
- **Account-level bans**: a banned WABA does not nuke the entire portfolio, but a Solution Partner whose clients repeatedly get banned will lose partner status. **Solution Providers can prepare appeals; final decision is Meta's.**
- **Template rejection rate**: industry estimate 60%+ first-submission rejection, ~99% eventual approval. Appeals take 24–48h. Storees will absorb 100% of this support load if direct.

---

## 7. Volume threshold where direct-only beats BSP

Rough model (Indian D2C marketing-heavy mix, 70% marketing / 30% utility-auth, all rates inclusive of typical platform fees):

| Tenant base × monthly msgs | BSP route fully-loaded cost | Direct-Meta cost (Storees as Tech Provider, brand pays Meta) | Direct-Meta cost (Storees as Solution Partner, marks up) |
|---|---|---|---|
| 5 tenants × 20k = 100k | ~₹98k (BSP markup + fees) | ~₹86k to brand + Storees SaaS | ~₹93k (brand) / ~₹7k spread to Storees, eaten by ops |
| 20 tenants × 50k = 1M | ~₹980k | ~₹863k to brand + Storees SaaS | ~₹930k (brand) / ~₹50k–₹150k spread to Storees, marginal after ops |
| 50 tenants × 100k = 5M | ~₹4.9M | ~₹4.3M to brand + Storees SaaS | ~₹4.6M (brand) / ~₹300k–₹500k spread to Storees, real margin |

**Direct-Solution-Partner starts to make financial sense around 1–2M aggregated marketing messages/month**, and becomes meaningful above 5M. Below 1M, the spread doesn't cover the engineering, support, and Solution Partner application overhead.

These are not precise — *uncertain, needs primary research* on:
- Storees' actual current aggregated WhatsApp volume across all tenants (look at `deliveries` table aggregated by channel).
- Exact contracted rates with each BSP we currently route through.

The model is directional; the conclusion (sub-1M is unattractive) holds across reasonable assumptions.

---

## 8. Hybrid argument — and against it

The codebase already supports multiple WhatsApp providers via `channelProviderRegistry.ts`. A hybrid is technically cheap:

- **Tenant brings own WABA + own Meta billing** → route via `metaWhatsappProvider.ts` (direct).
- **Tenant wants us to host** → route via BSP (Gupshup) and pass-through cost with a markup hidden in our SaaS tier.
- **Premium tenants who want a Storees-managed setup with credit terms** → wait until we are Solution Partner.

Engineering cost of hybrid: marginal — the abstraction exists. Real cost is **operational**: support team has to understand three different troubleshooting paths, three different status mappings, three different rate-limit semantics. We've already paid the integration cost for all of these, so the cost is ongoing support load, not net-new build.

**Argument against hybrid:** It splits attention. Every D2C support ticket starts with "which provider is this tenant on?" If we go direct-Meta-as-Tech-Provider for 80% of customers and keep BSP for the long-tail edge cases, simpler is better.

**The right hybrid is provider-as-fallback, not provider-as-architecture**: pick a primary (probably the existing BSP relationship + direct-Meta as Tech Provider after enrollment), keep others wired for failover and tenant-bring-your-own-WABA scenarios.

---

## 9. Critical honest verdict

**The owner is right that we already have direct-Meta wiring (`metaWhatsappProvider.ts`, 381 lines, sends fine). The owner is wrong that flipping that switch unlocks markup. It does not, at the achievable Tech Provider tier.**

Three decision branches:

**Branch A — Storees has <500k aggregated WhatsApp marketing msgs/month (almost certainly true today)**
Stay BSP-primary. Enroll as Meta Tech Provider in parallel because Meta requires every ISV to be one anyway (the June 30 2025 ISV deadline is past — we may already be technically non-compliant if we let clients send via our product without Tech Provider enrollment; **verify this immediately**). Tech Provider status gives us unbranded embedded signup, which is the actual "we look like a real platform, not a Gupshup reseller" upgrade. Do not pitch markup-on-conversations to D2C brands; pitch SaaS value (segments, flows, attribution) and let the brand pay Meta directly for conversations. **Eng investment: ~2–3 weeks for embedded signup + Tech Provider review prep.**

**Branch B — Storees scales to 1–5M aggregated marketing msgs/month with consistent track record**
Apply for Solution Partner. Be honest: this is a 3–6 month process, requires demonstrating volume, requires building a credit/billing layer (we front Meta's charges, invoice brands monthly, eat the receivables risk). The reward is genuine per-message margin. **Eng investment: ~8–12 weeks for billing/credit infra + Solution Partner application + Meta review. Plus a finance function we don't currently have.**

**Branch C — Owner wants to "just flip the switch" because `metaWhatsappProvider.ts` exists**
Refuse. The provider sends. It does not register WABAs at scale, manage tenant onboarding without our brand showing, monitor quality ratings per phone number, throttle adaptively under tier caps, handle template approval workflows, support 24×7 incident response, or carry the receivables risk of bridging Meta and the brand. Implementing the Tech Provider operational layer is ~4–6 weeks. Implementing the Solution Partner operational layer is ~3 months plus ongoing finance ops. **381 lines of `metaWhatsappProvider.ts` is ~5% of the work.**

---

## Recommended next steps (actionable)

1. **Within 1 week**:
   - Pull `deliveries` table aggregated by channel+month for the last 6 months. Get the real aggregated WhatsApp volume. This decides which branch we're in.
   - Verify whether we are formally enrolled as a Meta Tech Provider. The June 30, 2025 deadline already passed; if we aren't enrolled, this is a compliance gap and may explain any odd signup/throttling we've seen.
   - Pull our current Gupshup/Twilio/Bird per-message rates from contracts and compute our actual current markup-vs-Meta-base for the last 3 months.

2. **Within 1 month**:
   - Enroll as Meta Tech Provider regardless of strategy. It costs us little and is required.
   - Build embedded signup UI on top of Meta's SDK. This is the visible "we are a platform, not a reseller" upgrade and unblocks the unbranded onboarding pitch to D2C brands.
   - Stop pitching "markup on WhatsApp conversations" externally. Pitch SaaS value (segmentation, flows, attribution) priced on active customers or message volume, decoupled from per-conversation cost.

3. **Within 1 quarter**:
   - Build quality-rating + tier-limit dashboards per tenant phone number, fed from Meta's status webhooks. This is operational table-stakes for any volume above tier 2.
   - Decide on Solution Partner application based on actual volume trajectory.

4. **Do not** until we cross the threshold:
   - Rip out BSP providers from the registry.
   - Promise D2C brands "lower WhatsApp pricing than Gupshup" — at Tech Provider tier, the brand sees Meta's price, not Gupshup's. We don't control that lever yet.
   - Tell sales we are a "Meta Partner" without qualifying which tier. Brands and procurement teams know the difference.

---

## Sources

- [Meta Solution Providers Overview — developers.facebook.com](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview)
- [Meta WhatsApp Pricing Updates — Jul 2025 changes](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing/)
- [Meta Messaging Limits & Quality Rating](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Meta Policy Enforcement](https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement)
- [360Dialog: Understanding the Meta Tech Provider Program](https://docs.360dialog.com/partner/get-started/tech-provider-program/understanding-the-meta-tech-provider-program)
- [Infobip Tech Provider Program docs](https://www.infobip.com/docs/whatsapp/tech-provider-program)
- [Whautomate India pricing comparison 2026](https://whautomate.com/whatsapp-business-api-pricing-india)
- [WUSeller: 27 reasons Meta rejects templates](https://www.wuseller.com/blog/whatsapp-template-approval-checklist-27-reasons-meta-rejects-messages/)
- [Wati: Why WABAs get banned](https://support.wati.io/en/articles/11463217-why-your-whatsapp-business-account-waba-may-get-banned-or-restricted-and-how-to-avoid-it)
- [Vonage: Shared vs Non-Shared WABAs (Q2 2025 update)](https://api.support.vonage.com/hc/en-us/articles/21336595205532-Difference-Between-Shared-and-Non-Shared-WhatsApp-Business-Accounts-WABAs)
- [India Briefing: DPDP Rules 2025 notification](https://www.india-briefing.com/news/dpdp-rules-2025-india-data-protection-law-compliance-40769.html/)
- [WA.Expert: WhatsApp Opt-In Compliance India](https://wa.expert/pages/whatsapp-opt-in-compliance-india)
- [Soprano Design: Green-tick verification guide](https://www.sopranodesign.com/whatsapp-green-tick-verification-guide/)

*Two-source conflict noted: published "Solution Partner minimum criteria" varies — some sources cite "10 clients + 2,500 daily conversations" as the tier-up bar; Meta's official docs describe the application as discretionary review. Treat the public numbers as approximate floors, not guarantees.*
