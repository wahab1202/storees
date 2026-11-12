## 12. Home, Dashboards, global header & Create New menu

MoEngage lands users on its campaign list; Storees opens on a working Home dashboard with store KPIs, trend charts, AI prediction health, a segment overview and live activity. But Storees has none of MoEngage's dashboard system: no Campaign stats rollup across channels, no custom dashboards, exports or scheduled reports, no global Create launcher, help menu, notification centre, Test/Live environments or dark mode. Re-checking the code also found that SMS campaigns created from the channel picker reach the provider with an empty body, that campaign and flow emails never reach the `messages` ledger a cross-channel rollup would read, and that a 30-template, WhatsApp-first flow library sits unused behind the API.

### MoEngage overview

Module 12 is MoEngage's global chrome and its built-in dashboards.

- **Sidebar.** A collapsible icon rail with hover flyouts. The Dashboards flyout has a live search, "+ New Dashboard" and the MoEngage dashboards Key Metrics, Campaign Stats and Reachability. A hidden Best Time Analysis route also exists.
- **"+ Create New".** A two-pane launcher grouped by intent:
  - Engage: Campaign channel tiles that expand into delivery types, and Flow templates.
  - Segment: Filter, RFM, File and Predictive segments.
  - Analyze: a blank dashboard or one of five analysis starting points.
  - Inform (Alerts) and Personalize (Experiences).
- **Top header.** Merlin AI Studio link, Test/Live environment, workspace switcher, a "Need help" menu (docs, Intercom Ask AI, support, demo account, academy), a dark-mode toggle, a Beamer "What's new" bell, and an avatar menu leading to My profile (General, Security with active devices, Appearance themes).
- **Campaign stats** is the richest page:
  - six cross-channel KPI cards, each with a % change and a definition tooltip;
  - an overall-performance table and chart by channel (WhatsApp is not one of the channels);
  - one section per channel with funnel and ratio tabs and a best/worst-campaign panel;
  - conversion-type and date-range filters (ten presets plus a custom calendar).
- **Setup guide.** An onboarding page with a progress checklist, capability tabs, plans and a knowledge base.
- **No Home dashboard.** The logo lands on All campaigns.

| Page visited | URL path |
|---|---|
| Dashboards flyout (left sidebar) | Sidebar flyout on every page |
| Key Metrics dashboard | `/v4/dashboards/insights` |
| Campaign stats dashboard | `/v4/dashboards/campaign-stats` |
| Reachability dashboard | `/v4/dashboards/reachability` |
| Create dashboard modal | Modal from "+ New Dashboard", the switcher's "+ Create new" and Create New > Dashboards > Start with blank |
| Best time analysis dashboard (hidden route) | `/v4/dashboards/best-time-analysis` |
| Create New menu | Modal from the "+" at the top of the sidebar |
| Global header | Top bar on every page |
| My profile | `/v4/profileManagement` (General, Security), `/v4/profileManagement/appearance` |
| Home / default landing (logo click) | `/v4/campaigns/all` |
| Setup guide | `/v4/getting-started` |
| Left sidebar (expanded) | Global |

**Capture limits.**
- **Front-end code only:** Key Metrics works only in the Live environment, and Reachability says no platform is enabled, so both rendered empty in this Test workspace. Their widget lists come from front-end code.
- **Custom dashboard builder not opened:** it opens only after Create, which would save a dashboard. The builder, sharing and scheduled email subscriptions were also read from front-end code.
- **Not enabled:** Best time analysis.
- **Not clicked:** Ask AI questions, demo-account links and write actions. Nothing was created or changed.

### Storees counterpart

- **Home dashboard** at `/dashboard` (`packages/frontend/src/app/(dashboard)/dashboard/page.tsx`); `/` redirects there (`packages/frontend/src/app/page.tsx`).
  - Layout: a fixed "Dashboard > Key Metrics" page with a KPI strip that changes with the project's domain (ecommerce orders and revenue, fintech transactions and volume, otherwise events), plus Avg CLV and SDK page views and sessions.
  - Charts: Active Customers, Events and Orders & Revenue with a 7/14/30-day picker.
  - Cards: AI Predictions, Quick Actions, Segment Overview and Recent Activity.
  - API: `GET /api/dashboard/{stats,trends,activity,counts,segments}` (`packages/backend/src/routes/dashboard.ts`). Stats, trends and activity are scoped to the viewer's role and dealer, and contact PII is masked.
- **App chrome:** `packages/frontend/src/components/layout/AppShell.tsx` and a fixed 240px `Sidebar.tsx`. The sidebar holds the logo, the project switcher, a flat nav with count badges and the user menu (Account, Security, Sign out). `TrialBanner.tsx` sits above every page. There is no top header; phones get a top bar and a drawer.
- **Create entry points, page by page:**
  - Campaigns: a Create Campaign slide-over (`packages/frontend/src/app/(dashboard)/campaigns/page.tsx`) with Push, Email, SMS, WhatsApp and In-App, One Time and Periodic. Event and Device Triggered are disabled with "Soon".
  - Flows: a Templates gallery (`packages/frontend/src/components/flows/FlowTemplateGallery.tsx`) and a blank Create Flow modal (`flows/page.tsx`).
  - Segments: `/segments/create` with the filter builder and AI chat.
- **Reports spread across the product:**
  - per-campaign report (`campaigns/[id]/page.tsx`);
  - per-flow Analytics tab (`packages/frontend/src/components/flows/FlowAnalyticsPanel.tsx`);
  - admin-only Notification Logs (`logs/page.tsx`);
  - the Analytics hub (`analytics/*`);
  - the RFM grid on `/segments`;
  - WhatsApp usage in Settings (`settings/WhatsappUsage.tsx`).
