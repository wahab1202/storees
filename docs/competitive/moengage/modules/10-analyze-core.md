## 10. Analyze > My Studio, Users, Behavior, Funnels

Storees covers a thin slice of this module: an unordered, identified-customers-only funnel with a free reached/dropped drill-down, a six-metric Time Series with a previous-period overlay, and fixed RFM and prediction-bucket distributions. It has no Users (user-property) analysis, no event choice for trends, no working segment filter (the API accepts one and ignores it), no custom date range, and no result tables, exports, dashboards or alerts, so 45 of the 75 MoEngage features below are missing and 27 are partial. The cheapest high-value fixes are an event picker with true unique counts, an ordered funnel query, wiring the segment filter, and Save, CSV and save-as-segment on every report; separately, the funnel drill-down shows unmasked emails and phones to restricted roles, and the Product Analytics page probably never leaves its spinner.

### MoEngage overview

MoEngage's Analyze menu holds three query builders that share one layout: a "what to analyse" card, a Filter users card, an Options card, an explicit APPLY, then a chart card and a table card. A fourth page, My Studio, is locked.

- **My Studio** is an upsell for the paid Product Analytics plan. It markets:
  - a private folder of saved analyses and private dashboards with visibility and permission settings;
  - AI Proactive Insights (e.g. RFM movement) and chart-point actions (view sample users, create segment, create campaign, analyze users, export users);
  - anomaly alerts, larger dashboard and subscription limits, 3 years of history and early access.
- **Users (User analysis)** charts a total count, unique count, distribution (auto or custom buckets), aggregation (sum, min, max, average, median, percentile, distinct) or email-domain breakdown of one or more user properties.
  - Properties come from a grouped, searchable catalogue; each has its own filters.
  - Results can be split by user attributes (with date granularity) and filtered, compared or excluded by segment.
  - Results show as bar, column, pie or geo-map charts with a #/% toggle and sort, above an AG Grid table with search, transpose and download. Charts and tables can be saved to a dashboard.
- **Behavior** is event analytics: several event series, each with + OR, + Attributes and + Split by; seven analysis types (total events, unique users, unique sessions, aggregation, aggregation distribution, events per user, two-level attribute aggregation); group by user property; a rich duration picker; the same Filter users block.
- **Funnels** has ordered steps with + OR and + Attributes, exclusion events, six funnel types (conversion, time to convert and frequency, each by unique users or all occurrences), a funnel window, strict order, a funnel split and a holding attribute.
- Set alert and Save to My Studio are locked behind the paid plan. Every page has an info tooltip, a docs link, a walkthrough video and a Merlin AI-agent promo.

| Page visited | URL path |
|---|---|
| My Studio (locked upsell) and the Analyze flyout | `/v4/analytics/studio` |
| Users (User analysis) | `/v4/analytics/user-analysis` |
| Behavior | `/v4/analytics/v2/behavior` |
| Funnels | `/v4/analytics/v2/funnels` |

**Capture limits.**
- **No event data:** the workspace tracks no events, so Behavior and Funnels results were never rendered. Their chart types, granularity, conversion and drop-off charts, the funnel table, any create-segment-from-drop-off action and the post-run Save and Set alert flows are unknown. A Behavior APPLY on a placeholder event returned "The event or attribute required for this analysis could not be located".
- **Disabled options:** Funnel split, Holding Attribute and the Behavior per-event Split by stayed disabled, because their options come from event attributes.
- **Users only:** Users was the only page with results (3 imported users). A split-by query hung for over 70 seconds.
- **Not clicked:** Download Chart, Download Table, the final Save in the dashboard modals, "I'm interested" and "Learn more". Nothing was created or changed.

### Storees counterpart

- **Analytics hub** at `/analytics` (`packages/frontend/src/app/(dashboard)/analytics/page.tsx`). One sidebar item (`packages/frontend/src/components/layout/Sidebar.tsx:58`) opens seven report cards, Quick Start links and a "Saved Analyses" list (first 10).
- **Funnels** at `/analytics/funnels` (`packages/frontend/src/app/(dashboard)/analytics/funnels/page.tsx`).
  - Native-select steps, a 7/14/30/90-day range, Run, CSS bars with a clickable reached/dropped drill-down, and Save through `window.prompt`.
  - API: `POST /api/analytics/funnel` and `/funnel/members` (`packages/backend/src/routes/analytics.ts:24-73`). Engine: `computeFunnel` and `getFunnelStageMembers` (`packages/backend/src/services/analyticsService.ts:33-201`).
