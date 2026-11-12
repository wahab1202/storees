## 23. Settings > Advanced (1): Accessibility, Control Groups, Tags, Locales, Content API, Custom Domain

Storees has none of these six settings pages. The nearest equivalents sit inside builders or in env config: a per-campaign control group with per-goal lift, free-text campaign tags that disappear after creation, WhatsApp language variants that nothing routes to, a flow HTTP Request node, and a durable short-link service for WhatsApp buttons on one platform domain. Of the 34 rows, 25 are missing and 8 partial. Two P0 defects come first:
- The HTTP Request node skips the SSRF guard.
- The hourly WhatsApp template sync strips the "Track clicks" flag. Within an hour of submission, tracked buttons stop minting short links and their sends lose the required URL parameter.

After those, the P1s are a guard on the short-link base domain, per-brand link domains (both part of the carousel engine's hard rule), and PII scrubbing of trip context.

### MoEngage overview

These are the first six pages under Settings > Advanced settings. They hold workspace-level controls that sit outside the campaign builders.

- **Accessibility Controls:** one "Enable accessibility fields" switch with Save (off here). According to the page code, turning it on adds accessibility inputs to Push, In-app and Card campaigns. It also adds per-platform (Android, iOS, Web) label and hint fields for the Cards inbox.
- **Control Groups:** a Global Control Group (GCG) of 0-10% of all users, picked at random or from an uploaded CSV (max 50 MB). One option applies it to existing campaigns; another lets marketers opt individual campaigns out.
- **Tags:** a two-level Category > Tag taxonomy:
  - Tag and Category views, each with its own search.
  - Create modals with 50-character names.
  - 9 locked system tags.
  - Per-tag usage counts across campaigns, flows and content blocks.
  - Bulk actions and a 500-tag cap (from the page code).

  A "New" banner says tags now train AI Campaign Decisioning.
- **Locales:** a registry of locales for localising content by language or location. "+ Add locale" was permission-locked for this user.
- **Content API:** a registry of send-time personalisation APIs. Each API has:
  - Method GET, POST or PUT, and a URL with @ personalisation.
  - URL parameters and headers as key/value rows.
  - A Form, JSON or Raw body.
  - Optional caching, for non-personalised calls only.
  - OAuth through saved Authorization Configurations.
  - A test step with PII masking (from the page code).
- **Custom Domain:** a "Shorten & track URL by default" switch for SMS and WhatsApp on u1.mnge.co (8-character paths). It also covers branded short domains set up by CNAME (plus a Branch vendor in the page code), email link-branding and deep-link domains, and landing-page domains.

**Capture caveats:** this is the Test workspace, and nothing was configured in it. Several dialogs were read from page code because their buttons were disabled or permission-locked: Create locale, Content API step 2, the Email and Landing-page domain dialogs, and the Accessibility fields that appear when the switch is on. Nothing was saved, toggled, uploaded or deleted.

| Page visited | URL path |
|---|---|
| Settings flyout (Advanced settings menu) | Hover the Settings icon; links go to `/v4/settings-v2/advanced/...` |
| Accessibility Controls | `/v4/settings-v2/advanced/accessibility-controls` |
| Control Groups | `/v4/settings-v2/advanced/control-groups` |
| Tags | `/v4/settings-v2/advanced/tags` |
| Locales | `/v4/settings-v2/advanced/locales` |
| Content API | `/v4/settings-v2/advanced/content-api` |
| Custom Domain | `/v4/settings-v2/advanced/custom-domain` (redirects to `/custom-domain/sms-and-whatsapp`; other tabs are `/custom-domain/email` and `/custom-domain/lp`) |

### Storees counterpart

Storees has no Advanced settings section. Settings is a flat bar of up to 11 tabs (`packages/frontend/src/app/(dashboard)/settings/layout.tsx:12-39`). The nearest equivalents live inside builders or env config:

- **Control groups:** per campaign only.
  - A 1-50% holdout in campaign step 1 (`packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx:1371-1425`).
  - The split is made and recorded at staging (`packages/backend/src/services/campaignService.ts:61-70, 663-699`; table `campaign_holdouts`).
  - A Control Group Lift card shows the result (`packages/backend/src/services/campaignAnalyticsService.ts:225-304`; `packages/frontend/src/app/(dashboard)/campaigns/[id]/page.tsx:531-568`).
  - Flows have an A/B Split node but no holdout.
- **Tags:** free text typed on a campaign at creation (`campaigns.tags`, `packages/backend/src/db/schema.ts:468-469`). The tags are never shown, edited, filtered on or copied afterwards.
- **Locales:** WhatsApp templates carry a Meta language. At send time Storees swaps in the same-name variant that matches the customer's `language` or `locale` attribute (`packages/backend/src/services/deliveryService.ts:214-267`), but nothing fills that attribute automatically.
- **Content API:** a per-flow HTTP Request node whose response later send nodes can bind to (`packages/backend/src/services/flowExecutor.ts:814-880`; `packages/frontend/src/components/flows/StructuredFlowBuilder.tsx:1234-1297`). It has no registry, test step, caching, OAuth or SSRF guard, and campaigns have no external data source at all.
- **Custom Domain:** a durable short-link service on one platform base URL (`SHORTLINK_BASE_URL`, falling back to `APP_URL`).
  - It is used only for WhatsApp URL buttons marked "Track clicks" (`packages/backend/src/services/shortLinkService.ts`, `packages/backend/src/routes/urlTracker.ts`, table `tracked_links`).
  - The hourly template sync currently strips that flag.
  - Per-project link domains are planned but not built (`docs/SHORTLINK_SERVICE_PLAN.md`, Phase 2).
- **Accessibility:** no setting. The only support is in email: per-image alt text and `role="presentation"` layout tables (`packages/frontend/src/components/email-builder/BlockPropertyEditor.tsx`; `packages/frontend/src/lib/emailCompiler.ts`).

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Navigation | Settings flyout with search and an "Advanced settings" group | Flyout with search box, Settings Home and collapsible groups. "Advanced settings" lists 9 pages; this module covers the first 6 | 🟡 Partial | Flat bar of up to 11 tabs with no search or grouping; non-admins see only Account and Security (`settings/layout.tsx:12-39`). None of this module's six pages exists | Minor today. When workspace control groups, tags and link domains arrive, move Settings to a grouped left rail with an "Advanced" group and a filter box instead of adding tabs | P3 | S |
| Accessibility | Workspace switch that enables accessibility fields in Push, In-app and Card campaigns | "Enable accessibility fields" switch and Save (off here). Unlocks accessibility inputs in Push, In-app and Cards (page code) | ❌ Missing | Searched accessib, altText, alt_text, a11y. FCM receives title, body and image only (`fcmProvider.ts:121-141`). In-app templates have image, CTA and position but no alt text (`templates/create/page.tsx:215-250`). `GET /api/v1/in-app-messages` serves them (`v1InAppMessages.ts`), but neither SDK renders them. Email has always-on Alt Text fields (`BlockPropertyEditor.tsx:376, 638, 720`) | Low priority for web-first Shopify brands. When an in-app renderer ships, give in-app templates an always-visible alt-text field, as email has. Also: compiled emails hard-code `lang="en"` (`emailCompiler.ts:13`; `emailLayoutRenderer.ts:74`), so screen readers read Hindi or Tamil emails with English pronunciation | P3 | S |
| Accessibility | Cards inbox accessibility labels: Android and iOS | Android and iOS tabs with label and hint inputs for Empty state image, Pin card and Card loading image (page code) | ➖ N/A | No Cards or App Inbox channel and no native SDK. `packages/sdk` is browser-only and `packages/sdk-react` holds only a provider, hooks and a route tracker. Apps get push only through FCM tokens they register themselves (`fcmProvider.ts`) | None until Storees ships a native SDK with an inbox | — | — |
| Accessibility | Cards inbox accessibility labels: Web | Web tab with label and hint inputs for the desktop Close inbox button, mobile-web Back button, Refresh icon and floating Cards image (page code) | ❌ Missing | No web inbox or cards renderer. In-app position `inbox` is accepted (`schema.ts:563`; `templates/create/page.tsx:219`) but nothing renders it. The SDK's only UI, the opt-in widget, hard-codes `role="dialog"`, `aria-modal` and `aria-label="Close"` (`sdk/src/widget.ts:172-190`) | Needs a web inbox first. When it ships, give its controls built-in ARIA labels that brands can override | P3 | L |
| Control Groups | Global control group: random allocation (% of all users, 0-10) | "Create global control group" > Random allocation, "% of all users" (0-10). A workspace-wide holdout to benchmark lift | ❌ Missing | No project-level holdout (searched global control, gcg, global_holdout, universal control). Per campaign only: a 1-50% toggle (`campaigns/create/page.tsx:1371-1425`), clamped to 0-50 by the API (`routes/campaigns.ts:187-193, 528-538`). The split is sha256(seed:customerId) with one seed per campaign (`campaignService.ts:61-70, 663-699`), logged in `campaign_holdouts` (`schema.ts:525-541`). A customer held out of one campaign still gets the next. Duplicate copies the % but not the seed (`campaignService.ts:1331`), so duplicates sent without an edit all use the empty seed (`:495`) and hold out the same customers. Flows have no holdout | Add a project GCG: at most 10%, a stable project seed, reusing `bucketHash`. Exclude members at campaign staging, in `deliveryService` (SMS, WhatsApp and push from campaigns and flows) and in the flow email path, which bypasses it (`flowExecutor.ts:750`). Skip transactional sends. Record exclusions and report GCG vs messaged conversions and revenue | P2 | M |
| Control Groups | GCG from an uploaded user list (CSV, max 50 MB) | "Uploading users list": CSV-only drag-and-drop or upload, max 50 MB | ❌ Missing | No user-list upload and no static lists. Bulk import is JSON-only API (`v1Import.ts:57, 154, 339, 370`). CSV appears only in exports (`routes/segments.ts:151`; `v1Onboarding.ts:921`). Segments are filter-only | Random allocation covers what D2C brands need. If built, share the upload with a future uploaded-list segment type | P3 | M |
| Control Groups | GCG scope: apply to existing campaigns; let marketers opt a campaign out | Two checkboxes. Tooltip: by default the CG applies to all new campaigns; the option lets marketers choose per campaign | ❌ Missing | No GCG, so no scope settings. The campaign control group defaults to off and has no project default (`campaigns/create/page.tsx:456-457`) | Ship with the GCG: on by default for new campaigns and flows, an option to cover scheduled or periodic campaigns and live flows, and an admin-only per-campaign override shown on the campaign | P2 | S |
| Control Groups | Benchmark campaign performance against the holdout | Empty-state benefits: benchmark campaigns, and push the team to run better tests. The GCG report itself was not captured | 🟡 Partial | Per campaign only: the "Control Group Lift" card shows, per conversion goal, sent vs holdout conversions and rates, lift % and estimated incremental conversions. It needs conversion goals (`campaignAnalyticsService.ts:225-304`; `campaigns/[id]/page.tsx:531-568`). In flows, an A/B Split branch (1-99%, deterministic) can go straight to Exit (`StructuredFlowBuilder.tsx:1198-1222`; `flowExecutor.ts:184-209`), but flow analytics has no branch comparison (`flowAnalyticsService.ts:7-65`). No cross-campaign view | Add branch-level conversions and lift to flow analytics. Once the GCG exists, add a project incrementality report (GCG vs messaged, by month and channel) | P2 | M |
| Tags | Two-level taxonomy (Category > Tag) with Tag and Category views and searches | Tag/Category radio views, each with its own search and "+ New". Category view shows tag chips with "+N more"; Tag view shows usage counts | ❌ Missing | Free-text tags on campaigns only (`schema.ts:468-469`), typed as chips in step 1 (`campaigns/create/page.tsx:1054-1107`). No tag or category tables and no Tags page. After creation the tags are invisible: the list filters by status and name/subject only (`campaigns/page.tsx:139-156`), the edit page has no tags field although the API accepts tags (`routes/campaigns.ts:518`), and Duplicate drops them (`campaignService.ts:1311-1373`) | Quick win (S, frontend only, because the list API already returns tags): tag chips and a tag filter on the list, editable tags, copy on duplicate, autocomplete from existing tags. Then a Tags settings page with optional categories shared by campaigns, flows and templates | P2 | M |
| Tags | Tag usage counts across campaigns, flows and content blocks | NO OF CAMPAIGNS, NO OF FLOWS and NO OF CONTENT BLOCKS per tag | ❌ Missing | Only campaigns carry tags. Flows (`schema.ts:325-345`), templates (`:545-570`) and WhatsApp templates (`:1178-1212`) have no tags column. There are no reusable content blocks, and nothing counts tag usage | Add tags to flows and templates as part of the taxonomy, then show per-tag counts that link to the filtered list | P3 | M |
| Tags | Default system tags (9, locked) | "Default" category: activation, all users, engagement, incentive, onboarding, promotional, ratings, retention, transactional. Edits are blocked | ❌ Missing | No preset tags. The nearest field is the required Content type, Promotional or Transactional (`schema.ts:414`; `campaigns/create/page.tsx:1109-1143`). It is a sending rule (frequency caps, transactional routing), not a label, and the list can't filter by it. WhatsApp templates keep Meta's category (`schema.ts:1185`) | When the taxonomy ships, seed a small locked set of purpose tags (welcome, abandoned cart, browse abandonment, post-purchase, win-back, promotional, transactional). Keep Content type as the field that enforces sending rules | P3 | S |
| Tags | Create Category and Create tag modals | Category name (50 characters) with an "Add tags to category" multi-select; Tag name (50 characters) with "Add to category". "Default" and "Uncategorised" are reserved | ❌ Missing | A tag exists only when someone types it as a chip on a campaign (`campaigns/create/page.tsx:1056-1063`). The API stores whatever array arrives, with no length, count, case or reserved-name checks (`routes/campaigns.ts:155, 250`) | Part of the Tags page: create and edit dialogs, plus server-side validation (trim, length, case-insensitive uniqueness per project) | P3 | S |
| Tags | Tag management: edit, delete, move, bulk map, bulk delete; 500-tag cap | Edit and Delete tag (delete removes it from campaigns), Edit and Delete category, Move tags, Bulk map, Bulk delete, Show selected. Max 500 tags (page code) | ❌ Missing | No tag registry, so no rename, merge, delete or bulk actions. A typo can be fixed only per campaign through the API (`routes/campaigns.ts:518`), because the edit page has no tags field | Rename, merge and delete that update every tagged campaign, flow and template, plus a per-project cap | P3 | S |
| Tags | Tags train AI Campaign Decisioning | "New" banner: "Your campaign Tags now train the Campaign Decisioning Policies" | ❌ Missing | No campaign-level decisioning. `decisioningService` picks products for message content (`decisioningService.ts:8-13`). Next Best Action returns one of six fixed actions on request and ignores tags (`nextBestActionService.ts:7-8`) | Relevant only once Storees chooses between campaigns per user. Structured tags plus per-tag engagement history are the prerequisite | P3 | XL |
| Locales | Locale registry (list, search, campaigns associated, created on) | Workspace locale list for messaging users by language or location. "+ Add locale" was permission-locked here | ❌ Missing | No locales table, route or page, and campaigns have no language field. Language appears only on `whatsapp_templates` (`schema.ts:1184`), in currency formatting (`productBlockRenderer.ts:53-70`) and as an AI copy option (en, hi, ta, fr, es, zh; `routes/ai.ts:81`) | Add a project locale list (language code, optional country rule, fallback locale) that every channel's content variants key off | P2 | M |
| Locales | Localised campaign content by user language or location | Message users in their language, or differently by location | 🟡 Partial | WhatsApp only. Templates carry one of 70 Meta languages, 12 of them Indian (`WhatsAppTemplateBuilder.tsx:43-69`). The campaign picker groups language variants (`campaigns/create/page.tsx:2417-2480`). Campaign and flow sends swap in the approved same-name template that matches `customAttributes.language` or `.locale` (`deliveryService.ts:214-267`). Nothing fills that attribute automatically: the SDK's `$language` (`sdk/src/events.ts:47`) is never copied to the customer, and Shopify sync ignores the customer's locale (`syncWorker.ts:21-31, 160-182`). Only an explicit identify call sets it, and the value must equal Meta's code (`hi`, `en_US`), not the browser's `hi-IN`. Email, SMS and push have no language variants; the AI copywriter can only draft in 6 languages. Multi-language carousel routing is Phase C (`docs/whatsapp-dynamic-carousel-engine.md:381`) | Quick win (S): normalise the SDK's `$language` and Shopify's customer locale to a Meta code on the customer, so WhatsApp variant routing actually fires. Then add per-locale content variants, with fallback, to email, SMS and push, keyed off the locale registry | P2 | M |
| Content API | Content API registry (named, reusable; search by name or URL; view-only permission) | Settings list of external personalisation APIs. "+ Add content API", "Search API by name or URL", and a view-only state for some roles | ❌ Missing | No registry. The only send-time HTTP call is configured inline, per node, in a flow (`HttpRequestNode`, `shared/types.ts:726-749`), so each flow re-enters the API and campaigns can't use it. Data connectors (`genericHttpConnector.ts`) import customers, products and orders on a schedule; they don't feed message content | Add a project "Content sources" registry (name, request, auth, cache, sample response) that flows and campaigns reference. Admins edit it; other roles get a view-only state | P2 | M |
| Content API | Send-time external data in message content | Campaigns call registered APIs at send time and use the response to personalise content | 🟡 Partial | Flows only, through the HTTP Request node. It stores `node_outputs.<key> = {status, body}` on the trip (`flowExecutor.ts:213-222, 814-880`). Later send nodes bind to it through "Event payload path…", typed by hand as `node_outputs.<key>.body.<field>` (`flowExecutor.ts:650-655`; `VariablePanel.tsx:326-346`). Campaign variable sources are customer, attribute, product, event (flows only), project, literal and decision (`shared/types.ts:1094-1111`), with no external source. Nothing generates unique coupons: there is no Shopify discount-code creation, and codes are typed or bound from a payload | Let campaign variables bind to a registered content source, fetched per recipient with concurrency limits and the default value on timeout. For Shopify D2C the main use is unique per-recipient coupons, which a native Shopify discount-code source would serve better than a generic API | P2 | M |
| Content API | Request: GET/POST/PUT, URL with @ personalisation, URL params and headers as key/value rows | API name, Method, and Url ("Type @ to personalize"). URL Parameters and Headers are key/value rows with @ personalisation in the values | 🟡 Partial | The HTTP node offers GET/POST/PUT/PATCH/DELETE, one URL field, header rows and "Save response as" (`StructuredFlowBuilder.tsx:1234-1297`). It has no URL-parameter rows and no variable picker. Tokens are typed by hand and limited to customer id, email, phone, name and external id plus trigger-event and earlier-node paths, so custom attributes and order aggregates aren't available (`flowExecutor.ts:829-843`). Values aren't URL-encoded (`emailService.ts:109-121`), so an email containing `+` or a value with `&` corrupts the query string | Add encoded query-parameter rows, a variable picker, and the full customer context to interpolation | P2 | S |
| Content API | Body types: Form, JSON (auto Content-Type), Raw | POST and PUT add a Body type: Form (key/value rows), JSON (key/value rows plus an automatic Content-Type header) or Raw (textarea with @ personalisation) | 🟡 Partial | One "Body (JSON)" textarea for methods other than GET (`StructuredFlowBuilder.tsx:1269-1279`). The executor always sends `Content-Type: application/json`, even for GET, unless a header row overrides it (`flowExecutor.ts:852-858`). There is no form encoding, and values aren't JSON-escaped, so a double quote in a product title breaks the body | Add Form and Raw modes, and escape values to suit the body type | P3 | S |
| Content API | Response caching for non-personalised APIs | "Enable caching" stores the response; allowed only for non-personalised calls; no TTL field | ❌ Missing | Every trip makes its own call (10 s default timeout, 30 s max) and stores its own copy (`flowExecutor.ts:860-879`). A burst of flow entries hits the external API once per customer | Cache non-personalised responses in Redis (already in the stack), keyed by a hash of the request, with a TTL | P3 | S |
| Content API | OAuth through a saved Authorization Configuration | "Enable OAuth" reveals "Select authorization setting", which lists configs from Settings > Authorization Configuration. The page code adds a prefix and an AUTHORIZATION header preview | ❌ Missing | No OAuth and no shared credentials for outbound calls. Secrets for the HTTP node go in header rows and are saved as plain text in the flow's `nodes` JSON (`schema.ts:325-336`), visible to any admin who opens the flow. Data connectors support only static bearer, API-key or basic auth, stored encrypted per connector (`genericHttpConnector.ts:8-12`; `dataSyncService.ts:715-717`) | Store each credential once, encrypted and write-only after saving, with OAuth2 client-credentials token refresh. Content sources and HTTP nodes then reference it | P3 | M |
| Content API | Step 2 "API response": test run with sample values | The stepper's second step takes sample values for personalised fields, runs the API and shows the response before Save (page code) | ❌ Missing | No test button or endpoint. The only check is that the URL isn't empty (`StructuredFlowBuilder.tsx:1451`). The response shape is unknown until a live trip runs, and no UI renders stored responses | Add "Test request" with a sample customer and event, and render the JSON as a tree whose fields can be clicked to bind a variable | P2 | S |
| Content API | Mask PII fields in the API response | "Mask PII fields" and "Select fields to mask" after a test run (page code) | ❌ Missing | Responses are stored raw in `flow_trips.context` (`flowExecutor.ts:875-879`) and returned unmasked by two routes. One is the admin flow debugger (`routes/flows.ts:356-490`, context at :412). The other is `GET /api/customers/:id/trips`, which any role that can see the customer may call; unlike `/events` and `/journey`, it skips `scrubJsonbPii` (`customers.ts:650-683` vs :642-643 and :743-744). So a role with "See contact details" off still receives raw email and phone from trigger payloads and API responses in the JSON (the UI doesn't render it). The executor also logs the full interpolated URL (`flowExecutor.ts:869`), so a `{{customer_email}}` query value lands in the logs | Now (S): apply `scrubJsonbPii` to trip context in both routes and stop logging the full URL. With a content-source registry, let admins mark response fields as PII so they are masked in debuggers and logs | P1 | S |
| Content API | Outbound calls limited to public endpoints (SSRF safety) | Not a setting in the capture. APIs are registered centrally by users with edit rights and called from MoEngage's backend. This row records the safety baseline Storees' equivalent must meet | ❌ Missing | The HTTP node calls `fetch(url)` directly (`flowExecutor.ts:862`) and never calls `assertPublicUrl` (`ssrfGuard.ts:13-35`); webhooks and data connectors both use that guard (`webhookService.ts:122`; `genericHttpConnector.ts:260`). Any project admin can make the backend call internal hosts with headers of their choosing, such as the ML service, which the backend calls with no auth (`mlProxyService.ts:12, 166-170`). The admin can read the response in the flow debugger (`routes/flows.ts:412`) or forward it with a second node. URL tokens can also come from public SDK event payloads | Call `assertPublicUrl` before each request and when a flow is saved. Refuse redirects: fetch follows them by default, and webhooks and connectors don't block them either. Cap the response size. Fix this before promoting the node or building a Content API on it | P0 | S |
| Custom Domain | Shorten and track URLs in WhatsApp messages | "Shorten & track URL by default": URLs in the message body are shortened to 8 characters after u1.mnge.co, or a custom domain, and tracked for click statistics | 🟡 Partial | Only WhatsApp URL buttons ticked "Track clicks" (`WhatsAppTemplateBuilder.tsx:770-777`). Each send mints a 9-character slug (`shortLinkService.ts:33-47`; `deliveryService.ts:276-310`). `GET /c/:slug` returns a 302, bumps counts, marks the message clicked, emits `whatsapp_clicked` and updates the campaign (`shortLinkService.ts:55-94`; `urlTracker.ts:11-21`). URLs in body or header variables go out untracked. In practice it breaks within the hour: the hourly template sync, and the manual Sync, overwrite the stored `buttons` with the provider's copy (`whatsappTemplateSyncService.ts:36-52`; `templateStatusWorker.ts:29, 146-154`), which drops `track` and the real destination. Sends then stop minting slugs and omit the button's required URL parameter, and the flow's destination override disappears (`SendNodeConfigModal.tsx:80-87`). Carousel card buttons can also be ticked (`WhatsAppTemplateBuilder.tsx:882`), but nothing fills card slugs at send time | First (S): keep `track` and the destination across syncs, either by merging or by not overwriting `buttons` on rows submitted through Storees. Then shorten URL-valued body and header parameters with the same service, so WhatsApp body links get click statistics too | P0 | S |
| Custom Domain | Shorten and track URLs in SMS messages | The same switch covers URLs in SMS bodies | ❌ Missing | SMS "Link Tracking" only appends UTM parameters to URLs in the text (`campaignService.ts:1023-1029`; `campaigns/create/page.tsx:2876-2905`); nothing shortens or tracks SMS links. Campaign SMS also go out with an empty body: the UI sends no `templateId` for SMS (`campaigns/create/page.tsx:611`), and all four SMS providers build the text only from a template row (for example `twilioProvider.ts:7-17`) | After fixing SMS bodies, send SMS links through the short-link service, which also saves characters in each 160-character segment. Indian senders must use DLT-whitelisted URL domains, which favours a stable per-brand short domain | P2 | S |
| Custom Domain | Workspace default with per-campaign URL deselection | The switch sets the workspace default. URLs can be deselected in step 2 of campaign creation. The default applies only to new campaigns | ❌ Missing | No project-level link-tracking setting. Tracking is a per-button flag fixed into the WhatsApp template at submission (`metaWhatsappProvider.ts:120-130`). UTM is a per-campaign toggle (`campaigns/create/page.tsx:2876-2905`) | When body-URL shortening ships, add a project default and a per-campaign list of detected links with include/exclude checkboxes | P3 | S |
| Custom Domain | Default platform short domain | Without a custom domain, links are shortened on u1.mnge.co (for example u1.mnge.co/xxxxxx) | 🟡 Partial | One platform base from env: `SHORTLINK_BASE_URL`, else `APP_URL`, else `http://localhost:3001` (`shortLinkService.ts:15-21`). `go.storees.io` is still to be set up (`docs/SHORTLINK_SERVICE_PLAN.md:59-61, 72-73`). `.env.example` has no `SHORTLINK_BASE_URL` and sets `APP_URL=http://localhost:3001`, and nothing validates the base. The base is baked into every tracked URL button, carousel cards included, when a template is submitted to Meta or Pinnacle (`metaWhatsappProvider.ts:120-130`; `pinnacleWhatsappProvider.ts:13, 145`). Changing it later means re-approving each such template (`SHORTLINK_SERVICE_PLAN.md:7-9`) | Add `SHORTLINK_BASE_URL` to `.env.example`. Refuse to submit tracked-button templates when the base is unset, not HTTPS, or localhost. Show the domain beside "Track clicks". This is also the CLAUDE.md hard rule for dynamic carousel templates | P1 | S |
| Custom Domain | Branded short-link domain via CNAME (Verify & Save) | "Configure" opens "Add new shortening method" with the vendor "Custom Domain". Prerequisites: CNAME your domain to u1.mnge.co with a 30-minute TTL. Then enter the domain and click Verify & Save | ❌ Missing | No per-project link domain: no table, route or UI. `shortLinkService.ts:6-13` calls the custom-domain layer Phase 2. Phase 2 (`project_link_domains`, CNAME verification, on-demand TLS) is only planned, and it is blocked on choosing between Cloudflare for SaaS and Caddy (`SHORTLINK_SERVICE_PLAN.md:26-35, 44-54, 62-63`). Ready to reuse: slugs are globally unique, so `/c/:slug` already works on any host (`urlTracker.ts:11-21`), and the email sending-domain card, with its DNS records table and "Check verification status", is a ready UI pattern (`settings/project/page.tsx:262-401`) | Build Phase 2: per-project link domains with CNAME verification and TLS, used both when minting links and when submitting templates. Settle each brand's domain before its tracked-button templates are approved | P1 | L |
| Custom Domain | Third-party shortener vendor (Branch) | Page code shows a Branch vendor: Authorisation key, sample URL, and a callback URL for click tracking | ❌ Missing | Only Storees' own redirect service. No shortener or deep-link vendor code (searched branch, appsflyer, deep link, universal link, onelink) | Low relevance for web-first Shopify brands. Consider it only for brands whose apps already use Branch | P3 | M |
| Custom Domain | Email link-branding domain | "+ Add link branding": custom click-wrapping domain, CAA/SSL prerequisites, Set as default. Replacing or deleting the default swaps the domain in active campaigns. Disabled in this workspace | ❌ Missing | Storees registers only the sending domain with Resend, passing just the domain name (`emailDomainService.ts:129`), and never sets click or open tracking. Email clicks come only from Resend webhooks (`resendWebhook.ts:145`); SendGrid, Postmark, Mailgun and SES have no webhook routes, so their sends get no clicks. Email links never pass through the short-link service | Once per-project link domains exist, wrap email links through the short-link service on the brand's domain. That gives one click model for email, SMS and WhatsApp that works with every email provider | P2 | M |
| Custom Domain | Email deep-linking domains (Branch/AppsFlyer) | "+ Add deep linking domain": Branch or AppsFlyer CNAME, "Mark this domain as default", acknowledge the prerequisites. Disabled in this workspace | ❌ Missing | No app deep-linking support: no mobile SDK and no Branch, AppsFlyer or universal-link code | Matters only for brands with apps; defer | P3 | M |
| Custom Domain | Landing page custom domains | Landing pages tab: "Search by domain", "+ Add custom domain" (disabled here) and an empty list | ❌ Missing | No hosted landing pages. "Landing page" appears only as an SDK event property (`sdk/src/autotrack.ts:112`). Lead capture uses on-site widgets on the merchant's own storefront (`sdk/src/widget.ts`) | Not needed while Shopify storefronts host the pages. Revisit only if Storees adds hosted pages, such as WhatsApp opt-in pages | P3 | XL |

### Storees-only strengths

- **HTTP Request flow node: outbound call and data fetch mid-journey.**
  - Where: `packages/shared/src/types.ts:726-749`; `packages/backend/src/services/flowExecutor.ts:814-880`; `packages/frontend/src/components/flows/StructuredFlowBuilder.tsx:330, 1234-1297`.
  - Why it matters: one inline node does the job of both MoEngage's Content API fetch and a webhook push to a CRM or ERP. It supports PATCH and DELETE, its output feeds later send nodes, and a failed call is recorded without stranding the customer. Caveat: it needs the SSRF guard (P0) and a test button before it is shown to prospects.
- **Per-recipient tracked WhatsApp buttons with a destination override.**
  - Where: `packages/backend/src/services/deliveryService.ts:276-310` (`wa_button_dest_N`, with UTM added to the destination); `packages/backend/src/services/providers/metaWhatsappProvider.ts:120-130` (approved base `<domain>/c/{{1}}`); `packages/backend/src/services/shortLinkService.ts:55-94`; `packages/frontend/src/components/flows/SendNodeConfigModal.tsx:80-87`.
  - Why it matters: each recipient's tap goes to their own URL, such as their abandoned-checkout link, through one Meta-approved button, with UTM and click attribution to the message, campaign and customer. That is the core D2C WhatsApp recovery flow and the base of the carousel engine. Caveat: until the template-sync defect is fixed (P0 row above), it only works until the next hourly sync.
- **First-party device-ID endpoint built for a merchant CNAME.**
  - Where: `packages/backend/src/routes/deviceId.ts:5-40` (server-set httpOnly `storees_did` cookie, 400 days), mounted at `/id` (`packages/backend/src/index.ts:139-142`); the SDK reconciles against it on init (`packages/sdk/src/core.ts:76-93`, `serverDeviceId` option).
  - Why it matters: a first-party tracking subdomain (for example id.brand.com) keeps device IDs alive under Safari ITP. Nothing in the product yet helps a merchant set up or verify that CNAME, so it belongs on a future Domains settings page next to link domains.

### UX notes

- **Information architecture (002).** MoEngage groups all six pages under "Advanced settings" in a searchable Settings flyout. Storees has no single home for them:
  - the control group sits in campaign step 1 (`campaigns/create/page.tsx:1371-1425`), and so do tags (`:1082-1107`);
  - the API fetch sits in the flow builder's side panel (`StructuredFlowBuilder.tsx:1234-1297`);
  - the short-link domain is an env var.

  As workspace-level versions ship, give them pages under a grouped Settings rail (for example Advanced: Control groups, Tags, Links & domains, Content sources) instead of adding tabs to the flat bar (`settings/layout.tsx:12-26`).
- **Control groups (003-007).** MoEngage's GCG form is one compact panel: two radios, a % input capped at 10, and two scope checkboxes with a tooltip. Storees' per-campaign control explains the consequence better, with a slider and live copy ("10% held back, 90% receive the campaign. Split is deterministic per customer."; `campaigns/create/page.tsx:1398-1424`). Keep that style for a GCG. In campaign step 1, show "N% of users are in the global control group and won't receive this" above the campaign control group, so marketers can see that the two holdouts stack.
- **Tags (008-015).** MoEngage's Tag/Category switch and per-tag usage counts make the taxonomy auditable. Its no-match search shows a bare table header with no message (015), which Storees shouldn't copy. Storees' chip input (Enter or comma to add, Backspace to remove; `campaigns/create/page.tsx:1054-1107`) is nicer for entry, but it needs autocomplete from existing tags. Tags also need to appear as chips and as a filter on the campaign list (`campaigns/page.tsx:139-156`). Until they do, the helper text's promise ("Optional labels for organising the campaign list") stays false.
- **Content API (019-026).** MoEngage uses a wide right-hand drawer with a two-step stepper and key/value editors for params, headers and body. Choosing JSON adds the Content-Type row automatically (022), which shows the user what will be sent. Storees fits method, URL, headers, JSON body and output key into the narrow flow side panel. Users then have to type `node_outputs.<key>.body.<path>` into the variable panel's "Event payload path…" (`VariablePanel.tsx:326-346`) without ever seeing a response. Adopt the test step: run the call for a sample customer and let the user click a field in the JSON to bind it.
- **Custom Domain (027-030).** The SMS & WhatsApp tab states the rules up front in an info box: all body URLs are shortened to 8 characters, URLs can be deselected per campaign in step 2, and the default applies only to new campaigns. The "Add new shortening method" drawer lists the CNAME record (Type, Name, Value u1.mnge.co, TTL 30 min) before the domain input and Verify & Save. Storees' email sending-domain card is already richer, with status-aware warnings, a DNS records table, "Check verification status" and a noreply warning (`settings/project/page.tsx:262-401`); reuse it for link domains. In the WhatsApp template builder, the "Track clicks" checkbox (`WhatsAppTemplateBuilder.tsx:770-777`) should name the domain that will be baked in and warn that it can't change after approval.
- **Locked states (016-018, 031-032).** MoEngage keeps admin-only actions visible but disabled. Locales explains why in a tooltip ("You do not have permission to add locale. Contact Admin for editing access."), but the Email and Landing-page buttons are disabled with no explanation. Storees hides admin-only settings tabs from non-admins entirely (`settings/layout.tsx:33-39`). For new workspace settings, a read-only view with an "ask an admin" hint helps managers find them, and a disabled control should always say why.
- **Empty states (004, 016, 019).** MoEngage uses large illustrations and, on Content API, two identical "+ Add" buttons. In line with Storees' information-density principle, prefer a one-line explanation, a single primary action and a docs link.
- **Accessibility (001).** MoEngage hides accessibility inputs behind a workspace switch to keep campaign forms short. Storees' email builder simply shows "Alt Text" on every image block (`BlockPropertyEditor.tsx:376`), which is the better default. Carry that into in-app templates (`templates/create/page.tsx:215-250`) instead of adding a switch.

### Verification notes

Every row was re-checked against the code at `2063cdc`. Final counts over 34 rows: 0 ✅, 8 🟡, 25 ❌, 0 ⭐, 1 ➖.

- **Shorten and track URLs in WhatsApp (🟡): P1 raised to P0; evidence extended.** `syncWhatsappTemplatesForProject` upserts the provider's `buttons` unconditionally (`whatsappTemplateSyncService.ts:36-52`). It runs hourly for every project (`templateStatusWorker.ts:29, 146-154`), after Meta connect and from the Sync button. `parseMetaTemplate` returns Meta's raw buttons (`metaWhatsappProvider.ts:140-157`), and Pinnacle reuses it (`pinnacleWhatsappProvider.ts:209`). The overwrite drops the Storees-only `track` flag and the real destination. After that, `injectTrackedButtonSlugs` skips the button, `buildTemplateComponents` sends no URL parameter (`whatsappUtils.ts:78-92`), and the flow modal shows a "URL suffix" field instead of the destination override. Nothing re-merges the flag on read (`whatsappAdmin.ts:88-101`). Click tracking is the core of the Phase A smoke test, and the fix is small, so this is now P0.
- **Default system tags: 🟡 changed to ❌.** Storees has no preset or system tags. Content type (Promotional/Transactional) is a sending rule, not an organising label, and the campaign list can't filter by it. Calling it a partial match overstated what exists.
- **Global control group, random allocation (❌): P1 lowered to P2.** Campaign control groups are at full parity (module 01), and modules 01 and 06 both rate this same global-holdout gap P2. Storees already measures lift per campaign, so the GCG adds programme-level incrementality rather than filling a first-order hole. Evidence confirmed: there is no holdout outside `campaign_holdouts`, and seedless duplicates share the empty seed (`campaignService.ts:495, 1331`). A draft can be sent from the detail page without an edit (`campaigns/[id]/page.tsx:126-241`).
- **Localised campaign content (🟡): evidence corrected.** "Nothing fills that attribute" was too strong. A merchant can set `language` through identify or user attributes (`v1Events.ts:585-617, 940-960`). Even then, the value must match Meta's code exactly (`deliveryService.ts:245-262`), while the browser reports BCP-47 tags such as `hi-IN` (`sdk/src/context.ts:53`). Also added that the AI copywriter offers six languages (`routes/ai.ts:81`; `AiCopywriterPanel.tsx:49`) but does no routing.
- **Locale registry (❌): evidence corrected.** The claim that the search "finds only" the WhatsApp language and currency formatting missed the AI copywriter language option. The status is unchanged.
- **Mask PII (❌, P1): evidence extended.** The executor logs the full interpolated URL (`flowExecutor.ts:869`). Trip context is returned in the API payload but not rendered by `JourneysTab` or `FlowDebugPanel`, so the exposure is through the API.
- **Accessibility switch and Cards inbox Web (❌): evidence corrected.** The push form collects a click URL, but FCM receives only title, body and image. A public `GET /api/v1/in-app-messages` API exists (`v1InAppMessages.ts`), but neither SDK renders in-app messages.
- **SSRF (❌, P0):** confirmed that no backend code validates `http_request` URLs at save time, and that the node's URL can interpolate trigger-event properties, which can come from public SDK events.
- **Storees-only strengths: three items removed.**
  - Per-campaign control group with lift: MoEngage has campaign control groups too (module 01 rates them ✅ Full), so this is parity.
  - Flow A/B Split as a holdout: a workaround for missing flow control groups, which module 06 lists as P1.
  - Always-on email alt text: MoEngage's email editor has the same.

  A caveat about the sync defect was added to the tracked-buttons item.
- **Rows I tried and failed to refute (❌):** I searched these terms and found nothing that would change a status:
  - global control, gcg, global_holdout, universal control
  - csv, multer, upload, static list
  - tags, labels and folders on flows, segments and templates
  - locale and language (customer fields, Shopify locale)
  - content api, content source, external data, data feed
  - oauth, client_credentials, refresh_token
  - redirect handling, response caching
  - branch, appsflyer, deep link, universal link, onelink
  - landing page, hosted page
  - accessib, a11y, aria, alt
  - coupon, discount_codes, price_rules, code_redemption
  - content block, snippet
- **Side observations (outside this module's scope):**
  - The same sync also replaces `header` with `{format, text}` (`metaWhatsappProvider.ts:144`), dropping the approved media sample that `buildTemplateComponents` falls back to for unmapped media headers (`whatsappUtils.ts:69`).
  - `buildTemplateComponents` emits no carousel component at all, so carousel templates can be submitted but not yet sent with their cards. That is expected Phase A work, but tracked card buttons will need slugs minted per card.

### Screens

#### Settings flyout (Advanced settings menu)

![Settings flyout scrolled to the 'Advanced settings' group, with Accessibility controls active](../screenshots/23-settings-advanced-1-002-settings-flyout-advanced-menu.jpg)
*Settings flyout scrolled to the 'Advanced settings' group, with Accessibility controls active*

#### Accessibility Controls

![Accessibility Controls page: one 'Enable accessibility fields' switch (OFF) and a Save button](../screenshots/23-settings-advanced-1-001-accessibility-page.jpg)
*Accessibility Controls page: one 'Enable accessibility fields' switch (OFF) and a Save button*

#### Control Groups

![Control Groups empty state: Global control group tab, benefit bullets and Know more link](../screenshots/23-settings-advanced-1-003-control-groups-empty-top.jpg)
*Control Groups empty state: Global control group tab, benefit bullets and Know more link*

![Bottom of the empty state: pie illustration and 'Create global control group' button](../screenshots/23-settings-advanced-1-004-control-groups-empty-bottom-create-button.jpg)
*Bottom of the empty state: pie illustration and 'Create global control group' button*

![Create GCG form, Random allocation: % of all users input (0-10), two checkboxes, Cancel/Create](../screenshots/23-settings-advanced-1-005-control-groups-create-form-random-allocation.jpg)
*Create GCG form, Random allocation: % of all users input (0-10), two checkboxes, Cancel/Create*

![Tooltip on 'Allow marketers to send campaigns to these users' (marketers can opt in or out of the CG per campaign)](../screenshots/23-settings-advanced-1-006-control-groups-allow-marketers-tooltip.jpg)
*Tooltip on 'Allow marketers to send campaigns to these users' (marketers can opt in or out of the CG per campaign)*

![Create GCG form, 'Uploading users list': CSV dropzone, max 50 MB](../screenshots/23-settings-advanced-1-007-control-groups-create-form-upload-users-list.jpg)
*Create GCG form, 'Uploading users list': CSV dropzone, max 50 MB*

#### Tags

![Tags, Category view: AI decisioning banner, Tag/Category switch, New Category, Default category row with +5 more](../screenshots/23-settings-advanced-1-008-tags-category-view.jpg)
*Tags, Category view: AI decisioning banner, Tag/Category switch, New Category, Default category row with +5 more*

![Category view with the Default category's 9 system tags expanded](../screenshots/23-settings-advanced-1-009-tags-category-view-all-tags-expanded.jpg)
*Category view with the Default category's 9 system tags expanded*

![Create Category modal: Category name (50 chars) and 'Add tags to category'](../screenshots/23-settings-advanced-1-010-tags-create-category-modal.jpg)
*Create Category modal: Category name (50 chars) and 'Add tags to category'*

!['Add tags to category' multi-select listing tags grouped under Default](../screenshots/23-settings-advanced-1-011-tags-create-category-add-tags-dropdown.jpg)
*'Add tags to category' multi-select listing tags grouped under Default*

![Tag view table: tag name, category, and number of campaigns, flows and content blocks per tag](../screenshots/23-settings-advanced-1-012-tags-tag-list-view.jpg)
*Tag view table: tag name, category, and number of campaigns, flows and content blocks per tag*

![Create tag modal: Tag name (50 chars) and 'Add to category'](../screenshots/23-settings-advanced-1-013-tags-create-tag-modal.jpg)
*Create tag modal: Tag name (50 chars) and 'Add to category'*

!['Add to category' dropdown with no categories ('Your search did not match anything')](../screenshots/23-settings-advanced-1-014-tags-create-tag-category-dropdown-empty.jpg)
*'Add to category' dropdown with no categories ('Your search did not match anything')*

![Tag search with no match: empty table, no message](../screenshots/23-settings-advanced-1-015-tags-search-no-match.jpg)
*Tag search with no match: empty table, no message*

#### Locales

![Locales empty state: 'No locales added yet' and a disabled '+ Add locale' button](../screenshots/23-settings-advanced-1-016-locales-empty-state.jpg)
*Locales empty state: 'No locales added yet' and a disabled '+ Add locale' button*

![Locales info tooltip with Know more link](../screenshots/23-settings-advanced-1-017-locales-info-tooltip.jpg)
*Locales info tooltip with Know more link*

![Locked state: 'You do not have permission to add locale. Contact Admin for editing access.'](../screenshots/23-settings-advanced-1-018-locales-add-locale-no-permission-tooltip.jpg)
*Locked state: 'You do not have permission to add locale. Contact Admin for editing access.'*

#### Content API

![Content API empty state with two '+ Add content API' buttons](../screenshots/23-settings-advanced-1-019-content-api-empty-state.jpg)
*Content API empty state with two '+ Add content API' buttons*

![Add content API drawer, step 1 'Add details' (GET): name, method, caching, OAuth, URL, URL params, headers](../screenshots/23-settings-advanced-1-020-content-api-add-drawer-step1-get.jpg)
*Add content API drawer, step 1 'Add details' (GET): name, method, caching, OAuth, URL, URL params, headers*

![POST method adds 'Body type' (Form selected) with key/value rows](../screenshots/23-settings-advanced-1-021-content-api-post-body-type-form.jpg)
*POST method adds 'Body type' (Form selected) with key/value rows*

![JSON body type auto-adds the header Content-Type: application/json](../screenshots/23-settings-advanced-1-022-content-api-body-type-json-auto-header.jpg)
*JSON body type auto-adds the header Content-Type: application/json*

![Raw body type: free-text body with @ personalization](../screenshots/23-settings-advanced-1-023-content-api-body-type-raw.jpg)
*Raw body type: free-text body with @ personalization*

!['Enable OAuth' ON reveals a required 'Select authorization setting' field](../screenshots/23-settings-advanced-1-024-content-api-enable-oauth-auth-setting.jpg)
*'Enable OAuth' ON reveals a required 'Select authorization setting' field*

![Authorization setting dropdown (searchable, no configs in this workspace)](../screenshots/23-settings-advanced-1-025-content-api-auth-setting-dropdown-empty.jpg)
*Authorization setting dropdown (searchable, no configs in this workspace)*

![Clicking '2 API response' with empty required fields marks step 1 with an error and does not advance](../screenshots/23-settings-advanced-1-026-content-api-step2-blocked-validation.jpg)
*Clicking '2 API response' with empty required fields marks step 1 with an error and does not advance*

#### Custom Domain (link shortening & branding)

![Custom Domain > SMS & Whatsapp: 'Shorten & track URL by default' switch, rules, and custom domain promo with Configure](../screenshots/23-settings-advanced-1-027-custom-domain-sms-whatsapp-tab.jpg)
*Custom Domain > SMS & Whatsapp: 'Shorten & track URL by default' switch, rules, and custom domain promo with Configure*

![Page-title tooltip explaining branded URL shortening](../screenshots/23-settings-advanced-1-028-custom-domain-header-info-tooltip.jpg)
*Page-title tooltip explaining branded URL shortening*

!['Custom domain' section tooltip](../screenshots/23-settings-advanced-1-029-custom-domain-section-info-tooltip.jpg)
*'Custom domain' section tooltip*

!['Add new shortening method' drawer: vendor card, CNAME prerequisites (to u1.mnge.co, TTL 30 min), domain input, Verify & Save](../screenshots/23-settings-advanced-1-030-custom-domain-add-shortening-method-drawer.jpg)
*'Add new shortening method' drawer: vendor card, CNAME prerequisites (to u1.mnge.co, TTL 30 min), domain input, Verify & Save*

![Email tab: domain search, disabled 'Add deep linking domain' and 'Add link branding', 'No custom domains found'](../screenshots/23-settings-advanced-1-031-custom-domain-email-tab-empty.jpg)
*Email tab: domain search, disabled 'Add deep linking domain' and 'Add link branding', 'No custom domains found'*

![Landing pages tab: domain search, disabled '+ Add custom domain', empty state](../screenshots/23-settings-advanced-1-032-custom-domain-landing-pages-tab-empty.jpg)
*Landing pages tab: domain search, disabled '+ Add custom domain', empty state*
