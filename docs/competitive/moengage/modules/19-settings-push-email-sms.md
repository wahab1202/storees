## 19. Settings > Channels: Push, Email, SMS & RCS

Storees covers the basics of channel setup: one provider per channel with credential forms for five ESPs, four SMS gateways and FCM, a self-serve Resend sending-domain card with DNS records and verification, and email that works on day one through a shared sender, which MoEngage cannot do. Against MoEngage's 19 channel-settings pages it has no web push, APNs, RCS, DLT, SMS keywords, per-channel exclusions, warm-up, link branding, bot-adjusted metrics, fonts or suppression import, and several pieces that do exist are not wired: campaign SMS reach the provider with an empty body, the unsubscribe link and List-Unsubscribe header never reach customers, bounces from campaign and flow emails are never suppressed, and Shopify unsubscribes are ignored. Channel credentials can also be overwritten, and some secrets read back in full, by any project member through the API.

### MoEngage overview

MoEngage gives each channel its own settings page under Settings > Channels, reached from a Settings flyout (with search) or the Settings Home card grid. Each page uses pill tabs, one per concern.

- **Push (5 tabs):**
  - **App push:** Android credentials as an FCM HTTP v1 service-account JSON; iOS credentials as an APNs .p8 key with Team ID, Key ID, Bundle ID and an optional iPad Bundle ID; a "Show iOS impressions" toggle. The app code also has APNs certificate (.pem) auth and Huawei (HMS) delivery.
  - **Web push:** default notification icon, badge icon (upload or URL), sub-domain permission handling, and an opt-in toggle that reveals 2-step soft ask, 1-step and self-handled methods, re-ask timing and an assistive overlay.
  - **Preference management:** a global "Exclude users" segment rule, overridable per campaign.
  - **Preview settings:** app name and icons used only in editor previews.
  - **Device analytics:** app-version buckets and the top 5 OEMs and browsers shown in campaign device analytics.
- **Email (7 tabs):**
  - **Overview:** two setup paths, a MoEngage-managed sender (runs on SendGrid) or your own ESP from App Marketplace.
  - **Sender configuration:** sender table, plus a managed onboarding wizard (from app code) covering per-type sender domains, DNS validation, unsubscribe options including RFC 8058 one-click, From address, warm-up plan, Google Postmaster and a link-branding domain.
  - **General settings:** default sender, email attribute, same-email subscription sync, open-pixel position, HTML auto-format, bot and Apple MPP adjusted metrics, view-in-browser link, verified From addresses.
  - **Subscription management:** default Bounce/Spam/Unsubscribe exclusion, subscription categories, CSV suppression updates with history; double opt-in in the app code.
  - **Font management, PII tokenization, Dynamic sender routing.**
- **SMS & RCS (7 tabs):** add-sender wizard (Twilio, Gupshup, Kaleyra, Sinch, ICS, Pinpoint or a custom HTTP connector; sender types, MMS, encryption, two-way SMS, unsubscribe text, test SMS, credits, India DLT mapping, delivery tracking), RCS senders and templates, mobile-number attribute, opt-out management, STOP/HELP/START keywords, PII tokenization and performance-based sender routing.
- **App Marketplace:** 6 email connectors and 18 SMS connectors, including the main Indian aggregators.

| Page visited | URL path |
|---|---|
| Push > App push (Android FCM / iOS APNS) | `/v4/push/settings/app-push/android`, `/v4/push/settings/app-push/ios` |
| Push > Web push (Configure / Notification opt-in) | `/v4/push/settings/web-push/configure`, `/v4/push/settings/web-push/opt-in` |
| Push > Preference management | `/v4/push/settings/preference-management` |
| Push > Preview settings (Android / iOS) | `/v4/push/settings/preview-settings/android-preview`, `/ios-preview` |
| Push > Device analytics (App versions / OEMs & Browsers) | `/v4/push/settings/device-analytics/app-versions`, `/oem-browser` |
| Email > Overview | `/v4/email/settings/overview` |
| Email > Sender configuration | `/v4/email/settings/sender-configuration` |
| Email > General settings | `/v4/email/settings/general` |
| Email > Subscription management | `/v4/email/settings/subscription-management/preference-management`, `/subscription-categories`, `/suppression-updates` |
| Email > Font management | `/v4/email/settings/font-management` |
| Email > PII tokenization | `/v4/email/settings/pii` |
| Email > Dynamic sender routing | `/v4/email/settings/dynamic-sender-routing` |
| SMS & RCS > Sender configuration (SMS / RCS) | `/v4/settings-v2/channels/sms-and-rcs/sender-configuration/sms`, `/rcs` |
| SMS & RCS > RCS template management | `/v4/settings-v2/channels/sms-and-rcs/rcs-template-management` |
| SMS & RCS > General settings | `/v4/settings-v2/channels/sms-and-rcs/general` |
| SMS & RCS > Subscription management | `/v4/settings-v2/channels/sms-and-rcs/subscription-management` |
| SMS & RCS > Keyword management | `/v4/settings-v2/channels/sms-and-rcs/keyword-management` |
| SMS & RCS > PII tokenization | `/v4/settings-v2/channels/sms-and-rcs/pii` |
| SMS & RCS > Dynamic Sender Routing | `/v4/settings-v2/channels/sms-and-rcs/dynamic-sender-routing` |
| Settings navigation (flyout + Settings Home) | Settings flyout from the gear icon; Settings Home (unknown `/v4/settings-v2/...` routes fall back to it) |
| App Marketplace: email ESP and SMS connectors | `/v4/partners?categories=Emails`, `/v4/partners?categories=SMS`, `/v4/partners/sendgrid` |

**Capture limits.**
- **Nothing is configured** in this Test workspace: no FCM or APNs key, email senders, From addresses, categories, fonts or SMS senders.
- **Role-locked actions:** Setup MoEngage email, + Add email address, Configure subscription categories, Upload CSV file, + Add font, SMS add-sender and App Marketplace "+ Add integration" are disabled for this role. The email onboarding wizard, SMS add-sender wizard and connector forms were read as exact strings from the page's loaded JavaScript, marked "from app code".
- **Not enabled (contact CSM):** RCS senders and templates, SMS keyword management, PII tokenization (email and SMS), dynamic sender routing (email and SMS).
- **Toggles not clicked:** "Enable web push opt-in" (its form comes from app code), push "Exclude users" (no Save button, may apply immediately) and SMS "Opt-out users".
- **Covered elsewhere:** WhatsApp, Delivery Controls and Settings > Channels > Preference Management.
- **No side effects:** nothing was saved, uploaded, downloaded, connected or sent.

### Storees counterpart

Storees splits channel settings across two Settings tabs and keeps the rest in the backend with no settings screen.

| Storees surface | Route / access | Code |
|---|---|---|
| SDK & Integration > Channels: Email, SMS, WhatsApp and Push cards, provider grid, generic credentials form (WhatsApp has its own panel) | `/settings` (opens on Channels), admin-only tab | `packages/frontend/src/app/(dashboard)/settings/page.tsx:346-653`; `GET /api/ai/channel-config` and `POST /api/ai/config` in `packages/backend/src/routes/ai.ts:256-330` |
| Project: Email sending domain (Resend) with DNS records and verification; per-channel marketing frequency caps | `/settings/project`, admin-only | `packages/frontend/src/app/(dashboard)/settings/project/page.tsx:107-411`; `packages/backend/src/routes/v1Onboarding.ts:689-772`; `packages/backend/src/services/emailDomainService.ts` |
| Provider adapters | Backend only | `packages/backend/src/services/providers/` (Resend, SendGrid, Postmark, Mailgun, SES; Twilio, Gupshup, Bird, Vonage SMS; FCM) and `services/emailProviderRegistry.ts`, `services/channelProviderRegistry.ts` |
| Unsubscribe page and tokens | Public `/u/:token` | `packages/backend/src/routes/unsubscribe.ts`; `services/unsubscribeService.ts` |
| Email engagement, bounce and complaint suppression | `/api/webhooks/resend` | `packages/backend/src/routes/resendWebhook.ts`; `email_suppressions` table |
| SMS and push receipts | `/api/webhooks/channel/{twilio,gupshup,bird,vonage,fcm}` | `packages/backend/src/routes/channelWebhooks.ts`; `services/messageStatusService.ts` |
| Consent and subscription categories | API only: `/api/consent/*`, `/api/subscription-categories` | `routes/consent.ts`; `routes/subscriptionCategories.ts`; `services/consentService.ts` |
| Campaign wizard: From picker, category checklist, audience preview with Suppressed and Opted out counts | `/campaigns/create` | `packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx` |
| Customer profile Consent tab (current status and audit log) | `/customers/[id]` | `packages/frontend/src/components/customers/ConsentTab.tsx` |
| On-site opt-in widgets (WhatsApp and email consent) | `/widgets` (not in the sidebar) | `packages/frontend/src/app/(dashboard)/widgets/page.tsx`; `packages/sdk/src/widget.ts`; `routes/v1OptIn.ts` |

