## 22. Settings > Analytics: Query Settings, Acquisition & Uninstall tracking, Data Management

Storees has no screen for this module, but two of its behaviours beat MoEngage's switches: ingestion deduplicates at write time before flows fire (MoEngage's dedup is opt-in and runs at file compaction), and event volumes are computed live rather than once a day. Identity merging, delete propagation, role gating, acquisition reporting and source health exist only in pieces: merging is an env-flagged admin API that later events don't respect, and erased or merged profiles stay in segments. The real gap is the governed data dictionary: there is no event or user-attribute catalog, no first/last seen or silent-event detection, no per-item block, visibility, PII, display-name or type setting, and custom attributes can't be chosen in the segment builder at all.

### MoEngage overview

This module controls how MoEngage counts users and events, and governs what data the workspace tracks.

- **Query Settings** (Settings > Analytics & Segmentation): three workspace switches with no Save button (they apply directly):
  - Analytics user merging: merged identities count once in analytics; may take up to 15 minutes and slightly slows queries.
  - Real-time event dedup: duplicates written by real-time ingestion are found by an internal unique ID and removed during file compaction.
  - Real-time delete and merge propagation: deleted users leave every segment, and merged identities count as one, within seconds instead of at the next rebuild; query time may rise with MAU.
  - All three were off and disabled for this role, with the hover text "Your role doesn't have the permission to edit this page."
- **Acquisition Tracking:** one switch for app-install acquisition analytics (Conversions, Revenue and Sessions per user by acquisition campaign) and a Save in a sticky footer. Its "Know more" link opens an unrelated Trackier partner article.
- **Uninstall Tracking:** an Android-only switch that detects uninstalls through silent pushes, a "Test Android silent push" button and SAVE. No iOS or Web option.
- **Data Management** (Settings > Data), three tabs:
  - **Overview:** quota cards (Unique events used 0/512, Unique user attributes used 12/256) with auto-block counters; monthly event-volume cards (all and custom) with a 12-month picker; a "Top events by volume" bar chart with Download all; a daily volume chart modal with date presets and a scope of all, custom, system or one event. Data refreshes daily at 1:00 am IST.
  - **Events:** a governed catalog (Display name, Key name, Status, Visibility, First seen, Last seen, 30-day volume, Source), quick-filter cards including "Events not tracked" over 7, 30 or 60 days, Source / Status / Type filters, an advanced filter, a column chooser and Download all. Empty in this workspace.
  - **User attributes:** 45 attributes (33 Derived, 10 Standard, 2 Custom) with status (Allowed, Blocked, Auto-blocked), visibility in marketer dropdowns, per-attribute PII masking, tracked versus allowed (typecast) data type, last seen and source lineage. An Edit drawer locks everything but Mask on system attributes; row menus vary by class; bulk Block / Allow / Visibility; advanced filters, column chooser, search, infinite scroll and CSV export.
- **Entry points:** a searchable Settings flyout grouped into "Analytics & Segmentation" and "Data", and a Settings Home card grid with a one-line description per page.

**Capture caveats:** Query Settings and Acquisition Tracking were read-only for this role, so options behind their switches couldn't be seen. The workspace had ingested no events, so event rows, the Edit event drawer and event bulk actions were unreachable; the Events filter options were read from component state. Nothing was saved, toggled, blocked, downloaded or sent.

| Page visited | URL path |
|---|---|
| Settings navigation (flyout and Settings Home) | `/v4/settings-v2` |
| Query Settings | `/v4/settings-v2/analytics/query-settings` |
| Acquisition Tracking | `/v4/settings-v2/analytics/acquisition-settings` |
| Uninstall Tracking | `/v4/settings-v2/analytics/uninstall` |
| Data Management: Overview | `/v4/data/data-management/overview` (also `/v4/data/data-management` and `/v4/settings-v2/data/data-management`) |
| Data Management: Events | `/v4/data/data-management/events` |
| Data Management: User attributes | `/v4/data/data-management/user-attributes` |

### Storees counterpart

Storees has no data-settings section. The nearest pieces are spread across Settings, the main nav and the backend:

