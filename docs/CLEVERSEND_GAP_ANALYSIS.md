# CleverSend → Storees — Critical Gap Analysis & Build Plan

Source: "Storees - Cleversend Data source" walkthrough (template creation, flows,
WhatsApp template node, custom events & data source). Grounded in the actual code
as of 2026-07-04 (`main`, post-`1fba09f`). Every claim below was verified against
the tree — file refs included so nothing here is guesswork.

---

## 0. The honest scorecard first

Not everything CleverSend showed is missing. Before scoping, what Storees **already has**
(don't rebuild):

| CleverSend feature | Storees status |
|---|---|
| Dual-pane template builder + live WhatsApp preview | ✅ Built — `WhatsAppTemplateBuilder.tsx` grid `1fr/360px`, sticky `WhatsAppPreview` with real-time sample substitution |
| Add-variable → sample-data field for Meta submission | ✅ Built — `insertVariable()` + per-var "Sample value (for Meta review)" → `example.body_text` |
| Button types (URL / Quick Reply / Call / Copy-code / OTP) | ✅ Built, incl. caps (3 QR, 2 CTA) |
| Per-button link tracking | ✅ Built — `b.track` checkbox + **durable** short-link service (`tracked_links` table, `/c/:slug` redirect, per-recipient slugs baked as `{{1}}` URL suffix) |
| Draft status + approval lifecycle | ✅ Built — DRAFT/PENDING/APPROVED/REJECTED/… + webhook + 4h poll backstop |
| Media header upload + carousel + AI copilot | ✅ Built |
| Arbitrary custom events ingestable | ✅ Partially — `POST /api/v1/events` accepts any `event_name` + free-form JSONB `properties` (API-key auth) |
| Event payload debugger | ✅ Partially — `/debugger` page shows raw properties JSON, live-polling |

The real gaps cluster in **four areas**: (A) flow-builder node UX, (B) variable
binding depth, (C) the custom-events/webhook data-source suite, (D) segment reach
into custom events. Detailed below, then the phased plan.

---

## A. Flow builder node UX — the modal question

**Current state.** The active builder is `StructuredFlowBuilder.tsx` (1,446 lines,
self-contained). Node config is a bespoke **288px-wide inline drawer** (`w-72
border-l`, L455–503) — not a modal, not even the shared `SlidePanel`. The legacy
React-Flow builder (`FlowBuilder`/`NodeConfigPanel`/`NodePalette`/`FlowNodes`) is
dead code — imported nowhere.

**There is no Dialog primitive in the design system at all.** `components/ui/` has
only `NumberInput` and `Skeleton`; no Radix/shadcn dialog in `package.json`. Every
modal in the app is hand-rolled `fixed inset-0`. That's why config drifted into a
narrow drawer: there was nothing better to reach for.

**Critical take — where modals genuinely win (and where they don't):**

| Interaction | Right pattern | Why |
|---|---|---|
| Picking a template out of N (send node) | **Large modal: searchable list left + live preview right** (CleverSend's exact layout) | Selection is transactional; user needs to *see* the message before committing. A 288px drawer physically cannot host list + preview. |
| Configuring a send node (template → variables → UTM) | **Stepped modal wizard** (CleverSend: Template Selection → Variables → Settings) | Three dependent stages, each needing width (field pickers, preview). |
| Editing a condition/branch (filter groups) | **Modal** (CleverSend "Edit Branch") | Nested filter groups need horizontal room; drawer forces vertical cramming — this is the overflow bug class we just fixed in `1fba09f`. |
| Deleting a split node | **Small confirm modal with options** | Destructive + branching decision ("keep one path" needs a picker). |
| Simple nodes (delay, exit) | Keep lightweight — drawer or inline popover is fine | Two fields; a modal would be ceremony. |
| Whole-canvas concerns (trigger, goal/exit) | Drawer or dedicated header section | Persistent context, not transactional. |

So: **not** "modals everywhere" — modals for *transactional, preview-dependent, or
destructive* interactions; drawer stays for glanceable config. First deliverable is
a real `Dialog` primitive (sizes `sm/lg/full`, Escape, focus trap, backdrop) in
`components/ui/`, then the flows surfaces consume it. Other consumers waiting:
`NewTemplateModal`, `FlowTemplateGallery`, `WhatsAppBriefModal`, export dialogs —
all currently copy-pasted `fixed inset-0` divs.

### A1. Template picker with preview — the #1 complaint
Send-node config today is two native `<select>`s (channel, template) —
`ActionBlock`, `StructuredFlowBuilder.tsx:950-1017`. Zero preview; the node card
shows `Template: <first 20 chars of id>`.

The parts already exist: `TemplatePreviewCard.tsx` (used on Templates & Campaigns
pages, never in flows) and `WhatsAppPreview` (inside the WA builder, extractable).
Build the picker modal once; reuse in flows send node **and** campaign create.

### A2. Branch-delete safety
`handleDelete` (`StructuredFlowBuilder.tsx:1314-1328`) silently removes the node,
nulls parent branch pointers, and **orphans the entire yes/no subtrees** in the
nodes array (unreachable but persisted). No confirmation anywhere. CleverSend
prompts: *delete all subsequent nodes* vs *keep one path* (with branch picker).
Implement exactly that, plus actually cascade-delete the orphaned subtree.

### A3. Trigger: arbitrary custom events
`business_event` trigger kind exists but is a **fixed dropdown of 5 presets**
(`BUSINESS_EVENT_PRESETS`, L518); the `event` kind is locked to
`EVENTS_BY_DOMAIN`. You cannot type `checkout_abandoned_shopflo` today even though
ingestion would accept it. Fix: feed the trigger event picker from **observed
event names** (`GET /api/events/names` already exists) merged with the domain
catalog, plus free-text entry. Same merge philosophy as `TriggerFiltersBlock`
already does for properties (observed + declared + hints).

### A4. Goal & exit conditions
CleverSend: "Goal for this journey is achieved when [event + filters]" + multiple
OR'd exits, each with filters. Storees: single `ExitConfig = { event, scope }`
dropdown in the bottom bar — no goal concept, no filters, no multiples. Extend:
`goal?: { event, filters }`, `exits: Array<{ event, filters }>`; surface a
per-flow conversion metric in `FlowAnalyticsPanel` (trips where goal event
occurred before exit).

### A5. Node library
No A/B split in the live add-menu (type + executor support exist — it's UI-only),
no HTTP-request/webhook-out node at all. A/B is a cheap unlock; HTTP-request node
is new executor work (Phase 4 — CleverSend has it, but demand should drive it).

---

## B. Variable binding — depth, sources, UTM

**Current state.** One unified resolver (`templateContext.ts`) with sources
`customer / attribute / product / project / event / literal` + formats. Good bones.
But:

1. **Send nodes have no variable UI.** Mapping lives only on the template
   (`VariablePanel` on the Templates page). The executor *already reads*
   `node.config.variables` as an override (`flowExecutor.ts:654`) — the UI just
   never writes it. CleverSend maps variables **per node**, which is correct: the
   same template sent from two flows needs different bindings. → Variables step in
   the send-node wizard, reusing `VariablePanel`'s `SourcePicker`, seeded from the
   template's defaults.
2. **No nested paths.** Every read is a flat key: `event` source is
   `eventProperties[key]` (`templateContext.ts:130`); `interpolateTemplate` regex
   is `\w+`-only; `EventPropertyDef.name` is flat. CleverSend resolves
   `body.line_items.0.image`. A `readPath` util already exists in
   `emailService.personalizeDynamicImages` — promote it into the resolver, widen
   the regex, and let pickers offer dot-paths.
3. **Field pickers are schema-blind to real payloads.** `eventSchemas.ts` is
   hand-maintained; unknown events → "No properties yet" even when 500 real
   payloads sit in the events table. → Observed-schema inference (flatten recent
   payload keys + types per event_name) feeding every picker: trigger filters,
   condition filters, variable sources. (C3 below is the backend for this.)
4. **"Previous node data" source** — CleverSend offers it; Storees `trip.context`
   is frozen at enrolment (`triggerWorker.ts:171-176`), nodes never write back.
   Real work in the executor. Defer (Phase 4) — the trigger payload covers the
   demo-critical cases.
5. **UTM**: campaign-only today (`campaigns.utm_parameters`, `appendUtmParameters`
   in `emailService.ts`) — **absent from flows entirely, and WhatsApp links never
   get UTM even in campaigns** (`injectTrackedButtonSlugs` passes `b.url`
   verbatim). → (a) Settings step on send-node wizard reusing
   `CampaignUtmParameters` type + preview line exactly like CleverSend's
   (`{{your_link}}?utm_source=...`); (b) append UTM to the *destination* URL when
   minting tracked short links so WhatsApp gets attribution for free.

---

## C. Custom events & data source suite — the structural gap

CleverSend's model: **create named webhook → copy URL → inspect what arrived
(schema + 500-event log) → define events out of payloads (filters) → map payload
fields to profile attributes → use mapped fields everywhere.** Storees has none of
this as user-facing capability:

- Inbound = fixed Shopify URL (HMAC, 8 hardcoded topics), provider webhooks, or
  API-key `/api/v1/events`. No user-created endpoint, no copy-URL.
- "Data Sources" today = **pull connectors** (VirpanAI/Custom HTTP `fieldMap`,
  `genericHttpConnector.ts`) — the mirror-image of push webhooks.
- Payload→profile mapping is hardcoded (`eventProcessor.normalizePayload`,
  `v1Events` extraction); the only user-configurable mapping (`fieldMap`) applies
  to pull syncs only.
- Ironically the **outbound** webhook system (`webhook_subscriptions` +
  `webhook_deliveries` + UI) already has the per-endpoint delivery-log pattern we
  need — inbound just lacks its twin.

### Build (Phase 3):
1. **`inbound_webhooks` table** — `id, project_id, name, slug/token (unique),
   status active|paused, last_received_at, received_24h` + **`inbound_webhook_events`**
   raw log (payload jsonb, headers jsonb, received_at, processing status,
   matched_definition_ids). Endpoint `POST /api/hooks/:token` — token *is* the
   auth (per-endpoint secret, revocable, no API key), raw-body, rate-limited.
2. **Webhook detail UI** — copy-URL card, live "start sending data" empty state,
   historical log (row → expandable headers/body JSON, like the Debugger), and an
   **observed schema tab**.
3. **Schema inference service** — flatten recent payloads per (webhook, and per
   event_name for `/v1/events`) into dot-path + type entries, cached. This single
   service upgrades *every* picker in the app (B3) — it's the connective tissue,
   not just a webhook feature.
4. **Event definitions** — `event_definitions` table: name, source webhook,
   `filters: FilterConfig` over the payload (e.g. `body.event_name is
   checkout_abandoned`), property mappings (payload path → event property),
   **user-attribute mappings** (payload path → customer column/custom attribute —
   CleverSend's "Define & Map" step), identity paths (email/phone/external_id →
   feeds existing `resolveCustomer` + stid stitching). Matching definitions emit
   normalized events through the **existing** `eventProcessor` pipeline — no
   parallel pipeline.
5. **Segments on custom events** — the evaluator (`packages/segments/evaluator.ts`)
   reaches events only via hardcoded subqueries (has_purchased etc.). Add a generic
   rule: *performed [event_name] [count op N] in [timeframe] where [property
   filters]* compiled to an EXISTS/COUNT subquery over `events` JSONB. This is what
   makes ingested custom events *actionable* in segmentation, closing the "data
   source read by segments" point.

---

## D. Smaller verified deltas

- **Quality rating** — `metaWhatsappProvider.getTemplateStatus` fetches
  `quality_score`, caller drops it. Persist + show badge on template cards
  (CleverSend shows a Quality Rating column).
- **Template list table-view** with sortable Name/Category/Type/Quality/Created —
  current card grid is fine; optional toggle. Low priority.
- **`message_cards` does not exist yet** — it's a carousel-engine deliverable
  (`WHATSAPP_CAROUSEL_ENGINE_ALIGNMENT.md`), unchanged by this plan.
- **Orphan cleanup** — `handleDelete` leaves unreachable nodes persisted in
  `flow.nodes`; fold into A2.

---

## The phased plan

**Phase 1 — Flow-builder UX core** *(no schema changes, highest visible impact)*
1. `Dialog` primitive in `components/ui/` (sm/lg/full, focus trap, Escape) — then migrate `NewTemplateModal`, `FlowTemplateGallery` to it opportunistically.
2. **Template picker modal** (search/sort list + live preview pane; WhatsApp uses `WhatsAppPreview`, email/SMS/push use `TemplatePreviewCard`). Wire into send node + campaigns create.
3. **Send-node stepped wizard**: ① Template ② Variables (per-node `config.variables` via `SourcePicker` — executor support already exists) ③ Settings (UTM, reusing campaign UTM types + preview string).
4. **Branch-delete modal**: delete-all-subsequent vs keep-one-path (branch picker) + cascade-cleanup of orphans.
5. **Trigger event picker**: observed names (`/api/events/names`) ∪ domain catalog + free-text custom event.

**Phase 2 — Binding depth & attribution** *(small schema, big leverage)*
6. Nested dot-path resolution (`readPath` into `templateContext`, widen `interpolateTemplate`, `eventFilters` path support) + path-aware pickers.
7. UTM append for flow sends + UTM-on-destination for tracked WhatsApp short links.
8. Goal & exit conditions (`goal` + `exits[]` with filters) + conversion metric in flow analytics.
9. Quality rating persisted + surfaced.

**Phase 3 — Custom-events data-source suite** *(new tables, new pages)*
10. `inbound_webhooks` + token endpoint + raw event log.
11. Webhook detail UI (copy URL, log, observed schema).
12. Schema-inference service feeding all pickers (retro-powers Phase 1/2 UIs).
13. Event definitions: filters + property mapping + user-attribute mapping + identity paths → existing eventProcessor.
14. Segment rule: generic "performed event" with property filters (evaluator + SegmentFilterBuilder UI).

**Phase 4 — Extended parity** *(demand-driven)*
15. A/B split exposed in add-menu; HTTP-request node (executor + UI); "previous node data" (`trip.context` node-output writes); template list table view.

Sequencing logic: Phase 1 is pure frontend against existing APIs — ships fast,
kills the worst UX pain (blind template selection, silent branch deletion).
Phase 2 makes bindings trustworthy before we invite arbitrary payloads in.
Phase 3 is the structural build; its schema-inference core is deliberately placed
after the pickers exist so it lights them all up at once. Phase 4 only when a
real flow demands it.
