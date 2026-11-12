## 06. Engage > Flows (journey orchestration)

Storees has a working event-triggered journey builder: a vertical, auto-laid-out tree with Yes/No and A/B splits, waits, email/SMS/push/WhatsApp sends, an HTTP Request step whose response feeds later messages, and goal plus multi-exit rules. It also has a per-customer Debug tab, an Analytics tab and a WhatsApp send step that is stronger than MoEngage's. It trails MoEngage on the list page, on entry rules (OR/AND triggers, one-time and periodic entry, re-entry limits, an audience step, control groups), on condition depth (multi-branch split, "keep evaluating", per-message engagement checks) and on canvas tooling.

Five P0 items come first, four of them defects in code that already ships:
- **Email steps built in the UI never send their template.** The executor looks the template up by name instead of id, with no project filter, and falls back to a hard-coded "You left something behind!" email. Flow emails also skip suppression, consent, caps and tracking.
- **Branches without their own Exit fall through** into the other branch's steps, so customers on one path also receive the other path's messages.
- **Fixed-time and flow-exit triggers misfire.** Their own schedule or chain never enrols anyone, but the flow still enrols every customer who fires the event left over from the create dialog.
- **Email open/click conditions can never be true**, because flow emails create no `messages` row for receipts to land on. Every user takes the No path.
- **Conversions after the last step are never credited and flows have no revenue**, so flow ROI cannot be shown.

### MoEngage overview

Engage > Flows is MoEngage's canvas-based journey orchestrator. It has four parts:
- **All Flows list:** All / Active / Run Yesterday / Drafts counters; search plus created-date, delivery-type, status, tag and created-by filters; an Archived toggle; Entry type, Status, Created, Performance and Goals columns.
- **Create new flow modal:** 10 unique templates (5 locked behind the Sherpa path optimiser, Next Best Action or Cards), each with highlights and a read-only canvas preview, or a blank canvas.
- **Skippable 3-step wizard:**
  - Details and goals: name, tags, multiple conversion goals with revenue, a 36-hour goal window, exit on conversion.
  - Entry: on an event (OR alternate and AND/NOT secondary triggers, immediate or delayed entry), at a fixed time (one time, or periodic with intervals, weekday and day grids, monthly ordinals, end conditions, any time zone), or on another flow's exit. Also a start/end schedule and per-user entry limits.
  - Audience: property, behaviour, affinity or segment filters, exclusions and a count; global and flow control groups with sticky membership.
- **Canvas:** an Entry Rules node and "+" insertion with a context-aware palette.
  - Actions: Email, Push, Connector, SMS, On-site, In-app, Facebook, WhatsApp, Google Ads Audience.
  - Conditions: Check User Attribute, Has done event, multi-branch Conditional Split, and per-channel engagement conditions with "within N" windows and "keep evaluating".
  - Controls: Wait for/till (duration, time slot or date), Goto, N-way A/B Split.
  - Hover cards with Stage IDs, an Errors panel, undo/redo, auto-align, full screen and a mini map. A Settings drawer adds goals, DND and frequency-cap overrides, and per-channel preference overrides.

The capture was **partial**:
- The workspace had no saved flows, so row menus, per-flow analytics, versioning, pause/stop and test runs were not seen.
- Event pickers were empty (no SDK data), so trigger and goal attribute filters were not seen.
- "Use Template" was blocked because it creates a server draft.
- Push, SMS, WhatsApp, In-app and On-site node editors were opened only at their first view.
- Facebook and Google Ads were not connected; Sherpa, Next Best Action and Cards are not enabled.

| Page visited | URL path |
|---|---|
| All Flows (list) | `/v4/flows/all` (Engage flyout > All Flows) |
| Create new flow: template gallery modal | `/v4/flows/all` (modal from "+ Create flow" and Engage > New Flow) |
| Create flow wizard (steps 1-3) | `/v4/create/flows` (via "Start with a blank canvas") |
| Flow canvas builder | `/v4/create/flows` (canvas after "Skip to canvas") |
| Flow Settings drawer and View flow details | `/v4/create/flows` (Settings link and "View flow details") |

### Storees counterpart

- **`/flows`**: `packages/frontend/src/app/(dashboard)/flows/page.tsx`.
  - A stack of flow cards: status, trigger-event chip, trip-state bar and counts, Activate / Pause / Resume / Draft, Clone and Delete.
  - A Templates modal with 7 templates: `packages/frontend/src/components/flows/FlowTemplateGallery.tsx`.
  - A Create Flow dialog: name, optional description, trigger event and optional property filters, then straight to the builder.
- **`/flows/[id]`**: `packages/frontend/src/app/(dashboard)/flows/[id]/page.tsx`, with Builder, Analytics and Debug tabs plus Clone and Activate / Pause / Resume.
  - Builder: `packages/frontend/src/components/flows/StructuredFlowBuilder.tsx`. A vertical, auto-laid-out tree (not a free canvas) with a 288 px config drawer, a Goal & Exits dialog and an Errors pill.
  - Send steps: `packages/frontend/src/components/flows/SendNodeConfigModal.tsx` (Template, then Variables, then UTM settings).
  - Analytics: `packages/frontend/src/components/flows/FlowAnalyticsPanel.tsx`. Debug: `packages/frontend/src/components/flows/FlowDebugPanel.tsx`.
- **Customer profile Journeys tab**: `packages/frontend/src/components/customers/JourneysTab.tsx`.
- **Backend:**
  - `packages/backend/src/routes/flows.ts`: CRUD, status transitions, clone, debug, analytics, and template catalog endpoints that no UI calls.
  - `packages/backend/src/services/flowExecutor.ts`: the node walker, conditions, sends, HTTP requests, goal and exit handling, flow-exit chaining.
  - `packages/backend/src/workers/triggerWorker.ts` (event to trip), `flowWorker.ts` (resumes waits), `flowFixedTimeScheduler.ts` (fixed-time entry).
  - `packages/backend/src/services/flowAnalyticsService.ts`, `flowTemplates.ts` (30-template catalog), `flowService.ts` (default flows seeded on Shopify connect), `deliveryService.ts` (consent, cap and reachability gates for SMS, push and WhatsApp).
- **Types:** `packages/shared/src/types.ts:562-753` (trigger kinds and node types). `packages/flows` holds only seed templates (`packages/flows/src/templates.ts`).

**Path key for the Evidence column.** Line numbers are at commit `2063cdc`.