- **Settings > SDK & Integration** (`packages/frontend/src/app/(dashboard)/settings/page.tsx`): opens on Channels. Its Setup sub-section holds the SDK Connection badge (true once any `source='sdk'` event exists, `packages/backend/src/routes/v1ApiKeys.ts`) and, at the bottom, Data maintenance (`packages/frontend/src/app/(dashboard)/settings/DataMaintenance.tsx`). Settings tabs live in `packages/frontend/src/app/(dashboard)/settings/layout.tsx`.
- **Event Sources** (`packages/frontend/src/app/(dashboard)/event-sources/page.tsx` and `[id]/page.tsx`; `packages/backend/src/routes/inboundWebhooks.ts`, `routes/hooks.ts`, `services/inboundWebhookService.ts`): inbound webhooks with a 24-hour count, last received, pause, schema inference and event definitions.
- **Event Mapping**, super-admin only (`packages/frontend/src/app/(dashboard)/event-sources/mapping/page.tsx`; `packages/backend/src/routes/eventMapping.ts`): every received event name with its all-time count, mapped to business meanings.
- **Event Debugger** (`packages/frontend/src/app/(dashboard)/debugger/page.tsx`; `packages/backend/src/routes/events.ts`): the latest 200 events, filtered by customer, a distinct event-name dropdown, dates and session.
- **Volume charts:** the Dashboard "Events" line (`packages/frontend/src/app/(dashboard)/dashboard/page.tsx`; `packages/backend/src/routes/dashboard.ts`) and Analytics > Time Series "Total Events" (`packages/frontend/src/app/(dashboard)/analytics/timeseries/page.tsx`; `packages/backend/src/services/analyticsService.ts`).
- **Field registry** for the segment builder, `GET /api/schema/fields` (`packages/backend/src/routes/v1Schema.ts`, `services/domainRegistry.ts`). Observed custom attribute keys and event paths appear only in the template variable picker (`packages/backend/src/services/variableSources.ts`).
- **Ingestion dedup and identity:** `packages/backend/src/routes/v1Events.ts`, `routes/webhooks.ts`, `services/eventProcessor.ts`; identity resolution by external id, email, then phone (`services/customerService.ts`); anonymous back-attribution (`workers/identityMergeWorker.ts`); the admin-only merge API (`routes/identity.ts`, `services/identityGraphService.ts`) behind `ENABLE_IDENTITY_MERGE` and `ENABLE_DEVICE_STITCH` (`config/features.ts`).
- **Privacy:** role-based contact masking (`packages/backend/src/lib/pii.ts`, `middleware/capabilities.ts`; roles at `packages/frontend/src/app/(dashboard)/settings/roles/page.tsx`), an ingestion PII guard (`middleware/dataMasking.ts`) and erasure (`services/dataSubjectService.ts`; `packages/frontend/src/components/customers/DataSubjectCard.tsx`).
- **Acquisition:** SDK UTM capture (`packages/sdk/src/autotrack.ts`, `core.ts`) and an unlinked Click-to-WhatsApp page (`packages/frontend/src/app/(dashboard)/campaigns/ctwa/page.tsx`; `packages/backend/src/routes/whatsappAdmin.ts`).
- **Not present:** an event or attribute catalog; governance metadata (status, visibility, PII flag, display name, description, pinned type); quotas; silent-event detection; MMP and uninstall tracking.

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Settings navigation | Settings IA: "Analytics & Segmentation" and "Data" groups in a searchable flyout, plus Settings Home cards with one-line descriptions | Gear flyout with search, a Settings Home link and collapsible groups; Settings Home repeats each page as a described card | 🟡 Partial | Flat bar of up to 11 tabs, no search or home (`settings/layout.tsx:12-40`). SDK & Integration opens on Channels (`settings/page.tsx:47-57`); Data maintenance sits at the bottom of Setup (`page.tsx:332`). Event Sources and Debugger are admin nav items, Event Mapping super-admin (`Sidebar.tsx:54-71`). Identity merge is env flags only (`config/features.ts`) | Admins can't find how their data is configured. Add a "Data" settings group (catalog, Event Sources, Event Mapping, identity, data maintenance) with a one-line description per item | P2 | S |
| Query Settings | Analytics user merging (toggle) | Merged identities count once in analytics; up to 15 min to apply, slightly slower queries. Off and locked here | 🟡 Partial | Ingest resolves by external id, then email, then phone (`customerService.ts:401-457`); anonymous events stay `customer_id NULL` and back-attribute on identify (`identityMergeWorker.ts:9-30`). Merging existing profiles is admin API only (`routes/identity.ts`), dry-run unless `ENABLE_IDENTITY_MERGE=true` (`features.ts:35-37`). Merges don't stick: ingest lookups ignore `merged_into`, so later events with the loser's email, phone or id land on it again. Only campaign audiences skip merged rows (`campaignService.ts:220-257, 438, 535-571`); segments (`segmentService.ts:92`), the dashboard total (`dashboard.ts:131-139`) and analytics count them. No setting or UI | A WhatsApp phone-only profile and a Shopify email profile for one shopper stay two people unless an operator calls the API. Add a per-project identity setting with the shadow report as preview; make ingest follow `merged_into` to the survivor; exclude merged rows from every count | P2 | M |
| Query Settings | Real-time event dedup (toggle) | Opt-in; duplicates from real-time ingestion removed at file compaction by an internal ID. Off | ⭐ Storees better | Always on, at write time, before flows fire. Unique `(project_id, idempotency_key)` (`schema.ts:235`). `/api/v1/events` derives a key when none is sent: exact timestamp, else a 10 s bucket (`v1Events.ts:19-58, 170-202`). Re-sent orders merge via one order fingerprint (`v1Events.ts:60-100`). SDK and pixel stamp keys (`sdk/src/events.ts:33`; `shopifyPixel.ts:73`). Shopify webhooks deduped on `X-Shopify-Webhook-Id` for 24 h (`webhooks.ts:15, 51-59`). History sync keys on order id (`eventProcessor.ts:191-211`) | Caveats: `/events/batch` inserts keyless non-order events with no key (`v1Events.ts:386, 429-447`), and inbound hooks key each delivery by its raw row (`inboundWebhookService.ts:393-396`), so a provider retry is stored and published twice. Derive a content key on both paths (P2, S; batch also in module 17) | — | — |
| Query Settings | Real-time delete and merge propagation (toggle) | Deleted users leave every segment and merged identities count as one, within seconds instead of at the next rebuild. Off | 🟡 Partial | Immediate: campaign sends skip merged rows (`campaignService.ts:220-257`); erasure blanks email, phone, name and custom attributes (`dataSubjectService.ts:64-97`), from the profile's DataSubjectCard or Shopify `customers/redact` (`webhooks.ts:248-268`). Not propagated: erase and merge leave `customer_segments` and active trips alone (`identityGraphService.ts:188-262`), and the evaluator has no `merged_into` filter (`segmentService.ts:92`). Segments rebuild nightly at 03:00 (`aggregateReconcileWorker.ts:29`) or on demand with a 10-min cooldown (`segmentService.ts:222`). No customer delete route | Erased and merged profiles stay in segment counts and member lists indefinitely. On erase or merge, drop their memberships and exit active trips; add `merged_into IS NULL` to the evaluator, dashboard and analytics | P2 | M |
| Query Settings | Role-based edit lock: page stays visible, controls disabled with "Your role doesn't have the permission to edit this page" | Settings pages render read-only for roles that can't edit them | 🟡 Partial | Non-admins lose admin settings tabs instead of seeing them read-only (`settings/layout.tsx:33-40`). Custom roles hold two data permissions, `viewContactPii` and `exportCustomers` (`capabilities.ts:15-47`); a `screens` list is stored (`roles.ts:16-25`), but the Roles page always writes `'*'` (`settings/roles/page.tsx:50`) and nothing reads it. Event Mapping has a "Read only" banner (`mapping/page.tsx:442-454`) that nobody reaches: the API is super-admin only and returns `canEdit: true` to every super-admin (`eventMapping.ts:322, 394`) | No view-versus-edit permission and no live read-only rendering. Enforce `screens` with view and edit levels, and promote the Event Mapping banner to a shared read-only pattern | P2 | M |
| Acquisition Tracking | Acquisition tracking toggle + Save (app-install analytics fed by MMP partners) | One switch, off and locked; Save disabled; "Know more" opens a Trackier article | ➖ N/A | Browser SDK only (`packages/sdk`, `packages/sdk-react`); no MMP or install-referrer code (searched AppsFlyer, Adjust, Branch, Trackier, Kochava, Singular, install_referrer). Web UTM capture is on by default (`sdk/src/core.ts:13-19`) | Nothing to replicate for app installs; the web and WhatsApp equivalent is the next row | — | — |
| Acquisition Tracking | Acquisition quality metrics: conversions, revenue and sessions per user by acquisition campaign | What the toggle unlocks | 🟡 Partial | SDK keeps the five UTM params for the session (`autotrack.ts:308-341`) and adds them to `track()`, `page()` and `session_started` (`core.ts:195-212`; `autotrack.ts:110-114`); `session_started` exposes `utm_source` and `utm_campaign` to "performed event where…" rules (`eventSchemas.ts:128`). `/campaigns/ctwa` shows leads and engaged per Click-to-WhatsApp ad (`whatsappAdmin.ts:670-750`), but nothing links to it and Converted and Revenue always read 0 (nothing writes `first_purchase_at` or `attributed_revenue`). No first-touch source on the customer; Shopify `landing_site`, `referring_site`, `source_name` are dropped (`eventProcessor.ts:333-357`); no property breakdown in funnels or cohorts; no ecommerce Acquisition card (`UserInfoTab.tsx:90-120`) | No report of customers, orders, revenue and sessions per first-touch source, campaign or CTWA ad. Stamp the first-touch UTM or CTWA ad on the customer, write CTWA conversions on the first order, add a per-source report, and link `/campaigns/ctwa` | P2 | M |
| Uninstall Tracking | Android Uninstall Tracking (toggle + SAVE) | Silent-push uninstall detection for the Android app; on and editable here; no iOS or Web | ➖ N/A | Web-only SDKs. Storees pushes to connector-supplied FCM tokens; on `UNREGISTERED` or `NOT_FOUND` it deletes `custom_attributes.fcm_token` and sets `custom_attributes.push_subscribed=false`, leaving the `push_subscribed` column unchanged (`fcmProvider.ts:147-163`). No uninstall event or time is recorded | Not relevant to Shopify web stores. For app-push brands, emit `app_uninstalled` from the dead-token branch (P3, S); module 11's Uninstalls rows depend on it | — | — |
| Uninstall Tracking | Test Android silent push (button) | Sends a test silent push (not clicked) | ➖ N/A | Every FCM message carries a `notification` block (`fcmProvider.ts:123-141`); no data-only pushes and no app SDK to handle one | None without a native SDK | — | — |
| Data Management: Overview | Workspace data quotas with usage bars (Unique events used 0/512; Unique user attributes used 12/256) | Progress cards against the workspace quota, with definition tooltips | ❌ Missing | Plan limits cover contacts, WhatsApp and email messages, flows, templates, seats and stores only (`entitlementService.ts:15-45`). Nothing counts or caps distinct event names or attribute keys; distinct names only fill pickers (`events.ts:100-113`) | Admins can't see how many event names and custom attribute keys have piled up, and nothing limits key sprawl in `custom_attributes`. Show the counts first (S); add soft caps later | P3 | M |
| Data Management: Overview | Auto-blocking once the quota is used up (Auto-blocked events / user attributes counters) | New items are blocked at 100% of quota; counters on all three tabs | ❌ Missing | No quota and no blocked state on any ingestion path (`v1Events.ts`, `webhooks.ts`, `inboundWebhookService.ts`); searched blacklist, blocklist, is_blocked, auto_block | A misbehaving integration can create unlimited event names and attribute keys. Low value for Shopify D2C until volumes grow | P3 | M |
| Data Management: Overview | Event volume cards (All events / Custom events) with a 12-month calendar picker | Two clickable monthly totals; defaults to the last full month | 🟡 Partial | Dashboard "Events" line over 7/14/30 days with Last Day and Average (`dashboard/page.tsx:161-179`; `routes/dashboard.ts:413-425`). Time Series "Total Events" over rolling 7/14/30/90 days, daily/weekly/monthly, with a previous-period overlay (`timeseries/page.tsx:28-48`; `analyticsService.ts:334-420`). Both count every row, including Storees' synthetic flow-enrolment rows. No custom-only total, no calendar month | No at-a-glance monthly ingestion volume split into total and custom. Add volume cards to a data overview using the timeseries query, excluding internal rows | P2 | S |
| Data Management: Overview | Top events by volume (ranked bars, All / Custom selector, Download all) | Bars of each event's share of volume, with CSV | 🟡 Partial | Only the super-admin Event Mapping page lists every received name with its all-time count, sorted by volume (`eventMapping.ts:322-334`; `mapping/page.tsx:339-360`). No chart, period, custom/system split or CSV, and project admins can't open it (`Sidebar.tsx:68`). Per-customer "Top Events" only on the Journey tab (`JourneyTimelineTab.tsx:145-160`) | Project admins can't see which events dominate ingestion. Move the counts to a data overview with a period selector and a bar chart | P2 | S |
| Data Management: Overview | Event volume chart modal: daily line with presets (Last 7 Days, Last Week, Last 30 Days, Last Month, Custom Range) | Opens from a volume card | 🟡 Partial | Dashboard (7/14/30 days) and Time Series (rolling 7/14/30/90 days) chart daily event volume (`dashboard/page.tsx:17, 381-386`; `timeseries/page.tsx:37-48`). No calendar week or month and no custom range | Add calendar presets and a custom range to the shared date control | P3 | S |
| Data Management: Overview | Volume scope: all custom, all system, or one event (searchable picker grouped by class) | Scope dropdown in the chart modal; "Individual event" adds a picker | ❌ Missing | `computeTimeSeries` takes no event name or class; the `events` metric is `COUNT(*)` over every row (`analyticsService.ts:353-372`). Funnels, cohorts and time-to-event take event names but don't chart volume; the Debugger lists rows, not counts | No way to check one event's daily volume, for example whether `added_to_cart` dropped after a theme change. Add an optional event filter to the events metric (comes with the analytics event picker, module 10) | P2 | S |
| Data Management: Overview | Volume data freshness (banner: "Data is updated daily at 1:00 am Asia/Kolkata") | Volume charts are a daily batch | ⭐ Storees better | Computed live from the events table on each request, with no cache: Dashboard trends (`dashboard.ts:413-425`), Time Series (`analyticsService.ts:353-420`), Event Mapping counts (`eventMapping.ts:326-334`), Event Sources 24 h counts (`inboundWebhooks.ts:18-43`). A new pixel or SDK install shows at once | None, but no screen says the figures are live. Label them | — | — |
| Data Management: Overview | Usage cards deep-link into the filtered catalog or chart ("View unique events", "View all events volume chart") | Every usage and volume card is clickable, with a hover label | ❌ Missing | No data overview or catalog to link to | Comes with the catalog | P3 | S |
| Data Management: Events | Event catalog table (Display name, Key name, Status, Visibility, First seen, Last seen, 30-day volume, Source; sortable; search) | Governed catalog of ingested events; empty here | 🟡 Partial | No catalog page. Distinct names feed the segment, flow, campaign and Debugger pickers (`/api/events/names`, `events.ts:100-113`); analytics pickers use a separate endpoint capped at the first 200 names (`analyticsService.ts:779-788`). The super-admin Event Mapping API returns name, count and last seen (`eventMapping.ts:326-334`); its page shows name and count. The template variable picker samples paths for up to 30 events from the last 30 days (`variableSources.ts:86-120`) | Admins can't see which events exist, when each was first and last seen, its 30-day volume or where it came from. Build an events catalog from `GROUP BY event_name` (min/max timestamp, 30-day count, distinct source) | P1 | M |
| Data Management: Events | Source filter (SDK, Data API, Internal, File Imports; partners Segment, mParticle, Snowflake) | Dropdown on the Source column; the first value is the source the data first arrived from | 🟡 Partial | Each event row has `platform` and `source` (`schema.ts:219-221`), set inconsistently: browser events `sdk` or `shopify_pixel` (`sdk/src/events.ts:36`; `shopifyPixel.ts:75`); Shopify webhook rows platform `shopify_webhook`, history rows `historical_sync`, both with source defaulting to `api` (`eventProcessor.ts:97, 204-211`). The Debugger shows a platform badge (`debugger/page.tsx:136-138`); `GET /api/events` has no source filter (`events.ts:29-66`). No Segment, mParticle or Snowflake sources | Lineage is split across two columns and can't be filtered. Normalise to one source value, then add it as a catalog column and filter | P2 | S |
| Data Management: Events | Status filter (Allowed / Blocked / Auto-blocked) | Blocked and auto-blocked events are not tracked | ❌ Missing | Events have no governance columns (`schema.ts:213-236`); no catalog or blocklist table | Comes with blocklisting | P3 | S |
| Data Management: Events | Type filter (System / Custom); internal events kept out of the catalog | MoEngage's internal events (Campaign Events Stats, Meta Info…) are excluded from the Events catalog | 🟡 Partial | Standard events are defined in code (`STANDARD_EVENTS`, `SDK_EVENTS`: `shared/src/constants.ts:1-55, 151-159`), and the flow trigger picker separates them from "Observed in your data" (`StructuredFlowBuilder.tsx:1140-1178`). No list filters by type. Storees' own rows share the tenant's events table: `trial_admin_update`, `trial_expired`, `data_erased` (`superAdmin.ts:260-264`; `trialLifecycleService.ts:25-32`; `dataSubjectService.ts:90-95`), onboarding `test_event` (`v1Onboarding.ts:512-521`), and one `flow_fixed_time:<flowId>` or `flow_exit_chain:<flowId>` row per enrolled customer (`flowFixedTimeScheduler.ts:71-85`; `flowExecutor.ts:411-424`) | Add an event class (standard, custom, internal) derived from the registries and name prefixes, and filter on it | P3 | S |
| Data Management: Events | Advanced "Filter events" popover (first and last seen ranges, sources, type, visibility, category, platforms) | Popover filter model; disabled here because the catalog is empty | ❌ Missing | The Debugger filters only by customer, event name, From/To and session (`events.ts:29-66`; `debugger/page.tsx:76-79`). No catalog to filter | Comes after the catalog | P3 | M |
| Data Management: Events | Events not tracked: count of events with no data in the last 7, 30 or 60 days (card + quick filter) | "Depicts number of events that received no data since the chosen time duration" | 🟡 Partial | Partial signals only. Super-admin Event Mapping warns "Mapped to events with no data" for mapped names that never arrived (`eventMapping.ts:355-367`; `mapping/page.tsx:254-266`). Event Sources shows last received and a 24 h count per inbound webhook (`inboundWebhooks.ts:18-43`; `event-sources/page.tsx:62-102`). The SDK Connection badge only checks for any `source='sdk'` event (`v1ApiKeys.ts:129-137`), so pixel-only stores read "Not Connected". No per-event staleness, no alert | If the pixel or an integration breaks, `added_to_cart` or `checkout_started` stop arriving unnoticed and abandoned-cart flows stop firing. Track last seen per event, list events silent for 7/30/60 days, and alert admins | P1 | S |
| Data Management: Events | Column definitions as header tooltips (Status, Visibility, 30-day volume, Source) | Info icons explain each column | ❌ Missing | No catalog; Storees list tables use plain headers (`event-sources/page.tsx:60-68`) | A cheap clarity win to include with the catalog | P3 | S |
| Data Management: Events | Card quick filters (Unique events used → Allowed + Custom; Auto-blocked → Auto-blocked; Events not tracked → Allowed) | Clicking a usage card filters the table | ❌ Missing | No usage cards and no catalog | Comes with the catalog | P3 | S |
| Data Management: User attributes | User-attribute catalog with class (Derived / Standard / Custom) and system category (Lifecycle, Acquisition, Reachability…) | 45 attributes with key, status, visibility, tracked and allowed type, last seen and source; 20 rows per scroll | 🟡 Partial | A hard-coded registry per vertical gives the segment builder each field's label, type and category (`v1Schema.ts:22-62`; `domainRegistry.ts:5-48`), plus dealer and prediction fields when enabled. System values live in `customers.metrics`, arbitrary keys in `customers.custom_attributes` (`schema.ts:153-154`). Observed custom keys appear only in the template variable picker: top 50 keys across the 1,000 most recently seen customers, with a sample (`variableSources.ts:56-84`). Each profile lists its own custom attributes (`UserInfoTab.tsx:398-401`) | No page lists every attribute with its class, type, last seen or source. Custom attributes from Shopify, connectors or the API never appear in the segment builder, although the evaluator reads them (`evaluator.ts:1197-1207`). Build an attribute catalog that unions registry fields, metrics keys and observed custom keys | P1 | M |
| Data Management: User attributes | Attribute source lineage (Source column and grouped filter) | Where each attribute's data first arrived; CSV imports read "File Imports" | ❌ Missing | Customer attributes carry no source: Shopify sync, connectors, `/v1/customers`, `/v1/import`, inbound-webhook attribute mappings and the SDK all write the same columns and `custom_attributes` (`schema.ts:126-160`; `v1Events.ts:563-686`). Only events have platform/source. No Segment, mParticle or Snowflake integrations | No way to tell whether a wrong value came from Shopify, an import or the SDK. Record the writing source per attribute key in the catalog | P3 | M |
| Data Management: User attributes | Advanced "Filter user attributes" popover (Visibility, Category, Platform, Last seen, First seen, Tracked type, Allowed type, PII Masking) | Eight filters; date filters with presets and a two-month calendar | ❌ Missing | No attribute list to filter | Comes after the catalog | P3 | M |
| Data Management: User attributes | Type filter (Standard / Derived / Custom) and Status filter (Blocked / Auto-blocked / Allowed) | Quick-filter dropdowns next to Source | ❌ Missing | No attribute list and no attribute status. Storage already separates core columns, `metrics` and `custom_attributes` (`schema.ts:126-160`), so the type is derivable | Comes with the catalog | P3 | S |
| Data Management: User attributes | Tracked data type (observed types, possibly several, e.g. "String, Numeric") | Column and filter: Numeric, Boolean, Date, String, Location, Array String / Double / Boolean | 🟡 Partial | Registry fields declare one type each (`domainRegistry.ts:5-48`); Event Sources infer a type and sample per payload path (`inboundWebhookService.ts:53-90`). Observed custom keys get a sample value but no type (`variableSources.ts:56-84`) | A key holding mixed types goes unnoticed. Infer `jsonb_typeof` per key in the catalog | P2 | S |
| Data Management: User attributes | Allowed data type pinning with typecasting (Any, Numeric, Boolean, Date, String, Location) | A team member pins a type; MoEngage typecasts tracked data into it | ❌ Missing | `custom_attributes` is untyped JSONB. An unregistered field compiles to the text `COALESCE(metrics->>field, custom_attributes->>field, '')` (`evaluator.ts:1197-1207`). is / is not compare as text, and greater than / less than / between compare that text with a bound parameter, so values order as strings: '100' < '20' (`evaluator.ts:878-890`). Only event-property filters regex-guard numeric casts (`evaluator.ts:227-235`). Nothing coerces at ingest | Numeric and date filters on custom attributes aren't dependable. Let admins pin a type, coerce on write, and cast in the evaluator | P2 | M |
| Data Management: User attributes | Blocklisting (Allowed / Blocked / Auto-blocked; row Block; Status radio in the drawer; bulk Block / Allow) | "Use this to block those Events, Event attributes and User attributes that are no longer needed"; blocked items aren't tracked | 🟡 Partial | No event- or attribute-level block on SDK, API, pixel or Shopify ingestion (searched blacklist, blocklist, is_blocked, auto_block). Only inbound webhooks can be switched off: a paused source returns 409 (`hooks.ts:31-33`) and each Event Definition has `is_active` (`schema.ts:1606-1620`). Event Mapping's `ignore_events` only drops events from ML training and has no UI (`mapping/page.tsx:367-385`) | Admins can't stop a noisy or wrong event or attribute from being stored and offered to marketers. Add a block status checked at ingest, with Event Mapping's impact preview before saving | P2 | M |
| Data Management: User attributes | Visibility: hide events and attributes from marketer dropdowns (row action, Visible / Hidden radio, bulk Visibility On / Off) | "Use this to remove those Events, Event attributes and User attributes from dropdowns that are not needed by Marketers" | ❌ Missing | Segment, flow, campaign and analytics pickers list every distinct name received (`SegmentFilterBuilder.tsx:641-643`; `StructuredFlowBuilder.tsx:1148-1178`; `events.ts:100-113`; `analyticsService.ts:779-788`), including Storees' internal rows: `trial_expired`, `data_erased`, `test_event`, `flow_fixed_time:<id>`, `flow_exit_chain:<id>`. No hidden flag | Internal and noisy events clutter marketer pickers. Quick fix: filter internal names and prefixes out of the event-name endpoints (S). Then add a hidden flag per event and per attribute | P2 | M |
| Data Management: User attributes | PII masking per attribute ("Mask attribute" under Data privacy configuration; PII Masking filter and column) | Hides an attribute's PII from other team members; available even on locked system attributes | 🟡 Partial | Role-based and server-side: without `viewContactPii`, email and phone are partly masked in lists, segment previews, the Debugger, logs and raw event JSON (`lib/pii.ts:1-119`; `capabilities.ts:15-47`; `events.ts:90-92`). The masked set is fixed in code: email and phone plus fixed key lists (`pii.ts:56-57`); name and address are deliberately left visible (`pii.ts:9-10`). No per-attribute flag, so an address, birthday or PAN in `custom_attributes` is never masked | Admins can't mark other attributes as PII. Add a PII flag per attribute that feeds the existing redaction helpers | P2 | M |
| Data Management: User attributes | Edit attribute details drawer (Display name, Description up to 512 chars, Status, Visibility, Mask attribute, Allowed type; system attributes locked except Mask) | Right drawer; key read-only; display names show in segmentation filters; category system-assigned; no tags | ❌ Missing | Display names exist only as hard-coded labels in the registry and variable picker (`domainRegistry.ts:5-48`; `variableSources.ts:20-50`); custom keys show raw. No table, API or UI stores metadata per event or attribute | Marketers see raw keys with no explanation. Store a display name and description per event and attribute, and show them in every picker | P2 | M |
| Data Management: User attributes | Row actions by attribute class (system: Edit only; standard and custom: Edit, Turn visibility off/on, Block) | Kebab menu whose actions vary with the class | ❌ Missing | No catalog rows | Comes with the catalog | P3 | S |
| Data Management: User attributes | Bulk governance actions ("N user attribute(s) selected: Block, Allow, Visibility On, Visibility Off", Show selected, Clear selection) | Checkboxes enabled only for the 12 tracked standard and custom attributes | ❌ Missing | No catalog, and no Storees table has row multi-select with bulk actions (searched selectedIds, bulk action, Clear selection in `frontend/src`) | Comes with the catalog | P3 | S |
| Data Management: User attributes | Column chooser on both catalogs (optional Type, Tracked / Allowed type, Category, Platform, First seen, PII Masking) | Column-picker icon; Display name always shown | ❌ Missing | No column-visibility control on any Storees table (searched columnVisibility, visibleColumns, ColumnChooser) | Low priority; useful once a catalog passes eight columns | P3 | S |
| Data Management: User attributes | Quota counts only tracked attributes (Standard + Custom; Derived excluded) | The "Unique user attributes used" quick filter shows 12 of 45 rows | ❌ Missing | No attribute quota (`entitlementService.ts:16`) | Only relevant if quotas are added | P3 | S |
| Data Management: User attributes | Catalog search by display or key name, 20-row lazy loading, filtered empty states | "reach" returns the 5 Reachability attributes; "No user attributes found. Try using a different search term or filter." | ❌ Missing | No catalog. The nearest list, the Debugger, picks an exact name from a dropdown and loads the latest 200 events with no paging (`debugger/page.tsx:27`; `events.ts:34`) | Comes with the catalog | P3 | S |
| Data Management: User attributes | Download all / Download CSV (catalogs, top events, volume chart) | "Download all" on both catalogs and on Top events; "Download CSV" in the chart modal | ❌ Missing | No analytics or event screen offers CSV (Dashboard, Time Series, Event Mapping). The only CSV exports are the segment ad-audience file and the consent audit (`segments.ts:172-176`; `adAudienceExport.ts:183`; `v1Onboarding.ts:921-922`) | Teams can't hand a data dictionary to an agency or audit it in a spreadsheet. Add CSV export to the catalog and volume views | P3 | S |

