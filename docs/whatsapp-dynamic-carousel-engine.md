# Storees: Dynamic WhatsApp Carousel Engine

Spec v1.0 | June 2026

## 1. Purpose and positioning

A product feed to dynamic WhatsApp carousel engine for Storees. Merchants create a generic carousel template once, then any flow can fill it with products from collections, behavioral signals, or ML recommendations, with optional discount codes. No per-campaign variable mapping, no template-per-collection sprawl.

Design principle: **push all mapping work to the earliest possible moment, so flow-time is pure selection, never mapping.**

Three mapping moments:

1. Catalog ingestion (once per store): external fields map to the Storees standard product schema.
2. Template creation (once per layout): typed slots bind template variables to schema fields.
3. Flow node (every campaign): merchant only selects template, content source, and discount. No variables visible.

## 2. Architecture overview

```text
Shopify / VirpanAI / CSV-API feed
        |
Catalog Service (standard schema, webhook sync + nightly reconciliation)
        |
Card Source Resolver (collection, specific, personalized strategies)
        |
Filter and Rank Pipeline (stock, image, price, exclusions, dedupe, backfill)
        |
Send-Time Assembler (bindings -> Pinnacle carousel payload)
        |
   +----+----------------------------+
   |                                 |
Short Link Service              Discount Engine
(click tracking, redirects)     (static, pooled, on-demand codes)
   |                                 |
Pinnacle BSP -> Meta -> Customer
        |
Webhook Ingestion (delivered, read, replies) + Click Logs + Redemptions
        |
Attribution and Analytics (message and card level, feeds Thompson Sampling)
```

Key constraint driving the design: Meta URL buttons in approved templates support only one dynamic variable as a suffix to a fixed base URL. Therefore the button URL is always `https://go.<domain>/{{1}}` and a Storees short-link redirect service handles click logging and the 302 to the real product URL. Meta does not deliver webhooks for URL button clicks (only quick-reply taps), so the redirect layer is the only reliable click signal.

## 3. Standard catalog schema (load-bearing decision)

Every product in Storees conforms to this schema regardless of source. Lock this before building the template builder, since typed slots are pointers into it.

| Field | Type | Notes |
|---|---|---|
| id | uuid | Storees internal |
| store_id | uuid | tenant |
| external_id | string | Shopify product/variant ID, VirpanAI ID, or feed key |
| source | enum | shopify, virpanai, feed |
| title | string | |
| description | text | optional |
| price | decimal | current selling price |
| compare_at_price | decimal nullable | strikethrough price |
| currency | string | ISO 4217 |
| image_url | string | primary image, CDN |
| product_url | string | canonical PDP URL |
| collections | string[] | collection handles/IDs |
| tags | string[] | |
| stock_status | enum | in_stock, out_of_stock, unknown |
| inventory_qty | int nullable | |
| variant_of | uuid nullable | see variant handling below |
| custom_1 .. custom_4 | string nullable | merchant-labeled extensible fields (rating, delivery time, fabric, etc.) |
| updated_at | timestamp | |
| deleted_at | timestamp nullable | soft delete on source removal |

**Variant handling (open decision, recommend deciding before build):** carousels should default to product level (one card per product, primary variant price and image). Variant-level cards explode card counts and confuse recommendations. Recommendation: store variants with `variant_of`, resolve to parent at card-source time, allow variant-level only for the Specific Products picker.

**Sync strategy:**
- Shopify: `products/create`, `products/update`, `products/delete`, `inventory_levels/update` webhooks, plus nightly full-sync reconciliation job (webhooks drop; reconciliation is non-negotiable).
- VirpanAI: internal API or direct read, cheapest integration, same reconciliation pattern.
- CSV/API feed: one-time field-mapping screen at connection (the only place any merchant ever maps fields), scheduled pulls.
- Price formatting: store numeric, format at render using store locale and currency (₹499, €4.99). Never store formatted strings.

## 4. Data model

