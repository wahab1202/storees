## 04. Engage > Campaign builder: WhatsApp

Storees matches MoEngage's One Time and Periodic WhatsApp builder and is ahead on templates (authoring, a 30-rule lint, submission and status tracking inside the campaign), audience diagnostics, per-campaign holdouts, smart-content variables and a WhatsApp inbox with an AI chatbot; event-triggered WhatsApp exists only in Flows, not as a campaign type. Several WhatsApp send paths don't hold up: a campaign left on "Saved segment" with nothing picked goes to every customer (P0), approved carousels can't be delivered, the hourly template sync strips click tracking from buttons, utility templates are wrongly limited to the 24-hour window, A/B and UTM have no effect for WhatsApp, and scheduling ignores the chosen time zone and the periodic send time and end date. Against MoEngage it also lacks Meta Embedded Signup, Gupshup/Karix/Infobip in the UI, multiple senders, quiet hours, limited-time-offer templates and alternate trigger events.

### MoEngage overview

MoEngage lists WhatsApp under New Campaign > Messaging apps with three delivery types: One Time, Periodic and Event Triggered. Each opens the same 3-step wizard: Target users > Content > Schedule and goals.

- **Step 1 (Target users):**
  - Campaign name and tags.
  - All users, or filters by user property, user behavior, user affinity or custom segment, with nested filters, Exclude Users and Show count.
  - A per-campaign "ignore opt-in" bypass and a global control group.
  - Event Triggered adds IF / OR / AND trigger criteria, sent immediately or after a delay in minutes, hours or days.
- **Step 2 (Content):**
  - A sender picker, which lists only senders with an active template, and an approved-template picker.
  - Placeholder mapping.
  - An iPhone-style preview with a personalized-preview drawer that looks up a real user.
  - UTM parameters.
  - Test sends to seven identifier types.
- **Step 3 (Schedule and goals):**
  - ASAP or a fixed time in an IANA campaign time zone.
  - Daily, weekly or monthly recurrence with a repeat interval, weekday chips, a day grid, Nth weekday, end conditions and a "next sent on" line.
  - For Event Triggered, an always-on window with start and end.
  - Up to five conversion goals with revenue and an hours/days window.
  - Delivery controls: ignore or count frequency capping and a 60,000 rpm request limit. Triggered sends add a minimum delay and Ignore DND.
  - An "All users" warning before Publish.
- **Templates:** the builder is template-only. Templates are registered after BSP approval (MoEngage does not validate them) or synced from Gupshup, Karix and Infobip.
- **Settings:** BSP and sender setup (Meta Embedded Signup, Gupshup, Infobip, Karix), an approved-templates library, number and opt-in attribute mapping, inbound lead and message capture, PII tokenization (enabled via the CSM), and WhatsApp frequency capping and DND.
- **Seen only in the code:** carousel and limited-time-offer templates; quick-reply, call, URL and copy-code buttons; link shortening on a custom domain; A/B, locale and Sherpa variations.
- **Absent from MoEngage:** catalog messages, WhatsApp Flows, channel fallback and Save as draft.

Capture caveats: the workspace had no BSP, sender, approved template or events. Template-dependent content was therefore read from the WhatsApp micro-frontend code, and Step 3 was opened by calling the builder's own client-side `moveToStep(3)`. Nothing was saved.

| Page visited | URL path |
|---|---|
| New Campaign modal > WhatsApp | `/v4/campaigns/all` (Create campaign modal) |
| WhatsApp One Time builder, Step 1: Target users | `/v4/whatsapp/create/one-time/` |
| WhatsApp One Time builder, Step 2: Content | `/v4/whatsapp/create/one-time/` (step 2) |
| WhatsApp One Time builder, Step 3: Schedule and goals (forced) | `/v4/whatsapp/create/one-time/` (step 3) |
| WhatsApp Periodic builder | `/v4/whatsapp/create/periodic/` |
| WhatsApp Event Triggered builder | `/v4/whatsapp/create/event-trigger/` |
| WhatsApp integration settings (sender, templates, general, data) | `/v4/whatsapp/settings/sender-configuration`, `/approved-templates`, `/general-settings`, `/data` |
| WhatsApp > Add template | `/v4/whatsapp/template` |

### Storees counterpart

- **`/campaigns`** (`packages/frontend/src/app/(dashboard)/campaigns/page.tsx`): the "Create Campaign" panel picks WhatsApp, then One Time or Periodic, and opens `/campaigns/create?channel=whatsapp&type=one-time|periodic`. Event Triggered and Device Triggered are disabled "Soon" cards.
- **`/campaigns/create`** (`packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx`): the 3-step wizard.
  - `Step1TargetUsers` (:1010): name, tags, content type, "Send to" (customer, dealer or both), subscription category, audience (All users / Saved segment / Custom filter), Exclude users, Audience cap, Control group and Audience preview.
  - `Step2WhatsappContent` (:2301): provider status, the approved-template picker, an inline template builder, the pending/rejected list, Live Preview and test send. The shared `VariablePanel` and `AbTestSection` follow it.
  - `Step3ScheduleGoals` (:3163): send timing or recurrence, conversion goals and delivery controls.
- **`/campaigns/[id]`** has Send Now, analytics, the Recipients tab and Retry failed. **`/campaigns/[id]/edit`** edits drafts.
- **Backend:**
  1. `POST /api/campaigns` (`routes/campaigns.ts:97-266`) requires an APPROVED template and complete mappings (`whatsappCampaignValidation.ts`).
  2. Send Now (`routes/campaigns.ts:660`) calls `dispatchCampaign` (`campaignService.ts:451`). It stages recipients and applies the 24-hour filter for non-marketing templates, the control group and the cap.
  3. `processCampaign` and `sendOneRecipient` (`campaignService.ts:765,908`) hand each recipient to `deliveryService.send`. That function applies the template category, dealer routing, consent, the frequency cap, reachability and plan limits.
  4. The BullMQ `delivery` queue (`deliveryWorker.ts`) runs `executeSend`, which picks the customer's language variant and mints short-link slugs for tracked buttons.
  5. The Meta or Pinnacle provider builds the message with `buildTemplateComponents` (`services/providers/whatsappUtils.ts`).

  `campaignScheduler.ts` runs scheduled and periodic sends.
- **Event-triggered WhatsApp** exists only in Flows. `StructuredFlowBuilder.tsx` and `SendNodeConfigModal.tsx` configure the flow, `triggerWorker.ts` enrols customers and `flowExecutor.ts` sends.
- **Templates:** `/templates/whatsapp/new` and the inline modal use `WhatsAppTemplateBuilder.tsx`. `routes/whatsappAdmin.ts` handles lint, drafts, submission, status refresh, test send and sync. Templates are listed at `/templates?channel=whatsapp` (`templates/page.tsx`). `templateStatusWorker.ts` syncs every hour and polls status every 4 hours.
- **Settings:** `/settings` > Channels > WhatsApp (`settings/WhatsappChannelPanel.tsx`) offers Storees managed, WhatsApp Cloud API or Pinnacle, plus business profile and usage; `WhatsappChatbotPanel.tsx` sits below it. Frequency caps are on `/settings/project`, and the inbox is at `/inbox`.

**Path key for the Evidence column.** Line numbers are at commit `2063cdc`.