| Short name | Repo path |
|---|---|
| `flows/page.tsx` | `packages/frontend/src/app/(dashboard)/flows/page.tsx` |
| `flows/[id]/page.tsx` | `packages/frontend/src/app/(dashboard)/flows/[id]/page.tsx` |
| `FB` | `packages/frontend/src/components/flows/StructuredFlowBuilder.tsx` |
| `SNM` | `packages/frontend/src/components/flows/SendNodeConfigModal.tsx` |
| `FTG` | `packages/frontend/src/components/flows/FlowTemplateGallery.tsx` |
| `FlowDebugPanel.tsx`, `FlowAnalyticsPanel.tsx` | `packages/frontend/src/components/flows/` |
| `campaigns/create/page.tsx` | `packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx` |
| `routes/*.ts` | `packages/backend/src/routes/` |
| `flowExecutor.ts`, `deliveryService.ts`, `emailService.ts`, `flowTemplates.ts`, `flowService.ts`, `flowAnalyticsService.ts`, `campaignService.ts`, `campaignAnalyticsService.ts`, `segmentService.ts`, `messageStatusService.ts`, `ssrfGuard.ts`, `domainRegistry.ts`, `templateContext.ts` | `packages/backend/src/services/` |
| `providers/*.ts` | `packages/backend/src/services/providers/` |
| `triggerWorker.ts`, `flowWorker.ts`, `flowFixedTimeScheduler.ts` | `packages/backend/src/workers/` |
| `schema.ts`, `migrations/*.sql` | `packages/backend/src/db/` |
| `types.ts`, `eventFilters.ts`, `eventSchemas.ts` | `packages/shared/src/` |
| `evaluator.ts` | `packages/segments/src/evaluator.ts` |

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Flow list | Engage entry points (+ New Flow, All Flows) | Engage flyout: + New Campaign, + New Flow, All Campaigns, All Flows | ✅ Full | Flows nav item `Sidebar.tsx:62`; Templates and Create Flow buttons `flows/page.tsx:166-186` | None functionally. Flows are admin-only (`adminOnly` nav item; `requireRole('admin')` at `routes/flows.ts:42`), so manager and agent roles never see flows. | — | — |
| Flow list | Status tabs with counts (All, Active, Run Yesterday, Drafts) | Four counters; Active = "Currently Active Flows"; Run Yesterday = activity yesterday (GMT) | ❌ Missing | One unfiltered card list (`flows/page.tsx:355-480`); `GET /api/flows` takes no params and has no ORDER BY (`routes/flows.ts:44-88`); no last-activity column (`schema.ts:325-347`) | No per-status views, counts or "ran yesterday" signal. Client-side tabs are enough at today's list size. | P2 | S |
| Flow list | List columns (Entry type, Status, Created, Performance, Goals, Actions) | Flow Name, Entry type, Status, Created, Performance (Total Conversion, link to change attribution), Goals, Actions; "Showing latest N flows" | 🟡 Partial | Cards show name, description, status, trigger chip, completion %, in progress, state bar and Active/Waiting/Completed/Exited/Total (`flows/page.tsx:357-540`) | No entry type, created date, goal or conversion/revenue column. "Completion %" counts trips that reached an end, not conversions. The chip shows the stale event name for fixed-time and flow-exit flows. No pagination. | P2 | S |
| Flow list | Search and filters (created date, delivery type, status, tags, created by) | Search; date presets; delivery type; status; More filters (tags All/Any, Created by); filter state in the URL | ❌ Missing | No search or filter UI (`flows/page.tsx`); `GET /api/flows` reads no query params (`routes/flows.ts:44-88`); no tags or created_by columns (`schema.ts:325-347`) | Nothing narrows the list. Fine for 5-10 flows, not for MoEngage-scale accounts. Start with search and status/entry-type filters. | P2 | S |
| Flow list | Archived flows (archive instead of delete) | "Archived flows" toggle lists archived flows separately | ❌ Missing | Status is draft / active / paused only (`types.ts:420`; `routes/flows.ts:213`). DELETE removes `flow_trips`, then the flow (`routes/flows.ts:312-340`), but `scheduled_jobs.flow_trip_id` (NOT NULL) and `messages.flow_trip_id` reference trips without cascade (`schema.ts:397,809`; `migrations/0000_init.sql:147`) | No archive state, and deleting any flow whose trips reached a Wait step or sent SMS, push or WhatsApp fails with HTTP 500. A flow that has ever run can be neither archived nor removed. Add an archived status and clean up jobs and messages on delete. | P1 | S |
| Flow list | Flow tags and default tag taxonomy | Flow tags with Manage tags; default tags (activation, engagement, onboarding, promotional, retention, transactional…); All/Any tag filter | ❌ Missing | No tags column on `flows` (`schema.ts:325-347`); only `campaigns.tags` (`schema.ts:469`); no tag UI in `flows/page.tsx` or `FB` | Flows cannot be grouped or filtered by purpose. Reuse the campaign tag model. | P3 | S |
| Flow list | Flow lifecycle states (Active, Scheduled, Paused, Stopped, Completed, Retired) | Status filter lists all six; pause/stop behaviour not captured (no saved flows) | 🟡 Partial | `PATCH /:id/status` allows draft→active, active→paused, paused→active or draft (`routes/flows.ts:205-272`). `triggerWorker.ts:45-48` loads only active flows, but `advanceTrip` and `flowWorker` never read `flows.status` (`flowExecutor.ts:54-81`; `flowWorker.ts:12-37`) | Pause only blocks new entries; in-flight trips keep sending when their waits end, so a misfiring flow cannot be halted. No Stop (end all trips), Scheduled, Completed or Retired. | P1 | M |
| Templates | Flow template library | 10 unique templates (Adoption, Engagement) with description, "Template highlights", read-only canvas preview, Use Template; "Request a template"; blank canvas | 🟡 Partial | 7 templates (Abandoned Cart, Welcome Series, Post-Purchase, Win-Back, KYC Reminder, Trial-to-Paid, Transaction Alert) with description, node count, domain chips and "Recommended for" (`FTG:37-162,215-331`); events translated to the shop's names (`FTG:173-206`). A 30-template backend catalog (Browse Abandonment, CTWA Welcome, Payment-Failed Recovery, Replenishment…) has no frontend caller (`flowTemplates.ts:69-357`; `routes/flows.ts:549-573`) | No preview or highlights before use. UI templates are mostly email-only and their send steps start empty. Win-Back fires on any segment entry (it cannot be scoped; see the event-trigger row). The WhatsApp-first journeys sit behind an unused API. No "Request a template". Wire the catalog into the gallery and preview it with a read-only builder. | P1 | M |
| Templates | Use Template creates a server draft | "Use Template" immediately POSTs /v1/flows/draft; a blank canvas creates nothing until Save | ✅ Full | Picking a template calls `POST /api/flows` with its nodes and exit, then opens the builder (`flows/page.tsx:189-215`; `routes/flows.ts:131-203`, plan cap 148-153) | Same behaviour. Each send step still needs its template picked one by one. | — | — |
| Templates | Locked feature: Intelligent path optimizer (Sherpa) | Browse Abandonment is locked behind a self-optimising path split; it also uses Facebook retargeting | ❌ Missing | A/B Split is a fixed-weight hash (`flowExecutor.ts:184-211`); `docs/MOENGAGE_COMPETITIVE_PLAN.md:124` lists Intelligent Path Optimizer as not built | No split that shifts traffic to the best-converting path. | P3 | L |
| Templates | Locked feature: Next Best Action | Customer Reactivation templates (one-time and periodic) need Next Best Action | 🟡 Partial | Send-step variables can bind a `decision` source (next_best_action, recommended_product, social_proof) from the trigger product (`types.ts:1094-1127`; `flowExecutor.ts:657-663`; `SNM:415-527`); the customer NBA card deep-links to `/flows?nbaName=` (`NextBestActionCard.tsx:103`; `flows/page.tsx:110-115`) | NBA personalises content on a fixed path. No NBA step that picks the channel, offer or path for each user. | P2 | M |
| Templates | Locked feature: Cards (app/web inbox) | "Engage customers on App / on Web" need Cards (and NBA); Web also uses Web Push, On-site and Google Ads | ❌ Missing | `ActionNode.actionType` is email/push/sms/whatsapp only (`types.ts:672`); in-app templates have an `inbox` position (`types.ts:450`), but nothing in `packages/sdk/src` renders in-app messages | Journeys have no persistent inbox or card channel. | P3 | XL |
| Create & goals | Flow name and description | Flow name (required, at least 5 characters, validated on step jumps); title editable on the canvas | 🟡 Partial | Create dialog: name required, description optional (`flows/page.tsx:245-269`); `PATCH /:id` accepts both (`routes/flows.ts:274-310`), but the builder header only displays the name (`flows/[id]/page.tsx:66`) | Name and description cannot be edited in the UI after creation. | P3 | S |
| Create & goals | Skip to canvas | "Skip to canvas" leaves the wizard; its steps stay reachable from the Entry Rules node | ✅ Full | No wizard: the Create dialog asks for name, trigger event and filters, then "Create & Open Builder" (`flows/page.tsx:218-328`, navigation at 148-150) | None. | — | — |
| Create & goals | Conversion goals (multiple, named, primary, attribute filters) | Several goals, each with name, event and "+ New attribute" filters; Goal 1 is Primary | 🟡 Partial | `GoalConfig` is a single `{event, filters}` (`types.ts:616-619`) edited in Goal & Exits (`FB:2086-2108`); a matching event during an active or waiting trip sets `converted_at` (`flowExecutor.ts:321-333`) | One unnamed goal; no secondary goals to compare. | P2 | M |
| Create & goals | Goal revenue and conversion window | "Revenue performance" per goal; "Track above goal for N Hours/Days" from impression/click (default 36 h); Performance column on Total Conversion | ❌ Missing | Goals are checked only for active or waiting trips (`flowExecutor.ts:276-302`); `flowAnalyticsService.ts:86-93,164-168` returns a converted count and no revenue; campaigns already have windowed revenue attribution (`campaignAnalyticsService.ts:20-45`) | A purchase after the trip reaches its last step is never credited, so an abandoned-cart flow that ends right after its final send reports almost no conversions, and there is no flow revenue or ROI. Track goals for N hours after each send and reuse the campaign revenue logic. | P0 | M |
| Create & goals | Exit on conversion (optional) | Toggle: exit once the primary goal is met within the view-through window | 🟡 Partial | Reaching the goal always completes the trip and cancels pending jobs (`flowExecutor.ts:321-333`) | Always on, so converters cannot stay for post-purchase steps. | P3 | S |
| Entry triggers | Event trigger with attribute filters | Primary trigger `Has Executed <event>` with attribute filters; the picker also searches business events | 🟡 Partial | Event picker with catalog, "Observed in your data" and custom names (`FB:1140-1194,1322-1338`); Match all/any filters with product, collection and segment pickers and dotted paths (`FB:805-959`, operators 720-728); enforced in `triggerWorker.ts:73-95`; payload kept in `trip.context` (`triggerWorker.ts:166-178`) | Works, with two defects. `is` / `is not` use strict `===` (`eventFilters.ts:31-32`), so a typed "500" never equals a numeric 500. `enters_segment` carries `segmentId` (`segmentService.ts:144`) but the picker writes `segment_id` (`eventSchemas.ts:40`), so segment-scoped entry never matches. No between, exists or in-list operators. | P1 | S |
| Entry triggers | Alternate trigger events (OR) | "+ Add alternate trigger event": doing any one of several events enters the user | ❌ Missing | `TriggerConfig.event` is one string (`types.ts:595`); `triggerWorker.ts:77` compares one name; single picker (`FB:1322-1338`) | added_to_cart OR checkout_started needs two flows, which double-message customers who do both. | P1 | S |
| Entry triggers | Secondary trigger (AND; Has Executed / Has Not Executed within the delay) | "+ Add secondary trigger event", fulfilled after the primary within the entry delay | 🟡 Partial | `TriggerConfig.inactivityTime` exists (`types.ts:598`) but is set only in seed data (`packages/flows/src/templates.ts:34`) and nothing reads it. The workaround is a Wait step, then an `event_occurred` condition since trip start (`types.ts:637-666`) | No "did X and not Y within N" entry rule. The Wait + Has-done-event workaround enrols everyone and counts non-qualifiers as trips. Modules 01-05 rate the same workaround 🟡. | P2 | M |
| Entry triggers | Entry timing: Immediately or With Delay | Enter Immediately ("within a few mins") or With Delay of N Minutes/Hours/Days after the action | ✅ Full | Trips start when the event is processed (`triggerWorker.ts:50-54`); a Wait step after the trigger delays entry (`FB:648-658`; `flowExecutor.ts:106-141`) | Equivalent. Delayed users count as trips from the moment of the event. | — | — |
| Entry triggers | Business events | Event picker queries business events (non-user events such as catalogue changes); empty in this workspace | 🟡 Partial | "Business event" trigger kind with presets price_drop, inventory_low, restock, new_product_launch, margin_threshold_hit (`FB:685-694,1340-1359`); the worker matches the event name per customer (`triggerWorker.ts:77`); nothing in Storees emits these events | No product-level event that fans out to interested shoppers (viewed, carted, wishlisted). Back-in-stock and price-drop journeys need a per-customer event POSTed to /v1/events. | P2 | L |
| Entry triggers | At fixed time: One Time | One Time: As soon as possible, or at a specific date and time in the campaign time zone | ❌ Missing | `FixedTimeSchedule.frequency` is daily, weekly or monthly only (`types.ts:580-586`); `FixedTimeFields` has no one-time option (`FB:1383-1438`) | A segment cannot be pushed once into a multi-step journey such as a sale-launch sequence; campaigns only cover single sends. | P1 | M |
| Entry triggers | At fixed time: Periodic | Daily (every N days), Weekly (every N weeks on chosen weekdays), Monthly (days 1-31 or First..Last weekday); Ends Never / On / After N; next-run preview; any IANA zone | 🟡 Partial | UI: Daily, Weekly (one day) or Monthly (day 1-28) at "Time (UTC)" (`FB:1383-1438`). The scheduler matches the UTC minute (`flowFixedTimeScheduler.ts:24-40`), refuses to run without `audienceFilter`, which no UI sets (51-55), caps each run at 50,000 (63), and queues `advance` jobs with no `nextNodeId` for `active` trips (90-104), which `flowWorker.ts:31-37` ignores. `triggerWorker.ts:77` matches `triggerConfig.event` without checking `kind`; switching kind keeps the create-dialog event (`FB:1312`), and save writes it back (`flows/[id]/page.tsx:32-34`) | Non-functional and misfires: the schedule never enrols anyone, while the flow still enrols every customer who fires the leftover event (On flow exit has the same flaw). Stopgap (S): skip `event` matching when `kind` is fixed_time or flow_exit, or hide both kinds. Full fix: advance the trips, add an audience step, time zones, every-N, several weekdays, ordinals, end conditions and a next-run preview. | P0 | M |
| Entry triggers | On flow exit (flow chaining) | `Has exited <flow> from any exit` (flow and exit-stage combinations), alternate flow exits, secondary trigger; enter immediately or after a delay (default 3 days) | 🟡 Partial | "On flow exit" kind takes a free-text source flow UUID (`FB:1365-1378`); `completeTrip` calls `fireFlowExitTriggers`, which inserts the dependent trip and queues `advance` with no `nextNodeId` (`flowExecutor.ts:378-465`, line 456), which `flowWorker.ts:31-37` ignores | Chained trips are created but never advance, and the stuck active trip then blocks that customer from the flow (one live trip per flow). No flow picker or exit-stage choice; trips ending through the goal or an exit event do not chain. The leftover-event misfire is fixed under the Periodic row (P0). | P2 | S |
| Entry triggers | Flow schedule (start, end, time zone) | Start As soon as possible or at a date/time; Ends Never or On a date/time; campaign time zone; Reset to defaults | ❌ Missing | No start, end or time-zone columns on `flows` (`schema.ts:325-347`); no schedule UI; activation is manual (`routes/flows.ts:205-272`) | Seasonal journeys, such as a festive sale, cannot go live or stop automatically. | P2 | M |
| Entry triggers | Limit user entry (max N entries per period) | "Limit user entry": at most N entries per user in N Days/Weeks/Months/Year (default 1 in 1 Year); shown as Entry Limitation | ❌ Missing | Only one active or waiting trip per flow (`triggerWorker.ts:121-155`; unique index in `migrations/0005_race_condition_fixes.sql:20-22`); once a trip ends, the next matching event re-enrols with no cooldown | A shopper who adds to cart every day re-enters the abandoned-cart flow every day, and flow emails skip frequency caps, so email has no ceiling at all. | P1 | S |
| Audience & control groups | Audience: All users or filter by property, behaviour or custom segment | Step 3: All users, or User property, User behavior (Has / Has Not Executed), User affinity, Custom segment; Nested Filter, + Filter (AND/OR), Reset; real-time evaluation | 🟡 Partial | `triggerConfig.audienceFilter` is checked before a trip is created (`triggerWorker.ts:97-119`), but no flows UI writes it (only campaign code references `audienceFilter` in `packages/frontend/src`), and the in-memory evaluator returns false for event and aggregate rules (`evaluator.ts:1225-1233`). Workaround: a Customer Attributes or In Segment condition after the trigger, which runs the SQL engine (`FB:1016-1035`) | No audience step; behaviour rules cannot gate entry even through the API; the condition workaround counts everyone who triggers as a trip. | P1 | M |
| Audience & control groups | Audience: User affinity | "User affinity" tab for event-based preference targeting | ❌ Missing | No affinity rule in `packages/segments/src` or `components/segments`; affinity exists only for product recommendations (`decisioningService.ts`) | Users cannot be targeted by predicted preference, such as their most-engaged category. | P3 | L |
| Audience & control groups | Audience: Exclude users and Show count | "Exclude Users" with its own filter; "Show count" for audience size | ❌ Missing | Flows have neither; campaigns have both (`campaigns/create/page.tsx:1299-1329`; `routes/campaigns.ts:301-347`) | Recent purchasers cannot be excluded at entry, and reach cannot be estimated. | P2 | S |
| Audience & control groups | Flow control group (% holdout, sticky membership) | On by default at 5% of entrants, with "continue to be part of it for subsequent entries" | ❌ Missing | No holdout in `flowExecutor.ts`, `triggerWorker.ts` or `components/flows`; campaigns have a seeded hash holdout and a lift card to reuse (`campaignService.ts:61-70`; `campaignAnalyticsService.ts:225-304`) | A flow's incremental lift cannot be measured. | P1 | M |
| Audience & control groups | Global control group | Global control group toggle (disabled until defined in settings) | ❌ Missing | No global holdout in backend, frontend or shared; holdouts are per campaign only | No account-wide holdout across campaigns and flows. | P2 | M |
| Canvas: actions | Email node: the chosen template is sent | The Email node is a full campaign editor; what is designed there is what is sent | 🟡 Partial | The wizard saves the template's UUID as `templateId` (`SNM:197-209`); `flowExecutor.ts:678-682` looks it up by `emailTemplates.name` with no project filter and on a miss sends a hard-coded "You left something behind!" email (722-728). Seeded flows store a name that seeding gives to every project (`flowService.ts:104-111`; `packages/flows/src/templates.ts:58,65`). Email goes straight to `sendEmail` (`flowExecutor.ts:749-751`), which applies no suppression, consent, caps or message logging (`emailService.ts:32-89`) | Email steps built in the UI never send their template, and seeded steps can render another tenant's template. Flow emails reach suppressed or unsubscribed addresses and are not tracked. Look up by id within the project (S); routing email through the gated, tracked path is in the engagement-conditions row. | P0 | S |
| Canvas: actions | Email node: in-node content editing | Content type, email attribute, import from a campaign, drag-and-drop / custom HTML / saved templates, layouts, pre-built gallery, dark-mode preview, templating language | 🟡 Partial | The node only picks a saved email template, with an HTML preview (`SNM:364-411,661-678`); authoring happens under /templates or in the campaign builder; personalisation is `{{var}}` substitution without conditionals or loops (`emailService.ts:109-121`; `templateContext.ts`) | Content must be authored elsewhere first. No inline editing, dark-mode preview, import from a campaign or templating logic. | P2 | M |
| Canvas: actions | Email node: sender details, content type, attachments | Subject, preview text, connector, sender name, From, Reply-to, Cc/Bcc, attachments, Gmail annotation, Promotional or Transactional | 🟡 Partial | Flow emails pass only to, subject, html, projectId and `contentType: 'promotional'` (`flowExecutor.ts:749-751`). The project's `emailFromAddress` / `emailFromName` are loaded (639-640) but never passed, so From falls back to the channel config or `noreply@storees.app` (`providers/resendEmailProvider.ts:23`). `subjectOverride` is API-only (`types.ts:676`). Campaigns have the full set (`campaigns/create/page.tsx:2087-2294`) | No per-step From or sender name, reply-to, preview text, cc/bcc, attachments, Gmail annotation or transactional routing, and flows ignore the project's own sender. | P2 | M |
| Canvas: actions | Email node: UTM parameters | UTM parameters with defaults `{{Flow Campaign Channel}}`, `{{Flow Name}}` | ✅ Full | Send wizard step 3 "Add UTM parameters" (`SNM:529-603`), defaulting to utm_source=storees, utm_medium=channel, utm_campaign=template, variables allowed; appended to every absolute link (`flowExecutor.ts:730-735`; `emailService.ts:135-157`) | None, though UI-built steps currently send the link-less fallback email (see the template row). | — | — |
| Canvas: actions | Per-node A/B test variants | "+ A/B test" inside the Email and SMS nodes | 🟡 Partial | `ActionNode` has no variants (`types.ts:668-695`); a content test can be an A/B Split with two send steps (`flowExecutor.ts:184-211`) | No variant-level test inside a step, and no per-variant analytics or winner. | P2 | M |
| Canvas: actions | Per-node Locale variants | "+ Locale" inside the Email and SMS nodes | 🟡 Partial | WhatsApp sends pick the same-name APPROVED template in the customer's `language` / `locale` attribute (`deliveryService.ts:239-266`); email, SMS and push have no locale variants | Multi-language email or SMS needs separate steps behind a language condition. | P2 | M |
| Canvas: actions | Merlin AI content generation in the Email node | Merlin AI (New): Create AI Variation / Create new; AI wand on the preview text | 🟡 Partial | AI generation exists in template authoring (`templates/ai/page.tsx`) and the campaign builder (`CampaignAiCopywriter.tsx`, `AiCopywriterPanel.tsx`), not in `SNM` | No AI copy or variations from inside a flow step. | P3 | S |
| Canvas: actions | Test send from a send node | "Test Campaign" in the Email, SMS, WhatsApp and Connector editors (ignores frequency capping) | ❌ Missing | The wizard has only Template, Variables and Settings steps (`SNM:30`); test endpoints exist only for saved email campaigns (`routes/campaigns.ts:698`) and WhatsApp templates (`routes/whatsappAdmin.ts:546`) | Marketers cannot check a flow message with real bindings before activating. | P1 | M |
| Canvas: actions | Push node | Android, iOS and Web with iOS provisional options; basic and stylized (GIF), carousel, banner, timer, progress-bar and background-update templates; received / clicked / dismissed conditions | 🟡 Partial | Picks a saved push template (`SNM:19-24`); sends through `deliveryService` with consent and caps to one FCM token per customer (`flowExecutor.ts:756-808`; `providers/fcmProvider.ts:93-95`); "Push tapped" is the only push condition (`FB:325`) | No platform targeting, rich templates or web push. UTM is saved but not applied for push (`SNM:597`). | P2 | L |
| Canvas: actions | SMS node | Mobile-number attribute, sender connector, DLT Template ID, @ personalisation, "Shorten and track URL(s)", character counter, preview, UTM, + A/B test, + Locale, test | 🟡 Partial | Picks a saved SMS template; `deliveryService` applies opt-out consent, the frequency cap, reachability and the plan quota, and logs a `messages` row (`deliveryService.ts:30-127`); providers render the template body by id (`providers/twilioProvider.ts:7-17`, `providers/gupshupProvider.ts:59-81`) | No DLT template ID, entity or sender ID, which are mandatory for SMS in India. No link shortening or click tracking. UTM saved but not applied (`SNM:597`). The number attribute cannot be chosen. | P1 | M |
| Canvas: actions | WhatsApp node | Campaign name, Import data, sender, template, placeholders, phone preview, UTM, Test Campaign | ⭐ Storees better | APPROVED-only picker with language, category and variable count, plus a bubble preview (`SNM:175-176,378-388`). Bindings for `{{1..N}}`, media header, URL suffixes, COPY_CODE and per-recipient tracked short-link buttons whose destination can come from the trigger payload (`SNM:59-114`; `deliveryService.ts:210-310`). Language variant (`deliveryService.ts:239-266`); customer, dealer or both. Activation is blocked until every WhatsApp step is APPROVED (`routes/flows.ts:21-38,245-259`) | Stronger bindings and click tracking than MoEngage shows. Missing a sender picker and a test send. The approval gate runs only on activation, so editing an active flow can still save a PENDING template (`routes/flows.ts:274-310`). | — | — |
| Canvas: actions | In-app and On-site nodes | 3-step mini-wizards. In-app: Android/iOS, session start / screen load / custom event, screens, delay. On-site: Web/Mobile Web, page load / custom event / exit intent, delay or scroll, pages. Seen / clicked / closed conditions | ❌ Missing | Neither is in the palette (`FB:313-332`) or `ActionNode.actionType` (`types.ts:672`); in-app exists only as campaign templates behind a pull API that no SDK renders (`routes/v1InAppMessages.ts`); on-site widgets are opt-in forms with exit-intent, scroll and timer triggers, not journey steps (`packages/sdk/src/widget.ts:25`) | Journeys cannot show an on-site popup or banner as a step, a notable gap for web-first Shopify stores. | P2 | L |
| Canvas: actions | Connector (webhook) node: request and personalisation | Method GET/POST/PUT/DELETE and a Webhook URL with @ personalisation; downstream "Connector sent successfully" | ⭐ Storees better | HTTP Request node (`FB:1234-1297`; `flowExecutor.ts:822-880`): GET, POST, PUT, PATCH, DELETE; `{{customer_*}}`, `{{event.*}}` and `{{node_outputs.*}}` tokens in URL, headers and body; 10 s timeout; the response is stored at `trip.context.node_outputs[key]` and later sends can bind to it; failures are recorded and the trip continues | Webhook responses can personalise later messages, which MoEngage does not show. Security gap: unlike webhooks and data connectors (`ssrfGuard.ts`, used at `webhookService.ts:122`), the node never calls `assertPublicUrl`, and the stored response is returned by the Debug API (`routes/flows.ts:407-416`) and `GET /api/customers/:id/trips` (`routes/customers.ts:650-683`). Add the guard. | P1 | S |
| Canvas: actions | Connector: URL parameters, auth configs, body types, test | URL Parameters and Headers as key/value pairs, a saved authorization config, body Form / JSON / Raw, Test campaign | 🟡 Partial | Header pairs and one body template; Content-Type defaults to application/json (`flowExecutor.ts:852`); no URL-parameter editor, saved auth configs, form encoding or test call (`FB:1234-1297`); `timeoutMs` is API-only (`types.ts:745`) | Credentials must be pasted as headers in every node, and a request cannot be tested before going live. | P2 | S |
| Canvas: actions | Ad audience sync nodes (Facebook, Google Ads) | Facebook (Add) and Google Ads Audience nodes add flow users to retargeting audiences (integration required) | ❌ Missing | Not in the palette; Storees only exports hashed segment CSVs (`components/segments/ExportAudienceButton.tsx`; `adAudienceExport.ts`) and relays purchases to the Meta Conversions API (`conversionApiService.ts`); no Custom Audience or Customer Match API calls | Journey users cannot be added to or removed from Meta or Google audiences. | P2 | L |
| Canvas: actions | Add more channels (Telegram, Line, Viber, Snapchat, Pinterest, TikTok Ads) | Locked "Add more channels" column, unlocked through Marketplace apps | ❌ Missing | No such providers in `services/providers` and no palette entries (`FB:313-332`) | Low relevance for Indian Shopify D2C brands. | P3 | L |
| Canvas: conditions | Channel-engagement conditions (context-aware) | Under a send node, that channel's events as Yes/No conditions "Within N Min/Hour/Day" (default 24 h): Email sent, opened, clicked, unsubscribed, dropped, spam, hard bounce; Push received, clicked, dismissed; SMS sent, delivered, clicked; WhatsApp sent, delivered, failed, read; In-app and On-site seen, clicked, closed; Connector sent | 🟡 Partial | Every palette shows the same five presets: Has read email (`email_read`), Has clicked email, Has read SMS, Has read WhatsApp, Push tapped (`FB:320-325,339-348`), each checked as "any such event since entering the flow" (`flowExecutor.ts:473-512`). Receipt events are emitted only for messages with a `messages` row (`messageStatusService.ts:41-52`), and flow emails create none (`flowExecutor.ts:749-751`) | Email open and click conditions can never be true for flow emails, so every user takes the No path. Checks are not tied to the preceding message (any WhatsApp read counts) and have no "within N" window. No sent, bounce, unsubscribe, spam or dismissed events; `<channel>_delivered` / `_failed` exist but only through a generic Has-done-event step. WhatsApp read works. | P0 | M |
| Canvas: conditions | Connector sent successfully condition | Yes/No condition after a Connector node | ❌ Missing | Conditions test only events, the customer row or segment membership (`flowExecutor.ts:467-579`); none reads `node_outputs.<key>.status` | A flow cannot branch on webhook success or on response values. | P2 | S |
| Canvas: conditions | Check User Attribute | Lifecycle, Acquisition, Uninstall, Reachability, Localization, email suppression, Device and tracked attributes; equal, not equal, between, not between, less, greater, exists, does not exist; Yes/No | ✅ Full | "Customer Attributes" embeds the segment filter builder (nested AND/OR, purchase history, product and collection behaviour, `reachable_email/sms/whatsapp`, ML scores), compiled to SQL (`FB:1016-1022`; `flowExecutor.ts:517-525`; `domainRegistry.ts:165-182`); the single-field check adds is, is not, greater/less than, contains, begins/ends with, true/false (`FB:964-974,1073-1125`; `flowExecutor.ts:538-576`) | No exists / does not exist or is not between (`types.ts:550-560`); device and uninstall groups do not apply without a mobile SDK. "Keep evaluating" is a separate row. | — | — |
| Canvas: conditions | Has done event: evaluation window | Since entering the flow, since the previous stage, or in the past N units (last 30 days at most); Has / Has Not Executed; + Filter | 🟡 Partial | Event plus property filters with "Since this customer entered the flow" or "Ever (entire history)" (`FB:1036-1072`); "Ever" actually checks since `flows.created_at` (`flowExecutor.ts:477-488`); reads up to 100 recent rows; "has not executed" is the No branch | No "since the previous stage" or "in the past N" window, and the "Ever" label is wrong. Queue-only events such as `enters_segment` never reach the `events` table (`segmentService.ts:136-154`), so this check cannot see them. | P2 | S |
| Canvas: conditions | Keep evaluating for the next N (wait for event with timeout) | Has done event, Conditional Split and Check User Attribute can keep evaluating for N Min/Hour/Day (on by default, 5 min) | ❌ Missing | Conditions are evaluated once, when the trip reaches them (`flowExecutor.ts:143-157`); no step waits for an event with a timeout | A flow cannot "wait up to 24 hours for a purchase and continue the moment it happens"; Wait-then-check always waits the full period. | P1 | M |
| Canvas: conditions | Conditional Split (multi-branch) | Ordered branches 1..N, each with User property or behaviour filters, display names, reorder arrows and a Default branch | 🟡 Partial | The palette's "Conditional Split" is a Yes/No condition (`ConditionNode.branches {yes, no}`, `types.ts:664`); the builder tree is binary (`FB:33-37,521-620`) | Routing by tier or category needs a chain of nested Yes/No steps, and branches cannot be named. | P1 | L |
| Canvas: controls | Wait: fixed duration | Fixed duration of N Min/Hour/Day (default 24 h) | ✅ Full | "Wait for / till" with N Minutes/Hours/Days (`FB:648-658`), run as a BullMQ delayed job plus a `scheduled_jobs` row (`flowExecutor.ts:106-141`) | Equivalent. `DEMO_DELAY_MINUTES`, when set, overrides every delay (`flowExecutor.ts:29-48`). | — | — |
| Canvas: controls | Wait: time slot | Time slot in the workspace, user or any IANA zone; Any day, Weekdays, Weekends or a weekday between hh:mm and hh:mm; "+ Add time slot"; summary sentence | ❌ Missing | `DelayNode.config` is `{value, unit}` only (`types.ts:637-641`; `flowExecutor.ts:42-48`); flows have no send-window or user-time-zone logic, although campaigns already compute `user_timezone` and `best_time` send times (`campaignService.ts:1133`) | Messages go out whenever the delay ends, including at 3 a.m. in the customer's time zone. | P1 | M |
| Canvas: controls | Wait: date & time | Next Day, Next Monday…Sunday or a specific date, until hh:mm in a chosen zone | ❌ Missing | Same `DelayNode` shape, with no wait-until option (`types.ts:637-641`) | Users cannot be held until, for example, Monday 10:00 or a sale's start date. | P2 | M |
| Canvas: controls | A/B Split | Random split with editable branch names and %, "+ Add branch", total of 100% (default 50/50), optional sticky branch | 🟡 Partial | Two-branch slider (1-99%) with fixed A/B labels (`FB:1196-1232`); the engine supports N weighted branches through the API (`flowExecutor.ts:184-211`; `types.ts:703-713`); `sha256(customerId:nodeId)` makes assignment always sticky | The UI cannot add or name branches, and moving the slider rewrites an API-made 3-way split to two branches (`FB:1201-1207`). No per-branch analytics or winner; stickiness cannot be turned off. | P2 | M |
| Canvas: controls | Goto | Mini diagram of the source, searchable destination stages (loop-creating stages hidden), "I agree, this will delete the flow branch below" | 🟡 Partial | `GotoNode` and the engine's jump exist, guarded by MAX_ITERATIONS=50 (`types.ts:718-724`; `flowExecutor.ts:84-90,227-241`); no palette entry or config UI (`FB:313-332`) | Loops and re-routes can only be built through the API. | P2 | M |
| Canvas: controls | Exit nodes on every branch | Every branch automatically ends in an Exit node | 🟡 Partial | Exit is an optional End step (`FB:331,669-673`). The engine's next step is the next array element (`flowExecutor.ts:366-369`), the canvas ends a chain at the other branch's head (`FB:79-99`), and steps added to an empty branch are spliced right after the split (`FB:1638-1642`). Simulated with that logic: Trigger, split (Yes keeps End), Email B on No, then Email A on Yes gives `[trigger, cond, emailB, emailA, end]`, and the No path runs Email B then Email A | A branch without its own Exit falls through into the other branch's steps, so users get messages meant for the other path while the canvas shows something else. Append an End to every open branch on save, or store explicit next pointers. | P0 | S |
| Canvas UX | Insert steps with "+" on connectors | "+" on every connector opens the palette (Actions, Conditions, Controls, Add more channels) | ✅ Full | `AddNodeBtn` on every connector and branch end opens a three-column menu (`FB:350-434,496-620`); inserting a split above existing steps asks which path they continue on (`FB:1574-1611,1887-1945`) | None. | — | — |
| Canvas UX | Node hover card with Stage ID | Hover card with key config (Locales, Variants, Subject) and a copyable Stage ID; Exit nodes show the Stage ID | 🟡 Partial | Cards show an icon, the type and a one-line subtitle (`FB:248-300,438-483`); node ids are internal (`action_<timestamp>_<n>`, `FB:222-223`) and appear raw in the Debug tab (`FlowDebugPanel.tsx:163,181`) | No hover summary and no readable, copyable stage name or id. | P3 | S |
| Canvas UX | Copy / duplicate steps | Node actions Copy (copy and paste stages), Edit, Delete | ❌ Missing | Node cards have only a delete button (`FB:472-479`); no copy, paste or duplicate handler | Repeated steps must be rebuilt by hand on each branch. | P2 | M |
| Canvas UX | Errors panel and validation | "Errors (N)" accordion grouped by stage, with a locate icon and per-node error badges | 🟡 Partial | `validateNodes` drives red badges and an "Errors (N)" pill that cannot be clicked (`FB:1442-1458,1798-1802`); Save (`FB:1701-1704`), PATCH (`routes/flows.ts:274-310`) and Activate (205-272) ignore the errors; the server only checks WhatsApp approval | Flows with unconfigured steps go live: an email step with no template sends the fallback email to every entrant, and an SMS step with no template reaches the provider with an empty body. No grouped list or jump to the faulty step. Block activation on the server. | P1 | S |
| Canvas UX | Undo / Redo | Undo and Redo in the canvas toolbar | ❌ Missing | No history; state is a single nodes array (`FB:1464`) | An accidentally deleted branch can only be recovered by reloading without saving. | P2 | S |
| Canvas UX | Full screen, recenter and mini map | Full Screen, Recenter, Zoom in/out and Mini Map | 🟡 Partial | Zoom 40-150% via buttons or Ctrl/Cmd+wheel, reset to 100% and drag-to-pan (`FB:1485-1567,1745-1778`); the expand icon is "Fit to 100%", not full screen | No full-screen mode, recenter on content or mini map for large flows. | P3 | S |
| Canvas UX | Auto-align | Auto-align button in the toolbar | ✅ Full | Steps are always laid out as a vertical tree with measured branch connectors (`FB:68-103,496-620`) | Not needed, since steps cannot be positioned freely. | — | — |
| Canvas UX | Entry Rules summary node | Entry Rules node with Audience, Schedule, Trigger and Entry Limitation cells that opens the "Enter" drawer | 🟡 Partial | The trigger card shows `Event: <name> · N filters` or a fixed-time / flow-exit summary (`FB:250-264`) and opens the trigger drawer (`FB:1299-1381`) | No audience, schedule or entry-limit summary, because those settings do not exist. | P3 | S |
| Flow settings | Messaging control: Ignore DND | "Ignore DND settings" toggle (on by default) | ❌ Missing | No DND or quiet hours: `deliveryService.ts:27` lists "quiet hours" in the pipeline docstring, but nothing implements it, and no quiet-hours setting exists anywhere | There is nothing to ignore: journeys and campaigns can message customers at any hour. Implement project quiet hours in `deliveryService` (defer, not drop) with a per-flow override for transactional journeys. | P1 | M |
| Flow settings | Messaging control: frequency-capping overrides | "Ignore frequency capping" with a nested "Count for the frequency capping" (both on by default) | 🟡 Partial | Project per-channel marketing caps apply to flow SMS, push and MARKETING WhatsApp (`deliveryService.ts:82,394-457`); flows always send `promotional` and never pass `ignoreFrequencyCap` (`flowExecutor.ts:796-808`); flow emails bypass caps (749-751); campaigns have both toggles (`campaigns/create/page.tsx:3517-3546`) | No per-flow override, and flow emails are not capped at all. | P2 | S |
| Flow settings | Preferences: send to opted-out users per channel | "Send campaigns to the users opted-out from Preference Management for" Push, SMS, WhatsApp | ❌ Missing | No preference centre: subscription categories exist (`routes/subscriptionCategories.ts`), but only campaigns read them (`campaignService.ts:303-318`) and nothing writes `customer_subscriptions`. Channel consent is opt-out, enforced in `deliveryService.ts:79-100`; only WhatsApp UTILITY / AUTHENTICATION templates bypass it as transactional (`deliveryService.ts:38-43`) | Service journeys cannot deliberately override channel preferences, except through the WhatsApp template category, and flows ignore category preferences entirely. | P3 | L |
| Flow settings | View flow details | Read-only drawer listing Conversion Goal(s) with a Primary badge and the event name | ✅ Full | The bottom bar shows `Goal & Exits: Goal: <event> · N exits` and opens the Goal & Exit dialog (`FB:1781-1797,2047-2158`) | None. | — | — |

