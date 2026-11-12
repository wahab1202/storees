## 01. Engage > Campaigns: list, create entry, channels & delivery types, audience step

Storees covers the core of this module. It has a channel × delivery-type picker, a 3-step wizard, a strong AND/OR/nested audience builder with exclusions and commerce-native conditions, campaign control groups with lift reporting, and a pre-send deliverability preview that goes further than MoEngage's Show count. It falls behind on the campaign list (filters, pagination, pause/stop), has no cross-campaign stats dashboard, and has thinner attribute and date operators.

Three P0 defects come first:
- SMS campaigns reach the provider with an empty body.
- Campaign emails have no working unsubscribe and ignore Shopify opt-outs.
- A campaign saved without a segment or rules silently sends to every customer.

### MoEngage overview

Engage > Campaigns is MoEngage's hub for one-off and recurring messages across about 20 channels. It has four parts:
- **Campaign list:** count tabs, rich filters, an archive view and a cross-workspace import.
- **Campaign stats dashboard:** cross-channel performance across all campaigns.
- **New Campaign picker:** one channel × delivery-type picker, reachable from three places.
- **3-step builder:** step 1 holds campaign details, the audience (4 condition types, nested AND/OR, exclusions), Show count with reachability, and control groups.

The capture was **partial**:
- The workspace had no campaigns, so no row actions or detail pages could be seen.
- Drafts were blocked for the Developer role.
- Event pickers were empty because no events had been ingested.
- Builder steps 2 and 3 were not opened.

| Page visited | URL path |
|---|---|
| All Campaigns (list) | `/v4/campaigns/all` |
| Import campaign drawer (opened only) | `/v4/campaigns/all` (full-screen drawer) |
| Campaign stats dashboard | `/v4/dashboards/campaign-stats` (opens in a new tab) |
| New Campaign: channel × delivery-type picker | `/v4/campaigns/all` (modal). The same picker opens from the Engage flyout and from the global "+ Create New" menu |
| Connected Apps (ALL APPS > See all) | `/v4/campaigns/all` (modal) |
| Email One Time builder, step 1 "Target users" | `/v4/email/create/one-time` |
| Push One Time builder, step 1 "Target users" | `/v4/push/create/one-time` |
| Email Event Triggered builder, step 1 | `/v4/email/create/event-trigger` |

### Storees counterpart

- **`/campaigns`**: `packages/frontend/src/app/(dashboard)/campaigns/page.tsx`.
  - A status strip (All, Active, Scheduled, Sent, Drafts), client-side search, an Active/Archived toggle and an unpaginated table.
  - A "Create Campaign" slide panel picks the channel (Push, Email, SMS, WhatsApp, In-App) and the delivery type (One Time, Periodic, plus disabled "Soon" cards for Event and Device Triggered).
- **`/campaigns/create?channel=&type=`**: `packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx`.
  - A 3-step wizard: Target Users, Content, Schedule and Goals.
  - `Step1TargetUsers` (lines 1008-1488) uses the shared `packages/frontend/src/components/segments/SegmentFilterBuilder.tsx`.
- **`/campaigns/[id]`**: per-campaign analytics (attribution toggle, time buckets, control-group lift) and Send Now. `/campaigns/[id]/edit` edits drafts.
- **`/campaigns/ctwa`**: Click-to-WhatsApp ad attribution. It is not linked from the nav.
- **`/logs`**: Notification Logs. This is the only cross-campaign aggregate, and it is admin only.
- **Backend:**
  - `packages/backend/src/routes/campaigns.ts`
  - `packages/backend/src/services/campaignService.ts` (audience preview, staging and sending)
  - `packages/backend/src/services/deliveryService.ts` (consent, frequency cap and reachability gates for SMS, push and WhatsApp)
  - `packages/backend/src/workers/campaignScheduler.ts`
  - `packages/backend/src/services/campaignAnalyticsService.ts`
  - the SQL filter engine in `packages/segments/src/evaluator.ts`
  - the field registry in `packages/backend/src/services/domainRegistry.ts`
- **Event-triggered sends** exist only as Flows: `packages/frontend/src/components/flows/StructuredFlowBuilder.tsx` and `packages/backend/src/workers/triggerWorker.ts`.

**Path key for the Evidence column.** Line numbers are at commit `2063cdc`.

