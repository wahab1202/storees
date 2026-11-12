# MoEngage vs Storees: feature parity report

**Report date:** 12 Nov 2026 · **MoEngage capture:** 11 Nov 2026, Test workspace on `dashboard-01.moengage.com` · **Storees:** code at commit `2063cdc`

This report rolls up 25 module sections that together cover every area of MoEngage's sidebar, its header and its Create New menu. Capture agents opened 266 page entries (pages, modals, drawers and wizard steps) read-only and saved 1,856 screenshots. Each MoEngage feature found (1,469 rows) was checked against the Storees code with file and line evidence, and a second verification pass re-checked every row against the code (315 corrections to statuses, priorities, efforts and evidence). A final completeness review aligned 18 rows whose status contradicted the same feature in another module. An independent re-check then traced all 17 shipped-code P0 defects end to end: every one holds, and the two that had overstated parts are corrected ([Appendix A](#a-method-and-legend)).

**Caveats**
- **Empty workspace.** The MoEngage Test workspace has its SDK integration pending, so analytics, event pickers and lists were empty. We captured UI and options, not data.
- **Locked areas.** Paid add-ons and screens locked for the Developer login (Inform, Personalize, Recommendations, Warehouse Segments, Computed Traits, My Studio, Cards, RCS, Drafts and some settings) were described from MoEngage's front-end code or public docs. The sections label these rows.
- **Read-only rules.** Agents did not save, publish or send anything, and typed only into name and search fields. Steps that needed a save, typed input or a configured channel were not seen, for example email step 3, on-site steps 2-3 and "Use Template" for flows. One on-site draft auto-saved on the first click; see [Appendix C](#c-side-effects-to-clean-up-in-moengage).
- **Storees from code.** Storees was judged from its code, not a running instance. A few findings marked "read from code, not run" should be confirmed live.

**Coverage.** Every item in MoEngage's sidebar, header and Create New menu was opened. Inside those pages, most popups, dropdowns and wizard steps reachable without saving were captured, but not all of them. States that needed data, a different role, a paid add-on or a write could not be reached. Some reachable screens were skipped as near-duplicates or left unopened, for example push templates other than Basic, the email template gallery's later pages and about 120 of the 165 partner detail pages. [Appendix B](#b-what-was-not-covered-and-why) lists the gaps by module.

---

## 1. Executive summary

- **Overall parity is about one third: 33.0%.** Of 1,469 MoEngage features:
  - 124 are full, 618 partial and 635 missing in Storees.
  - 33 are better in Storees, and 59 don't apply.

  Parity is highest in the WhatsApp builder (54%) and in Segment and Engage (both 41%). It is lowest in Reports (13%), Analyze (18%), Content (18%) and Settings (24%).
- **Storees genuinely leads in six places:**
  - **WhatsApp operations:** templates are authored, linted (30 rules), submitted and tracked inside the campaign, with a shared Inbox and AI chatbot, Storees-managed numbers, and usage and spend by category.
  - **Shopify-native data:** one install approval provisions data, segments and flows; segments have same-order and product-scoped spend conditions.
  - **Pre-send audience diagnostics and holdout lift.**
  - **Zero-setup RFM and prediction goals:** AUC tracking and rollback.
  - **Admin debugging:** an identity-stitching Event Debugger and no-code Event Sources.
  - **Smart content on every plan:** per-recipient recommendations in every channel, where MoEngage needs its Enterprise plan.
- **The biggest deal risk is broken features, not missing ones.** The 53 P0 rows collapse into 27 items, and 17 of them are defects in code that already ships. A live trial or demo would hit several:
  - SMS campaigns send blank bodies.
  - Flow email steps send a hard-coded "You left something behind!" email.
  - Push drops its title, image and click URL, and the In-App channel fails every recipient.
  - A campaign with no audience picked goes to the whole base.
  - Flow branches fall through, and fixed-time flows misfire.
- **Compliance gaps block India deals.**
  - Campaign and flow emails have no working unsubscribe link and no List-Unsubscribe header.
  - Shopify opt-outs and bounces are not honoured, and flow emails skip suppression.
  - SMS has no DLT template, entity or header IDs, so Indian operators reject it.
- **Security P0s:**
  - Server-only import and event APIs accept the public storefront key, so anyone can bulk-write customers and orders or overwrite a customer's phone.
  - The social-login callback issues a 24-hour session, including super-admin, for any email.
  - The flow HTTP node has no SSRF guard.
  - A Shopify reinstall wipes every channel credential.
- **Marketer self-serve trails MoEngage.**
  - There is no CSV import or file segment, and city/state and custom attributes can't be targeted.
  - There are no cross-channel campaign stats, saved reports, custom dashboards or configurable alerts. The only data exports are a hashed ad-audience CSV, one customer's GDPR export and an API-only consent CSV.
  - The funnel ignores step order, and trends can't be filtered to one event.
- **Recommended focus:**
  1. A hardening pass on the 10 S-effort P0s (plus the S first steps of five more), security first.
  2. One email ledger (log every email send), then unsubscribe and suppression. Flow conditions, caps and campaign stats all depend on it.
  3. India readiness: DLT, a generic HTTP SMS connector and quiet hours.
  4. Self-serve data: attributes, file segments and CSV import.
  5. Proof of revenue: flow revenue, coupons, campaign stats and CSV reports.

  Meanwhile, lead demos with WhatsApp, Shopify-native data and measurement.

---

## 2. Scorecard

Parity = (✅ + ⭐ + 0.5 × 🟡) / (rows − ➖). "P0 / P1" counts the rows in each section's parity table before de-duplication. Click a module to open its section.

| Module | ✅ Full | 🟡 Partial | ❌ Missing | ⭐ Storees better | ➖ N/A | Parity | Screens | P0 / P1 | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| [01 Engage > Campaigns: list, picker, audience step](modules/01-engage-campaigns.md) | 13 | 36 | 26 | 1 | 3 | 42.1% | 84 | 3 / 6 | Wizard, nested audience builder and holdouts match; list tooling and cross-campaign stats missing; three P0 send defects |
| [02 Campaign builder: Email](modules/02-builder-email.md) | 16 | 37 | 27 | 0 | 1 | 43.1% | 127 | 2 / 8 | One-time email works end to end; editor depth well behind Beefree; flow-email lookup and unsubscribe are P0 |
| [03 Campaign builder: Push & SMS](modules/03-builder-push-sms.md) | 6 | 30 | 29 | 1 | 5 | 33.3% | 147 | 5 / 10 | The builder collects far more than the send path uses: blank SMS, push drops content, no DLT or test sends |
| [04 Campaign builder: WhatsApp](modules/04-builder-whatsapp.md) | 16 | 27 | 15 | 4 | 2 | 54.0% | 64 | 1 / 13 | Strongest module: template authoring, lint and diagnostics lead; empty-audience send, carousels and sync bugs to fix |
| [05 On-site, In-app, Cards, connectors, ad audiences](modules/05-builder-onsite-inapp-other.md) | 4 | 37 | 27 | 0 | 4 | 33.1% | 117 | 1 / 12 | Only an unlinked opt-in popup; the In-App channel renders nowhere (P0); no on-site builder or ad sync |
| [06 Flows](modules/06-flows.md) | 10 | 33 | 27 | 2 | 0 | 39.6% | 124 | 5 / 17 | Working journey builder with strong WhatsApp and HTTP steps; five P0 engine defects; thin entry rules |
| **Engage subtotal** | **65** | **200** | **151** | **8** | **15** | **40.8%** | **663** | **17 / 66** | |
| [07 All Segments, builder, Search Users, profile](modules/07-segments-builder-profiles.md) | 10 | 40 | 20 | 4 | 1 | 45.9% | 102 | 3 / 11 | Commerce-native engine ahead in places; no file segments, city or custom-attribute targeting (P0s) |
| [08 RFM, Predictive & Warehouse segments](modules/08-segments-rfm-predictive-warehouse.md) | 10 | 19 | 20 | 6 | 2 | 46.4% | 47 | 2 / 4 | Zero-setup RFM and deeper model management, but neither leads to targeting yet (bucket bug) |
| [09 File segments, user imports & exports](modules/09-segments-files-imports-exports.md) | 0 | 20 | 20 | 1 | 3 | 26.8% | 61 | 3 / 13 | No marketer-facing import, file segments or export history; ingestion is engineer- and admin-side |
| **Segment subtotal** | **20** | **79** | **60** | **11** | **6** | **41.5%** | **210** | **8 / 28** | |
| [10 Analyze: My Studio, Users, Behavior, Funnels](modules/10-analyze-core.md) | 1 | 27 | 45 | 0 | 2 | 19.9% | 135 | 3 / 16 | Unordered funnel and one fixed trend; no Users or Behavior analysis, segment filter, custom dates or exports |
| [11 Analyze: Retention, Session & Source, Paths, Acquisition, Uninstalls](modules/11-analyze-advanced.md) | 0 | 13 | 34 | 0 | 5 | 13.8% | 77 | 0 / 9 | Only a cohort heatmap with counting defects; no Session & Source or User Paths |
| **Analyze subtotal** | **1** | **40** | **79** | **0** | **7** | **17.5%** | **212** | **3 / 25** | |
| [12 Home, Dashboards, header, Create New](modules/12-home-dashboards.md) | 9 | 34 | 29 | 1 | 6 | 37.0% | 66 | 3 / 10 | Better landing dashboard; no campaign stats rollup, custom dashboards, exports, help or Create launcher |
| **Dashboards subtotal** | **9** | **34** | **29** | **1** | **6** | **37.0%** | **66** | **3 / 10** | |
| [13 Content: blocks, recommendations, landing pages, coupons](modules/13-content.md) | 0 | 18 | 32 | 0 | 1 | 18.0% | 116 | 3 / 8 | No content blocks, landing pages or coupons (P0); ahead on per-recipient smart content in every channel |
| **Content subtotal** | **0** | **18** | **32** | **0** | **1** | **18.0%** | **116** | **3 / 8** | |
| [14 Inform & Personalize](modules/14-inform-personalize.md) | 10 | 35 | 28 | 2 | 1 | 39.3% | 21 | 3 / 7 | Alerts run as flows with P0 gaps (fallback email, public-key API, DLT); Personalize almost absent |
| **Inform & Personalize subtotal** | **10** | **35** | **28** | **2** | **1** | **39.3%** | **21** | **3 / 7** | |
| [15 Reports](modules/15-reports.md) | 0 | 12 | 34 | 0 | 0 | 13.0% | 58 | 0 / 6 | No saved, scheduled or exported reports; the on-screen per-campaign report is strong |
| **Reports subtotal** | **0** | **12** | **34** | **0** | **0** | **13.0%** | **58** | **0 / 6** | |
| [16 Merlin AI Studio](modules/16-merlin-ai.md) | 3 | 17 | 19 | 2 | 1 | 32.9% | 39 | 0 / 4 | More in-context AI than Merlin, but no hub, image generation or metering; three shipped AI paths broken |
| **AI subtotal** | **3** | **17** | **19** | **2** | **1** | **32.9%** | **39** | **0 / 4** | |
| [17 Data imports & computed traits](modules/17-data-imports-computed-traits.md) | 0 | 21 | 16 | 0 | 3 | 28.4% | 70 | 1 / 7 | No file import or Data section; CLV and AOV are free; custom attributes not targetable (P0) |
| [18 Test & Debug, event log, integration guide](modules/18-test-debug-devtools.md) | 4 | 21 | 20 | 3 | 3 | 36.5% | 35 | 1 / 6 | Admin debugging beats MoEngage; activation (checklist, help, docs) and API auth (P0) lag |
| **Data & Dev tools subtotal** | **4** | **42** | **36** | **3** | **6** | **32.9%** | **105** | **2 / 13** | |
| [19 Settings: Push, Email, SMS & RCS](modules/19-settings-push-email-sms.md) | 2 | 26 | 33 | 0 | 2 | 24.6% | 44 | 5 / 11 | Credential forms and zero-setup email exist; unsubscribe, suppression, DLT and SMS wiring are P0 |
| [20 Settings: WhatsApp, delivery controls, preferences](modules/20-settings-whatsapp-delivery-preferences.md) | 2 | 10 | 15 | 1 | 3 | 28.6% | 18 | 1 / 8 | WhatsApp setup ahead after connection; no DND or cross-channel cap; email exclusion is P0 |
| [21 Settings: Accounts (general, API keys, MCP, team)](modules/21-settings-accounts.md) | 1 | 24 | 17 | 0 | 0 | 31.0% | 44 | 2 / 10 | Pieces exist but scattered; no time zone, key management, invites or permission matrix; two security P0s |
| [22 Settings: Analytics & data management](modules/22-settings-analytics-data-management.md) | 0 | 16 | 20 | 2 | 3 | 26.3% | 61 | 0 / 3 | Write-time dedup and live volumes beat MoEngage; no event or attribute catalog |
| [23 Settings: Advanced 1 (control groups, tags, locales, Content API, custom domain)](modules/23-settings-advanced-1.md) | 0 | 8 | 25 | 0 | 1 | 12.1% | 32 | 2 / 3 | None of the six pages exist; SSRF and tracked-button sync are P0 |
| [24 Settings: Advanced 2 & reports/alerts (auth, UTM, attribution, alerts, Inform)](modules/24-settings-advanced-2.md) | 3 | 17 | 31 | 0 | 3 | 22.5% | 45 | 2 / 6 | UTM and goals live only inside builders; no alerting; shares the flow-email and flow-revenue P0s |
| **Settings subtotal** | **8** | **101** | **141** | **3** | **12** | **24.3%** | **244** | **12 / 41** | |
| [25 App Marketplace](modules/25-app-marketplace.md) | 4 | 40 | 26 | 3 | 4 | 37.0% | 122 | 2 / 5 | No catalog, but the Shopify install, Event Sources and WhatsApp paths go deeper; reinstall wipes settings (P0) |
| **Marketplace subtotal** | **4** | **40** | **26** | **3** | **4** | **37.0%** | **122** | **2 / 5** | |
| **Grand total (25 modules, 1,469 rows)** | **124** | **618** | **635** | **33** | **59** | **33.0%** | **1,856** | **53 / 213** | |

Screens are unique screenshot files. Sections 15 and 18 each embed one image twice, so they show 59 and 36 embeds.

---

## 3. Navigation and information architecture

MoEngage's menu comes from the live sidebar. Storees' comes from `packages/frontend/src/components/layout/Sidebar.tsx` and `packages/frontend/src/app/(dashboard)/settings/layout.tsx` at `2063cdc`.

| Area | MoEngage | Storees | Gap |
|---|---|---|---|
| Global chrome | **Header:** Merlin AI Studio link, Test/Live environment badge, "Assets" workspace selector, Need help, notifications bell, theme toggle, avatar menu. **Sidebar:** "+ Create New" launcher | **No top header:** `AppShell.tsx` renders only the sidebar and `TrialBanner`. **Sidebar:** logo, project switcher (a plain label with one project), a flat nav with count badges, and a user menu (Account, Security, Sign out). Phones get a top bar and drawer | No global Create, help, notifications, environments or dark mode ([12]) |
| Home / Dashboards | New Dashboard; Key Metrics, Campaign Stats, Reachability. Lands on All Campaigns | **Dashboard** (`/dashboard`): fixed Key Metrics, charts, AI Predictions, Segment Overview, Recent Activity. `/` redirects here | Better landing page; no Campaign stats, Reachability or custom dashboards ([12]) |
| Analyze | My Studio, Users, Behavior, Funnels, Retention, Session And Source, User Paths, Acquisition, Uninstalls | **Analytics** hub (`/analytics`): Funnels, Cohorts, Time Series, Time-to-Event, Product Analytics, Segment Transitions, Predictions | No Users, Behavior, Session & Source or Paths ([10], [11]) |
| Segment | New Segment, New User Import, New File Segment, Search Users, All Segments, RFM, Warehouse, Predictive Segments, User Imports, User Exports | **Customers:** the `/customers` directory and a 9-tab profile. **Segments:** `/segments` (RFM lifecycle card and segment cards) and `/segments/create`. Predictions live under Analytics | No imports, exports, or file or warehouse segments ([07]-[09]) |
| Engage | New Campaign, New Flow, All Campaigns, All Flows | **Campaigns**, **Flows** (admin), **Inbox** (WhatsApp shared inbox), **Templates** (admin) | `/campaigns/ctwa` (Click-to-WhatsApp report) is not linked anywhere ([01], [06]) |
| Inform | All Alerts (paid add-on) | None. Transactional alerts are event-triggered flows | [14] |
| Personalize | All Experiences (paid add-on) | None. Opt-in popups at `/widgets` exist but are not linked anywhere | [05], [14] |
| Reports | New Campaign Report, New Alert Report, Campaigns Reports, Alert Reports | None. Per-campaign report on `/campaigns/[id]`; **Notification Logs** (admin) | [15] |
| Content | Content Blocks, Recommendations, Landing Pages, Coupons | **Templates**: one cross-channel library with the AI Email Designer and the WhatsApp builder. Recommendations exist only as an API | [13] |
| Data | Data Imports, Computed Traits | **Event Sources** (admin); **Event Mapping** (super-admin); Data Sources inside `/projects` (super-admin). `/integrations` redirects there | [17], [22] |
| App Marketplace | A catalog of about 165 partners | None. Integrations are spread over Settings > SDK & Integration (Setup, Channels, AI), Ad Conversions, Webhooks, Event Sources and Projects > Data Sources | [25] |
| Test and Debug | Integration Validation, SDK Logger, Segment Payload, Jinja AI | **Event Debugger** and **Notification Logs** (both admin); snippets and the SDK badge in Settings > SDK & Integration > Setup | [18] |
| Settings: Accounts | General Settings, API Keys, MCP, Team Management | **Project**, **Account**, **Security**, **Team**, **Roles** and **Billing** tabs; the key block in SDK & Integration > Setup; the full key list on super-admin `/projects` | No time zone, key management or MCP ([21]) |
| Settings: Analytics | Query Settings, Acquisition Tracking, Uninstall Tracking, Data Management | None. Data maintenance sits in SDK & Integration > Setup | [22] |
| Settings: Channels | Push, Email, SMS (and RCS), WhatsApp, Delivery Controls, Preference Management | **SDK & Integration > Channels**: Email, SMS, Push, and the WhatsApp panel with its chatbot. **Project**: email sending domain and frequency caps | No DND, throttling defaults or preference page ([19], [20]) |
| Settings: Advanced | Accessibility Controls, Control Groups, Tags, Locales, Content API, Custom Domain, Authorization Configuration, UTM Tracking, Conversion And Attribution | **Brand**, **Ad Conversions** and **Webhooks** tabs. Holdouts, UTM and goals live inside the builders | [23], [24] |
| Settings: Reports & Alerts, Others | Alert Management, Dashboard Subscriptions; Inform | None | [24] |
| Platform operator (Storees only) | Not applicable | **Event Mapping**, **Trials**, **Clients**, **Projects**, **New Project** wizard (super-admin) | |

**IA takeaways**
- **Flat versus grouped.** MoEngage groups the product by job in flyouts and adds a global Create launcher. Storees has a flat list of up to 11 role-gated items. Settings is a flat bar of up to 11 tabs, and the `/settings` sub-sections (Setup, Channels, AI) live in local state, so they can't be linked to.
- **Built but unreachable.** These exist in Storees but no menu reaches them:
  - **Not linked anywhere:** `/widgets` and `/campaigns/ctwa`.
  - **API only:** recommendations, the 30-template flow catalog and the consent-audit CSV.
  - **Super-admin only:** Data Sources and the API-key list. For everyone else, `/integrations` ends on a "Super admins only" page.
- **Roles.** Non-admins lose Templates, Flows, Event Sources, Event Debugger and Notification Logs, but keep Campaigns with full send rights ([21]).

---

## 4. Prioritized gap roadmap

The 53 P0 rows and 213 P1 rows in the module tables collapse into **27 P0 and 117 P1 items** below. Each item lists the modules whose rows it rolls up, whatever their priority there. "(also …)" marks other modules that mention the same gap in another row. The P0 lists were re-checked against every module; the P1 lists name the main modules. Effort is the relative size rated in the sections (S < M < L < XL). Item ids (P0-n, P1-n) are used in the build sequence.

**Path key.** `be/` = `packages/backend/src/` · `app/` = `packages/frontend/src/app/(dashboard)/` · `fe/` = `packages/frontend/src/` · `sdk/` = `packages/sdk/src/` · `seg/` = `packages/segments/src/` · `shared/` = `packages/shared/src/`. Line numbers are at `2063cdc`.

### 4.1 P0: fix or build first (27)

**A. Security and platform integrity**

| # | Gap | Why it matters vs MoEngage | Build on (Storees today) | Effort | Modules |
|---|---|---|---|---|---|
| P0-1 | **Server APIs accept the public storefront key.** Every `/api/v1` router uses `requirePublicKeyAuth`; the secret-checking `requireApiKeyAuth` is mounted nowhere. Anyone with a store's page source can bulk-import customers (with consent flags), orders, products and dealers. An event carrying a customer's email and a new phone overwrites that phone | MoEngage's Data APIs need the workspace ID plus a secret. In Storees a stranger can rewrite revenue and LTV, change product data shown in emails, or redirect a customer's WhatsApp and SMS alerts (OTPs) | `be/middleware/apiKeyAuth.ts:14-24,64-193` (hashed secret, IP allowlist); `be/routes/v1Import.ts:33`; `be/routes/v1Events.ts:103`. Keep the public key for SDK events only. Tenants need P1-111 to get a secret | S-M | [14], [18], [21] (also [09], [17], [25]) |
| P0-2 | **Social-login callback issues sessions for any email.** `POST /api/auth/oauth-callback` is public. Given an email, it finds or creates the user (bypassing closed registration) and returns a 24-hour JWT, super-admin included, without TOTP. Shopify-install logins also skip TOTP | Any member's account, including platform operators', can be taken over. MoEngage keeps login security at account level | TOTP with a pending token in password login (`be/routes/auth.ts:96-160`); NextAuth caller `fe/lib/auth.ts:95-108`. Add a shared server secret or verify the provider's ID token, add TOTP to social and Shopify logins, and rate-limit | S | [21] |
| P0-3 | **Flow HTTP Request node has no SSRF guard.** It calls `fetch(url)` without `assertPublicUrl`, follows redirects and has no size cap. The response is readable in the flow debugger and the customer trips API | Any project admin can call internal hosts (for example the ML service, which needs no auth) and read the result. MoEngage calls centrally registered APIs from its backend | `be/services/ssrfGuard.ts:13-35`, already used by `be/services/webhookService.ts:122` and `be/services/connectors/genericHttpConnector.ts:260`; node at `be/services/flowExecutor.ts:822-880` | S | [23], [06] (also [05], [12], [24], [25]) |
| P0-4 | **A Shopify reinstall or re-auth wipes project settings, and merchants have no Shopify screen.** Every OAuth callback runs `activatePack`, which resets `projects.settings` to `{ vertical }`. That erases channel credentials, the WhatsApp chatbot config and AI keys. Status, sync and disconnect endpoints exist, but no merchant UI calls them | Any scope change (the pixel extension and discount codes both need one) would silently disconnect WhatsApp, SMS, email and AI for every merchant. MoEngage's Shopify tile lets the merchant add and manage the connection | `be/services/verticalPackService.ts:296-299`; `be/routes/integrations.ts:127,285-405`. Merge settings instead, then add a Shopify card in Settings | S | [25] |

**B. Send-path correctness (what a demo or trial hits first)**

| # | Gap | Why it matters vs MoEngage | Build on (Storees today) | Effort | Modules |
|---|---|---|---|---|---|
| P0-5 | **SMS campaigns send an empty body.** SMS campaigns save no `templateId`, so the text travels only in `variables.message`, but every SMS adapter builds the body from a template row. The Pinnacle SMS tile has no adapter at all | Every SMS campaign is rejected or arrives blank. MoEngage's composer sends what was typed, with a live phone preview | `be/services/campaignService.ts:1027-1039`; `be/services/providers/twilioProvider.ts:7-17` (Gupshup, Bird and Vonage match). Fall back to `variables.message` in one shared `resolveBody`, as FCM already does; `be/services/providers/index.ts:25-29`; add a regression test | S | [01], [03], [12], [19], [25] (also [05], [14], [23], [24]) |
| P0-6 | **Flow email steps send a hard-coded fallback.** The step saves the template UUID, but the executor looks templates up by name with no project filter. When that fails it sends "You left something behind!". Seeded flows share template names across projects, so a lookup can render another brand's template. Flow emails also pass no From | Abandoned-cart, welcome and order-confirmation emails never send what was designed. MoEngage's Email node is the full campaign editor | `be/services/flowExecutor.ts:677-682,721-727,750`; `fe/components/flows/SendNodeConfigModal.tsx:197-221`. SMS, push and WhatsApp steps already load templates by id. Look up by id within the project and pass the project sender | S | [02], [06], [13], [14], [24] |
| P0-7 | **Push drops platform content, title, image and click action.** `pushContent` and `pushPlatforms` are saved but never read, and picking a platform hides the title and image fields. FCM gets a hard-coded `click_action`, no link, and every variable (including `customer_email`) in `data` | Pushes go out untitled and a tap opens nothing. MoEngage has Android, iOS and Web editors with deep links and key-value pairs | The editor already exists: `fe/components/campaigns/MultiPlatformPushBlock.tsx:66-205`. Build the payload in `be/services/providers/fcmProvider.ts:99-140` (map to `android`, `apns` and `webpush.fcm_options.link`); also send the campaign's per-platform content and replace the all-variables `data` map with an allow-list | M | [03] (also [01], [19]) |
| P0-8 | **An unset audience sends to every customer.** "Saved segment" with nothing picked, or a filter with no rules, saves no audience, and staging falls back to all customers. The confirmation still says "the selected segment" | This causes accidental whole-base blasts, which are paid per WhatsApp message and hurt WABA quality. MoEngage requires an audience and warns on "All users" | `app/campaigns/create/page.tsx:443-445,615-616`; `be/services/campaignService.ts:522-575`; `app/campaigns/[id]/page.tsx:262-282`. Reuse `validateFilterConfig` from the segment pages | S | [01], [04] (also [02], [03]) |
| P0-9 | **The In-App channel is offered, but nothing renders it.** No SDK calls the in-app API, and Send Now fails every recipient (`'in_app'` vs `'inapp'`). The API also serves raw `{{tokens}}` and ignores `segmentId`, exclusions, holdouts and A/B, so once an SDK does call it, saved-segment campaigns would reach every visitor | A buyer who tries In-App sees 100% failure, and no shopper ever sees the message. MoEngage's SDKs render full-screen, pop-up and nudge templates | `be/routes/v1InAppMessages.ts`; the renderer pattern in `sdk/src/widget.ts`; the mismatch at `be/services/campaignService.ts:1038` vs `be/services/deliveryService.ts:459-491`. Hide the channel (S) until a renderer ships. Renaming the channel alone only moves the failure: Send Now must activate in-app campaigns instead of dispatching them | S to hide; L to ship | [05] (also [01], [12], [15]) |
| P0-10 | **No test send for SMS or push, or from a flow send node.** Only email campaigns and WhatsApp templates can be tested, and SMS adapters can only send to `customers.phone` | MoEngage's "Test Campaign" sends to any ID, email, number or device token. A test send would have caught the blank-SMS bug | `be/routes/campaigns.ts:698` (test email); `be/routes/whatsappAdmin.ts:546` (WhatsApp test send). Allow a raw number or token, skip caps, and pick the variant and sample customer | M | [03], [06], [19] (also [14]) |

**C. Email and SMS compliance**

| # | Gap | Why it matters vs MoEngage | Build on (Storees today) | Effort | Modules |
|---|---|---|---|---|---|
| P0-11 | **No working unsubscribe in campaign or flow email.** <ul><li>`{{unsubscribe_url}}` is never set, so the link's href is empty.</li><li>No List-Unsubscribe or List-Unsubscribe-Post header reaches customers; only the legacy internal sender adds them.</li><li>Blank and column starters have no footer.</li><li>`GET /u/:token` unsubscribes on the first hit, so link scanners would opt people out.</li></ul> | This fails CAN-SPAM, DPDP and the Gmail/Yahoo bulk-sender rules. MoEngage inserts the link and RFC 8058 headers on every non-transactional email | Tokens in `be/services/unsubscribeService.ts:18-43`; RFC 8058 POST in `be/routes/unsubscribe.ts:19-75`; header code in `be/services/resendProvider.ts:83-101`; footer block in `fe/lib/emailCompiler.ts:173-178`. Add a headers field to `EmailSendCommand` (`be/services/emailProviderRegistry.ts:12-21`) and to the 5 adapters | S-M | [01], [02], [19], [20] |
| P0-12 | **Opt-outs and suppressions are not honoured.** <ul><li>Bounces and complaints from campaign and flow email are never suppressed: the Resend webhook resolves the project only through `messages` rows, which email never writes.</li><li>Shopify unsubscribes (`customers.email_subscribed`) are never checked.</li><li>Flow emails skip suppression and consent checks entirely.</li></ul> | Complainers, hard bounces and Shopify unsubscribes keep getting mail, which is a deliverability and legal risk. MoEngage excludes bounced, spam and unsubscribed addresses by default | Staging already drops `email_suppressions` and opted-out consents (`be/services/campaignService.ts:588-622`). Resolve the webhook via `campaign_sends.resend_message_id` (`be/routes/resendWebhook.ts:108-115`); `updateConsent` in `be/services/consentService.ts`. Depends on P1-1 | M | [01], [19], [20] (also [06], [09]) |
| P0-13 | **No India DLT template ID, PE ID or sender header for SMS.** There are no DLT fields in campaigns, templates or provider config. Gupshup sends only a user ID, password and the text | Indian operators reject commercial SMS that doesn't match a registered DLT template. MoEngage makes the Template ID mandatory for India | SMS provider forms `app/settings/page.tsx:364-375`; `be/services/providers/gupshupProvider.ts:58-80`; template rows. Pair with P1-23 for other Indian gateways | M | [03], [14], [19], [25] (also [01], [06], [15], [23], [24]) |

**D. Flow engine**

| # | Gap | Why it matters vs MoEngage | Build on (Storees today) | Effort | Modules |
|---|---|---|---|---|---|
| P0-14 | **Flow branches without an Exit fall through.** The executor walks the flat node array, and the builder splices a branch's steps right after the split. A branch without its own End therefore runs into the other branch's steps; only the last branch in the array simply ends | Customers get the other path's messages while the canvas shows something else. MoEngage ends every branch in an Exit node | `be/services/flowExecutor.ts:366-369`; `fe/components/flows/StructuredFlowBuilder.tsx:79-99,1638-1642`. Append an End to open branches on save, or store explicit next pointers | S | [06] (also [14]) |
| P0-15 | **Fixed-time and flow-exit triggers never enrol anyone, yet still misfire.** <ul><li>Scheduled and flow-exit trips are queued without `nextNodeId`, and the flow worker advances only `waiting` trips, so these trips stall as active (and still count as active trips).</li><li>The scheduler needs an `audienceFilter` that no UI sets.</li><li>The trigger worker ignores `kind`, so these flows enrol everyone who fires the event left over from the create dialog.</li></ul> | MoEngage's periodic flows run on schedule with end conditions and a next-run preview. Storees silently messages the wrong people | `be/workers/flowFixedTimeScheduler.ts:24-104`; `be/workers/triggerWorker.ts:77`; `be/workers/flowWorker.ts:31-37`. Stopgap (S): gate event matching on `kind`, or hide both kinds | M | [06] (also [05]) |
| P0-16 | **Email open and click conditions in flows can never be true.** Flow emails write no `messages` row, so `email_read` and `email_clicked` never fire. That missing row is the only cause. Separately, the checks aren't tied to the preceding message, so once flow emails are logged an older open could give a false Yes; a Delay node before the check supplies the wait | Every user takes the No path. MoEngage offers per-message engagement conditions with a window (default 24 h) | `be/services/messageStatusService.ts:41-52`; `be/services/flowExecutor.ts:473-512`. WhatsApp read already works. Depends on P1-1 | M | [06] |
| P0-17 | **Flows lose conversions after the last step and have no revenue.** Goals count only while a trip is active or waiting, and flows have no revenue or attribution window | Abandoned-cart and win-back ROI, the headline flow number, can't be shown. MoEngage tracks goals for N hours after an impression or click, with revenue | Campaign windowed revenue attribution in `be/services/campaignAnalyticsService.ts:20-45,120-223`; `be/services/flowAnalyticsService.ts`; the goal check in `be/services/flowExecutor.ts:262-333` | M | [06], [24] (also [15]) |

**E. Data and targeting**

| # | Gap | Why it matters vs MoEngage | Build on (Storees today) | Effort | Modules |
|---|---|---|---|---|---|
| P0-18 | **No file segments (uploaded lists), and identity matching is exact.** Every segment is rule-based and rebuilt from its filter, and there is no upload. Matching is exact, so a 10-digit mobile number misses Shopify's +91 number and differently cased emails miss too | MoEngage file segments take a CSV or URL and support Add, Remove and Replace. Storees can't target offline, COD-confirmed, event or migrated lists | Campaigns, flows and the member list already read `customer_segments`; enter/exit events in `be/services/segmentService.ts:136-183`; upload via multer (`be/routes/assets.ts:4,32-53`) and `be/services/storageService.ts:134`; matching in `be/services/customerService.ts:401-529`. Add a "file" segment type that evaluation and the ad export skip | M | [07], [08], [09] (also [12], [17]) |
| P0-19 | **No CSV user import for project admins.** Bulk import is a JSON API only (1,000 rows a call, on the public key), with no upload, parser or screen | MoEngage's 3-step wizard lets a marketer load a list. In Storees it takes an engineer, which stalls migrations from other vendors | `be/routes/v1Import.ts:57-153`; `resolveCustomer` in `be/services/customerService.ts`; BullMQ (`be/services/queue.ts`); the Event Sources mapping UI (`app/event-sources/[id]/page.tsx:498-563`). Ship with P1-63 and P1-64 | L | [09] (also [08], [17]) |
| P0-20 | **City and state targeting.** `customers.city` and `region` are synced from Shopify and the engine supports them, but they appear in the builder and in Segment AI only when dealer access control is on. There is no country or pincode. An admin can expose city and state today with Settings > Project > "Enable dealer-scoped access" (a B2B setting), so that half is closer to P1 | MoEngage's Localization group (city, state, country, pincode, time zone) drives regional festivals, language creatives and serviceability | `be/routes/v1Schema.ts:39-41`; `be/services/agentFieldDefs.ts:31-108`; `seg/evaluator.ts:940-946`; `be/workers/syncWorker.ts:169-183`. Country and pincode need new columns, extraction and a re-sync | M (S for city and state) | [07] (also [01], [09]) |
| P0-21 | **Custom attributes can't be targeted, and there is no attribute catalog.** Attributes from the SDK, API, connectors or Shopify tags can't be picked in the segment builder or by Segment AI. The engine compares them as text. Metrics keys aren't template variables | MoEngage lists tracked custom attributes with typed operators and keeps a governed attribute catalog | Key discovery in `be/services/variableSources.ts:61-83` (`pullAttributeKeys`); the untyped fallback in `seg/evaluator.ts:1197-1208`; the field catalog in `be/routes/v1Schema.ts:21-57`; the template whitelist in `be/services/templateContext.ts:204-223` | M | [07], [17] (also [01], [09], [22]) |
| P0-22 | **Prediction-bucket rules never match.** <ul><li>Writers store "High/Medium/Low", the builder offers lowercase values, and `is` is case-sensitive.</li><li>The two writers band scores differently.</li><li>The static "Risk Bucket" fields read metrics that nothing writes, so "Risk Bucket is low" matches everyone.</li></ul> | This breaks targeting by prediction, the main reason predictions are bought. MoEngage segments on high, medium and low propensity | `be/routes/predictions.ts:95` already compares with `lower()`; `seg/evaluator.ts:879-882,1179-1186`; `be/services/predictionFieldDefs.ts`. Use one banding rule. Score filters work, but count unscored customers as 0 (`seg/evaluator.ts:1188-1194`), so "score below X" also matches everyone outside the goal's population | S | [08], [07] (also [12]) |

**F. Analytics and reporting**

| # | Gap | Why it matters vs MoEngage | Build on (Storees today) | Effort | Modules |
|---|---|---|---|---|---|
| P0-23 | **The funnel ignores step order.** `computeFunnel` counts customers who did each step anywhere in the window. Purchase-then-view still converts, a repeated event returns 0, and anonymous visitors are dropped | The numbers won't match MoEngage's ordered "Funnel - Unique Users" side by side in a demo | `be/services/analyticsService.ts:33-201` (rewrite with window functions or LATERAL; the drill-down shares this logic). Build P1-77 into the rewrite | M | [10] |
| P0-24 | **No event picker or true unique users in trends.** Time Series counts all events together, including channel delivery receipts, so a WhatsApp or email blast makes every recipient "active". "Active Customers" isn't per event, and its total adds up daily uniques | MoEngage Behavior answers the most basic questions: the `added_to_cart` trend, or distinct users who checked out | `be/services/analyticsService.ts:334-486`. Add `eventName` and filters to `/api/analytics/timeseries` | S | [10] |
| P0-25 | **No cross-channel campaign stats.** The only aggregate is the admin-only Notification Logs: status counts, all-time in the UI, with no conversions, revenue or email | MoEngage's Campaign stats dashboard (KPI cards with % change, a per-channel table with conversions and revenue) answers "how is the programme doing". Its table omits WhatsApp, which is an opening for Storees | `be/routes/logs.ts:17-45,121-139`; `be/services/campaignAnalyticsService.ts`. `be/services/flowAnalyticsService.ts:146-227` already computes per-channel stats, but no screen shows them. Depends on P1-1 | M | [12], [01] |

**G. Commerce and WhatsApp tracking**

| # | Gap | Why it matters vs MoEngage | Build on (Storees today) | Effort | Modules |
|---|---|---|---|---|---|
| P0-26 | **No unique coupon codes or per-recipient allocation.** <ul><li>There are no coupon tables, routes or UI, and Shopify OAuth lacks `read_discounts` and `write_discounts`.</li><li>Campaigns send the WhatsApp template's sample code.</li><li>Email and SMS use hard-coded codes (WELCOME10, COMEBACK15, BDAY20).</li></ul> | Unique codes are table stakes for D2C welcome and cart-recovery offers. MoEngage coupon lists give each recipient one unique code through a snippet | The flow COPY_CODE binding (`fe/components/flows/SendNodeConfigModal.tsx:98-105`; `be/services/providers/whatsappUtils.ts:93-104`); the `coupon_applied` event schema; checkout `discount_code` from the pixel (`fe/lib/shopifyPixel.ts:56`); `discount_pools`, planned in `docs/WHATSAPP_CAROUSEL_ENGINE_ALIGNMENT.md` §5. Needs P0-4 before scopes are added | L | [13] (also [02], [03], [04], [05], [23]) |
| P0-27 | **Template sync strips tracked WhatsApp buttons.** The hourly and manual syncs overwrite stored buttons with the provider's copy, dropping `track` and the destination. Tracked buttons then stop minting short links, sends omit the required URL parameter, and the flow destination override disappears | Sends of a tracked-button template (for example the abandoned-cart "Complete your order" link) then lack the dynamic URL parameter, so Meta rejects them and no clicks are recorded. Carousel card buttons live in a separate column that the sync never writes, so carousels are not affected. MoEngage shortens and tracks WhatsApp links by default | `be/services/whatsappTemplateSyncService.ts:36-52`; `be/workers/templateStatusWorker.ts:29,146-154`; `be/services/shortLinkService.ts`. Merge buttons on sync: re-derive `track` from the short-link `/c/` base, which also repairs rows already stripped (their lost destinations need a one-off repair). Keep the rest of the sync, which also stores the template name that sends use | S | [23], [04] (also [24]) |

### 4.2 P1: high priority (117)

**Messaging infrastructure: delivery, scheduling, logging**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-1 | Log every email send (campaign and flow) in `messages` with the provider message id | Email is missing from Notification Logs, flow stats, the debugger, receipts, caps and any cross-channel rollup. MoEngage's logs and stats cover every channel. Several P0s depend on this | `be/services/deliveryService.ts:499` (the only writer of `messages`); `campaign_sends.resend_message_id`; `be/services/emailService.ts:32-89` | M | [14], [24] (also [06], [12], [15], [20]) |
| P1-2 | Periodic campaigns that run on schedule and keep each run's history | The scheduler reads `timeOfDay` but the UI saves `time`; it ignores the end date, drifts and needs a manual first Send Now; each run deletes the previous run's sends and counters. MoEngage schedules the first run, ends on a date or after N runs, and reports each run | `be/workers/campaignScheduler.ts:16-44,96-112`; `shared/types.ts:224-230`. Add a run table or a `run_id` | M | [01], [02], [03], [04], [15] |
| P1-3 | Campaign time zones that work: honour the chosen zone, fix "Send in user time zone", offer the full IANA list | Fixed sends use the admin's browser zone; "User's timezone" delays every recipient by exactly 24 h; only 10 zones are offered. MoEngage has a searchable IANA list and per-user local delivery | `app/campaigns/create/page.tsx:635-637,3161`; `be/services/campaignService.ts:1119-1168` | S | [03], [04] |
| P1-4 | Workspace time zone, defaulted from Shopify | Fixed-time flows fire in UTC (09:00 runs at 14:30 IST), and day buckets use the database zone. MoEngage has one workspace zone | `/shop.json` is already fetched (`be/services/shopifyService.ts:241-252`); `be/workers/flowFixedTimeScheduler.ts:24-30` | M | [21] |
| P1-5 | Delivery throughput, tenant fairness and priority for transactional sends | One limiter allows 50 jobs/s (about 3,000/min) for all tenants and channels, with no priority, so a 1-lakh WhatsApp blast takes 33+ minutes and holds order alerts back. MoEngage defaults to 60,000/min | `be/workers/deliveryWorker.ts:32-40`; `be/services/deliveryService.ts:114-127`; the request limit in `be/services/campaignService.ts:801-804,1079-1099` | M | [03], [04], [14] |
| P1-6 | Quiet hours (DND) per channel in the customer's time zone, deferring sends, with an Ignore DND override | Only a docstring mentions quiet hours, so abandoned-cart WhatsApp and SMS go out at 2 a.m. India also limits promotional SMS to daytime. MoEngage has channel-wise DND | The gate chain in `be/services/deliveryService.ts:79-125`; the customer zone and `nextLocalDateTime` in `be/services/campaignService.ts:1141-1166` | M | [03], [04], [06], [20] (also [14]) |
| P1-7 | Frequency caps that apply as shown: enforce the email cap, scope caps to campaigns or flows, add ignore/count on flow nodes | The email cap (3/day) is never applied. Under the default WhatsApp cap of 1 per 7 days, any marketing broadcast silently blocks the abandoned-cart WhatsApp for a week. MoEngage scopes caps by delivery type | `checkFrequencyCap` in `be/services/deliveryService.ts:431-457`; `messages.campaign_id` and `flow_trip_id`; `be/services/flowExecutor.ts:795-806`. Needs P1-1 | M | [04], [20] |
| P1-8 | Cross-channel frequency cap | A customer can hit the WhatsApp, SMS, email and push maximums in the same week. MoEngage has an "All channels" rule | The same gate; needs P1-1 | M | [20] |
| P1-9 | Automatic retries on transient provider errors | The queue is set to 3 attempts, but `executeSend` swallows errors, so a timeout, 5xx or 429 fails for good. MoEngage retries alerts with backoff | `be/services/queue.ts:85-96`; `be/services/deliveryService.ts:177-203` | S | [14] |
| P1-10 | Transactional/Promotional choice on flow send nodes | Flow SMS and push are hard-coded promotional, so an order SMS counts against the marketing cap and is blocked by promotional opt-outs. Flow email uses the marketing provider | Campaign content-type handling in `be/services/deliveryService.ts:79-96` and `be/services/emailProviderRegistry.ts:45-79` | S | [14] |
| P1-11 | A fallback channel on the send step ("if not delivered in N minutes, send on SMS") | Today this needs three extra nodes, depends on provider receipts, and falls through without an End step (P0-14). MoEngage Inform sequences fallbacks | Receipt events `<channel>_delivered/_failed` in `be/services/messageStatusService.ts:76-87` | M | [14] |
| P1-12 | Synchronous send API (`POST /api/v1/messages`, secret key) | A store backend can't send an OTP or "order shipped" message now and get a status back. MoEngage has one alerts API for every channel | `deliveryService.send`; needs P0-1 | M | [14], [24] |

**Email builder and deliverability**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-13 | Verified From addresses only, with the default sender applied to flows | Any From is accepted, and the project address is used before DNS verifies, so the ESP rejects campaign mail. Flow emails never use the brand domain. MoEngage allows verified senders only | `be/services/emailDomainService.ts:20,136-147`; `be/services/campaignService.ts:1222-1227` | S | [02], [19] |
| P1-14 | Preheader reaches the sent email | The preview text typed on create is dropped, and starter templates send their own default instead. MoEngage has Preview Text with guidance and AI | `fe/lib/emailCompiler.ts:18,34`; `be/services/campaignService.ts:945-1010` | S | [02] |
| P1-15 | Personalisation picker that inserts a token at the cursor | Users must know token names and map them in a separate panel. MoEngage's "@" picker with fallback works in every field | `fe/components/templates/VariablePanel.tsx:235-353`; `fe/components/email-builder/BlockPropertyEditor.tsx:134-140` | M | [02] |
| P1-16 | Rich-text editing on the email canvas | Text blocks are edited as raw HTML in a sidebar, the largest usability gap for non-technical marketers. MoEngage's Beefree editor has a floating toolbar | `fe/components/email-builder/BlockPropertyEditor.tsx:93-201`; `EmailBuilder.tsx` | M | [02] |
| P1-17 | Conditional content (if/then/else; block display conditions) | Copy can't vary by city, tier or language inside one email, so teams clone the campaign per segment. MoEngage has conditional blocks | Filter rule types in `seg/evaluator.ts`; `interpolateTemplate` in `be/services/emailService.ts:109-121` | L (M first step) | [02] |
| P1-18 | A/B tests that do what they say: send the winner, send variant B on SMS and push, add a real WhatsApp variant (hide WhatsApp A/B until then) | The UI promises "winning variant auto-sent", but the split covers everyone. SMS and push send variant A to all, and WhatsApp sends one template to both groups. MoEngage optimises splits | `AbTestSection` in `app/campaigns/create/page.tsx:2995-3156`; `be/services/campaignService.ts:52-58,950,1024-1029`; `be/services/campaignAnalyticsService.ts:488-543` | M | [02], [03], [04] |
| P1-19 | Event webhooks for SendGrid, SES, Postmark and Mailgun, with per-project secrets | Only Resend reports delivery, opens, clicks and bounces, through one platform-wide secret, so merchants on other ESPs get no engagement data or auto-suppression. MoEngage's ESP connectors provide both | `be/routes/resendWebhook.ts`; `be/services/suppressionSync.ts` | M | [19], [25] |
| P1-20 | Subscription-category management and a hosted preference centre behind `{{preferences_url}}` | Nothing writes `customer_subscriptions`, so picking any category blocks every recipient. Every starter email's "Preferences" link is empty. MoEngage has categories and a preference page, which also helps with DPDP | `be/routes/subscriptionCategories.ts`; `be/services/consentService.ts`; `be/routes/unsubscribe.ts` | M | [13], [19] |
| P1-21 | Suppression and resubscribe CSV import, with history | Brands moving from another ESP can't bring their unsubscribes and bounces, so Storees mails people who opted out. MoEngage has an upload and an update history | `email_suppressions`; `consent_audit_log`; `be/services/consentService.ts`. After P0-12 | M | [09], [19] |

**SMS, push and WhatsApp channels**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-22 | SMS opt-outs: STOP/START replies become consent, Shopify SMS consent is honoured, and the preview counts SMS and push opt-outs | STOP replies are ignored, and `sms_subscribed` is never read at send. MoEngage excludes opted-out users automatically | `be/services/consentService.ts`; `be/routes/channelWebhooks.ts`. WhatsApp STOP/START handling already exists | M | [03] |
| P1-23 | Generic HTTP SMS connector, plus Indian aggregators (MSG91, Karix, ValueFirst, Kaleyra and others) | Brands already paying an Indian DLT gateway can't use it; only Twilio, Gupshup, Bird and Vonage work. MoEngage lists 18 SMS connectors plus a custom one | The flow `http_request` node (`be/services/flowExecutor.ts:815-877`); `be/services/providers/index.ts:25-29` | M | [19], [25] |
| P1-24 | SMS delivery receipts that work | Twilio sends set no StatusCallback, Vonage receipts read the wrong id field, Gupshup SMS receipts aren't handled, and no webhook is signature-checked | `be/routes/channelWebhooks.ts:43-208`; `be/services/messageStatusService.ts:24-78` | M | [19] |
| P1-25 | Short, tracked links in SMS and push (and in WhatsApp message text) | SMS has no click signal; its links get only UTM parameters. MoEngage shortens and tracks links by default | `be/services/shortLinkService.ts:33-48`; `be/routes/urlTracker.ts`; `be/services/deliveryService.ts:271-310` | M | [03], [04], [06] |
| P1-26 | First-party web push: opt-in prompt, service worker, per-device subscriptions, `webpush` payload | Web push is a key channel for Shopify brands without an app. Today's DIY Firebase recipe puts the API secret in the browser and overwrites the customer's single token. MoEngage has web push with a soft-ask prompt | The widget trigger engine in `sdk/src/widget.ts`; `be/services/providers/fcmProvider.ts` | L | [03], [19] (also [14]) |
| P1-27 | FCM: a token cache per tenant, credential validation, test push, several devices per customer, encrypted credentials | One OAuth token cache is shared across all tenants, so other tenants' pushes fail for up to 50 minutes after one tenant sends | `be/services/providers/fcmProvider.ts:71,106-111`; `be/services/encryption.ts` | S | [14], [19] |
| P1-28 | Allow UTILITY and AUTHENTICATION templates outside the 24-hour window in campaigns | Utility broadcasts (back in stock, shipping delay) reach almost no one, although Meta and MoEngage allow any approved template | `be/services/campaignService.ts:466-486,644-661` | S | [04] |
| P1-29 | UTM on WhatsApp campaigns and on flow SMS and push | WhatsApp campaign clicks reach Shopify and GA4 untagged. MoEngage applies UTM to tracked links | UTM on tracked buttons in `be/services/deliveryService.ts:276-319`; flows already pass UTM (`be/services/flowExecutor.ts:786-806`) | S-M | [04], [24] (also [06]) |
| P1-30 | Deliverable WhatsApp carousels (per-card media and button parameters) | Approved carousels can't be sent from campaigns or flows, which blocks the Phase A dynamic-carousel smoke test | `be/services/providers/whatsappUtils.ts:58-108`; `be/services/providers/metaWhatsappProvider.ts:95-115`; `fe/components/whatsapp/WhatsAppTemplateBuilder.tsx` | M | [04] |
| P1-31 | Check the short-link base domain before tracked-button templates are submitted | The base falls back to `APP_URL` or localhost, and it is baked into every tracked button at Meta approval, so changing it means re-approval. This is the CLAUDE.md hard rule for dynamic carousels | `be/services/shortLinkService.ts:15-21`; `docs/SHORTLINK_SERVICE_PLAN.md`; add `SHORTLINK_BASE_URL` to `.env.example` | S | [23] |
| P1-32 | Per-brand short-link domains via CNAME | MoEngage supports custom shortening domains; Storees has one platform domain. This is also needed for email link branding and DLT-whitelisted SMS links | Globally unique slugs (`be/routes/urlTracker.ts:11-21`); the DNS-verification UI pattern in `app/settings/project/page.tsx:262-401`; Phase 2 of `docs/SHORTLINK_SERVICE_PLAN.md` | L | [04], [23] |
| P1-33 | Meta Embedded Signup | Self-serve setup needs Business Manager know-how and a system-user token, a common drop-off point. MoEngage launches Meta's embedded sign-up. This waits on Meta Tech Provider approval | `app/settings/MetaConnect.tsx`; `be/routes/whatsappAdmin.ts:772-955`; Phase 5 of `docs/META_WHATSAPP_BUILD_PLAN.md` | M | [04], [20] |
| P1-34 | Gupshup selectable in WhatsApp settings (with `appId` and the webhook URL) | India's largest BSP is wired in the backend but hidden from the panel. MoEngage lists Gupshup, Infobip and Karix | `be/services/providers/gupshupProvider.ts:85-224`; `app/settings/WhatsappChannelPanel.tsx` | S | [04], [20] |
| P1-35 | Webhook routing for brand-owned Meta apps, and signed channel webhooks | `subscribed_apps` subscribes the brand's own app with no callback set, so receipts, replies and STOP may never arrive while the panel says tracking is active (read from code, not run). Unsigned callbacks also let a forged STOP or START flip a customer's consent | `be/services/whatsappMetaConnectService.ts:101-114`; Pinnacle's per-project secret in `be/routes/channelWebhooks.ts:370-397` | S | [04], [20] |
| P1-36 | Choice of WhatsApp number source, with a fallback to the checkout or address phone | Many Indian shoppers give a phone only at checkout or in the address, so they look unreachable. MoEngage lets you choose the attribute | `be/workers/syncWorker.ts:173-183`; `be/services/eventProcessor.ts:282,313` | M | [20] |

**Flows**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-37 | Archive flows, and make delete work once a flow has run | DELETE returns HTTP 500 for any flow whose trips reached a Wait step or sent SMS, push or WhatsApp. MoEngage has an archived-flows view | `be/routes/flows.ts:312-340`; foreign keys at `be/db/schema.ts:397,809` | S | [06] |
| P1-38 | Pause that halts in-flight trips; Stop and Completed states | Pause only blocks new entries, so a misfiring flow can't be halted | `be/routes/flows.ts:205-272`; `be/services/flowExecutor.ts:54-81`; `be/workers/flowWorker.ts` | M | [06] |
| P1-39 | WhatsApp-first flow templates in the gallery, with preview | The 7 templates in the UI have no WhatsApp step, while a 30-template catalog (21 WhatsApp sends) sits behind an API nothing calls. MoEngage previews templates with highlights | `be/services/flowTemplates.ts:69-357`; `be/routes/flows.ts:549-573`; `fe/components/flows/FlowTemplateGallery.tsx` | S-M | [06], [12] |
| P1-40 | Trigger-filter fixes: typed comparisons, the `segmentId` key, between/exists/in-list operators | "500" never equals 500, and segment-scoped entry never fires | `shared/eventFilters.ts:31-32`; `be/services/segmentService.ts:144`; `shared/eventSchemas.ts:40` | S | [06] |
| P1-41 | Alternate trigger events (OR) | `added_to_cart` OR `checkout_started` needs two flows, which double-message customers who do both. MoEngage has "+ Add alternate trigger event" | `shared/types.ts:595`; `be/workers/triggerWorker.ts:77` | S | [06] (also [03], [04]) |
| P1-42 | One-time fixed-time entry | A segment can't be pushed once into a multi-step journey, such as a sale launch | `be/workers/flowFixedTimeScheduler.ts`, after P0-15 | M | [06] |
| P1-43 | Limit user entry (a re-entry cooldown) | Shoppers who add to cart daily re-enter the abandoned-cart flow daily, and flow email has no cap. MoEngage defaults to 1 entry per year | The one-live-trip check in `be/workers/triggerWorker.ts:121-155` | S | [06] |
| P1-44 | A flow audience step that runs on the SQL engine | `audienceFilter` is enforced, but no UI sets it, and the in-memory evaluator drops behaviour rules | `be/workers/triggerWorker.ts:97-119`; `fe/components/segments/SegmentFilterBuilder.tsx` | M | [06] |
| P1-45 | Flow control group, with lift | Flow incrementality can't be measured. MoEngage holds out 5% by default | The campaign holdout (`be/services/campaignService.ts:61-70`) and lift (`be/services/campaignAnalyticsService.ts:225-304`) | M | [06] (also [15]) |
| P1-46 | Wait for an event, with a timeout | A flow can't continue the moment a purchase happens within 24 hours. MoEngage conditions can "keep evaluating" | `be/services/flowExecutor.ts:143-157` | M | [06] |
| P1-47 | Multi-branch Conditional Split with named branches | Routing by tier or category needs chains of Yes/No steps | `shared/types.ts:664`; `fe/components/flows/StructuredFlowBuilder.tsx:33-37,521-620` | L | [06] |
| P1-48 | Wait until a time slot (send window in the user's time zone) | Messages go out at 3 a.m. local time | `shared/types.ts:637-641`; `be/services/campaignService.ts:1133`; `be/services/sendTimeService.ts` | M | [06] |
| P1-49 | Block activation of invalid flows (server-side validation, a clickable errors panel) | Unconfigured email steps send the fallback email, and SMS steps without a template send empty bodies | `validateNodes` in `fe/components/flows/StructuredFlowBuilder.tsx:1442-1458`; `be/routes/flows.ts:205-310` | S | [06] |

**Segmentation and profiles**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-50 | Subscription and reachability fields: WhatsApp and push opt-in, "Reachable on WhatsApp" that checks opt-in, first/last seen, device | Marketers can't target WhatsApp opt-ins, which matters for Meta opt-in compliance. MoEngage groups reachability, subscription, lifecycle and device fields | The `whatsapp_subscribed` and `push_subscribed` columns (`be/db/schema.ts:146-147`); `be/services/domainRegistry.ts` | S-M | [01], [07] |
| P1-51 | Segments as filter blocks: segment-in-segment, and exclusions in saved segments | "Segment A AND city = Pune" and "exclude Segment B" are impossible. MoEngage has a Custom segment filter and Exclude Users | The flow in-segment check (`be/services/flowExecutor.ts:527-528`); the campaign `NOT (filter)` exclusion (`be/services/campaignService.ts:206`) | M | [01], [07] (also [04]) |
| P1-52 | Relative and recurring dates: in the next N, is today, exists, birthdays and anniversaries | The seeded Birthday templates can't be targeted. MoEngage has recurring date granularity | `within_last`, `in_month` and `in_year` in `seg/evaluator.ts:748-794` | M | [01], [07] |
| P1-53 | A working Segment AI | It calls a retired Groq model directly, ignores the project's key, and reads rupee totals as paise, making thresholds 100x too high (the seeded "High Value Customers" segment has the same error). MoEngage's Segment Assist was "Coming soon" (flag off) in the captured workspace, so a working one is a demo win | `be/services/llmService.ts` (the project key and retired-model fallback); `be/services/aiSegmentService.ts:40-43,242-357` | S | [07], [16] |
| P1-54 | Search and pagination on the segments list | Tenants have 12+ seeded segments (one has 58), and the API is unpaginated | `be/routes/segments.ts:19-55` | S | [07] |
| P1-55 | A read-only segment detail page | There is nowhere to see counts, reach, last evaluation, size trend or entries and exits without opening the editor. MoEngage has a segment info page | `GET /api/analytics/segment-trend` | M | [07] |
| P1-56 | Reachability by channel on segments | Only an aggregate count is stored, so WhatsApp and email reach can't be compared up front | Per-channel reach in `be/services/campaignService.ts:172-270` | S | [07] |
| P1-57 | Event-property picker in performed-event rules | Property paths are typed from memory, and SDK properties that start with `$` are rejected | `be/services/variableSources.ts:91-118`; the flow builder's picker in `fe/components/flows/StructuredFlowBuilder.tsx:805-813` | S | [07] |
| P1-58 | Profile reachability for every channel | Shopify D2C profiles show Email only | `fe/components/customers/UserInfoTab.tsx:225-235,335-370` | S | [07] |
| P1-59 | Save an RFM cell as a segment | RFM is a dead-end chart. MoEngage turns cells into segments and campaigns | The RFM SQL in `be/routes/customers.ts:56-130`; `seg/lifecycle.ts` | S | [08] |
| P1-60 | Role and plan gating on prediction routes | Agents can delete or roll back goals that drive project-wide targeting, and the trial plan's `predictions` entitlement isn't enforced | `requireRole('admin')` in `be/middleware/agentScope.ts:59`; `be/services/entitlementService.ts:37-40` | S | [08] |
| P1-61 | Auto-created low, medium and high segments for each prediction goal | MoEngage creates three ready-to-target segments per model | `be/workers/scoringWorker.ts`; `be/services/predictionFieldDefs.ts` | S | [08] |
| P1-62 | Plain CSV export of a segment's members, masked and limited to an agent's own customers | Only a hashed ad export exists, and brands need plain lists for call-centre and offline follow-up | `fe/components/segments/ExportAudienceButton.tsx`; `be/services/adAudienceExport.ts`; `be/middleware/capabilities.ts` | S | [09] |

**Imports and data management**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-63 | Import wizard: upload, a preview gate, and identifier and column mapping, shared by CSV imports and connectors | Customer import creates empty profiles for rows with no identifier, and connector mappings are API-only JSON. MoEngage's wizard validates and maps before importing | The Event Sources mapping UI (`app/event-sources/[id]/page.tsx:287,498-563`); the connector Test raw-vs-mapped view (`fe/components/data-sources/ConnectorsSection.tsx`); the campaign stepper | S-M | [09], [17] |
| P1-64 | Import semantics: opt-in columns become consent records, `created_at` is kept without a last-seen bump, custom attributes are merged | Imported profiles look new and active, opt-ins have no proof for Meta or DPDP, and extra columns are dropped | `updateConsent` (`be/services/consentService.ts:21`); `sourceCreatedAt` and `skipLastSeenBump` in `resolveCustomer` (`be/services/customerService.ts:335-397`) | S | [09] |
| P1-65 | File-segment follow-ons: a sample file and upload checks, Add/Remove/Replace from a new file, saving an import as a file segment | Recurring lists (for example weekly COD-confirmed buyers) need membership edits | Builds on P0-18; enter/exit events in `be/services/segmentService.ts:136-183` | S | [09], [17] |
| P1-66 | An imports list for project admins | Sync history is visible only on the super-admin `/projects` page, so trial merchants can't see whether their Shopify history finished syncing | `fe/components/data-sources/SyncHistoryTable.tsx`; `data_source_syncs` | S | [08], [09], [17] |
| P1-67 | CSV upload for orders and events, imported as historical | Offline and marketplace orders need an engineer and the public-key JSON API. MoEngage imports events from CSV, S3 or SFTP | `be/routes/v1Events.ts:274-556`; `be/routes/v1Import.ts:154-326` (orders written as historical); `be/services/storageService.ts` | M | [17] |
| P1-68 | Churn Risk and Engagement Score for every customer, refreshed nightly | Synced and imported customers never get these scores, so "Churn Risk > 70" misses exactly the lapsed customers | `computeAndUpdateMetrics` in `be/workers/metricsWorker.ts`; `be/workers/aggregateReconcileWorker.ts` | S | [17] |
| P1-69 | Event catalog: first and last seen, 30-day volume, source, search | Admins can't see which events exist or where they come from. MoEngage's Data Management has a governed catalog | `be/routes/eventMapping.ts:326-334`; `/api/events/names` | M | [22] |
| P1-70 | Silent-event detection and event-volume alerts | If the pixel or a webhook breaks, `added_to_cart` and `checkout_started` stop arriving and abandoned-cart flows go quiet unnoticed. MoEngage has Events Volume alerts | The "no data" flags in `be/routes/eventMapping.ts:355-367`; 24-hour counts in `be/routes/inboundWebhooks.ts:18-43` | S-M | [22], [24] |

**Analytics and reporting**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-71 | One shared date-range picker on every report | Every report has fixed presets, so month-end reporting is impossible, although the APIs already accept dates. MoEngage's picker has presets, since/before and custom ranges | The date parameters in `be/routes/analytics.ts`; `fe/hooks/useAnalytics.ts` | M | [10], [11], [12], [15] |
| P1-72 | Audience filter on every analysis: a saved segment first, then the shared filter builder | The funnel and time-series APIs accept a segment and ignore it. MoEngage filters every report by audience | `customer_segments`; `fe/components/segments/SegmentFilterBuilder.tsx`; `scopedFilterSqlForProject` (`be/services/projectVocabulary.ts:501`) | S-M | [10], [11] |
| P1-73 | Save, name and reopen every analysis | Only funnels can be saved (via `window.prompt`), and saved items open an empty builder | `POST /api/analytics/saved` (`be/routes/analytics.ts:197-216`) | S | [10] |
| P1-74 | CSV download on every analytics and dashboard report | Nothing can be exported, and "can I export this?" is a standard demo question | Existing CSV responses in `be/routes/segments.ts:157-181` and `be/routes/v1Onboarding.ts:908-922` | S | [10], [12] |
| P1-75 | Campaign and flow performance report download: one row per campaign or flow, by date range and channel | Campaign and flow performance can't leave Storees in any format. MoEngage has a Reports module. Add a UTF-8 BOM so ₹ and Hindi open cleanly in Excel | BullMQ (`be/services/queue.ts`); `be/services/storageService.ts:134-170`; `be/services/campaignAnalyticsService.ts` | M | [15] |
| P1-76 | Configurable Behavior analysis: several event series, event-attribute filters, split-by, aggregations | Time Series charts one fixed metric; MoEngage's Behavior analysis is built on these controls | The property catalogue (`be/services/variableSources.ts`; `shared/eventSchemas.ts`); the SQL predicate (`seg/evaluator.ts:226-240`) | M | [10] |
| P1-77 | Funnel depth: per-step attribute filters, a conversion window, split-by | MoEngage defaults to a 1-day window, so the same funnel shows different numbers in each product | Build inside the P0-23 rewrite | M | [10] |
| P1-78 | Save a funnel stage as a segment | Turns a drop-off into a target audience | Performed-event rules with "in the last N days" (`seg/evaluator.ts:242-262`) | S | [10] |
| P1-79 | Users analysis: the distribution of any user property | Only fixed RFM and prediction distributions exist | Customer columns, `metrics` and `custom_attributes` | M | [10] |
| P1-80 | Save charts to custom dashboards | `/dashboard` has a fixed layout and there are no dashboard tables | New dashboard and widget tables | L | [10] (also [11], [12]) |
| P1-81 | Retention that counts correctly, plus first-purchase cohorts | The default "Any event" mode counts Storees' own sends and receipts as returns. Unelapsed periods show 0%, the oldest cohort is partial, and the month calculation drops whole years | `be/services/analyticsService.ts:219-330`; `customers.first_order_date` | S | [11] |
| P1-82 | Session & Source report: conversions and revenue by UTM source, medium and campaign | Marketers can't see orders or revenue by source, although the SDK already captures UTM per session and orders are stitched to sessions | `sdk/src/autotrack.ts:306-340`; `events.session_id`; `be/services/anonymousSessionService.ts:71` | L | [11] |
| P1-83 | Per-channel trends across campaigns, including WhatsApp sent, read, clicked and converted | Funnels and timelines exist only per campaign | `be/services/campaignAnalyticsService.ts:306-470` | M | [12] |
| P1-84 | A rollup across all flows (trips, engaged trips, conversions) | Flow analytics exist only per flow | `be/services/flowAnalyticsService.ts` | S | [12] |
| P1-85 | WhatsApp report fields: a "Read" label, total vs unique clicks, a failure-code breakdown, cost per campaign | Reads are labelled "Opened", link click counts are never reported, and usage rows don't link to campaigns | `tracked_links.click_count`; `app/settings/WhatsappUsage.tsx` | S | [15] (also [04]) |

**Onboarding, help and integrations**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-86 | A merchant setup checklist on Home | Sign-ups and Shopify installs land on a metrics page with no next steps. MoEngage shows a welcome card with progress | The integration-status API (`be/routes/v1Onboarding.ts:421-489`), which no screen renders | S | [12], [18] |
| P1-87 | A Need help menu (docs, support, setup guide) | There is no help or support link anywhere in the app | `fe/components/layout/AppShell.tsx`; `fe/components/layout/Sidebar.tsx` | S | [12], [18] |
| P1-88 | Published user and developer docs, with an API reference | The guides exist only as repo markdown | `docs/STOREES_INTEGRATION_GUIDE.md`; `docs/STOREES_SDK_INTEGRATION.md`; `docs/STOREES_QUICKSTART.md` | M-L | [12], [18] |
| P1-89 | An integration status that tells the truth | The SDK badge counts only `source='sdk'` events, so stores using only the Shopify pixel read "Not Connected", and "Send Test Event" always succeeds. MoEngage shows an integration-pending banner | `be/routes/v1ApiKeys.ts:129-145`; `be/routes/v1Onboarding.ts:496-536` | S | [18] |
| P1-90 | Guided integration validation (identify, track, pixel cart and checkout events, session stitching) | Merchants have to watch `/debugger` by hand. MoEngage's Integration Validation shows a status for each check | `docs/ONBOARDING_HEALTH_PLAN.md`; `app/debugger/page.tsx` | M | [18] |
| P1-91 | The Shopify app installs tracking automatically (a web pixel extension plus a theme app embed) | Without a manual paste, browse and `added_to_cart` events never arrive, so the auto-created Abandoned Cart flow never fires, and the pixel can't render on-site widgets. MoEngage's app injects its SDK | `fe/lib/shopifyPixel.ts`; the scopes in `be/services/shopifyService.ts:14-24`. Needs P0-4 first | M | [25], [05] |
| P1-92 | Meta (then Google) custom-audience sync from segments | Hashed CSVs downloaded by hand go stale. MoEngage syncs audiences | The hashing in `be/services/adAudienceExport.ts:42-55`; segment enter/exit events | L | [05], [12], [25] |
| P1-93 | Admin-only credential and integration routes, with encrypted and redacted secrets | Any member, including agents and roles without contact access, can overwrite channel credentials or add a webhook that exports raw email and phone. Some secrets read back in full. MoEngage locks channel setup per role | `requireRole('admin')` (`be/middleware/agentScope.ts:59`); `be/services/encryption.ts`; `be/routes/ai.ts:256-376` | S | [19], [25] (also [17]) |

**On-site and in-app**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-94 | Make on-site reachable: an Inbound group in the channel picker and a `/widgets` nav link | No navigation item or link points to widgets, so they can't be found. MoEngage has an Inbound group | `app/campaigns/page.tsx:57-70`; `fe/components/layout/Sidebar.tsx:54-71` | S | [05] |
| P1-95 | An on-site builder with drafts, tags and scheduling | A widget is one modal with an Active toggle, and Cancel throws away the input | `app/widgets/page.tsx`; `be/routes/optinWidgets.ts` | M | [05] |
| P1-96 | Event triggers for widgets | The only non-time trigger is a developer call | SDK `track()` (`sdk/src/core.ts`); `sdk/src/widget.ts:71-91` | S | [05] |
| P1-97 | Audience targeting for widgets | Widgets show to everyone | The campaign audience step; `be/routes/v1OptIn.ts:23-59` | M | [05] |
| P1-98 | In-session targeting: URL and UTM query parameters, new vs returning visitors | The SDK already captures UTM parameters and sessions, but nothing targets on them | `sdk/src/autotrack.ts` | S | [05] |
| P1-99 | A template gallery with D2C use-case popups (cart recovery, recommendations, sale, countdown) | MoEngage has 78 filterable templates; Storees has none for in-app or on-site | `be/services/decisioningService.ts`; `sdk/src/shopifyCart.ts` | M | [05] |
| P1-100 | Spin-wheel and scratch-card gamification, backed by a coupon pool | A popular Indian D2C lead-capture format | The P0-26 code pools; the widget renderer | L | [05] |
| P1-101 | Style controls for widgets and in-app messages (brand colours, fonts, close button, animation, buttons) | Widgets are a hard-coded white card, and the brand kit isn't applied | Brand tokens in `be/services/templateContext.ts:126-138`; `sdk/src/widget.ts:174-217` | M | [05] |
| P1-102 | Start and end dates for in-app messages and widgets | Sale-week popups can't be scheduled | `be/routes/v1InAppMessages.ts:52-59` | S | [05] |
| P1-103 | Per-impression attribution and widget analytics | Goal windows start at `sentAt`, which is wrong for always-on messages, and widgets record no impressions | `be/services/campaignAnalyticsService.ts:129-136` | M | [05] |

**Content and AI**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-104 | Template usage tracking, and a guard against deleting templates in use | Deleting a template in use silently stops in-app campaigns and makes flows send empty SMS and push. MoEngage shows usage for each content block | `campaigns.template_id`; flow node configs; `be/routes/templates.ts:419-438` | M | [13] |
| P1-105 | Deeper recommendations: bought-together, also-viewed, honouring "last viewed", a fallback in flows | Only pairing rules, the last purchase and top sellers exist, and flow tokens are blank when no rule matches | `be/services/decisioningService.ts:77-214` | M | [13] |
| P1-106 | Visible recommendations: product URLs on cards, multi-product variables for WhatsApp and SMS, a rules page with preview | Rules are API-only and cards can't link to products. MoEngage locks recommendations to its Enterprise plan, so a page would make Storees' every-plan feature a visible differentiator | `be/routes/recommendations.ts:13-64`; `GET /api/products` | M | [13] |
| P1-107 | Coupon list UI: create form, CSV upload with preview, "Generate in Shopify", inventory and redemption report | Without it there is no way to set up or watch a coupon pool | The P0-26 pools; `orders.discount`; checkout `discount_code` from the pixel | M | [13] |
| P1-108 | Fix the email copywriter's "Apply body", and generate preheaders | "Apply body" writes over `htmlBody` while the builder keeps the old design, so a campaign can go out as bare AI text with no layout or visible unsubscribe footer | `app/campaigns/create/page.tsx:1994-2008`; `be/services/copywriterService.ts` | S | [16] |
| P1-109 | Copywriter languages: Indian regional languages, Hinglish and Tanglish, one shared list | MoEngage offers 21 languages (7 Indian) plus Hinglish; Storees offers 5 or 6, depending on the tool | `fe/components/campaigns/AiCopywriterPanel.tsx:37-44`; `be/services/copywriterService.ts:50-57` | S | [16] |

**Accounts, permissions and alerts**

| # | Gap | Why it matters vs MoEngage | Build on | Effort | Modules |
|---|---|---|---|---|---|
| P1-110 | An editable project currency, defaulted from the Shopify shop | Stores that don't sell in INR get ₹ prices in their emails. MoEngage has one ISO currency per workspace | `projects.currency` (`be/db/schema.ts:41-42`); `be/services/shopifyService.ts:241-252` | S | [21] |
| P1-111 | Tenant API key management: a key list, named keys with secrets, revoke with a cache purge, rotate, admin-only routes | Any member can list and mint keys, a revoked key keeps working for 5 minutes from cache, and tenants have no way to get the secret that P0-1 requires | `be/routes/v1ApiKeys.ts:16-104`; `ApiKeysSection` in `app/projects/page.tsx:57-145`; `invalidateApiKeyCache` (`be/middleware/apiKeyAuth.ts:52-58`) | S | [21] |
| P1-112 | Member statuses, and revocation that takes effect immediately | Removed or demoted members keep access for up to 24 hours | `be/middleware/requireAuth.ts:13-48`; `be/routes/adminUsers.ts` | M | [21] |
| P1-113 | Email invites: several addresses, a set-password link, adding existing users | Admins share temporary passwords by hand, and existing Storees users can't be added (409) | Reset-password tokens and the branded email in `be/routes/auth.ts:215-323` | M | [21] |
| P1-114 | Server-enforced permissions: module × action rights, a separate publish right, functional role presets | Campaigns and templates have no role check, so any member can create a campaign and send it to the whole base. MoEngage ships 88 permissions and 5 default roles | `be/middleware/capabilities.ts`; `be/routes/roles.ts`; `roles.is_system` | L | [21] (also [01], [25]) |
| P1-115 | Remove PII from trip context in the customer trips API and the flow debugger, and stop logging full URLs | Roles without contact access still receive raw email and phone from trigger payloads and HTTP responses | `scrubJsonbPii`, already applied on `/events` and `/journey` (`be/routes/customers.ts:642-683,743-744`) | S | [23] |
| P1-116 | Failure-rate breach alert | A campaign hit by Meta errors fails quietly, and a scheduled dispatch that throws silently reverts to draft. MoEngage has a built-in failure-rate alert | `campaigns.failed_count`; failure reasons in `be/routes/logs.ts` | M | [24] |
| P1-117 | Alerts when a WhatsApp template is paused, disabled or drops in quality | When Meta pauses an abandoned-cart template, flows keep sending into failures with no alert | `be/services/templateAlertService.ts:30-95`; `be/services/templateStatusService.ts` | S | [24] |

### 4.3 P2: medium priority (short list)

| Theme | Examples | Modules |
|---|---|---|
| List tooling | Campaign and flow filters (date, channel, tags, creator, status), pagination, Pause and Stop for sending and periodic campaigns, tags shown and copied | [01], [04], [06], [13], [15], [23] |
| Event- and API-triggered campaign types | Turn the "Soon" card into a prefilled one-step flow; API-triggered sends | [01], [02], [03], [04], [05], [12] |
| Global control group | Workspace-wide holdout with per-campaign opt-out and benchmarking | [01], [03], [04], [05], [06], [14], [23] |
| Locales | Per-language content for campaigns, flow nodes and alerts | [02], [03], [05], [06], [14], [23] |
| A/B depth | A/B/n, per-node A/B in flows, auto-optimised distribution | [02], [03], [05], [06], [16] |
| Email editor depth | Reusable content blocks, saved rows, product carousel, more block types, view-in-browser, HTML editor with live preview, pre-built gallery | [02], [13], [19] |
| Segment operators and affinity | exists and is empty, multi-value strings, numeric and date operators, first/last-time behaviour, aggregations, user affinity | [01], [04], [07], [10], [14], [18] |
| Segment management | Archive, duplicate, type filter, create a campaign from a segment, edit history, count refresh | [07], [09] |
| Analytics extras | Chart types, download chart, compare segments, OR events, funnel exclusion steps and strict order, holding attribute, rolling and calendar presets | [10], [11] |
| Dashboards, subscriptions and alerts | Custom dashboards, scheduled dashboard emails, an alert entity with campaign and flow metrics, Slack and Teams destinations | [10], [12], [24], [25] |
| Scheduled reports | Saved report list, daily/weekly/monthly runs, Excel, split by date or variation, email delivery | [15] |
| API scopes, MCP and login policy | Per-key scopes, a hosted MCP server with guardrails, enforced 2FA, active sessions | [12], [21] |
| Data governance | Block, hide or PII-mask an event or attribute; display names; pinned data types | [22] |
| Import breadth | S3 and SFTP sources, periodic imports, auxiliary data, status emails, update-only imports | [09], [17] |
| Push, SMS and RCS extras | APNs credentials, action buttons, expiry, notification icons; RCS and MMS; SMS keywords and two-way SMS | [03], [05], [19] |
| Email deliverability tooling | Warm-up plan, link-branding domain, bot- and Apple MPP-adjusted metrics, custom SMTP | [19], [23] |
| WhatsApp extras | Limited-time-offer templates, template library filters, usage and delete, profiles created from new inbound numbers, Infobip and Karix | [04], [20], [25] |
| Personalize and AI extras | WYSIWYG and API web experiences and on-site A/B tests; an AI hub, image generation, AI journey creation, a campaign insight agent, usage metering | [12], [14], [16] |
| Flow canvas tooling | Copy and duplicate steps, undo/redo, goto, wait until a date, AND (secondary) triggers, business events, a flow schedule window | [06] |
| PII leaks to close | The funnel drill-down returns unmasked contacts and ignores agent scope; campaign recipients bypass `viewContactPii`. Both fixes are S, so consider pulling them into Phase 1 | [10], [15] |
| Integrations hub | One integrations page, Google Ads Customer Match, CDP inputs (Segment, RudderStack), Zapier | [05], [25] |

### 4.4 Suggested build sequence

1. **Phase 1: hotfixes.** Every item here is S effort with no dependencies, except P0-7 (M). These are defects in shipped code that a trial or demo hits, and most are local, single-file changes.
   - **Security:** P0-2, P0-3, P1-93, P1-115, and P1-111 (which unblocks P0-1).
   - **Send path:** P0-5, P0-6, P0-7, P0-8, P0-14, P0-27, P0-22 and P0-4. Also the P0-15 stopgap (gate on `kind`) and the P0-9 stopgap (hide In-App).
   - **Demo-visible defects:** P1-53, P1-108, P1-28, P1-3, P1-40, P1-49 and P1-9.
2. **Phase 2: the email and API foundation.**
   - P1-1 (the email ledger) unlocks P0-12, P0-16, P1-7 and P1-8.
   - Add P0-11 (unsubscribe link and headers) and P1-13 (verified sender).
   - Then P0-1 (require the secret on server APIs); P1-12 follows.

   This phase removes the compliance blockers and gives logs, conditions, caps and stats one source of truth.
3. **Phase 3: India readiness.**
   - **SMS:** P0-13 (DLT), P1-23 (generic HTTP SMS connector), P1-24 (receipts) and P1-22 (STOP handling).
   - **Delivery:** P0-10 (test sends), P1-6 (quiet hours), P1-5 (throughput and priority) and P1-10 (transactional flow sends).
   - **WhatsApp:** P1-31 then P1-30, the carousel needed for the Phase A smoke test. Also P1-34, P1-35 and P1-29.
4. **Phase 4: marketer self-serve data.**
   - P0-20, then P0-21, then P1-50, P1-51, P1-52 and P1-57.
   - P0-18, then P0-19 together with P1-63, P1-64, P1-65 and P1-66.
   - P1-21, once P0-12 is in.
5. **Phase 5: proof of revenue.**
   - P0-17 with P1-45.
   - P0-25 (after Phase 2) with P1-83 and P1-84.
   - P1-71, then P1-75 and P1-2.
   - P0-26, then P1-107, then P1-100.
6. **Phase 6: analytics credibility.** P0-23 with P1-77; P0-24 with P1-76; then P1-72, P1-81, P1-73, P1-74 and P1-82.
7. **Phase 7: activation and reach.**
   - **Activation:** P1-86, P1-89, P1-87, P1-88 and P1-39.
   - **Reach:** P1-91 (after P0-4) and P1-92.
   - **New surfaces:** the P0-9 renderer and the on-site builder (P1-94 to P1-103), then web push (P1-26).
   - **Later:** P1-33, once Meta Tech Provider approval lands.

**Dependencies to respect**
- **Email ledger (P1-1)** comes before P0-12, P0-16, P0-25, P1-7, P1-8 and the email rows of P1-75.
- **API secrets.** Before P0-1 can require the secret on event endpoints, merchants need P1-111 to get a secret and P1-88 to learn how to use it. The import endpoints have no frontend caller, so they can require the secret right away.
- **Shopify scopes.** P0-4 must ship before any new Shopify scope: discount codes for P0-26 and the pixel extension for P1-91.
- **Carousels.** Submit no dynamic carousel template before P1-31 (the short-link base domain) is done; this is the CLAUDE.md hard rule. P1-30 (sending carousel cards) is what unblocks the Phase A smoke test. P0-27 doesn't touch carousel card buttons, but it breaks every other tracked button, so fix it first anyway.
- **CSV import.** P0-18's normalised matching comes before P0-19. Ship P1-64 with P0-19, so imports don't stamp profiles as new and active or skip consent.
- **Flows.** P0-15 comes before P1-42, and P0-14 before relying on P1-11 fallbacks.
- **Coupons.** P0-26 comes before P1-100 and P1-107.

---

## 5. Where Storees wins

Lead with these in demos. The last column lists what to fix before showing each one.

| Strength | What to show | Modules | Fix before demoing |
|---|---|---|---|
| WhatsApp operations | <ul><li>Templates authored, linted (30 rules), submitted and tracked inside the campaign, with AI drafts</li><li>Caps, consent and 24-hour gating that follow the template category; STOP/START opt-outs</li><li>Business profile editor; usage and estimated spend by category; Storees-managed numbers</li><li>Shared Inbox with an AI chatbot and human handoff</li></ul> | [04], [20], [25], [12] | P0-8 and P0-27, P1-30 (carousels), P1-28 (utility window). Hide WhatsApp A/B |
| Shopify-native onboarding and data | One OAuth approval creates the project and: <ul><li>registers 17 webhook topics plus GDPR hooks</li><li>imports history: customers with consent, orders with fulfilment and refund status, products and collections</li><li>activates segments and default flows</li></ul> Checkout is stitched to the browsing session through `storees_sid` | [25], [17], [09], [06], [11] | P0-4 (reinstall wipe); P1-91 (the pixel still has to be pasted) |
| Commerce-native segmentation | <ul><li>"Within the same order" condition groups</li><li>Product, collection and category purchase, view and wishlist rules with an image picker</li><li>Scoped purchase aggregates; revenue that excludes cancelled, returned and refunded orders</li><li>Full member lists and 12 seeded segment templates</li></ul> | [07], [01], [17] | P0-20 and P0-21; the seeded "High Value Customers" uses paise thresholds |
| Pre-send audience diagnostics | <ul><li>A deliverability funnel from candidates to recipients, with a root-cause sentence</li><li>A stale-list guard: Send Now returns 409 when over 30% of email recipients haven't opened in 90 days</li><li>An audience cap, and subscription-category counts</li></ul> | [01], [03], [04], [07], [20] | Opt-outs are counted for email only, and subscription categories currently block everyone (P1-20) |
| Measurement | <ul><li>Per-goal holdout lift with incremental conversions</li><li>An Any / View-through / Click-through switch</li><li>Per-recipient drill-down with failure reasons, and Notification Logs with block reasons</li><li>Revenue with no goal setup</li></ul> | [01], [03], [15], [11] | The Revenue card shows "$"; email is absent from the logs (P1-1) |
| Predictions and RFM | <ul><li>An RFM grid from install, with tactics and drill-down</li><li>Prediction goals with derived windows, nightly retraining, Global/Active AUC, version rollback and hour-level cart-abandonment scoring</li><li>Scores in segments and on profiles; Next Best Action</li></ul> | [08], [11], [07], [16] | P0-22 (bucket bug); the per-segment AUC expander crashes the page; RFM cells can't become segments (P1-59) |
| Smart content in every channel, on every plan | <ul><li>Recommended products, social proof, cart items and brand tokens resolved per recipient in email, SMS, push and WhatsApp (MoEngage: Enterprise only, and no WhatsApp)</li><li>An AI Email Designer that uses the brand kit</li></ul> | [13], [02], [03], [14] | P0-6 (flow email), P0-5 (SMS) |
| AI in context | <ul><li>SMS, push and email copywriters that apply 1-5 variants in place</li><li>AI Rewrite on email blocks; a WhatsApp template copilot</li><li>Bring-your-own LLM (Groq, OpenAI, Anthropic) with a connection test</li></ul> | [16], [02], [25] | P1-53 (Segment AI broken), P1-108 (Apply body); AI-designed emails fail the template save lint |
| Admin debugging and data ops | <ul><li>An Event Debugger with server-side filters and an identity-stitching Sessions panel</li><li>Event Sources: no-code inbound webhooks with schema inference, "Why didn't this match?" and reprocessing</li><li>Signed outbound webhooks with resend</li><li>Write-time dedup with one fingerprint per order; Data maintenance self-repair</li></ul> | [18], [17], [22], [25], [05] | The debugger and Event Sources are admin-only; outbound webhooks fire on segment enter and exit only |
| Privacy and consent | <ul><li>Server-side, role-based masking of email and phone, including nested JSON</li><li>A consent audit trail on the profile</li><li>DPDP-grade consent capture on opt-in widgets (exact text, IP, honeypot, rate limit)</li><li>GDPR/DPDP export and erasure; an ingestion PII guard</li></ul> | [21], [22], [07], [05], [09], [14] | The consent CSV export has no button; P1-115 (trip-context PII); the funnel drill-down is unmasked (P2) |
| Flow extras | <ul><li>A per-customer flow Debug tab and a Journeys tab</li><li>An HTTP step whose response personalises later messages</li><li>Several OR'd exit events; customer, dealer or both routing</li><li>A WhatsApp approval gate; default flows seeded on connect; branching on ML scores</li></ul> | [06], [14], [23] | P0-3 (SSRF), P0-14, P0-15 |
| Commercial terms | <ul><li>Core analytics, recommendations and CLV/AOV on every plan, and the WhatsApp bot on every paid plan</li><li>Self-serve upgrade through Shopify billing, where MoEngage shows "I'm interested" sales forms</li></ul> | [10], [13], [17], [14], [25] | Trial plans don't get the bot; upgrading needs a connected store |
| Click-to-WhatsApp attribution | Leads and engagement for each Meta ad, implicit opt-in, and a `ctwa_lead_received` flow trigger | [01], [05], [11], [15], [20] | No navigation item or link points to the page, and the Converted and Revenue columns are never written |

**Demo traps (avoid until fixed)**
- **Broken sends:**
  - Sending an SMS campaign (P0-5).
  - Any flow email step (P0-6).
  - Push with a platform selected (P0-7).
  - The In-App channel (P0-9).
  - "Saved segment" with nothing chosen (P0-8).
- **Builder options that block everyone:** "Send to: Dealer" on SMS or push (every dealer send is blocked on those channels), and picking any subscription category (blocks every recipient) ([03]).
- **Features that don't work yet:** WhatsApp A/B, carousel templates and "User's timezone" scheduling (P1-18, P1-30, P1-3). Also Segment AI and prediction-bucket rules (P1-53, P0-22).
- **Pages that may break in front of a buyer:**
  - Analytics > Product Analytics probably never leaves its spinner ([10]).
  - Expanding "Segments (N)" on Predictions crashes the page ([08]).
  - The "Create Flow" link in Segment Transitions points to a page that doesn't exist ([11]).

---

## 6. Screenshot gallery index

Each link opens the module's Screens gallery. Galleries are grouped by page, with a caption on every image.

- [01 Engage > Campaigns](modules/01-engage-campaigns.md#screens): 84 screenshots
- [02 Campaign builder: Email](modules/02-builder-email.md#screens): 127
- [03 Campaign builder: Push & SMS](modules/03-builder-push-sms.md#screens): 147
- [04 Campaign builder: WhatsApp](modules/04-builder-whatsapp.md#screens): 64
- [05 On-site, In-app, Cards, connectors, ad audiences](modules/05-builder-onsite-inapp-other.md#screens): 117
- [06 Flows](modules/06-flows.md#screens): 124
- [07 Segments, builder, Search Users, profile](modules/07-segments-builder-profiles.md#screens): 102 (10 show PII and are flagged for redaction)
- [08 RFM, Predictive & Warehouse segments](modules/08-segments-rfm-predictive-warehouse.md#screens): 47
- [09 File segments, imports & exports](modules/09-segments-files-imports-exports.md#screens): 61 (6 show email addresses and are flagged for redaction)
- [10 Analyze: My Studio, Users, Behavior, Funnels](modules/10-analyze-core.md#screens): 135
- [11 Analyze: Retention, Session & Source, Paths, Acquisition, Uninstalls](modules/11-analyze-advanced.md#screens): 77
- [12 Home, Dashboards, header, Create New](modules/12-home-dashboards.md#screens): 66
- [13 Content](modules/13-content.md#screens): 116
- [14 Inform & Personalize](modules/14-inform-personalize.md#screens): 21
- [15 Reports](modules/15-reports.md#screens): 58 (59 embeds)
- [16 Merlin AI Studio](modules/16-merlin-ai.md#screens): 39
- [17 Data imports & computed traits](modules/17-data-imports-computed-traits.md#screens): 70
- [18 Test & Debug](modules/18-test-debug-devtools.md#screens): 35 (36 embeds)
- [19 Settings: Push, Email, SMS & RCS](modules/19-settings-push-email-sms.md#screens): 44
- [20 Settings: WhatsApp, delivery controls, preferences](modules/20-settings-whatsapp-delivery-preferences.md#screens): 18
- [21 Settings: Accounts](modules/21-settings-accounts.md#screens): 44
- [22 Settings: Analytics & data management](modules/22-settings-analytics-data-management.md#screens): 61
- [23 Settings: Advanced 1](modules/23-settings-advanced-1.md#screens): 32
- [24 Settings: Advanced 2 & reports/alerts](modules/24-settings-advanced-2.md#screens): 45
- [25 App Marketplace](modules/25-app-marketplace.md#screens): 122

All image files are in `screenshots/` (1,856 files), named `<module>-<nn>-<page>.jpg`.

---

## 7. Appendix

### A. Method and legend

**MoEngage capture**
- Agents browsed the user's logged-in Test workspace in Chrome, section by section.
- Rules: no save, publish, send, import, export, connect or delete, and no workspace or Test/Live switch.
- Where a builder blocked later steps because a channel wasn't configured, some agents reached those steps by changing the page's local React state. No request was sent; these screenshots show red step icons ([03]) or injected placeholder rows ([07], [09]).
- Locked screens were described from the dashboard's JS bundles, React props or public docs, and labelled that way in each section.

**Storees assessment**
- Code at `2063cdc`, with `file:line` evidence for every row; the app was not run.
- A second agent re-checked every row against the code, making 315 corrections across the sections.
- A completeness review compared rows that describe the same MoEngage feature in different sections, re-checked the code, and changed 18 statuses so they agree (listed under "Cross-module consistency review" in each section's Verification notes). It also spot-checked 15 ❌ rows (11 distinct claims, P0s first) and 9 ✅ rows against the code, and all of them held; four other ✅ rows were downgraded by the consistency check.
- An independent re-check on 12 Nov 2026 traced all 17 shipped-code P0 defects end to end, read-only. P0-1 to P0-4 were checked by hand. P0-5 to P0-9, P0-11, P0-12, P0-14 to P0-16, P0-22, P0-23 and P0-27, plus P0-20 and P0-24, were checked by five adversarial verifier agents. Every core claim held. Corrections made:
  - P0-27 does not affect carousel card buttons, which live in a separate column, so it does not block the carousel smoke test.
  - P0-9's "every visitor" is what would happen once an SDK calls the API; today no shopper sees in-app messages at all.
  - P0-14, P0-15 and P0-16 describe the mechanism more precisely.
  - P0-20 notes the one-click workaround for city and state.
  - Effort changed for P0-7 (S to M), P0-9 (S to hide, L to ship) and P0-20 (M; S for city and state).

**Volume**
- 25 sections, 266 page entries and 1,856 screenshot files (1,858 embeds).
- 1,469 feature rows.

**Statuses**
- ✅ Full: the same capability.
- 🟡 Partial: it exists but is narrower or defective.
- ❌ Missing.
- ⭐ Storees better.
- ➖ N/A: not relevant to a web-first Shopify product, for example mobile-SDK-only features.

**Parity** = (✅ + ⭐ + 0.5 × 🟡) / (rows − ➖).

**Priority and effort**
- P0: fix or build first. These are defects that break core sends, compliance or security, or table-stakes gaps that lose deals.
- P1: high. P2: medium. P3: low.
- Effort is the relative size rated in the sections (S < M < L < XL).

### B. What was not covered, and why

**Cross-cutting limits**
- **Empty Test workspace.** There were no events, campaigns, flows, custom dashboards or reports, so these were not seen: result charts, row actions, detail pages, per-campaign and per-flow analytics, event-attribute filters and aggregation options.
- **Developer role.** It could not open: Drafts, Security/login settings, locale creation, OAuth configs, member actions, adding SMS senders, and email sender setup.
- **Paid add-ons, not enabled or flagged:** Inform, Personalize, Recommendations, Warehouse Segments, Computed Traits, My Studio, Cards, MMS, RCS, the Best time dashboard, alert destinations, and Segment Assist and Flow Assist.
- **Read-only stops.** These were never clicked: Next where it would auto-save, Create, Publish, Test, Generate, Upload, Download, Request access and "I'm interested". The one exception, an accidental "Create AI Variant" click in module 03, was blocked before it reached MoEngage ([Appendix C](#c-side-effects-to-clean-up-in-moengage)).
- **Unconfigured channels.** There was no SMTP connector or verified sender, SMS connector, push config or WhatsApp BSP, so template-dependent content was not rendered.
- **App Marketplace.** About 45 of 165 partner detail pages were opened; card text was captured for all of them.
- **Personal data.** The Created-by and teammate-email dropdowns were not screenshotted. Even so, 16 screenshots show personal data and are flagged for redaction before this folder is shared or committed: 10 in module 07 (the three test users' names, emails and phone numbers) and 6 in module 09 (the logged-in user's and a teammate's email).

**Navigation coverage.** Every sidebar, header and Create New item was opened. These were reached only as an upsell, a redirect, an error or an empty state:
- **Paid add-on promos:** My Studio, Warehouse Segments, Computed Traits, Recommendations (Enterprise), Inform's All Alerts and Settings > Others > Inform, and Personalize's All Experiences.
- **Redirects:** New Alert Report and Alert Reports go to the Inform promo.
- **Errors or empty states:** User Exports ("Failed to get user reports"), Key Metrics (no widgets in the Test environment) and Reachability ("No platform enabled for analysis").

**Per module**

| Module | Not covered (why) |
|---|---|
| [01] | Drafts tab (role); row actions and detail pages (0 campaigns); event sub-filters (no events); wizard steps 2-3 (Next would auto-save); Import campaign step 2; other channel builders (modules 02-05); links into other modules (Merlin Custom Agents, Explore apps, Check Event Log) not followed |
| [02] | Step 3 (Schedule and goals) for every email type, because Content needs a connector and a verified sender (send-time optimisation, time zones, recurrence, goals, delivery controls and approval were not seen); Event Triggered beyond step 1; zip upload; template gallery pages 2-5; test sends; Merlin Generate; some Beefree property panels |
| [03] | Content and schedule steps reached only through local React state; push templates other than Basic; push A/B, locale and personalised preview; the "Create AI Variant" result (an accidental click was blocked); MMS, RCS and sender-ID types; event dropdowns empty; Best time to send, approval workflow and Teams selector (not shown in this workspace) |
| [04] | Content that depends on a template (placeholder mapping, media, buttons, carousel cards, limited-time offers, URL shortening, A/B, locales), because there is no BSP or approved template; listed from app code. Event Triggered event list; FC/DND and connector routes redirect; Meta "Add sender" not opened; campaign info page; Drafts; the Revenue performance toggle (not flipped) |
| [05] | On-site steps 2-3 (a draft auto-saved, so exploration stopped); some on-site step-1 sub-options; locked Cards, MMS, RCS, Telegram/Line/Viber and ad-audience apps; uploads, tests, publish and the "I'm interested" forms; the in-app iOS tab and the gamification Losing screen |
| [06] | Row menus, analytics, versioning, pause/stop and test runs (0 flows; saving not allowed); "Use Template" (creates a draft); template previews never loaded; event-attribute filters; deep channel editors; Facebook and Google nodes; locked palette items |
| [07] | Event rows filled only with placeholder state; event-attribute operators and aggregation functions; Show count, Create, Archive and TEST sends not clicked; empty profile timeline; Merlin agent redirect |
| [08] | RFM results (no conversion goal, no events); prediction results, quality, distribution and archive (need a prediction); the Warehouse builder (paid add-on) |
| [09] | Real upload and preview (steps 2-3 opened via local state with injected columns); Create, Add, Replace and Schedule not clicked; the User Exports list failed to load; S3 and SFTP sources (module 17); failed or partial-success import details (only one successful import exists) |
| [10] | Behavior and Funnels results (no events); funnel split and holding-attribute options; event-attribute filters; a Users split-by query timed out; My Studio locked; page-size picker |
| [11] | Chart and table toolbars that need data (labels taken from the JS bundle); Retention split-by; settings links (Settings modules); some Session & Source report types not offered |
| [12] | Key Metrics and Reachability widgets (Test env; taken from front-end code); the custom dashboard builder (needs Create); the Best time dashboard (not enabled); Ask AI; demo-account links; external help links (URLs only) |
| [13] | Recommendations builder (Enterprise lock); the content block "@" picker; real block edit pages; list tables seen only with mocked rows; landing-page Save, Publish and uploads; coupon upload, preview and usage report; no versioning UI was seen; Manage tags and custom-domain settings left to module 23 |
| [14] | Inform and Personalize are add-ons that are not enabled. Their whole UI (alerts list, wizard, logs and settings; experience list, wizard and WYSIWYG editor) was rebuilt from JS bundles and public docs. The flag-gated Decisioning menu (Offerings, Decision policies) was not explored |
| [15] | Report list and campaign picker with data (0 campaigns); the Inform report builder (add-on); actions on existing reports; step-3 date pickers |
| [16] | Generate not clicked (monthly quota), so outputs, feedback and the usage counter come from code; the Jinja template picker returned 401; file choosers; flagged Segment Assist, Flow Assist and In-app Template; Campaign Insight Agent |
| [17] | Wizard steps 2-3 without real SFTP, S3 or CSV input (S3 steps were shown by removing CSS hiding); datetime formats and column types; warehouse imports (hidden); the Computed Traits builder (paid; from docs); a populated imports list |
| [18] | Event Log hidden by a feature flag (from code); live device sessions (need an Android device); Jinja Generate; tours and the demo account; developers.moengage.com (read with a server-side fetch) |
| [19] | Toggles not clicked (web push opt-in, push exclude, SMS opt-out); role-locked email setup, add sender, categories, CSV upload and fonts; the SMS add-sender wizard; RCS, keywords, PII tokenization and dynamic routing (not enabled); Bot Management > Email, HMS/Huawei push and IP-pool settings (not present in this workspace) |
| [20] | Meta "Add sender" opened a manual form (no Facebook window); the approved templates list and sync (need a sender); disabled controls read from React props; save behaviour not tested; a hidden fourth WhatsApp tab |
| [21] | Invite step 2 (needs an email typed in); Security/login settings (role-gated); custom roles and Teams tab not shown; currency dropdowns disabled; member row actions disabled; key reveal, regenerate and create not clicked; MCP tool list from docs |
| [22] | Event row views (no events; options from component state); downloads, saves, Block and visibility controls not clicked; toggles disabled for the role |
| [23] | Add locale (permission); Content API step 2 (needs a real API); Accessibility with the switch on; Custom Domain email and landing-page modals (disabled; from code); tag and category edit and delete (only locked system defaults exist) |
| [24] | Add OAuth config (role); UTM parameter table (toggle off); other attribution choices (would change state); alert create/edit (flag-hidden); alert destination (plan-locked); domain whitelist (admin only); the "Event triggered Flows FUP" and "FB Token Expiry" alert views (opened, not saved, as they match other views); Subscribe to email |
| [25] | Integration config forms (disabled for this user); contact and install buttons not clicked; external partner docs; about 45 of 165 detail pages opened; the Support filter renders no cards (a MoEngage UI bug) |

**Storees findings to confirm on a running instance**
- WhatsApp webhook routing for brand-owned Meta apps (P1-35).
- Segment AI failing every request (P1-53).
- The Product Analytics spinner ([10]).
- Anything a section marks "read from code, not run".

### C. Side effects to clean up in MoEngage

- One on-site campaign draft named **"Untitled"** (draftId `6af4767a7dabd118e6f5b85d`) was auto-saved in the MoEngage Test workspace during the module 05 capture. The On-site builder saves a server draft on the first click.
- To remove it, delete it from **All Campaigns > Drafts** using a role that can open Drafts; the Developer role can't.
- The sections record no other writes. One accidental "Create AI Variant" click in the push builder (module 03) was blocked by the agent's network guard and showed only an error toast, so it should not have created a variant or used Merlin quota.

[01]: modules/01-engage-campaigns.md
[02]: modules/02-builder-email.md
[03]: modules/03-builder-push-sms.md
[04]: modules/04-builder-whatsapp.md
[05]: modules/05-builder-onsite-inapp-other.md
[06]: modules/06-flows.md
[07]: modules/07-segments-builder-profiles.md
[08]: modules/08-segments-rfm-predictive-warehouse.md
[09]: modules/09-segments-files-imports-exports.md
[10]: modules/10-analyze-core.md
[11]: modules/11-analyze-advanced.md
[12]: modules/12-home-dashboards.md
[13]: modules/13-content.md
[14]: modules/14-inform-personalize.md
[15]: modules/15-reports.md
[16]: modules/16-merlin-ai.md
[17]: modules/17-data-imports-computed-traits.md
[18]: modules/18-test-debug-devtools.md
[19]: modules/19-settings-push-email-sms.md
[20]: modules/20-settings-whatsapp-delivery-preferences.md
[21]: modules/21-settings-accounts.md
[22]: modules/22-settings-analytics-data-management.md
[23]: modules/23-settings-advanced-1.md
[24]: modules/24-settings-advanced-2.md
[25]: modules/25-app-marketplace.md
