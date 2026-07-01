# Storees Enhancement Backlog (2026-07-01)

Batch of feedback from Wahab. Sequenced by value/effort. Cleanup last.

## 1. Time series — flat-then-spike ✅ (backend done, needs deploy)
- [x] Zero-fill empty buckets in `computeTimeSeries` via `generate_series` LEFT JOIN (current + compare periods). `analyticsService.ts`.
- [ ] (optional) UI note on the time-series page that empty periods show as 0.

## 2. Cohorts — unclear explanation
- [ ] Add legend + tooltips: W0/W1 meaning, retention % definition (period 0 = 100%), "return event" explained. `analytics/cohorts/page.tsx`.

## 3. Segment lifecycle/RFM chart — click a stage → members
- [ ] The chart showing lifecycle counts isn't clickable. Make each stage/cell drill into its members (open the matching segment, or `/customers?...`).
- [ ] Confirm which chart component. Screenshot pending but intent clear.

## 4. Product analytics — empty
- [ ] Populate `items` from the ecommerce connector (Shopify product sync / VirpanAI catalog).
- [ ] Auto-seed default interaction configs: product_viewed=view, added_to_cart=intent, checkout_completed=conversion.
- [ ] Map product events' `product_id` → item interactions (ties into the SDK pixel work).
- [ ] Empty-state that explains setup instead of infinite loading. `analytics/products/page.tsx`.

## 5. Funnels — drill into dropped-off members
- [ ] Return members per stage (not just counts). `computeFunnel` keeps customer IDs + `/api/analytics/funnel-members`.
- [ ] Drill-down: click a stage's drop-off → member list → "Save as segment" / "Target with flow/campaign".

## 6. Next Best Action — act on it
- [ ] CTAs on `NextBestActionCard.tsx`: user-selectable **campaign** (one-off send now) or **flow** (reusable, triggered by NBA condition), with channel picker (WhatsApp/email).
- [ ] Pre-seed campaign create (already URL-param aware) with customer + channel + action; add flow pre-seed.

## 7. Icons — fresh, non-generic (Wahab: "go for it", per-icon swaps via Noun Project links)
- [ ] Swap lucide-react → **Phosphor** (@phosphor-icons/react): tree-shakeable, distinctive, near drop-in. ~88 files.
- [ ] Icon wrapper allowing per-icon Noun Project overrides.

## 8. Codebase health audit (LAST)
- [ ] Dead code, dupes, perf, oversized files (e.g. campaigns/create/page.tsx = 3,638 lines). Prioritized list for approval before changes.
