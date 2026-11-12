## 15. Reports: campaign & alert reports

Storees has no Reports module: there are no saved report definitions, no scheduled or emailed reports, and campaign or flow performance cannot be exported in any format (the only file exports are a hashed ad-audience CSV, a consent CSV with no UI and a per-customer GDPR JSON). On screen, its per-campaign report beats MoEngage's export in places (an attribution switch, holdout lift with incremental conversions, per-recipient failure reasons, a cross-channel Notification Log and WhatsApp spend), but any export would expose holes in the data underneath: periodic campaigns wipe each run's sends and counters, flow emails are never logged, in-app counters never move, and the Revenue card hardcodes "$". The first thing to build is a one-click "Download report" (one CSV row per campaign and flow for a date range), after fixing periodic-run history; scheduling, column pickers and formula metrics can follow.

### MoEngage overview

MoEngage's Reports module builds scheduled campaign exports; it is not a BI tool. Each saved report produces a file with one row per campaign or flow, optionally split by date, child campaign, A/B variation or locale.

- **Step 1, Select campaigns:**
  - A report name (validated and checked for uniqueness).
  - A Campaign/Flow date range: presets, Since, a custom two-month calendar and Last N D/W/M.
  - Whether performance covers only that range or the whole campaign.
  - A "Find campaigns" panel: channel × delivery type across 10 channels, tags (All/Any), creator, and an include-archived option.
  - The selection is either a dynamic "Select all" set, re-evaluated on every run, or a fixed manual list.
- **Step 2, Report format and content:**
  - Per-channel column catalogs of 26-96 columns: attributes, audience, schedule, content and delivery stats.
  - Click-through, view-through and in-session conversions, each with control-group (CG) and global-control-group (GCG) uplift.
  - Formula custom metrics, written with an `@` metric picker and `#` operators.
  - A "Split data" drawer, and a preview built from fake sample data.
- **Step 3, Scheduling and delivery:**
  - One-time: as soon as possible, or at a set date and time.
  - Periodic: daily; weekly on chosen days; or monthly on a day number or nth weekday. Each repeats every N periods and ends never, on a date, or after N runs.
  - Output: CSV (4 separators) or Excel, compressed as zip, rar or tar.
  - Delivery: email to the creator only, or fetched through the REST API. There is no S3, SFTP or webhook destination.
- **Saved reports list** (seen only in the app bundle, because the workspace had none):
  - Columns: name, creator, created at, scheduled at, type, and last run with ETA.
  - Row actions: Start/Stop, Run again, Edit, Duplicate, Download and Delete.
  - Filters by type, status, creator and team, plus role checks on create, edit and download.
- **Alert reports** cover Inform transactional alerts. Inform is a paid add-on that is not enabled here, so both alert routes redirect to the Inform promo.
- A hidden route, `/v4/reports/users`, renders Segment > User Exports.

| Page visited | URL path |
|---|---|
| Reports sidebar flyout | Hover on the Reports icon (links to the routes below) |
| Reports > Campaigns Reports (list) | `/v4/reports/campaign` |
| New Campaign Report: Step 1 Select campaigns | `/v4/reports/campaign/create?source=1` |
| New Campaign Report: Step 2 Report format and content | Same route, step 2 |
| New Campaign Report: Step 3 Scheduling and delivery | Same route, step 3 |
| Reports > Alerts Reports | `/v4/reports/inform` (redirects to `/v4/inform/transaction-alerts`) |
| Reports > + New Alert Report | `/v4/reports/inform/create?source=1` (redirects to the same promo) |
| Hidden Reports route: User Exports | `/v4/reports/users` |

**Capture limits.**
- **Not seen with data:** the saved-reports list, its filters, statuses and row actions, which come from the app's JS bundle; and the campaign picker table, because no campaigns matched (0 found).
- **Gated:** the alert (Inform) report builder, a paid add-on. "I'm interested" was not clicked, because it sends a sales request.
- **Not opened:** actions on existing reports, which need a report to exist, and the step 3 calendars (the same calendar was captured in step 1). Settings > Reports and Alerts was left to the Settings capture.
- **No changes:** "Create report" was never clicked. The builder made only read-only calls: campaign search, name check, column list and sample data.

### Storees counterpart

There is no Reports or Exports area, and no sidebar item for one (`packages/frontend/src/components/layout/Sidebar.tsx`). The closest pieces:

- **Per-campaign report:** `/campaigns/[id]` (`packages/frontend/src/app/(dashboard)/campaigns/[id]/page.tsx`) shows metric cards and three tabs:
  - Overview: funnel, conversion goals, control-group lift, attribution switch, engagement over time and top engaged recipients.
  - Recipients.
  - A/B Results.
  - API: `GET /api/campaigns/:id/analytics`, `/:id/sends` and `/:id/ab-results` (`packages/backend/src/routes/campaigns.ts`). Engine: `packages/backend/src/services/campaignAnalyticsService.ts`.
- **Campaign list:** `/campaigns` (`packages/frontend/src/app/(dashboard)/campaigns/page.tsx`) shows delivery, open and click rates per row. The data comes from `listCampaigns` (`packages/backend/src/services/campaignService.ts`), which takes only archive filters.
- **Per-flow Analytics tab:** `packages/frontend/src/components/flows/FlowAnalyticsPanel.tsx`, served by `GET /api/flows/:id/analytics` and `packages/backend/src/services/flowAnalyticsService.ts`.
- **Analytics hub:** `/analytics` (`packages/frontend/src/app/(dashboard)/analytics/page.tsx`) offers 7 analysis types. Only funnels can be saved (`saved_analyses`, `packages/backend/src/routes/analytics.ts`).
- **Notification Logs:** `/logs` (`packages/frontend/src/app/(dashboard)/logs/page.tsx`, `packages/backend/src/routes/logs.ts`), admin only.
- **WhatsApp Usage** panel in Settings (`packages/frontend/src/app/(dashboard)/settings/WhatsappUsage.tsx`, `GET /api/whatsapp/usage`).
- **Click-to-WhatsApp ad report:** `/campaigns/ctwa` (`packages/frontend/src/app/(dashboard)/campaigns/ctwa/page.tsx`). No menu links to it.
- **File exports (the only three):**
  - Segment hashed ad-audience CSV (`packages/backend/src/routes/segments.ts`, `packages/frontend/src/components/segments/ExportAudienceButton.tsx`).
  - Consent audit CSV at `GET /api/onboarding/projects/:id/consent-export` (`packages/backend/src/routes/v1Onboarding.ts`); no UI.
  - Per-customer JSON at `GET /api/customers/:id/data-export`.