- **Personal and plan settings:** Settings → Account (read-only profile, change password), Security (TOTP 2FA) and Billing (Shopify plans, trial banner) under `packages/frontend/src/app/(dashboard)/settings/`.
- **Onboarding:** a super-admin-only, 8-step wizard at `/onboarding` (`onboarding/page.tsx`).
- **Missing entirely:**
  - custom dashboards, and cross-campaign or cross-channel stats;
  - report exports and scheduled reports;
  - a global "+ Create" launcher;
  - a help menu, notification centre, Test/Live environments and dark mode;
  - an active-sessions list and a merchant setup checklist.

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Dashboards flyout | Dashboard navigation and search (flyout list, groups, pin/unpin, title switcher) | Flyout with live Search, "+ New Dashboard", MoEngage Dashboards group; code defines Pinned/Workspace/Private/Shared groups and Pin/Unpin; each title has a searchable switcher with "+ Create new" | ❌ Missing | One fixed dashboard: nav item → `/dashboard` (`Sidebar.tsx:55`); static "Dashboard > Key Metrics" header (`dashboard/page.tsx:75-79`); no dashboards table in `schema.ts` (only `saved_analyses`, :937) | No dashboard list, search, pinning or switcher. Only useful once custom dashboards exist. | P2 | S |
| Key Metrics dashboard | Environment gating (Live only) | "Key metrics is not available on Test environment" | ➖ N/A | No Test/Live split; `/api/dashboard/stats` and `/trends` compute for the active project (`routes/dashboard.ts:104-315,353-505`) | None; a MoEngage limitation, not a capability. | — | — |
| Key Metrics dashboard | Acquisition KPIs: new users, by platform, by source | New users, New users by platform, New users by source, with a "You added N new users" narrative | 🟡 Partial | "New Customers" tile with % change (`dashboard/page.tsx:500`; `routes/dashboard.ts:135-136`) and a daily New Customers line (`dashboard/page.tsx:148-158`; `routes/dashboard.ts:398-411`). Events carry `platform` (`types.ts:388`); the SDK sends utm_* and referrer on `session_started` (`autotrack.ts:15-21,109-114`); `customers` stores no first-touch source (`schema.ts:126-160`) | Split new customers by platform and by acquisition source (UTM, referrer, click-to-WhatsApp ads). | P2 | M |
| Key Metrics dashboard | Engagement KPIs: DAU, 7-day / 30-day active, dormant users, stickiness | DAU, Average 7-Day and 30-Day Active Users, Dormant users, Stickiness, each with a growth narrative | 🟡 Partial | "Active (7d)" tile: distinct customers with events, % vs previous 7 days (`routes/dashboard.ts:147-159`; `dashboard/page.tsx:499`); daily Active Customers line with Last Day / Average (`dashboard/page.tsx:37-47,138-159`). No 30-day active, stickiness or dormant count on Home; dormancy exists only as a prediction goal and the pack's "Dormant" segment | Add 30-day active, DAU/MAU stickiness and a dormant-customers KPI. | P2 | S |
| Key Metrics dashboard | Session KPIs: average session duration (overall, by platform), bounce rate | Average session duration, by platform, Bounce rate | 🟡 Partial | Home shows "Page Views (7d)" and "Sessions (7d)" counts only when SDK events exist (`dashboard/page.tsx:521-526`; `routes/dashboard.ts:279-308`). `session_ended` carries `duration_ms` (`autotrack.ts:117-125`); `metricsWorker.ts:559-619` averages it per customer into `metrics.avg_session_duration_ms` for the engagement score, but no project average, platform split or bounce rate is shown anywhere | Project-level session duration, per-platform split and bounce rate from data already collected. | P2 | S |
| Key Metrics dashboard | Conversion KPIs: conversion rate, time to convert, converted users, conversion events | Conversion section tied to a configured conversion goal | 🟡 Partial | Home shows Total Orders only (`dashboard/page.tsx:505`). Funnels and Time-to-Event (median/p75/p90) are separate reports (`analytics/page.tsx:19-47`). The nearest project-level conversion definition is the event-mapping purchase slot (`projectVocabulary.ts:53,139`), editable only by super admins (`Sidebar.tsx:68`) | Conversion rate, converted customers and time-to-first-purchase on Home. | P2 | S |
| Key Metrics dashboard | Revenue KPIs: Revenue, AOV, ARPU | Revenue, Average Order Value, Average Revenue Per User | 🟡 Partial | Revenue tile with % change, excluding cancelled/returned/refunded orders (`routes/dashboard.ts:182-231`; `dashboard/page.tsx:506`); Orders & Revenue chart (`dashboard/page.tsx:304-319`); Avg CLV tile (:518). AOV only in the RFM row on `/segments` (`LifecycleChart.tsx:117-121`); no ARPU anywhere | Add AOV and ARPU to Home; revenue already handles reversals more carefully. | P2 | S |
| Key Metrics dashboard | Retention table with "Download Retention Table" | Cohort retention table with download | 🟡 Partial | Cohort heatmap at `/analytics/cohorts`: weekly/monthly, 4-12 periods, any or a chosen return event (`routes/analytics.ts:76-91`). Not on Home; no download on any analytics page | Retention is a separate report and cannot be downloaded. | P3 | S |
| Key Metrics dashboard | Uninstall users and events | Uninstall section | ➖ N/A | `packages/sdk` is a browser SDK and `packages/sdk-react` only wraps it; there is no app to uninstall | Not relevant without a mobile SDK. | — | — |
| Key Metrics dashboard | RFM segment KPIs (needing attention, about to sleep, hibernating, lost) | RFM groups inside Key Metrics | ✅ Full | 3x3 grid on `/segments` (`segments/page.tsx:83`): Champions to Lost with count, % and 3 tactics per cell (`lifecycle.ts:131-141`); a cell opens `/customers?rfm=` (`LifecycleChart.tsx:187`; `routes/customers.ts:88-130`) | Equivalent and finer-grained; lives on Segments, not Home. | — | — |
| Key Metrics dashboard | Auto-generated KPI narratives | A generated sentence per KPI (from code) | 🟡 Partial | Only a rule-based one-liner under the RFM distribution tabs (`LifecycleChart.tsx:583-599`); Home tiles show a number and % change (`dashboard/page.tsx:86-134`); no insight route in `routes/ai.ts`, though `llmService.ts` exists | Generated summaries on Home and in campaign and flow reports. | P2 | M |
| Key Metrics dashboard | Suggested actions | "Send a conversion campaign...", "Revive your business", "Create campaign or segment" | 🟡 Partial | Static Quick Actions card (`dashboard/page.tsx:232-257`); RFM tactics are text only (`lifecycle.ts:131-141`); Next Best Action is per customer (`NextBestActionCard.tsx`). Segment Transitions' "Create Flow" pushes to `/flows/new` (`transitions/page.tsx:59`), which does not exist, and "View Users" sends `?segment=` (:65) while `/customers` reads `segmentId` (`customers/page.tsx:26`) | Turn KPI drops and RFM cells into pre-filled segments or campaigns; fix the two broken Transitions links. | P2 | S |
| Key Metrics dashboard | Platform filter (All / iOS / Web) and Compare Duration | Platform filter, compare duration, reset filters | 🟡 Partial | The 7/14/30-day picker changes the charts only (`dashboard/page.tsx:381-404`; `routes/dashboard.ts:357-359`); tile % change is always last 7 vs previous 7 days (`routes/dashboard.ts:114-116,297-299`); no platform filter; a previous-period overlay exists only in Analytics → Time Series | Platform filter, a chosen comparison period, and % change that follows the range. | P2 | S |
| Key Metrics dashboard | Chart drill-down ("Analyze Chart", new tab, detailed view) | Each chart opens the matching Analyze report or a detailed view | 🟡 Partial | Segment Overview bars open `/customers?segmentId=` (`dashboard/page.tsx:277`) and AI Prediction cards open the goal page (:204-207); the three trend charts have no click-through and their Info icon has no tooltip or link (:427) | Link Active Customers, Events and Orders & Revenue to Time Series or a customer list. | P2 | S |
| Key Metrics dashboard | Download charts / CSVs | Download charts and CSVs; Download table and chart on Campaign stats | ❌ Missing | No download or CSV code on Home, the analytics pages, `campaigns/[id]/page.tsx` or `FlowAnalyticsPanel.tsx`. The only exports are the segment ad-audience CSV (`routes/segments.ts:157-176`), the consent-audit CSV (`v1Onboarding.ts:908-922`) and the per-customer GDPR JSON (`routes/customers.ts:935`) | CSV (and PNG) export on every report, behind `exportCustomers` where rows are customers. | P1 | S |
| Key Metrics dashboard | Copy Link / Email Link | Copy and email a dashboard view | ❌ Missing | The range is React state, not in the URL (`dashboard/page.tsx:20`); no share or email action | Put the range in the URL and add Copy link. | P3 | S |
| Key Metrics dashboard | "Set conversion goal" / "Go to settings" prompts | Shown when revenue or conversion is not configured | ❌ Missing | With an empty orders table, revenue is rebuilt from events (`routes/dashboard.ts:201-225`) using the purchase vocabulary (default `order_placed`, `projectVocabulary.ts:139`); unmapped purchases show 0 with no hint, and Event Mapping is super-admin only (`Sidebar.tsx:68`) | Explain zero revenue and point to the fix. | P3 | S |
| Campaign stats dashboard | KPI summary cards (sent, impression, click, CTR, conversion, CVR) with % change and tooltips | Six cross-channel cards for the period, % change vs previous period, definition tooltips | 🟡 Partial | Home KPIs are store metrics. Nearest: the admin-only Notification Logs row (Total, Delivered, Read, Clicked, Failed, Blocked; `logs/page.tsx:64-71`; `routes/logs.ts:15,121-139`), all-time in the UI though the API takes from/to (`logs.ts:24-34`), counted by each message's latest status, no conversions, rates or change. It reads only `messages`, which campaign emails (`campaignService.ts:949-1017`, `campaign_sends` only) and flow emails (`flowExecutor.ts:750`) never write | No view of how all messaging performed in a period. Build on `campaign_sends` plus `messages`, after recording flow emails. | P0 | M |
| Campaign stats dashboard | Conversion type (click-through vs total) and attribution model | Dashboard-level conversion type; banner linking to attribution settings | 🟡 Partial | Per campaign only: Any / View-through / Click-through and Hour/Day/Week buckets (`campaigns/[id]/page.tsx:82-87,570-622`; `campaignAnalyticsService.ts:20-33`). No project attribution model; each campaign counts goal events by its own recipients, so summing campaigns double-counts | A project-level attribution rule is needed before any rollup. | P2 | S |
| Campaign stats dashboard | Date presets and custom range with Apply | Ten presets, Since, Last N D/W/M, two-month custom calendar, Apply | 🟡 Partial | Fixed presets only: Home 7/14/30 (`dashboard/page.tsx:381-404`), Analytics 7/14/30/90 (`analytics/funnels/page.tsx:186-189`), campaign buckets 72h/90d/52w (`campaigns/[id]/page.tsx:599-601`). No report has a custom range; the only from/to inputs filter the Event Debugger (`debugger/page.tsx:82-86`) | One shared range picker (presets, this/last month, custom) on every report. | P1 | M |
| Campaign stats dashboard | Overall performance by channel (table, chart, granularity, download) | Rows Push, Onsite, SMS, InApp, Email, Overall; Sent to CTR columns; chart view; download | 🟡 Partial | Notification Logs filters by channel and source and shows status counts (`logs/page.tsx:13-15,64-71`); no conversions, revenue, rates, chart or date picker. SMS, push and WhatsApp sends live in `messages` (`schema.ts:794-827`); campaign emails only in `campaign_sends` (`schema.ts:487-511`); flow emails nowhere. `flowAnalyticsService.ts:146-227` computes per-channel stats per flow, but the UI never shows `byChannel` | No comparison of volume, engagement, conversions and revenue by channel across campaigns and flows. | P0 | M |
| Campaign stats dashboard | Per-channel sections (funnel, ratios, single metrics, granularity, download) | One section per channel with funnel and ratio tabs | 🟡 Partial | Per campaign only: Delivery Funnel and Engagement Over Time (`campaigns/[id]/page.tsx:456-711`); per-campaign bars in the list (`campaigns/page.tsx:337-338`). The only WhatsApp channel-level view is billable conversations by category over 7/30/90 days in Settings (`WhatsappUsage.tsx`; `settings/page.tsx:502`) | No per-channel trend across campaigns; WhatsApp has usage counts but no sent/read/clicked/conversion trend. | P1 | M |
| Campaign stats dashboard | Flows section (total, engaged, converted trips, CVR) | Flows channel section with campaign summary | 🟡 Partial | Per flow only: Total Trips, Completed, Exited, Completion Rate, Converted, Avg Duration, Messages Sent/Delivered/Rate (`FlowAnalyticsPanel.tsx:91-128`) and weekly trips; list cards show Active/Waiting/Completed/Exited and completion % (`flows/page.tsx:509-535`) | No all-flows rollup of trips and conversions; no "engaged trips". | P1 | S |
| Campaign stats dashboard | Connector and FB audience sections | Attempted, Sent, Success rate; Eligible, Attempted, Synced, User synced | ❌ Missing | No audience sync. Flow HTTP Request steps keep each response only in the trip's `node_outputs` (`flowExecutor.ts:822-880`), so there are no attempted/success counts; outbound webhooks keep their own log in Settings → Webhooks | Needs audience sync and per-request logging first; the sections are small after that. | P3 | S |
| Campaign stats dashboard | Campaign summary side panel (count, best/worst CVR and CTR) | Per channel: totals, highest and lowest campaigns, Show all | ❌ Missing | The campaign list cannot sort by a metric and has no callout (`campaigns/page.tsx:333-339`); every route in `routes/campaigns.ts` is a list or per-campaign route | Best and worst campaign per channel by CTR and CVR. | P2 | S |
| Reachability dashboard | Reachability trends and KPIs | Daily opted-in / opted-out / unknown per Android, iOS, Web; eligible and reachable KPIs | 🟡 Partial | Segment list shows a reachable count and % (`segmentService.ts:81-104`; `segments/page.tsx:129-137`), counting any phone as WhatsApp-reachable without checking opt-in. The campaign audience preview reports reachable recipients for a draft (`routes/campaigns.ts:300-347`). Push reachability is per send (`deliveryService.ts:483-486`); the SDK has no web-push registration | No project reachability KPIs or trend. For Storees, track WhatsApp, email and SMS opt-in over time. | P2 | M |
| Reachability dashboard | Platform gating message | "No platform enabled for analysis" | ➖ N/A | An account-enablement state, not a capability | None. | — | — |
| Best time analysis | Best time analysis dashboard | Hidden route; not enabled in this account | 🟡 Partial | `sendTimeService.ts:15-61` finds best open hour and weekday from `campaign_sends.opened_at`; `GET /api/send-time/*` (`routes/sendTime.ts:9-38`); used by the "Best time" send option (`campaignService.ts:509,1134`). No frontend calls `/api/send-time`; the profile's "Best Send Time" reads `metrics.best_send_hour` (`UserInfoTab.tsx:117`), which nothing writes, so it shows "—" | An hour-by-weekday engagement heatmap with confidence; persist the per-customer best time. | P2 | S |
| Custom dashboards | Create custom dashboard (name, visibility, permission, limits) | Modal with unique name (50 chars), Workspace/Private, Editor/Viewer; three entry points | ❌ Missing | No dashboards table or route; `routes/dashboard.ts` serves fixed widgets; `saved_analyses` is used for funnels only (`schema.ts:937`; `routes/analytics.ts:176-230`; `funnels/page.tsx:47,132`) | Users cannot build their own dashboards. | P2 | M |
| Custom dashboards | Private dashboards and Viewer/Editor permissions | Locked behind "Upgrade to Product Analytics" | ❌ Missing | Nothing to restrict; custom roles hold `viewContactPii`, `exportCustomers` and an unused `screens` list (`capabilities.ts:15-46`) | No per-dashboard visibility or access control. | P3 | M |
| Custom dashboards | Custom dashboard builder (charts, layout, filters, actions) | Up to 20 analysis charts, drag/resize, chart/table, time and segment filters, compare to past | ❌ Missing | No grid or layout library (`frontend/package.json`: recharts only); analytics reports are separate pages (`analytics/page.tsx:19-71`) and only funnels can be saved | No pin-to-dashboard, multi-chart layout or dashboard-level filters. | P2 | XL |
| Custom dashboards | Dashboard sharing and access requests | Share by email with access type; request access with a message | ❌ Missing | No report or dashboard sharing; teammates see what their role allows (`settings/team/page.tsx`; `capabilities.ts`) | Cannot share a dashboard with chosen teammates. | P3 | M |
| Custom dashboards | Scheduled dashboard email subscriptions (and Merlin weekly-report promo) | Daily/Weekly/Monthly, up to 50 recipients, CSV data | ❌ Missing | No digest or scheduled-report code. Building blocks: BullMQ workers (e.g. `workers/trialWorker.ts`) and admin emails (`trialLifecycleService.ts`) | No weekly performance email for founders and managers. | P2 | M |
| Create New menu | Global Create New launcher | Two-pane "Create" modal: Campaign, Flow, Segment, Dashboards, Alerts, Experience | 🟡 Partial | Nothing in the sidebar creates (`Sidebar.tsx:54-81`). Per page: Create Campaign slide-over (`campaigns/page.tsx:165-272`), Templates and Create Flow (`flows/page.tsx:168-185`), segment builder. Home Quick Actions (`dashboard/page.tsx:232-257`): "Create Campaign" hard-codes email/one-time (:239); "Create Flow" only opens `/flows` (:241) and is shown to manager and agent roles, who are blocked from Flows (`routes/flows.ts:42`) | One "+ Create" for campaign, flow and segment from anywhere. | P2 | S |
| Create New menu | Campaign channel picker: Push, Email, SMS | OUTBOUND tiles, each expanding into delivery types | 🟡 Partial | Tiles for all three (`campaigns/page.tsx:57-63`) open `/campaigns/create?channel=&type=`. Email sends via `sendEmail` (`campaignService.ts:949-1017`); push needs a brand-supplied `fcm_token` and the SDK has no web push. SMS is broken: `templateId` is saved only for email, WhatsApp and in-app (`create/page.tsx:611`), the send passes `''` (`campaignService.ts:1039`), and every SMS provider builds the body from a template row only (`twilioProvider.ts:7-16`; Gupshup, Bird, Vonage the same) | Every SMS campaign reaches the provider with an empty body. Fall back to the campaign's `bodyText` as FCM does, or save an SMS template. Same defect as module 01. | P0 | S |
| Create New menu | Campaign channel picker: RCS | RCS with One Time, Periodic, Event Triggered | ❌ Missing | Not in `CampaignChannel` (`types.ts:173`). Settings lists a Pinnacle "SMS + RCS" SMS provider (`settings/page.tsx:373`), but no `sms_pinnacle` provider is registered (`providers/index.ts:26-29`) | No RCS; also fix the misleading Pinnacle card. | P2 | L |
| Create New menu | Campaign channel picker: MMS | MMS with One Time, Periodic, Event Triggered | ❌ Missing | Not in `CampaignChannel`; no provider | No MMS; low relevance in India. | P3 | M |
| Create New menu | Campaign channel picker: In-app | INBOUND In-app tile | 🟡 Partial | In-App tile (`campaigns/page.tsx:62`); public `GET /api/v1/in-app-messages` plus an event endpoint (`v1InAppMessages.ts:44-186`; `index.ts:209`); nothing in `packages/sdk` or `sdk-react` renders it. The endpoint honours `audienceFilter` only, so a campaign aimed at a saved segment is served to everyone; Send Now marks recipients blocked because reachability checks `'inapp'` while the channel is `'in_app'` (`deliveryService.ts:487`) | Ship an SDK renderer, honour `segmentId`, and file In-App under Inbound. | P2 | M |
| Create New menu | Campaign channel picker: On-site | INBOUND On-site tile | 🟡 Partial | Only opt-in capture widgets (exit-intent, time, scroll, manual; target pages) rendered by `sdk/src/widget.ts` from `routes/optinWidgets.ts`. The `/widgets` page is not linked from anywhere in the app; no On-site tile in the picker | No segment-targeted on-site offers or banners. | P2 | M |
| Create New menu | Campaign channel picker: Cards | INBOUND Cards tile | ❌ Missing | Not a campaign channel (`campaigns/page.tsx:57-63`; `schema.ts:798`); `InAppPosition` lists `inbox` (`types.ts:450`) but nothing renders it | No persistent inbox cards. | P3 | L |
| Create New menu | Campaign channel picker: WhatsApp | WhatsApp with One Time, Periodic, Event Triggered | ✅ Full | Tile (`campaigns/page.tsx:61`) with One Time and Periodic; event-triggered through Flows `send_whatsapp` (`types.ts:672`); Meta Cloud API and Pinnacle providers | None at launcher level; depth is compared in module 04. | — | — |
| Create New menu | Campaign channel picker: Facebook, Google Ads audiences | AUDIENCE sync campaigns | 🟡 Partial | Manual: "Export as audience" downloads a hashed CSV for Meta, Google, TikTok, Snap or Pinterest (`ExportAudienceButton.tsx:15-23`; `routes/segments.ts:157-176`; needs `exportCustomers`). No API sync or refresh. Settings → Ad Conversions forwards conversion events to pixels, which is not audience sync | Retargeting audiences go stale after the upload; add Meta and Google audience sync. | P1 | L |
| Create New menu | Campaign channel picker: Custom connector | Connector with One Time, Periodic, Event Triggered | 🟡 Partial | Event-triggered is covered by the Flow HTTP Request step: GET to DELETE with `{{token}}` URL, headers and body (`types.ts:734-747`; `StructuredFlowBuilder.tsx:330,1234`; `flowExecutor.ts:213-225,822-880`). Outbound webhooks fire on segment enter/exit with signing, retries and a log (`segmentService.ts:156-182`; `useWebhooks.ts:42-47`). No one-time or periodic connector campaign | Campaigns cannot push a segment to an endpoint. The HTTP step lacks the SSRF guard (module 06). | P3 | M |
| Create New menu | ALL APPS: Telegram, Line, Viber (paid add-ons) | Tiles with "Request access", "See all", "Explore apps" | ❌ Missing | No such providers in `services/providers/`; no app marketplace | No extra messaging apps; rarely needed by Indian D2C. | P3 | L |
| Create New menu | ALL APPS: Snapchat, Pinterest, Criteo audiences | Paid add-on tiles | 🟡 Partial | The CSV export covers Snap and Pinterest (and TikTok), not Criteo (`ExportAudienceButton.tsx:17-23`); nothing syncs | Manual CSV only; no Criteo. | P3 | M |
| Create New menu | Delivery types: One Time and Periodic | Every channel | ✅ Full | Delivery cards (`campaigns/page.tsx:65-67`); periodic daily/weekly/monthly with an end date; `campaigns.delivery_type` (`schema.ts:413`); re-dispatched by `campaignScheduler.ts:73-95` | None. | — | — |
| Create New menu | Delivery type: Event Triggered | Every channel | 🟡 Partial | Tile disabled with "Soon" (`campaigns/page.tsx:68,262-266`). The equivalent is a one-step Flow, but Flows are admin-only (`Sidebar.tsx:62`; `routes/flows.ts:42`) while campaigns are open to all roles | A dead tile; route it to a one-step Flow. Managers and agents cannot build one at all. | P2 | S |
| Create New menu | Delivery types: Device and Location Triggered (push) | Push only | ➖ N/A | Need a native mobile SDK; Storees has a browser SDK only. A disabled "Device Triggered — On app open" tile still shows "Soon" (`campaigns/page.tsx:69`) | Not relevant; remove the misleading tile. | — | — |
| Create New menu | New Segment: Filter Segment | Properties, behaviours and values | ✅ Full | `/segments/create` with `SegmentFilterBuilder.tsx` and `AiChatPanel.tsx`; SQL evaluation in `packages/segments` | None. | — | — |
| Create New menu | New Segment: RFM Segment | Auto-segment by Recency, Frequency, Monetary | 🟡 Partial | RFM grid computed per request; cells open `/customers?rfm=` (`LifecycleChart.tsx:187`; `routes/customers.ts:88-130`). No RFM field in the builder or evaluator, so a cell cannot be saved or targeted; the ecommerce pack seeds look-alike filter segments (Champions, At Risk, Dormant; `packs/ecommerce.json`) | Campaigns and flows cannot target RFM groups. | P2 | S |
| Create New menu | New Segment: File Segment | Segment from an uploaded list | ❌ Missing | No upload in the segment UI; segments are filter-only (`routes/segments.ts:187`); no "is one of" operator (`types.ts:550-560`); bulk import only via `POST /api/v1/import/customers` (`v1Import.ts:57`) | Marketers cannot target an offline list without engineering help. | P1 | M |
| Create New menu | New Segment: Predictive Segment | Propensity-based segment | 🟡 Partial | Each active goal adds "goal — bucket" and "goal — score" fields under AI & Predictions (`predictionFieldDefs.ts:24-50`), evaluated against `prediction_scores` (`segments/src/evaluator.ts:1169-1195`) | Score filters work, but a bucket "is" rule never matches: scores are written as High/Medium/Low (`mlProxyService.ts:52`), the builder offers lowercase values (`predictionFieldDefs.ts:40`) and `is` is case-sensitive (module 08 rates this P0). Reached through the builder rather than a type card. | See 08 | — |
| Create New menu | New Dashboard starting points | Start with blank, or Users / Behavior / Funnels / Retention / Session & Source | ❌ Missing | No dashboards. Of the five analyses Storees has Funnels, Retention (Cohorts) and a fixed-metric Time Series (`analytics/page.tsx:19-47`); no Users or Session & Source analysis | Wiring is small once dashboards exist; the two missing analyses are the bulk. | P2 | L |
| Create New menu | New Experience: Web (WYSIWYG) | Visual editor for web pages | ❌ Missing | No visual editor or web personalization; the SDK renders only opt-in widgets (`sdk/src/widget.ts`) | No visual storefront personalization. | P3 | XL |
| Create New menu | New Experience: Web & App (API) | API-driven personalization | 🟡 Partial | Public `GET /api/v1/in-app-messages` returns audience-filtered content per customer (`v1InAppMessages.ts:44-186`). Recommendations and social proof resolve only on the admin-authenticated `GET /api/recommendations/resolve` (`routes/recommendations.ts:56-66`; `index.ts:223`) | No public decisioning API a storefront can call. | P2 | M |
| Create New menu | New Experience: Split URL Testing | Divide traffic among web pages | ❌ Missing | A/B exists only inside campaigns and the flow `ab_split` node (`types.ts:703-713`) | No web traffic split. | P3 | M |
| Create New menu | INFORM: Alerts (transactional) | Multi-channel transactional alerts | 🟡 Partial | Transactional campaigns bypass frequency caps (`create/page.tsx:1117`; `schema.ts:415`); flows can send on Shopify events; Notification Logs has a "transactional" source (`routes/logs.ts:22,32`). No transactional send API among the public v1 routes (`index.ts:170-209`) | No order, shipping or OTP alert API with channel fallback. | P2 | M |
| Create New menu | Flow templates (Create New > Flow) | 11 Adoption/Engagement templates, "Request a template", blank canvas | 🟡 Partial | Templates gallery and blank Create Flow (`flows/page.tsx:168-215`). The gallery's 7 hard-coded templates (`FlowTemplateGallery.tsx:37-162`) contain no WhatsApp step (12 email, 2 push, 1 SMS actions); events are localised (:13-23,180-206). A 30-template library across 5 industries with 21 WhatsApp sends is served by `GET /api/flows/templates/list` and `POST /templates/install` (`routes/flows.ts:549-573`; `flowTemplates.ts:69-357`), but no frontend code calls it | The lead channel is absent from every UI template while a better library sits unused. Wire it into the gallery; add "Request a template". | P1 | S |
| Global header | Environment concept (Test / Live) | Header badge with Live/Test dropdown | ❌ Missing | API keys are only `sk_live_`/`ss_live_` (`apiKeyAuth.ts:8-9`); the only "test mode" is Ad Conversions' test event code (`settings/ad-conversions/page.tsx:186-188`); a second project needs a super admin (`Sidebar.tsx:77`) | No sandbox. Campaign test sends and the Event Debugger cover part of the need. | P3 | L |
| Global header | Workspace switcher | Searchable workspace dropdown | ✅ Full | ProjectSwitcher with domain icons and an active check; single-project users see a label (`Sidebar.tsx:103-180`; `lib/projectContext.tsx`) | No search box; matters only for super admins. | — | — |
| Global header | Need help menu | Help center, Ask AI, Support, demo account, product ideas, Setup guide, Usecases, Integration guide, Academy | ❌ Missing | No header (`AppShell.tsx:10-23`); the sidebar and user menu have no help item (`Sidebar.tsx:54-81,219-245`); `frontend/src` contains no docs or support links | A trial merchant cannot find docs or support inside the app. | P1 | S |
| Global header | Ask AI support messenger | Intercom messenger with the AIRA assistant | ❌ Missing | No support chat. Reusable pieces: `whatsappChatbotService.ts` (FAQ knowledge base) and `llmService.ts` | No conversational help in the app. | P2 | S |
| Global header | Notification bell: What's new feed | Beamer release notes, reactions, feedback, search | ❌ Missing | No bell, changelog or notification UI; operational alerts are email only (`templateAlertService.ts`; `trialLifecycleService.ts`) | Users never see what shipped; alerts reach them only by email. | P3 | S |
| Global header | Dark mode toggle and Appearance themes | Light/Dark/System, Minimal, High contrast, festive themes | ❌ Missing | `tailwind.config.ts:10-31` defines fixed hex colours and no `darkMode`; about 1,360 hard-coded white/gray/slate classes in `frontend/src` | No dark, high-contrast or system theme. | P3 | L |
| Global header | Avatar / profile menu | Name, email, role, Appearance, My profile, Logout | ✅ Full | Sidebar footer: initials, name, email; Account, Security, Sign out (`Sidebar.tsx:182-248`) | The role is not shown. | — | — |
| Global header | Global search | None; search only inside flyouts | ➖ N/A | Neither product has one: no `cmdk` in `frontend/package.json`, no Ctrl+K handler; search is per list page (`campaigns/page.tsx:151-154`) | Nothing to close; a Cmd+K palette would be a cheap differentiator. | — | — |
| Global header | Merlin AI Studio entry point | Header link to the AI hub | 🟡 Partial | AI features are scattered: segment AI chat (`AiChatPanel.tsx`), campaign copywriter and variations, WhatsApp template brief (`WhatsAppBriefModal.tsx`), AI Email Designer at `/templates/ai` (linked only from Templates), Next Best Action, WhatsApp chatbot in Settings | No single place showing what the AI can do. | P2 | M |
| My profile | General: personal information with Edit | Name, email, role, active since, job title, department, phone, DOB | 🟡 Partial | Settings → Account: read-only Name, Email, Member since, Connected accounts (`settings/account/page.tsx:72-97,162-190`); `PATCH /api/auth/me` can rename, but no UI calls it (`routes/auth.ts:564`) | Users cannot edit their name or add profile details. | P3 | S |
| My profile | Security: password and 2-step verification | Set password (SSO users), authenticator 2FA | ✅ Full | Change password (`settings/account/page.tsx:101-160`; `routes/auth.ts:603`); TOTP with QR, secret, enable and disable (`settings/security/page.tsx`; `routes/auth.ts:327-419`); OAuth-only users set a password through Forgot password (`routes/auth.ts:215-268`) | Equivalent; no backup codes (admin and security module). | — | — |
| My profile | Security: active devices / sessions | Device, platform, last active, location, actions | ❌ Missing | Stateless 24-hour JWTs (`authService.ts:8`), no session store | Users cannot see where they are signed in or sign out a lost device. | P2 | M |
| Home / landing | Default landing page | No Home dashboard; logo lands on All campaigns with a failing intro video | ⭐ Storees better | `/` redirects to `/dashboard` (`app/page.tsx:4`) and Shopify installs land there (`oauth/shopify/callback/page.tsx:50`): KPI strip, three charts, AI Predictions, Segment Overview, Recent Activity, Quick Actions (`dashboard/page.tsx:65-375`) | None; small fix: make the sidebar logo link Home (`Sidebar.tsx:284-288`). | — | — |
| Home / landing | Integration-pending banner with "Check Event Log" | Banner on the landing page | 🟡 Partial | Home only says "No activity yet" inside Recent Activity (`dashboard/page.tsx:351-354`); SDK status sits in Settings → SDK & Integration (`settings/page.tsx:71,168-191`); `/debugger` is not linked from Home; no sync-running state. `GET /api/onboarding/projects/:id/integration-status` already returns pending, waiting_for_data or active (`v1Onboarding.ts:421-489`), but only the super-admin wizard calls it | Show a no-data or sync-running banner on Home from that endpoint. | P2 | S |
| Setup guide | Setup checklist with progress and welcome popup | 2/3 steps: Integrate / Validate, Invite team, Create campaign | ❌ Missing | The 8-step wizard ending in Quick Start cURL, Send Test Event and keys (`onboarding/page.tsx:875-930`) is super-admin only (`useSuperAdminGuard`, :127). The integration-status endpoint builds a 3-item checklist (connect Shopify or create a key, data received, segments seeded; `v1Onboarding.ts:460-469`) that no UI renders: the super-admin wizard fetches it (`onboarding/page.tsx:173`) but never shows it. Shopify installs land on `/dashboard` with no checklist | Nothing a merchant can reach shows a checklist (module 18 rates the same row ❌). Dismissible Home checklist: store connected, sync done, WhatsApp connected, first flow live, first campaign sent, teammate invited. | P1 | S |
| Setup guide | Capability tour, guided product tour and demo account | Capability tabs, Start tour, demo dashboard | ❌ Missing | No tour library (`frontend/package.json`); no merchant demo workspace (`scripts/seed.ts` is for developers); no capability overview page | No guided tour or sample-data sandbox. | P2 | M |
| Setup guide | View current plan and compare plans | Current plan (role-gated) and external pricing page | ✅ Full | Settings → Billing (admins): plan or trial days left, Starter/Pro cards billed through Shopify (`settings/billing/page.tsx:33-82`; `billingService.ts:36-37`); TrialBanner links there (`TrialBanner.tsx`) | None; plans are compared in the app. | — | — |
| Setup guide | "Already paid" 16-digit subscription code | Offline purchase code | ➖ N/A | Payment runs through Shopify Billing (`billingService.ts`); offline deals are upgraded by a super admin in Trials (`trials/page.tsx:129`) | None. | — | — |
| Setup guide | Knowledge Base: User, Developer, Partner guides | External docs links | ❌ Missing | No docs portal or docs link anywhere in `frontend/src`. Developer setup snippets exist only inside the app: Settings → SDK & Integration with Script Tag / Shopify / NPM / REST tabs and recommended and auto-tracked events (`settings/page.tsx:127-130,266-305`). No user or partner guide, no docs link | No user, developer or partner documentation; the guides exist only as repo markdown. Module 18 rates the same row ❌ and credits the in-app setup snippets as its Integrate drawer. | P1 | M |
| Left sidebar | Top-level navigation | Rail with hover flyouts and "New" markers | ✅ Full | Labelled sidebar: Dashboard, Customers, Segments, Analytics, Campaigns, Inbox, Templates, Flows, Event Sources, Event Debugger, Notification Logs, Settings, plus super-admin items; role-filtered, count badges, mobile drawer (`Sidebar.tsx:54-94,315-379`) | A flat list with no groups, flyouts or "New" markers. | — | — |
| Left sidebar | Expand / collapse sidebar | Chevron switches icon rail and labelled menu | ❌ Missing | Fixed `w-60` (`Sidebar.tsx:369`) and `lg:ml-60` (`AppShell.tsx:14`) | Cannot reclaim width for wide reports and the flow canvas. | P3 | S |