- **Time Series** at `/analytics/timeseries`: six fixed metrics (all events, active customers, new customers, revenue, orders, sessions), daily/weekly/monthly buckets and a previous-period overlay (`analyticsService.ts:334-486`).
- **Time-to-Event** at `/analytics/time-to-event`: median, p75 and p90 between two events, a fixed histogram and a platform breakdown (`analyticsService.ts:509-652`).
- **Product Analytics** at `/analytics/products` (`analyticsService.ts:654-772`), **Cohorts** at `/analytics/cohorts` (first-seen retention heatmap), **Segment Transitions** at `/analytics/transitions` (`packages/backend/src/services/transitionService.ts`) and **Predictions** at `/analytics/predictions` (assessed with module 08).
- **Saved analyses:** the `saved_analyses` table (`packages/backend/src/db/schema.ts:937-948`) behind `GET/POST/DELETE /api/analytics/saved`.
- **Related screens:** the fixed Key Metrics dashboard at `/dashboard` (`packages/frontend/src/app/(dashboard)/dashboard/page.tsx`) and the RFM grid and distributions on `/segments` (`packages/frontend/src/components/segments/LifecycleChart.tsx`; `packages/segments/src/lifecycle.ts`).
- **How it runs:** every report is computed live in Postgres per request. `/api/analytics` sits behind `requireAuth` only (`packages/backend/src/index.ts:221`): no plan gate, but also no contact-PII mask and no agent scope.
- **Not present:** a Users (user-property) analysis, a configurable Behavior (event) analysis, segment filters (accepted by the API, then ignored), custom date ranges, chart-type options, result tables on most reports, exports, custom dashboards and alerts.

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| My Studio | Product Analytics paid-plan gate | Upsell replaces My Studio ("not enabled for your account"); Learn more / I'm interested; 5-tab feature carousel | ➖ N/A | A pricing gate, not a capability. Storees gates only ai_chatbot, ai_email_designer, predictions and ad_audience_export (`entitlementService.ts:15-40`); `/api/analytics` sits behind `requireAuth` only (`index.ts:221`) | None as a feature. Commercially, Storees can say its core analytics are not upsold. | — | — |
| My Studio | Private saved-analysis folder (My Studio) | Personal "Saved analysis" list, filled by Save to My Studio (paid) | 🟡 Partial | `saved_analyses` has no owner or visibility column (`schema.ts:937-948`); `GET/POST/DELETE /api/analytics/saved` (`routes/analytics.ts:176-230`); the hub lists 10 (`analytics/page.tsx:155-186`). Only funnels can be saved; no rename or delete in the UI | Per-user ownership with a mine/shared view; rename and delete (the DELETE endpoint already exists). | P3 | S |
| My Studio | Private dashboards with visibility and permissions | Private / Workspace visibility and Viewer / Editor permission ("New" badge); Private and Viewer locked | ❌ Missing | No dashboard or widget table in `schema.ts`. `/dashboard` is a fixed Key Metrics layout (`dashboard/page.tsx:74-84`); `/widgets` holds opt-in capture widgets | Custom dashboards first (see "Save chart / table to a dashboard"), then owner, visibility and viewer/editor roles. | P3 | M |
| My Studio | AI Proactive Insights | An AI assistant surfaces changes unprompted (e.g. "22,684 users moved from Champions ... based on RFM modelling") with Analyze segment / Save segment (paid) | 🟡 Partial | No AI insight feed (`routes/ai.ts:23-166`). Nearest: Segment Transitions, a user-run comparison of two membership snapshots as cards or a Sankey (`transitions/page.tsx`; `transitionService.ts:11-148`). Snapshots are manual or come from a weekly `setInterval` that never runs at boot, so it fires only after 7 days of uptime (`scoringScheduler.ts:209-211`). RFM tabs add a rule-based one-line insight (`LifecycleChart.tsx:583-603`). Transitions' "Create Flow" opens `/flows/new`, which loads "new" as a flow id and fails (`transitions/page.tsx:59`; `flows/[id]/page.tsx:17-21,48`); "View Users" passes `?segment=` but `/customers` reads `segmentId` (`transitions/page.tsx:65`; `customers/page.tsx:26`) | A scheduled BullMQ job that detects notable RFM, segment or metric shifts and posts insight cards with Save segment / Create campaign. Fix the two Transitions links. | P2 | L |
| My Studio | Chart-point action: View sample users | Click a point on any chart to view sample users (paid) | 🟡 Partial | Funnels only: step counts and "-N dropped" open a modal of customers with profile links (`funnels/page.tsx:80-92,290-318,341-398`; `analyticsService.ts:137-201`; `routes/analytics.ts:50-73`). The UI fetches 50 and tells the user to narrow the range. The endpoint returns raw email and phone with no `viewContactPii` mask and no agent scope, unlike the Customers, Segments, Dashboard and Predictions APIs (`routes/customers.ts:201`; `agentScope.ts:94-136`). Prediction goal pages list customers per score bucket with paging (`predictions/[goalId]/page.tsx`). Nothing on Time Series, Time-to-Event, Cohorts or Products | Mask contact PII and apply agent scope in `/funnel/members` now (S); then drill-down on every chart bucket with real paging. | P2 | M |
| My Studio | Chart-point action: Create segment | Create a segment from the users behind a chart point (paid) | ❌ Missing | No save-as-segment on any analytics page or in the drill-down. Segments are filter-only (`schema.ts:303-321`), but performed-event rules with "in the last N days" already exist and are editable (`EventOccurrenceRule`, `types.ts:1591-1602`; `evaluator.ts:242-262`; `SegmentFilterBuilder.tsx:638-690`), and today's unordered funnel stages map exactly onto them. RFM bars only link to `/customers?rfm=` (`LifecycleChart.tsx:519-529`) | "Save as segment" on the reached/dropped lists, writing performed / not-performed rules for the funnel window. The ordered funnel (P0 row) will later need a funnel-stage rule or static lists. | P1 | S |
| My Studio | Chart-point action: Create campaign | Launch a campaign at the users behind a chart point (paid) | ❌ Missing | No campaign action on analytics pages; the Transitions CTAs go to the non-existent `/flows/new`. The campaign builder already takes an inline filter audience and a URL prefill (Next Best Action, `campaigns/create/page.tsx:437-453`) | Deep-link from the drill-down to `/campaigns/create` with the stage's filter or saved segment preselected. | P2 | S |
| My Studio | Chart-point action: Analyze users | Open the users behind a chart point in another analysis (paid) | ❌ Missing | No hand-off between reports; the endpoints honour no customer-set input (`segmentId` is accepted but never read, `analyticsService.ts:39`) | Pass a cohort or segment from one report into another (after segment filtering exists). | P3 | M |
| My Studio | Chart-point action: Export users | Export the users behind a chart point (paid) | ❌ Missing | The drill-down has no export (`funnels/page.tsx:341-398`). The product's exports are the hashed ad-audience CSV per segment (`routes/segments.ts:157-176`), the consent-audit CSV (`v1Onboarding.ts:908-922`) and the per-customer GDPR JSON (`routes/customers.ts:922-943`) | A CSV of reached/dropped customers reusing `getFunnelStageMembers`, behind `requireCapability('exportCustomers')`. | P2 | S |
| My Studio / Behavior / Funnels | Alerts on analyses (Set alert, scheduled anomaly alerts) | Scheduled anomaly alerts; "Set alert" on Behavior and Funnels locked ("Upgrade to Product Analytics to set Alerts") | ❌ Missing | No alert, anomaly or threshold code in backend or frontend; `workers/` has no alert scheduler (prediction drift checks only retrain models) | Alert rules on saved analyses (threshold or % change vs the previous period), evaluated by a BullMQ repeatable job and sent by email or WhatsApp. | P2 | L |
| My Studio | Dashboard and report subscriptions | Expanded dashboard and subscription limits (scheduled dashboard emails) in the paid plan | ❌ Missing | No custom dashboards and no scheduled report or digest; the workers cover campaigns, flows, sync, aggregation, predictions, scoring, templates, trials and webhooks | Scheduled email of a dashboard or saved analysis. | P2 | M |
| My Studio | Long historical data (3 years) | 3 years for Behavior, Funnel and Retention in the paid plan; otherwise "Since" is capped at 365 days | 🟡 Partial | No retention TTL on `events`; GDPR erasure and shop purge anonymise rather than delete (`dataSubjectService.ts:13-15`). The APIs accept any startDate/endDate (`routes/analytics.ts:34-37,114-122,141-146,159-164`), but every UI offers only Last 7/14/30/90 days; Cohorts reach 12 months | Expose longer windows through the custom range; check the cost of multi-year scans on `events`. | P3 | S |
| My Studio | Future Ready (early access) | Early access to upcoming analytics features | ➖ N/A | A marketing promise, not a product capability | None. | — | — |
| My Studio | Analyze menu | My Studio, Users, Behavior, Funnels, Retention, Session And Source, User Paths, Acquisition, Uninstalls | 🟡 Partial | One "Analytics" item (`Sidebar.tsx:58`) opens a card hub: Funnels, Cohorts, Time Series, Time-to-Event, Product Analytics, Segment Transitions, Predictions (`analytics/page.tsx:19-71`). Funnels and Cohorts (Retention) exist; Users and Behavior do not and are tracked in their own rows. The other MoEngage items are assessed in another module | A persistent Analyze sub-navigation and a saved-analysis home instead of a card hub. | P3 | S |
| Users | User property picker (grouped, searchable) | Searchable picker grouped as Lifecycle, Acquisition, Uninstall, Reachability, Localization, Email Suppression Type, Device Data, Tracked Standard/Custom Attribute; hover description; collapsed row shows the type ("LTV (Double)") | 🟡 Partial | No user analysis. The only catalogue is the segment builder's native `<select>` with an `<optgroup>` per category (`SegmentFilterBuilder.tsx:425-436`), fed by `GET /api/schema/fields` (`v1Schema.ts:22-64`; `domainRegistry.ts`): Customer Info, Purchase History, Engagement, Product Filters, Order Details, AI & Predictions, Reachability. No search, descriptions or types; city and region appear only under "Dealer & Region" with agent RBAC (`agentFieldDefs.ts:51-95`) | Reuse the catalogue in a searchable combobox with descriptions; add city, region, UTM and device fields. | P2 | S |
| Users | Multiple properties per analysis (A, B, ...) | "+ Add user property" rows A, B, ... with duplicate, remove and collapse | ❌ Missing | No user-property analysis or distribution endpoint in `routes/` or on the analytics pages | Several property rows per analysis, once a Users analysis exists. | P2 | S |
| Users | Per-property filters (+ Filters, case sensitive, multi-select values) | "Filter by attribute / operator / value" rows, a Case Sensitive checkbox for strings, and a multi-select value picker with search, Clear all and Select all | ❌ Missing | Analytics queries take no filters (`analyticsService.ts`). In segments, values are free text or single-select (`SegmentFilterBuilder.tsx:450-530`); contains / starts / ends are always case-insensitive ILIKE and "is" is an exact match (`evaluator.ts:467-472,880-896`); there is no case toggle and no multi-select picker | Per-property filters reusing the segment filter compiler, with multi-select values and a case toggle. | P2 | S |
| Users | String filter operators | is, is not, contains, contains spaces, does not contain, starts with, does not start with, ends with, does not end with, exists, does not exist, is empty, is not empty | 🟡 Partial | Segment builder only: equals, does not equal, contains, starts with, ends with (`SegmentFilterBuilder.tsx:39-45`; `types.ts:550-560`). Some fields allow fewer (name: is / is not / contains; phone: is / is not; `domainRegistry.ts:8-9`) | Add does not contain, does not start/end with, exists / does not exist, is empty / is not empty and contains spaces. | P2 | S |
| Users | Numeric filter operators | is equal to, is not equal to, is between, is not between, is less than, is greater than, exists, does not exist | 🟡 Partial | Segment builder: equals, does not equal, greater than, less than, between (`SegmentFilterBuilder.tsx:33-38`); avg_order_value and clv allow only greater/less than (`domainRegistry.ts:15-16`) | Add is not between and exists / does not exist; offer the full set on every numeric field. | P3 | S |
| Users | Date filter operators and value modes | on, is between, before, after, in the next, in the last, is today, exists, does not exist; values as date / days ago / days from now | 🟡 Partial | Segment builder: is between, is before, is after (`SegmentFilterBuilder.tsx:51-55`); first/last order date allow only before/after (`domainRegistry.ts:20-21`). `within_last` is implemented in the evaluator and used by seeded segments (`evaluator.ts:781-793`) but the builder does not offer it; relative windows use numeric "Days since ..." fields | Expose on, in the last / in the next (start from `within_last`), is today, exists / does not exist and relative values. | P2 | S |
| Users | Analysis types: Total count and Unique count | Total count and unique count of a user property | ❌ Missing | No per-property counts; the Customers page shows only the overall total or a segment's member count (`customers/page.tsx:104-160`) | COUNT and COUNT DISTINCT per property in a Users analysis endpoint. | P2 | S |
| Users | Analysis type: Distribution of a user property | Distribution of any property as a chart and a table (e.g. Last Known Country: Pakistan, Qatar, Syria) | 🟡 Partial | Fixed distributions only: RFM Recency (0-30 / 31-90 / 90+ days), Frequency (1, 2-3, 4-6, 7-10, 11+ orders) and Monetary (bottom 50% / middle / top 10%) for buyers only (`lifecycle.ts:22-193`; `LifecycleChart.tsx:482-560`); high/medium/low counts per prediction goal (`predictions/[goalId]/page.tsx`); top segment sizes on `/dashboard`. No arbitrary property (city, subscription, custom attribute) | A Users analysis endpoint that groups customers by any column, `metrics` key or `custom_attributes` key, shown as a bar chart and a table. | P1 | M |
| Users | Analysis type: Aggregation of a numeric user property | "View property as" Sum, Min, Max, Average, Median, Percentile (numeric input), Distinct | 🟡 Partial | Fixed aggregates only: the Avg CLV tile (`routes/dashboard.ts:104-315`) and the RFM metric row of returning %, avg frequency, AOV and avg CLV (`lifecycle.ts:105-113`). No choice of property or function; no sum, median or percentile | An aggregation mode in the Users analysis (`PERCENTILE_CONT` and similar). | P2 | S |
| Users | Email domain analysis | Breaks users down by email domain (single non-encrypted email attribute only) | ❌ Missing | No grouping by customer email domain; `emailDomainService.ts` is sender-domain setup | Group by `split_part(email, '@', 2)` in the Users analysis. | P3 | S |
| Users | Distribution bucketing (Auto / Custom) | Auto, or Custom "From 0 to 10 with an interval of 1"; at most 10 buckets | ❌ Missing | Bucket edges are hard-coded SQL CASE expressions (`lifecycle.ts:58-75`; `analyticsService.ts:580-594`) | Auto/custom bucketing (e.g. `width_bucket`) shared by Users, Behavior and time-to-convert. | P2 | S |
| Users | Split by user attribute (with date granularity) | Multi-select split over user attributes; dates by Date, Day of month/week/year, Hour of day, Month, Month of year, Week of month/year, Year | ❌ Missing | No report splits by a user attribute. The only breakdown is Time-to-Event "By Platform" on the `events.platform` column (`analyticsService.ts:604-640`; `time-to-event/page.tsx:122-132`); Time Series has Daily/Weekly/Monthly buckets but no split | GROUP BY one or more customer attributes, with date parts for dates, in Users and Behavior. | P2 | M |
| Users / Behavior / Funnels | Filter analysis by a saved segment (Custom segment) | "Filter users by > Custom segment" on all three pages; each states its audience ("Showing ... for: All Users") | ❌ Missing | `POST /funnel` accepts `segmentId` and `/timeseries` accepts `segmentIds` (`routes/analytics.ts:28-38,108-122`), but `computeFunnel` never reads it (`analyticsService.ts:39`), `computeTimeSeries` ignores it (line 341), and neither `useFunnel` nor the Time Series page sends it (`useAnalytics.ts:38-47`; `timeseries/page.tsx:70-77`). Time-to-Event's type declares a `'segment'` breakdown that is not implemented (`analyticsService.ts:495`). Membership is already in `customer_segments` (`schema.ts:171-178`) | A segment dropdown on each analysis and a `customer_id IN (customer_segments)` predicate in each query and drill-down. | P1 | S |
| Users / Behavior / Funnels | Inline "Filter users by" (property, behavior, affinity) with nested filters | All users, or "Filter users by" with tabs User property, User behavior (Has Executed / Has Not Executed + event), User affinity and Custom segment; + Nested Filter, + Filter | ❌ Missing | No analytics endpoint accepts a `FilterConfig`. The segment engine has attribute rules, performed-event rules with property filters, product affinity and nested AND/OR groups (`types.ts:484-560,1591-1602`; `SegmentFilterBuilder.tsx`), compiled by `filterSqlForProject` (`projectVocabulary.ts:491-505`). Campaigns already accept an inline filter audience (`campaigns/create/page.tsx:443-451`) | Embed `SegmentFilterBuilder` in the analytics pages and compile it with `filterSqlForProject`. | P2 | M |
| Users / Behavior / Funnels | Compare segments | "+ Add segment to compare" (copy segment 1 or add a new one) creates Compare Segments tabs plotted side by side | ❌ Missing | No chart compares segments; Time Series compares only with the previous period (`analyticsService.ts:441-483`) | Run each analysis per segment and plot the results as series or columns. | P2 | M |
| Users / Behavior / Funnels | Exclude Users | An "Exclude Users" checkbox opens an exclusion block with the same four tabs | ❌ Missing | No exclusion in analytics or in the segment builder. Campaigns already exclude an audience with `NOT (filter)` (`campaignService.ts:206,520`; `campaigns/create/page.tsx:452-453`) | Reuse the campaign exclusion pattern as a NOT predicate on each analysis. | P3 | S |
| Users | Chart type switcher (horizontal bar, column, pie, geo map) | A toolbar switches between horizontal bar, column and pie, plus a geo map for country | ❌ Missing | One fixed visual per report: AreaChart (`timeseries/page.tsx:193-232`), BarChart histogram (`time-to-event/page.tsx:176-186`), CSS bars (`funnels/page.tsx:280-329`). No Recharts pie anywhere (the PieChart matches are icons) | A chart-type toggle on a shared result component (Recharts supports bar, column and pie). | P2 | S |
| Users | Geo map chart | World map shaded by count, with a legend and zoom in / out / reset | ❌ Missing | `packages/frontend/package.json` has recharts and no map library; customers have `city` and `region` but no country (`schema.ts:151-152`) | Capture a country attribute; an India state/city map matters more for D2C than a world map. | P3 | M |
| Users | # / % toggle, sort and zoom | # / % toggle (not on pie); sort high-low, low-high, A-Z, Z-A; zoom controls | ❌ Missing | No value-mode or sort control on charts. Funnel rows show count and % side by side (`funnels/page.tsx:289-298`); Product Analytics sorts only through fixed tabs (`products/page.tsx:16-22,60-79`) | Value-mode and sort controls on the shared result component. | P3 | S |
| Users | Download Chart | "Download Chart" on the chart card | ❌ Missing | No image or PDF export on any analytics or dashboard chart | PNG/SVG export of the chart. | P2 | S |
| Users | Results table under the chart | Every result has a table below the chart (e.g. Distribution \| Count) | 🟡 Partial | Plain HTML tables only on the Time-to-Event breakdown (`time-to-event/page.tsx:190-213`), Product Analytics (`products/page.tsx:86-143`) and the Cohorts heatmap; Funnels and Time Series show only the visual | A data table under every chart. | P2 | S |
| Users | Table tools (search, column menu, filters, columns panel, transpose, paging) | AG Grid with search across columns, a column menu (sort, pin, autosize, choose/reset), a Contains filter, Columns and Filters panels, Transpose and Page Size 500 | ❌ Missing | No data-grid library in `packages/frontend/package.json`; `components/ui` holds only Dialog, NumberInput and Skeleton; the analytics tables have no search, column chooser, transpose or paging | A shared data-table component for analytics (e.g. TanStack Table). | P3 | M |
| Users | Download Table (CSV) | "Download Table" on the results table | ❌ Missing | No CSV or Excel export of any analytics, dashboard, campaign or flow report; the only CSVs are the segment ad-audience export (`routes/segments.ts:157-176`) and the consent audit (`v1Onboarding.ts:908-922`) | A CSV export endpoint and button per report, behind `exportCustomers` where rows are customers. | P1 | S |
| Users | Save analysis (Save to My Studio) and reopen | Save stays disabled until a run; "Save to My Studio" (locked) stores the analysis for reuse | 🟡 Partial | Only funnels save, named through `window.prompt` (`funnels/page.tsx:126-148`), and they reload from "Saved (n)" (152-175). Time Series, Time-to-Event, Products and Cohorts have no Save, although `POST /api/analytics/saved` accepts any type (`routes/analytics.ts:197-216`). Hub rows link by type only (`analytics/page.tsx:73-78,164-182`), so a saved item opens an empty builder | A Save modal (name, description) on every report; open a saved item by id from the hub. | P1 | S |
| Users | Save chart / table to a dashboard | Pick an existing dashboard (searchable) or Create New (name up to 50 chars, visibility, permission), then a chart/table name (50) and description (1000) | ❌ Missing | No dashboards table in `schema.ts`; `/dashboard` is a fixed Key Metrics layout (`dashboard/page.tsx`) | Dashboard and widget tables, a grid that renders saved analyses, and an add-to-dashboard modal (shared with the Dashboards module). | P1 | L |
| Users / Behavior / Funnels | In-app help (info tooltip, Know more, Watch video) | Info tooltip, "Know more" docs link and a YouTube walkthrough on every page; each analysis and funnel type has a description | 🟡 Partial | One-line subtitles (e.g. `funnels/page.tsx:114-115`); Cohorts adds "How to read this" and per-column tooltips (`cohorts/page.tsx:44-53,144-152`). No docs links, videos or metric definitions (Time Series metric select, `timeseries/page.tsx:101-109`) | Info tooltips with metric definitions and docs links. | P3 | S |
| Behavior | Multiple event series (A, B, ...) | "+ Add Event" adds series A, B, ... with duplicate and remove, plotted together ("2 Events") | ❌ Missing | Time Series analyses one fixed metric at a time (`timeseries/page.tsx:28-35,101-109`); no event choice and no multi-series chart | An event-based series builder with several series on one chart. | P1 | M |
| Behavior | + OR (alternative events in one series) | "+ OR" combines alternative events into one series | ❌ Missing | Time Series has no event selection; funnels allow one event per step (`FunnelStep = { eventName, label }`, `analyticsService.ts:9-12`) | `event_name IN (...)` per series and per funnel step. | P2 | S |
| Behavior | + Attributes (event-attribute filters) | "+ Attributes" filters a series by event attributes such as Platform or App Version | ❌ Missing | No analytics query filters on `events.properties`. The parts exist elsewhere: observed property keys per event from `GET /api/templates/variable-sources` (`variableSources.ts:13,91`), the declared registry `EVENT_PROPERTIES` (`shared/src/eventSchemas.ts:42,236`), the flow trigger's property-filter UI (`TriggerFiltersBlock`, `StructuredFlowBuilder.tsx:805`) and the SQL predicate behind segment "performed event ... where" rules (`evaluator.ts:226-240`) | Wire the existing catalogue, filter UI and predicate into the series query once the series builder exists. | P1 | S |
| Behavior | + Split by (event attribute) | Split each event by an event attribute (disabled until an event is chosen) | ❌ Missing | The only breakdown is Time-to-Event's fixed "By Platform" (`analyticsService.ts:604-640`). Nothing splits by event properties such as payment method, category or utm_source (UTMs ride on `session_started`, `sdk/src/autotrack.ts:109-114`) | `GROUP BY properties->>key` per series with top N plus Others, using the existing property catalogue. | P1 | M |
| Behavior | Event picker (grouped, searchable, details panel) | A grouped, searchable event picker with a details side panel | 🟡 Partial | A native `<select>` of raw distinct names (`funnels/page.tsx:205-214`; `time-to-event/page.tsx:77-86`) from `GET /api/analytics/event-names`, capped at 200 (`analyticsService.ts:779-788`); no search, grouping or description. `useAnalytics.ts:87-93` and `useEvents.ts:68-73` share the queryKey `['event-names']` but call the capped and uncapped endpoints. The flow builder's `EventNameSelect` already groups catalogue events (friendly names) and observed ones (`StructuredFlowBuilder.tsx:1140`) | A searchable combobox built from `EventNameSelect`, STANDARD_EVENTS labels and per-event descriptions; separate cache keys. | P2 | S |
| Behavior | Analysis type: Total events | Count of times the chosen event(s) were performed per period | 🟡 Partial | Time Series "Total Events" counts all events per bucket (`analyticsService.ts:366-369`) and "Orders" counts orders (381-383); the event cannot be chosen. The dashboard Events chart also counts all events (`routes/dashboard.ts:353-505`) | An `eventName` (plus filters) parameter on `/api/analytics/timeseries` and an event picker in the UI. | P0 | S |
| Behavior | Analysis type: Unique users | Distinct users who performed the chosen event(s) | 🟡 Partial | "Active Customers" is `COUNT(DISTINCT customer_id)` over all events per bucket (`analyticsService.ts:370-372`): it is not per event, it excludes anonymous visitors, and the Total card sums the per-bucket uniques (line 439), so repeat users are counted more than once | Unique users per chosen event, with a de-duplicated total for the period. | P0 | S |
| Behavior | Analysis type: Unique sessions | Distinct sessions with the event (disabled in this workspace: "Session tracking is disabled") | 🟡 Partial | Time Series "Sessions" counts `session_started` events from the web SDK (`analyticsService.ts:385-387`; `sdk/src/autotrack.ts:109-111`); `events.session_id` exists (`schema.ts:222`), but sessions cannot be counted for a chosen event | `COUNT(DISTINCT session_id)` for the chosen event. | P3 | S |
| Behavior | Analysis type: Aggregation of an event attribute | "View event as Sum / Min / Max / Average / Median / Percentile / Distinct of attribute" | 🟡 Partial | Only the hard-coded Revenue metric, `SUM(orders.total)` with reversed orders excluded (`analyticsService.ts:377-380,396-404`); the event, attribute and function cannot be chosen | Aggregate a numeric JSONB property per bucket, with all seven functions. | P1 | M |
| Behavior | Analysis type: Aggregation distribution | Buckets users by an aggregated attribute (e.g. revenue), Auto or Custom | 🟡 Partial | Only the fixed RFM Monetary tiers: bottom 50% / middle / top 10% of total_spent among buyers (`lifecycle.ts:44-75`; `LifecycleChart.tsx:514-516`) | A per-user aggregate of any numeric attribute, then bucketed. | P2 | M |
| Behavior | Analysis type: Total events per user | Per-user counts summarised as Min, Max, Average, Median, Percentile or Distribution | 🟡 Partial | Orders only: the RFM Purchase Frequency distribution (1, 2-3, 4-6, 7-10, 11+) and Avg Frequency (`lifecycle.ts:105-113`); no other event, no date range, no percentile | Per-user counts of any event, with summary functions and buckets. | P2 | S |
| Behavior | Analysis type: Attribute aggregation per user (two-level) | First per user (Sum, Min, Max, Average, Distinct of an attribute), then across users (Min, Max, Average, Median, Percentile) | ❌ Missing | No two-level aggregation in analytics; the segment `AggregateRule` (SUM/COUNT/AVG/MIN/MAX over line items) is a filter, not a report (`types.ts:521-548`) | A per-user CTE, then a summary across users. | P3 | M |
| Behavior | Group by user property | Group the selected events by one or more user properties, with date-granularity submenus | ❌ Missing | No report groups by a user property (`analyticsService.ts:334-486`) | JOIN customers and GROUP BY the chosen attribute. | P2 | M |
| Behavior / Funnels | Duration: rolling "Last N" windows | Default Last 7 Days; "Last N" with D / W / M units | 🟡 Partial | Fixed Last 7/14/30/90 days on Funnels, Time Series, Time-to-Event and Products (`funnels/page.tsx:181-190`; `timeseries/page.tsx:37-42`; `time-to-event/page.tsx:111-120`; `products/page.tsx:47-56`); 7/14/30 on the dashboard (`dashboard/page.tsx:381-400`) | Any N, with day, week and month units. | P2 | S |
| Behavior / Funnels | Duration: calendar presets (Today, Yesterday, This Month, Last Month) | Today, Yesterday, This Month and Last Month presets | ❌ Missing | No calendar-aligned presets; every analytics page uses the rolling 7/14/30/90-day selects | Calendar presets in a shared duration picker, using the project timezone. | P2 | S |
| Behavior / Funnels | Duration: Custom Range, Since, Before and reset | A two-month Custom Range calendar (From/To, Reset, Cancel/Done), Since (capped at 365 days), Before and a reset icon | ❌ Missing | No date picker on any analytics page (date inputs exist only in the segment builder, the debugger and campaign scheduling). The APIs already accept arbitrary dates (`routes/analytics.ts:34-37,114-122,141-146,159-164`) | A shared DurationPicker; this is UI-only work. | P1 | S |
| Behavior | Save Behavior analysis | Save after a run ("Perform Behavior analysis and save it."), with My Studio and dashboard options | ❌ Missing | Time Series has no Save (`timeseries/page.tsx`); `POST /api/analytics/saved` would accept type `timeseries` (`routes/analytics.ts:197-216`) and the hub already maps it (`analytics/page.tsx:73-78`) | Save and reopen for Time Series and a future Behavior page. | P1 | S |
| Behavior / Funnels | AI agents for analysis (Merlin Custom Agents) | Promo buttons "Try Merlin Custom Agents for Behavior Analysis" and "Automate Funnels with Merlin Custom Agents" | ❌ Missing | No AI over analytics. `routes/ai.ts:23-166` covers segment generation, email layout, copywriting, WhatsApp templates, next best action and campaign variations; the closest is the natural-language segment builder (`AiChatPanel.tsx`) | An LLM agent, reusing `llmService.ts`, that builds and explains funnels and trends from a question. | P2 | L |
| Behavior / Funnels | Result states (loading, error, empty) | "Please wait while the data loads" (config cards collapse), an inline event-not-found error, and empty chart and table states | 🟡 Partial | Loading spinners and empty-state cards exist (`funnels/page.tsx:251-265,333-339`; `timeseries/page.tsx:149-159,237-243`; `time-to-event/page.tsx:144-148,217-225`). Errors are transient toasts only; Cohorts and Products render an API failure as their "no data" state (`cohorts/page.tsx:123-132`; `products/page.tsx:82-143`), and the drill-down modal shows "No customers in this group." Products rebuilds its query key from `new Date()` on every render (`products/page.tsx:28-36`), so it probably never leaves the spinner | Inline error cards; handle `isError` on Cohorts, Products and the drill-down; compute Products' dates once per range. | P2 | S |
| Funnels | Steps: add/remove with event picker | Numbered step cards (2 by default), an event picker per step, "+ Add Step" and remove | ✅ Full | 2 steps by default, Add Step, delete disabled at 2 (`funnels/page.tsx:31-66,193-249`); the API rejects fewer than 2 steps (`routes/analytics.ts:30-32`); each step can carry a display label (218-224). Caveat: picking the same event for two steps returns 0 for the later one and duplicates React keys (`analyticsService.ts:70-83`; `funnels/page.tsx:283`) | None in the builder; funnel semantics are covered in the funnel-type rows. | — | — |
| Funnels | Step + OR | "+ OR" adds alternative events inside a step | ❌ Missing | One event per step (`FunnelStep = { eventName, label }`, `analyticsService.ts:9-12`) | A set of events per step. | P2 | S |
| Funnels | Step + Attributes (event-attribute filters) | "+ Attributes" filters a step's event by attributes such as Platform or App Version | ❌ Missing | The funnel SQL matches on `event_name` only and `FunnelStep` has no filters (`analyticsService.ts:53-90`). The property catalogue, filter UI and SQL predicate exist elsewhere (see Behavior "+ Attributes") | Per-step property filters (e.g. product_viewed where collection = X) inside the ordered-funnel rewrite. | P1 | M |
| Funnels | Duplicate / reorder / collapse steps | Copy, delete, collapse-to-summary and swap arrows per step; a header summary ("3 steps with 1 excluded event") | ❌ Missing | Steps can only be added or deleted (`funnels/page.tsx:50-57,226-232`) | Copy and move-up/down controls. | P3 | S |
| Funnels | Exclusion events between steps | "Exclude events from funnel" opens "Event should not occur between Step X and Step Y" + event, with "+ Exclude Event" | ❌ Missing | No exclusion concept in `computeFunnel` (`analyticsService.ts:33-113`) or on the funnel page | NOT EXISTS between the two step timestamps (needs the ordered rewrite first). | P2 | M |
| Funnels | Funnel type: Unique Users (ordered conversion) | "Funnel - Unique Users" (the default): a user who completes the ordered steps counts once | 🟡 Partial | `computeFunnel` counts distinct customers who did every step event anywhere in the window, using `HAVING COUNT(DISTINCT event_name)` (`analyticsService.ts:68-89`): order is not enforced (purchase-then-view converts), a repeated event in two steps evaluates to 0, and anonymous visitors are excluded (line 81). The drill-down uses the same logic (137-201) | Ordered funnel SQL (per-customer step timestamps via window functions or LATERAL), allowing repeated events and optionally counting anonymous sessions. | P0 | M |
| Funnels | Funnel type: All Occurrences | "Funnel - All Occurrences": every completion counts | ❌ Missing | Only distinct-customer counting (`analyticsService.ts:53-90`) | Count each completion, not each customer. | P3 | M |
| Funnels | Funnel type: Time to convert - Unique Users | Time taken to convert from Step X to Step Y, with distribution bucketing | 🟡 Partial | A separate Time-to-Event page handles two events: per customer, from the first start event in the window to the first end event after it, with median, p75, p90, completions, a fixed histogram and a platform breakdown (`analyticsService.ts:509-652`; `time-to-event/page.tsx`). It cannot measure between funnel steps; the funnel page instead prints "~5 min / 30 min / 2h between steps" from a hard-coded array (`funnels/page.tsx:70-78,319-324`) | Measured conversion time for each step pair inside the funnel; remove the made-up estimate. | P2 | S |
| Funnels | Funnel type: Time to convert - All Occurrences | Time to convert counted over every completion | ❌ Missing | Time-to-Event uses only each customer's first start event and the first end event after it (`analyticsService.ts:518-537`) | Pair every occurrence. | P3 | M |
| Funnels | Time-to-convert distribution bucketing (Auto / Custom with units) | Auto, or Custom "From 0 to 10 Minute(s) / Hour(s) / Day(s) with an interval of 1"; lower bound included, upper bound excluded | 🟡 Partial | Fixed buckets only: under 1 min, 1-5 min, 5-15 min, 15-60 min, 1-24 hr, 1-7 days, 7+ days (`analyticsService.ts:580-594`) | Configurable bounds, interval and unit. | P3 | S |
| Funnels | Frequency analysis (Unique Users / All Occurrences) | "Frequency of Step X before Step Y" with distribution bucketing | ❌ Missing | No frequency-before-conversion computation in `analyticsService.ts` or on any page | Count each user's step-X events before their step-Y event. | P3 | M |
| Funnels | Conversion window | "Funnel window": a number plus Minute(s) / Hour(s) / Day(s), default 1 day; if unset, the selected duration becomes the window (screenshot 118) | ❌ Missing | Only the overall date range bounds the funnel (`analyticsService.ts:46-47,79-80`), which matches MoEngage's unset-window behaviour | A per-customer limit on the time from first to last step, built into the ordered-funnel rewrite. | P1 | M |
| Funnels | Order: Strict | A "Strict" toggle drops users who repeat an earlier step before completing (A > B > A > C is not counted) | ❌ Missing | Storees enforces no step order at all (`analyticsService.ts:68-89`), so strict order is not possible | Strict mode on top of ordered funnels. | P2 | S |
| Funnels | Funnel split (breakdown) | Split by event, device or user property values (type and attribute dropdowns) | ❌ Missing | No breakdown in `computeFunnel` or on the funnel page; the only analytics breakdown is Time-to-Event by platform (`analyticsService.ts:604-640`) | Split by platform, utm_source, city, first-time vs repeat buyer and similar. | P1 | M |
| Funnels | Holding attribute | Keeps an event attribute constant across all steps, so a user plus attribute value completes the funnel | ❌ Missing | No attribute-correlated funnel logic (`analyticsService.ts:33-113`) | Partition the ordered funnel by (customer, property value), e.g. the same product_id from view to cart to purchase. | P2 | M |
| Funnels | Save funnel | Save is disabled until a run ("Perform Funnels analysis and save it."), then saves to My Studio (locked) or a dashboard | 🟡 Partial | Save appears after a run; the name comes from `window.prompt` and `{steps, dateRange}` is stored project-wide (`funnels/page.tsx:126-148`). "Saved (n)" reloads the steps but does not re-run (152-175). No description, rename, delete or sharing; hub entries open an empty builder (`analytics/page.tsx:164-182`) | A Save modal, re-run on load, open by id, rename and delete. | P1 | S |

