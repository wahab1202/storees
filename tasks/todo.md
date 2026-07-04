# Implementation Tasks

## Day 1 — Foundation

- [x] Monorepo scaffolding (npm workspaces + turbo)
- [x] Shared types (`types.ts`, `constants.ts`, `utils.ts`)
- [x] Backend Express entry with webhook-safe body parsing
- [x] Segments package scaffold with 4 templates
- [x] Flows package scaffold with abandoned cart template
- [x] Drizzle ORM schema (all 10 tables + junction table)
- [x] Database migrations (0000_init.sql)
- [x] Shopify OAuth routes (install + callback)
- [x] Webhook receiver with HMAC verification
- [x] projectId middleware + error handler
- [x] Frontend Next.js project setup (App Router + Tailwind + design tokens)
- [x] Sidebar layout component (7 nav items, Lucide icons, active states)
- [x] API client setup (typed fetch wrapper)
- [x] Shell pages for all routes (dashboard, customers, segments, flows, debugger, integrations, settings)
- [x] TanStack Query provider

## Day 2 — Data Pipeline

- [x] Historical sync worker (customers + orders)
- [x] Webhook handlers (customers/create, customers/update)
- [x] Customer upsert + identity resolution logic
- [x] Customer list page (table + pagination + search)
- [x] Filter evaluation engine
- [x] Trigger evaluator (BullMQ consumer)

## Day 3 — Customer Detail + Events

- [x] Webhook handlers (orders/create, orders/fulfilled, carts/create, checkouts/create)
- [x] Event processor pipeline (normalize → validate → resolve → enrich → persist → publish)
- [x] Customer detail view (expandable row, tabs)
- [x] Segment template instantiation
- [x] Action executor (Resend email)
- [x] Flow trip state machine

## Day 4 — Segments UI + Dashboard

- [x] Segments list page (table with member counts, evaluate button)
- [x] Dashboard metrics (total customers, orders, revenue, CLV)
- [x] Dashboard recent activity feed
- [x] Flows list page (status, trip counts)
- [x] Event debugger page (live event stream)

## Day 5 — Polish + Integration

- [x] Integrations page (Shopify connection status, install flow)
- [x] Settings page (project config)
- [x] Segment re-evaluation after sync completes
- [x] Flow template instantiation on project setup
- [x] Error boundaries on all pages

## Day 6 — End-to-End Polish

- [x] Abandoned cart email template with proper HTML
- [x] Flow activation API endpoint (draft → active → paused)
- [x] Segment list page filter by segment on customers page
- [x] Dashboard total revenue metric card
- [x] Toast notifications (sonner) for mutations
- [x] Loading skeletons for all data-fetching pages
- [x] Drag-and-drop flow builder UI (React Flow)
- [x] Product/category/month segment filter fields + nested groups
- [x] Flow detail page with visual node editor

## Day 7 — Testing + Demo Prep

- [x] End-to-end flow: OAuth → sync → segment evaluation → flow trigger → email
- [x] Demo seed script (create project + sample data without Shopify)
- [x] README with setup instructions
- [x] Final typecheck across all packages (5/5 clean)

---

## Milestone 2 — AI Segment Builder

> Natural language + voice → FilterConfig → SegmentFilterBuilder
> Model: Gemini 2.0 Flash (free tier)
> Docs: `docs/domains/ai/SEGMENT_AI.md`, `docs/domains/integrations/GEMINI.md`

### Phase 1: Backend — Gemini Integration + AI Endpoint

- [x] Create `packages/backend/src/services/aiSegmentService.ts` — Gemini API call wrapper
- [x] Build system prompt with FilterConfig schema, field definitions, few-shot examples
- [x] Add `POST /api/ai/segment` route with input validation
- [x] Support conversational context (message history forwarding)
- [x] Add `GEMINI_API_KEY` to env config and startup validation
- [x] Error handling: rate limits, invalid output, missing key

### Phase 2: Frontend — AI Chat Panel + Voice Input

- [x] Create `AiChatPanel` component (right-side panel with chat history)
- [x] Create `VoiceInputButton` using Web Speech API
- [x] Create `LanguageSelector` component (EN, TA, FR, ES, ZH, HI chips)
- [x] Create `useSpeechRecognition` hook (start/stop, language, transcript)
- [x] Create `useAiSegment` mutation hook (POST /api/ai/segment)
- [x] Create `AiFilterPreview` component (human-readable filter display + Apply button)
- [x] Chat message history UI (user/AI message bubbles)

### Phase 3: Integration — Wire AI ↔ SegmentFilterBuilder

