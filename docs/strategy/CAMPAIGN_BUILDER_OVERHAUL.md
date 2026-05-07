# Campaign Builder Overhaul — MoEngage-Parity Plan

> **Goal:** bring the Storees campaign creation flow (email + WhatsApp + SMS + Push)
> to parity with MoEngage's enterprise builder, with template variables, audience
> targeting, scheduling, and personalization that match what enterprise teams expect.
>
> **Scope:** ~10 weeks of engineering, broken into 7 phases that each ship
> independently. Each phase produces user-visible value — no big-bang releases.

---

## Reference: MoEngage 3-step wizard

```
Step 1 — Target users          Step 2 — Content              Step 3 — Schedule + goals
─────────────────────          ─────────────────             ──────────────────────────
Team filter                    Email Connector dropdown      Send: ASAP / fixed / TZ / AI
Campaign name + tags           Sender Name / From / Reply    A/B test
Content type                     /Cc/Bcc                     Conversion goals
Subscription category          Subject + Preview Text        Frequency capping
Email-attribute selector       Drag-drop OR HTML editor      Rate limit (req/min)
Audience: All / Filter         118 prebuilt templates        Time zone selector
  + nested filters             Saved + API templates         Control group (holdout)
  + exclude users              Per-block: padding/dark/hide
Audience cap                   Personalized links
Control group toggle           Dynamic images
                               UTM params w/ vars
                               Test campaign w/ sample data
                               Attachments + Gmail annotation
                               Merlin AI variations
```

---

## Gap analysis vs current Storees

| Capability | MoEngage | Storees today | Gap |
|---|---|---|---|
| **Variable mapping per template** | First-class — pick field per `{{var}}` | Hardcoded 3 vars | ❌ Critical |
| **Audience filter at campaign creation** | Inline nested filters | Pick a saved segment | ⚠️ Partial |
| **Subscription categories** | BrandA / BrandB / etc. | Single consent flag | ❌ Missing |
| **Team filter (RBAC scope)** | Per-team audience scope | Agent scope flag | ⚠️ Partial |
| **Audience cap** | Limit recipient count | Not exposed | ❌ Missing |
| **Control group (holdout)** | Built-in | Not implemented | ❌ Missing |
| **Multi-ESP connectors** | SendGrid / SES / Mailgun / Postmark | Resend only | ❌ Missing |
| **Sender details** | Sender Name, multi From, Reply-To, Cc, Bcc | Single from-name | ❌ Missing |
| **Attachments** | PDF / images / docs | No | ❌ Missing |
| **Drag-and-drop editor** | Beefree-style block editor | HTML textarea only | ❌ Missing |
| **Template library** | 118 prebuilt + user-saved | Limited | ❌ Missing |
| **Personalized links** | Variables in URLs | No | ❌ Missing |
| **Dynamic images** | Per-recipient image swap | No | ❌ Missing |
| **UTM with variables** | UTM builder + `{{Campaign Name}}` | Hardcoded UTM | ⚠️ Partial |
| **Test campaign w/ sample data** | Preview using a real customer | Static preview | ❌ Missing |
| **Send time options** | ASAP / fixed / user TZ / AI best-time | ASAP / fixed | ⚠️ Partial |
| **Conversion goals** | Multi-event tracking | Schema present, no UI | ⚠️ Partial |
| **Frequency capping** | Configurable per-campaign | Project-level only | ⚠️ Partial |
| **Rate limit (req/min)** | User-configurable throttle | Hardcoded | ❌ Missing |
| **Dark-mode preview** | Inline | No | ❌ Missing |
| **Mobile/desktop preview** | Toggle | No | ❌ Missing |
| **AI subject + body variations** | Merlin AI integration | Segment AI only | ❌ Missing |
| **WhatsApp template wizard** | Same flow with template selector | Basic WhatsApp send | ❌ Missing |
| **WhatsApp media headers** | Image/video/doc uploads | Text only | ❌ Missing |
| **WhatsApp button vars** | Per-button URL vars | Static | ❌ Missing |
| **Multi-language variants** | Locale-specific copy | No | ❌ Missing |