### Storees-only strengths

- **Funnel stage drill-down in the base product.** Clicking a step count or "-N dropped" lists the customers who reached or dropped at that step, with profile links (`analyticsService.ts:137-201`, an EXCEPT query for drop-offs; `routes/analytics.ts:50-73`; `funnels/page.tsx:80-92,290-318,341-398`). MoEngage offers "View sample users" and "Create segment" only as paid chart-point actions (screenshot 002). Adding Save as segment, Send WhatsApp campaign and CSV export on top would make it a strong demo.
  - Caveat (security): the endpoint returns raw email and phone without the `viewContactPii` mask and ignores agent scope, unlike every other customer list.
  - Caveat: only the first 50 are shown, and the modal re-reads the current steps and date range, so editing steps after a run queries a different funnel.
- **Previous-period overlay in Time Series.** A "Compare prev period" checkbox (on by default) adds a dashed Previous series and a % change card (`timeseries/page.tsx:54-87,163-235`; `analyticsService.ts:441-483`). No compare-to-previous-period control was found in MoEngage's Behavior builder, but its result toolbar was never rendered, so treat this edge as unconfirmed.
- **Pre-built RFM grid with Recency, Frequency and Monetary distributions.** Monetary tiers use each project's own P50/P90, and the Recency and Monetary bars open the matching customers (`lifecycle.ts:22-193`; `LifecycleChart.tsx:482-560`). In MoEngage the same view needs Users analyses or the separately configured RFM module (module 08).
- **Segment Transitions with a Sankey view.** Compares any two segment-membership snapshots (e.g. Loyal to At Risk) as cards or a Sankey (`transitions/page.tsx`; `SankeyDiagram.tsx`; `transitionService.ts:11-148`). MoEngage markets RFM movement as paid AI Proactive Insights (screenshot 002), and its RFM module shows RFM-cell transitions only (module 08).
  - Caveats: "Create Flow" opens the non-existent `/flows/new`; "View Users" passes `?segment=` while `/customers` reads `segmentId`; the weekly snapshot timer only fires after 7 days of uptime.