- [x] Update create segment page layout: `max-w-4xl` → `grid grid-cols-[1fr_380px]`
- [x] Update edit segment page layout: same split layout
- [x] Wire "Apply to Builder" button → `setFilters()` on SegmentFilterBuilder
- [ ] Mobile responsive: floating AI button → bottom sheet
- [ ] Hide AI panel gracefully when API key not configured

### Phase 4: Polish + Edge Cases

- [ ] Conversational follow-ups: "also add", "change to", "remove the"
- [x] Input sanitization (strip HTML, 500 char limit)
- [x] Loading states during AI generation
- [x] Error messages for unmappable fields
- [x] Browser compatibility fallback (no Web Speech API → text only)

### Phase 5: Product Catalog Integration

- [x] Add products + collections + product_collections tables to DB schema
- [x] Create migration SQL (`0001_products_collections.sql`)
- [x] Add shared types (`Product`, `Collection`) to `packages/shared/types.ts`
- [x] Add product/collection sync to Shopify sync worker (`syncProducts`, `syncCollections`)
- [x] Create product API routes (`GET /api/products`, `GET /api/products/collections`, `GET /api/products/by-collection/:id`)
- [x] Create frontend hooks (`useProducts`, `useCollections`)
- [x] Replace free-text product input with searchable `ProductSearchDropdown` in SegmentFilterBuilder
- [x] Add `collection_name` field with `CollectionDropdown` in SegmentFilterBuilder
- [x] Add `collection_name` field mappings to AI service system prompt
- [ ] Run migration against database
- [ ] Test Gemini API (pending billing propagation)

---

## Phase 2 — Intelligence Layer (Analytics + Segment Intelligence + Predictions)

### Wave 1: Analytics Foundation (2A) — DONE
- [x] Time series comparison (backend + frontend)
- [x] Time-to-event reports (backend + frontend)
- [x] Product analytics (backend + frontend)
- [x] Saved analyses infrastructure
- [x] Funnel enhancements (trends, time-in-stage, save/load)
- [x] Analytics home upgrade

### Wave 2: Segment Intelligence (2B)
- [x] Segment snapshots table + snapshot worker
- [x] Segment transition analysis (backend service + API)
- [x] Transition matrix UI + movement table
- [x] Segment size trend charts
- [x] Configurable RFM + MoEngage-style tabbed interface (RFM Model | User Transitions | Recency | Frequency | Monetary)
- [x] Fix: RFM tooltip clipping (overflow-hidden on parent container)
- [x] Sankey diagram for segment transitions
- [x] "Take Action" CTAs on transition cards (create rescue/nurture flow, view users)
- [x] Automatic weekly segment snapshots via scheduler
- [x] Analytics home upgrade (saved analyses, quick-create buttons)

### Wave 3: Prediction Product (2C)
- [x] Python ML package scaffold (shared infra: prepare, features, eval, config)
- [x] Propensity model v1 (XGBoost + SHAP + serve.py)
- [x] Recommendation models (co-occurrence, attribute, trending, collaborative)
- [x] Unified recommendation API with context-aware model selection
- [x] Autoresearch runner (Karpathy loop)
- [x] Backend ML proxy service + scoring worker + scheduler
- [x] Prediction management page (list, create wizard, detail, quality)
- [x] Customer 360 Predictions tab (scores + SHAP explainability)
- [x] Synthetic data seeder (5000 customers, 538K events)
- [x] Prediction-based segment conditions (churn_risk, conversion_score, dormancy_risk in segment builder)
- [x] Prediction score dashboard widget (AI Predictions card with quality scores)
- [ ] End-to-end ML pipeline test (train → score → display in UI) — needs real data

## Shopify Onboarding — Region/Dealer Segments + Product Catalog + Product Notifications

**Goal:** When a merchant connects a Shopify store, the segment builder must support filtering by Dealer/Region/City AND by Product/Category/Collection, and campaigns must be able to target product-derived segments. An onboarding doc walks the merchant from "connect store" to "first product-keyed campaign sent".