| Short name | Repo path |
|---|---|
| `campaigns/page.tsx` | `packages/frontend/src/app/(dashboard)/campaigns/page.tsx` |
| `create/page.tsx` | `packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx` |
| `[id]/page.tsx` | `packages/frontend/src/app/(dashboard)/campaigns/[id]/page.tsx` |
| `SFB` | `packages/frontend/src/components/segments/SegmentFilterBuilder.tsx` |
| `StructuredFlowBuilder.tsx` | `packages/frontend/src/components/flows/StructuredFlowBuilder.tsx` |
| `routes/*.ts` | `packages/backend/src/routes/*.ts` |
| `campaignService.ts`, `deliveryService.ts`, `campaignAnalyticsService.ts`, `domainRegistry.ts`, `emailService.ts`, `agentFieldDefs.ts`, `entitlementService.ts`, `adAudienceExport.ts`, `flowExecutor.ts` | `packages/backend/src/services/` |
| `providers/*.ts` | `packages/backend/src/services/providers/` |
| `campaignScheduler.ts`, `triggerWorker.ts`, `syncWorker.ts`, `aggregateReconcileWorker.ts` | `packages/backend/src/workers/` |
| `schema.ts` | `packages/backend/src/db/schema.ts` |
| `types.ts` | `packages/shared/src/types.ts` |
| `evaluator.ts` | `packages/segments/src/evaluator.ts` |

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Campaign list | Create campaign button | "+ Create campaign" opens the channel × delivery-type picker | ✅ Full | `campaigns/page.tsx:165-176`, picker `179-272`, empty-state CTA `285-291` | None. | — | — |
| Campaign list | Refresh button | "Refresh" re-fetches the list | 🟡 Partial | No control on `campaigns/page.tsx`. Relies on TanStack defaults (30 s staleTime, refetch on focus) in `providers.tsx:11-18` | Progress of a sending campaign shows only after a refocus. Add a Refresh button or poll while a campaign is `sending`. | P3 | S |
| Campaign list | Import campaign from another workspace | 2-step drawer: choose a source workspace (including Test environments), select campaigns, import | ❌ Missing | Only same-project duplicate: `routes/campaigns.ts:643-656`, `campaignService.ts:1310-1373`. No Test/Live environments | Agencies and multi-brand clients cannot copy a proven campaign into another project. | P3 | M |
| Campaign list | Integration-pending banner and help card | "Your integration is pending" banner with Check Event Log; help video and doc links | ❌ Missing | `campaigns/page.tsx` shows no integration state or help. The integration-status API (`routes/v1Onboarding.ts:421`) is used only on `/onboarding` | Reuse integration-status to show a "no events yet, open Event Debugger" banner on `/campaigns`. | P3 | S |
| Campaign list | Status tabs with counts | All, Schedule, Run Yesterday, Drafts, each with a count | ✅ Full | StatusStrip with All, Active, Scheduled, Sent and Drafts counts (`campaigns/page.tsx:139-156`) | Counts are computed client-side over the full unpaginated list. | — | — |
| Campaign list | Run Yesterday tab | Campaigns with activity yesterday (GMT) | ❌ Missing | Tabs come from `status` only. The list API has no activity-date parameter (`routes/campaigns.ts:67-80`) | Add an "active yesterday" view from send timestamps. | P3 | S |
| Campaign list | Drafts access by role (RBAC) | Drafts tab gated by role ("Your role doesn't have permission to access drafts") | 🟡 Partial | Custom roles gate nav screens, PII and export only (`middleware/capabilities.ts:15-46`). `/api/campaigns` is mounted with `requireAuth` only (`index.ts:200`): no `requireRole` and no agent customer scoping | Any logged-in role, including a dealer `agent`, can create and send a campaign to the whole project. Add per-action permissions (view drafts, send, approve) and agent scoping. | P2 | M |
| Campaign list filters | Created-date filter | Presets, Since, Custom Range calendar, Last N D/W/M | ❌ Missing | Only search, the status strip and Active/Archived (`campaigns/page.tsx:296-326`). The API takes only archive flags (`routes/campaigns.ts:67-80`) | Add a server-side date filter together with pagination. | P2 | S |
| Campaign list filters | Channel filter | Searchable multi-select over 11 channels | ❌ Missing | Channel appears only as the Type badge (`campaigns/page.tsx:361-371`). No parameter in `hooks/useCampaigns.ts:17-26` | Add a channel multi-select. It is cheap because the list is client-side today. | P2 | S |
| Campaign list filters | Delivery-type filter | One Time, Periodic, Event, Location, API and Device Triggered | ❌ Missing | Only `one-time` and `periodic` exist (`types.ts:174`) | Low value with two types. Bundle it with the channel filter. | P3 | S |
| Campaign list filters | Content type filter | Promotional or Transactional | ❌ Missing | `content_type` is stored (`schema.ts:414`) but not shown or filterable | Add to a "More filters" panel. | P3 | S |
| Campaign list filters | Status filter (10 statuses) | Multi-select: Active, Expired, Not Sent, Paused, Scheduled, Sending, Sent, Stopped, Under Review, Rejected | 🟡 Partial | Single-select tabs over draft, scheduled, sending, sent and paused (`types.ts:258`). `paused` is never set. There is no pause, resume, stop or cancel route in `routes/campaigns.ts` | Add Pause and Stop for sending and periodic campaigns, Failed and Expired states, and a multi-status filter. | P2 | M |
| Campaign list filters | Campaign tags filter (All of / Any of) | Tag filter with All/Any logic and a default tag group | ❌ Missing | Tags are saved on create (`create/page.tsx:1082-1107`, `routes/campaigns.ts:250`) but never shown, edited or filtered. Duplicate drops them (`campaignService.ts:1319-1356`) | Show tags on rows, add a tag filter, and copy tags on duplicate. | P2 | S |
| Campaign list filters | Platforms filter | Android, iOS, Web, m-Web, Windows | ❌ Missing | `push_platforms` is stored (`schema.ts:437`) but no service reads it | Only useful once per-platform push works. | P3 | S |
| Campaign list filters | Created-by filter | Team-member multi-select | ❌ Missing | The campaigns table has no author column (`schema.ts:408-480`) | Record the creator, show it on rows and filter by it. | P2 | S |
| Campaign list | Archived campaigns view | "Archived campaigns" toggle | ✅ Full | Active/Archived toggle (`campaigns/page.tsx:309-322`) uses `archivedOnly` (`routes/campaigns.ts:67-80`, `campaignService.ts:1258-1279`). Archive and Restore at `routes/campaigns.ts:608-641` | Bug: with zero archived campaigns the page shows "No campaigns yet" and hides the toggle (`campaigns/page.tsx:278`). | — | — |
| Campaign list | Table columns, paging and empty state | Name, Type, Status, Created, Performance (attribution tooltip), Goals & Engagement, Actions; 25 per page; "No campaigns found for selected filter" | 🟡 Partial | Columns at `campaigns/page.tsx:330-441`. Row menu View, Duplicate, Archive (`455-553`). The list API is unpaginated (`campaignService.ts:1258-1302`) | The Goals column shows only open and click rate, with no conversions or revenue. "Created" shows the sent or scheduled date when present. No pagination. An empty search shows a blank table, and an API error shows "No campaigns yet". | P2 | M |
| Campaign list | Shareable filter state in URL | Full filter state as JSON in `?search=` | ❌ Missing | Filters, search and view are local React state (`campaigns/page.tsx:122-127`) | Sync filters to query parameters. | P3 | S |
| Campaign stats dashboard | Cross-campaign KPI tiles with date range | Sent, impressions, clicks, CTR, conversions and CVR, each with % change; date range and Apply | 🟡 Partial | Only the admin `/logs` page: Total, Delivered, Read, Clicked, Failed and Blocked tiles, filterable by channel and source=campaign (`logs/page.tsx:55-72`, `routes/logs.ts:121-137`). `routes/dashboard.ts:517-533` only counts campaigns | No date picker in the UI, no CTR, CVR or conversions, and no % change. Email campaigns are missing because campaign emails write no `messages` rows. Build a Campaign stats page. | P1 | M |
| Campaign stats dashboard | Conversion attribution selector | Click-through or Total conversion, with an attribution-model banner | 🟡 Partial | Per-campaign Any, View-through and Click-through toggle (`[id]/page.tsx:82-87,570-619`, `campaignAnalyticsService.ts:120-223`) | No project-wide default and no cross-campaign de-duplication, so one order can be credited to several campaigns. | P2 | M |
| Campaign stats dashboard | Overall performance by channel | Per-channel table of Sent, Impression, Click, Conversion, Revenue and rates; chart/table toggle; download | 🟡 Partial | `/logs` status counts filtered by channel (`routes/logs.ts:17-45,121-137`) | No per-channel table, conversions, revenue, rates or export. Email is excluded. | P1 | M |
| Campaign stats dashboard | Per-channel funnel time series | One section per channel with metric tabs, Hourly/Daily/Weekly/Monthly views and download | 🟡 Partial | Per campaign only: delivery funnel plus Hour (72 h), Day (90 d) and Week (52 w) buckets (`[id]/page.tsx:596-640`, `campaignAnalyticsService.ts:306-470`). Per flow: `FlowAnalyticsPanel.tsx` | No channel-level aggregation, monthly bucket, chart/table toggle or download. | P2 | M |
| Campaign stats dashboard | Best/worst campaign summary per channel | Highest and lowest CVR and CTR campaigns, plus a total count | ❌ Missing | No ranking code in `campaignAnalyticsService.ts` or `routes/dashboard.ts` | Add top and bottom campaigns to a stats page. | P2 | S |
| Campaign stats dashboard | Weekly AI report agent (Merlin) | "Get Weekly Reports with Merlin Custom Agents" | ❌ Missing | No scheduled report or digest jobs. The AI routes cover segment, layout, copy, WhatsApp template, next action and variations (`routes/ai.ts:23-166`) | Add a scheduled AI performance summary. | P3 | M |
| Campaign stats dashboard | Dashboard switcher and custom dashboards | Title dropdown: Key metrics, Reachability, Create new | ❌ Missing | Fixed `/dashboard` and `/analytics` pages. `saved_analyses` stores saved funnel and cohort configs (`schema.ts:937`, `routes/analytics.ts:176-230`), but there are no dashboards | Covered by the Dashboards module. | P3 | L |
| Create entry & channel picker | Create entry points | List button, Engage flyout, global "+ Create New" modal | 🟡 Partial | List button (`campaigns/page.tsx:168-174`), dashboard quick action (`dashboard/page.tsx:239`), Next Best Action link (`NextBestActionCard.tsx:100`). The sidebar is flat (`Sidebar.tsx:55-78`) | Add a global Create menu for campaigns, flows and segments. | P3 | S |
| Create entry & channel picker | Channel × delivery-type picker | Grouped channel tiles; each expands into its own delivery types | ✅ Full | Slide panel with channel cards, then delivery cards, then `/campaigns/create?channel=&type=` (`campaigns/page.tsx:57-70,158-161,179-272`) | All channels sit under one "Outbound" heading, and delivery types are the same for every channel. | — | — |
| Create entry & channel picker | Email channel | Email: One Time, Periodic, Event Triggered | 🟡 Partial | Sends via Resend, SendGrid, Postmark, Mailgun or SES (`campaignService.ts:949-1017`, `emailService.ts:32-89`) | Email campaign sends bypass `deliveryService`. The project email frequency cap and the campaign's cap toggles never apply, and no `messages` rows are written. Opens and clicks are tracked only through the Resend webhook. The unsubscribe gap is the P0 opt-out row below. | P2 | M |
| Create entry & channel picker | SMS channel | SMS: One Time, Periodic, Event Triggered | 🟡 Partial | In the picker (`campaigns/page.tsx:60`), but `templateId` is never saved for SMS (`create/page.tsx:611`), so the send passes `''` (`campaignService.ts:1039`). Every SMS provider builds the body only from a template row (`providers/twilioProvider.ts:7-17`; Gupshup, Bird and Vonage are the same) | Every SMS campaign reaches the provider with an empty body, so it is rejected or delivered blank. There are no DLT template or sender-ID fields, which India requires. | P0 | S |
| Create entry & channel picker | Push channel | Push: One Time, Periodic, Event, Device and Location Triggered | 🟡 Partial | FCM HTTP v1 to a single `customAttributes.fcm_token` (`providers/fcmProvider.ts:74-169`). No web-push code in `packages/sdk/src` | No web push, multi-device delivery, deep link or platform targeting. | P2 | M |
| Create entry & channel picker | MMS channel | MMS: One Time, Periodic, Event Triggered | ❌ Missing | Not in `CampaignChannel` (`types.ts:173`) and no provider | Mostly a US channel. | P3 | M |
| Create entry & channel picker | RCS channel | RCS: One Time, Periodic, Event Triggered | ❌ Missing | Not in `CampaignChannel` or the provider registry (`providers/index.ts:17-43`). Settings shows a Pinnacle "SMS + RCS" provider card (`settings/page.tsx:373`), but no SMS/RCS Pinnacle provider is registered | Add RCS rich cards through an Indian RCS provider, and fix the misleading settings card. | P2 | M |
| Create entry & channel picker | WhatsApp channel | WhatsApp: One Time, Periodic, Event Triggered | ✅ Full | Approved-template picker, variable/header/button mapping, tracked short-link buttons, language fallback, category-aware 24 h gating, test send (`create/page.tsx:2301-2674`, `deliveryService.ts:132-310`, `campaignService.ts:463-486`) | None for this module. | — | — |
| Create entry & channel picker | In-app channel | In-app opens its builder directly | 🟡 Partial | Pull-only `GET /api/v1/in-app-messages` honours `audienceFilter` only (`routes/v1InAppMessages.ts:44-186`). `packages/sdk` has no renderer. Send Now blocks every recipient because `checkReachability` handles `inapp`, not `in_app` (`deliveryService.ts:487`) | In-app messages are never displayed, and a campaign aimed at a saved segment is served to everyone. | P2 | L |
| Create entry & channel picker | On-site messaging channel | On-site opens its builder directly | 🟡 Partial | Opt-in popups only: `/widgets` (exit-intent, time, scroll, manual) through `packages/sdk/src/widget.ts` and `routes/optinWidgets.ts`. The page is not linked anywhere | No audience-targeted on-site banners or popups as a campaign channel. | P2 | L |
| Create entry & channel picker | Cards channel (inbox) | Cards opens its builder directly | ❌ Missing | `InAppPosition` includes `inbox` (`types.ts:450`), but nothing renders it | No persistent inbox cards. | P3 | L |
| Create entry & channel picker | Facebook / Google Ads audience channels | Builders that sync the audience | 🟡 Partial | Hashed CSV export for Meta, Google, TikTok, Snap and Pinterest (`adAudienceExport.ts`, `routes/segments.ts:144-185`, `ExportAudienceButton.tsx`) | Manual upload, no API sync, and not a campaign channel. | P2 | M |
| Create entry & channel picker | Custom connector channel | Connector: One Time, Periodic, Event Triggered | 🟡 Partial | Flow HTTP Request node (`types.ts:734-740`, `StructuredFlowBuilder.tsx:1234-1296`, `flowExecutor.ts:213-225`) and outbound webhooks | Campaigns cannot broadcast a per-user webhook. | P3 | M |
| Create entry & channel picker | Additional app channels (Telegram, Line, Viber, Snapchat/Pinterest/Criteo audiences) | ALL APPS section with "See all" | ❌ Missing | Not in `providers/` or `CampaignChannel` | Low relevance for Indian Shopify D2C. Snapchat and Pinterest audiences get only the manual hashed CSV covered in the Facebook / Google Ads row, which modules 12 and 25 rate 🟡 on their own. | P3 | L |
| Create entry & channel picker | Paid add-on tiles with Request access | Tooltip "Telegram is a paid add-on. Request access" | 🟡 Partial | Plan entitlements lock features (AI chatbot, predictions, ad export) with an upgrade path in Settings > Billing (`entitlementService.ts:15-49`). There are no channel keys, and the picker has no locked tiles (`campaigns/page.tsx:57-63`) | No upsell path inside the picker. | P3 | S |
| Create entry & channel picker | Connected Apps catalogue | Category counts, conversion, retargeting, messaging and voice apps, "+ Create app", search | ❌ Missing | No catalogue. Settings > Ad Conversions: Meta CAPI ready; Google, TikTok and Snap "coming soon" (`settings/ad-conversions/page.tsx:17-22`). Outbound webhooks. `/integrations` only redirects to `/projects` | No searchable app catalogue or custom-app builder; integrations are spread over Settings tabs. Modules 05 and 25 rate the same catalogue ❌. | P3 | L |
| Create entry & channel picker | Create a campaign with an AI agent (Merlin) | "Create a Campaign with Merlin Custom Agents" CTA | ❌ Missing | Separate AI endpoints for segment, email layout, copywriter, WhatsApp template, next action and campaign variations (`routes/ai.ts:23-166`). Next Best Action prefills a campaign for one customer (`NextBestActionCard.tsx:99-102`) | No prompt-to-campaign agent; the separate AI helpers are rated in module 16. Module 05 rates the same CTA ❌. | P2 | L |
| Delivery types | One Time (now or scheduled) | "Send … now or at scheduled time" | ✅ Full | `campaigns/page.tsx:66`. ASAP or a fixed time; the scheduler dispatches due campaigns (`campaignScheduler.ts:46-70`) | The step-3 timezone dropdown does not affect fixed sends, which use the browser's time zone. | — | — |
| Delivery types | Periodic | "Send … on a recurring basis" | 🟡 Partial | The UI saves `{frequency, time, endsAt}` (`create/page.tsx:562-568`, `types.ts:224-230`). The scheduler reads `timeOfDay`, never `time` or `endsAt`, and re-sends at least 23 h after the last completion (`campaignScheduler.ts:16-44`). The first run needs a manual Send Now. Each run deletes `campaign_sends` and zeroes the counters (`campaignScheduler.ts:96-112`) | Recurring sends drift away from the chosen time, never end, and lose each run's history. | P1 | M |
| Delivery types | Event Triggered | Triggered by a tracked user action; offered for 7 channels | 🟡 Partial | Disabled "Soon" card (`campaigns/page.tsx:68`). Available only in Flows: event trigger with filters, delay, then send (`StructuredFlowBuilder.tsx:1299-1338`, `triggerWorker.ts:73-95`) | The capability exists but is hard to find. Route this card to a prefilled one-step Flow. | P2 | S |
| Delivery types | Device Triggered | Triggered locally on the device (Push only) | ➖ N/A | No mobile SDK. `packages/sdk` is browser-only and `packages/sdk-react` wraps it | Remove the misleading "Device Triggered: Soon" card (`campaigns/page.tsx:69`). | — | — |
| Delivery types | Location Triggered | Sent when the user reaches a location (Push only) | ➖ N/A | Geofencing needs a native SDK, which Storees does not have | None. | — | — |
| Delivery types | API Triggered | Value in the delivery-type list filter | 🟡 Partial | No campaign-send API. The public v1 API covers events, customers, identify, import, in-app, opt-in and recognize. The closest option is a Flow "Business event" trigger fired through `POST /api/v1/events` (`StructuredFlowBuilder.tsx:687,1340-1358`) | No "send this campaign or template to user X" API. | P2 | M |
| Delivery types | Delivery-type descriptions | One-line description on hover | ✅ Full | One-liners always visible (`campaigns/page.tsx:65-70,258-261`) | None. | — | — |
| Delivery types | Channels without a delivery-type step | In-app, On-site, Cards and Ads open their builder directly | 🟡 Partial | Every channel, including In-App, must pick One Time or Periodic (`campaigns/page.tsx:158-161`), though in-app serving ignores the choice | Skip the delivery step for In-App. | P3 | S |
| Builder step 1: campaign details | 3-step builder shell | Target users, Content, Schedule and goals; breadcrumb; "Untitled"; no draft until saved | ✅ Full | `STEPS` (`create/page.tsx:93-97`), breadcrumb and "Untitled" (`688,700`), stepper with Next/Previous (`959-989`). Nothing is saved until Save as draft or Create Campaign (`558-651`) | None. | — | — |
| Builder step 1: campaign details | Campaign name (required) | Campaign Name* | ✅ Full | `create/page.tsx:1075-1080`. The API rejects an empty name (`routes/campaigns.ts:165-167`) | None. | — | — |
| Builder step 1: campaign details | Campaign tags and Manage tags | Tag multi-select with a default group, plus "Manage tags" | 🟡 Partial | Free-text chips on create only (`create/page.tsx:1082-1107`). `PATCH` accepts tags (`routes/campaigns.ts:518`), but `[id]/edit` has no tag field | No default tags, tag library or tag display. | P2 | S |
| Builder step 1: campaign details | Content type: Promotional vs Transactional | Transactional is "sent irrespective of subscription status" | 🟡 Partial | Cards labelled "Always delivered, bypasses frequency caps" (`create/page.tsx:1109-1143`). For SMS, push and WhatsApp, transactional skips the cap and consent is checked by purpose (`deliveryService.ts:79-96,347-385`). Email staging always drops promotional opt-outs (`campaignService.ts:591-622`) | A transactional email still skips users who opted out of marketing, so the label overpromises. | P2 | S |
| Builder step 1: campaign details | User attribute holding the email address | Pick which attribute holds the email | ❌ Missing | Email campaigns always use `customers.email` (`campaignService.ts:578-586`) | Cannot send to an alternate email attribute. | P3 | S |
| Builder step 1: campaign details | Channel configuration warnings | Inline SMTP, FCM, APNS and Web push warnings with fix links | 🟡 Partial | Only WhatsApp shows provider status and missing config (`create/page.tsx:2318-2390`). Email silently falls back to Resend (`emailService.ts:63-71`). SMS and push show nothing | Users find misconfiguration only after sends fail. Add provider-status banners. | P2 | S |
| Builder step 1: audience | Audience modes | All users or Filter users by; exclusions work with both | ✅ Full | All users, Saved segment and Custom filter (`create/page.tsx:1221-1297`). Staging applies the filter, then the segment, then all users (`campaignService.ts:512-573`) | See the next row. | — | — |
| Builder step 1: audience | Required audience and condition validation | Audience is required; + Filter and Show count stay disabled until a condition is complete | 🟡 Partial | Step 1 requires only a name (`create/page.tsx:539`). In the default "Saved segment" mode with no segment, or a filter with zero rules, no audience is saved (`create/page.tsx:443-445,615-616`) and staging falls back to every customer (`campaignService.ts:542-573`). The send confirmation then reads "the selected segment" (`[id]/page.tsx:266`). `validateFilterConfig` runs only on segment pages | A half-configured campaign silently goes to the whole base. Require an explicit audience, block empty filters, reuse `validateFilterConfig`, and name "All users" in the confirmation. | P0 | S |
| Builder step 1: audience | User property attribute catalogue | Grouped catalogue: lifecycle, acquisition, reachability per channel, location, device, standard and custom attributes | 🟡 Partial | A fixed registry of about 22 ecommerce fields, plus AI scores and reachability booleans (`domainRegistry.ts:5-48,163-190`). City, Region and dealer fields appear only when the dealer feature is on (`agentFieldDefs.ts:62-78`, `routes/v1Schema.ts:40-43`). Custom attributes are never listed, although the engine reads them (`evaluator.ts:1197-1208`) | Default projects cannot target by city or state, custom Shopify attributes, WhatsApp or push opt-in, first/last seen dates, or device. | P1 | M |
| Builder step 1: audience | User behavior filter | Has Executed / Has Not Executed plus an event | ✅ Full | "Performed a specific event" card: event picker plus custom name; at least, at most or exactly N; last N days; property filters (`SFB:612-730`, `evaluator.ts:242-264`) | The time window is only "last N days", and property operators lack starts/ends with and between. | — | — |
| Builder step 1: audience | User affinity filter | "User affinity" tab | ❌ Missing | No affinity rule in the condition fork (`SFB:1065-1097`) or in `evaluator.ts` | Add predominant category, brand and price-band rules. | P2 | M |
| Builder step 1: audience | Custom segment as a filter block | Saved segment as one block among others, including inside Exclude | 🟡 Partial | "Saved segment" is a separate single-select mode (`create/page.tsx:1257-1283`). There is no segment-membership rule in `evaluator.ts` or `SFB`. Membership is a snapshot refreshed on save, after sync and nightly at 03:00 (`aggregateReconcileWorker.ts:20-29`, `segmentService.ts:66-120`). No file-upload segments | Users cannot express "Segment A AND city = Pune" or exclude a segment. Time-based segments can be a day stale when the campaign sends. | P1 | M |
| Builder step 1: audience | Date attribute conditions | Recurring modes (daily, weekly, monthly, yearly); on, between, before, after, in the next, in the last, is today, exists; days ago or from now | 🟡 Partial | The UI offers before and after, plus between on order date only (`SFB:51-55`, `domainRegistry.ts:20-21,47`). Relative windows exist only as numeric "Days since …" fields. The engine has `within_last` with no UI; `in_month` and `in_year` test order months only (`evaluator.ts:748-794`) | Missing: in the next N days, is today, exists, and recurring day/month matching on a date attribute (birthdays, anniversaries). Expose `within_last` first. | P1 | M |
| Builder step 1: audience | Numeric attribute operators | Equal, not equal, between, not between, less than, greater than, exists | 🟡 Partial | Equals, does not equal, greater than, less than, between (`SFB:33-39`). Narrowed per field: AOV and CLV allow only greater/less than (`domainRegistry.ts:15-16`) | No "not between", ≥/≤ or exists. | P2 | S |
| Builder step 1: audience | String operators, case sensitivity and multi-value | 13 operators including negations, exists and empty; Case Sensitive; multi-value | 🟡 Partial | Equals, does not equal, contains, starts with, ends with (`SFB:40-46`). Name allows is, is not and contains; Phone allows is and is not (`domainRegistry.ts:7-9`). Matching is always case-insensitive ILIKE (`evaluator.ts:891-896`) | No negated operators, exists/empty, "is any of" or case toggle. | P2 | S |
| Builder step 1: audience | Compare against another user attribute | Value source: Constant value or User attribute | ❌ Missing | `FilterRule` holds a literal value only (`types.ts:507-511`) | Not possible to compare two attributes. | P3 | M |
| Builder step 1: audience | AND/OR filter blocks and nested filters | "+ Filter" with an AND/OR toggle; "+ Nested Filter" | ✅ Full | AND/OR pill (`SFB:1026-1040`), nested groups up to depth 3 (`SFB:14-16,941-949`), "Within the same order" scope (`SFB:966-1019`), recursive SQL (`evaluator.ts:266-277`) | All items in one group share a single AND/OR. | — | — |
| Builder step 1: audience | Duplicate block and collapse to summary | Duplicate icon; completed blocks collapse to one line | ❌ Missing | Rules and cards have only a remove button (`SFB:543-554`). `filterSummary()` is used only on the segments list (`segments/page.tsx:114`) | Reuse `filterSummary()` for collapsed rows and add duplicate. | P3 | S |
| Builder step 1: audience | Exclude users | A second full builder that works with every audience mode | 🟡 Partial | Toggle opens a second builder (`create/page.tsx:1299-1329`), applied as `NOT (filter)` in preview and staging for all modes (`campaignService.ts:206,520`). Rules compile to plain comparisons such as `city::text = 'Pune'` (`evaluator.ts:878-900`), which are NULL for a customer with no value | Excluding "City is Pune" also drops every customer with no city, because `NOT (NULL)` filters the row out (module 03 rates the same defect). Use `NOT COALESCE((filter), FALSE)`. A saved segment cannot be excluded directly. | P2 | S |
| Builder step 1: reachability & control groups | Show count and reachability estimate | Query results (user count, reachable) and a reachability panel with % of total | ⭐ Storees better | Preview calls `POST /api/campaigns/audience-preview` (`routes/campaigns.ts:300-347`). It shows Candidates, Reachable, Deliverable, Recipients, Suppressed, Opted out, Category blocked, 24 h window blocked, Frequency capped and Holdouts, plus a root-cause sentence and a stale-list warning (`create/page.tsx:1427-1485`, `campaignService.ts:172-405`) | Accuracy fixes needed:<br>• The instant "reachable via channel" figure is hard-coded to 90% of segment members (`create/page.tsx:1048`).<br>• Opt-outs are counted for email only.<br>• It subtracts email frequency-capped users, but email sends never apply the cap.<br>• It ignores Shopify `email_subscribed`.<br>Also add % of total and a Reset button. | P2 | S |
| Builder step 1: reachability & control groups | Per-platform push reachability | Android, iOS and Web counts as % of reachable users | ❌ Missing | Push reachability is one boolean: `push_subscribed` or an `fcm_token` (`campaignService.ts:267-272`) | No per-platform breakdown. | P3 | M |
| Builder step 1: reachability & control groups | Global control group | Project-wide holdout defined in Settings | ❌ Missing | Only per-campaign `controlGroupPct` and `campaign_holdouts` (`schema.ts:473-474,531-540`). Flows have no holdout | No universal holdout to measure the lift of the whole programme. | P2 | M |
| Builder step 1: reachability & control groups | Campaign control group | Toggle with a % input (default 5) | ✅ Full | Toggle plus a 1-50% slider (`create/page.tsx:1371-1425`), sha256 buckets written to `campaign_holdouts` (`campaignService.ts:65-70,663-699`), per-goal lift (`campaignAnalyticsService.ts:225-304`) | Defaults to 10%. Lift reporting needs conversion goals. | — | — |
| Builder step 1: reachability & control groups | Automatic exclusion of opted-out users | "Automatically exclude opted-out users"; subscription status honoured | 🟡 Partial | Sends skip explicit `opted_out` consents and the suppression list (`campaignService.ts:591-622`, `deliveryService.ts:347-385`). Shopify consent lands in `customers.email_subscribed` (`syncWorker.ts:180`, `eventProcessor.ts:290,319`), but no send checks it. `{{unsubscribe_url}}` resolves to empty in campaign emails (`campaignService.ts:935`, `emailLayoutRenderer.ts:104`), and only the legacy `resendProvider.ts:83-100` sets List-Unsubscribe | Shoppers who never opted in, or who unsubscribed in Shopify, still get promotional campaigns, and campaign emails have no working unsubscribe. This blocks CAN-SPAM, DPDP and Gmail/Yahoo bulk-sender compliance. A manual "Email Subscribed is true" filter exists (`domainRegistry.ts:10`), but nothing applies it. | P0 | M |
| Push step 1 | Target platforms (Android / iOS / Web) | Step-1 platform checkboxes with per-platform config warnings | 🟡 Partial | Platform tabs sit in step 2 (`MultiPlatformPushBlock.tsx`). They are saved (`routes/campaigns.ts:232-233`) but never read by any service. Picking a platform hides the title field (`create/page.tsx:2796-2835`), so the push goes out with an empty title (`providers/fcmProvider.ts:99`) | Wire per-platform content through to sending, or remove the block. | P2 | M |
| Push step 1 | iOS provisional push options | Opted-in plus provisional, opted-in only, or provisional only | ➖ N/A | Provisional authorization needs a native iOS SDK. Storees sends FCM to tokens from the brand's own app | None. | — | — |
| Event-triggered step 1 | Primary, alternate and secondary trigger events | Primary event, OR alternatives, and a follow-up event | 🟡 Partial | No campaign type. A Flow takes one `event` (`types.ts:588-602`) matched by exact name (`triggerWorker.ts:77`). Follow-up checks happen only in a later condition node (`flowExecutor.ts:473-512`) | No "added_to_cart OR checkout_started" trigger and no "did A then B within X" entry. | P2 | M |
| Event-triggered step 1 | Send timing after trigger | Immediately, or with a delay (minutes, hours or days; Before/After; If Action) | 🟡 Partial | Flow delay node in minutes, hours or days (`types.ts:637-640`), plus a "did or didn't do X since the trip started" condition | No single-screen triggered send with a delay window, and no "X days before" a date attribute. | P2 | M |
| Event-triggered step 1 | Real-time segment evaluation for triggered sends | "Segments evaluated in real time on the latest data" | 🟡 Partial | The flow trigger `audienceFilter` cannot be edited in the UI and is evaluated in memory, where event, aggregate, product, order and date-range rules return false (`triggerWorker.ts:98-118`, `evaluator.ts:1225-1271`). Condition nodes run the SQL engine live (`flowExecutor.ts:517-528`) | Behavioural rules in a trigger audience can never match. Evaluate them with SQL. | P2 | S |