### Storees-only strengths

- **Event Mapping: business meanings for event names, with an impact preview (super-admin).**
  - Where: `packages/backend/src/routes/eventMapping.ts` (read at :322, preview at :465, save and replay at :560); `packages/frontend/src/app/(dashboard)/event-sources/mapping/page.tsx` (per-event counts, the "Mapped to events with no data" warning at :254-266, an orders-and-revenue preview, a typed project-name confirmation and a replay progress banner).
  - Why it matters: stores on other platforms or fed by connectors can map their own event names to purchase, shipped, delivered, refunded and other meanings, then rebuild order history and revenue. MoEngage's catalog governs names but has no semantic layer.
- **Event Sources: per-source schema inference, no-code event definitions and match explanations.**
  - Where: `packages/backend/src/services/inboundWebhookService.ts:53-90` (dot-path schema with type and sample from the last 50 payloads) and :133-306 (processing, "Why didn't this match?", reprocess); `routes/inboundWebhooks.ts:18-43` (24-hour count and last received per source); `packages/frontend/src/app/(dashboard)/event-sources/[id]/page.tsx`.
  - Why it matters: admins see each inbound source's observed schema and decide which events it produces, by pausing the source or disabling a definition. MoEngage's Data Management has no source-level view like this.
- **Re-sent orders merge into the stored order instead of being dropped or double-counted.**
  - Where: `packages/backend/src/routes/v1Events.ts:60-100, 170-202` (one order fingerprint across the API, webhooks and history sync; newer properties are merged and re-aggregated); `services/orderEventKey.ts`.
  - Why it matters: a re-sent order carrying a new status (pending, shipped, delivered) updates the existing record. MoEngage's dedup only removes duplicates, and only at compaction.
