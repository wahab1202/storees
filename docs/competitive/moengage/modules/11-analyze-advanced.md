## 11. Analyze > Retention, Session & Source, User Paths, Acquisition, Uninstalls

Storees' only counterpart here is the Cohort Retention heatmap (`/analytics/cohorts`), which has first-seen weekly or monthly cohorts and one return event but no audience filter, segment comparison, split-by, chart, custom dates or Save; its default "Any event" mode also counts Storees' own sends as returns, so nothing in this module reaches full parity (0 full, 13 partial, 34 missing, 5 N/A of 52 rows). Session & Source and User Paths have no equivalent, although the SDK already records UTM, referrer and landing page per session and Shopify orders are stitched back to those sessions; install attribution does not apply to a web-only SDK, but uninstall tracking does for the app brands Storees already pushes to. Storees is ahead with its RFM lifecycle grid, segment transitions, predictive churn and repeat-purchase scores, and revenue that needs no goal setup.

### MoEngage overview

These five reports follow Funnels in MoEngage's Analyze flyout (My Studio, Users, Behavior, Funnels, Retention, Session And Source, User Paths, Acquisition, Uninstalls).

- **Shared layout (first three reports).** Retention, Session & Source and User Paths share one builder:
  - collapsible sections, each with a generated one-line summary;
  - one Filter users component (user property, behaviour, affinity, custom segment, nested filters, exclude, and segment comparison on two of the three);
  - one date picker;
  - an explicit APPLY that runs an async query job (POST, poll status, fetch results);
  - chart and table cards, Save to dashboard, a locked "Set alert" upsell, and a YouTube walkthrough per page.
- **Retention** is a cohort builder.
  - A First Event card (cohort entry) and a Return Event card. Each takes several events joined by "+ OR", plus "+ Attributes" filters and copy-between-cards.
  - Three retention types (N-Day, Unbounded, First Occurrence), Split by, and a Duration picker (presets, Since/Before, Custom Range, Last N D/W/M, 365-day cap).
  - Output is a line chart and a table. Transpose, expand and time-range comparison are seen in app code only.
- **Session & Source** reports Conversion Count or Revenue grouped by up to two UTM-style source properties.
  - Source filters offer 10 string operators and a Case Sensitive option.
  - The report is blocked until a Conversion Goal and Revenue attribute are set.
  - Five session metrics (Session Count, Bounce Rate, Avg. Session Duration, Avg. Sessions/User, Avg. Conversions/Session) exist in code but were not offered in this workspace.
- **User Paths** draws a Sankey of event sequences "Starting with" or "Ending with" an event.
  - Controls: a path window (minutes, hours or days), 2-15 steps and a date range.
  - Chart settings (exclude events, resolution, repeated events, split by, node actions, zoom) were seen in app code only.
- **Acquisition** is an older, mobile-app-only report. It attributes installs to a campaign or publisher, with Users, Uninstalls and per-user quality columns.
- **Uninstalls** is also mobile-only. It charts uninstalls over time and by a user attribute, on Users and Events tabs, with Download Chart.
- **Capture caveats.** The workspace had no tracked events, no Conversion Goal, and acquisition and uninstall tracking turned off. Result toolbars, Sankey settings and the Retention table controls were therefore read from the app's JS bundle, not seen working.
  - The capture was read-only. Three transient analysis queries ran and nothing was saved.

**Pages visited**

| Page | URL path |
|---|---|
| Retention | `/v4/analytics/v2/retention` |
| Session And Source | `/v4/analytics/v2/session-source` |
| User Paths | `/v4/analytics/userpaths` (redirects to `/v4/analytics/v2/user-paths`) |
| Acquisition | `/v4/analytics/v2/acquisition` |
| Uninstalls | `/v4/analytics/v2/uninstalls?type=users` and `?type=events` |

### Storees counterpart

- **Cohort Retention** at `/analytics/cohorts` (`packages/frontend/src/app/(dashboard)/analytics/cohorts/page.tsx`).
  - Cohorts come from `customers.first_seen`, weekly or monthly, over 4/6/8/12 periods. The return event is "Any event" or one event name. Output is a heatmap table.
  - API: `GET /api/analytics/cohorts` (`packages/backend/src/routes/analytics.ts:75-91`). Engine: `computeCohorts` (`packages/backend/src/services/analyticsService.ts:219-330`). Hook: `useCohorts` (`packages/frontend/src/hooks/useAnalytics.ts:68-85`).
  - It is reached from a card on the Analytics hub (`packages/frontend/src/app/(dashboard)/analytics/page.tsx:27-33`), not from the hub's Quick Start row. The sidebar has a single Analytics item (`packages/frontend/src/components/layout/Sidebar.tsx:58`).
- **Not present:** a Session & Source report, User Paths, Acquisition (install attribution) or Uninstalls.
- **Related pieces that exist:**
  - **Sessions:** the Time Series "Sessions" metric (`analyticsService.ts:385-387`), the dashboard Sessions and Page Views KPIs (`packages/backend/src/routes/dashboard.ts:279-307`), and per-customer session metrics (`packages/backend/src/workers/metricsWorker.ts:561-620`).
  - **UTM and sessions:** the SDK captures utm_source, medium, campaign, term and content, plus referrer and landing page, per session (`packages/sdk/src/autotrack.ts:108-114,306-340`; `packages/sdk/src/core.ts:200,211`). Every event row keeps `session_id` (`packages/backend/src/db/schema.ts:222`). Shopify orders stitch back to the browsing session through the `storees_sid` cart attribute (`packages/sdk/src/shopifyCart.ts`; `packages/backend/src/services/anonymousSessionService.ts:71`).
  - **Paths:** a two-column Sankey of segment moves at `/analytics/transitions` (`packages/frontend/src/components/analytics/SankeyDiagram.tsx`) and a per-customer journey timeline (`packages/backend/src/services/customerJourneyService.ts`; `packages/frontend/src/components/customers/JourneyTimelineTab.tsx`).
  - **Acquisition:** a Click-to-WhatsApp ad-lead report at `/campaigns/ctwa` (`packages/frontend/src/app/(dashboard)/campaigns/ctwa/page.tsx`; `GET /api/whatsapp/ctwa-attributions`, `packages/backend/src/routes/whatsappAdmin.ts:662-750`). It is reachable only by URL.
  - **Mobile:** there is no mobile SDK (`packages/sdk` and `packages/sdk-react` are web-only). Storees does send native Android and iOS push to FCM tokens supplied by store connectors (`packages/backend/src/services/providers/fcmProvider.ts`; `packages/backend/src/services/connectors/templates/virpanai.ts:115-117`).