### Storees-only strengths

- **AI Predictions health card on Home.** The first three active goals show AUC %, a quality label (Unusable / Fair / Good / Strong), the last-trained date and a link to the goal (`dashboard/page.tsx:183-230`). MoEngage's Key Metrics, as captured, has no prediction widget.
- **Live Recent Activity and Segment Overview on Home.** The latest events with customer names, and the top segments by size linking to `/customers?segmentId=` (`dashboard/page.tsx:259-300,341-373`; `routes/dashboard.ts:318-350,547-566`). A new merchant sees immediately that data is arriving.
- **Home numbers scoped to the viewer's role and dealer, with PII masking.** Stats, trends and activity apply agent scope and mask contact fields (`routes/dashboard.ts:126-127,341-345`; `middleware/agentScope.ts`). Caveat: the Segment Overview counts and the sidebar badges other than customers are project-wide (`routes/dashboard.ts:508-566`).
- **Revenue that handles reversals and duplicates.** Orders rebuilt from events are deduplicated, and cancelled, returned or refunded orders count as orders but not as revenue (`routes/dashboard.ts:49-101,167-231`).
- **KPI strip that adapts to the business domain.** Ecommerce shows orders and revenue, fintech shows transactions and volume, other domains show events (`dashboard/page.tsx:482-529`; `routes/dashboard.ts:165-276`).
- **Trial banner and in-app Shopify upgrade.** Days left, amber at 3 days or fewer, with Upgrade to `/settings/billing` (`TrialBanner.tsx`; `settings/billing/page.tsx`). MoEngage's plan card links to an external pricing page.
- **Sidebar count badges** for customers, segments, campaigns, templates and flows (`Sidebar.tsx:316-327`; `routes/dashboard.ts:508-540`).
- **Reachable count on each segment** before anyone builds a campaign (`segmentService.ts:81-104`; `segments/page.tsx:129-137`). Caveat: any phone counts as WhatsApp-reachable, opt-in or not.
- **Flow templates localised to the project's own event names**, plus a domain filter and "Recommended for" (`FlowTemplateGallery.tsx:13-23,180-206`).
- **WhatsApp shared Inbox in the main navigation**, with bot and human handoff (`Sidebar.tsx:60`; `routes/whatsappInbox.ts`).
- **WhatsApp billable-conversation usage and estimated spend** by Marketing, Utility, Authentication and Service over 7/30/90 days (`WhatsappUsage.tsx:11-20`; spend shown when `WA_RATE_*` is set). MoEngage's Campaign stats does not include WhatsApp at all.
- **Retention tactics and plain-language RFM insights** (`lifecycle.ts:131-141`; `LifecycleChart.tsx:583-599`).
- **Navigation that works on a phone:** a top bar, a slide-in drawer, a backdrop and a body scroll lock (`Sidebar.tsx:340-379`). The MoEngage capture showed only a desktop layout.