- **Building blocks a report feature can reuse:**
  - BullMQ queues and cron job schedulers (`packages/backend/src/services/queue.ts`, `packages/backend/src/workers/dataSyncWorker.ts`).
  - Private object storage (`packages/backend/src/services/storageService.ts`).
  - `sendEmail` with attachments (`packages/backend/src/services/emailService.ts`).
  - Role capabilities `viewContactPii` and `exportCustomers` (`packages/backend/src/middleware/capabilities.ts`).

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Navigation & report list | Reports menu (+ New Campaign Report, + New Alert Report, Campaigns Reports, Alerts Reports) | Sidebar flyout with four links: the campaign-report builder and list, and the Inform alert-report builder and list | ❌ Missing | No Reports or Exports nav item (`Sidebar.tsx:54-71`). The Analytics hub lists 7 analyses, none an export (`analytics/page.tsx:19-71`). No report page under `app/(dashboard)` | No entry point for exporting or scheduling campaign and flow reports. Rather than a new top-level module, add "Download report" on `/campaigns` and an "Exports & scheduled reports" card on the Analytics hub. | P2 | S |
| Navigation & report list | Saved campaign reports list with empty state ("No reports yet", + Report) | `/v4/reports/campaign` lists saved report definitions; the empty state's "+ Report" opens the builder | ❌ Missing | No report or export-job table in `schema.ts`. The nearest registry, `saved_analyses`, holds only name, type and config, with no owner, schedule or runs (`schema.ts:937-947`). Only funnels use it, named through `window.prompt` (`routes/analytics.ts:176-230`; `analytics/funnels/page.tsx:129`) | Nowhere to save or list a report definition. Add a definitions table and a run-history table; `data_source_syncs` (status, started/finished, stats, error, triggered_by; `schema.ts:1368-1381`) is a ready pattern. | P2 | M |
| Navigation & report list | Report list columns (name, created by, created at, scheduled at, type, last run with ETA) | From the bundle: also "Calculating ETA", "ETA:" and "Taking longer than expected" states | ❌ Missing | No report entity. Campaigns and flows have no creator column (`schema.ts:325-345, 408-481`) | Comes with the report registry. Each run should show status, row count and a download link. | P2 | S |
| Navigation & report list | Report row actions (Start, Stop, Run again, Edit, Duplicate, Download, Delete with confirm) and toasts | From the bundle, e.g. "Your report request has been initiated" | ❌ Missing | No report routes. Reporting is per entity only: campaign analytics (`routes/campaigns.ts:883-914`), A/B results (`:917`), flow analytics (`routes/flows.ts:494-515`). Archive, unarchive and duplicate (`routes/campaigns.ts:608-658`) are reusable patterns | Report definitions need run now, pause/resume, edit, duplicate, download and delete. | P2 | M |
| Navigation & report list | Report list search and filters (name; type; status; created by; team; chips; Inform/Campaign switch) | From the bundle | ❌ Missing | No report list. No teams, only agent/manager scoping (`agentScope.ts:9-17`) | Name search plus a status filter are enough until a project has dozens of reports. | P3 | S |
| Permissions | Role checks for creating/managing, editing and downloading reports | From the bundle: "Your role doesn't have permission to create or manage a Report", "…to download a Report" | 🟡 Partial | Roles have `viewContactPii` and `exportCustomers` (`capabilities.ts:15-46`; `settings/roles/page.tsx:128-145`). These are enforced on the audience CSV (`routes/segments.ts:157`) and consent CSV (`v1Onboarding.ts:908`), and Notification Logs mask PII (`routes/logs.ts:102-104`). But the campaigns router has no role gate, its Recipients and top-recipients responses return raw emails (`routes/campaigns.ts:854-879`; `campaignAnalyticsService.ts:382-449`), and role "screens" are not enforced server-side. The per-customer JSON export checks only `requireRole('admin')` (`routes/customers.ts:922`) | Today's per-campaign report already bypasses `viewContactPii` for anyone who can call `/api/campaigns`. Apply `redactContactFields` to recipient data now, then add a manage/download-reports capability (or reuse `exportCustomers`) for export files. | P2 | S |
| Step 1: Select campaigns | 3-step "Export campaigns - create report" wizard | Select campaigns > Report format and content > Scheduling and delivery; only "Create report" writes | ❌ Missing | No report builder under `app/(dashboard)`. Multi-step builders exist for campaigns (`campaigns/create/page.tsx`) | Build it only after a one-click export exists; it earns its place once column choice and schedules are added. | P2 | M |
| Step 1: Select campaigns | Report name validation (required, 1-128 chars, starts with a letter, unique, checked on Next) | Tooltip rules; `POST /campaign_reports/validate_name`; "The report name is already taken" | ❌ Missing | No report entity. `saved_analyses.name` is not unique (`schema.ts:937-947`). Unique-name-per-project exists on prediction goals (`schema.ts:911`) | Trivial once reports are stored. | P3 | S |
| Step 1: Select campaigns | Campaign/Flow date range (Today … Last month, Since, custom two-month calendar, Last N D/W/M) | Picks campaigns and flows created, updated or sent in the range; explanatory note; maximum-range cap | ❌ Missing | The campaign list has no date filter (`campaigns/page.tsx:296-326`), and `GET /api/campaigns` takes only archive flags (`routes/campaigns.ts:67-80`). Analytics and Home have fixed page-local presets (`analytics/funnels/page.tsx:186-189`; `dashboard/page.tsx:381`), and there is no shared picker in `components/shared`. The dates exist: `campaigns.created_at/updated_at/sent_at` and `messages.created_at` | No way to ask for "everything sent last month". Build one shared range picker (presets, since, custom) for reports, the campaign list and analytics; same P1 as module 12. | P1 | M |
| Step 1: Select campaigns | Include performance data: only the selected range vs the entire campaign duration | Radio; default "Only for the selected date range" | ❌ Missing | Stats are lifetime counters on the campaign row (`schema.ts:447-454`), read straight into the funnel (`campaignAnalyticsService.ts:327-345`). Conversions count from `sent_at` to `sent_at + goal_tracking_hours` (`:135-137, 198-199`). Flow analytics cover the flow's whole life (`flowAnalyticsService.ts:70-160`). Periodic runs delete earlier sends and zero the counters (`campaignScheduler.ts:96-111`) | Range figures must be computed from per-recipient timestamps (`campaign_sends`, `messages`, `events`) instead of counters. | P2 | M |
| Step 1: Select campaigns | Channel × delivery-type filter for the channels Storees has (Email, SMS, Push, WhatsApp, In-App × One Time/Periodic, plus Flows) | Tree with search, Clear all and Select all ("24 combinations … selected") | ❌ Missing | `campaigns.channel` and `delivery_type` exist (`schema.ts:412-413`), and the list shows "WhatsApp · One-time" (`campaigns/page.tsx:361-371`). But neither the list nor `listCampaigns` filters by them (`campaignService.ts:1259-1280`), and nothing lists campaigns and flows together. Notification Logs filter messages by channel and source, not campaigns (`routes/logs.ts:18-43`) | Add channel and type filters to `GET /api/campaigns` and reuse them as the report's campaign finder. The P1 export can carry channel as a column and a parameter. | P2 | S |
| Step 1: Select campaigns | Event Triggered, Location Triggered and API Triggered delivery types | Event Triggered on most channels; Event, Location and API Triggered on Push | 🟡 Partial | Campaigns are One-time or Periodic; the Event and Device Triggered cards are disabled "Soon" (`campaigns/page.tsx:65-70`). Event-driven sends exist as flows (`schema.ts:325-345`; `flowExecutor.ts`), and `POST /api/v1/events` can start a flow, an indirect API trigger (`index.ts:170-173`). No geofence trigger and no direct send API | For reporting, flows stand in for event-triggered campaigns. Location-triggered campaigns don't exist; low relevance for Shopify web stores. | P3 | L |
| Step 1: Select campaigns | Facebook, Google Ads Audience, Connectors and Onsite messaging in the channel filter | "Others: Connectors, Flows, Onsite messaging" plus the audience channels, each One Time, Periodic or Event Triggered | ❌ Missing | No audience-sync campaigns: segments export a hashed CSV for manual upload (`adAudienceExport.ts:9-24`; `routes/segments.ts:157-181`). No connector campaign: flow `http_request` responses live only in trip context (`flowExecutor.ts:213, 815-880`). Opt-in widgets are the only onsite surface, with create, edit and delete routes only (`optinWidgets.ts:48-160`) | The channels themselves are missing (modules 05 and 12); reporting on them follows once they exist. | P3 | L |
| Step 1: Select campaigns | Campaign tags filter (All of these AND / Any of these OR; default tag set) | Tags dropdown with match mode and nine default tags | ❌ Missing | Create takes free-text tags (`campaigns/create/page.tsx:1082-1106`); they are stored (`schema.ts:469`) and accepted by POST/PATCH (`routes/campaigns.ts:250, 518`). But the edit page has no tags field, the list never reads them, `listCampaigns` ignores them (`campaignService.ts:1259-1304`), Duplicate drops them (`campaignService.ts:1310-1365`), and there is no default set | No tag filter exists anywhere (module 01 rates the same filter ❌). Tags are saved but never used. Show them as chips, add an Any/All filter (JSONB `?\|` and `?&`), add tags to edit and duplicate, and seed a default set. | P2 | S |
| Step 1: Select campaigns | Created by filter (multi-select of team users) | "Created by" dropdown of workspace users | ❌ Missing | Campaigns and flows have no `created_by` or `updated_by` (`schema.ts:325-345, 408-481`); `created_by` exists only on `user_projects`, `data_source_connectors` and `ad_conversion_destinations` (`schema.ts:1067, 1361, 1421`). The acting user is on every request (`requireAuth.ts:41`) | Record creator and last editor on campaigns and flows (existing rows stay empty). The same fields feed "Created By" and "Last Updated By" columns and audit. | P3 | S |
| Step 1: Select campaigns | Include archived campaigns checkbox | Checkbox in the Find campaigns panel | 🟡 Partial | Campaigns are soft-archived via `archived_at` (`schema.ts:477`; `routes/campaigns.ts:608-640`). `GET /api/campaigns` takes `includeArchived` and `archivedOnly` (`routes/campaigns.ts:67-80`; `campaignService.ts:1259-1270`), and the list has an Active/Archived toggle (`campaigns/page.tsx:127-130, 309-321`). Flows cannot be archived: draft, active or paused only (`routes/flows.ts:205-207`) | Reuse `includeArchived` in a report finder; add flow archiving if flows join reports. | P3 | S |
| Step 1: Select campaigns | Find campaigns and selection mode (count; dynamic "Select all" vs fixed manual list with name, ID and created on; no-results state) | Explanatory copy for recurring reports; "No campaigns found. Try again with different filters." | ❌ Missing | The list has no row selection and shows no campaign IDs (`campaigns/page.tsx:329-441`). `GET /api/campaigns` is unpaginated (`campaignService.ts:1272-1280`). No saved filter or pinned selection | Recurring reports need both a filter-defined set and a pinned list. | P2 | M |
| Step 2: Columns & metrics | Per-channel column catalog and picker (accordion per channel, tri-state tree, search, expand/collapse, Clear selection, platform filters) | Default columns: Flows 35, Push 96, Connectors 40, Email 85, Facebook 26, WhatsApp 71, Google Ads 27, InApp 62, Onsite 64, SMS 68 | ❌ Missing | No export lets the user choose columns. The only CSVs have fixed formats (`adAudienceExport.ts:9-24`; `v1Onboarding.ts:908-992`). Campaign metrics are fixed cards (`campaigns/[id]/page.tsx:418-426`) | Start with a curated default set per channel (attributes, delivery, conversions, revenue, cost), then an "Add columns" search. | P2 | M |
| Step 2: Columns & metrics | Duplicate column setup across channels | Copy icon on each channel header opens a channel dropdown | ❌ Missing | No column configuration to copy | Only useful once a column picker exists. | P3 | S |
| Step 2: Columns & metrics | Flows columns (attributes, control group, goals, audience, trips started CG/GCG/total, trips engaged, conversions, revenue, uplift and CVR per attribution type, flow ID and version) | 35 default columns; output adds Flows Id, Base Flow Id, Flow Version Name, Flow Versions | 🟡 Partial | The Analytics tab is on-screen only and covers the flow's whole life. It shows Total Trips, Completed, Exited, Completion Rate, Converted (goal event), Avg Duration, Messages Sent, Delivered and Delivery Rate, plus a node funnel, 8 weekly buckets and 20 recent trips (`FlowAnalyticsPanel.tsx:91-128`; `flowAnalyticsService.ts:70-266`; `routes/flows.ts:494-515`). The API also returns opened, clicked and a per-channel split that the UI type drops (`hooks/useFlows.ts:83-123`). Only goal conversions are tracked (`flowExecutor.ts:262-333`); there is no flow revenue (`orders` is imported but unused), holdout or versioning, and the `ab_split` branch taken is not recorded (`flowExecutor.ts:184-211`). Flow emails use `sendEmail` with no `messages` row (`flowExecutor.ts:750`), so they are missing from flow stats | Flows drive most D2C revenue (abandoned cart, post-purchase), yet they have no revenue, holdout or engaged-trip metric, and their emails are not counted. Log flow emails and add flow revenue before exporting. | P1 | M |
| Step 2: Columns & metrics | Email columns (attributes, audience, limits, variations, locales, control group, content, schedule; unique/total opens and clicks, CTOR, CTR, hard/soft bounces, unsubscribes, complaints, removal counts, failures, per-attribution conversions) | 85 default email columns | 🟡 Partial | The campaign page shows Recipients, Delivered %, Opened % (of delivered), Clicked % (of opens, i.e. CTOR), Bounced, Converted and Revenue, plus Failed and Complaints, goals and holdout lift (`campaigns/[id]/page.tsx:418-568`; `campaignAnalyticsService.ts:309-345`). Counters count each recipient once (`resendWebhook.ts:230-250`). Hard and soft bounces are split only for suppression (`resendWebhook.ts:202-211`). Unsubscribes have no campaign link (`schema.ts:713-722`). The pre-send audience preview computes suppressed, opted-out, subscription-blocked and frequency-capped counts, but they are not stored with the send (`campaignService.ts:75-89, 360-405`). Content attributes sit on the campaign row but are never exported (`schema.ts:408-478`) | Missing: total vs unique opens and clicks; a hard/soft bounce split; unsubscribe count and rate; stored removal counts; any file export. | P2 | M |
| Step 2: Columns & metrics | WhatsApp columns (sender, template, header/body/footer, buttons; Sent, Delivered, Read, Read rate, total/unique clicks, CTOR, CTR, CVR, revenue, per-attribution conversions, GCG uplift) | 71 default WhatsApp columns | 🟡 Partial | The same campaign page shows Delivered; "Opened", which is Meta's read status (`messageStatusService.ts:111-136`); Clicked, via short links (`shortLinkService.ts:55-91`); Failed, with the provider error in Recipients (`campaigns/[id]/page.tsx:736-813`); and conversions and revenue. Total clicks per link are stored (`tracked_links.click_count`, `schema.ts:834-848`) but never reported. Billable conversations by category are in a separate Settings panel (`WhatsappUsage.tsx`; `routes/whatsappAdmin.ts:962`), and usage rows carry no message or campaign ID (`schema.ts:1277-1295`) | For India-first brands this is the most-requested export. Relabel reads as "Read", add total vs unique clicks and a failure-code breakdown, and link usage rows to messages so cost can be shown per campaign. | P1 | S |
| Step 2: Columns & metrics | SMS columns (connector, message, template ID, click URL; Sent, Message parts, Delivered, Clicks, Unique clicks, CTR, conversions with revenue, ARPU, AOV, uplift) | 68 default SMS columns | 🟡 Partial | Twilio, Gupshup, Bird and Vonage receipts update `messages` and the campaign counters (`channelWebhooks.ts:43-205`; `messageStatusService.ts:111-136`). But the Gupshup handler hard-codes the channel as WhatsApp, so Gupshup SMS receipts emit `whatsapp_*` events (`channelWebhooks.ts:103`). Clicks come from tracked links, and the page shows the generic funnel. No message-parts count or DLT template ID (`schema.ts:408-478`) | Same export gap as the other channels. Capture message parts and DLT IDs, and fix the Gupshup channel tag. | P2 | S |
| Step 2: Columns & metrics | Push columns (per-OS content, rich content, buttons, geofence, Push Amp+; devices, tokens, attempted, sent, failed, impressions, clicks, CTR, FCM delivery rate, conversions) | 96 default push columns; Android/iOS/Web filter | 🟡 Partial | Push is sent through FCM with per-platform content (`schema.ts:437-438`; `types.ts:190-206`; `providers/fcmProvider.ts`). Delivered and tapped arrive only if a mobile app calls `/api/webhooks/channel/fcm` (`channelWebhooks.ts:210-234`). There is no mobile SDK, and `packages/sdk/src` has no web-push registration | Only sent and failed counts are reliable, so push reporting is thin. Low priority for Shopify web stores. | P3 | M |
| Step 2: Columns & metrics | InApp columns (trigger event, delivery controls; Impressions, Clicks, CTR, Closed, Attempted, Prioritized, conversions) | 62 default InApp columns; Android/iOS filter | 🟡 Partial | The event API writes only `campaign_sends`: shown sets `opened_at` (a repeat overwrites it), dismissed reuses `bounced_at`, and cta_clicked sets `clicked_at` (`v1InAppMessages.ts:186-232`). It never increments the campaign counters, so the metric cards, which read them, stay at "—" (`campaigns/[id]/page.tsx:418-426`). Shows and clicks appear only per recipient: the Recipients tab, top recipients and the timeline. No SDK renders in-app messages (`packages/sdk/src`) | Update the counters from the event API, count repeat impressions and closes instead of overwriting them, and label dismissals as such before exporting. | P3 | S |
| Step 2: Columns & metrics | Onsite messaging columns (page URLs, show-on pages, delivery controls; impressions, clicks, CTR, closed, conversions) | 64 default Onsite columns; Web | ❌ Missing | Onsite is limited to opt-in widgets, which have create, edit and delete routes only (`optinWidgets.ts:48-160`; `widgets/page.tsx`). Submissions post to `/api/v1/optin` (`v1OptIn.ts:81`). "Shown" is tracked only in the visitor's localStorage (`sdk/src/widget.ts:35-148`) | No onsite impression, click or close stats to report. | P3 | M |
| Step 2: Columns & metrics | Connectors, Facebook and Google Ads Audience columns (attempted/sent/user count; eligible/attempted/synced users, ad account and audience IDs, conversions) | Default columns: Connectors 40, Facebook 26, Google Ads 27 | ❌ Missing | No connector or audience-sync campaigns; audiences are a manual hashed CSV (`adAudienceExport.ts:9-24`). Flow `http_request` results stay in `trip.context.node_outputs` (`flowExecutor.ts:815-880`). The nearest logs belong to event relays, not campaigns: outbound-webhook deliveries (`routes/webhookSubscriptions.ts:178`) and Conversions API sent/failed counters (`schema.ts:1416-1420`) | Depends on audience sync (module 12: P1, L) and per-request logging. | P3 | L |
| Step 2: Columns & metrics | Conversion metrics per attribution type with CG and GCG uplift (click-through, view-through, in-session: converted users, events, revenue, ARPU, AOV, CVR, uplift) | Repeated in every channel's Delivery Stats; goals expand into Goal 1..5 columns | 🟡 Partial | Per campaign there is an Any/View-through/Click-through switch (`campaignAnalyticsService.ts:20-33, 139-161`; `campaigns/[id]/page.tsx:570-622`), several goals each with revenue in the campaign currency (`campaignAnalyticsService.ts:120-223`; `page.tsx:491-529`), and holdout lift with incremental conversions (`campaignAnalyticsService.ts:225-304`; `page.tsx:531-568`). The API also returns revenue per recipient (ARPU) and per conversion (`campaignAnalyticsService.ts:461-468`). Only the latter is shown, as a sub-line on a Revenue card that hardcodes "$" (`page.tsx:425`) although `campaigns.currency` exists. Lift ignores the attribution switch, and there is no GCG or in-session attribution. Across campaigns, the list compares only delivery, open and click rates (`campaigns/page.tsx:347-349, 386-421`) | Add GCG and in-session attribution, show ARPU, fix the currency, and put conversions and revenue on the list and in exports. | P2 | M |
| Step 2: Columns & metrics | Custom metric builder (name + formula; `@` metric picker by attribution type, `#` operators + - / \*, validation) | "Add a custom metric" modal with examples Revenue/Clicks, Converted Users/Sent, Open/Sent | ❌ Missing | No formula or computed-metric code in backend, frontend or shared (searched custom metric, formula, computed metric, calculated field) | Spreadsheets cover this once data can be exported. | P3 | M |
| Step 2: Columns & metrics | Report format preview (Update preview, sample-data table per channel tab, fullscreen) | "Preview does not contain actual campaign data" | ❌ Missing | No report builder or export preview | If built, preview the first rows of real data, which Storees computes live in Postgres. | P3 | S |
| Step 2: Split data | Split by date (one row per date per campaign; adds a Date column) | Option in the "Split data options" drawer | 🟡 Partial | The "Engagement Over Time" chart shows delivered, opened and clicked in Hour (72h), Day (90d) or Week (52w) buckets (`campaignAnalyticsService.ts:347-379`; `campaigns/[id]/page.tsx:596-666`). Only the first 24 buckets are drawn (`page.tsx:635`), and each send is bucketed by its delivery time, so opens and clicks land on the delivery day (`campaignAnalyticsService.ts:359`). No per-day conversions or revenue; flows have 8 weekly trip buckets (`flowAnalyticsService.ts:113-127`) | Export daily rows per campaign and flow (sent, delivered, read, clicked, conversions, revenue), each counted on the date the event happened. | P2 | S |
| Step 2: Split data | Split by child campaigns (one row per run of a periodic campaign) | Option in the "Split data options" drawer | ❌ Missing | Periodic runs reuse the campaign row. Each run deletes every earlier `campaign_sends` row and zeroes the counters (`campaignScheduler.ts:96-111`), and `campaign_sends` is unique on (campaign, customer) (`schema.ts:506`), so there is no run ID. SMS, WhatsApp and push `messages` rows survive but carry no run ID; email writes no `messages` row, so earlier email runs are lost entirely. The same scheduler reads `timeOfDay` while the builder saves `time`, and never checks `endsAt` (`campaignScheduler.ts:16-43`; `types.ts:224-230`) | A data-loss bug as well as a missing split: a periodic campaign only ever shows its last run, and (as in module 02) runs drift and never stop. Add a run table or a `run_id` on sends, stop deleting history, honour the send time and end date, then report per run. | P1 | M |
| Step 2: Split data | Split by variations (one row per A/B variation) | Option in the "Split data options" drawer | 🟡 Partial | The A/B Results tab compares A and B on sent, open rate and click rate, with a rough z-score "confidence" (`campaignAnalyticsService.ts:484-543`; `campaigns/[id]/page.tsx:815-932`). The variant is stored per recipient (`schema.ts:500`). Only two variants, and no conversions or revenue per variant | Add conversions and revenue per variant, and one row per variant in exports. | P2 | S |
| Step 2: Split data | Split by locales (one row per locale) | Option in the "Split data options" drawer | ❌ Missing | Campaigns have no locale or language variants (`schema.ts:408-481`; `campaigns/create/page.tsx`). Only WhatsApp templates carry a language (`schema.ts:1184`) | Needs multi-language content first, which matters for Hindi and regional WhatsApp templates. The split itself is small after that. | P3 | L |
| Step 3: Scheduling | One Time - As soon as possible (on-demand report run) | Default: "The report will go out as soon as possible" | ❌ Missing | No report job or file. Campaign analytics is JSON for one campaign at a time, behind admin JWT auth (`routes/campaigns.ts:883-914`; `requireAuth.ts:13-48`). Building blocks: BullMQ queues and workers (`queue.ts`; `workers/`), private object storage (`storageService.ts:134-170`), and CSV responses already used elsewhere (`routes/segments.ts:157-181`; `v1Onboarding.ts:908-992`, which streams rows) | The core gap of this module: campaign and flow performance cannot be taken out of Storees. Ship "Download report" first: one row per campaign and flow for a date range and channel, generated in the background for large projects. | P1 | M |
| Step 3: Scheduling | One Time - At a specific date and time | Start date and send time (hh:mm am/pm) | ❌ Missing | No report scheduling. One-time campaign scheduling polls `scheduled_at` every minute (`campaignScheduler.ts:45-70`) | Rarely needed; fold it into the report scheduler. | P3 | S |
| Step 3: Scheduling | Periodic reports - Daily, Weekly, Monthly | Periodic options with start date and send time | ❌ Missing | No report schedules or digest emails (searched digest, scheduled report, report schedule). Reusable: BullMQ `upsertJobScheduler` with cron patterns (`dataSyncWorker.ts:144-155`; `aggregateReconcileWorker.ts:62-70`), the periodic schedule UI (`campaigns/create/page.tsx:3264-3345`) and email attachments (`emailService.ts:10-21`). Not reusable: the campaign scheduler, which polls with `setInterval` and ignores send time and end date (`campaignScheduler.ts:16-43, 124-131`) | No weekly performance email for founders and agencies. Build it on BullMQ job schedulers after the on-demand export. | P2 | M |
| Step 3: Scheduling | Advanced recurrence (every N days/weeks/months; several weekdays; monthly day 1st-31st/Last or nth weekday; Ends Never / On / After N; Reset to defaults) | Full recurrence editor; end date defaults to one year later | ❌ Missing | Nothing for reports. The campaign periodic schedule is simpler: one weekday, day of month 1-28 and an optional end date, with no "every N" or "after N runs" (`campaigns/create/page.tsx:3264-3345`). Its end date is never enforced (`campaignScheduler.ts:16-43`) | Daily, weekly or monthly with an enforced end date covers most D2C needs. | P3 | S |
| Step 3: File & delivery | CSV file output | File format CSV (default) | ❌ Missing | CSV exists only for the segment ad audience (`routes/segments.ts:172-176`) and the consent audit (`v1Onboarding.ts:921-922`); there is no campaign, flow, analytics or log CSV. The frontend downloads files only in `ExportAudienceButton.tsx:54-57` and `useDataSubject.ts:39-43` | A CSV of campaign and flow performance (and of Notification Logs) is the first deliverable. Add a UTF-8 BOM so ₹ and Hindi text open cleanly in Excel. | P1 | S |
| Step 3: File & delivery | CSV separator choice (comma, pipe, colon, semicolon) | Separator buttons, CSV only | ❌ Missing | Existing CSVs use commas only (`adAudienceExport.ts`; `v1Onboarding.ts:924-930`) | Rarely needed. | P3 | S |
| Step 3: File & delivery | Excel output | File format EXCEL, which hides Separator | ❌ Missing | No spreadsheet library in any `package.json` (searched xlsx, exceljs, sheetjs) | Indian MIS teams live in Excel. CSV covers most of it, so XLSX can follow. | P2 | S |
| Step 3: File & delivery | Compression (Zip, Rar, Tar) | Compression buttons; Zip default | ❌ Missing | No archiving library; `compression()` is gzip on HTTP responses only (`index.ts:99`) | Only matters for very large files. | P3 | S |
| Step 3: File & delivery | Send to Email (recipient locked to the creator) | Recipient dropdown disabled and pre-filled with the logged-in user's email | ❌ Missing | No report emails. Admin emails already exist: the WhatsApp template recategorisation alert (`templateAlertService.ts:1-40`) and trial reminders (`trialLifecycleService.ts:61-73`). `sendEmail` accepts attachments (`emailService.ts:10-21`) | Email scheduled reports. Allowing several recipients (founder, agency) would beat MoEngage's creator-only lock. | P2 | S |
| Step 3: File & delivery | Send to REST API (download reports programmatically) | Help text linking to the Campaign Report API docs; no S3, SFTP or webhook destination | ❌ Missing | Campaign analytics is only on admin routes that need a JWT (`requireAuth.ts:13-48`; `index.ts:200`). API keys have read/write/admin permissions (`schema.ts:574-590`; `apiKeyAuth.ts`), but the v1 API covers only events, import, opt-in, recognize and in-app (`index.ts:170-173, 209`). Outbound webhooks emit only segment enter/exit events (`segmentService.ts:168-170`) | Add a read-only `GET /api/v1/reports` for BI and agency pipelines. S3 or webhook delivery would go beyond MoEngage; `storageService` and outbound webhooks already exist. | P3 | S |
| Alert reports | Alerts Reports and New Alert Report (Inform transactional-alert reports; ALERT NAME, ALERT ID, ALERT EXTERNAL REFERENCE NAME) | Paid add-on, not enabled: both routes redirect to the Inform promo | ❌ Missing | No Inform-style transactional send API: every `deliveryService` caller is a campaign or a flow (`campaignService.ts:1022`; `flowExecutor.ts:759`), and v1 has no send endpoint (`index.ts:170-173`). Notification Logs can filter `source=transactional`, meaning messages from neither a campaign nor a flow (`routes/logs.ts:30-32`; `logs/page.tsx:15`), but cannot export | MoEngage sells this separately. Shopify brands send order and shipping messages through flows, so flow reports cover most of the need. | P3 | L |
| User exports | User Exports list (hidden `/v4/reports/users`: search, Refresh, UPDATED TIME, FILE NAME, DESCRIPTION, STATUS, ACTIONS) | Segment > User Exports inside the Reports app; empty here | ❌ Missing | Exports are immediate downloads with no job or history: the segment hashed CSV (`routes/segments.ts:157-181`), one customer's JSON (`routes/customers.ts:920-941`), and the consent CSV with no UI (`v1Onboarding.ts:899-992`). No export-job table in `schema.ts` | As in module 09: one export history (status, who, when, expiry) shared by report files and customer exports. Buyers also ask for it as an audit control. | P2 | M |