### Storees-only strengths

- **Per-customer flow debugger (Debug tab).** Search by id, email, phone or external id to see every trip a customer took through the flow, with the messages sent, block reasons (consent, frequency cap, unreachable) and scheduled jobs (`FlowDebugPanel.tsx`; `routes/flows.ts:356-492`). MoEngage showed no per-user trace (it had no saved flows).
- **Flow Analytics tab.** Trips, completion, conversions, average duration, sends and deliveries, a weekly entered-vs-completed chart and recent trips, refreshed every 30 s (`FlowAnalyticsPanel.tsx`; `flowAnalyticsService.ts:70-266`; `hooks/useFlows.ts:131`). Caveats: the node funnel shows where trips are now, not how many passed each step, and flow emails are excluded.
- **Journeys tab on the customer profile.** Every flow a customer is in, or has left, from their CDP profile (`JourneysTab.tsx:51-152`; `routes/customers.ts:650-683`).
- **Several OR'd exit events, each with property filters.** Users leave when, for example, `order_placed` or an unsubscribe fires, and their pending sends are cancelled (`FB:2110-2154`; `flowExecutor.ts:335-349`). MoEngage exits only through goal conversion or Exit nodes.
- **Webhook response feeds later messages.** A flow can fetch a coupon or loyalty balance mid-journey and put it in the next WhatsApp or SMS via `node_outputs.<key>.body` (`flowExecutor.ts:822-880`; `FB:1280-1291`).
- **Decision-driven content in sends.** `{{cart_items}}`, recommended products, social proof and Next Best Action, so one abandoned-cart flow renders the shopper's own cart without per-product templates (`flowExecutor.ts:657-712`; `decisioningService.ts`; `productBlockRenderer.ts`; `SNM:415-527`). The email blocks only render once the template-lookup P0 is fixed.
- **Customer / dealer / both recipients per send step.** Brands that sell through dealers can alert the assigned dealer about their customer from the same journey, on WhatsApp and email (`SNM:329-352`; `flowExecutor.ts:665-669,737-748`; `deliveryService.ts:45-77`).
- **Activation gate for unapproved WhatsApp templates.** A flow cannot go live while a WhatsApp step points at a PENDING or REJECTED template (`routes/flows.ts:21-38,245-259`).
- **The shop's own event names.** Observed events are offered first, custom names are allowed, and templates are rewritten into the shop's vocabulary (`flows/page.tsx:82-108`; `FB:1140-1194`; `FTG:173-206`).
- **Rich pickers in trigger, goal, exit and has-done-event filters.** Searchable product, collection and segment pickers and dotted payload paths such as `line_items.0.price` (`FB:739-959`). The segment picker on `enters_segment` currently writes a property name that never matches (see the event-trigger row).
- **Built-in triggers from CTWA ad leads and on-site opt-ins.** `ctwa_lead_received` and `optin_received` reach the trigger queue (`whatsappInboundService.ts:254-285`; `routes/v1OptIn.ts:186-208`), which suits WhatsApp-first acquisition in India.
- **Enrolment from events replayed after identity stitching.** Anonymous browsing still triggers browse and cart flows once the shopper is identified, within a lookback window and without duplicate trips (`identityMergeWorker.ts:1-103`; `triggerWorker.ts:79-89,161-183`).
- **Default flows seeded when a Shopify store connects.** Abandoned Cart and Reorder Reminder drafts, translated to the shop's event names (`flowService.ts:81-180`; `routes/integrations.ts:128`).
- **Branching on ML predictions and segment membership.** Churn risk, conversion score, dormancy risk and "In segment" checks mid-journey (`FB:1016-1035`; `flowExecutor.ts:517-536`; `domainRegistry.ts:165-182`). Membership is only as fresh as the segment's last evaluation.
- **Safe split editing.** Inserting a split above existing steps asks which path they continue on, and deleting one offers "Keep one path" (`FB:1574-1611,1882-2039`). MoEngage's only safeguard seen was the destructive Goto checkbox.
- **Clone flow.** One click duplicates a journey as a draft (`routes/flows.ts:516-547`; `flows/page.tsx:425-436`; `flows/[id]/page.tsx:105-116`). MoEngage's row menus were not captured, so parity is unknown.