### UX notes

- **App chrome (screenshots 001, 043-053, 064).** MoEngage has two layers: a collapsible icon rail with hover flyouts, and a slim top header (Merlin, Test/Live, workspace, Need help, theme, bell, avatar). Storees has no header; the project switcher and user menu sit inside a fixed 240px sidebar (`AppShell.tsx:10-23`; `Sidebar.tsx:103-248`), and the logo is a plain image (`Sidebar.tsx:284-288`).
  - A thin top bar would give Help, an alerts bell and the project switcher a permanent home.
  - Grouping the flat list of 11-15 items into Analyze / Engage / Data / Admin would scale better as features grow.
- **Create launcher (030, 032, 039, 040).** MoEngage groups creation by intent, and delivery types expand inline under each channel tile. Storees' Create Campaign slide-over has four problems:
  - All five channels sit under one "Outbound" heading, though In-App is inbound and WhatsApp is a messaging app (`campaigns/page.tsx:195`).
  - Two tiles are dead "Soon" placeholders, Event Triggered and Device Triggered (:68-69).
  - Home's "Create Campaign" quick action skips the picker by hard-coding email/one-time (`dashboard/page.tsx:239`).
  - "Create Flow" only opens the Flows list (:241), and it is also shown to managers and agents, who are blocked from Flows.
  - Suggestion: reuse the slide-over as a global "+ Create" with Campaign, Flow (with templates) and Segment, and send "Event Triggered" to a one-step Flow.