### Storees-only strengths

- **Deliverability funnel in the audience preview.** Ten counters from candidates to recipients, plus a root-cause sentence when 0 recipients remain (`create/page.tsx:1427-1485`, `campaignService.ts:172-405`). MoEngage's Show count gives only the user count and reachable users.
- **Stale-list send guard.** Send Now returns 409 when more than 30% of email recipients have not opened in 90 days, until the admin confirms (`routes/campaigns.ts:656-680`, `[id]/page.tsx:285-303`).
- **Audience cap.** A maximum recipient count for staged rollouts and spend control on paid WhatsApp conversations (`create/page.tsx:1331-1369`, `campaignService.ts:513-519,678-685`).
- **Subscription-category targeting.** Category selection in step 1, with a "Category blocked" count in the preview (`create/page.tsx:1177-1218`, `campaignService.ts:303-318,624-641`).
- **Send to Customer, Dealer or both.** For B2B2C and distributor-led brands (`create/page.tsx:1145-1175`, `deliveryService.ts:52-77`, `campaignService.ts:944-947`).
- **Commerce-native audience conditions.** Scoped aggregates, "within the same order" groups, and purchased/viewed/wishlisted product, collection or category (`SFB:60-77,787-907,966-1019`, `evaluator.ts:279-560`).
- **Prediction scores as audience fields.** Churn risk, conversion score and per-goal buckets (`domainRegistry.ts:163-169`, `routes/v1Schema.ts:38-45`, `evaluator.ts:1166-1195`).
- **Customer typeahead for identifier values.** Phone, email and ID pickers use real stored values, so typos cannot produce an empty audience (`SFB:214-306`).
- **Next Best Action deep link.** Opens a prefilled single-customer campaign from the customer profile (`NextBestActionCard.tsx:99-102`, `create/page.tsx:434-451`).
- **Per-goal control-group lift.** Incremental conversions per goal (`campaignAnalyticsService.ts:225-304`, `[id]/page.tsx:531-568`).
- **Flow trigger kinds beyond the picker.** Business events, fixed-time recurring entry and flow-exit chaining (`StructuredFlowBuilder.tsx:685-689,1299-1381`, `workers/flowFixedTimeScheduler.ts`).
- **WhatsApp template-category-aware gating.** UTILITY and AUTHENTICATION templates go only to users inside the 24 h service window, and the preview shows the count (`campaignService.ts:190-192,320-334,463-486`).
- **CTWA attribution per Meta ad.** A lead, engaged, converted funnel with attributed revenue (`campaigns/ctwa/page.tsx`, `hooks/useCtwa.ts`, `routes/whatsappAdmin.ts`). It is not linked from the nav yet.