```text
catalogs
  id, store_id, source, status, last_full_sync_at, field_map_json (feed only)

catalog_items
  (schema per section 3)

wa_templates
  id, store_id, name, language, category (marketing),
  type (carousel_dynamic, carousel_manual, standard),
  card_count, bsp_template_id, meta_status (draft, pending, approved, rejected, paused),
  quality_rating, version, active_version_id, created_at

wa_template_bindings
  id, template_id, component (bubble_body, card_body, card_header, card_button),
  card_position (null = applies to all cards), variable_index,
  source_type (catalog_field, discount_code, static_text, contact_attribute),
  source_key (e.g. title, price, compare_at_price, image_url, custom_1)

card_sources  (resolved config lives on the flow node; this table is for saved/reusable sources, optional Phase B)

flow_node_carousel_config  (embedded JSON on the flow node, see section 7)

discount_pools
  id, store_id, campaign_or_flow_id, provider (shopify, virpanai),
  value_type (percent, amount), value, expiry_hours,
  codes_total, codes_reserved, codes_redeemed, status

discount_codes
  id, pool_id, code, contact_id nullable (set on reservation),
  reserved_at, sent_at, redeemed_at, order_id nullable

short_links
  id, slug (8-char base62), store_id, message_id, card_position,
  product_id, destination_url, utm_json, created_at, expires_at nullable

short_link_clicks
  id, short_link_id, clicked_at, ip_hash, user_agent, is_bot boolean

message_sends
  id, store_id, flow_id, node_id, contact_id, template_id, template_version,
  bsp_message_id, status (queued, sent, delivered, read, failed),
  failure_reason, sent_at, delivered_at, read_at

message_cards
  id, message_id, card_position, product_id, short_link_id,
  source_strategy (collection, specific, recently_viewed, ...),
  rank_score nullable

attribution_events
  id, store_id, contact_id, message_id nullable, card_id nullable,
  type (click, session, add_to_cart, purchase, code_redemption),
  order_id nullable, revenue nullable, occurred_at
```

## 5. Template builder and bindings

### 5.1 Builder UX

No raw `{{1}}` variables anywhere. The merchant assembles a card from typed slots:

- Card header: Product Image (bound to `image_url`)
- Card body: pick components in order: Product Title, Price, Compare-at Price, free text, custom field
- Card button: implicitly Product Link via short-link service (label editable: View Product, Shop Now)
- Bubble body: free text with optional inline slots: First Name (contact attribute), Discount Code

Storees generates the Meta variable structure underneath and writes `wa_template_bindings`. All cards in a Meta carousel must share one structure, so the builder designs one card and applies it to all positions (`card_position = null` in bindings).

Sample values for Meta approval are pulled automatically from a real catalog product (highest-revenue in-stock product as default). No typing fake data.

### 5.2 Template types

- **carousel_dynamic**: slots bound to catalog, fillable by any card source.
- **carousel_manual**: merchant fills each card by hand at campaign time (store launches, festival offers, non-product content). Still goes through short links for click tracking.
- Standard (non-carousel) templates unchanged.

### 5.3 Versioning and approval

- Editing an approved template creates a new version requiring re-approval; the old version stays sendable until the new one is approved, then flows referencing the template auto-advance (flows pin `template_id`, resolve `active_version_id` at send).
- Track Meta quality rating and paused status via Pinnacle webhooks. A paused template must immediately fail-safe in flows (see section 13).
- Approval status surfaced as badges in the template gallery.

## 6. Card source abstraction

Interface: `resolve(contact, config) -> ranked ProductList`

### 6.1 Strategies

| Strategy | Inputs | Notes |
|---|---|---|
| collection | collection_id, order_by (best_selling, newest, price_asc, price_desc) | top N where N = template card count |
| specific_products | ordered product_id[] | merchant-curated, drag to order |
| recently_viewed | lookback window | from existing event stream |
| abandoned_cart | cart snapshot | cart line items, most recent first |
| abandoned_browse | lookback window | viewed, not carted, not purchased |
| best_sellers | window (7d, 30d) | from analytics, also the universal backfill source |
| recommendations | model = collaborative_filtering | existing CF model output |
| back_in_stock | wishlist/viewed intersect restock events | requires inventory webhooks |