- **Ingestion PII guard for Indian financial identifiers.**
  - Where: `packages/backend/src/middleware/dataMasking.ts:51-166`, mounted on the `/api/v1` event routes (`v1Events.ts:109`). It rejects Luhn-valid card numbers and 12-digit Aadhaar numbers with a 400 and masks 9-18-digit account numbers to XXXX1234.
  - Caveat: it reads only a top-level `properties` field, so it covers the Shopify pixel and direct single-event calls but not `/api/v1/events/batch` (which is how the browser SDK sends every event) or `/v1/import`.
  - Why it matters: sensitive data is refused before storage, which supports DPDP and RBI expectations. MoEngage's masking only hides attributes from team members after ingestion.
- **Role-based masking inside raw event and webhook payloads.**
  - Where: `packages/backend/src/lib/pii.ts:56-57, 100-119` (`scrubJsonbPii` deep-scrubs email and phone keys in nested JSON), used by `routes/events.ts`, `routes/inboundWebhooks.ts`, `routes/customers.ts` and `routes/dashboard.ts`.
  - Why it matters: restricted roles don't see contact details even inside raw JSON in the Debugger and webhook logs. MoEngage's per-attribute mask doesn't reach nested event payloads.
- **Reversible identity merges with a shadow report and audit trail (backend only).**
  - Where: `packages/backend/src/services/identityGraphService.ts:146-166` (shadow report), :188-262 (merge, writing `customer_merges` and `customer_merge_rows`), :300-333 (undo); `routes/identity.ts`; `db/schema.ts:1480-1503`.
  - Why it matters: admins could preview which profiles would merge and undo a bad merge, where MoEngage offers a single switch. Before customers can use it, it needs a UI, the `ENABLE_IDENTITY_MERGE` flag and ingest that follows `merged_into`.