### UX notes

- **Flow list** (screenshot 003). MoEngage's All Flows is a dense table with status tabs, a filter bar and Performance/Goals columns. Storees' `/flows` is a stack of tall cards with trip-state bars (`flows/page.tsx:357-540`): easy to scan for a handful of flows, but with no search, filters, created date or conversion column. Switch to a table with status tabs, search and a status filter; keep the state distribution as an inline mini-bar, and add Conversions/Revenue once flow attribution exists.
- **Creating a flow** (013, 017). MoEngage has one "Create flow" button that opens a two-pane modal: templates on the left; description, highlights and a read-only canvas preview on the right; "Start with a blank canvas" in the same modal. Storees splits this into separate Templates and Create Flow buttons, and its cards have no preview (`FTG:284-331`). Merge them and use `StructuredFlowBuilder` in read-only mode as the preview.
- **Entry rules** (066, 124). MoEngage gathers entry settings in an Entry Rules card with Audience, Schedule, Trigger and Entry Limitation cells that open one "Enter" drawer. Storees spreads them across the Create dialog, a 288 px trigger drawer (`FB:636`) and the bottom-bar Goal & Exits dialog. A multi-cell Entry Rules card would give the missing audience, schedule and re-entry settings an obvious home.
- **Context-aware palette** (076, 078, 108). MoEngage's "+" under an Email, Push, SMS or WhatsApp node lists that channel's engagement conditions, each with a "Within N hours" setting. Storees shows the same five presets everywhere (`FB:320-325`). Make the presets depend on the nearest send step above, and store that step's id so the check applies to that message.
- **Node editors** (091, 096, 104). MoEngage uses full-height drawers with a stage name and Cancel/Done for every node. Storees edits conditions in a 288 px side drawer that embeds the whole segment filter builder (`FB:636,1016-1022`), which is cramped for nested rules; send steps use a large modal wizard. Widen the condition drawer (or reuse the xl Dialog) and give every step an editable stage name.
- **Validation** (064, 065). MoEngage's "Errors (N)" accordion groups errors by stage and has a locate icon. Storees has red badges and an "Errors (N)" pill (`FB:1798-1802`), but the pill cannot be clicked and nothing blocks Save or Activate. Make the pill open a list that scrolls to the faulty step, and block activation on the server.
- **Canvas controls** (069, 118, 119). MoEngage has Full Screen, Auto-align, Recenter, Undo/Redo, Zoom and Mini Map, and hover cards with a config summary, copyable Stage ID and Copy/Edit/Delete icons. Storees has zoom, pan and reset, plus a delete icon on each card. Undo/redo and duplicate-step add the most; the auto-laid-out tree already makes Auto-align unnecessary.
- **Wait step** (094, 096, 099, 102). MoEngage's "Wait for/till" has three modes (Fixed duration, Time slot, Date & time), each with a plain-language summary. Storees' step is also labelled "Wait for / till" but offers only a duration (`FB:648-658`). Rename it "Wait" until the time-slot and date modes exist.
- **Settings** (120). MoEngage keeps Flow and Settings tabs on the canvas, and its Settings drawer holds tags, goals, the goal window, exit on conversion, DND and frequency-cap overrides, and preference overrides. Storees has no flow-level settings. One Settings drawer would give a home to re-entry limits, the goal window and revenue, a frequency-cap override and the start/end schedule.
- **Misleading Storees copy to hide or reword until the feature works:**
  - The fixed-time trigger says "Time (UTC)" and warns "Make sure an audience filter is set on this flow", although no UI can set one (`FB:1402-1435`).
  - "At fixed time" and "On flow exit" are offered in the trigger drawer although neither enrols anyone and both misfire on the leftover event (`FB:685-690`).
  - The has-done-event option "Ever (entire history)" means "since the flow was created" (`FB:1069`; `flowExecutor.ts:477-488`).
  - "On flow exit" asks for a raw flow UUID (`FB:1366-1376`).
  - The list card's trigger chip shows the stale event for fixed-time and flow-exit flows (`flows/page.tsx:487-500`).