### 6.2 Shared filter and rank pipeline

Applied to every strategy's raw output, in order:

1. Filter: `stock_status = in_stock`, `image_url` present and reachable format, `price > 0`, not purchased by this contact in last X days (configurable, default 30), category/tag exclusions (node-level), not deleted.
2. Dedupe by product id (and by `variant_of` parent).
3. Rank: strategy-native order, optionally re-ranked by Thompson Sampling in Phase C.
4. Truncate to template card count.
5. Backfill or skip: if surviving cards < card count, either backfill from best_sellers (excluding already-selected) or skip the send. Node-level merchant choice, mandatory for personalized strategies.

Meta minimum card count and whether runtime card count can be fewer than the approved template's count: **verify with Pinnacle** (section 14). Design assumes fixed count with backfill; if Meta allows fewer, backfill becomes optional.

## 7. Flow node config JSON

New node variant for the structured vertical renderer: `whatsapp_carousel`.

```json
{
  "type": "whatsapp_carousel",
  "template_id": "tpl_8f3a",
  "card_source": {
    "strategy": "recently_viewed",
    "config": { "lookback_hours": 72 },
    "exclusions": { "tags": ["gift-card"], "purchased_within_days": 30 },
    "fallback": { "mode": "backfill_best_sellers" }
  },
  "discount": {
    "mode": "generate_pool",
    "value_type": "percent",
    "value": 10,
    "expiry_hours": 48
  },
  "send_options": {
    "best_time_to_send": true,
    "quiet_hours_respect": true,
    "frequency_cap_respect": true
  }
}
```

`discount.mode` enum: `none | existing_code | generate_pool | sale_price_only`.

UI behavior (progressive disclosure): the discount step is required when the selected template has a `discount_code` binding, hidden with an explanatory hint when it does not. Collection picker, product picker, and strategy dropdown render per section 6.1. Right rail shows live preview (section 11).

## 8. Send-time assembly pipeline

Per contact, at flow execution:

1. Resolve card source through the pipeline (section 6.2). On skip outcome, record `message_sends.status = skipped` with reason, continue flow per node's on-skip edge.
2. Reserve discount code if `generate_pool` (atomic reservation, see section 10).
3. Create short links: one per card, slug = 8-char base62, destination = `product_url` + UTM params (`utm_source=storees&utm_medium=whatsapp&utm_campaign={flow}&stid={slug}`).
4. Resolve bindings to values, format prices per store locale.
5. Build Pinnacle carousel payload (bubble body params, per-card header image, body params, button URL suffix = slug).
6. Send via Pinnacle with store-level rate limiting and retry with backoff on transient failures.
7. Write `message_sends` + `message_cards` rows.
8. Ingest Pinnacle webhooks: sent, delivered, read, failed (update status), inbound quick replies if used.

**Stock race:** re-check `stock_status` at assembly time (step 4), not only at resolution time, for scheduled blasts where resolution may precede send by hours. Swap-in backfill on failure.

**Throughput:** large blasts pre-resolve in batches; respect Pinnacle/Meta messaging tier limits per WABA; queue with per-store concurrency caps.

## 9. Short link service

- Dedicated domain (e.g. `go.storees.io`), optionally white-label per merchant later (CNAME, Phase C+).
- `GET /{slug}`: log click (timestamp, hashed IP, user agent), bot filter (known crawler UA list + Meta link-preview fetcher exclusion, mark `is_bot`), 302 to destination with UTM and `stid` param.
- The `stid` param enables session stitching: web SDK reads it, attaches to session, links subsequent add_to_cart and purchase events to the message and card.
- Slug TTL: none by default (links keep working), but clicks after a configurable attribution window do not attribute.
- Latency target: redirect under 100ms, click logging async (write to queue, not blocking redirect).
- This service is also reusable for SMS link tracking later: build it channel-agnostic.

## 10. Discount engine

### 10.1 Modes