- **Product Analytics for Shopify catalogues.** Top 50 products by views, purchases, conversion rate, revenue or abandonment, in the project's own event vocabulary, with reversed orders excluded (`products/page.tsx`; `analyticsService.ts:654-772`). MoEngage's Users, Behavior and Funnels pages have no merchandising view.
  - Caveat: the query key is rebuilt from `new Date()` on every render (`products/page.tsx:28-36`; `useAnalytics.ts:166-183`), so each completed fetch starts another and the page probably stays on its spinner (read from the code, not run). Revenue shows a hard-coded "$".
- **Return-aware revenue and orders.** Time Series Revenue and Orders exclude cancelled, returned and refunded orders (`analyticsService.ts:396-404`; `db/orderStatus.ts`), and product revenue uses `liveOrders` (727-732). MoEngage's Behavior aggregation sums event attributes as they were sent, so returns inflate revenue unless they are modelled as events.
- **Core analytics on every plan.** Plan gates cover only ai_chatbot, ai_email_designer, predictions and ad_audience_export (`entitlementService.ts:15-40`). MoEngage locks My Studio saves, alerts, private dashboards and 3-year history behind its Product Analytics plan, although Storees' saving is narrower.

### UX notes

- **One builder layout (screenshots 008, 069, 103, 133).** Users, Behavior and Funnels share three collapsible cards (what to analyse, Filter users, Options), an explicit APPLY, a chart card and a table card. After APPLY the cards collapse to one-line summaries such as "Showing behavior analysis for: All Users". Each Storees report has its own layout: Funnels puts the date select in the steps card header, Time Series uses a grid of four selects, Time-to-Event two grids, and Cohorts and Products re-query on every control change. A shared AnalysisBuilder shell would keep the new Users and Behavior pages and segment filters consistent.
- **Say who is counted.** MoEngage always states the audience. Storees never does, yet its funnels and Active Customers silently drop anonymous visitors (`customer_id IS NULL`, `analyticsService.ts:81,370-372`), which under-counts the top of a D2C view-to-purchase funnel. Until segments or anonymous sessions are supported, show "Identified customers only" beside the date range.
- **Chart plus table (047, 049).** Every MoEngage result pairs the chart with a searchable table and download buttons. Storees Funnels and Time Series show only a visual. A table and a CSV under each chart are cheap and answer the common demo question "can I export this?".
- **Made-up timing in Storees funnels.** The funnel page prints "~5 min / 30 min / 2h between steps" from a hard-coded array beside real counts (`funnels/page.tsx:70-78,319-324`). Next to MoEngage's measured time-to-convert this risks credibility. Replace it with measured medians (the Time-to-Event SQL already computes them) or remove it.
- **Saving (060-062, 099, 125).** MoEngage's Save is a dropdown, disabled until a run, that opens a modal with a name (50 chars), a description (1000) and a dashboard choice. Storees asks for a funnel name in `window.prompt()`, and the hub's Saved Analyses rows open an empty builder because no id is passed (`analytics/page.tsx:73-78`). Use a modal and a link such as `/analytics/funnels?saved=<id>` that loads and re-runs the analysis.
- **Pickers (010-013, 029-031).** MoEngage pickers are searchable and grouped, with a hover description panel and the data type ("LTV (Double)"). Storees analytics use native selects of raw snake_case event names (up to 200), and the segment field picker is a grouped select with no search. The flow builder's `EventNameSelect` (friendly catalogue names, then observed names) is a better starting point for a shared searchable combobox.
- **Date range (092-094).** MoEngage has one Duration control in the same place on every page: Today, Yesterday, This Month, Last Month, Since, Before, a two-month Custom Range calendar, Last N with D/W/M and a reset icon. Storees places a 7/14/30/90-day select differently on each page (card header, grid cell, page header) although the APIs accept any dates.
- **Definitions and inline validation (071-078, 106-111, 124).** MoEngage explains every analysis and funnel type on hover and outlines missing pickers in red ("Please fill all values"). Storees' Time Series metric select has no definitions, although the numbers are not obvious: the Active Customers "Total" sums per-bucket uniques, and Revenue excludes reversed orders and shows a hard-coded "$" while the dashboard formats the project currency. Storees' Run and Analyze buttons are disabled without saying why.
- **Funnel step cards (103, 124, 129).** MoEngage's numbered step cards have copy and delete icons, "+ OR" under each step, swap arrows, collapse-to-summary and a header summary ("3 steps with 1 excluded event"). Storees steps have a number badge, an event select, a free-text label and delete only. The label is useful; MoEngage has no equivalent.
- **Contact details in the drill-down.** Storees offers free what MoEngage sells as "View sample users", but its modal shows raw emails and phones even to roles whose "See contact details" toggle is off. Mask them as the Customers list does (`packages/backend/src/lib/pii.ts`).
- **Where Storees is clearer.** Funnel counts and "-N dropped" are clickable and list the actual customers. The Cohorts page's plain-language "How to read this" panel is clearer than MoEngage's tooltip plus external docs.
- **Locked features (061, 097, 126).** MoEngage shows locked items in place, with a padlock and an "Upgrade to Product Analytics to ..." tooltip, instead of hiding them. Storees could do the same for entitlement-gated features (predictions, the WhatsApp AI chatbot) so customers see what an upgrade adds.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status. Missing and partial rows were searched under synonyms:
- segment, segmentId, segmentIds, customer_segments, compare, exclude, `NOT (`;
- breakdown, split, group by, platform, properties, jsonb_object_keys, variable-sources, EVENT_PROPERTIES;
- export, csv, Blob, Content-Disposition, Download;
- dashboard, widget, alert, anomaly, threshold, drift, digest, subscription;
- pie, map, recharts imports, data grid, DayPicker, `type="date"`;
- insight, snapshot, transition, save, saved_analyses, window.prompt.