- **Where Storees is better:**
  - The 3-step send wizard (Template with a live WhatsApp bubble preview, Variables with source bindings, Settings for UTM) is clearer than MoEngage's long single-form channel editors (110, 113).
  - The insert-split and delete-split dialogs (`FB:1887-2039`) are safer than MoEngage Goto's "I agree, this will delete the flow branch below" checkbox (105).
  - The Debug tab has no counterpart in the capture, though it shows raw node ids such as `action_<timestamp>` (`FlowDebugPanel.tsx:163,181`); show step labels instead.
- **Security seen along the way.** The HTTP Request step fetches any tenant-supplied URL without the SSRF guard that webhooks and data connectors use, and the response lands in `trip.context`, which the Debug API and `GET /api/customers/:id/trips` return. Call `assertPublicUrl` before the fetch.
- **MoEngage's own rough edges:** both "Welcome Customers" template previews never load and reuse the abandoned-cart description (016, 024), and 5 of its 11 template entries are locked upsells (019-023). Storees' gallery is smaller, but every card can be used.

### Verification notes

Every row was re-checked against the code at `2063cdc`. All 72 statuses held. These rows changed:

- **At fixed time: Periodic, P1 → P0.** `triggerWorker.ts:77` matches `triggerConfig.event` and never reads `kind`. Switching the kind keeps the event chosen in the create dialog (`FB:1312`), validation demands an event for every kind (`FB:1448`), and save writes the trigger node's config back to `flows.trigger_config` (`flows/[id]/page.tsx:32-34`). A fixed-time or flow-exit flow therefore enrols every customer who fires that leftover event and sends them the journey, while its own schedule or chain never advances anyone. The stopgap is small; the P0 covers both kinds, and the On flow exit row points to it.
- **Connector (webhook) node: priority none → P1, effort S; ⭐ kept.** `flowExecutor.ts:822-880` fetches tenant-supplied URLs without `assertPublicUrl` (`ssrfGuard.ts`, applied at `webhookService.ts:122` and `connectors/genericHttpConnector.ts:260`). The response is stored in `trip.context` and returned by `routes/flows.ts:407-416` and `routes/customers.ts:650-683`.
- **Evidence and gap corrections (status and priority unchanged):**
  - **On flow exit:** the stuck `active` trip also blocks the customer from re-entering that flow (`triggerWorker.ts:121-155`).
  - **Email sender details:** the project's sender fields are loaded (`flowExecutor.ts:639-640`) but never passed (750), so flow email comes from the channel config or `noreply@storees.app`.
  - **Preferences:** subscription categories do exist (`routes/subscriptionCategories.ts`), but only campaigns read them and nothing writes `customer_subscriptions`.
  - **Locked IPO:** the plan doc's status line is `docs/MOENGAGE_COMPETITIVE_PLAN.md:124`; line 35 is a tree diagram.
  - **WhatsApp node:** the approval gate runs only on activation (`routes/flows.ts:251`), not on `PATCH /:id`.
  - **Template library:** Win-Back fires on any segment entry; the backend catalog spans `flowTemplates.ts:69-357` (30 entries).
  - **A/B Split:** the weight slider rewrites the branch array to two entries (`FB:1201-1207`).
  - **Channel-engagement conditions:** `<channel>_delivered` and `_failed` events exist for SMS, WhatsApp and push (`messageStatusService.ts:73-86`) and can be checked through a generic Has-done-event step.
  - **Errors panel:** an SMS step with no template reaches the provider with an empty body (`providers/twilioProvider.ts:9-11`).
  - **Wait: time slot:** campaigns already have `user_timezone` and `best_time` send logic to reuse (`campaignService.ts:1133`).
  - **List columns:** the trigger chip is stale for fixed-time and flow-exit flows.
  - **Storees-only:** decision-driven email blocks depend on the template-lookup fix, and the `enters_segment` segment picker never matches.