1. **existing_code**: picker synced from Shopify price rules / VirpanAI coupons. Code rendered into the bubble body slot.
2. **generate_pool**: per-user unique codes.
   - Scheduled blasts: pre-generate the pool when the campaign is scheduled (audience size + 10% buffer). Avoids Shopify API rate-limit chokes at send time.
   - Triggered/journey sends: generate on demand (volume naturally throttled), with a small standby pool as cushion.
   - Reservation must be atomic (`UPDATE ... WHERE contact_id IS NULL LIMIT 1` with row lock or equivalent) to prevent double-assignment under concurrency.
   - Pool exhaustion: auto-extend job triggers at 80% reserved; if extension fails, node falls back to a configured static code or skips discount (merchant choice).
3. **sale_price_only**: no code, cards show compare_at_price vs price.

### 10.2 Expiry and follow-up

Time-boxed codes (expiry_hours) enable a follow-up node pattern: "code expires in 24h" reminder to non-clickers. Expiry enforced at the provider (Shopify price rule `ends_at`), displayed in bubble copy.

### 10.3 Attribution via redemption

Code redemption webhooks (Shopify `orders/create` with discount_codes, VirpanAI order events) write `attribution_events.type = code_redemption` linked through `discount_codes.contact_id`. This is the second attribution channel, independent of click tracking.

## 11. Preview API contract

```text
POST /api/v1/carousel/preview
{
  "template_id": "tpl_8f3a",
  "card_source": { ...same shape as node config... },
  "discount": { ...same shape... },
  "preview_as": { "mode": "sample_products" }
  // or { "mode": "contact", "contact_id": "c_991" }
}

200 OK
{
  "bubble_body": "Hi Priya, your picks are waiting. Use WELCOME10 for 10% off, valid 48h.",
  "cards": [
    {
      "position": 1,
      "image_url": "https://cdn...",
      "body": "Vitamin C Serum\n₹499  ₹699",
      "button_label": "View Product",
      "resolved_product_id": "p_123",
      "source": "recently_viewed"
    }
  ],
  "warnings": [
    { "code": "INSUFFICIENT_CARDS", "message": "Collection has 3 in-stock products, template has 5 cards. 2 cards backfilled from best sellers." }
  ],
  "would_skip": false
}
```

- `mode: sample_products` resolves against representative catalog data (collection/specific render exactly; personalized strategies use a synthetic high-activity profile).
- `mode: contact` resolves against a real Customer 360 contact. This is the demo killer feature: preview any customer's actual carousel.
- Preview uses placeholder discount code text, never reserves real codes.
- Warnings enum: `INSUFFICIENT_CARDS`, `TEMPLATE_NOT_APPROVED`, `TEMPLATE_PAUSED`, `NO_DISCOUNT_SLOT`, `COLLECTION_EMPTY`, `CONTACT_NO_SIGNAL` (personalized strategy has no data for this contact, fallback shown).
- Test send endpoint alongside: `POST /api/v1/carousel/test-send` to a verified merchant phone number.

## 12. Analytics and attribution

**Funnel per flow/node:** sent -> delivered -> read -> clicked (short-link) -> session -> add_to_cart -> purchased, with revenue. Renders in existing funnel surfaces.

**Card-level:** clicks by card position and by product, CTR per position, revenue per card. New dashboard widget; feeds Thompson Sampling in Phase C (arms = ordering strategies or source strategies, reward = card click).

**Attribution model:** click-through with configurable window (default 7 days), code redemption as independent channel, dedupe so one order attributes once (priority: click with stid > code redemption). View-through (delivered/read without click) reported separately, never summed into attributed revenue. No fabricated uplift claims in merchant-facing reporting; show raw funnel numbers.

## 13. Edge cases and failure handling