**Confirmed state (Apr 30):**
- Products + collections sync **already exists** in [syncWorker.ts:215-315](packages/backend/src/workers/syncWorker.ts#L215-L315) (no pagination, capped at 250)
- Customer initial sync exists, capped at 100 customers — does NOT extract `default_address.province/city`
- Webhook topics ([constants.ts:82](packages/shared/src/constants.ts#L82)) cover customers/orders/carts/checkouts only — no `products/*`, no `collections/*`
- `eventProcessor.normalizePayload` ([eventProcessor.ts:166-179](packages/backend/src/services/eventProcessor.ts#L166-L179)) skips address fields
- `customerService.resolveCustomer` doesn't accept region/city
- Shopify SDK exists at `packages/sdk` + `packages/sdk-react` (need to confirm `product_viewed` is wired)
- `agentScopedAccess` flag must be flipped manually in DB — no settings UI

### Phase A — Customer region/city extraction (smallest, validates wiring end-to-end)
- [ ] Extend `ResolveParams` in `customerService.ts` with optional `region`/`city`
- [ ] In `resolveCustomer`, write region/city if currently null (don't overwrite — Shopify is one of many sources)
- [ ] Update `eventProcessor.normalizePayload` to pull `payload.customer.default_address.province` → region, `.city` → city
- [ ] Update `syncWorker.ts` initial customer sync to pass region/city to resolveCustomer
- [ ] Backfill SQL for any existing customers where region is currently NULL but Shopify address data is reachable

### Phase B — Product/Collection webhook subscriptions
- [ ] Add `products/create`, `products/update`, `products/delete`, `collections/create`, `collections/update`, `collections/delete` to `SHOPIFY_WEBHOOK_TOPICS`
- [ ] Add catalog handler in `webhooks.ts` — products/* upsert into `products` table; collections/* upsert into `collections` table; deletes flip `status='archived'` (don't hard-delete, segment history may reference them)
- [ ] Re-register webhooks for already-connected projects (one-shot script that hits the Shopify API for each project's stored access token)

### Phase C — Pagination for initial sync
- [ ] Replace the `// No pagination for demo` shortcut in `syncProducts` and `syncCollections` with Shopify's Link-header `page_info` cursor pagination
- [ ] Same for the customers loop (line 86) — currently capped at 100
- [ ] Worker progress: keep the per-page progress callback so `/sync-status` stays meaningful

### Phase D — Settings panel toggle for B2B/dealer scope
- [ ] Backend: `PATCH /api/projects/:id/features` (admin-only) accepting `{ agentScopedAccess: boolean }`
- [ ] Frontend: Settings → Project, add a section "B2B / Dealer Access" with a toggle that calls the PATCH endpoint
- [ ] When enabled, surface a hint: "Dealers and Region/City filters are now available in segments"

### Phase E — Onboarding doc (`docs/integrations/SHOPIFY_ONBOARDING.md`)
- [ ] Cover: (1) install Shopify app from store, (2) wait for sync (status endpoint), (3) install SDK pixel in `theme.liquid` for product_viewed events, (4) verify with Debugger, (5) build first segment using product/region filters, (6) send first campaign

### Phase F — Post-OAuth SDK install step (verify packages/sdk first)
- [ ] Confirm `packages/sdk` ships a `product_viewed`/`added_to_cart` tracker
- [ ] If yes: add an "Install pixel" step to the post-Shopify-connect onboarding flow that renders the `<script>` snippet with the project's API key
- [ ] If no: defer to a separate ticket and leave a manual instruction in the onboarding doc

### Verification (after all phases)
- [ ] Connect a Shopify dev store → wait for sync → confirm `products`, `collections`, `customers.region`, `customers.city` populated
- [ ] Open segment builder → confirm Dealer/Region/City group renders (with `agentScopedAccess` on) AND Product/Category/Collection pickers show real options
- [ ] Build a "purchased Product X" segment → send a campaign to it → message lands

## Email Deliverability — Multi-Tenant Black Friday Safety

**Goal:** Make the Resend pipeline safe for high-volume multi-tenant marketing campaigns. One client's bad list must not tank deliverability for all other tenants. Black Friday-scale concurrent campaigns must not starve each other.

**Confirmed state (Apr 30):**
- Resend integration via [resendProvider.ts](packages/backend/src/services/resendProvider.ts) — single shared `FROM_EMAIL` env var
- Webhook handler [resendWebhook.ts](packages/backend/src/routes/resendWebhook.ts) tracks delivered/opened/clicked/bounced/complained — but no HMAC verification, no suppression, no idempotency
- `consents` table exists ([schema.ts:403](packages/backend/src/db/schema.ts#L403)) but campaign dispatcher [campaignService.ts:115-120](packages/backend/src/services/campaignService.ts#L115-L120) only filters by reachability — does not check consent or suppression
- Delivery worker fixed at `concurrency: 50` global — no per-tenant rate budget

### Phase E1 — Verify Resend works (operational, ~1 hour)
- [ ] Add `scripts/test-email-send.mjs` — sends one email through resendProvider, logs message id
- [ ] Document Mail-Tester verification step in `docs/integrations/SHOPIFY_ONBOARDING.md` (target 9-10/10)
- [ ] Confirm Resend webhook endpoint URL is registered in Resend dashboard, send a test event, verify `campaigns` counters update

### Phase E2 — Tenant-safe sending (~1-1.5 days)
**E2.1 — Per-tenant sending domain + DKIM**
- [ ] Migration: `email_from_address`, `email_from_name`, `email_domain_verified_at` columns on `projects`
- [ ] Backend: `POST /api/projects/:id/email-domain` — registers domain with Resend's domains API, returns DNS records
- [ ] Backend: `GET /api/projects/:id/email-domain` — checks Resend verification status
- [ ] Frontend: Settings → Project → "Email" section with domain entry + DNS record display + "Check verification" button
- [ ] resendProvider reads project's verified domain; falls back to shared pool (rate-capped 100/hour) if not verified

**E2.2 — Suppression + consent gate**
- [ ] Migration: `email_suppressions` table (project_id, email, reason, suppressed_at)
- [ ] Resend webhook: upsert suppression row on hard `email.bounced` and `email.complained`
- [ ] Campaign dispatcher: LEFT JOIN suppressions + check `consents.status = 'opted_in'` for email channel
- [ ] List-Unsubscribe header on every send (mailto + https one-click)
- [ ] One-click unsubscribe endpoint `GET /u/:token` — flips consents to opted_out

**E2.3 — Resend webhook hardening**
- [ ] HMAC verification using svix signing (Resend's webhook signing)
- [ ] Idempotency: dedup by `email_id + event_type` via Redis SET NX, 24h TTL

### Phase E3 — Black Friday scale safety (~1 day)
**E3.1 — Per-tenant rate budget**
- [ ] `projects.email_rate_per_minute` column (default 60)
- [ ] Redis token-bucket per project_id; dispatcher acquires tokens before each batch, sleeps when empty
- [ ] Optional warming: rate ramps automatically over 7 days for newly-verified domains

**E3.2 — Engagement-based throttling**
- [ ] Segment-builder filter "skip recipients with no opens in last N days"
- [ ] Dispatcher pre-flight warning if >30% of segment is never-opened; admin must confirm

**E3.3 — Pre-send content lint**
- [ ] Pre-flight on campaign create: missing unsubscribe, image-only body, missing from-domain DNS, list size vs reputation tier
- [ ] Block send if any fail; show fixable error in UI

### End-to-end live test (after all email phases)
- [ ] Verify domain for test project, confirm DNS records, send to mail-tester.com
- [ ] Confirm score >=9/10
- [ ] Trigger a hard bounce (send to invalid address) → confirm suppression row created
- [ ] Trigger complaint via Resend webhook payload → confirm suppression row created
- [ ] Run two simulated campaigns from different projects in parallel → confirm rate budgets isolate them

## CleverSend parity initiative (2026-07-04) — see docs/CLEVERSEND_GAP_ANALYSIS.md

### Phase 1 — Flow-builder UX core
- [x] Dialog primitive in components/ui/ (sm/lg/full sizes, focus trap, Escape)
- [x] Template picker modal: searchable list + live preview (WhatsAppPreview / TemplatePreviewCard)
- [x] Send-node stepped wizard: Template → Variables (per-node config.variables) → Settings (UTM)
- [x] Branch-delete modal: delete-all-subsequent vs keep-one-path + orphan cascade cleanup
- [x] Trigger event picker: observed event names ∪ domain catalog + free-text custom event

### Phase 2 — Binding depth & attribution
- [ ] Nested dot-path variable resolution (readPath in templateContext, interpolate regex, eventFilters)
- [ ] UTM on flow sends + UTM baked into tracked WhatsApp short-link destinations
- [ ] Goal & exit conditions (goal + exits[] with filters) + conversion metric in analytics
- [ ] Persist + surface WhatsApp template quality rating

### Phase 3 — Custom-events data-source suite
- [ ] inbound_webhooks + inbound_webhook_events tables + POST /api/hooks/:token
- [ ] Webhook detail UI: copy URL, historical log, observed schema tab
- [ ] Schema-inference service (payload → dot-path+type) feeding all field pickers
- [ ] Event definitions: payload filters + property mapping + user-attribute mapping + identity paths
- [ ] Segments: generic "performed event with property filters" rule (evaluator + UI)

### Phase 4 — Extended parity (demand-driven)
- [ ] A/B split in add-menu · HTTP-request node · previous-node-data source · template table view