| Short name | Repo path |
|---|---|
| `campaigns/page.tsx`, `create/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx` | `packages/frontend/src/app/(dashboard)/campaigns/…` |
| `templates/page.tsx`, `settings/*.tsx`, `settings/project/page.tsx`, `inbox/page.tsx` | `packages/frontend/src/app/(dashboard)/…` |
| `WhatsAppTemplateBuilder.tsx`, `WhatsAppBubblePreview.tsx` | `packages/frontend/src/components/whatsapp/` |
| `VariablePanel.tsx` | `packages/frontend/src/components/templates/` |
| `SegmentFilterBuilder.tsx` | `packages/frontend/src/components/segments/` |
| `StructuredFlowBuilder.tsx`, `SendNodeConfigModal.tsx` | `packages/frontend/src/components/flows/` |
| `useCustomers.ts` | `packages/frontend/src/hooks/` |
| `routes/*.ts` | `packages/backend/src/routes/` |
| `campaignService.ts`, `deliveryService.ts`, `campaignAnalyticsService.ts`, `flowExecutor.ts`, `flowAnalyticsService.ts`, `messageStatusService.ts`, `shortLinkService.ts`, `templateLinter.ts`, `templateAlertService.ts`, `decisioningService.ts`, `sendTimeService.ts`, `channelProviderRegistry.ts`, `whatsapp*.ts` services | `packages/backend/src/services/` |
| `whatsappUtils.ts`, `metaWhatsappProvider.ts`, `pinnacleWhatsappProvider.ts`, `gupshupProvider.ts`, `providers/index.ts` | `packages/backend/src/services/providers/` |
| `campaignScheduler.ts`, `deliveryWorker.ts`, `triggerWorker.ts`, `templateStatusWorker.ts` | `packages/backend/src/workers/` |
| `schema.ts` | `packages/backend/src/db/schema.ts` |
| `types.ts` | `packages/shared/src/types.ts` |
| `evaluator.ts` | `packages/segments/src/evaluator.ts` |

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| New Campaign modal | WhatsApp channel with One Time and Periodic | WhatsApp is the only Messaging-apps item; illustrated One Time and Periodic cards with hover descriptions | ✅ Full | WhatsApp channel and the One Time/Periodic cards are enabled (`campaigns/page.tsx:57-70`). The panel opens `/campaigns/create?channel=whatsapp&type=one-time\|periodic` (`campaigns/page.tsx:155-158`) | No gap in choosing the type. The periodic engine's defects are in the Step 3 rows. | — | — |
| New Campaign modal | Event Triggered delivery type | Event Triggered card: sends when a user performs a tracked app or server event (e.g. abandoned cart) | 🟡 Partial | Disabled "Soon" card (`campaigns/page.tsx:68`); `CampaignDeliveryType` is `'one-time' \| 'periodic'` (`types.ts:174`). Flows cover the use case: event trigger (`triggerWorker.ts:73-188`), `send_whatsapp` action (`flowExecutor.ts:756-808`), header and button bindings (`SendNodeConfigModal.tsx:49-125`) | The capability exists, but not where a MoEngage user looks; in a demo the "Soon" card reads as a missing feature. Make the card open a prefilled trigger → WhatsApp flow. | P2 | S |
| Builder shell | 3 steps, breadcrumb, live title, step validation | Target users > Content > Schedule and goals; breadcrumb "Campaigns > WhatsApp (One-time\|Periodic\|Event Triggered) > Create"; live title; inline errors, error icon and toast; no Save as draft | ✅ Full | `create/page.tsx`: STEPS :93-97, breadcrumb :688, live title :700, stepper :714-750, Next disabled until valid :972, "Save as draft" :703-710, "Create Campaign" :985. The server rejects a non-APPROVED template or a missing mapping (`routes/campaigns.ts:173-179`, `whatsappCampaignValidation.ts:13-66`) | Same shell with weaker feedback: Next is disabled with no reason shown, and the clickable stepper skips ahead without checks. | — | — |
| Step 1: Target users | Campaign name | Required; the code limits it to under 256 characters | ✅ Full | Required field (`create/page.tsx:1075-1081`), step check (:539), 400 when missing (`routes/campaigns.ts:163-165`) | None. | — | — |
| Step 1: Target users | Campaign tags | Searchable multi-select with a Default tag group and "Manage tags" | 🟡 Partial | Free-text chips (`create/page.tsx:1083-1107`) saved to `campaigns.tags` (`routes/campaigns.ts:250,518`). The list, detail and edit pages never show, filter or edit them | Tags organise nothing today. Add a project tag list, show tags on the list and detail pages, and filter by tag. | P2 | S |
| Step 1: Target users | Audience: All users or filters (property, behaviour, nested, Exclude Users) | All users / Filter users by; User property and User behavior tabs ("Has Executed" + event), nested filters, Exclude Users, Reset filters | ✅ Full | All users / Saved segment / Custom filter (`create/page.tsx:1221-1297`). `SegmentFilterBuilder.tsx` has attribute rules, "performed event N times in a window where …" rules, aggregate rules (:600-720) and nested groups. Exclude users (`create/page.tsx:1299-1329`); applied at staging (`campaignService.ts:512-575`) | Capability parity. The saved-segment card's "reachable via WhatsApp" figure is a hard-coded 90% (`create/page.tsx:1048`). The empty-audience fallback is the P0 row below. Exclusion drops customers whose excluded field is empty (`NOT (NULL)`; modules 01 and 03). | — | — |
| Step 1: Target users | Audience: User affinity | User affinity tab (predicted or most-frequent attribute values) | ❌ Missing | No affinity rule in `SegmentFilterBuilder.tsx`, `types.ts` or `packages/segments/src`; product affinity exists only for recommendations (`decisioningService.ts`) | Can't target "users with high affinity to a category, brand or price band", a common D2C merchandising audience. | P2 | L |
| Step 1: Target users | Custom segment combined with filters; exclude a segment | Custom segment is one filter tab, so it combines with other conditions and works inside Exclude Users | 🟡 Partial | "Saved segment" is a separate, exclusive mode (`create/page.tsx:1221-1297`). Staging uses the filter if set, else the segment, else everyone (`campaignService.ts:522-575`). The filter engine has no segment-membership rule (`evaluator.ts`), and Exclude takes only a filter | Can't express "VIP segment AND city = Mumbai" or "exclude Recent purchasers". Add a "member of segment" rule (flows already have an `in_segment` condition, `flowExecutor.ts:526-534`). | P2 | S |
| Step 1: Target users | Show count | "Show count" returns the matching-user total | ⭐ Storees better | `POST /api/campaigns/audience-preview` (`routes/campaigns.ts:301-347`, `campaignService.ts:172-405`), shown at `create/page.tsx:1427-1485`: candidates, reachable, deliverable, recipients, suppressed, opted out, category blocked, 24h-window blocked, frequency capped, holdouts, plus the main cause when the result is 0 | Ahead: it shows where the audience is lost. Caveat: opt-out and suppression checks run for email only (`campaignService.ts:276-301`), so for WhatsApp "Opted out" is always 0 and Recipients can include customers who replied STOP (the send still blocks them). | P3 | S |
| Step 1: Target users | Send ignoring opt-in preference | Checkbox "Send campaign to users ignoring Opt-in preference" | ❌ Missing | No per-campaign override (searched bypass, ignoreConsent, skipConsent, ignoreOptIn, forceSend). `checkConsent` blocks only when a consent row exists that is not `opted_in` (`deliveryService.ts:347-385`); STOP opts the customer out for both purposes (`whatsappInboundService.ts:308`) | Default behaviour already matches MoEngage ("send unless opted out"); only the override is missing, and it is a Meta-policy and DPDP risk. If added, limit it to UTILITY/AUTHENTICATION templates and admins. | P3 | S |
| Step 1: Target users | Global control group | Global control group toggle (needs a workspace-level group); no campaign holdout here | ❌ Missing | Per-campaign 1-50% holdout, assigned the same way on every run (`create/page.tsx:1371-1424`, `campaignService.ts:663-699`), with lift per goal (`campaignAnalyticsService.ts:225-304`). No project-wide group (searched global control, globalControl, global_control, universal holdout) | No persistent holdout across all campaigns and flows, so overall WhatsApp incrementality can't be measured. The per-campaign holdout is a Storees-only strength, rated in its own row; every other module rates the global group ❌. | P2 | M |
| Event Triggered: Step 1 | Primary trigger event, real-time segment evaluation | "If user performs > Has Executed" + event; segments evaluated in real time; missing values block Next | ✅ Full | Flow trigger of kind `event` with an event picker and property filters (`StructuredFlowBuilder.tsx:1299-1338`, `triggerWorker.ts:77-96`); one active or waiting trip per customer per flow (`triggerWorker.ts:122-152`); a missing event is blocked (`StructuredFlowBuilder.tsx:1448`). Real-time audience checks come from a Condition node: "Customer Attributes" runs the segment SQL, and "In Segment" checks membership (`flowExecutor.ts:514-534`) | Flows only (see the Event Triggered row). The trigger's own `audienceFilter` is evaluated in memory, where event, aggregate and purchase rules always return false (`evaluator.ts:1225-1260`). The builder doesn't expose it, so put behavioural checks in a Condition node. | — | — |
| Event Triggered: Step 1 | Alternate trigger events (OR) | "+ Add alternate trigger event": any one of several events starts the message | ❌ Missing | `TriggerConfig.event` is one string (`types.ts:588-602`); `triggerWorker.ts:77` requires an exact match | Brands must duplicate a flow per event (e.g. checkout_started or cart_updated). Accept a list of events. | P2 | S |
| Event Triggered: Step 1 | Secondary trigger event (AND within the delay) | Further events the user must perform after the primary one within the delay | 🟡 Partial | Delay node (`types.ts:637-641`), then a Condition `event_occurred` since trip start with property filters (`types.ts:643-666`); no "wait for event" node | The flow waits the full delay before checking, so it can't send the moment the second action happens. | P3 | M |
| Event Triggered: Step 1 | Then send immediately or after N minutes, hours or days | Immediately, or With Delay [N] [Minutes\|Hours\|Days] After [If Action] | ✅ Full | An action placed after the trigger runs when the trip is created (`triggerWorker.ts:52-54`); the Delay node `{value, unit: minutes\|hours\|days}` is scheduled through BullMQ (`types.ts:637-641`) | None. | — | — |
| Event Triggered: Step 1 | "Before" a date attribute | Timing dropdown offers Before (needs a date attribute) and After | ❌ Missing | `TriggerKind` is `event \| business_event \| fixed_time \| flow_exit` (`types.ts:578`); no date-offset trigger (searched birthday, anniversary, days_before) | No "N days before birthday, renewal or expected delivery" sends, except a daily fixed_time flow with date filters, which is fiddly and imprecise. | P2 | M |
| Step 2: Content | Select sender; several senders per BSP | Sender picker (only senders with an active template); several senders per BSP | ❌ Missing | One WhatsApp config per project in `projects.settings.channels.whatsapp` (`channelProviderRegistry.ts:166-200`); no sender field in step 2 or `settings/WhatsappChannelPanel.tsx` | A project can't run several numbers (brands, regions, support vs marketing) or choose the sending number. Workaround: one project per number. | P3 | L |
| Step 2: Content | Select approved template | Required template dropdown for the chosen sender; content stays empty until a template is picked | ⭐ Storees better | APPROVED templates grouped by name with language variants, category and variable count; search by name, text or language; newest first (`create/page.tsx:2323-2352,2437-2496`). Pending and rejected templates with per-template status refresh and "Sync all" (:2405-2435). Inline "Create template" opens `WhatsAppTemplateBuilder` (:2357-2361). APPROVED status and mappings are re-checked on save and dispatch (`whatsappCampaignValidation.ts:13-66`, `campaignService.ts:465-486`) | Ahead: templates are authored and tracked without leaving the campaign. | — | — |
| Step 2: Content | UTILITY and AUTHENTICATION templates in a campaign | Any approved template, whatever its category; no 24-hour window restriction | 🟡 Partial | For non-MARKETING templates, dispatch keeps only customers with an inbound WhatsApp message in the last 24 hours (`campaignService.ts:466-486,644-661`). The preview reports everyone else as "24h window blocked" (`create/page.tsx:1442-1476`) | Meta allows approved templates of any category outside the 24-hour window; the window governs free-form messages and free utility pricing. A utility broadcast (back in stock, shipping delay) reaches almost no one. Make the filter an optional cost saver. | P1 | S |
| Step 2: Content | Placeholder mapping and personalisation | Static values from the template; dynamic values with "@" personalisation, attribute fallbacks plus a default, event attributes for triggered sends; no new lines or tabs | ✅ Full | The template's saved `{{n}}` mapping is pre-filled (`create/page.tsx:107-130`). Each parameter maps to a customer field, custom attribute, product, project field, event property, smart content or a literal, with a default and 7 formats (`VariablePanel.tsx:159-232,235-353`). Values are resolved per recipient (`campaignService.ts:925-944`), never sent blank (`whatsappUtils.ts:28-39`), and linted on save (`routes/campaigns.ts:194-205`) | Small gaps: no fallback to a second attribute; "Literal value" has no input box (`VariablePanel.tsx:338-341`); new lines and tabs are not stripped, and Meta rejects them. | — | — |
| Step 2: Content | WhatsApp device preview | iPhone-style chat with business name and verified tick, header, body, footer, buttons; Default/Personalized toggle | ✅ Full | "Live Preview" bubble on WhatsApp wallpaper with TEXT, IMAGE, VIDEO or DOCUMENT header, body, footer and buttons; "Render data" fills real values (`create/page.tsx:2500-2535,2613-2674`) | No phone frame or business identity. The create page's own bubble omits carousel cards and draws copy-code buttons as reply buttons; the shared `WhatsAppBubblePreview.tsx` used by the edit page handles both. Reuse it. | — | — |
| Step 2: Content | Personalised preview for a real user | Drawer: select user by ID, email, mobile or advertising ID; Fetch user data; Update preview | 🟡 Partial | Sample dropdown with "Auto sample customer" or one of the 20 most recently seen customers (`create/page.tsx:2329-2332,2503-2522`), rendered by `POST /api/templates/preview` | Can't look up a specific customer by ID, email or phone. `useCustomers.ts:12-29` already supports `search`, so a lookup box is cheap. | P2 | S |
| Step 2: Content | UTM parameters | Collapsible UTM block with custom parameters; applied to shortened (tracked) links | 🟡 Partial | `supportsLinkTracking` excludes WhatsApp (`create/page.tsx:429`), and `utmParameters` is sent only when it is true (:604); the edit page does the same (`[id]/edit/page.tsx:401`). Campaign WhatsApp sends pass no `utmParameters` (`campaignService.ts:1020-1046`), although `deliveryService.ts:276-319` adds UTM to tracked-button destinations. Flow sends do pass UTM (`flowExecutor.ts:786-806`) | WhatsApp campaign clicks reach Shopify and GA4 untagged, so external tools can't credit WhatsApp. Show the UTM block for WhatsApp and pass `utmParameters` in `sendOneRecipient`. As in MoEngage, this covers tracked buttons only. | P1 | S |
| Step 2: Content | Test campaign | "Test Campaign" card: 7 identifier types (incl. external number and custom segment), value, Test, "use sample data from the personalized preview" | 🟡 Partial | "Send a test message" to one E.164 number, rendered with the chosen sample customer and not counted against caps (`create/page.tsx:2556-2595` → `routes/whatsappAdmin.ts:546-660`); blank parameters fall back to the approved samples | Missing: tests to a registered customer by ID or email, saved test lists or segments, and test send on the edit page. The test bypasses `deliveryService`, so a template with a tracked button goes out without its button parameter, which Meta should reject (read from code). | P2 | S |
| Step 2: Content | Simple (standard) template | Header, body, footer and buttons (code only) | ✅ Full | Builder type "Custom": TEXT, IMAGE, VIDEO or DOCUMENT header, body up to 1,024 characters, footer, buttons (`WhatsAppTemplateBuilder.tsx:37-121,313-615`); sent via `buildTemplateComponents` (`whatsappUtils.ts:58-108`) | None. | — | — |
| Step 2: Content | Carousel templates | Cards 1..N with body and media; one media type for all cards; buttons only from the first card; no coupons (code only) | 🟡 Partial | Builder "Carousel": intro body plus up to 10 cards sharing IMAGE or VIDEO, sample media, bodies up to 160 characters, buttons (`WhatsAppTemplateBuilder.tsx:117-121,823-896`); linted (`templateLinter.ts:263-287`) and submitted as a CAROUSEL component (`metaWhatsappProvider.ts:95-115`). The send path builds only body, media-header, URL-suffix and copy-code components, with no card parameters (`whatsappUtils.ts:58-108`). The create-page preview shows no cards | An approved carousel can be created but not delivered from campaigns or flows, because Meta needs per-card header media at send time. This blocks the Phase A dynamic-carousel smoke test. Add CAROUSEL card components with per-card media and button bindings. | P1 | M |
| Step 2: Content | Limited-time-offer (LTO) templates | Offer detail, "Offer ends on" date-time, mandatory coupon button (code only) | ❌ Missing | Searched limited_time_offer, LIMITED_TIME, limitedTime, expiration_time_ms: no matches. Template types are Custom and Carousel (`WhatsAppTemplateBuilder.tsx:117-121`) | No countdown offer template for flash-sale campaigns. Add the LTO component, the offer-expiry parameter at send time and the required copy-code button. | P2 | M |
| Step 2: Content | Media headers (image, video, document; URL or upload; static or dynamic) | Source URL or upload per media type; dynamic media needs a sample; HTTPS only (code only) | ✅ Full | Upload (5, 16 or 100 MB) or a public-URL sample per type (`WhatsAppTemplateBuilder.tsx:680-723`); per-send media from `wa_header_media_url`, else the approved sample (`whatsappUtils.ts:66-76`); campaigns pre-fill the key (`create/page.tsx:120-123`) | In campaigns the media URL must go in "Default", because "Literal value" has no input. A variable inside a TEXT header is never filled at send (`whatsappUtils.ts:58-108`), so such templates would be rejected. | — | — |
| Step 2: Content | Location header | Latitude/longitude header (code only) | ❌ Missing | HEADER_TYPES are None, Text, Image, Video, Document (`WhatsAppTemplateBuilder.tsx:71-77`); searched LOCATION and latitude | No map pin for store-locator or event messages; low value for most Shopify brands. | P3 | S |
| Step 2: Content | Buttons: quick reply, call, URL (static or dynamic), copy code | Per-type limits; one Call and one Navigate; dynamic URL with one trailing placeholder; coupon up to 15 characters (code only) | ✅ Full | ButtonsEditor: quick replies, Visit website (static, optional "Track clicks"), Call, Copy code (`WhatsAppTemplateBuilder.tsx:727-821`); button limits linted (`templateLinter.ts`). At send it fills the URL suffix (`wa_button_url_N`) and the coupon (`wa_copy_code`, else the approved sample) (`whatsappUtils.ts:79-108`) | Campaigns can't bind a per-recipient coupon: they never seed `wa_copy_code` (`create/page.tsx:107-130`), and VariablePanel keys can't be renamed (`VariablePanel.tsx:87-90`), so a campaign's copy-code button always carries the approved sample code. Flows can bind it (`SendNodeConfigModal.tsx:98-105`). | — | — |
| Step 2: Content | Link shortening and click tracking | "Shorten and track URL" (25-30 characters), dynamic link tracking, custom or default domain; campaign info shows click analysis and links tracked (code only) | 🟡 Partial | What works: "Track clicks" buttons are submitted as `<SHORTLINK_BASE_URL>/c/{{1}}` (`metaWhatsappProvider.ts:120-131`); each recipient gets a slug in `tracked_links` (`deliveryService.ts:276-319`); `/c/:slug` redirects, emits `whatsapp_clicked` and bumps `clicked_count` (`shortLinkService.ts:51-94`, `routes/urlTracker.ts`). What doesn't: one platform-wide domain (`shortLinkService.ts:15`); no per-link report. The hourly sync overwrites `buttons` with the provider's copy (`whatsappTemplateSyncService.ts:36-52`, `templateStatusWorker.ts:29,146-154`), which drops the Storees-only `track` flag and real destination | Read from code, not run: within an hour of approval a tracked button stops getting slugs, and sends go out without its button parameter. Preserve `track` and the destination across syncs first (S), then add per-project domains and a per-button click report. | P1 | M |
| Step 2: Content | A/B variations | "Locale and variations", "Variation 1" (code only) | 🟡 Partial | The A/B block appears for WhatsApp with a free-text "Message Body (B)" (`create/page.tsx:2995-3156`, :3093-3104). Template sends ignore it, so both groups get `campaign.templateId` (`campaignService.ts:1020-1046`), and the winner is always picked by open rate (`campaignAnalyticsService.ts:488-543`) | A WhatsApp A/B test sends the same template to both groups, so its results are meaningless. Hide the block for WhatsApp now (S); then add a variant-B template picker with its own mappings, judged on read or click rate. | P1 | M |
| Step 2: Content | Locales (per-language template variants) | "Locale and variations", "Locale added successfully" (code only) | ✅ Full | At send, the APPROVED template with the same name in the customer's `language`/`locale` attribute is used, otherwise the chosen one (`deliveryService.ts:238-266`); the picker groups variants (`create/page.tsx:2344-2352,2457-2492`) | Language is picked automatically per customer rather than configured per campaign; it needs a language attribute on the customer; media and button values can't differ by locale. | — | — |
| Step 2: Content | Sherpa decisioning and predictive insights | Automatic user distribution over 60 minutes; "Predictive Insights by Sherpa" (code only) | ❌ Missing | Fixed deterministic split (`campaignService.ts:52-58`); no bandit or adaptive allocation | Traffic never shifts to the winning variation. Enterprise feature; depends on fixing WhatsApp A/B first. | P3 | XL |
| Step 2: Content | Catalog / product messages and WhatsApp Flows | Absent: no catalog, product, Flow-button or one-tap code paths | ➖ N/A | Absent in Storees too (searched catalog_id, product_retailer, multi_product, flow_token). The product-bound dynamic carousel engine exists only in docs (`docs/whatsapp-dynamic-carousel-engine.md`) | Not a gap against MoEngage, but a clear way to stand out on Shopify catalogs: dynamic product carousels first, then Meta single- and multi-product messages. | P2 | L |
| Step 2: Content | Fallback channel | Absent: no SMS or other-channel fallback in the builder | ➖ N/A | Absent in the Storees builder too. A flow can compose one: `whatsapp_delivered/read/failed` events (`messageStatusService.ts:73-90`), then a Delay and a Condition `event_occurred` branching to SMS or email (`types.ts:643-666`, `flowExecutor.ts:756-808`) | Not a Storees lead: a composed flow isn't a builder feature, and MoEngage's journey builder wasn't captured. A "fall back to SMS if not delivered in N minutes" option on WhatsApp sends would be a real differentiator. | P3 | M |
| Step 3: One Time | Send as soon as possible | "As soon as possible" with a "Send now" panel | ✅ Full | "As soon as possible" (`create/page.tsx:3353`); saved as a draft (`routes/campaigns.ts:241`); Send Now dispatches (`routes/campaigns.ts:660-680`, `[id]/page.tsx:230-282`) | Publishing takes two steps: Create Campaign, then Send Now on the detail page. | — | — |
| Step 3: One Time | Specific date and time in a campaign time zone | Start date, send time with am/pm, searchable IANA zone list (default Asia/Kolkata), Reset to defaults | 🟡 Partial | "Fixed date and time" with a 10-zone dropdown (`create/page.tsx:3161,3361-3382`). The date and time become ``new Date(`${date}T${time}`)``, i.e. the admin's browser zone (:635-637). Fixed mode returns `scheduledAt` unchanged and never reads the zone (`campaignService.ts:1119-1126`). The scheduler polls every 60 s (`campaignScheduler.ts:45-70`) | The campaign goes out at the wrong time whenever the browser's zone differs from the one picked (e.g. a Dubai team scheduling for India), and only 10 zones are offered. Convert in the chosen IANA zone and offer the full searchable list. | P1 | S |
| Step 3: Periodic | Daily, weekly or monthly with start date, send time, time zone and end | Daily/Weekly/Monthly; start date, send time, time zone; Ends Never / On date / After N | 🟡 Partial | The UI offers Daily, Weekly (one weekday) or Monthly (day 1-28), "Send at time", optional End date (`create/page.tsx:3264-3348`), saved as `{frequency, time, endsAt}` (:562-568). The scheduler reads `timeOfDay`, ignores `time` and `endsAt`, and re-sends 23 h, 6 days or 27 days after the last `sentAt` (`campaignScheduler.ts:16-44,72-118`). The first run needs Send Now (`routes/campaigns.ts:241`), and each run deletes the previous `campaign_sends` and zeroes the counters (`campaignScheduler.ts:96-111`) | Recurring WhatsApp sends drift to whenever the scheduler runs, never stop, have no start date and wipe each run's analytics. Same defect as modules 01-03. | P1 | M |
| Step 3: Periodic | Repeat every N, several weekdays, Nth weekday, end after N, next-send preview | Repeat every N; weekday chips; days-of-month grid or [First..Last] weekday; Ends After N; "Campaign will be next sent on …" | ❌ Missing | One weekday or one day of the month (1-28) only (`create/page.tsx:3283-3322`); no interval, occurrence count, Nth-weekday rule or computed next-send date | "Every Monday and Thursday" or "first Saturday of the month" (payday sales) can't be set up. | P2 | M |
| Step 3: Event Triggered | Active continuously with start/end date-time and time zone | "Active everyday" panel: start date and time, end date and time (default one year), campaign time zone | 🟡 Partial | Flows run continuously from activation until someone pauses them (`flows.status`, `schema.ts:325-345`); no start, end or time-zone fields | Can't pre-schedule a festive triggered journey to start and stop on its own. Add `activeFrom`/`activeUntil` to flows and check them in `triggerWorker`. | P2 | S |
| Step 3: Schedule and goals | Conversion goals with revenue | Up to 5 goals: name, event, attribute filters, revenue performance (attribute + currency) | ⭐ Storees better | Any number of goals with a Primary radio, an event from the project's own events, attribute filters, a revenue property and 9 currencies (`create/page.tsx:3389-3505`). Per-goal analytics with Any / View-through / Click-through attribution and control-group lift (`campaignAnalyticsService.ts:120-223,225-304`, `[id]/page.tsx:491-622`) | Ahead on attribution modes and lift. Flaws: the Revenue card always shows "$" (`[id]/page.tsx:425`); the window start is wrong (next row). | — | — |
| Step 3: Schedule and goals | Goal window: N hours or days from delivery | "Track above goals for [36] [Hours\|Days] from the time the message is delivered" | 🟡 Partial | Hours only, labelled "from the time the WhatsApp is opened" (`create/page.tsx:3508-3513`). The window really starts at `campaign.sentAt` (`campaignAnalyticsService.ts:135-137,198`), which is set when the whole run finishes (`campaignService.ts:897-904`) | Purchases made while a large or throttled send is still going out are missed, and the label is wrong. Measure from each recipient's `delivered_at` and add a Days unit. | P2 | S |
| Step 3: One Time and Periodic | Ignore / count frequency capping | Delivery controls: "Ignore frequency capping" with a nested "Count for the frequency capping" | ✅ Full | Toggles (`create/page.tsx:3517-3546`) passed on every send (`campaignService.ts:1043-1044`) and enforced for MARKETING templates (`deliveryService.ts:82-96,431-457`); UTILITY and AUTHENTICATION bypass the cap (:35-43) | The helper text "Currently set as 1 WhatsApp in 1 day" is hard-coded (`create/page.tsx:3524`); the real default is 1 per 7 days (`deliveryService.ts:394-399`). | — | — |
| Step 3: One Time and Periodic | Request limit (throughput) | "Limit to [60000] requests per minute"; up to 200,000 rpm shared across campaigns | 🟡 Partial | An optional "Limit to N requests per minute" paces how fast recipients are queued (`create/page.tsx:3548-3555`, `campaignService.ts:801-804,1079-1099`). Every SMS, WhatsApp and push send then passes through one BullMQ `delivery` queue whose limiter allows 50 jobs per second (3,000 a minute) for all tenants together (`deliveryWorker.ts:33-40`) | A 1-lakh (100,000) broadcast needs at least 33 minutes, longer when other brands are sending; MoEngage's default is 60,000 a minute. BullMQ's limiter is queue-wide, so adding workers won't help. Replace it with per-provider, per-number limits (Cloud API allows 80+ messages a second per number) and per-tenant fairness. | P1 | M |
| Step 3: Event Triggered | Minimum delay between two messages | "Minimum delay between two messages [N] hours" (0 = ignored) | ❌ Missing | One active or waiting trip per customer per flow (`triggerWorker.ts:122-152`); the project's WhatsApp marketing cap still applies (`deliveryService.ts:431-457`); no re-entry cooldown field (`schema.ts:325-345`) | A customer who finishes a flow can re-enter on the next event straight away, e.g. a second abandoned-cart nudge an hour later. Add a per-flow re-entry cooldown. The channel-wide WhatsApp cap is rated in its own row; module 03 rates this setting ❌. | P2 | S |
| Step 3: Event Triggered | Ignore / count frequency capping for triggered sends | Ignore frequency capping and Count for the frequency capping | 🟡 Partial | Flow WhatsApp sends pass no cap flags (`flowExecutor.ts:795-806`), so MARKETING templates are always capped and counted, and UTILITY/AUTHENTICATION always bypass (`deliveryService.ts:35-43,82`) | With the default cap of 1 WhatsApp per 7 days, a customer who got any marketing broadcast that week silently misses the abandoned-cart WhatsApp. Add ignore/count toggles to the send node. | P1 | S |
| Step 3: Event Triggered | Conversion goals and revenue for triggered sends | Same goals card as One Time: up to 5 goals, revenue, tracking window | 🟡 Partial | A flow has one `GoalConfig` (event + filters, `types.ts:616-619`) and reports converted trips and conversion rate only, with no revenue (`flowAnalyticsService.ts:15-17,89,238-239`) | Triggered WhatsApp journeys, the main revenue driver, can't report attributed revenue or more than one goal. Reuse the campaign goal evaluator for flow messages. | P2 | M |
| Step 3: Schedule and goals | "All users" warning before Publish | Orange warning that "All users" will message every contact, with "Fix warning"; Previous / Publish | 🟡 Partial | No audience warning; "Create Campaign" only saves. Send Now's banner says "This will send to `segmentName ?? 'the selected segment'`" even for All users or a filter (`[id]/page.tsx:262-282`). "Saved segment" with nothing picked saves `segmentId` as undefined (`create/page.tsx:615`), and dispatch then falls through to every customer (`campaignService.ts:522-575`) | An accidental WhatsApp broadcast to the whole base (paid per message, and it hurts WABA quality) behind a misleading confirmation. Block "Saved segment" with no segment, and show audience type, recipient count and estimated cost before sending. Same root cause as the module 01 P0. | P0 | S |
| Campaign info | WhatsApp campaign info and analytics | Info page (code only): tags, segment type, global control group, links and links tracked, primary goal, FC flags, vendor, IF/AND events, trigger delay, Ignore DND; Click Analysis; counted by delivered or sent | 🟡 Partial | Detail page with Recipients, Delivered, Opened, Clicked, Bounced, Converted and Revenue cards, a funnel, goals, lift, engagement over time, a Recipients tab with block reasons and Retry failed (`[id]/page.tsx:244-256,417-813`, `campaignAnalyticsService.ts:306-470`). WhatsApp reads count as "Opened" (`messageStatusService.ts:121-125`) | No settings summary (tags, audience type, template, provider, cap flags, holdout %) and no per-button click report. For WhatsApp the preview card is titled "Email Preview" and shows the raw `{{1}}` body (`[id]/page.tsx:352,393-410`). | P2 | S |
| Settings: Sender configuration | Meta Embedded Signup | Meta ("New"): "Add sender" launches Meta's embedded sign-up to create or link the WABA and number | ❌ Missing | MetaConnect asks for Phone number ID, WABA ID and a pasted system-user token (`settings/MetaConnect.tsx:33-80`, `routes/whatsappAdmin.ts:772-787`); searched FB.login, config_id, embedded signup. "Storees managed" is an ops-assisted request (`settings/StoreesProvisioning.tsx`, `routes/whatsappAdmin.ts:802-955`) | Self-serve setup needs Business Manager know-how and a system-user token, a common drop-off for Shopify merchants. Add Embedded Signup as a Meta Tech Provider; it also routes webhooks to Storees' own app (see the delivery-tracking row). | P1 | M |
| Settings: Sender configuration | BSP choice: Gupshup, Infobip, Karix | Left-hand list of BSPs: Meta; Gupshup (username, password); Infobip (base URL, API key); Karix (API key) | 🟡 Partial | The WhatsApp panel offers only Storees managed, WhatsApp Cloud API and Pinnacle (`settings/WhatsappChannelPanel.tsx:19-23`). Gupshup, Twilio, Bird and Vonage WhatsApp providers are registered (`providers/index.ts:32-37`) and defined in `settings/page.tsx:376-395`, but WhatsApp renders the dedicated panel instead (:500-504). Gupshup supports send, session text, inbound and template sync (`gupshupProvider.ts`); no Infobip or Karix | Brands already on Gupshup, India's largest BSP, can't connect without migrating their number. Expose Gupshup in the panel, including the `appId` its template sync needs (the generic form collects only API key, app name and number). Add Karix and Infobip later. | P1 | S |
| Settings: Sender configuration | Delivery tracking (webhook) | Every BSP form shows "Enable delivery tracking" with a copyable MoEngage URL | 🟡 Partial | Connect calls Meta `subscribed_apps` (`whatsappMetaConnectService.ts:101-114`), and Pinnacle gets a webhook with a per-project secret (`routes/whatsappAdmin.ts:1022-1126`, `channelWebhooks.ts:370-496`). Receipts update messages and counters and emit `whatsapp_delivered/read/failed` (`messageStatusService.ts:24-90`). `subscribed_apps` subscribes the app that issued the token, and MetaConnect asks for a token from the brand's own app. No callback URL or verify token is shown, and none is passed to Meta (`WA_VERIFY_TOKEN`, `channelWebhooks.ts:240-249`) | Read from code, not run: a BYO Meta connection may get no receipts, replies, STOP opt-outs or 24-hour-window data, while the panel says tracking is active. Pass `override_callback_uri` and a verify token on `subscribed_apps`, or show both to paste; Embedded Signup avoids the issue. | P1 | S |
| Settings: Sender configuration | Custom / generic WhatsApp connector | "WhatsApp Custom Sender Integration" with API details and transport- or message-level (JWE) encryption (feature-gated) | ❌ Missing | Providers are a fixed list in code (`providers/index.ts:32-37`); no generic HTTP WhatsApp connector. A flow `http_request` node can call any API, but without templates or receipts | A new BSP needs engineering work; enterprise edge case. | P3 | L |
| Settings: Approved templates | Approved-templates library (filters, usage, delete, archive) | Table with category, content, provider, dates; category and sender filters; search; statuses incl. In appeal; View usage; delete from MoEngage only or also from Meta; archive; no edits once used | 🟡 Partial | The `/templates` WhatsApp tab shows cards or a table with category, language, quality, status and rejection reason, plus search and "Sync from provider"; DRAFT and REJECTED templates are editable, others get Refresh (`templates/page.tsx:433-559`). Statuses run from DRAFT to DISABLED, with quality and re-categorisation alerts (`templateStatusWorker.ts`, `templateAlertService.ts:30-95`). No DELETE route (`routes/whatsappAdmin.ts`), nothing deletes `whatsapp_templates`, no category or status filter, no where-used view | Rejected and test templates pile up, and there's no way to see which campaigns or flows use a template before editing it. Add delete (locally and at Meta), archive, filters and a usage view. | P2 | M |
| Settings: Approved templates | Sync templates from the BSP | "Sync Template" pulls from Gupshup, Karix and Infobip | ✅ Full | `POST /api/whatsapp/sync-templates` (`routes/whatsappAdmin.ts:108-118`), an hourly sync and a 4-hourly status poll (`templateStatusWorker.ts:28-29,137-154`); Meta, Pinnacle and Gupshup sync; templates imported on connect | Works, but the sync overwrites Storees-authored button data (see the link-tracking row), and Gupshup sync needs an `appId`. | — | — |
| Settings: General | WhatsApp number attribute and format | Pick the attribute that stores the WhatsApp number, plus the number format | 🟡 Partial | Always `customers.phone` (`deliveryService.ts:459-490`, `campaignService.ts:567-571`); a bare national number gets the `WHATSAPP_DEFAULT_COUNTRY_CODE` env var, default 91 (`whatsappUtils.ts:10-21`) | Brands that keep a separate WhatsApp number in a custom attribute can't use it, and the default country code is platform-wide, not per brand. | P3 | S |
| Settings: General | WhatsApp opt-in attribute | Pick the opt-in attribute; messages go only to users whose opt-in is not FALSE unless bypassed | 🟡 Partial | Consent check blocks when a consent row exists that is not `opted_in` (`deliveryService.ts:347-385`); STOP/START update consent (`whatsappInboundService.ts:10-20,160-164`); opt-in widgets and Click-to-WhatsApp ads record opt-ins (`routes/v1OptIn.ts`, `whatsappInboundService.ts:199-290`) | Same send rule, but no attribute can be chosen: the gate reads only the consents table, and `customers.whatsapp_subscribed` is never read at send, so an opt-in imported as an attribute has no effect unless a consents row is also written (module 20). Shopify's marketing flags aren't copied into consents. | P2 | S |
| Settings: General | Create a profile for messages from new numbers | Toggle "Create a new user profile if message is received from new number" | 🟡 Partial | Profiles are created only for Click-to-WhatsApp ad referrals (`whatsappInboundService.ts:109-122`); other unknown numbers are stored with no customer (:124-136) and emit no event | Organic inbound leads (QR codes, website chat buttons) never become profiles, so they can't be segmented or retargeted. Add a project toggle. | P2 | S |
| Settings: General | Store all incoming messages as an event | Toggle "Store all incoming messages", event "WhatsApp message Received" | 🟡 Partial | Every inbound message is saved to `whatsapp_inbound_messages`, and matched customers get a `whatsapp_inbound` event (`whatsappInboundService.ts:124-158`) usable in segments and flow conditions | Always on; no toggle. The `whatsapp_inbound` event is inserted straight into `events` and never queued (`whatsappInboundService.ts:140-158`), so a reply can't start or exit a flow (module 20). | P2 | S |
| Settings: Data | PII tokenization | Keep PII in a secure store; MoEngage fetches it from an endpoint at send time; enabled via the CSM | ❌ Missing | Searched "tokeniz": only an unrelated comment (`routes/ai.ts:47`); phone numbers live in `customers.phone` | Needed by regulated enterprises (BFSI); little relevance to Shopify D2C. | P3 | XL |
| Settings: Frequency capping | WhatsApp frequency capping | Max N messages in 1-7 days, refreshed daily in user time or 00:00 GMT (feature-gated) | ✅ Full | Settings > Project > Frequency caps: WhatsApp marketing max 0-100 per 1-90 days, rolling (`settings/project/page.tsx:114-180`); enforced on MARKETING sends; failed and blocked messages don't count (`deliveryService.ts:394-399,431-457`) | Rolling window instead of a daily reset; no time-zone choice. | — | — |
| Settings: DND | Quiet hours, and "Ignore DND" per triggered campaign | DND hours in the user's time zone; messages discarded or queued until DND ends (all, one per campaign or one overall), sent at once or spaced out | ❌ Missing | Only the `deliveryService.ts:27` docstring mentions quiet hours; the gates are consent → cap → reachability → plan → queue (:79-121). Searched quietHours, quiet_hours, dnd, sendWindow, businessHours | Triggered nudges (abandoned cart, browse) go out at 2 a.m., which annoys customers and hurts template quality ratings. Add project quiet hours that queue until morning (in the customer's time zone when known), with an override per flow or campaign. | P1 | M |
| WhatsApp > Add template | Add or register a template | Records a template already approved at the BSP ("MoEngage does not validate your templates"): name rules, provider, sender, ~100 languages, category and utility sub-types, content, Cancel / Save | ⭐ Storees better | Storees builds and submits templates itself (`WhatsAppTemplateBuilder.tsx`, `templateLinter.ts`, `routes/whatsappAdmin.ts:126-525`): lowercase names, 70 languages, Marketing/Utility/Authentication, Custom, Carousel and OTP, header/body/footer/buttons, a source and sample per `{{n}}`, an AI brief, 30 lint rules, Save draft or Submit to Meta or Pinnacle, and status kept current by webhooks and polling | Ahead: validates and submits instead of only recording. Smaller gaps: 70 languages against ~100; the lint rejects the builder's "fil" code (`templateLinter.ts:76-83`); no manual "register an existing template" form for providers that can't sync. | — | — |

