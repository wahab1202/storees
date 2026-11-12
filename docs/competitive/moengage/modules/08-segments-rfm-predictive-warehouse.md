## 08. Segment > RFM, Predictive & Warehouse segments

Storees reaches RFM and predictions with less setup than MoEngage and manages its models in more depth: the RFM grid works from install on Shopify orders, and prediction goals get derived windows, nightly retraining, Global and Active AUC, version rollback and hour-level cart scoring. Neither feature leads to targeting yet: RFM cells cannot be saved as segments or sent a campaign, segment rules on a prediction bucket never match because of a casing bug, and RFM lacks MoEngage's date range, audience filter, RF/FM/RM models, results table and export. Warehouse Segments, a paid add-on not enabled on this account, has no Storees counterpart.

### MoEngage overview

MoEngage puts three advanced segment types under Segment. All three are linked from the Segment flyout, and RFM and Predictive are also cards in the global Create > New Segment picker.

- **RFM Segments** (`/v4/segmentation/rfm-analysis`) is an analysis page you configure before it runs.
  - **Setup:** Recency, Frequency and Monetary events (Monetary comes from the App Settings Conversion Goal), a model (RFM, RF, FM or RM), a date range, an audience filter with an optional exclusion group, and an Apply button.
  - **Results:** a treemap, a user-transition dependency wheel with a Transition Duration control, R/F/M distribution charts and a table of R/F/M scores and values. Charts and tables export to PNG, JPEG, SVG, PDF, XLS or CSV.
  - **Actions:** clicking a cell can create a segment (type `rfm_segment`), create a campaign, or analyze the users.
- **Predictive Segments** (`/v4/ds`) is a filterable list of propensity models, with a one-page create form at `/v4/ds/create`.
  - **Types:** dormancy, uninstall, conversion and custom. At most one model per type except custom, and five in total.
  - **Outcome:** written as a sentence: Executes or Does Not Execute an event, with extra filters, in the next 7 to 56 days.
  - **Schedule:** the lookback is fixed at 60 days. The model runs on creation, then weekly on a chosen weekday, and results take 24-48 h.
  - **Output:** each model writes a high/medium/low user property and creates three segments automatically.
  - **List:** shows prediction quality and user distribution. Archive is the only row action.
- **Warehouse Segments** (`/v4/segmentation/warehouse-audience`) is a paid add-on that is not enabled on this account, so only its upsell page was seen. According to the app code, it builds zero-copy audiences on Snowflake, BigQuery, Redshift or Databricks, using either a SQL editor or a no-code builder over a warehouse schema.

**Capture limits.** This workspace has no Conversion Goal and no events. RFM results, prediction results, the Archive flow and the warehouse builder were therefore read from the loaded page code, not seen on screen. Nothing was created:
- "Create prediction" and "I'm interested" were not clicked.
- RFM Apply only produced a client-side validation toast.

| Page visited | URL path |
|---|---|
| Segment flyout (entry point) | Hover flyout on the sidebar Segment icon (seen over `/v4/campaigns/all`) |
| RFM Segments | `/v4/segmentation/rfm-analysis` |
| Predictive Segments - All predictions | `/v4/ds` |
| Create prediction | `/v4/ds/create` |
| Warehouse Segments (locked upsell) | `/v4/segmentation/warehouse-audience` |
| Create New > Segment (global '+' menu) | Sidebar "+ Create New" modal (opened over `/v4/segmentation/warehouse-audience`) |

### Storees counterpart

- **RFM: the "Customer Lifecycle" card at the top of `/segments`.**
  - **Where it lives:** the card is rendered at `packages/frontend/src/app/(dashboard)/segments/page.tsx:83` by `packages/frontend/src/components/segments/LifecycleChart.tsx`. Its data comes from `GET /api/segments/lifecycle` (`packages/backend/src/routes/segments.ts:59-68`), which runs `packages/segments/src/lifecycle.ts`.
  - **How it works:** it needs no setup and is recomputed on every request from each customer's order totals. The treemap is a 3x3 grid of Recency against a value axis that averages Frequency and Monetary. Its 9 named cells each come with retention tactics.
  - **Tabs:** the same five as MoEngage (RFM Model, User Transitions, Recency, Frequency, Monetary), with a KPI strip above them.
  - **Drill-down:** cells and bars open `/customers?rfm=` (`packages/frontend/src/app/(dashboard)/customers/page.tsx`), filtered by `packages/backend/src/routes/customers.ts:81-130`.
  - **Caveats:** the card is hidden when a project has no saved segments. The User Transitions tab compares snapshots of saved segments (`packages/backend/src/services/transitionService.ts`), which can also be browsed at `/analytics/transitions`.
- **Predictions: Analytics > Predictions.**
  - **Where it lives:** pages `packages/frontend/src/app/(dashboard)/analytics/predictions/page.tsx` and `.../predictions/[goalId]/page.tsx`. APIs `/api/prediction-goals` (`packages/backend/src/routes/predictionGoals.ts`) and `/api/predictions` (`packages/backend/src/routes/predictions.ts`). Models come from the XGBoost service in `packages/ml` (`propensity/serve.py`, `shared/windows.py`, `shared/labeling.py`).
  - **Create:** goal cards and a two-step wizard (domain presets, or a custom event). Windows are derived from the data or pinned by hand.
  - **Training and scoring:**
    - Models retrain nightly (`packages/backend/src/workers/predictionTrainingScheduler.ts`).
    - Batch scoring runs daily.
    - Goals with windows under a day are scored as their events arrive (`scoringScheduler.ts`, `scoringWorker.ts`, `predictionTriggerWorker.ts`).
  - **Model health and results:** Global and Active AUC, an AUC trend, version rollback, and a scored-customer list for each goal.
  - **Segment builder:** each active goal adds `<goal> — bucket` and `<goal> — score` fields (`packages/backend/src/services/predictionFieldDefs.ts`, compiled in `packages/segments/src/evaluator.ts`).
  - **Profile:** each customer has a Predictions tab (`packages/frontend/src/components/customers/PredictionsTab.tsx`).
  - **Known gaps:** bucket rules never match (casing bug), and no segments are created automatically.
- **Warehouse: nothing.** The closest thing is the copy-based scheduled REST pull connector (`packages/backend/src/services/connectors/genericHttpConnector.ts`). It is set up in the super-admin Data Sources panel (`packages/frontend/src/app/(dashboard)/projects/page.tsx`).

**Path key for the Evidence column.** Line numbers are at commit `2063cdc`.