The Full row was checked for a UI route, an API endpoint and a real engine. 74 of 75 statuses held. One status, two priorities and three efforts changed, and several evidence cells were corrected:

- **Result states: ✅ Full → 🟡 Partial (P2 S).** Loading and empty states exist, but errors are only transient toasts. Cohorts and Products render an API failure as their "no data" message, the drill-down modal shows "No customers in this group." on failure, and the Products page probably never leaves its spinner.
- **Conversion window: P0 → P1 (❌ Missing kept).** MoEngage's own tooltip says that when no window is set, the selected duration becomes the window (screenshot 118). Storees' current behaviour equals that case, so the window is a missing option rather than a correctness bug like step order. It still belongs in the ordered-funnel rewrite.
- **Analyze menu: P1 L → P3 S, gap re-scoped (🟡 Partial kept).** The old gap ("add Users and Behavior analyses") double-counted the "Distribution of a user property" and "Multiple event series" rows. The row now covers only the navigation: a persistent Analyze sub-nav and a saved-analysis home.
- **Chart-point action: Create segment: effort M → S (❌ Missing, P1 kept).** Segments are filter-only, but performed-event rules with "in the last N days" already exist in the type, the evaluator and the builder UI. Today's unordered funnel stages (did steps 0..i, did not do step i, within the last N days) map onto them exactly, so no static list type is needed yet.
- **+ Attributes (Behavior): effort M → S, evidence corrected (❌ Missing, P1 kept).** The evidence said no endpoint lists event property keys. `GET /api/templates/variable-sources` returns observed property keys per event (`variableSources.ts:91-118`), `EVENT_PROPERTIES` declares them for standard events, the flow builder has a property-filter UI and the segment evaluator has the SQL predicate. "Step + Attributes" (Funnels) keeps M because it needs per-step predicates in the rewritten funnel SQL.
- **Evidence corrections (status, priority and effort unchanged):**
  - Chart-point action: View sample users. Added that `/api/analytics/funnel/members` returns unmasked email and phone and ignores agent scope, and that prediction goal pages have a paged bucket drill-down.
  - Chart-point action: Export users. The GDPR per-customer export is JSON, not CSV (`routes/customers.ts:922-943`).
  - AI Proactive Insights. Snapshots are also taken by a weekly timer, which only fires after 7 days of uptime; the RFM tabs show a rule-based one-line insight.
  - Long historical data. Erasure and shop purge anonymise events rather than delete them; there is simply no retention TTL.
  - Per-property filters. Only contains / starts / ends are case-insensitive ILIKE; "is" is an exact, case-sensitive match.
  - Date filter operators. `within_last` is implemented in the evaluator and used by seeded segments; only the builder does not offer it.
  - Distribution of a user property. Prediction buckets per goal and top segment sizes on the dashboard are further fixed distributions; the old evidence said prediction buckets could not be distributed.