- **Campaign stats (003, 004, 007, 016, 058).** MoEngage puts KPI cards with definition tooltips and a % change that follows the chosen period above a channel table and per-channel sections. Storees Home differs in three ways:
  - The % change is always last 7 vs previous 7 days, even when the picker says 30 (`routes/dashboard.ts:114-116`).
  - "Total Orders" and "Revenue" show lifetime totals beside that 7-day change, and "New Customers" does not say it covers 7 days (`routes/dashboard.ts:182-192,293-299`).
  - The chart Info icons have no tooltip (`dashboard/page.tsx:427`).
  - Opening: MoEngage's channel table leaves WhatsApp out entirely. A Storees version led by WhatsApp sent / delivered / read / clicked and attributed revenue would beat it for Indian D2C.
  - MoEngage also puts a "Campaign stats" button in the All campaigns header (058); Storees could add the same shortcut to the campaign list.
- **Date ranges (014, 015, 022).** MoEngage uses one picker everywhere: ten presets, Since, Last N D/W/M, a two-month calendar and an explicit Apply. Storees uses different segmented buttons per page (Home 7/14/30, Analytics 7/14/30/90, campaign buckets 72h/90d/52w), and the only from/to inputs are on the Event Debugger. One shared DateRangePicker would make month-end reporting possible on Home, Analytics, and campaign and flow reports.
- **Onboarding (059-061).** MoEngage's Setup guide keeps a progress checklist, capability tabs, plans and knowledge base on one page. A fresh Shopify install in Storees goes straight to `/dashboard` (`oauth/shopify/callback/page.tsx:50`) with no checklist and no "historical sync running" state, so a trial user first sees zeros.
  - The integration-status endpoint already computes a checklist and a pending / waiting / active status (`v1Onboarding.ts:421-489`). A dismissible card at the top of Home could show it, extended with WhatsApp configured, first flow active, first campaign sent and teammate invited.