### Storees-only strengths

- **Save without sending.** The header's "Save as draft" (`create/page.tsx:703-710`) saves the campaign without sending it (`routes/campaigns.ts:241`). MoEngage's WhatsApp builder has no draft button, and its Drafts tab was locked for the captured role. Caveat: for WhatsApp the button is enabled only once a name and an APPROVED template are chosen (`create/page.tsx:539-548,705`), and the server rejects other templates (`whatsappCampaignValidation.ts:35`). A campaign can't be parked while its template awaits approval.
- **Author, submit and track templates without leaving the campaign.** "Create template" opens the full builder in a modal, and the step lists pending and rejected templates with a status refresh (`create/page.tsx:2357-2435`, `routes/whatsappAdmin.ts:168-525`). MoEngage only records templates already approved at the provider, and its builder stops at an empty template dropdown.
- **Template compliance and lifecycle tooling.** 30 lint rules before submission (`templateLinter.ts:24-295`); status polling and sync (`templateStatusWorker.ts`); an email alert when Meta re-categorises a template (`templateAlertService.ts:30-95`); quality score and rejection reason in the library (`templates/page.tsx:433-559`); an AI draft from a brief (`whatsappCopilotService.ts`).
- **Reachability funnel before sending.** Candidates, reachable, deliverable, 24h-window blocked, frequency capped and holdouts, with the main cause when the result is 0 (`campaignService.ts:172-405`, `create/page.tsx:1427-1485`). MoEngage's Show count gives one total. Caveat: WhatsApp opt-outs aren't subtracted, and the saved-segment card's 90% figure is hard-coded.
- **Campaign-level control group with lift per goal** (`create/page.tsx:1371-1424`, `campaignService.ts:663-699`, `campaignAnalyticsService.ts:225-304`, `[id]/page.tsx:531-568`). MoEngage's WhatsApp builder offers only a global control group.
- **Audience cap.** "Send to the first N" protects the quality rating and budget on a paid channel (`create/page.tsx:1331-1369`, `campaignService.ts:514,682-686`).
- **Send to the customer's dealer.** A campaign can message the customer, their assigned dealer or both on WhatsApp, with content about the customer (`create/page.tsx:1145-1175`, `deliveryService.ts:52-77`, `campaignService.ts:946-947`).
- **Automatic template language per customer.** A customer whose `language` or `locale` attribute is "hi" gets the Hindi version of the same approved template (`deliveryService.ts:238-266`).
- **Sending rules follow the template's Meta category.** MARKETING templates are capped and consent-gated as promotional; UTILITY and AUTHENTICATION templates count as transactional (`deliveryService.ts:31-43`).
- **Smart content in template variables.** A `{{n}}` can carry each recipient's recommended product name, image or price, or live social-proof counts (`VariablePanel.tsx:318-324`, `decisioningService.ts`). The lint requires a fallback so Meta never gets an empty parameter (`templateLint.ts:79-90`).
- **Tracked buttons with a per-recipient destination.** A flow can point one approved tracked button at each shopper's own checkout URL, and every tap becomes a `whatsapp_clicked` event (`deliveryService.ts:276-319`, `SendNodeConfigModal.tsx:76-91`, `shortLinkService.ts:51-94`). Caveat: the hourly provider sync currently strips the tracking flag (see the link-tracking row).
- **Delivery, read, reply and opt-out events drive automation.** `whatsapp_delivered/read/failed` (`messageStatusService.ts:24-90`) and `whatsapp_inbound` with STOP/START consent handling (`whatsappInboundService.ts:84-183`) can be used by segments and flow branches.
- **WhatsApp Inbox and AI chatbot.** Agents reply from `/inbox` (`inbox/page.tsx`, `routes/whatsappInbox.ts`). A bot answers FAQs and order questions and hands off to a human (`whatsappChatbotService.ts`, `settings/WhatsappChatbotPanel.tsx`). The chatbot is a premium plan feature, off on trials.
- **Storees-managed number provisioning.** A brand without a WABA can request a number in the app (`settings/StoreesProvisioning.tsx`, `routes/whatsappAdmin.ts:802-955`).
- **"Best time for user" send option.** Schedules each recipient at the hour they most often opened or read earlier messages (`create/page.tsx:3356`, `sendTimeService.ts:15-95`, `campaignService.ts:1133-1137`); MoEngage's WhatsApp One Time step showed no send-time optimisation. Caveats: the hour is UTC, and the sibling "User's timezone" option delays every recipient by 24 hours when the scheduler starts the campaign (`campaignService.ts:1154-1166`).
- **Business profile and usage.** Edit the WhatsApp logo and about text, and see billable conversations by category (`settings/WhatsappProfile.tsx`, `settings/WhatsappUsage.tsx`, `whatsappUsageService.ts`). Meta numbers only; the cost estimate appears only when `WA_RATE_*` rates are set.