- **Anonymous browsing back-attributed on identify, with flow replay.**
  - Where: `packages/backend/src/workers/identityMergeWorker.ts:9-30`. It re-points the session's anonymous events within the longest active-flow lookback and republishes them, so flow triggers re-evaluate with idempotency.
  - Why it matters: browsing done before a shopper identifies still triggers browse- and cart-abandonment flows. MoEngage's query setting only changes how users are counted.
- **Data maintenance self-heal for admins.**
  - Where: `packages/frontend/src/app/(dashboard)/settings/DataMaintenance.tsx`; `packages/backend/src/routes/customers.ts:845-881` (recalculate aggregates and re-evaluate segments; materialise event-only orders); nightly via `workers/aggregateReconcileWorker.ts:29`.
  - Why it matters: admins can rebuild order counts, spend, CLV and segment membership on demand when figures drift. MoEngage shows no such control in this module.
- **Observed attribute keys and event property paths in the template variable picker.**
  - Where: `packages/backend/src/services/variableSources.ts:13-120` (top 50 custom attribute keys with sample values; nested property paths for up to 30 events from the last 30 days); `GET /api/templates/variable-sources` (`routes/templates.ts:115`).
  - Why it matters: marketers personalise with real keys and see sample values without anyone curating a catalog. The same sampling is a ready base for a Storees attribute catalog.
- **Click-to-WhatsApp ad acquisition view.**
  - Where: `packages/frontend/src/app/(dashboard)/campaigns/ctwa/page.tsx`; `packages/backend/src/routes/whatsappAdmin.ts:670-750`; `ctwa_attributions` is upserted on each inbound message (`services/whatsappInboundService.ts:212`).
  - Caveat: no nav link reaches it, and Converted and Revenue always read 0 because nothing writes `first_purchase_at` or `attributed_revenue`.
  - Why it matters: leads and engagement per Meta Click-to-WhatsApp ad are the acquisition metrics that matter for WhatsApp-led Indian D2C brands; MoEngage's acquisition tracking covers app installs only. Writing conversions on the first order and adding a nav link would make this a selling point.

### UX notes

- **Information architecture** (screens 004, 061): MoEngage reaches these pages from a searchable Settings flyout grouped into "Analytics & Segmentation" and "Data", plus a Settings Home card grid with a one-line description per page. Storees' Settings is a flat bar of up to 11 tabs (`settings/layout.tsx:12-27`) whose first tab opens on Channels (`settings/page.tsx:57`). Its data tools are scattered: Data maintenance at the bottom of Setup (`page.tsx:332`), Event Sources and Event Debugger in the main nav, Event Mapping super-admin only (`Sidebar.tsx:54-71`), and identity merge as env flags only. Adopt a "Data" settings group with a one-line description per item.
- **Usage cards that act as filters** (screens 007, 012, 020-022, 051): MoEngage puts two or three KPI cards above each catalog (Unique events used 0/512, Auto-blocked, and Events not tracked with a 7/30/60-day selector); clicking one filters the table. This matches Storees' "inline metrics over modals" principle. Lead a Storees catalog with a "Silent for 7 days" card. It would also replace the SDK Connection badge, which counts only `source='sdk'` events and so shows pixel-only stores as "Not Connected" (`v1ApiKeys.ts:129-137`).
- **Edit drawer with class-based locking** (screens 042, 043, 045, 046, 052): MoEngage's right-side "Edit attribute details" drawer locks every field except "Mask attribute" on system attributes and opens all fields on custom ones; row menus also change with the class. Storees' registry fields (`domainRegistry.ts`) map naturally to "system" and its `custom_attributes` keys to "custom". `components/ui` holds only Dialog, NumberInput and Skeleton, so add a shared shadcn Sheet rather than another hand-built drawer like the Trials page's.
- **Read-only instead of hidden** (screen 003): MoEngage renders Query Settings with disabled toggles and the hover text "Your role doesn't have the permission to edit this page." Storees removes admin tabs for non-admins (`settings/layout.tsx:33-40`), so managers can't even see how data is configured. Event Mapping already has a "Read only" explanation (`mapping/page.tsx:442-454`), but its API admits only super-admins, who can always edit, so no one sees it today. Make it the shared pattern.
- **Storees is better at impact previews** (screens 045, 048): MoEngage's Block, Turn visibility off and bulk Block act in one click, with no list of the segments, flows or campaigns that use the item. Storees' Event Mapping previews the orders and revenue a save will change, asks for the project name, and shows replay progress (`mapping/page.tsx:237-266, 442-475`). Reuse that pattern when blocking or retyping is built.
- **Internal events** (screens 008, 059): MoEngage keeps its own internal events (Campaign Events Stats, Meta Info…) out of the Events catalog and groups them as "MoEngage Internal Events" in the volume picker. Storees writes `trial_admin_update`, `trial_expired`, `data_erased`, `test_event` and per-customer `flow_fixed_time:<flowId>` / `flow_exit_chain:<flowId>` rows into the tenant's events table, where they appear in segment, flow and analytics pickers and inflate "Total Events". Give them their own class, or a separate table.
- **Freshness and trust** (screen 055): MoEngage's volume modal admits "Data is updated daily at 1:00 am Asia/Kolkata". Storees' volumes are live, but no screen says so. On Storees' nearest screen, Time Series, revenue is formatted with "$" (`analytics/timeseries/page.tsx:85`) although projects default to INR (`db/schema.ts:42`); fix that before demoing it against MoEngage.
- **Column definitions and empty states** (screens 012, 015-018, 040-041): MoEngage puts info icons on the Status, Visibility, 30-day volume, Source and both data-type headers. An empty catalog disables its filters and Download and says "No events have been ingested yet." Storees tables use plain headers (`event-sources/page.tsx:60-68`). A Storees catalog's empty state should link to the Setup snippets and the Event Debugger.
- **A MoEngage slip** (screen 005): Acquisition Tracking's "Know more" opens an unrelated Trackier partner article. Storees relies on inline explanatory copy instead of doc links (for example `DataMaintenance.tsx:62-69`), which avoids broken links but means no deeper docs exist.

