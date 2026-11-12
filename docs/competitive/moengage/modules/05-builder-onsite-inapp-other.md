## 05. Engage > Campaign builder: On-site, In-app, Cards, Connectors, ad audiences & other channels

Storees covers this module in pieces rather than with a matching builder: an unlinked on-site opt-in popup (`/widgets`) with strong consent capture but one hard-coded layout and no audience targeting or analytics; an In-App channel that nothing renders (Send Now marks every recipient failed, and the pull API ignores saved segments, exclusions, holdouts and A/B); flow HTTP nodes and signed webhooks instead of Connector campaigns; and a hashed-CSV export plus a Meta-only Conversions API relay instead of ad-platform sync. The top gaps are an in-app renderer (P0) and an on-site builder with event triggers, audience targeting, a template gallery, styling, gamification and per-impression analytics (P1). Cards, MMS, RCS, Telegram/Line/Viber, voice and a native mobile in-app SDK don't exist, though most of these matter little for web-first Indian D2C.

### MoEngage overview

The New Campaign modal is the entry point for every channel in this module:

- **Outbound:** Push, Email, SMS, MMS and RCS, each a dropdown of delivery types.
- **A "Create a Campaign with Merlin Custom Agents" bar.**
- **Inbound:** In-app, On-site and Cards. These tiles open their builder directly, with no delivery-type step.
- **Messaging apps:** WhatsApp.
- **Audience:** Facebook and Google Ads.
- **Connector:** Custom, with One Time, Periodic and Event Triggered types.
- **All apps:** "See all" opens a Connected Apps catalogue. It has categories with counts (Custom apps, 4 Conversions, 3 Messaging apps, 8 Retargeting, 1 Voice calls), a search box and "paid add-on, Request access" tooltips.

On-site and In-app share one 3-step builder (same shell, audience, in-session attributes and template service):

- **Step 1, Target users:**
  - Platforms: Web / Mobile Web for on-site, Android / iOS for in-app.
  - Trigger tiles: page load, custom event or exit intent on web; session start, screen load or custom event in apps. A trigger time follows (Immediately or After Delay; on-site page load adds After Scroll).
  - Page or screen targeting, and an audience with nested filters, exclusions and Show count.
  - In-session attributes: query parameter, new or returning visitor, day, hour, country.
  - Global and campaign control groups.
- **Step 2, Content:**
  - A gallery of 78 templates: popups, nudges, full screens, surveys, countdowns, cart and recommendation popups, spin wheels and scratch cards.
  - Five editors: Native form, Drag & drop, HTML, no-code gamification and self-handled.
  - Merlin AI copy; A/B variations with an AI-optimised user distribution; locales; a personalised preview; test on device; UTM.
- **Step 3, Schedule and goals:** one-time or periodic schedules with a daily active window, conversion goals, a 5-level priority, and display controls (per-device show cap, minimum delay, auto-dismiss).

Custom connectors send a webhook per user (One Time, Periodic or Event Triggered). They have key-value URL parameters and headers, saved auth configurations, Form, JSON or Raw bodies, a test send, de-duplication by attribute and a requests-per-minute limit.

Capture coverage:

