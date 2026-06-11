# Dynamic WhatsApp Carousel Engine — Codebase Alignment

Maps the **Spec v1.0** (`whatsapp-dynamic-carousel-engine.md`) against what exists in the Storees codebase today, so we build net-new only where we must. Verdicts: ✅ **reuse**, ⚠️ **rework/extend**, ❌ **net-new**.

> Bottom line: the platform is much closer to this spec than the spec assumes. Messaging, webhooks, attribution bones, catalog sync, field-mapping, flow engine, and frequency/consent guardrails already exist. The genuinely net-new work is the **binding model**, **short-link durability**, **discount engine**, **card-source resolver**, and — critically — **per-contact carousel send assembly** (which today is missing entirely, even though carousel *submission* now works).

---

## 1. What I shipped this session vs the spec

The carousel I just built (`whatsappTemplates.carousel` + `buildMetaComponents` CAROUSEL + `CarouselEditor`) is the spec's **`carousel_manual`** type — merchant authors literal card content. It is **not** `carousel_dynamic`.

| Spec | Current | Verdict |
|---|---|---|
| `carousel_manual` (author each card) | The builder I shipped | ✅ keep as the manual type |
| `carousel_dynamic` (typed slots → bindings, filled at flow-time) | cards store literal body/media/buttons | ⚠️ rework to slot-bindings |
| Button = short-link suffix `go.<domain>/{{1}}` (§2/§9) | static per-card URL inputs | ⚠️ conflicts; dynamic must use short-link suffix |
| Send-time per-contact carousel assembly (§8) | **none** — `buildTemplateComponents` has no carousel; `SendTemplateCommand` has no carousel field | ❌ critical missing link |

The submission path works; **the send path does not assemble carousels per contact.** That gap is the seam between "approved template" and "actually sent."

---

## 2. Catalog (§3) — strong base, missing commerce fields

Tables: `products` ([schema.ts:208](packages/backend/src/db/schema.ts)), `collections`, `product_collections`, plus the vertical-agnostic `items`/`catalogues`. Sync via `syncWorker.ts` (Shopify webhooks + historical), `dataSyncService.ts` + connector templates (`virpanai.ts`, `custom.ts`) with a **real field-mapping engine** (`genericHttpConnector.ts` — dot-paths, array projection, transforms), and order-time passive upsert (`productCatalogService.ts`).

| Spec field | Current column | Verdict |
|---|---|---|
| id, store_id, title, price, currency, image_url, collections[] | `id`, `projectId`, `title`, `basePrice`, `currency`, `imageUrl`, via `product_collections` | ✅ |
| external_id, source | `shopifyProductId` only (no `source` enum) | ⚠️ add `source` |
| description, product_url, tags[], compare_at_price, stock_status, inventory_qty, variant_of, deleted_at | — | ❌ add (some can live in `attributes` jsonb, but stock/price/url/variant should be real columns) |
| custom_1..4 | `attributes` jsonb (unbounded) | ✅ via attributes |
| Nightly reconciliation | only incremental `lastSyncedAt` per connector | ❌ add reconciliation job (spec calls it non-negotiable) |

**Decision to lock first (spec §15.1):** product-level vs variant-level cards → recommend product-level default; store variants with `variant_of`, resolve to parent at card-source time.

---

## 3. Flow engine + send + webhooks + attribution — mostly reusable

| Spec need | Current | Verdict |
|---|---|---|
| `whatsapp_carousel` flow node (§7) | `flows.nodes` jsonb + `ActionNode{actionType:'send_whatsapp'}`; `flowExecutor.executeAction` → `deliveryService.send`; `NodeConfigPanel.ActionForm` already filters **approved** WhatsApp templates | ⚠️ add a node variant + config renderer (clear extension point) |
| `message_sends` table (§4) | `messages` table already has `providerMessageId`, status (queued→sent→delivered→read→clicked→failed), `deliveredAt/readAt/clickedAt`, `flowTripId`, `campaignId`, `variables` | ✅ **reuse `messages`** — no new table. **Required:** snapshot the resolved template **version** + binding output per send (column or inside `variables` jsonb) so a later template edit can't make "why did this card render wrong" undebuggable. |
| `message_cards` (§4) | — | ❌ net-new (per-card product/short-link/rank) |
| Webhook ingestion: delivery + template status + quality + inbound (§14 Q4) | `channelWebhooks.ts` handles Pinnacle **and** Meta: delivery receipts, `message_template_status_update` (APPROVED/REJECTED/PAUSED/FLAGGED/CATEGORY_UPDATE), inbound parse | ✅ already covered |
| Attribution: click→session→purchase + revenue (§12) | `events` + `anonymousSessions` (session→customer stitch, back-attribution) + `ctwaAttributions` (click→inbound→purchase revenue) + `flowAnalyticsService` funnel/message stats + `ConversionGoal` revenue attribution | ✅ strong bones; `stid` maps to existing `sessionId` stitch |
| Frequency cap / consent / quiet hours (§13) | `DEFAULT_FREQ_CAPS.whatsapp_marketing = 1/7d`, consent blocking, `blockReason` | ✅ exists; confirm quiet-hours coverage |
| Rate limiting (§8) | `deliveryWorker` 50/s + 50 concurrency; per-tenant **email-only** budget | ⚠️ add WhatsApp per-WABA tier limiting |