### Verification notes

Every row was re-checked against the code at `2063cdc`. No status, priority or effort changed: all 41 rows held (0 ✅, 16 🟡, 20 ❌, 2 ⭐, 3 ➖). The changes below correct or extend evidence and gap text.

- **Analytics user merging (🟡, P2/M): gap widened.** Ingest lookups by external id, email and phone ignore `merged_into` (`customerService.ts:401-457`; `merged_into` is read only in `campaignService.ts` and `identityGraphService.ts`). After a live merge, later events carrying the merged-away profile's identifiers attach to it again, so merges don't stick. Added "make ingest follow `merged_into`" to the recommendation.
- **Real-time event dedup (⭐ kept): caveat widened, one reference fixed.** Tried to refute it: the SDK, pixel, Shopify webhook, history sync and single-event API paths all dedupe at write time, and `publishEvent` runs only after a row is inserted, so the status holds. But inbound hooks key each delivery by its raw row (`inboundWebhookService.ts:393-396`), so a provider retry is stored and published twice; their `ON CONFLICT` only makes Reprocess idempotent. The unique index is at `schema.ts:235`, not 237.
- **Volume data freshness (⭐ kept):** confirmed no cache on the dashboard, analytics or inbound-webhook routes; added the Dashboard trends query as evidence.
- **Delete and merge propagation (🟡):** added that erasure has a UI (DataSubjectCard) and runs on Shopify `customers/redact` (`webhooks.ts:248-268`), while merges have no UI.
- **Role-based edit lock (🟡):** the Event Mapping "Read only" banner is unreachable. `GET /api/event-mapping` requires a super-admin and returns `canEdit: true` to every super-admin (`eventMapping.ts:322, 394`), so no read-only page is live today. The component is still reusable.
- **Acquisition quality metrics (🟡):** UTMs attach to `track()`, `page()` and `session_started` (`core.ts:195-212`), not to identify or property updates, so "every event" was overstated. The fintech, SaaS and custom Acquisition cards show First Seen plus KYC or plan fields, never a source.
- **Android Uninstall Tracking (➖ kept):** kept N/A to match modules 07, 08 and 09 (web-only SDK). Corrected the evidence: the dead-token branch writes `custom_attributes` keys, not the `push_subscribed` column (`fcmProvider.ts:155-161`).
- **Event volume cards and chart modal (🟡):** added the Dashboard "Events" chart (`dashboard/page.tsx:161-179`), which the original evidence missed. Both it and Time Series count Storees' synthetic flow-enrolment rows.
- **Event catalog and quotas (🟡 / ❌):** distinct event names feed every builder picker through `/api/events/names`, not only the Debugger dropdown; analytics pickers use a separate endpoint capped at 200 names.
- **Type filter and Visibility (🟡 / ❌): internal-event list corrected.** `whatsapp_template_recategorised` is inserted with a sentinel customer id that fails the events-to-customers foreign key unless such a row exists, so it is normally skipped (`templateAlertService.ts:32-48`). Added rows the original missed: onboarding `test_event` and the per-customer `flow_fixed_time:<flowId>` and `flow_exit_chain:<flowId>` enrolment rows; a fixed-time flow writes up to 50,000 per run (`flowFixedTimeScheduler.ts:63, 71-85`).
- **Allowed data type pinning (❌):** sharpened the evidence. Range operators on an unregistered key compare a text expression with a bound parameter, so values order as strings ('100' < '20') (`evaluator.ts:878-890`).
- **PII masking per attribute (🟡):** added that name and address are deliberately never masked (`pii.ts:9-10`), though MoEngage's PII tooltip lists both as examples.
- **Storees-only strengths:** corrected the ingestion PII guard's scope. The browser SDK posts every event to `/api/v1/events/batch` (`sdk/src/transport.ts:20`), whose body has no top-level `properties`, so SDK events are never scanned.
- **Missing rows I tried and failed to refute:** searched for blacklist, blocklist, is_blocked and auto_block; hidden or visibility flags on events; columnVisibility and bulk-selection patterns; `text/csv`; `landing_site`, `referring_site` and `source_name`; writers of `first_purchase_at` and `attributed_revenue`; AppsFlyer, Adjust, Branch and Trackier; and project-level `COUNT(DISTINCT event_name)` (the only hit is a per-customer metric in `metricsWorker.ts:578`).
- **Side observation:** two `useEventNames` hooks share the React Query key `['event-names']` but call different endpoints, all names versus the first 200 (`hooks/useEvents.ts:68-72`; `hooks/useAnalytics.ts:87-92`). Whichever loads first fills the other's cache until it refetches.

### Screens

#### Settings navigation (Settings flyout and Settings Home)

![Settings flyout: the Analytics & Segmentation group (Query Settings, Acquisition Tracking, Uninstall Tracking) and the Data group (Data Management)](../screenshots/22-settings-analytics-data-management-004-settings-flyout-analytics-data-sections.jpg)
*Settings flyout: the Analytics & Segmentation group (Query Settings, Acquisition Tracking, Uninstall Tracking) and the Data group (Data Management)*

![Settings Home cards with descriptions for the Analytics & Segmentation and Data sections](../screenshots/22-settings-analytics-data-management-061-settings-home-analytics-data-cards.jpg)
*Settings Home cards with descriptions for the Analytics & Segmentation and Data sections*

#### Query Settings

![Query Settings: Analytics user merging, Real-time event dedup, and Real-time delete and merge propagation (all off)](../screenshots/22-settings-analytics-data-management-001-query-settings.jpg)
*Query Settings: Analytics user merging, Real-time event dedup, and Real-time delete and merge propagation (all off)*

![Title info tooltip: 'Control how MoEngage counts users and events in analytics and segmentation queries...'](../screenshots/22-settings-analytics-data-management-002-query-settings-info-tooltip.jpg)
*Title info tooltip: 'Control how MoEngage counts users and events in analytics and segmentation queries...'*