- **How it runs:** each report is one live Postgres query per request, cached only in the browser (React Query `staleTime`).

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Retention | First Event (cohort entry event) | "First Event" card with a searchable event picker; a user joins the cohort on the date they first did that event | 🟡 Partial | Entry is fixed to `customers.first_seen` (`analyticsService.ts:248-256`): the earliest known activity or source-created time, merged with LEAST (`customerService.ts:441-444,481,500`). No first-event control in the UI (`cohorts/page.tsx:56-109`) or the API (`routes/analytics.ts:76-91`) | First-purchase cohorts ("buyers by first-order month, % who reorder") are diluted by browsers and leads. `customers.first_order_date` already exists and is maintained (`schema.ts:148`; `customerAggregateWorker.ts:467,484`), so a "First purchase" option is a one-column swap. Any other first event needs MIN(timestamp) per customer plus a picker. | P1 | S |
| Retention | Return Event (one event, or any activity) | "Return Event" card: the action that counts as retained | 🟡 Partial | A single chosen event works: a select of "Any event" plus event names (`cohorts/page.tsx:89-108`), applied as `event_name =` (`analyticsService.ts:239-241`). The default "Any event" has no source filter (`analyticsService.ts:257-266`), so rows Storees writes itself count as returns: `flow_fixed_time:<flowId>` for every audience member of a fixed-time flow (`flowFixedTimeScheduler.ts:74-80`), `flow_exit_chain:*` (`flowExecutor.ts:413-419`) and delivery receipts such as `whatsapp_delivered` and `email_failed` (`messageStatusService.ts:80-89`). The picker is a plain select of the first 200 names A-Z, with no search (`analyticsService.ts:779-788`) | The default view partly measures who Storees messaged, not who came back. Exclude `source = 'system'` rows and outbound receipts (`*_delivered`, `*_failed`) from "Any event", or default to the purchase vocabulary. Add search. | P1 | S |
| Retention | + OR alternative events | "+ OR" adds alternative event rows in First and Return Event | ❌ Missing | `returnEvent` is one string matched with `=` (`analyticsService.ts:226,239-241`); the UI is one select (`cohorts/page.tsx:92-101`) | Accept an array and match with IN, e.g. order_placed OR whatsapp_inbound counts as a return. | P2 | S |
| Retention | + Attributes (event-attribute filters) | Attribute filters on each event (default "is", string, case-insensitive) | ❌ Missing | No property filters in `computeCohorts` (`analyticsService.ts:219-266`) or on the page. The segment engine's event-property predicate (`evaluator.ts:226-240`) is private but wrapped by the exported `compileEventOccurrenceRule` (`evaluator.ts:242-264`) | Reuse that predicate on the first and return events ("reordered in category X", "order value over ₹1,000"). | P2 | S |
| Retention | Copy to return step / Copy to first step | A copy icon copies one card's definition to the other | ❌ Missing | There is no First Event card to copy between (`cohorts/page.tsx:56-109`) | Small convenience; matters only once First Event and attribute filters exist. | P3 | S |
| Retention | Retention type: N-Day (exact period) with daily granularity | Default type: a user counts in period N only if they returned in that exact period; granularity follows the duration (default daily) | 🟡 Partial | Exact-period retention, but by week or month only: toggle at `cohorts/page.tsx:57-73`; period maths at `analyticsService.ts:243-245` (type at line 222) | No D0..Dn view. Low impact for D2C purchase cycles; add "day" to the truncation and period maths. | P3 | S |
| Retention | Retention type: Unbounded | Retained in period N if the user returned in N or any later period | ❌ Missing | Only exact periods are counted (`analyticsService.ts:273-280`); neither the route (`routes/analytics.ts:76-91`) nor the UI offers a retention type | Suits infrequent D2C buyers ("still a customer after N months"). Find each customer's last active period and count those at or beyond N. | P2 | S |
| Retention | Retention type: First Occurrence | Counts only the first time each user does the return event | ❌ Missing | No such variant in `computeCohorts` (`analyticsService.ts:219-330`). Time-to-Event blocks start = end only in the UI (`time-to-event/page.tsx:43`); its query already takes the first later occurrence (`analyticsService.ts:528-536`) | Per cohort, "when do buyers make their second purchase": take each customer's earliest return period. Relaxing the Time-to-Event check gives median time to repeat order almost for free. | P3 | S |
| Retention | Split by (breakdown) | Multi-select over user attributes and attributes common to the chosen events; disabled until the events are valid | ❌ Missing | `GET /api/analytics/cohorts` and `computeCohorts` take no breakdown (`routes/analytics.ts:76-91`). The only breakdown in Storees analytics is Time-to-Event by platform (`analyticsService.ts:604-640`) | Users cannot compare retention by city, acquisition source, first-order category or COD vs prepaid. Add a grouping column and multi-series output. | P2 | M |
| Retention | Duration picker | Today, Yesterday, This Month, Last Month, Since, Before, Custom Range (two-month calendar), Last N D/W/M; default Last 7 Days; reset icon; 365-day cap | 🟡 Partial | The only control is "Periods" (4/6/8/12) counted back from now (`cohorts/page.tsx:75-87`; `analyticsService.ts:231-235`). The API accepts startDate and endDate (`routes/analytics.ts:81-82`), but `useCohorts` never sends them (`useAnalytics.ts:68-85`) | Users cannot pick a specific cohort range such as festive-season cohorts. Connect the shared date picker (Shared row) to the existing parameters. | P1 | M |
| Retention | Filter users by: user property / behaviour (Has Executed / Has Not Executed) / nested filters | "All users" or "Filter users by", with User property, User behavior, + Nested Filter and + Filter | ❌ Missing | Cohorts take no audience filter (`routes/analytics.ts:76-91`; `analyticsService.ts:219-228`), and no analytics page imports `SegmentFilterBuilder`. That builder already supports "performed event at least / at most / exactly N times in the last N days where …" (Has Not Executed = at most 0) and nested groups (`SegmentFilterBuilder.tsx:612-729,1079-1105`), compiled to SQL by `filterToSql` (`evaluator.ts:177-188`) | Users cannot see retention for one audience (WhatsApp opt-ins, COD buyers, one city). Embed the builder and AND its SQL into the cohort query (see the Shared row). | P1 | M |
| Retention | User affinity filter | "User affinity" tab: Has Executed plus an event picker | ❌ Missing | No affinity operator (`FilterOperator` and `EventOccurrenceRule`, `types.ts:550-560,1591-1600`). The closest primitive is the scoped aggregate (SUM/COUNT/AVG over order line items against a threshold, `types.ts:513-548`), with no predominant-value or top-N% mode. "Affinity" appears only in recommendations (`decisioningService.ts:75,216`) | A niche filter type; "performed N times in the last N days" and the scoped aggregate cover most needs. | P3 | M |
| Retention | Custom segment picker | "Custom segment" tab listing saved custom (file or list) segments, e.g. "Test File" | ❌ Missing | No analytics page has a segment picker. Saved segments are rule-based only (`schema.ts:303-309`), with precomputed membership in `customer_segments` (`schema.ts:171-178`); there are no file-upload segments | Analysing a saved segment is the cheapest audience option (join `customer_segments`). File segments belong to the Segments module. | P2 | S |
| Retention | Compare segments ([1], [2] tabs; Copy segment) | "+ Add segment to compare" (Copy [n] Segment / + Add new segment) creates Compare Segments tabs, one result each | ❌ Missing | Output covers one audience (`CohortResult`, `analyticsService.ts:205-213`; table at `cohorts/page.tsx:134-180`). Funnels accept `segmentId` and Time Series `segmentIds`, but both ignore them (`analyticsService.ts:39,341`) | Side-by-side retention (e.g. discount vs full-price first orders) makes a strong demo. Run the cohort query once per segment. | P2 | M |
| Retention | Exclude Users | An "Exclude Users" checkbox opens an exclusion filter block | ❌ Missing | Cohort analytics has no exclusion (`routes/analytics.ts:76-91`). Exclusion audiences exist only for campaigns (`excludeAudienceFilter`, `types.ts:320-321`; `campaigns/create/page.tsx:1323`; `campaigns/[id]/edit/page.tsx:1571`) | Leaves out staff, test or wholesale accounts; cheap once the include filter exists (AND NOT). | P2 | S |
| Retention | Retention chart (line) | A "Retention chart" card above the table; chart_type defaults to line | ❌ Missing | The cohort page has only the heatmap table (`cohorts/page.tsx:134-180`). Recharts is already a dependency (`frontend/package.json:22`), used by Time Series | No curve to show decay at a glance. Add an average line plus one line per cohort. | P2 | S |
| Retention | Retention table | One row per cohort with retention for each period | 🟡 Partial | Heatmap with Cohort, Users and W0..Wn / M0..Mn percentages, a six-step scale and a legend (`cohorts/page.tsx:111-180`; `analyticsService.ts:314-327`). Defects: periods that have not happened yet are filled with zero and shown as "0%" (`analyticsService.ts:317-321`); the window starts mid-period, so the oldest row is a partial cohort (lines 232-235); month offsets use EXTRACT(MONTH FROM AGE()), which drops whole years (line 245). Shows percentages only, no counts | Leave unelapsed cells blank, align the window to period boundaries, compute months as years × 12 + months, and show counts on hover. Fix before demoing next to MoEngage. | P1 | S |
| Retention | Table transpose and expand/collapse | "Transpose" / "Transpose Back" and "Expand table" / "Collapse table" (app code) | ❌ Missing | The table orientation is fixed (`cohorts/page.tsx:134-180`) | Cosmetic. | P3 | S |
| Retention | Time-range comparison on retention | `comparison_timerange` compares with an earlier period; blocked when custom segment comparison is applied | ❌ Missing | None in `computeCohorts` (`analyticsService.ts:219-330`); previous-period comparison exists only in Time Series (`analyticsService.ts:441-483`) | Low value once custom date ranges and segment comparison exist. | P3 | M |
| Retention | Predictive Insights (Sherpa) KPI cards on charts | Charts can show predictive-insight KPI cards (app code) | 🟡 Partial | ML goals for churn, dormancy and repeat purchase exist (`packs/ecommerce.json:179-209`; `predictions/page.tsx:58-92`; XGBoost in `packages/ml/propensity`), but nothing predictive appears on the cohort report | E.g. "% of this cohort at high churn risk". A differentiator more than a parity gap. | P3 | M |
| Retention | Run model and states (APPLY, loading, error, empty, "configuration changed", validation) | APPLY starts an async job and collapses the builder into summaries; "Please wait while the data loads", an event-not-found error, empty-state texts, a "Retention configuration changed" banner, "Please fill all values" | 🟡 Partial | Re-queries on every control change via useQuery (`useAnalytics.ts:68-85`), so results are never stale. "Computing cohorts..." loading and an empty state exist (`cohorts/page.tsx:123-132`). There is no error state: the page reads only `data` and `isLoading` (line 13), so a failed request (thrown at `lib/api.ts:45-53`) shows "No cohort data yet" | Add an error state (the frontend rules require loading, empty and error states). Switch to an explicit Apply once the builder grows. | P2 | S |
| Retention | Set alert | Locked: "Upgrade to Product Analytics to set Alerts." | ❌ Missing | No metric alerts, anomaly detection or threshold rules anywhere (searched alert, anomal, threshold) | MoEngage sells this as an upgrade, so it is low priority. | P3 | L |
| Retention | Save (analysis / to dashboard) | Disabled until a run ("Perform Retention analysis and save it."), then saves the chart or table to a dashboard | ❌ Missing | No Save on the cohort page; only funnels save (`funnels/page.tsx:126-148`, named via `prompt()`). `saved_analyses` already lists "cohort" as a type (`schema.ts:937-948`) and `POST /api/analytics/saved` accepts any type (`routes/analytics.ts:197-216`), but the hub has no cohort link mapping (`analytics/page.tsx:73-78`) | Saving a cohort configuration is small. Pinning it to a dashboard needs custom dashboards (Shared row). | P2 | S |
| Retention | Help: info tooltip, Know more, Watch video | Info tooltip, a "Know more" docs link and a "Retention Analysis Walkthrough" YouTube modal | 🟡 Partial | A "How to read this" panel, a return-event definition and column tooltips (`cohorts/page.tsx:44-53,106-108,147-150`). No docs links or videos anywhere in the frontend (searched know more, learn more, watch video, youtube) | The in-page explainer is arguably better for first-time users, but its "W0 … always 100%" line is wrong (UX notes). Add docs links once public docs exist. | P3 | S |
| Session & Source | Report types: Conversion Count and Revenue by source | Conversion Goal events, or goal revenue, grouped by source property; each option has a hover description and Know more | ❌ Missing | No source or UTM report: the analytics routes cover funnels, cohorts, time series, time-to-event, products, transitions and predictions only (`routes/analytics.ts`). The data is half there: the SDK sends utm_source/medium/campaign/term/content per session (`sdk/src/autotrack.ts:306-340`), adds them to session_started and every track() and page() call (`autotrack.ts:108-114`; `sdk/src/core.ts:200,211`), and events keep `session_id` (`schema.ts:222`). Orders stitch to browsing sessions via `storees_sid` (`anonymousSessionService.ts:71`; `schema.ts:375-389`). There is no sessions table (planned in `docs/MOENGAGE_COMPETITIVE_PLAN.md:372-390`), and Shopify order landing/referring site are not kept (`eventProcessor.ts:335-353`) | Marketers cannot see orders or revenue by UTM source, medium or campaign. Persist session UTM (and Shopify landing/referring site) onto sessions or orders, then group purchases and net revenue by source. | P1 | L |
| Session & Source | Session reports: Session Count, Avg. Session Duration, Avg. Sessions/User | Defined in app code but not offered in this workspace; grouped by source property | 🟡 Partial | Session counts exist, but not by source: the Time Series "Sessions" metric (`analyticsService.ts:385-387`; `timeseries/page.tsx:28-35`) and the dashboard "Sessions (7d)" KPI (`routes/dashboard.ts:283-307`). Per-customer total_sessions, avg_session_duration_ms and pages_per_session (`metricsWorker.ts:561-620`) are never aggregated project-wide | No project-wide average session duration or sessions per user, and nothing by source. Aggregate the SDK session events once source grouping exists. | P2 | S |
| Session & Source | Session reports: Bounce Rate, Avg. Conversions/Session | Defined in app code but not offered in this workspace | ❌ Missing | No web bounce rate or conversions per session. `bounceRate` in `campaignAnalyticsService.ts:83` and `flowAnalyticsService.ts:52` means bounced messages. session_ended already records page_count and duration_ms (`shared/src/eventSchemas.ts:129`) | Bounce rate by landing source is a standard D2C traffic-quality metric and can be computed from existing events. Conversions per session needs the order-to-session link. | P2 | M |
| Session & Source | Prerequisite: Conversion goal and Revenue attribute must be set | Red errors link to General Settings; APPLY stays disabled until fixed | ➖ N/A | No goal setup needed: purchases come from the project's event vocabulary (Event Mapping), and revenue from `orders` with cancelled, returned and refunded orders excluded (`LIVE_ORDERS`; `analyticsService.ts:396-404,732`) | No setup gate to copy. Keep the future source report zero-config. | — | — |
| Session & Source | Source filters (Source, Medium, Campaign, Content, Term, Platform, App Version, SDK Version) | "+ Add Filters" adds a row: property, operator, value, Case Sensitive, delete | ❌ Missing | No report-level source filter. The only workaround is a segment such as "performed session_started where utm_source is X" (`SegmentFilterBuilder.tsx:691-727`; `evaluator.ts:242-264`), and analytics pages cannot use segments. The SDK records `utm_*` plus `$os`, `$device_type` and `$sdk_version` (`sdk/src/events.ts:41-50`); there is no App Version without a mobile SDK | Needed alongside the source report, e.g. medium = whatsapp or campaign contains "diwali". | P2 | S |
| Session & Source | Filter operators (10 string operators) and Case Sensitive | is, is not, contains, does not contain, starts with, ends with, does not start with, does not end with, exists, does not exist; Case Sensitive checkbox | 🟡 Partial | Event-property filters offer is, is not, contains, greater/less than and is true/false (`SegmentFilterBuilder.tsx:622-627`; `evaluator.ts:226-240`). begins_with and ends_with exist only for customer-attribute and line-item scope rules (`evaluator.ts:471-472,578-579`). Missing on events: does not contain, starts/ends with and their negations, exists / does not exist, and a case toggle ("is" is exact, "contains" is case-insensitive) | Add the missing string operators and the exists checks to the shared event-property predicate. | P3 | S |
| Session & Source | Group by source properties (Max 2) | "Source property" chips, maximum 2 (a third drops the oldest); summary "Report Grouped by Source and Medium for Last 7 Days" | ❌ Missing | Storees analytics cannot group by a property; the only breakdown is Time-to-Event by platform (`analyticsService.ts:604-640`). UTM values live only inside `events.properties` | A source × medium (or campaign) table is the core of this report. | P1 | M |
| Session & Source | Duration, Filter users (compare, exclude) and chart + table output | The same Duration picker and Filter users component as Retention; chart and table cards with empty states | ❌ Missing | The report does not exist, and analytics also lacks the shared date picker and audience filter (Shared rows) | Comes with the source report plus the shared components. | P2 | M |
| Session & Source | Set alert, Save and Help | Set alert locked behind an upgrade; Save disabled until a run; "Session and Source Analysis Walkthrough" video; Know more | ❌ Missing | Nothing to save or alert on. Saved analyses are used only by funnels (`routes/analytics.ts:176-230`; `funnels/page.tsx:126-175`); no alerts or help videos exist | Follows the source report; low priority on its own. | P3 | S |
| User Paths | Path anchor: Starting with / Ending with an event (+ Attributes) | Path type plus one optional anchor event with "+ Attributes"; APPLY works even with no event | ❌ Missing | No path analysis (searched user path, path finder, userPaths, event sequence, next event, LEAD/LAG over event_name). Planned only in docs (`docs/MOENGAGE_COMPETITIVE_PLAN.md:20,98`). Closest: one customer's journey timeline (`customerJourneyService.ts:20-60`; `routes/customers.ts:741`) | No aggregate view of what shoppers do after product_viewed or before order_placed. Build a sequence query over each session's events (`events.session_id` exists) within a path window, plus a multi-step chart. | P2 | L |
| User Paths | Path window, steps (2-15) and date range | Window as a number plus Minutes/Hours/Days (default 4 Hours); 2-15 steps (default 5); date presets (default Yesterday); validations such as "Path window cannot exceed date range" | ❌ Missing | No path engine (previous row); no analytics control below day level | Part of the paths build. | P2 | S |
| User Paths | Filter users (no segment compare) | "All users" / "Filter users by" and "Exclude Users"; no "+ Add segment to compare" | ❌ Missing | No paths report and no analytics audience filter (Retention "Filter users by" row) | Comes with the shared audience filter. | P3 | S |
| User Paths | Sankey chart and settings | (App code) Repeated events Show/Hide; Exclude events; Resolution 10% to 0.1%; Split by up to 5 event attributes and date parts; node Actions menu; Add/Remove step; Zoom and full screen; drop-off and "others" nodes | ❌ Missing | The only Sankey is a two-column SVG for segment transitions, with left and right nodes built from SegmentTransition pairs (`components/analytics/SankeyDiagram.tsx`). No multi-step layout, drop-off or "others" nodes, exclusions or zoom | The transitions Sankey could be extended to N columns; "others" grouping, drop-off nodes and node actions are new work. | P2 | M |
| User Paths | Run states, Save and Help | "Building user paths…", then the chart or "No data available to render a chart"; Save after a run; walkthrough video; no Set alert | ❌ Missing | No paths report (Path anchor row) | Follows the paths build. | P3 | S |
| Acquisition | Install attribution report (Analysis By Campaign / Publisher; Platform All/Android/iOS; Show Installs Between; APPLY) | Mobile-app installs attributed to an acquisition campaign or publisher | ➖ N/A | No mobile SDK (`packages/sdk` is web; `packages/sdk-react` peers on react-dom) and no MMP integration (no install_referrer, AppsFlyer, Adjust or Branch code). Connector-fed app brands send customers, orders and an `fcm_token`, but no install source (`connectors/templates/virpanai.ts:97-117`) | Not relevant to Shopify web stores without an app SDK or MMP. The web and WhatsApp equivalents are the source report and the per-source row below. | — | — |
| Acquisition | Acquisition table: Users, Uninstalls, Uninstalls/User | Install and uninstall counts per acquisition source (sample: Organic, 3 users, 3 uninstalls, 100%) | ➖ N/A | Needs an install source per user, which Storees never receives (previous row) | Not relevant without install attribution. | — | — |
| Acquisition | Per-source quality metrics: Conversions/User, Sessions/User, Revenue/User | Per acquisition source; sortable Source column; "(null)" when the goal or revenue attribute is unset; no drill-down | 🟡 Partial | The only per-source report is CTWA (`campaigns/ctwa/page.tsx`; `routes/whatsappAdmin.ts:662-750`): Leads, Engaged %, Converted % and Revenue per Meta ad. `first_purchase_at` and `attributed_revenue` are read but written nowhere, so Converted and Revenue always show 0, and the page has no nav link. Customers have no stored first-touch web source: SDK UTM lives in sessionStorage for one session (`sdk/src/autotrack.ts:306-340`), and the profile "Acquisition" card shows First Seen plus vertical-specific fields (`UserInfoTab.tsx:143-205`) | D2C teams want customers grouped by first-touch source, campaign or CTWA ad, with orders, revenue and sessions per customer. Stamp the first-touch UTM onto the customer at identify or first order, and populate the CTWA conversion and revenue columns. | P2 | M |
| Acquisition | "Acquisition tracking is turned off" banner | Links to Settings > Analytics & Segmentation > Acquisition Tracking | ➖ N/A | Storees does not track app installs, so there is no such setting | Nothing to replicate. | — | — |
| Uninstalls | Users / Events tabs | Tabs switch between uninstalled-user counts (`?type=users`) and uninstall events (`?type=events`) | ❌ Missing | Storees logs no uninstall events (next row) | Comes free once the uninstall event exists: COUNT DISTINCT customer vs COUNT. | P3 | S |
| Uninstalls | Uninstall By Time (Daily/Weekly/Monthly; Platform; Date Range; column chart with hover tooltip) | Column chart "Daily Uninstalls Users: N / Between …"; refreshes on every filter change, no APPLY | ❌ Missing | Storees already pushes to native apps through connector-supplied FCM tokens (`virpanai.ts:115-117`): Android and APNs payloads with `FLUTTER_NOTIFICATION_CLICK` (`fcmProvider.ts:130-139`), and campaigns target android, ios or web (`shared/src/types.ts:192`). It detects the uninstall signal (UNREGISTERED / NOT_FOUND) but only clears the token and sets push_subscribed = false, logging no event (`fcmProvider.ts:152-162`) | For app-push brands, log an `app_uninstalled` (token unregistered) event with platform, then chart it by day, week or month. MoEngage's uninstall tracking relies on the same push signal. | P3 | S |
| Uninstalls | Uninstall By Attribute (LTV, City, Gender, …; Platform; Date Range; bar chart) | Bar chart of uninstalls by a chosen user attribute, with an (EMPTY) bucket | ❌ Missing | No uninstall events, and analytics cannot break down by a user attribute (Retention "Split by" row) | Once the event exists, reuse a generic attribute breakdown. | P3 | M |
| Uninstalls | Download Chart | A "Download Chart" button on each uninstall chart | ❌ Missing | No analytics report downloads as an image or CSV (searched toPng, html2canvas, Blob, text/csv, Content-Disposition, download). The only file exports are the segment ad-audience CSV (`ExportAudienceButton.tsx:52`), the DSAR customer JSON (`useDataSubject.ts:39-43`) and a consent-audit CSV (`routes/v1Onboarding.ts:921`) | A gap on every report: no PNG or CSV export for decks, agencies or finance teams. | P2 | S |
| Uninstalls | "Configure uninstall settings" banner | Links to `/settings-v2/analytics-data/uninstall` | ➖ N/A | A dead-token signal needs no configuration; Storees sees it on every push send (`fcmProvider.ts:152-162`) | Nothing to replicate. | — | — |
| Shared | Accordion builder sections with auto-generated one-line summaries | Each section collapses to a generated summary ("Analysis for N-Day Retention for Last 7 Days", "Showing retention analysis for: All Users"); APPLY collapses them all | ❌ Missing | Each analytics page has one inline control bar with fixed helper text (`cohorts/page.tsx:56-109`; `timeseries/page.tsx`); no collapsible sections and no generated summary. The segment builder already generates text summaries (`filterSummary`, `SegmentFilterBuilder.tsx:1175`) | Adopt this pattern once the builders grow (first and return events, filters, compare, split by). | P3 | S |
| Shared | One shared "Filter users" component on every report | The same component (user property, behaviour, affinity, custom segment, nested filters, exclude, compare) on Retention, Session & Source and User Paths | ❌ Missing | Analytics never uses `SegmentFilterBuilder`; it is used in segments, campaigns (include and exclude, `campaigns/[id]/edit/page.tsx:1464,1571`) and flows (`StructuredFlowBuilder.tsx:1018`). The funnel and time-series segment parameters are ignored (`analyticsService.ts:39,341`) | Build it once (filter to SQL via `scopedFilterSqlForProject`, `projectVocabulary.ts:501`) and apply it to cohorts, funnels, time series, time-to-event and the future source and path reports. Closes the Retention "Filter users by" row. | P1 | M |
| Shared | One shared date picker | The same picker on every report: presets, Since/Before, Custom Range calendar, Last N D/W/M, reset, 365-day cap | 🟡 Partial | Every report uses fixed presets: cohorts 4/6/8/12 periods (`cohorts/page.tsx:75-87`); funnels and time series 7/14/30/90 days (`funnels/page.tsx:183-190`; `timeseries/page.tsx:37-42`); the dashboard a local 7/14/30-day toggle (`dashboard/page.tsx:381`). `components/ui` has no calendar or range component and there is no date library; native date inputs appear only outside analytics (debugger, segment builder, campaign scheduling) | Build one DateRangePicker and reuse it on every report; the backends already accept start and end dates. Closes the Retention Duration row. | P1 | M |
| Shared | Save-to-dashboard | Save puts a chart or table on a dashboard (Retention, Session & Source, User Paths) | ❌ Missing | The home dashboard has a fixed layout and there is no dashboard or widget table (`/widgets` holds on-site opt-in widgets). Saved analyses exist only for funnels, and hub links open the builder without loading the saved settings (`analytics/page.tsx:73-78,164-182`) | Custom dashboards are a larger, cross-module gap (Dashboards module). | P2 | XL |
| Shared | Async query jobs (POST, poll status, fetch results) | `POST /api/analytics/v4/<type>`, then `GET /query/{id}/status` and `/results` | 🟡 Partial | Results arrive, but synchronously: each report is one live Postgres query per request (e.g. `routes/analytics.ts:76-91` → `analyticsService.ts:247-289`), cached only in the browser (`useAnalytics.ts:79-84`, staleTime 120 s). No job queue, server cache or statement timeout (searched statement_timeout) | Fine at current Shopify D2C volumes. Heavy path and source queries on large tenants will need async jobs or pre-aggregation; BullMQ is already in the stack. | P3 | M |