### UX notes

- **Picker information architecture** (screenshots 029, 031, 041, 084). MoEngage groups channels into OUTBOUND, INBOUND, MESSAGING APPS, AUDIENCE and CONNECTOR. Each channel expands into only the delivery types it supports, and inbound channels skip the step. Storees' slide panel (`campaigns/page.tsx:179-272`) differs:
  - All five channels, including In-App, sit under one "Outbound" heading.
  - Every channel must pick a delivery type.
  - Two greyed "Soon" cards read as missing features in a demo.

  Suggested changes:
  - Group the channels.
  - Make delivery types channel-specific.
  - Send "Event Triggered" to a prefilled one-step Flow.
  - Remove "Device Triggered".
- **List page** (screenshots 002, 008). MoEngage's list works as a console: date presets, channel and delivery-type multi-selects, a "More filters" panel, and the filter state saved in the URL. Storees has search, a status strip and an Active/Archived toggle over an unpaginated, client-side list. Channel, date and tag filters plus URL state are cheap to add, and tags are already collected.
- **Fragile empty and error states** (`campaigns/page.tsx:278-292`):
  - Switching to Archived with no archived campaigns shows "No campaigns yet" and hides the toggle until a reload.
  - An API error shows the same "No campaigns yet" state.
  - A search with no matches shows a blank table.

  MoEngage keeps the tabs and filters visible and says "No campaigns found for selected filter" (screenshots 002, 017).