- **Locked or not configured:** Cards, MMS, RCS, Telegram/Line/Viber and the retargeting and conversion apps are paid add-ons; Facebook and Google Ads need an ad-account integration. Only their upsell pages, tooltips or "Integrate" toasts were captured.
- **On-site Steps 2-3 not captured:** the On-site builder auto-saved a server draft on the first click, so exploration stopped at Step 1. In-app Steps 2-3 stand in for them, since both builders load the same template endpoints. Some On-site Step 1 sub-options (exit-intent details, delay and scroll inputs, the Specific pages rule builder and URL tester) come from page text and app code.
- **Deliberately not opened:** Custom HTML and ZIP upload, Fetch user data, Test / Test Campaign / Publish, Integrate, I'm interested, Request access, Merlin Generate, + Create app, Merlin Custom Agents, Explore apps, Learn more links, the In-app iOS tab and the gamification Losing screen.
- **Side effect to clean up:** one On-site draft named "Untitled" (draftId `6af4767a7dabd118e6f5b85d`) was auto-saved in the MoEngage Test workspace. Remove it from All Campaigns > Drafts with a role that can open Drafts (the Developer role can't). Nothing else was saved.

| Page visited | URL path |
|---|---|
| New Campaign channel picker and Connected Apps modal | `/v4/campaigns/all` (Create campaign modal) |
| On-site builder, Step 1: Target users (only step captured) | `/v4/onsite/create/` |
| In-app builder, Step 1: Target users | `/v4/inapp/create/` |
| In-app builder, Step 2: template gallery and Start from scratch | `/v4/inapp/create/` (step 2) |
| In-app builder, Step 2: editors (Drag & drop, Native, Gamification, HTML, Self-Handled) | `/v4/inapp/create/` (step 2, after choosing a template) |
| In-app builder, Step 3: Schedule and goals | `/v4/inapp/create/` (step 3) |
| Cards (app inbox / news feed), locked | `/v4/create/card-campaign/` |
| Facebook and Google Ads audience sync, not configured | `/v4/campaigns/all` (Create campaign modal, Audience tiles) |
| Connector (custom webhook), One Time | `/v4/create/connector/one-time` |
| Connector (custom webhook), Event Triggered | `/v4/create/connector/event-trigger` |
| Connector (custom webhook), Periodic | `/v4/create/connector/periodic` |
| MMS, locked | `/v4/sms/create?type=one-time&message-type=mms` |
| RCS Native, locked | `/v4/sms/create?type=one-time&message-type=rcs` |

### Storees counterpart

- **Create Campaign panel** (`/campaigns`, `packages/frontend/src/app/(dashboard)/campaigns/page.tsx`):
  - One "Outbound" grid: Push, Email, SMS, WhatsApp, In-App (:57-63, :195).
  - One Time and Periodic cards; Event Triggered and Device Triggered are disabled "Soon" cards (:65-70).
  - No On-site, Cards, Connector or Audience entries.
- **In-App campaigns** (`/campaigns/create?channel=in_app`, `packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx`):
  - The shared 3-step wizard. Step 2 picks a saved In-App template (:2755-2794) and edits a body textarea.
  - In-App templates are built at `/templates/create` (`packages/frontend/src/app/(dashboard)/templates/create/page.tsx:382-496`): title, body, image URL, one CTA, position (modal, banner, toast, inbox), frequency, target pages and a static preview.
  - Serving: `GET /api/v1/in-app-messages` and `POST /api/v1/in-app-messages/:campaign_id/event` (`packages/backend/src/routes/v1InAppMessages.ts`). No SDK calls them; a repo-wide grep finds only the route file.
  - The endpoint returns the template's title, body (with `{{tokens}}` unrendered), image, CTA, position, frequency and target pages. It applies only the campaign's `audienceFilter` and the frequency preset.
  - Going live: a campaign is served once its status leaves `draft`. Send Now runs the normal dispatch (`packages/backend/src/services/campaignService.ts`). Dispatch stages only customers with an email (:577-585), then blocks each of them because `'in_app'` is passed where the reachability check expects `'inapp'` (:1038; `packages/backend/src/services/deliveryService.ts:459-491`). The campaign ends `sent` with 100% failed. If no customer has an email, dispatch throws and the campaign stays a draft that is never served.
- **On-site opt-in widgets** (`/widgets`, `packages/frontend/src/app/(dashboard)/widgets/page.tsx`):
  - Admin-only (`packages/backend/src/routes/optinWidgets.ts:10`) and not linked from the sidebar, settings or campaigns.
  - A single modal form: internal name, headline, body, button label, consent text, trigger (exit intent, N seconds, N% scroll, manual), path globs and toggles.
  - Public API: `GET /api/v1/widgets` and `POST /api/v1/optin` (`packages/backend/src/routes/v1OptIn.ts`).
  - Renderer: `packages/sdk/src/widget.ts`, started by the script-tag SDK (`packages/sdk/src/core.ts:131-135`).
  - Install: Settings > SDK & Integration offers a Script Tag and a Shopify tab (`packages/frontend/src/app/(dashboard)/settings/page.tsx:79-91, 234-247`). The Shopify tab installs only a Customer Events pixel (`packages/frontend/src/lib/shopifyPixel.ts`), which runs sandboxed and can't draw widgets. Shopify merchants who follow that tab get no popups.
- **Connector analogues:**
  - The flow "HTTP Request" node (`packages/frontend/src/components/flows/StructuredFlowBuilder.tsx:1234-1297`, `packages/backend/src/services/flowExecutor.ts:822-879`), after an event trigger or a fixed-time trigger (`packages/backend/src/workers/flowFixedTimeScheduler.ts`).
  - Settings > Webhooks for signed segment enter/exit events (`packages/frontend/src/app/(dashboard)/settings/webhooks/page.tsx`, `packages/backend/src/routes/webhookSubscriptions.ts`).
- **Ad analogues:**
  - Segments list > "Export to ads": a hashed CSV for Meta, Google, TikTok, Snap and Pinterest (`packages/frontend/src/components/segments/ExportAudienceButton.tsx`, `packages/backend/src/services/adAudienceExport.ts`).
  - Settings > Ad Conversions: a working Meta Conversions API relay and Google/TikTok/Snap stubs (`packages/frontend/src/app/(dashboard)/settings/ad-conversions/page.tsx`, `packages/backend/src/services/conversionApiService.ts`).
- **Not present:** a native mobile SDK, Cards / app inbox, MMS, RCS, Telegram/Line/Viber, voice and an integrations catalogue. `CampaignChannel` is `'email' | 'sms' | 'push' | 'whatsapp' | 'in_app'` (`packages/shared/src/types.ts:173`).

Short paths in the table: `campaigns/…`, `widgets/…`, `templates/…`, `settings/…` and `flows/…` are under `packages/frontend/src/app/(dashboard)/`; `routes/`, `services/`, `workers/` and `data/` are under `packages/backend/src/`; `sdk/src/` is `packages/sdk/src/`; `types.ts` is `packages/shared/src/types.ts`.

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Channel picker | Outbound tiles (Push, Email, SMS) with per-channel delivery types | OUTBOUND group: Push, Email, SMS (plus MMS, RCS), each a dropdown of delivery types (One Time, Periodic, Event Triggered). | 🟡 Partial | One 'Outbound' grid of Push, Email, SMS, WhatsApp, In-App (`campaigns/page.tsx:57-63`, :195); delivery types are separate cards, with Event Triggered and Device Triggered disabled 'Soon' (:65-70); `CampaignDeliveryType` is `'one-time' \| 'periodic'` (`types.ts:174`) | No event-triggered campaign type (users must build a flow), and channels aren't paired with their delivery types. Builder depth is scored in modules 02-03; for example, SMS campaigns send an empty body because the SMS provider renders the template body and SMS campaigns save no template (`twilioProvider.ts:7-16`). | P2 | S |
| Channel picker | Messaging apps: WhatsApp tile | MESSAGING APPS group with a WhatsApp dropdown. | ✅ Full | WhatsApp is an enabled channel in the same picker (`campaigns/page.tsx:61`); Step 2 picks an APPROVED template and maps variables (`campaigns/create/page.tsx:2301-2612`); sends go through Meta or Pinnacle (`deliveryService.ts`) | None for the tile. WhatsApp builder depth is scored in module 04. | — | — |
| Channel picker | Inbound group: In-app, On-site and Cards tiles that open their builders directly | INBOUND group with In-app, On-site and Cards tiles; a tile opens its builder with no delivery-type step. | 🟡 Partial | In-App sits under 'Outbound' and still needs One Time or Periodic (`campaigns/page.tsx:57-70`, :158-161). `/widgets` has no link: it isn't in the sidebar (`Sidebar.tsx:54-81`), the settings tabs or any campaign page (a frontend grep for `/widgets` finds only API calls). No Cards. The Shopify install tab gives only a Customer Events pixel (`settings/page.tsx:234-247`), which runs sandboxed and can't draw widgets; widgets need the script-tag SDK, and the tab doesn't say so | Add an Inbound group (In-App, On-site) that skips the delivery type and opens the builder; link `/widgets`; tell Shopify merchants to add the script tag (or ship a theme app embed) so on-site widgets can render. | P1 | S |
| Channel picker | 'Create a Campaign with Merlin Custom Agents' (an AI agent builds the campaign) | Pink bar in the New Campaign modal that starts campaign creation with Merlin AI custom agents. | ❌ Missing | Only separate AI pieces: natural-language segments (`routes/ai.ts:23`), email layout (:49), copywriter and campaign variations (:83, :166), WhatsApp template drafts (:129), and a Next Best Action card that opens `/campaigns/create` pre-filled (`NextBestActionCard.tsx:99-101`). `routes/agents.ts` manages dealer contacts, not AI agents | Chain the existing AI endpoints into an assistant that goes from a brief to audience, content and schedule and saves a draft campaign. | P2 | L |
| Connected apps | Connected Apps catalogue: categories with counts, search, Custom apps (+ Create app), 'paid add-on, Request access' | 'See all' opens Connected Apps: Custom apps (0), Conversions (4), Messaging apps (3), Retargeting (8), Voice calls (1), search, and 'Request access' tooltips. | ❌ Missing | No catalogue. Integrations are spread over Settings tabs (SDK & Integration, Ad Conversions, Webhooks; `settings/layout.tsx:12-26`), Settings > Channels providers (`settings/page.tsx:353-380`) and Projects > Data Sources; `/integrations` only redirects to `/projects`. No saved outbound 'custom app': each flow HTTP node is configured inline (`StructuredFlowBuilder.tsx:1234-1297`) | One searchable catalogue of channels and destinations with connection status. A 'custom app' would be a saved HTTP request template that flows and campaigns can reuse. | P2 | M |
| Connected apps | Conversions: Meta Ads Conversions API | Meta Ads Conversions tile under Conversions (paid add-on, Request access). | 🟡 Partial | Settings > Ad Conversions: pixel ID, encrypted token, test event code, status, sent/failed counters and Test (`settings/ad-conversions/page.tsx:17-22`, `routes/adConversions.ts`). Revenue events are relayed with hashed em/ph/fn/ln/external_id (`customerAggregateWorker.ts:221-243`, `conversionApiService.ts:104-178`). Events go out as `action_source: 'website'` with no `client_user_agent` or `event_source_url`, and the `event_id` can't match a browser pixel's | Meta documents user agent and source URL as required for website events, so relayed events may be rejected or flagged (check the Test action and Events Manager diagnostics), and purchases can be double-counted when the shop's Meta pixel or Shopify's Meta app also reports them. Capture user agent, IP, `_fbp`/`_fbc` and page URL with the cart (like `storees_sid`) and share event ids with the pixel. Built in, not a paid add-on. | P2 | S |
| Connected apps | Conversions: TikTok, Snapchat and Microsoft Ads Conversions | TikTok, Snapchat and Microsoft Ads Conversions tiles (paid add-ons). | ❌ Missing | TikTok (Events API) and Snap (CAPI) are 'coming soon' cards (`settings/ad-conversions/page.tsx:19-21`) and their relays throw 'not yet implemented' (`conversionApiService.ts:181-199`), as does Google Enhanced Conversions. Microsoft was not found | Implement the TikTok and Snap relays (same hashing as Meta) and add Microsoft. | P2 | M |
| Ad audiences | Facebook (Meta) custom audience sync | AUDIENCE > Facebook creates an audience-sync campaign once a Facebook Ad Account is integrated; otherwise a toast links to 'Integrate'. | 🟡 Partial | Segments list > 'Export to ads' > Meta Ads downloads a SHA-256 CSV (EMAIL, PHONE, FN, LN) to upload by hand (`ExportAudienceButton.tsx:15-23`, `routes/segments.ts:157`, `adAudienceExport.ts:42-55`); the service header calls Marketing API sync 'a follow-up' (`adAudienceExport.ts:9-20`). No ad-account connection, no refresh | Connect the ad account, create a custom audience from a segment and keep it updated as customers enter or leave it. The hashing already exists. | P1 | L |
| Ad audiences | Google Ads Customer Match sync | AUDIENCE > Google Ads (toast: 'Google Ads not connected, please connect to Google Ads. Integrate'). | 🟡 Partial | Hashed CSV with Google's column names (`adAudienceExport.ts:56-67`); phones are hashed as digits with the leading '+' removed (`adAudienceExport.ts:98-105`). No Google Ads API or OAuth; Enhanced Conversions is a stub (`conversionApiService.ts:181-187`) | User-list sync through the API (developer token + OAuth). Google's normalisation guidance asks for E.164 with '+' before hashing, so phone matches may be lost; test match rates. | P2 | L |
| Ad audiences | Other retargeting apps: Snapchat, Pinterest, TikTok, Criteo, Microsoft, Amazon, Reddit Ads Audience, Truecaller | Retargeting category with 8 apps, all paid add-ons with 'Request access'. | 🟡 Partial | Hashed CSV only, for TikTok, Snap and Pinterest, in a generic email/phone format (`adAudienceExport.ts:69-87`). Criteo, Microsoft, Amazon, Reddit and Truecaller audiences not found. The SDK's `truecaller` option is one-tap identity, not an audience (`sdk/src/core.ts:250-270`) | API sync for TikTok, Snap and Pinterest if customers ask. The others matter little for Indian D2C. | P3 | L |
| On-site: Target users | On-site builder shell: 3-step wizard, name and tags, Save as draft with autosave | Campaigns > On-Site > Create: Target users / Content / Schedule and goals, name and tags, 'Save as draft', and a server autosave on first interaction. | 🟡 Partial | A widget is one modal: name, headline, body, button, consent text, trigger, pages and toggles. 'Active' stands in for drafts; no tags, schedule or autosave; Cancel discards input; admin-only (`widgets/page.tsx:182-276`, `routes/optinWidgets.ts:10`, :80-112). The In-App channel uses the 3-step wizard with Save as draft, but nothing renders it (message-layouts row) | Move widgets into the campaign wizard, or a dedicated On-site builder, with drafts, tags and scheduling. | P1 | M |
| On-site: Target users | Target platforms: Web / Mobile Web | Required 'Target platforms' checkboxes: Web, Mobile Web. | 🟡 Partial | Widgets render wherever the script-tag SDK runs (`sdk/src/core.ts:131-135`); `WidgetConfig` has no device setting (`sdk/src/widget.ts:18-33`). The SDK already computes `device_type` (`sdk/src/context.ts:31-36`). Exit intent fires on desktop only (`widget.ts:120-131`) | Platform targeting based on the existing `device_type`. | P2 | S |
| On-site: Target users | On Page Load trigger with trigger time After Delay / After Scroll | On Page Load tile with 'Select trigger time': Immediately / After Delay / After Scroll. | ✅ Full | 'After N seconds on page' (1-600 s) and 'After N% scroll depth' (1-100%), validated on create and armed by the SDK (`widgets/page.tsx:222-239`, `routes/optinWidgets.ts:29-45`, `sdk/src/widget.ts:93-118`) | None in timing. Trigger and timing share one dropdown, so a delay or scroll threshold can't be combined with exit intent. `/widgets` is unlinked (Inbound row). | — | — |
| On-site: Target users | Trigger time 'Immediately' after page load | Immediately: 'shown immediately after page load is complete'. | 🟡 Partial | No zero delay: `time_on_page` must be 1-600 s (`routes/optinWidgets.ts:36-39`, `widgets/page.tsx:230-233`); 1 s is the closest | Allow 0 s (Immediately). | P3 | S |
| On-site: Target users | On custom event trigger (Has Executed `<event>` + Trigger/Filter; show Immediately or After Delay) | 'If user performs Has Executed `<event>`' with + Trigger / + Filter, then show Immediately or After Delay; server-side events not supported. | 🟡 Partial | Widgets have no event trigger, only 'Manual', called from site code as `Storees('widget','show',name)` (`sdk/src/widget.ts:71-91`, `sdk/src/core.ts:158-163`). In-App campaigns have no trigger: the endpoint returns every eligible message (`routes/v1InAppMessages.ts:44-184`) | A no-code event trigger: WidgetManager listens to SDK `track()` calls and matches an event name, property filters and a delay. The manual API is a developer stopgap. | P1 | S |
| On-site: Target users | On Exit Intent trigger | On Exit Intent: 'When the user tries to leave the page.' | ✅ Full | 'Exit intent (mouse leaves top)' trigger (`widgets/page.tsx:224`, `sdk/src/widget.ts:120-131`) | None on desktop. It relies on mouseleave, so it never fires on mobile web, where most Indian D2C traffic is (whether MoEngage's tile covers mobile web wasn't captured). | — | — |
| On-site: Target users | Select pages: All / Specific pages with URL operators, include/exclude and a 'Check page targeting' tester | All pages or Specific pages: 12 operators (is, contains, starts with, does not end with...), several URLs per condition, and a URL tester. | 🟡 Partial | Widget 'Target pages' is a textarea of path globs: include-only, `*` wildcard, matched against `location.pathname` (`widgets/page.tsx:242-250`, `sdk/src/widget.ts:154-163`). In-App `inAppTargetPages` is saved but the server doesn't enforce it and no SDK reads it (`templates/create/page.tsx:452-461`, `v1InAppMessages.ts:166-178`). No excludes, operators, query or host matching, or tester | An include/exclude rule builder with operators and a URL tester. | P2 | S |
| On-site: Target users | Target audience: All users / Filter users by property, behavior, affinity or segment; nested filters; Exclude users; Show count | All users or filters (User property, User behavior, User affinity, Custom segment), Nested Filter, Exclude Users, Reset filters, Show count; real-time evaluation. | 🟡 Partial | Widgets have no audience: `GET /api/v1/widgets` returns every active widget (`routes/v1OptIn.ts:23-59`). In-App reuses the wizard audience (All / Saved segment / Custom filter with nested groups, exclusion, cap, preview; `campaigns/create/page.tsx:1221-1329`), but the endpoint evaluates only `audienceFilter` (`v1InAppMessages.ts:153-161`) and never reads `segmentId`, exclusions, cap or holdouts. A saved-segment campaign stores `segmentId` with a null filter (`campaigns/create/page.tsx:615`, `routes/campaigns.ts:217,251`), so it is served to every identified customer and to anonymous visitors (`v1InAppMessages.ts:61-82`). The audience preview counts only customers with an email as reachable for in-app (`campaignService.ts:267-271`). No affinity filter | Add segment and filter targeting to widgets. Make the endpoint honour `segmentId`, exclusions and holdouts; fix the segment leak before any renderer ships. | P1 | M |
| On-site: Target users | In-session attributes: Query Parameter (15 operators, case-sensitive) and User Type (New / Returning) | In-session rows: Query Parameter (name, operator, value, Case Sensitive) and User Type (New, Returning). | ❌ Missing | Widget matching uses the pathname only (`sdk/src/widget.ts:154-163`) and `WidgetConfig` has no session conditions (:18-33). The SDK already captures UTM parameters and session starts (`sdk/src/autotrack.ts:50-53`, :86-113, :306-330), but nothing targets on them | Client-side session conditions: URL/UTM query-parameter rules and new vs returning visitor. | P1 | S |
| On-site: Target users | In-session attributes: Day of the week, Time of the Day, GeoLocation (country) | Day of the week, hourly Time of the Day buckets, GeoLocation 'in the following `<country>`'. | ❌ Missing | No time-window or geo conditions for widgets or in-app (`sdk/src/widget.ts:18-33`, `v1InAppMessages.ts:137-164`). The SDK sends only browser timezone and language (`sdk/src/context.ts:46-56`); no IP geolocation in the backend (searched geoip, maxmind, cf-ipcountry) | Day-of-week and hour-of-day windows, and targeting by IP country. | P2 | M |
| On-site: Target users | Campaign control group | Control group card with a Campaign control group toggle. | 🟡 Partial | The wizard has a 1-50% deterministic sha256 holdout with a lift card (`campaigns/create/page.tsx:1371-1424`, `campaignService.ts:60-70`, :663-699). The in-app endpoint ignores it, so holdouts are still served (`v1InAppMessages.ts:137-164`); widgets have none | Apply the holdout in `/v1/in-app-messages` and in widgets, and report lift. | P2 | S |
| On-site: Target users | Global control group | Global control group toggle (none was defined in the test workspace). | ❌ Missing | No matches for global control, globalControl, global_control or universal holdout; only per-campaign holdouts (`campaignService.ts:60-70`) | A project-wide holdout excluded from all campaigns and flows. | P2 | M |
| On-site: Content | Brand Book kit styling applied to templates | 'Brand Book kit' styling applied to on-site templates (seen in app code, not verified in the UI). | 🟡 Partial | `/settings/brand` stores logo, colours and slogan, auto-filled from Shopify or the website (`settings/brand/page.tsx`, `brandKitService.ts`); used as template tokens and email/recommendation accents (`templateContext.ts:128`, `campaignService.ts:958`). The widget hard-codes a white card and a `#4F46E5` button (`sdk/src/widget.ts:181-217`), although its header comment says colours come from the config; in-app templates have no style fields | Apply the brand colours, logo and font to widgets and in-app layouts. | P2 | S |
| On-site: Content | 'Request for a template' | Request-a-template option in the on-site template flow (seen in app code). | ❌ Missing | No template-request flow in the frontend (searched request.{0,10}template) | Low value; a support link is enough. | P3 | S |
| On-site: Content | Per-account cap on On-site campaigns | 'Your account has already created N campaigns for On-Site. Please archive some...' (seen in app code). | ➖ N/A | A MoEngage quota, not a user need. Storees caps templates by plan instead (`routes/templates.ts:320-325`) | None. | — | — |
| In-app (mobile) | Native mobile in-app: Android and iOS; triggers On session start, On screen load, On custom event; Immediately or After N seconds | In-app Step 1 with Android/iOS platforms, three trigger tiles and Immediately / After Delay timing. | ❌ Missing | No Android, iOS or Flutter SDK: `packages/sdk` is a browser SDK and `packages/sdk-react` web bindings. Storees 'In-App' is a storefront message (`templates/create/page.tsx:384-387`); 'Device Triggered (On app open)' is a disabled card (`campaigns/page.tsx:69`); apps get server-side FCM push only (`docs/GWM_PUSH_INTEGRATION.md`) | A native or Flutter SDK with in-app rendering. Relevant only for brands with apps, such as GWM. | P3 | XL |
| In-app (mobile) | Screen / in-app context targeting (Any screen / Specific screens; 'Screen is any of'; 'App context is any of') | Per-platform screen and app-context conditions, up to 5 screens; the app must call showInApp() or showNudge(). | ➖ N/A | Needs a native SDK that tracks screens; none exists. The web equivalent is page targeting (Select pages row) | Covered by the native mobile row. | — | — |
| In-app (mobile) | SDK version requirements shown in the UI | Notes such as 'needs In-app Android SDK 9.0.0 / iOS SDK 6.06.0'. | ➖ N/A | Native SDK versions; Storees has no mobile SDK | None. | — | — |
| In-app (mobile) | Template Settings: orientation, device types (Mobile / Tablets / TV OS); Android/iOS tabs with 'Mirror platforms' | Template Settings card plus per-platform tabs with a Mirror platforms toggle. | ➖ N/A | Native-app rendering options; no mobile SDK. Web platform targeting is the Target platforms row | Covered by the native mobile row. | — | — |
| On-site/In-app: Content | Message layouts (Full screen / Pop up / Nudge) rendered on the client | Templates by type: Full Screen (23), Pop Up (37), Nudge (15), rendered by the SDK. | 🟡 Partial | Widgets render one centred modal (`sdk/src/widget.ts:167-225`). In-App templates save modal, banner, toast or inbox (`templates/create/page.tsx:420-438`, `types.ts:450`), but no SDK renders in-app messages: a repo-wide grep for `in-app-messages` finds only the route. The endpoint serves the template body with `{{tokens}}` unrendered, not the campaign's body (`v1InAppMessages.ts:66-67`, :166-178). Send Now stages only customers with an email (`campaignService.ts:577-585`) and blocks every one, because `'in_app'` is passed where reachability expects `'inapp'` (`campaignService.ts:1038`, `deliveryService.ts:459-491`); with no email-holders, dispatch throws and the campaign stays an unserved draft | Ship an SDK renderer for modal, banner, toast and full screen that fetches `/v1/in-app-messages` and posts shown, dismissed and clicked; render tokens server-side; fix the channel mismatch. Until then, hide the In-App channel or label it clearly. | P0 | M |
| On-site/In-app: Content | Pre-built template gallery with filters (Type, Vertical, Use case, Content, Editor), search, Pre-built vs Saved | 78 pre-built templates, a filter rail with counts, search, All / Pre-built / Saved, hover 'Select template' with live preview. | ❌ Missing | No pre-built in-app or on-site templates: the seeds are email 14, SMS 10, push 10, WhatsApp 8, in-app 0 (`backend/src/data/seedTemplates.ts`); widgets have none. Saved in-app templates appear in Templates (In-App tab and search, `templates/page.tsx:35`, :69-90) and as a plain list in campaign Step 2 (`campaigns/create/page.tsx:2755-2794`) | A gallery of D2C popups (discount, exit offer, sign-up, cart, recommendation) with use-case filters and hover preview. | P1 | M |
| On-site/In-app: Content | SMS sign-up unit (phone capture with consent) | 'Fullscreen - SMS Sign-up Unit with image' and 'Popup - SMS Sign-up Unit without image'. | ✅ Full | Opt-in widget: phone (required by default), optional name and email, mandatory consent text, honeypot, 5 submissions per IP per hour, +91 normalisation; records WhatsApp (and email) promotional consent with the exact text and IP and emits `optin_received` (`widgets/page.tsx:204-259`, `sdk/src/widget.ts:201-282`, `routes/v1OptIn.ts:81-222`) | Captures WhatsApp and email consent rather than SMS, which suits India. Fixed layout (styling row). | — | — |
| On-site/In-app: Content | E-commerce use-case popups: cart abandonment, product recommendation, sale/offer, countdown, feature announcement | 'Cart abandoned Popup', 'Product Recommendation Popup', 'Sale Popup', 'Offer Popup', 4 countdown timers, feature announcements. | ❌ Missing | No such templates or elements; the widget renders only the opt-in form. The building blocks feed only email and WhatsApp: recommendations (`decisioningService.ts`) and the Shopify cart bridge (`sdk/src/shopifyCart.ts`) | Cart-recovery and recommendation popups fed by decisioningService, and a countdown element. | P1 | M |
| On-site/In-app: Content | Surveys and feedback: radio and multi-screen surveys, NPS slider, emoji or star rating, text box | Survey Popup templates (Emoji and Text Box, Radio Buttons with Emoji, Multi Screen, NPS Slider), emoji-rating nudge, Feedback Popup. | ❌ Missing | survey, nps and rating appear only as lifecycle tactic labels (`segments/src/lifecycle.ts:135-137`) and an email seed's star-rating visual (`seedTemplates.ts:409`); no survey widget or response capture | A survey/NPS widget that stores answers as events or attributes. | P2 | M |
| On-site/In-app: Content | No-code gamification: spin wheel and scratch card (win %, sectors, coupon per sector, winning/losing screens) | Spin wheel / Winning screen / Losing screen tabs and a sectors table (win %, title, colours, coupon code, lose option); 6 wheels and 4 scratch cards in the gallery. | ❌ Missing | No spin, wheel, scratch or gamification code. No coupon pool: codes are a fixed value or an event-payload field bound to a WhatsApp COPY_CODE button (`SendNodeConfigModal.tsx:56`, :104; `whatsappUtils.ts:93-96`) | A spin-wheel or scratch-card widget with weighted sectors, per-sector codes and lead capture, backed by a coupon pool (e.g. Shopify discount codes). | P1 | L |
| On-site/In-app: Content | Lead-generation form: field styling, custom fields (Email, Text, Date, Number, Telephone, DateTime), placeholder, attribute mapping, Required, + Terms & conditions | 'Lead generation customisation' in the gamification editor: field size, type, font, background, border, and fields mapped to user attributes. | 🟡 Partial | Fixed fields: Name and Email toggles, Phone with a 'Phone required' toggle, and a mandatory consent checkbox (`widgets/page.tsx:252-257`, `sdk/src/widget.ts:204-218`); values map to name, email and phone (`v1OptIn.ts:131-154`). The server rejects any submission without a phone (`v1OptIn.ts:131-134`), so turning 'Phone required' off doesn't allow email-only sign-ups. No custom fields, types, placeholders, attribute mapping or styling | A configurable field list mapped to custom attributes, with styling; honour 'Phone required'. | P2 | M |
| On-site/In-app: Content | Start from scratch: Drag & drop editor (blank) | Beefree-style editor in a phone frame: CONTENT blocks (Title, Paragraph, Image, Button, HTML, Video, Form...), ROWS, SETTINGS. | ❌ Missing | The block builder is email-only (`components/email-builder/EmailBuilder.tsx`); in-app templates and widgets are forms (`templates/create/page.tsx:382-461`, `widgets/page.tsx:203-259`) | Adapt the EmailBuilder blocks to output an on-site overlay. | P2 | L |
| On-site/In-app: Content | Start from scratch: Custom HTML upload and ZIP upload (Create pop up / Create nudge) | Upload tiles for your own HTML or a ZIP of template files. | ❌ Missing | No HTML or ZIP upload for in-app or on-site; the non-email template editor is a textarea (`templates/create/page.tsx:505-549`); asset routes accept email images, WhatsApp media and call transcripts only (`routes/assets.ts:82`, :143, :176) | HTML or ZIP popup upload, rendered in a sandbox. | P2 | M |
| On-site/In-app: Content | Start from scratch: Self-Handled (custom string or JSON the app renders) | Self-Handled content box passing a custom payload for the app to render. | 🟡 Partial | With no renderer, `GET /api/v1/in-app-messages` is self-handled in practice: structured JSON (title, body, imageUrl, ctaLabel, ctaUrl, position, frequency, targetPages) for a developer to render (`v1InAppMessages.ts:166-178`). No free-form payload field | A custom JSON payload field for developer-rendered messages. | P3 | S |
| On-site/In-app: Content | Content step shell: Save / Change / Reset template with confirmation; live preview with Copy HTML | Template kebab, a change-template confirmation, and a live phone preview with Copy HTML and portrait/landscape. | 🟡 Partial | In-app Step 2 is a saved-template list plus a body textarea (`campaigns/create/page.tsx:2755-2865`); no in-app preview (the preview card is push/SMS only, :2928) and no save-as-template. The Templates editor has a static position preview (`templates/create/page.tsx:464-496`); the edit page changes only name and body for in-app (`templates/[id]/edit/page.tsx:97-111`). Campaign body edits are never served (`v1InAppMessages.ts:66-67`) | A live layout preview in the campaign step, save and reset template, full in-app template editing, and serving the campaign's own content. | P2 | S |
| On-site/In-app: Content | Native editor styling: background, entry/exit animation, close button, border, image widget, buttons (Filled / Outlined / Text, font, colours) | Accordion editor (Template settings / Image / Buttons): 14 close-button styles, 6 animations, borders, image and button styling. | 🟡 Partial | In-app fields are title, body, image URL, one CTA label and URL, position, frequency and pages (`templates/create/page.tsx:215-221`, :382-461); no colours, fonts, animation, close-button options, borders or extra buttons. Widget styling is hard-coded inline CSS (`sdk/src/widget.ts:174-217`) | Style controls for widgets and in-app layouts: colours, font, radius, close button, animation and multiple buttons. | P1 | M |
| On-site/In-app: Content | Click actions: Navigation (URL, deep link, rich landing, key-value pairs) and Dismiss | Navigation and Dismiss actions, several per element (+ Action). | 🟡 Partial | In-app templates have one CTA URL, and the event API records `cta_clicked` and `dismissed` (`templates/create/page.tsx:400-418`, `v1InAppMessages.ts:188-240`), but nothing renders them. Widgets have only Submit and Close (`sdk/src/widget.ts:188-199`, :229-282). One action per element, no key-value pairs | Actions per button, several per element. | P2 | M |
| On-site/In-app: Content | Click actions: Track Event and Set User Attribute | 'Track Event' and 'Set User Attribute' actions. | 🟡 Partial | Only via the opt-in form: a submission resolves the customer, sets name, email and phone, and emits `optin_received` (`routes/v1OptIn.ts:148-215`). Buttons have no such actions | Generic track-event and set-attribute button actions. | P2 | S |
| On-site/In-app: Content | Click actions: Copy Coupon Code, Share, Call, SMS, Custom Action, Request Notification Permission, Navigate to notification settings | The rest of the widget action list. | ❌ Missing | None in `widget.ts` or the in-app fields. Copy-code exists only on WhatsApp templates (`whatsappUtils.ts:93-96`). No web push in `packages/sdk/src` (no service worker or permission prompt) | Copy coupon code matters most for D2C; the permission prompt depends on web push. | P2 | M |
| On-site/In-app: Content | Merlin AI copy generator | 'Generate content using Merlin AI': use case, keywords in/out, audience, tone, character limit, persona, language, personalization, coupon, emoji; Generate; 'Select this'. | 🟡 Partial | In-app Step 2 has 'Generate with AI' (`AiCopywriterPanel`, which treats in-app as push; `campaigns/create/page.tsx:2743-2753`) and `CampaignAiCopywriter` with the same brief fields except a character limit, returning 3 variations (`CampaignAiCopywriter.tsx:35-160`, `routes/ai.ts:166`). Applied copy goes into the campaign body, which the endpoint never serves (`v1InAppMessages.ts:66-67`). Widgets have no AI | Add a character limit, serve the campaign body, and add AI to widgets. | P2 | S |
| On-site/In-app: Content | A/B testing: variations with a % split ('+ A/B test': Copy / New Variation) | Variation tabs: Variation 1 (50%) / Variation 2 (50%) / + Variation. | 🟡 Partial | `AbTestSection` renders for in-app and saves variant B with a 10-90% split (`campaigns/create/page.tsx:919-931`, :2995+), but the endpoint ignores every A/B field (`v1InAppMessages.ts:92-110`). Widgets have none. Two variants at most | Serve variants deterministically from the endpoint and in widgets, and report results per variant. | P2 | M |
| On-site/In-app: Content | User distribution: 'Dynamically using Merlin AI' vs Manual; objective; control group in the split | Drawer with objective, AI-optimised or manual split, + Campaign control group, reset. | ❌ Missing | Manual splits only (campaign A/B slider, flow `ab_split` weights). `abAutoSendWinner` is saved and copied but nothing acts on it (`schema.ts:463`, `routes/campaigns.ts:248`, `campaignService.ts:1355`). No bandit code (searched bandit, thompson, auto-optimi) | Performance-based (bandit) allocation. | P3 | L |
| On-site/In-app: Content | Locale variants ('+ Locale', + New Locale) | Locale menu for per-locale content. | ❌ Missing | No locale variants for in-app, widgets, email, SMS or push; only WhatsApp falls back to a same-name template in the customer's language (`deliveryService.ts:238-266`). Widget copy is single-language | Locale variants (e.g. Hindi, Tamil) chosen by customer language or browser locale. | P2 | M |
| On-site/In-app: Content | Personalized preview: pick a user, Fetch user data, Update preview | Preview page with 'User for preview', Fetch user data and Update preview per variation. | 🟡 Partial | Templates 'Test with sample customer' renders with a sample customer; the API accepts `sampleCustomerId` but the panel has no picker (`VariablePanel.tsx:142-155`, `routes/templates.ts:125-140`). Campaign Step 2's sample dropdown (20 most recent) is push/SMS only (`campaigns/create/page.tsx:2712-2716`, :2928-2953). No in-app or widget preview; tokens aren't rendered when served | A preview that can search any customer, and server-side token rendering for in-app. | P2 | S |
| On-site/In-app: Content | Test on device ('Preview in-app' / Test Campaign by identifier type) | Locale and variation selector, identifier type (Unique ID, Email, Mobile, GAID, IDFA, push token, segment), value, Test. | ❌ Missing | No test send for in-app or widgets; widgets have a static preview modal (`widgets/page.tsx:278-298`). Test sends exist for email (`routes/campaigns.ts:698`) and WhatsApp templates (`routes/whatsappAdmin.ts:546`) only | Force-show a message for one visitor, e.g. with a preview query parameter. | P2 | S |
| On-site/In-app: Content | UTM parameters (source, medium, campaign, term, content, custom) | UTM toggle with defaults and '+ Create custom parameter'. | 🟡 Partial | UTM works for email, SMS and push. The Link Tracking block renders in the in-app step, but in-app is excluded on save (`supportsLinkTracking`, `campaigns/create/page.tsx:429`, :604, :2875-2925) and the endpoint doesn't touch `ctaUrl`. Widgets have no outbound link | Append UTM to in-app CTA URLs; hide the block until that works. | P2 | S |
| On-site/In-app: Content | HTML code editor: code view, sample templates, file upload, Merlin AI edits, JS bridge (trackClick, trackEvent, setUserAttribute, dismiss) | HTML template editor with Code View, sample templates, Upload files, Clear and a Merlin AI coachmark. | ❌ Missing | No code editor for in-app or on-site; the email builder's Code view is read-only (`EmailBuilder.tsx:442-449`). No JS bridge in `packages/sdk/src` (searched trackClick, dismissMessage) | HTML popups with a small bridge API for tracking, setting attributes and dismissing. | P2 | M |
| On-site/In-app: Schedule & delivery | One-time schedule: As soon as possible / specific date and time, time zone, Ends Never / On | One Time (ASAP or a date and time), time zone, Ends Never/On. | 🟡 Partial | In-app campaigns get the wizard's ASAP / Fixed / User's timezone / Best time (`campaigns/create/page.tsx:3353-3356`). The endpoint checks only `scheduledAt <= now` and has no end ('campaigns don't carry endsAt yet', `v1InAppMessages.ts:52-59`, :98). Widgets have only an Active toggle (`widgets/page.tsx:258`) | Start and end dates for in-app messages and widgets (e.g. sale-week popups). | P1 | S |
| On-site/In-app: Schedule & delivery | Periodic (Daily / Weekly / Monthly) with a daily active window and 'next sent on' preview | Repeat every N days/weeks/months, a daily active window (start/end time), next-send preview, Reset to defaults. | ❌ Missing | Periodic exists for message campaigns (`campaigns/create/page.tsx:3264-3348`), but the endpoint has no time windows and widgets no schedule. A periodic in-app campaign's re-dispatch deletes its `campaign_sends` (`campaignScheduler.ts:93-110`), wiping shown/dismissed history. No hours-of-day window anywhere | Recurring display windows (e.g. 6-10 pm daily). | P2 | S |
| On-site/In-app: Schedule & delivery | Conversion goals (up to 5; event and attributes; revenue; tracked N hours from impression or click) | Goal name, event, attributes, revenue toggle; 'Track above goals for 36 hours from user's campaign impression/clicks'. | 🟡 Partial | Wizard goals are rich: several goals, primary goal, revenue, filters, window, any/view-through/click-through attribution (`campaigns/create/page.tsx:3389-3514`, `campaignAnalyticsService.ts:120-223`). But the window starts at `campaign.sentAt`, not each impression (`campaignAnalyticsService.ts:129-136`), which breaks for always-on messages. In-app events update `campaign_sends`, not campaign counters (`v1InAppMessages.ts:214-233`). Widgets record no impressions (only `optin_received`), so there is no view-to-sign-up rate | Per-impression attribution for in-app and on-site; impression, submission and conversion analytics for widgets. | P1 | M |
| On-site/In-app: Schedule & delivery | Campaign priority (Critical / High / Medium / Normal / Low) | Higher priority wins when two campaigns are eligible; on a tie the newest wins. | ❌ Missing | No priority in the schema, campaign routes, wizard or endpoint; the endpoint returns all eligible messages unordered (`v1InAppMessages.ts:140-178`) | A priority setting, newest wins ties. | P2 | S |
| On-site/In-app: Schedule & delivery | Delivery controls: max shows per device, minimum delay between messages, ignore global minimum delay, auto-dismiss after N seconds | Defaults: 1 show per device, 15-minute delay, auto-dismiss after 60 seconds. | 🟡 Partial | Coarse presets only: in-app frequency once / daily / always until dismissed (`templates/create/page.tsx:440-450`, `v1InAppMessages.ts:141-151`); widget 'Show once per visitor' in localStorage, set only on close or submit (`sdk/src/widget.ts:137-152`). No N-show cap, cool-down, cross-message minimum delay or auto-dismiss. Step 3's frequency-cap and request-limit controls do nothing for in-app, and 'Currently set as 1 In-App in 1 day' is hard-coded text (`campaigns/create/page.tsx:3516-3555`) | Show cap, cool-down, minimum delay across messages, auto-dismiss. | P2 | S |
| Cards | Cards (app inbox / news feed of persistent cards) | Locked paid add-on; upsell tabs High Engagement, Customize As Needed, Higher Reach, Non-intrusive Messaging. | ❌ Missing | Only an enum value: the in-app position includes `inbox` (`types.ts:450`), offered as a Position button (`templates/create/page.tsx:420-438`). No feed API, card store, expiry, pinning or renderer | A persistent message feed; low priority for web-first D2C. Hide the 'Inbox' position until it exists. | P3 | L |
| Connector | Custom connector in the picker with One Time / Periodic / Event Triggered | CONNECTOR > Custom dropdown with One Time, Periodic and Event Triggered cards. | 🟡 Partial | No connector channel in the picker (`campaigns/page.tsx:57-63`); `CampaignChannel` has no webhook value (`types.ts:173`). Outbound HTTP exists as the flow 'HTTP Request' node (`StructuredFlowBuilder.tsx:235`, :330) after an event or fixed-time trigger (`types.ts:578-602`), but a fixed-time flow built in the UI enrols nobody (Periodic webhook row). No one-time broadcast | A Connector entry that opens a flow with an HTTP node (event or periodic) or a one-time webhook campaign. | P2 | S |
| Connector | One Time webhook campaign to an audience (audience, exclusions, control groups; ASAP or scheduled) | Step 1 Target users; Step 2 API request; Step 3 send time, goals, de-duplication, delivery controls, request limit; Publish. | ❌ Missing | No way to call a webhook once per segment member: no webhook campaign channel (`types.ts:173`), fixed-time flows only recur, and Settings > Webhooks sends only segment entered/exited events (`hooks/useWebhooks.ts:42-47`) | A one-time webhook campaign reusing campaign staging and the flow HTTP executor. | P2 | M |
| Connector | API request builder: Method, URL with personalization, URL Parameters (KV), Headers (KV), body Form / JSON / Raw | GET/POST/PUT/DELETE; URL with '@' personalization; KV URL parameters and headers; Form, JSON (auto Content-Type) or Raw body. | 🟡 Partial | HTTP node: GET/POST/PUT/PATCH/DELETE, URL, header rows, raw JSON body, 'Save response as' (`StructuredFlowBuilder.tsx:1234-1297`); `{{token}}` substitution of customer id/email/phone/name/external id, event properties and earlier node outputs (`flowExecutor.ts:829-856`). No URL-parameter rows, Form/JSON KV bodies or custom-attribute tokens. Content-Type defaults to JSON, overridable by a header row (`flowExecutor.ts:852-855`). No SSRF check: `assertPublicUrl` (`services/ssrfGuard.ts`) guards webhooks and data connectors but not this node | Query-parameter rows, Form and JSON KV bodies, custom-attribute tokens; call `assertPublicUrl` before exposing the node more widely. | P2 | S |
| Connector | Authorization settings (saved configurations from Settings > Authorization Configuration) | 'Enable authorization settings' > Select authorization setting (none existed in the test workspace). | 🟡 Partial | The HTTP node has headers only. Settings > Webhooks supports HMAC or Bearer with an encrypted secret (`settings/webhooks/page.tsx:123-215`, `routes/webhookSubscriptions.ts`); data connectors keep bearer / API-key / basic auth specs (`services/connectors/genericHttpConnector.ts:8-12`). Neither is reusable by flows | Saved auth configurations (Bearer, Basic, API key, OAuth) that HTTP nodes can select. | P2 | S |
| Connector | Test campaign (send a test request for a user by identifier type) | 'Test campaigns ignore frequency capping', identifier type, value, Test. | 🟡 Partial | No test action in the HTTP node or the flows API (`StructuredFlowBuilder.tsx:1234-1297`, `routes/flows.ts`). Settings > Webhooks has Test plus a deliveries log with request, response and resend (`settings/webhooks/page.tsx`, `routes/webhookSubscriptions.ts:223`) | A 'Send test' in the HTTP node for a chosen customer that shows the response. | P2 | S |
| Connector | Remove duplicate users by a duplicate key (any user attribute) | 'Remove duplicate users' with a duplicate key picked from user attributes. | ❌ Missing | No de-duplication by attribute in `campaignService.ts` or flows (searched dedupe, dedup, duplicate key); recipients are unique per customer only | Remove duplicates by an attribute before dispatch. | P3 | S |
| Connector | Webhook delivery controls: request limit (rpm), ignore/count frequency capping, 'All users' warning, conversion goals | 'Limit to 60000 requests per minute' (max 200,000), frequency-capping toggles, All-users warning, goals. | 🟡 Partial | Message campaigns have a requests-per-minute limit, frequency-cap toggles and goals (`campaigns/create/page.tsx:3516-3555`, `campaignService.ts:801-802`). The HTTP node fires once per trip immediately, 10 s default / 30 s max timeout, no rate limit (`flowExecutor.ts:822-879`). No 'All users' warning | A per-node rate limit to protect partner APIs, and a warning when all users are targeted. | P2 | S |
| Connector | Event Triggered: primary and alternate trigger events, secondary event, then Immediately / With Delay (After, If Action) | 'If user performs' primary event(s) plus alternates, + secondary event, then Immediately or With Delay N days After / If Action. | 🟡 Partial | A flow covers the pattern: event trigger with property filters (`StructuredFlowBuilder.tsx:1321-1338`), delay, 'Has Done Event' condition (:1009, `flowExecutor.ts:473`) and HTTP node. One trigger event per flow (`TriggerConfig.event` is a string, `types.ts:595`). `inactivityTime` and the trigger `audienceFilter` are declared (`types.ts:597-598`) but the builder exposes neither and nothing reads `inactivityTime` | Several (OR) trigger events per flow. | P2 | S |
| Connector | Event Triggered Step 3: active continuously with start/end, goals, minimum delay, Ignore DND, frequency capping | 'Active continuously' with start and end date/time and time zone; goals; minimum delay (hours), Ignore DND, Ignore/Count frequency capping. | 🟡 Partial | Flows have draft / active / paused and one goal event (`types.ts:410-423`, :616-619), no start or end dates. No DND or quiet hours (only a docstring, `deliveryService.ts:27`). HTTP nodes bypass frequency caps | A start/end window for flows, and DND or quiet hours (affects every channel). | P2 | M |
| Connector | Periodic webhook: Daily / Weekly / Monthly, start date, send time, repeat every N, Ends Never / On / After, next-send preview | Periodic Step 3 schedule plus goals, de-duplication and delivery controls. | 🟡 Partial | Fixed-time trigger: daily, weekly or monthly at HH:mm on a chosen day (`StructuredFlowBuilder.tsx:1383-1420`, `workers/flowFixedTimeScheduler.ts`). The scheduler enrols only `triggerConfig.audienceFilter` and refuses when it is empty (`flowFixedTimeScheduler.ts:51-55`), but the builder never sets it (the trigger node's config is saved as `triggerConfig`, `flows/[id]/page.tsx:33`), so a fixed-time flow built in the UI never fires. Time is UTC only (`flowFixedTimeScheduler.ts:24-29`). No repeat interval, end condition or next-run preview | Add an audience picker to the fixed-time trigger (and block activation without one), a time zone, a repeat interval, end conditions and a next-run preview. | P2 | S |
| Other channels | MMS | Locked upsell (rich media, longer messages, personalised visuals); US, Canada and Australia only. | ❌ Missing | No MMS channel or provider; SMS providers send text only (`services/providers/index.ts:25-29`) | Little relevance for India-focused D2C. | P3 | M |
| Other channels | RCS Native (SMS only / RCS only / RCS with SMS fallback; no-code rich-card carousel editor) | Locked upsell: Intelligent SMS Fallback, No Code Editor, Smart Targeting, Cross-Channel by Design. | ❌ Missing | No RCS channel or provider (`services/providers/index.ts:17-43`). Settings > Channels lists Pinnacle as 'SMS + RCS messaging with rich media' (`settings/page.tsx:373`), but neither a Pinnacle SMS nor an RCS provider is registered, so choosing Pinnacle for SMS resolves no provider (`channelProviderRegistry.ts:194-198`) | RCS through Pinnacle or Google RBM with SMS fallback, reusing the WhatsApp carousel authoring. Remove the RCS label and the Pinnacle SMS option until they ship. | P2 | L |
| Other channels | Telegram, Line and Viber messaging apps | Tiles under ALL APPS and Messaging apps; paid add-ons with 'Request access'. | ❌ Missing | No matches for telegram, viber or line messaging | Only Telegram has some relevance in India. | P3 | M |
| Other channels | Voice calls (Deepgram) | Connected Apps > Voice calls (1): Deepgram. | 🟡 Partial | No voice channel; only call-recording or transcript uploads for abandonment notes (`routes/assets.ts:38-50`, :174-200). A flow HTTP Request step can call a voice provider's API, such as Exotel's (`flowExecutor.ts:822-880`; module 25) | Only as a hand-built flow step, with no call outcomes or campaign use. AI voice calls (e.g. COD confirmation) would need telephony and speech providers. | P3 | L |

### Storees-only strengths

- **Consent capture built into the on-site opt-in widget.** Consent text is mandatory, with a DPDP / Meta-quality hint (`widgets/page.tsx:217-219`). Each opt-in stores WhatsApp (and email) promotional consent with the widget's exact text and the visitor's IP (`routes/v1OptIn.ts:156-184`). A honeypot, a limit of 5 submissions per IP per hour and +91 normalisation protect the list (:95-139), and an `optin_received` event can start a welcome flow (:186-215). MoEngage's lead-gen form treats Terms & conditions as an optional add-on and showed no consent record. Caveats:
  - A "Pre-check consent" toggle pre-ticks the box (`widgets/page.tsx:257`, `sdk/src/widget.ts:214`). A pre-ticked box is not the clear affirmative action DPDP expects; remove the toggle or warn against it.
  - The checkbox is enforced in the browser only. The server never receives its state.
- **HTTP Request flow node with response chaining.** The response is stored as `node_outputs.<key>`, and later send nodes can bind variables to it, for example a loyalty balance or order status fetched mid-journey (`flowExecutor.ts:822-879`, :651-655). A failed call is recorded and the trip continues. MoEngage's connector campaigns, as captured, are fire-and-forget. Caveat: the node has no SSRF check (see the API request builder row).
- **Signed outbound webhooks with retries and a delivery log.** Settings > Webhooks offers:
  - HMAC or Bearer auth, with a signing secret shown only once;
  - retry presets of 3, 5 or 8 attempts;
  - a deliveries table with request, response and one-click resend;
  - a test event.

  See `settings/webhooks/page.tsx:20-26, 112-404` and `routes/webhookSubscriptions.ts`. MoEngage's connector screens showed no delivery log. Caveat: only "customer entered/exited a segment" events fire today; the other catalogue entries are placeholders (`hooks/useWebhooks.ts:40-47`).
- **Click-to-WhatsApp (CTWA) ad attribution.** Each Meta ad click that opens a WhatsApp chat is upserted into `ctwa_attributions`, records an implicit marketing opt-in and emits `ctwa_lead_received` for welcome flows (`services/whatsappInboundService.ts:186-260`; `/campaigns/ctwa`). This is the main paid-acquisition loop for Indian D2C, while MoEngage's audience tiles only push audiences out. Caveats: nothing ever writes the `first_purchase_at` and `attributed_revenue` columns, so "converted" and revenue always show 0, and the page isn't linked in navigation.

### UX notes

- **Picker layout** (screens 001, 002). MoEngage groups tiles as Outbound / Inbound / Messaging apps / Audience / Connector / All apps, and Inbound tiles skip the delivery-type step. Storees' Create Campaign panel (`campaigns/page.tsx:178-272`) differs in three ways:
  - In-App sits under "Outbound".
  - It asks One Time vs Periodic, which means little for a message the storefront fetches on demand.
  - There is no entry for on-site widgets (`/widgets` is unlinked), ad audiences (Segments > Export to ads) or webhooks (the flow HTTP node).

  Adopt the grouped layout and point those tiles at the existing Storees features.
- **Install path.** Settings > SDK & Integration > Shopify gives merchants a Customer Events pixel only (`settings/page.tsx:234-247`). That pixel runs in Shopify's sandbox and can't draw on the page, so widgets need the separate Script Tag snippet in the theme, and nothing on the Shopify tab says so. Add a line (or a theme app embed) before promoting on-site widgets to Shopify brands.
- **Trigger composition** (007, 008, 009). MoEngage has three trigger tiles, an independent trigger-time radio (Immediately / After Delay / After Scroll) and a separate "Select pages" card. Storees' widget editor puts trigger and timing in one select (`widgets/page.tsx:222-239`) and pages in a free-text glob box (:242-250). A scroll or delay threshold can't be combined with exit intent, and there is no URL tester. Adopt the tile-plus-radio pattern.
- **Content step** (027, 037, 050). MoEngage starts with a filterable gallery with hover previews, then an accordion editor beside a sticky device preview with Copy HTML. Storees' in-app Step 2 is a plain template list plus a textarea (`campaigns/create/page.tsx:2755-2865`), and:
  - it has no in-app preview (the preview card renders only for push and SMS, :2928);
  - its Link Tracking block is dropped on save for in-app (:429);
  - its AI copy and body edits are never served by the endpoint.

  Move the Templates editor's position preview (`templates/create/page.tsx:464-496`) into the campaign step.
- **Step 3** (075). MoEngage shows in-app-specific controls (a priority segmented control, a per-device show cap, a minimum delay with a unit picker, auto-dismiss) next to Test Campaign and Publish. Storees' Step 3 shows the same request-limit and frequency-cap controls for every channel, including the hard-coded "Currently set as 1 In-App in 1 day" (`campaigns/create/page.tsx:3516-3555`); none of them affect an in-app message. Make Step 3 depend on the channel.
- **Look and feel** (050-054, 065). MoEngage's native and gamification editors expose background, animation, close-button and border styling beside a live phone preview. Storees' widget is a hard-coded white card with an indigo `#4F46E5` button (`sdk/src/widget.ts:181-217`), even though the file's header comment says colours come from the widget config. The admin preview is a separate static modal (`widgets/page.tsx:278-298`), while `/settings/brand` already stores the shop's logo and colours. Quick win: apply the brand kit in the SDK renderer and show a live preview beside the form.
- **Connector form** (091-093, 098). MoEngage puts URL parameters and headers in key-value rows, toggles saved auth configurations, offers Form / JSON / Raw body tabs and ends the content step with a Test row. Its Step 3 adds de-duplication, a request limit and a warning banner when "All users" is targeted. Storees' flow HTTP Request block (`StructuredFlowBuilder.tsx:1234-1297`) is compact but has no Test button and no per-node delivery log. Reuse the Settings > Webhooks deliveries table (`settings/webhooks/page.tsx:333-404`) for HTTP nodes.
- **Drafts and states** (008). MoEngage autosaves a server draft on the first interaction and shows a "Draft saved" toast. Storees' widget editor is a modal that throws away all input on Cancel or close (`widgets/page.tsx:196-276`); leaving "Active" off is the only draft-like state. At minimum, warn before closing with unsaved changes. The widgets list also has no error state: a failed load shows "No widgets yet" (`widgets/page.tsx:72-80`).
- **Locked features** (082, 109, 111, 116). For each locked add-on, MoEngage shows a full upsell page (benefit tabs, Learn more / I'm interested), and Connected Apps shows "paid add-on, Request access" tooltips; both capture demand. Storees shows grey "Soon" badges (`campaigns/page.tsx:220-224, 262-266`). It also lists Pinnacle as "SMS + RCS" in Settings (`settings/page.tsx:373`), though neither a Pinnacle SMS nor an RCS provider exists. Either remove promises that aren't built or add an "I'm interested" capture.
- **Where Storees is better** (068 vs `widgets/page.tsx:217-219`). Storees makes consent text mandatory and stores it with the IP for each opt-in, while MoEngage's lead-gen form treats Terms & conditions as optional. Keep consent mandatory (and drop the pre-check toggle) when adding gamified lead capture.

### Verification notes

Every row was re-checked against the code at `2063cdc`. Rows for capabilities Storees shares across channels (control group, A/B, UTM, goals, AI copy, brand kit) are scored 🟡 Partial when they work for other channels but aren't applied to in-app or on-site; the gap text says what is missing. Rows changed:

- **Conversions: Meta Ads Conversions API: ✅ Full → 🟡 Partial (P2, S).** The relay is real (UI, API, worker and HTTP call). But it sends `action_source: 'website'` events with no `client_user_agent` or `event_source_url` (`conversionApiService.ts:104-178`), which Meta's parameter reference lists as required for website events. Its `event_id` can't match a browser pixel's, so purchases can be double-counted when the shop also runs the Meta pixel or Shopify's Meta app. Read from code and Meta's docs, not run.
- **Conversions: TikTok, Snapchat and Microsoft: 🟡 Partial → ❌ Missing (P2, M).** The TikTok and Snap relays throw "not yet implemented" (`conversionApiService.ts:181-199`) and the UI cards say "coming soon"; Microsoft doesn't exist. A stub isn't a partial implementation.
- **Cards: 🟡 Partial → ❌ Missing (P3, L).** The only trace is the `inbox` value of the in-app position enum, offered as a Position button that nothing renders. Recommend hiding it.
- **Periodic webhook: P3 → P2 (status unchanged).** A fixed-time flow built in the UI never fires. The scheduler enrols `triggerConfig.audienceFilter` and refuses when it is empty (`flowFixedTimeScheduler.ts:51-55`). The builder saves the trigger node's config as `triggerConfig` (`flows/[id]/page.tsx:33`) and has no audience control for fixed-time triggers; a frontend grep for `audienceFilter` in flows finds nothing. Time is UTC only. This also affects the Flows module.

Evidence and gap corrections (status unchanged):

- **Inbound group:** added the install gap. The Shopify tab installs only the sandboxed Customer Events pixel, and the Shopify app doesn't inject the SDK (no ScriptTag or app-embed code in the backend).
- **Message layouts (P0):** added how an in-app campaign goes live. Send Now stages only customers with an email; with none, dispatch throws and the campaign stays an unserved draft. A scheduled in-app campaign is served from its start time until the scheduler's dispatch fails and resets it to draft (`campaignScheduler.ts:57-68`).
- **Target audience:** added that holdouts are still served and that the audience preview counts only email-holders as reachable for in-app.
- **In-session query parameter / user type:** the original evidence cited a `returning` flag in `sdk/src/transport.ts`. That is cross-brand recognition, not a new-vs-returning visitor signal. Replaced it with the SDK's UTM and session capture (`sdk/src/autotrack.ts`).
- **Lead-generation form:** `POST /api/v1/optin` always requires a phone (`v1OptIn.ts:131-134`), so the "Phone required" toggle can't enable email-only sign-ups.
- **Gamification:** the original evidence said codes exist "only as static values". Flows can also bind a per-recipient code from the event payload to a WhatsApp COPY_CODE button (`SendNodeConfigModal.tsx:56, 104`). There is still no coupon pool.
- **Brand kit:** brand values feed template tokens on every channel plus email and recommendation accents, not only email tokens. The widget's header comment wrongly says it takes colours from the config.
- **Periodic in-app schedule:** each periodic re-dispatch deletes the campaign's `campaign_sends` (`campaignScheduler.ts:93-110`), wiping in-app shown/dismissed history.
- **API request builder:** Content-Type defaults to JSON but a header row can override it (it isn't "always JSON"). The guard to reuse is `services/ssrfGuard.ts` (`assertPublicUrl`, already used by webhooks and data connectors), not `websiteBrandFetcher.ts`.
- **Authorization settings:** added that data connectors already store bearer / API-key / basic auth specs.
- **Event Triggered connector:** the original evidence credited the trigger's audience filter and an "inactivity" window. `inactivityTime` is declared but never read anywhere, and the builder exposes neither field. The pattern still works with delay and "Has Done Event" condition nodes.
- **Google Customer Match:** added that phones are hashed without the leading "+". Google's guidance on this is mixed, so match rates should be tested.
- **Delivery controls:** a widget's "Show once" flag is set only when the visitor closes or submits it. A popup that is ignored shows again on the next page.
- **Storees-only list:**
  - Dropped "Programmatic widget trigger API". MoEngage's "On custom event" trigger covers the same need, and lets marketers bind campaigns without new code, so it isn't an advantage. It is now noted as a stopgap in the custom-event row.
  - Added the pre-check and client-side-only caveats to consent capture, and the SSRF caveat to the HTTP node.

Confirmed unchanged after trying to refute them:

- **`/widgets` is unreachable from navigation.** It isn't in `navItems` or `bottomItems` (`Sidebar.tsx:54-81`) or in the settings tabs, and a frontend grep for `/widgets` finds only API calls.
- **No in-app renderer.** `in-app-messages` appears only in the route file. No theme extension, app embed or ScriptTag injection is in the repo, and `packages/sdk-react` has no in-app code.
- **`'in_app'` vs `'inapp'`.** `MessageChannel` uses `'inapp'` (`types.ts:950`); campaigns pass `'in_app'`, so `checkReachability` falls to `default: return false`.
- **Segment leak.** The endpoint never reads `segmentId`. A saved-segment campaign has a null `audienceFilter`, so the anonymous branch (`isNull(audienceFilter)`) and the identified branch (`if (c.audienceFilter)`) both serve it.
- **❌ Missing rows.** Each was searched under synonyms across frontend, backend (routes, services, workers, schema, migrations), shared, segments, flows, ml and both SDKs:
  - survey, nps and rating
  - spin, wheel, scratch and gamif
  - coupon, discount_code, code_redemption and price_rule
  - quiet hours, dnd and send window
  - global control and universal holdout
  - geoip, maxmind and cf-ipcountry
  - priority
  - locale variants
  - bandit, thompson and auto-optimise
  - rcs, mms, telegram, viber, deepgram and voice
  - customaudiences, adaccount and customerMatch
  - serviceWorker and pushManager
  - dedupe and duplicate key
- **✅ Full rows.** Each was traced UI → API → engine: WhatsApp tile, page-load delay and scroll, exit intent, SMS sign-up unit.

Out of scope, but worth fixing: the flow HTTP node calls any tenant-supplied URL with no SSRF check (`flowExecutor.ts:851-862`). Flows are admin-only (`routes/flows.ts:42`), but any tenant's admin could point the node at internal or cloud-metadata addresses and pass the response into later nodes through `node_outputs`. `assertPublicUrl` already exists for this.

- **Cross-module consistency review (completeness pass):** Voice calls ❌ → 🟡, matching module 25: a flow HTTP Request step can call a voice provider's API, though only by hand and without call outcomes.

### Screens

#### New Campaign channel picker and Connected Apps modal

![Top of the New Campaign modal: Outbound channels, Merlin Custom Agents bar, Inbound In-app/On-site/Cards](../screenshots/05-builder-onsite-inapp-other-001-channel-picker-top.jpg)
*Top of the New Campaign modal: Outbound channels, Merlin Custom Agents bar, Inbound In-app/On-site/Cards*

![Bottom of the modal: WhatsApp, Audience (Facebook, Google Ads), Connector Custom, All apps](../screenshots/05-builder-onsite-inapp-other-002-channel-picker-bottom.jpg)
*Bottom of the modal: WhatsApp, Audience (Facebook, Google Ads), Connector Custom, All apps*

![Custom connector expanded: One Time / Periodic / Event Triggered (Periodic description shown on hover)](../screenshots/05-builder-onsite-inapp-other-003-custom-connector-delivery-types.jpg)
*Custom connector expanded: One Time / Periodic / Event Triggered (Periodic description shown on hover)*

![Connected Apps (See all): category counts, Create app, Conversions, Messaging apps, Retargeting](../screenshots/05-builder-onsite-inapp-other-004-connected-apps-modal.jpg)
*Connected Apps (See all): category counts, Create app, Conversions, Messaging apps, Retargeting*

![Connected Apps scrolled: Retargeting and Voice calls (Deepgram)](../screenshots/05-builder-onsite-inapp-other-005-connected-apps-scrolled.jpg)
*Connected Apps scrolled: Retargeting and Voice calls (Deepgram)*

![Retargeting 'See all': 8 audience apps, including Truecaller and Reddit Ads Audience](../screenshots/05-builder-onsite-inapp-other-006-connected-apps-retargeting-all.jpg)
*Retargeting 'See all': 8 audience apps, including Truecaller and Reddit Ads Audience*

![Hover on Telegram: 'Telegram is a paid add-on. Request access'](../screenshots/05-builder-onsite-inapp-other-116-connected-apps-telegram-paid-addon-tooltip.jpg)
*Hover on Telegram: 'Telegram is a paid add-on. Request access'*

#### On-site builder, Step 1: Target users (only step captured)

![Step 1: name, tags, Web/Mobile Web, triggers On Page Load / On custom event / On Exit Intent, trigger time Immediately / After Delay / After Scroll](../screenshots/05-builder-onsite-inapp-other-007-onsite-step1-target-trigger-page-load.jpg)
*Step 1: name, tags, Web/Mobile Web, triggers On Page Load / On custom event / On Exit Intent, trigger time Immediately / After Delay / After Scroll*

![On custom event trigger ('If user performs Has Executed' + Trigger/Filter, then show Immediately/After Delay). The 'Draft saved succesfully.' autosave toast is visible.](../screenshots/05-builder-onsite-inapp-other-008-onsite-step1-custom-event-trigger-autosave-toast.jpg)
*On custom event trigger ('If user performs Has Executed' + Trigger/Filter, then show Immediately/After Delay). The 'Draft saved succesfully.' autosave toast is visible.*

![Select pages: All pages / Specific pages (New updates); Target audience filter tabs](../screenshots/05-builder-onsite-inapp-other-009-onsite-step1-pages-audience.jpg)
*Select pages: All pages / Specific pages (New updates); Target audience filter tabs*

![Audience bottom: Reset filters / Show count, In-session attributes, Exclude Users, Global/Campaign control group, Next](../screenshots/05-builder-onsite-inapp-other-010-onsite-step1-session-attrs-control-group.jpg)
*Audience bottom: Reset filters / Show count, In-session attributes, Exclude Users, Global/Campaign control group, Next*

#### In-app builder, Step 1: Target users

![Step 1 top: Android/iOS, triggers On session start / On screen load / On custom event, screen context, trigger time](../screenshots/05-builder-onsite-inapp-other-011-inapp-step1-target-users-top.jpg)
*Step 1 top: Android/iOS, triggers On session start / On screen load / On custom event, screen context, trigger time*

![On custom event: 'If user performs', note that server-side events are not supported, optional screen context, 'Then trigger the message'](../screenshots/05-builder-onsite-inapp-other-012-inapp-step1-custom-event-trigger.jpg)
*On custom event: 'If user performs', note that server-side events are not supported, optional screen context, 'Then trigger the message'*

![Trigger event picker is empty (SDK not integrated)](../screenshots/05-builder-onsite-inapp-other-013-inapp-step1-trigger-event-picker-empty.jpg)
*Trigger event picker is empty (SDK not integrated)*

![Custom event with the Specific screens info box and After Delay (After N Seconds)](../screenshots/05-builder-onsite-inapp-other-014-inapp-step1-screen-context-after-delay.jpg)
*Custom event with the Specific screens info box and After Delay (After N Seconds)*

![On session start: trigger time After Delay 5 s, with an SDK version note](../screenshots/05-builder-onsite-inapp-other-015-inapp-step1-session-start-trigger.jpg)
*On session start: trigger time After Delay 5 s, with an SDK version note*

![On screen load > Specific screens: Android/iOS tabs, 'Screen is any of' / 'App context is any of'](../screenshots/05-builder-onsite-inapp-other-016-inapp-step1-screen-load-specific-screens.jpg)
*On screen load > Specific screens: Android/iOS tabs, 'Screen is any of' / 'App context is any of'*

![Screen selector open (no screens tracked yet)](../screenshots/05-builder-onsite-inapp-other-017-inapp-step1-screen-selector-open.jpg)
*Screen selector open (no screens tracked yet)*

![Tooltip: the message shows on the selected context (App section)](../screenshots/05-builder-onsite-inapp-other-018-inapp-step1-app-context-tooltip.jpg)
*Tooltip: the message shows on the selected context (App section)*

![Target audience, In-session attributes, Global/Campaign control group](../screenshots/05-builder-onsite-inapp-other-019-inapp-step1-audience-insession-control-group.jpg)
*Target audience, In-session attributes, Global/Campaign control group*

![In-session attributes: Query Parameter, User Type, Day of the week, Time of the Day, GeoLocation](../screenshots/05-builder-onsite-inapp-other-020-inapp-step1-insession-attribute-list.jpg)
*In-session attributes: Query Parameter, User Type, Day of the week, Time of the Day, GeoLocation*

![Query Parameter row (param name, operator, value, Case Sensitive) with the operator list open](../screenshots/05-builder-onsite-inapp-other-021-inapp-step1-query-param-operators.jpg)
*Query Parameter row (param name, operator, value, Case Sensitive) with the operator list open*

![User Type values: New / Returning](../screenshots/05-builder-onsite-inapp-other-022-inapp-step1-user-type-values.jpg)
*User Type values: New / Returning*

![Day of the week values](../screenshots/05-builder-onsite-inapp-other-023-inapp-step1-day-of-week-values.jpg)
*Day of the week values*

![Time of the Day: hourly buckets (12am-1am ...)](../screenshots/05-builder-onsite-inapp-other-024-inapp-step1-time-of-day-values.jpg)
*Time of the Day: hourly buckets (12am-1am ...)*

![GeoLocation: 'in the following' + Select Country](../screenshots/05-builder-onsite-inapp-other-025-inapp-step1-geolocation-attribute.jpg)
*GeoLocation: 'in the following' + Select Country*

![Coachmark for 'Add Nested Filter': (A OR B) AND (C OR D)](../screenshots/05-builder-onsite-inapp-other-026-inapp-step1-nested-filter-coachmark.jpg)
*Coachmark for 'Add Nested Filter': (A OR B) AND (C OR D)*

#### In-app builder, Step 2: template gallery and Start from scratch

![Content step: Prebuilt and saved templates, Type/Vertical/Use Case filters, Templates (78)](../screenshots/05-builder-onsite-inapp-other-027-inapp-step2-template-gallery-top.jpg)
*Content step: Prebuilt and saved templates, Type/Vertical/Use Case filters, Templates (78)*

![Use Case and Content filters; nudge and popup cards](../screenshots/05-builder-onsite-inapp-other-028-inapp-step2-gallery-usecase-filters.jpg)
*Use Case and Content filters; nudge and popup cards*

![Filter By Editor: NATIVE, HTML, Self handled, Drag and drop, No code gamification (New)](../screenshots/05-builder-onsite-inapp-other-029-inapp-step2-gallery-content-editor-filters.jpg)
*Filter By Editor: NATIVE, HTML, Self handled, Drag and drop, No code gamification (New)*

![Popup and full-screen templates](../screenshots/05-builder-onsite-inapp-other-030-inapp-step2-gallery-popups-fullscreen.jpg)
*Popup and full-screen templates*

![SMS sign-up, Spin The Wheel, Scratch Card, Survey, Promotional, Lead Gen, Carousel](../screenshots/05-builder-onsite-inapp-other-031-inapp-step2-gallery-spin-scratch-survey.jpg)
*SMS sign-up, Spin The Wheel, Scratch Card, Survey, Promotional, Lead Gen, Carousel*

![Survey popups (radio, multi-screen, NPS slider), emoji rating, countdown nudge, first Drag & drop template](../screenshots/05-builder-onsite-inapp-other-032-inapp-step2-gallery-surveys-nudges-dnd.jpg)
*Survey popups (radio, multi-screen, NPS slider), emoji rating, countdown nudge, first Drag & drop template*

![Drag & drop templates (Ecommerce, Wishlist, Feedback form, Webinar registration) and spin wheels](../screenshots/05-builder-onsite-inapp-other-033-inapp-step2-gallery-drag-drop-wheels.jpg)
*Drag & drop templates (Ecommerce, Wishlist, Feedback form, Webinar registration) and spin wheels*

![Gaming Arc Wheel, Scratch Card 2 / with Form, countdown timers, Sale and Cart-abandoned popups](../screenshots/05-builder-onsite-inapp-other-034-inapp-step2-gallery-scratch-countdown-sale.jpg)
*Gaming Arc Wheel, Scratch Card 2 / with Form, countdown timers, Sale and Cart-abandoned popups*

![Use-case popups: product recommendation, sale, feedback, greeting, survey, onboarding, promotional, reminder](../screenshots/05-builder-onsite-inapp-other-035-inapp-step2-gallery-vertical-usecase-templates.jpg)
*Use-case popups: product recommendation, sale, feedback, greeting, survey, onboarding, promotional, reminder*

![End of the gallery](../screenshots/05-builder-onsite-inapp-other-036-inapp-step2-gallery-end.jpg)
*End of the gallery*

![Card hover: 'Select template' button and live phone preview popout](../screenshots/05-builder-onsite-inapp-other-037-inapp-step2-template-hover-select-preview.jpg)
*Card hover: 'Select template' button and live phone preview popout*

![Start from scratch: Drag & drop editor - blank, Custom HTML Upload, Zip Upload, Self-Handled](../screenshots/05-builder-onsite-inapp-other-038-inapp-step2-start-from-scratch.jpg)
*Start from scratch: Drag & drop editor - blank, Custom HTML Upload, Zip Upload, Self-Handled*

![Custom HTML Upload hover: Create pop up / Create nudge, plus tooltip](../screenshots/05-builder-onsite-inapp-other-039-inapp-step2-scratch-custom-html-hover.jpg)
*Custom HTML Upload hover: Create pop up / Create nudge, plus tooltip*

!['Change Template' confirmation modal](../screenshots/05-builder-onsite-inapp-other-063-inapp-step2-change-template-confirm.jpg)
*'Change Template' confirmation modal*

![Template search 'Wheel' returns 4 results (Nudge filter greyed while A/B variations exist)](../screenshots/05-builder-onsite-inapp-other-064-inapp-step2-template-search-wheel.jpg)
*Template search 'Wheel' returns 4 results (Nudge filter greyed while A/B variations exist)*

![Filter By Editor = HTML (includes drag & drop and gamification templates)](../screenshots/05-builder-onsite-inapp-other-071-inapp-step2-gallery-html-editor-filter.jpg)
*Filter By Editor = HTML (includes drag & drop and gamification templates)*

#### In-app builder, Step 2: editors (Drag & drop, Native, Gamification, HTML, Self-Handled)

![Blank Drag & drop editor: Merlin banner, Android/iOS, Mirror platforms, A/B test, Locale, Preview, content blocks](../screenshots/05-builder-onsite-inapp-other-040-inapp-step2-dnd-editor-blank.jpg)
*Blank Drag & drop editor: Merlin banner, Android/iOS, Mirror platforms, A/B test, Locale, Preview, content blocks*

![D&D content blocks (incl. HTML, Video, Form, Icons), Template Settings, UTM](../screenshots/05-builder-onsite-inapp-other-041-inapp-step2-dnd-content-blocks.jpg)
*D&D content blocks (incl. HTML, Video, Form, Icons), Template Settings, UTM*

![UTM parameters and 'Preview in-app' test-on-device section](../screenshots/05-builder-onsite-inapp-other-042-inapp-step2-utm-preview-inapp.jpg)
*UTM parameters and 'Preview in-app' test-on-device section*

![Template Settings: orientation Portrait/Landscape/Both; device types Mobile/Tablets/TV OS](../screenshots/05-builder-onsite-inapp-other-043-inapp-step2-template-settings-orientation-devices.jpg)
*Template Settings: orientation Portrait/Landscape/Both; device types Mobile/Tablets/TV OS*

![Test device identifier types](../screenshots/05-builder-onsite-inapp-other-044-inapp-step2-test-device-identifier-types.jpg)
*Test device identifier types*

![D&D ROWS tab (Empty + row layouts)](../screenshots/05-builder-onsite-inapp-other-045-inapp-step2-dnd-rows-tab.jpg)
*D&D ROWS tab (Empty + row layouts)*

![D&D SETTINGS tab: Default font, Link color](../screenshots/05-builder-onsite-inapp-other-046-inapp-step2-dnd-settings-tab.jpg)
*D&D SETTINGS tab: Default font, Link color*

![D&D Actions menu: Preview](../screenshots/05-builder-onsite-inapp-other-047-inapp-step2-dnd-actions-menu.jpg)
*D&D Actions menu: Preview*

![Template kebab: Save template / Change template / Reset template](../screenshots/05-builder-onsite-inapp-other-048-inapp-step2-template-kebab-menu.jpg)
*Template kebab: Save template / Change template / Reset template*

!['+ A/B test' menu: Copy Variation / New Variation](../screenshots/05-builder-onsite-inapp-other-049-inapp-step2-ab-test-menu.jpg)
*'+ A/B test' menu: Copy Variation / New Variation*

![Variation 2 in the Native editor (Popup - Image & Button): Template settings / Image / Buttons, preview, Copy HTML](../screenshots/05-builder-onsite-inapp-other-050-inapp-step2-variation2-native-editor.jpg)
*Variation 2 in the Native editor (Popup - Image & Button): Template settings / Image / Buttons, preview, Copy HTML*

![Native Template settings: phone background colour, template background image source](../screenshots/05-builder-onsite-inapp-other-051-inapp-step2-native-template-settings.jpg)
*Native Template settings: phone background colour, template background image source*

![Entry/Exit animation, close button display/type/placement, border](../screenshots/05-builder-onsite-inapp-other-052-inapp-step2-native-animation-close-button.jpg)
*Entry/Exit animation, close button display/type/placement, border*

![Entry Animation options](../screenshots/05-builder-onsite-inapp-other-053-inapp-step2-native-entry-animation-options.jpg)
*Entry Animation options*

![Close button style options](../screenshots/05-builder-onsite-inapp-other-054-inapp-step2-native-close-button-types.jpg)
*Close button style options*

![Image widget: Upload image / Image URL, Actions, Width/Margin/Padding, Border](../screenshots/05-builder-onsite-inapp-other-055-inapp-step2-native-image-widget.jpg)
*Image widget: Upload image / Image URL, Actions, Width/Margin/Padding, Border*

![Widget action type list](../screenshots/05-builder-onsite-inapp-other-056-inapp-step2-native-action-types.jpg)
*Widget action type list*

![Navigation action: Navigate to screen / DeepLink / Rich landing + New KV pair](../screenshots/05-builder-onsite-inapp-other-057-inapp-step2-native-navigation-action.jpg)
*Navigation action: Navigate to screen / DeepLink / Rich landing + New KV pair*

![Buttons widget: type, text (emoji + Merlin), font, colour, default action Dismiss](../screenshots/05-builder-onsite-inapp-other-058-inapp-step2-native-buttons-widget.jpg)
*Buttons widget: type, text (emoji + Merlin), font, colour, default action Dismiss*

!['Generate content using Merlin AI' drawer (not generated)](../screenshots/05-builder-onsite-inapp-other-059-inapp-step2-merlin-ai-copy-drawer.jpg)
*'Generate content using Merlin AI' drawer (not generated)*

![User distribution drawer: Dynamically using Merlin AI vs Manual split](../screenshots/05-builder-onsite-inapp-other-060-inapp-step2-user-distribution-drawer.jpg)
*User distribution drawer: Dynamically using Merlin AI vs Manual split*

!['+ Locale' menu (no locales, '+ New Locale')](../screenshots/05-builder-onsite-inapp-other-061-inapp-step2-locale-menu.jpg)
*'+ Locale' menu (no locales, '+ New Locale')*

![Preview page: 'User for preview' (identifier value redacted), Fetch user data, Update preview](../screenshots/05-builder-onsite-inapp-other-062-inapp-step2-preview-user-for-preview.jpg)
*Preview page: 'User for preview' (identifier value redacted), Fetch user data, Update preview*

![No-code gamification editor (Fullscreen - Casino Wheel): Spin wheel / Winning screen / Losing screen](../screenshots/05-builder-onsite-inapp-other-065-inapp-step2-gamification-spin-wheel-editor.jpg)
*No-code gamification editor (Fullscreen - Casino Wheel): Spin wheel / Winning screen / Losing screen*

![Wheel sectors table: win %, title, colours, coupon code, lose option](../screenshots/05-builder-onsite-inapp-other-066-inapp-step2-gamification-wheel-sectors.jpg)
*Wheel sectors table: win %, title, colours, coupon code, lose option*

![Lead generation customisation: field size / type / font / background](../screenshots/05-builder-onsite-inapp-other-067-inapp-step2-gamification-lead-gen.jpg)
*Lead generation customisation: field size / type / font / background*

![Lead-gen border and Field details (+ Add field, + Add Terms & conditions)](../screenshots/05-builder-onsite-inapp-other-068-inapp-step2-gamification-lead-gen-fields.jpg)
*Lead-gen border and Field details (+ Add field, + Add Terms & conditions)*

![Lead-gen field row (Label, Type, Placeholder, User Attribute, Required) with the field type list](../screenshots/05-builder-onsite-inapp-other-069-inapp-step2-lead-gen-field-types.jpg)
*Lead-gen field row (Label, Type, Placeholder, User Attribute, Required) with the field type list*

![Winning screen: Image, Text, Coupon box, Button](../screenshots/05-builder-onsite-inapp-other-070-inapp-step2-gamification-winning-screen.jpg)
*Winning screen: Image, Text, Coupon box, Button*

![HTML template (Survey Popup - NPS Slider): Code View, sample templates, Upload files, Merlin AI 'edit HTML by describing the change' coachmark](../screenshots/05-builder-onsite-inapp-other-072-inapp-step2-html-code-view-merlin-coachmark.jpg)
*HTML template (Survey Popup - NPS Slider): Code View, sample templates, Upload files, Merlin AI 'edit HTML by describing the change' coachmark*

![HTML code bottom (Clear) and UTM with utm_term / utm_content](../screenshots/05-builder-onsite-inapp-other-073-inapp-step2-html-clear-utm-params.jpg)
*HTML code bottom (Clear) and UTM with utm_term / utm_content*

![Self-Handled: free-form Content box with preview](../screenshots/05-builder-onsite-inapp-other-117-inapp-step2-self-handled-content.jpg)
*Self-Handled: free-form Content box with preview*

#### In-app builder, Step 3: Schedule and goals

![Send campaign One Time / Periodic, time zone, Ends, Conversion goals, Campaign priority](../screenshots/05-builder-onsite-inapp-other-074-inapp-step3-schedule-goals-top.jpg)
*Send campaign One Time / Periodic, time zone, Ends, Conversion goals, Campaign priority*

![Delivery controls: per-device limit, minimum delay, ignore global minimum delay, auto-dismiss; Test Campaign / Publish](../screenshots/05-builder-onsite-inapp-other-075-inapp-step3-priority-delivery-controls.jpg)
*Delivery controls: per-device limit, minimum delay, ignore global minimum delay, auto-dismiss; Test Campaign / Publish*

![Minimum delay units: Sec / Min / Hr / Day](../screenshots/05-builder-onsite-inapp-other-076-inapp-step3-min-delay-units.jpg)
*Minimum delay units: Sec / Min / Hr / Day*

![Conversion goal row and 'Track above goals for 36 hours'](../screenshots/05-builder-onsite-inapp-other-077-inapp-step3-conversion-goal-row.jpg)
*Conversion goal row and 'Track above goals for 36 hours'*

![Daily: start date, repeat every N days, ends, campaign active window, next-send preview](../screenshots/05-builder-onsite-inapp-other-078-inapp-step3-daily-active-window.jpg)
*Daily: start date, repeat every N days, ends, campaign active window, next-send preview*

![One Time at a specific date and time](../screenshots/05-builder-onsite-inapp-other-079-inapp-step3-specific-date-time.jpg)
*One Time at a specific date and time*

![Weekly: repeat every N weeks, on S M T W T F S](../screenshots/05-builder-onsite-inapp-other-080-inapp-step3-weekly.jpg)
*Weekly: repeat every N weeks, on S M T W T F S*

![Monthly: days-of-month grid / days of week](../screenshots/05-builder-onsite-inapp-other-081-inapp-step3-monthly.jpg)
*Monthly: days-of-month grid / days of week*

#### Cards (app inbox / news feed), locked

![Cards upsell hero and 'paid add-on, not enabled' banner](../screenshots/05-builder-onsite-inapp-other-082-cards-paid-addon-upsell.jpg)
*Cards upsell hero and 'paid add-on, not enabled' banner*

![High Engagement tab (app inbox, alerts stay accessible)](../screenshots/05-builder-onsite-inapp-other-083-cards-high-engagement-tab.jpg)
*High Engagement tab (app inbox, alerts stay accessible)*

![Customize As Needed tab (self-handled cards)](../screenshots/05-builder-onsite-inapp-other-084-cards-customize-as-needed-tab.jpg)
*Customize As Needed tab (self-handled cards)*

![Higher Reach tab (reaches users who opted out of other channels)](../screenshots/05-builder-onsite-inapp-other-085-cards-higher-reach-tab.jpg)
*Higher Reach tab (reaches users who opted out of other channels)*

![Non-intrusive Messaging tab](../screenshots/05-builder-onsite-inapp-other-086-cards-non-intrusive-tab.jpg)
*Non-intrusive Messaging tab*

#### Facebook and Google Ads audience sync, not configured

![Facebook: 'Please complete integration of your Facebook Ad Account with MoEngage. Integrate'](../screenshots/05-builder-onsite-inapp-other-087-audience-facebook-not-integrated-toast.jpg)
*Facebook: 'Please complete integration of your Facebook Ad Account with MoEngage. Integrate'*

![Google Ads: 'Google Ads not connected, please connect to Google Ads. Integrate'](../screenshots/05-builder-onsite-inapp-other-088-audience-google-ads-not-connected-toast.jpg)
*Google Ads: 'Google Ads not connected, please connect to Google Ads. Integrate'*

#### Connector (custom webhook), One Time

![Step 1: name, tags, Select audience, control groups](../screenshots/05-builder-onsite-inapp-other-089-connector-onetime-step1-target-users.jpg)
*Step 1: name, tags, Select audience, control groups*

![All users selected, Show count, Next](../screenshots/05-builder-onsite-inapp-other-090-connector-step1-all-users-control-group.jpg)
*All users selected, Show count, Next*

![Step 2 API request: Method, Webhook URL (@ personalization), URL params, Headers, auth toggle, Test campaign](../screenshots/05-builder-onsite-inapp-other-091-connector-step2-api-request-get.jpg)
*Step 2 API request: Method, Webhook URL (@ personalization), URL params, Headers, auth toggle, Test campaign*

![POST: Body type Form / JSON / Raw](../screenshots/05-builder-onsite-inapp-other-092-connector-step2-post-body-form.jpg)
*POST: Body type Form / JSON / Raw*

![JSON body auto-adds a Content-Type: application/json header; authorization settings turned on](../screenshots/05-builder-onsite-inapp-other-093-connector-step2-auth-settings-json-body.jpg)
*JSON body auto-adds a Content-Type: application/json header; authorization settings turned on*

![Authorization config dropdown is empty (none defined)](../screenshots/05-builder-onsite-inapp-other-094-connector-step2-auth-config-empty.jpg)
*Authorization config dropdown is empty (none defined)*

![Raw body textarea ('Type @ to personalize the body')](../screenshots/05-builder-onsite-inapp-other-095-connector-step2-raw-body.jpg)
*Raw body textarea ('Type @ to personalize the body')*

![Test campaign identifier types](../screenshots/05-builder-onsite-inapp-other-096-connector-step2-test-identifier-types.jpg)
*Test campaign identifier types*

![Step 3 (opened read-only via moveToStep): As soon as possible / At specific date and time](../screenshots/05-builder-onsite-inapp-other-097-connector-step3-schedule.jpg)
*Step 3 (opened read-only via moveToStep): As soon as possible / At specific date and time*

![Conversion goals, Remove duplicate users, Delivery controls, Request limit, All-users warning, Publish](../screenshots/05-builder-onsite-inapp-other-098-connector-step3-dedupe-delivery-request-limit.jpg)
*Conversion goals, Remove duplicate users, Delivery controls, Request limit, All-users warning, Publish*

![Duplicate key options (any user attribute)](../screenshots/05-builder-onsite-inapp-other-099-connector-step3-duplicate-key-options.jpg)
*Duplicate key options (any user attribute)*

![Tooltip: Remove duplicate users](../screenshots/05-builder-onsite-inapp-other-100-connector-step3-remove-duplicates-tooltip.jpg)
*Tooltip: Remove duplicate users*

![Tooltip: Request limit (max 200,000 rpm)](../screenshots/05-builder-onsite-inapp-other-101-connector-step3-request-limit-tooltip.jpg)
*Tooltip: Request limit (max 200,000 rpm)*

#### Connector (custom webhook), Event Triggered

![Step 1 trigger: Primary trigger event(s), alternate/secondary triggers, 'Then trigger' Immediately / With Delay](../screenshots/05-builder-onsite-inapp-other-102-connector-event-triggered-step1-trigger.jpg)
*Step 1 trigger: Primary trigger event(s), alternate/secondary triggers, 'Then trigger' Immediately / With Delay*

![Delay qualifier: Before (disabled) / After](../screenshots/05-builder-onsite-inapp-other-103-connector-event-trigger-delay-after-options.jpg)
*Delay qualifier: Before (disabled) / After*

![Audience section with the nested-filter coachmark](../screenshots/05-builder-onsite-inapp-other-104-connector-event-triggered-step1-audience.jpg)
*Audience section with the nested-filter coachmark*

![Step 3: Active continuously, start/end date and time](../screenshots/05-builder-onsite-inapp-other-105-connector-event-triggered-step3-active-window.jpg)
*Step 3: Active continuously, start/end date and time*

![Delivery controls: minimum delay (hours), Ignore DND, Ignore / Count for frequency capping](../screenshots/05-builder-onsite-inapp-other-106-connector-event-triggered-step3-delivery-controls.jpg)
*Delivery controls: minimum delay (hours), Ignore DND, Ignore / Count for frequency capping*

#### Connector (custom webhook), Periodic

![Periodic connector Step 1](../screenshots/05-builder-onsite-inapp-other-107-connector-periodic-step1.jpg)
*Periodic connector Step 1*

![Periodic Step 3: Daily/Weekly/Monthly, repeat every, Ends Never/On/After](../screenshots/05-builder-onsite-inapp-other-108-connector-periodic-step3-schedule.jpg)
*Periodic Step 3: Daily/Weekly/Monthly, repeat every, Ends Never/On/After*

#### MMS, locked

![MMS upsell: US, Canada and Australia only; paid add-on not enabled](../screenshots/05-builder-onsite-inapp-other-109-mms-paid-addon-upsell.jpg)
*MMS upsell: US, Canada and Australia only; paid add-on not enabled*

![MMS 'Add Rich Media' tab](../screenshots/05-builder-onsite-inapp-other-110-mms-add-rich-media-tab.jpg)
*MMS 'Add Rich Media' tab*

#### RCS Native, locked

![RCS Native upsell hero](../screenshots/05-builder-onsite-inapp-other-111-rcs-native-paid-addon-upsell.jpg)
*RCS Native upsell hero*

![Intelligent SMS Fallback: Messaging Type SMS only / RCS only / RCS with SMS fallback](../screenshots/05-builder-onsite-inapp-other-112-rcs-intelligent-sms-fallback-tab.jpg)
*Intelligent SMS Fallback: Messaging Type SMS only / RCS only / RCS with SMS fallback*

![No-code RCS template editor (multi-card carousel)](../screenshots/05-builder-onsite-inapp-other-113-rcs-no-code-editor-tab.jpg)
*No-code RCS template editor (multi-card carousel)*

![Smart Targeting tab](../screenshots/05-builder-onsite-inapp-other-114-rcs-smart-targeting-tab.jpg)
*Smart Targeting tab*

![Cross-Channel by Design tab](../screenshots/05-builder-onsite-inapp-other-115-rcs-cross-channel-tab.jpg)
*Cross-Channel by Design tab*