### Storees-only strengths

- **Notification Logs: a cross-channel, per-message delivery log with failure and block reasons** (`logs/page.tsx:13-28, 62-72, 106-108`; `routes/logs.ts:15-139`).
  - Filters by channel, status, source (campaign, flow or transactional) and recipient. Tiles show Total, Delivered, Read, Clicked, Failed and Blocked.
  - Each row carries its failure or block reason (frequency cap, no marketing consent, not reachable, inactive) with a copy button, and contact PII is masked by role.
  - MoEngage's campaign export has one row per campaign, while Storees can answer "why didn't this customer get the WhatsApp?".
  - Caveats:
    - Email never appears, because campaign and flow emails write no `messages` row, although the channel filter offers Email.
    - There is no date picker or CSV, although the API already accepts `from`/`to`.
- **Per-recipient drill-down on every campaign** (`campaigns/[id]/page.tsx:669-813`; `routes/campaigns.ts:854-879`; `campaignAnalyticsService.ts:381-449`).
  - The Recipients tab shows status, provider failure reason, A/B variant and delivered/opened/clicked times. "Top Engaged Recipients" adds converted and revenue.
  - MoEngage's report never splits by recipient. Storees could export "clicked but did not buy" for retargeting.
  - Fix first: the 500-row cap; the missing `viewContactPii` masking; and periodic campaigns, which keep only the last run.