- **Audience safety** (screenshots 048, 061). MoEngage marks the audience as required and keeps + Filter and Show count disabled until a condition is complete. In Storees, step 1 requires only a name. The default "Saved segment" mode with nothing picked, or a filter with no rules, sends to every customer. The send confirmation then says "This will send to the selected segment" (`[id]/page.tsx:266`). Require an explicit choice, and name "All users" when that is what will happen.
- **Show count vs Preview** (screenshots 062, 063). Storees' Preview is richer, but two figures can disagree with the real send:
  - The instant figure shown when a segment is picked is a hard-coded 90% of members (`create/page.tsx:1048`), which will contradict the real preview.
  - For SMS, WhatsApp and push, the preview does not count opt-outs that the send will block.

  Replace the instant figure with the preview call, and add "% of total" and a one-line audience description.
- **Filter builder information architecture** (screenshots 048, 069). In MoEngage each block names its type with tabs, a saved segment can be one block among others (including in Exclude), and completed blocks collapse to one line with duplicate and remove icons. Storees' three-way "Add condition" fork (`SFB:1065-1097`) is comparable, but it has no segment block, no duplicate and no collapse. The existing `filterSummary()` could render collapsed rows.
- **Date conditions** (screenshots 052-056). MoEngage offers recurring modes (good for birthdays and anniversaries), relative units, and comparison with another attribute. Storees exposes only absolute pickers.
  - `within_last` already exists in the engine, so exposing it is a quick win.
  - Birthday-style matching needs new engine work, because `in_month` and `in_year` only test order months.
  - City and region also need to reach the default field registry. Today they appear only with the dealer feature.
- **Push step 1** (screenshots 073, 076). MoEngage puts platform targeting, iOS provisional options and per-platform warnings in step 1. Storees' platform block sits in step 2, is never read when sending, and blanks the push title when used.
- **Campaign stats** (screenshots 020, 021). MoEngage's one-click cross-channel dashboard answers "how is the programme doing". Storees has strong per-campaign analytics but nothing above a single campaign, and the only roll-up (`/logs`) excludes email. A "Campaign stats" entry on the list page is the natural home for one.
- **Security and tenancy checks seen along the way:**
  - `POST /api/campaigns`, `PATCH` and `POST /audience-preview` accept a `segmentId` without checking its project. Segment staging and preview join `customer_segments` by `segmentId` only (`campaignService.ts:227-245,542-558`).
  - `POST /:id/send` and `GET /:id/audience-preview` skip the ownership check that other campaign routes perform (`routes/campaigns.ts:660-695`).
  - Campaign routes have no role gate, so dealer `agent` users can broadcast to the whole project.