- **Confirmed after trying to refute them:**
  - **Branch fall-through:** re-run with a copy of `handleAddNode` (`FB:1628-1650`) and `getNextNode` in both insertion orders. The branch populated second always runs into the first branch's steps.
  - **Email template:** looked up by name with no project filter, with the hard-coded fallback; seeded template names are shared across projects.
  - **Email engagement:** flow emails never create a `messages` row, so the Resend webhook's `handleDeliveryReceipt` returns before emitting `email_read` or `email_clicked`. There is no own open pixel, and flow email links are not rewritten to `tracked_links`.
  - **Delete 500:** `scheduled_jobs` and `messages` keep non-cascading FKs to `flow_trips`, and the route deletes only trips and the flow.
  - **Pause:** in-flight trips are not stopped.
  - **Event filters:** `segmentId` vs `segment_id`, and strict `===` in `eventFilters.ts`.
  - **Template catalog:** no frontend caller (`api/flows` appears only in `hooks/useFlows.ts` and a debug-panel comment).
  - **Fixed-time and flow-exit advance:** jobs carry no `nextNodeId`, and `flowWorker` only moves `waiting` trips.
  - **No synonyms found** for flow holdout, global holdout, quiet hours/DND, archive, tags, re-entry limits, flow revenue, DLT, affinity or business-event emitters (searched holdout, control_group, quiet, dnd, archiv, cooldown, maxEntries, revenue, dlt, entity_id, affinity, price_drop, restock).
  - **Check User Attribute kept ✅:** the UI → SQL chain works and covers more commerce fields than MoEngage; the missing exists / not-between operators are noted in the row.
  - **Goal revenue kept at P0:** the conversion count shown today is near zero for typical flows, which misrepresents every flow's results.
- **Cross-module consistency review (completeness pass):** Secondary trigger ❌ → 🟡 (still P2, M). Modules 01-05 rate the same Wait plus Has-done-event workaround 🟡; its limits (it enrols everyone and waits out the full delay) stay in the gap.

### Screens

#### All Flows (list)

![Engage sidebar flyout: + New Campaign, + New Flow, All Campaigns, All Flows](../screenshots/06-flows-001-engage-flyout.jpg)
*Engage sidebar flyout: + New Campaign, + New Flow, All Campaigns, All Flows*

![All Flows page top: header with Create flow, integration-pending banner, intro video card, tab counters](../screenshots/06-flows-002-all-flows-top.jpg)
*All Flows page top: header with Create flow, integration-pending banner, intro video card, tab counters*

![Flow list section: tabs, filters, Archived flows toggle, columns, empty state](../screenshots/06-flows-003-all-flows-list-empty.jpg)
*Flow list section: tabs, filters, Archived flows toggle, columns, empty state*

![Created date filter presets (Today ... Custom Range, Last N D/W/M)](../screenshots/06-flows-004-filter-created-date.jpg)
*Created date filter presets (Today ... Custom Range, Last N D/W/M)*

![Delivery type filter: One Time, Periodic, Event Triggered, On Flow Exit](../screenshots/06-flows-005-filter-delivery-type.jpg)
*Delivery type filter: One Time, Periodic, Event Triggered, On Flow Exit*

![Status filter: Paused, Stopped, Retired, Active, Scheduled, Completed](../screenshots/06-flows-006-filter-status.jpg)
*Status filter: Paused, Stopped, Retired, Active, Scheduled, Completed*

![More filters panel 'Filter campaigns': tags (All of these / Any of these), Created by, Reset/Cancel/Apply](../screenshots/06-flows-007-more-filters-panel.jpg)
*More filters panel 'Filter campaigns': tags (All of these / Any of these), Created by, Reset/Cancel/Apply*

![Tag picker: Default tags activation ... transactional](../screenshots/06-flows-008-more-filters-tags.jpg)
*Tag picker: Default tags activation ... transactional*

![Performance column tooltip: conversions based on Total Conversion, link to change default attribution](../screenshots/06-flows-009-performance-tooltip.jpg)
*Performance column tooltip: conversions based on Total Conversion, link to change default attribution*

![Active tab: 'Currently Active Flows' tooltip and Status: Active chip](../screenshots/06-flows-010-tab-active-tooltip.jpg)
*Active tab: 'Currently Active Flows' tooltip and Status: Active chip*

![Run Yesterday tab tooltip (GMT)](../screenshots/06-flows-011-tab-run-yesterday-tooltip.jpg)
*Run Yesterday tab tooltip (GMT)*

![Archived flows toggle on: empty (turned back off afterwards)](../screenshots/06-flows-012-archived-flows-toggle-empty.jpg)
*Archived flows toggle on: empty (turned back off afterwards)*


#### Create new flow: template gallery modal

![Create new flow modal: template list plus blank canvas option](../screenshots/06-flows-013-create-flow-templates-modal.jpg)
*Create new flow modal: template list plus blank canvas option*

![Onboard Customers - Single Channel: highlights and canvas preview (Conditional Split, Push, Has done event, Goto, Exit)](../screenshots/06-flows-014-tpl-onboard-single-channel.jpg)
*Onboard Customers - Single Channel: highlights and canvas preview (Conditional Split, Push, Has done event, Goto, Exit)*

![Onboard Customers - Multi-channel: A/B Test, Wait for/till, Go To, Conditional Split + Locale](../screenshots/06-flows-015-tpl-onboard-multi-channel.jpg)
*Onboard Customers - Multi-channel: A/B Test, Wait for/till, Go To, Conditional Split + Locale*

![Welcome Customers - Single channel (Adoption): preview stuck on a spinner; its description is copied from the abandoned-cart template](../screenshots/06-flows-016-tpl-welcome-single-adoption-loading.jpg)
*Welcome Customers - Single channel (Adoption): preview stuck on a spinner; its description is copied from the abandoned-cart template*

![Abandoned Cart Reminder - Single Channel: wait, then push, Has Purchased? check, reminder](../screenshots/06-flows-017-tpl-abandoned-cart-single.jpg)
*Abandoned Cart Reminder - Single Channel: wait, then push, Has Purchased? check, reminder*

![Abandoned Cart Reminder - Multi Channel: conditional check/split, copy-paste stages](../screenshots/06-flows-018-tpl-abandoned-cart-multi.jpg)
*Abandoned Cart Reminder - Multi Channel: conditional check/split, copy-paste stages*

![Browse Abandonment - Multi-Channel: locked, needs Intelligent path optimizer (Sherpa); Facebook Audience retargeting](../screenshots/06-flows-019-tpl-browse-abandonment-locked.jpg)
*Browse Abandonment - Multi-Channel: locked, needs Intelligent path optimizer (Sherpa); Facebook Audience retargeting*

![Customer Reactivation - Multi-channel: locked, needs Next Best Action](../screenshots/06-flows-020-tpl-customer-reactivation-locked.jpg)
*Customer Reactivation - Multi-channel: locked, needs Next Best Action*