- **Live per-campaign report with an attribution switch and holdout lift** (`campaignAnalyticsService.ts:120-482`; `routes/campaigns.ts:883-914`; `campaigns/[id]/page.tsx:454-711`).
  - It shows a funnel, conversion goals with revenue in the campaign currency, an Any/View-through/Click-through switch, and holdout lift with estimated incremental conversions, all computed on each request.
  - Numbers appear as soon as a campaign sends, with no report run to wait for, which is a demo strength.
  - Caveats: lift ignores the attribution switch, and the headline Revenue card shows "$". Exports covering many campaigns still need background jobs.
- **WhatsApp billable-conversation usage and estimated spend** (`settings/WhatsappUsage.tsx`; `whatsappUsageService.ts:69-81`; `routes/whatsappAdmin.ts:962`).
  - Conversations by category (Marketing, Utility, Authentication, Service) over 7, 30 or 90 days, with estimated INR spend from `WA_RATE_*` env vars.
  - None of MoEngage's 71 WhatsApp report columns is cost. Spend and cost per conversion are top questions for Indian D2C, so carry this into the WhatsApp campaign export (usage rows first need a message link).
- **Click-to-WhatsApp ad report: leads and engagement per Meta ad** (`campaigns/ctwa/page.tsx`; `routes/whatsappAdmin.ts:670-745`; `whatsappInboundService.ts:189-227`).
  - CTWA ads are a major acquisition channel for Indian D2C, and MoEngage's reports show nothing at ad level.
  - Caveats: Converted and Revenue read `first_purchase_at` and `attributed_revenue`, which nothing writes, so they are always 0. No menu links to the page.