### UX notes

- **Content step layout** (screens 008, 019).
  - MoEngage keeps template selection and placeholder mapping on the left and a sticky iPhone preview on the right, with a Default/Personalized toggle.
  - Storees stacks everything vertically: the template list (up to 480 px tall), the Live Preview card with test send, then the Variables panel and an A/B block (`create/page.tsx:2353-2602`, :870-936). The preview scrolls out of view while you map variables, and it updates only on "Render data".
  - Adopt two columns with a sticky preview that re-renders as mappings change.
- **Validation feedback** (018, 019, 030). MoEngage marks the failing step with an error icon, shows field errors ("Please select sender.", "Please select template.") and a toast. Storees only disables Next (`create/page.tsx:972`), with no explanation, and mapping issues appear only after "Create Campaign". Show the reasons next to the disabled button.
- **Schedule panel** (044, 053, 055-061).
  - MoEngage: a radio list on the left and a detail panel on the right, explicit am/pm, a searchable IANA time-zone list, "Reset to defaults" and a computed "Campaign will be next sent on …".
  - Storees: native date and time inputs read in the browser's zone, beside a 10-zone dropdown that fixed sends ignore (`create/page.tsx:3161,3361-3382,635`), plus a text-only periodic summary (:3337-3346).
  - Copy the next-send line, but compute it on the server with the scheduler's own logic, so the UI never promises a time the engine won't keep.