### Storees-only strengths

- **RFM lifecycle grid with retention tactics** on `/segments`. A 3×3 Recency × Value grid (Champions to Lost) shows counts, %, suggested retention actions and a Returning % metric (`packages/segments/src/lifecycle.ts:23-193`, returning_pct at line 105). Tabs: RFM Model, User Transitions, Recency, Frequency, Monetary (`packages/frontend/src/components/segments/LifecycleChart.tsx:24`). D2C marketers act on this view directly; MoEngage's Retention page gives only cohort curves.
- **Segment transitions with a Sankey** at `/analytics/transitions` (`SankeyDiagram.tsx`; `packages/backend/src/services/transitionService.ts`). It shows how many customers moved between lifecycle segments (e.g. Loyal to At Risk) between two snapshots, a view MoEngage did not show in these reports.
  - Caveat: "Create Flow" pushes `/flows/new`, which has no page and falls into `flows/[id]` with "new" as the flow id (`transitions/page.tsx:59`).
- **Predictive retention goals** (churn, dormancy, repeat purchase). Every customer gets a score from XGBoost with isotonic calibration (`packages/ml/propensity`), with AUC, buckets and segment filters (`predictions/page.tsx:58-92`; `packages/backend/src/packs/ecommerce.json:179-209`). MoEngage's cohort table only describes past retention.
- **Zero-config conversions and net revenue.** Purchases come from the project's event vocabulary, and revenue from `orders` with cancelled, returned and refunded orders excluded (`analyticsService.ts:396-404,698-760`; `projectVocabulary.ts`). MoEngage's Session & Source will not run until a Conversion Goal and Revenue attribute are configured (screenshots 028, 030), so a Storees source report could work on day one.
- **Shopify checkout-to-browsing-session stitching.** The `storees_sid` and `storees_did` cart attributes (`packages/sdk/src/shopifyCart.ts`) link real Shopify orders, including third-party checkouts such as Shopflo, back to the anonymous web session (`eventProcessor.ts:62-73`; `anonymousSessionService.ts:71`). This is the groundwork for attributing order revenue to that session's UTM source.
- **Per-customer unified journey timeline.** One customer's events, campaign sends, opens and clicks, flow entries and exits, segment joins, orders and messages in one timeline (`customerJourneyService.ts:20-60`; `routes/customers.ts:741`; `JourneyTimelineTab.tsx`). MoEngage's User Paths is aggregate-only and leaves out campaign and flow touches.
- **Click-to-WhatsApp (CTWA) ad lead report** at `/campaigns/ctwa`. It shows leads and engaged % per Meta ad, for the acquisition channel that matters for India D2C; MoEngage's Acquisition page covers only mobile-app installs.
  - Caveat: Converted and Revenue are never written, so they always show 0, and the page is not linked in navigation.