**Not present:** web push, APNs, HMS, RCS, DLT fields, inbound SMS and SMS keywords, per-channel exclusion rules, warm-up, link branding, view-in-browser, bot filtering, custom fonts, PII tokenization, sender routing, suppression import, a preference centre, per-channel settings pages and settings search.

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Push > App push | Android push credentials (FCM HTTP v1 service-account key) | "Upload FCM Private key file*" (.json) with an "FCM Authentication" help link; legacy server key removed | 🟡 Partial | Push card takes Firebase Project ID and the service-account JSON, uploaded or pasted (`settings/page.tsx:396-399,556-605`); sent through FCM v1 with a signed JWT (`fcmProvider.ts:9-68,116-143`); project ID derived from the JSON when blank (`:82-86`). Defects: one module-level OAuth token cache shared by every tenant (`fcmProvider.ts:71,106-111`); one device token per customer (`customAttributes.fcm_token`, `:93-96`); no validation or test on save; stored unencrypted | Key the token cache by service account (today other tenants' pushes fail for up to 50 minutes after one tenant sends); validate the JSON and add "Send test push"; several device tokens per customer; encrypt at rest. | P1 | S |
| Push > App push | iOS push credentials (APNs .p8, Team ID, Key ID, Bundle ID, iPad Bundle ID) | "iOS authentication": .p8 upload, Team ID*, Key ID*, Bundle ID*, optional "Bundle ID for iPad", each with a tooltip | 🟡 Partial | No APNs settings or client (searched apns, p8, bundleId, teamId). iOS works only through FCM: the payload adds an `apns` block (`fcmProvider.ts:136-139`), so the app must use the Firebase iOS SDK with its APNs key uploaded in Firebase. The card still says "Android + iOS + Web push" (`settings/page.tsx:397`) | No direct APNs for apps that don't use Firebase on iOS, and no iPhone/iPad bundle routing. At minimum, state the Firebase-on-iOS requirement on the Push card. | P2 | M |
| Push > App push | iOS auth method: APNs key vs provider certificate (.pem) | Radios "APNS authentication key (Recommended)" and "APNS provider certificate" with iPhone/iPad .pem and expiry warnings (app code) | ➖ N/A | Storees never calls APNs; the merchant chooses key or certificate in the Firebase console (`fcmProvider.ts:136-139`) | None while iOS goes through FCM. If a native APNs client is added, support only .p8 token auth. | — | — |
| Push > App push | Show iOS impressions | Toggle (ON) shows iOS impression counts in campaign analytics; needs extra iOS SDK integration | 🟡 Partial | The app can report receipts to `POST /api/webhooks/channel/fcm` (`delivered`, `tapped`), which update `messages` and campaign counters (`channelWebhooks.ts:214-235`; `messageStatusService.ts:24-78`), so an iOS Notification Service Extension can report impressions. No iOS SDK, docs or setting; the app must send FCM's full message name (`projects/.../messages/...`, `fcmProvider.ts:168`); the endpoint is unauthenticated | Document a Notification Service Extension recipe (or ship a thin iOS helper), accept FCM's short message id, and authenticate receipts. | P3 | M |
| Push > App push | Huawei Mobile Services (HMS) delivery | "Huawei Mobile Service delivery" with a "Small icon path" setting (app code) | ❌ Missing | Only `push_fcm` is registered (`providers/index.ts:40`); no Huawei or HMS references anywhere | No HMS transport. Low relevance for Indian D2C. | P3 | M |
| Push > Web push | Default notification icon and badge icon | "Default notification icon" (192x192) and "Badge icon for web push" by upload or image URL (alpha-only, min 72x72), Browser Compatibility Matrix link | ❌ Missing | No web push in `packages/sdk/src` (no service worker, PushManager or permission request). Only a dev tool (`scripts/fcm-token-tool/`) and a DIY Firebase recipe that hard-codes the favicon (`docs/STOREES_INTEGRATION_GUIDE.md:531-615`). The campaign "Web" push tab is saved but never sent (`MultiPlatformPushBlock.tsx:17-21`; `pushContent` is read only in `routes/campaigns.ts`) | Default icon and badge settings as part of first-party web push; default the icon to the brand-kit logo. | P2 | S |
| Push > Web push | Sub-domain permission handling | Radios "Treat each sub-domain as a separate entity" or "Track user cross-subdomain" | ❌ Missing | No web push SDK, so no permission scope setting | Relevant only after web push ships; most Shopify stores run on one domain. | P3 | S |
| Push > Web push | Web push opt-in prompt (2-step soft ask, 1-step, self-handled, assistive overlay, re-ask timing) | "Enable web push opt-in" reveals the methods, "Show push permission opt-in after N", re-appear time, assistive overlay, banner and nudge icons, Chrome/Firefox/Opera previews (app code) | ❌ Missing | No browser permission or token capture in the SDK. Related: on-site opt-in widgets with exit-intent, time, scroll and manual triggers (`sdk/src/widget.ts:25,88-150`; `routes/v1OptIn.ts:81-224`) capture WhatsApp and email consent, not push. The DIY guide calls `Notification.requestPermission()` directly and posts the token with the API secret from the browser (`STOREES_INTEGRATION_GUIDE.md:575-615`) | Ship web push: service worker and VAPID/FCM web config in Push settings; 1-step and 2-step soft-ask prompts reusing the widget trigger engine, with re-ask timing; token registration on the profile. Same initiative as module 03's web push row. | P1 | L |
| Push > Preference management | Global push exclusion ("Exclude users" segment, overridable per campaign) | Toggle "Exclude users"; matching users are blocked from push unless a campaign overrides it | ❌ Missing | No global or per-channel exclusion setting (searched exclusion, blocklist, universal control, DND, quiet hours). Only the per-campaign "Exclude users" filter (`campaigns/create/page.tsx:452-453,617`; `campaignService.ts:206,520`); flows have none | Per-channel global exclusion segment enforced in campaigns and flows, with a per-campaign override. | P2 | M |
| Push > Preview settings | Campaign preview defaults (Android app name, app icon, large icon; iOS app icon) | Android: App name (Preview), App icon (72x72 alpha .png), Large app icon (120x120). iOS: App icon (min 180x180) | 🟡 Partial | The push editor renders Android, iOS and Web frames (`MultiPlatformPushBlock.tsx:212-292`), but the app name is hard-coded "Storees", "STOREES" or "Storees.io" with generic icons; the single-platform card shows a bell and "App Name" (`campaigns/create/page.tsx:2961-2970`). No preview settings; the brand kit is not used | Use the brand-kit name and logo in previews; optional per-platform preview icons. | P3 | S |
| Push > Device analytics | App version buckets | "+ Add bucket" rows with Bucket name* and App versions*; earlier campaigns keep their settings | ❌ Missing | Storees sends app push (tokens from merchant apps or connectors, `connectors/templates/virpanai.ts:115-118`) but never learns the app version: receipts carry only `messageId` and `status` (`channelWebhooks.ts:214-235`), the web SDK context has none (`sdk/src/context.ts:39-58`), and campaign analytics have no device breakdown (`campaignAnalyticsService.ts`) | Needs a mobile SDK, or app-version and OEM fields on push receipts, plus a device breakdown in campaign analytics. | P3 | L |
| Push > Device analytics | Top-5 OEMs view | "Configure view for OEMs": top 5 (default Samsung, Xiaomi, Oppo, Realme, Vivo; 26 available), the rest grouped as "others" | ❌ Missing | No device manufacturer is captured for app push anywhere (same evidence as the row above) | As above. | P3 | L |
| Push > Device analytics | Top-5 browsers view | "Configure view for Browsers": Chrome, Safari, Firefox, Edge, Opera | ❌ Missing | The web SDK records browser, OS and device type on every event (`sdk/src/context.ts:13-58`), but campaign analytics have no per-browser breakdown and there is no web push to analyse | After web push ships, break delivery and clicks down by browser and device type. | P3 | M |
| Email > Overview | Email setup paths (platform-managed sender vs bring-your-own ESP) | "Setup MoEngage email sender" ("No senders configured!") or "Setup other email sender" via "Open App marketplace" | ✅ Full | Managed: with no setup, email goes out through the platform Resend account and the shared From (`emailProviderRegistry.ts:45-79,93-99`); a tenant domain can be registered on that account (`settings/project/page.tsx:202-411`; `emailDomainService.ts:85-200`). Bring-your-own: Resend, SendGrid, Postmark, Mailgun or SES forms (`settings/page.tsx:352-363`; `providers/httpEmailProviders.ts`) | Both paths work, but they sit in two tabs with no overview of which one is live, and the domain card is Resend-only without saying it has no effect when another ESP is selected. | — | — |
| Email > Sender configuration | Sender list (domain type, provider, verification status, Mark as default, Add sender) | Managed sender table with Domain type, Service provider, Verification status, SMTP port and protocol, "Mark as default", "Add sender" (app code) | 🟡 Partial | One domain per project (`projects.resend_domain_id`, `schema.ts:52`) shown as one card with a Verified/Pending/Failed badge (`settings/project/page.tsx:365-433`). `project_email_senders` and `GET /api/email-senders` exist (`schema.ts:73-84`; `routes/emailSenders.ts:9-22`) with no list UI, add-sender or mark-as-default; `POST /sync-default` has no UI; `project_email_connectors` is unused (`schema.ts:86-99`) | Senders table (domain, provider, status, default) with add/remove and default selection; more than one domain per project. | P2 | M |
| Email > Sender configuration | Add sender domain and validate DNS records | Wizard steps "Add sender domain" and "Validate DNS records" (download records, tick "I confirm...") (app code) | ✅ Full | "Email sending domain" card: domain (subdomain recommended), From name, inbox name with a noreply warning; "Register with Resend" returns a copyable DNS table; "Check verification status" refreshes it (`settings/project/page.tsx:202-411`; admin-only `routes/v1Onboarding.ts:689-772`; `emailDomainService.ts:85-200`) | Parity for one domain. No record download or confirmation step and no restart-verification (only Resend `domains.create` and `domains.get` are called). The UI can't change or remove a registered domain, and re-registering through the API swaps the From to the new domain while keeping the old Resend domain (`emailDomainService.ts:115-127`). | — | — |
| Email > Sender configuration | Separate sender domains per email type (Promotional / Event-triggered / Transactional) | "Add sender domain" per type, each with its own name and recommended subdomain (app code) | 🟡 Partial | The backend keeps `email_marketing_provider` and `email_transactional_provider` and routes transactional sends by them (`schema.ts:53-54`; `emailProviderRegistry.ts:62-66`), but saving the Email channel sets both to one provider (`routes/ai.ts:315-325`) and a project has one domain (`emailDomainService.ts:119-127`) | Expose marketing and transactional provider and domain separately so promotional reputation can't hurt order mail. | P3 | S |
| Email > Sender configuration | Domain / IP warm-up plan | "Generate warm up plan": a viewable or downloadable ramp, with guidance for triggered and transactional domains (app code) | ❌ Missing | No warm-up logic or guidance (searched warm). Only the optional per-campaign "Request limit" (`campaignService.ts:801-802,1079-1098`) and `projects.email_rate_per_minute` (`schema.ts:59`; `emailRateLimit.ts`), which gates only delivery-queue jobs (`deliveryWorker.ts:18-29`), so campaign and flow emails bypass it; it has no UI | Generate a daily ramp for a newly verified domain, enforce it with the existing throttles and show it on the domain card. | P2 | M |
| Email > Sender configuration | Recommended deliverability steps (Google Postmaster, onboarding checklist) | Authorize Domain Reputation (Postmaster), click-tracking domain, subscription categories, suppression list (app code) | ❌ Missing | No Postmaster link or checklist (searched postmaster); the domain card shows only DNS records and status (`settings/project/page.tsx:262-411`) | Deliverability checklist: domain verified, DMARC present, unsubscribe header live, engagement webhook connected, Postmaster linked. | P3 | S |
| Email > Sender configuration | Unsubscribe: platform-inserted footer link | MoEngage inserts the "Unsubscribe page URL" link in the footer (app code) | 🟡 Partial | The footer block links to `{{unsubscribe_url}}` (`lib/emailCompiler.ts:176`; `lib/emailTypes.ts:74`) and `/u/:token` applies the opt-out (`routes/unsubscribe.ts:19-75`; `unsubscribeService.ts:54-104`). But campaign and flow sends never mint a token or set `unsubscribe_url` (`campaignService.ts:929-936`; `flowExecutor.ts:705-711,778-784`); only the legacy `resendProvider.ts:88-99` calls `getOrCreateToken`. Unknown tokens render as empty (`emailService.ts:115-120`), so the link has an empty href | Mint the per-customer token at send time and set `unsubscribe_url` in every campaign, flow and test email; make `GET /u/:token` show a confirm button (POST) so link scanners can't unsubscribe people. Same defect as modules 01 and 02. | P0 | S |
| Email > Sender configuration | Unsubscribe: brand-managed link in the email body | "Email body un-subscription management": the brand owns the link and its processing (app code) | 🟡 Partial | Any link can go in Custom HTML or the builder, but write-back is only `POST /api/consent/:customerId`, behind admin-session auth (`routes/consent.ts:42-77`; `index.ts:218`); the API-key routes offer opt-in only (`routes/v1OptIn.ts:81`), and Shopify unsubscribes land in `email_subscribed`, which sends ignore (`deliveryService.ts:376-381`) | Add an API-key opt-out endpoint (for example `POST /api/v1/consent`) and document the recipe; honour Shopify consent (default-exclusion row). | P2 | S |
| Email > Sender configuration | One-click unsubscribe (RFC 8058 List-Unsubscribe and List-Unsubscribe-Post) | List-Unsubscribe mailto and https headers on all non-transactional emails; requests processed within 2 days (app code) | 🟡 Partial | `POST /u/:token` implements RFC 8058 (`routes/unsubscribe.ts:19-35`), but the headers are built only in the legacy `resendProvider.ts:83-101`, used for internal trial-reminder and template-alert mail. Campaign and flow emails go through `sendEmail` and `EmailSendCommand`, which has no headers field (`emailProviderRegistry.ts:12-21`; `resendEmailProvider.ts:22-31`; `httpEmailProviders.ts`) | Add headers to `EmailSendCommand` and all 5 adapters; attach List-Unsubscribe (https and mailto) and List-Unsubscribe-Post to every promotional campaign and flow email. | P0 | M |
| Email > Sender configuration | Link-branding (click-tracking) and deep-link domains | "Add link branding domain" by CNAME, MoEngage-managed or self-managed SSL, default domain, "Add deep linking domain" (app code) | ❌ Missing | Short links use one platform base, `SHORTLINK_BASE_URL`; per-project domains are "Phase 2" (`shortLinkService.ts:6-16`). Only WhatsApp URL buttons are wrapped (`deliveryService.ts:296`); email links are not (clicks come from Resend's own tracking). No CNAME or SSL setup | Per-tenant branded link domain (CNAME and managed TLS) for email, SMS and WhatsApp links, plus deep-link domains. | P2 | L |
| Email > General settings | Set a default sender | "Set a default sender" dropdown (required) | 🟡 Partial | The default is `projects.email_from_address`, set at domain registration (`emailDomainService.ts:136-147`); campaigns use `campaign.fromEmail ?? project.emailFromAddress` (`campaignService.ts:1222-1227`); the From dropdown offers "Use project default sender" plus verified senders, else free text (`campaigns/create/page.tsx:534,2108-2120`). Defects: the default applies before DNS verifies (no check, unlike legacy `resendProvider.ts:50`), so Resend rejects campaign mail while pending; flow emails pass no From (`flowExecutor.ts:750`) and go out from the channel's Fallback From or `FROM_EMAIL` (`emailProviderRegistry.ts:93-99`), never the brand domain | Explicit default-sender selector limited to verified senders; use the shared sender until the domain verifies; apply the default to flow emails. | P1 | S |
| Email > General settings | User attribute that stores the email address | Searchable user-attribute dropdown (Email (Standard)) with "Show count" | ❌ Missing | Email is always `customers.email` (`schema.ts:130`); reachability is `!!email` (`campaignService.ts:576-586`); connectors map source fields at ingestion (`connectors/templates/virpanai.ts:98-101`). No setting | Low need for Shopify, where email is standard; an optional override for non-Shopify sources. Modules 01 and 02 rate the same choice ❌. | P3 | S |
| Email > General settings | Update subscription for every profile with the same email | Toggle (Enabled) | 🟡 Partial | Bounce and complaint suppressions are keyed by (project, lower(email)) (`schema.ts:694-706`), so they cover every profile with that address. Unsubscribes don't: both `/u/:token` handlers pass no email (`routes/unsubscribe.ts:29,43`), so the per-email suppression insert never runs (`unsubscribeService.ts:93-101`); consents are per customer (`consentService.ts:54-90`) and `customers.email` isn't unique (`schema.ts:163`) | Resolve the customer's email in `applyUnsubscribe` so an opt-out suppresses the address project-wide. | P2 | S |
| Email > General settings | Open-tracking pixel position (bottom / top) | Radios: bottom (default) or top (helps with Gmail clipping) | ❌ Missing | No first-party pixel; opens come only from Resend's tracking via its webhook (`routes/resendWebhook.ts:142-148`). SendGrid, Postmark, Mailgun and SES sends report no opens at all | First-party, positionable open pixel and click wrapping that work with any ESP. | P3 | M |
| Email > General settings | Auto-format HTML code | Toggle (ON): auto-corrects HTML-editor code; advanced users can send as-is | ❌ Missing | Custom HTML is sent as written (`campaignService.ts:963-975`); no clean-up or CSS-inlining library. `contentLint.ts:40-170` flags problems, but its findings are only returned by the API (`routes/campaigns.ts:269-298`) and no screen shows them | Show the lint findings in the editor; optional HTML clean-up (inline CSS, close tags). | P3 | M |
| Email > General settings | Bot interaction sensitivity and Apple MPP adjusted metrics | Low or High sensitivity (adds Adjusted Opens, Open Rate, CTOR); "Show Adjusted Metrics Only" or "Include Adjusted Metrics with Current Metrics" | ❌ Missing | Every Resend `email.opened` event counts, with no machine-open or Apple MPP filtering (`routes/resendWebhook.ts:142-148,232-255`); analytics show the raw open rate (`campaignAnalyticsService.ts`) | Flag likely machine opens (Apple proxy, opens seconds after delivery) and show adjusted open rate and CTOR beside the raw figures. | P2 | M |
| Email > General settings | Bot management for opens, clicks and unsubscribes | Bot and MPP detection, user-agent and IP blocklists, rule for clients that block tracking, "Ignore unsubscribe bot clicks" (app code) | ❌ Missing | Nothing is filtered for bots. `GET /u/:token` applies the opt-out immediately (`routes/unsubscribe.ts:37-45`), so once the footer link works, security link scanners will unsubscribe recipients | Confirm click (POST) on the unsubscribe page; filter known scanner user-agents and IPs from click counts. | P3 | M |
| Email > General settings | View-in-browser link (exemption for triggered/API campaigns and flows) | Toggle (Enabled) plus exemption checkbox | ❌ Missing | No hosted web version (searched view in browser, webversion); `campaign_sends` stores no rendered HTML | A `{{view_in_browser_url}}` token that re-renders the email for that recipient behind a signed URL. | P2 | M |
| Email > General settings | Several verified From addresses, chosen per campaign | "From" email address(es) table with "+ Add email address" | 🟡 Partial | The campaign From dropdown lists verified `project_email_senders` (`campaigns/create/page.tsx:534,2108-2116`), but rows are only created for the one registered inbox (`emailDomainService.ts:51-77`); no UI or API adds another address on the domain | "+ Add email address" on a verified domain (no extra DNS), with a list and remove. | P2 | S |
| Email > Subscription management | Default exclusion of bounced, spam-complaint and unsubscribed addresses | "By default we DO NOT send campaigns to email addresses which have been either marked as Bounce / Spam / Unsubscribe" | 🟡 Partial | Campaign staging excludes `email_suppressions` and opted-out email consents (`campaignService.ts:588-622`), and the preview shows Suppressed and Opted out. But: bounce and complaint webhooks find the project only through `messages` (`resendWebhook.ts:108-115,214-229`), which campaign and flow emails never write, so their bounces are never suppressed; unsubscribes depend on the broken footer link; Shopify consent lands only in `email_subscribed` (`syncWorker.ts:180`; `eventProcessor.ts:288-296`), which no gate reads (`deliveryService.ts:376-381`); flow emails check neither (`flowExecutor.ts:749-751`). Workaround: a "Reachable on Email" audience filter (`domainRegistry.ts:180`) | Resolve bounces and complaints through `campaign_sends.resend_message_id`; honour Shopify marketing consent; gate flow emails; state the rules in settings. Same defect as module 01's P0. | P0 | M |
| Email > Subscription management | Double opt-in | Consent landing page, confirmation email on sign-up, Optin Status API (app code) | ❌ Missing | Consent defaults to allowed (`deliveryService.ts:371-385`); consents have no pending state (`schema.ts:629-645`); widgets record a single opt-in with text and IP, no confirmation (`routes/v1OptIn.ts:81-224`) | Pending-consent state, a confirmation email or WhatsApp message and a confirm endpoint; optionally mirror Shopify's double opt-in. | P3 | M |
| Email > Subscription management | Subscription categories (topic-level opt-in and opt-out) | Categories such as Recommendations, New Offers, Transactional; "Configure subscription categories" (role-locked here) | 🟡 Partial | `subscription_categories` with `GET/POST /api/subscription-categories`, "General marketing" auto-seeded (`routes/subscriptionCategories.ts:10-87`; `schema.ts:649-676`); campaign create and edit show a category checklist (`campaigns/create/page.tsx:1183-1190`). No management UI; nothing writes `customer_subscriptions` (only read, `campaignService.ts:303-318,624-643`), so selecting any category blocks every recipient; no preference centre | Category management UI and a hosted preference centre that writes `customer_subscriptions`; treat customers as subscribed unless they opt out. | P1 | M |
| Email > Subscription management | Bulk suppression and resubscribe by CSV, with update history | "Upload CSV file", sample CSV, "Update history" of uploads and profile edits | ❌ Missing | No suppression UI or import: `email_suppressions` is written only by the Resend webhook and the unsubscribe service (`resendWebhook.ts:122-136`; `unsubscribeService.ts:93-101`); consent changes one customer at a time through the admin API (`routes/consent.ts:42-111`); `/api/v1/import/customers` accepts `email_subscribed`, which no gate reads (`v1Import.ts:49-91`) | CSV import (suppress or resubscribe) that writes `email_suppressions` and consents, with a history view built on `consent_audit_log`. Brands need it to bring their suppression list when they migrate. | P1 | M |
| Email > Font management | Custom email fonts with fallbacks and a default font | Font table (Font Name, Fallback font 1-3, Default), search, "Copy font URL", "+ Add font" (WOFF/WOFF2) | ❌ Missing | The builder font is a fixed system stack with no picker (`lib/emailTypes.ts:41-46,97`); global styles expose only colours (`BlockPropertyEditor.tsx:827-834`); the brand kit stores `fontFamily` but nothing renders it (`routes/brandKit.ts:64-75`; `brandKitService.ts:23,95`) | Font picker (web-safe, Google Fonts, uploaded WOFF/WOFF2) with a fallback stack, defaulting to the brand-kit font. The basic font picker is module 02's row. | P3 | M |
| Email > PII tokenization | Email PII tokenization (address fetched from the brand at send time) | Locked banner (contact CSM) | ❌ Missing | Addresses are stored in `customers.email` and sent directly; no send-time lookup (searched tokeniz) | Enterprise and regulated use case; low relevance for Shopify D2C. | P3 | L |
| Email > Dynamic sender routing | Rule-based sender routing with fallback | Locked banner; app code shows rules over 2-5 senders with a fallback | 🟡 Partial | Only a hard-wired failover: if the ESP errors or returns no message id, `sendEmail` retries through the platform Resend account with the same From (`emailService.ts:56-89`). No rules, no multiple senders | Rule-based routing with an explicit fallback sender. Low priority for D2C. | P3 | L |
| Email > App Marketplace | Bring-your-own ESP connectors (SendGrid, Amazon SES, Mandrill, SparkPost, Netcore) | App Marketplace > Emails, "+ Add integration" per connector | 🟡 Partial | Resend, SendGrid, Mailgun, Postmark and SES are registered (`providers/index.ts:19-23`); no Mandrill, SparkPost or Netcore. Only Resend has an events webhook, verified with one platform-wide secret (`resendWebhook.ts:12`), so SendGrid, SES, Postmark, Mailgun and a merchant's own Resend account get no delivery, open, click or bounce data and no auto-suppression; provider-side suppression sync is a no-op (`suppressionSync.ts:8-15`) | Event webhooks for SendGrid, SES (through SNS), Postmark and Mailgun with per-project secrets; SparkPost or Netcore if Indian deals need them. | P1 | M |
| Email > App Marketplace | Custom SMTP / "Add custom service provider" | Listed as email sender options (app code) | ❌ Missing | No SMTP transport (searched smtp, nodemailer); only the 5 HTTP adapters (`providers/index.ts:19-23`) | SMTP adapter (host, port, TLS, auth) for regional and in-house mail servers. | P2 | M |
| Email (all tabs) | IP pools / dedicated IPs | Not exposed anywhere in Email settings (capture: "Not found") | ➖ N/A | Neither product exposes it; with your own ESP, dedicated IPs live in the ESP account (the SendGrid adapter sends no `ip_pool_name`, `httpEmailProviders.ts:30-60`) | No gap versus MoEngage. | — | — |
| SMS & RCS > Sender configuration | SMS service provider connection | "Add SMS Sender": Service Provider (Twilio, Gupshup, Kaleyra, Sinch, ICS, Pinpoint, Custom), Sender Details, Delivery tracking (app code) | 🟡 Partial | SMS card: Twilio (SID, token, From), Gupshup (user ID, password), Bird (key, sender name), Vonage (key, secret, From) and Pinnacle (`settings/page.tsx:364-375`). Blocking defect: every SMS adapter builds the body only from an `email_templates` row found by `templateId` (`twilioProvider.ts:7-17`; `gupshupProvider.ts:47-56`; `birdProvider.ts:7-16`; `vonageProvider.ts:7-16`), while SMS campaigns send `templateId: ''` with the text in `variables.message` (`campaigns/create/page.tsx:611`; `campaignService.ts:1027-1039`), so campaign SMS reach the provider with an empty body (Twilio rejects it). Pinnacle has no SMS adapter (`providers/index.ts:26-29`): sends fall through to a legacy env-configured stub that ignores the saved key and number and sends no phone number (`deliveryService.ts:170-174`; `pinnacleProvider.ts:15-36`), or fail with "Resend only supports email" | Fall back to `variables.message` in a shared `resolveBody`; implement or remove Pinnacle SMS. Only one provider per project today. Same root cause as module 03's P0. | P0 | S |
| SMS & RCS > Sender configuration | Sender details: sender type, name and ID, several senders, Mark as default | Twilio: Short Code, Long Code, Messaging Service, Alphanumeric Sender ID; Sender name, Sender ID, "Mark as default" (app code) | 🟡 Partial | One From per provider (Twilio `fromNumber`, Bird `originator`, Vonage `from`); Gupshup has no sender ID (mask/header) field (`settings/page.tsx:365-372`; `gupshupProvider.ts:64-73`); no Messaging Service SID, several senders or default (one config per channel, `routes/ai.ts:300-312`) | Sender records with type and ID per provider (including the Gupshup mask), several senders per project, a default. | P2 | M |
| SMS & RCS > Sender configuration | MMS-capable sender | Checkbox "This sender supports MMS" (app code) | ❌ Missing | Text only; the Twilio call posts From, To and Body with no MediaUrl (`twilioProvider.ts:27-36`) | MMS media for Twilio and Bird; mostly a US use case. | P3 | S |
| SMS & RCS > Sender configuration | Message encryption (Basic / Advanced) | Basic protects the connection; Advanced encrypts content with MoEngage's public key (app code) | ❌ Missing | Plain HTTPS provider calls with no payload-encryption option (`services/providers/*.ts`) | Enterprise or BFSI need, mainly for custom connectors; not needed for D2C. | P3 | M |
| SMS & RCS > Sender configuration | Two-way SMS / Mobile Originated (MO) callback URL | "Two-way SMS" with an MO callback URL (app code) | ❌ Missing | Inbound SMS is ignored: Twilio inbound is parsed only when From starts with `whatsapp:` (`channelWebhooks.ts:65-76`); Bird and Vonage parse WhatsApp only (`:149-158`, `:194-201`); no MO callback setting. Event Sources can log JSON callbacks as generic events (`routes/hooks.ts`), with no SMS handling | Parse inbound SMS into events, consent keywords and the inbox; show each provider's MO callback URL. | P2 | M |
| SMS & RCS > Sender configuration | SMS unsubscribe text | "SMS unsubscribe text" per sender (app code) | ❌ Missing | No opt-out footer in the adapters (`services/providers/*.ts`) or the SMS composer (`campaigns/create/page.tsx:2837-2865`) | Optional per-sender opt-out text; mainly for US and EU traffic (India relies on DND and DLT). | P3 | S |
| SMS & RCS > Sender configuration | Send test SMS | "Send test SMS" from sender configuration (app code) | ❌ Missing | Test sends exist only for email (`routes/campaigns.ts:698`) and WhatsApp templates (`routes/whatsappAdmin.ts:546`); SMS adapters always read `customers.phone` (`twilioProvider.ts:7-16`) | Test send to a typed number from SMS settings and the composer; it would have caught the empty-body defect. Module 03 rates the builder test send P0. | P1 | S |
| SMS & RCS > Sender configuration | Remaining SMS credits / balance | "Remaining SMS Credits" per sender (app code) | ❌ Missing | No SMS adapter looks up a balance (`twilioProvider.ts`, `gupshupProvider.ts`, `birdProvider.ts`, `vonageProvider.ts`) | Show the provider balance where the API allows it. | P3 | S |
| SMS & RCS > Sender configuration | Custom SMS connector (generic HTTP) | Provider name, API URL, method, URL parameters, headers, body type, BULK/SINGLE, auth; keys Moesms_destination, Moesms_message, Moesms_campaignId (app code) | 🟡 Partial | No generic SMS sender. Closest is the flow `http_request` node (any method, URL, headers and body template with `{{customer_phone}}`, `shared/src/types.ts:733-747`; `flowExecutor.ts:815-877`): flows only, with no consent or cap gates, no receipts and no campaign use | Configurable HTTP SMS provider (URL, method, headers, body template with phone, message and DLT keys, auth, message-id path, receipt mapping). The quickest route to MSG91, Karix and ValueFirst. | P1 | M |
| SMS & RCS > Sender configuration | India DLT template ID, entity ID and sender header | Map "DLT Template ID" as Moesms_dltTemplateId (app code) | ❌ Missing | No DLT template ID, PE ID or header anywhere (searched dlt, peId, entity_id, sender header); Gupshup sends only send_to, msg, userid and password (`gupshupProvider.ts:64-73`) | DLT template ID per SMS template, PE ID and header per sender, passed to Indian gateways. Indian operators reject commercial SMS that doesn't match a registered template. Same gap as module 03's P0. | P0 | M |
| SMS & RCS > Sender configuration | SMS delivery tracking (DLR callback, message-id and status mapping) | Callback URL per vendor; unique ID from the provider or Moesms_MessageId; status field mapped; can't be switched off once saved (app code) | 🟡 Partial | Receipt webhooks for Twilio, Bird and Vonage update `messages` and campaign counters (`channelWebhooks.ts:43-208`; `messageStatusService.ts:24-78`). But Twilio sends set no `StatusCallback` (`twilioProvider.ts:27-36`); the Vonage adapter uses the legacy SMS API (`message-id`, `vonageProvider.ts:18-35`) while the handler reads `message_uuid` (`channelWebhooks.ts:167-190`); Gupshup SMS receipts aren't handled (its webhook treats everything as WhatsApp, `:86-121`); no webhook is signature-checked; settings show no callback URLs | Set a callback URL on every send; fix the Vonage receipt shape; add Gupshup enterprise DLRs; verify provider signatures; show callback URLs in settings. | P1 | M |
| SMS & RCS > Sender configuration | RCS senders | "RCS channel is not enabled"; app code shows "Add RCS Sender" through partner vendors | ❌ Missing | No RCS code in the backend or shared types; the only mention is the Pinnacle card text "SMS + RCS messaging with rich media" (`settings/page.tsx:373`) | RCS sender through an Indian RBM vendor (Pinnacle, Gupshup or Route); drop the claim until then. | P2 | L |
| SMS & RCS > RCS template management | RCS template library (rich cards, carousels, approval status, filters) | Not enabled; app code shows a template table, "Filter approved templates" and "Add Template" | ❌ Missing | No RCS template model. Reusable base: WhatsApp template authoring, approval sync and carousels (`routes/whatsappAdmin.ts`; `providers/metaWhatsappProvider.ts`) | RCS template library reusing the WhatsApp template lifecycle, once RCS senders exist. | P2 | M |
| SMS & RCS > General settings | Mobile-number attribute and number format | "User attribute that stores user's mobile numbers" = Mobile Number (Standard); app code mentions "Set the mobile number format" | 🟡 Partial | The number is always `customers.phone` (`schema.ts:131`); reachability is `!!phone` (`deliveryService.ts:479-481`); phones are only stripped of separators (`identityGraphService.ts:28-30`), and +91 is added only for 10-digit numbers in the opt-in widget (`routes/v1OptIn.ts:128-135`) | Default country code and E.164 normalisation setting applied at ingestion. | P3 | S |
| SMS & RCS > Subscription management | SMS opt-out management (exclude users not opted in) | Toggle "Opt-out users": excludes users whose SMS Subscription Status isn't OPTIN; custom criteria (app code) | 🟡 Partial | Opt-out model: sends are allowed unless an explicit `opted_out` consents row exists (`deliveryService.ts:347-385`); Shopify's SMS consent (`sms_subscribed`) isn't read at send and there's no "require opt-in" toggle. Workaround: "SMS Subscribed is true" or "Reachable on SMS" in the audience (`domainRegistry.ts:36,181`; `segments/src/evaluator.ts:929-930,1139-1140`) | Per-channel "require opt-in" toggle enforced in campaigns and flows, using Shopify SMS consent. | P2 | S |
| SMS & RCS > Keyword management | Keyword management (STOP/HELP/START, confirmation replies, general response, lead capture) | Not enabled; app code shows Opt-In, Opt-out and Help categories with auto-replies, reserved START/UNSTOP/YES, general response and lead capture (Twilio, Sinch, Pinpoint only) | 🟡 Partial | WhatsApp only: inbound STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPTOUT or START, YES, SUBSCRIBE, OPTIN, UNSTOP flip WhatsApp consent for every WhatsApp provider (`whatsappInboundService.ts:10-20,160-164,295-356`). No SMS inbound, HELP keyword, confirmation reply or configuration, and these changes skip `consent_audit_log` | Configurable keyword sets with auto-replies; extend to SMS once inbound SMS is parsed; route keyword changes through `updateConsent` so they are audited. | P2 | M |
| SMS & RCS > PII tokenization | SMS PII tokenization (number fetched from the brand's API at send time) | Locked; app code shows a request URL with parameters and headers | ❌ Missing | Phones are stored in `customers.phone` and read at send (`twilioProvider.ts:7-16`) | Enterprise and BFSI need; low relevance for D2C. | P3 | L |
| SMS & RCS > Dynamic Sender Routing | SMS sender routing (2-5 senders, send and delivery-rate rules, fallback, return to primary) | Locked; rules and fallback in app code | ❌ Missing | One SMS provider per project (`routes/ai.ts:300-312`; `channelProviderRegistry.ts:169-202`); when none is set, delivery falls back to the platform's env Twilio account, not another merchant sender (`channelProviderRegistry.ts:216-221`) | Failover between senders (mainly useful for OTP). | P3 | L |
| SMS & RCS > App Marketplace | SMS provider catalogue (Gupshup, Kaleyra, ICS, Sinch, Twilio, Vonage, Route Mobile, Infobip, ValueFirst, Airtel IQ, Karix and more) | 18 SMS connectors, including the main Indian aggregators | 🟡 Partial | 4 working SMS adapters: Twilio, Gupshup enterprise, Bird and Vonage (`providers/index.ts:26-29`), plus a Pinnacle card with no adapter (`settings/page.tsx:373`). No Kaleyra, Route Mobile, ValueFirst, Karix, Airtel IQ, Infobip or MSG91 | Add the top Indian aggregators, or ship the generic HTTP connector to cover them. | P1 | M |
| Settings navigation | Channels settings group with Settings Home and search | Flyout with search, Settings Home and a Channels group (Push, Email, SMS, WhatsApp, Delivery Controls, Preference Management); icon cards with one-line descriptions | 🟡 Partial | Tabs: SDK & Integration, Project, Brand, Ad Conversions, Webhooks, Billing, Account, Security, Dealers, Team, Roles (`settings/layout.tsx:12-27`). Channel providers sit under SDK & Integration > Channels (`settings/page.tsx:47-57,336-337`); the email domain and frequency caps under Project (`settings/project/page.tsx:107-109`). No per-channel pages, settings home, search or preference-management page | Settings > Channels with one page per channel and consistent sub-tabs, plus settings search. | P2 | M |
| Settings (all channels) | Role-based access to channel credentials | Channel setup stays visible but is locked per role: Add and Setup buttons disabled with "Your role does not have permission..." (017, 030, 044) | 🟡 Partial | The UI hides SDK & Integration from non-admins (`settings/layout.tsx:13,36-40`), but `POST /api/ai/config` and `GET /api/ai/channel-config` check only project access (`routes/ai.ts:256,280`; `index.ts:198`), so manager and agent logins can overwrite credentials through the API. Secrets sit unencrypted in `projects.settings` (`routes/ai.ts:314-327`; the existing `services/encryption.ts` is not used), and `redactSecrets` misses SES `secretAccessKey` and `sessionToken` and Bird `accessKey` (`routes/ai.ts:370-376`), which the GET returns in full | `requireRole('admin')` on both routes; encrypt at rest with `encryption.ts`; redact every password-type field. | P1 | S |

### Storees-only strengths

- **Email works with no setup, and falls back automatically when the merchant's ESP fails** (`emailProviderRegistry.ts:45-79,93-99`; `emailService.ts:56-89`). A new Shopify merchant can send campaigns and flows on day one, with no DNS work or ESP account; MoEngage's Email Overview shows "No senders configured!" until a sender is set up (016). Caveats: the shared pool's reputation and a generic `noreply` From, and the fallback reuses the brand's From on the platform Resend account, so it fails if that domain isn't verified there.
- **Per-customer consent audit trail** (`consentService.ts:21-108`; `components/customers/ConsentTab.tsx`; `GET /api/onboarding/projects/:id/consent-export` in `routes/v1Onboarding.ts:898-1000`, admin plus `exportCustomers`). Every change made through the consent service writes an append-only row with channel, purpose, action, source, IP and the exact consent text, visible on the customer's Consent tab, and a date-range CSV export exists. MoEngage's subscription settings show only a CSV "Update history" (026). This is what Indian DPDP audits and Meta WABA quality disputes ask for. Caveats: the export has no button, and WhatsApp STOP/START keywords and Shopify consent syncs bypass the log.
- **On-site opt-in widgets that capture WhatsApp and email consent** (`sdk/src/widget.ts:25,88-150`; `routes/v1OptIn.ts:81-224`; admin editor at `app/(dashboard)/widgets/page.tsx`, not linked from the sidebar). Exit-intent, time-on-page, scroll-depth and manual triggers with show-once; submissions record consent with the widget's exact text and IP (with a honeypot and per-IP rate limit) and fire `optin_received` for flows. MoEngage keeps soft-ask prompts for web push only; Storees already has them for WhatsApp, the channel Indian D2C cares about most, and the same trigger engine can power a future web push soft ask.

### UX notes

- **Information architecture** (016, 018, 030, 038, 039). MoEngage gives Push, Email and SMS their own pages with the same kinds of pill tabs (Sender configuration, General settings, Subscription management, Keyword management, PII tokenization, Dynamic sender routing), reached from a searchable flyout and a Settings Home card grid. Storees scatters the same settings: provider credentials are a "Channels" sub-section of "SDK & Integration" (`settings/page.tsx:47-57,346-653`), the sending domain and frequency caps live under "Project" (`settings/project/page.tsx:107-109`), and suppression, consent and categories have no screen. Adopt Settings > Channels > Email / SMS / Push / WhatsApp with the same sub-tabs on each (Provider & senders, General, Subscription & suppression, Tracking) and move the domain card into Email.
- **Readiness at a glance** (016). MoEngage's Email Overview shows both setup paths and their state in one card. Storees should add an email readiness checklist: provider in use, domain verified, default sender, unsubscribe link and List-Unsubscribe live, engagement webhook connected. Today a merchant can pick SendGrid, Postmark, Mailgun or SES and never learn that opens, clicks, bounces and complaints won't be tracked, and the Resend domain card doesn't say it has no effect for those ESPs.
- **Honest capability states** (029, 031, 035, 017, 030). MoEngage labels unavailable features with an explicit "not enabled for your account" banner and locks role-restricted actions with disabled buttons and tooltips. Storees' cards over-claim:
  - Pinnacle: "SMS + RCS messaging with rich media", but there is no SMS or RCS adapter (`settings/page.tsx:373`).
  - FCM: "Android + iOS + Web push", but there is no web push (`:397`).
  - Email: "Resend active, multi-ESP routing ready", but only one provider can be saved and it overwrites both the marketing and transactional provider (`:403`; `routes/ai.ts:315-325`).
  - SMS: "5 providers available", of which 4 work (`:404`).
  - The domain card says the shared pool "is rate-capped to protect platform reputation" (`settings/project/page.tsx:282-284`), but campaign and flow emails bypass `emailRateLimit`.
  Replace these with accurate copy or "Coming soon" cards.
- **Default exclusions and suppression updates** (024, 026). MoEngage states plainly that it won't send to Bounce, Spam or Unsubscribe addresses and offers a CSV upload with a sample file and an Update history table. Storees has the tables (`email_suppressions`, `consents`, `consent_audit_log`) but no screen. Add a Subscription & suppression tab: suppressed addresses by reason with search, CSV import and resubscribe, and a history view on the existing audit log.
- **Role gating** (017, 030, 044). MoEngage keeps channel setup visible but locks it per role. Storees hides the whole "SDK & Integration" tab from non-admins, yet the API behind it accepts any project member and returns some secrets in full (see the role-based access row). Match the backend to the UI.
- **Credential forms** (001, 002). MoEngage uses one required drag-and-drop field per credential and keeps Save disabled until it's valid. Storees' FCM form is friendlier on input: upload or paste, "JSON loaded (x KB)", and the project ID derived from the key (`settings/page.tsx:556-605`; `fcmProvider.ts:82-86`). But nothing validates or tests the credentials, and the channel cards show no connected or last-error state. Add "Send test" per channel, like the existing WhatsApp template test-send.
- **Where Storees is better.** The sending-domain card coaches the user: it recommends a subdomain, warns inline against noreply inboxes, gives a copyable DNS table and a Verified/Pending/Failed badge (`settings/project/page.tsx:202-411`). That is clearer than MoEngage's empty "MoEngage email setup not found!" state (017). Keep it, but make the address the default sender only once the domain verifies.
- **Save behaviour** (018, 019). MoEngage uses one long form with a sticky Save and a banner saying changes can take up to 15 minutes. Storees saves each channel immediately, but SMS, WhatsApp and push configs are cached for 5 minutes per process and only the instance that handled the save clears its copy (`channelProviderRegistry.ts:158-186`). On several instances, others keep the old credentials for up to 5 minutes. Show a propagation note or move the cache to Redis with invalidation.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status.

**Searches.** Missing and partial rows were searched under synonyms across frontend, backend (routes, services, workers, schema, migrations), shared, segments, flows, sdk and sdk-react:
- push: apns, p8, bundleId, teamId; huawei, hms; serviceWorker, PushManager, requestPermission, vapid, webpush, firebase-messaging-sw; badge and notification icon; subdomain;
- exclusions: exclusion, blocklist, universal control, global control, DND, quiet hours, requireOptIn;
- email: warm, postmaster, tokeniz, double opt-in, view in browser, webversion, mpp, bot, pixel and image/gif routes, juice, sanitize, tidy, fontFamily, smtp, nodemailer, sparkpost, mandrill, netcore, ip_pool;
- unsubscribe and suppression: `unsubscribe_url`, `getOrCreateToken`, List-Unsubscribe, every `emailSuppressions` and `customer_subscriptions` writer, every `insert(messages)`, every `email_read` and `email_opened` emitter, suppress and CSV in routes and frontend, preference centre;
- SMS: rcs, dlt, peId, entity_id, sender header, MediaUrl, mms, balance, test-send, test-sms, test-push, sendTest, keyword, inbound branches of every channel webhook.

**Rows changed:**
- **Show iOS impressions: ➖ N/A → 🟡 Partial (P3, M).** The app-reported receipt endpoint (`channelWebhooks.ts:214-235`) already feeds delivered counts, so an iOS Notification Service Extension can report impressions; what is missing is an SDK or recipe, an iOS setting and authenticated receipts.
- **App version buckets and Top-5 OEMs: ➖ N/A → ❌ Missing (P3, L).** Storees does send app push to native apps (FCM tokens from merchant apps and connectors), so device analytics apply; nothing collects app version or manufacturer and campaign analytics have no device breakdown.
- **Brand-managed unsubscribe link: ✅ Full → 🟡 Partial (P2, S).** The only write-back is the admin-session `/api/consent` route (`index.ts:218`); the API-key routes offer opt-in only, and Shopify unsubscribes are ignored at send.
- **New row: Role-based access to channel credentials (🟡 Partial, P1, S).** MoEngage's role locks appear throughout the capture (017, 030, 044). Storees' credential routes check only project access, store secrets in plain JSON and return SES and Bird secrets unredacted.
- **Campaign preview defaults (🟡 kept): evidence and gap corrected.** The push editor already renders separate Android, iOS and Web frames (`MultiPlatformPushBlock.tsx:212-292`); the gap is the hard-coded "Storees" app name and generic icons, not the frames.
- **SMS service provider connection (🟡, P0 kept): evidence corrected.** Choosing Pinnacle doesn't simply fail: the send falls through to a legacy env-configured stub that ignores the saved key and number and posts no phone number (`deliveryService.ts:170-174`; `pinnacleProvider.ts:15-36`), or fails with "Resend only supports email". Twilio rejects the empty campaign body rather than sending a blank SMS.
- **Add sender domain and validate DNS (✅ kept): gap expanded.** Only Resend `domains.create` and `domains.get` are called, the UI can't change or remove a domain, and re-registering through the API swaps the From to the new domain while keeping the old Resend domain.
- **Web push rows: evidence added.** The DIY Firebase recipe in `docs/STOREES_INTEGRATION_GUIDE.md:531-615` hard-codes the favicon, uses a direct browser prompt and posts the token with the API secret from browser JavaScript; it is not a product feature, so the rows stay ❌.
- **Keyword management (🟡 kept): evidence added.** Keyword opt-outs write `consents` directly (`whatsappInboundService.ts:295-356`) and skip `consent_audit_log`.
- **SMS delivery tracking (🟡 kept): gap expanded.** None of the receipt webhooks verifies a provider signature.
- **Warm-up (❌ kept): evidence corrected.** `email_rate_per_minute` gates only delivery-queue jobs, so flow emails bypass it as well as campaign emails.
- **Storees-only strengths:**
  - *Consent audit trail:* corrected. The CSV export is API-only, and WhatsApp keyword and Shopify consent changes are not logged.
  - *Email deliverability lint:* removed. No email screen shows its findings, so it isn't yet a user-facing strength (module 02 scores it as a gap).
  - *Stale-list send guard (credited in module 01):* not credited. Its 90-day open check reads `email_opened` and `email_read` events (`campaignService.ts:360-372`), which are emitted only for messages with a `messages` row (`messageStatusService.ts:41-52`). Campaign and flow emails never write one, so every email audience counts as stale and Send Now returns 409 for any non-empty list.

**Overlaps with other modules (one fix each; don't double count in the roll-up):** the empty campaign SMS body, DLT and the SMS test send (module 03); the empty unsubscribe link, missing List-Unsubscribe header and unverified From (modules 01 and 02); ignored Shopify consent (module 01); web push (module 03). Module 02 and 06 also found that flow email steps look templates up by name instead of id (`flowExecutor.ts:678-682`), so the chosen template never sends; that defect isn't scored here.

**Confirmed unchanged:** all other rows. The cited code exists and behaves as described, every missing row's searches came up empty, and no row was left undecided.

- **Cross-module consistency review (completeness pass):** User attribute that stores the email address 🟡 → ❌, matching modules 01 and 02: there is no setting or picker, and email is always `customers.email`.

### Screens

#### Push > App push (Android FCM / iOS APNS)

![App push > Android (FCM): FCM private key (.json) upload, Save disabled](../screenshots/19-settings-push-email-sms-001-push-app-android-fcm.jpg)
*App push > Android (FCM): FCM private key (.json) upload, Save disabled*

![App push > iOS (APNS): .p8 key upload, Team ID, Key ID, Bundle ID, iPad bundle ID](../screenshots/19-settings-push-email-sms-002-push-app-ios-apns.jpg)
*App push > iOS (APNS): .p8 key upload, Team ID, Key ID, Bundle ID, iPad bundle ID*

![iOS (APNS) scrolled down: Impressions > 'Show iOS impressions' toggle (ON)](../screenshots/19-settings-push-email-sms-003-push-app-ios-apns-impressions.jpg)
*iOS (APNS) scrolled down: Impressions > 'Show iOS impressions' toggle (ON)*

#### Push > Web push (Configure / Notification opt-in)

![Web push > Configure: default icon, badge icon (Upload Image / Enter Image URL), sub-domain handling](../screenshots/19-settings-push-email-sms-004-push-web-configure.jpg)
*Web push > Configure: default icon, badge icon (Upload Image / Enter Image URL), sub-domain handling*

![Badge icon set to 'Enter Image URL' (unsaved local state, reverted afterwards)](../screenshots/19-settings-push-email-sms-005-push-web-badge-image-url-option.jpg)
*Badge icon set to 'Enter Image URL' (unsaved local state, reverted afterwards)*

![Web push > Notification opt-in: 'Enable web push opt-in' toggle (OFF)](../screenshots/19-settings-push-email-sms-006-push-web-notification-optin.jpg)
*Web push > Notification opt-in: 'Enable web push opt-in' toggle (OFF)*

#### Push > Preference management

![Push > Preference management: 'Exclude users' toggle (OFF)](../screenshots/19-settings-push-email-sms-007-push-preference-management.jpg)
*Push > Preference management: 'Exclude users' toggle (OFF)*

#### Push > Preview settings (Android / iOS)

![Preview settings > Android: app name, app icon, large app icon](../screenshots/19-settings-push-email-sms-008-push-preview-settings-android.jpg)
*Preview settings > Android: app name, app icon, large app icon*

![Preview settings > iOS: app icon (min 180x180)](../screenshots/19-settings-push-email-sms-009-push-preview-settings-ios.jpg)
*Preview settings > iOS: app icon (min 180x180)*

#### Push > Device analytics (App versions / OEMs & Browsers)

![Device analytics > App versions: 'App version buckets' empty with + Add bucket](../screenshots/19-settings-push-email-sms-010-push-device-analytics-app-versions.jpg)
*Device analytics > App versions: 'App version buckets' empty with + Add bucket*

![Unsaved bucket row: Bucket name\*, App versions\* (validation shown)](../screenshots/19-settings-push-email-sms-011-push-device-analytics-add-bucket-row.jpg)
*Unsaved bucket row: Bucket name\*, App versions\* (validation shown)*

![App versions dropdown: searchable, no versions (SDK not integrated)](../screenshots/19-settings-push-email-sms-012-push-device-analytics-app-versions-dropdown.jpg)
*App versions dropdown: searchable, no versions (SDK not integrated)*

![OEMs & Browsers: default top-5 OEMs and top-5 browsers](../screenshots/19-settings-push-email-sms-013-push-device-analytics-oems-browsers.jpg)
*OEMs & Browsers: default top-5 OEMs and top-5 browsers*

![OEMs multi-select list (Samsung, Xiaomi, Oppo, Realme, Vivo checked)](../screenshots/19-settings-push-email-sms-014-push-device-analytics-oems-dropdown.jpg)
*OEMs multi-select list (Samsung, Xiaomi, Oppo, Realme, Vivo checked)*

![Browsers multi-select: Chrome, Safari, Firefox, Edge, Opera](../screenshots/19-settings-push-email-sms-015-push-device-analytics-browsers-dropdown.jpg)
*Browsers multi-select: Chrome, Safari, Firefox, Edge, Opera*

#### Email > Overview

![Email > Overview: MoEngage sender (none configured) vs other email sender via App marketplace](../screenshots/19-settings-push-email-sms-016-email-overview.jpg)
*Email > Overview: MoEngage sender (none configured) vs other email sender via App marketplace*

#### Email > Sender configuration

![Sender configuration empty state; 'Setup MoEngage email' disabled (role permission)](../screenshots/19-settings-push-email-sms-017-email-sender-configuration-empty.jpg)
*Sender configuration empty state; 'Setup MoEngage email' disabled (role permission)*

#### Email > General settings

![General settings (top): default sender, email attribute, same-email subscription sync, tracking pixel, auto-format HTML](../screenshots/19-settings-push-email-sms-018-email-general-settings-top.jpg)
*General settings (top): default sender, email attribute, same-email subscription sync, tracking pixel, auto-format HTML*

![General settings (middle): bot interaction sensitivity, metric segregation, view-in-browser link](../screenshots/19-settings-push-email-sms-019-email-general-settings-middle.jpg)
*General settings (middle): bot interaction sensitivity, metric segregation, view-in-browser link*

![General settings (bottom): 'From' email address(es) table, empty](../screenshots/19-settings-push-email-sms-020-email-general-settings-from-addresses.jpg)
*General settings (bottom): 'From' email address(es) table, empty*

![Metric segregation tooltip (adjusted vs full open metrics)](../screenshots/19-settings-push-email-sms-021-email-general-metric-segregation-tooltip.jpg)
*Metric segregation tooltip (adjusted vs full open metrics)*

!['Set a default sender' dropdown: no senders](../screenshots/19-settings-push-email-sms-022-email-general-default-sender-dropdown.jpg)
*'Set a default sender' dropdown: no senders*

!['User attribute that stores user's email address' dropdown: searchable user-attribute list](../screenshots/19-settings-push-email-sms-023-email-general-email-attribute-dropdown.jpg)
*'User attribute that stores user's email address' dropdown: searchable user-attribute list*

#### Email > Subscription management (Preference management / Subscription categories / Suppression updates)

![Subscription management > Preference management: default exclusions (Bounce, Spam, Unsubscribe)](../screenshots/19-settings-push-email-sms-024-email-subscription-preference-management.jpg)
*Subscription management > Preference management: default exclusions (Bounce, Spam, Unsubscribe)*

![Subscription categories empty state; 'Configure subscription categories' disabled](../screenshots/19-settings-push-email-sms-025-email-subscription-categories-empty.jpg)
*Subscription categories empty state; 'Configure subscription categories' disabled*

![Suppression updates: CSV upload (disabled), sample CSV, SendGrid note, empty Update history](../screenshots/19-settings-push-email-sms-026-email-suppression-updates.jpg)
*Suppression updates: CSV upload (disabled), sample CSV, SendGrid note, empty Update history*

#### Email > Font management

![Font management: custom fonts table with fallback columns, empty](../screenshots/19-settings-push-email-sms-027-email-font-management.jpg)
*Font management: custom fonts table with fallback columns, empty*

#### Email > PII tokenization

![Email PII tokenization: not enabled (contact CSM)](../screenshots/19-settings-push-email-sms-028-email-pii-tokenization-locked.jpg)
*Email PII tokenization: not enabled (contact CSM)*

#### Email > Dynamic sender routing

![Email Dynamic sender routing: not enabled](../screenshots/19-settings-push-email-sms-029-email-dynamic-sender-routing-locked.jpg)
*Email Dynamic sender routing: not enabled*

#### SMS & RCS > Sender configuration (SMS / RCS)

![SMS sender configuration: 'Your role does not have permission to add new senders'](../screenshots/19-settings-push-email-sms-030-sms-sender-config-sms-no-permission.jpg)
*SMS sender configuration: 'Your role does not have permission to add new senders'*

![RCS sender configuration: RCS channel not enabled](../screenshots/19-settings-push-email-sms-031-sms-sender-config-rcs-not-enabled.jpg)
*RCS sender configuration: RCS channel not enabled*

#### SMS & RCS > RCS template management

![RCS template management: not enabled](../screenshots/19-settings-push-email-sms-032-sms-rcs-template-management-not-enabled.jpg)
*RCS template management: not enabled*

#### SMS & RCS > General settings

![SMS General settings: mobile-number attribute = Mobile Number (Standard)](../screenshots/19-settings-push-email-sms-033-sms-general-settings-mobile-attribute.jpg)
*SMS General settings: mobile-number attribute = Mobile Number (Standard)*

#### SMS & RCS > Subscription management

![SMS Subscription management: 'Opt-out users' toggle (OFF)](../screenshots/19-settings-push-email-sms-034-sms-subscription-optout-management.jpg)
*SMS Subscription management: 'Opt-out users' toggle (OFF)*

#### SMS & RCS > Keyword management

![Keyword management: not enabled](../screenshots/19-settings-push-email-sms-035-sms-keyword-management-not-enabled.jpg)
*Keyword management: not enabled*

#### SMS & RCS > PII tokenization

![SMS PII tokenization: not enabled](../screenshots/19-settings-push-email-sms-036-sms-pii-tokenization-not-enabled.jpg)
*SMS PII tokenization: not enabled*

#### SMS & RCS > Dynamic Sender Routing

![SMS Dynamic Sender Routing: not enabled](../screenshots/19-settings-push-email-sms-037-sms-dynamic-sender-routing-not-enabled.jpg)
*SMS Dynamic Sender Routing: not enabled*

#### Settings navigation context (Settings flyout + Settings Home channel cards)

![Settings flyout with the Channels group (Push, Email, SMS, WhatsApp, Delivery Controls, Preference Management)](../screenshots/19-settings-push-email-sms-038-settings-flyout-channels-group.jpg)
*Settings flyout with the Channels group (Push, Email, SMS, WhatsApp, Delivery Controls, Preference Management)*

![Settings Home: Channels cards with descriptions, plus Advanced, Reports & Alerts, Miscellaneous](../screenshots/19-settings-push-email-sms-039-settings-home-channels-cards.jpg)
*Settings Home: Channels cards with descriptions, plus Advanced, Reports & Alerts, Miscellaneous*

#### App Marketplace: Email ESP and SMS provider connectors (context for 'Setup other email sender')

![Marketplace > Emails: Sendgrid, Amazon SES, Mandrill, Mailmodo, SparkPost, Netcore (green check)](../screenshots/19-settings-push-email-sms-040-marketplace-emails-esp-connectors.jpg)
*Marketplace > Emails: Sendgrid, Amazon SES, Mandrill, Mailmodo, SparkPost, Netcore (green check)*

![Marketplace > SMS (top): Gupshup, Kaleyra, ICS, Sinch, Twilio, Vonage, Route mobile, Attentive, Infobip, Mtalkz, Times Mobile, Regal...](../screenshots/19-settings-push-email-sms-041-marketplace-sms-providers-top.jpg)
*Marketplace > SMS (top): Gupshup, Kaleyra, ICS, Sinch, Twilio, Vonage, Route mobile, Attentive, Infobip, Mtalkz, Times Mobile, Regal...*

![Marketplace > SMS (bottom): GallaBox, Sendbird, AiSensy, ValueFirst, Airtel IQ, Karix](../screenshots/19-settings-push-email-sms-042-marketplace-sms-providers-bottom.jpg)
*Marketplace > SMS (bottom): GallaBox, Sendbird, AiSensy, ValueFirst, Airtel IQ, Karix*

![Sendgrid partner page, Description tab](../screenshots/19-settings-push-email-sms-043-marketplace-sendgrid-description.jpg)
*Sendgrid partner page, Description tab*

![Sendgrid Integrate tab: '+ Add integration' disabled (no permission)](../screenshots/19-settings-push-email-sms-044-marketplace-sendgrid-integrate-no-permission.jpg)
*Sendgrid Integrate tab: '+ Add integration' disabled (no permission)*