- **Pre-send safety** (049).
  - MoEngage shows an orange "All users" warning with "Fix warning" next to Publish.
  - Storees shows no warning. Its Send Now banner says "the selected segment" even for All users or a filter (`[id]/page.tsx:266`), and a "Saved segment" audience with nothing picked silently goes to everyone.
  - Put the audience type, recipient count and estimated message cost in the send confirmation.
- **Delivery controls copy** (049-052, 063). MoEngage's tooltips explain frequency capping, "Count for the frequency capping" and the throughput ceiling. Storees' "Currently set as 1 WhatsApp in 1 day" is hard-coded (`create/page.tsx:3524`), while the real default is 1 per 7 days. Read the project's caps and link to Settings > Project.
- **Test send** (013, 014). MoEngage offers seven recipient types and "use sample data from the personalized preview". Storees puts test send right under the preview, which is better placement, and reuses the chosen sample customer. But it accepts only one E.164 number (`create/page.tsx:2556-2595`). Add a "send to customer…" search and saved test lists.
- **Step 1 for WhatsApp** (003).
  - MoEngage's step 1 is lean: name, tags, audience, opt-in bypass and control group.
  - Storees stacks ten cards, including Content type and Subscription category (`create/page.tsx:1109-1219`), and for WhatsApp both mislead:
    - The template's Meta category overrides Content type (`deliveryService.ts:35-43`).
    - Choosing any subscription category blocks every recipient, because no code writes `customer_subscriptions`.
  - Hide or lock both for WhatsApp.