- **Time-to-Event analysis.** Median, p75 and p90 time between two different events (e.g. product_viewed to order_placed), with a duration histogram and a platform breakdown (`time-to-event/page.tsx`; `analyticsService.ts:509-652`). MoEngage's User Paths shows sequences but not this timing.

### UX notes

- **Builder layout.** MoEngage splits Retention into three collapsible sections (Events & filters, Filter Users, Retention Options). Each has a generated one-line summary, and APPLY collapses everything so the chart gets the screen (screenshots 001, 026).
  - Storees' cohort page is one inline control bar that re-queries on every change (`cohorts/page.tsx:56-109`; `useAnalytics.ts:68-85`). That is faster for today's three controls.
  - Once First Event, OR and attribute filters, an audience filter, compare and split-by arrive, adopt the collapsible sections, summaries and an explicit Apply, so expensive queries don't run on every change.
- **Output.** MoEngage pairs a line "Retention chart" with the "Retention table"; Storees shows only the heatmap (`cohorts/page.tsx:134-180`).
  - Add a Recharts retention curve (average plus one line per cohort) above the table.
  - Keep Storees' "How to read this" panel, heat legend and column tooltips (`cohorts/page.tsx:44-53,111-120,147-150`). They explain the table better than MoEngage's link-out "Know more" and "Watch video" (screenshots 020, 025).