![Periodic - Customer Reactivation - Multi-channel: periodic entry + Next Best Action (locked)](../screenshots/06-flows-021-tpl-periodic-reactivation-locked.jpg)
*Periodic - Customer Reactivation - Multi-channel: periodic entry + Next Best Action (locked)*

![Engage customers on App: locked, needs Cards and Next Best Action](../screenshots/06-flows-022-tpl-engage-app-locked.jpg)
*Engage customers on App: locked, needs Cards and Next Best Action*

![Engage customers on Web: Web Push, On-site, Cards, Google Ads audience sync (locked); Request a template link](../screenshots/06-flows-023-tpl-engage-web-locked.jpg)
*Engage customers on Web: Web Push, On-site, Cards, Google Ads audience sync (locked); Request a template link*

![Welcome Customers - Single channel (Engagement group): preview also stuck loading](../screenshots/06-flows-024-tpl-welcome-single-engagement-loading.jpg)
*Welcome Customers - Single channel (Engagement group): preview also stuck loading*


#### Create flow wizard (steps 1-3)

![Step 1 Details and goals (empty)](../screenshots/06-flows-025-create-step1-details-goals.jpg)
*Step 1 Details and goals (empty)*

![Conversion goal tooltip](../screenshots/06-flows-026-step1-conversion-goal-tooltip.jpg)
*Conversion goal tooltip*

![Flow tags dropdown with Manage tags](../screenshots/06-flows-027-step1-flow-tags-dropdown.jpg)
*Flow tags dropdown with Manage tags*

![Goal 1 row, Track above goal for 36 Hours, Exit on conversion toggle](../screenshots/06-flows-028-step1-goal-row-added.jpg)
*Goal 1 row, Track above goal for 36 Hours, Exit on conversion toggle*

![Goal event dropdown: no events (SDK not integrated)](../screenshots/06-flows-029-step1-goal-event-dropdown-empty.jpg)
*Goal event dropdown: no events (SDK not integrated)*

!['Track above goal for' tooltip (conversion window)](../screenshots/06-flows-030-step1-track-goal-for-tooltip.jpg)
*'Track above goal for' tooltip (conversion window)*

![Exit on conversion tooltip (exit on primary goal within the view-through window)](../screenshots/06-flows-031-step1-exit-on-conversion-tooltip.jpg)
*Exit on conversion tooltip (exit on primary goal within the view-through window)*

![Goal window unit: Hours / Days](../screenshots/06-flows-032-step1-goal-window-unit.jpg)
*Goal window unit: Hours / Days*

![Validation on step jump: name of at least 5 characters, goal event required, error toast](../screenshots/06-flows-033-step1-validation-on-step-jump.jpg)
*Validation on step jump: name of at least 5 characters, goal event required, error toast*

![Step 2 On event trigger: Primary trigger event(s) Has Executed, alternate/secondary triggers, THEN enter Immediately / With Delay](../screenshots/06-flows-034-step2-on-event-trigger.jpg)
*Step 2 On event trigger: Primary trigger event(s) Has Executed, alternate/secondary triggers, THEN enter Immediately / With Delay*

![Flow schedule (start, time zone, ends) and Settings: Limit user entry](../screenshots/06-flows-035-step2-flow-schedule-settings.jpg)
*Flow schedule (start, time zone, ends) and Settings: Limit user entry*

![Limit user entry: Maximum entries per user N time(s) in N period](../screenshots/06-flows-036-step2-limit-user-entry-on.jpg)
*Limit user entry: Maximum entries per user N time(s) in N period*

![Entry limit period: Day(s), Week(s), Month(s), Year](../screenshots/06-flows-037-step2-entry-limit-period.jpg)
*Entry limit period: Day(s), Week(s), Month(s), Year*

![With Delay: \[2\] \[Hours\] \[After\] \[If Action\]: all actions must be done within this time](../screenshots/06-flows-038-step2-enter-with-delay.jpg)
*With Delay: \[2\] \[Hours\] \[After\] \[If Action\]: all actions must be done within this time*

![Delay units: Minutes, Hours, Days](../screenshots/06-flows-039-step2-delay-units.jpg)
*Delay units: Minutes, Hours, Days*

![Delay relation: Before (disabled) / After](../screenshots/06-flows-040-step2-delay-before-after.jpg)
*Delay relation: Before (disabled) / After*

![Delay reference: If Action](../screenshots/06-flows-041-step2-delay-reference-if-action.jpg)
*Delay reference: If Action*

![Start at specific date and time (date, send time am/pm)](../screenshots/06-flows-042-step2-start-specific-date-time.jpg)
*Start at specific date and time (date, send time am/pm)*

![Ends On: end date and time](../screenshots/06-flows-043-step2-ends-on-date.jpg)
*Ends On: end date and time*

![Campaign time zone dropdown (full IANA list, searchable)](../screenshots/06-flows-044-step2-timezone-dropdown.jpg)
*Campaign time zone dropdown (full IANA list, searchable)*

![Trigger event selector: no events available](../screenshots/06-flows-045-step2-trigger-event-selector-empty.jpg)
*Trigger event selector: no events available*

![At fixed time: One Time (ASAP / specific date and time), Periodic (Daily / Weekly / Monthly); note that the 10M+ audience limit is unsupported](../screenshots/06-flows-046-step2-at-fixed-time-one-time.jpg)
*At fixed time: One Time (ASAP / specific date and time), Periodic (Daily / Weekly / Monthly); note that the 10M+ audience limit is unsupported*

![Periodic Daily: repeat every N days, Ends Never/On/After, next send preview, Limit user entry](../screenshots/06-flows-047-step2-fixed-periodic-daily.jpg)
*Periodic Daily: repeat every N days, Ends Never/On/After, next send preview, Limit user entry*

![Periodic Weekly: repeat every N weeks on S M T W T F S](../screenshots/06-flows-048-step2-fixed-periodic-weekly.jpg)
*Periodic Weekly: repeat every N weeks on S M T W T F S*

![Periodic Monthly: repeat on days of month (1-31 grid)](../screenshots/06-flows-049-step2-fixed-periodic-monthly-days.jpg)
*Periodic Monthly: repeat on days of month (1-31 grid)*

![Monthly: Days of week (\[First\] \[weekday\] of the month, + Add)](../screenshots/06-flows-050-step2-monthly-days-of-week.jpg)
*Monthly: Days of week (\[First\] \[weekday\] of the month, + Add)*

![Ordinal: First, Second, Third, Fourth, Last](../screenshots/06-flows-051-step2-monthly-ordinal-dropdown.jpg)
*Ordinal: First, Second, Third, Fourth, Last*

![Ends After N occurrences](../screenshots/06-flows-052-step2-ends-after-occurrences.jpg)
*Ends After N occurrences*

![On flow exit: Has exited \[flow\] from any exit, alternate flow exit, secondary trigger, THEN enter With Delay 3 Days after flow exit](../screenshots/06-flows-053-step2-on-flow-exit.jpg)
*On flow exit: Has exited \[flow\] from any exit, alternate flow exit, secondary trigger, THEN enter With Delay 3 Days after flow exit*

![Flow selector for flow-exit trigger: empty](../screenshots/06-flows-054-step2-flow-exit-selector-empty.jpg)
*Flow selector for flow-exit trigger: empty*

![AND Secondary trigger event(s): must be fulfilled after the primary trigger within the delay](../screenshots/06-flows-055-step2-secondary-trigger-added.jpg)
*AND Secondary trigger event(s): must be fulfilled after the primary trigger within the delay*

![Secondary trigger operator: Has Executed / Has Not Executed](../screenshots/06-flows-056-step2-secondary-trigger-operator.jpg)
*Secondary trigger operator: Has Executed / Has Not Executed*

![Step 3 Audience: All users / Filter users by (User property, User behavior, User affinity, Custom segment), Exclude Users, Show count, warnings](../screenshots/06-flows-057-step3-audience-top.jpg)
*Step 3 Audience: All users / Filter users by (User property, User behavior, User affinity, Custom segment), Exclude Users, Show count, warnings*

![Control groups: Global control group (not defined), Flow control group 5%, sticky membership](../screenshots/06-flows-058-step3-control-groups.jpg)
*Control groups: Global control group (not defined), Flow control group 5%, sticky membership*

![Global control group tooltip](../screenshots/06-flows-059-step3-global-control-group-tooltip.jpg)
*Global control group tooltip*

![Behavior operator: Has Executed / Has Not Executed](../screenshots/06-flows-060-step3-behavior-operator.jpg)
*Behavior operator: Has Executed / Has Not Executed*

![User affinity filter: event list empty](../screenshots/06-flows-061-step3-user-affinity-empty.jpg)
*User affinity filter: event list empty*

![Custom segment picker (segment 'Test File')](../screenshots/06-flows-062-step3-custom-segment-list.jpg)
*Custom segment picker (segment 'Test File')*


#### Flow canvas builder

![Blank canvas: Entry Rules and Exit, Errors (2), toolbar](../screenshots/06-flows-063-canvas-initial-entry-exit.jpg)
*Blank canvas: Entry Rules and Exit, Errors (2), toolbar*

![Errors panel grouped by Enter / Settings](../screenshots/06-flows-064-canvas-errors-panel.jpg)
*Errors panel grouped by Enter / Settings*

![Errors detail: 'Set a valid conversion goal'](../screenshots/06-flows-065-canvas-errors-settings-goal.jpg)
*Errors detail: 'Set a valid conversion goal'*

![Entry Rules node (zoom): Audience, Schedule, Users enter on event trigger, Entry Limitation](../screenshots/06-flows-066-canvas-entry-rules-node-zoom.jpg)
*Entry Rules node (zoom): Audience, Schedule, Users enter on event trigger, Entry Limitation*

![Node palette: Actions, Conditions, Controls, locked 'Add more channels'](../screenshots/06-flows-067-canvas-node-palette.jpg)
*Node palette: Actions, Conditions, Controls, locked 'Add more channels'*

![Email node added (error badge until configured)](../screenshots/06-flows-068-canvas-email-node-added.jpg)
*Email node added (error badge until configured)*

![Node hover card (Locales, Variants, Subject, Stage ID) and node actions Copy / Edit / Delete](../screenshots/06-flows-069-canvas-node-hover-card-actions.jpg)
*Node hover card (Locales, Variants, Subject, Stage ID) and node actions Copy / Edit / Delete*

![Email node editor: name, content type, email attribute, editor tabs, layouts; SMTP-not-configured banner](../screenshots/06-flows-070-node-email-editor-top.jpg)
*Email node editor: name, content type, email attribute, editor tabs, layouts; SMTP-not-configured banner*

![Email node pre-built template gallery (paginated, searchable)](../screenshots/06-flows-071-node-email-prebuilt-templates.jpg)
*Email node pre-built template gallery (paginated, searchable)*

![Email node after picking a layout: + A/B test, + Locale, Merlin AI (New), Email details](../screenshots/06-flows-072-node-email-ab-locale-merlin.jpg)
*Email node after picking a layout: + A/B test, + Locale, Merlin AI (New), Email details*