- **Campaign entry** (001, 002). MoEngage lists WhatsApp under "Messaging apps" with illustrated delivery-type cards and hover descriptions. Storees shows Event Triggered as a disabled "Soon" card (`campaigns/page.tsx:68`), although Flows already send event-triggered WhatsApp. Make the card open a WhatsApp flow template (e.g. abandoned cart).
- **Where Storees is ahead** (010, 011, 035, 007).
  - MoEngage's sender and template dropdowns stay empty until a provider and templates are set up in Settings, forcing a context switch. Storees' step 2 shows connection status, pending and rejected templates with a status refresh, and an inline "Create template" builder. Keep it.
  - Storees' step 1 shows a reachability funnel instead of a single count. Count WhatsApp opt-outs to keep it honest.
- **A/B block** (variations are code-only in MoEngage). Storees shows the generic A/B section for WhatsApp with a free-text "Message Body (B)" (`create/page.tsx:3093-3104`) that template sends never use. Hide it for WhatsApp until a variant-B template picker exists; today it invites a test that can't work.
- **Campaign detail page** (no MoEngage screen captured).
  - For WhatsApp the preview card is titled "Email Preview" and shows the raw `{{1}}` body (`[id]/page.tsx:352,393-410`).
  - Read receipts are labelled "Opened", and Revenue always shows "$".
  - Use WhatsApp wording ("Read"), the shared `WhatsAppBubblePreview.tsx` with values filled in, and the campaign's currency.
- **Settings layout** (031-037).
  - MoEngage keeps sender configuration, approved templates, general settings and data on one tabbed "WhatsApp integration settings" page.
  - Storees spreads them across four places, and consent is visible only per customer:
    - Settings > Channels > WhatsApp (connection, profile, usage, chatbot)
    - `/templates?channel=whatsapp`
    - Settings > Project (frequency caps)
    - `/inbox`
  - One WhatsApp hub with these tabs would be easier to demo and support.

### Verification notes

Every row was re-checked against the code at `2063cdc`. Rows changed:

- **Delivery tracking (webhook): ✅ Full → 🟡 Partial (P1, S).** `linkMetaWhatsappAccount` calls `POST /{waba}/subscribed_apps` with the pasted token (`whatsappMetaConnectService.ts:101-114`). Meta subscribes the app that issued that token, and MetaConnect tells brands to copy it from their own app's "WhatsApp → API Setup" page. Webhooks for a BYO connection therefore go to the brand's app callback URL. Storees neither shows its callback URL and `WA_VERIFY_TOKEN` nor passes `override_callback_uri`, yet the panel reports tracking as active. This was read from code, not run; confirm on a real BYO connection.
- **Active continuously (event-triggered window): ❌ Missing → 🟡 Partial (P2, S).** Flows already run continuously from activation until paused; only the scheduled start/end and time zone are missing. Now consistent with module 03.
- **Fallback channel: ⭐ Storees better → ➖ N/A (P3, M).** Neither builder has a fallback. Storees can compose one only in Flows, and MoEngage's journey builder wasn't captured, so a lead can't be claimed. Kept the recommendation as a differentiator.
- **Catalog / product messages and WhatsApp Flows: ❌ Missing → ➖ N/A (P2, L).** MoEngage lacks it too, so it isn't a parity gap; kept as a differentiator tied to the carousel initiative.
- **Show count: ⭐ kept, priority none → P3 S.** The preview's opt-out and suppression checks are email-only (`campaignService.ts:276-301`). For WhatsApp, "Opted out" is always 0 and Recipients can include customers who replied STOP (they're still blocked at send).
- **Approved-templates library: effort S → M.** Delete locally and at Meta, archive, filters and a usage view across campaigns and flow JSON is more than a small change.