- **Consent audit CSV export** (`v1Onboarding.ts:899-992`).
  - Admin only, gated by `exportCustomers`, filtered by date and written in pages of 1,000 rows. It gives DPDP and TRAI consent evidence that MoEngage's Reports module does not offer.
  - Caveats: there is no UI, so add a button in Settings. Paging advances by `created_at + 1 ms`, which can skip rows written in the same millisecond at a page boundary.
- **Hashed ad-audience CSV per segment** (`ExportAudienceButton.tsx`; `adAudienceExport.ts:9-24`; `routes/segments.ts:157-181`).
  - SHA-256-hashed email, phone and name for Meta, Google, TikTok, Snap and Pinterest, gated by `exportCustomers`.
  - MoEngage's (empty) User Exports list showed nothing comparable. The same path can be extended to a plain CSV of segment members.

### UX notes

- **Where reports live (screenshots 001, 002).**
  - MoEngage: exports sit in their own top-level Reports module, separate from campaign analytics.
  - Storees: reports live on each campaign or flow page, the Analytics hub and Notification Logs, with no export or schedule anywhere.
  - Copy the capability rather than the module: a "Download report" button on `/campaigns` that exports the filtered list (after adding channel, tag and date filters), and an "Exports & scheduled reports" card on the Analytics hub (`analytics/page.tsx:19-71`), which already lists analysis types and saved analyses.
