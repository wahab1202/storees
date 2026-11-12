## 07. Segment > All Segments, segment builder, Search Users & user profile

Storees' segment engine is built for commerce and is ahead of MoEngage in places: same-order conditions, product-scoped spend aggregates, purchase logic that drops cancelled and returned orders, a full member list instead of samples, a 9-tab customer profile and a working Segment AI that takes typed or spoken prompts. It trails on the product around the engine: no uploaded-list (file) segments, no read-only segment page, no segment-in-segment or exclusion rule, no per-channel reachability split, no birthday or custom-attribute targeting, and narrower operator sets (no exists, does-not-contain, not-between or first/last-time). The three P0s are list upload, city/state targeting (the data is already synced but only exposed in dealer mode) and custom attributes, and three shipped defects should be fixed first: prediction-bucket rules never match, Segment AI and the seeded "High Value Customers" template read rupee totals as paise (spend thresholds 100x too high), and "Total Spent equals" never matches.

### MoEngage overview

Segment is MoEngage's audience area. Its flyout has three create actions (+ New Segment, + New User Import, + New File Segment) and links to Search Users, All Segments, RFM Segments, Warehouse Segments, Predictive Segments, User Imports and User Exports. This module covers four parts:
- **All Segments:**
  - A table with name, type, created on and a sortable "Last Run Time", plus search, a segment-type filter and an Archived toggle.
  - Row actions: View, Edit, Duplicate, Archive, Create campaign (11 channel types) and Analyze (7 analysis types).
  - A "+ Segment" picker for Filter, RFM, File and Predictive segments.
  - A Synced Segments tab that advertises Outbound Segment Sync (a paid add-on, not enabled on this account).
- **Segment detail:** metadata, an on-demand user count and reachable users split by Push, Email, SMS and WhatsApp, sample users and an edit history. A file segment can add, remove or replace users from a CSV upload or URL.
- **Filter builder:**
  - Four category tabs per filter: user property, behavior, affinity, custom segment.
  - Operator sets by data type: 13 string operators, exists/empty, numeric "not between", date granularity down to "yearly where the date" (birthdays), relative windows and attribute-to-attribute comparison.
  - Event rules with first/last time, 11 time windows with units, event-attribute filters and aggregation.
  - Affinity rules on a predominant attribute value or time of day/week.
  - AND/OR with nested filters, and an Exclude Users block that opens a second full builder.
  - "Show count" results are logged in a query history; an Actions menu creates a campaign, analyzes or saves.
- **Search Users and User Profile:**
  - Search finds identified or anonymous users by ID, email, mobile, name or MoEngage ID.
  - The profile shows identity, lifecycle tiles, per-channel reachability with TEST send buttons, subscription chips, every attribute (searchable) and an event/campaign timeline filtered by date, platform and events or campaigns.

The capture covered every page in scope, with these limits:
- The workspace tracks no events, so behavior and affinity rows were opened by injecting a placeholder event into local React state. Event-attribute operators and aggregation functions were never rendered.
- "Show count" in the builder was not clicked; the count and reachability UI comes from an existing query-history row and the segment detail page.
- By the read-only rules, nothing was created, archived, test-sent or uploaded. "Create Segments with Merlin Custom Agents" only redirected to the campaign list.
- RFM, Warehouse and Predictive Segments, User Imports and User Exports are left to other modules; only the type picker that lists them was captured.

| Page visited | URL path |
|---|---|
| Segment flyout (sidebar) | Flyout on any page (Segment icon in the left nav) |
| All Segments - Segments tab | `/v4/segmentation/all-segments/custom-segments` |
| All Segments - Synced Segments tab | `/v4/segmentation/all-segments/synced-segments` |
| Custom Segment Info (segment detail) | `/v4/segmentation/all-segments/custom-segments/<segmentId>` (row "View" opens a new tab) |
| Create segment (filter segment builder) | `/v4/segmentation/create` |
| Search Users | `/v4/segmentation/search-users` |
| User Profile | `/v4/users/<moengageId>` |

### Storees counterpart

- **`/segments`** (`packages/frontend/src/app/(dashboard)/segments/page.tsx`): an RFM lifecycle chart (`packages/frontend/src/components/segments/LifecycleChart.tsx`), then a 2-column grid with one card per segment showing cached member and reachable counts. Card actions are Edit, Archive (default segments only), Delete, Export to ads and View members. The header has Recalculate stats, Re-evaluate All and Create Segment.
- **`/segments/create` and `/segments/[id]/edit`**: `packages/frontend/src/components/segments/SegmentFilterBuilder.tsx` with three condition types:
  - attribute rules from a field catalog for each industry vertical, including product, collection and category conditions;
  - scoped purchase aggregates;
  - performed-event counts with property filters.

  Conditions nest in AND/OR groups up to 3 levels, with a "Within the same order" option. Side panels show a live Audience Preview (`SegmentPreviewPanel.tsx`) and Segment AI (`AiChatPanel.tsx`); both are hidden below the lg breakpoint.
- **Membership** is stored in `customer_segments` and rebuilt in batch, not in real time: on save, after a Shopify sync, nightly at 03:00 and on Re-evaluate All. Changes emit `enters_segment` / `exits_segment` events (flow triggers) and `customer.segment.entered` / `.exited` outbound webhooks.
- **`/customers`** (`packages/frontend/src/app/(dashboard)/customers/page.tsx`): a searchable, sortable directory with segment and RFM filters, which is also the segment member list (`?segmentId=`).
- **`/customers/[id]`** (`packages/frontend/src/app/(dashboard)/customers/[id]/page.tsx`): 9 tabs: User Info, CDP Moat (merged timeline), Activity, Orders, Abandonment, Journeys, Messages, Predictions, Consent (`packages/frontend/src/components/customers/`).
- **Backend:**
  - Routes: `packages/backend/src/routes/segments.ts`, `customers.ts`, `v1Schema.ts` (field catalog at `GET /api/schema/fields`) and `ai.ts`.
  - Services: `segmentService.ts` (evaluation and counts), `domainRegistry.ts`, `agentFieldDefs.ts` and `predictionFieldDefs.ts` (the field catalog), `aiSegmentService.ts`.
  - Engine: `packages/segments/src/evaluator.ts` (FilterConfig to SQL) and `lifecycle.ts` (RFM).

**Path key for the Evidence column.** Line numbers are at commit `2063cdc`.