Evidence and gap corrections (status unchanged):

- **Primary trigger event:** the original evidence credited the trigger's `audienceFilter` for real-time segment checks. That filter is evaluated in memory, where event, aggregate, purchase and order rules always return false (`evaluator.ts:1225-1260`), and the flow builder doesn't expose it. Real-time checks come from Condition nodes that run the segment SQL or check segment membership (`flowExecutor.ts:514-534`).
- **Buttons:** the claim that a campaign coupon "means typing the variable key by hand" is wrong. VariablePanel's "Add variable" creates `variable_N` keys that can't be renamed (`VariablePanel.tsx:87-90`), so campaigns can't bind `wa_copy_code` at all; the button always carries the approved sample code.
- **Test campaign:** beyond "no slug in a test", the test path never mints slugs or fills the tracked button's dynamic suffix (`routes/whatsappAdmin.ts:634-650`, `whatsappUtils.ts:85-86`). The button parameter is omitted, which Meta rejects for dynamic URL buttons.
- **Request limit:** "scale the workers" removed. BullMQ's `limiter` (`deliveryWorker.ts:36-39`) is enforced across the whole queue, so extra workers don't raise the 50/s ceiling.
- **BSP choice:** "the backend is done" was overstated. Gupshup's template sync needs `appId` (`gupshupProvider.ts:209-212`), which the generic channel form doesn't collect.
- **Media headers:** a variable in a TEXT header is allowed by the builder and lint (`templateLinter.ts:163`), but no header parameter is ever sent, so such templates would be rejected, not merely left unfilled.
- **Device preview:** the create page's bubble does render copy-code buttons, but with the quick-reply icon; it omits carousel cards entirely.
- **Paths:** the original evidence wrote `providers/whatsappUtils.ts`. Providers live under `packages/backend/src/services/providers/`.
- **Storees-only list:**
  - "Save as draft" can't park a campaign whose template awaits approval (it needs an APPROVED template).
  - "Tracked buttons" now carries the sync caveat.
  - "Best time for user" now says that "User's timezone" delays recipients by 24 hours (as measured in module 03), rather than "no effect".
  - The chatbot is plan-gated, and the usage cost estimate needs `WA_RATE_*` rates.

Confirmed unchanged after trying to refute them:

- **P0 audience fallback.** The default audience mode is "Saved segment" (`create/page.tsx:443-445`), an empty pick saves `segmentId` as undefined (:615), staging falls through to all customers (`campaignService.ts:522-575`), and the banner text is at `[id]/page.tsx:266`.
- **Carousel send gap.** `CAROUSEL` appears only in the submission builder (`metaWhatsappProvider.ts:95-115`); no send path (Meta, Pinnacle or Gupshup `sendTemplate`) builds card components.
- **Link-tracking sync.** `parseMetaTemplate` keeps Meta's raw buttons, and the sync upsert replaces `buttons` on the same (project, provider, name, language) key that local creation uses (`routes/whatsappAdmin.ts:271-305`). `injectTrackedButtonSlugs` skips buttons without `track` (`deliveryService.ts:287`). The hourly job is started at boot outside safe mode (`index.ts:325`).
- **24-hour window.** It applies only to campaign dispatch and preview; flows aren't affected.
- **❌ Missing rows.** Each was searched under synonyms across frontend, backend (routes, services, workers, schema), shared, segments, flows and SDKs:
  - quiet hours, DND, send window and business hours
  - affinity
  - global control and universal holdout
  - bypass and ignoreConsent
  - limited-time offer and expiration
  - location and latitude
  - bandit and auto-optimise
  - sender and phoneNumberIds
  - embedded signup, FB.login and config_id
  - tokenization
  - birthday and days_before
  - generic connector
- **✅ Full rows.** Each was traced UI → route → engine: ignore/count frequency cap, sync, opt-in consent, inbound storage, frequency caps, locales, buttons and media headers.

Out of scope, but worth fixing: the Meta webhook (`POST /api/webhooks/channel/whatsapp`, `channelWebhooks.ts:253`) checks no `X-Hub-Signature-256`. Anyone who knows the URL could post fake receipts, replies or STOP messages for a known `phone_number_id`.

- **Cross-module consistency review (completeness pass, code re-checked at `2063cdc`):**
  - **Global control group: 🟡 → ❌.** No project-wide holdout exists (no global-control code in `packages`); modules 01, 03, 05, 06, 14 and 23 rate it ❌.
  - **Minimum delay between two messages: 🟡 → ❌.** No cooldown or minimum-delay field exists; module 03 rates the same setting ❌.
  - **WhatsApp opt-in attribute and Store all incoming messages: ✅ → 🟡 (P2, S)**, matching module 20. `whatsapp_subscribed` is never read by `deliveryService.ts` or `campaignService.ts`, and `whatsapp_inbound` events are written straight to `events` without `eventsQueue.add` (only CTWA leads are queued), so a reply can't trigger a flow.

### Screens

#### New Campaign modal > WhatsApp

![New Campaign modal: Outbound, Merlin Custom Agents bar, Inbound, Messaging apps > WhatsApp](../screenshots/04-builder-whatsapp-001-new-campaign-modal.jpg)
*New Campaign modal: Outbound, Merlin Custom Agents bar, Inbound, Messaging apps > WhatsApp*

![WhatsApp expanded: One Time, Periodic and Event Triggered cards](../screenshots/04-builder-whatsapp-002-whatsapp-delivery-types.jpg)
*WhatsApp expanded: One Time, Periodic and Event Triggered cards*

#### WhatsApp One Time builder, Step 1: Target users

![Step 1 top: name, tags and audience filter tabs](../screenshots/04-builder-whatsapp-003-onetime-step1-target-users.jpg)
*Step 1 top: name, tags and audience filter tabs*

![Opt-in bypass tooltip: 'Bypass Opt-in preference to target all users in the segment'](../screenshots/04-builder-whatsapp-004-onetime-step1-optin-bypass-tooltip.jpg)
*Opt-in bypass tooltip: 'Bypass Opt-in preference to target all users in the segment'*

![Step 1 bottom: Global control group (not defined) and Next](../screenshots/04-builder-whatsapp-005-onetime-step1-bottom-control-groups.jpg)
*Step 1 bottom: Global control group (not defined) and Next*

![Campaign tags dropdown: Default tags and Manage tags](../screenshots/04-builder-whatsapp-006-onetime-step1-campaign-tags-dropdown.jpg)
*Campaign tags dropdown: Default tags and Manage tags*

![All users selected ('All users selected' bar)](../screenshots/04-builder-whatsapp-007-onetime-step1-all-users-selected.jpg)
*All users selected ('All users selected' bar)*

#### WhatsApp One Time builder, Step 2: Content

![Content step: sender/template pickers and WhatsApp phone preview](../screenshots/04-builder-whatsapp-008-onetime-step2-content-empty.jpg)
*Content step: sender/template pickers and WhatsApp phone preview*

![Sender tooltip: only senders with at least one active template are listed](../screenshots/04-builder-whatsapp-009-onetime-step2-sender-tooltip.jpg)
*Sender tooltip: only senders with at least one active template are listed*

![Select sender dropdown: empty (no WhatsApp sender configured)](../screenshots/04-builder-whatsapp-010-onetime-step2-sender-dropdown-empty.jpg)
*Select sender dropdown: empty (no WhatsApp sender configured)*

![Select template dropdown: empty](../screenshots/04-builder-whatsapp-011-onetime-step2-template-dropdown-empty.jpg)
*Select template dropdown: empty*

![Preview type Default/Personalized and UTM parameters section](../screenshots/04-builder-whatsapp-012-onetime-step2-preview-type-utm.jpg)
*Preview type Default/Personalized and UTM parameters section*

![UTM parameters, Test Campaign card, Previous/Next](../screenshots/04-builder-whatsapp-013-onetime-step2-utm-test-campaign.jpg)
*UTM parameters, Test Campaign card, Previous/Next*

![Test recipient identifier options (7 types incl. external mobile number and custom segment)](../screenshots/04-builder-whatsapp-014-onetime-step2-test-recipient-types.jpg)
*Test recipient identifier options (7 types incl. external mobile number and custom segment)*

![Personalized preview type: 'Showing preview for: [email id] = ...' (email redacted)](../screenshots/04-builder-whatsapp-015-onetime-step2-personalized-preview-user.jpg)
*Personalized preview type: 'Showing preview for: [email id] = ...' (email redacted)*

![Personalized preview drawer: Select user by, identifier, Fetch user data, Update preview](../screenshots/04-builder-whatsapp-016-onetime-step2-personalized-preview-drawer.jpg)
*Personalized preview drawer: Select user by, identifier, Fetch user data, Update preview*

![Select user by: ID, Email Id, Mobile Number, Google/IOS Advertising Identifier](../screenshots/04-builder-whatsapp-017-onetime-step2-preview-select-user-by.jpg)
*Select user by: ID, Email Id, Mobile Number, Google/IOS Advertising Identifier*

![Next blocked: 'Some values highlighted above are missing or incorrect' toast](../screenshots/04-builder-whatsapp-018-onetime-step2-next-blocked-validation.jpg)
*Next blocked: 'Some values highlighted above are missing or incorrect' toast*

![Inline errors: 'Please select sender.' / 'Please select template.'](../screenshots/04-builder-whatsapp-019-onetime-step2-sender-template-required-errors.jpg)
*Inline errors: 'Please select sender.' / 'Please select template.'*

#### WhatsApp One Time builder, Step 3: Schedule and goals (forced)

