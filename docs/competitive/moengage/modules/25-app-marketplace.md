## 25. App Marketplace (integrations)

Storees has no integrations catalog: its connectors are spread over six screens, and the only `/integrations` URL lands everyone except super admins on a "Super admins only" page. Where Shopify D2C needs them, its native integrations go deeper than MoEngage's listings: an install that provisions the whole account, no-code Event Sources, signed webhooks, three WhatsApp connection paths and a native WhatsApp bot. It trails on ad-audience sync, Indian SMS and WhatsApp gateways, ESP delivery webhooks and partner breadth. Of 77 rows, 4 are full, 40 partial, 26 missing, 3 Storees-better and 4 not applicable. There are two P0s: a Shopify reinstall or re-auth silently erases every channel credential, and Indian SMS lacks the DLT fields operators require.

### MoEngage overview

The App Marketplace (`/v4/partners`) is MoEngage's integrations catalog. A sidebar icon opens it directly, with no flyout.

- **Catalog.** 165 partner listings appear as 170 cards, because five WhatsApp providers are also listed under SMS. They sit in 35 categories plus four curated collections: New (7), Popular (12), Alert management (3) and Connected Apps (15).
  - 146 listings are built by MoEngage and 19 by partners.
  - Search matches partner names only.
  - Category, collection and search filters live in URL parameters.
  - Every view ends with "Suggest a partner", a two-field modal.
- **Cards.** Each card shows:
  - logo, name, "Built by" and a one-liner;
  - a category chip with "+1 more" for multi-category partners;
  - an optional New or Coming soon badge;
  - an optional green connected check (only Netcore has one).

  Coming-soon cards open an "Are you interested?" Yes/No modal instead of a detail page.
- **Detail pages** (`/v4/partners/<slug>`). The Description tab has a 1-4 slide carousel, use cases, "View setup guide" and "Get in touch". In-product connectors add an Integrate tab (`?tab=1`) in one of five patterns:
  - **A, integration list with "+ Add integration":** Shopify, Segment, Amplitude, Sendgrid, Netcore, Facebook audience.
  - **B, "Request access" gate:** Mixpanel, S3, Snowflake, BigQuery, Meta Ads Conversions, Microsoft Ads Audience, Telegram, Viber, Slack, Webhooks.
  - **C, OAuth:** "Sign in with Google" for Google Ads Audience.
  - **D, Shopify app-store install:** Shopify 2.0.
  - **E, embedded Zapier workflow templates.**

  About 60% of the detail pages opened are description-only. They rely on Connector Campaigns (webhooks), Content APIs, channel settings or setup on the partner's side.
- **Native connectors** cluster in a few groups:
  - ESP, SMS and WhatsApp senders;
  - ad-audience sync (12 platforms) and conversion APIs (4);
  - warehouse and cloud-storage import and export;
  - CDP and analytics data in and out;
  - Shopify (Web SDK injection only);
  - Salesforce bi-directional sync;
  - Zapier.
- **Permissions:** "+ Add integration", "Sign in with Google" and "+ Create app" stay visible but disabled for this role, with a reason in the tooltip.
- **Quirks:** the Support category filter renders no cards, and an empty "Custom destinations" heading appears in All categories.

**Capture caveats:**
- The user had no permission to integrate or create apps, so no configuration form was seen.
- Buttons that send or install were not clicked: Get in touch, Request access, Install, Use this workflow, Done and Submit.
- About 45 of the 165 detail pages were opened (at least one per category). Card text was captured for all of them.
- The Integrate tabs of Viber, BigQuery and Amplitude were captured as text only.
- Nothing was saved, connected, requested or submitted.

| Page visited | URL path |
|---|---|
| App Marketplace landing (All collections) | `/v4/partners` |
| All categories view | `/v4/partners?categories=All+categories&collections=&integrated=false&search=` |
| Category filter views (all 35 categories) | `/v4/partners?categories=<Category>&collections=&integrated=false&search=` |
| Collection filter views (New, Popular, Alert management, Connected Apps) | `/v4/partners?categories=&collections=<Collection>&integrated=false&search=` |
| Search results | `/v4/partners?categories=All+categories&collections=&integrated=false&search=<term>` |
| Coming-soon interest modal | modal on `/v4/partners` |
| Partner detail: Shopify | `/v4/partners/shopify` |
| Partner detail: Shopify 2.0 | `/v4/partners/shopify-2-0` |
| Partner detail: Segment (CDP) | `/v4/partners/segment` |
| Partner detail: Mixpanel (Analytics) | `/v4/partners/mixpanel` |
| Partner detail: Zapier (Automation) | `/v4/partners/zapier` (Integrate `?tab=1`) |
| Partner detail: Rokt Calendar (Calendar) | `/v4/partners/rokt-calendar` |
| Partner detail: Amazon S3 (Cloud storages) | `/v4/partners/amazon-s3` |
| Partner detail: AccuWeather (Contextual location) | `/v4/partners/accuweather` |
| Partner detail: Verloop (Conversational messaging) | `/v4/partners/verloop` |
| Partner detail: Meta Ads Conversions (Conversions, New) | `/v4/partners/meta-ads-conversions` |
| Partner detail: Salesforce (CRM, New) | `/v4/partners/salesforce` |
| Partner detail: Snowflake (Data warehouses) | `/v4/partners/snowflake` |
| Partner detail: Lob (Direct mail) | `/v4/partners/lob` |
| Partner detail: Movable Ink (Dynamic content) | `/v4/partners/movable-ink` |
| Partner detail: Stripo (Email template, Built by Stripo) | `/v4/partners/stripo` |
| Partner detail: Sendgrid (Emails) | `/v4/partners/sendgrid` |
| Partner detail: Netcore (Emails, connected check) | `/v4/partners/netcore` |
| Partner detail: Hightouch (ETL, Built by Hightouch) | `/v4/partners/hightouch` |
| Partner detail: VWO (Experimentation, Built by VWO) | `/v4/partners/vwo` |
| Partner detail: Flyy (Gamification) | `/v4/partners/flyy` |
| Partner detail: Phrasee (Generative AI) | `/v4/partners/phrasee` |
| Partner detail: Sheetdb (Google Sheets) | `/v4/partners/sheetdb` |
| Partner detail: Appsflyer (Install attribution, Built by Appsflyer) | `/v4/partners/appsflyer` |
| Partner detail: edu Me (Learning) | `/v4/partners/edu-me` |
| Partner detail: Crowdin (Localisation) | `/v4/partners/crowdin` |
| Partner detail: Talon.one (Loyalty, Built by Talon.one) | `/v4/partners/talon-one` |
| Partner detail: Telegram (Messaging apps / Connected App) | `/v4/partners/telegram` |
| Partner detail: Slack (Alert management) | `/v4/partners/slack` |
| Partner detail: PassKit (Mobile wallets) | `/v4/partners/passkit` |
| Partner detail: Apxor (Nudges) | `/v4/partners/apxor` |
| Partner detail: Facebook audience (Retargeting) | `/v4/partners/facebook-audience` |
| Partner detail: Twilio (SMS) | `/v4/partners/twilio` |
| Partner detail: Purchasely (Subscriptions) | `/v4/partners/purchasely` |
| Partner detail: Zendesk (Support) | `/v4/partners/zendesk` |
| Partner detail: Typeform (Survey) | `/v4/partners/typeform` |
| Partner detail: Exotel (Voice calls) | `/v4/partners/exotel` |
| Partner detail: Karix (SMS, Whatsapp providers) | `/v4/partners/karix` |
| Partner detail: Webhooks (Automation / Alert management) | `/v4/partners/webhooks` |
| Partner detail: Gupshup (SMS) | `/v4/partners/gupshup` |
| Partner detail: Google Ads Audience (Retargeting) | `/v4/partners/google-ads-audience` |
| Partner detail: Viber (Messaging apps / Connected App) | `/v4/partners/viber` |
| Partner detail: Microsoft Ads Audience (Retargeting, New) | `/v4/partners/microsoft-ads-audience` |
| Partner detail: BigQuery (Data warehouses) | `/v4/partners/bigquery` |
| Partner detail: Amplitude (Analytics) | `/v4/partners/amplitude` |

### Storees counterpart

There is no catalog. `packages/frontend/src/app/(dashboard)/integrations/page.tsx` only redirects to `/projects`, a super-admin page (`packages/frontend/src/app/(dashboard)/projects/page.tsx:147-150`). The sidebar has no Integrations entry (`packages/frontend/src/components/layout/Sidebar.tsx:54-80`). Integrations live in these places:

- **Settings > SDK & Integration** (`packages/frontend/src/app/(dashboard)/settings/page.tsx`, admin only):
  - **Setup:** project info, the SDK Connection badge, the API key, and Script tag, Shopify Customer Events pixel, NPM and REST API snippets, plus recommended and auto-tracked events.
  - **Channels:**
    - email: Resend, SendGrid, Postmark, Mailgun, SES;
    - SMS: Twilio, Gupshup, Bird, Vonage, plus a Pinnacle tile with no sender behind it;
    - WhatsApp (`WhatsappChannelPanel.tsx`): Storees-managed, WhatsApp Cloud API and Pinnacle, plus the AI chatbot (`WhatsappChatbotPanel.tsx`);
    - push: FCM.
  - **AI:** Groq, OpenAI or Anthropic, with a model picker and a connection test.