**Verdict:** ~25 capabilities missing or partial. This is a multi-month overhaul,
not a feature.

---

## Phased delivery plan

### Phase 0 — Variable system foundation (1 week) ⭐ START HERE

The thing every other phase depends on. Without this, building a "variable picker"
in a fancy UI is meaningless because the backend would silently drop them.

**Backend:**
- Migration: add `variables JSONB` column to `templates` and `campaigns`
- New service: `templateContext.ts` — `resolveTemplateVariables(template, customer, eventProps?, project)`
  - Returns flat `Record<string, string>` for substitution
  - Sources: `customer.<field>`, `customer.attributes.<key>`, `event.<key>`, `project.<field>`, `literal:<v>`
  - Filters: `| money`, `| date:<format>`, `| default:<value>`, `| upper`, `| lower`
- Wire into all 4 channels: replace hardcoded blocks in
  - [campaignService.ts:374](packages/backend/src/services/campaignService.ts#L374)
  - [flowExecutor.ts:340](packages/backend/src/services/flowExecutor.ts#L340)
  - WhatsApp / SMS / Push provider variable maps
- Lint at save-time: undefined vars → blocking error

**Frontend:**
- "Variables" panel beside subject + body textareas
- Auto-detect `{{key}}` in body → row appears
- Per-row: source dropdown (grouped Customer / Order / Engagement / Custom Attributes / Event / Literal) + default value + live preview
- "Test with sample customer" — pick real customer, see rendered output

**Deliverable:** any `{{var}}` works across email + SMS + WhatsApp + push, with
a UI that shows what's available and what each maps to.

---

### Phase 1 — Campaign creation wizard (2 weeks)

Replace the single-page editor with the 3-step wizard.

**Step 1 — Target users:**
- Team filter (RBAC-scoped audience)
- Campaign name + tags (free-text + multi-select)
- Content type: Promotional vs Transactional (already exists)
- Subscription category dropdown — **new table** `subscription_categories(project_id, name, description)`, customer opt-in tracked in `customer_subscriptions(customer_id, category_id, opted_in_at)`
- "User attribute with email address" — for projects with multiple email columns
- Audience picker: **All users** OR **Filter users by** (inline FilterConfig builder, same engine as segments) OR **Use saved segment**
- Nested filter support (AND-of-OR)
- Exclude Users checkbox (inverts predicates into NOT EXISTS)
- Audience cap toggle + recipient count limit
- Control group toggle + holdout %

**Backend:**
- New: `campaign_subscription_categories` join table
- New: `campaign_holdouts` table (campaign_id, customer_id, reason)
- Extend campaign send pipeline: skip holdout customers, log them as "control"
- Track holdout conversion vs sent for lift measurement

**Step 2:** sender + content (Phase 2 below)
**Step 3:** schedule + goals (Phase 5 below)

**Deliverable:** users see the same 3-step flow MoEngage ships, with audience
filtering + control groups as table stakes.

---

### Phase 2 — Email content polish (2 weeks)

The "Step 2 / Email" experience.

- **Sender Details tab:**
  - Sender Name (free-text, ASCII-encoded for headers)
  - From email — dropdown from `project_email_senders(id, project_id, address, verified_at)` table
  - Reply-to email
  - Cc / Bcc — comma-separated addresses
- **Attachments tab:**
  - File upload to S3 or local storage, max 25MB, MIME validation
  - Stored in `campaign_attachments(id, campaign_id, filename, mime, s3_key)`
  - Resend supports up to 40MB per email — pass through
- **Gmail annotation tab:**
  - Optional Gmail Promotions Tab markup (image, deal text, expiry)
  - Embedded in `<script type="application/ld+json">` per Google spec
- **Drag-and-drop editor:**
  - Recommend integrating **Unlayer/Beefree** (commercial license) — building from
    scratch is 6-month project. Unlayer license ~$1000/mo for white-label.
  - Storees-templated block library: hero, product card (3-up), CTA button, footer
    with unsubscribe
  - Per-block: padding (4 sides), background, hide-on-mobile, dark-mode override
  - Personalized links — wrap `<a>` with variable substitution at send-time
  - Dynamic images — `{{recipient_image:variant}}` resolves at send-time per customer
- **HTML editor toggle** — switch between visual + raw HTML
- **Dark-mode preview** — apply `prefers-color-scheme: dark` CSS to render
- **Mobile/desktop toggle** — 375px vs 600px viewport
- **Test campaign:**
  - Send to address(es) using sample customer's data (toggle "use sample data from preview")
  - Or "validate format only" — variables left unsubstituted

**Backend:**
- Migration: `project_email_senders`, `campaign_attachments`
- Resend `attachments` array at send-time
- Personalized-link rewriter in `interpolateTemplate`

**Deliverable:** email creation feels like MoEngage / HubSpot / Mailchimp.

---

### Phase 3 — WhatsApp parity (1 week)

WhatsApp Business API has its own template world. The flow needs to mirror Meta's.

- **Template picker** — list approved templates from Meta Business API
  - Body w/ `{{1}}`, `{{2}}` placeholders
  - Header type: text / image / video / document
  - Buttons: quick-reply / call-to-action (URL, phone)
- **Variable mapping:**
  - For each `{{N}}` placeholder → pick customer field (same picker as Phase 0)
  - For URL-button variables → pick field for the URL suffix
  - Header media: upload OR pick from variable (e.g., `{{customer_image_url}}`)
- **Multi-language variants:**
  - Same template ID may have `en_US`, `hi_IN`, `ta_IN` versions
  - Storees picks based on `customer.language` field, falls back to default
- **Carousel templates** (Meta's newer format)
  - 1-10 cards, each with image + body + button
  - Per-card variable mapping
- **Send-time validation:**
  - Block if template not in `APPROVED` status with Meta
  - Block if customer is outside 24h service window (for non-marketing templates)

**Backend:**
- Existing `metaWhatsappProvider.ts` knows the API; needs variable-mapping resolver
- New: `whatsapp_templates(id, project_id, name, language, status, structure)` — synced from Meta
- New: sync worker — refresh templates from Meta every hour, surface status changes (APPROVED / REJECTED / PAUSED)

**Frontend:**
- Step-2 swaps from "email editor" → "WhatsApp template picker" based on channel
- Live preview of WhatsApp message bubble with sample data substituted

**Deliverable:** WhatsApp campaigns feel like Twilio Studio / Wati / AiSensy —
not a stripped-down email-clone.

---

### Phase 4 — UTM + tracking enhancements (3 days)

- **UTM parameter builder:**
  - Default: source, medium, campaign — pre-filled with `{{campaign_name}}` etc.
  - "Create custom parameter" — user-defined key/value with variable support
  - Per-campaign override (currently project-default only)
- **Personalized links:**
  - User can type `{{customer_id}}` in any href — resolves at send-time
- **Dynamic images:**
  - `{{recipient_image:winter_jacket}}` — resolves to per-recipient asset URL
  - Backed by `customer.attributes.images.<key>` or upload pool

**Deliverable:** every link + image in a campaign can be personalized.

---

### Phase 5 — Schedule + goals (1 week)

The "Step 3" experience.

- **Send time options:**
  - ASAP (already exists)
  - At fixed time + timezone selector
  - **Send in user's timezone** — staggered delivery based on `customer.timezone`
  - **Best time for user (AI)** — uses `sendTimeService.ts` (already partially built)
- **Conversion goals:**
  - Multi-goal: primary + secondary
  - Each goal: event name + filter (e.g., "purchase where total > 1000")
  - Tracking window: configurable hours (default 36)
  - Already in schema — just needs UI
- **Frequency capping:**
  - "Ignore frequency capping" toggle (transactional usually does)
  - "Count for the frequency capping" — does sending this count toward future caps?
- **Rate limit:**
  - Requests per minute (default unlimited, configurable cap)
  - "Sending speed may be increased to deliver within X minutes" — message
  - Backend: `BullMQ` rate limiter on the campaign worker

**Backend:**
- New: per-customer staggered-send job scheduling (jobs created at customer-local-time)
- Rate limiter on `campaignWorker` — `bullmq` has `limiter` option

**Deliverable:** schedule + goals match MoEngage exactly.

---

### Phase 6 — AI features (1 week, optional)

MoEngage's "Merlin AI." Storees has Groq integration for segments — extend it.

- Generate subject lines (5 variations)
- Generate body copy from a brief
- Generate WhatsApp template body
- "AI Variation" button on existing copy → 3 reworded options
- Tone presets: friendly / professional / urgent

**Backend:**
- Extend `aiSegmentService.ts` pattern — same Groq client, different prompt
- Cache outputs in Redis (24h) to avoid re-billing

**Deliverable:** content creation accelerator.

---

### Phase 7 — Multi-ESP connectors (2 weeks, optional)

If a tenant outgrows Resend or wants their own ESP relationship.

- Email Connector dropdown (Phase 2 placeholder for this)
- Adapters: Resend (existing) + SendGrid + AWS SES + Mailgun + Postmark
- Per-project credentials in `project_email_connectors(project_id, provider, credentials_encrypted)`
- Webhook handlers for each — map their event shapes to our unified status pipeline
- All hit the same `messageStatusService.handleDeliveryReceipt` — events stay channel-agnostic

**Deliverable:** parity with MoEngage's multi-ESP support; lets you offer
"bring your own ESP."

---

## Tech decisions to make before starting

1. **Drag-and-drop editor:** Buy Unlayer ($1k/mo) or build? Recommendation: buy.
   Building is a 6-month detour that doesn't differentiate the product.
2. **Template library source:** Build 50 in-house OR license a pack?
   Recommendation: Beefree free-tier + 10 Storees-original templates.
3. **Subscription category model:** Per-project or per-brand-within-project?
   Recommendation: per-project; brand sub-segmentation via tags.
4. **Holdout group methodology:** Random per-campaign OR persistent per-customer?
   Recommendation: random per-campaign with `holdout_seed` for reproducibility.
5. **WhatsApp template sync cadence:** Hourly or webhook-driven (Meta supports webhooks for status changes)?
   Recommendation: webhook + hourly safety-net.
6. **Multi-language fallback:** What if a customer's language has no template?
   Recommendation: fall back to project's default language; surface as warning at campaign create.

---

## Effort summary

| Phase | Effort | Cumulative | Ships? |
|---|---|---|---|
| 0 — Variables | 1 wk | 1 wk | ✅ Standalone value |
| 1 — Wizard + audience | 2 wk | 3 wk | ✅ |
| 2 — Email content | 2 wk | 5 wk | ✅ |
| 3 — WhatsApp parity | 1 wk | 6 wk | ✅ |
| 4 — UTM/tracking | 3 d | ~6.5 wk | ✅ |
| 5 — Schedule/goals | 1 wk | ~7.5 wk | ✅ |
| 6 — AI (optional) | 1 wk | ~8.5 wk | ✅ |
| 7 — Multi-ESP (optional) | 2 wk | ~10.5 wk | ✅ |

**Critical path (must-have for MoEngage parity):** Phases 0 → 1 → 2 → 3 → 5.
That's **7 weeks** of focused work and gets to feature parity for both
email + WhatsApp.

Phases 4 / 6 / 7 are accelerators — useful but not blocking.

---

## Recommended sequencing

**Week 1** — Phase 0 (Variables). Without this, Phases 1-3 produce broken UIs
that promise variable mapping but don't render.

**Weeks 2-3** — Phase 1 (Wizard + audience). Largest UX shift; user-visible
from day one even if Step 2 is still the old editor.

**Weeks 4-5** — Phase 2 (Email content). Email is the primary channel; depth here matters.

**Week 6** — Phase 3 (WhatsApp). Self-contained because WhatsApp has its own template world.

**Week 7** — Phase 5 (Schedule + goals) + Phase 4 (UTM). Closes the campaign-creation loop.

**Weeks 8+** — Phase 6 (AI) + Phase 7 (Multi-ESP) as needed, in parallel with new feature work.
