## 24. Settings > Advanced (2) & Reports/Alerts: Authorization, UTM, Conversion & Attribution, Alert Management, Dashboard Subscriptions, Inform

Storees has none of these six Settings pages; its nearest equivalents sit inside builders (per-campaign UTM and conversion goals with a per-report Any / View-through / Click-through switch, two hard-coded admin emails, and transactional sends built as event-triggered flows). Of 54 rows, 3 are full, 17 partial, 31 missing and 3 not applicable. The two P0s (UI-built flow emails send a hard-coded fallback; flows have no revenue) are shared with modules 06 and 14, and the P1s are WhatsApp UTM tagging, a send API, email logging, and alerts for failure rate, template suspension and event volume.

### MoEngage overview

These six pages hold workspace-level defaults and operational monitoring that sit outside the campaign builders.

- **Authorization configuration:** a library of OAuth client-credentials configs. Each config defines a token request, a response mapping, and a test send that must pass before Save. SMS Custom Connector campaigns, the Content API and PII Settings reuse them. Empty here, and "+ Add OAuth config" is disabled for this role.
- **UTM tracking:** one master toggle for account-wide default UTM parameters. utm_source and utm_medium are required; utm_campaign, utm_term and utm_content are optional; up to 5 custom parameters are allowed. Campaigns and flows get separate values drawn from campaign or flow metadata. Off and locked for this role.
- **Conversion and attribution:** the account's default attribution model (All Interactions or Last Interaction) and conversion view (Total or Click-through; the page code adds View-through and In-session). A toggle makes conversion goals mandatory for email. Changing the model resets conversion data and recalculates it.
- **Alert management:** 9 built-in email alerts with search, filters and per-alert email subscription. They cover:
  - data exports paused and flow fair-use;
  - event and attribute usage against plan;
  - campaign failure-rate breach;
  - campaign, APNS and Facebook token expiry.

  Read-only views state each condition as a sentence. Custom analytics alerts are flag-hidden, and Slack/Teams destinations are plan-locked.
- **Dashboard subscriptions:** a custom dashboard emailed daily, weekly or monthly to up to 50 recipients, with charts and a CSV of the data. Admins can whitelist up to 5 recipient domains.
- **Inform:** an upsell page for the paid transactional-messaging add-on (single API, template management, centralized logs, cross-sell).

**Capture caveats:** the OAuth form, the UTM parameter table, the alternative conversion views, the model-change modal, the alert create/edit forms, alert destinations and the domain whitelist were read from page code, not rendered. Their controls were role-locked, plan-locked, flag-hidden or would have changed settings. Nothing was saved, toggled, subscribed or submitted.

| Page visited | URL path |
|---|---|
| Authorization Configuration | `/v4/settings-v2/advanced/auth-config` |
| UTM Tracking | `/v4/settings-v2/advanced/utm-tracking` |
| Conversion And Attribution | `/v4/settings-v2/advanced/attribution-and-conversion` |
| Alert Management | `/v4/settings-v2/reports-alerts/alerts-management` (lands on `/alerts-management/general?tab=oob`; alert view `/alerts-management/<alertId>?mode=view&domain=GENERAL`; hidden custom tab `?tab=custom`) |
| Alert destination (hidden route) | `/v4/settings-v2/reports-alerts/alerts-destination` |
| Dashboard Subscriptions | `/v4/settings-v2/reports-alerts/dashboard-subscriptions` |
| Inform (Miscellaneous) | `/v4/settings-v2/others/informs` |

### Storees counterpart

Storees has no Advanced, Reports & alerts or Miscellaneous settings. Settings is a flat bar of up to 11 tabs (`packages/frontend/src/app/(dashboard)/settings/layout.tsx:12-27`). The nearest pieces:

- **UTM:**
  - A per-campaign UTM card in create and edit (`packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx:2199-2246`; `packages/frontend/src/app/(dashboard)/campaigns/[id]/edit/page.tsx`). It is applied at send by `packages/backend/src/services/emailService.ts:135-183` and `packages/backend/src/services/campaignService.ts:966-971,1023-1029`.
  - A UTM step on each flow send node (`packages/frontend/src/components/flows/SendNodeConfigModal.tsx:536-598`). It is applied to flow email links and to WhatsApp tracked-button short links (`packages/backend/src/services/flowExecutor.ts:730-735,786-792`; `packages/backend/src/services/deliveryService.ts:275-323`).
- **Conversion and attribution:**
  - Per-campaign conversion goals with revenue and an hours window. They are evaluated live by `packages/backend/src/services/campaignAnalyticsService.ts:120-304`.
  - The results appear with an Any / View-through / Click-through switch and control-group lift on `packages/frontend/src/app/(dashboard)/campaigns/[id]/page.tsx`.
  - Flows have only a goal event and a converted-trip count (`packages/backend/src/services/flowExecutor.ts:262-333`).
- **Alerts:** two hard-coded admin emails. One covers Meta template re-categorisation (`packages/backend/src/services/templateAlertService.ts`); the other sends trial reminders (`packages/backend/src/services/trialLifecycleService.ts`, `packages/backend/src/workers/trialWorker.ts`). There is no alert entity and no Slack or Teams.
- **Authorization:**
  - Encrypted per-connector secrets for data-source connectors (`packages/backend/src/services/connectors/genericHttpConnector.ts`; `packages/backend/src/routes/dataConnectors.ts`).
  - Hard-coded token minting for Shopify custom apps and FCM.
  - The flow HTTP Request node (`packages/backend/src/services/flowExecutor.ts:822-880`).