- **Settings > Ad Conversions** (`packages/frontend/src/app/(dashboard)/settings/ad-conversions/page.tsx`; `packages/backend/src/routes/adConversions.ts`; `packages/backend/src/services/conversionApiService.ts`): Meta CAPI works; Google, TikTok and Snap are "coming soon" stubs.
- **Settings > Webhooks** (`packages/frontend/src/app/(dashboard)/settings/webhooks/page.tsx`; `packages/backend/src/routes/webhookSubscriptions.ts`; `packages/backend/src/services/webhookService.ts`): signed outbound webhooks that fire on segment enter and exit only.
- **Event Sources** (`packages/frontend/src/app/(dashboard)/event-sources/page.tsx` and `[id]/page.tsx`; `packages/backend/src/routes/hooks.ts`; `packages/backend/src/routes/inboundWebhooks.ts`; admin only): no-code inbound webhooks.
- **Projects > Data Sources** (super admin only; `packages/frontend/src/components/data-sources/*`; `packages/backend/src/routes/dataConnectors.ts`): Shopify custom app, VirpanAI and Custom HTTP pull connectors.
- **Segments list > Export audience** (`packages/frontend/src/components/segments/ExportAudienceButton.tsx`; `packages/backend/src/services/adAudienceExport.ts`): hashed CSVs for Meta, Google, TikTok, Snap and Pinterest.
- **Flow HTTP Request node** (`packages/frontend/src/components/flows/StructuredFlowBuilder.tsx:1234-1297`; `packages/backend/src/services/flowExecutor.ts:822-880`).
- **Shopify public-app OAuth install** (`packages/backend/src/routes/integrations.ts:39-194`; `packages/frontend/src/app/(auth)/oauth/shopify/callback/page.tsx`).
- **v1 REST API** (`packages/backend/src/routes/v1Events.ts`; `packages/backend/src/routes/v1Import.ts`), authenticated by the public key only.

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Marketplace landing | App Marketplace hub: sidebar entry and one integrations catalog | Sidebar icon opens `/v4/partners`: header card, Collections and Categories rail, search, 4-up cards for 165 listings (170 cards) in 35 categories, Suggest-a-partner footer | ❌ Missing | `integrations/page.tsx:7-13` only redirects to the super-admin `/projects` (`projects/page.tsx:147-150`; `RequireSuperAdmin.tsx`). No sidebar entry (`Sidebar.tsx:54-80`). Shopify OAuth errors go to `/integrations?error=` (`shopifyService.ts:307-309`), although `oauth/shopify/callback/page.tsx:17-21` already shows `?error=`. Connectors are split over six screens (see Storees counterpart) | A merchant cannot see in one place what Storees connects to or what is connected, and a failed Shopify install lands on "Super admins only" with the error lost. Point Shopify errors at the callback page now (S). Then add an admin Integrations page to the sidebar that lists every connector with status and deep links, and point `/integrations` at it | P2 | M |
| Marketplace landing | Header actions: Know more, Watch video, Integrate with us | Help-article link, in-app YouTube modal ("Introducing MoEngage's App Marketplace"), partner developer docs link | 🟡 Partial | Settings > SDK & Integration > Setup has Script tag, Shopify pixel, NPM and REST API (cURL) snippets plus recommended events (`settings/page.tsx:126-131, 225-310`). No help links, videos, public API reference or OpenAPI spec (searched youtube, docs URLs, openapi, swagger, setup guide). The onboarding integration guide reaches only the super-admin wizard (`v1Onboarding.ts:123-376`) | In-app snippets exist, but there is no help content and no published API reference. Add a docs link per integration and publish the v1 API reference | P3 | S |
| Marketplace landing | Create app: forward segments or run campaigns through your own app | "+ Create app" (disabled: "You don't have permissions to create an app") and a Connected apps card, "Connect MoEngage to your app and forward segments or run campaigns" | 🟡 Partial | Settings > Webhooks forwards `customer.segment.entered/exited` to any HTTPS URL, with HMAC or Bearer auth, retries and a deliveries log (`webhookSubscriptions.ts`; `segmentService.ts:156-183`). The flow HTTP Request node calls any API per customer (`types.ts:733-747`; `flowExecutor.ts:822-880`). Campaign channels are a fixed list (`types.ts:173`) | Segments can reach a brand's own system, but there is no saved app definition and campaigns cannot send through a custom endpoint. Add a reusable custom app (endpoint, auth, payload template) that works as a campaign channel and as a flow step | P2 | M |
| Marketplace landing | Collections: All, New (7), Popular (12), Alert management (3), Connected Apps (15) | Curated collection filters in the left rail; All collections is the landing view | ❌ Missing | No catalog to curate, and nothing marks an integration new or popular (`settings/page.tsx:351-407`; `ad-conversions/page.tsx:17-22`) | Useful only once the hub exists; a "Popular with Shopify brands" collection would then guide onboarding | P3 | S |
| Marketplace landing | Categories filter with counts (35 categories, All, Connected apps) | Left-rail category list; one click shows only that category's cards | 🟡 Partial | Messaging providers are grouped into Email, SMS, WhatsApp and Push tabs (`settings/page.tsx:402-407, 461-497`). LLM providers have their own AI section, and ad platforms appear only under Ad Conversions. No taxonomy, counts or All view | Grouping exists per channel only. Group the hub by Ecommerce, Messaging, Ads, Data in, Data out and AI, with counts | P3 | S |
| Marketplace landing | Partner card anatomy: logo, name, Built by, one-liner, category chips, badges, connected check | The whole card opens `/v4/partners/<slug>`; multi-category partners show one chip plus "+1 more" | 🟡 Partial | Provider tiles show coloured initials ("SG", "Tw", "WA"), a name, a truncated description and a check on the selected provider (`settings/page.tsx:351-400, 511-534`; `WhatsappChannelPanel.tsx:18-22, 97-115`). No logos, category chips, "Built by" or badges | Initial-letter tiles look unfinished in demos. Use brand logos and add category and status chips | P3 | S |
| Marketplace landing | Status badges: New and Coming soon | "New" on Salesforce and the New collection; "Coming soon" on Fivetran, Treasure Data and Salesforce Marketing Cloud | 🟡 Partial | Ad Conversions lists Google Ads, TikTok and Snap as disabled "(coming soon)" options (`ad-conversions/page.tsx:17-22, 99-103`). No "New" badge anywhere | Coming soon appears on one form only. Add New and Coming soon badges to hub cards | P3 | S |
| Marketplace landing | Partner search (instant, names only, `?search=`) | Search box with a clear button; "shop" returns Shopify, Shopify 2.0 and Shopflo; no results shows Suggest a partner | ❌ Missing | No search on Settings > Channels, Ad Conversions, Webhooks or Event Sources (`settings/page.tsx`; `event-sources/page.tsx`) | Needed only once the catalog grows past a few dozen entries | P3 | S |
| Marketplace landing | Suggest a partner modal | Footer link opens Partner name\* (120 chars) and Description\* (200 chars) with Cancel and Submit | ❌ Missing | Searched the frontend for suggest, request access, waitlist, notify me, feature request and feedback: no form | Merchants have no way to ask for an integration. A two-field form that stores the request or emails the team is enough | P3 | S |
| Marketplace landing | Section collapse (Show less / Show all) | Each collection section collapses to one row | ❌ Missing | No collection sections exist (see the hub row) | Comes with the hub | P3 | S |
| Marketplace landing | URL-driven filter state and deep links | `categories`, `collections`, `integrated` and `search` are URL params; the Integrate tab is `?tab=1` | 🟡 Partial | Top-level Settings tabs are routes (`settings/layout.tsx:12-27`), and each Event Source has its own `/event-sources/[id]` page. Settings sections and channel tabs are component state that always opens on Channels > WhatsApp (`settings/page.tsx:57, 410`). No connected-only filter | Support cannot send a merchant a link to "Setup > Shopify pixel". Put the section and channel in the query string | P3 | S |
| Marketplace landing | "Custom destinations" section (empty heading, likely feature-flagged) | An empty heading after CRM in All categories, with no cards and no left-nav entry | 🟡 Partial | Settings > Webhooks takes an HTTPS URL, HMAC or Bearer auth, custom headers and one of three retry presets, with Test and a deliveries table with Resend (`settings/webhooks/page.tsx:20-24, 313-335`; `webhookService.ts`). Only the two segment events fire; `customer.created/updated` are marked not live (`useWebhooks.ts:42-47`), and `segmentService.ts:170` is the only `emitWebhookEvent` caller | Destinations receive segment changes only. Emit customer, order and message events (sent, delivered, clicked) so the same webhook covers streaming | P2 | M |
| Catalog & detail pages | Catalog composition: 146 MoEngage-built and 19 partner-built listings | Partner-built listings include Rudderstack, Stripo, Hightouch, VWO, Branch, AppsFlyer, Talon.one, Infobip and Pipedrive (built by Zapier) | ❌ Missing | No partner program or partner-built integration. v1 routes accept the public key alone (`v1Events.ts:102-103`; `v1Import.ts:33`), and the secret-key check `requireApiKeyAuth` has no callers (`apiKeyAuth.ts:64`). That public key is embedded in storefront snippets | Partners cannot build on Storees safely. This needs enforced secret-key or OAuth auth, a published API reference and a listing process | P3 | XL |
| Catalog & detail pages | Description-only partner listings (about 60% of the detail pages opened) | Docs and "Get in touch", no Integrate tab: Rokt Calendar, AccuWeather, Verloop, Salesforce, Lob, Movable Ink, Stripo, Hightouch, VWO, Flyy, Phrasee, Sheetdb, Appsflyer, eduMe, Crowdin, Talon.one, PassKit, Apxor, Twilio, Gupshup, Purchasely, Zendesk, Typeform, Exotel, Karix | ❌ Missing | No partner directory or recipes. The same mechanisms exist: Event Sources (`hooks.ts:17-63`; `inboundWebhookService.ts`), outbound webhooks and the flow HTTP Request node (`flowExecutor.ts:822-880`). Searched gokwik, razorpay, shiprocket, gorgias and judge.me: none | A cheap way to show breadth in deals. Build a "Works with" directory with recipes for partners Indian D2C brands use: Shopflo, GoKwik, Razorpay, Shiprocket, Judge.me and Gorgias | P2 | S |
| Catalog & detail pages | Coming soon "Are you interested?" modal | Yes/No toggle (Yes preselected); a Description box (0/200) shows only for Yes; Cancel and Done | ❌ Missing | Coming-soon ad platforms are disabled select options with helper text (`ad-conversions/page.tsx:17-22, 75, 99-103`). No interest capture | Demand for the Google, TikTok and Snap relays is invisible. Add "Notify me" with a use-case box | P3 | S |
| Catalog & detail pages | Partner detail page: breadcrumb, about text, setup guide, category, Get in touch, Description carousel, Integrate tab | Left info panel plus a Description tab (carousel and use-case text); in-product connectors add an Integrate tab (`?tab=1`) | 🟡 Partial | Config forms open inline under a one-line description. Setup steps exist only for the Shopify pixel (`settings/page.tsx:234-247`), the Shopify custom app (`AddConnectorDialog.tsx:206-209`) and Meta WhatsApp (`MetaConnect.tsx`). No detail pages, docs links, use cases or contact CTA | Merchants see credential fields before learning what an integration does. Add a panel per integration covering what it does, what syncs and a setup guide | P3 | S |
| Integrate patterns & access | Integrate pattern A: integration list with "+ Add integration" | Shopify ("Send user data directly to MoEngage"), Segment and Amplitude ("Send campaign data to ..."), Sendgrid, Netcore, Facebook audience ("Send cohorts to Facebook Audiences") | 🟡 Partial | List-plus-Add with several instances: Ad Conversions (`ad-conversions/page.tsx:24-60`), outbound webhooks, Event Sources and Data Sources (`ConnectorsSection.tsx`). Messaging allows one provider per channel ("Configure one provider per channel", `settings/page.tsx:457`; `channelProviderRegistry.ts:169-202`). `projects` has separate marketing and transactional ESP columns (`schema.ts:53-54`; `emailProviderRegistry.ts:63-66`), but saving sets both to the same provider (`routes/ai.ts:323-324`) | A brand cannot run two ESPs (say promotional and transactional) or two SMS gateways. The email split is half built: expose both columns and store a config per provider | P3 | M |
| Integrate patterns & access | Integrate pattern B: "Request access" gate | Illustration, two benefit blurbs and Request access: Mixpanel, S3, Snowflake, BigQuery, Meta Ads Conversions, Microsoft Ads Audience, Telegram, Viber, Slack, Webhooks | 🟡 Partial | Plan entitlements gate premium features server-side, with a lock and "Upgrade to unlock" (`entitlementService.ts:15-49`; `WhatsappChatbotPanel.tsx:75-81`). `ad_audience_export` is declared (`entitlementService.ts:15, 38`) but never checked; the export route checks only `exportCustomers` (`segments.ts:157`) | Self-serve upgrade suits Shopify merchants better than a sales gate. Enforce the audience-export entitlement or drop it | P3 | S |
| Integrate patterns & access | Integrate pattern C: OAuth connect ("Sign in with Google" for Google Ads Audience) | "Connect your Google Ads account... We recommend using a shared account so the connection is not dependent on a single user." | 🟡 Partial | The only integration OAuth is the Shopify install (`routes/integrations.ts:39-194`). Google and GitHub sign-in serve admin login only (`lib/auth.ts:2-16`). Meta WhatsApp needs a pasted Phone Number ID, WABA ID and token (`MetaConnect.tsx`), and Meta CAPI a pixel ID and token (`ad-conversions/page.tsx:66-160`). No FB.login or Embedded Signup | Pasting tokens is the main setup drop-off, and it rules out Google Ads. Add OAuth connect for Google and Meta alongside audience sync (module 20 rates Embedded Signup P1) | P2 | M |
| Integrate patterns & access | Integrate pattern D: app-store install (Shopify 2.0 "Install Moengage app on your Shopify store") | Empty state with an install button; the "Moengage 2.0" Shopify app asks for store data and customers, then injects the Web SDK | ⭐ Storees better | The Shopify public-app OAuth install (`routes/integrations.ts:55-194`): creates or links the project on a 14-day trial, stores the encrypted token, registers webhooks (:111), activates the ecommerce pack and default flows (:127-128), queues historical sync (:131), pulls the brand kit (:136), and creates and signs in the shop owner (:141-190) | One approval gives data, segments and flows; MoEngage's app only adds the SDK. Caveats: there is no in-app install button or status screen, and a reinstall wipes project settings (Shopify Integrate tab row, P0) | — | — |
| Integrate patterns & access | Integrate pattern E: Zapier app with embedded workflow templates | "Connect MoEngage with any app on Zapier": Salesforce, Jotform, Google Forms, HubSpot, Google Contacts and LeadSquared templates with "Use this workflow" | 🟡 Partial | No Zapier app (searched zapier). "Webhooks by Zapier" can POST to an Event Source (`hooks.ts:17-63`), and outbound webhooks or the HTTP Request node can call a Zapier catch hook (`webhookService.ts`; `flowExecutor.ts:822-880`) | Only teams that wire raw webhooks can use it: no listed app, templates or authenticated triggers and actions. A Zapier app (create or update customer, track event, trigger on segment entered) would open up CRMs and form tools | P2 | M |
| Integrate patterns & access | Permissions model: integrate and create-app gated per role, disabled with a tooltip | "You do not have permission to integrate." on Add integration and Sign in with Google; "You don't have permissions to create an app." | 🟡 Partial | Gating is UI-only: admin-only Settings tabs (`settings/layout.tsx:12-27, 33-40`), admin-only Event Sources (`Sidebar.tsx:63`), super-admin Data Sources (`projects/page.tsx:147-150`). Integration APIs check only login and project membership (`index.ts:197-208`; `dataConnectors.ts:65-338`; `adConversions.ts`; `webhookSubscriptions.ts:65`; `routes/ai.ts:280`), and membership only when `ENFORCE_PROJECT_MEMBERSHIP=true` (`membership.ts:76`). `requireRole('admin')` exists (`agentScope.ts:59`; used on `segments.ts:187`) but not here. Custom roles enforce only `viewContactPii` and `exportCustomers`; `screens` is always `'*'` (`capabilities.ts:15-47`; `settings/roles/page.tsx:47-51`) | Any member, including an agent or a PII-masked role, can replace messaging credentials or add an outbound webhook that sends raw email and phone (`segmentService.ts:170-178`). Put `requireRole('admin')` or an integrations permission on these routes, and show disabled controls with a reason instead of hiding screens | P1 | S |
| Integrate patterns & access | Connected indicator | Green check on the Netcore card, although its Integrate tab lists no rows; `integrated=true` returns 0 apps | 🟡 Partial | Each surface has its own signal: provider name in green on the channel tab (`settings/page.tsx:486-490`), the SDK Connection badge (:168-190), the WhatsApp status header (`WhatsappChannelPanel.tsx:69-80`), Data Sources status dot and last sync (`ConnectorsSection.tsx:146-150`), Ad Conversions sent/failed and last error (`ad-conversions/page.tsx:170-214`). The SDK badge counts only `source='sdk'` (`v1ApiKeys.ts:129-137`), but the Shopify pixel sends `source: 'shopify_pixel'` (`shopifyPixel.ts:75`) | No single connected view, and pixel-only Shopify stores read "Not Connected". Count pixel events and show status on hub cards | P3 | S |
| Integration mechanisms | Connector Campaigns: per-user webhook with method, URL, headers and a Form/JSON/Raw body | Used by Rokt Calendar, Verloop, Lob, Zendesk and Exotel; the Zendesk carousel shows URL, headers and body type | 🟡 Partial | The flow HTTP Request node supports GET, POST, PUT, PATCH and DELETE, headers, and a body template with `{{customer_*}}`, `{{event.*}}` and `{{node_outputs.*}}` tokens; the response is kept for later steps (`types.ts:733-747`; `StructuredFlowBuilder.tsx:1234-1297`; `flowExecutor.ts:822-880`). The body is labelled JSON, it is not a campaign type, and it has no SSRF guard (module 23, P0) | Event-triggered calls work in flows; one-time or periodic broadcasts to an endpoint do not. Add a connector campaign type once the SSRF guard is in | P3 | M |
| Integration mechanisms | Content APIs: partner data fetched at send time | Sheetdb, Talon.one, eduMe, Yotpo and AccuWeather personalise messages with live API responses | 🟡 Partial | An HTTP Request response is stored at `trip.context.node_outputs.<key>`, and later sends bind to it (`flowExecutor.ts:650-655, 875-879`). There is no reusable registry, and campaign and template variables cover only customer, attribute, product, project and event fields (`variableSources.ts:13-53`) | Loyalty balances, coupons or live stock can personalise flows only, and every flow repeats the API setup. Add a named content-source registry that campaigns can use (module 23, P2) | P2 | M |
| Integration mechanisms | Server-to-server data in from partners (users and events) | Purchasely, Segment server-to-server, Snowplow and Shopflo push events in | ✅ Full | v1 API: `/events` (`v1Events.ts:114`), `/events/batch` up to 1000 (:274), `/customers` (:563), `/identify` (:989), `/import/customers`, `/orders`, `/products` (`v1Import.ts:57-370`). Event Sources: no-code inbound webhooks with a payload log, schema inference and event definitions (`hooks.ts`; `inboundWebhooks.ts`; `inboundWebhookService.ts`) | Covered. Caveat: v1 accepts the public storefront key alone (`apiKeyAuth.ts:64` unused), so anyone holding it can import or overwrite customers and orders | — | — |
| Ecommerce | Shopify integration: data captured | The app injects the Web SDK to track user events and data for web push, on-site, SMS, email and web personalisation | ⭐ Storees better | Storees captures far more:<br>• 17 webhook topics, including refunds, fulfillment events, carts, products and collections (`constants.ts:174-195`; `routes/webhooks.ts`)<br>• historical sync of customers, orders, products and collections (`syncWorker.ts`)<br>• GDPR webhooks (`webhooks.ts:197-302`)<br>• brand-kit sync (`shopifyService.ts:255-301`)<br>• a Customer Events pixel with checkout steps (`shopifyPixel.ts:25-146`)<br>• cart-attribute session stitching from the SDK (`sdk/src/shopifyCart.ts:22-82`) | Storees syncs orders, refunds, deliveries and the catalogue server-side; MoEngage's listing describes SDK event tracking only | — | — |
| Ecommerce | Shopify app installs on-site tracking automatically | The Shopify app injects the Web SDK; no code to paste | 🟡 Partial | The merchant must paste the Customer Events pixel (`settings/page.tsx:234-247`) or the script tag. No web pixel extension, ScriptTag or theme app embed (searched webPixelCreate, script_tags, shopify.extension.toml, app embed). The OAuth scopes lack `write_pixels` and `write_script_tags` (`shopifyService.ts:14-24`) | Without the paste, browse and `added_to_cart` events never arrive. The auto-created Abandoned Cart flow (trigger `added_to_cart`, `flows/src/templates.ts:18-27`) and browse abandonment then never fire; only `checkout_started` still arrives, from the checkouts/create webhook (`webhooks.ts:26`). Ship a web pixel extension that installs with the app, plus a theme app embed. Fix the settings wipe first, because a new scope sends every merchant back through the OAuth callback | P1 | M |
| Ecommerce | Shopify Integrate tab: merchant adds and manages the store connection | Shopify: "Send user data directly to MoEngage" with + Add integration. Shopify 2.0: "There are no integrations with Shopify added" with an install button | 🟡 Partial | `/shopify/status`, `/sync-status`, `/sync` and `/disconnect` exist (`routes/integrations.ts:285-405`), but no screen calls them. The frontend calls only `/shopify/connect`, from super-admin Data Sources and the wizard (`useDataConnectors.ts:198`; `onboarding/page.tsx:297`). Every OAuth callback runs `activatePack` (`routes/integrations.ts:127`), which sets `projects.settings` to `{ vertical }` (`verticalPackService.ts:296-299`). That erases channel credentials and the WhatsApp chatbot config (`settings.channels`), AI keys and the custom-app config | A project admin cannot see store status or last sync, and cannot resync or reconnect. Worse, any reinstall or scope re-auth silently disconnects WhatsApp, SMS, email and AI. Make `activatePack` merge settings before any scope change, then add a Shopify card in Settings | P0 | S |
| Ecommerce | Shopflo: checkout events forwarded from Shopflo | Shopflo (Ecommerce) forwards checkout events to MoEngage | ✅ Full | Shopflo posts to an Event Sources URL (`event-sources/[id]/page.tsx:585, 623`), and definitions map identity and properties. A `storees_sid` in the payload stitches the browsing session (`inboundWebhookService.ts:365-375`; `anonymousSessionService.ts:65-69`; `sdk/src/shopifyCart.ts:9-12`). Shopflo cart snapshots feed cart recovery (`cartFrictionService.ts:79-90`) | Covered, with session stitching that MoEngage's listing does not describe. Definitions are set up by hand (no preset), and the stitch needs the SDK script, not just the pixel | — | — |
| Ecommerce | Yotpo: UGC ratings and reviews in campaigns via Content APIs | Yotpo listing in the Ecommerce category | 🟡 Partial | No connector (searched yotpo, judge.me, judgeme). A flow HTTP Request node can GET a product's reviews from the Yotpo or Judge.me API, and later sends bind single values from `node_outputs` (`flowExecutor.ts:650-655, 822-880`). Campaigns cannot. Other social proof comes from Storees' own orders via `{{social_proof_*}}` (`flowExecutor.ts:656-662`) | Reviews reach flows only, one value per variable, set up per flow. A Judge.me or Yotpo source in the content registry would cover the D2C use case | P3 | M |
| CDP & analytics | CDP and event-pipeline data in (Segment, RudderStack, Snowplow, PostHog) | Segment device-mode SDK plus server-to-server; Rudderstack (partner-built); Snowplow forwards events | 🟡 Partial | No CDP destination or Segment-spec endpoint (searched segment.io, rudderstack, mparticle). Event Sources can receive a CDP webhook, but each definition emits one fixed event name stamped with receipt time (`inboundWebhookService.ts:396-407`). `/v1/events` expects Storees' own schema (`v1Events.ts:114-266`) | A Segment or RudderStack customer needs one definition per event, or custom transforms. Accept the Segment track/identify spec at a dedicated endpoint | P2 | M |
| CDP & analytics | Cohort import from CDPs and analytics (Segment Personas, Mixpanel and Amplitude cohorts, Dynamics 365 CI, Adobe RT-CDP) | External cohorts sync into MoEngage segments | ❌ Missing | No cohort sync and no static or list segments (`segments.ts` routes). The nearest path is attribute upserts through `/v1/customers`, which replace `custom_attributes` instead of merging them, despite the code comment (`v1Events.ts:608-616`) | External audiences can become segments only by tagging attributes through the API, and each upsert wipes the customer's other custom attributes | P3 | M |
| CDP & analytics | Campaign interaction data out (Segment, Amplitude, Mixpanel, Heap) | Integrate rows "Send campaign data to segment" and "Send campaign data to Amplitude"; Mixpanel and Heap export | ❌ Missing | Outbound webhooks emit only segment events (`segmentService.ts:170` is the only `emitWebhookEvent` caller). Message and click data stay in `messages` and `campaign_sends`. Searched mixpanel, amplitude and heap: none | Analytics teams cannot see Storees sends next to product data. First emit message events to outbound webhooks (the Custom destinations fix), then add per-tool formats | P2 | M |
| CDP & analytics | Enterprise CDPs (Tealium, mParticle, Dynamics 365 CI, Adobe Real-Time CDP, BlueConic, Treasure Data, Amperity) | Nine CDP listings; Treasure Data is marked Coming soon | ❌ Missing | Searched tealium, mparticle, dynamics, adobe, blueconic, treasure and amperity: none. Their webhook outputs could feed Event Sources (counted in the CDP data-in row), but segment sync is absent | Enterprise stacks, of little relevance to Shopify D2C | P3 | L |
| CDP & analytics | Google Tag Manager: forward events without code | GTM listing in the Analytics category | 🟡 Partial | The loader snippet (`settings/page.tsx:79-92`) can run in a GTM Custom HTML tag, and tags can call `Storees('track', ...)`. No GTM template or dataLayer mapping (searched dataLayer, googletagmanager) | Works for technical teams only. A GTM community template that maps dataLayer events would make it no-code | P3 | S |
| CDP & analytics | Install attribution (Branch, AppsFlyer, Adjust, Kochava, Singular, Trackier) | Install attribution data and AppsFlyer Audiences flow into MoEngage | ➖ N/A | Mobile-app install attribution. Storees has only browser SDKs (`packages/sdk/src`; `packages/sdk-react/src`) and already captures web UTMs (`sdk/src/autotrack.ts`) | Relevant only once Storees has a mobile SDK | — | — |
| Ads: audiences & conversions | Meta (Facebook) Custom Audience sync from segments | Facebook audience: "Send cohorts to Facebook Audiences" with + Add integration | 🟡 Partial | "Export audience" on the Segments list downloads a CSV of SHA-256 EMAIL, PHONE, FN and LN for manual upload (`ExportAudienceButton.tsx:15-23`; `segments.ts:157-185`; `adAudienceExport.ts:42-54`). No Marketing API call, no schedule, and no removal of members who leave | Retargeting and exclusion audiences go stale after upload. Push members to a Meta custom audience and keep it in sync on segment enter and exit; the hashing already exists | P1 | M |
| Ads: audiences & conversions | Google Ads Customer Match audience (Sign in with Google) | OAuth connect, then sync cohorts from segments to Google custom audiences | 🟡 Partial | Only a hashed CSV in Google's column format (`adAudienceExport.ts:56-67`). No OAuth, developer token or Google Ads API upload | Uploads are manual. API sync needs OAuth plus a developer token | P2 | L |
| Ads: audiences & conversions | TikTok, Snapchat and Pinterest audiences | Retargeting listings, in Connected Apps | 🟡 Partial | A CSV with generic hashed email and phone columns (`adAudienceExport.ts:69-86`) | Manual only. TikTok is unavailable in India, so this is low priority for Indian D2C | P3 | M |
| Ads: audiences & conversions | Microsoft, Amazon, Reddit, Criteo, Jampp and InMobi audiences; Truecaller Verified Campaigns | Retargeting listings; Microsoft, Amazon and Reddit are in the New collection | ❌ Missing | `SUPPORTED_PLATFORMS` is meta, google, tiktok, snap and pinterest (`adAudienceExport.ts:24`). Truecaller appears only as the SDK's one-tap recognition hook (`sdk/src/types.ts:28-31`; `sdk/src/core.ts:264-267`) | Amazon Ads matters to brands selling on Amazon; the rest are low relevance | P3 | M |
| Ads: audiences & conversions | Meta Ads Conversions API | Sends offline and real-world conversions to Meta Ads Manager; the Integrate tab is behind Request access | 🟡 Partial | Settings > Ad Conversions takes a pixel ID, encrypted token and test event code, and shows sent/failed counters, the last error and a Test button (`ad-conversions/page.tsx:17-214`; `routes/adConversions.ts`). Only non-historical purchase and recurring-revenue events are relayed (`customerAggregateWorker.ts:220-243`), so the AddToCart, InitiateCheckout and ViewContent mappings (`conversionApiService.ts:70-80`) never fire. Events go out as `action_source: 'website'` without `client_user_agent` or `event_source_url` (:146-160) | Purchases are relayed but funnel events are not, and website events lack fields Meta requires (module 05, P2) | P2 | S |
| Ads: audiences & conversions | TikTok and Snapchat Ads Conversions | Listings in the New collection | ❌ Missing | Shown as disabled "(coming soon)" options (`ad-conversions/page.tsx:20-21`). `relayToTikTok` and `relayToSnap` only throw "not yet implemented" (`conversionApiService.ts:190-200`) | Stubs only. Implement both relays with Meta's hashing (module 05 rates TikTok, Snap and Microsoft together P2/M). TikTok is unavailable in India | P3 | M |
| Ads: audiences & conversions | Microsoft Ads Conversions | Listing in the New collection | ❌ Missing | Not in the platform list (`ad-conversions/page.tsx:17-22`; `conversionApiService.ts:214-260`) | Low relevance for Indian D2C | P3 | S |
| CRM | Salesforce native bi-directional sync (AppExchange certified) | Contacts, activities, lead status and custom events flow in; engagement data flows back to Salesforce | ❌ Missing | Searched salesforce and hubspot: none | B2B and enterprise; low relevance to Shopify D2C | P3 | XL |
| CRM | LeadSquared and Pipedrive (lead import, ticket creation) | LeadSquared imports users and creates tickets through Connector Campaigns; Pipedrive is built by Zapier | 🟡 Partial | The Custom HTTP pull connector imports customers, products and orders from any REST API, with field maps, pagination and schedules (`connectors/templates/custom.ts`; `genericHttpConnector.ts`). It is super-admin only, and its dialog takes only name, base URL and key, so endpoints and field maps need the API (`AddConnectorDialog.tsx:213-245`). The HTTP Request node can create records. Searched leadsquared and pipedrive: none | Possible only with engineering help; low relevance to D2C | P3 | M |
| Data infrastructure | Data warehouses: BigQuery, Redshift, Snowflake, Databricks | Import users and events and export campaign events; all four are in Popular, with Integrate behind Request access | ❌ Missing | Searched bigquery, snowflake, redshift and databricks: none. Module 17 found the same | Larger D2C brands that export GA4 data to BigQuery ask for it. Start with BigQuery | P3 | L |
| Data infrastructure | Cloud storage: Amazon S3, Google Cloud Storage, Azure Blob, SFTP | S3 syncs users and events both ways; GCS and Azure export; SFTP | ❌ Missing | S3 is used only for Storees' own asset storage (`storageService.ts:3-50`). Searched sftp, gcs and azure: none | No scheduled file import or data dump. Start with S3 file import (module 17, P2/M), then exports | P2 | L |
| Data infrastructure | Reverse ETL: Hightouch, Census | Sync users and events from the warehouse into MoEngage (Hightouch is partner-built) | 🟡 Partial | A generic HTTP destination in these tools can target `/api/v1/events/batch` (1000 per call) and `/api/v1/import/*` (1000 rows, 20-way concurrency) (`v1Events.ts:274-556`; `v1Import.ts:36-416`). The single `/v1/events` rejects timestamps older than 7 days (`v1Events.ts:141-148`). No native listing | Workable through a custom HTTP destination; a documented recipe is enough for now | P3 | S |
| Messaging providers | WhatsApp sender connectivity | WhatsApp BSPs are listed as partners; their configuration lives in WhatsApp channel settings | ✅ Full | Settings > Channels > WhatsApp offers three paths (`WhatsappChannelPanel.tsx:18-22, 120-124`):<br>• Storees-managed, an ops-assisted intake (`StoreesProvisioning.tsx`; `whatsappAdmin.ts:802-930`)<br>• WhatsApp Cloud API, which validates the number, subscribes webhooks and imports templates (`MetaConnect.tsx`; `whatsappMetaConnectService.ts`)<br>• Pinnacle (`PinnacleConnect.tsx`) | Covered through a direct Meta connection and managed provisioning | — | — |
| Messaging providers | Named WhatsApp BSPs: Infobip, GallaBox, ValueFirst, Airtel IQ, Karix (AiSensy under SMS) | Whatsapp providers category (5), each also listed under SMS | ❌ Missing | Searched infobip, gallabox, valuefirst, airtel, karix and aisensy: none. Gupshup, Twilio, Bird and Vonage WhatsApp senders are registered (`providers/index.ts:32-37`), but the panel offers only Storees managed, Cloud API and Pinnacle (`WhatsappChannelPanel.tsx:18-22`), while the tab says "6 providers available" (`settings/page.tsx:405`) | Brands tied to a BSP contract cannot connect. Expose the four backend senders first (module 20 rates Gupshup P1/S), then add Infobip and the Indian BSPs | P2 | M |
| Messaging providers | SMS gateways Storees also supports (Twilio, Gupshup, Vonage; Storees adds Bird) | SMS listings; Twilio and Gupshup are description-only and configured in channel settings | 🟡 Partial | Settings > Channels > SMS has forms for Twilio, Gupshup, Bird, Vonage and Pinnacle (`settings/page.tsx:364-375`). Receipts arrive at `/api/webhooks/channel/twilio`, `gupshup`, `bird` and `vonage` (`channelWebhooks.ts:43-210`). The Pinnacle SMS tile has no registered sender (`providers/index.ts:25-29`), so its sends fall to an env-configured legacy stub or Resend (`deliveryService.ts:169-174`). No DLT template ID, entity ID or header (searched dlt, peid, entityId) | Indian operators reject commercial SMS without DLT IDs (modules 03 and 19 rate this P0), and the Pinnacle tile cannot send with the merchant's key | P0 | M |
| Messaging providers | Indian and other SMS gateways (Kaleyra, ICS, Sinch, Route Mobile, Infobip, Mtalkz, Times Mobile, ValueFirst, Airtel IQ, Karix, AiSensy, GallaBox) | 18 SMS listings in total | ❌ Missing | The SMS registry is a fixed list of four senders (`providers/index.ts:25-29`). Searched kaleyra, sinch, route mobile, mtalkz, karix, valuefirst and msg91: none. No configurable HTTP SMS provider | Brands already paying an Indian DLT gateway cannot use it. A configurable HTTP SMS provider would cover most of them (module 19, P1/M) | P1 | M |
| Messaging providers | SMS-category partners beyond gateways: Attentive, Regal, Sendbird | Regal triggers SMS and calls from events; Sendbird sends in-app notifications; Attentive | ❌ Missing | Searched attentive, regal and sendbird: none. Regal-style event forwarding could be wired with the HTTP Request node; Attentive and Sendbird would need channel providers | US-centric or chat-SDK products; low relevance | P3 | M |
| Messaging providers | ESP connectors Storees also supports (Sendgrid, Amazon SES) | "Send your Email campaigns from MoEngage using your Sendgrid account"; Integrate tab: Send campaign data to Sendgrid | 🟡 Partial | SendGrid and SES can be selected and do send (`settings/page.tsx:352-363`; `httpEmailProviders.ts:30-200`; `providers/index.ts:17-23`). Only Resend has an events webhook (`resendWebhook.ts:170`); there are no SendGrid, SES, Postmark or Mailgun receipt routes (`channelWebhooks.ts`) | Sends through SendGrid or SES get no delivered, open, click or bounce data and no auto-suppression. Add their event webhooks (module 19, P1/M) | P1 | M |
| Messaging providers | ESPs not supported: Mandrill, SparkPost, Netcore, Mailmodo (interactive/AMP) | Emails category; Netcore shows the green connected check | ❌ Missing | The email registry is Resend, SendGrid, Mailgun, Postmark and SES (`providers/index.ts:17-23`). Searched mandrill, sparkpost, netcore, pepipost, mailmodo and amp: none | Netcore matters in some Indian enterprise deals. A new HTTP ESP follows the existing `httpEmailProviders` pattern | P3 | S |
| Messaging providers | Email template tool export (Stripo "Export to ESP") | Stripo (built by Stripo) exports drag-and-drop templates to MoEngage | ❌ Missing | Searched stripo, beefree and unlayer: none. The builder has no HTML block or HTML import. The text block's Content field takes raw HTML (`BlockPropertyEditor.tsx:344-350`), and `emailTemplateFromHtml` only wraps a stored `htmlBody` into one text block on the edit pages (`templates/[id]/edit/page.tsx:21-40`) | Agencies that design in Stripo must rebuild their emails or paste a whole HTML document into a text block. Add an HTML block or HTML template import | P3 | S |
| Messaging providers | Messaging apps as channels: Facebook Messenger, Telegram, LINE, Viber | Messaging apps category; Telegram, Line and Viber are Connected Apps behind Request access | ❌ Missing | `CampaignChannel` and `MessageChannel` have no such channels (`types.ts:173, 950`). Searched telegram, viber and messenger: none | Rarely needed by Indian D2C (module 01, P3) | P3 | L |
| Messaging providers | Alert management destinations: Microsoft Teams, Slack, Webhooks | The Alert management collection sends MoEngage Alerts to Teams, Slack or a webhook; Slack and Webhooks are behind Request access | ❌ Missing | No alert entity. There are only two built-in admin email notices, for template re-categorisation and trial reminders (`templateAlertService.ts:30-95`; `trialLifecycleService.ts:55-75`). Searched slack, msteams and teams webhook: none | Ops teams hear late about failed sends or paused templates. Once alerts exist, post them to a Slack or Teams incoming webhook (module 24, P2/S) | P2 | S |
| Other partner categories | Conversational messaging partners (Verloop, Oriserve, Yellow) triggered from campaigns | Description-only: build an outreach in the bot vendor's tool and trigger it from MoEngage connector campaigns | ⭐ Storees better | Native AI WhatsApp chatbot: answers FAQs, order status and product recommendations, with human handoff and a turn cap (`whatsappChatbotService.ts:9-31, 97-125`; invoked at `whatsappInboundService.ts:178`). Set up in Settings > Channels > WhatsApp (`WhatsappChatbotPanel.tsx`), with a Shared Inbox for agents (`inbox/page.tsx`; `Sidebar.tsx:60`). Gated by the premium `ai_chatbot` entitlement | MoEngage needs a separate bot contract; Storees ships the bot and the inbox for WhatsApp. Web chat is not covered, and trial plans don't get the bot | — | — |
| Other partner categories | Support ticketing (Zendesk via connector campaigns) | Description-only; the carousel shows the connector webhook config (URL, headers, body type) | 🟡 Partial | The flow HTTP Request node can create Zendesk or Freshdesk tickets with customer and event tokens (`flowExecutor.ts:822-880`). Searched zendesk, freshdesk and gorgias: none | Flows only, with no recipe | P3 | S |
| Other partner categories | Survey tools (Typeform, Iterate, QuestionPro, Delighted, Qualtrics, SurveyMonkey) | Embed surveys in campaigns | 🟡 Partial | Survey links can go in any message, and responses can arrive as events through an Event Source (`hooks.ts`; `inboundWebhookService.ts`). Searched typeform, surveymonkey, delighted and qualtrics: none | No native connector and no survey widget (module 05 rates the widget P2) | P3 | S |
| Other partner categories | Voice calls (Exotel, Deepgram) | Voice calls and SMS through connector campaigns; Deepgram makes AI outbound calls | 🟡 Partial | No voice channel (`types.ts:173`). The HTTP Request node can call the Exotel API (`flowExecutor.ts:822-880`), and call outcomes would need an Event Source. Searched exotel, knowlarity and voice call: none | COD confirmation calls are an Indian D2C use case, though WhatsApp usually covers it | P3 | M |
| Other partner categories | Direct mail (Inkit, Optilyz, Lob, Paperplanes, PFL, Poplar) and Calendar (Rokt Calendar) | Description-only: connector campaigns plus the partner's API send letters, postcards or calendar events | 🟡 Partial | Reachable only through the flow HTTP Request node (`flowExecutor.ts:822-880`). Searched lob, inkit, poplar and rokt: none | These vendors focus on the US and EU; low relevance | P3 | S |
| Other partner categories | Dynamic content partners (18, e.g. Movable Ink, Rocketium, Argoid, Dynamic Yield, NiftyImages) | Polls, countdown timers, scratch-offs, live images and recommendations inside messages | 🟡 Partial | Native dynamic product content: `{{cart_items}}` and `{{recommended_products}}` grids (`productBlockRenderer.ts:1-30`), `{{recommended_product}}` and `{{social_proof_*}}` flow variables (`flowExecutor.ts:656-662`), and an email product block (`EmailBuilder.tsx:600`). No countdown timers, live images, polls or partner embeds ("countdown" appears only in prediction code) | Product personalisation is native; sale countdowns and live-image partners are missing | P3 | M |
| Other partner categories | Loyalty partners (15, e.g. Talon.one, Voucherify, Smile, LoyaltyLion, Capillary) | Coupon, referral and loyalty codes and balances in campaigns, mostly through Content APIs | 🟡 Partial | A loyalty platform can push points or tier as custom attributes through `/v1/customers` or Event Source profile mappings (`v1Events.ts:563-686`; `inboundWebhookService.ts:335-363`). These work as template variables (`variableSources.ts:13-40`) and in segments, and the HTTP Request node can fetch codes in flows. Searched talon, voucherify, loyaltylion, smile.io and capillary: no connector | Points balances and reward codes need engineering work. A recipe or connector for the loyalty apps Shopify D2C brands use would help retention flows | P3 | M |
| Other partner categories | Gamification (Flyy, Smashpops, CustomerGlu) | Referral and reward campaigns by syncing segments | 🟡 Partial | Segment membership can be pushed through outbound webhooks (in Storees' payload format) or per-customer HTTP Request calls (`segmentService.ts:156-183`; `flowExecutor.ts:822-880`). Searched flyy and customerglu: none | Low relevance | P3 | S |
| Other partner categories | Generative AI partners (Jasper.ai, Phrasee) | AI-generated copy embedded in campaigns; events forwarded to Phrasee | ✅ Full | A native AI copywriter runs in campaign create (`copywriterService.ts`; `routes/ai.ts:83`; `AiCopywriterPanel.tsx`; `campaigns/create/page.tsx:2743`), on the project's own Groq, OpenAI or Anthropic key (`settings/page.tsx:657-661`) | Covered natively. There is no Phrasee-style learning from send performance | — | — |
| Other partner categories | Google Sheets (Sheetdb, Sheetsu) and contextual location (AccuWeather, Open weather, Radar) | Read sheet or weather data at send time through Content APIs; update sheets on triggers | 🟡 Partial | The flow HTTP Request node can GET a SheetDB or weather API, and later sends bind to `node_outputs` (`flowExecutor.ts:650-655, 822-880`). Campaigns cannot. Location data is limited to region and city (`variableSources.ts:24-25`) | Flows only; low relevance | P3 | S |
| Other partner categories | Experimentation (AB Tasty, VWO, Growthbook) | VWO sends visitor and variation data into MoEngage for analysis and targeting | 🟡 Partial | Variant data can be sent with `Storees.track` or `setUserProperties` (`sdk/src/core.ts:195, 217`) and used in segments. Searched vwo, ab tasty and growthbook: no connector | VWO is common in Indian D2C CRO teams; a snippet recipe is enough | P3 | S |
| Other partner categories | Localisation (Transifex, Crowdin) | Sync email templates and content blocks to Crowdin for translation and back | ❌ Missing | Searched crowdin and transifex: none. No template translation model; only WhatsApp templates carry a language (`schema.ts:1184`) | Low relevance | P3 | M |
| Other partner categories | Mobile wallets (PassKit, Skycore) | Apple Wallet and Google Pay passes, with pass events sent to MoEngage | 🟡 Partial | No connector (searched passkit, pkpass and wallet pass). A flow HTTP Request node can call PassKit's API to issue a pass and bind its URL into the next message (`flowExecutor.ts:822-880`), and pass events can arrive through an Event Source (`hooks.ts:17-63`) | Possible only as a hand-built flow. Loyalty cards and coupons in mobile wallets are low priority | P3 | M |
| Other partner categories | Learning (eduMe) | eduMe courses in campaigns through a Content API | ➖ N/A | eduMe is training content for frontline staff, not a marketing integration for Storees' ecommerce, fintech, SaaS or edtech marketers. Searched edume: none | Not relevant | — | — |
| Other partner categories | Nudges (Apxor in-app walkthroughs, tooltips, coachmarks) | Targets MoEngage segments inside mobile apps | ➖ N/A | In-app guidance for mobile apps. Storees has only a browser SDK (`packages/sdk/src`) and no mobile SDK | Relevant only once Storees has a mobile SDK | — | — |
| Other partner categories | Subscriptions (Purchasely paywall events) | Server-to-server subscription events from the Purchasely paywall builder | ➖ N/A | Purchasely builds subscription paywalls for mobile apps, and Storees has no mobile SDK. Web subscription events can still arrive through `/v1/events` or Event Sources (`v1Events.ts:114`) | Relevant only once Storees has a mobile SDK | — | — |
| Other partner categories | Marketing cloud (Salesforce Marketing Cloud, Coming soon) | Sync Salesforce users and segments to MoEngage; only the interest modal exists today | ❌ Missing | Searched salesforce: none. MoEngage has not shipped this either | An enterprise migration path; not relevant to D2C | P3 | L |
| Other partner categories | Automation and iPaaS (Pipedream, Airtable, Tray.io, DataChannel; Fivetran coming soon) | Automation category listings | 🟡 Partial | Inbound webhooks (Event Sources, `hooks.ts`) and outbound webhooks (Settings > Webhooks; the flow HTTP Request node) work with any iPaaS. Searched pipedream, airtable, tray.io, fivetran and n8n: none | No listings or templates. Zapier is the one worth building (see the Integrate pattern E row) | P3 | S |

### Storees-only strengths

- **Event Sources: no-code inbound webhooks.**
  - Where: `packages/backend/src/routes/hooks.ts:17-63`; `packages/backend/src/routes/inboundWebhooks.ts:19-336`; `packages/backend/src/services/inboundWebhookService.ts`; `packages/frontend/src/app/(dashboard)/event-sources/page.tsx` and `[id]/page.tsx`.
  - Why it matters: each source gets a secret URL with an optional shared-secret header, a payload log, a schema inferred from recent payloads, and event definitions with identity and profile mapping. It also gets session stitching, a "Why didn't this match?" explanation and reprocessing. A brand can connect any checkout, order system or partner that sends webhooks (Shopflo today) without waiting for a connector; most of MoEngage's description-only listings stand in for exactly this.
- **Signed outbound webhooks with retries and a delivery log.**
  - Where: `packages/frontend/src/app/(dashboard)/settings/webhooks/page.tsx:20-24, 313-335`; `packages/backend/src/routes/webhookSubscriptions.ts`; `packages/backend/src/services/webhookService.ts`; `packages/backend/src/workers/webhookDeliveryWorker.ts`.
  - Why it matters: admins set these up themselves, with HMAC or Bearer signing, custom headers, three retry presets, Test and resendable deliveries. MoEngage's marketplace shows Webhooks only as an alert destination behind Request access. Caveat: only the two segment events fire today.
- **A Shopify install that provisions a working account.**
  - Where: `packages/backend/src/routes/integrations.ts:55-194`; `packages/shared/src/constants.ts:174-195`; `packages/backend/src/workers/syncWorker.ts`; `packages/backend/src/routes/webhooks.ts:197-302`.
  - Why it matters: one OAuth approval does all of this:
    - creates the project on a trial;
    - registers 17 webhook topics plus the GDPR webhooks;
    - imports customers, orders, products and collections;
    - activates segments and default flows;
    - signs the owner in.

    MoEngage's Shopify apps only inject the Web SDK. Caveat: the same callback wipes project settings on a reinstall (P0 row).
- **Shopify Customer Events pixel with checkout steps, plus SDK cart-attribute stitching.**
  - Where: `packages/frontend/src/lib/shopifyPixel.ts:25-146`; `packages/sdk/src/shopifyCart.ts:22-82`; `packages/backend/src/services/anonymousSessionService.ts`.
  - Why it matters: the pixel captures checkout start and the contact, shipping and payment steps without theme edits. Its idempotency key lets the backend dedupe them against webhooks. The SDK script (not the pixel) stamps `storees_sid` on the cart, so the session survives third-party checkouts such as Shopflo and anonymous browsing is credited after purchase.
- **Three WhatsApp connection paths, including a Storees-managed number.**
  - Where: `packages/frontend/src/app/(dashboard)/settings/StoreesProvisioning.tsx`; `packages/frontend/src/app/(dashboard)/settings/MetaConnect.tsx`; `packages/backend/src/services/whatsappMetaConnectService.ts`; `packages/backend/src/routes/whatsappAdmin.ts:772-930`.
  - Why it matters: a merchant without a WhatsApp Business account can request a number that Storees ops provision. A merchant with one connects their own Meta account directly, with template import and webhook subscription, instead of signing with one of the BSPs MoEngage lists.
- **Bring-your-own LLM provider.**
  - Where: `packages/frontend/src/app/(dashboard)/settings/page.tsx:657-800` (AI section with model picker and Test connection); `packages/backend/src/routes/ai.ts`; `packages/backend/src/services/llmService.ts`.
  - Why it matters: brands choose Groq, OpenAI or Anthropic and a model, on their own key, for copywriting, segment AI and the chatbot. MoEngage's marketplace offers generative AI only as partner listings.
- **Scheduled pull connectors with a Test preview and sync history.**
  - Where: `packages/backend/src/services/connectors/genericHttpConnector.ts`; `packages/backend/src/services/connectors/templates/virpanai.ts`; `packages/backend/src/routes/dataConnectors.ts:220-338`; `packages/backend/src/workers/dataSyncWorker.ts:26-27`; `packages/frontend/src/components/data-sources/*`.
  - Why it matters: a non-Shopify store (Medusa via VirpanAI) or any REST backend stays in sync, with an incremental run every 3 hours, a nightly full resync and a log of each run. Currently super-admin only.
- **An HTTP Request step whose response personalises later messages.**
  - Where: `packages/backend/src/services/flowExecutor.ts:650-655, 822-880`; `packages/frontend/src/components/flows/StructuredFlowBuilder.tsx:1234-1297`.
  - Why it matters: one flow step can call a partner API (loyalty balance, stock, coupon) and feed the result into the next WhatsApp message or email. MoEngage splits this between Connector Campaigns and Content APIs. The SSRF guard must be added first (module 23, P0).
- **Zero-config email, plus Postmark and Mailgun.**
  - Where: `packages/backend/src/services/providers/index.ts:17-23`; `packages/backend/src/services/channelProviderRegistry.ts` (`getEnvFallback`: Resend); `packages/frontend/src/app/(dashboard)/settings/page.tsx:352-363`.
  - Why it matters: a new store can send email through Storees' Resend account with no setup. Postmark and Mailgun are not in MoEngage's Emails category. Caveat: only Resend reports delivery events back.

### UX notes

- **Entry point.**
  - MoEngage puts every integration behind one sidebar icon (121). It opens a two-column catalog: a Collections/Categories rail, search and 4-up cards (001, 024).
  - Storees spreads integrations over six places:
    - Settings > SDK & Integration (Setup, Channels, AI);
    - Settings > Ad Conversions;
    - Settings > Webhooks;
    - Event Sources in the sidebar;
    - Projects > Data Sources (super admin only);
    - the segment Export audience menu.
  - Its only `/integrations` URL redirects to the super-admin `/projects` page (`integrations/page.tsx:7-13`). A project admin who follows that link, and every merchant whose Shopify install fails, lands on "Super admins only". The OAuth callback page already displays `?error=` (`oauth/shopify/callback/page.tsx:17-21`); the backend just sends errors elsewhere.
  - Adopt one Integrations page for project admins that links into the existing screens rather than rebuilding them.
- **Cards.**
  - MoEngage cards carry a real logo, "Built by", a one-line value proposition, a category chip with "+1 more", and New, Coming soon or connected badges (001, 024, 046).
  - Storees' provider tiles use coloured initials ("SG", "Tw", "Pn") with a truncated description (`settings/page.tsx:351-400, 511-534`; `WhatsappChannelPanel.tsx:18-22`), which reads as placeholder UI in a demo.
  - Use logos, add category and status chips, and keep the check on the selected provider.
- **Explain before asking for keys.**
  - MoEngage detail pages separate Description (carousel, use cases, View setup guide, Get in touch; 054, 059) from Integrate (056, 058, 102, 113).
  - Storees opens straight into credential fields. Setup steps exist only for the Shopify pixel (`settings/page.tsx:234-247`), the Shopify custom app (`AddConnectorDialog.tsx:206-209`) and Meta WhatsApp (`MetaConnect.tsx`).
  - Add a short panel beside each form covering what it does, what data flows and a setup guide.
- **Permission UX.**
  - MoEngage keeps actions visible but disabled, with the reason shown: "You do not have permission to integrate." on Add integration and Sign in with Google (057, 102, 113), and "You don't have permissions to create an app" (005).
  - Storees hides admin tabs entirely (`settings/layout.tsx:33-40`) and walls off Data Sources, so a manager cannot even tell whether the store is connected. Yet the same manager can change credentials through the API, which checks no role.
  - Show a read-only status with an "Ask your admin" tooltip, and enforce the same rule in the backend.
- **Storees is ahead on integration health.**
  - Ad Conversions cards show events sent and failed, the last error with its time, and a Test button (`ad-conversions/page.tsx:170-214`).
  - Webhooks show a deliveries table with status code, response and Resend (`settings/webhooks/page.tsx:313-335`).
  - Event Sources list 24-hour receive counts, the last received time and a payload log (`event-sources/page.tsx:56-110`).
  - MoEngage's only status signal is a green check on Netcore, whose Integrate tab lists nothing (024, 084). Show these numbers on the hub cards.
- **Demand capture.**
  - MoEngage turns Coming soon cards into an "Are you interested?" Yes/No modal with a use-case box (094, 119). Every view, including empty search results, ends with Suggest a partner (004, 007, 053).
  - Storees shows Google, TikTok and Snap as greyed "(coming soon)" select options (`ad-conversions/page.tsx:17-22, 99-103`) with no way to register interest.
  - Both MoEngage forms have just two fields and feed the roadmap.
- **Counts that match reality.**
  - Storees' channel tabs say "SMS: 5 providers available" and "WhatsApp: 6 providers available" (`settings/page.tsx:404-405`). The WhatsApp panel offers three (`WhatsappChannelPanel.tsx:18-22`), and the Pinnacle SMS tile has no sender.
  - MoEngage's catalog drifts too: the Support filter renders no cards (043), and an empty "Custom destinations" heading appears (122).
  - Build tiles and counts from the backend provider registry (`backend/src/services/providers/index.ts`).
- **Deep links.**
  - MoEngage keeps category, collection, search and the Integrate tab (`?tab=1`) in the URL, so support can share the exact view.
  - Storees' Settings sub-sections and channel tabs are component state that resets to Channels > WhatsApp on load (`settings/page.tsx:57, 410`). Onboarding cannot send a link to "Setup > Shopify pixel". Put them in the query string.
- **Connect flows.**
  - Google Ads uses Sign in with Google and advises a shared account so the link does not depend on one person (113). Shopify 2.0 is a single install button (058).
  - Storees asks for a pasted Phone Number ID, WABA ID and system-user token for WhatsApp (`MetaConnect.tsx`), and a pixel ID plus token for CAPI. Prefer OAuth or Embedded Signup where the platform offers it.
  - Storees' Shopify install is already the stronger flow: one OAuth approval provisions the project, sync, flows and login (`routes/integrations.ts:55-194`). It needs a merchant-facing status and resync card to match.

### Verification notes

Every row was re-checked against the code at `2063cdc`. Final counts over 77 rows: 4 ✅, 40 🟡, 26 ❌, 3 ⭐, 4 ➖.

- **Header actions: ❌ → 🟡 (P3/S kept).**
  - The earlier gap said integrators have "no in-app help or developer entry point". That is wrong: Settings > SDK & Integration > Setup has Script tag, Shopify pixel, NPM and REST API (cURL) snippets plus a recommended-events list (`settings/page.tsx:126-131, 225-310`).
  - Help articles, videos and a published API reference are still missing.
- **Yotpo: ❌ → 🟡 (P3/M kept).** Yotpo's listing is a Content API integration, the same mechanism as Sheetdb, AccuWeather and Talon.one, which the table rates 🟡 because a flow HTTP Request node can fetch the data and later sends bind to it. The original "messages cannot show product reviews" was too strong; flows can show single review values.
- **Mobile wallets (PassKit): ❌ → 🟡 (P3/M kept).** Same treatment as Lob and Rokt (🟡): a flow can call PassKit's API to issue a pass and send its URL, and pass events can come back through an Event Source. No connector or recipe exists.
- **TikTok and Snapchat Ads Conversions: 🟡 → ❌, effort S → M.**
  - Nothing works: the relays only throw "not yet implemented" (`conversionApiService.ts:190-200`), and the UI options are disabled.
  - Module 05 rates the same gap ❌, P2/M. I kept P3 because TikTok is unavailable in India and Snap has little D2C ad spend there.
- **Shopify Integrate tab: P1 → P0 (S kept).**
  - Every pass through the OAuth callback runs `activatePack` (`routes/integrations.ts:127`), which writes `projects.settings = { vertical }` (`verticalPackService.ts:296-299`).
  - That erases `settings.channels` (WhatsApp, SMS, email and push credentials, and the chatbot config at `channels.whatsapp.chatbot`, `whatsappChatbotService.ts:36-38`), the AI provider and key (`routes/ai.ts:343-356`) and `shopifyCustomApp`.
  - A reinstall triggers it, and so does any OAuth scope change. Shipping the P1 web pixel extension (new `write_pixels` scope) would therefore silently disconnect every existing merchant's channels unless this is fixed first.
- **SMS gateways Storees also supports: P1 → P0 (M kept).** The decisive gap is the missing DLT template ID, entity ID and header, which modules 03 and 19 both rate P0. Evidence refined: the Pinnacle SMS tile's sends fall to an env-configured legacy stub or to Resend (`deliveryService.ts:169-174`; `index.ts:242-245`).
- **Permissions model: P2 → P1 (S kept).**
  - The outbound-webhook, ad-conversion, data-source, inbound-webhook and channel-config routes have no role check. An agent, or a custom role with `viewContactPii` off, can therefore add a webhook that receives raw customer email and phone on every segment change (`segmentService.ts:170-178`).
  - Membership itself is checked only when `ENFORCE_PROJECT_MEMBERSHIP=true` (`membership.ts:76`), a flag absent from `.env.example`.
  - Module 21 rates the comparable API-key gap P1. `requireRole('admin')` already exists (`agentScope.ts:59`), so the fix stays S.
  - Corrected the evidence: custom roles also store a `screens` list, but the roles page always saves `'*'` and nothing reads it.
- **Shopify app installs on-site tracking (🟡, P1 kept): gap corrected.**
  - The original said cart and checkout events "stay empty" without the pixel. In fact `checkout_started` still arrives from the checkouts/create webhook (`webhooks.ts:26`).
  - What breaks is browse and `added_to_cart`, and with them the auto-created Abandoned Cart flow, which triggers on `added_to_cart` (`flows/src/templates.ts:18-27`).
  - Added the dependency on the P0 settings fix.
- **App Marketplace hub (❌, P2/M kept): evidence extended.** `getCallbackErrorUrl` sends Shopify install errors to `/integrations?error=` (`shopifyService.ts:307-309`), while `oauth/shopify/callback/page.tsx:17-21` already renders `?error=`. Pointing errors there is an S fix that does not need the hub.
- **Integrate pattern A (🟡): evidence extended.** `projects` already has `email_marketing_provider` and `email_transactional_provider` (`schema.ts:53-54`), and sending picks one by content type (`emailProviderRegistry.ts:63-66`). However, the settings save sets both to the same provider (`routes/ai.ts:323-324`) and stores only one config.
- **Integrate pattern C (🟡): evidence refined.** Google and GitHub OAuth exist for admin sign-in (`lib/auth.ts:2-16`), not for connecting ad accounts.
- **Stripo export (❌): evidence corrected.** The table said `emailTemplateFromHtml` is never called. It is called on the template and campaign edit pages to wrap a stored `htmlBody` into one text block (`templates/[id]/edit/page.tsx:21-40, 75`). The text block's Content field accepts raw HTML (`BlockPropertyEditor.tsx:344-350`). That is a crude paste workaround, not an import, so the status stays.
- **Alert management destinations (❌): wording corrected.** "Two hard-coded admin emails" meant two built-in notice types (template re-categorisation and trial reminders), sent to the project's admins, not hard-coded addresses.
- **Cohort import (❌): evidence extended.** `/v1/customers` replaces `custom_attributes` although its comment says "Merge" (`v1Events.ts:608-616`), so attribute-tagging an external cohort wipes the customer's other attributes.
- **Connected indicator (🟡): evidence extended.** The Shopify pixel sends `source: 'shopify_pixel'` (`shopifyPixel.ts:75`), which the SDK badge's `source = 'sdk'` check never counts.
- **Reverse ETL (🟡): evidence extended.** The single `/v1/events` rejects timestamps older than 7 days (`v1Events.ts:141-148`); backfills must use `/events/batch` or `/import/*`.
- **Integrate pattern D (⭐) and Shopify data captured (⭐): kept.** The install route, callback page, webhook registration, sync worker, pack activation and brand-kit sync are all real code. The reinstall wipe is a defect in re-running the flow, tracked in the P0 row, not a missing link in the first install.
- **Conversational messaging (⭐): kept.** The bot is real and reachable (`whatsappInboundService.ts:178` → `whatsappChatbotService.ts`), configured in Settings and backed by the Inbox. Added the caveat that trial plans lack the `ai_chatbot` entitlement.
- **Storees-only strengths: one item removed and two corrected.**
  - **Removed: the hashed audience export.** The table rates the same feature 🟡 with a P1 gap against MoEngage's API sync, so it is not an advantage.
  - **Corrected: Shopify cart stitching.** It comes from the SDK script, not the Customer Events pixel; the pixel never touches `/cart/update.js`.
  - **Corrected: Storees-managed WhatsApp.** It is an ops-assisted intake, not instant provisioning.
- **Rows I tried and failed to refute:** these searches found nothing that would change a status.
  - zapier, pipedream, airtable, tray.io, fivetran, n8n
  - segment.io, rudderstack, mparticle, tealium, blueconic, amperity, treasure data
  - mixpanel, amplitude, posthog, snowplow, dataLayer, googletagmanager
  - bigquery, snowflake, redshift, databricks, sftp, azure, google cloud storage, hightouch, census
  - salesforce, hubspot, leadsquared, pipedrive, zendesk, freshdesk, gorgias
  - typeform, surveymonkey, delighted, qualtrics, yotpo, judge.me
  - stripo, beefree, unlayer, telegram, viber, messenger, slack, msteams
  - crowdin, transifex, passkit, pkpass, vwo, growthbook, ab tasty
  - talon, voucherify, loyaltylion, capillary, lob, inkit, poplar, rokt, edume, gokwik, razorpay, shiprocket
  - kaleyra, sinch, route mobile, mtalkz, karix, valuefirst, infobip, gallabox, aisensy, airtel, msg91, exotel, knowlarity
  - netcore, pepipost, mailmodo, mandrill, sparkpost, dlt, peid
  - webPixelCreate, script_tags, shopify.extension.toml, app embed
  - FB.login, Embedded Signup, accounts.google.com
  - suggest, waitlist, notify me, feedback, youtube, openapi, swagger
- **Side observations (outside this module's scope):**
  - `activatePack` also runs from the wizard and the vertical-pack route (`routes/wizard.ts:182`; `routes/verticalPacks.ts:55`), so changing a project's industry wipes the same settings.
  - The Settings layout fails open for a session with no role (`settings/layout.tsx:33`: `isAdmin = !role || role === 'admin'`), while the sidebar fails closed (`Sidebar.tsx:87-94`).
  - `/v1/import/customers` and `/v1/import/orders` accept the public storefront key alone (`v1Import.ts:33`). Anyone who copies it from a store's page source can create or overwrite customers and orders.

### Screens

#### App Marketplace landing (All collections)

![Landing page top: header actions, Collections/Categories nav, New collection (7 ads connectors), start of Popular](../screenshots/25-app-marketplace-001-landing-all-collections-top.jpg)
*Landing page top: header actions, Collections/Categories nav, New collection (7 ads connectors), start of Popular*

![Popular collection (mParticle, Mixpanel, Amplitude, Segment, Shopify 2.0, BigQuery, Redshift, GCS, S3, Snowflake, SFTP, Databricks) and Alert management (Teams, Slack, Webhooks)](../screenshots/25-app-marketplace-002-landing-popular-alerts.jpg)
*Popular collection (mParticle, Mixpanel, Amplitude, Segment, Shopify 2.0, BigQuery, Redshift, GCS, S3, Snowflake, SFTP, Databricks) and Alert management (Teams, Slack, Webhooks)*

![Connected Apps collection: Telegram, Line, Viber, Ads Audiences, Ads Conversions, Truecaller](../screenshots/25-app-marketplace-003-landing-connected-apps.jpg)
*Connected Apps collection: Telegram, Line, Viber, Ads Audiences, Ads Conversions, Truecaller*

![Page bottom: 'Didn't find what you were looking for?' + Suggest a partner](../screenshots/25-app-marketplace-004-landing-bottom-suggest-partner.jpg)
*Page bottom: 'Didn't find what you were looking for?' + Suggest a partner*

![New and Popular collapsed to one row with 'Show all' toggles](../screenshots/25-app-marketplace-120-all-collections-sections-collapsed-show-all.jpg)
*New and Popular collapsed to one row with 'Show all' toggles*

![Disabled '+ Create app' tooltip: 'You don't have permissions to create an app. Know more'](../screenshots/25-app-marketplace-005-create-app-disabled-tooltip.png)
*Disabled '+ Create app' tooltip: 'You don't have permissions to create an app. Know more'*

![Watch video modal: embedded YouTube 'Introducing MoEngage's App Marketplace'](../screenshots/25-app-marketplace-006-watch-video-modal.jpg)
*Watch video modal: embedded YouTube 'Introducing MoEngage's App Marketplace'*

![Suggest a partner modal: Partner name\* (0/120), Description\* (0/200), Cancel/Submit (not submitted)](../screenshots/25-app-marketplace-007-suggest-partner-modal.jpg)
*Suggest a partner modal: Partner name\* (0/120), Description\* (0/200), Cancel/Submit (not submitted)*

![Sidebar entry point: App Marketplace icon with tooltip (direct link, no flyout)](../screenshots/25-app-marketplace-121-sidebar-app-marketplace-entry-tooltip.png)
*Sidebar entry point: App Marketplace icon with tooltip (direct link, no flyout)*

#### All categories view

![All categories top: Analytics (6) and Automation (Fivetran 'Coming soon')](../screenshots/25-app-marketplace-008-all-categories-analytics-automation.jpg)
*All categories top: Analytics (6) and Automation (Fivetran 'Coming soon')*

![CRM (Salesforce 'New') followed by an empty 'Custom destinations' heading, then Data warehouses and Direct mail](../screenshots/25-app-marketplace-122-all-categories-crm-and-empty-custom-destinations.jpg)
*CRM (Salesforce 'New') followed by an empty 'Custom destinations' heading, then Data warehouses and Direct mail*

#### Category filter views

![Ecommerce: Shopify, Shopify 2.0, Yotpo, Shopflo](../screenshots/25-app-marketplace-009-category-ecommerce.jpg)
*Ecommerce: Shopify, Shopify 2.0, Yotpo, Shopflo*

![Analytics: Mixpanel, Amplitude, GTM, Heap, PostHog, Snowplow](../screenshots/25-app-marketplace-010-category-analytics.jpg)
*Analytics: Mixpanel, Amplitude, GTM, Heap, PostHog, Snowplow*

![Automation: Zapier, Pipedream, Fivetran (Coming soon), Airtable, Tray.io, DataChannel, Webhooks](../screenshots/25-app-marketplace-011-category-automation.jpg)
*Automation: Zapier, Pipedream, Fivetran (Coming soon), Airtable, Tray.io, DataChannel, Webhooks*

![Calendar: Rokt Calendar](../screenshots/25-app-marketplace-012-category-calendar.jpg)
*Calendar: Rokt Calendar*

![CDP: Tealium, mParticle, Rudderstack, Segment, Microsoft (Dynamics 365 CI), Adobe Real-Time CDP, BlueConic, Treasure Data (Coming soon), Amperity](../screenshots/25-app-marketplace-013-category-cdp.jpg)
*CDP: Tealium, mParticle, Rudderstack, Segment, Microsoft (Dynamics 365 CI), Adobe Real-Time CDP, BlueConic, Treasure Data (Coming soon), Amperity*

![Cloud storages: Google Cloud Storage, Azure Blob Storage, Amazon S3, SFTP](../screenshots/25-app-marketplace-014-category-cloud-storages.jpg)
*Cloud storages: Google Cloud Storage, Azure Blob Storage, Amazon S3, SFTP*

![Contextual location: AccuWeather, Open weather, Radar](../screenshots/25-app-marketplace-015-category-contextual-location.jpg)
*Contextual location: AccuWeather, Open weather, Radar*

![Conversational messaging: Verloop, Oriserve, Yellow](../screenshots/25-app-marketplace-016-category-conversational-messaging.jpg)
*Conversational messaging: Verloop, Oriserve, Yellow*

![Conversions: Microsoft/TikTok/Meta/Snapchat Ads Conversions](../screenshots/25-app-marketplace-017-category-conversions.jpg)
*Conversions: Microsoft/TikTok/Meta/Snapchat Ads Conversions*

![CRM: Pipedrive (Built by Zapier), Leadsquared, Salesforce (New)](../screenshots/25-app-marketplace-018-category-crm.jpg)
*CRM: Pipedrive (Built by Zapier), Leadsquared, Salesforce (New)*

![Data warehouses: BigQuery, Redshift, Snowflake, Databricks](../screenshots/25-app-marketplace-019-category-data-warehouses.jpg)
*Data warehouses: BigQuery, Redshift, Snowflake, Databricks*

![Direct mail: Inkit, Optilyz, Lob, Paperplanes, PFL, Poplar](../screenshots/25-app-marketplace-020-category-direct-mail.jpg)
*Direct mail: Inkit, Optilyz, Lob, Paperplanes, PFL, Poplar*

![Dynamic content (18), part 1](../screenshots/25-app-marketplace-021-category-dynamic-content-top.jpg)
*Dynamic content (18), part 1*

![Dynamic content, part 2 (Sheetlabs ... Reignite)](../screenshots/25-app-marketplace-022-category-dynamic-content-bottom.jpg)
*Dynamic content, part 2 (Sheetlabs ... Reignite)*

![Email template: Stripo (Built by Stripo)](../screenshots/25-app-marketplace-023-category-email-template.jpg)
*Email template: Stripo (Built by Stripo)*

![Emails: Sendgrid, Amazon SES, Mandrill, Mailmodo, SparkPost, Netcore (green connected check)](../screenshots/25-app-marketplace-024-category-emails-netcore-connected.jpg)
*Emails: Sendgrid, Amazon SES, Mandrill, Mailmodo, SparkPost, Netcore (green connected check)*

![ETL: Hightouch, Census](../screenshots/25-app-marketplace-025-category-etl.jpg)
*ETL: Hightouch, Census*

![Experimentation: AB tasty, VWO, Growthbook](../screenshots/25-app-marketplace-026-category-experimentation.jpg)
*Experimentation: AB tasty, VWO, Growthbook*

![Gamification: Flyy, Smashpops, CustomerGlu](../screenshots/25-app-marketplace-027-category-gamification.jpg)
*Gamification: Flyy, Smashpops, CustomerGlu*

![Generative AI: Jasper.ai, Phrasee](../screenshots/25-app-marketplace-028-category-generative-ai.jpg)
*Generative AI: Jasper.ai, Phrasee*

![Google Sheets: Sheetdb, Sheetsu](../screenshots/25-app-marketplace-029-category-google-sheets.jpg)
*Google Sheets: Sheetdb, Sheetsu*

![Install attribution: Branch, Appsflyer, Adjust, Kochava, Singular, Trackier](../screenshots/25-app-marketplace-030-category-install-attribution.jpg)
*Install attribution: Branch, Appsflyer, Adjust, Kochava, Singular, Trackier*

![Learning: edu Me](../screenshots/25-app-marketplace-031-category-learning.jpg)
*Learning: edu Me*

![Localisation: Transifex, Crowdin](../screenshots/25-app-marketplace-032-category-localisation.jpg)
*Localisation: Transifex, Crowdin*

![Loyalty (15), part 1](../screenshots/25-app-marketplace-033-category-loyalty-top.jpg)
*Loyalty (15), part 1*

![Loyalty, part 2 (Capillary ... Vii)](../screenshots/25-app-marketplace-034-category-loyalty-bottom.jpg)
*Loyalty, part 2 (Capillary ... Vii)*

![Marketing cloud: Salesforce marketing cloud (Coming soon)](../screenshots/25-app-marketplace-035-category-marketing-cloud.jpg)
*Marketing cloud: Salesforce marketing cloud (Coming soon)*

![Messaging apps: Facebook messenger, Telegram, Line, Viber, Microsoft Teams, Slack](../screenshots/25-app-marketplace-036-category-messaging-apps.jpg)
*Messaging apps: Facebook messenger, Telegram, Line, Viber, Microsoft Teams, Slack*

![Mobile wallets: PassKit, Skycore](../screenshots/25-app-marketplace-037-category-mobile-wallets.jpg)
*Mobile wallets: PassKit, Skycore*

![Nudges: Apxor](../screenshots/25-app-marketplace-038-category-nudges.jpg)
*Nudges: Apxor*

![Retargeting (12): Facebook audience, Google Ads Audience, Jampp, Inmobi, and Snapchat/Pinterest/Criteo/TikTok/Microsoft/Amazon/Reddit audiences, Truecaller](../screenshots/25-app-marketplace-039-category-retargeting.jpg)
*Retargeting (12): Facebook audience, Google Ads Audience, Jampp, Inmobi, and Snapchat/Pinterest/Criteo/TikTok/Microsoft/Amazon/Reddit audiences, Truecaller*

![SMS (18), part 1: Gupshup, Kaleyra, ICS, Sinch, Twilio, Vonage, Route mobile, Attentive, Infobip, Mtalkz, Times Mobile, Regal](../screenshots/25-app-marketplace-040-category-sms-top.jpg)
*SMS (18), part 1: Gupshup, Kaleyra, ICS, Sinch, Twilio, Vonage, Route mobile, Attentive, Infobip, Mtalkz, Times Mobile, Regal*

![SMS, part 2: GallaBox, Sendbird, AiSensy, ValueFirst, Airtel IQ, Karix ('+1 more' category chips)](../screenshots/25-app-marketplace-041-category-sms-bottom.jpg)
*SMS, part 2: GallaBox, Sendbird, AiSensy, ValueFirst, Airtel IQ, Karix ('+1 more' category chips)*

![Subscriptions: Purchasely](../screenshots/25-app-marketplace-042-category-subscriptions.jpg)
*Subscriptions: Purchasely*

![Support filter shows NO cards (UI bug: Zendesk appears only in All categories)](../screenshots/25-app-marketplace-043-category-support-empty-filter.jpg)
*Support filter shows NO cards (UI bug: Zendesk appears only in All categories)*

![Survey: Typeform, Iterate, QuestionPro, Delighted, Qualtrics, SurveyMonkey](../screenshots/25-app-marketplace-044-category-survey.jpg)
*Survey: Typeform, Iterate, QuestionPro, Delighted, Qualtrics, SurveyMonkey*

![Voice calls: Exotel, Deepgram](../screenshots/25-app-marketplace-045-category-voice-calls.jpg)
*Voice calls: Exotel, Deepgram*

![Whatsapp providers: Infobip, GallaBox, ValueFirst, Airtel IQ, Karix](../screenshots/25-app-marketplace-046-category-whatsapp-providers.jpg)
*Whatsapp providers: Infobip, GallaBox, ValueFirst, Airtel IQ, Karix*

![Connected apps category: 'Connect MoEngage to your app and forward segments or run campaigns' card with a greyed-out Create app](../screenshots/25-app-marketplace-047-category-connected-apps-create-app.jpg)
*Connected apps category: 'Connect MoEngage to your app and forward segments or run campaigns' card with a greyed-out Create app*

#### Collection filter views

![New (7): Microsoft Ads Audience, Microsoft/TikTok/Meta/Snapchat Ads Conversions, Amazon Ads Audience, Reddit Ads Audience](../screenshots/25-app-marketplace-048-collection-new.jpg)
*New (7): Microsoft Ads Audience, Microsoft/TikTok/Meta/Snapchat Ads Conversions, Amazon Ads Audience, Reddit Ads Audience*

![Popular (12)](../screenshots/25-app-marketplace-049-collection-popular.jpg)
*Popular (12)*

![Alert management (3): Microsoft Teams, Slack, Webhooks](../screenshots/25-app-marketplace-050-collection-alert-management.jpg)
*Alert management (3): Microsoft Teams, Slack, Webhooks*

![Connected Apps (15)](../screenshots/25-app-marketplace-051-collection-connected-apps.jpg)
*Connected Apps (15)*

#### Search results

![Search 'shop': Shopify, Shopify 2.0, Shopflo](../screenshots/25-app-marketplace-052-search-results-shop.jpg)
*Search 'shop': Shopify, Shopify 2.0, Shopflo*

![Search with no matches: empty results plus Suggest a partner](../screenshots/25-app-marketplace-053-search-no-results.jpg)
*Search with no matches: empty results plus Suggest a partner*

#### Partner detail: Shopify

![Shopify detail: left info panel and Description tab carousel](../screenshots/25-app-marketplace-054-shopify-detail-description.jpg)
*Shopify detail: left info panel and Description tab carousel*

![Carousel slide 2: Shopify admin 'You are about to install Moengage 2.0' app-permission screen](../screenshots/25-app-marketplace-055-shopify-detail-carousel-slide2.jpg)
*Carousel slide 2: Shopify admin 'You are about to install Moengage 2.0' app-permission screen*

![Integrate tab: 'Send user data directly to MoEngage', + Add integration (disabled)](../screenshots/25-app-marketplace-056-shopify-integrate-tab.jpg)
*Integrate tab: 'Send user data directly to MoEngage', + Add integration (disabled)*

![Info tooltip: 'You do not have permission to integrate.'](../screenshots/25-app-marketplace-057-shopify-add-integration-no-permission-tooltip.png)
*Info tooltip: 'You do not have permission to integrate.'*

#### Partner detail: Shopify 2.0

![Shopify 2.0 Integrate: empty state with 'Install Moengage app on your Shopify store'](../screenshots/25-app-marketplace-058-shopify-2-0-integrate-install-app-empty.jpg)
*Shopify 2.0 Integrate: empty state with 'Install Moengage app on your Shopify store'*

#### Partner detail: Segment (CDP)

![Segment Description tab](../screenshots/25-app-marketplace-059-segment-detail-description.jpg)
*Segment Description tab*

![Segment Integrate: Send campaign data to segment, Add integration (no permission)](../screenshots/25-app-marketplace-060-segment-integrate-tab.jpg)
*Segment Integrate: Send campaign data to segment, Add integration (no permission)*

#### Partner detail: Mixpanel (Analytics)

![Mixpanel Description](../screenshots/25-app-marketplace-061-mixpanel-detail-description.jpg)
*Mixpanel Description*

![Mixpanel Integrate: Request access gate](../screenshots/25-app-marketplace-062-mixpanel-integrate-request-access.jpg)
*Mixpanel Integrate: Request access gate*

#### Partner detail: Zapier (Automation)

![Zapier Description: use MoEngage as a trigger using Connector Campaigns, create/update users, cohorts, import events, fetch campaign reports](../screenshots/25-app-marketplace-063-zapier-detail-description.jpg)
*Zapier Description: use MoEngage as a trigger using Connector Campaigns, create/update users, cohorts, import events, fetch campaign reports*

![Zapier Integrate: embedded workflow templates (Salesforce, Jotform, Google Forms, HubSpot, Google Contacts, LeadSquared)](../screenshots/25-app-marketplace-064-zapier-integrate-workflow-templates.jpg)
*Zapier Integrate: embedded workflow templates (Salesforce, Jotform, Google Forms, HubSpot, Google Contacts, LeadSquared)*

![Zapier templates, bottom: HubSpot and LeadSquared groups, 'Create from scratch'](../screenshots/25-app-marketplace-065-zapier-integrate-templates-bottom.jpg)
*Zapier templates, bottom: HubSpot and LeadSquared groups, 'Create from scratch'*

#### Partner detail: Rokt Calendar (Calendar)

![Rokt Calendar: Description-only page](../screenshots/25-app-marketplace-066-rokt-calendar-description-only.jpg)
*Rokt Calendar: Description-only page*

#### Partner detail: Amazon S3 (Cloud storages)

![Amazon S3 Description](../screenshots/25-app-marketplace-067-amazon-s3-detail-description.jpg)
*Amazon S3 Description*

![Amazon S3 Integrate: Request access](../screenshots/25-app-marketplace-068-amazon-s3-integrate-request-access.jpg)
*Amazon S3 Integrate: Request access*

#### Partner detail: AccuWeather (Contextual location)

![AccuWeather Description-only](../screenshots/25-app-marketplace-069-accuweather-description-only.jpg)
*AccuWeather Description-only*

#### Partner detail: Verloop (Conversational messaging)

![Verloop Description-only](../screenshots/25-app-marketplace-070-verloop-description-only.jpg)
*Verloop Description-only*

#### Partner detail: Meta Ads Conversions (Conversions, New)

![Meta Ads Conversions Description](../screenshots/25-app-marketplace-071-meta-ads-conversions-description.jpg)
*Meta Ads Conversions Description*

![Meta Ads Conversions Integrate: Request access](../screenshots/25-app-marketplace-072-meta-ads-conversions-integrate-request-access.jpg)
*Meta Ads Conversions Integrate: Request access*

#### Partner detail: Salesforce (CRM, New)

![Salesforce CRM Description (top)](../screenshots/25-app-marketplace-073-salesforce-crm-description-top.jpg)
*Salesforce CRM Description (top)*

![Salesforce Description scrolled: bidirectional sync bullets and benefits](../screenshots/25-app-marketplace-074-salesforce-crm-description-bottom.jpg)
*Salesforce Description scrolled: bidirectional sync bullets and benefits*

#### Partner detail: Snowflake (Data warehouses)

![Snowflake Description](../screenshots/25-app-marketplace-075-snowflake-description.jpg)
*Snowflake Description*

![Snowflake Integrate: Request access](../screenshots/25-app-marketplace-076-snowflake-integrate-request-access.jpg)
*Snowflake Integrate: Request access*

#### Partner detail: Lob (Direct mail)

![Lob Description-only](../screenshots/25-app-marketplace-077-lob-direct-mail-description-only.jpg)
*Lob Description-only*

#### Partner detail: Movable Ink (Dynamic content)

![Movable Ink Description-only](../screenshots/25-app-marketplace-078-movable-ink-dynamic-content-description.jpg)
*Movable Ink Description-only*

#### Partner detail: Stripo (Email template, Built by Stripo)

![Stripo Description](../screenshots/25-app-marketplace-079-stripo-email-template-description.jpg)
*Stripo Description*

![Stripo Description scrolled (use-case text)](../screenshots/25-app-marketplace-080-stripo-description-bottom.jpg)
*Stripo Description scrolled (use-case text)*

#### Partner detail: Sendgrid (Emails)

![Sendgrid Description](../screenshots/25-app-marketplace-081-sendgrid-esp-description.jpg)
*Sendgrid Description*

![Sendgrid Integrate: Send campaign data to Sendgrid, Add integration](../screenshots/25-app-marketplace-082-sendgrid-integrate-send-campaign-data.jpg)
*Sendgrid Integrate: Send campaign data to Sendgrid, Add integration*

#### Partner detail: Netcore (Emails, connected check)

![Netcore Description](../screenshots/25-app-marketplace-083-netcore-description.jpg)
*Netcore Description*

![Netcore Integrate: no integration rows, Add integration disabled](../screenshots/25-app-marketplace-084-netcore-integrate-no-integrations.jpg)
*Netcore Integrate: no integration rows, Add integration disabled*

#### Partner detail: Hightouch (ETL, Built by Hightouch)

![Hightouch Description-only](../screenshots/25-app-marketplace-085-hightouch-etl-description-only.jpg)
*Hightouch Description-only*

#### Partner detail: VWO (Experimentation, Built by VWO)

![VWO Description-only](../screenshots/25-app-marketplace-086-vwo-experimentation-description-only.jpg)
*VWO Description-only*

#### Partner detail: Flyy (Gamification)

![Flyy Description-only](../screenshots/25-app-marketplace-087-flyy-gamification-description-only.jpg)
*Flyy Description-only*

#### Partner detail: Phrasee (Generative AI)

![Phrasee Description-only](../screenshots/25-app-marketplace-088-phrasee-generative-ai-description-only.jpg)
*Phrasee Description-only*

#### Partner detail: Sheetdb (Google Sheets)

![Sheetdb Description-only](../screenshots/25-app-marketplace-089-sheetdb-google-sheets-description-only.jpg)
*Sheetdb Description-only*

#### Partner detail: Appsflyer (Install attribution, Built by Appsflyer)

![Appsflyer Description-only](../screenshots/25-app-marketplace-090-appsflyer-install-attribution-description-only.jpg)
*Appsflyer Description-only*

#### Partner detail: edu Me (Learning)

![eduMe Description-only (Add Content Api screenshot in carousel)](../screenshots/25-app-marketplace-091-edu-me-learning-description-only.jpg)
*eduMe Description-only (Add Content Api screenshot in carousel)*

#### Partner detail: Crowdin (Localisation)

![Crowdin Description-only](../screenshots/25-app-marketplace-092-crowdin-localisation-description-only.jpg)
*Crowdin Description-only*

#### Partner detail: Talon.one (Loyalty, Built by Talon.one)

![Talon.one Description-only](../screenshots/25-app-marketplace-093-talon-one-loyalty-description-only.jpg)
*Talon.one Description-only*

#### Coming-soon interest modal

![Salesforce marketing cloud 'Are you interested?' modal (Yes + Description)](../screenshots/25-app-marketplace-094-coming-soon-are-you-interested-modal-sfmc.jpg)
*Salesforce marketing cloud 'Are you interested?' modal (Yes + Description)*

![Fivetran modal with 'No' selected: Description field hidden](../screenshots/25-app-marketplace-119-coming-soon-interest-modal-no-selected-fivetran.jpg)
*Fivetran modal with 'No' selected: Description field hidden*

#### Partner detail: Telegram (Messaging apps / Connected App)

![Telegram Description](../screenshots/25-app-marketplace-095-telegram-connected-app-description.jpg)
*Telegram Description*

![Telegram Integrate: Request access](../screenshots/25-app-marketplace-096-telegram-integrate-request-access.jpg)
*Telegram Integrate: Request access*

#### Partner detail: Slack (Alert management)

![Slack Description](../screenshots/25-app-marketplace-097-slack-alerts-description.jpg)
*Slack Description*

![Slack Integrate: Request access](../screenshots/25-app-marketplace-098-slack-integrate-request-access.jpg)
*Slack Integrate: Request access*

#### Partner detail: PassKit (Mobile wallets)

![PassKit Description-only](../screenshots/25-app-marketplace-099-passkit-mobile-wallets-description-only.jpg)
*PassKit Description-only*

#### Partner detail: Apxor (Nudges)

![Apxor Description-only](../screenshots/25-app-marketplace-100-apxor-nudges-description-only.jpg)
*Apxor Description-only*

#### Partner detail: Facebook audience (Retargeting)

![Facebook audience Description](../screenshots/25-app-marketplace-101-facebook-audience-retargeting-description.jpg)
*Facebook audience Description*

![Facebook audience Integrate: Send cohorts, Add integration (no permission)](../screenshots/25-app-marketplace-102-facebook-audience-integrate-send-cohorts.jpg)
*Facebook audience Integrate: Send cohorts, Add integration (no permission)*

#### Partner detail: Twilio (SMS)

![Twilio Description-only](../screenshots/25-app-marketplace-103-twilio-sms-description-only.jpg)
*Twilio Description-only*

#### Partner detail: Purchasely (Subscriptions)

![Purchasely Description-only](../screenshots/25-app-marketplace-104-purchasely-subscriptions-description-only.jpg)
*Purchasely Description-only*

#### Partner detail: Zendesk (Support)

![Zendesk Description-only](../screenshots/25-app-marketplace-105-zendesk-support-description-only.jpg)
*Zendesk Description-only*

#### Partner detail: Typeform (Survey)

![Typeform Description-only](../screenshots/25-app-marketplace-106-typeform-survey-description-only.jpg)
*Typeform Description-only*

#### Partner detail: Exotel (Voice calls)

![Exotel Description-only](../screenshots/25-app-marketplace-107-exotel-voice-description-only.jpg)
*Exotel Description-only*

#### Partner detail: Karix (SMS, Whatsapp providers)

![Karix Description-only](../screenshots/25-app-marketplace-108-karix-whatsapp-provider-description-only.jpg)
*Karix Description-only*

#### Partner detail: Webhooks (Automation / Alert management)

![Webhooks Description](../screenshots/25-app-marketplace-109-webhooks-alerts-description.jpg)
*Webhooks Description*

![Webhooks Integrate: Request access](../screenshots/25-app-marketplace-110-webhooks-integrate-request-access.jpg)
*Webhooks Integrate: Request access*

#### Partner detail: Gupshup (SMS)

![Gupshup Description-only](../screenshots/25-app-marketplace-111-gupshup-sms-description-only.jpg)
*Gupshup Description-only*

#### Partner detail: Google Ads Audience (Retargeting)

![Google Ads Audience Description](../screenshots/25-app-marketplace-112-google-ads-audience-description.jpg)
*Google Ads Audience Description*

![Google Ads Integrate: Sign in with Google (OAuth), no permission tooltip](../screenshots/25-app-marketplace-113-google-ads-audience-integrate-sign-in-with-google.jpg)
*Google Ads Integrate: Sign in with Google (OAuth), no permission tooltip*

#### Partner detail: Viber (Messaging apps / Connected App)

![Viber Description](../screenshots/25-app-marketplace-114-viber-connected-app-description.jpg)
*Viber Description*

#### Partner detail: Microsoft Ads Audience (Retargeting, New)

![Microsoft Ads Audience Description](../screenshots/25-app-marketplace-115-microsoft-ads-audience-new-description.jpg)
*Microsoft Ads Audience Description*

![Microsoft Ads Audience Integrate: Request access](../screenshots/25-app-marketplace-116-microsoft-ads-audience-integrate-request-access.jpg)
*Microsoft Ads Audience Integrate: Request access*

#### Partner detail: BigQuery (Data warehouses)

![BigQuery Description (carousel shows a moengage_dumped_events table)](../screenshots/25-app-marketplace-117-bigquery-warehouse-description.jpg)
*BigQuery Description (carousel shows a `moengage_dumped_events` table)*

#### Partner detail: Amplitude (Analytics)

![Amplitude Description](../screenshots/25-app-marketplace-118-amplitude-analytics-description.jpg)
*Amplitude Description*