![Step 3: At specific date and time (start date, send time, campaign time zone)](../screenshots/04-builder-whatsapp-044-onetime-step3-schedule-specific-time.jpg)
*Step 3: At specific date and time (start date, send time, campaign time zone)*

![As soon as possible: 'Send now' panel](../screenshots/04-builder-whatsapp-045-onetime-step3-send-asap.jpg)
*As soon as possible: 'Send now' panel*

![Goal row (name, event, + New attribute, Revenue performance) and 36-hour tracking window](../screenshots/04-builder-whatsapp-046-onetime-step3-conversion-goal-attribution.jpg)
*Goal row (name, event, + New attribute, Revenue performance) and 36-hour tracking window*

![Tracking-window tooltip: counted from when the user received/opened the WhatsApp message](../screenshots/04-builder-whatsapp-047-onetime-step3-goal-window-tooltip.jpg)
*Tracking-window tooltip: counted from when the user received/opened the WhatsApp message*

![Conversion goals tooltip: track up to 5 conversion goals](../screenshots/04-builder-whatsapp-048-onetime-step3-conversion-goals-tooltip.jpg)
*Conversion goals tooltip: track up to 5 conversion goals*

![Delivery controls, Request limit 60000 rpm, All-users warning, Previous/Publish](../screenshots/04-builder-whatsapp-049-onetime-step3-delivery-controls-request-limit.jpg)
*Delivery controls, Request limit 60000 rpm, All-users warning, Previous/Publish*

![Ignore frequency capping tooltip](../screenshots/04-builder-whatsapp-050-onetime-step3-ignore-fc-tooltip.png)
*Ignore frequency capping tooltip*

![Count for the frequency capping tooltip](../screenshots/04-builder-whatsapp-051-onetime-step3-count-fc-tooltip.png)
*Count for the frequency capping tooltip*

![Request limit tooltip: max throughput 200,000 rpm shared across parallel campaigns](../screenshots/04-builder-whatsapp-052-onetime-step3-request-limit-tooltip.png)
*Request limit tooltip: max throughput 200,000 rpm shared across parallel campaigns*

![Campaign time zone dropdown (searchable IANA list)](../screenshots/04-builder-whatsapp-053-onetime-step3-campaign-timezone-dropdown.jpg)
*Campaign time zone dropdown (searchable IANA list)*

![Start date calendar picker](../screenshots/04-builder-whatsapp-054-onetime-step3-start-date-picker.jpg)
*Start date calendar picker*

#### WhatsApp Periodic builder

![Periodic Step 1 (identical to One Time)](../screenshots/04-builder-whatsapp-020-periodic-step1-target-users.jpg)
*Periodic Step 1 (identical to One Time)*

![Periodic Step 2 Content (identical to One Time)](../screenshots/04-builder-whatsapp-021-periodic-step2-content.jpg)
*Periodic Step 2 Content (identical to One Time)*

![Periodic Step 3 Daily: repeat every N days, Ends, next-send preview](../screenshots/04-builder-whatsapp-055-periodic-step3-daily.jpg)
*Periodic Step 3 Daily: repeat every N days, Ends, next-send preview*

![Weekly: repeat every N weeks, Repeat on weekday chips](../screenshots/04-builder-whatsapp-056-periodic-step3-weekly.jpg)
*Weekly: repeat every N weeks, Repeat on weekday chips*

![Monthly: Days of month 1-31 grid](../screenshots/04-builder-whatsapp-057-periodic-step3-monthly-days-of-month.jpg)
*Monthly: Days of month 1-31 grid*

![Monthly: Days of week ([First] + weekday + of the month, + Add)](../screenshots/04-builder-whatsapp-058-periodic-step3-monthly-days-of-week.jpg)
*Monthly: Days of week ([First] + weekday + of the month, + Add)*

![Ends After: N occurrences](../screenshots/04-builder-whatsapp-059-periodic-step3-ends-after-occurrences.png)
*Ends After: N occurrences*

![Ends On: End date (defaults to +1 year)](../screenshots/04-builder-whatsapp-060-periodic-step3-ends-on-end-date.jpg)
*Ends On: End date (defaults to +1 year)*

![Week-of-month dropdown: First, Second, Third, Fourth, Last](../screenshots/04-builder-whatsapp-061-periodic-step3-week-of-month-dropdown.png)
*Week-of-month dropdown: First, Second, Third, Fourth, Last*

#### WhatsApp Event Triggered builder

![Event Triggered Step 1: Trigger criteria](../screenshots/04-builder-whatsapp-022-event-step1-trigger-criteria.jpg)
*Event Triggered Step 1: Trigger criteria*

![THEN trigger the message: With Delay 3 Days After If Action](../screenshots/04-builder-whatsapp-023-event-step1-then-trigger-delay.jpg)
*THEN trigger the message: With Delay 3 Days After If Action*

![Delay unit: Minutes, Hours, Days](../screenshots/04-builder-whatsapp-024-event-step1-delay-unit-dropdown.jpg)
*Delay unit: Minutes, Hours, Days*

![Timing: Before (disabled) / After](../screenshots/04-builder-whatsapp-025-event-step1-before-after-dropdown.jpg)
*Timing: Before (disabled) / After*

![Condition dropdown: If Action (only option without a secondary event)](../screenshots/04-builder-whatsapp-026-event-step1-if-action-dropdown.jpg)
*Condition dropdown: If Action (only option without a secondary event)*

![Trigger event picker: empty (no events in this workspace)](../screenshots/04-builder-whatsapp-027-event-step1-trigger-event-picker-empty.jpg)
*Trigger event picker: empty (no events in this workspace)*

![Immediately: 'Trigger Messages with only IF condition can now be sent immediately'](../screenshots/04-builder-whatsapp-028-event-step1-trigger-immediately.jpg)
*Immediately: 'Trigger Messages with only IF condition can now be sent immediately'*

![Audience card with real-time segment evaluation note, control groups, Next](../screenshots/04-builder-whatsapp-029-event-step1-bottom-realtime-note.jpg)
*Audience card with real-time segment evaluation note, control groups, Next*

![Validation: 'Campaign name is required', 'Please check the missing or incorrect values in Trigger IF condition'](../screenshots/04-builder-whatsapp-030-event-step1-validation-errors.jpg)
*Validation: 'Campaign name is required', 'Please check the missing or incorrect values in Trigger IF condition'*

![Event Step 3: Active continuously with start/end date-time and time zone](../screenshots/04-builder-whatsapp-062-event-step3-active-continuously.jpg)
*Event Step 3: Active continuously with start/end date-time and time zone*

![Event delivery controls: minimum delay, Ignore DND, Ignore FC, Count for FC](../screenshots/04-builder-whatsapp-063-event-step3-delivery-controls-dnd-min-delay.jpg)
*Event delivery controls: minimum delay, Ignore DND, Ignore FC, Count for FC*

![Ignore DND tooltip: may deliver during DND hours](../screenshots/04-builder-whatsapp-064-event-step3-ignore-dnd-tooltip.png)
*Ignore DND tooltip: may deliver during DND hours*

#### WhatsApp integration settings (sender, templates, general, data)

![Sender configuration > Meta (New): embedded sign-up, Add sender](../screenshots/04-builder-whatsapp-031-settings-sender-config-meta.jpg)
*Sender configuration > Meta (New): embedded sign-up, Add sender*

![Gupshup sender form: name, business number, username, password, delivery tracking URL](../screenshots/04-builder-whatsapp-032-settings-sender-config-gupshup.jpg)
*Gupshup sender form: name, business number, username, password, delivery tracking URL*

![Infobip sender form: name, number, API base URL, API key, delivery tracking URL](../screenshots/04-builder-whatsapp-033-settings-sender-config-infobip.jpg)
*Infobip sender form: name, number, API base URL, API key, delivery tracking URL*

![Karix sender form: name, number, API key, delivery tracking URL](../screenshots/04-builder-whatsapp-034-settings-sender-config-karix.jpg)
*Karix sender form: name, number, API key, delivery tracking URL*

![Approved templates: empty state, Configure sender](../screenshots/04-builder-whatsapp-035-settings-approved-templates-empty.jpg)
*Approved templates: empty state, Configure sender*

![General settings: number/opt-in attributes, lead and incoming-message capture toggles](../screenshots/04-builder-whatsapp-036-settings-general-settings.jpg)
*General settings: number/opt-in attributes, lead and incoming-message capture toggles*

![Data: PII Tokenization not enabled (contact CSM)](../screenshots/04-builder-whatsapp-037-settings-data-pii-tokenization-locked.jpg)
*Data: PII Tokenization not enabled (contact CSM)*

#### WhatsApp > Add template

![Add template page: settings fields, locked content, phone preview](../screenshots/04-builder-whatsapp-038-add-template-page.jpg)
*Add template page: settings fields, locked content, phone preview*

![Service provider dropdown: empty (no BSP configured)](../screenshots/04-builder-whatsapp-039-add-template-provider-dropdown-empty.jpg)
*Service provider dropdown: empty (no BSP configured)*

![Language dropdown: Meta template languages incl. regional variants](../screenshots/04-builder-whatsapp-040-add-template-language-dropdown.jpg)
*Language dropdown: Meta template languages incl. regional variants*

![Category dropdown: Marketing, Authentication, Utility and utility sub-types](../screenshots/04-builder-whatsapp-041-add-template-category-dropdown.jpg)
*Category dropdown: Marketing, Authentication, Utility and utility sub-types*

![Name rules: 1-512 chars, lowercase alphanumerics/underscores, same name as BSP approval](../screenshots/04-builder-whatsapp-042-add-template-name-rules-tooltip.jpg)
*Name rules: 1-512 chars, lowercase alphanumerics/underscores, same name as BSP approval*

![Bottom of Add template: Cancel / Save](../screenshots/04-builder-whatsapp-043-add-template-bottom-cancel-save.jpg)
*Bottom of Add template: Cancel / Save*