---

## 4. Short-link service (§9) — exists but must be rebuilt durable

`urlTracker.ts` already does redirect + click-logging + 302 + idempotent event insert — **but** it's an **in-memory `Map`** (lost on restart, single-process), SMS-only, 12-char hex, no UTM, no bot filter, no `stid` stitch, no click table.

Verdict: ⚠️ **rebuild on the same pattern** — durable `short_links` + `short_link_clicks` tables, base62 8-char slug, UTM, bot filter (Meta link-preview UA exclusion), `stid` → session stitch, async click logging, channel-agnostic (reusable for SMS). New domain `go.storees.io`.

---

## 5. Discount engine (§10) — net-new

Today: `orders.discount` (amount only), discount % derived from events, coupon code is a **manual text field** in the AI copywriter. No code inventory, no pools, no reservation, no Shopify price-rule integration.

Verdict: ❌ net-new — `discount_pools`, `discount_codes`, atomic reservation (`UPDATE … WHERE contact_id IS NULL LIMIT 1` row-lock), pre-generation for blasts, on-demand for journeys, Shopify price-rule `ends_at` expiry, redemption webhook → `attribution_events`.

---

## 6. Net-new components (the actual engine)

- **`wa_template_bindings`** (§4/§5) — typed slots → catalog fields; dynamic builder mode (no raw `{{n}}`).
- **Card Source Resolver + filter/rank pipeline** (§6) — `resolve(contact, config) → ranked ProductList`; strategies (collection, specific first); shared filter (stock/image/price/exclusions/dedupe/backfill).
- **Send-time Assembler** (§8) — resolve source → reserve discount → mint short links → resolve bindings → build **per-card Pinnacle payload** → send via `messages`. **This is the missing seam** and is gated on §14.
- **`message_cards`**, **`short_links`/`short_link_clicks`**, **`discount_pools`/`discount_codes`** tables.
- **Preview API** (§11) — `sample_products` + `contact` mode; reuses resolver.
- **Catalog schema extensions + reconciliation job** (§3).
- Extend `SendTemplateCommand` with `carousel` + `buildTemplateComponents` carousel logic ([whatsappUtils.ts](packages/backend/src/services/providers/whatsappUtils.ts), [deliveryService.ts](packages/backend/src/services/deliveryService.ts)).

---

## 7. §14 Pinnacle blockers — must answer before send-path build

These gate the Send-time Assembler; my carousel **submission** currently *guesses* the shapes (`example.header_handle:[url]`, no send-time assembly), so none of it is verified. **Ask for working sample payloads, not prose** — one carousel *submission* request and one carousel *send* request exactly as their API expects, plus sandbox WABA. A concrete sample answers Q1/Q3/Q8 in one shot. **Q2 is the priority answer — it changes the architecture.**

1. **Carousel payload shape at SEND time** (per-card components) — *request a sample payload*.
2. **[PRIORITY]** Min card count; can a runtime send include **fewer** cards than the approved template? (drives backfill-vs-skip — architectural).
3. **Media at send**: CDN link per card vs upload handle (+ handle TTL/caching). My submission uses `header_handle:[url]` — confirm Pinnacle accepts a URL. *(covered by sample payload)*
4. Webhook coverage for carousel/template/quality — **mostly already handled** in `channelWebhooks.ts`; confirm no carousel-specific deltas.
5. Throughput/tier limits per WABA + batching guidance.
6. Pricing — confirm **1 carousel = 1 message** billing.
7. Meta per-user marketing frequency (India) + how rejections surface (we already treat `failed` as terminal).
8. Variable limits per card body / bubble body. *(covered by sample payload)*
9. Sandbox WABA for dev.
10. **Card-level error surfacing** — if one card's media/body fails validation, is it **whole-message rejection** or partial? (changes retry logic.)

