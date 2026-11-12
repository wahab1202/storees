## 03. Engage > Campaign builder: Push & SMS

Storees has the same three-step builder for SMS and push, with a richer audience preview than MoEngage, AI copy, mapped variables, UTM tagging, conversion goals and frequency-cap controls, but its send path drops much of what the builder collects. Every SMS campaign reaches the provider with an empty body; the per-platform push editor's content, click URL, iOS fields and title never reach FCM; and A/B variant B, the fixed-time zone, "User's timezone" and the periodic send time and end date are ignored. Against MoEngage it also lacks DLT template IDs, SMS link shortening, test sends, quiet hours, coupons, conditional content, locales and every advanced push option (buttons, expiry, priority, channels), while device- and location-triggered push are out of reach without an app SDK.

### MoEngage overview

MoEngage builds push and SMS campaigns in a 3-step wizard (Target users > Content > Schedule and goals). Push has five delivery types (One Time, Periodic, Event Triggered, Device Triggered, Location Triggered); SMS has three (One Time, Periodic, Event Triggered).

- **Step 1:** campaign name and tags; target platforms with iOS provisional push (push) or the attribute that holds the mobile number (SMS); All users or filters (property, behaviour, affinity, custom segment); Exclude users; Show count; global and campaign control groups. The builder blocks Next, with inline errors and a red step icon, when the channel is not configured.
- **Step 2, push:** a rich-template gallery; separate Android, iOS and Web editors with "Copy content"; Merlin AI copy and image generation; notification channel; image, GIF, audio and video; click actions, deep links and key-value pairs; 11 button actions; coupon, large icon, auto-dismiss, group and update keys; detailed device previews.
- **Step 2, SMS:** sender connector, DLT Template ID, a character/segment counter and "Shorten and track URL(s)" with a custom short domain.
- **Step 2, both:** the "@" personalisation drawer (attributes with fallbacks including "Do not send", content blocks, aux data, coupons, conditional blocks, custom Jinja), A/B/n variations with manual or Merlin auto-distribution, locales, UTM parameters, a personalised preview and test sends by seven identifier types.
- **Step 3:** send now or at a set time (campaign or user time zone); periodic recurrence with intervals, weekday chips, day grids, nth weekday, end conditions and a server-computed next-send line; pre-compute audience (push); up to five goals with an attribution window; frequency-cap toggles; a request limit up to 200,000 rpm; DND; push expiry, priority, APNS priority, interruption level and relevance score; an "All users" warning before Publish.
- **Triggered sends:** alternate and secondary trigger events, delays, Merlin intelligent delay, originating-device targeting, on-device (device-triggered) rules and geofences.

Capture caveats: neither push nor SMS was configured in the captured workspace, so steps 2-3 were reached by forcing the builder's client-side state (nothing was saved). The push A/B, locale and non-basic templates were not opened, and event dropdowns were empty because the SDK integration is pending. One "Create AI Variant" click was made by mistake; the agent's network guard blocked the request and only an error toast showed, so its result was not seen.

| Page visited | URL path |
|---|---|
| New Campaign modal: Push delivery types (hover descriptions) | `/v4/campaigns/all` (Create campaign modal) |
| Push One Time, Step 1: Target users (blocked, push not configured) | `/v4/push/create/one-time` |
| SMS One Time, Step 1: Target users (blocked, no SMS connector) | `/v4/sms/create?type=one-time` |
| SMS One Time, Step 2: Content (forced) | `/v4/sms/create?type=one-time` (step 2) |
| SMS One Time, Step 3: Schedule and goals (forced) | `/v4/sms/create?type=one-time` (step 3) |
| SMS Periodic (step 1, forced step 3) | `/v4/sms/create?type=periodic` |
| SMS Event Triggered (step 1, forced steps 2-3) | `/v4/sms/create?type=event-trigger` |
| Push One Time, Step 2: template gallery and Android editor (forced) | `/v4/push/create/one-time` (step 2) |
| Push One Time, Step 2: iOS tab (forced) | `/v4/push/create/one-time` (step 2, iOS) |
| Push One Time, Step 2: Web tab, UTM and test (forced) | `/v4/push/create/one-time` (step 2, Web) |
| Push One Time, Step 3: Schedule and goals (forced) | `/v4/push/create/one-time` (step 3) |
| Push Periodic, Step 3 (forced) | `/v4/push/create/periodic` |
| Push Event Triggered (step 1, forced step 3) | `/v4/push/create/event-trigger` |
| Push Device Triggered (step 1, forced step 3) | `/v4/push/create/device-trigger` |
| Push Location Triggered (step 1, forced step 3) | `/v4/push/create/location-trigger` |

### Storees counterpart

- **`/campaigns`** (`packages/frontend/src/app/(dashboard)/campaigns/page.tsx`): the "Create Campaign" panel picks Push or SMS, then One Time or Periodic (Event Triggered and Device Triggered are disabled "Soon" cards). It opens `/campaigns/create?channel=sms|push&type=one-time|periodic`.
- **`/campaigns/create`** (`packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx`): the 3-step wizard.
  - Step 1 is `Step1TargetUsers`: name, tags, content type, "Send to", subscription category, audience (All users / Saved segment / Custom filter), Exclude users, Audience cap, Control group and Audience preview.
  - Step 2 is `Step2TextContent`: "Generate with AI" (`AiCopywriterPanel.tsx`), saved templates, `MultiPlatformPushBlock.tsx` (push), the legacy title and image fields, the message box with an SMS counter, the AI Copywriter card (`CampaignAiCopywriter.tsx`), Link Tracking (UTM) and a preview card; then the shared `VariablePanel.tsx` and `AbTestSection`.
  - Step 3 is `Step3ScheduleGoals`: send timing or recurrence, conversion goals and delivery controls.
- **`/campaigns/[id]`** shows Preview, Send Now and Retry failed (Test Email is email-only); **`/campaigns/[id]/edit`** edits drafts.
- **Backend:** `routes/campaigns.ts` → `campaignService.ts` (`dispatchCampaign` stages recipients, `processCampaign`/`sendOneRecipient` render and hand off) → `deliveryService.ts` (dealer routing, consent, frequency cap, reachability, plan limits) → the BullMQ `delivery` queue (`deliveryWorker.ts`) → `channelProviderRegistry.ts` → providers: `fcmProvider.ts` for push; `twilioProvider.ts`, `gupshupProvider.ts`, `birdProvider.ts` and `vonageProvider.ts` for SMS. `campaignScheduler.ts` runs scheduled and periodic sends.
- **Event-triggered SMS and push** exist only in Flows: send nodes configured in `SendNodeConfigModal.tsx` and executed by `flowExecutor.ts`.

**Path key for the Evidence column.** Line numbers are at commit `2063cdc`.