- **Cohort correctness: fix before demoing next to MoEngage.**
  - (a) Periods that have not happened yet are filled with zero (`analyticsService.ts:317-321`) and render as "0%", so the newest cohorts look fully churned. Show them blank or as "–".
  - (b) The explainer and the W0 tooltip say W0 is "always 100% by definition" (`cohorts/page.tsx:49,148`). That is false whenever a specific return event is chosen. It is not guaranteed even for "Any event", because `first_seen` can be a source system's created-at date with no event in that week (`customerService.ts:441-444`).
  - (c) The page reads only `data` and `isLoading` (`cohorts/page.tsx:13`), so an API error shows "No cohort data yet".
  - (d) The window starts at now − N×7 or N×30 days (`analyticsService.ts:232-235`), so the oldest row is cut off mid-period and looks small.
  - (e) Monthly periods use EXTRACT(MONTH FROM AGE()) (`analyticsService.ts:245`), which ignores whole years. With 12 monthly periods, activity in the 13th calendar month is counted in M0.
  - (f) New in this verification: the default "Any event" counts rows Storees writes itself.
    - A `flow_fixed_time:<flowId>` row for every audience member each time a fixed-time flow fires (`flowFixedTimeScheduler.ts:74-80`).
    - `flow_exit_chain:*` rows (`flowExecutor.ts:413-419`).
    - Delivery receipts such as `whatsapp_delivered` and `email_failed` (`messageStatusService.ts:80-89`).
    - A store that messages its whole base weekly will see "retention" that tracks its send reach.
- **Date range.** MoEngage reuses one picker on every report: Today, Yesterday, This Month, Last Month, Since, Before, Custom Range (two-month calendar with Reset, Cancel and Done) and Last N D/W/M, plus a reset icon and a 365-day cap (screenshots 017-019).
  - Storees has fixed presets on each page: cohorts 4/6/8/12 periods, funnels and time series 7/14/30/90 days, and the dashboard's local 7/14/30-day toggle. There is no shared date-range component.
  - One shared DateRangePicker would close this on every report. The cohort API already accepts startDate and endDate (`routes/analytics.ts:81-82`).
- **Audience filter.** MoEngage's "Filter Users" block appears on Retention and Session & Source (screenshots 007, 013, 014). It offers User property, User behavior, User affinity and Custom segment tabs, nested filters, Exclude Users, and segment comparison as [1]/[2] tabs.
  - Storees already has a more capable builder. SegmentFilterBuilder supports "performed event N times in the last N days where …", scoped aggregate conditions and nested groups, and is used for segments, campaign include and exclude audiences, and flows, but on no analytics page.
  - Adding it to cohorts, plus a "use saved segment" picker, is the cheapest way to match MoEngage. Comparing two segments side by side as heatmaps or curves would make a strong demo.