![Sender details: Subject, Preview text, Email connector, Sender name, From, Reply-to, Cc/Bcc; Attachments; Gmail annotation](../screenshots/06-flows-073-node-email-sender-details.jpg)
*Sender details: Subject, Preview text, Email connector, Sender name, From, Reply-to, Cc/Bcc; Attachments; Gmail annotation*

![Drag-and-drop editor blocks and UTM parameters ({{Flow Campaign Channel}}, {{Flow Name}})](../screenshots/06-flows-074-node-email-editor-utm.jpg)
*Drag-and-drop editor blocks and UTM parameters ({{Flow Campaign Channel}}, {{Flow Name}})*

![UTM params and Test Campaign section (not used)](../screenshots/06-flows-075-node-email-utm-test-campaign.jpg)
*UTM params and Test Campaign section (not used)*

![Palette below an Email node adds email-engagement conditions](../screenshots/06-flows-076-palette-after-email-engagement-conditions.jpg)
*Palette below an Email node adds email-engagement conditions*

!['Has opened email message' condition with Yes/No branches](../screenshots/06-flows-077-canvas-has-opened-email-yes-no.jpg)
*'Has opened email message' condition with Yes/No branches*

![Engagement condition editor: Check for event occurrence Within 24 Hour(s)](../screenshots/06-flows-078-node-has-opened-email-editor.jpg)
*Engagement condition editor: Check for event occurrence Within 24 Hour(s)*

![Within unit: Min(s), Hour(s), Day(s)](../screenshots/06-flows-079-node-has-opened-email-within-unit.jpg)
*Within unit: Min(s), Hour(s), Day(s)*

![Check User Attribute node with Yes/No branches](../screenshots/06-flows-080-canvas-check-user-attribute-added.jpg)
*Check User Attribute node with Yes/No branches*

![Check User Attribute editor: Stage name, condition, + Filter, Keep evaluating for the next](../screenshots/06-flows-081-node-check-user-attribute-editor.jpg)
*Check User Attribute editor: Stage name, condition, + Filter, Keep evaluating for the next*

![Attribute picker groups (Lifecycle, Acquisition, Reachability, ...)](../screenshots/06-flows-082-node-check-attr-attribute-list.jpg)
*Attribute picker groups (Lifecycle, Acquisition, Reachability, ...)*

![Reachability Push condition (reachability check)](../screenshots/06-flows-083-node-check-attr-reachability-push.jpg)
*Reachability Push condition (reachability check)*

![Operators: is equal to, is not equal to, is between, is not between, is less than, is greater than, exists, does not exist](../screenshots/06-flows-084-node-check-attr-operators.jpg)
*Operators: is equal to, is not equal to, is between, is not between, is less than, is greater than, exists, does not exist*

![Keep evaluating for the next N Min(s)/Hour(s)/Day(s)](../screenshots/06-flows-085-node-check-attr-keep-evaluating.jpg)
*Keep evaluating for the next N Min(s)/Hour(s)/Day(s)*

![Has done event editor (title 'Check if user has done event'): evaluation window, Has Executed event, keep evaluating](../screenshots/06-flows-086-node-has-done-event-editor.jpg)
*Has done event editor (title 'Check if user has done event'): evaluation window, Has Executed event, keep evaluating*

![Evaluation window: Since entering the flow / Since they exited the previous stage / In the past](../screenshots/06-flows-087-node-has-done-event-eval-window.jpg)
*Evaluation window: Since entering the flow / Since they exited the previous stage / In the past*

![In the past N Min(s)](../screenshots/06-flows-088-node-has-done-event-in-the-past.jpg)
*In the past N Min(s)*

![Has Executed / Has Not Executed](../screenshots/06-flows-089-node-has-done-event-operator.jpg)
*Has Executed / Has Not Executed*

![Conditional Split node: Branch 1 + Default branch](../screenshots/06-flows-090-canvas-conditional-split-added.jpg)
*Conditional Split node: Branch 1 + Default branch*

![Conditional Split editor: ordered branch conditions (User property / User behavior), display names, default branch, keep evaluating](../screenshots/06-flows-091-node-conditional-split-editor.jpg)
*Conditional Split editor: ordered branch conditions (User property / User behavior), display names, default branch, keep evaluating*

![Second branch added ('else user enters this branch if'), reorder arrows](../screenshots/06-flows-092-node-conditional-split-branch2.jpg)
*Second branch added ('else user enters this branch if'), reorder arrows*

![Wait for/till node on Branch 1](../screenshots/06-flows-093-canvas-wait-node-added.jpg)
*Wait for/till node on Branch 1*

![Wait for/till: Fixed duration 24 Hour(s)](../screenshots/06-flows-094-node-wait-fixed-duration.jpg)
*Wait for/till: Fixed duration 24 Hour(s)*

![Wait units Min(s) / Hour(s) / Day(s)](../screenshots/06-flows-095-node-wait-duration-units.jpg)
*Wait units Min(s) / Hour(s) / Day(s)*

![Wait for a time slot: time zone, On \[day\], + Add time slot](../screenshots/06-flows-096-node-wait-time-slot.jpg)
*Wait for a time slot: time zone, On \[day\], + Add time slot*

![Time slot zone: Workspace timezone, User's time zone, any IANA zone](../screenshots/06-flows-097-node-wait-time-slot-timezone.jpg)
*Time slot zone: Workspace timezone, User's time zone, any IANA zone*

![Time slot days: Any Day, Weekdays, Weekends, Monday-Sunday](../screenshots/06-flows-098-node-wait-time-slot-days.jpg)
*Time slot days: Any Day, Weekdays, Weekends, Monday-Sunday*

![Weekdays between hh:mm and hh:mm, with summary sentence](../screenshots/06-flows-099-node-wait-time-slot-weekdays.jpg)
*Weekdays between hh:mm and hh:mm, with summary sentence*

![Wait for a specific time: Date & time in \[zone\]](../screenshots/06-flows-100-node-wait-date-time.jpg)
*Wait for a specific time: Date & time in \[zone\]*

![Next Day, Next Monday ... Next Sunday, Specific date](../screenshots/06-flows-101-node-wait-date-time-options.jpg)
*Next Day, Next Monday ... Next Sunday, Specific date*

![Next Day till hh:mm, with summary](../screenshots/06-flows-102-node-wait-next-day-till.jpg)
*Next Day till hh:mm, with summary*

![A/B Split node with Branch 1 (50%) and Branch 2 (50%)](../screenshots/06-flows-103-canvas-ab-split-added.jpg)
*A/B Split node with Branch 1 (50%) and Branch 2 (50%)*

![A/B Split editor: branch names and %, + Add branch, Total, sticky-branch control](../screenshots/06-flows-104-node-ab-split-editor.jpg)
*A/B Split editor: branch names and %, + Add branch, Total, sticky-branch control*

![Goto editor: source location, destination stage list (loops prevented), 'I agree, this will delete the flow branch below'](../screenshots/06-flows-105-node-goto-editor.jpg)
*Goto editor: source location, destination stage list (loops prevented), 'I agree, this will delete the flow branch below'*

![Goto node on the canvas](../screenshots/06-flows-106-canvas-goto-added.jpg)
*Goto node on the canvas*

![Push node editor: platforms, iOS provisional options, template tiles; missing FCM/APNS/web push key warnings](../screenshots/06-flows-107-node-push-editor.jpg)
*Push node editor: platforms, iOS provisional options, template tiles; missing FCM/APNS/web push key warnings*

![Palette below a Push node: received / clicked / dismissed push conditions](../screenshots/06-flows-108-palette-after-push-conditions.jpg)
*Palette below a Push node: received / clicked / dismissed push conditions*

![SMS node editor: mobile attribute, sender connector, Template ID, message, URL shortening, preview, + A/B test, + Locale](../screenshots/06-flows-109-node-sms-editor.jpg)
*SMS node editor: mobile attribute, sender connector, Template ID, message, URL shortening, preview, + A/B test, + Locale*

![WhatsApp node editor: sender, template, placeholder content, preview](../screenshots/06-flows-110-node-whatsapp-editor.jpg)
*WhatsApp node editor: sender, template, placeholder content, preview*

![In-app node editor (3-step): platforms, trigger criteria, screen context, trigger time](../screenshots/06-flows-111-node-inapp-editor-step1.jpg)
*In-app node editor (3-step): platforms, trigger criteria, screen context, trigger time*

![On-site node editor (3-step): Web / Mobile Web, On Page Load / custom event / Exit Intent, After Scroll, pages](../screenshots/06-flows-112-node-onsite-editor-step1.jpg)
*On-site node editor (3-step): Web / Mobile Web, On Page Load / custom event / Exit Intent, After Scroll, pages*

![Connector (webhook) node: method, URL, URL params, headers, authorization](../screenshots/06-flows-113-node-connector-editor.jpg)
*Connector (webhook) node: method, URL, URL params, headers, authorization*

![Connector POST: Body type Form / JSON / Raw, authorization config picker, Test campaign](../screenshots/06-flows-114-node-connector-post-body-auth.jpg)
*Connector POST: Body type Form / JSON / Raw, authorization config picker, Test campaign*

![Facebook node: integration required (Integrate button not clicked)](../screenshots/06-flows-115-node-facebook-integration-required.jpg)
*Facebook node: integration required (Integrate button not clicked)*

![Google Ads Audience node: integration required, 'Google Ads not connected' toast](../screenshots/06-flows-116-node-google-ads-integration-required.jpg)
*Google Ads Audience node: integration required, 'Google Ads not connected' toast*

![Exit node hover card (Stage ID only, not configurable)](../screenshots/06-flows-117-canvas-exit-node-hover-card.jpg)
*Exit node hover card (Stage ID only, not configurable)*

![Canvas Full Screen mode](../screenshots/06-flows-118-canvas-full-screen-mode.jpg)
*Canvas Full Screen mode*

![Zoomed-out overview of the test flow with Mini Map](../screenshots/06-flows-119-canvas-overview-minimap.jpg)
*Zoomed-out overview of the test flow with Mini Map*

![Clicking Entry Rules opens the 'Enter' drawer (When / Who steps)](../screenshots/06-flows-124-canvas-entry-rules-editor.jpg)
*Clicking Entry Rules opens the 'Enter' drawer (When / Who steps)*


#### Flow Settings drawer and View flow details

![Flow settings drawer](../screenshots/06-flows-120-flow-settings-drawer.jpg)
*Flow settings drawer*

![Messaging control tooltip](../screenshots/06-flows-121-flow-settings-messaging-control-tooltip.jpg)
*Messaging control tooltip*

![Preferences tooltip (exclude opted-out users per channel)](../screenshots/06-flows-122-flow-settings-preferences-tooltip.jpg)
*Preferences tooltip (exclude opted-out users per channel)*

![View flow details: Conversion Goal(s), Goal 1 Primary](../screenshots/06-flows-123-view-flow-details-drawer.jpg)
*View flow details: Conversion Goal(s), Goal 1 Primary*