| Short name | Repo path |
|---|---|
| `segments/page.tsx`, `segments/create/page.tsx`, `segments/[id]/edit/page.tsx` | `packages/frontend/src/app/(dashboard)/segments/` |
| `customers/page.tsx`, `customers/[id]/page.tsx` | `packages/frontend/src/app/(dashboard)/customers/` |
| `campaigns/create/page.tsx` | `packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx` |
| `analytics/funnels/page.tsx` | `packages/frontend/src/app/(dashboard)/analytics/funnels/page.tsx` |
| `settings/roles/page.tsx` | `packages/frontend/src/app/(dashboard)/settings/roles/page.tsx` |
| `SFB` | `packages/frontend/src/components/segments/SegmentFilterBuilder.tsx` |
| `SegmentPreviewPanel.tsx`, `AiChatPanel.tsx`, `LifecycleChart.tsx`, `ExportAudienceButton.tsx` | `packages/frontend/src/components/segments/` |
| `UserInfoTab.tsx`, `ActivityTab.tsx`, `JourneyTimelineTab.tsx`, `ConsentTab.tsx`, `MessagesTab.tsx`, `CustomerTable.tsx`, `PredictionsTab.tsx`, `NextBestActionCard.tsx`, `DataSubjectCard.tsx`, `OrdersTab.tsx`, `AbandonmentTab.tsx`, `JourneysTab.tsx` | `packages/frontend/src/components/customers/` |
| `StructuredFlowBuilder.tsx` | `packages/frontend/src/components/flows/StructuredFlowBuilder.tsx` |
| `Sidebar.tsx` | `packages/frontend/src/components/layout/Sidebar.tsx` |
| `hooks/*.ts` | `packages/frontend/src/hooks/` |
| `routes/*.ts` | `packages/backend/src/routes/` |
| `segmentService.ts`, `domainRegistry.ts`, `agentFieldDefs.ts`, `predictionFieldDefs.ts`, `aiSegmentService.ts`, `adAudienceExport.ts`, `campaignService.ts`, `variableSources.ts`, `transitionService.ts`, `verticalPackService.ts`, `customerJourneyService.ts`, `eventProcessor.ts`, `flowExecutor.ts`, `flowTemplates.ts`, `dataSubjectService.ts`, `nextBestActionService.ts` | `packages/backend/src/services/` |
| `services/providers/fcmProvider.ts` | `packages/backend/src/services/providers/fcmProvider.ts` |
| `syncWorker.ts`, `metricsWorker.ts`, `aggregateReconcileWorker.ts`, `scoringScheduler.ts`, `scoringWorker.ts`, `customerAggregateWorker.ts` | `packages/backend/src/workers/` |
| `schema.ts` | `packages/backend/src/db/schema.ts` |
| `packs/ecommerce.json` | `packages/backend/src/packs/ecommerce.json` |
| `seedTemplates.ts` | `packages/backend/src/data/seedTemplates.ts` |
| `capabilities.ts`, `agentScope.ts`, `projectId.ts` | `packages/backend/src/middleware/` |
| `pii.ts` | `packages/backend/src/lib/pii.ts` |
| `evaluator.ts`, `lifecycle.ts`, `aggregate.test.ts` | `packages/segments/src/` |
| `types.ts` | `packages/shared/src/types.ts` |
| `serve.py` | `packages/ml/propensity/serve.py` |
| `publish_results.py` | `packages/ml/publish_results.py` |
| `sdk/events.ts`, `sdk/autotrack.ts` | `packages/sdk/src/` |

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Navigation | Segment flyout menu | Flyout: + New Segment, + New User Import, + New File Segment, Search Users, All Segments, RFM, Warehouse and Predictive Segments, User Imports, User Exports | 🟡 Partial | Flat Customers and Segments nav items (`Sidebar.tsx:56-57`); RFM chart on `/segments` (`segments/page.tsx:83`); predictions under `/analytics/predictions`; data sources only on the super-admin `/projects` screen (`Sidebar.tsx:76`) | No grouped Segment menu and no entry points for imports, exports, file or warehouse segments (those features are missing; see their rows). The Customers page doubles as Search Users. | P3 | S |
| All Segments | Segment list layout and columns | Table: Custom Segment Name (link), Segment Type, Created On, Last Run Time (tooltip, sortable, default descending), Actions kebab. No size, reachability, creator or refresh columns | 🟡 Partial | 2-column card grid: name, description, type badge, summary of the first 3 conditions, members, reachable and %, Inactive badge (`segments/page.tsx:86-197`). `createdAt` / `updatedAt` are stored but not shown (`schema.ts:303-321`); no sort control | No created-on or last-evaluated date and no sorting. Storees is ahead in showing member and reachable counts on the list, which MoEngage omits. | P2 | S |
| All Segments | Search custom segment | "Search custom segment" box on the list toolbar | ❌ Missing | No search input (`segments/page.tsx`); `GET /api/segments` returns every segment of the project with no search, filter or pagination params (`routes/segments.ts:19-55`) | Cannot find a segment by name. Industry packs seed 12+ segments and one live tenant has 58 (comment at `routes/segments.ts:43-45`), so the card grid is hard to scan. The endpoint is also unpaginated, against the repo's `?page=&pageSize=` convention. | P1 | S |
| All Segments | Segment Type filter | "Select Segment Type" multi-select (File, Filter, Warehouse - SQL) with Clear all / Select all | ❌ Missing | `segments.type` is stored (default, custom or template; `schema.ts:307`) and shown as a badge (`segments/page.tsx:97-106`); no filter | Cannot narrow the list by type (e.g. hide seeded templates). All Storees segments are filter-based today. | P2 | S |
| All Segments | Archive action and Archived Segments view | "Archive" in row and detail menus; an "Archived Segments" toggle lists archived segments (empty state) | 🟡 Partial | Archive/Restore toggles `isActive` only for `default` segments (`segments/page.tsx:153-167`); custom and pack-template segments can only be deleted, via `window.confirm` (168-181); archived ones stay in the grid with an Inactive badge (139-143). Evaluation skips them (`segmentService.ts:73,249-252`), but they still appear in the campaign segment picker (`campaigns/create/page.tsx:529,1260-1263`) and the Customers dropdown (`customers/page.tsx:214-217`), although the Archive tooltip says they stop appearing in dropdowns (`segments/page.tsx:160`) | Archive works only for default segments and there is no archived view. An archived segment keeps its frozen membership, and campaign sends read the stored membership (`campaignService.ts:227-239`), so it can still be picked and sent to. | P2 | S |
| All Segments | Row action: Edit | Edit from the row menu or the detail page header | ✅ Full | Edit link on every card (`segments/page.tsx:146-152`) opens `segments/[id]/edit/page.tsx` with builder, preview and Segment AI; `PATCH /api/segments/:id` re-evaluates when filters change (`routes/segments.ts:227-265`) | None (default-segment names are locked by design). | — | — |
| All Segments | Row action: Duplicate | Duplicate in row and detail menus (disabled with a tooltip for segments imported from Import Users) | ❌ Missing | No duplicate or clone control in the `segments/` pages or `components/segments/`, and no clone endpoint in `routes/segments.ts` | Making a variant of a segment means rebuilding every condition by hand (flows already have Clone). | P2 | S |
| All Segments | Row action: Create campaign (channel and campaign type modal) | Modal with the segment description, Channel Type (In-App, On-site, Google Ads Audience, Facebook Audience, Email, MMS, Push, SMS, RCS, Connector, WhatsApp) and a channel-dependent Campaign Type (Email: Event Triggered, One Time, Periodic) | ❌ Missing | No create-campaign action on cards or the edit page. The campaign builder reads only `channel`, `type` and `nba*` params, and `segmentId` always starts empty (`campaigns/create/page.tsx:423-445`). Campaign channels are email, sms, push, whatsapp, in_app (`types.ts:173`) | No way to start a campaign from a segment: users go to Campaigns, pick channel and type, then find the segment in a dropdown. Add a `segmentId` param and a card action. MMS, RCS, connector and ad-audience campaigns don't exist (ad audiences are a CSV export). | P2 | S |
| All Segments | Row action: Analyze Segment | Modal with the segment description and a required Analysis Type: Behavior, Funnels, Retention, Session and source, User paths, User analysis, RFM Analysis | 🟡 Partial | The backend accepts a segment: funnels take `segmentId` and time series `segmentIds` (`routes/analytics.ts:26-37,106-121`), and `GET /api/analytics/segment-trend` exists (280-290). No UI sends them: the funnel page posts no `segmentId` (`analytics/funnels/page.tsx:94-103`), `useTimeSeries`' `segmentIds` (`hooks/useAnalytics.ts:121`) is never set, and segment-trend has no caller | The UI cannot run funnel, metric-trend or size-trend analysis for a segment, and segments have no Analyze action. The backend half exists, so this is mostly UI work. | P2 | M |
| All Segments | New Segment type picker | "+ Segment" opens tiles with hover descriptions: Filter, RFM, File, Predictive Segment | 🟡 Partial | "Create Segment" goes straight to the filter builder (`segments/page.tsx:44-50`; `segments/create/page.tsx`). 12 pack templates are seeded into the list (`packs/ecommerce.json`; `verticalPackService.ts:227-239`) but there is no template gallery | Only filter segments can be created, with no type choice and no "start from a template" gallery. RFM, file and predictive types are rated in their own rows. | P2 | S |
| All Segments | RFM Segment | RFM Segment tile (Recency, Frequency, Monetary value), built in a separate RFM Segments area | 🟡 Partial | RFM chart on `/segments`: a 3x3 recency-by-value grid with retention tips, plus User Transitions and Recency / Frequency / Monetary tabs. Cells and bars open `/customers?rfm=` (`LifecycleChart.tsx:187,484-530`; `lifecycle.ts`; `routes/customers.ts:81-130`) | RFM cells cannot be saved as segments, so they cannot drive campaigns or flows (seeded Champions / Loyal / At Risk templates approximate them with fixed thresholds). No 1-5 RFM scores. Bugs: the "High Value (top 10%)" bar does nothing because the engine's label (`lifecycle.ts:215`) is missing from `MONETARY_RFM_MAP` (`LifecycleChart.tsx:490-494`); the Low and Medium Value bars open the frequency+monetary composite list (`routes/customers.ts:81-130`), not the spend tier the bar counts. | P2 | M |
| All Segments | Predictive Segment | Predictive Segment tile (e.g. propensity to churn), built in a separate Predictive Segments area | 🟡 Partial | Each active prediction goal adds `<goal> — bucket` (high / medium / low) and `<goal> — score` fields (`predictionFieldDefs.ts:33-49`), compiled against the latest `prediction_scores` row (`evaluator.ts:1173-1195`). Both score writers store "High" / "Medium" / "Low" (`serve.py:174-179`; `publish_results.py:43,170-172`; `scoringWorker.ts:175-182`) while the builder offers lowercase values and `is` is a case-sensitive text match (`evaluator.ts:879-882`) | Score filters work, but a bucket "is" rule never matches and "is not" matches everyone. The generic Conversion Score, Dormancy Risk and Risk Bucket fields (`domainRegistry.ts:166-168`) read metrics nothing writes; Risk Bucket defaults to "low" (`evaluator.ts:1153-1154`), so "Risk Bucket is low" matches every customer. No "create segment from this prediction" action. | P1 | S |
| All Segments | File segment: create and edit (add, remove or replace users from a file) | File Segment type. Edit modal: Add / Remove / Replace users; drag-and-drop CSV (one column, max 64 MB) or HTTPS URL (public, up to 300 MB); "Download a sample"; identifier attribute and data type (must be unique); up to 50 alert emails | ❌ Missing | All segments are rule-based: `segments.filters` is NOT NULL (`schema.ts:309`) and `evaluateSegment` rebuilds membership from the filter on every pass (`segmentService.ts:66-134`), so manually added members would be wiped. No CSV upload anywhere in the UI; bulk import is JSON over an API key, 1,000 rows per call (`routes/v1Import.ts:36,57-153`). multer is already wired for uploads (`routes/assets.ts:4,32-33`) | Cannot target an uploaded list (offline-event attendees, marketplace buyers, influencer or COD-verification lists). Needs a static segment type that evaluation skips; CSV or URL upload matched on email, phone or external ID; and add, remove and replace modes. | P0 | M |
| All Segments | AI segment creation (Create Segments with Merlin Custom Agents) | Pink "Create Segments with Merlin Custom Agents" button; in this workspace it only redirected to `/v4/campaigns/all` | ⭐ Storees better | Segment AI (Beta) on the create and edit pages: typed or spoken prompts (Web Speech in EN, TA, HI, FR, ES, ZH) with multi-turn history. The backend sends the project's field catalog to an LLM (Groq, needs `GROQ_API_KEY`), validates fields and returns a FilterConfig plus a summary that "Apply to Builder" loads (`AiChatPanel.tsx`; `hooks/useSpeechRecognition.ts:17-24`; `aiSegmentService.ts`; `routes/ai.ts`) | A working natural-language and voice builder where MoEngage showed nothing. **P1 is for a shipped defect:** the prompt says money fields are in paise (`aiSegmentService.ts:40-43`) but totals are stored in rupees (`syncWorker.ts:204`; `schema.ts:140`), so "spent over ₹5,000" becomes `total_spent > 500000`. It also cannot produce performed-event rules (validator at `aiSegmentService.ts:322-351`) or prediction-goal fields, and the panel is hidden below the lg breakpoint. | P1 | S |
| All Segments | Feature walkthrough video | "Watch video" opens an "All Segments Feature Walkthrough" video modal (also on Create segment) | ❌ Missing | No help video, tour or coachmark components in `packages/frontend/src` and no tour library in its `package.json` (the only video support is the email builder's video block) | No in-product education on segment concepts. | P3 | S |
| Synced Segments | Outbound Segment Sync | Paid add-on (not enabled): pushes RFM, Filter, File, Predictive, Analytics and Affinity segments to ad networks, loyalty, recommendation and experimentation tools and warehouses; one-time or periodic (daily, weekly, monthly) | 🟡 Partial | Outbound webhooks `customer.segment.entered` / `.exited` fire on every membership change for subscribed projects (`segmentService.ts:156-183`; Settings > Webhooks, `hooks/useWebhooks.ts:40-46`). Per-segment "Export to ads" downloads a hashed CSV for Meta, Google, TikTok, Snap and Pinterest (`ExportAudienceButton.tsx`; `adAudienceExport.ts:22-24`) | No scheduled or API sync to Meta / Google custom audiences or to warehouses; ad audiences are manual CSV uploads. Webhooks fire whenever membership is recomputed (save, sync, nightly), not on a chosen schedule. | P2 | L |
| Segment info | Segment detail page (row "View") | Custom Segment Info page (new tab): Edit and an Actions menu (Duplicate, Archive, Create campaign, Analyze), a metadata card, a count card, collapsible "Reachability and Sample Users" and "Segment Edit History" sections | ❌ Missing | No read-only segment route: `segments/[id]/` contains only `edit/`. The edit page header shows the type badge and member count with Delete / Cancel / Save (`segments/[id]/edit/page.tsx:81-131`); members are browsed via "View members" (`/customers?segmentId=`) | No single place to inspect a segment without opening the editor: counts, per-channel reach, last evaluation, size trend (`GET /api/analytics/segment-trend` already exists), entries and exits. | P1 | M |
| Segment info | Segment metadata | Segment Type, Created On, Last Run Time, Segment Source (e.g. Import Users), auto-generated Segment Description | 🟡 Partial | Cards show the type badge, an optional manual description and an automatic summary of the first 3 conditions (`filterSummary`, `SFB:1175-1201`). `createdAt` and `updatedAt` (bumped by every evaluation, `segmentService.ts:186-190`) are stored but never displayed; no created-by column (`schema.ts:303-321`) | No created date, last-evaluated time, source or creator on screen; summaries use raw field names (e.g. "total spent greater than 500"). | P2 | S |
| Segment info | On-demand count refresh and Last Refreshed time | User Count and Reachable Users show "--" until refreshed; the refresh icon shows "Refreshing count. Please wait...", then a "Last Refreshed time" | 🟡 Partial | Cached `memberCount` and `reachableCount` are always shown (`segments/page.tsx:120-138`). Recomputation runs on save, after a Shopify sync (`syncWorker.ts:364`), nightly at 03:00 (`aggregateReconcileWorker.ts:29,43`) and on the project-wide "Re-evaluate All", which runs inside the HTTP request (`routes/segments.ts:306-316`). `POST /api/segments/:id/evaluate` exists (319-327) but has no hook in `hooks/useSegments.ts`. "Recalculate stats" calls `evaluateAllSegments` without `force`, so it is skipped inside the 10-minute cooldown while the toast says segments were re-evaluated (`routes/customers.ts:845-852`; `segmentService.ts:222-235`) | No per-segment refresh and no last-refreshed timestamp. The "Recalculate stats" message can claim a re-evaluation that was skipped. The unused per-segment endpoint does not check that the segment belongs to the caller's project (see Verification notes). | P2 | S |
| Segment info | Reachable users (total and % of user count) | Reachable Users with a tooltip (reachable on at least one of Email, SMS or Push) and % of the user count | 🟡 Partial | Cards show "N reachable (x%)" with a tooltip (`segments/page.tsx:129-138`); `reachableCount` counts Email (subscribed + email), SMS (subscribed + phone) or WhatsApp (any phone) (`segmentService.ts:97-104`) | WhatsApp reach ignores `whatsapp_subscribed` (any phone counts), which overstates reach on India's main channel; push is not counted. | P2 | S |
| Segment info | Reachability by channel | Push, Email, SMS and WhatsApp tiles with count and % of reachable users; "Low reachability? Know more" link | 🟡 Partial | Segments store only an aggregate `reachableCount` (`schema.ts:311-314`). A per-channel figure appears only in the campaign builder, for the channel being sent ("N reachable via channel", `campaigns/create/page.tsx:1265-1281`; `campaignService.ts:172-270`) | No per-channel split on segment cards, the edit page or the builder preview, so marketers can't compare a segment's WhatsApp and email reach before choosing a channel. | P1 | S |
| Segment info | Sample users | Avatar chips (hover shows the name) and a "Show more" table: Username (link to profile), Email, Mobile, ID, MoEngage ID, First seen, Last seen, Sessions | ⭐ Storees better | "View members" opens the full paginated, sortable, searchable member list with a "Viewing segment" banner (`segments/page.tsx:184-192`; `customers/page.tsx:98-147`; `routes/customers.ts:73-79`). The builder preview lists 10 sample matches with name, email and order count (`SegmentPreviewPanel.tsx:73-119`) | Storees shows the whole membership rather than a sample. Minor: preview samples are not links to the profile. | — | — |
| Segment info | Segment Edit History | Collapsible audit section on the detail page (empty state "Oops! No edit history available") | ❌ Missing | No segment audit or version table in `schema.ts` (only `consent_audit_log` and `communication_log`); PATCH overwrites filters in place (`routes/segments.ts:242-252`) | No record of who changed a segment definition or when, although membership decides who gets messaged. | P2 | M |
| Segment builder | Audience scope: All users / Filter users by | Radio: All users or Filter users by; Exclude Users works with both (e.g. all users excluding a segment) | 🟡 Partial | Segments need at least one condition (`SFB:1257-1260`; `segments/create/page.tsx:35,47`). "All users" exists only as a campaign audience mode, combinable with an exclusion filter (`campaigns/create/page.tsx:1226-1230,1299-1329`) | Cannot save "everyone except X" as a segment. | P3 | S |
| Segment builder | Filter categories (tabs on each filter) | Every filter card has tabs User property / User behavior / User affinity / Custom segment and can be switched in place | 🟡 Partial | "Add condition" first asks for one of three types: "Attribute about the customer", "Behaviour the customer performed" (scoped aggregate) or "Performed a specific event" (`SFB:1065-1097`); product, collection and category conditions sit in the attribute catalog | No affinity or segment-membership categories (rated below), and a condition's type can't be changed once it is added. | P3 | S |
| Segment builder | User property: lifecycle fields (First Seen, Last Seen, LTV, No. of Conversions) | Lifecycle group: First Seen, Last Seen, LTV, No. of Conversions | ✅ Full | Ecommerce catalog: Days Since First Seen, Days Since Last Seen, Customer Lifetime Value, Total Orders, Total Spent, Avg Order Value, Days Since Last Order, First and Last Order Date, Orders in Last 30/90 Days (`domainRegistry.ts:13-28`) | Equivalent, expressed as relative "days since" fields; raw `first_seen` / `last_seen` date comparisons are engine-only (`evaluator.ts:930-933`). | — | — |
| Segment builder | User property: No. of Sessions, Random User Bucket, User Creation Source | Lifecycle group also has No. of Sessions, Random User Bucket and User Creation Source | ❌ Missing | `total_sessions` is computed into `customers.metrics` (`metricsWorker.ts:562,616`) but is not in the field catalog; no random-bucket or creation-source attribute exists (`domainRegistry.ts`) | Cannot segment by session count, take a stable random bucket for tests (campaigns have their own control groups) or segment by how the profile was created (Shopify, SDK, import). | P3 | S |
| Segment builder | User property: Acquisition (Campaign Name, Publisher Name) | Acquisition group: Campaign Name, Publisher Name | 🟡 Partial | The browser SDK captures `utm_source/medium/campaign/term/content` and attaches them to page-view events (`sdk/autotrack.ts:16-20,113,191,307-340`), so they are usable only through a performed-event property filter; there is no first-touch acquisition attribute on the customer | No profile-level acquisition source to segment on or display. | P2 | M |
| Segment builder | User property: Uninstall (Install Status, Uninstall Time) | Uninstall group: Install Status, Uninstall Time (mobile app) | ➖ N/A | Storees ships only a browser SDK and React bindings (`packages/sdk`, `packages/sdk-react`); push goes through FCM tokens supplied by connectors (`services/providers/fcmProvider.ts`) | App install/uninstall tracking needs a native SDK. | — | — |
| Segment builder | User property: Reachability and subscription fields (Push per platform, SMS, WhatsApp, Web Push) | Reachability group: Reachability Push, Push Android / iOS / TV / Web, SMS and Web Push Subscription Status (WhatsApp Subscription Status sits under Tracked Standard) | 🟡 Partial | Reachable on Email / SMS / WhatsApp plus Email Subscribed and SMS Subscribed booleans (`domainRegistry.ts:10,36,179-183`; `evaluator.ts:1137-1142`). `push_subscribed` and `whatsapp_subscribed` columns exist (`schema.ts:146-147`) but are not in the catalog, and "Reachable on WhatsApp" only checks for a phone | Cannot filter for customers who opted in to WhatsApp or can receive push, which matters for WhatsApp opt-in compliance. | P1 | S |
| Segment builder | User property: Localization (City, State, Country, Pincode, Time zone) | Localization group: Last Known City, Country, Pincode, State, User Time Zone Offset (Mins) | 🟡 Partial | `customers.city` and `customers.region` (state/province) are filled from the Shopify default address (`syncWorker.ts:169-183`; `eventProcessor.ts:298-300`) and the engine handles them (`evaluator.ts:940-946`). But City and Region reach the builder (and Segment AI) only when dealer access control is on (`routes/v1Schema.ts:39-41`; `agentFieldDefs.ts:31-108`). No country, pincode or timezone column (`schema.ts:126-159`) | Shopify D2C brands cannot target by city or state (regional festivals, language creatives, serviceability) even though the data is already synced. Expose City and Region for every project, and add country and pincode from the same address. | P0 | S |
| Segment builder | User property: Email Suppression Type | Email Suppression Type group: Email Opt-in Status, Hard Bounce, Spam, Unsubscribe | 🟡 Partial | `email_suppressions` stores hard_bounce / complained / unsubscribed / manual (`schema.ts:694-706`) and campaign sends skip suppressed addresses (`campaignService.ts:280-284,596`), but the builder offers only Email Subscribed and Reachable on Email | Cannot segment bounced or complained addresses (list hygiene, win-back on another channel). | P2 | S |
| Segment builder | User property: Device Data | Device Data group: Advertising Identifier (iOS & Windows), Browser Details, Google Advertising ID, Mobile User, OS Version iOS | ❌ Missing | The SDK adds `$os`, `$browser`, `$device_type`, `$language` and `$timezone` to every event's properties (`sdk/events.ts:38-56`). No device field is in the catalog, and the performed-event property-path validator rejects `$` keys (`evaluator.ts:218-221`), so these properties cannot be filtered at all | No device or browser targeting (e.g. mobile-web vs desktop shoppers). | P3 | S |
| Segment builder | User property: Tracked Standard Attributes | Consent for ad personalization, Consent for ad user data, Email, Email Open Tracking Consent, First Name, ID, Last Name, Mobile Number, Name, WhatsApp Subscription Status | 🟡 Partial | Email (5 string operators), Name (is, is not, contains), Phone (is, is not), Email and SMS Subscribed. Identifier fields get a customer typeahead that fills the exact stored value (`domainRegistry.ts:7-10,36`; `SFB:214-306`) | No External ID, first/last name, ad-consent or WhatsApp subscription fields. | P2 | S |
| Segment builder | User property: Tracked Custom Attributes | Tracked Custom Attribute group listing the workspace's custom attributes (e.g. Contact Level, Gender), with typed operators | ❌ Missing | No picker for `customers.custom_attributes` keys; the catalog is fixed per vertical (`domainRegistry.ts`). The engine falls back to `metrics->>field`, then `custom_attributes->>field`, compared as text (`evaluator.ts:1197-1208`), so custom attributes work only in API-written filters and numbers compare as strings. Shopify customer tags are not synced (`syncWorker.ts:164-183`). Key discovery already exists for the template editor (`variableSources.ts:61-83`, `GET /api/templates/variable-sources`) | Attributes sent through SDK `setUserProperties` or the API (gender, tier, skin type) and Shopify tags cannot be used in the builder or by Segment AI. Reuse the key discovery, infer types and add typed comparisons. | P0 | M |
| Segment builder | Date operators: on, is between, before, after | Date attribute operators on, is between, before, after with a calendar picker | 🟡 Partial | Date fields use date pickers: First / Last Order Date (before, after) and Order Date (between, before, after) (`SFB:51-55,495-523`; `domainRegistry.ts:20-21,47`) | No "on" operator, and only three order-date fields are date-typed in the catalog. | P3 | S |
| Segment builder | Date operators: in the last N, in the next N, is today (days ago / days from now) | Relative operators in the last, in the next, is today, with value modes date, days ago and days from now | 🟡 Partial | Past windows are covered by numeric fields (Days Since First Seen / Last Seen / Last Order, Orders in Last 30/90 Days; `domainRegistry.ts:19-28`). A `within_last` operator with hours/days/weeks/months exists only in the engine (`evaluator.ts:781-794`), used by the seeded "New Customers" template | No future windows (e.g. expected reorder in the next 7 days, although `expected_reorder_days` is computed: `metricsWorker.ts:292`), no "is today" and no general relative operator on date fields. | P2 | S |
| Segment builder | Date granularity and recurring matches (birthdays, anniversaries) | Granularity: Date, Daily where the hour, Weekly where the day, Monthly where the day, Yearly where the month, Yearly where the date | ❌ Missing | `in_month` and `in_year` exist only in the engine and only on `orders.created_at` (`evaluator.ts:748-765`); the catalog has no custom date attributes. Storees seeds Birthday email, SMS, push and WhatsApp templates (`seedTemplates.ts:439-460,655-657,842-847,1048-1058`) that no segment or trigger can target | Cannot build birthday or signup-anniversary audiences, a common D2C campaign. | P1 | M |
| Segment builder | exists / does not exist / is empty / is not empty | exists and does not exist on date, numeric, string and boolean attributes; is empty and is not empty on strings | ❌ Missing | `FilterOperator` has no existence or emptiness operator (`types.ts:550-560`) | Cannot express "has a phone number" or "name is missing" except through the reachability booleans. | P2 | S |
| Segment builder | Numeric operators and values | is equal to, is not equal to, is between, is not between, is less than, is greater than, exists, does not exist; searchable multi-value select | 🟡 Partial | The number type offers equals, does not equal, is greater than, is less than, is between (`SFB:33-39`), but each field narrows the list: Avg Order Value and CLV allow only greater/less, and Total Spent has no "does not equal" (`domainRegistry.ts:13-16`). "equals" casts the column to text (`evaluator.ts:879-880`), so "Total Spent equals 500" never matches the stored decimal `500.00` | No "is not between" or multi-value input, operator sets differ from field to field, and equality on decimal fields is broken (Order Total equality is numeric and works). | P2 | S |
| Segment builder | String operators | 13 operators: is, is not, contains, contains spaces, does not contain, starts with, does not start with, ends with, does not end with, exists, does not exist, is empty, is not empty | 🟡 Partial | equals, does not equal, contains, starts with, ends with (`SFB:40-46`); Email gets all five, Name three, Phone two (`domainRegistry.ts:7-9`) | Missing does not contain, does not start with, does not end with and contains spaces (existence and emptiness are rated separately). | P2 | S |
| Segment builder | String multi-value select and Case Sensitive option | Multi-value select of string values plus a "Case Sensitive" checkbox | 🟡 Partial | One value per rule. contains / starts with / ends with use ILIKE (always case-insensitive) while equals is case-sensitive (`evaluator.ts:879-896`). Identifier fields get a customer-search typeahead (`SFB:223-306`) | No "is any of" list (needs an OR group today) and no case option. Equals and contains treat case differently, and the UI doesn't say so. | P2 | S |
| Segment builder | Boolean operators | is, is not, exists, does not exist; value suggestions True / False | ✅ Full | Boolean fields offer is true / is false (`SFB:47-50`; `evaluator.ts:897-900`) | Equivalent (exists / does not exist is rated in its own row). | — | — |
| Segment builder | Value source: compare with another user attribute | Value source Constant value or User attribute; compares against another attribute of the same data type | ❌ Missing | Rule values are constants only (`FilterRule`, `types.ts:507-511`; `RuleRow`, `SFB:380-557`) | Cannot express e.g. "last seen after last order date". | P3 | M |
| Segment builder | Behavior: Has Executed / Has Not Executed an event | Has Executed or Has Not Executed plus an event picker | ✅ Full | The "Performed a specific event" card lists every event name seen in the project plus a custom-name option (`SFB:638-689`; `routes/events.ts:99-112`). "Has not executed" is "at most 0 times" (`evaluator.ts:242-264`) | Equivalent; "has not" is less discoverable without an explicit option. | — | — |
| Segment builder | Behavior: execution count (exactly, at least, at most) | exactly, at least, at most N times (default at least 1 time) | ✅ Full | at least / at most / exactly with a count input (`SFB:616-620,682-685`); order events count once per order id (`evaluator.ts:255-263`) | None. | — | — |
| Segment builder | Behavior: for the first time / for the last time | Execution options "for the first time" and "for the last time" | ❌ Missing | `countOp` supports only at_least, at_most and exactly (`evaluator.ts:259-263`); first and last purchase are expressible only through the First / Last Order Date fields | Cannot target "first did X in the last 7 days" or "last did X over 30 days ago" for arbitrary events. | P2 | M |
| Segment builder | Behavior: time window options and units | in the last, in between, before, after, on, today, yesterday, this week, last week, this month, last month; N plus unit (hours, days, weeks, months) | 🟡 Partial | Performed-event card: "in the last N days" or blank for all time (`SFB:686-688`; `evaluator.ts:248-250`). The aggregate card adds "between dates" (`SFB:849-876`) | Event rules have no absolute ranges, no calendar presets (today, this week, last month) and no unit other than days. | P2 | S |
| Segment builder | Behavior: event attribute filters (+ Attributes) | "+ Attributes" adds event-attribute filters picked from the event's attributes (e.g. platform Android, app version 11.23) | 🟡 Partial | "+ Property filter" rows take a free-text dot path (e.g. `cart_value`, `line_items.0.price`) with is, is not, greater than, less than, contains, is true, is false, joined by AND only (`SFB:622-627,691-727`; `evaluator.ts:217-240`). Observed property paths are already listed by `GET /api/templates/variable-sources` (`variableSources.ts:91-118`) and offered in the flow trigger builder (`StructuredFlowBuilder.tsx:812-813`), but the segment builder doesn't use them | Marketers type property paths from memory; no OR, between or list operators; SDK properties prefixed with `$` are rejected. Reusing the flow builder's observed-property picker is a small change. | P1 | S |
| Segment builder | Behavior: aggregation (+ Aggregation) | "+ Aggregation" adds an aggregation condition over the event (sum, average, etc. of an event attribute) | 🟡 Partial | Scoped aggregate card: Sum / Count of rows / Count distinct orders / Average / Min / Max of line value, quantity or price, scoped by product, collection, category, price or quantity and a timeframe before the comparison (`SFB:600-610,787-907`; `evaluator.ts:386-561`). It always reads purchase line items | No aggregation over arbitrary event properties (e.g. sum of `cart_value` on add-to-cart, average rating given). | P2 | M |
| Segment builder | User affinity | Has Executed event with an affinity type (Predominantly / For a minimum of N % of times / Most no. of times / Least no. of times) "with" an event attribute or a time attribute (hour of day, day of week, day of month, month of year), extra attribute rows and a time range | ❌ Missing | No affinity condition in `FilterConfig` (`types.ts:484-560`). `best_send_hour`, `best_send_dow` and `best_channel` are computed per customer and shown on the profile (`UserInfoTab.tsx:117-118`) but are not segment fields | Cannot target "mostly buys category X", "shops on weekends" or "most active 8-10 pm". | P2 | L |
| Segment builder | Custom segment filter (member of an existing segment) | Custom segment tab: pick an existing segment from a searchable list (exclusion goes through Exclude Users) | ❌ Missing | `FilterConfig` has no segment-membership rule (`types.ts:484-560`; `evaluator.ts:199-210`). Flows have an "in segment" check (`types.ts:647-657`; `flowExecutor.ts:527-528`) and the Customers list filters by one segment, but a segment cannot reference another | Segments can't be combined or reused (e.g. "Champions AND reachable on WhatsApp"), and there is no way to exclude a saved segment. | P1 | M |
| Segment builder | Boolean logic and nesting | AND/OR toggle between top-level filters; "+ Nested Filter" inside each filter with its own AND/OR dropdown | ✅ Full | Each group has an AND/OR pill and a "match all/any" header; "Add group" nests up to 3 levels, and the engine handles any depth (`SFB:16,913-1111`; `evaluator.ts:190-197,266-277`) | Equivalent; Storees adds "Within the same order" groups (see Storees-only strengths). | — | — |
| Segment builder | Duplicate filter, collapse to summary, "+ Filter" disabled until complete | Copy and X icons on filters and sub-filters; a completed filter collapses to a readable summary; "+ Filter" and "+ Nested Filter" stay disabled until the current filter is complete | 🟡 Partial | Rows and groups can be removed (`SFB:543-554,1004-1012`). There is no duplicate, and completed rows never collapse (summary helpers exist but are used only on list cards, `SFB:1175-1201`). "Add condition" is always enabled | Long segments grow tall, and copying a condition means rebuilding it. | P3 | S |
| Segment builder | Exclusions (Exclude Users) | "Exclude Users" checkbox adds a second full filter builder (all four categories, nested filters); the description reads "... and exclude users in (...)" | 🟡 Partial | Segments have no exclusion block and no NOT group (`evaluator.ts:190-197,266-277`). Campaigns have an "Exclude users" toggle with a second full builder applied as `NOT (filter)` in every audience mode (`campaigns/create/page.tsx:1299-1329`; `campaignService.ts:206`) | Saved segments cannot exclude anyone (campaigns can), and no exclusion can reference a saved segment. | P1 | S |
| Segment builder | Validation | Incomplete filters get red outlines and the toast "Fill the required segment filters" | 🟡 Partial | Inline errors block saving for no conditions, an empty group, a reversed range, a missing or reversed date, a bad aggregate window or a missing event name; aggregates also get advisory warnings, and Save stays disabled while errors remain (`SFB:1212-1274`; `segments/create/page.tsx:31-47`) | Rows with blank values (empty text, no product or collection picked, empty property path) pass validation and silently match nobody; no per-field highlight. | P2 | S |
| Segment builder | Show count (user count and reachable users) | "Show count" runs an audience query returning User Count and Reachable Users; a result expands to reachability by channel and sample users | 🟡 Partial | Audience Preview re-runs 600 ms after each edit and shows the total plus 10 samples, limited to the viewer's agent scope and with PII masked (`SegmentPreviewPanel.tsx:13-31`; `routes/segments.ts:73-118`) | Faster than a manual button, but shows no reachable count or channel split, and the panel is hidden below the lg breakpoint (`segments/create/page.tsx:141`). | P2 | S |
| Segment builder | Query results history | Logged "Query results" table: Query Time, Description, Source (Segmentation, Push Campaign, Email Campaign), User Count, Reachable Users, re-run icon; rows expand; row menu Edit query, Create campaign, Create custom segment, Show sample users, Analyze segment | ❌ Missing | Preview results are not persisted; no query-log table or UI (`routes/segments.ts:73-118`; `schema.ts`) | No record of audience sizes checked from the builder or campaigns, and no way to reopen a past query. | P3 | M |
| Segment builder | Actions: Create Campaign, Analyze Segment, Create Custom segment | "+ Actions" split button: Create Campaign, Analyze Segment, Create Custom segment | 🟡 Partial | The builder's only action is "Create Segment" (`segments/create/page.tsx:67-82`). The campaign builder can use the same builder inline as an unsaved "Custom filter" audience (`campaigns/create/page.tsx:1285-1296`), but nothing sends a builder query to a campaign, and there is no Analyze | Cannot go from an unsaved query straight to a campaign or an analysis. | P2 | S |
| Segment builder | Save as custom segment | "Create a custom segment" dialog: auto-generated description and a required name; no static/dynamic or refresh options | ✅ Full | Required Name, optional Description and "Create Segment" (`segments/create/page.tsx:74-118`); `POST /api/segments` saves and immediately materializes membership (`routes/segments.ts:187-223`) | Equivalent; the description is not auto-generated, and only admins can save (`requireRole('admin')`). | — | — |
| Segment builder | Computed Traits | Upsell banner (builder and profile): build dynamic user properties such as churn risk, monthly savings or LTV bucket; contact your Account Manager | 🟡 Partial | Workers maintain a fixed set of computed traits: CLV historical/predicted/health, churn risk, engagement score, discount order %, orders in last 30/90 days, reorder cycle, best send time (`metricsWorker.ts:272-292,545-620`; `customerAggregateWorker.ts`). Several are segment fields and all show on the profile (`UserInfoTab.tsx:427-454`) | Marketers cannot define their own computed trait (e.g. "spend on category X in the last 30 days" as a stored property). | P2 | L |
| Segment builder | In-builder user lookup | Header search "Search User by ID, Email, Mobile No. or MoEngage ID"; focus shows a help popover with an admin-editable "Edit Instruction"; Enter opens a Search results drawer | 🟡 Partial | Identifier fields (phone, email, name, external id) get a customer typeahead that fills the exact stored value (`SFB:214-306`) | No general user lookup from the builder and no admin-editable lookup instructions. | P3 | S |
| Search Users | User search by ID, email, mobile, name or internal ID | One search box matching ID, Email, Mobile number, Name or MoEngage ID for identified or anonymous users; info tooltip with a help link | 🟡 Partial | The Customers page search (on submit) is a case-insensitive substring match on name, email or phone (`routes/customers.ts:63-71`; `customers/page.tsx:184-204`) | External ID (e.g. Shopify customer id) and internal ID are not searchable; anonymous visitors appear only as sessions in the admin Event Debugger. | P2 | S |
| Search Users | Search results, counts and empty state | "Results (Showing X of Y matches)" table: Name (opens profile in a new tab), Email, Mobile Number, ID, MoEngage ID, First seen, Last seen, No of Sessions; no-match message | ✅ Full | Paginated table with total count; sortable Customer / Total Spent / CLV / Last Seen; segment chips and order count; "No customers match your search." (`customers/page.tsx:105-116,249-277`; `CustomerTable.tsx`) | Equivalent; phone, ID and first seen are not columns. | — | — |
| User Profile | Identity header | Avatar with "Registered" badge, Name, Email, Mobile Number, MoEngage ID, ID (with copy), Last Name | ✅ Full | Initials avatar, name, Active/Inactive badge, email, phone, internal ID, External ID, first and last seen (`customers/[id]/page.tsx:104-143`) | Equivalent; the internal ID is truncated with no copy button (line 136). | — | — |
| User Profile | Customer Lifecycle tiles | Last Active, No of sessions, No of conversions, Life Time value, First Seen, Publisher / Campaign, City / State, Country | 🟡 Partial | Ecommerce cards: Lifecycle (Last Active, Days Since Last Order, Purchase Frequency), Conversion (Orders, Total Spend, AOV), AI Intelligence (Engagement Score, Churn Risk, Best Send Time, Best Channel) and a CLV card (historical, predicted, health) (`UserInfoTab.tsx:86-121,271-308`) | No city, state or country (`customers.city` and `region` are stored but never displayed) and no acquisition source; sessions appear only in the raw Computed Metrics table. | P2 | S |
| User Profile | Per-channel reachability tiles | Reachability tiles for Push (Android / iOS / Web icons with per-platform tooltips), Email, SMS and WhatsApp | 🟡 Partial | The Reachability card shows a fixed channel list per vertical: ecommerce and custom show Email only, fintech all four (`UserInfoTab.tsx:225-235,335-370`); status is the subscription flag alone | A Shopify D2C profile never shows WhatsApp or SMS reachability, and there is no push platform detail. The card also doesn't check that an email or phone exists. | P1 | S |
| User Profile | TEST send buttons per channel | TEST PUSH, TEST EMAIL, TEST SMS and TEST WHATSAPP send a test to this user; disabled when unreachable | 🟡 Partial | No test send from the profile. Test sends exist only for email campaigns (to any address, with an optional sample customer for personalization: `routes/campaigns.ts:698-800`) and WhatsApp templates (to a typed phone: `routes/whatsappAdmin.ts:546`); there is none for SMS or push | Cannot fire a quick test to this customer's email, phone or WhatsApp from the profile. | P2 | S |
| User Profile | Subscription statuses | Per-channel chips: Email (Subscribed), SMS (Default Opted in), WhatsApp (Empty), Push (Unknown) | ⭐ Storees better | Consent tab: current opted-in/out for Email, SMS, WhatsApp and Push plus an audit log (when, channel, promotional/transactional, action, source, IP, consent text) (`ConsentTab.tsx`; `routes/customers.ts:770-793`) | The audit trail is stronger DPDP evidence than MoEngage's chips. Caveats: states are binary only (no "default opted-in" or "unknown"); read-only in the UI (opt-in/out is API-only, `routes/consent.ts:42-101`); on a separate tab. | — | — |
| User Profile | All user attributes with property search | Grouped tables (Tracked Custom, Uninstall, Tracked Standard, Lifecycle, Localization, Email Suppression, Reachability); "mo" badge for system attributes; "Search Property name" filters the tables | 🟡 Partial | Custom Attributes and Computed Metrics tables list every key with formatted values (`UserInfoTab.tsx:395-456`) | No property search, grouping or system-vs-custom marker. Column fields (city, region, subscription flags) aren't listed, and metric keys are snake_case converted to Title Case. | P2 | S |
| User Profile | Event activity timeline | "Event activity" tab: event and campaign timeline (empty state "No Events Found"); campaign interactions via the Campaigns filter; no devices section | ⭐ Storees better | Two timelines. Activity: latest 200 events, filter by event name with counts, expandable properties (`ActivityTab.tsx:180-381`). CDP Moat: merges events, campaign sent/opened/clicked, flow entered/exited, segment joined, orders and messages with type chips, plus an engagement score, channel breakdown, 8-week activity and top events (`JourneyTimelineTab.tsx:29-50`; `customerJourneyService.ts`) | Richer than MoEngage's timeline. Caveat: each tab shows only the newest 200 or 100 entries with no paging (see the date-range row). | — | — |
| User Profile | Timeline filter: date range | Date Range in the project timezone with presets (Today, Yesterday, Last 7 Days, Last Week, Last 30 Days, This Month, Custom Range, Last N days/weeks/months); Reset all / Cancel / Apply | ❌ Missing | The journey API takes only limit, offset and types (`routes/customers.ts:725-748`); the Activity tab loads the latest 200 events (`customers/[id]/page.tsx:63`) and CDP Moat a fixed 100 (`JourneyTimelineTab.tsx:271,285`); neither has a date picker or "load more" | Older history is unreachable from the UI and can't be narrowed to a period. | P2 | S |
| User Profile | Timeline filter: platform | Platform filter: Android, iOS, Web, Other | ❌ Missing | `events.platform` is stored (`schema.ts:219`) and shown only as a badge (`ActivityTab.tsx:318-323`) | No platform filter. | P3 | S |
| User Profile | Timeline filter: specific events or campaign channel | Filter by Events (pick events, "+ Event") or Campaigns (All, Email, Push, SMS, In-App, Onsite & Web Personalisation, Connector, Card, Facebook Audience, WhatsApp) | 🟡 Partial | Activity filters by a single event name (`ActivityTab.tsx:236-252`); CDP Moat has one "Campaigns" chip covering all channels (`JourneyTimelineTab.tsx:43-50`); the Messages tab lists the channel of each message (`MessagesTab.tsx`) | No multi-event selection and no per-channel campaign filter in the timeline. | P3 | S |
| User Profile | PII masking | "Hide Personally Identifiable Information" banner pointing to PII masking settings | ✅ Full | The role capability `viewContactPii` masks email and phone in the customer list, profile, segment preview samples and event/journey payloads (`capabilities.ts:7-26`; `pii.ts:19-100`; `settings/roles/page.tsx`) | Equivalent, enforced server-side. | — | — |

**Status counts (75 rows):** ✅ Full 10, 🟡 Partial 40, ❌ Missing 20, ⭐ Storees better 4, ➖ N/A 1.

### Storees-only strengths

- **"Within the same order" condition groups.** A marketer can say "spent at least ₹10,000 in category X in a single order between two dates" without false matches across separate orders (`SFB:966-1019`; `evaluator.ts:266-384`; `types.ts:493-505`). MoEngage's nested filters cannot tie conditions to one order.
- **Product-scoped purchase aggregates.** One condition expresses "spend on Collection X in the last 90 days is at least ₹5,000" or "bought 3+ units of product Y", the most common D2C targeting rules (`SFB:787-907`; `evaluator.ts:386-561`; `aggregate.test.ts`).
- **Product, collection and category purchase / view / wishlist conditions** with a searchable product picker that shows product images (`domainRegistry.ts:39-41`; `SFB:60-77,127-356`; `evaluator.ts:618-747`). In MoEngage the same rule needs event attributes set up and picked by hand.
- **Purchase logic that excludes reversed orders.** Cancelled, returned and refunded orders are dropped and duplicate order events count once, so spend-based segments stay correct for COD-heavy stores with high return-to-origin rates (`evaluator.ts:94-154,255-263`).
- **Segment entry/exit events drive flows and outbound webhooks.** Entering or leaving a segment starts journeys (Win-Back and VIP Reward templates) and notifies external systems (`segmentService.ts:136-183`; `flowTemplates.ts:137,198,357`; `hooks/useWebhooks.ts:40-46`). Caveat: membership is recomputed in batch (save, sync, nightly, Re-evaluate All), so these events fire then, not in real time.
- **RFM lifecycle chart, weekly membership snapshots and segment transitions** on the Segments page and in Analytics > Transitions (`LifecycleChart.tsx`; `lifecycle.ts`; `transitionService.ts`; snapshot timer `scoringScheduler.ts:21,172,209-211`). Caveat: two chart-bar links are wrong (see the RFM row).
- **Customer directory with a KPI strip, sorting and segment / RFM filters.** Marketers can browse and sort the whole base or a segment's full membership; MoEngage's Search Users only looks up individuals (`customers/page.tsx:148-247`; `routes/customers.ts:46-225`).
- **Commerce profile tabs: Orders, Abandonment, Journeys, Messages.** Support and CRM teams get order history with shipped, delivered, returned and refunded status; abandoned carts with browsed products, recovery and reason codes; flow trips; and delivery and read status for each message (`OrdersTab.tsx`; `AbandonmentTab.tsx`; `JourneysTab.tsx`; `MessagesTab.tsx`; `routes/customers.ts`).
- **Predictions tab with a "Why this score?" panel and a Next Best Action card** that opens a campaign pre-targeted at this customer (`PredictionsTab.tsx:242`; `NextBestActionCard.tsx:97-102`; `nextBestActionService.ts`).
- **CLV card and segment-membership chips with join dates on the profile** (`UserInfoTab.tsx:271-308,372-393`).
- **Data-subject export and erasure (GDPR / DPDP)** from the profile (`DataSubjectCard.tsx`; `routes/customers.ts:920-963`; `dataSubjectService.ts`).
- **Dealer/agent-scoped customer access,** including in segment previews, for brands with dealer or franchise networks (`agentScope.ts`; `routes/segments.ts:82-86`).
- **Seeded segment templates for each industry.** New ecommerce projects start with 12 segments such as High Value Customers, Repeat Buyers, At Risk, Champions and Window Shoppers (`packs/ecommerce.json`; `verticalPackService.ts:221-239`). Three of them are wrong today:
  - "High Value Customers" is described as "total spend above ₹5,000" but filters `total_spent > 500000` against rupee totals, i.e. ₹5 lakh.
  - "Cart Abandoners" ("added to cart recently but haven't purchased in 7+ days") has no cart condition: it is "last order over 7 days ago and at least one order".
  - "New Customers" uses `first_seen within_last 7`. That field and operator are not in the builder catalog, so opening the template in the editor shows the first catalog field and a string operator (for ecommerce, "Email equals 7") instead of the saved rule.
- **Campaign audience deliverability preview.** Before a send it shows candidates, reachable, suppressed, opted-out, subscription-blocked, WhatsApp 24-hour-window-blocked, frequency-capped and control-group holdouts for the chosen channel (`campaignService.ts:76-270`; `campaigns/create/page.tsx:1265-1281`).

### UX notes

- **Segment list** (screenshot 002 vs `segments/page.tsx`). MoEngage uses a dense table with search, a type filter, an archived toggle, sortable Last Run Time and a row menu. Storees shows a 2-column card grid under a large RFM chart, with no search or sort. Adopt a table (name, type, members, reachable, WhatsApp-reachable, last evaluated, created) with search, a type filter and a row menu, and keep Storees' member and reachable counts, which MoEngage lacks. Move the lifecycle chart to its own tab so the list is visible without scrolling.
- **Segment detail** (006, 010). MoEngage's Custom Segment Info is a read-only page with metadata, user count, reachable users and four per-channel tiles, with Edit and Actions in the header. Storees' only single-segment page is the editor. A read-only detail page would close several gaps at once: channel tiles (WhatsApp first for India), last evaluated time, a size trend from the existing `GET /api/analytics/segment-trend`, and links to the member list, Export to ads and Create campaign.
- **Builder feedback** (038, 070). MoEngage needs a manual "Show count" and logs every query. Storees' Audience Preview refreshes 600 ms after each edit, which is faster; keep it. Add reachable and per-channel counts, and stop hiding the preview and Segment AI panels below the lg breakpoint (`hidden lg:block` on both the create and edit pages).
- **Filter cards** (059, 068, 075). MoEngage collapses each completed filter to a one-line summary, puts copy and X icons on every card, and keeps category tabs on the card so its type can be switched in place. Storees always shows full rows, has no duplicate, and makes users choose one of three condition-type buttons up front with no way to switch later. Reuse `filterSummary`, `eventRuleSummary` and `aggregateSummary` to collapse completed rows, and add a duplicate icon.
- **Operators** (053, 055). MoEngage's operator list depends only on the data type. Storees' lists vary by field (Email has 5 string operators, Name 3, Phone 2; Avg Order Value and CLV allow only greater/less), which reads as missing features. Give every field of a type the same operators.
- **Event rows** (075, 077, 078). MoEngage's row reads "Has Executed [event] at least [1] times in the last [3] [days]" with "+ Attributes" and "+ Aggregation", a unit dropdown and attribute pickers. Storees' "Performed a specific event" card reads as the same sentence, but property paths are typed by hand. Reuse the flow trigger builder's observed-property picker (`StructuredFlowBuilder.tsx:812-813`) and add an hours/days/weeks unit.
- **Seeded templates in the editor.** A rule whose field or operator is not in the catalog (the "New Customers" template's `first_seen within_last`) renders as a different rule. Show such rules read-only with their summary instead of a misleading editable row.
- **Profile layout** (014, 015). MoEngage shows reachability tiles with TEST buttons and subscription chips on the first tab. Storees' User Info shows only Email reachability for ecommerce projects and keeps consent on a separate tab. Merge consent status into the reachability card and show Email, SMS, WhatsApp and Push for every vertical.
- **Attribute tables** (016, 091). MoEngage groups properties (Lifecycle, Localization, Reachability, Custom) and adds a "Search Property name" box. Storees has two flat tables whose names are snake_case keys turned into Title Case. Add search, grouping, readable labels and units (e.g. CLV in ₹, session duration in minutes instead of ms).
- **Timeline** (020-026). MoEngage has one Event activity tab with a "Filter events" popover (date range, platform, events or campaigns). Storees has two overlapping tabs, Activity and CDP Moat. Merge them into one Timeline tab with date range, type and event filters and "load more", and rename "CDP Moat", an internal term, before demos.
- **Where Storees is ahead:** the 9-tab profile (Orders, Abandonment, Predictions, Next Best Action, Consent audit log) is a strong demo moment, as are "View members" (the full member list, where MoEngage shows sample avatars) and Segment AI with Tamil and Hindi voice input, while MoEngage's AI button only redirected to the campaign list. Fix the Segment AI money-unit bug before demoing it.
- **Destructive actions.** Storees deletes segments through a browser `window.confirm` (`segments/page.tsx:171`) and the edit page uses an inline red banner, while MoEngage uses modals. Use one shadcn AlertDialog pattern for both.
- **Search Users** (087-090). MoEngage's dedicated search states which identifiers it matches (ID, email, mobile, name, MoEngage ID). Storees' Customers placeholder says "name, email, or phone", and the External ID shown on every profile cannot be searched. Add ID search and update the placeholder.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status. All 75 statuses held. These rows changed:

- **AI segment creation: priority — → P1, effort — → S (⭐ kept).** The prompt tells the LLM that `total_spent`, `avg_order_value` and `clv` are in paise (`aiSegmentService.ts:40-43`). Totals are stored in rupees: the Shopify sync stores `Number(total_price)` (`syncWorker.ts:204`), `formatCurrency` displays the stored value as-is, and the aggregate section of the same prompt says line values are rupees, "the OPPOSITE of total_spent, which is paise". Spend thresholds from Segment AI are therefore 100x too high. The seeded "High Value Customers" template has the same error (`packs/ecommerce.json`: 500000 for "above ₹5,000").
- **Behavior: event attribute filters: effort M → S; evidence corrected.** The earlier evidence said no endpoint lists property keys. `GET /api/templates/variable-sources` returns observed property paths for each event, nested paths included (`variableSources.ts:91-118`), and the flow trigger builder already offers them (`StructuredFlowBuilder.tsx:812-813`).
- **Evidence and gap corrections (status, priority and effort unchanged):**
  - **Tracked Custom Attributes:** key discovery for `custom_attributes` already exists (`variableSources.ts:61-83`) and can be reused.
  - **Predictive Segment:** `publish_results.py` also writes capitalized bands; the generic Risk Bucket defaults to "low", so "Risk Bucket is low" matches every customer.
  - **RFM Segment:** the Low and Medium Value bars open the frequency+monetary composite list, not the spend tier they count.
  - **On-demand count refresh:** added the nightly 03:00 reconcile and the post-sync pass; noted the unscoped per-segment endpoint.
  - **Archive:** campaign sends read stored membership (`campaignService.ts:227-239`), so archived segments still send to a frozen list; pack `template` segments can only be deleted.
  - **TEST send buttons:** there is no SMS or push test send anywhere, only email-campaign and WhatsApp-template tests.
  - **Event activity timeline:** caveat added that each tab shows only the newest 200 / 100 entries.
  - **Analyze Segment:** funnel-page line reference corrected to `analytics/funnels/page.tsx:94-103`.
  - **Seeded segment templates (Storees-only):** the High Value, Cart Abandoners and New Customers caveats were added.
- **Confirmed after trying to refute them:**
  - **Aggregate card:** fully editable, despite a stale comment at `SFB:559-561` saying it renders read-only.
  - **Prediction buckets:** both writers (`serve.py:174-179`, `publish_results.py:43,170-172`, upserted by `scoringWorker.ts:175-182`) store capitalized values, while the builder offers lowercase options and `is` compiles to `::text =`.
  - **Decimal equality:** `total_spent` is `decimal(12,2)` and "equals" compiles to `total_spent::text = '500'`. Order Total equality uses a numeric comparison and works.
  - **City / Region:** they appear only when `agentRbacEnabled` is true (`routes/v1Schema.ts:39-41`), and Segment AI uses the same gated set (`agentFieldDefs.ts:113-125`).
  - **"Recalculate stats":** calls `evaluateAllSegments` without `force`; the 10-minute cooldown (`segmentService.ts:222-235`) can skip it while the response says segments were re-evaluated.
  - **Device properties:** SDK `$`-prefixed properties are never copied to the customer (`routes/v1Events.ts:933-939`) and the event-path regex rejects them (`evaluator.ts:220`).
  - **No synonyms found** for static/list segments, CSV import, segment clone, segment audit/version history, segment-in-segment rules, affinity, birthday/anniversary/date-of-birth, exists/empty operators, first-touch acquisition, country/pincode/timezone columns, profile test sends, tours/coachmarks, or audience API sync. Searched: clone, duplicate, static, csv, upload, papaparse, audit, history, version, in_segment, affinity, predominant, birthday, anniversary, dob, exists, is_empty, utm, first_touch, country, pincode, timezone, test-sms, test-push, joyride, coachmark, customaudiences, Customer Match.
- **Security seen along the way.** `POST /api/segments/:id/evaluate` (`routes/segments.ts:319-327`) calls `evaluateSegment(req.params.id)` without checking that the segment belongs to `req.projectId`; `requireProjectId` (`projectId.ts`) only checks access to the project named in the query. An admin of one project who has another project's segment UUID can trigger its re-evaluation, which emits that tenant's enter/exit events, flows and webhooks, and can read its member count. Add the same `projectId` filter that PATCH and DELETE use.

### Screens

PII warning: screenshots 010, 011, 012, 013, 014, 016, 017, 089, 091 and 094 show the names, emails and phone numbers of the three test users imported into MoEngage's "Test File" segment. Redact them before this folder is shared or committed.

#### Segment flyout (sidebar)

![Segment flyout with all 10 items](../screenshots/07-segments-builder-profiles-001-segment-flyout-menu.jpg)
*Segment flyout with all 10 items*

#### All Segments - Segments tab

![Segments list: toolbar, columns, single File segment](../screenshots/07-segments-builder-profiles-002-all-segments-list.jpg)
*Segments list: toolbar, columns, single File segment*

![Segment Type filter: File, Filter, Warehouse - SQL (Clear all / Select all)](../screenshots/07-segments-builder-profiles-003-segment-type-filter.jpg)
*Segment Type filter: File, Filter, Warehouse - SQL (Clear all / Select all)*

![Last Run Time tooltip: 'Time at which the segment was last run in a query'](../screenshots/07-segments-builder-profiles-004-last-run-time-tooltip.jpg)
*Last Run Time tooltip: 'Time at which the segment was last run in a query'*

![Row menu: View, Edit, Duplicate (disabled), Archive, Create campaign, Analyze Segment](../screenshots/07-segments-builder-profiles-005-row-actions-menu.jpg)
*Row menu: View, Edit, Duplicate (disabled), Archive, Create campaign, Analyze Segment*

![Archived Segments toggle on: 'Archived segments' list, empty state](../screenshots/07-segments-builder-profiles-036-archived-segments-empty.jpg)
*Archived Segments toggle on: 'Archived segments' list, empty state*

!['All Segments Feature Walkthrough' video modal](../screenshots/07-segments-builder-profiles-037-watch-video-modal.jpg)
*'All Segments Feature Walkthrough' video modal*

![Disabled Duplicate tooltip: not available for segments imported from Import Users](../screenshots/07-segments-builder-profiles-095-row-menu-duplicate-disabled-tooltip.jpg)
*Disabled Duplicate tooltip: not available for segments imported from Import Users*

![Row &gt; Analyze Segment modal: segment description + required Analysis Type](../screenshots/07-segments-builder-profiles-096-analyze-segment-modal.jpg)
*Row &gt; Analyze Segment modal: segment description + required Analysis Type*

![Analysis types: Behavior, Funnels, Retention, Session and source, User paths, User analysis, RFM Analysis](../screenshots/07-segments-builder-profiles-097-analyze-segment-types.jpg)
*Analysis types: Behavior, Funnels, Retention, Session and source, User paths, User analysis, RFM Analysis*

![Row &gt; Create campaign modal: Channel Type + Campaign Type](../screenshots/07-segments-builder-profiles-098-create-campaign-modal.jpg)
*Row &gt; Create campaign modal: Channel Type + Campaign Type*

![Channel types available from a segment (11)](../screenshots/07-segments-builder-profiles-099-create-campaign-channel-types.jpg)
*Channel types available from a segment (11)*

![Email campaign types: Event Triggered, One Time, Periodic](../screenshots/07-segments-builder-profiles-100-create-campaign-email-types.jpg)
*Email campaign types: Event Triggered, One Time, Periodic*

!['+ Segment' &gt; New Segment type picker: Filter, RFM, File, Predictive Segment](../screenshots/07-segments-builder-profiles-101-new-segment-type-picker.jpg)
*'+ Segment' &gt; New Segment type picker: Filter, RFM, File, Predictive Segment*

![Segment-type tile hover shows a description (Filter Segment)](../screenshots/07-segments-builder-profiles-102-new-segment-type-hover.jpg)
*Segment-type tile hover shows a description (Filter Segment)*

#### All Segments - Synced Segments tab

![Outbound Segment Sync intro and paid add-on banner](../screenshots/07-segments-builder-profiles-032-synced-segments-upsell.jpg)
*Outbound Segment Sync intro and paid add-on banner*

![Send anywhere: data warehouses, loyalty, recommendation engines, experimentation tools](../screenshots/07-segments-builder-profiles-033-synced-segments-send-anywhere.jpg)
*Send anywhere: data warehouses, loyalty, recommendation engines, experimentation tools*

![Up-to-date segments: one-time or periodic sync (daily, weekly, monthly)](../screenshots/07-segments-builder-profiles-034-synced-segments-up-to-date.jpg)
*Up-to-date segments: one-time or periodic sync (daily, weekly, monthly)*

![Smart segments: sync RFM, affinity, predictive and other segments](../screenshots/07-segments-builder-profiles-035-synced-segments-smart.jpg)
*Smart segments: sync RFM, affinity, predictive and other segments*

#### Custom Segment Info (segment detail)

![Segment info before refresh: metadata, counts '--', Edit / Actions](../screenshots/07-segments-builder-profiles-006-segment-info-top.jpg)
*Segment info before refresh: metadata, counts '--', Edit / Actions*

![Reachability section (needs refresh) and 'Oops! No edit history available'](../screenshots/07-segments-builder-profiles-007-segment-info-edit-history-empty.jpg)
*Reachability section (needs refresh) and 'Oops! No edit history available'*

![Actions: Duplicate (disabled), Archive, Create campaign, Analyze Segment](../screenshots/07-segments-builder-profiles-008-segment-info-actions-menu.jpg)
*Actions: Duplicate (disabled), Archive, Create campaign, Analyze Segment*

!['Refreshing count. Please wait...' loading modal](../screenshots/07-segments-builder-profiles-009-segment-count-refresh-loading.jpg)
*'Refreshing count. Please wait...' loading modal*

![After refresh: User Count 3, Reachable 3; by channel Push 0, Email 3, SMS 3, WhatsApp 3](../screenshots/07-segments-builder-profiles-010-segment-info-reachability.jpg)
*After refresh: User Count 3, Reachable 3; by channel Push 0, Email 3, SMS 3, WhatsApp 3*

![Sample users avatars + Show more](../screenshots/07-segments-builder-profiles-011-segment-info-sample-users.jpg)
*Sample users avatars + Show more*

![Hovering a sample-user avatar shows the user's name](../screenshots/07-segments-builder-profiles-012-sample-user-hover.jpg)
*Hovering a sample-user avatar shows the user's name*

!['Showing users after segmentation' table: Username, Email, Mobile, ID, MoEngage ID, First seen, Last seen, Sessions (contains PII)](../screenshots/07-segments-builder-profiles-013-sample-users-modal.jpg)
*'Showing users after segmentation' table: Username, Email, Mobile, ID, MoEngage ID, First seen, Last seen, Sessions (contains PII)*

![Reachable users tooltip: reachable via at least one of Email, SMS or Push](../screenshots/07-segments-builder-profiles-027-segment-info-reachable-users-tooltip.jpg)
*Reachable users tooltip: reachable via at least one of Email, SMS or Push*

![Edit File segment modal: action, file upload, identifier attribute, alert emails](../screenshots/07-segments-builder-profiles-028-file-segment-edit-modal.jpg)
*Edit File segment modal: action, file upload, identifier attribute, alert emails*

![Select action: Add users, Remove users, Replace users](../screenshots/07-segments-builder-profiles-029-file-segment-edit-action-options.jpg)
*Select action: Add users, Remove users, Replace users*

!['User attribute provided in file' picker (grouped attributes)](../screenshots/07-segments-builder-profiles-030-file-segment-edit-attribute-picker.jpg)
*'User attribute provided in file' picker (grouped attributes)*

![Provide URL option: https, public, valid CSV up to 300 MB](../screenshots/07-segments-builder-profiles-031-file-segment-edit-provide-url.jpg)
*Provide URL option: https, public, valid CSV up to 300 MB*

#### Create segment (filter segment builder)

![Default builder: Filter users by &gt; User behavior &gt; Has Executed + Select an event; Query results below](../screenshots/07-segments-builder-profiles-038-create-segment-builder-default.jpg)
*Default builder: Filter users by &gt; User behavior &gt; Has Executed + Select an event; Query results below*

![Behavior operator: Has Executed / Has Not Executed](../screenshots/07-segments-builder-profiles-039-behavior-has-executed-operator.jpg)
*Behavior operator: Has Executed / Has Not Executed*

![Event picker is empty: no events tracked in this workspace](../screenshots/07-segments-builder-profiles-040-behavior-event-picker-empty.jpg)
*Event picker is empty: no events tracked in this workspace*

![User property attribute picker: Lifecycle group](../screenshots/07-segments-builder-profiles-041-user-property-attribute-picker-1.jpg)
*User property attribute picker: Lifecycle group*

![Attribute picker: Uninstall, Reachability groups](../screenshots/07-segments-builder-profiles-042-user-property-attribute-picker-2.jpg)
*Attribute picker: Uninstall, Reachability groups*

![Attribute picker: Email Suppression Type, Device Data groups](../screenshots/07-segments-builder-profiles-043-user-property-attribute-picker-3.jpg)
*Attribute picker: Email Suppression Type, Device Data groups*

![Attribute picker: Tracked Standard / Tracked Custom Attribute groups](../screenshots/07-segments-builder-profiles-044-user-property-attribute-picker-4.jpg)
*Attribute picker: Tracked Standard / Tracked Custom Attribute groups*

![Date attribute (First Seen): Date / on / Constant value / calendar / date](../screenshots/07-segments-builder-profiles-045-date-attribute-calendar.jpg)
*Date attribute (First Seen): Date / on / Constant value / calendar / date*

![Date granularity: Date, Daily where the hour, Weekly where the day, Monthly where the day, Yearly where the month, Yearly where the date](../screenshots/07-segments-builder-profiles-046-date-attribute-granularity.jpg)
*Date granularity: Date, Daily where the hour, Weekly where the day, Monthly where the day, Yearly where the month, Yearly where the date*

![Date operators: on, is between, before, after, in the next, in the last, is today, exists, does not exist](../screenshots/07-segments-builder-profiles-047-date-operators.jpg)
*Date operators: on, is between, before, after, in the next, in the last, is today, exists, does not exist*

!['in the last N days' relative date input](../screenshots/07-segments-builder-profiles-048-date-in-the-last-days.jpg)
*'in the last N days' relative date input*

![Value source: Constant value / User attribute](../screenshots/07-segments-builder-profiles-049-value-source-options.jpg)
*Value source: Constant value / User attribute*

![Compare with another user attribute (same-type list: Last Seen, Uninstall Time)](../screenshots/07-segments-builder-profiles-050-value-user-attribute-compare.jpg)
*Compare with another user attribute (same-type list: Last Seen, Uninstall Time)*

![Tooltip: only attributes matching the data type are shown](../screenshots/07-segments-builder-profiles-051-value-user-attribute-tooltip.jpg)
*Tooltip: only attributes matching the data type are shown*

![Date value mode: date, days ago, days from now](../screenshots/07-segments-builder-profiles-052-date-value-mode.jpg)
*Date value mode: date, days ago, days from now*

![Numeric operators (LTV): is equal to, is not equal to, is between, is not between, is less than, is greater than, exists, does not exist](../screenshots/07-segments-builder-profiles-053-numeric-operators.jpg)
*Numeric operators (LTV): is equal to, is not equal to, is between, is not between, is less than, is greater than, exists, does not exist*

![Numeric value: searchable multi-select with Clear all / Select all](../screenshots/07-segments-builder-profiles-054-numeric-value-multiselect.jpg)
*Numeric value: searchable multi-select with Clear all / Select all*

![String operators (13), first part of the list](../screenshots/07-segments-builder-profiles-055-string-operators.jpg)
*String operators (13), first part of the list*

![String value multi-select + 'Case Sensitive' checkbox](../screenshots/07-segments-builder-profiles-056-string-value-case-sensitive.jpg)
*String value multi-select + 'Case Sensitive' checkbox*

![Boolean value suggestions: True / False](../screenshots/07-segments-builder-profiles-057-boolean-value-suggestions.jpg)
*Boolean value suggestions: True / False*

![Boolean operators: is, is not, exists, does not exist](../screenshots/07-segments-builder-profiles-058-boolean-operators.jpg)
*Boolean operators: is, is not, exists, does not exist*

![Second filter added: first collapses to summary; AND / OR toggle between filters](../screenshots/07-segments-builder-profiles-059-two-filters-and-or.jpg)
*Second filter added: first collapses to summary; AND / OR toggle between filters*

![User affinity tab: Has Executed + event picker (empty)](../screenshots/07-segments-builder-profiles-060-user-affinity-event-picker-empty.jpg)
*User affinity tab: Has Executed + event picker (empty)*

![Custom segment tab: select an existing segment](../screenshots/07-segments-builder-profiles-061-custom-segment-picker.jpg)
*Custom segment tab: select an existing segment*

![Custom segment selected (no in/not-in operator)](../screenshots/07-segments-builder-profiles-062-custom-segment-selected.jpg)
*Custom segment selected (no in/not-in operator)*

![OR between filters; Nested Filter added under a filter](../screenshots/07-segments-builder-profiles-063-or-join-nested-filter.jpg)
*OR between filters; Nested Filter added under a filter*

![Nested filter join dropdown: AND / OR](../screenshots/07-segments-builder-profiles-064-nested-join-and-or.jpg)
*Nested filter join dropdown: AND / OR*

![Exclude Users: second full filter builder for exclusions](../screenshots/07-segments-builder-profiles-065-exclude-users-block.jpg)
*Exclude Users: second full filter builder for exclusions*

![Actions menu: Create Campaign, Analyze Segment, Create Custom segment](../screenshots/07-segments-builder-profiles-066-actions-menu.jpg)
*Actions menu: Create Campaign, Analyze Segment, Create Custom segment*

![Validation: red outlines + toast 'Fill the required segment filters'](../screenshots/07-segments-builder-profiles-067-validation-fill-required.jpg)
*Validation: red outlines + toast 'Fill the required segment filters'*

![Complete query: Filter A OR Filter B, excluding a segment](../screenshots/07-segments-builder-profiles-068-complete-filter-with-exclusion.jpg)
*Complete query: Filter A OR Filter B, excluding a segment*

!['Create a custom segment' dialog: auto description + required name; no static/dynamic or refresh options](../screenshots/07-segments-builder-profiles-069-create-custom-segment-dialog.jpg)
*'Create a custom segment' dialog: auto description + required name; no static/dynamic or refresh options*

![Query results history (Source: Segmentation / Push Campaign / Email Campaign)](../screenshots/07-segments-builder-profiles-070-query-results-table.jpg)
*Query results history (Source: Segmentation / Push Campaign / Email Campaign)*

![Expanded query row: reachable users and reachability by channel](../screenshots/07-segments-builder-profiles-071-query-result-expanded-reachability.jpg)
*Expanded query row: reachable users and reachability by channel*

![Expanded row: Sample users + Edit query / Create campaign / Create custom segment / Analyze segment](../screenshots/07-segments-builder-profiles-072-query-result-expanded-actions.jpg)
*Expanded row: Sample users + Edit query / Create campaign / Create custom segment / Analyze segment*

![Query row kebab: Edit query, Create campaign, Create custom segment, Show sample users, Analyze segment](../screenshots/07-segments-builder-profiles-073-query-result-row-menu.jpg)
*Query row kebab: Edit query, Create campaign, Create custom segment, Show sample users, Analyze segment*

![All users ('All users selected') combined with Exclude Users](../screenshots/07-segments-builder-profiles-074-all-users-with-exclusion.jpg)
*All users ('All users selected') combined with Exclude Users*

![Behavior event row (placeholder event injected locally): at least N times, in the last 3 days, + Attributes, + Aggregation](../screenshots/07-segments-builder-profiles-075-behavior-event-config-placeholder.jpg)
*Behavior event row (placeholder event injected locally): at least N times, in the last 3 days, + Attributes, + Aggregation*

![Execution operators: exactly, at least, at most, for the first time, for the last time](../screenshots/07-segments-builder-profiles-076-behavior-execution-count-operators.jpg)
*Execution operators: exactly, at least, at most, for the first time, for the last time*

![Event time range options (11)](../screenshots/07-segments-builder-profiles-077-behavior-time-range-options.jpg)
*Event time range options (11)*

!['Attributes' coachmark: filter events by event attributes such as Platform, App Version](../screenshots/07-segments-builder-profiles-078-behavior-attributes-coachmark.jpg)
*'Attributes' coachmark: filter events by event attributes such as Platform, App Version*

![Time units: hours, days, weeks, months](../screenshots/07-segments-builder-profiles-079-behavior-time-units.jpg)
*Time units: hours, days, weeks, months*

![Affinity types: Predominantly, For a minimum of, Most no. of times, Least no. of times](../screenshots/07-segments-builder-profiles-080-affinity-type-options.jpg)
*Affinity types: Predominantly, For a minimum of, Most no. of times, Least no. of times*

![Affinity row: Has Executed event, type, with attribute, + Attributes, time range in Days](../screenshots/07-segments-builder-profiles-081-affinity-config.jpg)
*Affinity row: Has Executed event, type, with attribute, + Attributes, time range in Days*

![Affinity time range: in the last, in between, before, after, on, today](../screenshots/07-segments-builder-profiles-082-affinity-time-range.jpg)
*Affinity time range: in the last, in between, before, after, on, today*

!['For a minimum of N % of times with &lt;attribute&gt;'](../screenshots/07-segments-builder-profiles-083-affinity-minimum-percent.jpg)
*'For a minimum of N % of times with &lt;attribute&gt;'*

![Affinity 'with' attribute picker: Time Attributes (Hour of day, Day of week, Day of month, Month of year)](../screenshots/07-segments-builder-profiles-084-affinity-time-attributes.jpg)
*Affinity 'with' attribute picker: Time Attributes (Hour of day, Day of week, Day of month, Month of year)*

![Affinity with Day of the week: is + value + copy](../screenshots/07-segments-builder-profiles-085-affinity-day-of-week-row.jpg)
*Affinity with Day of the week: is + value + copy*

![Day-of-week values Sunday to Saturday](../screenshots/07-segments-builder-profiles-086-affinity-days-of-week-values.jpg)
*Day-of-week values Sunday to Saturday*

!['With Attribute' event-attribute row (attribute list stays loading: no event attributes in workspace)](../screenshots/07-segments-builder-profiles-092-affinity-with-attribute-row.jpg)
*'With Attribute' event-attribute row (attribute list stays loading: no event attributes in workspace)*

![Builder user-search help popover with 'Edit Instruction' (custom team instructions)](../screenshots/07-segments-builder-profiles-093-builder-user-search-help-popover.jpg)
*Builder user-search help popover with 'Edit Instruction' (custom team instructions)*

![Builder user search: Enter opens a 'Search' results drawer (contains PII)](../screenshots/07-segments-builder-profiles-094-builder-user-search-drawer.jpg)
*Builder user search: Enter opens a 'Search' results drawer (contains PII)*

#### Search Users

![Search Users landing: one search box](../screenshots/07-segments-builder-profiles-087-search-users-empty.jpg)
*Search Users landing: one search box*

![Info tooltip: find any identified or anonymous user (help article link)](../screenshots/07-segments-builder-profiles-088-search-users-tooltip.jpg)
*Info tooltip: find any identified or anonymous user (help article link)*

![Results table, 'Showing 3 of 3 matches' (contains PII)](../screenshots/07-segments-builder-profiles-089-search-users-results.jpg)
*Results table, 'Showing 3 of 3 matches' (contains PII)*

![No-results empty state](../screenshots/07-segments-builder-profiles-090-search-users-no-results.jpg)
*No-results empty state*

#### User Profile

![Profile header, identity card, Customer Lifecycle, Reachability, Subscription statuses (contains PII)](../screenshots/07-segments-builder-profiles-014-user-profile-top.jpg)
*Profile header, identity card, Customer Lifecycle, Reachability, Subscription statuses (contains PII)*

![Reachability tiles with TEST PUSH/EMAIL/SMS/WHATSAPP; subscription chips; Computed Traits banner](../screenshots/07-segments-builder-profiles-015-user-profile-reachability-subscriptions.jpg)
*Reachability tiles with TEST PUSH/EMAIL/SMS/WHATSAPP; subscription chips; Computed Traits banner*

![Grouped attribute tables: Tracked Custom, Uninstall, Tracked Standard, Localization, Email Suppression Type, Reachability](../screenshots/07-segments-builder-profiles-016-user-profile-properties-tables.jpg)
*Grouped attribute tables: Tracked Custom, Uninstall, Tracked Standard, Localization, Email Suppression Type, Reachability*

![Lifecycle table (First/Last Seen, LTV, Conversions, Sessions, Random User Bucket, User Creation Source) + Hide PII banner](../screenshots/07-segments-builder-profiles-017-user-profile-lifecycle-pii-banner.jpg)
*Lifecycle table (First/Last Seen, LTV, Conversions, Sessions, Random User Bucket, User Creation Source) + Hide PII banner*

![User Profile tooltip](../screenshots/07-segments-builder-profiles-018-user-profile-info-tooltip.jpg)
*User Profile tooltip*

![Reachability tooltip: green tick = reachable on at least one platform/device](../screenshots/07-segments-builder-profiles-019-user-profile-reachability-tooltip.jpg)
*Reachability tooltip: green tick = reachable on at least one platform/device*

![Event activity tab: Filter events + 'No Events Found'](../screenshots/07-segments-builder-profiles-020-user-profile-event-activity-empty.jpg)
*Event activity tab: Filter events + 'No Events Found'*

![Filter events panel: Date Range (Asia/Kolkata), Platform, Events/Campaigns, Reset all / Cancel / Apply](../screenshots/07-segments-builder-profiles-021-user-profile-filter-events-panel.jpg)
*Filter events panel: Date Range (Asia/Kolkata), Platform, Events/Campaigns, Reset all / Cancel / Apply*

![Date presets: Today, Yesterday, Last 7 Days, Last Week, Last 30 Days, This Month, Custom Range, Last N D/W/M](../screenshots/07-segments-builder-profiles-022-user-profile-event-date-presets.jpg)
*Date presets: Today, Yesterday, Last 7 Days, Last Week, Last 30 Days, This Month, Custom Range, Last N D/W/M*

![Platform filter: Android, iOS, Web, Other](../screenshots/07-segments-builder-profiles-023-user-profile-event-platform-filter.jpg)
*Platform filter: Android, iOS, Web, Other*

![Filter by: Events / Campaigns](../screenshots/07-segments-builder-profiles-024-user-profile-event-filter-type.jpg)
*Filter by: Events / Campaigns*

![Events filter: Select event (empty) + '+ Event'](../screenshots/07-segments-builder-profiles-025-user-profile-event-select-event.jpg)
*Events filter: Select event (empty) + '+ Event'*

![Campaigns filter: All, Email, Push, SMS, In-App, Onsite &amp; Web Personalisation, Connector, Card, ...](../screenshots/07-segments-builder-profiles-026-user-profile-event-campaign-types.jpg)
*Campaigns filter: All, Email, Push, SMS, In-App, Onsite &amp; Web Personalisation, Connector, Card, ...*

![Search Property name ('email') filters attribute tables](../screenshots/07-segments-builder-profiles-091-user-profile-property-search.jpg)
*Search Property name ('email') filters attribute tables*