- **Event picker.** MoEngage's searchable "Select an event" picker with "+ OR" and "+ Attributes" (screenshots 003, 005, 024) copes with large event catalogs.
  - Storees uses a plain select of the first 200 event names A-Z with no search, OR or property filters (`cohorts/page.tsx:92-101`; `analyticsService.ts:779-788`). The list also includes Storees' own names such as `flow_fixed_time:<flowId>`, `flow_exit_chain:<flowId>` and the receipt events.
  - Reuse the segment builder's "Custom event name…" and "+ Property filter" controls (`SegmentFilterBuilder.tsx:661-727`), and hide system event names from analytics pickers.
- **Navigation.** MoEngage lists every Analyze report in a sidebar flyout. Storees has a single "Analytics" item (`Sidebar.tsx:58`) that opens a hub of cards.
  - Cohorts is missing from the hub's Quick Start row (`analytics/page.tsx:100-121`).
  - Saved items in the hub open the builder without loading the saved settings (`analytics/page.tsx:73-78,164-182`).
  - A sub-nav or flyout would put each report one click away.
- **Session & Source setup.** MoEngage blocks the report with red "Conversion goal not set" or "Conversion goal & Revenue attribute are not set" errors, and APPLY stays disabled until App Settings are filled (screenshots 028, 030).
  - Storees can ship its source report with no setup, because purchases and revenue already come from Shopify orders and the project's event vocabulary. Use that as a sales point.
  - Copy MoEngage's compact "Source property (Max 2)" chips and the generated summary "Report Grouped by Source and Medium for Last 7 Days" (screenshot 035).
- **Acquisition and Uninstalls.** These are MoEngage's older, mobile-only pages (screenshots 058, 066, 072): breadcrumb "Analytics >", no Save or alerts, and banners pointing to settings. The Uninstalls info tooltip even repeats the Acquisition text.
  - For Shopify web stores, the useful equivalent is a web and WhatsApp acquisition view (first-touch UTM plus CTWA ad) inside the source report. The existing CTWA page should be linked from navigation and have its conversion and revenue columns filled in.
  - For brands whose apps Storees already pushes to, logging FCM dead tokens as uninstall events gives a cheap uninstall trend. MoEngage derives uninstalls from the same push signal.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status. Missing and partial rows were searched under synonyms:
- retention, cohort, first_seen, first_order_date, returning, repeat;
- utm, referrer, landing_site, referring_site, source_name, customerJourneySummary, session_id, sessions table, anonymous_sessions;
- user path, path finder, pathfinder, sequence, next event, LEAD/LAG, Sankey;
- affinity, aggregate, predominant, segmentId(s), SegmentFilterBuilder, customer_segments, exclude, compare;
- DateRange, DatePicker, Calendar, `type="date"`, date-fns, dayjs;
- export, csv, Blob, toPng, html2canvas, Content-Disposition;
- alert, anomaly, threshold, statement_timeout, cache;
- install, uninstall, install_referrer, AppsFlyer, Adjust, Branch, fcm_token, UNREGISTERED, react-native;
- ctwa, first_purchase_at, attributed_revenue;
- know more, learn more, watch video, youtube.

The two Full rows were checked for a UI route, an API endpoint and a real engine. Not-applicable rows were checked against what Storees actually sends and receives. Six statuses changed (46 of 52 held), and several evidence or gap cells were corrected.

**Status changes**

- **Return Event: ✅ Full → 🟡 Partial (P1 S).** A single chosen return event works end to end. But the default "Any event" has no source filter, so Storees' own rows count as returns: `flow_fixed_time:*` written for every audience member of a fixed-time flow (up to 50,000 per fire), `flow_exit_chain:*`, and delivery receipts (`*_delivered`, `*_failed`). The page's own copy promises "any activity". The picker also lists only the first 200 names A-Z, with no search.
- **Retention table: ✅ Full → 🟡 Partial (P1 S).** The table renders, but its numbers are misleading in three places: unelapsed periods show "0%", the oldest cohort is truncated because the window starts mid-period, and monthly offsets wrap after 12 months (EXTRACT(MONTH FROM AGE())). It also shows percentages without counts.
- **Uninstalls: Users / Events tabs (➖ N/A → ❌ Missing, P3 S), Uninstall By Time (➖ N/A → ❌ Missing, P3 S) and Uninstall By Attribute (➖ N/A → ❌ Missing, P3 M).** The premise "not relevant without native apps" does not hold.
  - Storees already sends native Android and iOS push to FCM tokens supplied by store connectors: the VirpanAI template maps `fcm_token`, and the FCM payload carries `android` (with `FLUTTER_NOTIFICATION_CLICK`) and `apns` blocks. Campaigns can target android, ios or web.
  - It already receives the uninstall signal (UNREGISTERED / NOT_FOUND), but only clears the token.
  - An uninstall trend is therefore relevant and cheap for those brands. The settings banner stays N/A, because the dead-token signal needs no configuration.
- **Accordion builder sections with summaries: 🟡 Partial → ❌ Missing (P3 S).** No analytics page has collapsible sections or a generated summary. Fixed helper text under a control bar is not this feature.

**Evidence and gap corrections (status unchanged)**

- **First Event:** `customers.first_order_date` already exists and is maintained by the aggregate worker, so first-purchase cohorts are a one-column swap. Only an arbitrary first event needs MIN(timestamp).
- **First Occurrence:** Time-to-Event rejects start = end only in the UI (`time-to-event/page.tsx:43`). The backend already takes the first later occurrence, so time to repeat order is nearly free.
- **+ Attributes:** the private event-property predicate is already reachable through the exported `compileEventOccurrenceRule`.
- **Source filters:** the `$os`, `$device_type` and `$sdk_version` properties are set in `packages/sdk/src/events.ts:41-50`, not in `context.ts`.
- **Filter operators:** begins_with and ends_with exist for customer-attribute rules and line-item scope filters (`evaluator.ts:471-472,578-579`), not only for customer attributes as cited (468-472).
- **Report types (Session & Source):** events already store `session_id` as a column (`schema.ts:222`), so session UTM can be joined to stitched orders before any new sessions table exists. Shopify order payloads keep only order_id, total, discount, item_count and line_items (`eventProcessor.ts:335-353`).
- **Download Chart:** besides the segment ad-audience CSV, there are a DSAR customer JSON export and a consent-audit CSV. None of them is a report export.
- **Shared date picker:** native date inputs also appear in the segment builder and campaign scheduling, not only the Event Debugger. The dashboard has its own 7/14/30-day toggle.
- **User affinity:** the closest existing primitive is the scoped aggregate rule (SUM, COUNT or AVG over order line items against a threshold), which has no predominant-value or top-N% mode.
- **Save (Retention):** the hub's saved-item link map has no "cohort" entry, so a saved cohort would open `/analytics`.
- **Install attribution (still N/A):** the reasoning is now "no app SDK and no MMP integration; connector-fed app brands send no install source", rather than "no native apps".

**Confirmed as stated**

- The CTWA Converted and Revenue columns are never written anywhere.
- Funnel `segmentId` and time-series `segmentIds` are accepted, then ignored.
- There is no path engine, no metric alerts, no custom dashboards, no file-upload segments and no server-side analytics cache.
- `/flows/new` has no page.
- The SDK is web-only.

### Screens

#### Retention

![Retention builder default state: First/Return Event, Filter Users, Retention Options (N-Day, Last 7 Days)](../screenshots/11-analyze-advanced-001-retention-top.jpg)
*Retention builder default state: First/Return Event, Filter Users, Retention Options (N-Day, Last 7 Days)*

![Retention chart and Retention table empty states](../screenshots/11-analyze-advanced-002-retention-chart-table-empty.jpg)
*Retention chart and Retention table empty states*

![First Event searchable event picker, empty (no tracked events)](../screenshots/11-analyze-advanced-003-retention-first-event-picker-empty.jpg)
*First Event searchable event picker, empty (no tracked events)*