- **Dashboard subscriptions:** none. There is one fixed Home dashboard (`packages/frontend/src/app/(dashboard)/dashboard/page.tsx`) and no report export.
- **Inform:**
  - Transactional sends are event-triggered flows, started by Shopify order webhooks, `/api/v1/events` or `/api/hooks/:token`.
  - WhatsApp UTILITY and AUTHENTICATION templates are treated as transactional automatically (`packages/backend/src/services/deliveryService.ts:31-43`).
  - Notification Logs (`packages/frontend/src/app/(dashboard)/logs/page.tsx`; `packages/backend/src/routes/logs.ts`).

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Authorization configuration | OAuth config library: list, edit/view/delete, usage list, no delete while in use | Account list of OAuth configs (Name, Service Type, Grant Type, Token Type, Last updated) with Edit/View/Delete and a "Check usage list" drawer; a config in use cannot be deleted. Empty here; "+ Add OAuth config" disabled for this role | ❌ Missing | No auth-config table in `schema.ts` and no route (searched oauth2, client_credentials, grant_type, token_url, oauthConfig). Each data connector stores one encrypted bearer, api_key or basic secret (`genericHttpConnector.ts:8-12,77-81,196-203`; `routes/dataConnectors.ts`). HTTP Request node headers are saved in the flow JSON (`types.ts:734-749`; `StructuredFlowBuilder.tsx:1234-1297`) | No named, reusable credential with a where-used view. A token pasted into an HTTP Request header sits in plaintext in the flow JSON and is retyped in every flow | P3 | M |
| Authorization configuration | OAuth config form: client-credentials token request, response mapping, test before save | Drawer (page code): name, service type, grant type, token type; API URL, method, params, headers, body; token key, expiry key and unit, Bearer/Basic prefix, refresh error codes; "Send test to proceed" before Save | ❌ Missing | Token minting is hard-coded: Shopify custom apps use client_credentials with a stored expiry (`shopifyService.ts:323-385`; `routes/integrations.ts:203-242`); FCM uses a JWT-bearer grant cached 50 min in one process-wide slot, not keyed by service account (`fcmProvider.ts:53,71,106-111`). Workaround: chain two HTTP Request nodes and put `{{node_outputs.<key>.body.access_token}}` in a header (`flowExecutor.ts:834-854`). Only data connectors have a test (`routes/dataConnectors.ts:258`) | Brands cannot connect APIs that issue short-lived OAuth tokens (OMS, loyalty, ERP). The chained-node workaround mints a token on every trip and keeps the client secret in plaintext. Building blocks exist: `encrypt()`, `testConnection`, `assertPublicUrl`. Key the FCM cache by service account first (module 14, P1) | P3 | M |
| Authorization configuration | Service type: SMS Custom Connector (any HTTP SMS gateway) | OAuth configs are picked when building SMS Custom Connector campaigns, so any HTTP SMS vendor can be used | 🟡 Partial | Fixed SMS registry: Twilio, Gupshup, Bird, Vonage (`providers/index.ts:25-29`). The Settings "Pinnacle" SMS card has no `sms_pinnacle` provider; sends fall to a legacy env-configured stub or to Resend, which rejects SMS (`channelProviderRegistry.ts:193-198`; `deliveryService.ts:170-174`; `index.ts:242-245`). Every SMS provider reads the body from `email_templates.bodyText` by `templateId` (`twilioProvider.ts:7-16`), and SMS campaigns send no `templateId` (`create/page.tsx:611`), so they go out with an empty body. A flow HTTP Request step can post the phone and message to any HTTP SMS gateway (`flowExecutor.ts:815-877`), flows only, with no consent, caps or receipts, as module 19 and the Content API row below credit | Indian D2C brands already pay MSG91, Kaleyra, Exotel or ValueFirst under DLT and cannot plug them in. Add a configurable HTTP SMS provider (URL, method, body template, auth) after the empty-body fix (module 03) | P2 | M |
| Authorization configuration | Service type: Content API (live API data at send time) | OAuth configs authenticate Content API calls that personalise messages with live responses | 🟡 Partial | Flow HTTP Request node: GET/POST/PUT/PATCH/DELETE with `{{token}}` interpolation in URL, headers and body; 10 s default timeout, 30 s max. The response is stored at `trip.context.node_outputs.<key>` for later send steps (`types.ts:726-749`; `flowExecutor.ts:213-224,822-880`; `StructuredFlowBuilder.tsx:330,1234-1297`). Campaigns have no equivalent | Flows only. No token fetch or refresh and no caching; a failed call is stored and the trip continues. The node skips the `assertPublicUrl` SSRF guard that connectors and outbound webhooks use (`genericHttpConnector.ts:258`; `webhookService.ts:122`); module 23 rates that fix P0 | P2 | M |
| Authorization configuration | Service type: PII Settings (fetch contact details from the brand's system at send time) | OAuth configs authenticate PII Settings, so MoEngage fetches contact details instead of storing them | ❌ Missing | Email and phone are stored on `customers` and only masked by role (`lib/pii.ts`; `middleware/capabilities.ts:15-126`). No send-time lookup or tokenised PII (searched vault, tokenize, pii settings) | Enterprise data-residency need; little demand from Shopify D2C, where Shopify already holds contact data | P3 | L |
| UTM tracking | Account-level UTM switch with defaults for every campaign and flow (editable per campaign) | One "UTM parameters" master toggle; enabled parameters are appended to campaign and flow links, and each campaign can override them. Off and locked for this role | 🟡 Partial | No project setting (no UTM key on `projects`, `schema.ts:20-71`; no Settings tab, `settings/layout.tsx:12-27`). Campaigns: per-campaign card, on by default, hard-coded utm_source=storees, utm_medium=channel, utm_campaign=`{{campaign_name}}` (`create/page.tsx:477-481,2199-2246`; `[id]/edit/page.tsx:235-239,320-327`; `campaigns.utm_parameters`, `schema.ts:429`). Flows: a per-step panel, off by default (`SendNodeConfigModal.tsx:127-136,536-598`) | A brand cannot set its own defaults once (for example utm_source=brand_crm): campaigns start from "storees" and flow steps start untagged. Store defaults in `projects.settings` and pre-fill both builders | P2 | S |
| UTM tracking | Default set: utm_source and utm_medium required; utm_campaign, utm_term, utm_content optional | Source and medium on by default and cannot be empty; campaign, term and content off by default | 🟡 Partial | Fixed Source, Medium and Campaign inputs; term and content exist only as free-text custom rows (`create/page.tsx:2217-2245`). Blank values are dropped silently in the builder (`create/page.tsx:1548-1563`) and the API (`routes/campaigns.ts:39-52`; `campaignService.ts:1197-1206`) | No required-field check, so a blanked Source ships links without it. No preset rows for term or content | P3 | S |
| UTM tracking | Custom UTM parameters (up to 5, duplicates rejected) | "+ Create custom parameter", at most 5, each removable, duplicate names rejected | ✅ Full | "Custom parameter" rows in campaign create and edit (`create/page.tsx:2231-2245`; `[id]/edit/page.tsx:899-910`) and "+ Add custom parameter" on flow steps (`SendNodeConfigModal.tsx:553-583`). Values are resolved per recipient at send (`emailService.ts:135-183`) | Parity, with no cap. Duplicate keys are not flagged; `URLSearchParams.set` lets the later row win | — | — |
| UTM tracking | Separate campaign value and flow value per parameter | Table "Utm parameters / Campaign value / Flow value" with a per-row toggle | 🟡 Partial | Campaigns and flow steps each keep their own key/value list (`campaigns.utm_parameters`, `schema.ts:429`; node `config.utmParameters`, `types.ts:686-687`), so values can differ, but nothing is shared | Keeping dozens of flow steps consistent is manual; this comes with the account-level default | P3 | S |
| UTM tracking | Campaign value: Campaign Name | "Campaign Name" in the campaign value picker | ✅ Full | `{{campaign_name}}` is set on every campaign send (`campaignService.ts:941`), is a lint-safe system key (`templateContext.ts:294-302`) and is the default utm_campaign (`create/page.tsx:480`) | Parity | — | — |
| UTM tracking | Campaign values: id, parent id, channel, platform, delivery type, description, tags, tag ids, segment, conversion goal, locale, variation | Value dropdown of campaign attributes (GET `/campaigns/core/attributes`) | ❌ Missing | Only `campaign_name` is added to the campaign context (`campaignService.ts:925-941`). Variable sources are customer, attribute, product, event, project, literal and decision (`types.ts:1094-1111`), none for campaign metadata. utm_medium is pre-filled with the channel name (`create/page.tsx:479`) | utm_content cannot carry the A/B variant, and GA cannot tie sessions to a campaign id or segment. Add campaign_id, channel, delivery_type, segment_name, variant and tags tokens | P2 | S |
| UTM tracking | Flow values: flow name, flow id, child campaign name, delivery type, description, tags, goal, locale, variation | Flow value options mirror the campaign ones, from flow metadata | ❌ Missing | Flow steps default utm_campaign to the template name or the literal "flow" (`SendNodeConfigModal.tsx:127-136,208`). The executor adds only product-decision and product-block variables (`flowExecutor.ts:657-663,684-712`), so there is no `{{flow_name}}` or `{{flow_id}}`; a flow name can only be typed by hand on each step | Every step reports under its template name, and two flows reusing a template look identical in GA. Add flow_name, flow_id and step tokens | P2 | S |
| UTM tracking | UTM added to links on every channel (campaigns and flows) | Enabled parameters are appended to links in campaigns and flows | 🟡 Partial | Applied: email campaigns, every absolute link (`campaignService.ts:966-971`; `emailService.ts:135-157`); flow emails (`flowExecutor.ts:730-735`); URLs in push campaign text (`campaignService.ts:1023-1029`); flow WhatsApp "Track clicks" buttons via the short link's destination (`deliveryService.ts:275-323`). Not applied: WhatsApp and in-app campaigns (card hidden by `supportsLinkTracking`, `create/page.tsx:429`; no `utmParameters` passed, `campaignService.ts:1035-1049`); flow SMS and push (saved but unused, `SendNodeConfigModal.tsx:597`); SMS campaigns (added to `variables.message`, which SMS providers never read, `twilioProvider.ts:7-16`). Flow WhatsApp tagging stops once the hourly template sync strips the `track` flag (`whatsappTemplateSyncService.ts:36-52`; module 23 P0) | WhatsApp campaign clicks reach GA and Shopify untagged. Quick win (S): show the card for WhatsApp and pass `utmParameters` in `sendOneRecipient` (module 04, P1). Flow SMS and push need the SMS body fix first | P1 | M |
| UTM tracking | Turning UTM off: disable only, or disable and update existing campaigns | "Modify UTM parameter" confirmation offering disable or disableAndUpdate | ❌ Missing | No account switch. UTMs change one campaign at a time, and only while it is draft or scheduled (`routes/campaigns.ts:441-443`) | No bulk way to stop or change tagging on live periodic campaigns or active flows | P3 | S |
| Conversion & attribution | Saved account default for attribution model and conversion view | Two dropdowns with hover definitions, a recalculation notice and a sticky Save. Current: Last Interaction / Total conversion | ❌ Missing | No project setting (`schema.ts:20-71`; `settings/layout.tsx:12-27`). The report switch starts at "Any" on every load and is not saved (`campaigns/[id]/page.tsx:82-87,570-622`); the API reads `?attributionType` per request (`routes/campaigns.ts:883-909`). The list's "Goals & Engagement" column shows only open and click rates (`campaigns/page.tsx:338,404-420`) | Each viewer picks a view on every visit, and the campaign list shows no conversions. Store a project default that seeds the switch | P2 | S |
| Conversion & attribution | Attribution model: All Interactions | A conversion is credited to every campaign with the same goal whose attribution window is open | ✅ Full | Storees' only model: each campaign counts its own recipients who fire the goal event inside its window, with no cross-campaign de-duplication (`campaignAnalyticsService.ts:120-222`). Events match by customer, so SDK, Shopify webhook and API events all count | Parity for campaigns. Window and recipient-pool defects are separate rows; flows have no revenue (flows row) | — | — |
| Conversion & attribution | Attribution model: Last Interaction (deepest, latest interaction wins) | This workspace's default; one campaign gets the credit for each conversion | ❌ Missing | Conversions are computed per campaign in isolation (`campaignAnalyticsService.ts:120-222`). Searched last_interaction, last touch, first touch, multi-touch, attribution_model. `evaluateConversions` is used only by per-campaign analytics, so no screen sums revenue across campaigns | Overlapping WhatsApp, email and flow sends all claim the same order, so summed campaign revenue can exceed store revenue. De-duplicate using the sent, opened and clicked times in `campaign_sends`; covering flows needs email sends in `messages`. Same gap as module 01 (P2) | P2 | M |
| Conversion & attribution | Attribution model: Linear Interaction | Appears only in a page-code notice (view-through default for every channel except Cards) | ❌ Missing | No split credit anywhere (same search as Last Interaction) | Low demand; follows once cross-campaign attribution exists | P3 | M |
| Conversion & attribution | Conversion view: Total conversion | Click-based plus influenced conversions by users who received the message, within the window | 🟡 Partial | "Any" counts every `campaign_sends` row of the campaign with no status filter (`campaignAnalyticsService.ts:139-147`). Recipients blocked at send (consent, frequency cap, trial limit) or failed by the provider stay in that table as `failed` (`campaignService.ts:872-875,1056-1078`), so their organic orders count as conversions | Undelivered recipients inflate conversions and revenue. Restrict "Any" to sends that went out (`sent_at` set, or status sent/delivered) | P2 | S |
| Conversion & attribution | Conversion view: Click-through conversion | Goals completed by users who clicked, within the window counted from the click | 🟡 Partial | "Click-through" keeps recipients with `campaign_sends.clicked_at` set (`campaignAnalyticsService.ts:146`). The window still starts at the campaign's `sentAt`, and the click need not come before the conversion, though the comment at lines 20-23 says it must. Clicks come from Resend webhooks, short links and the in-app API (`resendWebhook.ts:142-148`; `shortLinkService.ts:55-94`; `v1InAppMessages.ts:230`). SMS and push links are not shortened, so their click-through count is always 0 | Click-through can count orders placed before the click and is blind on SMS and push. Count only events at or after `clicked_at`, and start the window at the click | P2 | S |
| Conversion & attribution | Conversion view: View-through (users who received the message) | Page-code option: goals completed by users who received the message within the window | 🟡 Partial | Storees' "View-through" means opened, not received: `opened_at` must be set, and WhatsApp read receipts count as opens (`campaignAnalyticsService.ts:145`; `messageStatusService.ts:111-135`; caption "Only recipients who opened", `campaigns/[id]/page.tsx:588-589`) | Same label, different definition, so Storees reads lower side by side. Rename it to open-through or align the definitions. Email opens arrive only from Resend (`resendWebhook.ts:142-148`) | P3 | S |
| Conversion & attribution | Conversion view: In-session (conversion within 30 minutes of a click) | Conversion type in page code only | ❌ Missing | The only window is `goalTrackingHours` from `sentAt` (`campaignAnalyticsService.ts:135-137`) | Computable from `clicked_at` + 30 min once windows start at the click | P3 | S |
| Conversion & attribution | Make conversion goals mandatory for Email campaigns | Toggle (off here); when on, every new email campaign must set a goal | ❌ Missing | The default "Goal 1" has an empty event and is dropped unless filled (`create/page.tsx:513-515,559,623`); the API never requires a goal (`routes/campaigns.ts:98-280`). Searched mandatory, requireGoal | Admins cannot enforce measurement, so many campaign reports show no Converted or Revenue figures | P3 | S |
| Conversion & attribution | Attribution window (set per campaign) | Windows are set per campaign; this page has no window field | 🟡 Partial | "Track above goals for N hours", default 36 (`create/page.tsx:3509-3512`; `routes/campaigns.ts:230`). The window opens at `campaigns.sent_at`, which is written only when the whole dispatch finishes (`campaignService.ts:898-904`; `campaignAnalyticsService.ts:135-137`). The label says "from the time the channel is opened" | With best-time, time-zone or rate-limited sends, conversions by early recipients before dispatch ends are never counted. Periodic runs delete earlier `campaign_sends` rows (`campaignScheduler.ts:98`), so past runs' conversions vanish (module 15, P1). Start the window per recipient at `campaign_sends.sent_at` and fix the label | P2 | S |
| Conversion & attribution | Default model also applied to flows (flow conversions and revenue) | Conversion metrics are recalculated with the chosen model for all campaigns and flows | 🟡 Partial | A trip converts only if its goal event fires while the trip is active or waiting (`flowExecutor.ts:262-333`; `flowAnalyticsService.ts:86-93,238-239`). No revenue, no window after the trip ends, and no attribution views | No revenue per journey, the headline number for abandoned-cart and win-back flows. Same gap as module 06 (P0). Reuse the campaign revenue and window logic | P0 | M |
| Conversion & attribution | Switching the model: confirmation, data reset and recalculation | "Attribution model change" modal (page code): conversion data resets to zero and is recalculated from a date | ➖ N/A | Storees has one model, so there is nothing to switch. Its report switch changes the conversion view, computed live from `events` and `campaign_sends` (`campaignAnalyticsService.ts:120-222`). MoEngage's Campaign Stats also has an instant Click-through / Total selector (modules 01, 12) | Live computation would let a Last Interaction model ship without a data reset, but history is not kept for periodic campaigns (window row). Large event tables will need caching | — | — |
| Alert management | Alert list: search, filters (Alert on, Created by, Subscribed by), row actions | "General alerts" tab: name search, filter popover, columns Alert name, type, Created by, Subscribed by, Subscriptions; row menu View and Subscribe to email. 9 system alerts | ❌ Missing | No alerts table (`schema.ts`), alert route, Settings tab (`settings/layout.tsx:12-27`) or notification centre (`components/layout/`). Two hard-coded emails only: Meta template re-categorisation (`templateAlertService.ts:30-95`) and trial reminders at 7, 2 and 0 days (`trialLifecycleService.ts:37-84`; `workers/trialWorker.ts`) | Admins cannot see what is monitored or turn anything on. Add an alerts table, seed system alerts per project, and a Settings > Alerts list | P2 | M |
| Alert management | Per-alert email subscription and Members | "Subscribe to email" per alert and a Members multi-select; page code adds Unsubscribe and "Subscribe others to email" | ❌ Missing | Both emails go to every `admin_users` row with role admin whose home project is this one (`templateAlertService.ts:59-62`; `trialLifecycleService.ts:61-64`). No opt-in or opt-out; managers, agents and admins linked through `user_projects` never receive them | The person running WhatsApp operations cannot subscribe, and admins cannot mute an alert. Add per-alert subscriptions | P2 | S |
| Alert management | Alert definition form (type, channel, condition, filters, evaluation time, members) | General details; condition written as a sentence; Filter by campaigns, channels, delivery types and tags; Members. Evaluated daily at 7 AM account time | ❌ Missing | No alert builder and no evaluator job in `workers/`. `projects` has a currency but no time zone (`schema.ts:20-71`) | Needs a project time zone first; a sentence-style builder would fit the existing filter-builder UI | P2 | M |
| Alert management | System alert: Failure Rate Breach (failure rate above 25% in the last day) | Built in; filterable by campaigns, channels, delivery type and tags | ❌ Missing | Failures are counted but never evaluated: `campaigns.failed_count` (`campaignService.ts:793-906`) and message failure and block reasons in Notification Logs (`routes/logs.ts:15-139`). A scheduled campaign whose dispatch throws silently reverts to draft (`campaignScheduler.ts:57-68`). Searched threshold, failure rate, auto-pause, circuit breaker, error rate | A WhatsApp campaign hit by Meta errors or a paused template fails quietly until someone opens the report. Add a per-channel failure-rate alert on the existing counters | P1 | M |
| Alert management | Campaign Stats metrics and operators for alerts | Attempted through Revenue; is greater/less than, increases/decreases by more than; Day or Hour window, optional moving average | ❌ Missing | The metrics exist per campaign (`campaignAnalyticsService.ts:306-470`), but nothing compares them to a threshold | No alerts on delivery drops, bounce or complaint spikes, or conversion dips | P2 | M |
| Alert management | Flow Stats metrics for alerts | Trips started, active, ended and engaged; converted users, CVR, revenue, drop-offs, entries used, suppressed entries | ❌ Missing | `flowAnalyticsService.ts:70-266` computes trips, completion, conversion and delivery live for the flow Analytics tab; no thresholds | A broken abandoned-cart flow (for example zero entries after a theme change) goes unnoticed | P2 | M |
| Alert management | System alert: Data Exports Paused | "Send alerts when an export is auto-paused after multiple failures." | ❌ Missing | No scheduled exports to pause. The nearest integrations fail silently: data-source syncs record `failed` plus sync logs (`dataSyncWorker.ts:107-130`); Meta CAPI destinations store `lastError` (`conversionApiService.ts:257-268`); outbound webhook failures are only logged (`webhookDeliveryWorker.ts:20-22`) | Not relevant until exports exist. The useful equivalent alerts on repeated connector, CAPI or webhook failures | P3 | S |
| Alert management | System alerts: flow fair-use limit (time-based and event-triggered) | "Send alert when usage reaches [100] %" | ❌ Missing | Plans cap the number of flows (2 on trial) at create time (`entitlementService.ts:36-40`; `routes/flows.ts:150`); executions are not metered | Not needed under current pricing | P3 | S |
| Alert management | System alerts: event and user-attribute usage against plan limits | Event usage > 511 of 512 and attribute usage > 255 of 256; checked daily, sent every time the condition is met | ❌ Missing | Storees does not cap events or attributes. Its trial caps (1,000 contacts, 100 WhatsApp, 500 email, 2 flows, 5 templates; `entitlementService.ts:36-40`) have no threshold alert and no usage meter (Billing shows plan and days left only, `settings/billing/page.tsx:34-37`). Past a cap, WhatsApp, SMS and push sends are blocked as `trial_limit`, visible only in logs (`deliveryService.ts:102-111`; `entitlementService.ts:130-149`) | A trial store that spends its 100 WhatsApp messages on day 3 sees flows stop without warning, which hurts trial conversion. Email admins at 80% and 100% of each finite limit | P2 | S |
| Alert management | System alert: Campaign Expiry | "Send alert when Campaign Expiry is in the next [7] Day(s)", with filters | ❌ Missing | Nothing expires: periodic campaigns save an `endsAt` (`types.ts:229`) that the scheduler never reads (`campaignScheduler.ts:16-121`), and flows have no end date (`schema.ts:325-345`) | Make end dates work first; the alert is trivial after that | P3 | S |
| Alert management | System alert: APNS Token Expiry | APNS token expiring in the next [7] Day(s) | ➖ N/A | Storees holds no APNs certificate or key. iOS push goes through FCM, whose `apns` block only sets payload options (`fcmProvider.ts:136`), and there is no native iOS SDK (`packages/sdk` and `packages/sdk-react` are browser SDKs) | APNs credentials live in the brand's Firebase project | — | — |
| Alert management | System alert: Facebook Token Expiry | Facebook token expiring in the next [7] Day(s) | ❌ Missing | Meta tokens are validated only at connect (`whatsappMetaConnectService.ts:56-94`), and the form asks for a permanent system-user token (`settings/MetaConnect.tsx:170-178`). The hourly template sync uses the token but only logs failures to the console (`templateStatusWorker.ts:36-50`). CAPI destinations show `lastError` only when someone opens the page. Searched debug_token, OAuthException, 190 | A revoked WhatsApp Cloud API token stops every campaign and flow, and the only clue is failed messages. Turn the sync failure into a daily token-health email to admins | P2 | S |
| Alert management | Alert on: WhatsApp Template Suspension | Listed among the "Alert on" filter options | 🟡 Partial | PAUSED, DISABLED and FLAGGED statuses and the quality score are captured from Meta webhooks, the hourly sync and the 4-hourly poll (`templateStatusService.ts:24-34,67-95`; `templateStatusWorker.ts:28-29,83-107`) and shown in the template library (`templates/page.tsx:24-26,457-471`). Only a category change emails admins (`templateAlertService.ts:30-95`). Sends to a non-approved template fall through to a plain-text send (`deliveryService.ts:237`) | When Meta pauses an abandoned-cart template, flows keep sending into failures with no alert. Reuse the re-categorisation email for pauses, disables and quality drops, and name the flows and campaigns that use the template | P1 | S |
| Alert management | Alert on: Events Volume | All, custom, system or one event over the last day or hour, or per day, calendar week or month, against a threshold | ❌ Missing | Only passive signals someone has to look at: inbound webhooks' 24-hour count (`routes/inboundWebhooks.ts:18-43`), Event Mapping's "no data" flags (`routes/eventMapping.ts:355-367`) and the SDK badge (`routes/v1ApiKeys.ts:110-152`). Failed events go to `dead_letter_events` with no notice (`eventProcessor.ts:166-172`) | If the Shopify pixel or a webhook breaks, checkout and cart events stop and abandoned-cart flows go quiet unnoticed. Alert when a key event's daily count falls below a threshold or to zero | P1 | M |
| Alert management | Alert on: Active Users Volume | User metric "Tracked users (Web + Mobile)" against a threshold | ❌ Missing | Active customers are computed for the dashboard (`routes/dashboard.ts:104-315`) with no threshold | Mostly covered by an events-volume alert | P3 | S |
| Alert management | Custom analytics alerts on saved analyses (flag-hidden) | Alerts on any saved analysis: above or below a value, or a % or value change versus the previous day, week or month; evaluated daily, weekly or monthly. Only the `?tab=custom` link renders, showing "No custom alerts created yet!" | ❌ Missing | `saved_analyses` allows five types, but only the Funnels page saves (`schema.ts:937-947`; `analytics/funnels/page.tsx:132-134`). No schedule or evaluator | Enterprise analytics feature, of little value to D2C brands before core alerts exist. Module 11 rates the same P3 (module 10: P2) | P3 | L |
| Alert destinations | Slack and Microsoft Teams alert destinations (plan-locked) | Hidden route: destination name, tool, URL (Slack webhook validated) and alert-type mapping; list with search, edit and delete | ❌ Missing | No Slack or Teams code (searched slack, msteams, hooks.slack); Slack is only planned (`docs/MOENGAGE_COMPETITIVE_PLAN.md:846,931`). Outbound webhooks send signed Storees JSON for segment enter and exit only (`services/webhookService.ts`; `settings/webhooks/page.tsx`) | Operations teams work in Slack. Posting alert text to an incoming webhook is small once alerts exist, and MoEngage locks it behind a higher plan | P2 | S |
| Dashboard subscriptions | Subscribe to Dashboard: dashboard, up to 50 recipients, daily, weekly or monthly at a set time | Modal: Dashboard*; email chips (max 50); Daily, Weekly (Sunday to Saturday) or Monthly (last day, 1st to 31st, or nth weekday); hh:mm am/pm with "(Timezone: Asia/Kolkata)" | ❌ Missing | No digest or scheduled-report code (searched digest, scheduled report, weekly report, dashboard subscription). One fixed dashboard (`dashboard/page.tsx`; `routes/dashboard.ts:104-566`), no dashboards table, no project time zone. Building blocks: BullMQ repeatables (`templateStatusWorker.ts`; `trialWorker.ts`), Resend admin email (`trialLifecycleService.ts:61-74`), the periodic Daily/Weekly/Monthly picker (`create/page.tsx:3264-3348`) | No weekly performance email for founders and managers. A KPI digest of the Home dashboard covers most of the value (M); full parity needs custom dashboards (module 12) | P2 | M |
| Dashboard subscriptions | Email renders tables as charts, with the full data as a CSV | Modal note: "Subscription emails display tables as visual charts, with the full dataset available via CSV download." | ❌ Missing | No CSV or PDF export of any report. The only file exports are the hashed ad-audience CSV (`routes/segments.ts:151-176`), the consent-audit CSV (`routes/v1Onboarding.ts:901-1000`) and the per-customer GDPR JSON (`routes/customers.ts:918-963`) | Reports cannot be downloaded, even on demand (module 15 rates on-demand export P1) | P2 | M |
| Dashboard subscriptions | Subscription list and controls (search, columns, team scope, edit rights, account maximum) | Search by subscriber email or dashboard name; Dashboard name, Last updated time, Updated by; "All Teams"; edit or delete by Admin/Manager or the owner; per-account maximum | ❌ Missing | No subscription entity and no teams. Roles are admin, manager and agent, plus custom roles with two data permissions and screen access (`middleware/capabilities.ts:15-126`) | Comes with subscriptions | P3 | S |
| Dashboard subscriptions | Manage Domain Whitelist (admin-only, up to 5 recipient domains) | "Whitelist domains for subscriptions" | ❌ Missing | No recipient-domain restriction. The only allowlists are API-key IPs (`middleware/apiKeyAuth.ts:94-100,143-150`) and the platform-admin env list (`middleware/agentScope.ts:75-83`) | Needed alongside subscriptions so business data cannot be emailed to outside addresses | P3 | S |
| Inform | Inform add-on: managed transactional alerts (OTP, order, shipping, password reset) | Promo page "Unified Messaging Infrastructure for Multichannel Transactional Alerts"; paid add-on, not enabled here | 🟡 Partial | Event-triggered flows: Shopify orders/create, orders/fulfilled and orders/cancelled become events (`routes/webhooks.ts:20-29`); other systems post to `/api/v1/events` (`v1Events.ts:114`) or `/api/hooks/:token` (`hooks.ts:17-60`). WhatsApp UTILITY and AUTHENTICATION templates are treated as transactional automatically (`deliveryService.ts:31-43`), and the library has a UTILITY order-confirmation template (`whatsappTemplateLibrary.ts:51-55`). Flow email, SMS and push are hard-coded promotional (`flowExecutor.ts:750,803`). One active trip per flow means a repeat order during a waiting trip gets no alert (`triggerWorker.ts:121-153`) | Order and shipping alerts are reliable only on WhatsApp utility templates. Add a Transactional option to send steps and allow parallel trips for transactional flows (module 14, P2) | P2 | L |
| Inform | Single API for every channel and provider | Tab "Single API for every channel and every provider": one request, any channel, 30+ providers | ❌ Missing | `/api/v1` offers events, events/batch, customers and identify (`v1Events.ts:114,274,563,989`), plus import, opt-in, recognize and in-app messages (`index.ts:170-209`). None sends a message; the only path is asynchronous: event, then flow, then queued send | A store backend cannot send an OTP or "order shipped" message now and get a status back. Add `POST /api/v1/messages` (secret key) that calls `deliveryService.send` as transactional and returns message ids (module 14, P1) | P1 | M |
| Inform | Multi-provider routing (30+ providers) | Diagram: Your Brand → Single API → Inform → Email / SMS / WhatsApp / Push / Any channel, each with several vendors | 🟡 Partial | Email: Resend, SendGrid, Postmark, Mailgun, SES. SMS: Twilio, Gupshup, Bird, Vonage. WhatsApp: Storees-managed, Meta Cloud API and Pinnacle in the UI; Twilio, Gupshup, Bird and Vonage in the backend only. Push: FCM (`providers/index.ts:17-41`; `settings/page.tsx:351-397`; `settings/WhatsappChannelPanel.tsx:19-21`). One active provider per channel (`channelProviderRegistry.ts:169-200`); only email falls back, to Resend (`emailService.ts:60-82`) | No SMS or WhatsApp failover, and no routing by country or cost | P2 | L |
| Inform | Template Management: edit transactional content without code deploys | Tab "Take control of your transactional messaging": view, add and edit alerts without deploying code | 🟡 Partial | A template library covers email, SMS, push, in-app and WhatsApp, including Meta's approval lifecycle (`templates/page.tsx`; `routes/templates.ts`; `routes/whatsappAdmin.ts`). Flow send steps pick a template and map variables (`SendNodeConfigModal.tsx:147-245`). Defect: the email step saves the template id (`SendNodeConfigModal.tsx:197-221`), but the executor looks it up by name with no project filter (`flowExecutor.ts:677-682`) and otherwise sends a hard-coded "You left something behind!" email (`flowExecutor.ts:722-727`) | An order-confirmation email built in the UI goes out as the abandoned-cart fallback. Look templates up by id within the project (same P0 as modules 06, 13 and 14) | P0 | S |
| Inform | Centralized Logs: debug alerts in real time, API and channel performance | Tab "De-bug your alerts in real time", with API Performance and Channel Performance panels | 🟡 Partial | Notification Logs (`/logs`) filters by channel, status, source and recipient, with a status summary, failure and block reasons, and role-based masking (`routes/logs.ts:15-139`; `logs/page.tsx`). Only `deliveryService` writes `messages` rows (`deliveryService.ts:499`), so no email appears. The "Transactional" source means "no campaign and no flow" (`logs.ts:32`; `logs/page.tsx:37-40`); only campaigns and flows call `deliveryService.send`, so it always returns nothing. No API request log or per-provider view. The API accepts from/to dates (`logs.ts:24-25`), but the UI has no date filter | Email alerts cannot be debugged from the log. Log email sends in `messages` with the provider message id (module 14, P1) | P1 | M |
| Inform | Growth Opportunity: promotions and cross-sell inside transactional messages | Tab "Turn transactional into revenue-generating streams" | 🟡 Partial | Flow emails get `{{cart_items}}` and a `{{recommended_products}}` grid that falls back to per-customer picks when the trigger has no product (`flowExecutor.ts:684-701`; `decisioningService.ts:235-247`). WhatsApp, SMS and push recommendation variables resolve only from a top-level `product_id` on the trigger (`flowExecutor.ts:657-663`), which order events lack. Campaigns use per-customer picks (`campaignService.ts:927-929`) | WhatsApp order and shipping alerts cannot carry a cross-sell; the empty parameter is sent as "-" (`deliveryService.ts:150-152`). Fall back to `buildDecisionVarsForCustomer` in flows. Flow email grids are blocked by the template P0 above | P2 | S |
| Inform | "Learn more" and "I'm interested" upsell buttons (Request modal) | A docs link, and a sales-request modal (Subject, Message, Submit) that fires an "Inform - I'm Interested" event | ➖ N/A | Sales lead capture for a paid MoEngage add-on. Storees plans have no transactional add-on gate; the feature keys are ai_chatbot, ai_email_designer, predictions and ad_audience_export (`entitlementService.ts:27`) | None | — | — |

### Storees-only strengths

- **Per-recipient UTM values in campaigns.**
  - Where: UTM values are interpolated per recipient at send time (`packages/backend/src/services/emailService.ts:135-183`; `packages/backend/src/services/campaignService.ts:966-971`). The campaign builder scans UTM values for `{{tokens}}` and lets the Variables panel map them to customer fields or attributes (`packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx:882-895`), and it suggests `{{customer_region}}` as a placeholder (`:2235`). Flow steps interpolate UTM values with the step's template variables (`packages/backend/src/services/flowExecutor.ts:786-792`).
  - Why it matters: brands can tag links by customer tier, city or cohort for GA reporting. MoEngage's account-level value pickers list only campaign and flow metadata.
- **UTM kept on WhatsApp tracked buttons through per-recipient short links (flows).**
  - Where: `packages/backend/src/services/deliveryService.ts:275-323`; `packages/backend/src/services/shortLinkService.ts:33-94`; `packages/backend/src/routes/urlTracker.ts`.
  - Why it matters: each tracked button mints a short link whose destination carries the step's UTM and an optional per-send override (`wa_button_dest_N`). This gives GA attribution and a `whatsapp_clicked` event without re-approving the template. Caveat: it works only until the hourly template sync strips the `track` flag (module 23, P0).
- **Live UTM preview in the flow send step.**
  - Where: `packages/frontend/src/components/flows/SendNodeConfigModal.tsx:586-598` renders `{your_link}?utm_...` as parameters are edited, with a note per channel on where UTMs apply.
  - Why it matters: marketers see exactly what GA will receive. MoEngage's UTM settings page has no preview.
- **Transactional treatment follows the WhatsApp template category.**
  - Where: `packages/backend/src/services/deliveryService.ts:31-43`.
  - Why it matters: UTILITY and AUTHENTICATION templates skip marketing consent and frequency caps automatically in campaigns and flows. Order and OTP messages on WhatsApp are never blocked by marketing caps, with no per-campaign setting to get wrong.
- **Meta template re-categorisation email alert.**
  - Where: `packages/backend/src/services/templateAlertService.ts:30-95`. The change is detected from the webhook (`packages/backend/src/services/templateStatusService.ts:67-95`) and from the 4-hourly poll (`packages/backend/src/workers/templateStatusWorker.ts:83-107`).
  - Why it matters: Meta moving a template between Marketing and Utility silently changes billing and cap treatment. MoEngage's "Alert on" list has Template Suspension but no re-categorisation alert. Caveat: only admins whose home project is this one receive it.

### UX notes

- **Settings information architecture (002, 006, 014, 029).**
  - MoEngage puts these pages in a collapsible side-nav grouped as Advanced, Reports & alerts and Others, matching its URLs. Most headers carry an (i) tooltip explaining the page.
  - Storees Settings is a flat bar of 11 tabs (`settings/layout.tsx:12-27`), with Setup, Channels and AI nested inside "SDK & Integration" (`settings/page.tsx:48-50`). UTM, Attribution and Alerts would push it past 14 tabs.
  - Move to a grouped vertical nav (Channels, Tracking & attribution, Alerts & reports, Team & security, Billing) with a one-line purpose tooltip per page.
- **Conversion and attribution (005, 007-012).**
  - MoEngage uses two plain dropdowns whose options open a definition panel on hover, plus info boxes and a sticky Save.
  - Storees shows its choice only inside each campaign report: an Any / View-through / Click-through button group with a one-line caption (`campaigns/[id]/page.tsx:570-622`). It resets to Any on every visit.
  - Keep the instant switch, but add a saved project default and full definitions. This matters because Storees' "View-through" means opened, while MoEngage's means received, and "Any" currently includes undelivered recipients.
- **Alert views (021-027).**
  - Each alert is a read-only page of four cards: General details, a condition written as a sentence ("Send alert when [Failure rate] [Is greater than] [25] % in the last [Day]"), Filter by, and Members.
  - Numbered notes cover plan limits and "evaluated at 7 AM in Asia/Kolkata timezone".
  - The sentence pattern matches the rule-builder style of Storees' segment filter builder and the card layout of Settings > Project. A project time zone is needed first.
- **Alert list (013, 015, 020, 045).**
  - The table is plain, with a filter popover and a two-item row menu. The write action "Subscribe to email" sits directly under "View", which invites accidental subscriptions.
  - Storees' two alerts are invisible; they simply arrive by email for every admin.
  - Build a Settings > Alerts table with an explicit per-row "Email me" toggle rather than a menu item next to View.
- **Dashboard subscription modal (030-036).**
  - One compact modal holds:
    - a dashboard picker;
    - email chips ("Press Enter, Space or Comma", up to 50);
    - a day picker that changes with frequency;
    - hh:mm am/pm with an explicit time zone;
    - a note that emails carry charts plus a CSV.
  - Storees can reuse the periodic campaign picker (`campaigns/create/page.tsx:3264-3348`; Monthly offers only days 1-28, `:3319`) and the campaign Cc/Bcc inputs.
  - Put an "Email this weekly" button on `/dashboard` and on campaign reports, not only in Settings.
- **UTM tracking (004).**
  - MoEngage hides everything behind one master toggle with no preview, and values come from a dropdown of campaign and flow attributes.
  - Storees' flow send step is better here, with a live preview and per-channel notes (`SendNodeConfigModal.tsx:586-598`).
  - Storees values are free text, though; the campaign builder at least detects tokens in UTM values for mapping (`campaigns/create/page.tsx:882-895`). Add a token picker beside each value (campaign name and id, channel, A/B variant, flow name) and show the preview in campaigns too.
- **Permissions (001-003).**
  - MoEngage keeps "+ Add OAuth config" visible but disabled, with the tooltip "Your role does not have permission to add new configs".
  - Storees hides admin-only Settings tabs from non-admins entirely (`settings/layout.tsx:36-40`), so a manager cannot tell a feature exists or that they need an admin. Show disabled controls with a reason instead.
- **Inform (037-042).**
  - MoEngage uses a Settings page to upsell a paid add-on, with a channel-routing diagram and four benefit tabs.
  - Storees runs transactional flows in its base plans but never labels them. Order and shipping alerts sit among marketing flows in `/flows`.
  - Notification Logs' "Transactional" source actually means "no campaign and no flow", which matches nothing today (`routes/logs.ts:32`).
  - Add a Transactional tag and filter on Flows and a "Transactional alerts" starter pack, and make the logs filter use `messages.message_type`. The UTILITY order-confirmation WhatsApp template already exists (`whatsappTemplateLibrary.ts:51-55`).

### Verification notes

Every row was re-checked against the code at `2063cdc`. Final counts over 54 rows: 3 ✅, 16 🟡, 32 ❌, 0 ⭐, 3 ➖ after the verification pass; 3 ✅, 17 🟡, 31 ❌, 0 ⭐, 3 ➖ after the cross-module consistency review at the end of these notes.

- **Conversion view: Total conversion, ✅ → 🟡 (P2, S).**
  - `evaluateConversions` builds the "Any" pool from every `campaign_sends` row of the campaign, with no status filter (`campaignAnalyticsService.ts:144`).
  - Recipients blocked by consent, frequency cap or trial limit, and provider failures, stay in that table as `failed` (`campaignService.ts:872-875,1056-1078`). Their organic orders are therefore credited.
  - MoEngage's Total conversion counts users who received the message.
- **Switching the model, ⭐ → ➖.**
  - The ⭐ compared Storees' conversion-view switch with MoEngage's attribution-model switch. MoEngage's Campaign Stats has its own instant Click-through / Total selector (modules 01 and 12), and the data reset applies only when the model changes.
  - Storees has a single model, so there is nothing to switch.
  - Live computation would make a future model switch reset-free, but periodic campaigns lose history on every run anyway.
- **Attribution model: Last Interaction (❌), P1 → P2.** Module 01 rates this same cross-campaign de-duplication gap P2. `evaluateConversions` is called only by per-campaign analytics, so no Storees screen sums revenue across campaigns; the over-credit shows only when someone adds reports up.
- **Attribution window (🟡): gap corrected.**
  - The table said late recipients get a shorter window. The reverse is true: `campaigns.sent_at` is written only after the last recipient is sent (`campaignService.ts:898-904`), and the window opens then. With best-time, time-zone or throttled sends, early recipients' conversions before dispatch ends are never counted.
  - Added that periodic runs `DELETE` earlier `campaign_sends` rows (`campaignScheduler.ts:98`), which module 15 rates P1.
- **Click-through (🟡): evidence corrected.** Clicks also arrive from the in-app API (`v1InAppMessages.ts:230`), not only from Resend and short links. WhatsApp clicks depend on tracked buttons, which the hourly sync currently breaks.
- **Growth Opportunity (🟡): gap corrected.**
  - Flow email `{{recommended_products}}` grids already fall back to per-customer picks (`decisioningService.ts:241-245`), so the earlier claim that cross-sell fails in order alerts held only for WhatsApp, SMS and push variables.
  - Added that the flow email grids are moot until the template-lookup P0 is fixed.
- **Centralized Logs (🟡): evidence corrected.** The logs "Transactional" source filter selects rows with neither a campaign nor a flow trip (`logs.ts:32`). Only `campaignService` and `flowExecutor` call `deliveryService.send`, so the filter always returns nothing. The same mistaken evidence was removed from the Storees-only list and the UX notes.
- **OAuth config form (❌): evidence extended; status kept.**
  - I considered 🟡 because two chained HTTP Request nodes can fetch a client-credentials token and pass it on through `{{node_outputs.…}}` (`flowExecutor.ts:834-854`).
  - I rejected it: the workaround mints a token on every trip, keeps the client secret in plaintext flow JSON, works only in flows and has no test step.
  - Also noted that the FCM token cache is one process-wide slot (`fcmProvider.ts:71,106-111`); module 14 already rates that P1.
- **SMS Custom Connector (❌): evidence corrected.** The Pinnacle SMS card saves a provider key that no SMS provider reads. Sends then fall to the legacy env-configured stub, or to Resend, which rejects SMS (`deliveryService.ts:170-174`; `index.ts:242-245`).
- **UTM on every channel (🟡, P1): evidence extended.** Flow WhatsApp UTM rides on tracked-button short links, which stop being minted once the hourly sync overwrites `buttons` and drops `track` (`whatsappTemplateSyncService.ts:36-52`).
- **Usage against plan limits (❌): evidence extended.** No usage meter exists (Billing shows plan and days left only). See the side observation on email caps.
- **Facebook Token Expiry (❌): evidence corrected.** "No periodic check" was too strong. The hourly template sync calls Meta with the token, but a failure only reaches `console.error` (`templateStatusWorker.ts:36-50`).
- **Custom analytics alerts (❌): evidence corrected.** `saved_analyses` accepts five types, but only the Funnels page saves analyses.
- **Campaign values (❌): evidence corrected.** utm_medium is pre-filled from the channel query parameter, not typed.
- **Content API (🟡): cross-reference added** to module 23's P0 for the missing SSRF guard on the HTTP Request node.
- **Storees-only strengths: four items removed.**
  - **Control-group lift per goal:** MoEngage reports CG and GCG uplift per attribution type (module 15) and has campaign control groups (module 01 ✅), so this is parity.
  - **Transactional messaging in base plans:** MoEngage's base plan also runs event-triggered campaigns and flows. Inform adds the send API, fallbacks and logs that Storees lacks (Single API row, P1). Its cited evidence, the logs filter, matches no rows.
  - **Encrypted, tested, SSRF-guarded connector credentials:** building blocks rather than an advantage over MoEngage. They stay in the OAuth rows' gap text.
  - **Meta Conversions API relay:** MoEngage offers a Meta Ads Conversions app (paid add-on), and module 05 rates Storees' relay 🟡 Partial.

  Kept items were tightened: per-recipient UTM works through variable mappings, the tracked-button caveat was added, and re-categorisation recipients are limited to home-project admins.
- **Rows I tried and failed to refute:** these searches found nothing that would change a status.
  - oauth2, client_credentials, grant_type, token_url, refresh_token
  - UTM or time zone keys in `projects.settings`
  - last interaction, first touch, multi-touch, linear, attribution_model, in-session
  - mandatory and requireGoal
  - alert, notify, notification centre, bell, slack, msteams
  - threshold, failure rate, auto-pause, circuit breaker, error rate
  - debug_token, OAuthException, token expiry
  - digest, scheduled report, weekly report, dashboard subscription
  - CSV, Content-Disposition, Blob downloads
  - domain allowlist or whitelist
  - vault, tokenize, PII settings
  - alerting in `packages/ml`
- **Side observations (outside this module's scope):**
  - **Email bypasses the plan gate.** `checkSendAllowed` runs only inside `deliveryService.send` (`deliveryService.ts:102-111`). Campaign and flow emails call `sendEmail` directly (`campaignService.ts:993`; `flowExecutor.ts:750`), so:
    - the trial's 500-email cap is never enforced;
    - an expired or suspended project can still send email campaigns and flow emails.
    - Separately, `checkSendAllowed` maps SMS and push to the WhatsApp cap key while counting each channel's own rows (`entitlementService.ts:138-145`).
  - **The legacy Pinnacle fallback** (`pinnacleProvider.ts`) posts a generic payload to an env-configured `PINNACLE_API_URL/v1/send` and ignores the per-project key saved in Settings.
- **Cross-module consistency review (completeness pass):** Service type: SMS Custom Connector ❌ → 🟡, matching module 19 and this module's Content API row, which both credit the flow HTTP Request step as a narrow, flows-only route to any HTTP gateway.

### Screens

Screenshots 013-027 and 045 show workspace team-member email addresses in the Created by and Subscribed by columns and filters. Scrub them before sharing this report outside the team.

#### Authorization Configuration

![Authorization configuration empty state with disabled '+ Add OAuth config' button](../screenshots/24-settings-advanced-2-001-auth-config-empty.jpg)
*Authorization configuration empty state with disabled '+ Add OAuth config' button*

![Header tooltip: 'Configure OAuth settings to use in Custom Connector campaigns.'](../screenshots/24-settings-advanced-2-002-auth-config-info-tooltip.jpg)
*Header tooltip: 'Configure OAuth settings to use in Custom Connector campaigns.'*

![Disabled Add OAuth config button tooltip: 'Your role does not have permission to add new configs'](../screenshots/24-settings-advanced-2-003-auth-config-add-disabled-tooltip.jpg)
*Disabled Add OAuth config button tooltip: 'Your role does not have permission to add new configs'*

#### UTM Tracking

![UTM tracking page: 'UTM parameters' master toggle off and disabled, with help note](../screenshots/24-settings-advanced-2-004-utm-tracking-toggle-off.jpg)
*UTM tracking page: 'UTM parameters' master toggle off and disabled, with help note*

#### Conversion And Attribution

![Conversion and Attribution form: model, conversion view, mandatory-goal toggle, Save](../screenshots/24-settings-advanced-2-005-conversion-attribution-page.jpg)
*Conversion and Attribution form: model, conversion view, mandatory-goal toggle, Save*

![Header tooltip explaining default attribution model and conversion metrics](../screenshots/24-settings-advanced-2-006-conversion-attribution-info-tooltip.jpg)
*Header tooltip explaining default attribution model and conversion metrics*

![Default Attribution Model dropdown: All Interactions, Last Interaction](../screenshots/24-settings-advanced-2-007-attribution-model-dropdown.jpg)
*Default Attribution Model dropdown: All Interactions, Last Interaction*

![Hover description of 'All Interactions' model](../screenshots/24-settings-advanced-2-008-attribution-all-interactions-desc.jpg)
*Hover description of 'All Interactions' model*

![Hover description of 'Last Interaction' model](../screenshots/24-settings-advanced-2-009-attribution-last-interaction-desc.jpg)
*Hover description of 'Last Interaction' model*

![Conversion View dropdown: Total conversion, Click through conversion](../screenshots/24-settings-advanced-2-010-conversion-view-dropdown.jpg)
*Conversion View dropdown: Total conversion, Click through conversion*

![Hover description of 'Total conversion'](../screenshots/24-settings-advanced-2-011-conversion-view-total-desc.jpg)
*Hover description of 'Total conversion'*

![Hover description of 'Click through conversion'](../screenshots/24-settings-advanced-2-012-conversion-view-click-through-desc.jpg)
*Hover description of 'Click through conversion'*

#### Alert Management

![General alerts list: 9 out-of-the-box alerts with type, creator, subscribers, channel](../screenshots/24-settings-advanced-2-013-alert-management-list.jpg)
*General alerts list: 9 out-of-the-box alerts with type, creator, subscribers, channel*

![Alert management header tooltip](../screenshots/24-settings-advanced-2-014-alert-management-info-tooltip.jpg)
*Alert management header tooltip*

![Filter alerts popover: Alert on, Created by, Subscribed by, Reset/Cancel/Apply](../screenshots/24-settings-advanced-2-015-alert-filter-panel.jpg)
*Filter alerts popover: Alert on, Created by, Subscribed by, Reset/Cancel/Apply*

!['Alert on' filter options (top of list)](../screenshots/24-settings-advanced-2-016-alert-filter-alert-on-dropdown.jpg)
*'Alert on' filter options (top of list)*

!['Alert on' filter options scrolled to Flow Stats, Whatsapp Template Suspension](../screenshots/24-settings-advanced-2-017-alert-filter-alert-on-dropdown-bottom.jpg)
*'Alert on' filter options scrolled to Flow Stats, Whatsapp Template Suspension*

!['Created by' filter: workspace team members](../screenshots/24-settings-advanced-2-018-alert-filter-created-by.jpg)
*'Created by' filter: workspace team members*

!['Subscribed by' filter: workspace team members](../screenshots/24-settings-advanced-2-019-alert-filter-subscribed-by.jpg)
*'Subscribed by' filter: workspace team members*

![Row kebab menu: View, Subscribe to email](../screenshots/24-settings-advanced-2-020-alert-row-menu.jpg)
*Row kebab menu: View, Subscribe to email*

![Alert view: Data Exports Paused (export auto-paused condition, members)](../screenshots/24-settings-advanced-2-021-alert-view-data-exports-paused.jpg)
*Alert view: Data Exports Paused (export auto-paused condition, members)*

![Alert view: Timebased Flows FUP, 'Send alert when usage reaches 100 %'](../screenshots/24-settings-advanced-2-022-alert-view-flows-fup.jpg)
*Alert view: Timebased Flows FUP, 'Send alert when usage reaches 100 %'*

![Alert view: Default Events Usage, Event usage Is greater than 511 with plan-limit notes](../screenshots/24-settings-advanced-2-023-alert-view-events-usage.jpg)
*Alert view: Default Events Usage, Event usage Is greater than 511 with plan-limit notes*

![Alert view: Default User Attribute Usage, User attribute usage Is greater than 255](../screenshots/24-settings-advanced-2-024-alert-view-user-attribute-usage.jpg)
*Alert view: Default User Attribute Usage, User attribute usage Is greater than 255*

![Alert view: Failure Rate Breach, Failure rate > 25 % in the last Day, with Filter by campaigns/channels/delivery type/tags](../screenshots/24-settings-advanced-2-025-alert-view-failure-rate-breach.jpg)
*Alert view: Failure Rate Breach, Failure rate > 25 % in the last Day, with Filter by campaigns/channels/delivery type/tags*

![Alert view: Campaign Expiry in the next 7 Day(s) with filters](../screenshots/24-settings-advanced-2-026-alert-view-campaign-expiry.jpg)
*Alert view: Campaign Expiry in the next 7 Day(s) with filters*

![Alert view: APNS Token Expiry in the next 7 Day(s)](../screenshots/24-settings-advanced-2-027-alert-view-apns-token-expiry.jpg)
*Alert view: APNS Token Expiry in the next 7 Day(s)*

![Deep link ?tab=custom: 'No custom alerts created yet!' (custom alerts tab not exposed)](../screenshots/24-settings-advanced-2-043-alert-management-custom-tab-empty.jpg)
*Deep link ?tab=custom: 'No custom alerts created yet!' (custom alerts tab not exposed)*

![Search by alert name 'Expiry' returns 3 alerts (filter dot shown on Filter alerts)](../screenshots/24-settings-advanced-2-045-alert-search-results.jpg)
*Search by alert name 'Expiry' returns 3 alerts (filter dot shown on Filter alerts)*

#### Alert destination (hidden route)

![Alert destination plan-locked state: contact CSM to enable](../screenshots/24-settings-advanced-2-044-alert-destination-locked.jpg)
*Alert destination plan-locked state: contact CSM to enable*

#### Dashboard Subscriptions

![Dashboard subscriptions empty state with search and + Create subscription](../screenshots/24-settings-advanced-2-028-dashboard-subscriptions-empty.jpg)
*Dashboard subscriptions empty state with search and + Create subscription*

![Header tooltip explaining dashboard subscriptions](../screenshots/24-settings-advanced-2-029-dashboard-subscriptions-info-tooltip.jpg)
*Header tooltip explaining dashboard subscriptions*

![Subscribe to Dashboard modal (Weekly on Sunday at 08:00 am default)](../screenshots/24-settings-advanced-2-030-subscribe-to-dashboard-modal.jpg)
*Subscribe to Dashboard modal (Weekly on Sunday at 08:00 am default)*

![Dashboard picker: no custom dashboards available](../screenshots/24-settings-advanced-2-031-subscribe-dashboard-dropdown-empty.jpg)
*Dashboard picker: no custom dashboards available*

![Frequency options: Daily, Weekly, Monthly](../screenshots/24-settings-advanced-2-032-subscribe-frequency-dropdown.jpg)
*Frequency options: Daily, Weekly, Monthly*

![Weekly day options Sunday..Saturday](../screenshots/24-settings-advanced-2-033-subscribe-weekday-dropdown.jpg)
*Weekly day options Sunday..Saturday*

![Monthly frequency layout: on \[First\] \[Sunday\] at time (unsaved local state)](../screenshots/24-settings-advanced-2-034-subscribe-monthly-layout.jpg)
*Monthly frequency layout: on \[First\] \[Sunday\] at time (unsaved local state)*

![Monthly day options: Last day, 1st..31st day, First/Second/Third/Fourth/Last](../screenshots/24-settings-advanced-2-035-subscribe-monthly-day-dropdown.jpg)
*Monthly day options: Last day, 1st..31st day, First/Second/Third/Fourth/Last*

![Daily frequency layout: time only (unsaved local state, then Cancel)](../screenshots/24-settings-advanced-2-036-subscribe-daily-layout.jpg)
*Daily frequency layout: time only (unsaved local state, then Cancel)*

#### Inform (Miscellaneous)

![Inform upsell hero with Learn more / I'm interested and not-enabled banner](../screenshots/24-settings-advanced-2-037-inform-landing-top.jpg)
*Inform upsell hero with Learn more / I'm interested and not-enabled banner*

![Inform tab: Single API for every channel and every provider](../screenshots/24-settings-advanced-2-038-inform-tab-single-api.jpg)
*Inform tab: Single API for every channel and every provider*

![Inform tab: Template Management, take control of transactional messaging](../screenshots/24-settings-advanced-2-039-inform-tab-template-management.jpg)
*Inform tab: Template Management, take control of transactional messaging*

![Inform tab: Centralized Logs, debug alerts in real time](../screenshots/24-settings-advanced-2-040-inform-tab-centralized-logs.jpg)
*Inform tab: Centralized Logs, debug alerts in real time*

![Inform tab: Growth Opportunity, transactional to revenue streams](../screenshots/24-settings-advanced-2-041-inform-tab-growth-opportunity.jpg)
*Inform tab: Growth Opportunity, transactional to revenue streams*

![Zoom of Inform architecture diagram: single API fan-out to Email/SMS/WhatsApp/Push/Any channel vendors](../screenshots/24-settings-advanced-2-042-inform-diagram-zoom.png)
*Zoom of Inform architecture diagram: single API fan-out to Email/SMS/WhatsApp/Push/Any channel vendors*