| Short name | Repo path |
|---|---|
| `LifecycleChart.tsx`, `SFB` (SegmentFilterBuilder.tsx), `ExportAudienceButton.tsx` | `packages/frontend/src/components/segments/` |
| `PredictionsTab.tsx` | `packages/frontend/src/components/customers/` |
| `components/data-sources/*` | `packages/frontend/src/components/data-sources/` |
| `segments/page.tsx`, `segments/create/page.tsx` | `packages/frontend/src/app/(dashboard)/segments/` |
| `customers/page.tsx`, `dashboard/page.tsx`, `campaigns/create/page.tsx`, `projects/page.tsx` | `packages/frontend/src/app/(dashboard)/` |
| `predictions/page.tsx`, `[goalId]/page.tsx` | `packages/frontend/src/app/(dashboard)/analytics/predictions/` |
| `analytics/page.tsx`, `transitions/page.tsx` | `packages/frontend/src/app/(dashboard)/analytics/` (transitions is `analytics/transitions/page.tsx`) |
| `Sidebar.tsx` | `packages/frontend/src/components/layout/Sidebar.tsx` |
| `hooks/*.ts`, `lib/predictionQuality.ts`, `providers.tsx` | `packages/frontend/src/hooks/`, `packages/frontend/src/lib/`, `packages/frontend/src/app/` |
| `routes/*.ts`, `index.ts` | `packages/backend/src/routes/`, `packages/backend/src/index.ts` |
| `predictionGoalService.ts`, `predictionFieldDefs.ts`, `mlProxyService.ts`, `transitionService.ts`, `analyticsService.ts`, `domainRegistry.ts`, `projectVocabulary.ts`, `entitlementService.ts`, `adAudienceExport.ts`, `customerService.ts`, `segmentService.ts`, `flowExecutor.ts`, `whatsappChatbotService.ts`, `connectors/genericHttpConnector.ts` | `packages/backend/src/services/` |
| `fcmProvider.ts` | `packages/backend/src/services/providers/` |
| `scoringScheduler.ts`, `scoringWorker.ts`, `trainingWorker.ts`, `predictionTrainingScheduler.ts`, `predictionTriggerWorker.ts` | `packages/backend/src/workers/` |
| `schema.ts` | `packages/backend/src/db/schema.ts` |
| `packs/ecommerce.json` | `packages/backend/src/packs/ecommerce.json` |
| `lifecycle.ts`, `evaluator.ts`, `templates.ts` | `packages/segments/src/` |
| `labeling.py`, `windows.py` | `packages/ml/shared/` |
| `serve.py`, `train_propensity.py` | `packages/ml/propensity/` |
| `publish_results.py` | `packages/ml/publish_results.py` |

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Entry points | Segment menu: New Segment, All Segments, Search Users | Flyout items "+ New Segment", "All Segments", "Search Users" | ✅ Full | `Sidebar.tsx:56-57`; Create Segment button (`segments/page.tsx:44-50`); customer search box (`customers/page.tsx:184-204`) matching name, email or phone with ILIKE (`routes/customers.ts:63-71`) | None functionally. The nav is a flat list, not a flyout. | — | — |
| Entry points | RFM Segments and Predictive Segments in the Segment section | Flyout links RFM Segments (`/v4/segmentation/rfm-analysis`) and Predictive Segments (`/v4/ds`) | 🟡 Partial | RFM is only the `LifecycleChart` card in the non-empty branch of `segments/page.tsx:80-83`; the empty state (65-79) skips it. Predictions are under Analytics (`analytics/page.tsx:64`) and a dashboard card (`dashboard/page.tsx:192`). No RFM or Predictions item in `Sidebar.tsx:54-71` | No dedicated RFM page and no link to predictions from Segments. A project with zero saved segments never sees the RFM chart. | P3 | S |
| Entry points | New User Import / User Imports | "+ New User Import" and "User Imports" (import history) | 🟡 Partial | JSON bulk API for customers, orders, products and dealers (`routes/v1Import.ts:57-415`). Super-admin REST pull connectors with sync history and logs (`projects/page.tsx` → `components/data-sources/ConnectorsSection.tsx`, `SyncHistoryTable.tsx`; `routes/dataConnectors.ts:269-338`). No CSV or file upload anywhere in `packages/frontend/src` | No file upload, column mapping or import list for project admins. Moving an opt-in list over from another vendor needs an engineer or a super admin. | P1 | M |
| Entry points | New File Segment (uploaded static list) | "+ New File Segment" and a File Segment card; saved file segments can be picked in the Custom segment filter | ❌ Missing | Segments are rule-only: `filters` is NOT NULL (`schema.ts:303-321`) and membership is rebuilt from the filters (`segmentService.ts`). No upload or manual-membership route in `routes/segments.ts` | A list of users cannot be uploaded as a segment. Rated P0 in module 07, which covers the same capability in depth. | P0 | M |
| Entry points | User Exports | "User Exports" in the flyout | 🟡 Partial | The only exports are a hashed ad-audience CSV per segment (`ExportAudienceButton.tsx`; `adAudienceExport.ts:24,139-196`), one customer's GDPR export (`routes/customers.ts:922`) and a consent export (`routes/v1Onboarding.ts:908`) | No plain export of users and attributes, and no export history. | P2 | M |
| Entry points | Global "+ Create" modal with a segment type picker | Create > Segment > New Segment cards: Filter, RFM, File, Predictive (plus Warehouse when enabled), with hover descriptions | 🟡 Partial | Only the Create Segment button on `/segments` (`segments/page.tsx:44-50`), which opens the filter builder and its Segment AI panel (`segments/create/page.tsx`). No cross-module create menu | Only filter segments can be created; there is no type picker or global create entry. | P3 | S |
| RFM Segments | Monetary source / Conversion Goal prerequisite | Monetary comes from the App Settings Conversion Goal; without one the events card is empty and nothing runs | ⭐ Storees better | `lifecycle.ts:27-43` reads `total_orders`, `total_spent` and `last_order_date`. These are kept up to date from orders, excluding cancelled, refunded and returned ones (`customerService.ts:681-720`; `projectVocabulary.ts:140`), so RFM works from install. The purchase mapping can be changed only in super-admin Event Mapping (`Sidebar.tsx:64-68`) | None for Shopify shops. Project admins cannot change the event or amount field that feeds Monetary. | — | — |
| RFM Segments | R/F/M event configuration (Recency; Frequency, optionally the same event; Monetary plus a revenue attribute) | Three event slots; Frequency can reuse the Recency event; Monetary needs a revenue attribute | 🟡 Partial | The dimensions are fixed (`lifecycle.ts:37-72`): R = days since last order (falls back to `last_seen`), F = `total_orders`, M = `total_spent`. `useLifecycleChart` sends no parameters (`hooks/useSegments.ts:37-42`) | RFM cannot be built on other events (e.g. site visits for Recency) or another revenue property. | P3 | M |
| RFM Segments | Analysis type: RFM (three dimensions) | RFM model with server-named segments and an R, F and M score and value for each | 🟡 Partial | 3x3 grid (`lifecycle.ts:53-141`). Recency bands are 0-30, 31-90 and 90+ days. The value axis averages F (1 / 2-5 / 6+ orders) and M (the project's P50/P90 of spend). 9 named cells, Champions through Lost | Thresholds are fixed. F and M are merged into one axis, so there are no separate R/F/M scores and no finer segments. | P3 | M |
| RFM Segments | Analysis types RF, FM, RM | Dropdown RFM / RF / FM / RM with hover descriptions; the subtitle and visible tabs follow the model | ❌ Missing | Neither `getLifecycleChart(db, projectId)` (`lifecycle.ts:23-26`) nor `GET /api/segments/lifecycle` (`routes/segments.ts:59-68`) takes a model parameter | No two-dimension variants, e.g. recency + frequency that ignores spend. | P3 | M |
| RFM Segments | Date range (default last 30 days; presets, Last N D/W/M, custom range) | Date-range picker in RFM Options; Custom Range opens a two-month calendar | ❌ Missing | RFM uses lifetime totals as of now (`lifecycle.ts:28-42`); the endpoint takes no dates | RFM cannot be computed over a window such as the last 12 months. | P2 | M |
| RFM Segments | Filter Users: All users or a filtered audience | Radios All users / Filter users by, with the standard filter builder | ❌ Missing | Always `project_id = ? AND total_orders > 0` (`lifecycle.ts:42`). `filterSqlForProject` (`projectVocabulary.ts:491`) already compiles a FilterConfig and could be reused | RFM cannot be run for a sub-audience such as one city, one collection's buyers or a saved segment. | P2 | M |
| RFM Segments | Scoping filters: User property and User behavior (Has / Has Not Executed) | Tabs User property and User behavior; "Please fill all values" when incomplete | 🟡 Partial | The segment builder has equivalent conditions: attribute rules, and "Performed a specific event" at least / at most / exactly N times, where at most 0 means not executed (`SFB:612-730`). Validation is at `SFB:1203-1293`. None of it is wired into RFM | Available for segments and campaigns, but not for scoping RFM (depends on the Filter Users row). | P2 | S |
| RFM Segments | Scoping filters: User affinity and Custom segment (member of a saved segment) | Tabs User affinity (Has Executed + event) and Custom segment (pick a saved or file segment) | ❌ Missing | No segment-membership or affinity condition in `evaluator.ts`, `SFB` or `domainRegistry.ts`. Only flow condition nodes have "In Segment" (`flowExecutor.ts:527-528`) | Neither RFM nor any segment can be scoped by membership of another segment or by attribute affinity. | P2 | M |
| RFM Segments | Exclude Users | A checkbox adds a separate exclusion filter group | ❌ Missing | No exclusion in RFM. An exclusion builder exists only for campaign audiences (`campaigns/create/page.tsx:452-453,617,1300-1312`) | Staff, wholesale or test buyers cannot be removed from the RFM base. | P3 | S |
| RFM Segments | Apply, validation and run states | Apply validates ("Please fill the required fields."). The code also has building, failed, timed-out and "configuration changed" states | 🟡 Partial | No Apply step: the chart computes on load with a skeleton (`LifecycleChart.tsx:45-56`) and has an empty state (170-177). On an API error the component returns null (line 58), so the whole card disappears | No error or timeout message and no retry. | P3 | S |
| RFM Segments | Result tabs RFM Model / User Transition / Recency / Frequency / Monetary, with a treemap | Chart tabs, with a squarified treemap for the RFM model | ✅ Full | The same tab set (`LifecycleChart.tsx:24`). The RFM Model tab is a Recharts Treemap of the 9 cells with count and % (164-297) | None. Cells narrower than about 64 px hide their labels (228-231). | — | — |
| RFM Segments | User Transition view (migration between two periods; dependency wheel and a Period 1 / Period 2 table) | Dependency wheel and a table of RFM-segment moves between two periods of equal length | 🟡 Partial | The tab lists the top 8 from → to moves with count and % (`LifecycleChart.tsx:382-480`). It compares snapshots of saved segments (`transitionService.ts:11-28`), not RFM cells. It also takes `dates[length-2]` → `dates[length-1]`, but `getSnapshotDates` returns newest first (`transitionService.ts:33-43`), so it compares the two oldest of the last 24 snapshots in reverse order. A Sankey of saved-segment moves exists at `/analytics/transitions` | No migration between RFM cells, and the tab compares the wrong periods, reversed. | P2 | M |
| RFM Segments | Transition Duration (N + Day/Week/Month; max 730 days, 105 weeks or 25 months) | Number input, unit dropdown and Apply | 🟡 Partial | No duration input. `/analytics/transitions` lets you pick From and To among the latest 24 snapshot dates (`transitions/page.tsx:26-32,110-136`). Automatic snapshots come from a 168-hour `setInterval` that does not run on boot, so every restart resets the countdown (`scoringScheduler.ts:208-212`). A manual Take Snapshot button exists | Periods are limited to snapshots that happen to exist. A backend deployed more than once a week never takes one automatically. | P2 | M |
| RFM Segments | Chart and table export (PNG, JPEG, SVG, PDF, XLS, CSV) | Export menu on the chart and table cards | ❌ Missing | No export in `LifecycleChart.tsx`; the only segment export is the hashed ad-audience CSV | RFM results cannot be downloaded for reporting. | P2 | S |
| RFM Segments | Data freshness label and "Refresh data" (3-minute cooldown) | Results are cached; a "Data from (time)" label and manual refresh | ✅ Full | Computed on every request (`routes/segments.ts:59-68` → `lifecycle.ts`), with a 30-second client cache (`providers.tsx:14`) | No "as of" timestamp is shown. | — | — |
| RFM Segments | Results table (segment, R/F/M score and value, user count, %) | A table card under the chart; the RF/FM/RM versions drop the unused pair | 🟡 Partial | Count and % per cell on the treemap and in its tooltip, with the recency band and value tier (`LifecycleChart.tsx:306-358`). No table view and no score or value range per dimension | No table of the segments with their R/F/M definitions. | P2 | S |
| RFM Segments | Distribution views (Recency / Frequency / Monetary groups with user counts) | Column charts plus tables of the groups | ✅ Full | `lifecycle.ts:177-270` and `DistributionTab` (`LifecycleChart.tsx:502-603`): 3 recency, 5 frequency and 3 monetary bands, each with count and %, plus an insight line | None for the views. Two drill-down bugs: the "High Value (top 10%)" bar does nothing because its label is not in `MONETARY_RFM_MAP` (`lifecycle.ts:215` vs `LifecycleChart.tsx:490-494`), and the Low and Medium Value bars open the frequency+monetary composite list (`routes/customers.ts:104-129`), not the spend tier the bar counts. | P3 | S |
| RFM Segments | Act on a cell: see the users | "Click to take action" opens an Engage Users panel; "View Segment" after a segment is created | ✅ Full | Clicking a cell, or a recency or monetary bar, opens `/customers?rfm=<recency>_<value>` (`LifecycleChart.tsx:186-188,521-530`). The list is filtered on the server with SQL that mirrors the chart (`routes/customers.ts:81-130`) and shows a removable badge (`customers/page.tsx:53-72,231-247`) | None for cells. See Distribution views for the monetary-bar mismatch. | — | — |
| RFM Segments | Act on a cell: Create segment | Segment name and description; then View, Analyze or Create campaign. Saved as type `rfm_segment` | ❌ Missing | No RFM field in the evaluator or field catalog: a grep for `rfm` finds only the customer-list filter (`routes/customers.ts:56-130`). `/customers` has no save-as-segment action, and `segments/create` reads no URL parameters. The seeded "Champions" and "Loyal Customers" segments use different thresholds from the grid cells (`packs/ecommerce.json`; `templates.ts:13-38`) | RFM cells cannot become targetable segments, and the P50/P90 spend thresholds cannot be expressed in the builder. Add an `rfm_cell` field that reuses the customers-route SQL, and a "Save as segment" action. | P1 | S |
| RFM Segments | Act on a cell: Create campaign | Campaign configuration: target audience (optionally with a trigger condition), channel type, delivery type | ❌ Missing | No such action in `LifecycleChart.tsx`. Campaign create reads only the `channel`, `type` and `nba*` parameters, and `segmentId` starts empty (`campaigns/create/page.tsx:412-447`) | Cannot go straight from a cell (e.g. Can't Lose) to a WhatsApp win-back. This follows from the Create segment row plus a `segmentId` URL parameter. | P2 | S |
| RFM Segments | Act on a cell: Analyze segment | Choose an analysis type to run on the cell's users | ❌ Missing | No analyze action. The funnel and time-series services declare `segmentId` / `segmentIds` but never use them (`analyticsService.ts:39,341`) | Cannot analyze an RFM cohort's behaviour. | P3 | M |
| RFM Segments | Team filter | A Team dropdown when the Teams feature is enabled | ❌ Missing | No teams. RFM is project-wide and ignores agent and manager scope (`routes/segments.ts:59-68`; `lifecycle.ts:23-42`), while the drill-down applies `customerScopeFilter` (`routes/customers.ts:61`) | Dealer and agent users see project-wide RFM counts that do not match their scoped drill-down. | P3 | M |
| RFM Segments | Help: title tooltip, "Know more", "Watch video", model tooltips | Info tooltip, docs link, a YouTube walkthrough modal, and a tooltip for each model | 🟡 Partial | A one-line subtitle (`LifecycleChart.tsx:69-73`) and a tooltip on each cell with 3 retention tactics (339-353). The subtitle says "Recency vs. Monetary Value", but the axis averages F and M (`lifecycle.ts:77-87`) | Users are not told how the cells are defined. | P3 | S |
| Predictive Segments | Predictions list filters (Search, Created, Type, Status, Clear all) | Filter bar above the list; empty state "No predictions created yet!" | ❌ Missing | A grid of cards with no search or filters (`predictions/page.tsx:241-252`). An empty state with "Create your first prediction" exists (255-266) | No search or filtering. This matters little at 5-6 goals per project. | P3 | S |
| Predictive Segments | List columns (name, type, status, created, last refreshed) and row click to results | Table with those columns; clicking a row opens the model's results | 🟡 Partial | Each card shows the name, a status badge (active / paused / not trained yet / not enough data yet / training…), the goal and the events it reads, the windows and the last-trained date, plus a "View Customers" link (`predictions/page.tsx:370-505`) | No created date, no explicit type and no sortable table. | P3 | S |
| Predictive Segments | Prediction quality metric | An accuracy score with a tooltip ("above 60 is good") | ⭐ Storees better | Global and Active AUC with a quality label (Unusable / Fair / Good / Strong / Cycle-Based) on each card (`predictions/page.tsx:445-489`; `lib/predictionQuality.ts:48-71`). An AUC sparkline of the last 14 runs (825-876). The detail header warns when the global figure flatters the active one (`[goalId]/page.tsx:224-286`). The per-segment AUC table (937-1010) is broken: it reads snake_case keys, but runs are stored in camelCase without `n` (`trainingWorker.ts:177-185`; ML responses are camel-cased in `mlProxyService.ts:76-87,140`) | Expanding "Segments (N)" calls `s.n.toLocaleString()` on undefined, and with no `error.tsx` the whole page blanks. Fix the key names and the missing count. | P2 | S |
| Predictive Segments | User distribution column (% of users in high / medium / low) | A column in the list | 🟡 Partial | Only on the goal detail page, as bucket tiles and a Score Distribution bar (`[goalId]/page.tsx:338-428`) | Cannot compare goals' distributions at a glance. | P3 | S |
| Predictive Segments | Row action: Archive | The row menu has only Archive; the confirm warns that the model's attributes and segments are archived too | 🟡 Partial | Each card has Pause/Activate, Re-train and Delete (`predictions/page.tsx:500-563`). Delete is refused, naming the segments, while any segment uses the goal (`routes/predictionGoals.ts:485-498`). Pause does not stick: the 21:30 UTC sweep queues every goal with no status filter (`predictionTrainingScheduler.ts:88-107`), and a successful run sets `status: 'active'` (`trainingWorker.ts:157-166`). Pack goals are protected from deletion only in the UI (`predictions/page.tsx:539`; no origin check in `predictionGoalService.ts:276-310`) | A paused goal is active again the next morning: it resumes scoring and reappears in the segment builder. Skip paused goals in the sweep and keep their status after training. Add an archive state that warns about dependent segments. | P2 | S |
| Predictive Segments | Model limits (at most 1 per type except custom; 5 in total) | Caps enforced in the UI and code | ⭐ Storees better | No caps. Only a unique name per project is enforced, with a 409 (`routes/predictionGoals.ts:283-291`). Industry packs create 5 goals automatically (`packs/ecommerce.json`) | None for users. Nothing bounds the compute either: every goal retrains nightly and the plan entitlement is not enforced (see the permissions row). | — | — |
| Predictive Segments | Create/manage permissions and Demo-account gating | Creation disabled on Demo accounts; users without create/manage rights see a permission message | ❌ Missing | `/api/prediction-goals` and `/api/predictions` are mounted with `requireAuth` only (`index.ts:217,224`), and no route checks a role. Manager and agent users can create, retrain, promote, pause and delete goals, and Analytics is visible to every role (`Sidebar.tsx:58`). The `predictions` entitlement is off on the 14-day trial plan (`entitlementService.ts:37-40`), but nothing reads it; only `ai_chatbot` is checked (`whatsappChatbotService.ts:117`) | No role or plan gating. An agent can delete a goal or roll it back to an old model version, which changes targeting for the whole project, and trial tenants get ML training. Add `requireRole('admin')` to the write routes and enforce the entitlement. | P1 | S |
| Predictive Segments | Prediction type: Predict conversion (default) | A card for the propensity to convert, writing "Propensity to Convert" | ✅ Full | The "Predict Conversion" preset targets the built-in `purchase` meaning (`predictions/page.tsx:60`). The pack creates "Propensity to Purchase" (`packs/ecommerce.json`). Labelled in `labeling.py:93-101` | None. | — | — |
| Predictive Segments | Prediction type: Predict dormancy | A card for the propensity to become dormant; defaults to Does Not Execute | ✅ Full | The "Predict Dormancy" preset (`predictions/page.tsx:61`), labelled by activity (`labeling.py:132-152`) | None. The definition (no events or orders in the window) is fixed. | — | — |
| Predictive Segments | Prediction type: Predict custom (action of interest) | "Users satisfy the following condition" + event, with a user-named output property | ✅ Full | "Custom Prediction" card (`predictions/page.tsx:668-674`). The server accepts any event the project has sent (`routes/predictionGoals.ts:262`; `predictionGoalService.ts:252-260`). It is resolved to `event:<name>` (`train_propensity.py:229-269`) and labelled by whether the event happens in the window (`labeling.py:194-240`) | Only positive, single-event outcomes (see the operator and filter rows). | — | — |
| Predictive Segments | Prediction type: Predict uninstall | A card for the propensity to uninstall the app, writing "Propensity to Uninstall" | ➖ N/A | The SDK is web-only (`packages/sdk/src`). No uninstall event is recorded; dead FCM tokens are only cleared (`fcmProvider.ts:149-163`) | Not relevant to Shopify web storefronts. For app-based verticals, recording an `app_uninstalled` event when a token dies would let a custom goal predict it. | — | — |
| Predictive Segments | Forecast window "in the next N days" (7 to 56) | A dropdown in 7-day steps | ⭐ Storees better | Windows are derived per project from its purchase or activity rhythm and tested on held-out rounds (`windows.py`), or set by hand in days or hours (`predictions/page.tsx:729-795`). Windows under a day, such as about 5 h for carts, are scored on each event and expire (`scoringScheduler.ts:24-47`; `predictionTriggerWorker.ts`; `[goalId]/page.tsx:132-188`) | None. | — | — |
| Predictive Segments | Outcome event picker (searchable) | An event picker with search in the condition row | ✅ Full | A "Target Event" select of the project's event names, with the preset's built-in meaning first (`predictions/page.tsx:692-728`) | The select has no search. | — | — |
| Predictive Segments | Outcome operator "Does Not Execute" on any event | Executes / Does Not Execute on the outcome condition, for any event | 🟡 Partial | Negative outcomes exist only as the built-in churn and dormancy meanings (`labeling.py:119-152`). Custom goals predict only that an event happens (`labeling.py:194-240`) | Cannot predict "will NOT do X" for a custom event. | P3 | M |
| Predictive Segments | "+ Filter" extra conditions and "Reset filter" | More conditions and attribute filters on the outcome | ❌ Missing | A goal stores only `targetEvent` (`schema.ts:870-912`), and labelling matches the event name only (`labeling.py:216`) | Cannot predict outcomes such as "purchase over ₹2,000" or "purchase from collection X". | P2 | M |
| Predictive Segments | Lookback "Generate prediction basis data from last 60 days" | Locked at 60 days (the code allows 30-60) | ⭐ Storees better | The observation window is derived from the data (default 90 days) or pinned to any whole number of days (`predictions/page.tsx:755-765`; `routes/predictionGoals.ts:228-250`) | None. | — | — |
| Predictive Segments | Refresh frequency "every 7 days, on a chosen weekday" | Runs on creation, then weekly; the interval is locked at 7 days | ⭐ Storees better | Models retrain nightly at 21:30 UTC with catch-up after downtime (`predictionTrainingScheduler.ts:50,123-147`). Batch scoring runs every 24 h (`scoringScheduler.ts:25-76,176-186`), goals with windows under a day are re-scored as events arrive, and Re-train and Re-train all are available | No per-goal schedule. The sweep also retrains paused goals (see the Archive row). | — | — |
| Predictive Segments | First run on creation and the results-timing note (24-48 h) | An info note that sets expectations; the model runs immediately on creation | 🟡 Partial | A new goal is not trained on creation (`predictionGoalService.ts:112-126`); it waits for a Re-train click or the nightly sweep. The toast says only "Prediction goal created" (`predictions/page.tsx:627`). Training, failure and refusal banners exist (155-229) | No "train now" on create, and nothing tells the user when scores will appear. | P3 | S |
| Predictive Segments | Output user property (high / medium / low) for segmentation | "Propensity to Convert / for Dormancy / to Uninstall" = high / medium / low, under "Predictive Insights by Sherpa" | 🟡 Partial | Each active goal adds `<goal> — bucket` (options high / medium / low) and `<goal> — score` (0-100) under "AI & Predictions" (`predictionFieldDefs.ts:24-50`; `routes/v1Schema.ts:38-43`). Both writers store "High" / "Medium" / "Low" (`serve.py:174-179`; `publish_results.py:43,170-172`; upserted by `scoringWorker.ts:175-196`), but `is` compiles to a case-sensitive `::text =` (`evaluator.ts:879-882,1179-1186`). The two writers also band differently: a fixed 70/40 score versus percentile bands. The static "Risk Bucket", "Conversion Score" and "Dormancy Risk Score" fields (`domainRegistry.ts:166-168`) read metrics that nothing writes | "Bucket is high" matches nobody and "is not" matches everyone, which breaks the main thing predictions are bought for. Compare with `lower()`, as `routes/predictions.ts:95` already does, or store lowercase. Use one banding rule and drop the dead static fields. Score filters work. | P0 | S |
| Predictive Segments | Auto-created segments: low, medium and high for each prediction | Three segments created automatically, ready to target | ❌ Missing | Neither scoring (`scoringWorker.ts`) nor goal code (`predictionGoalService.ts`) creates segments; segments are inserted only by packs, onboarding and the segments route. The bucket tiles only filter the detail list (`[goalId]/page.tsx:338-376`) | Users must build every prediction segment by hand, and bucket rules are broken today. | P1 | S |
| Predictive Segments | Custom model: user-named property (required) and optional description, 100 chars each | Custom predictions name and describe the output property | 🟡 Partial | The goal name doubles as the field label. `prediction_goals` has no description column (`schema.ts:870-912`), so pack goal descriptions are not stored either | No separate property name or description. | P3 | S |
| Predictive Segments | Create prediction submit (disabled until valid; success toast and redirect) | "Create prediction" posts the model; no auto-save | ✅ Full | Create stays disabled until a name and a target are set (`predictions/page.tsx:803-813`). The server checks the target, the windows and the unique name (`routes/predictionGoals.ts:216-295`), and its error text is shown word for word (630-641) | None. | — | — |
| Warehouse Segments | Zero-copy audiences on warehouse data (paid add-on; "I'm interested" request) | Locked upsell page with "Learn more" and "I'm interested"; BigQuery is early access | ❌ Missing | A case-insensitive grep for snowflake, bigquery, redshift and databricks across `packages` finds nothing, and there are no warehouse drivers in the backend or ML dependencies. The closest capability is the copy-based scheduled REST pull connector (`connectors/genericHttpConnector.ts`) in the super-admin Data Sources panel | Audiences cannot be built from a warehouse. | P3 | XL |
| Warehouse Segments | Warehouse connectors (Snowflake, BigQuery, Redshift; Databricks catalogs) feeding Email, SMS, Push, In-app and WhatsApp | Diagram and code constants | ❌ Missing | Same grep: no warehouse drivers. The output channels exist for ordinary segments | No warehouse connectivity. | P3 | L |
| Warehouse Segments | Benefit tabs (No Syncing, Instant Audiences, Privacy & Compliance, Zero Dependencies, Cost Efficiency) | Marketing tabs on the upsell page | ➖ N/A | In-app marketing content, not product functionality | Not applicable. | — | — |
| Warehouse Segments | "Warehouse - SQL" and "Warehouse - filter" builders; Edit / Duplicate | Two warehouse segment types; table preview `SELECT * FROM <table> LIMIT 10` | ❌ Missing | Segments only compile a FilterConfig into Postgres SQL (`evaluator.ts`). There is no SQL segment type and no Duplicate: the card actions are Edit, Archive or Delete, Export and View members (`segments/page.tsx:145-193`) | No SQL or warehouse-schema builder, and no segment duplication. | P3 | XL |
| Warehouse Segments | Query results / history (query time, SQL, run time, data scanned, rows, status; insert, copy, run, download; create a segment from a one-column result) | A query history table with row actions | ❌ Missing | Nothing like it in routes or the frontend | No query workspace. | P3 | L |
| Warehouse Segments | Warehouse Schema settings (Settings > Data) | Defines a warehouse schema so the no-code builder works on warehouse tables (behind a feature flag) | ❌ Missing | Settings has no warehouse schema. The field catalog is a fixed registry per vertical (`domainRegistry.ts`) | No mapping of warehouse tables. | P3 | L |

**Status counts (57 rows):** ✅ Full 10, 🟡 Partial 19, ❌ Missing 20, ⭐ Storees better 6, ➖ N/A 2.

### Storees-only strengths

- **Retention tactics for each RFM cell.** Each cell's tooltip says what to do next (for example "Urgent win-back, Personal outreach" for Can't Lose), which helps D2C marketers who are not RFM experts (`lifecycle.ts:131-141`; `LifecycleChart.tsx:339-353`).
- **RFM KPI strip and buyer coverage.** Returning %, Avg Frequency, Avg Order Value and Avg CLV sit beside the grid, along with buyers against contacts who have never purchased. The labels adapt to fintech and SaaS projects (`lifecycle.ts:98-110,162-172`; `LifecycleChart.tsx:27-37,75-127`).
- **Drill-down from RFM cells and bars to a filtered customer list.** The customers in a cell can be inspected at once, without creating a segment first (`LifecycleChart.tsx:186-188,521-530`; `routes/customers.ts:81-130`). Caveat: two monetary bars land on the wrong list (see Distribution views).
- **Model version history with Promote / rollback.** A bad nightly retrain can be undone in one click, without an ML engineer (`predictions/page.tsx:878-932`; `routes/predictionGoals.ts:371-462`; ML `/promote` in `serve.py`).
- **Model diagnostics beyond one quality score.** Each goal shows Global and Active AUC side by side, with a warning when the global figure is flattered by dormant customers. A sparkline tracks AUC over the last 14 runs with the change from the previous run (`predictions/page.tsx:445-489,825-876`; `[goalId]/page.tsx:224-286`). Caveat: the per-segment AUC table crashes the page when expanded (see Verification notes).
- **Short-window, real-time predictions (cart abandonment in hours) with a live worklist.** Live Carts, cart value and an "Expires in" countdown let a team act while a cart can still be recovered, which a weekly-refreshed prediction cannot (`[goalId]/page.tsx:132-188,479-637`; `scoringScheduler.ts:24-47`; `predictionTriggerWorker.ts`).
- **Extra built-in goals and industry presets.** Cart Abandonment, Repeat Purchase and Churn Risk, plus fintech, SaaS and edtech presets, cover D2C questions beyond MoEngage's four types. Packs create the goals automatically (`predictions/page.tsx:58-89`; `packs/*.json`).
- **Scored-customer list per goal with measured outcome rates.** Bucket tiles show "x% actually happened" where the outcome is known, plus score, bucket and confidence with pagination. This shows who is in each band and whether that band's predictions came true (`[goalId]/page.tsx:338-376,466-706`; `routes/predictions.ts:21-265`).
- **Per-customer scores on the profile.** Support and sales staff can see each customer's score and bucket for every active goal (`PredictionsTab.tsx`; `routes/predictions.ts:267-312`). Caveat: the "Why this score?" panel is empty for most goals. A SHAP explain endpoint exists (`routes/predictions.ts:317-346`), but no UI calls it, and stored factors are empty for every goal except cart goals.
- **Training transparency.** Banners for the ML service being down, for models training now, for training versus scoring failures, and for refusal reasons on each card. Marketers see why a model has no scores instead of waiting 24-48 h with nothing to go on (`predictions/page.tsx:155-229,387-395`; `routes/predictionGoals.ts:36-165`).
- **Numeric propensity score thresholds that combine across goals.** Rules such as "conversion score > 70 AND churn score < 30" allow finer targeting than a high/medium/low property, and these filters work today (`predictionFieldDefs.ts:42-48`; `evaluator.ts:1188-1194`).
- **Transition analysis across all saved segments, with snapshots and a Sankey view.** Tracks movement between any segments (VIP to At Risk), not only RFM cells (`transitions/page.tsx`; `components/analytics/SankeyDiagram.tsx`; `transitionService.ts`). Caveat: "Create Flow" goes to `/flows/new`, which does not exist, and "View users" sends `?segment=`, which the customers page ignores; it reads `segmentId` (`transitions/page.tsx:50-67`).

### UX notes

- **Navigation.** MoEngage makes RFM, Predictive and Warehouse first-class segment types: three entries in the Segment flyout (screenshot 001) and cards in the global Create > New Segment picker (045). Storees shows RFM only as a card at the top of `/segments`, which is not rendered at all when a project has zero saved segments (`segments/page.tsx:65-83`). Predictions sit under Analytics. Worth adopting: a Segments sub-nav (All segments, RFM, Predictions), or a type picker on "Create segment" offering "From an RFM cell" and "From a prediction bucket".
- **Time to value is a Storees strength to lead demos with.** MoEngage's RFM page is three setup accordions plus Apply, and in this workspace it showed nothing until a Conversion Goal was set (002, 017, 020). Storees draws the grid at once from Shopify orders. When date range and audience controls are added, keep them as one compact bar above the chart, not MoEngage's stack of accordions.
- **Acting on a cell is the main workflow gap.** In MoEngage a cell click opens Engage Users with create segment, create campaign and analyze. Storees' tooltip says "Click to view customers →" (`LifecycleChart.tsx:355`) and opens a list with no "save as segment" or "send" action. Worth adopting: a popover on cell click with View customers, Save as segment and Send campaign, defaulting to WhatsApp for India D2C. Campaign create would also need to accept a segment passed in the link (`campaigns/create/page.tsx:412-447`).
- **Chart plus table.** MoEngage pairs the RFM chart with a table (segment, R/F/M score and value, users, %) and an export menu (003, 004). Storees shows only the treemap, and cells narrower than about 64 px hide their labels (`LifecycleChart.tsx:228-231`), so small but important cells such as Can't Lose can only be read on hover. Add a compact table with CSV download under the treemap.
- **Naming consistency.** One page shows the same names with different meanings:
  - The subtitle says "Recency vs. Monetary Value", but the value axis averages Frequency and Monetary (`lifecycle.ts:77-87`).
  - The seeded "Champions" and "Loyal Customers" segments use different thresholds from the grid cells of the same name (`packs/ecommerce.json`).
  - The seeded "New Customers" segment means "first seen in the last 7 days", while the grid's New Customers are recent low-value buyers.
  - The drill-down badge drops the cell names altogether ("Recent × Low Value", `customers/page.tsx:53-72`).

  Align them, ideally by making the grid cells the segments.
- **The User Transitions tab under the RFM chart is misleading.** It compares snapshots of saved segments, not RFM cells. It also picks the two oldest snapshot dates in reverse order: `LifecycleChart.tsx:386-388` assumes oldest-first, but `transitionService.ts:33-43` returns newest-first. MoEngage's equivalent is RFM-cell migration over an explicit Transition Duration. Fix the date selection, and consider snapshotting RFM cell membership.
- **Prediction create form.** MoEngage uses one page with a plain-language sentence ("User should be considered converted if the user [Executes] [event] in the next [7] days", 025). Its Prediction results block tells the marketer exactly which property and three segments they will get, and when (026). Storees' two-step wizard (preset cards, then name and target) is quicker but never says what the output is or when it will exist. A new goal is not trained until Re-train is clicked or the nightly sweep runs (`predictionGoalService.ts:112-126`). Add a preview of the outputs and their timing, and train on create by default.
- **Predictions list.** MoEngage uses a filterable table with Prediction quality and User distribution columns (021). Storees' cards carry far more model-health detail, so keep the cards. Add a small high/medium/low bar to each card (today it is only on the detail page) and a "Create segment" action on each bucket tile on the detail page. Fix the per-segment AUC expander before any demo, because it blanks the page.
- **Pause and archive semantics.** Storees' Pause is silently undone by the nightly retrain. Make Pause stick, and before pausing or deleting, show which segments read the goal (`segmentsUsingGoal` already finds them), as MoEngage's Archive confirm does.
- **Explainability.** The profile's "Why this score?" panel says "No explainability factors available yet" for every non-cart goal, although `POST /api/predictions/:customerId/explain` returns SHAP factors. Call it when the panel opens.
- **Locked-feature pattern.** MoEngage presents paid add-ons as explained, locked pages with "Learn more" and "I'm interested" (038), which captures demand. Storees defines a `predictions` plan entitlement, off on the trial plan (`entitlementService.ts:37-40`), but never enforces it. A similar locked page for gated features would make plan limits visible instead of silent.
- **Error states.** `LifecycleChart` returns null on an API error (line 58), so the RFM card silently disappears. MoEngage has explicit "Analysis failed" and "Request timed out" states. Add an inline error with a retry button.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status. Missing and partial rows were searched under synonyms:
- import, csv, upload, papaparse, static, clone, export, download
- rfm, lifecycle, recency, affinity, in_segment, member_of
- snowflake, bigquery, redshift, databricks, warehouse, uninstall
- archive, entitlement, requireRole

55 of 57 statuses held. Changes:

- **New User Import / User Imports: ❌ Missing → 🟡 Partial.** Imports exist, just not from files: the JSON bulk API (`routes/v1Import.ts:57-415`) and the super-admin REST pull connectors, which have a per-sync history and logs (`components/data-sources/SyncHistoryTable.tsx`; `routes/dataConnectors.ts:269-338`). What is missing is a CSV or file upload with column mapping that project admins can use.
- **Row action: Archive: ⭐ Storees better → 🟡 Partial, priority — → P2, effort — → S.** Pause does not stick. The nightly sweep queues every goal with no status filter (`predictionTrainingScheduler.ts:88-107`), and a successful run writes `status: 'active'` (`trainingWorker.ts:157-166`). A paused goal is therefore re-activated the next morning, resumes scoring, and its fields reappear in the segment builder. Pack goals are protected from deletion only in the UI.
- **Create/manage permissions: P2 → P1, evidence corrected.** The `predictions` entitlement is off on the 14-day trial plan, not on the starter plan as first stated; starter maps to full access (`entitlementService.ts:37-53`). No prediction route checks a role. Manager and agent users can therefore delete goals or promote an old model version, and those models drive project-wide targeting. Neither the `/api/prediction-goals` nor the `/api/predictions` router has a role check (`index.ts:217,224`).
- **New File Segment: P1 → P0.** This is the same capability as module 07's file-segment row, which is rated P0. Aligned so the gap list does not carry two priorities.
- **Act on a cell: Create campaign: P1 → P2.** It is blocked by "Create segment" (P1): once a cell can be saved, the existing campaign builder can target it. Module 07 rates create-campaign-from-a-segment P2.
- **Prediction quality metric: priority — → P2, effort — → S (⭐ Storees better kept).** The per-segment AUC table crashes.
  - Runs store camelCase entries without `n`. The training worker writes the Active and Dormant entries itself (`trainingWorker.ts:177-185`), and ML responses are camel-cased (`mlProxyService.ts:76-87,140`).
  - The table reads `segment_type`, `segment_label`, `n` and `delta_vs_overall` (`predictions/page.tsx:942-998`).
  - Expanding "Segments (N)" calls `s.n.toLocaleString()` on undefined. There is no `error.tsx` anywhere in `packages/frontend/src/app`, so the page blanks.
  - The ML `/train` response does not forward the behaviour, region or dealer breakdowns either (`serve.py:289-337`), so only the Active/Dormant pair is ever stored.
- **Distribution views: priority — → P3, effort — → S (✅ Full kept).** Besides the dead "High Value (top 10%)" bar, the Low and Medium Value bars open the frequency+monetary composite list (`routes/customers.ts:104-129`), not the spend tier the bar counts.
- **Output user property (🟡 Partial and P0 kept): evidence extended.**
  - `publish_results.py` also writes capitalized bands.
  - The two writers band differently: a fixed 70/40 score in `serve.py:174-179` against percentile bands in `publish_results.py:43`.
  - `routes/predictions.ts:91-95` already compares with `lower()` and explains the casing, but the segment evaluator does not.
  - The static "Risk Bucket", "Conversion Score" and "Dormancy Risk Score" fields read metrics nothing writes. "Risk Bucket" defaults to "low" (`evaluator.ts:1153-1154`), so "Risk Bucket is low" matches every customer.
- **Minor evidence fixes (status and priority unchanged):**
  - Sidebar line numbers are 56-57.
  - The RFM badge is at `customers/page.tsx:231-247`.
  - Predictions are also linked from a dashboard card (`dashboard/page.tsx:192`).
  - The weekly snapshot timer does not fire on boot (`scoringScheduler.ts:208-212`).
  - The nightly sweep also retrains paused goals.
  - The Model limits row now notes that nothing bounds compute.
- **Storees-only list corrected:**
  - The per-segment AUC table was listed as a strength; it crashes the page.
  - The profile's "explainability": the SHAP endpoint exists but is never called, and stored factors are empty for non-cart goals.
  - The transitions page's "View users" link was added to the known-broken "Create Flow" link.
- **Confirmed after trying to refute them:**
  - **Bucket casing bug:** builder options are lowercase (`predictionFieldDefs.ts:40`), are submitted unchanged (`SFB:466-480`), and are compared with `::text =`.
  - **User Transitions order:** the tab's date order is reversed against `getSnapshotDates`.
  - **No RFM targeting:** there is no RFM, segment-membership or affinity field in the evaluator.
  - **No warehouse code:** none of the four warehouse names appear anywhere, and there are no drivers.
  - **No RFM export:** the RFM card has no export.
  - **Analytics ignores segments:** the analytics services accept `segmentId` / `segmentIds` but never read them.
  - **Training on create:** new goals are not trained on creation, but the nightly sweep picks them up.
  - **Pack goal deletion:** the API deletes pack goals; only the UI hides the button.
- **Security seen along the way.** The data-connector API (`routes/dataConnectors.ts`), whose UI is super-admin only, has no role check, so any project member can create, delete or sync connectors through the API.

### Screens

#### Segment flyout (entry point)

![Segment flyout: New Segment, New User Import, New File Segment, Search Users, All Segments, RFM Segments, Warehouse Segments, Predictive Segments, User Imports, User Exports](../screenshots/08-segments-rfm-predictive-warehouse-001-segment-flyout.jpg)
*Segment flyout: New Segment, New User Import, New File Segment, Search Users, All Segments, RFM Segments, Warehouse Segments, Predictive Segments, User Imports, User Exports*

#### RFM Segments

![RFM Segments default state: events card, missing Conversion Goal notice, Filter Users, RFM Options (RFM, last 30 days), Apply](../screenshots/08-segments-rfm-predictive-warehouse-002-rfm-page-top.jpg)
*RFM Segments default state: events card, missing Conversion Goal notice, Filter Users, RFM Options (RFM, last 30 days), Apply*

![RFM chart card, empty state](../screenshots/08-segments-rfm-predictive-warehouse-003-rfm-chart-empty.jpg)
*RFM chart card, empty state*

![Table card, empty state](../screenshots/08-segments-rfm-predictive-warehouse-004-rfm-table-empty.jpg)
*Table card, empty state*

![Title info tooltip explaining RFM analysis (behavior-based segmentation on engagement and transaction history)](../screenshots/08-segments-rfm-predictive-warehouse-005-rfm-title-tooltip.jpg)
*Title info tooltip explaining RFM analysis (behavior-based segmentation on engagement and transaction history)*

![Analysis type info tooltip: each model uses its own subset of the R/F/M events](../screenshots/08-segments-rfm-predictive-warehouse-006-analysis-type-tooltip.jpg)
*Analysis type info tooltip: each model uses its own subset of the R/F/M events*

![Analysis type options: RFM, RF, FM, RM](../screenshots/08-segments-rfm-predictive-warehouse-007-analysis-type-dropdown.jpg)
*Analysis type options: RFM, RF, FM, RM*

![Hover side panel for the RFM model, with description and Know more](../screenshots/08-segments-rfm-predictive-warehouse-008-analysis-type-rfm-detail.jpg)
*Hover side panel for the RFM model, with description and Know more*

![Hover side panel for the RF model](../screenshots/08-segments-rfm-predictive-warehouse-009-analysis-type-rf-detail.jpg)
*Hover side panel for the RF model*

![Date range presets: Today, Yesterday, This Month, Last Month, Custom Range, Last N with D/W/M buttons](../screenshots/08-segments-rfm-predictive-warehouse-010-date-range-presets.jpg)
*Date range presets: Today, Yesterday, This Month, Last Month, Custom Range, Last N with D/W/M buttons*

![Custom Range: two-month calendar, From/To, Reset, Cancel, Done (future dates disabled)](../screenshots/08-segments-rfm-predictive-warehouse-011-date-range-custom-calendar.jpg)
*Custom Range: two-month calendar, From/To, Reset, Cancel, Done (future dates disabled)*

![Filter Users expanded: All users / Filter users by, 'All users selected', Exclude Users checkbox](../screenshots/08-segments-rfm-predictive-warehouse-012-filter-users-all-users.jpg)
*Filter Users expanded: All users / Filter users by, 'All users selected', Exclude Users checkbox*

![Filter users by: tabs User property / User behavior / User affinity / Custom segment; Has Executed + Select an event; + Nested Filter; + Filter; 'Please fill all values'](../screenshots/08-segments-rfm-predictive-warehouse-013-filter-users-by-user-behavior.jpg)
*Filter users by: tabs User property / User behavior / User affinity / Custom segment; Has Executed + Select an event; + Nested Filter; + Filter; 'Please fill all values'*

![User property tab: attribute picker with search (Lifecycle: First Seen, Last Seen, LTV, No. of Conversions, No. of Sessions, Random User Bucket, User Creation Source...)](../screenshots/08-segments-rfm-predictive-warehouse-014-filter-user-property-picker.jpg)
*User property tab: attribute picker with search (Lifecycle: First Seen, Last Seen, LTV, No. of Conversions, No. of Sessions, Random User Bucket, User Creation Source...)*

![User affinity tab: Has Executed + event picker (no events in workspace)](../screenshots/08-segments-rfm-predictive-warehouse-015-filter-user-affinity.jpg)
*User affinity tab: Has Executed + event picker (no events in workspace)*

![Custom segment tab: segment picker listing 'Test File'](../screenshots/08-segments-rfm-predictive-warehouse-016-filter-custom-segment.jpg)
*Custom segment tab: segment picker listing 'Test File'*

![Exclude Users ticked: a second, separate exclusion filter group appears](../screenshots/08-segments-rfm-predictive-warehouse-017-exclude-users-block.jpg)
*Exclude Users ticked: a second, separate exclusion filter group appears*

![Behavior operator dropdown: Has Executed / Has Not Executed](../screenshots/08-segments-rfm-predictive-warehouse-018-has-executed-operator.jpg)
*Behavior operator dropdown: Has Executed / Has Not Executed*

![Watch video modal 'RFM Analysis Walkthrough' (embedded YouTube)](../screenshots/08-segments-rfm-predictive-warehouse-019-rfm-walkthrough-video-modal.jpg)
*Watch video modal 'RFM Analysis Walkthrough' (embedded YouTube)*

![Apply with no events selected: toast 'Please fill the required fields.' (client-side only, no request)](../screenshots/08-segments-rfm-predictive-warehouse-020-rfm-apply-validation-toast.jpg)
*Apply with no events selected: toast 'Please fill the required fields.' (client-side only, no request)*

#### Predictive Segments - All predictions

![All predictions list: Search, Created, Type, Status filters, Create prediction button, empty state](../screenshots/08-segments-rfm-predictive-warehouse-021-predictions-list-empty.jpg)
*All predictions list: Search, Created, Type, Status filters, Create prediction button, empty state*

![Type filter: Dormancy, Uninstall, Conversion, Custom (Clear all / Select all)](../screenshots/08-segments-rfm-predictive-warehouse-022-predictions-type-filter.jpg)
*Type filter: Dormancy, Uninstall, Conversion, Custom (Clear all / Select all)*

![Status filter: Active, Archived](../screenshots/08-segments-rfm-predictive-warehouse-023-predictions-status-filter.jpg)
*Status filter: Active, Archived*

![Created date-range presets (Today, Yesterday, This Month, Last Month, Custom Range, Last N D/W/M)](../screenshots/08-segments-rfm-predictive-warehouse-024-predictions-created-date-filter.jpg)
*Created date-range presets (Today, Yesterday, This Month, Last Month, Custom Range, Last N D/W/M)*

#### Create prediction

![Create prediction (Predict conversion default): name, 4 type cards, 1-per-type note, conversion definition](../screenshots/08-segments-rfm-predictive-warehouse-025-create-prediction-conversion-top.jpg)
*Create prediction (Predict conversion default): name, 4 type cards, 1-per-type note, conversion definition*

![Prediction settings (lookback 60 days, refresh every 7 days on Sunday, 24-48 h note) and Prediction results (Propensity to Convert + low/medium/high segments)](../screenshots/08-segments-rfm-predictive-warehouse-026-create-prediction-settings-results.jpg)
*Prediction settings (lookback 60 days, refresh every 7 days on Sunday, 24-48 h note) and Prediction results (Propensity to Convert + low/medium/high segments)*

![Refresh frequency tooltip: the model runs at once on creation, then on the chosen weekday at the chosen interval](../screenshots/08-segments-rfm-predictive-warehouse-027-refresh-frequency-tooltip.jpg)
*Refresh frequency tooltip: the model runs at once on creation, then on the chosen weekday at the chosen interval*

![Refresh weekday dropdown: Sunday to Saturday](../screenshots/08-segments-rfm-predictive-warehouse-028-refresh-weekday-dropdown.jpg)
*Refresh weekday dropdown: Sunday to Saturday*

![Forecast window 'in the next N days': 7, 14, 21, 28, 35, 42, 49, 56](../screenshots/08-segments-rfm-predictive-warehouse-029-prediction-window-days-dropdown.jpg)
*Forecast window 'in the next N days': 7, 14, 21, 28, 35, 42, 49, 56*

![Outcome operator: Executes / Does Not Execute](../screenshots/08-segments-rfm-predictive-warehouse-030-executes-operator-dropdown.jpg)
*Outcome operator: Executes / Does Not Execute*

![Outcome event picker with search (no events in this workspace)](../screenshots/08-segments-rfm-predictive-warehouse-031-prediction-event-picker-empty.jpg)
*Outcome event picker with search (no events in this workspace)*

![Predict dormancy selected: 'considered dormant if the user' + Does Not Execute + event](../screenshots/08-segments-rfm-predictive-warehouse-032-predict-dormancy-top.jpg)
*Predict dormancy selected: 'considered dormant if the user' + Does Not Execute + event*

![Dormancy results: user property 'Propensity for Dormancy' + low/medium/high segments](../screenshots/08-segments-rfm-predictive-warehouse-033-predict-dormancy-results.jpg)
*Dormancy results: user property 'Propensity for Dormancy' + low/medium/high segments*

![Predict uninstall selected: 'considered uninstalled if the user' + Executes + event](../screenshots/08-segments-rfm-predictive-warehouse-034-predict-uninstall-top.jpg)
*Predict uninstall selected: 'considered uninstalled if the user' + Executes + event*

![Uninstall results: user property 'Propensity to Uninstall' + low/medium/high segments](../screenshots/08-segments-rfm-predictive-warehouse-035-predict-uninstall-results.jpg)
*Uninstall results: user property 'Propensity to Uninstall' + low/medium/high segments*

![Predict custom selected: 'Users satisfy the following condition' + Executes + event](../screenshots/08-segments-rfm-predictive-warehouse-036-predict-custom-top.jpg)
*Predict custom selected: 'Users satisfy the following condition' + Executes + event*

![Custom results: required User property name and optional User property description (0/100 each)](../screenshots/08-segments-rfm-predictive-warehouse-037-predict-custom-results-fields.jpg)
*Custom results: required User property name and optional User property description (0/100 each)*

#### Warehouse Segments (locked upsell)

![Warehouse Segments intro/upsell page: Learn more, I'm interested, paid add-on notice, benefits tabs](../screenshots/08-segments-rfm-predictive-warehouse-038-warehouse-segments-upsell-top.jpg)
*Warehouse Segments intro/upsell page: Learn more, I'm interested, paid add-on notice, benefits tabs*

![Zoomed diagram (PNG): Snowflake, BigQuery, Redshift -> Warehouse Segments -> Email, SMS, Push, In-app, WhatsApp; Zero Copy Architecture](../screenshots/08-segments-rfm-predictive-warehouse-039-warehouse-zero-copy-diagram.png)
*Zoomed diagram (PNG): Snowflake, BigQuery, Redshift -> Warehouse Segments -> Email, SMS, Push, In-app, WhatsApp; Zero Copy Architecture*

![Tab 'No Syncing': query warehouse data in place, no data-sync pipelines](../screenshots/08-segments-rfm-predictive-warehouse-040-warehouse-tab-no-syncing.jpg)
*Tab 'No Syncing': query warehouse data in place, no data-sync pipelines*

![Tab 'Instant Audiences': segments built on the fly with no sync delay](../screenshots/08-segments-rfm-predictive-warehouse-041-warehouse-tab-instant-audiences.jpg)
*Tab 'Instant Audiences': segments built on the fly with no sync delay*

![Tab 'Privacy & Compliance': data stays in the brand's warehouse](../screenshots/08-segments-rfm-predictive-warehouse-042-warehouse-tab-privacy-compliance.jpg)
*Tab 'Privacy & Compliance': data stays in the brand's warehouse*

![Tab 'Zero Dependencies': marketers build segments without engineering or ETL](../screenshots/08-segments-rfm-predictive-warehouse-043-warehouse-tab-zero-dependencies.jpg)
*Tab 'Zero Dependencies': marketers build segments without engineering or ETL*

![Tab 'Cost Efficiency': ETL costs (tool, setup, maintenance, data-volume fee, resources) vs Warehouse Segments (none of these, minimal resource cost)](../screenshots/08-segments-rfm-predictive-warehouse-044-warehouse-tab-cost-efficiency.jpg)
*Tab 'Cost Efficiency': ETL costs (tool, setup, maintenance, data-volume fee, resources) vs Warehouse Segments (none of these, minimal resource cost)*

#### Create New > Segment (global '+' menu)

![Create > New Segment: Filter Segment, RFM Segment, File Segment, Predictive Segment](../screenshots/08-segments-rfm-predictive-warehouse-045-create-new-segment-types.jpg)
*Create > New Segment: Filter Segment, RFM Segment, File Segment, Predictive Segment*

![RFM Segment card hover: auto-segment users by Recency, Frequency, Monetary](../screenshots/08-segments-rfm-predictive-warehouse-046-create-new-rfm-card-hover.jpg)
*RFM Segment card hover: auto-segment users by Recency, Frequency, Monetary*

![Predictive Segment card hover: predict users likely to do an action (e.g. churn propensity)](../screenshots/08-segments-rfm-predictive-warehouse-047-create-new-predictive-card-hover.jpg)
*Predictive Segment card hover: predict users likely to do an action (e.g. churn propensity)*