- **Step 1 (screenshots 003, 012, 015).**
  - Selecting all channels produces 24 chips that read only "One Time x" or "Periodic x", with no channel name (012). Storees chips should say "WhatsApp · One-time".
  - The choice between "Select all campaigns" (re-evaluated each run) and "Select campaigns manually" (fixed), with its explanatory copy (015), is worth copying for recurring reports.
  - MoEngage keeps Next disabled until "Find campaigns" has run. Storees should update the match count live as filters change.
- **Step 2 (screenshots 017, 021, 031, 045).**
  - Every channel starts with 26-96 preselected columns in tri-state trees, and the preview admits it "does not contain actual campaign data".
  - Storees should ship a curated default set per channel: sent, delivered, read, clicked, CTR, conversions, revenue, holdout lift, and cost for WhatsApp. Add an "Add columns" search; column search with highlighting (045) is good.
  - Because Storees computes reports live in Postgres, its preview should show the first 10 real rows.
- **Step 3 (screenshots 046, 052, 056).**
  - The layout is clean: One Time/Periodic on a left rail, a matching pane, "Reset to defaults" and Ends Never/On/After.
  - But the email recipient is locked to the creator, and the Rar/Tar and separator choices are noise.
  - Storees should allow several recipients (founder, agency) and put a 5-line summary in the email body with the CSV attached; `sendEmail` already takes attachments (`emailService.ts:10-21`).
  - Reuse the campaign periodic schedule UI (`campaigns/create/page.tsx:3264-3345`) but not its scheduler, which ignores the send time and end date that UI collects.
- **Storees' per-campaign page is the better on-screen report** (`campaigns/[id]/page.tsx:418-813`): it has an attribution switch, holdout lift with incremental conversions, top engaged recipients and per-recipient failure reasons. Fix these before exporting from it:
  - The Revenue card hardcodes "$" (`page.tsx:425`), although `campaigns.currency` exists and the goal cards already format it.
  - The timeline draws only 24 buckets (`page.tsx:635`) and counts opens and clicks at delivery time (`campaignAnalyticsService.ts:359`).
  - Recipients and top recipients return raw emails with no `viewContactPii` masking (`routes/campaigns.ts:854-879`), unlike Notification Logs.
  - WhatsApp reads are labelled "Opened".
  - In-app campaigns show "—" on every card, because their events never reach the counters.
- **Campaign list (`campaigns/page.tsx:296-441`).**
  - The Tags field promises "Optional labels for organising the campaign list" (`create/page.tsx:1085`), but the list neither shows nor filters tags.
  - The "Goals & Engagement" column shows only open and click rates.
  - Channel, tag and date filters, tag chips, and conversion and revenue columns would make the list a credible campaign stats table and double as the report's campaign finder.
- **Empty states (screenshots 002, 058).** MoEngage's "No reports yet / + Report" and "No results found" are generic. A Storees empty state should offer a one-click "Download last 30 days of campaign performance", so the first export needs no setup.
- **Periodic campaigns.** Each run deletes the previous run's sends (`campaignScheduler.ts:96-111`), so any Storees report on a periodic campaign silently shows only the last run. Add per-run history, the equivalent of MoEngage's "By child campaigns" split (screenshot 028), before showing periodic campaigns in demos.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status.

**Searches.** Missing and partial rows were searched under synonyms across frontend, backend (routes, services, workers, schema, migrations), shared, segments, flows, ml, sdk and sdk-react:
- report, export, download, csv, `text/csv`, `Content-Disposition`, `createObjectURL`;
- xlsx, exceljs, sheetjs, archiver, jszip, tar;
- digest, scheduled report, report schedule, `upsertJobScheduler`, cron;
- custom metric, formula, computed metric, calculated field;
- locale, language; global control, holdout, GCG, in-session;
- created_by, updated_by, team; tags; DateRange, DatePicker;
- dlt, message parts; `serviceWorker`, `PushManager`; in-app rendering in both SDKs;
- custom audience, audience sync, connector, outbound webhooks;
- the CTWA `first_purchase_at` and `attributed_revenue` writers.

**Rows changed:**
- **InApp columns (evidence and gap; 🟡 kept).**
  - The table said the campaign page shows in-app shows, dismissals and clicks as Opened, Bounced and Clicked.
  - In fact the in-app event API writes only `campaign_sends` and never increments the counters the metric cards read (only the Resend webhook and `messageStatusService` do). So in-app campaigns show "—", and the events surface only per recipient.
  - No SDK renders in-app messages at all.
- **Conversion metrics per attribution type (evidence and gap; 🟡 kept).**
  - "No ARPU/AOV" was wrong. The API returns `avgRevenuePerRecipient` and `avgRevenuePerConversion` (`campaignAnalyticsService.ts:461-468`); the latter is shown as "$N per conv." on the Revenue card, and ARPU is computed but never displayed.
  - "Nothing can be compared across campaigns" was too strong: the list compares delivery, open and click rates.
- **Role checks: P3 → P2.**
  - The campaigns router has no role gate, and its Recipients and top-recipients responses return raw emails. Any role without `viewContactPii` can therefore read contact PII through the existing report.
  - Role screen restrictions are not enforced server-side.
  - The per-customer JSON export is admin-only but not gated by `exportCustomers`.