---

## 8. Build order — parallel tracks, one true gate

Only the **assembler (Track D)** is gated on Pinnacle. Everything else starts now.

> **Hard sequencing constraint (don't violate):** the short-link domain is **baked into the approved template** — the button URL `go.storees.io/{{1}}` is fixed at Meta approval time. So **pick + configure the domain → ship the durable short-link service → only then submit any dynamic carousel template.** Submitting a dynamic template before the domain is final means every template needs re-approval when the domain changes. Nobody submits a dynamic template "just to test approval."

**Gate (this week):** get §14 answers from Pinnacle (as sample payloads — see §7); **lock catalog schema** + variant decision; **finalize the short-link domain**.

**Track A — Data (unblocked):** catalog column extensions (`source`, `product_url`, `compare_at_price`, `stock_status`, `inventory_qty`, `tags`, `variant_of`, `deleted_at`) + nightly reconciliation job. The resolver can't be tested without it.

**Track B — Links (unblocked, domain-first):** durable rebuild of `urlTracker` — `short_links`/`short_link_clicks` tables, base62 8-char, UTM, bot filter, `stid` → existing `anonymousSessions` stitch, async logging, channel-agnostic. **Decide the domain before any dynamic-template submission.**

**Track C — Template (unblocked):** `wa_template_bindings` + builder pivot to typed slots + short-link button. **Keep the shipped editor as `carousel_manual`; add dynamic mode beside it.**

**Between C and D (unblocked):** Card Source Resolver + filter/rank pipeline (`collection`, `specific_products`) — outputs an internal ProductList, so not Pinnacle-gated.

**Track D — Assembler (gated on §14):** `SendTemplateCommand.carousel` + `buildTemplateComponents` carousel; resolve source → reserve discount → mint short links → per-card payload → `messages` + `message_cards`. Starts the day Pinnacle answers land.

**Then:** flow node + preview API (`sample_products`) + test-send; discounts (`existing_code` + `sale_price_only` first); card-level analytics. Phase B/C per spec §16.

---

## 9. Locked decisions (confirmed — do not re-litigate)

1. **Product-level cards.** Variants resolve to parent at card-source time.
2. **Reuse `messages`** — no `message_sends` table. Snapshot template **version** + resolved binding output per send (see §3 caveat).
3. **Reuse `events`** — no parallel `attribution_events` table. Add only the missing `code_redemption` event type; `message_cards` carries card linkage. (Avoid dual-write attribution.)
4. **Inline node config** for Phase A (no saved reusable card sources).
5. **Single currency + single language per store** in Phase A.

## 10. Definition of done — Phase A acceptance (the only "done" that counts)

One real-device end-to-end smoke test is the bar. Phase A is **not** done until this passes:

> Submit a **3-card dynamic** template bound to real catalog fields → get it **approved** → trigger a flow whose node resolves a **collection** source → send to a real phone → **tap a card** → the click logs against **`message_cards`** → the session **stitches via `stid`** into `anonymousSessions`.

Build toward this test, not toward unit tests that pass against *guessed* Pinnacle payloads. (Mirrored into project `CLAUDE.md`.)

---

### Reference: key files
Catalog: `db/schema.ts` (products/collections/items), `workers/syncWorker.ts`, `services/dataSyncService.ts`, `services/productCatalogService.ts`, `services/connectors/*`.
Flows/send: `shared/types.ts` (FlowNode), `flows`/`services/flowExecutor.ts`, `services/deliveryService.ts`, `components/flows/NodeConfigPanel.tsx`.
WhatsApp/webhooks: `services/providers/{pinnacle,meta}WhatsappProvider.ts`, `services/providers/whatsappUtils.ts`, `routes/channelWebhooks.ts`, `db/schema.ts` (`messages`, `whatsapp_templates`).
Links/attribution: `routes/urlTracker.ts`, `db/schema.ts` (`events`, `anonymousSessions`, `ctwaAttributions`), `services/flowAnalyticsService.ts`.
