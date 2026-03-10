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