| Case | Behavior |
|---|---|
| Template paused by Meta mid-flow | Node fails safe: skip sends, alert merchant, do not auto-substitute templates |
| Template rejected on version update | Old approved version keeps sending; merchant notified |
| Product deleted after resolution, before send | Assembly-time re-check swaps in backfill |
| Image URL unreachable at send | Drop card, backfill; if below minimum, skip per node config |
| Discount pool exhausted, extension fails | Fallback static code or no-discount send, per node config |
| Contact has no signal for personalized strategy | Fallback per node config; preview surfaces CONTACT_NO_SIGNAL |
| Pinnacle transient failure | Retry with exponential backoff, max 3, then status = failed |
| Meta quality rating drops on template | Surface warning in template gallery and flow editor |
| Contact opted out between resolution and send | Hard check at send, suppress |
| Currency mismatch (multi-currency stores) | Phase A: single store currency; multi-currency flagged open decision |

**Compliance and deliverability guardrails (built in, not bolted on):**

- Consent: carousel nodes only send to contacts with WhatsApp marketing opt-in; suppression list checked at send.
- Frequency capping: per-contact marketing message cap (configurable, e.g. max N marketing templates per 7 days across all flows) and quiet hours. Meta also applies its own per-user marketing template limits; treat Meta-side rejections (`failed`, reason logged) as a signal, never retry those.
- Category compliance: surface Meta commerce policy restrictions during catalog onboarding for restricted categories.
- Image guidance in template builder: recommend 1:1 aspect ratio product images, surface a warning when catalog images deviate badly (cropped previews look broken in carousels).

## 14. Verify with Pinnacle before build (blocking questions)

1. Carousel template support and exact payload shape in their API (cards, header media, button URL suffix variable).
2. Minimum card count, and whether runtime sends may include fewer cards than the approved template defines.
3. Media handling: are direct CDN image links accepted per card at send time, or is a media upload handle required (and if so, handle TTL and caching behavior)?
4. Webhook coverage: template status changes (approved, rejected, paused), quality rating changes, per-message statuses, failure reason codes.
5. Throughput limits per WABA tier and Pinnacle-side rate limits; batching recommendations.
6. Current Meta pricing model for marketing template messages (per-message pricing) and how Pinnacle bills carousels (confirm one carousel = one message).
7. Meta per-user marketing message frequency limits as currently enforced for India, and how rejections surface in webhooks.
8. Template variable limits per card body and bubble body.
9. Test/sandbox WABA availability for development.

## 15. Open decisions

1. Product-level vs variant-level cards (recommendation in section 3: product-level default).
2. Multi-currency stores: defer to Phase B or C, single currency in Phase A.
3. Multi-language templates: Meta templates are per-language; decide whether Phase A supports one language per store or language-per-contact routing.
4. Saved reusable card sources (table exists in model) vs always-inline node config: recommend inline for Phase A.
5. Short-link domain: shared Storees domain Phase A, white-label CNAME later.
6. Whether the carousel engine also powers a quick-reply variant (cards with quick-reply buttons instead of URL buttons) for conversational flows: defer.

## 16. Phasing and build order

**Phase A (sellable spine):**
1. Lock standard catalog schema, build catalog service with Shopify + VirpanAI sync and reconciliation.
2. Short link service (channel-agnostic from day one).
3. Template builder with typed slots, bindings table, Pinnacle submission and status webhooks.
4. Card sources: collection, specific_products. Filter/rank pipeline with backfill.
5. Flow node + preview API (sample_products mode) + test send.
6. Discount: existing_code and sale_price_only.
7. Funnel analytics (sent through purchased) with click attribution.

**Phase B:**
1. Personalized sources: recently_viewed, abandoned_cart, abandoned_browse, best_sellers, back_in_stock.
2. generate_pool discounts with reservation, exhaustion handling, expiry reminder flow pattern.
3. Preview-as-contact mode.
4. Frequency capping engine and quiet hours (if not already shipped platform-wide).
5. CSV/API feed catalogs with one-time field mapping.

**Phase C:**
1. Collaborative filtering as card source.
2. Thompson Sampling on card ordering and source selection, fed by card-level clicks.
3. Affinity-cluster-driven collection selection.
4. Card-position analytics dashboard widget.
5. White-label short-link domains, multi-currency, multi-language routing.

Phase A doubles as a VirpanAI Connect upsell: every qualified ICP brand is on Shopify, and the catalog sync work is identical.