| Short name | Repo path |
|---|---|
| `campaigns/page.tsx`, `create/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx` | `packages/frontend/src/app/(dashboard)/campaigns/…` |
| `settings/page.tsx`, `templates/create/page.tsx` | `packages/frontend/src/app/(dashboard)/…` |
| `MultiPlatformPushBlock.tsx`, `CampaignAiCopywriter.tsx`, `AiCopywriterPanel.tsx` | `packages/frontend/src/components/campaigns/` |
| `VariablePanel.tsx` | `packages/frontend/src/components/templates/` |
| `SendNodeConfigModal.tsx` | `packages/frontend/src/components/flows/` |
| `routes/*.ts`, `index.ts` | `packages/backend/src/routes/`, `packages/backend/src/index.ts` |
| `campaignService.ts`, `deliveryService.ts`, `campaignAnalyticsService.ts`, `channelProviderRegistry.ts`, `emailService.ts`, `shortLinkService.ts`, `templateContext.ts`, `eventProcessor.ts`, `flowExecutor.ts`, `flowService.ts`, `contentLint.ts`, `resendProvider.ts`, `pinnacleProvider.ts`, `sendTimeService.ts` | `packages/backend/src/services/` |
| `fcmProvider.ts`, `twilioProvider.ts`, `gupshupProvider.ts`, `birdProvider.ts`, `vonageProvider.ts`, `providers/index.ts` | `packages/backend/src/services/providers/` |
| `campaignScheduler.ts`, `deliveryWorker.ts`, `campaignWorker.ts`, `triggerWorker.ts` | `packages/backend/src/workers/` |
| `schema.ts` | `packages/backend/src/db/schema.ts` |
| `types.ts` | `packages/shared/src/types.ts` |
| `evaluator.ts` | `packages/segments/src/evaluator.ts` |
| `flows/src/templates.ts` | `packages/flows/src/templates.ts` |
| `STOREES_INTEGRATION_GUIDE.md` | `docs/STOREES_INTEGRATION_GUIDE.md` |

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| New Campaign modal | Delivery types per channel, with hover descriptions | Push: One Time, Periodic, Event, Device and Location Triggered. SMS: One Time, Periodic, Event Triggered. Each card shows a one-line hover description | 🟡 Partial | Same four cards for every channel with fixed blurbs; Event and Device Triggered greyed out as "Soon"; no Location (`campaigns/page.tsx:65-70`). `CampaignDeliveryType` is `'one-time' \| 'periodic'` (`types.ts:174`) | List the types each channel really supports. Point "Event Triggered" at a prefilled one-message flow (event-triggered SMS and push already work in Flows); hide "Device Triggered" until there is an app SDK. | P3 | S |
| Step 1: Target users | Campaign name and tags | Required campaign name and a "Campaign tags" dropdown of existing tags | 🟡 Partial | Name plus free-text tag chips (`create/page.tsx:1074-1105`), saved on create and PATCH (`routes/campaigns.ts:250,518`). The list, detail and edit pages never show, filter or edit tags | Show and filter tags on the list, edit them, and suggest existing tags instead of free text. | P3 | S |
| Step 1: Target users | Mobile-number attribute picker (SMS) | Required "User attribute that stores user's mobile number", default Mobile Number (Standard), searchable list of every attribute | ❌ Missing | Every SMS provider's `resolveBody` reads `customers.phone` only (`twilioProvider.ts:7-16`, `gupshupProvider.ts:47-56`, `birdProvider.ts:7-16`, `vonageProvider.ts:7-16`), as do staging, preview and reachability (`campaignService.ts:267-271,578-585`, `deliveryService.ts:459-492`). Step 1 has no picker | Let a campaign take the number from a chosen attribute (for example an alternate or WhatsApp number) through staging, preview, reachability and all four providers. | P3 | M |
| Step 1: Target users | Setup check: no SMS connector | Red banner "No SMS connector found…"; step 1 turns red on Next and the sender list is empty, so an unconfigured channel cannot publish | ❌ Missing | Only WhatsApp has a provider-status banner (`create/page.tsx:2318-2335`); nothing checks SMS on create or Send Now (`routes/campaigns.ts:660-681`). With no project config, `getChannelProvider` borrows the platform's `TWILIO_*` env account if set (`channelProviderRegistry.ts:216-221`); otherwise the legacy fallback fails every recipient (`deliveryService.ts:169-176`): the generic Pinnacle stub when `PINNACLE_API_URL` is set, else Resend ("Resend only supports email", `resendProvider.ts:63-66`). Settings offers a Pinnacle "SMS + RCS messaging" option (`settings/page.tsx:373-374`) but no `sms_pinnacle` provider is registered (`providers/index.ts:25-29`), so choosing it hits the same failure | Check the project's SMS provider in the builder and on Send Now, show a banner linking to Settings > Channels, and block sending until one is set up. Stop routing unconfigured tenants through the platform's own Twilio account. Remove or implement Pinnacle SMS. | P2 | S |
| Step 1: Target users | Setup check: push platforms | Inline errors per unconfigured platform (no FCM key, no APNS certificate, no web push) with "here" links; Next and the stepper blocked with a toast; error icon on the step | ❌ Missing | No FCM check in the builder; Next is just disabled while name or body is empty (`create/page.tsx:539-548,972`) and the stepper jumps to any step (`create/page.tsx:721`). Unconfigured projects borrow the platform's `FCM_PROJECT_ID` account if set (`channelProviderRegistry.ts:237-242`), where tokens from the brand's own Firebase project fail, or else hit the failing legacy fallback | Same provider check for push, with inline step errors; per-platform readiness once platforms are real. | P2 | S |
| Step 1: Target users | Target platforms (Android / iOS / Web) with per-platform content and "Copy content" | Platforms picked in step 1; step 2 gives each its own Android, iOS or Web editor, with "Copy from Android / iOS" | 🟡 Partial | Platform buttons and per-platform title, body, image, click URL and iOS subtitle/badge sit in step 2 (`MultiPlatformPushBlock.tsx:66-205`) and are saved as `pushPlatforms`/`pushContent` (`create/page.tsx:626-627`, `routes/campaigns.ts:232-233`), but nothing in the send path reads them (only routes and schema reference them). `fcmProvider.ts:99-130` builds one notification from `variables.title/message`. Picking a platform hides "Notification Title" and "Image URL" (`create/page.tsx:2808`), so the push goes out with an empty title and no image, and the per-platform body is replaced by the separate "Push Message" box. One `fcm_token` per customer (`fcmProvider.ts:93-96`); no copy action; the edit page cannot change `pushContent` | Send `pushContent` (map it to the FCM `android`, `apns` and `webpush` blocks), keep a title visible, move platform choice to step 1, and add "Copy content". | P0 | S |
| Step 1: Target users | iOS provisional push | Opted-in + provisional devices, opted-in only, or provisional only | ➖ N/A | Provisional authorisation is requested and reported by an iOS SDK. Storees has none (`packages/sdk` and `packages/sdk-react` are browser-only) and keeps one `fcm_token` per customer with no permission state (`fcmProvider.ts:93-96`) | Only relevant once an iOS SDK, or the merchant's app, reports provisional vs explicit permission. | — | — |
| Step 1: Target users | Target audience: All users, or filter by property, behaviour, affinity or segment | All users, or Filter users by User property, User behavior, User affinity or Custom segment, with nested filters and Reset filters | 🟡 Partial | All users / Saved segment / Custom filter (`create/page.tsx:1221-1297`); `SegmentFilterBuilder` attribute, event, product and aggregate rules with nested groups, applied at staging (`campaignService.ts:520-573`) | Assessed in module 01: an empty segment or filter silently falls back to every customer (P0 there), and there is no affinity rule and no segment-as-filter block. | See 01 | — |
| Step 1: Target users | Exclude users | "Exclude Users" checkbox with its own filter | 🟡 Partial | Toggle plus `SegmentFilterBuilder` (`create/page.tsx:1299-1329`), applied as `NOT (filter)` in preview and staging (`campaignService.ts:206,520`). Rules compile to plain comparisons such as `city::text = 'Pune'` (`evaluator.ts:878-900`), which are NULL for a customer with no value, and `NOT (NULL)` drops the row | Excluding "City is Pune" also drops every customer with no city, and any custom-attribute rule drops everyone without that attribute (email campaigns too). Use `NOT COALESCE((filter), FALSE)`. Excluding a saved segment is tracked in module 01. | P2 | S |
| Step 1: Target users | Automatic exclusion of opted-out users | Note under the audience: opted-out users can be excluded automatically | 🟡 Partial | A send is blocked only by a `consents` row that is not `opted_in` (`deliveryService.ts:347-385`). For SMS such a row can come only from the admin `POST /api/consent/:customerId` (`routes/consent.ts:42-75`), which no screen calls; the SMS webhooks handle receipts and WhatsApp inbound only (`routes/channelWebhooks.ts:43-212`), so STOP replies are ignored. Shopify `sms_marketing_consent` is stored as `customers.sms_subscribed` (`eventProcessor.ts:293-296`) but staging and `deliveryService` never read it (`deliveryService.ts:376-380` says so). The preview counts opt-outs for email only (`campaignService.ts:276-301`) | Turn STOP/START replies from each SMS provider into consent records, honour Shopify SMS consent at send, and count SMS and push opt-outs in the preview. Interim workaround: add "SMS Subscribed is true" to the audience filter. | P1 | M |
| Step 1: Target users | Show count (audience size) | "Show count" returns one number | ⭐ Storees better | "Audience preview" (`create/page.tsx:1427-1485` → `POST /api/campaigns/audience-preview`, `routes/campaigns.ts:301-347`, `campaignService.ts:172-405`) returns Candidates, Reachable, Deliverable, Recipients, Suppressed, Opted out, Category blocked, 24h window blocked, Frequency capped and Holdouts, and explains a zero result | Already ahead. Fix the flaws: the segment card's "reachable" figure is a hard-coded 90% (`create/page.tsx:1048`); opt-outs and suppressions are counted for email only, although SMS and push sends block on consent rows; push counts `push_subscribed` customers with no token, whose sends fail with "No FCM token". | P2 | S |
| Step 1: Target users | Campaign control group | "Campaign control group" toggle (also addable from the A/B User Distribution drawer) | ✅ Full | 1-50% slider (`create/page.tsx:1371-1425`); deterministic sha256 split written to `campaign_holdouts` (`campaignService.ts:65-70,676-699`); per-goal lift card (`campaignAnalyticsService.ts:225-304`, `[id]/page.tsx:531-568`) | Parity. | — | — |
| Step 1: Target users | Global control group | "Global control group" toggle that applies a workspace-wide holdout from Settings | ❌ Missing | No global holdout (searched global control, globalHoldout, universal holdout across backend, frontend, shared, segments and flows); only the per-campaign `control_group_seed` | A workspace-level holdout excluded from every campaign and flow, with long-run lift reporting. | P2 | M |
| Step 2: Push content | Rich push template gallery and SDK minimum-version check | Basic notification, Stylized basic, Simple image carousel, Image banner with text overlay, Timer, Timer with progress bar (platform and GIF badges); Change/Reset template; "Check minimum requirements" | ➖ N/A | Every layout beyond title, body and image is drawn on the device by MoEngage's native rich-notification SDK. Storees has no app SDK and sends plain FCM notifications (`fcmProvider.ts:116-143`). Nearest control: "Use a saved Push template", a list of text templates (`create/page.tsx:2755-2789`) | Only relevant with an app SDK; basic title, body and image is the ceiling (rows below). | — | — |
| Step 2: Push content | Background update (silent push) and sending it to opted-out users | "Background update" template (New), plus a step 3 option to send background pushes to opted-out users | ❌ Missing | `fcmProvider.ts:125-129` always sends a `notification` block; no data-only or `content-available` mode and no opted-out targeting | Data-only FCM and APNs `content-available` sends, with a documented app-side handler. | P3 | M |
| Step 2: Push content | Android notification channel | Required "Notification channel" (e.g. general, High) with "Manage notification channel" and an importance tooltip | ❌ Missing | `android.notification` carries only `image` and `click_action`, no `channel_id` (`fcmProvider.ts:130-135`); no field in `MultiPlatformPushBlock.tsx` | A channel-id field backed by a project list of channels, sent as `android.notification.channel_id`. | P3 | S |
| Step 2: Push content | Push title, message and Android message summary | Message title, Message and Message summary, each with a Merlin wand, emoji picker and "@" personalisation | 🟡 Partial | Single-content mode has "Notification Title" and the "Push Message" box (`create/page.tsx:2808-2865`), sent as `notification.title/body` (`campaignService.ts:1023-1032`, `fcmProvider.ts:99-130`); both accept `{{tokens}}`. No summary field | Add a summary sent in `data` for the app to render (FCM's Android notification has no summary field), once per-platform content is wired. | P3 | S |
| Step 2: Push content | Emoji picker in text fields | Emoji picker with categories and search beside each field | ❌ Missing | No picker in `packages/frontend/src` (searched EmojiPicker, emoji-mart, emoji-picker); only the AI brief's "Include emoji" checkbox (`CampaignAiCopywriter.tsx:45`) | Emoji picker on push and SMS fields; for SMS, warn that emoji switch the message to 70-character segments. | P3 | S |
| Step 2: Push content | Merlin AI copy generation | Banner (Create AI Variant / Create new) and a wand per field: custom prompt or existing variant; use case, include/exclude keywords, audience, tone, persona, language, attribute, coupon, emoji; monthly quota shown | ✅ Full | "Generate with AI" (`AiCopywriterPanel.tsx` → `POST /api/ai/copywriter`, `routes/ai.ts:83`) writes from a brief with 5 tones, 6 languages including Hindi and Tamil, and a variant count. The AI Copywriter card (`CampaignAiCopywriter.tsx:36-66` → `POST /api/ai/campaign-variations`, `routes/ai.ts:166`) takes the same brief fields and rewrites the current copy into 3 variations, the equivalent of "existing variant". Both sit on the SMS/push step (`create/page.tsx:2722-2753,2867-2874`) and call the configured LLM | Brief parity. Smaller gaps: no per-field wand, no usage quota, two overlapping AI panels, and the card's Generate is enabled with only a use case although the API rejects an empty draft ("Subject or body is required", `routes/ai.ts:177-179`). | — | — |
| Step 2: Push content | AI image generation (Merlin "Generate image" and AI Designer) | Image description in the Merlin drawer (100 images a month) and "Merlin AI Designer" as an image source | ❌ Missing | `routes/ai.ts` exposes segment, email-layout, copywriter, whatsapp-template, next-action and campaign-variations only; no image-model calls anywhere in backend or frontend | Generate images into the asset store and offer them as a push and email image source. | P3 | M |
| Step 2: Push content | Push rich media (image URL, upload, GIF, AI Designer) | Android: image URL, upload or AI Designer with size and ratio guidance, plus GIF for Android 14+ with an image fallback (500KB). iOS: Image/GIF, Audio or Video. Web: URL or upload | 🟡 Partial | Single-content "Image URL" (`create/page.tsx:2817-2833`), sent as `notification.image` and APNs `fcm_options.image` (`campaignService.ts:1026-1031`, `fcmProvider.ts:125-139`); accepts `{{recipient_image:key}}`. The field is hidden once a platform is picked, and per-platform images are never sent. No upload (`routes/assets.ts:82` is email-only), GIF, audio, video or size guidance | Reuse the asset upload for push images, validate size and ratio, and send per-platform images. GIF, audio and video need app support. | P3 | S |
| Step 2: Push content | Default click action, deep links and key-value pairs | Navigate to a screen, Deeplinking (URL) or Rich landing (URL), plus optional key-value pairs ("$" and "." not allowed in keys); the same three actions on iOS | 🟡 Partial | "Click URL" exists only in the per-platform tabs (`MultiPlatformPushBlock.tsx:155-165`) and is never sent. `fcmProvider.ts:130-140` hard-codes the Android `click_action` `FLUTTER_NOTIFICATION_CLICK`, sends no link (no `webpush.fcm_options.link`) and forwards every resolved variable, including `customer_email`, as `data` instead of marketer-defined pairs | Add a click action (deep link or URL) and custom key-value pairs to every push; send them in `data`, the APNs payload and `webpush.fcm_options.link`; tag the link with UTM; stop putting PII such as `customer_email` in `data`. | P0 | S |
| Step 2: Push content | Action buttons | "+ Action button": name, 11 click actions (screen, deep link, rich landing, call, share, copy, set attribute, track event, custom, snooze, remind later), URL and KV pairs; iOS buttons from categories; Web buttons with title, icon and URL | ❌ Missing | `PushPlatformContent.actions` (web only) is declared (`types.ts:194-204`), but no UI fills it and `fcmProvider.ts` sends no buttons, APNs category or `webpush` actions | A per-platform button editor; send `webpush` actions and an APNs category, and document how the app handles Android data buttons. | P2 | M |
| Step 2: Push content | Android advanced: coupon code, large icon, auto-dismiss, group key, update key | Coupon code, large icon (app icon, upload or URL), auto-dismiss after N, group key and update key | ❌ Missing | `android.notification` has no `tag`, `collapse_key`, `icon` or timeout (`fcmProvider.ts:130-135`); no fields in `MultiPlatformPushBlock.tsx` | Group and update keys are server-only (FCM `tag`/`collapse_key`, APNs `thread-id`/`apns-collapse-id`). Large icon, auto-dismiss and copy-coupon need app support. | P3 | M |
| Step 2: Push content | iOS-specific content: subtitle, sound, badge, background refresh, categories, audio/video | Title, Subtitle, Message, "Allow app to refresh in background", Image/GIF, Audio or Video, category buttons, Sound (file name) and Badge | 🟡 Partial | The iOS tab has Subtitle and Badge inputs (`MultiPlatformPushBlock.tsx:167-189`) that are never sent; `fcmProvider.ts:136-139` always sends `aps` with `sound: 'default'` and `mutable-content: 1` | Send subtitle, badge, a custom sound and `content-available` in the APNs payload; add categories once buttons exist. | P3 | S |
| Step 2: Push content | Web push (redirect URL, auto-dismiss, image, buttons, icon, desktop preview) | Web tab: title, message, required Redirect URL, auto-dismiss after 8 s, image, buttons (title, icon, URL), icon image, and "See in web browser" Chrome preview | 🟡 Partial | A Web tab and preview card only (`MultiPlatformPushBlock.tsx:17-21,269-292`); nothing from them is sent. `packages/sdk` has no service worker or PushManager. Web push works only through the DIY Firebase setup in `STOREES_INTEGRATION_GUIDE.md:532-615`, which stores the browser token as the customer's single `fcm_token` (overwriting an app token) via `/api/v1/customers`; it needs a known `customer_id` (no anonymous subscribers) and puts `X-API-Secret` in browser JavaScript. No `webpush` block or link is sent, so a click opens nothing | First-party web push: an SDK opt-in prompt and service worker, per-device subscriptions (anonymous ones too), a `webpush` payload (link, icon, actions, requireInteraction) and a desktop preview. | P1 | L |
| Step 2: Push content | Device previews | Android 12+ with Dark/Light, Collapse/Expand and OEM width presets (Min, Std A, Std B, Max); iPhone lock screen with Collapse/Expand and Dark/Light; Chrome desktop for Web | 🟡 Partial | Static Android, iOS and Web cards (`MultiPlatformPushBlock.tsx:212-293`) and a generic card in single-content mode that appears only once the body has text (`create/page.tsx:2928-2988`). No dark mode, collapsed/expanded states or width presets | Lock-screen previews with dark/light and collapsed/expanded states, kept beside the editor. | P3 | S |
| Step 2: SMS content | SMS sender (connector) per campaign | "SMS sender" dropdown of configured connectors; A/B variations inherit it | 🟡 Partial | One SMS provider per project in Settings > Channels (`settings/page.tsx:365-374`), read from `settings.channels.sms` (`channelProviderRegistry.ts:169-202`). The From number or sender name lives in that config, and the Gupshup config has no sender field. No per-campaign choice | Several connectors or sender IDs per project (e.g. promotional vs transactional headers), chosen per campaign. | P3 | M |
| Step 2: SMS content | DLT Template ID (India) | "Template ID" field; the tooltip says it is mandatory under India's DLT rules | ❌ Missing | No DLT template, entity (PE) or header fields in campaigns, templates or provider config (searched dlt, entityId, peid, senderId). Gupshup SMS sends `msg_type: TEXT` with only userid and password (`gupshupProvider.ts:58-80`, `settings/page.tsx:367-368`) | A DLT template ID on SMS campaigns and templates and PE ID plus header in the provider config, passed to Gupshup and other Indian gateways, with a warning when the text drifts from the registered template. Indian operators reject commercial SMS that does not match a registered DLT template. | P0 | M |
| Step 2: SMS content | SMS message composer | Message with "@" personalisation and a live phone preview (sender name and bubble) | 🟡 Partial | Composer, variables and preview exist (`create/page.tsx:2837-2865,2928-2988`), but the text never reaches the provider. SMS campaigns save no `templateId` (`create/page.tsx:611`); `campaignService.ts:1027-1039` passes the rendered text as `variables.message` with `templateId: ''`; every SMS provider builds the body only from an `email_templates` row looked up by `templateId` (`twilioProvider.ts:7-16`, `gupshupProvider.ts:47-56`, `birdProvider.ts:7-16`, `vonageProvider.ts:7-16`). The body is `''`, so each SMS fails at the provider or arrives blank. Flow SMS works because nodes pass a template UUID (`flowExecutor.ts:756-805`) | Make the SMS providers fall back to `variables.message` when there is no template (one line in each) and add a regression test. | P0 | S |
| Step 2: SMS content | Character and SMS-segment counter | Live "N Character(s), N SMS" under the phone preview | 🟡 Partial | An `N/160` counter that counts 153 characters per segment past 160 (`create/page.tsx:2857-2862`). It assumes GSM-7 (Hindi or emoji should drop to 70/67 per segment), counts raw `{{tokens}}`, and ignores the UTM parameters appended at send (`campaignService.ts:1029`) | Detect GSM-7 vs UCS-2 and estimate length after personalisation, UTM tagging and link shortening. | P2 | S |
| Step 2: SMS content | Shorten and track URLs (custom domain) | Links shortened to 30-35 characters and click-tracked; custom short domain in Settings; UTM added only to shortened links | ❌ Missing | The durable short-link service (`shortLinkService.ts:33-48`, redirect at `GET /c/:slug`) is used only for WhatsApp URL buttons (`deliveryService.ts:271-310`). Links in SMS and push text only get UTM (`emailService.ts:159-183`). One `SHORTLINK_BASE_URL`, no custom domain | Replace SMS (and push) links with per-recipient short links on channel `sms`, mirror clicks to the campaign, then add custom domains. | P1 | M |
| Step 2: SMS content | MMS and RCS | App strings: SMS, MMS, "RCS only", "RCS with SMS as fallback"; MMS up to 10 images of 0.6 MB; Sinch, Twilio, ICS, Kaleyra, Gupshup. Not visible without a connector | ❌ Missing | Plain text only (`twilioProvider.ts`, `gupshupProvider.ts:58-80`). Settings describes Pinnacle as "SMS + RCS messaging with rich media" (`settings/page.tsx:373-374`), but no Pinnacle SMS or RCS provider is registered (`providers/index.ts:25-29`) | RCS (rich cards, suggested replies) with SMS fallback through an Indian aggregator. MMS matters little in India. | P2 | L |
| Step 2: Personalization | Insert a user attribute with fallback text | "@" opens the Personalization drawer: pick an attribute, fallback "No fallback" or "Replace text" | ✅ Full | `{{key}}` tokens mapped in `VariablePanel.tsx:47-158` to customer, attribute, product, event, project, literal or decision sources (`types.ts:1094-1127`), each with a default and 7 formats, resolved per recipient (`templateContext.ts:103-185`, `campaignService.ts:923-936`) | Parity on substitution and fallback text. No "@" insert, and unknown keys are guessed: `{{order_id}}` becomes Customer > Name (`VariablePanel.tsx:473-512`), while the SMS hint itself suggests `{{order_id}}` (`create/page.tsx:2850,2856`). | — | — |
| Step 2: Personalization | Fallback: do not send when the value is empty | "Do not send SMS" / "Do not send Push" when the personalised value is empty | ❌ Missing | `TemplateVariable` has only `defaultValue` (`types.ts:1122-1127`); an unresolved token becomes `''` (`emailService.ts:109-121`). No skip option (searched skipIfEmpty, doNotSend, ifEmpty) | A per-variable "skip this recipient if empty" option that records a block reason. | P2 | S |
| Step 2: Personalization | Content blocks | Insert a saved content block, optionally only its content | ❌ Missing | No reusable block model in the schema or UI; templates are whole messages (`routes/templates.ts`) | Reusable text snippets that any channel can insert by token. | P3 | M |
| Step 2: Personalization | Aux data (lookup tables) | Values from auxiliary data tables | ❌ Missing | Variable sources stop at customer, attribute, product, event, project, literal and decision (`types.ts:1094-1111`); the catalogue and item APIs (`routes/catalogues.ts`, `routes/items.ts`) are not a source | A lookup-by-key variable source over catalogue items or uploaded tables. | P3 | M |
| Step 2: Personalization | Coupons | Pick a coupon list; fallback "Do not send" or "Use a fallback coupon" | ❌ Missing | No coupon pools or unique-code assignment (searched coupon_list, couponPool, discount_pool, price_rule, code_redemption). Only a fixed code in the AI brief (`CampaignAiCopywriter.tsx:44`) or a value bound from an attribute or event | Coupon pools (uploaded, or unique codes created in Shopify), one code per recipient at send time, a fallback, and redemption tracking. | P1 | L |
| Step 2: Personalization | Conditional content (If / Then / Else) | Display name, If user-attribute conditions with groups, Then text, Else fallback | ❌ Missing | `interpolateTemplate` only substitutes `{{key}}` (`emailService.ts:109-121`); no conditional syntax or builder (searched jinja, liquid, handlebars, nunjucks, `{% if`) | A condition builder that gives each recipient different text, evaluated with the segment filter engine. | P2 | M |
| Step 2: Personalization | Custom Jinja and natural-language Jinja | Jinja editor plus "Create Jinja snippets using natural language with Merlin AI" | ❌ Missing | No template language beyond `{{key}}` substitution (same searches) | A sandboxed template language (Liquid would suit Shopify merchants) with an AI helper. | P3 | L |
| Step 2: Variants, preview and test | A/B variations for SMS and push | "+ A/B test" → Copy Variation or New Variation; each variation is a tab with the full editor and a share (Variation 1 (50%), Variation 2 (50%), + Variation) | 🟡 Partial | `AbTestSection` gives one extra variant, a 10-90% slider and a "Message Body (B)" box, with no push title for B (`create/page.tsx:2995-3156`). Users are split (`campaignService.ts:52-58`), but only email reads variant B (`campaignService.ts:950`); SMS and push send `campaign.bodyText` to everyone (`campaignService.ts:1024-1029`), and `abVariantBBodyText` is read only when duplicating (`campaignService.ts:1353`) | Send the variant B text (and a B title for push). Then move to tabbed variations, more than two, with "Copy variation". | P1 | S |
| Step 2: Variants, preview and test | User distribution: Merlin auto-optimisation and winner | Manual % per variation, or "Dynamically using Merlin AI" (for SMS it shifts traffic by CTR while sending over 60 minutes); + Campaign control group; Reset distribution | 🟡 Partial | Manual split only. Winner metric, test duration (1-72 h) and "Auto-send winner" are saved (`create/page.tsx:3107-3141`, `routes/campaigns.ts:242-249`) but nothing reads them. The A/B results always pick the winner by open rate (`campaignAnalyticsService.ts:488-543`), and SMS records no opens, so every SMS test reads "tie" | Send to a test cohort first, then the winner to everyone else; later, a bandit that shifts traffic by CTR during the send. | P2 | L |
| Step 2: Variants, preview and test | Locales | "+ Locale": language versions (search, + New Locale); tests can pick locale and variation | ❌ Missing | No locale fields in `create/page.tsx` or the `campaigns` table. Per-customer language selection exists only for WhatsApp templates (`deliveryService.ts:214-268`) | Locale versions per campaign, picked from each customer's language attribute with a default fallback. Matters for Hindi and regional-language SMS and push. | P2 | M |
| Step 2: Variants, preview and test | Personalized preview (preview as a chosen user) | Preview type Default/Personalized: choose a user by ID, Email, Mobile, GAID or IDFA, fetch their data, update the preview; tests can reuse the sample | 🟡 Partial | "Render data" with a dropdown of the 20 most recently seen customers (`create/page.tsx:2712-2716,2931-2958`); `VariablePanel` also has "Test with sample customer". `POST /api/templates/preview` accepts any `sampleCustomerId`, but the UI has no search | A customer search (email, phone or external id) and a preview that refreshes as you type. | P3 | S |
| Step 2: Variants, preview and test | UTM parameters | Accordion (switched on in Settings): utm_source=MoEngage, utm_medium={{Campaign Channel}}, utm_campaign={{Campaign Name}}, optional utm_term and utm_content, + custom parameter | 🟡 Partial | "Link Tracking" toggle with Source, Medium, Campaign and custom rows (`create/page.tsx:2876-2925`), added to every URL in the text (`emailService.ts:159-183`, called at `campaignService.ts:1029`). For SMS the tagged text never reaches the phone (empty-body defect), and push has no click URL to tag | Starts working once the SMS body and push link are fixed; then add utm_term and utm_content presets and tag the push link. | P2 | S |
| Step 2: Variants, preview and test | Test send | "Test Campaign": by Unique ID, Email, Mobile (registered or external), GAID, IDFA, device push token (push) or Custom Segment; pick locale and variation; reuse the preview sample; ignores frequency caps | ❌ Missing | Only `POST /api/campaigns/:id/test-email` (`routes/campaigns.ts:698`) and the WhatsApp template test-send (`routes/whatsappAdmin.ts:546`) exist; the detail page shows "Test Email" for email only (`[id]/page.tsx:203-214`). The SMS providers cannot send to another number: they always read `customers.phone` (`twilioProvider.ts:7-16`) | Test sends for SMS (to any number) and push (to a customer or a raw device token), with variant and sample-customer choice, skipping frequency caps. | P0 | M |
| Step 2: Variants, preview and test | Automate QC with Merlin Custom Agents | Button in the Test Campaign card | ❌ Missing | No pre-send review for SMS or push. The rule-based content lint (`contentLint.ts`) runs only for email on create (`routes/campaigns.ts:269-274`) and its findings are not shown in the UI | A pre-send checklist (empty body, unmapped tokens, broken links, DLT match, opt-out wording), optionally with AI help. | P3 | M |
| Step 3: Schedule | Send now (As soon as possible) | One Time "As soon as possible": goes out when you click Publish | ✅ Full | "As soon as possible" (`create/page.tsx:3351-3366`); the draft is sent with "Send Now" on the detail page (`[id]/page.tsx:230-242`, `routes/campaigns.ts:660`) | Parity, but it takes two steps (Create Campaign, then Send Now). | — | — |
| Step 3: Schedule | At a set date and time, in a campaign time zone | Start date and Send time, Campaign time zone from the full IANA list with offsets, "Reset to defaults" | 🟡 Partial | "Fixed date and time" takes a date, a time and one of 10 zones (`create/page.tsx:3161,3367-3384`). The date and time are converted in the admin's browser zone (`create/page.tsx:635-637`) and "fixed" uses `scheduledAt` unchanged (`campaignService.ts:1126`), so the chosen zone has no effect. The scheduler polls every 60 s (`campaignScheduler.ts:14,129`) | Read the date and time in the chosen zone, offer the full IANA list with offsets, and show the result in the admin's own zone. | P1 | S |
| Step 3: Schedule | Send in user time zone | "At fixed time" or "Send in user time zone", which delivers at that local time for each recipient | 🟡 Partial | "User's timezone" reads `customAttributes.timezone/time_zone/tz` (`campaignService.ts:1128-1146`), but `nextLocalDateTime` (`campaignService.ts:1154-1168`) converts the anchor into the recipient's zone and straight back, so everyone gets the anchor instant. When the scheduler starts the campaign the anchor is already past, so the "past time" rule adds 24 h for every recipient (re-run in a scratch copy: Kolkata, New York, London and Tokyo all landed on anchor + 24 h; only a Send Now before the anchor hits it) | Compute each recipient's local send time from the campaign's wall-clock date and time, fill the zone from the Shopify address or country when it is missing, and decide what happens to zones whose time has passed. Until then the option delays the whole send by a day. | P1 | S |
| Step 3: Schedule | Periodic: daily, weekly or monthly, with start date and send time | Daily, Weekly or Monthly with campaign time zone, fixed or user time zone, Start date and Send time; the first send is scheduled automatically | 🟡 Partial | The UI offers Daily, Weekly (one day) or Monthly (day 1-28) with "Send at time" and an optional End date (`create/page.tsx:3264-3348`), saved as `{time, endsAt}` (`types.ts:224-230`). The scheduler expects `timeOfDay` and reads neither field (`campaignScheduler.ts:16-43`); it re-sends a `sent` campaign 23 h (daily), 6 days plus the weekday, or 27 days plus the day of month after the previous run finished, so daily runs creep about an hour earlier each day. No start date: periodic campaigns are saved as drafts (`routes/campaigns.ts:241`), so the first run needs Send Now, and each run deletes the previous run's `campaign_sends` (`campaignScheduler.ts:96-111`) | Honour the send time, time zone and end date; add a start date that schedules the first run; compute the next run from the schedule rather than the last completion; keep each run's history. | P1 | M |
| Step 3: Schedule | Periodic: every N, several weekdays, day-of-month grid, nth weekday | Repeat every N days, weeks or months; weekday chips; monthly by a 1-31 day grid or by First…Last weekday, with "+ Add" | 🟡 Partial | One weekday (`create/page.tsx:3287-3308`) or one day of the month from 1 to 28 (`create/page.tsx:3310-3324`); `PeriodicSchedule` holds a single `dayOfWeek`/`dayOfMonth` (`types.ts:224-230`). No "every N", multiple days or "first Monday" | Interval, multi-day and nth-weekday rules (RRULE-style) in the UI and the scheduler. | P2 | M |
| Step 3: Schedule | Periodic end condition and next-send preview | Ends Never, On (end date) or After N occurrences; server-computed "Campaign will be next sent on …" | 🟡 Partial | Only an optional End date, which the scheduler ignores (`campaignScheduler.ts:16-43`). The summary line is static text built in the browser (`create/page.tsx:3338-3347`). No "after N occurrences" | Enforce the end date, add a maximum number of runs, and show the server-computed next send in the builder and on the detail page. | P2 | S |
| Step 3: Schedule | Pre-compute audience | Computes the audience about an hour before a scheduled push so slow segments don't delay it (skipped if edited within 30 minutes) | ❌ Missing | Recipients are staged only when the send starts (`campaignService.ts:451-754`); no precompute option (searched precompute, pre-compute) | Optional early staging for scheduled campaigns, with consent and caps rechecked at send time. | P3 | M |
| Step 3: Goals and delivery controls | Conversion goals and attribution window | Up to 5 goals (name, event, + New attribute, revenue toggle); "Track above goals for 36 Hours/Days from the time the SMS is sent/delivered" | 🟡 Partial | Unlimited goals with name, project event, Primary, revenue property, event-attribute filters and currency (`create/page.tsx:3389-3514`), evaluated in `campaignAnalyticsService.ts:120-223` with Any / View-through / Click-through (`[id]/page.tsx:570-619`). The default "Any" pool is every `campaign_sends` row, including failed and blocked sends (`campaignAnalyticsService.ts:144`); the window starts at `sentAt`, when the whole run finished (`campaignAnalyticsService.ts:135-137`), while the label says "from the time the SMS is opened" (`create/page.tsx:3512`); SMS records no opens or clicks, so View- and Click-through are always empty for SMS | Count only recipients whose send went out, start the window at each recipient's send, fix the label, and give SMS a click signal (short links). With today's empty-body defect an SMS campaign reports conversions and revenue from people who received nothing. | P2 | S |
| Step 3: Goals and delivery controls | Ignore frequency capping and Count for frequency capping | "Ignore frequency capping" and "Count for the frequency capping" toggles, with tooltips | ✅ Full | Toggles (`create/page.tsx:3516-3546`) saved as `ignoreFrequencyCap`/`countForFrequencyCap` and enforced for SMS and push (`deliveryService.ts:79-100,431-457`), counting sent promotional messages in the rolling window from Settings > Project | Parity. The helper text "Currently set as 1 SMS in 1 day in settings" is hard-coded (`create/page.tsx:3524`); the real SMS default is 3 per 7 days (`deliveryService.ts:394-399`). | — | — |
| Step 3: Goals and delivery controls | Request limit (requests per minute) | "Limit to N requests per minute" (60,000 for SMS and 100,000 for push by default) | ✅ Full | Optional "Request limit" (`create/page.tsx:3548-3555`) that throttles `processCampaign` (`campaignService.ts:801-868`, `nextCampaignChunkSize` at `campaignService.ts:1079-1099`) | Parity on the setting; see the throughput row for the real ceiling. | — | — |
| Step 3: Goals and delivery controls | Delivery throughput | Platform maximum of 200,000 rpm; MoEngage may speed a campaign up to finish within 120 minutes | 🟡 Partial | Every SMS, push and WhatsApp send goes through one BullMQ `delivery` queue limited to 50 jobs per second for the whole platform (`deliveryWorker.ts:32-39`), about 3,000 a minute shared by all tenants. Jobs carry no priority (`deliveryService.ts:69,116`), so flow and transactional sends wait behind a large blast. Staging runs 3 campaigns at once with 10 parallel sends each (`campaignWorker.ts:17`, `campaignService.ts:39`) | Per-provider and per-tenant rate limits instead of one global cap, priority for transactional and flow sends, more workers, and batch provider APIs (FCM multicast, bulk SMS) to reach 50,000+ a minute. | P1 | M |
| Step 3: Goals and delivery controls | DND / quiet hours and "Ignore DND settings" | "Ignore DND settings" on event-, device- and location-triggered SMS and push; DND hours are respected unless it is ticked | ❌ Missing | No quiet-hours code. The pipeline comment lists quiet hours (`deliveryService.ts:27`), but the gates are consent → cap → reachability → plan → queue (`deliveryService.ts:79-121`); searched quietHours, quiet_hours, DND, sendWindow | Project quiet hours in each recipient's local time (India also restricts promotional SMS to daytime) that delay sends rather than drop them, with an "Ignore DND" override for transactional campaigns and flows. | P1 | M |
| Step 3: Goals and delivery controls | All-users safety warning before publishing | When the audience is All users, a warning ("…every single contact") with "Fix warning" above Publish | 🟡 Partial | No warning in step 3 (`create/page.tsx:3163-3559`). The Send Now banner says "This will send to {segmentName ?? 'the selected segment'} immediately" (`[id]/page.tsx:261-266`): it reads "the selected segment" even for All users and shows no count | Show the audience size and an All-users warning at the end of step 3 and on Send Now, with a link back to step 1. | P2 | S |
| Step 3: Push advanced | Push expiry and inbox removal | "Expire notifications after" 36 Hour(s) or Minute(s); "Remove notifications from inbox after" 30 Days or Hour(s) | ❌ Missing | No `android.ttl`, `apns-expiration` or webpush TTL (`fcmProvider.ts:116-143`); Storees has no app inbox | A per-campaign TTL so an expired offer is not delivered late. Inbox removal matters only with an app inbox. | P2 | S |
| Step 3: Push advanced | Push priority, APNS priority, interruption level and relevance score | "Send at priority" (Android); APNS Priority 10, 5 or 1; Interruption Level Active, Passive, Time-sensitive or Critical; Relevance Score 0-1 | ❌ Missing | No `android.priority`, `apns-priority`, `interruption-level` or `relevance-score` in `fcmProvider.ts` (searched ttl, priority, interruption, relevance in the providers) | An Advanced section mapped to `android.priority` and the APNs headers and `aps` fields. Server-side only. | P3 | S |
| Triggered campaigns | Event-triggered SMS and push | Trigger (Has Executed event + Filter), then Immediately or With Delay; audience evaluated in real time; global and campaign control groups | 🟡 Partial | Not a campaign type: the card is "Soon" (`campaigns/page.tsx:68`) and `CampaignDeliveryType` lacks it (`types.ts:174`). Flows cover it: event trigger with property and audience filters (`types.ts:588-602`, `triggerWorker.ts:91-118`), delay and condition nodes, SMS and Push send nodes (`SendNodeConfigModal.tsx:21-22`, `flowExecutor.ts:756-805`), a goal event and an A/B split node that can act as a control branch. Flow SMS and push need a library template, and push templates have no title field (`templates/create/page.tsx:225-241`), so flow pushes are titled "Notification" (`fcmProvider.ts:99`) | Make the "Event Triggered" card create a one-message flow, add a title to push templates, and give flows campaign-style revenue goals and holdout reporting. | P2 | M |
| Triggered campaigns | Trigger logic: alternate and secondary events, delay relative to an action | Primary trigger event(s) with "+ alternate trigger event" (OR) and "+ secondary trigger event"; With Delay N units After or Before an action, all within the delay | 🟡 Partial | One trigger event per flow (`TriggerConfig.event`, `types.ts:588-602`). A condition node ("event_occurred" since the trip started) can stand in for a secondary action. No OR triggers and no "Before" timing | Several trigger events joined by OR, an "A then B within X" trigger, and delays measured from an event or date attribute, including "before". | P2 | M |
| Triggered campaigns | Merlin intelligent delay optimisation | Merlin picks each user's trigger delay from click rates, between a minimum and maximum (30 minutes to 30 days) | ❌ Missing | Flow delays are fixed values (`DelayNode`, `types.ts:637-641`); no optimisation (searched intelligent delay) | A per-user delay based on engagement history (`sendTimeService.ts` could be reused), kept within set bounds. | P3 | L |
| Triggered campaigns | Active window (start and end date) | "Active continuously" with a start and end date-time (one year by default) in the campaign time zone | 🟡 Partial | Flows are switched on or paused by hand (`flows.status`, `schema.ts:325-345`); no scheduled start or end | Optional start and end times on flows (and future event-triggered campaigns), enforced by the trigger worker. | P2 | S |
| Triggered campaigns | Minimum delay between two messages | Minimum gap between two messages from the same campaign (push defaults to 15 hours; SMS 0 means off) | ❌ Missing | Only channel-wide marketing caps (`deliveryService.ts:431-457`) and one active trip per customer per flow (`triggerWorker.ts:121-136`); a customer can re-enter as soon as a trip ends (searched cooldown, reentry) | A re-entry cooldown per flow (and per future event-triggered campaign). | P2 | S |
| Triggered campaigns | Send to originating device only | Event-triggered push option: send only to the device where the event happened | ➖ N/A | Needs per-device event attribution from an app SDK. Storees has none and keeps one `fcm_token` per customer (`fcmProvider.ts:93-96`) | Revisit with an app SDK and a device-token table. | — | — |
| Triggered campaigns | Device-triggered push | Android/iOS push evaluated on the device by the SDK: maximum shows, minimum delay in minutes, sync-data expiry, offline mode, Ignore DND and FC; global control group only | ➖ N/A | Evaluating rules on the device needs a native SDK; `packages/sdk` and `packages/sdk-react` are browser-only. The card is shown greyed out as "Soon" (`campaigns/page.tsx:69`) | Cannot be built without an app SDK. Remove the "Soon" card until then. | — | — |
| Triggered campaigns | Location-triggered push (geofences) | Geofences (enter, exit or dwell), responsiveness, map search, latitude/longitude/radius; ASAP only within time bounds, at most N sends in N hours, Ignore DND/FC, expiry | ➖ N/A | Geofencing runs in a native SDK with location permission; Storees has no app SDK and no location-trigger code | Out of scope for a product with only a browser SDK. | — | — |
| Governance | Approval workflow, teams and AI decisioning | Found in builder state but not shown in this workspace: approval flow, team assignment, "AI Campaign Decisioning" delivery strategy, max sends, waterfall segments | ❌ Missing | No approval, review or team tables or routes (searched approval, approver, team in schema and routes); roles gate screens and data only (`schema.ts:1078`). No delivery-strategy or waterfall options | Draft → review → approve with approver roles (enterprise); channel waterfalls and AI decisioning later. | P3 | L |

### Storees-only strengths

- **Audience reachability breakdown before sending.** Step 1's Audience preview (`create/page.tsx:1427-1485` → `routes/campaigns.ts:301-347` → `campaignService.ts:172-405`) shows candidates, reachable, deliverable, recipients, suppressed, opted out, category-blocked, 24h-window-blocked, frequency-capped and held-out counts, and explains a zero result in plain words; MoEngage's "Show count" gives one number. Caveats: opt-outs and suppressions are counted for email only, and the saved-segment card's 90% "reachable" figure is hard-coded (`create/page.tsx:1048`).
- **Promotional vs Transactional switch.** One choice lets order or OTP-style SMS and push skip the marketing cap and promotional consent (`create/page.tsx:1109-1143`, `deliveryService.ts:79-100`); MoEngage's builder relies on the per-campaign "Ignore frequency capping" toggle.
- **Audience cap.** "Send to the first N" for staged rollouts or SMS cost control, enforced at staging (`create/page.tsx:1331-1369`, `campaignService.ts:493-518`). MoEngage has `maxSends` only in hidden builder state.
- **Control-group lift per goal on the campaign page.** A deterministic holdout and a lift card per goal with an Any / View-through / Click-through switch (`campaignService.ts:65-70,676-699`, `campaignAnalyticsService.ts:225-304`, `[id]/page.tsx:531-619`). Caveat: View- and Click-through are always empty for SMS (no opens or clicks recorded).
- **Recommendations and social proof inside SMS/push copy.** Decision-engine variables (recommended product name or price, "N people bought this") resolve per recipient with no code (`types.ts:1094-1111`, `campaignService.ts:926-929`, `VariablePanel.tsx:473-481`). Caveat: today only push delivers them, because SMS bodies arrive empty.
- **Value formats and blocking variable checks at save.** Money, date, case formats per token (`types.ts:1113-1120`), and saving is blocked when a `{{token}}` has no mapping (`routes/campaigns.ts:194-206`).
- **"Best time for user" send option.** Sends at each recipient's most frequent open hour, falling back to the project's best hour and then 10:00 (`create/page.tsx:3356`, `campaignService.ts:1133-1137`, `sendTimeService.ts:15-95`). MoEngage showed no best-time option in this workspace. Caveats: the hour is in UTC, it is based on recorded opens (none for SMS), and it schedules within the 24 hours after the anchor.
- **A different push image per recipient.** `{{recipient_image:key}}` in the push Image URL pulls an image from customer attributes (`create/page.tsx:2832`, `campaignService.ts:1026-1031`); single-content mode only.
- **Delivery log with block reasons.** `/logs` (`routes/logs.ts:50-137`, `app/(dashboard)/logs/page.tsx`) and the campaign Recipients tab (`campaignService.ts:1048-1066`) say, message by message, why an SMS or push did not go (consent, frequency cap, unreachable, trial limit, provider error).
- **Retry failed recipients.** "Retry N Failed" re-queues only failed sends (`[id]/page.tsx:243-257` → `routes/campaigns.ts:817-851`), so people who already received the message are not messaged twice. Caveat: the route does not check that the campaign belongs to the caller's project (see Verification notes).

### UX notes

- **Platform choice** (screens 006-007). MoEngage asks for Target Platforms in step 1, beside the audience, and shows a setup error with a "here" link for each unconfigured platform. Storees puts Android/iOS/Web buttons in step 2 and nudges users to pick one ("Pick at least one platform above…", `MultiPlatformPushBlock.tsx:201-204`). Those buttons change neither the audience nor the FCM payload, and picking one hides "Notification Title" (`create/page.tsx:2808`), so the recommended path sends untitled pushes. Move platforms to step 1 and make the per-platform tabs the only push editor, dropping the separate "Push Message" box (`create/page.tsx:2837-2865`).
- **Live preview** (015, 020, 031). MoEngage's content step has two columns: a sticky phone mock-up that updates as you type, an "N Character(s), N SMS" counter under it, and a Default/Personalized switch. Storees shows its preview only after the body has text, below the AI, template and link-tracking cards, and fills real data only after "Render data" (`create/page.tsx:2928-2988`). Copy the sticky right-hand preview with a Unicode-aware counter (Hindi or emoji = 70 characters per SMS).
- **A/B as tabs** (020). MoEngage shows variations as tabs above one editor (Variation 1 (50%) | Variation 2 (50%) | + Variation) with a User Distribution drawer, so every variant gets the full editor and preview. Storees has a separate A/B card at the bottom with only a "Message Body (B)" box, no push title for B and no preview (`create/page.tsx:2995-3156`). Adopt tabs when the send path is fixed.
- **Personalisation** (024). In MoEngage, "@" in any field opens one drawer with every data source and explicit fallbacks (No fallback / Do not send / Replace text). Storees' Variables card supports more source types (product, event, recommendations) but sits below the editor and is driven by typed `{{tokens}}`; unknown tokens are quietly mapped to Customer > Name (`VariablePanel.tsx:473-512`), so the SMS placeholder's `{{order_id}}` (`create/page.tsx:2850,2856`) would print the customer's name. Add an insert button on each field, flag unmapped tokens instead of guessing, and drop `{{order_id}}` from campaign hints.
- **Scheduling** (038-041, 052-058, 111). MoEngage step 3 lists send modes on the left and details on the right: campaign time zone with UTC offset, "At fixed time / Send in user time zone" as a sub-choice, a start date for periodic sends, and a server-computed "Campaign will be next sent on …" line. Storees puts four radios in a row (`create/page.tsx:3351-3366`), offers 10 zones that fixed sends ignore, has a "User's timezone" option that in practice delays everyone by a day, has no periodic start date, and shows a schedule summary whose send time and end date the scheduler never reads. Copy the layout and the server-computed next-send line, and fix the engine first.
- **Publishing** (044). MoEngage ends on "Publish", with an All-users warning that links to "Fix warning". Storees' last button, "Create Campaign", only saves an ASAP campaign as a draft; sending needs a second "Send Now" on the detail page, whose banner says "the selected segment" even for All users (`[id]/page.tsx:261-266`). Show the recipient count and an All-users warning at the end of step 3, and offer "Create and send".
- **Setup checks** (006, 008-010, 014). MoEngage shows a red "No SMS connector found" banner and per-platform push errors, explains why Next is blocked and marks the failing step. Storees checks the provider only for WhatsApp (`create/page.tsx:2318-2335`); SMS and push campaigns can be built and sent with no provider and then fail one recipient at a time, or quietly go through the platform's own Twilio or Firebase account. Next is disabled without saying why, and the stepper lets you skip ahead (`create/page.tsx:721`). Add a provider banner and inline step errors.
- **Test send** (033, 109, 110). MoEngage keeps a "Test Campaign" card at the bottom of step 2: identifier type, value, Test, and an option to reuse the preview sample. Storees has no SMS or push test; the only tests are "Test Email" (a browser prompt on the detail page) and the WhatsApp test-send in step 2. Add the same card to step 2 for every channel.
- **Delivery types** (001-005). MoEngage lists different delivery types per channel (five for push, three for SMS), each with a hover description. Storees shows the same four cards for every channel and greys out "Event Triggered" and "Device Triggered" as "Soon" (`campaigns/page.tsx:65-70`), although event-triggered SMS and push already work in Flows. Point Event Triggered at a flow template and hide Device Triggered.
- **Where Storees is ahead** (vs 007's "Show count"). The Audience preview breaks the audience into candidates, reachable, deliverable, suppressed, opted out, category-blocked, frequency-capped and held-out users and explains a zero result (`create/page.tsx:1427-1485`); MoEngage's "Show count" gives a single number. Fix its two flaws (email-only opt-out counts, the hard-coded 90% on the segment card) to keep the lead.
- **Step 1 traps to remove before demos.** "Send to: Dealer / Customer + Dealer" is offered for SMS and push (`create/page.tsx:1145-1175`), but every dealer send on those channels is blocked (`deliveryService.ts:52-61`). Picking any Subscription category blocks every recipient, because no code writes `customer_subscriptions` rows (only migration `0026` creates the table). Excluding by a field such as City silently drops everyone whose value is empty. The Delivery Controls text "Currently set as 1 SMS in 1 day" is hard-coded (`create/page.tsx:3524`), while the real SMS default is 3 per 7 days (`deliveryService.ts:394-399`).

### Verification notes

Every row was re-checked against the code at `2063cdc`. Rows changed:

- **Target audience: ✅ Full → 🟡 Partial (tracked in module 01).** The row lists User affinity and Custom segment among MoEngage's filter families; module 01 found no affinity rule, no segment-as-filter block and the empty-audience fallback to every customer (P0 there). Same treatment as module 02.
- **Exclude users: ✅ Full → 🟡 Partial (P2, S).** The exclusion is applied as `NOT (filter)` (`campaignService.ts:206,520`), and attribute rules compile to plain comparisons (`evaluator.ts:878-900`). For a customer whose field is NULL, the comparison is NULL and `NOT (NULL)` is NULL, so the row is dropped: excluding "City is Pune" also removes every customer with no city, and any custom-attribute rule removes everyone without that attribute. `is_not` already uses `IS DISTINCT FROM`, so the two directions disagree. Affects email campaigns too.
- **Conversion goals and attribution window: ✅ Full → 🟡 Partial (P2, S).** The configuration matches, but the default "Any" pool is every staged `campaign_sends` row, including failed and blocked sends (`campaignAnalyticsService.ts:144`), and the window starts when the whole run finished (`sentAt`, lines 135-137), not at each send; the UI label says "from the time the SMS is opened". SMS records no opens or clicks, so the stricter attribution modes are empty. With the empty-body defect, an SMS campaign reports conversions from people who received nothing.
- **Show count: ⭐ kept, priority none → P2 S.** The engine is real, but the 90% segment figure is hard-coded, and SMS/push opt-outs, suppressions and token-less push subscribers are not reflected. Matches module 01.
- **Mobile-number attribute picker: effort S → M.** The number is read in staging, preview, reachability and four provider `resolveBody` helpers. Matches module 02's equivalent email-address row.

Evidence and gap corrections (status and priority unchanged):

- **Setup check, SMS:** with no project config, `getChannelProvider` first borrows the platform's `TWILIO_*` env account (`channelProviderRegistry.ts:216-221`), so unconfigured tenants may silently send through, and be billed to, the platform's Twilio number. Only when that is unset does the legacy fallback run, and it tries the generic Pinnacle stub (`pinnacleProvider.ts`, when `PINNACLE_API_URL` is set) before Resend.
- **Setup check, push:** the same env fallback applies with `FCM_PROJECT_ID` (`channelProviderRegistry.ts:237-242`).
- **Send in user time zone:** beyond the round-trip conversion, a scheduler-started campaign is pushed exactly 24 h past the anchor for every recipient. Confirmed by running the exact `nextLocalDateTime` code in a scratch script for four zones.
- **Merlin AI copy generation:** the "existing variant" option does exist (the AI Copywriter card rewrites the current copy). The real gap is that the card's Generate button is enabled with only a use case while the API returns "Subject or body is required" for an empty draft.
- **Automatic exclusion of opted-out users:** an SMS opt-out row can be written, but only through the admin-only `POST /api/consent/:customerId`, which no screen calls. Shopify SMS consent is stored as `sms_subscribed` and never read at send. A manual "SMS Subscribed is true" audience rule is the interim workaround.
- **Event-triggered SMS and push:** flows already have a goal event and an A/B split node that can serve as a control branch; the remaining gap is revenue goals and holdout reporting.
- **Delivery throughput:** added that delivery jobs carry no priority, so transactional and flow sends queue behind a large campaign.
- **User distribution:** added that the winner is always judged on open rate, so SMS tests always read "tie".
- **Push title and summary:** FCM's Android notification has no summary field, so the summary needs app-side rendering from `data`.
- **Character counter:** added that UTM parameters are appended after the count.
- **DLT:** the Gupshup provider config has only a user ID and password: no header (sender ID) or PE ID.
- **Storees-only list:** caveats added for recommendations (push only today), Best time (UTC, open-based, anchored), the audience preview and Retry (no project check).

Confirmed unchanged after trying to refute them:

- **The five P0 rows.** The blank SMS body was traced UI → route → service → providers (`create/page.tsx:611` → `campaignService.ts:1027-1039` → each provider's `resolveBody`). `pushContent`/`pushPlatforms` are referenced only by `schema.ts` and `routes/campaigns.ts`. The FCM payload has no link, `webpush` block or `channel_id`. No DLT fields exist under any spelling tried. No SMS or push test endpoint exists (searched test-send, test-sms, test-push, sendTest).
- **The ❌ Missing rows** were searched under synonyms across frontend, backend (routes, services, workers, schema, migrations), shared, segments, flows and the SDKs: quiet hours / DND / send window; cooldown / re-entry; coupon / discount / price_rule / code_redemption; content block / snippet; locale / language; Jinja / Liquid / Handlebars / Nunjucks; emoji picker; image generation; precompute; ttl / priority / interruption / relevance / collapse_key / content-available; approval / approver / team; global or universal holdout.
- **The ✅ Full rows** were traced UI → route → engine: campaign control group, both frequency-cap toggles, request limit, Send Now, variable mapping and both AI copy endpoints (each calls the configured LLM).
- **The ➖ N/A rows** hold: the repo has no native mobile SDK (`packages/` holds only the browser `sdk` and `sdk-react`) and no geofence or location code.

Seen along the way:

- **Cross-project send and retry.** `POST /api/campaigns/:id/send` and `/:id/retry` check the caller's access to the `projectId` they pass, but never that the campaign belongs to that project (`routes/campaigns.ts:660-681,817-851`; `dispatchCampaign` loads by id only, `campaignService.ts:451-458`). A member of one project who has another project's campaign id can dispatch or retry it.
- **Fintech default flows cannot send their SMS and push steps.** Their nodes reference template names (`emi_overdue_sms`, `kyc_reverification_push`, `dormant_reactivation_push`; `flows/src/templates.ts:188-189,247-248,296-297`), `instantiateDefaultFlows` creates only the email template (`flowService.ts:104-112`), and the providers look templates up by UUID (`twilioProvider.ts:9`, `fcmProvider.ts:89-91`), which Postgres rejects as an invalid UUID, so each send fails.
- **Flow SMS and push ignore the node's UTM settings for links in the text.** UTM is applied only to WhatsApp tracked buttons (`deliveryService.ts:271-310`).

### Screens

#### New Campaign modal: Push delivery types (hover descriptions)

![Push One Time: 'Send message to your target audience now or at scheduled time'](../screenshots/03-builder-push-sms-001-push-onetime-hover-description.jpg)
*Push One Time: 'Send message to your target audience now or at scheduled time'*

![Push Periodic: 'Send message to your target audience on a recurring basis'](../screenshots/03-builder-push-sms-002-push-periodic-hover-description.jpg)
*Push Periodic: 'Send message to your target audience on a recurring basis'*

![Push Event Triggered: triggered by a user action event tracked on app or server](../screenshots/03-builder-push-sms-003-push-event-triggered-hover-description.jpg)
*Push Event Triggered: triggered by a user action event tracked on app or server*

![Push Device Triggered: 'triggered locally based on any activity on device'](../screenshots/03-builder-push-sms-004-push-device-triggered-hover-description.jpg)
*Push Device Triggered: 'triggered locally based on any activity on device'*

![Push Location Triggered: sent when users reach a specific location](../screenshots/03-builder-push-sms-005-push-location-triggered-hover-description.jpg)
*Push Location Triggered: sent when users reach a specific location*

#### Push One Time, Step 1: Target users (blocked, push not configured)

![All 3 platforms ticked. iOS provisional push options plus red errors: no GCM/FCM Server Key, no APNS Certificate, Web push settings not configured](../screenshots/03-builder-push-sms-006-push-onetime-step1-platforms-config-errors.jpg)
*All 3 platforms ticked. iOS provisional push options plus red errors: no GCM/FCM Server Key, no APNS Certificate, Web push settings not configured*

![All users selected, Exclude Users, opt-out note, Show count, Global/Campaign control group toggles, Next](../screenshots/03-builder-push-sms-007-push-onetime-step1-all-users-control-groups.jpg)
*All users selected, Exclude Users, opt-out note, Show count, Global/Campaign control group toggles, Next*

![Next refused with toast 'Some values highlighted above are missing or incorrect. Please fix these errors before moving to next step.'](../screenshots/03-builder-push-sms-008-push-next-blocked-toast.jpg)
*Next refused with toast 'Some values highlighted above are missing or incorrect. Please fix these errors before moving to next step.'*

![Step 1 shows an error icon. Clicking the Content step gives 'Step 1 has some errors, as highlighted above. Please fix them to move to other steps.'](../screenshots/03-builder-push-sms-009-push-step1-error-state-stepper.jpg)
*Step 1 shows an error icon. Clicking the Content step gives 'Step 1 has some errors, as highlighted above. Please fix them to move to other steps.'*

#### SMS One Time, Step 1: Target users (blocked, no SMS connector)

![SMS One Time step 1 with the 'No SMS connector found' banner](../screenshots/03-builder-push-sms-010-sms-onetime-step1-no-connector-banner.jpg)
*SMS One Time step 1 with the 'No SMS connector found' banner*

![Mobile-number attribute picker: searchable list of all user attributes](../screenshots/03-builder-push-sms-011-sms-step1-mobile-number-attribute-dropdown.jpg)
*Mobile-number attribute picker: searchable list of all user attributes*

![Tooltip: 'You can automatically exclude opted-out users from the campaigns'](../screenshots/03-builder-push-sms-012-sms-step1-optout-tooltip.jpg)
*Tooltip: 'You can automatically exclude opted-out users from the campaigns'*

![All users selected, Show count, Enable control groups, Next](../screenshots/03-builder-push-sms-013-sms-step1-bottom-control-groups.jpg)
*All users selected, Show count, Enable control groups, Next*

![After Next, step 1 turns red (error) because no SMS connector exists. The builder does not advance.](../screenshots/03-builder-push-sms-014-sms-step1-error-state-after-next.jpg)
*After Next, step 1 turns red (error) because no SMS connector exists. The builder does not advance.*

#### SMS One Time, Step 2: Content (forced)

![SMS Content step: SMS sender (required), Template ID, Message (required), Shorten and track URL(s), phone preview](../screenshots/03-builder-push-sms-015-sms-content-step-top.jpg)
*SMS Content step: SMS sender (required), Template ID, Message (required), Shorten and track URL(s), phone preview*

![SMS sender connector dropdown is empty: 'Your search did not match anything'](../screenshots/03-builder-push-sms-016-sms-sender-connector-dropdown-empty.jpg)
*SMS sender connector dropdown is empty: 'Your search did not match anything'*

![Template ID tooltip: mandatory under India's DLT regulations; check whether your provider needs it](../screenshots/03-builder-push-sms-017-sms-template-id-dlt-tooltip.jpg)
*Template ID tooltip: mandatory under India's DLT regulations; check whether your provider needs it*

![Tooltip: tracking URL shortened to 30-35 characters by MoEngage. Custom domain via settings. UTM only added to shortened links.](../screenshots/03-builder-push-sms-018-sms-shorten-track-url-tooltip.jpg)
*Tooltip: tracking URL shortened to 30-35 characters by MoEngage. Custom domain via settings. UTM only added to shortened links.*

![+ A/B test menu: Copy Variation, + New Variation](../screenshots/03-builder-push-sms-019-sms-ab-test-menu.jpg)
*+ A/B test menu: Copy Variation, + New Variation*

![Variation 1 (50%), Variation 2 (50%) tabs, + Variation, User Distribution. Sender is disabled in non-default variations.](../screenshots/03-builder-push-sms-020-sms-variation-tabs-user-distribution.jpg)
*Variation 1 (50%), Variation 2 (50%) tabs, + Variation, User Distribution. Sender is disabled in non-default variations.*

![User distribution drawer, Manual: per-variation %, Reset distribution, + Campaign control group, previews](../screenshots/03-builder-push-sms-021-sms-user-distribution-manual.jpg)
*User distribution drawer, Manual: per-variation %, Reset distribution, + Campaign control group, previews*

![Dynamically using Merlin AI: distribution based on CTR, campaign sent over 60 minutes to optimise](../screenshots/03-builder-push-sms-022-sms-user-distribution-merlin-ctr.jpg)
*Dynamically using Merlin AI: distribution based on CTR, campaign sent over 60 minutes to optimise*

![+ Locale menu: search, no locales, '+ New Locale' with Add](../screenshots/03-builder-push-sms-023-sms-locale-menu-empty.jpg)
*+ Locale menu: search, no locales, '+ New Locale' with Add*

![Typing @ opens the SMS Personalization drawer. Tabs: Data personalization, Content blocks, Aux data, Coupons, Conditional (New), Custom (New).](../screenshots/03-builder-push-sms-024-sms-personalization-drawer-data-tab.jpg)
*Typing @ opens the SMS Personalization drawer. Tabs: Data personalization, Content blocks, Aux data, Coupons, Conditional (New), Custom (New).*

![Attribute picker grouped under UserAttribute (First Seen, Last Seen, LTV, ...)](../screenshots/03-builder-push-sms-025-sms-personalization-attribute-list.jpg)
*Attribute picker grouped under UserAttribute (First Seen, Last Seen, LTV, ...)*

![Choose Fallback: No fallback / Do not send SMS / Replace text (Fallback text)](../screenshots/03-builder-push-sms-026-sms-personalization-fallback-options.jpg)
*Choose Fallback: No fallback / Do not send SMS / Replace text (Fallback text)*

![Content blocks tab: Select content block, 'Insert only the content of the content block' toggle](../screenshots/03-builder-push-sms-027-sms-personalization-content-blocks.jpg)
*Content blocks tab: Select content block, 'Insert only the content of the content block' toggle*

![Coupons tab: Select coupon list. Fallback: Do not send SMS / Use a fallback coupon.](../screenshots/03-builder-push-sms-028-sms-personalization-coupons-fallback.jpg)
*Coupons tab: Select coupon list. Fallback: Do not send SMS / Use a fallback coupon.*

![Conditional tab: Display name, If (User attribute) (attr), + Add condition, + Add Group condition, Then (@ text), Else fallback](../screenshots/03-builder-push-sms-029-sms-personalization-conditional.jpg)
*Conditional tab: Display name, If (User attribute) (attr), + Add condition, + Add Group condition, Then (@ text), Else fallback*

![Custom tab: Display name and a Jinja code editor. Footer: 'Create Jinja snippets using natural language with Merlin AI'.](../screenshots/03-builder-push-sms-030-sms-personalization-custom-jinja.jpg)
*Custom tab: Display name and a Jinja code editor. Footer: 'Create Jinja snippets using natural language with Merlin AI'.*

![Character/segment counter '1 Character(s), 1 SMS', Preview type Default/Personalized, UTM parameters](../screenshots/03-builder-push-sms-031-sms-char-counter-preview-type-utm.jpg)
*Character/segment counter '1 Character(s), 1 SMS', Preview type Default/Personalized, UTM parameters*

![UTM: utm_source=MoEngage, utm_medium={{Campaign Channel}}, utm_campaign={{Campaign Name}}, utm_term, utm_content. Test Campaign card.](../screenshots/03-builder-push-sms-032-sms-utm-params-test-campaign.jpg)
*UTM: utm_source=MoEngage, utm_medium={{Campaign Channel}}, utm_campaign={{Campaign Name}}, utm_term, utm_content. Test Campaign card.*

![Test by: Unique ID, Email ID, Mobile Number (Registered / External), GAID, IDFA, Custom Segment](../screenshots/03-builder-push-sms-033-sms-test-recipient-id-options.jpg)
*Test by: Unique ID, Email ID, Mobile Number (Registered / External), GAID, IDFA, Custom Segment*

![Test 'Locales and Variations' picker: Default > Variation 1, Variation 2](../screenshots/03-builder-push-sms-034-sms-test-locales-variations.jpg)
*Test 'Locales and Variations' picker: Default > Variation 1, Variation 2*

![Preview type Personalized: 'Showing preview for: (email id) = ...' with an edit pencil (email redacted)](../screenshots/03-builder-push-sms-035-sms-personalized-preview-type.jpg)
*Preview type Personalized: 'Showing preview for: (email id) = ...' with an edit pencil (email redacted)*

![Personalized preview drawer: Select user by, User identifier value, Fetch user data, Update preview (redacted)](../screenshots/03-builder-push-sms-036-sms-personalized-preview-user-picker.jpg)
*Personalized preview drawer: Select user by, User identifier value, Fetch user data, Update preview (redacted)*

![Select user by: ID, Email Id, Mobile Number, Google Advertising Identifier, IOS Advertising Identifier](../screenshots/03-builder-push-sms-037-sms-preview-select-user-by-options.jpg)
*Select user by: ID, Email Id, Mobile Number, Google Advertising Identifier, IOS Advertising Identifier*

#### SMS One Time, Step 3: Schedule and goals (forced)

![At specific date and time: time zone, fixed time vs user time zone, start date/time](../screenshots/03-builder-push-sms-038-sms-schedule-specific-date-time.jpg)
*At specific date and time: time zone, fixed time vs user time zone, start date/time*

![As soon as possible: 'The campaign will go out as soon as possible'](../screenshots/03-builder-push-sms-039-sms-schedule-send-now-asap.jpg)
*As soon as possible: 'The campaign will go out as soon as possible'*

![Send in user time zone tooltip: sent per the recipient's time zone](../screenshots/03-builder-push-sms-040-sms-schedule-user-timezone-tooltip.jpg)
*Send in user time zone tooltip: sent per the recipient's time zone*

![Campaign time zone: searchable IANA list](../screenshots/03-builder-push-sms-041-sms-schedule-campaign-timezone-dropdown.jpg)
*Campaign time zone: searchable IANA list*

![Conversion goals tooltip: track up to 5 conversion goals](../screenshots/03-builder-push-sms-042-sms-conversion-goals-tooltip.jpg)
*Conversion goals tooltip: track up to 5 conversion goals*

![Goal 1: Goal name, Event name, + New attribute, Revenue performance toggle](../screenshots/03-builder-push-sms-043-sms-new-goal-row.jpg)
*Goal 1: Goal name, Event name, + New attribute, Revenue performance toggle*

![Track goals for 36 Hours from send/delivery, Delivery controls, Request limit 60000 rpm, All-users warning, Publish](../screenshots/03-builder-push-sms-044-sms-goals-attribution-delivery-controls-publish.jpg)
*Track goals for 36 Hours from send/delivery, Delivery controls, Request limit 60000 rpm, All-users warning, Publish*

![Attribution window tooltip: maximum time after the user received/clicked the SMS during which a goal is tracked](../screenshots/03-builder-push-sms-045-sms-track-goals-for-tooltip.jpg)
*Attribution window tooltip: maximum time after the user received/clicked the SMS during which a goal is tracked*

![Ignore frequency capping tooltip](../screenshots/03-builder-push-sms-046-sms-ignore-frequency-capping-tooltip.jpg)
*Ignore frequency capping tooltip*

![Count for the frequency capping tooltip: count this SMS toward FC](../screenshots/03-builder-push-sms-047-sms-count-for-frequency-capping-tooltip.jpg)
*Count for the frequency capping tooltip: count this SMS toward FC*

![Request limit tooltip: maximum throughput 200,000 rpm; parallel campaigns may be delayed](../screenshots/03-builder-push-sms-048-sms-request-limit-throughput-tooltip.jpg)
*Request limit tooltip: maximum throughput 200,000 rpm; parallel campaigns may be delayed*

![Attribution window units: Hours, Days](../screenshots/03-builder-push-sms-049-sms-attribution-window-units.jpg)
*Attribution window units: Hours, Days*

![Goal event dropdown is empty (no events, because the SDK integration is pending)](../screenshots/03-builder-push-sms-050-sms-goal-event-dropdown-empty.jpg)
*Goal event dropdown is empty (no events, because the SDK integration is pending)*

#### SMS Periodic (step 1, forced step 3)

![SMS (Periodic) step 1 with the no-connector banner](../screenshots/03-builder-push-sms-051-sms-periodic-step1-top.jpg)
*SMS (Periodic) step 1 with the no-connector banner*

![Send daily: Repeat every N days, Ends Never/On/After, next-send preview](../screenshots/03-builder-push-sms-052-sms-periodic-schedule-daily.jpg)
*Send daily: Repeat every N days, Ends Never/On/After, next-send preview*

![Send weekly: Repeat every N weeks, Repeat on S M T W T F S](../screenshots/03-builder-push-sms-053-sms-periodic-schedule-weekly.jpg)
*Send weekly: Repeat every N weeks, Repeat on S M T W T F S*

![Send monthly: Repeat on Days of month (1-31 grid)](../screenshots/03-builder-push-sms-054-sms-periodic-monthly-days-of-month.jpg)
*Send monthly: Repeat on Days of month (1-31 grid)*

![Monthly, Days of week: (ordinal) (weekday) of the month, + Add](../screenshots/03-builder-push-sms-055-sms-periodic-monthly-days-of-week.jpg)
*Monthly, Days of week: (ordinal) (weekday) of the month, + Add*

![Ordinal options: First, Second, Third, Fourth, Last](../screenshots/03-builder-push-sms-056-sms-periodic-week-ordinal-options.jpg)
*Ordinal options: First, Second, Third, Fourth, Last*

![Ends On: End date picker](../screenshots/03-builder-push-sms-057-sms-periodic-ends-on-end-date.jpg)
*Ends On: End date picker*

![Ends After: N occurrences](../screenshots/03-builder-push-sms-058-sms-periodic-ends-after-occurrences.jpg)
*Ends After: N occurrences*

![Periodic bottom: Conversion goals, Delivery controls, Request limit, Publish](../screenshots/03-builder-push-sms-059-sms-periodic-goals-delivery-controls.jpg)
*Periodic bottom: Conversion goals, Delivery controls, Request limit, Publish*

#### SMS Event Triggered (step 1, forced steps 2-3)

![SMS (Event Triggered) step 1: Trigger criteria and the THEN Immediately/With Delay block](../screenshots/03-builder-push-sms-060-sms-event-trigger-step1-trigger-criteria.jpg)
*SMS (Event Triggered) step 1: Trigger criteria and the THEN Immediately/With Delay block*

![Audience section: 'Campaign segments will be evaluated in real-time on the latest data'](../screenshots/03-builder-push-sms-061-sms-event-trigger-step1-audience-realtime-note.jpg)
*Audience section: 'Campaign segments will be evaluated in real-time on the latest data'*

![Step 3: Active continuously, start/end date-time, goals, Minimum delay between two messages](../screenshots/03-builder-push-sms-062-sms-event-trigger-schedule-active-continuously.jpg)
*Step 3: Active continuously, start/end date-time, goals, Minimum delay between two messages*

![Ignore DND settings tooltip: SMS may be delivered during DND hours](../screenshots/03-builder-push-sms-063-sms-event-trigger-delivery-controls-dnd-tooltip.jpg)
*Ignore DND settings tooltip: SMS may be delivered during DND hours*

![Event-triggered SMS content step: identical to One Time](../screenshots/03-builder-push-sms-064-sms-event-trigger-content-step.jpg)
*Event-triggered SMS content step: identical to One Time*

#### Push One Time, Step 2: template gallery and Android editor (forced)

![Template gallery: Basic notification, Stylized basic, Simple image carousel, Image banner with text overlay, Timer, Timer with progress bar, Background update (New)](../screenshots/03-builder-push-sms-065-push-content-template-gallery.jpg)
*Template gallery: Basic notification, Stylized basic, Simple image carousel, Image banner with text overlay, Timer, Timer with progress bar, Background update (New)*

![Background update tooltip: 'Read more about Background update here'](../screenshots/03-builder-push-sms-066-push-template-background-update-tooltip.jpg)
*Background update tooltip: 'Read more about Background update here'*

![GIF badge tooltip: 'This template supports addition of GIF media'](../screenshots/03-builder-push-sms-067-push-template-gif-badge-tooltip.jpg)
*GIF badge tooltip: 'This template supports addition of GIF media'*

![Android editor: Merlin AI banner, Notification channel, Message title, Message and summary, live preview](../screenshots/03-builder-push-sms-068-push-android-editor-top.jpg)
*Android editor: Merlin AI banner, Notification channel, Message title, Message and summary, live preview*

![Template menu: Change template, Reset template](../screenshots/03-builder-push-sms-069-push-template-change-reset-menu.jpg)
*Template menu: Change template, Reset template*

![Notification channel tooltip: channel importance from silent (None) to Urgent](../screenshots/03-builder-push-sms-070-push-notification-channel-tooltip.jpg)
*Notification channel tooltip: channel importance from silent (None) to Urgent*

![Notification channel: general (High), Manage notification channel](../screenshots/03-builder-push-sms-071-push-notification-channel-dropdown.jpg)
*Notification channel: general (High), Manage notification channel*

![Generate content using Merlin AI: use case, keywords, audience, tone, style, language, attribute, coupon, emoji. Quota 0/1000 msgs, 0/100 images.](../screenshots/03-builder-push-sms-072-push-merlin-generate-content-drawer.jpg)
*Generate content using Merlin AI: use case, keywords, audience, tone, style, language, attribute, coupon, emoji. Quota 0/1000 msgs, 0/100 images.*

![Merlin drawer with Generate image turned on: Image description; preview shows an image slot](../screenshots/03-builder-push-sms-073-push-merlin-generate-image-option.jpg)
*Merlin drawer with Generate image turned on: Image description; preview shows an image slot*

![Emoji picker with categories and search](../screenshots/03-builder-push-sms-074-push-emoji-picker.jpg)
*Emoji picker with categories and search*

![Push Personalization drawer. Fallback: No fallback / Do not send Push / Replace text.](../screenshots/03-builder-push-sms-075-push-personalization-drawer.jpg)
*Push Personalization drawer. Fallback: No fallback / Do not send Push / Replace text.*

![Rich media: Use GIF for Android 14+ (New); Image URL / Upload image / Merlin AI Designer; size and ratio guidance; Default click action](../screenshots/03-builder-push-sms-076-push-android-rich-media-click-action.jpg)
*Rich media: Use GIF for Android 14+ (New); Image URL / Upload image / Merlin AI Designer; size and ratio guidance; Default click action*

![Merlin AI Designer: 'Generate image using MerlinAI'](../screenshots/03-builder-push-sms-077-push-android-merlin-ai-designer-image.jpg)
*Merlin AI Designer: 'Generate image using MerlinAI'*

![GIF with image fallback: GIF URL / Upload GIF (max 500KB, 2:1); image used as fallback](../screenshots/03-builder-push-sms-078-push-android-gif-with-image-fallback.jpg)
*GIF with image fallback: GIF URL / Upload GIF (max 500KB, 2:1); image used as fallback*

![Default click action Deeplinking + URL, Key value pairs, Buttons and Advanced accordions](../screenshots/03-builder-push-sms-079-push-android-kv-buttons-advanced-collapsed.jpg)
*Default click action Deeplinking + URL, Key value pairs, Buttons and Advanced accordions*

![Default click action: Navigate to a screen, Deeplinking, Rich landing](../screenshots/03-builder-push-sms-080-push-default-click-action-options.jpg)
*Default click action: Navigate to a screen, Deeplinking, Rich landing*

![Navigate to a screen: 'Take user to a specific screen' selector](../screenshots/03-builder-push-sms-081-push-click-action-navigate-to-screen.jpg)
*Navigate to a screen: 'Take user to a specific screen' selector*

![Rich landing: 'Take user to Rich landing page' URL](../screenshots/03-builder-push-sms-082-push-click-action-rich-landing.jpg)
*Rich landing: 'Take user to Rich landing page' URL*

![KV pair row: key/value, '$' and '.' not allowed in key](../screenshots/03-builder-push-sms-083-push-key-value-pair-row.jpg)
*KV pair row: key/value, '$' and '.' not allowed in key*

![Button 1: Button name, Click action, URL, KV pairs, + Action button](../screenshots/03-builder-push-sms-084-push-action-button-fields.jpg)
*Button 1: Button name, Click action, URL, KV pairs, + Action button*

![Button actions: Navigate to a screen, Deeplinking, Rich landing, Call, Share, Copy, Set User Attribute, Track event, Custom action, Snooze, Remind later](../screenshots/03-builder-push-sms-085-push-button-click-action-options.jpg)
*Button actions: Navigate to a screen, Deeplinking, Rich landing, Call, Share, Copy, Set User Attribute, Track event, Custom action, Snooze, Remind later*

![Advanced (Android): Coupon code, large icon, Auto-dismiss](../screenshots/03-builder-push-sms-086-push-advanced-section-top.jpg)
*Advanced (Android): Coupon code, large icon, Auto-dismiss*

![Advanced: Coupon code, Use large icon (app icon / upload / URL), Auto-dismiss, Group key, Update key](../screenshots/03-builder-push-sms-087-push-advanced-coupon-large-icon-keys.jpg)
*Advanced: Coupon code, Use large icon (app icon / upload / URL), Auto-dismiss, Group key, Update key*

![Auto-dismiss tooltip: remove the notification from the tray after a set time](../screenshots/03-builder-push-sms-088-push-auto-dismiss-tooltip.jpg)
*Auto-dismiss tooltip: remove the notification from the tray after a set time*

![Group key visual tooltip: group messages in the notification tray](../screenshots/03-builder-push-sms-089-push-group-key-tooltip.jpg)
*Group key visual tooltip: group messages in the notification tray*

![Update key visual tooltip: replace an existing notification that has the same key](../screenshots/03-builder-push-sms-090-push-update-key-tooltip.jpg)
*Update key visual tooltip: replace an existing notification that has the same key*

![Minimum requirements: moe-android-sdk 12.5.05 and rich-notification 4.3.0 for Android 12 templates](../screenshots/03-builder-push-sms-091-push-check-minimum-requirements-tooltip.jpg)
*Minimum requirements: moe-android-sdk 12.5.05 and rich-notification 4.3.0 for Android 12 templates*

![Auto-dismiss on: N Days duration](../screenshots/03-builder-push-sms-092-push-auto-dismiss-duration.jpg)
*Auto-dismiss on: N Days duration*

![Preview widths tooltip: Min / Std A / Std B / Max explained with OEM examples](../screenshots/03-builder-push-sms-093-push-android-preview-device-widths-tooltip.jpg)
*Preview widths tooltip: Min / Std A / Std B / Max explained with OEM examples*

![Preview set to Dark + Collapse](../screenshots/03-builder-push-sms-094-push-android-preview-dark-collapsed.jpg)
*Preview set to Dark + Collapse*

#### Push One Time, Step 2: iOS tab (forced)

![iOS tab: title, subtitle, message, iPhone lock-screen preview, preview controls](../screenshots/03-builder-push-sms-095-push-ios-editor-top.jpg)
*iOS tab: title, subtitle, message, iPhone lock-screen preview, preview controls*

![Copy content: Copy from Android](../screenshots/03-builder-push-sms-096-push-ios-copy-content-menu.jpg)
*Copy content: Copy from Android*

![Allow app to refresh in background, Rich media Image/GIF, upload area, Default click action](../screenshots/03-builder-push-sms-097-push-ios-subtitle-background-refresh-rich-media.jpg)
*Allow app to refresh in background, Rich media Image/GIF, upload area, Default click action*

![iOS rich media types: Image/ GIF, Audio, Video](../screenshots/03-builder-push-sms-098-push-ios-rich-media-types.jpg)
*iOS rich media types: Image/ GIF, Audio, Video*

![iOS click action: Deeplinking, Navigate to a screen, Rich landing](../screenshots/03-builder-push-sms-099-push-ios-click-action-options.jpg)
*iOS click action: Deeplinking, Navigate to a screen, Rich landing*

![iOS Advanced: Coupon code, Sound (file name), Badge (update badge count), Group key, Update key](../screenshots/03-builder-push-sms-100-push-ios-advanced-sound-badge-keys.jpg)
*iOS Advanced: Coupon code, Sound (file name), Badge (update badge count), Group key, Update key*

![iOS Buttons: 'Select category for additional options'](../screenshots/03-builder-push-sms-101-push-ios-buttons-category.jpg)
*iOS Buttons: 'Select category for additional options'*

![iOS category list is empty (none defined in settings)](../screenshots/03-builder-push-sms-102-push-ios-button-category-empty.jpg)
*iOS category list is empty (none defined in settings)*

#### Push One Time, Step 2: Web tab, UTM and test (forced)

![Web tab: Message title, Message and Redirect URL (all required), Auto dismiss after 8 seconds, 'See in web browser'](../screenshots/03-builder-push-sms-103-push-web-editor-top.jpg)
*Web tab: Message title, Message and Redirect URL (all required), Auto dismiss after 8 seconds, 'See in web browser'*

![Web Copy content: Copy from Android, Copy from iOS](../screenshots/03-builder-push-sms-104-push-web-copy-content-menu.png)
*Web Copy content: Copy from Android, Copy from iOS*

![Desktop preview: Chrome window with the web push toast](../screenshots/03-builder-push-sms-105-push-web-desktop-preview.jpg)
*Desktop preview: Chrome window with the web push toast*

![Web: Redirect URL, auto-dismiss note, Image (URL / Upload / Merlin AI Designer, 2:1)](../screenshots/03-builder-push-sms-106-push-web-redirect-autodismiss-image.jpg)
*Web: Redirect URL, auto-dismiss note, Image (URL / Upload / Merlin AI Designer, 2:1)*

![Web button: Title (required), Icon upload (2:1, about 25KB), URL (required)](../screenshots/03-builder-push-sms-107-push-web-action-button-fields.jpg)
*Web button: Title (required), Icon upload (2:1, about 25KB), URL (required)*

![Web Advanced: Icon image (Use default / Upload icon); badge icon note for Android Chrome/Opera](../screenshots/03-builder-push-sms-108-push-web-advanced-icon-image.jpg)
*Web Advanced: Icon image (Use default / Upload icon); badge icon note for Android Chrome/Opera*

![UTM parameters plus Test Campaign with the 'Automate QC with Merlin Custom Agents' button](../screenshots/03-builder-push-sms-109-push-utm-test-campaign-merlin-qc.jpg)
*UTM parameters plus Test Campaign with the 'Automate QC with Merlin Custom Agents' button*

![Push test by: Unique ID, Email ID, Mobile Number, GAID, IDFA, Device push token, Custom Segment](../screenshots/03-builder-push-sms-110-push-test-recipient-id-options.jpg)
*Push test by: Unique ID, Email ID, Mobile Number, GAID, IDFA, Device push token, Custom Segment*

#### Push One Time, Step 3: Schedule and goals (forced)

![Push step 3: At specific date and time plus 'Pre-compute audience'](../screenshots/03-builder-push-sms-111-push-schedule-specific-time-precompute.jpg)
*Push step 3: At specific date and time plus 'Pre-compute audience'*

![Pre-compute tooltip: audience computed 1 hour before send (not if edited within 30 minutes)](../screenshots/03-builder-push-sms-112-push-precompute-audience-tooltip.jpg)
*Pre-compute tooltip: audience computed 1 hour before send (not if edited within 30 minutes)*

![As soon as possible (Send now); request limit 100000 rpm](../screenshots/03-builder-push-sms-113-push-schedule-send-now-asap.jpg)
*As soon as possible (Send now); request limit 100000 rpm*

![Goals, Delivery controls, Advanced: expire after 36 Hour(s), remove from inbox after 30 Days, Send at priority](../screenshots/03-builder-push-sms-114-push-goals-delivery-controls-expiry.jpg)
*Goals, Delivery controls, Advanced: expire after 36 Hour(s), remove from inbox after 30 Days, Send at priority*

![Ignore FC tooltip: everyone receives it despite the FC limit (e.g. App Update)](../screenshots/03-builder-push-sms-115-push-ignore-frequency-capping-tooltip.jpg)
*Ignore FC tooltip: everyone receives it despite the FC limit (e.g. App Update)*

![Send at priority tooltip: time-critical only, drains more battery](../screenshots/03-builder-push-sms-116-push-send-at-priority-tooltip.jpg)
*Send at priority tooltip: time-critical only, drains more battery*

![Expiry units: Hour (s), Minute (s)](../screenshots/03-builder-push-sms-117-push-expiry-unit-options.jpg)
*Expiry units: Hour (s), Minute (s)*

![iOS: APNS Priority, Interruption Level, Relevance Score slider; Background update targeting](../screenshots/03-builder-push-sms-118-push-advanced-ios-priority-relevance-background.jpg)
*iOS: APNS Priority, Interruption Level, Relevance Score slider; Background update targeting*

![APNS Priority: 10, 5, 1](../screenshots/03-builder-push-sms-119-push-apns-priority-options.jpg)
*APNS Priority: 10, 5, 1*

![Interruption Level: Active, Passive, Time-sensitive, Critical](../screenshots/03-builder-push-sms-120-push-interruption-level-options.jpg)
*Interruption Level: Active, Passive, Time-sensitive, Critical*

![Background targeting tooltip: background pushes can reach opted-out users](../screenshots/03-builder-push-sms-121-push-background-update-targeting-tooltip.jpg)
*Background targeting tooltip: background pushes can reach opted-out users*

![Inbox removal units: Days, Hour (s)](../screenshots/03-builder-push-sms-122-push-inbox-removal-unit-options.jpg)
*Inbox removal units: Days, Hour (s)*

#### Push Periodic, Step 3 (forced)

![Push Periodic Send daily. The 'Failed to fetch next instance' line is caused by the capture's network guard.](../screenshots/03-builder-push-sms-123-push-periodic-schedule-daily.jpg)
*Push Periodic Send daily. The 'Failed to fetch next instance' line is caused by the capture's network guard.*

![Push Periodic: Pre-compute audience, goals, Ignore FC, Request limit, Advanced expiry/priority](../screenshots/03-builder-push-sms-124-push-periodic-precompute-goals-delivery-advanced.jpg)
*Push Periodic: Pre-compute audience, goals, Ignore FC, Request limit, Advanced expiry/priority*

#### Push Event Triggered (step 1, forced step 3)

![Push (Event Triggered): platforms, originating-device option, Primary trigger event(s)](../screenshots/03-builder-push-sms-125-push-event-trigger-step1-platforms-trigger.jpg)
*Push (Event Triggered): platforms, originating-device option, Primary trigger event(s)*

![Originating device tooltip: send only to the device where the event happened](../screenshots/03-builder-push-sms-126-push-originating-device-tooltip.jpg)
*Originating device tooltip: send only to the device where the event happened*

![THEN With Delay (2 Days, After, If Action), intelligent delay option, audience](../screenshots/03-builder-push-sms-127-push-event-trigger-then-delay-audience.jpg)
*THEN With Delay (2 Days, After, If Action), intelligent delay option, audience*

![Merlin AI tooltip: optimises the trigger delay based on click rate](../screenshots/03-builder-push-sms-128-push-intelligent-delay-merlin-tooltip.jpg)
*Merlin AI tooltip: optimises the trigger delay based on click rate*

![Intelligent delay on: min delay 30 Minutes, max delay 30 Days](../screenshots/03-builder-push-sms-129-push-intelligent-delay-min-max.jpg)
*Intelligent delay on: min delay 30 Minutes, max delay 30 Days*

![Step 3: Active continuously, start/end, Minimum delay between two notifications 15 hours, DND, FC](../screenshots/03-builder-push-sms-130-push-event-trigger-schedule-active-continuously.jpg)
*Step 3: Active continuously, start/end, Minimum delay between two notifications 15 hours, DND, FC*

![Delivery controls plus Advanced: expiry 36 Hour(s), Background update targeting](../screenshots/03-builder-push-sms-131-push-event-trigger-delivery-controls-advanced.jpg)
*Delivery controls plus Advanced: expiry 36 Hour(s), Background update targeting*

![Ignore DND tooltip for push](../screenshots/03-builder-push-sms-132-push-event-trigger-dnd-tooltip.jpg)
*Ignore DND tooltip for push*

#### Push Device Triggered (step 1, forced step 3)

![Device Triggered step 1: Android/iOS, trigger criteria, S2S not supported note](../screenshots/03-builder-push-sms-133-push-device-trigger-step1-android-ios-trigger.jpg)
*Device Triggered step 1: Android/iOS, trigger criteria, S2S not supported note*

![Audience filters and Global control group only](../screenshots/03-builder-push-sms-134-push-device-trigger-step1-audience-control-group.jpg)
*Audience filters and Global control group only*

![Step 3: Active continuously, max shows, min delay 15 Minutes, sync expiry 7 Days](../screenshots/03-builder-push-sms-135-push-device-trigger-schedule-active.jpg)
*Step 3: Active continuously, max shows, min delay 15 Minutes, sync expiry 7 Days*

![Delivery controls incl. Send the messages in offline mode, Ignore DND, Ignore FC](../screenshots/03-builder-push-sms-136-push-device-trigger-delivery-controls.jpg)
*Delivery controls incl. Send the messages in offline mode, Ignore DND, Ignore FC*

![Max times tooltip: 0 = unlimited (until other controls apply)](../screenshots/03-builder-push-sms-137-push-device-trigger-max-times-tooltip.jpg)
*Max times tooltip: 0 = unlimited (until other controls apply)*

![Sync expiry tooltip: periodically purge synced campaigns](../screenshots/03-builder-push-sms-138-push-device-trigger-sync-expiry-tooltip.jpg)
*Sync expiry tooltip: periodically purge synced campaigns*

![Offline mode tooltip: shown even when the device is offline, from last-synced data](../screenshots/03-builder-push-sms-139-push-device-trigger-offline-mode-tooltip.jpg)
*Offline mode tooltip: shown even when the device is offline, from last-synced data*

#### Push Location Triggered (step 1, forced step 3)

![Location Triggered step 1: Android/iOS, Geofence (required) empty state, + Add Geofence](../screenshots/03-builder-push-sms-140-push-location-trigger-step1-geofence-empty.jpg)
*Location Triggered step 1: Android/iOS, Geofence (required) empty state, + Add Geofence*

![Add Geofence drawer: name, trigger, responsiveness, place search, map, latitude/longitude/radius](../screenshots/03-builder-push-sms-141-push-add-geofence-drawer-map.jpg)
*Add Geofence drawer: name, trigger, responsiveness, place search, map, latitude/longitude/radius*

![Send notification when: User enters / User exits / Dwell based (only Android)](../screenshots/03-builder-push-sms-142-push-geofence-trigger-options.jpg)
*Send notification when: User enters / User exits / Dwell based (only Android)*

![Notification responsiveness (Android) tooltip: check frequency vs battery trade-off](../screenshots/03-builder-push-sms-143-push-geofence-responsiveness-tooltip.jpg)
*Notification responsiveness (Android) tooltip: check frequency vs battery trade-off*

![Location step 1 audience section (no control groups card)](../screenshots/03-builder-push-sms-144-push-location-trigger-step1-audience.jpg)
*Location step 1 audience section (no control groups card)*

![Step 3: As soon as possible only; Time bound for Geofences: Always / Limited period](../screenshots/03-builder-push-sms-145-push-location-trigger-schedule-asap-time-bound.jpg)
*Step 3: As soon as possible only; Time bound for Geofences: Always / Limited period*

![Sending limits: at most 1 time in 5 hours; Ignore DND/FC; expiry 36 Hour(s)](../screenshots/03-builder-push-sms-146-push-location-trigger-sending-limits-advanced.jpg)
*Sending limits: at most 1 time in 5 hours; Ignore DND/FC; expiry 36 Hour(s)*

![Limited period: Timebound 1 (time zone, start/end date-time, daily window summary), + Another time bound](../screenshots/03-builder-push-sms-147-push-location-trigger-limited-period-timebound.jpg)
*Limited period: Timebound 1 (time zone, start/end date-time, daily window summary), + Another time bound*