- **Refinements without a status change:** the event picker can start from the flow builder's `EventNameSelect`; campaigns already accept inline filter audiences and exclusions (Create campaign, Inline filter, Exclude Users); date inputs also exist in campaign scheduling; UTMs ride on `session_started` (split by); Time-to-Event declares an unimplemented `'segment'` breakdown (segment filter).
- **Steps: add/remove with event picker stays ✅ Full.** Route, endpoint and engine all exist. The duplicate-event limitation is recorded as a caveat and in the ordered-funnel row.
- **Defects found outside the parity scope:**
  - Funnel drill-down: contact PII is not masked and agent scope is not applied (`routes/analytics.ts:50-73`).
  - Product Analytics: a likely endless refetch loop from a per-render query key.
  - Two Transitions links are broken (`/flows/new`, `?segment=`).
  - Two hooks share the `['event-names']` cache key but call different endpoints.
  - Time Series and Product revenue show a hard-coded "$".
- **Not decided from code alone:** the Previous-period storees-only edge is unconfirmed because MoEngage's Behavior results were never rendered, and the Products refetch loop was read from the code, not run.

Final counts: 1 Full, 27 Partial, 45 Missing, 0 Storees better, 2 N/A.

### Screens

#### My Studio

![My Studio: 'Introducing Product Analytics Plan' upsell hero with Learn more / I'm interested and the 'not enabled for your account' banner](../screenshots/10-analyze-core-001-studio-upsell-top.jpg)
*My Studio: 'Introducing Product Analytics Plan' upsell hero with Learn more / I'm interested and the 'not enabled for your account' banner*

![Tab 'Advanced Insights': AI Proactive Insights and chart-point actions (View sample users, Create segment, Create campaigns, Analyze users, Export users)](../screenshots/10-analyze-core-002-studio-tab-advanced-insights.jpg)
*Tab 'Advanced Insights': AI Proactive Insights and chart-point actions (View sample users, Create segment, Create campaigns, Analyze users, Export users)*

![Tab 'Streamlined Workflow': My Studio private folder of saved analyses; private dashboards with Private/Workspace visibility and granular permissions](../screenshots/10-analyze-core-003-studio-tab-streamlined-workflow.jpg)
*Tab 'Streamlined Workflow': My Studio private folder of saved analyses; private dashboards with Private/Workspace visibility and granular permissions*

![Tab 'Smart Tracking': scheduled anomaly alerts on analyses; expanded dashboard and subscription limits](../screenshots/10-analyze-core-004-studio-tab-smart-tracking.jpg)
*Tab 'Smart Tracking': scheduled anomaly alerts on analyses; expanded dashboard and subscription limits*

![Tab 'Historical Intelligence': three years of historical data for Behavior/Funnel/Retention analyses](../screenshots/10-analyze-core-005-studio-tab-historical-intelligence.jpg)
*Tab 'Historical Intelligence': three years of historical data for Behavior/Funnel/Retention analyses*

![Tab 'Future Ready': early access to upcoming analytics features](../screenshots/10-analyze-core-006-studio-tab-future-ready.jpg)
*Tab 'Future Ready': early access to upcoming analytics features*

![Analyze sidebar flyout: My Studio, Users, Behavior, Funnels, Retention, Session And Source, User Paths, Acquisition, Uninstalls](../screenshots/10-analyze-core-007-analyze-flyout-menu.jpg)
*Analyze sidebar flyout: My Studio, Users, Behavior, Funnels, Retention, Session And Source, User Paths, Acquisition, Uninstalls*

#### Users (User analysis)

![Users empty builder: User property A, Filter users, User analysis options (Distribution, Split by), APPLY, empty chart](../screenshots/10-analyze-core-008-users-top.jpg)
*Users empty builder: User property A, Filter users, User analysis options (Distribution, Split by), APPLY, empty chart*

![Page info tooltip: analyse users and the attributes that describe them (language, geography)](../screenshots/10-analyze-core-009-users-info-tooltip.jpg)
*Page info tooltip: analyse users and the attributes that describe them (language, geography)*

![User property picker with search, Lifecycle group (First Seen, Last Seen, LTV, No. of Conversions, ...)](../screenshots/10-analyze-core-010-users-property-dropdown-lifecycle.jpg)
*User property picker with search, Lifecycle group (First Seen, Last Seen, LTV, No. of Conversions, ...)*

![Property picker: Uninstall and Reachability groups](../screenshots/10-analyze-core-011-users-property-dropdown-uninstall-reachability.jpg)
*Property picker: Uninstall and Reachability groups*

![Property picker: Email Suppression Type and Device Data groups](../screenshots/10-analyze-core-012-users-property-dropdown-email-device.jpg)
*Property picker: Email Suppression Type and Device Data groups*

![Property picker: Tracked Standard Attribute and Tracked Custom Attribute groups](../screenshots/10-analyze-core-013-users-property-dropdown-tracked-attributes.jpg)
*Property picker: Tracked Standard Attribute and Tracked Custom Attribute groups*

![Numeric property LTV selected: '+ Filters' link and Distribution bucketing Auto/Custom](../screenshots/10-analyze-core-014-users-ltv-selected-bucketing.jpg)
*Numeric property LTV selected: '+ Filters' link and Distribution bucketing Auto/Custom*

![Per-property filter row 'Filter by \[Select attribute\]' with a delete icon](../screenshots/10-analyze-core-015-users-property-filter-row.jpg)
*Per-property filter row 'Filter by [Select attribute]' with a delete icon*

![Filter attribute list (flat list of user attributes)](../screenshots/10-analyze-core-016-users-filter-attribute-dropdown.jpg)
*Filter attribute list (flat list of user attributes)*

![String filter: Last Known City | is | value | Case Sensitive checkbox](../screenshots/10-analyze-core-017-users-filter-city-case-sensitive.jpg)
*String filter: Last Known City | is | value | Case Sensitive checkbox*

![String operators dropdown](../screenshots/10-analyze-core-018-users-string-operators.jpg)
*String operators dropdown*

![Filter value multi-select picker with search, Clear all, Select all](../screenshots/10-analyze-core-019-users-filter-value-picker.jpg)
*Filter value multi-select picker with search, Clear all, Select all*

![Numeric operators (No. of Sessions)](../screenshots/10-analyze-core-020-users-numeric-operators.jpg)
*Numeric operators (No. of Sessions)*

![Date filter First Seen | on | date with calendar popup](../screenshots/10-analyze-core-021-users-date-filter-calendar.jpg)
*Date filter First Seen | on | date with calendar popup*

![Date operators dropdown](../screenshots/10-analyze-core-022-users-date-operators.jpg)
*Date operators dropdown*

![Date value mode: date / days ago / days from now](../screenshots/10-analyze-core-023-users-date-value-mode.jpg)
*Date value mode: date / days ago / days from now*

![Analysis type for a numeric property: Total count, Unique count, Distribution, Aggregation, Email domain analysis (disabled)](../screenshots/10-analyze-core-024-users-analysis-type-dropdown.jpg)
*Analysis type for a numeric property: Total count, Unique count, Distribution, Aggregation, Email domain analysis (disabled)*

![Email domain analysis tooltip: only for a non-encrypted email attribute; breaks results down by email domain](../screenshots/10-analyze-core-025-users-email-domain-analysis-tooltip.jpg)
*Email domain analysis tooltip: only for a non-encrypted email attribute; breaks results down by email domain*

![Aggregation mode: 'View LTV as \[Select Option\]'](../screenshots/10-analyze-core-026-users-aggregation-view-as.jpg)
*Aggregation mode: 'View LTV as [Select Option]'*

![Aggregation functions: Sum, Min, Max, Average, Median, Percentile, Distinct](../screenshots/10-analyze-core-027-users-aggregation-functions.jpg)
*Aggregation functions: Sum, Min, Max, Average, Median, Percentile, Distinct*

![Percentile chosen: numeric percentile input](../screenshots/10-analyze-core-028-users-percentile-input.jpg)
*Percentile chosen: numeric percentile input*

![Split by: multi-select checkboxes over grouped user attributes; date attributes have a submenu](../screenshots/10-analyze-core-029-users-split-by-dropdown.jpg)
*Split by: multi-select checkboxes over grouped user attributes; date attributes have a submenu*

![Split by date granularity submenu for First Seen](../screenshots/10-analyze-core-030-users-split-by-date-granularity.jpg)
*Split by date granularity submenu for First Seen*

![Split by tooltip ('Split all selected user properties by a user attribute') and attribute description side panel](../screenshots/10-analyze-core-031-users-split-by-tooltip-description.jpg)
*Split by tooltip ('Split all selected user properties by a user attribute') and attribute description side panel*

![Configured: Aggregation (Percentile 1 of LTV) split by No. of Sessions chip](../screenshots/10-analyze-core-032-users-aggregation-splitby-configured.jpg)
*Configured: Aggregation (Percentile 1 of LTV) split by No. of Sessions chip*

![Distribution bucketing tooltip: Auto vs Custom intervals, max 10 buckets](../screenshots/10-analyze-core-033-users-bucketing-tooltip.jpg)
*Distribution bucketing tooltip: Auto vs Custom intervals, max 10 buckets*

![Custom bucketing: From \[0\] to \[10\] with an interval of \[1\]](../screenshots/10-analyze-core-034-users-custom-bucketing.jpg)
*Custom bucketing: From [0] to [10] with an interval of [1]*

![Filter users: \[1\] Segment, Add segment to compare, All users / Filter users by, Exclude Users](../screenshots/10-analyze-core-035-users-filter-users-expanded.jpg)
*Filter users: [1] Segment, Add segment to compare, All users / Filter users by, Exclude Users*

![Filter users by: User property / User behavior / User affinity / Custom segment; Has Executed + event; Nested Filter; + Filter](../screenshots/10-analyze-core-036-users-filter-users-by-behavior.jpg)
*Filter users by: User property / User behavior / User affinity / Custom segment; Has Executed + event; Nested Filter; + Filter*

![Has Executed / Has Not Executed](../screenshots/10-analyze-core-037-users-has-executed-dropdown.jpg)
*Has Executed / Has Not Executed*

![Event picker empty: no events tracked in this workspace](../screenshots/10-analyze-core-038-users-event-list-empty.jpg)
*Event picker empty: no events tracked in this workspace*

![User affinity filter tab (Has Executed + event)](../screenshots/10-analyze-core-039-users-filter-user-affinity.jpg)
*User affinity filter tab (Has Executed + event)*

![Custom segment filter tab: segment picker listing 'Test File'](../screenshots/10-analyze-core-040-users-filter-custom-segment.jpg)
*Custom segment filter tab: segment picker listing 'Test File'*

![Add segment to compare menu: Copy \[1\] Segment / + Add new segment](../screenshots/10-analyze-core-041-users-add-segment-to-compare-menu.jpg)
*Add segment to compare menu: Copy [1] Segment / + Add new segment*

![Compare Segments: \[1\] Segment and \[2\] Segment tabs](../screenshots/10-analyze-core-042-users-compare-segments.jpg)
*Compare Segments: [1] Segment and [2] Segment tabs*

![Exclude Users ticked: exclusion filter block with the same four filter tabs](../screenshots/10-analyze-core-043-users-exclude-users.jpg)
*Exclude Users ticked: exclusion filter block with the same four filter tabs*

![Two user properties: A collapsed to 'LTV (Double)', B empty](../screenshots/10-analyze-core-044-users-two-properties.jpg)
*Two user properties: A collapsed to 'LTV (Double)', B empty*

![String property Last Known Country selected (no bucketing option)](../screenshots/10-analyze-core-045-users-string-property-selected.jpg)
*String property Last Known Country selected (no bucketing option)*

![For a string property, Aggregation and Email domain analysis are disabled](../screenshots/10-analyze-core-046-users-analysis-type-string-property.jpg)
*For a string property, Aggregation and Email domain analysis are disabled*

![Result after APPLY: geo map chart; toolbar with horizontal bar, column, pie and map, #/% toggle, zoom in/out/reset, Download Chart](../screenshots/10-analyze-core-047-users-result-geo-map-chart.jpg)
*Result after APPLY: geo map chart; toolbar with horizontal bar, column, pie and map, #/% toggle, zoom in/out/reset, Download Chart*

![Map legend and the User analysis table (Distribution | Count)](../screenshots/10-analyze-core-048-users-result-map-and-table.jpg)
*Map legend and the User analysis table (Distribution | Count)*

![User analysis table: search across columns, Transpose, Download Table, Columns/Filters panels, Page Size 500, paging](../screenshots/10-analyze-core-049-users-result-table.jpg)
*User analysis table: search across columns, Transpose, Download Table, Columns/Filters panels, Page Size 500, paging*

![Horizontal bar chart with sort dropdown](../screenshots/10-analyze-core-050-users-chart-horizontal-bar.jpg)
*Horizontal bar chart with sort dropdown*

![Column (vertical bar) chart](../screenshots/10-analyze-core-051-users-chart-column-bar.jpg)
*Column (vertical bar) chart*

![Pie chart with percentage labels (no #/% toggle)](../screenshots/10-analyze-core-052-users-chart-pie.jpg)
*Pie chart with percentage labels (no #/% toggle)*

![Table column menu: Sort Ascending/Descending, Pin Column, Autosize This/All Columns, Choose Columns, Reset Columns](../screenshots/10-analyze-core-053-users-table-column-menu.jpg)
*Table column menu: Sort Ascending/Descending, Pin Column, Autosize This/All Columns, Choose Columns, Reset Columns*

![Table column filter: Contains + text + Reset](../screenshots/10-analyze-core-054-users-table-column-filter.jpg)
*Table column filter: Contains + text + Reset*

![Table Columns side panel (show/hide/reorder columns)](../screenshots/10-analyze-core-055-users-table-columns-panel.jpg)
*Table Columns side panel (show/hide/reorder columns)*

![Table Filters side panel](../screenshots/10-analyze-core-056-users-table-filters-panel.jpg)
*Table Filters side panel*

![Transposed table with 'Transpose Back'](../screenshots/10-analyze-core-057-users-table-transposed.jpg)
*Transposed table with 'Transpose Back'*

![Chart sort: Descending (High to low), Ascending (Low to high), Alphabetical (A to Z), Reverse alphabetical (Z to A)](../screenshots/10-analyze-core-058-users-chart-sort-dropdown.jpg)
*Chart sort: Descending (High to low), Ascending (Low to high), Alphabetical (A to Z), Reverse alphabetical (Z to A)*

![Column chart in % mode](../screenshots/10-analyze-core-059-users-chart-percent-view.jpg)
*Column chart in % mode*

![Save menu: Save to My Studio (locked), Save chart to the dashboard, Save table to the dashboard](../screenshots/10-analyze-core-060-users-save-menu.jpg)
*Save menu: Save to My Studio (locked), Save chart to the dashboard, Save table to the dashboard*

!['Upgrade to Product Analytics to save analysis' tooltip on Save to My Studio](../screenshots/10-analyze-core-061-users-save-my-studio-locked-tooltip.jpg)
*'Upgrade to Product Analytics to save analysis' tooltip on Save to My Studio*

![Save Chart to Dashboard modal: Select existing / Create New, Chart name (50 chars), Description (1000 chars), Cancel / Save](../screenshots/10-analyze-core-062-users-save-chart-to-dashboard-modal.jpg)
*Save Chart to Dashboard modal: Select existing / Create New, Chart name (50 chars), Description (1000 chars), Cancel / Save*

![Select dashboard list is empty (no custom dashboards in workspace)](../screenshots/10-analyze-core-063-users-save-chart-select-dashboard-empty.jpg)
*Select dashboard list is empty (no custom dashboards in workspace)*

![Create New: dashboard name, Dashboard visibility (New badge) Workspace + Editor](../screenshots/10-analyze-core-064-users-save-chart-create-new-dashboard.jpg)
*Create New: dashboard name, Dashboard visibility (New badge) Workspace + Editor*

![Dashboard visibility: Private (locked) / Workspace](../screenshots/10-analyze-core-065-users-dashboard-visibility-options.jpg)
*Dashboard visibility: Private (locked) / Workspace*

![Dashboard permission: Viewer (locked, 'Upgrade to Product Analytics to manage dashboard permissions') / Editor](../screenshots/10-analyze-core-066-users-dashboard-permission-options.jpg)
*Dashboard permission: Viewer (locked, 'Upgrade to Product Analytics to manage dashboard permissions') / Editor*

![Save Table to Dashboard modal (Table name, Description)](../screenshots/10-analyze-core-067-users-save-table-to-dashboard-modal.jpg)
*Save Table to Dashboard modal (Table name, Description)*

!['User analysis Walkthrough' YouTube video modal](../screenshots/10-analyze-core-068-users-watch-video-modal.jpg)
*'User analysis Walkthrough' YouTube video modal*

![Split-by query (country split by First Seen month) stuck on 'Please wait while the data loads' for over 70 s](../screenshots/10-analyze-core-135-users-split-by-query-loading.jpg)
*Split-by query (country split by First Seen month) stuck on 'Please wait while the data loads' for over 70 s*

#### Behavior

![Behavior builder: Events & filters (A, + OR, + Split by, Add Event), Filter Users, Behavior Options; Merlin promo, Set alert (locked), Save](../screenshots/10-analyze-core-069-behavior-top.jpg)
*Behavior builder: Events & filters (A, + OR, + Split by, Add Event), Filter Users, Behavior Options; Merlin promo, Set alert (locked), Save*

![Event picker empty ('Your search did not match anything')](../screenshots/10-analyze-core-070-behavior-event-list-empty.jpg)
*Event picker empty ('Your search did not match anything')*

![Analysis types: Total events, Unique users, Unique sessions (disabled), Aggregation, Aggregation distribution, Total events per user, Attribute aggregation per user](../screenshots/10-analyze-core-071-behavior-analysis-type-dropdown.jpg)
*Analysis types: Total events, Unique users, Unique sessions (disabled), Aggregation, Aggregation distribution, Total events per user, Attribute aggregation per user*

![Total events description](../screenshots/10-analyze-core-072-behavior-type-total-events-desc.jpg)
*Total events description*

![Unique users description](../screenshots/10-analyze-core-073-behavior-type-unique-users-desc.jpg)
*Unique users description*

![Unique sessions disabled: 'Session tracking is disabled, please contact MoEngage for enablement'](../screenshots/10-analyze-core-074-behavior-type-unique-sessions-disabled.jpg)
*Unique sessions disabled: 'Session tracking is disabled, please contact MoEngage for enablement'*

![Aggregation description (sum/min/max/average/median/distinct/percentile of an event attribute; formerly 'Formula')](../screenshots/10-analyze-core-075-behavior-type-aggregation-desc.jpg)
*Aggregation description (sum/min/max/average/median/distinct/percentile of an event attribute; formerly 'Formula')*

![Aggregation distribution description (bucket users by aggregated attribute, e.g. revenue)](../screenshots/10-analyze-core-076-behavior-type-aggregation-distribution-desc.jpg)
*Aggregation distribution description (bucket users by aggregated attribute, e.g. revenue)*

![Total events per user description](../screenshots/10-analyze-core-077-behavior-type-total-events-per-user-desc.jpg)
*Total events per user description*

![Attribute aggregation per user description (two-fold aggregation)](../screenshots/10-analyze-core-078-behavior-type-attribute-aggregation-per-user-desc.jpg)
*Attribute aggregation per user description (two-fold aggregation)*

![Aggregation row: View &lt;event&gt; as &lt;function&gt; of &lt;attribute&gt;](../screenshots/10-analyze-core-079-behavior-aggregation-view-as-of.jpg)
*Aggregation row: View &lt;event&gt; as &lt;function&gt; of &lt;attribute&gt;*

![Aggregation functions: Sum, Min, Max, Average, Median, Percentile, Distinct](../screenshots/10-analyze-core-080-behavior-aggregation-functions.jpg)
*Aggregation functions: Sum, Min, Max, Average, Median, Percentile, Distinct*

![Aggregation distribution with Distribution bucketing Auto/Custom](../screenshots/10-analyze-core-081-behavior-aggregation-distribution.jpg)
*Aggregation distribution with Distribution bucketing Auto/Custom*

![Custom buckets: From / to / with an interval of](../screenshots/10-analyze-core-082-behavior-aggregation-distribution-custom-buckets.jpg)
*Custom buckets: From / to / with an interval of*

![Total events per user: Aggregation type (default Average)](../screenshots/10-analyze-core-083-behavior-total-events-per-user.jpg)
*Total events per user: Aggregation type (default Average)*

![Per-user aggregation types: Min, Max, Average, Median, Percentile, Distribution](../screenshots/10-analyze-core-084-behavior-per-user-aggregation-type.jpg)
*Per-user aggregation types: Min, Max, Average, Median, Percentile, Distribution*

![Per-user Distribution with bucketing Auto/Custom](../screenshots/10-analyze-core-085-behavior-per-user-distribution-bucketing.jpg)
*Per-user Distribution with bucketing Auto/Custom*

![Attribute aggregation per user: View &lt;event&gt; as &lt;fn&gt; of &lt;attr&gt; + second-level Aggregation type](../screenshots/10-analyze-core-086-behavior-attribute-aggregation-per-user.jpg)
*Attribute aggregation per user: View &lt;event&gt; as &lt;fn&gt; of &lt;attr&gt; + second-level Aggregation type*

![Per-user (first-level) functions: Sum, Min, Max, Average, Distinct](../screenshots/10-analyze-core-087-behavior-attr-agg-first-level-functions.jpg)
*Per-user (first-level) functions: Sum, Min, Max, Average, Distinct*

![Across-users (second-level) functions: Min, Max, Average, Median, Percentile](../screenshots/10-analyze-core-088-behavior-attr-agg-second-level-functions.jpg)
*Across-users (second-level) functions: Min, Max, Average, Median, Percentile*

![Group by user property: multi-select user attributes with date-granularity submenus](../screenshots/10-analyze-core-089-behavior-group-by-user-property.jpg)
*Group by user property: multi-select user attributes with date-granularity submenus*

![Analysis type tooltip](../screenshots/10-analyze-core-090-behavior-analysis-type-tooltip.jpg)
*Analysis type tooltip*

![Group by user property tooltip ('Group all selected events by a user property')](../screenshots/10-analyze-core-091-behavior-group-by-tooltip.jpg)
*Group by user property tooltip ('Group all selected events by a user property')*

![Duration presets: Today, Yesterday, This Month, Last Month, Since, Before, Custom Range, Last N D/W/M](../screenshots/10-analyze-core-092-behavior-duration-presets.jpg)
*Duration presets: Today, Yesterday, This Month, Last Month, Since, Before, Custom Range, Last N D/W/M*

![Custom Range: two-month calendar with From/To, Reset, Cancel/Done](../screenshots/10-analyze-core-093-behavior-duration-custom-range.jpg)
*Custom Range: two-month calendar with From/To, Reset, Cancel/Done*

!['Since' mode: analysis capped at 365 days; end date auto-set](../screenshots/10-analyze-core-094-behavior-duration-since.jpg)
*'Since' mode: analysis capped at 365 days; end date auto-set*

!['+ OR' adds an alternative event inside series A](../screenshots/10-analyze-core-095-behavior-or-event.jpg)
*'+ OR' adds an alternative event inside series A*

![Two event series A and B ('2 Events')](../screenshots/10-analyze-core-096-behavior-two-events.jpg)
*Two event series A and B ('2 Events')*

![Set alert locked: 'Upgrade to Product Analytics to set Alerts'](../screenshots/10-analyze-core-097-behavior-set-alert-locked.jpg)
*Set alert locked: 'Upgrade to Product Analytics to set Alerts'*

![Behavior info tooltip](../screenshots/10-analyze-core-098-behavior-info-tooltip.jpg)
*Behavior info tooltip*

![Save tooltip: 'Perform Behavior analysis and save it.'](../screenshots/10-analyze-core-099-behavior-save-tooltip.jpg)
*Save tooltip: 'Perform Behavior analysis and save it.'*

![Filter Users section (segments, compare, exclude)](../screenshots/10-analyze-core-100-behavior-filter-users.jpg)
*Filter Users section (segments, compare, exclude)*

![Behavior chart and Behavior table empty states](../screenshots/10-analyze-core-101-behavior-chart-table-empty-state.jpg)
*Behavior chart and Behavior table empty states*

!['Behavior Analytics Walkthrough' video modal](../screenshots/10-analyze-core-102-behavior-watch-video-modal.jpg)
*'Behavior Analytics Walkthrough' video modal*

![Placeholder event injected into local form state: '+ Attributes' link appears and APPLY enables](../screenshots/10-analyze-core-132-behavior-placeholder-event-attributes-link.jpg)
*Placeholder event injected into local form state: '+ Attributes' link appears and APPLY enables*

![Loading state after APPLY ('Please wait while the data loads'); cards auto-collapse](../screenshots/10-analyze-core-133-behavior-loading-state.jpg)
*Loading state after APPLY ('Please wait while the data loads'); cards auto-collapse*

![Error state: 'The event or attribute required for this analysis could not be located. Please check your event configuration or contact support.'](../screenshots/10-analyze-core-134-behavior-event-not-found-error.jpg)
*Error state: 'The event or attribute required for this analysis could not be located. Please check your event configuration or contact support.'*

#### Funnels

![Funnels builder: Steps 1-2, Add Step, Exclude events toggle, Filter Users, Funnel Options (Type, Duration, Funnel split, Holding Attribute, Funnel window, Order Strict)](../screenshots/10-analyze-core-103-funnels-top.jpg)
*Funnels builder: Steps 1-2, Add Step, Exclude events toggle, Filter Users, Funnel Options (Type, Duration, Funnel split, Holding Attribute, Funnel window, Order Strict)*

![Funnels info tooltip](../screenshots/10-analyze-core-104-funnels-info-tooltip.jpg)
*Funnels info tooltip*

![Funnel Type: Funnel - Unique Users / All Occurrences, Time to convert - Unique Users / All Occurrences, Frequency - Unique Users / All Occurrences](../screenshots/10-analyze-core-105-funnels-type-dropdown.jpg)
*Funnel Type: Funnel - Unique Users / All Occurrences, Time to convert - Unique Users / All Occurrences, Frequency - Unique Users / All Occurrences*

![Funnel - Unique Users description](../screenshots/10-analyze-core-106-funnels-type-unique-users-desc.jpg)
*Funnel - Unique Users description*

![Funnel - All Occurrences description](../screenshots/10-analyze-core-107-funnels-type-all-occurrences-desc.jpg)
*Funnel - All Occurrences description*

![Time to convert - Unique Users description](../screenshots/10-analyze-core-108-funnels-type-ttc-unique-users-desc.jpg)
*Time to convert - Unique Users description*

![Time to convert - All Occurrences description](../screenshots/10-analyze-core-109-funnels-type-ttc-all-occurrences-desc.jpg)
*Time to convert - All Occurrences description*

![Frequency - Unique Users description](../screenshots/10-analyze-core-110-funnels-type-frequency-unique-users-desc.jpg)
*Frequency - Unique Users description*

![Frequency - All Occurrences description](../screenshots/10-analyze-core-111-funnels-type-frequency-all-occurrences-desc.jpg)
*Frequency - All Occurrences description*

![Time to convert: 'Time taken to convert from Step 1 to Step 2' + Distribution bucketing](../screenshots/10-analyze-core-112-funnels-ttc-options.jpg)
*Time to convert: 'Time taken to convert from Step 1 to Step 2' + Distribution bucketing*

![TTC custom buckets: From/to with unit, interval with unit](../screenshots/10-analyze-core-113-funnels-ttc-custom-buckets.jpg)
*TTC custom buckets: From/to with unit, interval with unit*

![Bucket units: Minute(s), Hour(s), Day(s)](../screenshots/10-analyze-core-114-funnels-ttc-bucket-units.jpg)
*Bucket units: Minute(s), Hour(s), Day(s)*

![Funnel window units: Minute(s), Hour(s), Day(s)](../screenshots/10-analyze-core-115-funnels-window-units.jpg)
*Funnel window units: Minute(s), Hour(s), Day(s)*

![Funnel split tooltip: group by event property, device property or user property values](../screenshots/10-analyze-core-116-funnels-split-tooltip.jpg)
*Funnel split tooltip: group by event property, device property or user property values*

![Holding Attribute tooltip: keep an event attribute constant across all steps](../screenshots/10-analyze-core-117-funnels-holding-attribute-tooltip.jpg)
*Holding Attribute tooltip: keep an event attribute constant across all steps*

![Funnel window tooltip: max time between first and last step](../screenshots/10-analyze-core-118-funnels-window-tooltip.jpg)
*Funnel window tooltip: max time between first and last step*

![Order 'Strict' tooltip: enforces strict ordering (A > B > A > C not counted)](../screenshots/10-analyze-core-119-funnels-order-strict-tooltip.jpg)
*Order 'Strict' tooltip: enforces strict ordering (A > B > A > C not counted)*

![Frequency: 'Frequency of Step 1 before Step 2' + Distribution bucketing](../screenshots/10-analyze-core-120-funnels-frequency-options.jpg)
*Frequency: 'Frequency of Step 1 before Step 2' + Distribution bucketing*

![Bucketing tooltip: lower bound included, upper bound excluded](../screenshots/10-analyze-core-121-funnels-bucketing-tooltip.jpg)
*Bucketing tooltip: lower bound included, upper bound excluded*

![Exclude events from funnel: 'Event should not occur between Step 1 and Step 2' + event; + Exclude Event](../screenshots/10-analyze-core-122-funnels-exclude-events.jpg)
*Exclude events from funnel: 'Event should not occur between Step 1 and Step 2' + event; + Exclude Event*

![Exclusion step-range dropdown](../screenshots/10-analyze-core-123-funnels-exclude-between-steps.jpg)
*Exclusion step-range dropdown*

![Three steps ('3 steps with 1 excluded event') with reorder arrows](../screenshots/10-analyze-core-124-funnels-three-steps.jpg)
*Three steps ('3 steps with 1 excluded event') with reorder arrows*

![Save tooltip: 'Perform Funnels analysis and save it.'](../screenshots/10-analyze-core-125-funnels-save-tooltip.jpg)
*Save tooltip: 'Perform Funnels analysis and save it.'*

![Set alert locked: 'Upgrade to Product Analytics to set Alerts'](../screenshots/10-analyze-core-126-funnels-set-alert-locked.jpg)
*Set alert locked: 'Upgrade to Product Analytics to set Alerts'*

![Funnel chart and Funnel table empty states](../screenshots/10-analyze-core-127-funnels-chart-table-empty.jpg)
*Funnel chart and Funnel table empty states*

!['Funnel Analytics Walkthrough' video modal](../screenshots/10-analyze-core-128-funnels-watch-video-modal.jpg)
*'Funnel Analytics Walkthrough' video modal*

![Steps with placeholder event names (local state only): collapsed step summary view](../screenshots/10-analyze-core-129-funnels-steps-placeholder-events.jpg)
*Steps with placeholder event names (local state only): collapsed step summary view*

![Expanded step with '+ Attributes' (event attribute filter)](../screenshots/10-analyze-core-130-funnels-step-expanded-attributes.jpg)
*Expanded step with '+ Attributes' (event attribute filter)*

![Attributes tooltip: filter step events by event attributes such as Platform, App Version ('Don't show again' left unticked)](../screenshots/10-analyze-core-131-funnels-attributes-tooltip.jpg)
*Attributes tooltip: filter step events by event attributes such as Platform, App Version ('Don't show again' left unticked)*