### Verification notes

These rows were changed after re-checking the code at `2063cdc`:

- **Cross-campaign KPI tiles: ❌ Missing → 🟡 Partial** (still P1). `/logs` shows cross-campaign Total, Delivered, Read, Clicked, Failed and Blocked tiles, filterable by channel and source=campaign (`logs/page.tsx:55-72`, `routes/logs.ts:121-137`). It still has no date picker, CTR/CVR, % change or email data.
- **Email channel: ✅ Full → 🟡 Partial (P2, M).** Email campaign sends call `sendEmail` directly (`campaignService.ts:949-1017`), bypassing `deliveryService`. As a result:
  - The email frequency cap and the campaign's cap toggles are never applied.
  - No `messages` rows are written.
  - Opens and clicks come only from the Resend webhook.
  - There is no working unsubscribe.
- **Required audience and condition validation: P1 → P0.** The send confirmation says "the selected segment" even when no segment is set (`[id]/page.tsx:266`), so the fallback to every customer is invisible until after the send.
- **Drafts access by role: P3 → P2.** `/api/campaigns` has no `requireRole` and no agent customer scoping (`index.ts:200`), so a dealer `agent` can broadcast to all customers.
- **Channel filter: P1 → P2.** It is a convenience filter on a small unpaginated list where the Type column already shows the channel. It now sits in the same tier as the date and tag filters.
- **Event Triggered: P1 → P2.** The capability exists in Flows (event trigger, delay, send). The gap is discoverability from the picker.
- **Delivery-type filter: P2 → P3.** Storees has only two delivery types.
- **Periodic: effort S → M.** Reading `time` and `endsAt` is small, but keeping per-run history needs a run model, because each run currently deletes `campaign_sends`.
- **Automatic exclusion of opted-out users: effort S → M.** The fix spans five email providers (headers), unsubscribe URL injection and a consent-policy decision. A manual "Email Subscribed is true" workaround is noted.
- **Show count and reachability: kept ⭐, priority none → P2 S.** The engine is real, but the UI shows a hard-coded 90% reachable figure, the preview counts opt-outs for email only, and it subtracts email frequency-capped users that email sends never cap.
- **Evidence corrections (status and priority unchanged):**
  - **User property catalogue:** City, Region and dealer fields are offered when the dealer feature is on (`agentFieldDefs.ts:62-78`, `routes/v1Schema.ts:40-43`). The gap applies to default projects.
  - **Date conditions:** `in_month` and `in_year` test order months, not date attributes. Only `within_last` is a ready-made quick win.
  - **Connected Apps:** `/integrations` only redirects to `/projects`.
  - **Dashboard switcher:** `saved_analyses` exists, but there are no dashboards.
  - **RCS:** Settings advertises a Pinnacle "SMS + RCS" card, but no SMS/RCS Pinnacle provider is registered.
  - **Integration banner:** the integration-status API exists but is used only on `/onboarding`.
  - **SMS:** the providers receive an empty body, so the message is rejected or delivered blank.
  - **Table columns:** "Created" shows the sent or scheduled date when present.
- **Confirmed unchanged after trying to refute them:**
  - the blank SMS body (`create/page.tsx:611` → `campaignService.ts:1039` → `providers/*Provider.ts` `resolveBody`)
  - the Shopify opt-out gap (`deliveryService.ts:369-381` says so explicitly)
  - the in-app `inapp`/`in_app` mismatch
  - the periodic `timeOfDay`/`time` mismatch
  - no pause or stop routes
  - tags never displayed
  - no global holdout
  - no affinity or segment-membership rule
  - the three ➖ N/A rows (no native mobile SDK; `scripts/fcm-token-tool` is a developer test page, not product web push)
- **Cross-module consistency review (completeness pass, code re-checked at `2063cdc`):**
  - **Exclude users: ✅ Full → 🟡 Partial (P2, S).** Exclusion is `NOT (filter)` over comparisons that are NULL for an empty field (`campaignService.ts:206,520`; `evaluator.ts:878-900`), so excluding "City is Pune" also drops customers with no city. Module 03 already rated this 🟡.
  - **Connected Apps catalogue: 🟡 → ❌.** No catalogue exists; modules 05 and 25 rate the same catalogue ❌.
  - **Create a campaign with an AI agent: 🟡 → ❌.** The row's own gap says there is no prompt-to-campaign agent; module 05 rates the same CTA ❌.

### Screens

#### All Campaigns (list)

![Header actions (Refresh, Import campaign, Campaign stats, + Create campaign), integration-pending banner, help card](../screenshots/01-engage-campaigns-001-all-campaigns-top.jpg)
*Header actions (Refresh, Import campaign, Campaign stats, + Create campaign), integration-pending banner, help card*

![Tabs All/Schedule/Run Yesterday/Drafts(1), filter bar, Archived toggle, table columns, empty state](../screenshots/01-engage-campaigns-002-list-tabs-filters-empty.jpg)
*Tabs All/Schedule/Run Yesterday/Drafts(1), filter bar, Archived toggle, table columns, empty state*

![Created-date presets: Today … Last Month, Since, Custom Range, Last N D/W/M](../screenshots/01-engage-campaigns-003-filter-created-date-presets.jpg)
*Created-date presets: Today … Last Month, Since, Custom Range, Last N D/W/M*

![Custom Range: two-month calendar with From/To, Reset, Cancel/Done](../screenshots/01-engage-campaigns-004-filter-created-date-custom-range.jpg)
*Custom Range: two-month calendar with From/To, Reset, Cancel/Done*

![Channel multi-select with search, Clear all/Select all (Push, Email, SMS, In-app, On-site Messaging, Cards)](../screenshots/01-engage-campaigns-005-filter-channel-top.jpg)
*Channel multi-select with search, Clear all/Select all (Push, Email, SMS, In-app, On-site Messaging, Cards)*

![Channel list continued: Web Personalization, Facebook Audience, Google Ads Audience, Connector, WhatsApp](../screenshots/01-engage-campaigns-006-filter-channel-bottom.jpg)
*Channel list continued: Web Personalization, Facebook Audience, Google Ads Audience, Connector, WhatsApp*

![Delivery type filter: One Time, Periodic, Event Triggered, Location Triggered, API Triggered, Device Triggered](../screenshots/01-engage-campaigns-007-filter-delivery-type.jpg)
*Delivery type filter: One Time, Periodic, Event Triggered, Location Triggered, API Triggered, Device Triggered*

![More filters 'Filter campaigns' panel: Content Type, Status, Has campaign tags (All/Any of these), Platforms, Created by](../screenshots/01-engage-campaigns-008-more-filters-panel.jpg)
*More filters 'Filter campaigns' panel: Content Type, Status, Has campaign tags (All/Any of these), Platforms, Created by*

![Content Type: Promotional / Transactional](../screenshots/01-engage-campaigns-009-more-filters-content-type.jpg)
*Content Type: Promotional / Transactional*

![Status multi-select (Active, Expired, Not Sent, Paused, Scheduled, Sending, Sent, Stopped, Under Review, Rejected)](../screenshots/01-engage-campaigns-010-more-filters-status.jpg)
*Status multi-select (Active, Expired, Not Sent, Paused, Scheduled, Sending, Sent, Stopped, Under Review, Rejected)*

![Campaign tags, Default group (activation, all users, engagement, incentive, onboarding, promotional, ratings, retention, transactional)](../screenshots/01-engage-campaigns-011-more-filters-tags.jpg)
*Campaign tags, Default group (activation, all users, engagement, incentive, onboarding, promotional, ratings, retention, transactional)*

![Platforms: Android, iOS, Web, m-Web, Windows](../screenshots/01-engage-campaigns-012-more-filters-platforms.jpg)
*Platforms: Android, iOS, Web, m-Web, Windows*

![Campaign Performance tooltip: conversions are based on Total Conversion for all channels, with a link to change the default attribution](../screenshots/01-engage-campaigns-013-campaign-performance-tooltip.jpg)
*Campaign Performance tooltip: conversions are based on Total Conversion for all channels, with a link to change the default attribution*

![Schedule tab (tooltip: campaigns scheduled to be sent in future), empty](../screenshots/01-engage-campaigns-014-tab-schedule-empty.jpg)
*Schedule tab (tooltip: campaigns scheduled to be sent in future), empty*