- **Channel × delivery-type filter: P1 → P2.** This matches module 01, which rates the same campaign-list filter P2 S. The P1 export can carry channel as a column and a parameter without the full finder.
- **Split by child campaigns (evidence and gap; ❌ and P1 kept).**
  - Earlier runs are not entirely gone: SMS, WhatsApp and push `messages` rows survive, but with no run ID. Email runs are lost, because email has no `messages` row.
  - The gap now also covers the scheduler ignoring the send time and end date the builder saves. This is the same root cause as module 02's P1 periodic row.
- **Periodic reports and Advanced recurrence (evidence).** The table suggested reusing the campaign scheduler. It polls with `setInterval` and ignores `time` and `endsAt`, so the recommendation now points at BullMQ `upsertJobScheduler`.
- **Flows columns (evidence).**
  - The UI type drops opened, clicked and the per-channel split; it keeps `failed` but never shows it.
  - The `ab_split` branch taken is not recorded, and `orders` is imported but unused, which confirms there is no flow revenue.
- **Email columns (evidence).** The pre-send audience preview already computes removal counts. They are not stored with the send, so the gap is persistence, not computation.
- **WhatsApp columns (evidence and gap).** `whatsapp_usage` rows carry no message or campaign ID, so per-campaign cost needs that link first.
- **SMS columns (evidence).** The Gupshup webhook tags every receipt as WhatsApp, so Gupshup SMS emits `whatsapp_*` events.
- **Campaign tags filter (evidence).** Duplicate drops tags.
- **Event, Location and API Triggered (evidence).** `POST /api/v1/events` can start a flow, which is an indirect API trigger.
- **Connectors, Facebook and Google Ads columns (evidence).** Outbound-webhook deliveries and the Conversions API counters are the nearest per-request logs. They are event relays, not campaigns, so ❌ stays.
- **Storees-only strengths.** Caveats added:
  - Notification Logs never list email.
  - The consent CSV's 1 ms paging cursor can skip same-millisecond rows.
  - The CTWA Converted and Revenue columns are always 0.

**Confirmed unchanged:** all other rows. The cited code exists and behaves as described, every missing row's searches came up empty, and no row was left undecided.

- **Cross-module consistency review (completeness pass):** Campaign tags filter 🟡 → ❌, matching module 01: no tag filter exists anywhere, and stored tags are credited in module 01's tags row.

### Screens

#### Reports sidebar flyout

![Reports flyout: New Campaign Report, New Alert Report, Campaigns Reports, Alerts Reports](../screenshots/15-reports-001-sidebar-reports-flyout.jpg)
*Reports flyout: New Campaign Report, New Alert Report, Campaigns Reports, Alerts Reports*

#### Reports > Campaigns Reports (list)

![Campaign reports list: 'No reports yet' empty state with + Report](../screenshots/15-reports-002-campaign-reports-empty.jpg)
*Campaign reports list: 'No reports yet' empty state with + Report*

#### New Campaign Report: Step 1 Select campaigns

![Step 1 top: stepper, Report name, Campaign/Flow date range, Include performance data](../screenshots/15-reports-003-campaign-report-step1-top.jpg)
*Step 1 top: stepper, Report name, Campaign/Flow date range, Include performance data*

![Find campaigns filter panel (channels, tags, created by, include archived) and disabled Next](../screenshots/15-reports-004-campaign-report-step1-find-campaigns.jpg)
*Find campaigns filter panel (channels, tags, created by, include archived) and disabled Next*

![Report name rules tooltip (1-128 chars, starts with a letter, only numbers/-/space)](../screenshots/15-reports-005-report-name-rules-tooltip.jpg)
*Report name rules tooltip (1-128 chars, starts with a letter, only numbers/-/space)*

![Date range presets: Today ... Custom Range, plus Last N D/W/M](../screenshots/15-reports-006-date-range-presets.jpg)
*Date range presets: Today ... Custom Range, plus Last N D/W/M*

![Custom Range: two-month calendar with From/To, Reset, Cancel, Done](../screenshots/15-reports-007-date-range-custom-calendar.jpg)
*Custom Range: two-month calendar with From/To, Reset, Cancel, Done*

!['Since' option: single calendar, today is auto-selected as the end date](../screenshots/15-reports-008-date-range-since.jpg)
*'Since' option: single calendar, today is auto-selected as the end date*

![Campaign channels dropdown (channel x delivery type tree), top: Email, Facebook](../screenshots/15-reports-009-campaign-channels-dropdown-1.jpg)
*Campaign channels dropdown (channel x delivery type tree), top: Email, Facebook*

![Channels dropdown, middle: Push One Time/Periodic/Event/Location/API Triggered](../screenshots/15-reports-010-campaign-channels-dropdown-2-push.jpg)
*Channels dropdown, middle: Push One Time/Periodic/Event/Location/API Triggered*

![Channels dropdown, end: Others: Connectors, Flows, Onsite messaging](../screenshots/15-reports-011-campaign-channels-dropdown-3-others.jpg)
*Channels dropdown, end: Others: Connectors, Flows, Onsite messaging*

![Select all: chips plus '24 combinations of channels and delivery types selected'](../screenshots/15-reports-012-channels-all-selected-24-combinations.jpg)
*Select all: chips plus '24 combinations of channels and delivery types selected'*

![Campaign tags dropdown: All of these (AND) / Any of these (OR), default tags](../screenshots/15-reports-013-campaign-tags-dropdown.jpg)
*Campaign tags dropdown: All of these (AND) / Any of these (OR), default tags*

![Created by dropdown listing team users (emails blurred)](../screenshots/15-reports-014-created-by-users-dropdown.jpg)
*Created by dropdown listing team users (emails blurred)*

![After Find campaigns: Campaigns found: 0; Select all vs Select manually; filter summary](../screenshots/15-reports-015-find-campaigns-results-select-mode.jpg)
*After Find campaigns: Campaigns found: 0; Select all vs Select manually; filter summary*

!['No campaigns found. Try again with different filters.' and enabled Next](../screenshots/15-reports-016-find-campaigns-no-results.jpg)
*'No campaigns found. Try again with different filters.' and enabled Next*

#### New Campaign Report: Step 2 Report format and content

![Step 2 overview: per-channel column accordions and empty preview with channel tabs](../screenshots/15-reports-017-step2-report-format-overview.jpg)
*Step 2 overview: per-channel column accordions and empty preview with channel tabs*

![Flows section: search, expand/collapse, Clear selection, groups, Custom metrics Add](../screenshots/15-reports-018-step2-flows-column-groups.jpg)
*Flows section: search, expand/collapse, Clear selection, groups, Custom metrics Add*

![Flows tree expanded: Flow Attribute columns](../screenshots/15-reports-019-flows-columns-flow-attributes.jpg)
*Flows tree expanded: Flow Attribute columns*

![Flows: Control Group, Conversion Goals, Target Audience columns](../screenshots/15-reports-020-flows-columns-control-group-goals-audience.jpg)
*Flows: Control Group, Conversion Goals, Target Audience columns*

![Flows Stats: Trips Started (CG/GCG/Total), Trips engaged, Conversions](../screenshots/15-reports-021-flows-columns-stats-trips-conversions.jpg)
*Flows Stats: Trips Started (CG/GCG/Total), Trips engaged, Conversions*

![Flows Click Through conversion metrics (converted trips, revenue, uplift, CVR)](../screenshots/15-reports-022-flows-columns-click-through-metrics.jpg)
*Flows Click Through conversion metrics (converted trips, revenue, uplift, CVR)*

![Flows In Session conversion metrics](../screenshots/15-reports-023-flows-columns-in-session-metrics.jpg)
*Flows In Session conversion metrics*