![Validation state: 'Please fill all values' on both event cards](../screenshots/11-analyze-advanced-004-retention-validation-fill-all-values.jpg)
*Validation state: 'Please fill all values' on both event cards*

![+ OR adds an alternative event row inside First Event](../screenshots/11-analyze-advanced-005-retention-first-event-or-row.jpg)
*'+ OR' adds an alternative event row inside First Event*

![Filter Users expanded: \[1\] Segment, + Add segment to compare, All users / Filter users by, Exclude Users](../screenshots/11-analyze-advanced-006-retention-filter-users-options.jpg)
*Filter Users expanded: \[1\] Segment, + Add segment to compare, All users / Filter users by, Exclude Users*

![Filter users by: User property / User behavior / User affinity / Custom segment, Has Executed, + Nested Filter, + Filter](../screenshots/11-analyze-advanced-007-retention-filter-users-by-behavior.jpg)
*Filter users by: User property / User behavior / User affinity / Custom segment, Has Executed, + Nested Filter, + Filter*

![Behavior operator: Has Executed / Has Not Executed](../screenshots/11-analyze-advanced-008-retention-has-executed-dropdown.jpg)
*Behavior operator: Has Executed / Has Not Executed*

![User property attribute picker (Lifecycle, Acquisition, Uninstall, Reachability, Localization, Device Data, ...)](../screenshots/11-analyze-advanced-009-retention-user-property-attributes.jpg)
*User property attribute picker (Lifecycle, Acquisition, Uninstall, Reachability, Localization, Device Data, ...)*

![User affinity filter (Has Executed + event picker)](../screenshots/11-analyze-advanced-010-retention-user-affinity.jpg)
*User affinity filter (Has Executed + event picker)*

![Custom segment picker (lists 'Test File')](../screenshots/11-analyze-advanced-011-retention-custom-segment-picker.jpg)
*Custom segment picker (lists 'Test File')*

![Add segment to compare menu: Copy \[1\] Segment (disabled), + Add new segment](../screenshots/11-analyze-advanced-012-retention-add-segment-to-compare-menu.jpg)
*Add segment to compare menu: Copy \[1\] Segment (disabled), + Add new segment*

![Compare Segments: \[1\] Segment and \[2\] Segment tabs](../screenshots/11-analyze-advanced-013-retention-compare-segments-tabs.jpg)
*Compare Segments: \[1\] Segment and \[2\] Segment tabs*

![Exclude Users checked: exclusion filter block](../screenshots/11-analyze-advanced-014-retention-exclude-users.jpg)
*Exclude Users checked: exclusion filter block*

![Retention type options: Unbounded, N-Day, First Occurrence](../screenshots/11-analyze-advanced-015-retention-type-dropdown.jpg)
*Retention type options: Unbounded, N-Day, First Occurrence*

![Unbounded selected; summary 'Analysis for Unbounded Retention for Last 7 Days'; Split by disabled](../screenshots/11-analyze-advanced-016-retention-options-unbounded.jpg)
*Unbounded selected; summary 'Analysis for Unbounded Retention for Last 7 Days'; Split by disabled*

![Duration presets: Today, Yesterday, This Month, Last Month, Since, Before, Custom Range, Last N D/W/M](../screenshots/11-analyze-advanced-017-retention-duration-presets.jpg)
*Duration presets: Today, Yesterday, This Month, Last Month, Since, Before, Custom Range, Last N D/W/M*

![Custom Range two-month calendar with From/To, Reset, Cancel, Done](../screenshots/11-analyze-advanced-018-retention-duration-custom-range.jpg)
*Custom Range two-month calendar with From/To, Reset, Cancel, Done*

![Since note: analysis duration cannot exceed 365 days; end date auto-set](../screenshots/11-analyze-advanced-019-retention-duration-since-note.jpg)
*'Since' note: analysis duration cannot exceed 365 days; end date auto-set*

![Retention info tooltip](../screenshots/11-analyze-advanced-020-retention-info-tooltip.jpg)
*Retention info tooltip*

![Set alert locked: 'Upgrade to Product Analytics to set Alerts. Know more.'](../screenshots/11-analyze-advanced-021-retention-set-alert-upgrade-tooltip.jpg)
*Set alert locked: 'Upgrade to Product Analytics to set Alerts. Know more.'*

![Save disabled: 'Perform Retention analysis and save it.'](../screenshots/11-analyze-advanced-022-retention-save-disabled-tooltip.jpg)
*Save disabled: 'Perform Retention analysis and save it.'*

![First Event copy icon tooltip: 'Copy to return step'](../screenshots/11-analyze-advanced-023-retention-copy-to-return-step-tooltip.jpg)
*First Event copy icon tooltip: 'Copy to return step'*

![Return Event copy icon tooltip: 'Copy to first step'](../screenshots/11-analyze-advanced-077-retention-copy-to-first-step-tooltip.jpg)
*Return Event copy icon tooltip: 'Copy to first step'*

![After injecting a placeholder event (local state only), + Attributes appears for event-attribute filters](../screenshots/11-analyze-advanced-024-retention-placeholder-event-attributes-link.jpg)
*After injecting a placeholder event (local state only), '+ Attributes' appears for event-attribute filters*

![Watch video modal: 'Retention Analysis Walkthrough' (YouTube)](../screenshots/11-analyze-advanced-025-retention-watch-video-modal.jpg)
*Watch video modal: 'Retention Analysis Walkthrough' (YouTube)*

![After APPLY: accordions collapse to summaries; 'Please wait while the data loads'](../screenshots/11-analyze-advanced-026-retention-apply-loading-collapsed.jpg)
*After APPLY: accordions collapse to summaries; 'Please wait while the data loads'*

![Error state with placeholder events: 'The event or attribute required for this analysis could not be located...'](../screenshots/11-analyze-advanced-027-retention-event-not-found-error.jpg)
*Error state with placeholder events: 'The event or attribute required for this analysis could not be located...'*

#### Session And Source

![Session and source default: Report type Conversion Count, conversion-goal error, Source property (Max 2), Last 7 Days](../screenshots/11-analyze-advanced-028-session-source-top.jpg)
*Session and source default: Report type Conversion Count, conversion-goal error, Source property (Max 2), Last 7 Days*

![Report type options offered: Conversion Count, Revenue](../screenshots/11-analyze-advanced-029-session-source-report-type-dropdown.jpg)
*Report type options offered: Conversion Count, Revenue*

![Hover description for Conversion Count (with Know more)](../screenshots/11-analyze-advanced-040-session-source-conversion-count-desc.jpg)
*Hover description for Conversion Count (with Know more)*

![Hover description for Revenue (with Know more)](../screenshots/11-analyze-advanced-041-session-source-revenue-desc.jpg)
*Hover description for Revenue (with Know more)*

![Revenue selected: 'Conversion goal & Revenue attribute are not set. Please update here'](../screenshots/11-analyze-advanced-030-session-source-revenue-goal-not-set.jpg)
*Revenue selected: 'Conversion goal & Revenue attribute are not set. Please update here'*

![Add Filters row: Filter By Source, is, Enter Value, Case Sensitive, delete](../screenshots/11-analyze-advanced-031-session-source-add-filter-row.jpg)
*Add Filters row: Filter By Source, is, Enter Value, Case Sensitive, delete*

![Filter By properties: Source, Medium, Campaign, Content, Term, Platform, App Version, SDK Version](../screenshots/11-analyze-advanced-032-session-source-filter-by-properties.jpg)
*Filter By properties: Source, Medium, Campaign, Content, Term, Platform, App Version, SDK Version*

![String operators: is, is not, contains, does not contain, starts with, ends with, does not start with, does not end with, exists, does not exist](../screenshots/11-analyze-advanced-033-session-source-filter-operators.jpg)
*String operators: is, is not, contains, does not contain, starts with, ends with, does not start with, does not end with, exists, does not exist*

![Source property multi-select checklist](../screenshots/11-analyze-advanced-034-session-source-source-property-dropdown.jpg)
*Source property multi-select checklist*

![Two properties selected; summary 'Report Grouped by Source and Medium for Last 7 Days'](../screenshots/11-analyze-advanced-035-session-source-grouped-by-two-properties.jpg)
*Two properties selected; summary 'Report Grouped by Source and Medium for Last 7 Days'*