![Run Yesterday tab (tooltip: campaigns that recorded activity yesterday, GMT), empty](../screenshots/01-engage-campaigns-015-tab-run-yesterday-empty.jpg)
*Run Yesterday tab (tooltip: campaigns that recorded activity yesterday, GMT), empty*

![Drafts tab is blocked: toast 'Your role doesn't have permission to access drafts'](../screenshots/01-engage-campaigns-016-tab-drafts-no-permission-toast.jpg)
*Drafts tab is blocked: toast 'Your role doesn't have permission to access drafts'*

![Archived campaigns view toggled on, empty](../screenshots/01-engage-campaigns-017-archived-campaigns-toggle-empty.jpg)
*Archived campaigns view toggled on, empty*

#### Import campaign drawer (opened only)

![Import campaign drawer: step 1 Select campaigns → 2 Imported campaigns, Source workspace\*, Close/Import](../screenshots/01-engage-campaigns-018-import-campaign-drawer.jpg)
*Import campaign drawer: step 1 Select campaigns → 2 Imported campaigns, Source workspace\*, Close/Import*

![Source workspace dropdown listing other workspaces and environments](../screenshots/01-engage-campaigns-019-import-campaign-source-workspace.jpg)
*Source workspace dropdown listing other workspaces and environments*

#### Campaign stats dashboard

![KPI tiles, Last Interaction banner, Overall performance table by channel, Merlin weekly-report CTA](../screenshots/01-engage-campaigns-020-campaign-stats-top-overall.jpg)
*KPI tiles, Last Interaction banner, Overall performance table by channel, Merlin weekly-report CTA*

![Push channel: metric tabs, chart controls, funnel Sent→Impression→Click→Conversion, Campaign summary](../screenshots/01-engage-campaigns-021-campaign-stats-push-channel.jpg)
*Push channel: metric tabs, chart controls, funnel Sent→Impression→Click→Conversion, Campaign summary*

![Email channel: Sent/Open/Click/Conversion/Revenue, CTR/CVR/Open rate](../screenshots/01-engage-campaigns-022-campaign-stats-email-channel.jpg)
*Email channel: Sent/Open/Click/Conversion/Revenue, CTR/CVR/Open rate*

![SMS channel funnel (Sent→Delivered→Click→Conversion) and start of the Flows channel](../screenshots/01-engage-campaigns-023-campaign-stats-sms-flows.jpg)
*SMS channel funnel (Sent→Delivered→Click→Conversion) and start of the Flows channel*

![Flows channel (Total trips→Engaged trips→Converted trips, UTC) and start of InApp](../screenshots/01-engage-campaigns-024-campaign-stats-flows-inapp.jpg)
*Flows channel (Total trips→Engaged trips→Converted trips, UTC) and start of InApp*

![Connector channel: Attempted→Sent→Conversion, Success rate](../screenshots/01-engage-campaigns-025-campaign-stats-connector.jpg)
*Connector channel: Attempted→Sent→Conversion, Success rate*

![FB audience channel: Eligible→Attempted→Synced→Conversion, User attempted/User synced](../screenshots/01-engage-campaigns-026-campaign-stats-fb-audience.jpg)
*FB audience channel: Eligible→Attempted→Synced→Conversion, User attempted/User synced*

![Conversion selector: Click through conversion / Total conversion](../screenshots/01-engage-campaigns-027-campaign-stats-attribution-dropdown.jpg)
*Conversion selector: Click through conversion / Total conversion*

![Dashboard switcher: MoEngage dashboards (Key metrics, Reachability) + Create new](../screenshots/01-engage-campaigns-028-campaign-stats-dashboard-switcher.jpg)
*Dashboard switcher: MoEngage dashboards (Key metrics, Reachability) + Create new*

#### New Campaign: channel × delivery-type picker

![New Campaign modal top: promo banner, OUTBOUND tiles, Merlin Custom Agents CTA, INBOUND, MESSAGING APPS](../screenshots/01-engage-campaigns-029-new-campaign-modal-top.jpg)
*New Campaign modal top: promo banner, OUTBOUND tiles, Merlin Custom Agents CTA, INBOUND, MESSAGING APPS*

![Modal bottom: INBOUND, WhatsApp, AUDIENCE (Facebook, Google Ads), CONNECTOR Custom, ALL APPS](../screenshots/01-engage-campaigns-030-new-campaign-modal-bottom.jpg)
*Modal bottom: INBOUND, WhatsApp, AUDIENCE (Facebook, Google Ads), CONNECTOR Custom, ALL APPS*

![Push: One Time, Periodic, Event Triggered, Device Triggered, Location Triggered](../screenshots/01-engage-campaigns-031-push-delivery-types.jpg)
*Push: One Time, Periodic, Event Triggered, Device Triggered, Location Triggered*

![Email: One Time, Periodic, Event Triggered](../screenshots/01-engage-campaigns-032-email-delivery-types.jpg)
*Email: One Time, Periodic, Event Triggered*

![SMS: One Time, Periodic, Event Triggered](../screenshots/01-engage-campaigns-033-sms-delivery-types.jpg)
*SMS: One Time, Periodic, Event Triggered*

![MMS: One Time, Periodic, Event Triggered (SMS panel also still expanded)](../screenshots/01-engage-campaigns-034-mms-delivery-types.jpg)
*MMS: One Time, Periodic, Event Triggered (SMS panel also still expanded)*

![RCS: One Time, Periodic, Event Triggered](../screenshots/01-engage-campaigns-035-rcs-delivery-types.jpg)
*RCS: One Time, Periodic, Event Triggered*

![WhatsApp: One Time, Periodic, Event Triggered](../screenshots/01-engage-campaigns-036-whatsapp-delivery-types.jpg)
*WhatsApp: One Time, Periodic, Event Triggered*

![Connector > Custom: One Time, Periodic, Event Triggered](../screenshots/01-engage-campaigns-037-custom-connector-delivery-types.jpg)
*Connector > Custom: One Time, Periodic, Event Triggered*

![ALL APPS tile tooltip: 'Telegram is a paid add on. Request access'](../screenshots/01-engage-campaigns-038-all-apps-paid-addon-tooltip.jpg)
*ALL APPS tile tooltip: 'Telegram is a paid add on. Request access'*

![Hover description on a delivery-type card (Event Triggered)](../screenshots/01-engage-campaigns-041-delivery-type-hover-description.jpg)
*Hover description on a delivery-type card (Event Triggered)*

![Engage sidebar flyout: + New Campaign, + New Flow, All Campaigns, All Flows](../screenshots/01-engage-campaigns-071-engage-flyout-menu.jpg)
*Engage sidebar flyout: + New Campaign, + New Flow, All Campaigns, All Flows*

![Global '+ Create New' modal: left nav Campaign/Flow/Segment/Dashboards/Alerts/Experience, right pane the same New Campaign picker](../screenshots/01-engage-campaigns-084-global-create-new-menu-campaign.jpg)
*Global '+ Create New' modal: left nav Campaign/Flow/Segment/Dashboards/Alerts/Experience, right pane the same New Campaign picker*

#### Connected Apps (ALL APPS > See all)

![Connected Apps modal: category nav with counts and app tiles](../screenshots/01-engage-campaigns-039-connected-apps-modal.jpg)
*Connected Apps modal: category nav with counts and app tiles*

![Retargeting expanded (8): adds Truecaller and Reddit Ads Audience; Voice calls: Deepgram](../screenshots/01-engage-campaigns-040-connected-apps-retargeting-all.jpg)
*Retargeting expanded (8): adds Truecaller and Reddit Ads Audience; Voice calls: Deepgram*

#### Email One Time builder, Step 1 "Target users"

![Step 1 top: stepper, SMTP warning banner, Campaign Name/tags/content type/email attribute, audience section](../screenshots/01-engage-campaigns-042-email-onetime-step1-top.jpg)
*Step 1 top: stepper, SMTP warning banner, Campaign Name/tags/content type/email attribute, audience section*

![Campaign tags dropdown with Default tags + Manage tags](../screenshots/01-engage-campaigns-043-step1-campaign-tags-dropdown.jpg)
*Campaign tags dropdown with Default tags + Manage tags*

![Content Type tooltip: select a content type based on the nature of the email content](../screenshots/01-engage-campaigns-044-step1-content-type-tooltip.jpg)
*Content Type tooltip: select a content type based on the nature of the email content*

![Promotional tooltip: offers, deals, recommendations, brand awareness](../screenshots/01-engage-campaigns-045-step1-promotional-tooltip.jpg)
*Promotional tooltip: offers, deals, recommendations, brand awareness*

![Transactional tooltip: tied to a user transaction; sent irrespective of subscription status](../screenshots/01-engage-campaigns-046-step1-transactional-tooltip.jpg)
*Transactional tooltip: tied to a user transaction; sent irrespective of subscription status*

!['User attribute with email address' list of all user attributes](../screenshots/01-engage-campaigns-047-step1-email-attribute-dropdown.jpg)
*'User attribute with email address' list of all user attributes*

![Audience section default (User behavior), Exclude Users, Reset filters, Show count (disabled), Control groups, Next](../screenshots/01-engage-campaigns-048-step1-audience-section-default.jpg)
*Audience section default (User behavior), Exclude Users, Reset filters, Show count (disabled), Control groups, Next*

![User behavior operator: Has Executed / Has Not Executed](../screenshots/01-engage-campaigns-049-step1-behavior-executed-operator.jpg)
*User behavior operator: Has Executed / Has Not Executed*

![Event picker is empty (no events ingested yet)](../screenshots/01-engage-campaigns-050-step1-behavior-event-list-empty.jpg)
*Event picker is empty (no events ingested yet)*

![User property attribute list grouped by category (Lifecycle, Acquisition, …)](../screenshots/01-engage-campaigns-051-step1-user-property-attribute-list.jpg)
*User property attribute list grouped by category (Lifecycle, Acquisition, …)*

![Date attribute row: First Seen \| Date \| on \| Constant value \| date picker \| date](../screenshots/01-engage-campaigns-052-step1-date-attribute-row-calendar.jpg)
*Date attribute row: First Seen \| Date \| on \| Constant value \| date picker \| date*

![Date mode: Date, Daily where the hour, Weekly where the day, Monthly where the day, Yearly where the month, Yearly where the date](../screenshots/01-engage-campaigns-053-step1-date-mode-dropdown.jpg)
*Date mode: Date, Daily where the hour, Weekly where the day, Monthly where the day, Yearly where the month, Yearly where the date*

![Date operators: on, is between, before, after, in the next, in the last, is today, exists, does not exist](../screenshots/01-engage-campaigns-054-step1-date-operators.jpg)
*Date operators: on, is between, before, after, in the next, in the last, is today, exists, does not exist*

![Value source: Constant value / User attribute (compare against another attribute)](../screenshots/01-engage-campaigns-055-step1-value-type-constant-or-attribute.jpg)
*Value source: Constant value / User attribute (compare against another attribute)*

![Date value unit: date / days ago / days from now](../screenshots/01-engage-campaigns-056-step1-date-relative-units.jpg)
*Date value unit: date / days ago / days from now*

![Numeric (LTV) operators: is equal to … is greater than, exists, does not exist](../screenshots/01-engage-campaigns-057-step1-numeric-operators.jpg)
*Numeric (LTV) operators: is equal to … is greater than, exists, does not exist*

![String (Last Known City) operators + Case Sensitive checkbox](../screenshots/01-engage-campaigns-058-step1-string-operators.jpg)
*String (Last Known City) operators + Case Sensitive checkbox*

![User affinity tab: Has Executed + event picker (empty)](../screenshots/01-engage-campaigns-059-step1-user-affinity.jpg)
*User affinity tab: Has Executed + event picker (empty)*

![Custom segment tab: 'Select a segment' (existing segment 'Test File')](../screenshots/01-engage-campaigns-060-step1-custom-segment-dropdown.jpg)
*Custom segment tab: 'Select a segment' (existing segment 'Test File')*

![Custom segment selected: + Nested Filter, + Filter and Show count become enabled](../screenshots/01-engage-campaigns-061-step1-custom-segment-selected.jpg)
*Custom segment selected: + Nested Filter, + Filter and Show count become enabled*

![Show count: Query results (Query time, Segment description, User count 3, Reachable users 3)](../screenshots/01-engage-campaigns-062-step1-show-count-query-results.jpg)
*Show count: Query results (Query time, Segment description, User count 3, Reachable users 3)*

![Reachability panel: Email reachable users 3 (100.00% of total user count), 'Low reachability? Know more'](../screenshots/01-engage-campaigns-063-step1-reachability-panel.jpg)
*Reachability panel: Email reachable users 3 (100.00% of total user count), 'Low reachability? Know more'*

![Global control group tooltip: do not send to users in the global control group](../screenshots/01-engage-campaigns-064-step1-global-control-group-tooltip.jpg)
*Global control group tooltip: do not send to users in the global control group*

![Campaign control group tooltip: do not send to a fixed percentage of the target audience](../screenshots/01-engage-campaigns-065-step1-campaign-control-group-tooltip.jpg)
*Campaign control group tooltip: do not send to a fixed percentage of the target audience*

![Campaign control group on: % input (default 5)](../screenshots/01-engage-campaigns-066-step1-campaign-control-group-percent.jpg)
*Campaign control group on: % input (default 5)*

![Exclude Users ticked: second full filter builder (same 4 tabs)](../screenshots/01-engage-campaigns-067-step1-exclude-users-block.jpg)
*Exclude Users ticked: second full filter builder (same 4 tabs)*

![+ Filter adds a new block joined by an AND/OR toggle](../screenshots/01-engage-campaigns-068-step1-add-filter-and-or.jpg)
*+ Filter adds a new block joined by an AND/OR toggle*

![+ Nested Filter adds an inner condition with an AND/OR dropdown; first block collapses to a summary](../screenshots/01-engage-campaigns-069-step1-nested-filter.jpg)
*+ Nested Filter adds an inner condition with an AND/OR dropdown; first block collapses to a summary*

!['All users' selected ('All users selected'), with Exclude Users still available](../screenshots/01-engage-campaigns-070-step1-all-users-selected.jpg)
*'All users' selected ('All users selected'), with Exclude Users still available*

#### Push One Time builder, Step 1 "Target users"

![Push step 1: Campaign name/tags, Target Platforms (Android, iOS, Web), Target audience](../screenshots/01-engage-campaigns-072-push-onetime-step1-top.jpg)
*Push step 1: Campaign name/tags, Target Platforms (Android, iOS, Web), Target audience*

![All platforms ticked: iOS provisional push options and missing FCM/APNS/Web push config warnings](../screenshots/01-engage-campaigns-073-push-step1-platforms-ios-provisional.jpg)
*All platforms ticked: iOS provisional push options and missing FCM/APNS/Web push config warnings*

![Push audience section with the opted-out auto-exclusion note](../screenshots/01-engage-campaigns-074-push-step1-audience-optout-note.jpg)
*Push audience section with the opted-out auto-exclusion note*

![Show count for the custom segment: User count 3, Push reachable 0](../screenshots/01-engage-campaigns-075-push-step1-show-count.jpg)
*Show count for the custom segment: User count 3, Push reachable 0*

![Push reachability by platform: Android / iOS / Web counts and % of reachable users](../screenshots/01-engage-campaigns-076-push-step1-reachability-by-platform.jpg)
*Push reachability by platform: Android / iOS / Web counts and % of reachable users*

![iOS provisional push tooltip ('quiet' notifications without an explicit permission prompt)](../screenshots/01-engage-campaigns-077-push-step1-ios-provisional-tooltip.jpg)
*iOS provisional push tooltip ('quiet' notifications without an explicit permission prompt)*

#### Email Event Triggered builder, Step 1 (trigger condition + audience)

![Event Triggered step 1 top: campaign fields + 'Select condition' with Primary trigger event(s)](../screenshots/01-engage-campaigns-078-email-event-triggered-step1-top.jpg)
*Event Triggered step 1 top: campaign fields + 'Select condition' with Primary trigger event(s)*

![Condition block: primary/alternate/secondary trigger events, THEN Immediately / With Delay (3 Days After If Action)](../screenshots/01-engage-campaigns-079-event-triggered-condition-block.jpg)
*Condition block: primary/alternate/secondary trigger events, THEN Immediately / With Delay (3 Days After If Action)*

![Delay unit: Minutes / Hours / Days (zoom, PNG)](../screenshots/01-engage-campaigns-080-event-triggered-delay-units.png)
*Delay unit: Minutes / Hours / Days (zoom, PNG)*

![Delay direction: Before (disabled) / After (zoom, PNG)](../screenshots/01-engage-campaigns-081-event-triggered-before-after.png)
*Delay direction: Before (disabled) / After (zoom, PNG)*

![Delay reference dropdown: If Action](../screenshots/01-engage-campaigns-082-event-triggered-if-action.jpg)
*Delay reference dropdown: If Action*

![Audience for event-triggered campaigns + note that segments are evaluated in real time on the latest data](../screenshots/01-engage-campaigns-083-event-triggered-audience-realtime-note.jpg)
*Audience for event-triggered campaigns + note that segments are evaluated in real time on the latest data*