!['Add a custom metric' modal: Name, Formula, examples (Revenue/Clicks etc.)](../screenshots/15-reports-024-add-custom-metric-modal.jpg)
*'Add a custom metric' modal: Name, Formula, examples (Revenue/Clicks etc.)*

![Formula '@' metric picker (searchable, grouped by attribution type)](../screenshots/15-reports-025-custom-metric-formula-metric-picker.jpg)
*Formula '@' metric picker (searchable, grouped by attribution type)*

![Formula '#' operator picker (+ - / \*) with validation error](../screenshots/15-reports-026-custom-metric-formula-operator-picker.jpg)
*Formula '#' operator picker (+ - / \*) with validation error*

![Update preview: Flows sample-data table (Flows Id, Base Flow Id, Version ...)](../screenshots/15-reports-027-preview-flows-sample-table.jpg)
*Update preview: Flows sample-data table (Flows Id, Base Flow Id, Version ...)*

![Split data options drawer: By date / child campaigns / variations / locales](../screenshots/15-reports-028-split-data-options-drawer.jpg)
*Split data options drawer: By date / child campaigns / variations / locales*

![Preview with split by date (adds a Date column, one row per date)](../screenshots/15-reports-029-preview-split-by-date.jpg)
*Preview with split by date (adds a Date column, one row per date)*

![Report format preview - Fullscreen (Flows tab)](../screenshots/15-reports-030-preview-fullscreen-flows.jpg)
*Report format preview - Fullscreen (Flows tab)*

![Fullscreen preview, Push tab: Campaign ID, Version, Date, Name, Parent ID, Type ...](../screenshots/15-reports-031-preview-fullscreen-push.jpg)
*Fullscreen preview, Push tab: Campaign ID, Version, Date, Name, Parent ID, Type ...*

![Push section: Select platforms (Android/iOS/Web) and column groups](../screenshots/15-reports-032-push-columns-platforms-groups.jpg)
*Push section: Select platforms (Android/iOS/Web) and column groups*

![Push Campaign Content columns (message, fallback message ...)](../screenshots/15-reports-033-push-columns-campaign-content.jpg)
*Push Campaign Content columns (message, fallback message ...)*

![Push Campaign Attributes columns (Smart Trigger, Push Amp Plus, Created By ...)](../screenshots/15-reports-034-push-columns-campaign-attributes.jpg)
*Push Campaign Attributes columns (Smart Trigger, Push Amp Plus, Created By ...)*

![Push Delivery Stats columns (devices, CG, FC removal, sent, impressions ...)](../screenshots/15-reports-035-push-columns-delivery-stats.jpg)
*Push Delivery Stats columns (devices, CG, FC removal, sent, impressions ...)*

![Connectors column groups](../screenshots/15-reports-036-connectors-column-groups.jpg)
*Connectors column groups*

![Email column groups (Attributes, Audience, Limit, MV, Locales, CG, Content, Schedule, Stats)](../screenshots/15-reports-037-email-column-groups.jpg)
*Email column groups (Attributes, Audience, Limit, MV, Locales, CG, Content, Schedule, Stats)*

![Facebook audience-sync column groups](../screenshots/15-reports-038-facebook-column-groups.jpg)
*Facebook audience-sync column groups*

![WhatsApp column groups](../screenshots/15-reports-039-whatsapp-column-groups.jpg)
*WhatsApp column groups*

![Google Ads Audience column groups](../screenshots/15-reports-040-google-ads-audience-column-groups.jpg)
*Google Ads Audience column groups*

![InApp: platforms Android/iOS; Trigger Event, Delivery Controls, etc.](../screenshots/15-reports-041-inapp-column-groups.jpg)
*InApp: platforms Android/iOS; Trigger Event, Delivery Controls, etc.*

![Onsite messaging: platform Web; column groups](../screenshots/15-reports-042-onsite-messaging-column-groups.jpg)
*Onsite messaging: platform Web; column groups*

![SMS column groups](../screenshots/15-reports-043-sms-column-groups.jpg)
*SMS column groups*

![Duplicate icon dropdown listing channels, to copy the column setup across channels](../screenshots/15-reports-044-duplicate-columns-channel-dropdown.jpg)
*Duplicate icon dropdown listing channels, to copy the column setup across channels*

![Column search ('revenue') highlights matching columns in the tree](../screenshots/15-reports-045-column-search-revenue.jpg)
*Column search ('revenue') highlights matching columns in the tree*

#### New Campaign Report: Step 3 Scheduling and delivery

![Step 3 default: One Time > As soon as possible ('Send now') and Report delivery (email blurred)](../screenshots/15-reports-046-step3-scheduling-delivery-send-now.jpg)
*Step 3 default: One Time > As soon as possible ('Send now') and Report delivery (email blurred)*

![At specific date and time: Start date and Send time (hh:mm am/pm)](../screenshots/15-reports-047-schedule-one-time-specific-date-time.jpg)
*At specific date and time: Start date and Send time (hh:mm am/pm)*

![Send daily: start date and time, Repeat every N days, Ends Never/On/After](../screenshots/15-reports-048-schedule-daily-repeat-ends-never.jpg)
*Send daily: start date and time, Repeat every N days, Ends Never/On/After*

![Daily, Ends On: End date and End time](../screenshots/15-reports-049-schedule-daily-ends-on-date.jpg)
*Daily, Ends On: End date and End time*

![Daily, Ends After: N occurrences](../screenshots/15-reports-050-schedule-daily-ends-after-occurrences.jpg)
*Daily, Ends After: N occurrences*

![Send weekly: Repeat every N weeks, Repeat on S M T W T F S](../screenshots/15-reports-051-schedule-weekly-repeat-on-days.jpg)
*Send weekly: Repeat every N weeks, Repeat on S M T W T F S*

![Send monthly: Repeat every N months, Repeat on 'First' 'Monday' of the month](../screenshots/15-reports-052-schedule-monthly-repeat-on.jpg)
*Send monthly: Repeat every N months, Repeat on 'First' 'Monday' of the month*

![Monthly ordinal dropdown: Last day, 1st-31st day, First-Fourth, Last](../screenshots/15-reports-053-schedule-monthly-day-ordinal-dropdown.jpg)
*Monthly ordinal dropdown: Last day, 1st-31st day, First-Fourth, Last*

![Monthly weekday dropdown: Sunday-Saturday](../screenshots/15-reports-054-schedule-monthly-weekday-dropdown.jpg)
*Monthly weekday dropdown: Sunday-Saturday*

![Report delivery (CSV, separators, Zip/Rar/Tar, Email) and Previous / Create report](../screenshots/15-reports-055-report-delivery-csv-email-create-button.jpg)
*Report delivery (CSV, separators, Zip/Rar/Tar, Email) and Previous / Create report*

![EXCEL hides Separator; Send to REST API shows the API help text and link](../screenshots/15-reports-056-delivery-excel-rest-api.jpg)
*EXCEL hides Separator; Send to REST API shows the API help text and link*

#### Reports > Alerts Reports

![Alerts Reports redirects to the Inform promo (paid add-on not enabled)](../screenshots/15-reports-057-alerts-reports-redirects-to-inform-promo.jpg)
*Alerts Reports redirects to the Inform promo (paid add-on not enabled)*

#### Reports > + New Alert Report

![New Alert Report lands on the identical Inform promo (both via flyout click and direct URL)](../screenshots/15-reports-057-alerts-reports-redirects-to-inform-promo.jpg)
*New Alert Report lands on the identical Inform promo (both via flyout click and direct URL)*

#### Hidden Reports route: User Exports

![/v4/reports/users = Segment > User Exports list (empty)](../screenshots/15-reports-058-hidden-route-reports-users-user-exports.jpg)
*/v4/reports/users = Segment > User Exports list (empty)*