![Disabled toggle hover: 'Your role doesn't have the permission to edit this page.'](../screenshots/22-settings-analytics-data-management-003-query-settings-toggle-no-permission-tooltip.jpg)
*Disabled toggle hover: 'Your role doesn't have the permission to edit this page.'*

#### Acquisition Tracking

![Acquisition tracking: one toggle (off, disabled), its description, and a disabled Save in the footer](../screenshots/22-settings-analytics-data-management-005-acquisition-tracking.jpg)
*Acquisition tracking: one toggle (off, disabled), its description, and a disabled Save in the footer*

#### Uninstall Tracking

![Uninstall tracking: Android Uninstall Tracking toggle (on), 'Test Android silent push' button, SAVE](../screenshots/22-settings-analytics-data-management-006-uninstall-tracking.jpg)
*Uninstall tracking: Android Uninstall Tracking toggle (on), 'Test Android silent push' button, SAVE*

#### Data Management: Overview tab

![Overview: quota cards (Unique events used 0/512, Unique user attributes used 12/256), auto-blocked counters, Volume cards](../screenshots/22-settings-analytics-data-management-007-dm-overview-usage.jpg)
*Overview: quota cards (Unique events used 0/512, Unique user attributes used 12/256), auto-blocked counters, Volume cards*

![Volume section and 'Top events by volume' bar chart (6 MoEngage internal events), event-type selector, 'Download all'](../screenshots/22-settings-analytics-data-management-008-dm-overview-volume-top-events.jpg)
*Volume section and 'Top events by volume' bar chart (6 MoEngage internal events), event-type selector, 'Download all'*

![Volume month picker: current month to date plus the previous 11 calendar months](../screenshots/22-settings-analytics-data-management-009-dm-overview-volume-month-picker.jpg)
*Volume month picker: current month to date plus the previous 11 calendar months*

![Top events by volume selector: All events / Custom events](../screenshots/22-settings-analytics-data-management-010-dm-overview-top-events-type-dropdown.jpg)
*Top events by volume selector: All events / Custom events*

![Data management title tooltip](../screenshots/22-settings-analytics-data-management-011-dm-title-info-tooltip.jpg)
*Data management title tooltip*

![Card hover: deep-link tooltip 'View unique user attributes' and the definition 'Depicts number of unique user attributes defined in MoEngage'](../screenshots/22-settings-analytics-data-management-053-dm-overview-unique-attributes-card-tooltips.jpg)
*Card hover: deep-link tooltip 'View unique user attributes' and the definition 'Depicts number of unique user attributes defined in MoEngage'*

![Auto-blocked tooltip: attributes are blocked automatically once unique user attributes used reaches 100% of the workspace quota](../screenshots/22-settings-analytics-data-management-054-dm-overview-auto-blocked-quota-tooltip.jpg)
*Auto-blocked tooltip: attributes are blocked automatically once unique user attributes used reaches 100% of the workspace quota*

![Event volume (All events) modal: daily line chart, data-refresh banner, date range, scope selector, Download CSV](../screenshots/22-settings-analytics-data-management-055-dm-event-volume-chart-modal-all-events.jpg)
*Event volume (All events) modal: daily line chart, data-refresh banner, date range, scope selector, Download CSV*

![Chart modal date presets: Last 7 Days, Last Week, Last 30 Days, Last Month, Custom Range](../screenshots/22-settings-analytics-data-management-056-dm-event-volume-chart-date-presets.jpg)
*Chart modal date presets: Last 7 Days, Last Week, Last 30 Days, Last Month, Custom Range*

![Chart scope dropdown: All events, All custom events, All system events, Individual event](../screenshots/22-settings-analytics-data-management-057-dm-event-volume-chart-event-scope-dropdown.jpg)
*Chart scope dropdown: All events, All custom events, All system events, Individual event*

!['Individual event' mode adds a 'Select event' dropdown (modal title changes to 'Event volume (Individual event)')](../screenshots/22-settings-analytics-data-management-058-dm-event-volume-chart-individual-event-mode.jpg)
*'Individual event' mode adds a 'Select event' dropdown (modal title changes to 'Event volume (Individual event)')*

![Searchable event picker grouped under 'MoEngage Internal Events'](../screenshots/22-settings-analytics-data-management-059-dm-event-volume-chart-select-event-dropdown.jpg)
*Searchable event picker grouped under 'MoEngage Internal Events'*

![Event volume (Custom events) modal, opened from the Custom events card with 'All custom events' preselected](../screenshots/22-settings-analytics-data-management-060-dm-event-volume-chart-modal-custom-events.jpg)
*Event volume (Custom events) modal, opened from the Custom events card with 'All custom events' preselected*

#### Data Management: Events tab (event catalog)

![Events tab: usage cards, toolbar (search, Source/Status/Type, advanced filter, Download all), columns, empty state](../screenshots/22-settings-analytics-data-management-012-dm-events-tab-empty.jpg)
*Events tab: usage cards, toolbar (search, Source/Status/Type, advanced filter, Download all), columns, empty state*

!['Events not tracked' period dropdown: 7 days, 30 days, 60 days](../screenshots/22-settings-analytics-data-management-013-dm-events-not-tracked-period-dropdown.jpg)
*'Events not tracked' period dropdown: 7 days, 30 days, 60 days*

!['Events not tracked' info tooltip and the 'View events not tracked' deep-link hover](../screenshots/22-settings-analytics-data-management-014-dm-events-not-tracked-info-tooltip.jpg)
*'Events not tracked' info tooltip and the 'View events not tracked' deep-link hover*

![Status column tooltip: events with status 'Blocked' and 'Auto-blocked' will not be tracked](../screenshots/22-settings-analytics-data-management-015-dm-events-status-column-tooltip.jpg)
*Status column tooltip: events with status 'Blocked' and 'Auto-blocked' will not be tracked*

![Visibility column tooltip: events with visibility 'On' will be available to use in a segment or campaign](../screenshots/22-settings-analytics-data-management-016-dm-events-visibility-column-tooltip.jpg)
*Visibility column tooltip: events with visibility 'On' will be available to use in a segment or campaign*

![30 day volume tooltip: number of times the event was tracked through multiple sources in the last 30 days](../screenshots/22-settings-analytics-data-management-017-dm-events-30-day-volume-tooltip.jpg)
*30 day volume tooltip: number of times the event was tracked through multiple sources in the last 30 days*

![Source tooltip: with multiple values, the first value is the source where data was first ingested from](../screenshots/22-settings-analytics-data-management-018-dm-events-source-column-tooltip.jpg)
*Source tooltip: with multiple values, the first value is the source where data was first ingested from*

![Column chooser: 8 default columns plus optional Type, Tracked data type, Allowed data type, Category, Platform; Select all, Cancel, Apply](../screenshots/22-settings-analytics-data-management-019-dm-events-column-chooser.jpg)
*Column chooser: 8 default columns plus optional Type, Tracked data type, Allowed data type, Category, Platform; Select all, Cancel, Apply*

![Clicking 'Events not tracked' sets the Status filter to Allowed](../screenshots/22-settings-analytics-data-management-020-dm-events-card-quickfilter-not-tracked-allowed.jpg)
*Clicking 'Events not tracked' sets the Status filter to Allowed*

![Clicking 'Auto-blocked events' sets the Status filter to Auto-blocked](../screenshots/22-settings-analytics-data-management-021-dm-events-card-quickfilter-auto-blocked.jpg)
*Clicking 'Auto-blocked events' sets the Status filter to Auto-blocked*

![Clicking 'Unique events used' sets Status = Allowed and Type = Custom](../screenshots/22-settings-analytics-data-management-022-dm-events-card-quickfilter-unique-used-allowed-custom.jpg)
*Clicking 'Unique events used' sets Status = Allowed and Type = Custom*

#### Data Management: User attributes tab (user-attribute catalog)

![User attributes tab: usage cards, toolbar, catalog table (No. of Sessions, Last Seen, First Seen, LTV...)](../screenshots/22-settings-analytics-data-management-023-dm-user-attributes-tab-top.jpg)
*User attributes tab: usage cards, toolbar, catalog table (No. of Sessions, Last Seen, First Seen, LTV...)*

![Catalog mid-scroll: reachability, subscription and consent attributes; Anonymous ID (Partner) has visibility Off](../screenshots/22-settings-analytics-data-management-024-dm-user-attributes-list-scrolled.jpg)
*Catalog mid-scroll: reachability, subscription and consent attributes; Anonymous ID (Partner) has visibility Off*

![Catalog bottom: attributes whose Source is 'File Imports' (ID, Gender, Mobile Number, Email, Contact Level, Name)](../screenshots/22-settings-analytics-data-management-025-dm-user-attributes-list-bottom.jpg)
*Catalog bottom: attributes whose Source is 'File Imports' (ID, Gender, Mobile Number, Email, Contact Level, Name)*

![Source filter, MoEngage group: SDK, Data API, Internal, File Imports](../screenshots/22-settings-analytics-data-management-026-dm-user-attributes-source-dropdown-moengage.jpg)
*Source filter, MoEngage group: SDK, Data API, Internal, File Imports*

![Source filter, Partners group: Segment, Mparticle, Snowflake](../screenshots/22-settings-analytics-data-management-027-dm-user-attributes-source-dropdown-partners.jpg)
*Source filter, Partners group: Segment, Mparticle, Snowflake*

![Status filter: Blocked, Auto-blocked, Allowed](../screenshots/22-settings-analytics-data-management-028-dm-user-attributes-status-dropdown.jpg)
*Status filter: Blocked, Auto-blocked, Allowed*

![Type filter: Standard, Derived, Custom](../screenshots/22-settings-analytics-data-management-029-dm-user-attributes-type-dropdown.jpg)
*Type filter: Standard, Derived, Custom*

!['Filter user attributes' advanced popover (top)](../screenshots/22-settings-analytics-data-management-030-dm-user-attributes-filter-popover-top.jpg)
*'Filter user attributes' advanced popover (top)*

![Full advanced filter: Visibility, Category, Platform, Last seen, First seen, Tracked data type, Allowed data type, PII Masking; Clear all, Cancel, Apply](../screenshots/22-settings-analytics-data-management-031-dm-user-attributes-filter-popover-full.jpg)
*Full advanced filter: Visibility, Category, Platform, Last seen, First seen, Tracked data type, Allowed data type, PII Masking; Clear all, Cancel, Apply*

![Visibility: On / Off](../screenshots/22-settings-analytics-data-management-032-dm-filter-visibility-dropdown.jpg)
*Visibility: On / Off*

![Category (searchable): Lifecycle, Acquisition, Uninstall, Reachability, Localization, Email Suppression Type, Device Data, Tracked Standard Attribute, Tracked Custom Attribute](../screenshots/22-settings-analytics-data-management-033-dm-filter-category-dropdown.jpg)
*Category (searchable): Lifecycle, Acquisition, Uninstall, Reachability, Localization, Email Suppression Type, Device Data, Tracked Standard Attribute, Tracked Custom Attribute*

![Platform: Android, iOS, Web, Windows, Mweb, Webhook, Sms, TV, Unknown](../screenshots/22-settings-analytics-data-management-034-dm-filter-platform-dropdown.jpg)
*Platform: Android, iOS, Web, Windows, Mweb, Webhook, Sms, TV, Unknown*

![Last seen presets: Today, Yesterday, Last 7 Days, Last Week, Last 30 Days, Last Month, Since, Before, Custom Range](../screenshots/22-settings-analytics-data-management-035-dm-filter-last-seen-presets.jpg)
*Last seen presets: Today, Yesterday, Last 7 Days, Last Week, Last 30 Days, Last Month, Since, Before, Custom Range*

![Custom Range: two-month calendar with From/To, Reset, Cancel, Done](../screenshots/22-settings-analytics-data-management-036-dm-filter-last-seen-custom-range-calendar.jpg)
*Custom Range: two-month calendar with From/To, Reset, Cancel, Done*

![Tracked data type: Numeric, Boolean, Date, String, Location, Array String, Array Double, Array Boolean](../screenshots/22-settings-analytics-data-management-037-dm-filter-tracked-data-type-dropdown.jpg)
*Tracked data type: Numeric, Boolean, Date, String, Location, Array String, Array Double, Array Boolean*

![Allowed data type: Any, Numeric, Boolean, Date, String, Location](../screenshots/22-settings-analytics-data-management-038-dm-filter-allowed-data-type-dropdown.jpg)
*Allowed data type: Any, Numeric, Boolean, Date, String, Location*

![PII Masking: On / Off](../screenshots/22-settings-analytics-data-management-039-dm-filter-pii-masking-dropdown.jpg)
*PII Masking: On / Off*

![Tracked data type tooltip: 'Data types of the data received during tracking.'](../screenshots/22-settings-analytics-data-management-040-dm-user-attributes-tracked-data-type-tooltip.jpg)
*Tracked data type tooltip: 'Data types of the data received during tracking.'*

![Allowed data type tooltip: type chosen by a team member; MoEngage will try to typecast tracked data into it](../screenshots/22-settings-analytics-data-management-041-dm-user-attributes-allowed-data-type-tooltip.jpg)
*Allowed data type tooltip: type chosen by a team member; MoEngage will try to typecast tracked data into it*

![Row menu for a derived/system attribute: only 'Edit attribute'](../screenshots/22-settings-analytics-data-management-042-dm-user-attr-row-menu-system-attribute.jpg)
*Row menu for a derived/system attribute: only 'Edit attribute'*

!['Edit attribute details' drawer for a system attribute (No. of Sessions): all fields locked except the Mask attribute toggle](../screenshots/22-settings-analytics-data-management-043-dm-edit-attribute-drawer-system-locked.jpg)
*'Edit attribute details' drawer for a system attribute (No. of Sessions): all fields locked except the Mask attribute toggle*

![Data privacy configuration tooltip: limit access to PII and secure it, with the PII definition and examples](../screenshots/22-settings-analytics-data-management-044-dm-edit-attribute-data-privacy-tooltip.jpg)
*Data privacy configuration tooltip: limit access to PII and secure it, with the PII definition and examples*

![Row menu for a custom attribute (Gender): Edit attribute, Turn visibility off, Block](../screenshots/22-settings-analytics-data-management-045-dm-user-attr-row-menu-custom-attribute.jpg)
*Row menu for a custom attribute (Gender): Edit attribute, Turn visibility off, Block*

![Edit drawer for a custom attribute: Display name, Status, Visibility, Mask attribute, Description, Allowed Data type all editable](../screenshots/22-settings-analytics-data-management-046-dm-edit-attribute-drawer-custom-editable.jpg)
*Edit drawer for a custom attribute: Display name, Status, Visibility, Mask attribute, Description, Allowed Data type all editable*

![Allowed Data type options in the drawer: Any, Numeric, Boolean, Date, String, Location (closed without changing)](../screenshots/22-settings-analytics-data-management-047-dm-edit-attribute-allowed-data-type-dropdown.jpg)
*Allowed Data type options in the drawer: Any, Numeric, Boolean, Date, String, Location (closed without changing)*

![Bulk action bar: '1 user attribute(s) selected: Block, Allow, Visibility On, Visibility Off', Show selected, Clear selection](../screenshots/22-settings-analytics-data-management-048-dm-user-attributes-bulk-action-bar.jpg)
*Bulk action bar: '1 user attribute(s) selected: Block, Allow, Visibility On, Visibility Off', Show selected, Clear selection*

![Search by display/key name ('reach' returns the 5 Reachability attributes)](../screenshots/22-settings-analytics-data-management-049-dm-user-attributes-search-results.jpg)
*Search by display/key name ('reach' returns the 5 Reachability attributes)*

![Filtered empty state (Status = Auto-blocked): 'No user attributes found. Try using a different search term or filter.'](../screenshots/22-settings-analytics-data-management-050-dm-user-attributes-auto-blocked-filter-empty.jpg)
*Filtered empty state (Status = Auto-blocked): 'No user attributes found. Try using a different search term or filter.'*

![Clicking 'Unique user attributes used' sets Status = Allowed and Type = Standard, Custom (12 rows): derived attributes do not count toward the 256 quota](../screenshots/22-settings-analytics-data-management-051-dm-user-attributes-card-quickfilter-unique-used.jpg)
*Clicking 'Unique user attributes used' sets Status = Allowed and Type = Standard, Custom (12 rows): derived attributes do not count toward the 256 quota*

![Row menu for a hidden attribute (Anonymous ID (Partner)): Edit attribute, Turn visibility on, Block](../screenshots/22-settings-analytics-data-management-052-dm-user-attr-row-menu-hidden-attribute-turn-visibility-on.jpg)
*Row menu for a hidden attribute (Anonymous ID (Partner)): Edit attribute, Turn visibility on, Block*