- **Profile (053, 056, 057).** MoEngage keeps personal settings behind the avatar (General / Security / Appearance, with an active-devices table), apart from workspace settings. Storees mixes Account and Security into one non-wrapping tab row with up to nine project-admin tabs (`settings/layout.tsx:12-27,44`), and Account is read-only although `PATCH /api/auth/me` exists. Move personal settings behind the user menu and make the name editable.
- **Notification bell (050-052).** MoEngage's bell is only a Beamer release-notes feed. If Storees adds one, operational alerts should come first: WhatsApp template rejected or re-categorised, campaign failed, sync failed, trial ending. Storees already detects re-categorisation and trial ending but only emails them.
- **Where Storees is ahead (002, 053, 058).** MoEngage's logo lands on the campaign list with an integration-pending banner and an embedded video that fails (Error 153), and Key Metrics shows nothing outside Live. Storees opens on a real Home in every project. Build the missing pieces (cross-channel stats, setup checklist, KPI tooltips) into this Home rather than into separate pages.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status. Missing and partial rows were searched under synonyms:
- dashboard, widget, pin, saved_analyses, digest, weekly report, subscription;
- export, csv, Blob, Content-Disposition, download;
- byChannel, groupBy channel, attribution, last touch;
- rcs, mms, telegram, viber, criteo, cards, inbox;
- webhook, http_request, connector;
- checklist, integration-status, getting started, tour, demo;
- help, docs, support, changelog, bell, darkMode, cmdk;
- session, revoke, device, best_send_hour, duration_ms.

Full rows were checked for a UI route, an API endpoint and a working engine.

**Status changes (2):**
- **Campaign channel picker: Push, Email, SMS: ✅ Full → 🟡 Partial, P0 S.** The create page saves `templateId` only for email, WhatsApp and in-app (`create/page.tsx:611`). The campaign send passes `''` (`campaignService.ts:1039`), and Twilio, Gupshup, Bird and Vonage build the SMS body from a template row only, so every SMS campaign has an empty body. Module 01 reports the same defect.
- **Chart drill-down: ❌ Missing → 🟡 Partial.** The Segment Overview bars and AI Prediction cards on Home do drill through; only the three trend charts do not.

**Priority and effort changes (3):**
- **Custom connector: P2 → P3 (🟡 Partial kept).** The original evidence said flows cannot call a custom endpoint. The flow HTTP Request step (`types.ts:734-747`; `flowExecutor.ts:822-880`; in the builder palette) covers event-triggered connectors, so only one-time and periodic connector campaigns are missing. Module 01 rates this P3 M.
- **Flow templates: P2 → P1 (🟡 Partial kept).** The gallery's 7 templates contain no WhatsApp step at all, not "mostly email". The unused server library has 30 templates across 5 industries with 21 WhatsApp sends, so wiring it in is a cheap, high-value fix. Module 06 rates the same library P1.
- **Setup checklist: effort M → S (P1 kept).** `GET /api/onboarding/projects/:id/integration-status` already computes a checklist and status (`v1Onboarding.ts:421-489`), and `/api/dashboard/counts` counts flows and campaigns.

**Evidence and gap corrections (status, priority and effort unchanged):**
- **KPI summary cards and Overall performance by channel.** The "data already stored in `messages`" claim was incomplete. Campaign emails write only `campaign_sends` (`campaignService.ts:949-1017`), and flow emails write nothing (`flowExecutor.ts:750`). Notification Logs, and any rollup over `messages`, therefore excludes email; flow-email recording is a prerequisite.
- **Per-channel sections.** "WhatsApp has no channel-level view at all" was wrong: Settings shows WhatsApp billable conversations by category over 7/30/90 days (`WhatsappUsage.tsx`). It has no engagement or conversion trend.
- **Connector and FB audience sections.** The HTTP step exists, but its results stay in each trip's `node_outputs`, so there are no attempted or success counts.
- **Session KPIs.** `metricsWorker.ts:559-619` does aggregate session duration and pages per session, but only per customer, for the engagement score.
- **Conversion KPIs.** Added the event-mapping purchase slot as the nearest project-level conversion definition.
- **Date presets.** The Event Debugger has from/to date inputs (`debugger/page.tsx:82-86`); no report has a custom range.
- **Best time analysis.** The profile's "Best Send Time" reads `metrics.best_send_hour`, which nothing writes.
- **In-app.** The endpoint ignores `segmentId`, so segment-targeted campaigns are served to everyone, and Send Now marks recipients blocked (`'inapp'` vs `'in_app'`, `deliveryService.ts:487`).
- **Web & App (API).** Content is audience-filtered, not segment-targeted.
- **On-site.** `/widgets` is linked from nowhere, not just missing from the sidebar.
- **RCS.** The Pinnacle "SMS + RCS" card has no registered provider.
- **Event Triggered.** The one-step-Flow workaround is admin-only.
- **Global Create launcher.** Home's "Create Flow" is shown to roles fenced out of Flows.
- **Reachability.** WhatsApp counts any phone, and the campaign audience preview reports reachable recipients.
- **Integration banner.** The status endpoint already exists.
- **Dark mode.** About 1,360 hard-coded colour classes, not 1,200.
- **UX note.** The "Campaign stats" header button is visible in screenshot 058, not 053.

**Priority conflicts with other modules (kept here; resolve in the consolidated list):**
- Campaign stats KPI cards and the channel table are P0 here but P1 in module 01; per-channel sections are P1 here and P2 there.
- File Segment is P1 here and P0 in module 09.
- Custom dashboards are P2 here; module 10's "Save chart / table to a dashboard" is P1 L and module 01's "Dashboard switcher and custom dashboards" is P3 L.
- The global Create launcher is P2 here and P3 in modules 01 and 08.
- Facebook/Google audience sync is P1 L here and P2 M in module 01.