![Duration presets (same as Retention)](../screenshots/11-analyze-advanced-036-session-source-duration-presets.jpg)
*Duration presets (same as Retention)*

![Filter users accordion with segment compare and Exclude Users](../screenshots/11-analyze-advanced-037-session-source-filter-users.jpg)
*Filter users accordion with segment compare and Exclude Users*

![Session and source chart/table empty states](../screenshots/11-analyze-advanced-038-session-source-chart-table-empty.jpg)
*Session and source chart/table empty states*

![Session and source info tooltip](../screenshots/11-analyze-advanced-039-session-source-info-tooltip.jpg)
*Session and source info tooltip*

![Save disabled: 'Perform Session Source analysis and save it.'](../screenshots/11-analyze-advanced-043-session-source-save-tooltip.jpg)
*Save disabled: 'Perform Session Source analysis and save it.'*

![Watch video modal: 'Session and Source Analysis Walkthrough'](../screenshots/11-analyze-advanced-042-session-source-watch-video-modal.jpg)
*Watch video modal: 'Session and Source Analysis Walkthrough'*

#### User Paths

![User paths default: Starting with, no event, 4 Hours window, 5 steps, Yesterday, APPLY enabled](../screenshots/11-analyze-advanced-044-user-paths-top.jpg)
*User paths default: Starting with, no event, 4 Hours window, 5 steps, Yesterday, APPLY enabled*

![Path type: Starting with / Ending with](../screenshots/11-analyze-advanced-045-user-paths-path-type-dropdown.jpg)
*Path type: Starting with / Ending with*

![Event picker empty (no tracked events)](../screenshots/11-analyze-advanced-046-user-paths-event-picker-empty.jpg)
*Event picker empty (no tracked events)*

![+ Attributes with no event: 'Please fill all values', APPLY disabled](../screenshots/11-analyze-advanced-047-user-paths-attributes-validation.jpg)
*'+ Attributes' with no event: 'Please fill all values', APPLY disabled*

![User path window units: Minutes, Hours, Days](../screenshots/11-analyze-advanced-048-user-paths-window-units.jpg)
*User path window units: Minutes, Hours, Days*

![Date range presets (default Yesterday)](../screenshots/11-analyze-advanced-049-user-paths-date-range-presets.jpg)
*Date range presets (default Yesterday)*

![Filter users: All users / Filter users by / Exclude Users (no Add segment to compare)](../screenshots/11-analyze-advanced-050-user-paths-filter-users-no-compare.jpg)
*Filter users: All users / Filter users by / Exclude Users (no Add segment to compare)*

![Filter users by: shared segment filter component](../screenshots/11-analyze-advanced-051-user-paths-filter-users-by.jpg)
*Filter users by: shared segment filter component*

![User paths chart empty state: 'Hit apply to see the chart'](../screenshots/11-analyze-advanced-052-user-paths-chart-empty.jpg)
*User paths chart empty state: 'Hit apply to see the chart'*

![User paths info tooltip](../screenshots/11-analyze-advanced-053-user-paths-info-tooltip.jpg)
*User paths info tooltip*

![Save disabled: 'Perform User Paths analysis and save it.'](../screenshots/11-analyze-advanced-054-user-paths-save-tooltip.jpg)
*Save disabled: 'Perform User Paths analysis and save it.'*

![Watch video modal: 'User Paths Analysis Walkthrough'](../screenshots/11-analyze-advanced-055-user-paths-watch-video-modal.jpg)
*Watch video modal: 'User Paths Analysis Walkthrough'*

![After APPLY: 'Building user paths. This may take some time. Please wait...'](../screenshots/11-analyze-advanced-056-user-paths-building-loading.jpg)
*After APPLY: 'Building user paths. This may take some time. Please wait...'*

![Result with no events: 'No data available to render a chart'](../screenshots/11-analyze-advanced-057-user-paths-no-data-after-apply.jpg)
*Result with no events: 'No data available to render a chart'*

#### Acquisition

![Acquisition table: Organic row - 3 users, 3 uninstalls, 100% uninstalls/user, Sessions/User 1](../screenshots/11-analyze-advanced-058-acquisition-top-table.jpg)
*Acquisition table: Organic row - 3 users, 3 uninstalls, 100% uninstalls/user, Sessions/User 1*

![Acquisition Analysis By: Campaign Name, Publisher Name](../screenshots/11-analyze-advanced-059-acquisition-analysis-by-dropdown.jpg)
*Acquisition Analysis By: Campaign Name, Publisher Name*

![Select Platform: All, Android, IOS](../screenshots/11-analyze-advanced-060-acquisition-platform-dropdown.jpg)
*Select Platform: All, Android, IOS*

![Show Installs Between presets (adds This Week, Last Week, Last 7/30 Days) plus calendar](../screenshots/11-analyze-advanced-061-acquisition-date-picker.jpg)
*Show Installs Between presets (adds This Week, Last Week, Last 7/30 Days) plus calendar*

![Acquisition info tooltip](../screenshots/11-analyze-advanced-062-acquisition-info-tooltip.jpg)
*Acquisition info tooltip*

![Loading after APPLY (Publisher Name)](../screenshots/11-analyze-advanced-063-acquisition-loading.jpg)
*Loading after APPLY (Publisher Name)*

![Result grouped by Publisher Name (Organic only)](../screenshots/11-analyze-advanced-064-acquisition-publisher-name-result.jpg)
*Result grouped by Publisher Name (Organic only)*

#### Uninstalls

![Uninstalls Users tab loading](../screenshots/11-analyze-advanced-065-uninstalls-users-loading.jpg)
*Uninstalls Users tab loading*

![Uninstall By Time chart: 'Daily Uninstalls Users: 0', Download Chart](../screenshots/11-analyze-advanced-066-uninstalls-users-by-time-chart.jpg)
*Uninstall By Time chart: 'Daily Uninstalls Users: 0', Download Chart*

![Chart hover tooltip (date, count, series)](../screenshots/11-analyze-advanced-076-uninstalls-chart-hover-tooltip.jpg)
*Chart hover tooltip (date, count, series)*

![Type: Daily, Weekly, Monthly](../screenshots/11-analyze-advanced-070-uninstalls-type-dropdown.jpg)
*Type: Daily, Weekly, Monthly*

![Date Range presets: Yesterday, Last 7 Days, Last Week, Last 30 Days, Last Month, Since, Before, Custom Range](../screenshots/11-analyze-advanced-071-uninstalls-date-range-presets.jpg)
*Date Range presets: Yesterday, Last 7 Days, Last Week, Last 30 Days, Last Month, Since, Before, Custom Range*

![Uninstall By Attribute chart: 'Uninstalls Users by LTV: 0' (EMPTY bucket)](../screenshots/11-analyze-advanced-067-uninstalls-users-by-attribute-chart.jpg)
*Uninstall By Attribute chart: 'Uninstalls Users by LTV: 0' (EMPTY bucket)*

![Attributes dropdown (searchable user attributes)](../screenshots/11-analyze-advanced-068-uninstalls-attribute-dropdown.jpg)
*Attributes dropdown (searchable user attributes)*

![Platform: All, Android, iOS](../screenshots/11-analyze-advanced-069-uninstalls-platform-dropdown.jpg)
*Platform: All, Android, iOS*

![Uninstalls info tooltip (same text as Acquisition, a MoEngage copy bug)](../screenshots/11-analyze-advanced-072-uninstalls-info-tooltip.jpg)
*Uninstalls info tooltip (same text as Acquisition, a MoEngage copy bug)*

![Events tab: Uninstall By Time error with Retry](../screenshots/11-analyze-advanced-073-uninstalls-events-tab-error.jpg)
*Events tab: Uninstall By Time error with Retry*

![Events tab: Uninstall By Attribute error with Retry](../screenshots/11-analyze-advanced-074-uninstalls-events-by-attribute-error.jpg)
*Events tab: Uninstall By Attribute error with Retry*

![Events tab Attributes ('Type') dropdown empty](../screenshots/11-analyze-advanced-075-uninstalls-events-attributes-empty.jpg)
*Events tab Attributes ('Type') dropdown empty*