**Defects found outside the parity scope:**
- Campaign report Revenue card and per-conversion revenue hard-code "$" (`campaigns/[id]/page.tsx:425`).
- Notification Logs counts each message by its latest status, so "Delivered" excludes messages later read or clicked.
- Home KPI tiles pair lifetime totals with a 7-day % change and ignore the range picker.
- The profile "Best Send Time" tile always shows "—".
- `/widgets` is an orphan route.
- Segment Transitions' "Create Flow" and "View Users" links are broken.

**Final counts:** 10 Full, 35 Partial, 27 Missing, 1 Storees better, 6 N/A (79 rows) after the verification pass; 9 Full, 34 Partial, 29 Missing, 1 Storees better, 6 N/A after the cross-module consistency review below.

- **Cross-module consistency review (completeness pass, code re-checked at `2063cdc`):**
  - **New Segment: Predictive Segment: ✅ → 🟡 (see module 08).** Bucket rules never match: writers use High/Medium/Low (`mlProxyService.ts:52`) and the builder offers lowercase (`predictionFieldDefs.ts:40`).
  - **Setup checklist: 🟡 → ❌**, matching module 18. The super-admin wizard fetches integration status (`onboarding/page.tsx:173`) but never renders it, and nothing a merchant reaches shows a checklist.
  - **Knowledge Base: 🟡 → ❌**, matching module 18. `frontend/src` has no docs or help links; module 18 credits the in-app setup snippets separately.

### Screens

#### Dashboards flyout (left sidebar)

![Dashboards flyout: Search, + New Dashboard, MoEngage Dashboards > Key Metrics, Campaign Stats, Reachability](../screenshots/12-home-dashboards-001-dashboards-flyout.jpg)
*Dashboards flyout: Search, + New Dashboard, MoEngage Dashboards > Key Metrics, Campaign Stats, Reachability*

![Flyout search typed 'reach' filters the list to Reachability](../screenshots/12-home-dashboards-063-dashboards-flyout-search.jpg)
*Flyout search typed 'reach' filters the list to Reachability*

#### Key Metrics dashboard

![Key Metrics empty state: not available on Test environment, switch to Live](../screenshots/12-home-dashboards-002-key-metrics-test-env-empty.jpg)
*Key Metrics empty state: not available on Test environment, switch to Live*

#### Campaign stats dashboard

![Top: KPI cards (Total sent, impression, click, CTR, conversion, CVR) and Overall performance table by channel](../screenshots/12-home-dashboards-003-campaign-stats-top.jpg)
*Top: KPI cards (Total sent, impression, click, CTR, conversion, CVR) and Overall performance table by channel*

![Overall performance chart view: metric tabs, line/bar, Hourly/Daily/Weekly/Monthly, legend per channel](../screenshots/12-home-dashboards-017-campaign-stats-overall-chart-view.jpg)
*Overall performance chart view: metric tabs, line/bar, Hourly/Daily/Weekly/Monthly, legend per channel*

![Push channel section: All metrics funnel chart + Campaign summary (CVR/CTR highest/lowest)](../screenshots/12-home-dashboards-004-campaign-stats-push-channel.jpg)
*Push channel section: All metrics funnel chart + Campaign summary (CVR/CTR highest/lowest)*

![Push channel 'All ratios' tab: CTR, CVR, Impression rate lines](../screenshots/12-home-dashboards-018-campaign-stats-push-all-ratios.jpg)
*Push channel 'All ratios' tab: CTR, CVR, Impression rate lines*

![Push channel single-metric tab (Sent) enables chart/table toggle](../screenshots/12-home-dashboards-019-campaign-stats-push-sent-metric.jpg)
*Push channel single-metric tab (Sent) enables chart/table toggle*

![Email channel: Sent, Open, Click, Conversion, Revenue, All ratios, CTR, CVR, Open rate](../screenshots/12-home-dashboards-005-campaign-stats-email-channel.jpg)
*Email channel: Sent, Open, Click, Conversion, Revenue, All ratios, CTR, CVR, Open rate*

![SMS channel: Sent, Delivered, Click, Conversion, Revenue, CTR, CVR, Delivery rate](../screenshots/12-home-dashboards-006-campaign-stats-sms-channel.jpg)
*SMS channel: Sent, Delivered, Click, Conversion, Revenue, CTR, CVR, Delivery rate*

![Flows channel: Total trips, Engaged trips, Converted trips, CVR (UTC timezone)](../screenshots/12-home-dashboards-007-campaign-stats-flows-channel.jpg)
*Flows channel: Total trips, Engaged trips, Converted trips, CVR (UTC timezone)*

![InApp and Onsite channel sections: Impression, Click, Conversion, Revenue, CTR, CVR](../screenshots/12-home-dashboards-008-campaign-stats-inapp-onsite-channel.jpg)
*InApp and Onsite channel sections: Impression, Click, Conversion, Revenue, CTR, CVR*

![Connector channel: Attempted, Sent, Conversion, Revenue, CVR, Success rate](../screenshots/12-home-dashboards-009-campaign-stats-connector-channel.jpg)
*Connector channel: Attempted, Sent, Conversion, Revenue, CVR, Success rate*

![FB audience channel: Eligible, Attempted, Synced, Conversion, User attempted, User synced](../screenshots/12-home-dashboards-010-campaign-stats-fb-audience-channel.jpg)
*FB audience channel: Eligible, Attempted, Synced, Conversion, User attempted, User synced*

![Title dropdown dashboard switcher: search, Key metrics, Reachability, + Create new](../screenshots/12-home-dashboards-011-campaign-stats-dashboard-switcher.jpg)
*Title dropdown dashboard switcher: search, Key metrics, Reachability, + Create new*

![Title info tooltip describing Campaign stats](../screenshots/12-home-dashboards-012-campaign-stats-title-tooltip.jpg)
*Title info tooltip describing Campaign stats*

![Conversion type dropdown: Click through conversion, Total conversion](../screenshots/12-home-dashboards-013-campaign-stats-conversion-type-dropdown.jpg)
*Conversion type dropdown: Click through conversion, Total conversion*

![Date presets: Today ... Custom Range, Since, Last N D/W/M](../screenshots/12-home-dashboards-014-campaign-stats-date-presets.jpg)
*Date presets: Today ... Custom Range, Since, Last N D/W/M*

![Custom Range: two-month calendar, From/To, Reset, Cancel, Done](../screenshots/12-home-dashboards-015-campaign-stats-custom-range-calendar.jpg)
*Custom Range: two-month calendar, From/To, Reset, Cancel, Done*

![KPI definition tooltip (Total sent, with % change vs previous period)](../screenshots/12-home-dashboards-016-campaign-stats-kpi-tooltip-total-sent.jpg)
*KPI definition tooltip (Total sent, with % change vs previous period)*

#### Reachability dashboard

![Reachability empty state: no platform enabled for analysis](../screenshots/12-home-dashboards-020-reachability-empty.jpg)
*Reachability empty state: no platform enabled for analysis*

![Reachability title tooltip](../screenshots/12-home-dashboards-021-reachability-title-tooltip.jpg)
*Reachability title tooltip*

![Reachability date picker: Yesterday, Last Week, Last Month, Custom Range](../screenshots/12-home-dashboards-022-reachability-date-picker.jpg)
*Reachability date picker: Yesterday, Last Week, Last Month, Custom Range*

#### Create dashboard modal (+ New Dashboard / Start with blank)

![Create dashboard modal: name, visibility (Workspace), permission (Editor), Cancel/Create](../screenshots/12-home-dashboards-023-new-dashboard-create-modal.jpg)
*Create dashboard modal: name, visibility (Workspace), permission (Editor), Cancel/Create*

![Visibility scope options: Private (locked), Workspace](../screenshots/12-home-dashboards-024-new-dashboard-visibility-dropdown.jpg)
*Visibility scope options: Private (locked), Workspace*

![Private locked: 'Upgrade to Product Analytics to create Private dashboards'](../screenshots/12-home-dashboards-025-new-dashboard-private-locked-tooltip.jpg)
*Private locked: 'Upgrade to Product Analytics to create Private dashboards'*

![Permission options: Viewer (locked), Editor](../screenshots/12-home-dashboards-026-new-dashboard-permission-dropdown.jpg)
*Permission options: Viewer (locked), Editor*

![Viewer locked: 'Upgrade to Product Analytics to manage dashboard permissions'](../screenshots/12-home-dashboards-027-new-dashboard-viewer-locked-tooltip.jpg)
*Viewer locked: 'Upgrade to Product Analytics to manage dashboard permissions'*

![Same Create dashboard modal opened from Create New > Dashboards > Start with blank](../screenshots/12-home-dashboards-065-create-new-start-blank-create-dashboard-modal.jpg)
*Same Create dashboard modal opened from Create New > Dashboards > Start with blank*

#### Best time analysis dashboard (hidden route)

![Best time analysis: not enabled, contact MoEngage team](../screenshots/12-home-dashboards-028-best-time-analysis-not-enabled.jpg)
*Best time analysis: not enabled, contact MoEngage team*

#### Create New menu ('+' at top of sidebar)

!['+' button tooltip 'Create New'](../screenshots/12-home-dashboards-029-create-new-tooltip.jpg)
*'+' button tooltip 'Create New'*

![Create menu, Campaign selected: Outbound/Inbound/Messaging apps/Audience tiles + 'Reach your audience on more channels' promo](../screenshots/12-home-dashboards-030-create-new-menu-campaign.jpg)
*Create menu, Campaign selected: Outbound/Inbound/Messaging apps/Audience tiles + 'Reach your audience on more channels' promo*

![Scrolled: Audience (Facebook, Google Ads), Connector (Custom), All apps (Telegram, Line, Viber, Snapchat/Pinterest/Criteo Ads Audience), See all](../screenshots/12-home-dashboards-031-create-new-campaign-audience-connector-apps.jpg)
*Scrolled: Audience (Facebook, Google Ads), Connector (Custom), All apps (Telegram, Line, Viber, Snapchat/Pinterest/Criteo Ads Audience), See all*

![Push delivery types: One Time, Periodic, Event Triggered, Device Triggered, Location Triggered](../screenshots/12-home-dashboards-032-create-new-push-delivery-types.jpg)
*Push delivery types: One Time, Periodic, Event Triggered, Device Triggered, Location Triggered*

![Email delivery types: One Time, Periodic, Event Triggered](../screenshots/12-home-dashboards-033-create-new-email-delivery-types.jpg)
*Email delivery types: One Time, Periodic, Event Triggered*

![SMS delivery types: One Time, Periodic, Event Triggered](../screenshots/12-home-dashboards-034-create-new-sms-delivery-types.jpg)
*SMS delivery types: One Time, Periodic, Event Triggered*

![MMS delivery types: One Time, Periodic, Event Triggered](../screenshots/12-home-dashboards-035-create-new-mms-delivery-types.jpg)
*MMS delivery types: One Time, Periodic, Event Triggered*

![RCS delivery types: One Time, Periodic, Event Triggered](../screenshots/12-home-dashboards-036-create-new-rcs-delivery-types.jpg)
*RCS delivery types: One Time, Periodic, Event Triggered*

![WhatsApp delivery types: One Time, Periodic, Event Triggered](../screenshots/12-home-dashboards-037-create-new-whatsapp-delivery-types.jpg)
*WhatsApp delivery types: One Time, Periodic, Event Triggered*

![Custom connector delivery types + tooltip 'Snapchat Ads Audience is a paid add-on. Request access'](../screenshots/12-home-dashboards-038-create-new-connector-and-paid-addon-tooltip.jpg)
*Custom connector delivery types + tooltip 'Snapchat Ads Audience is a paid add-on. Request access'*

![New Segment: Filter, RFM, File, Predictive Segment](../screenshots/12-home-dashboards-039-create-new-segment-types.jpg)
*New Segment: Filter, RFM, File, Predictive Segment*

![New Dashboard: Start with blank, or start with an analysis (Users, Behavior, Funnels, Retention, Session & Source)](../screenshots/12-home-dashboards-040-create-new-dashboard-options.jpg)
*New Dashboard: Start with blank, or start with an analysis (Users, Behavior, Funnels, Retention, Session & Source)*

![Analysis card hover description (Session & Source)](../screenshots/12-home-dashboards-066-create-new-dashboard-analysis-card-hover.jpg)
*Analysis card hover description (Session & Source)*

![New Experience: Web (WYSIWYG), Web & App (API), Split URL Testing](../screenshots/12-home-dashboards-041-create-new-experience-types.jpg)
*New Experience: Web (WYSIWYG), Web & App (API), Split URL Testing*

![Flow opens 'Create new flow': template list + Start with a blank canvas](../screenshots/12-home-dashboards-042-create-new-flow-templates-modal.jpg)
*Flow opens 'Create new flow': template list + Start with a blank canvas*

#### Global header

![Environment dropdown: Live / Test (not switched)](../screenshots/12-home-dashboards-043-header-environment-dropdown-live-test.jpg)
*Environment dropdown: Live / Test (not switched)*

![Workspace switcher: search, Assets_Group, Demo Account - E-commerce (not switched)](../screenshots/12-home-dashboards-044-header-workspace-switcher.jpg)
*Workspace switcher: search, Assets_Group, Demo Account - E-commerce (not switched)*

![Need help menu: Help center, Ask AI, Support, Explore demo account, Submit product idea](../screenshots/12-home-dashboards-045-header-need-help-menu.jpg)
*Need help menu: Help center, Ask AI, Support, Explore demo account, Submit product idea*

![Need help menu scrolled: Setup guide, Usecases, Integration guide, MoEngage academy (New)](../screenshots/12-home-dashboards-046-header-need-help-menu-scrolled.jpg)
*Need help menu scrolled: Setup guide, Usecases, Integration guide, MoEngage academy (New)*

![Ask AI opens Intercom support messenger (AIRA): Ask a question, announcements, Home/Messages](../screenshots/12-home-dashboards-047-need-help-ask-ai-messenger-home.jpg)
*Ask AI opens Intercom support messenger (AIRA): Ask a question, announcements, Home/Messages*

![Messenger Messages tab: 'No messages', Ask a question](../screenshots/12-home-dashboards-048-need-help-ask-ai-messenger-messages.jpg)
*Messenger Messages tab: 'No messages', Ask a question*

![Theme toggle tooltip 'Switch to dark mode' (not toggled)](../screenshots/12-home-dashboards-049-header-theme-toggle-tooltip.jpg)
*Theme toggle tooltip 'Switch to dark mode' (not toggled)*

![Bell opens Beamer 'What's new on MoEngage' feed: Subscribe to get email updates, dated posts, reactions, feedback box](../screenshots/12-home-dashboards-050-notifications-whats-new-panel.jpg)
*Bell opens Beamer 'What's new on MoEngage' feed: Subscribe to get email updates, dated posts, reactions, feedback box*

![What's new feed scrolled (release notes posts)](../screenshots/12-home-dashboards-051-notifications-whats-new-scrolled.jpg)
*What's new feed scrolled (release notes posts)*

![What's new search: categories All/Announcement and month filters](../screenshots/12-home-dashboards-052-notifications-whats-new-search-filters.jpg)
*What's new search: categories All/Announcement and month filters*

![Avatar menu (name/email masked): role, Appearance (New), My profile, Logout](../screenshots/12-home-dashboards-053-profile-avatar-menu.jpg)
*Avatar menu (name/email masked): role, Appearance (New), My profile, Logout*

#### My profile (from avatar menu)

![My profile > General: personal information fields (name/email masked)](../screenshots/12-home-dashboards-056-profile-general.jpg)
*My profile > General: personal information fields (name/email masked)*

![My profile > Security: password (SSO), 2-step verification, active devices table](../screenshots/12-home-dashboards-057-profile-security.jpg)
*My profile > Security: password (SSO), 2-step verification, active devices table*

![My profile > Appearance: Default/Minimal theme Light/Dark/System](../screenshots/12-home-dashboards-054-profile-appearance-themes.jpg)
*My profile > Appearance: Default/Minimal theme Light/Dark/System*

![Appearance: Other themes with 'I'm interested!' and 'Suggest a theme'](../screenshots/12-home-dashboards-055-profile-appearance-other-themes.jpg)
*Appearance: Other themes with 'I'm interested!' and 'Suggest a theme'*

#### Home / default landing (logo click)

![Logo click lands on All campaigns with integration-pending banner and intro video](../screenshots/12-home-dashboards-058-home-logo-landing-all-campaigns.jpg)
*Logo click lands on All campaigns with integration-pending banner and intro video*

#### Setup guide (Need help > Setup guide)

![Setup guide: 2/3 steps checklist and 'What can you do with MoEngage?' tabs (name masked)](../screenshots/12-home-dashboards-059-setup-guide-top.jpg)
*Setup guide: 2/3 steps checklist and 'What can you do with MoEngage?' tabs (name masked)*

![Setup guide Predict tab: custom predictions tip](../screenshots/12-home-dashboards-060-setup-guide-predict-tab.jpg)
*Setup guide Predict tab: custom predictions tip*

![Bottom: product tour, demo dashboard, plans, subscription code, Knowledge Base](../screenshots/12-home-dashboards-061-setup-guide-plans-knowledge-base.jpg)
*Bottom: product tour, demo dashboard, plans, subscription code, Knowledge Base*

!['View current plan' redirects with toast 'Your role doesn't have permission to access billing'](../screenshots/12-home-dashboards-062-view-current-plan-no-billing-permission.jpg)
*'View current plan' redirects with toast 'Your role doesn't have permission to access billing'*

#### Left sidebar (expanded)

![Expanded sidebar with all top-level section labels](../screenshots/12-home-dashboards-064-sidebar-expanded-labels.jpg)
*Expanded sidebar with all top-level section labels*
