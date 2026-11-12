## 09. Segment > File segments, User imports & User exports

Storees has no marketer-facing equivalent of this module: there are no file (static) segments, no CSV import screen and no export history, so a brand cannot upload a phone or email list and message it without an engineer. Its ingestion is strong on the engineering and admin side: automatic Shopify sync, a JSON bulk-import API for customers and historical orders, super-admin pull connectors with row-level sync logs, and Event Sources webhooks. It also has a per-segment hashed ad-audience export, which MoEngage's workspace did not offer. The existing import API needs fixes before a CSV screen is built on it:
- imported opt-outs do not stop sends;
- imported profiles are stamped as new and active at import time;
- identifiers are matched exactly, so a 10-digit mobile number does not match the same number stored with +91;
- the endpoints accept the public SDK key.

### MoEngage overview

MoEngage puts list ingestion in the Segment menu, beside "+ New Segment". The module has three parts.

- **File segments.** A static segment is built from a one-column CSV.
  - **File:** uploaded (up to 64 MB) or fetched from a public HTTPS URL (up to 300 MB).
  - **Matching:** rows are matched on one chosen user attribute, and the attribute fixes the data type.
  - **Alerts:** a required list of up to 50 alert emails is notified when processing finishes.
  - **Edit:** the Edit modal adds, removes or replaces users from a new file.
  - **Listing:** file segments are listed as type File under All Segments. When a user import created the segment, its info page shows the source "Import Users".
- **User imports.** A 3-step CSV wizard.
  - **Step 1 (Source and format):** choose Registered or Anonymous users and upload a CSV under 150 MB. A Preview file gate must pass before Next, and a live quota hint shows how many users can still be uploaded.
  - **Step 2 (Import configuration and action):** map the identifier and each column to an attribute. Columns can be skipped, and "+ Create new attribute" offers 7 types. Date columns take one of 18 datetime formats. Options: skip new users, save the users as a file segment (up to 5M users), and email the import status to up to 10 recipients.
  - **Step 3 (Scheduling):** the import runs once, either as soon as possible or at a set date, time and time zone.
  - **Supporting screens:** a drawer with hourly and daily quotas for user, event and aux-data imports; a filterable import history; and a details page with the run history and a per-file drawer.
- **User exports.** This is only a list of generated export files. In this workspace it was empty and failed to load ("Failed to get user reports"). No segment screen offered a way to create an export.

**Capture limits.**
- **No upload:** no file was uploaded. Steps 2 and 3 of the wizard were opened by setting its local React state, and the column-mapping rows (screenshots 036-046) come from four placeholder column names.
- **Not clicked:**
  - "Upload mapping file".
  - The "Download a sample" links.
  - Duplicate.
  - Every Create button.
  - Add users and Replace users.
  - Schedule Import.
- **Not opened:** the "Send import status" recipient list, because it lists teammates' emails.
- **Not seen:**
  - What a user export contains (formats, destinations, attribute choice).
  - The S3, SFTP and warehouse import sources, which belong to another module.
  - A failed or partially successful import.
- **No side effects:** nothing was created or changed.

| Page visited | URL path |
|---|---|
| Segment flyout (module entry points) | Hover flyout on the sidebar Segment icon (any page) |
| New File Segment (Create file segment modal) | `/v4/segmentation/all-segments/custom-segments?createFileSegment=true` |
| File segment management (All Segments row, Edit file segment, info page, type filter) | `/v4/segmentation/all-segments/custom-segments` and `/v4/segmentation/all-segments/custom-segments/<segmentId>` |
| New User Import: Step 1 Source and format | `/v4/partners/imports/users/create?filesource=csv&type=users&source=file` |
| Import limit overview drawer | Drawer opened by "Check import limit" on the wizard and the User imports list |
| New User Import: Step 2 Import configuration and action (mapping) | Same wizard URL, step 2 |
| New User Import: Step 3 Scheduling | Same wizard URL, step 3 |
| User Imports (import history list) | `/v4/partners/imports/users?type=users&source=file` |
| Import details (run history + View files drawer) | `/v4/partners/imports/users/details/<importId>?type=users&source=file&filesource=CSV` |
| User Exports | `/v4/reports/users` |
| Export entry-point check (segment info Actions, segment builder Actions, query results menu) | `/v4/segmentation/all-segments/custom-segments/<segmentId>` and `/v4/segmentation/create` |

### Storees counterpart

- **Segments are always rule-based.**
  - **Data model:** `segments.filters` is NOT NULL and there is no source column (`packages/backend/src/db/schema.ts:303-321`). The shared `Segment` type allows only `'default' | 'custom'` (`packages/shared/src/types.ts:394-408`); seeders also write `'template'`.
  - **Membership:** `evaluateSegment` rebuilds `customer_segments` from the filter on every pass (`packages/backend/src/services/segmentService.ts:66-195`). Nothing else writes that table.
  - **UI:**
    - Cards on `/segments` (`packages/frontend/src/app/(dashboard)/segments/page.tsx`).
    - The builder at `/segments/create` and `/segments/[id]/edit`.
    - No read-only detail page.
- **Bulk import is a JSON API, not a screen.**
  - **Endpoints:** `POST /api/v1/import/customers`, `/orders`, `/products` and `/dealers` (`packages/backend/src/routes/v1Import.ts:57-416`), up to 1,000 rows per call.
  - **Auth:** the project's public SDK key (`v1Import.ts:33`).
  - **Users:** nothing in `packages/frontend` calls these endpoints. Engineers use them during onboarding (`docs/strategy/CLIENT_ONBOARDING.md`).
- **Other ingestion:**
  - The Shopify sync and Shopify webhooks (`packages/backend/src/workers/syncWorker.ts`, `packages/backend/src/routes/webhooks.ts`).
  - REST pull connectors with Test, schedules and a sync history. They are set up in the Data Sources panel on the super-admin `/projects` page (`packages/frontend/src/components/data-sources/`; `packages/backend/src/routes/dataConnectors.ts`; `packages/backend/src/workers/dataSyncWorker.ts`).
  - Event Sources inbound webhooks, which have identity and profile-field mapping for project admins (`packages/frontend/src/app/(dashboard)/event-sources/[id]/page.tsx`; `packages/backend/src/services/inboundWebhookService.ts`).
- **Exports are immediate downloads, with no history:**
  - "Export to ads", a hashed CSV on each segment card (`packages/frontend/src/components/segments/ExportAudienceButton.tsx`; `packages/backend/src/services/adAudienceExport.ts`).
  - A JSON data-subject export for one customer (`packages/backend/src/routes/customers.ts:922`; `packages/frontend/src/components/customers/DataSubjectCard.tsx`).
  - A consent-audit CSV that exists only as an API (`packages/backend/src/routes/v1Onboarding.ts:908`).

**Path key for the Evidence column.** Line numbers are at commit `2063cdc`.

| Short name | Repo path |
|---|---|
| `Sidebar.tsx` | `packages/frontend/src/components/layout/Sidebar.tsx` |
| `segments/page.tsx`, `segments/[id]/edit/page.tsx` | `packages/frontend/src/app/(dashboard)/segments/` |
| `customers/page.tsx`, `campaigns/create/page.tsx`, `projects/page.tsx`, `event-sources/[id]/page.tsx`, `settings/roles/page.tsx` | `packages/frontend/src/app/(dashboard)/` |
| `ExportAudienceButton.tsx`, `SegmentPreviewPanel.tsx`, `SFB` (SegmentFilterBuilder.tsx) | `packages/frontend/src/components/segments/` |
| `ConnectorsSection.tsx`, `SyncHistoryTable.tsx`, `AddConnectorDialog.tsx` | `packages/frontend/src/components/data-sources/` |
| `DataSubjectCard.tsx` | `packages/frontend/src/components/customers/` |
| `v1Import.ts`, `routes/*.ts` | `packages/backend/src/routes/` |
| `customerService.ts`, `segmentService.ts`, `adAudienceExport.ts`, `entitlementService.ts`, `campaignService.ts`, `deliveryService.ts`, `consentService.ts`, `inboundWebhookService.ts`, `storageService.ts`, `ssrfGuard.ts`, `templateAlertService.ts`, `unsubscribeService.ts`, `variableSources.ts`, `domainRegistry.ts`, `webhookService.ts`, `flowExecutor.ts`, `connectors/genericHttpConnector.ts` | `packages/backend/src/services/` |
| `apiKeyAuth.ts`, `rateLimiter.ts`, `capabilities.ts` | `packages/backend/src/middleware/` |
| `syncWorker.ts`, `dataSyncWorker.ts`, `triggerWorker.ts` | `packages/backend/src/workers/` |
| `schema.ts`, `0005_race_condition_fixes.sql` | `packages/backend/src/db/schema.ts`, `packages/backend/src/db/migrations/` |
| `packs/ecommerce.json`, `backend/package.json` | `packages/backend/src/packs/`, `packages/backend/package.json` |
| `evaluator.ts` | `packages/segments/src/evaluator.ts` |
| `types.ts` | `packages/shared/src/types.ts` |

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Navigation | Module entry points (+ New User Import, + New File Segment, User Imports, User Exports) | All four in the Segment flyout; "Import users" button on the imports list | 🟡 Partial | No import, upload or file-segment entry for project admins (`Sidebar.tsx:54-81`; `segments/page.tsx:23-53`; `customers/page.tsx:105-115`). Ingestion screens: Event Sources (admin, `Sidebar.tsx:63`), Data Sources (super-admin, `projects/page.tsx:148,339`). Exports: "Export to ads" per segment (`segments/page.tsx:183`), data-subject export per profile (`DataSubjectCard.tsx`) | Ship the entry points with the features: "Upload a list" beside Create Segment, "Import customers" on `/customers`, and an Imports history that project admins can open. | P2 | S |
| File segments | Create file segment (static segment from an uploaded list) | Modal: required name, description (300 chars), file (upload or URL), identifier attribute and data type, alert emails (up to 50); Create disabled until valid; segment type File | ❌ Missing | `filters` NOT NULL, no source column (`schema.ts:303-321`). POST requires filters and hardcodes `type: 'custom'` (`routes/segments.ts:187-223`). Each pass rebuilds membership from filters (`segmentService.ts:66-195`); no other writer of `customer_segments`. No in-list operator (`types.ts:550-560`); builder targets one identifier per rule (`SFB:214,524`). Building blocks: multer (`routes/assets.ts:4,32-53`), private storage (`storageService.ts:134`) | No way to target an uploaded list (offline or COD-confirmed buyers, event attendees, opt-ins from another WhatsApp provider). Needs a "file" type that evaluation and the ad export skip, an upload endpoint that writes `customer_segments` and emits enters/exits events, a create modal and a FILE badge. Campaigns, flows and the member list already read `customer_segments`. | P0 | M |
| File segments | Upload format and sample file (one-column CSV up to 64 MB, drag and drop, sample) | CSV only, one column, 64 MB; drag and drop or upload; "Download a sample" (Sample_GAIDs.csv) | ❌ Missing | No CSV library or parser (`backend/package.json:19-36`). Frontend file inputs are only for images, WhatsApp media, FCM JSON, call transcripts and campaign attachments | Ship with the file segment: drag and drop, size and column checks, and a sample CSV of phone numbers or emails, which is what Indian D2C lists usually contain. | P1 | S |
| File segments | File segment from URL (public HTTPS CSV up to 300 MB) | "Provide URL": https, public (no VPN), valid CSV of 300 MB or less | ❌ Missing | No URL file ingestion. SSRF guard exists (`ssrfGuard.ts:13`), used by `connectors/genericHttpConnector.ts:260` and `webhookService.ts:122` | Useful for lists in Google Sheets or on a brand's server; rarely decisive for D2C. Reuse `assertPublicUrl`. | P3 | S |
| File segments | Identifier attribute: ID, Email or Mobile Number | One identifier column from Tracked Standard Attributes (ID, Email, Mobile Number, names); data type fixed to string | ❌ Missing | No list matching. The keys exist and are unique per project: `external_id` (`schema.ts:162`); email and phone partial unique indexes (`0005_race_condition_fixes.sql:8-12`). Resolution is an exact match on external_id, then email, then phone (`customerService.ts:401-529`): emails are not lowercased and phones not normalised. Only the opt-in widget adds +91 (`v1OptIn.ts:131-136`) | This is the matching step of the file segment. Batch-match on external id, email or phone after normalising: lowercase emails, convert phones to E.164 with +91 as default. Otherwise a CSV of 10-digit mobiles misses Shopify's +91 numbers. | P0 | S |
| File segments | Identifier attribute: device advertising IDs (GAID, IDFA) | Device Data group: GAID, IDFA, Browser Details, OS Version iOS; the sample file is GAIDs | ➖ N/A | Web SDK only (`packages/sdk/src`). No mobile SDK package; no advertis, gaid or idfa in any SDK | Not relevant until Storees ships mobile SDKs. | — | — |
| File segments | Identifier attribute: any other tracked attribute (grouped, searchable picker) | Groups: Lifecycle, Acquisition, Reachability, Localization, Email Opt-in Status, Tracked Custom Attributes | ❌ Missing | Field catalogue is the per-vertical registry (`domainRegistry.ts`); custom attributes are untyped JSONB (`schema.ts:153`) compared as text (`evaluator.ts:1197-1208`) | Matching a list on a non-identity attribute (city, LTV) is rare, and a rule segment covers it. Limit identifiers to external id, email and phone. | P3 | S |
| File segments | Data type derived from the chosen attribute | The Data type select offers only the attribute's tracked type (ID gives string, LTV gives double) | ❌ Missing | No typed attribute catalogue (`schema.ts:153`; `evaluator.ts:1197-1208`) | Not needed while identifiers are external id, email and phone (all strings). Revisit with a typed registry. | P3 | S |
| File segments | Identifier uniqueness warning | Info box: the attribute must identify one user; a value matching several users may block others; "Know more" link | ➖ N/A | Identity keys are unique per project (`schema.ts:162`; `0005_race_condition_fixes.sql:8-12`), so a value cannot match several profiles. Edge cases: email and phone that belong to two profiles fail the row on the phone index (`customerService.ts:419-433`); normalised matching can hit profiles differing only in case or phone format | Skip the warning. After matching, report malformed, unmatched and multi-match rows. | — | — |
| File segments | In-product help video ("Watch video") | Opens the YouTube "File Segment Walkthrough" | ❌ Missing | No help videos or docs links in the frontend; searches for watch video, youtube and learn more hit only email-builder icons and a CTA default | Low value; an inline example and a sample file do the same job. | P3 | S |
| File segment management | Update a file segment from a new file (Add, Remove or Replace users) | "Edit- Test File" modal: Select action (Add, Remove or Replace users), new file (upload or URL), identifier, alert emails; primary button named after the action | ❌ Missing | Card Edit always opens the rule builder (`segments/page.tsx:146-152`). PATCH changes only name, description, filters, isActive (`routes/segments.ts:227-265`). No member add/remove API | Needed for recurring lists (weekly COD-confirmed buyers, monthly offline-store list). Replace resets the segment's rows; Add and Remove insert or delete matched ids and emit `enters_segment`/`exits_segment` as `segmentService.ts:136-183` does. | P1 | S |
| File segment management | Segment row actions (View, Edit, Duplicate, Archive, Create campaign, Analyze) | Row menu: View (new tab), Edit, Duplicate (disabled for file segments), Archive, Create campaign, Analyze Segment | 🟡 Partial | Cards: Edit, Archive/Restore (default type only), Delete (other types), Export to ads, View members (`segments/page.tsx:145-192`). No View, Duplicate, Create campaign or Analyze; campaign builder ignores a `segmentId` URL param (`campaigns/create/page.tsx:442`) | Add "Create campaign" as a deep link carrying segmentId (WhatsApp first) and Archive for every type. Same gap as module 07. | P2 | S |
| File segment management | Segment type filter (File, Filter, Warehouse - SQL) | "Select Segment Type" multi-select with Clear all and Select all | ❌ Missing | Cards with no search, filter or sort (`segments/page.tsx:86-197`); type only as a badge (`segments/page.tsx:97-106`); `GET /api/segments` takes no filter (`routes/segments.ts:19-55`) | Add a type filter and search once uploaded lists exist. | P3 | S |
| File segment management | File segment info page (source, auto description, counts, reachability by channel, sample users) | Segment Type File, Source "Import Users", auto description, Created On, Last Run Time, User Count, Reachable Users, Push/Email/SMS/WhatsApp tiles, sample users | ❌ Missing | Cards: name, description, badge, filter summary, members, one combined reachable count (`segments/page.tsx:87-145`); members at `/customers?segmentId=` (`routes/customers.ts:73-79`). No detail page, no source or creator column (`schema.ts:303-321`). Per-channel reach only in the campaign builder's Preview audience (`routes/campaigns.ts:301`); its instant `reachable via {channelLabel}` tile is memberCount × 0.9 (`campaigns/create/page.tsx:1048`). Sample users only in the builder (`SegmentPreviewPanel.tsx`) | For uploaded lists show the source (file name or import), upload date, matched and unmatched counts, and WhatsApp, Email and SMS reach. Overlaps module 07's detail-page gap, which is rated ❌: `segments/[id]/` holds only `edit/`. | P2 | S |
| User import: source and format | Import users from a CSV file | "+ New User Import" and "Import users" open a CSV wizard; CSV under 150 MB; no S3, SFTP, URL or warehouse option in this module | 🟡 Partial | JSON API only. `POST /api/v1/import/customers` takes customer_id, email, phone, name, region, city, email/sms_subscribed and dealer_id; up to 1,000 rows per call; returns the first 20 errors. `/orders`, `/products`, `/dealers` work the same way (`v1Import.ts:36-416`). Auth is the public SDK key (`v1Import.ts:33`). No upload or CSV parser, and no frontend caller | A marketer cannot load a list without an engineer. Build a CSV upload behind admin login that streams rows through `resolveCustomer` in a BullMQ job, recorded as an import with counts and a failed-rows file. Start from a fixed sample template. | P0 | L |
| User import: source and format | Import wizard (Source and format, Import configuration and action, Scheduling) | 3-step stepper, Previous/Next, final "Schedule Import"; required Import name; a step with errors shows an error icon | ❌ Missing | No import UI. A 3-step stepper exists in the campaign builder (`campaigns/create/page.tsx:93,432,715`) | Wrap the CSV import in a short wizard: upload and preview, then mapping and options, then confirm. Drop the scheduling step. | P1 | S |
| User import: source and format | User types (Registered or Anonymous users) with a sample file per type | Two cards; the sample link switches between registered and anonymous files | 🟡 Partial | API rows carry customer_id or only email/phone; `resolveCustomer` matches external_id, email, then phone, else creates (`customerService.ts:401-529`). No type choice needed; no UI or sample file | Resolve on whichever identifier a row carries. Offer one sample CSV with customer_id, email and phone columns. | P3 | S |
| User import: source and format | Inline import quota hint | "You can upload upto 610K users in next hour and upto 14M users today" | ❌ Missing | Only a per-key requests-per-minute limit (`rateLimiter.ts:13-55`) and 1,000 rows per call (`v1Import.ts:36`). Trial `contacts` limit (1,000) defined but never enforced; only flows and templates call `checkCountLimit` (`entitlementService.ts:16,39,116`) | Show the per-file row cap and, for trial projects, the remaining contacts. Enforce the contacts limit on import. | P3 | S |
| User import: limits | Import limit overview drawer (user, event and aux-data quotas; top contributing imports) | User 610K per hour and 14.1M per day; Event 5.1M and 41M; Aux 1.5M and 25M. Progress bars, reset tooltip, Refresh, top-5 imports (Hourly/Daily) | ❌ Missing | No usage or quota view. Rate limiting is per key per minute and fails open when Redis is down (`rateLimiter.ts:50-54`); `GET /api/entitlements` returns plan limits only (`routes/entitlements.ts`) | Enterprise plumbing that D2C volumes do not need. Revisit if imports end up sharing workers at scale. | P3 | M |
| User import: source and format | File preview validation gate | "Preview file" must validate the CSV before Next; "Required input" errors and a toast | 🟡 Partial | Only connectors preview: Test fetches one record per endpoint and shows raw and mapped JSON (`routes/dataConnectors.ts:220-263`; `ConnectorsSection.tsx:124-127,157-162,238-270`). Optional, not a gate, super-admin only. No dry run on the import API | Before an import runs, show detected columns, the first rows, and counts of invalid phone numbers and emails. | P1 | S |
| User import: mapping | Required identifier mapping (User identifier or Anonymous ID) | One column marked "User identifier" (ID) or "Anonymous ID" (e.g. email or mobile); row locked; multi-identifier flag off | 🟡 Partial | Order import rejects rows without an identifier (`v1Import.ts:190`). Customer import does not: such a row creates an empty profile (`customerService.ts:511-529`). Event Sources maps payload fields to Email, Phone, External ID, Session ID, Name (`event-sources/[id]/page.tsx:498-516`) | In the CSV flow let users pick the external id, email and phone columns (several allowed, since Storees resolves on any) and reject rows with none. | P1 | S |
| User import: mapping | Column-to-attribute mapping table | Column name, attribute and data type (plus datetime format), Skip column; column search; total column count; errors for duplicate mappings and bad column names | 🟡 Partial | Import schema is fixed (`v1Import.ts:42-55`). Event Sources maps payload paths to standard fields (phone, email, name, region, city) or any custom key (`event-sources/[id]/page.tsx:287,540-563`; `inboundWebhookService.ts:333-363`). Connector field maps are API-only JSON (`connectors/genericHttpConnector.ts:46-70`; no editor in `AddConnectorDialog.tsx`) | Reuse the Event Sources mapping pattern for CSV columns, adding Skip column and a duplicate-mapping check. A fixed template is acceptable for the first release. | P1 | M |
| User import: mapping | Reusable mapping file | "Upload mapping file" loads a saved column mapping | ❌ Missing | No import entity, so nothing saves a mapping. The only stored mapping is a connector config override, editable only through the API (`routes/dataConnectors.ts:145-189`) | Remember each project's last mapping and re-apply it by column header. | P3 | S |
| User import: mapping | Mappable standard profile attributes (Name, First/Last Name, Email, Mobile) | Name, First Name, Last Name, Email, Mobile Number, ad-personalisation and ad-data consents | 🟡 Partial | `/import/customers` takes customer_id, name, email, phone (`v1Import.ts:42-55`). No first/last name (the Shopify sync joins them, `syncWorker.ts:166-168`); no ad-consent fields | Accept first_name and last_name columns and join them into name. Store ad-consent flags as custom attributes. | P3 | S |
| User import: mapping | Mappable opt-in status (Email, SMS, WhatsApp, Push) | Email Opt-in, SMS, WhatsApp and Web Push subscription status; Reachability Push (Android, iOS, Web, TV) | 🟡 Partial | Import takes only email/sms_subscribed (`v1Import.ts:49-50,90-91`); `resolveCustomer` accepts WhatsApp and push flags (`customerService.ts:324-325`); `/api/v1/customers` maps all four (`v1Events.ts:582-608`). No consent or audit rows written. Sends ignore these flags; only an `opted_out` consents row blocks (`deliveryService.ts:369-381`). Any phone counts as WhatsApp-reachable (`segmentService.ts:100-102`) | Send opt-in columns for all four channels through `updateConsent` (`consentService.ts:21`), which writes the consent row, the flag and `consent_audit_log`, with a new "import" source. WhatsApp-led brands need that proof when moving a list (Meta opt-in policy, DPDP). | P1 | S |
| User import: mapping | Mappable email suppression type (Spam, Hard Bounce, Unsubscribe) | Email Suppression Type group: Spam, Hard Bounce, Unsubscribe, Email Opt-in Status | 🟡 Partial | Sends honour `email_suppressions` (hard_bounce, complained, unsubscribed, manual) and opted_out consents (`schema.ts:694-706`; `campaignService.ts:276-300`). Only the Resend webhook and unsubscribe flow write suppressions (`routes/resendWebhook.ts:128`; `unsubscribeService.ts:94`); no import path. Shopify consent syncs into `email_subscribed` (`syncWorker.ts:180`), which sends ignore (`deliveryService.ts:376-381`) | Brands moving from another ESP must bring unsubscribes and bounces, or Storees will mail people who already opted out. Add a suppression column that writes reason "manual" with source "import", and write opted_out consents for unsubscribes. | P1 | S |
| User import: mapping | Mappable location (city, state, country, pincode, time zone) | Last Known City, Country, Pincode, State; User Time Zone Offset | 🟡 Partial | Import takes region (state) and city (`v1Import.ts:47-48`), filled only when empty (`customerService.ts:439-440,486-487,568-569`). No country, pincode or time-zone column (`schema.ts:126-160`) | Add country and pincode (pincode drives COD and serviceability targeting in India), and let an import overwrite location. | P2 | S |
| User import: mapping | Mappable lifecycle and acquisition attributes (First/Last Seen, LTV, conversions, sessions, campaign, publisher) | Lifecycle: Sessions, Last Seen, First Seen, LTV, Conversions, Creation Source, Random Bucket. Acquisition: Publisher, Campaign | 🟡 Partial | LTV and order counts load via `/import/orders` (historical purchase events; `v1Import.ts:154-326`). `resolveCustomer` supports `sourceCreatedAt` and `skipLastSeenBump` (`customerService.ts:340-345`), but `/import/customers` passes neither (`v1Import.ts:82-92`): new profiles get first_seen = last_seen = import time, matched ones get last_seen bumped. No acquisition fields | Accept a created_at column and pass `skipLastSeenBump`. Today imported profiles count as "New This Week" (`routes/dashboard.ts:135`), match "New Customers" (`packs/ecommerce.json:285-297`) and look active to last_seen filters. Migration 0060 fixed this for connectors. Store acquisition fields as custom attributes. | P1 | S |
| User import: mapping | Mappable custom attributes | Tracked Custom Attribute group (e.g. Contact Level, Gender) for any column | 🟡 Partial | `custom_attributes` (`schema.ts:153`) is set by `/api/v1/customers` (replaces the object, `v1Events.ts:615`), the SDK, connectors and Event Sources. `/import/customers` only writes `dealer_id`, though `resolveCustomer` can merge (`customerService.ts:335,388-397`). Not selectable in the segment builder (module 07) | Merge extra CSV columns into `custom_attributes` and expose them in the segment builder; otherwise imported attributes cannot be targeted. | P1 | S |
| User import: mapping | Device, uninstall and per-platform push attributes | Device Data (Browser Details, Mobile User, GAID, OS Version iOS, IDFA), Uninstall (time, status), Reachability Push for Android, iOS and TV | ➖ N/A | Web SDK only (`packages/sdk/src`); no install tracking or per-platform tokens; push uses one `fcm_token` custom attribute (`docs/integrations/PUSH_CONSENT_CONTRACT.md`) | Not relevant without mobile SDKs. | — | — |
| User import: mapping | Create new attribute during import (typed) | Dialog with column name, sample value, required Attribute name and Data type (Numeric, Boolean, Date time, String, Geopoint, Array Double, Array String), plus a format for dates | 🟡 Partial | Any key can be written to `custom_attributes` undeclared (Event Sources free key, `event-sources/[id]/page.tsx:540-560`; `/api/v1/customers`). Observed keys are discovered for pickers (`variableSources.ts:61-83`) but untyped. Unknown fields compare as text (`evaluator.ts:1197-1208`), so numeric and date conditions compare alphabetically | Add a typed custom-attribute registry (name, type, format) that import mapping fills and the segment builder reads. | P2 | M |
| User import: mapping | Supported datetime formats | 18 per-column formats, from YYYY-MM-DD and DD/MM/YYYY to ISO with time zone and fractional seconds | ❌ Missing | Order import parses an ISO 8601 timestamp with `new Date()` (`v1Import.ts:268`); customer import has no date fields; no format option anywhere | Indian spreadsheets commonly use DD/MM/YYYY, which `new Date()` misreads or rejects. Offer a format select on date columns. | P2 | S |
| User import: options | Import behaviour: skip new users (update existing only) | Default updates and creates; "Skip new users during this import" makes it update-only | ❌ Missing | `resolveCustomer` always inserts when nothing matches (`customerService.ts:464-529`); no update-only or dry-run option on the import (`v1Import.ts:57-116`) | Useful for enriching existing Shopify customers (loyalty tier, preferences) without stray profiles. Add an update-only flag that skips the insert. | P2 | S |
| User import: options | Save imported users as a file segment | Toggle; pick an existing file segment or create one; max 5M users; ready 30 minutes after import; the imports list links the segment | ❌ Missing | No static segments. The customer import returns only counts, not resolved customer ids (`v1Import.ts:108-111`) | This links import to targeting: put imported customers into a new or existing file segment so a WhatsApp or email campaign goes to exactly that list. | P1 | S |
| User import: options | Import status email | "Send import status" on by default, up to 10 recipients, pre-filled with the current user (file segments take up to 50 alert emails) | ❌ Missing | No import jobs to report on; connector syncs send no email either. Admin alert emails via Resend exist for WhatsApp template recategorisation (`templateAlertService.ts:1-40`) | Email the uploader when a long import finishes or fails, reusing that sender. Small imports can report their status in the app. | P2 | S |
| User import: scheduling | Import scheduling (one time: as soon as possible, or a set date, time and zone) | One Time only: "As soon as possible" (default) or start date, time and IANA zone with a past-time check; no recurring CSV imports | 🟡 Partial | API imports run when called. Connectors sync on demand (Sync Now, Full Resync) and on a schedule: incremental every 3 h, full nightly at 03:00 (`dataSyncWorker.ts:26-27`; `ConnectorsSection.tsx:157-182`). No one-off scheduled import | Low value for D2C: run imports immediately. | P3 | S |
| Import history | User imports list (Name, Custom segment, Created by, Created at, Sync status, Rows processed, Actions) | List with those columns, an info tooltip, "Check import limit" and "Import users" | 🟡 Partial | Connectors only: When, Kind, Status (queued, running, success, partial, failed, cancelled), Customers/Products/Orders imported/fetched with failures, Duration (`SyncHistoryTable.tsx:29-60,163-186`; `routes/dataConnectors.ts:315-334`). Super-admin `/projects` only (`projects/page.tsx:148,339`); `triggered_by` stored, not shown (`schema.ts:1377`) | Give project admins an Imports list (name, file, created by, status, rows succeeded and failed, linked segment), reusing `SyncHistoryTable`. | P1 | S |
| Import history | Import history filters (search, status, created date, created by, refresh) | Search by name; status multi-select (Successful, Failed, Partial success, Processing, Pending, Scheduled, Archived); Created date and Created by popover; refresh | ❌ Missing | No search or filters on sync history, only a log-level filter inside a run (`SyncHistoryTable.tsx:107-131`). The API returns 25 runs by default, 100 at most (`routes/dataConnectors.ts:316`) | Add a status filter and search once import volume grows. | P3 | S |
| Import history | Import row actions (View, Duplicate) | View (details page), Duplicate | 🟡 Partial | Connector cards: Test, Sync Now, Full Resync, Edit, Delete (`ConnectorsSection.tsx:150-215`); runs expand inline to show logs (`SyncHistoryTable.tsx:63-105`). No Duplicate | A "re-run with the same mapping" action would cover Duplicate. | P3 | S |
| Import history | Import details and run history | Import type, ID, Created by and on, Updated on, segment link, Schedule, Next run; runs with Scheduled and Completed at, Status, Files, Total rows, Processed, Failed, View files | 🟡 Partial | `data_source_syncs` stores kind, status, start and finish, per-entity stats, error summary and triggered_by (`schema.ts:1368-1381`). The UI shows each run's status, counts, duration and error summary (`SyncHistoryTable.tsx:63-105`). Connector syncs only, super-admin only | Give CSV imports the same run record, plus who created them and the linked segment. | P2 | S |
| Import history | Per-file run breakdown (View files drawer) | Run summary, file search, status filter, refresh; per file: rows in file, processed, failed | 🟡 Partial | No files. Each run has per-entity counts and row-level logs (level, entity type, entity id, message, time; payload stored but not shown), filterable to errors or warnings (`schema.ts:1384-1395`; `SyncHistoryTable.tsx:107-161`; `routes/dataConnectors.ts:338-368`) | Row-level logs explain failures better than per-file counts. For CSV imports, add a downloadable file of the failed rows. | P3 | S |
| User exports | User Exports list (generated export files) | Updated time (sortable), File name, Description, Status, Actions; search; Refresh. Empty here, "Failed to get user reports" on every load, no create control | ❌ Missing | Immediate downloads with no job or history: segment ad-audience CSV (`routes/segments.ts:157-181`), one customer's JSON (`routes/customers.ts:922-941`), consent CSV with no UI (`v1Onboarding.ts:908-992`). No export-job or admin audit table (`schema.ts`) | Needed once exports get large or scheduled. A record of who exported what is also an audit control that buyers ask about. | P2 | M |
| User exports | Export a segment's users to a file (plain attributes) | Implied by the list. The create control, formats and attribute choice were not visible here (probably plan- or permission-gated) | 🟡 Partial | "Export to ads": SHA-256-hashed email, phone and name for Meta, Google, TikTok, Snap or Pinterest; max 500,000 rows; gated by `exportCustomers` (`ExportAudienceButton.tsx:15-116`; `adAudienceExport.ts:139-196`; `routes/segments.ts:157-181`). Recomputed from filters; ignores the trial `ad_audience_export=false` flag (`entitlementService.ts:38`). No plain export of segment members or customers | Add "CSV (selected columns)" to the same dropdown and to the filtered customer list, applying `viewContactPii` masking and agent scope. Brands use such lists for call-centre and offline follow-up. | P1 | S |
| User exports | Export entry point in segment screens | None in segment info Actions, the builder's "+ Actions" or the Query results row menu (this workspace) | ⭐ Storees better | "Export to ads" on every segment card with members (`segments/page.tsx:183`; `ExportAudienceButton.tsx:71-113`), switchable per role (`settings/roles/page.tsx:138-145`; `capabilities.ts`). Caveats: hashed only; not limited to an agent's own customers (`adAudienceExport.ts:154-159`); phones without a country code hashed as bare digits (`adAudienceExport.ts:99-104`) | Export sits where the marketer already works. Extend it with a plain CSV (previous row), limit it to an agent's own customers, and add a country code to phones before hashing. | — | — |

### Storees-only strengths

- **Automatic Shopify import of customers, orders and marketing consent.** Customers come in with their order history and no CSV at all, so RFM, CLV and order-based segments work from day one. Webhooks keep the data current (`syncWorker.ts:160-200`; `routes/webhooks.ts`). In MoEngage, the same customer base needs an integration or file imports.
  - Caveat: synced email and SMS consent lands in flags that sends do not check (`deliveryService.ts:376-381`).
  - Caveat: the sync passes neither `sourceCreatedAt` nor `skipLastSeenBump` (`syncWorker.ts:174-184`), so a first sync also stamps first_seen and last_seen with the sync time.
- **Historical order import that rebuilds LTV and order totals.** `POST /api/v1/import/orders` writes historical purchase events keyed `<purchase>_historical:<order_id>` (`v1Import.ts:154-326`).
  - These events are deduplicated against the Shopify sync and skipped by flows (`triggerWorker.ts:36`), and are folded into customer aggregates.
  - MoEngage also imports events (its limit drawer shows Event import quotas; another module covers that). Storees' edge is that imported orders land in the same order ledger as live ones, so spend, frequency and product-affinity segments are correct for migrating brands.
  - API only today; worth adding to the CSV import.
- **Recurring pull connectors with a Test preview and row-level sync logs.** They keep a Medusa or other REST backend in sync without re-uploading files, and per-row error logs explain each failure (`routes/dataConnectors.ts:220-368`; `dataSyncWorker.ts:26-27`; `SyncHistoryTable.tsx:29-161`). MoEngage's CSV imports in this module run once; its S3, SFTP and warehouse sources sit under Data > Imports. The connectors are visible to super-admins only.
- **No-code inbound webhooks (Event Sources) that create and update profiles.** Any tool that can POST JSON (checkout apps, forms, COD-verification or call-centre tools) becomes a continuous user import, configured by project admins. The service infers the payload schema and explains why a payload did not match a definition (`event-sources/[id]/page.tsx:498-563`; `inboundWebhookService.ts:76,217,308-363`).
- **Hashed ad-audience export from each segment.** One click produces a Custom Audience file for Meta, Google, TikTok, Snap or Pinterest, with emails normalised and every identifier SHA-256 hashed (`ExportAudienceButton.tsx`; `adAudienceExport.ts:93-196`). The MoEngage workspace offered no export from any segment screen.
  - Caveat: phones stored without a country code are hashed as bare digits, which the ad platforms will not match.
- **Per-role control of exports and contact details.** Roles have "See contact details" and "Export customer data" toggles (`settings/roles/page.tsx:128-145`; `capabilities.ts`; `packages/backend/src/lib/pii.ts`). This answers the buyer question of who can download customer lists.
  - Caveat: the data-subject JSON export is admin-only but checks neither toggle (`routes/customers.ts:922`).
  - Caveat: users without a custom role get full access (`capabilities.ts:84-106`).
- **Data-subject export and erasure, and a consent-audit CSV.** These handle DPDP and GDPR access and erasure requests and provide consent evidence without a general export tool (`routes/customers.ts:920-963`; `DataSubjectCard.tsx`; `v1Onboarding.ts:908-992`). The consent CSV is API only.

### UX notes

- **Entry points (screenshots 001, 047).** MoEngage puts "+ New User Import" and "+ New File Segment" right beside "+ New Segment", and "Import users" on the imports list. Storees has no list or import entry for project admins:
  - the Segments header has Recalculate stats, Re-evaluate All and Create Segment (`segments/page.tsx:23-53`);
  - the Customers header shows only a total (`customers/page.tsx:105-115`);
  - connector imports sit on the super-admin `/projects` page.

  Keep the flat navigation, but turn "Create Segment" into a split button (Rule-based or Upload a list) and add "Import customers" to `/customers`.
- **File segment modal (002, 003, 013, 015, 016).** MoEngage uses one compact modal to create and edit. Edit adds an action select (Add, Remove or Replace users), and the primary button takes the action's name. Processing is asynchronous and an alert-email field is mandatory.

  Storees can do better at D2C list sizes: match the file immediately, then show matched, unmatched and invalid counts, with a downloadable CSV of unmatched rows, before saving. For file segments:
  - the card's Edit link (`segments/page.tsx:146-152`) must open this modal, not the rule builder;
  - the type badge (line 105) should read FILE;
  - the card should show the file name and upload date as its source.
- **Import wizard (017, 022, 036, 038, 026, 027).** Step 2 combines the identifier mapping, a column table with "Skip column" and "+ Create new attribute", and option cards (Skip new users, Save as a file segment, Send import status). Storees already has this interaction in the Event Sources definition dialog: identity rows plus "Update customer profile" mappings, with a datalist of standard targets and free custom keys (`event-sources/[id]/page.tsx:498-563`). Reuse that pattern for CSV columns, and ship a run-now-only import: MoEngage's scheduling step (031) adds little for D2C.
- **History (047, 053, 055).** MoEngage spreads one import across a list, a details page and a "View files" drawer. `SyncHistoryTable` is denser: one table whose rows expand into per-entity counts and level-filtered row logs (`SyncHistoryTable.tsx:29-161`). Reuse it for CSV imports, but:
  - show who triggered each run (`triggered_by` is stored, `schema.ts:1377`) and the linked segment;
  - make it visible to project admins.
- **User exports (057-060).** MoEngage's page is a passive list with no create control. It failed to load, and no export option appears in segment info, the builder or query results. Storees already has "Export to ads" on every segment card. The cheapest parity move is a "CSV (selected columns)" option in that dropdown and an Export button on the filtered customer list, both applying `viewContactPii` masking and agent scope. An exports history page can come later.
- **Import limit drawer (018-021).** Hourly and daily quota bars for user, event and aux-data imports, all at 0% here. This is enterprise plumbing. Storees needs only an inline row cap and enforcement of the trial "contacts" limit, which is defined but never checked (`entitlementService.ts:16,39`).
- **Fix the import API before putting a screen on it** (`/api/v1/import/customers`):
  - **Opt-outs:** imported `email_subscribed` and `sms_subscribed` flags do not gate sends. Only `opted_out` consents rows and `email_suppressions` block a send (`deliveryService.ts:369-381`; `campaignService.ts:276-300`). Route opt-in columns through `updateConsent` instead.
  - **Timestamps:** the endpoint passes neither `skipLastSeenBump` nor `sourceCreatedAt` (`v1Import.ts:82-92`). New profiles therefore count as "New This Week" (`routes/dashboard.ts:135`) and match the "New Customers" template. Migration 0060 cleaned up exactly this artefact for connectors.
  - **Empty profiles:** a row with no customer_id, email or phone still creates a profile (`customerService.ts:511-529`).
  - **Matching:** email and phone are matched exactly against unique indexes that are case- and format-sensitive (`0005_race_condition_fixes.sql:8-12`); normalise them the way `v1OptIn.ts:131-136` does. A row whose email and phone belong to two different profiles fails on the phone index (`customerService.ts:433`).
  - **Auth:** the endpoint accepts the public SDK key (`v1Import.ts:33`; `apiKeyAuth.ts:206`). The admin screen should call a new endpoint behind admin login, and the API should move to the secret-key middleware (`apiKeyAuth.ts:64`).
- **File segments and the segment engine.** An empty filter compiles to TRUE (`evaluator.ts:193`), and the ad export rebuilds the audience from filters (`adAudienceExport.ts:148-159`). A static segment saved with empty filters would therefore grow to every customer on the next evaluation pass or ad export, unless:
  - `evaluateSegment` and `_evaluateAllSegments` skip the "file" type;
  - the ad export reads `customer_segments` instead.

  Campaigns, flows and the member list already read `customer_segments` (`campaignService.ts:227-245`; `flowExecutor.ts:532`; `routes/customers.ts:73-79`), so they work unchanged.
- **Docs and UI copy overstate what exists:**
  - `docs/research/whatsapp-pilot-plan.md:40` marks "Bulk CSV import ✅ Customer import", but there is only the JSON API, with no CSV support and no UI.
  - The Roles hint promises "customer / consent / audience CSVs" and says Off "blocks all exports for this role" (`settings/roles/page.tsx:139-140`). In fact only the audience CSV has a UI, and the data-subject export ignores the toggle (`routes/customers.ts:922`).

  Correct both before sales or a pilot relies on them.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status. Missing and partial rows were searched under these terms:
- csv, papaparse, upload, FileReader, multer, static, manual, list, in_list, one_of, tags;
- import, update_existing, dry run, mapping, export, Content-Disposition, audit;
- watch video, youtube, learn more.

43 of 44 statuses held; one status and one priority changed:

- **Module entry points: ❌ Missing → 🟡 Partial (P2 S kept).** The evidence said there was no export entry point anywhere. In fact "Export to ads" sits on every segment card (`segments/page.tsx:183`) and the data-subject export on every profile. Ingestion screens exist too: Event Sources for admins and Data Sources for super-admins. Only the import and file-segment entries are missing. This matches module 08, which rates the import and export entry points Partial.
- **Mappable email suppression type: P2 → P1, gap corrected.** The original gap said Shopify's synced marketing consent "covers the most common case". It does not. Synced consent lands in `email_subscribed`, and the send path deliberately ignores the `*_subscribed` flags: only an `opted_out` consents row or an `email_suppressions` row blocks a send (`deliveryService.ts:369-381`; `campaignService.ts:276-300`). Neither can be imported, so a brand moving from another ESP would mail its old unsubscribes. That is a compliance and deliverability risk.
- **Mappable opt-in status (🟡 Partial, P1 kept): evidence and gap corrected.** Importing `email_subscribed=false` or `sms_subscribed=false` updates the flag but does not stop sends, for the same reason. The fix is to route opt-in columns through `updateConsent` (`consentService.ts:21`), which writes the consents row, the flag and `consent_audit_log` in one transaction.
- **Mappable lifecycle and acquisition attributes (P1 kept): evidence made precise.** New profiles get first_seen = last_seen = import time. Matched existing profiles keep first_seen but have last_seen bumped to now (`customerService.ts:404-461`).
- **Identifier uniqueness warning (➖ N/A kept): reasoning refined.** Two ambiguous cases do exist:
  - a row whose email matches one profile and whose phone matches another fails, because the email branch writes the phone (`customerService.ts:433`) and hits the phone unique index;
  - normalised matching, which the P0 row recommends, can hit two profiles that differ only in email case or phone format.

  Reporting multi-match rows replaces the warning.
- **File segment info page (🟡 Partial kept): evidence extended.**
  - Per-channel reachability exists only through the campaign builder's "Preview audience" (`routes/campaigns.ts:301`).
  - The builder's instant "reachable via channel" tile is a placeholder, memberCount × 0.9 (`campaigns/create/page.tsx:1048`).
  - Sample users exist only in the builder's preview panel.
- **Create file segment (❌ Missing kept): evidence extended.** No `in`/`one of` operator exists (`types.ts:550-560`), so a pasted list cannot stand in for a file. The builder can target named people only one identifier rule at a time (`SFB:214,524`).
- **Import users from a CSV file (🟡 Partial kept): evidence notes the public-key auth** (see Security below).
- **Per-file run breakdown (🟡 Partial kept): evidence fix.** The sync log payload is stored but not shown in the UI.
- **Export entry point (⭐ Storees better kept): caveats added.** The export is hashed only and recomputed from filters. It is not limited to an agent's own customers: the preview applies agent scope (`routes/segments.ts:82-86`) but the export does not (`adAudienceExport.ts:154-159`). Phones without a country code are hashed as bare digits.
- **Storees-only list narrowed:**
  - The historical-order item no longer says MoEngage imports only attributes; its limit drawer shows Event import quotas.
  - The connectors item notes that MoEngage's recurring sources live under Data > Imports.
  - Caveats were added to the Shopify import, ad export and per-role control items.
- **Confirmed after trying to refute them:**
  - No CSV dependency (`backend/package.json`).
  - No list file inputs. The only frontend file inputs are email-builder images, WhatsApp media, FCM JSON, call transcripts and campaign attachments.
  - Only `segmentService.ts:117` writes `customer_segments`.
  - Nothing in the frontend calls `/api/v1/import`.
  - The project-admin pages `/integrations` and `/settings/dealers` offer no import; `/integrations` only redirects to `/projects`.
  - No update-only or dry-run option, and no sync status emails.
  - The `contacts` limit and the `ad_audience_export` flag are never enforced. `checkCountLimit` is called only for flows and templates; `isFeatureEnabled` only for the chatbot.
  - No export-job or admin audit table.
- **Security seen along the way:**
  - **Bulk import accepts the public SDK key.** `/api/v1/import/*` uses `requirePublicKeyAuth` (`v1Import.ts:33`), and the SDK sends that key from the shopper's browser (`packages/sdk/src/transport.ts:29`). Anyone who copies it from a storefront page can:
    - upsert profiles in bulk, and a row matched by email overwrites that profile's phone (`customerService.ts:433`), so WhatsApp and SMS messages are redirected;
    - inject historical orders that inflate LTV and change segment membership.

    The secret-key middleware `requireApiKeyAuth` exists (`apiKeyAuth.ts:64`) but no route uses it. Move `/v1/import` to it.
  - **The data-connector API has no role check.** Module 08 already reported this.
- **PII warning.** These screenshots show personal email addresses; redact them before this folder is shared or committed:
  - 026, 027, 028 and 046 show the logged-in user's email in "Send import status";
  - 047 and 053 show a teammate's email under "Created by".
- **Cross-module consistency review (completeness pass):** File segment info page 🟡 → ❌, matching module 07's segment detail page row: there is no read-only segment page (`segments/[id]/` holds only `edit/`), and file segments don't exist.

### Screens

#### Segment flyout (module entry points)

![Segment flyout: New Segment / New User Import / New File Segment, then Search Users ... User Imports, User Exports](../screenshots/09-segments-files-imports-exports-001-segment-flyout.jpg)
*Segment flyout: New Segment / New User Import / New File Segment, then Search Users ... User Imports, User Exports*

#### New File Segment (Create file segment modal)

![Create file segment modal: name, description, Upload file/Provide URL, upload box, 64 MB one-column rule](../screenshots/09-segments-files-imports-exports-002-file-segment-modal-top.jpg)
*Create file segment modal: name, description, Upload file/Provide URL, upload box, 64 MB one-column rule*

![Modal scrolled: user attribute + data type, uniqueness info box, alert email field, Cancel/Create](../screenshots/09-segments-files-imports-exports-003-file-segment-modal-bottom.jpg)
*Modal scrolled: user attribute + data type, uniqueness info box, alert email field, Cancel/Create*

![Identifier attribute picker (searchable, grouped): Lifecycle group](../screenshots/09-segments-files-imports-exports-004-file-segment-attribute-dropdown-lifecycle.jpg)
*Identifier attribute picker (searchable, grouped): Lifecycle group*

![Attribute picker: Reachability group](../screenshots/09-segments-files-imports-exports-005-file-segment-attribute-dropdown-reachability.jpg)
*Attribute picker: Reachability group*

![Attribute picker: Device Data and Tracked Standard Attribute groups](../screenshots/09-segments-files-imports-exports-006-file-segment-attribute-dropdown-device-standard.jpg)
*Attribute picker: Device Data and Tracked Standard Attribute groups*

![Attribute picker: ID / Name / Mobile Number and Tracked Custom Attribute group](../screenshots/09-segments-files-imports-exports-007-file-segment-attribute-dropdown-custom.jpg)
*Attribute picker: ID / Name / Mobile Number and Tracked Custom Attribute group*

![ID selected: the Data type is fixed to 'string'](../screenshots/09-segments-files-imports-exports-008-file-segment-datatype-string-for-id.jpg)
*ID selected: the Data type is fixed to 'string'*

![Provide URL mode: Enter CSV URL plus URL rules (https, public, valid CSV of 300 MB or less)](../screenshots/09-segments-files-imports-exports-009-file-segment-provide-url.jpg)
*Provide URL mode: Enter CSV URL plus URL rules (https, public, valid CSV of 300 MB or less)*

![LTV selected: the Data type is fixed to 'double'](../screenshots/09-segments-files-imports-exports-010-file-segment-datatype-double-for-ltv.jpg)
*LTV selected: the Data type is fixed to 'double'*

#### File segment management (All Segments row, Edit file segment, info page, type filter)

![All Segments list showing the 'Test File' segment of type File](../screenshots/09-segments-files-imports-exports-011-all-segments-file-segment-row.jpg)
*All Segments list showing the 'Test File' segment of type File*

![File segment row menu: View, Edit, Duplicate (disabled), Archive, Create campaign, Analyze Segment](../screenshots/09-segments-files-imports-exports-012-file-segment-row-actions-menu.jpg)
*File segment row menu: View, Edit, Duplicate (disabled), Archive, Create campaign, Analyze Segment*

![Edit file segment modal, action 'Add users' (button 'Add users')](../screenshots/09-segments-files-imports-exports-013-edit-file-segment-modal-add-users.jpg)
*Edit file segment modal, action 'Add users' (button 'Add users')*

![Select action options: Add users / Remove users / Replace users](../screenshots/09-segments-files-imports-exports-014-edit-file-segment-select-action-dropdown.jpg)
*Select action options: Add users / Remove users / Replace users*

![Replace users selected: button relabels to 'Replace users'](../screenshots/09-segments-files-imports-exports-015-edit-file-segment-replace-users.jpg)
*Replace users selected: button relabels to 'Replace users'*

![File segment info page: Segment Source 'Import Users', description from IMPORT_USERS, counts and reachability](../screenshots/09-segments-files-imports-exports-016-file-segment-info-page-source-import-users.jpg)
*File segment info page: Segment Source 'Import Users', description from IMPORT_USERS, counts and reachability*

![Segment type filter: File, Filter, Warehouse - SQL (Clear all / Select all)](../screenshots/09-segments-files-imports-exports-061-all-segments-segment-type-filter.jpg)
*Segment type filter: File, Filter, Warehouse - SQL (Clear all / Select all)*

#### New User Import: Step 1 Source and format

![Step 1: import name, Registered/Anonymous user type cards, CSV upload (<150 MB), Preview file](../screenshots/09-segments-files-imports-exports-017-user-import-step1-source-format.jpg)
*Step 1: import name, Registered/Anonymous user type cards, CSV upload (under 150 MB), Preview file*

![Anonymous users selected: sample link becomes 'sample file for anonymous users'](../screenshots/09-segments-files-imports-exports-022-user-import-step1-anonymous-users.jpg)
*Anonymous users selected: sample link becomes 'sample file for anonymous users'*

![Preview file with empty form: Required input errors and toast](../screenshots/09-segments-files-imports-exports-023-user-import-step1-validation-errors.jpg)
*Preview file with empty form: Required input errors and toast*

#### Import limit overview drawer

![Import limit drawer: User/Event/Aux data hourly and daily quotas, top contributing imports](../screenshots/09-segments-files-imports-exports-018-import-limit-drawer-user-imports.jpg)
*Import limit drawer: User/Event/Aux data hourly and daily quotas, top contributing imports*

![Usage tooltip: hourly reset within an hour, daily reset 12:00 AM UTC](../screenshots/09-segments-files-imports-exports-019-import-limit-usage-reset-tooltip.jpg)
*Usage tooltip: hourly reset within an hour, daily reset 12:00 AM UTC*

![Top contributing imports tooltip (top 5 this hour or today)](../screenshots/09-segments-files-imports-exports-020-import-limit-top-contributing-tooltip.jpg)
*Top contributing imports tooltip (top 5 this hour or today)*

![Event imports card selected, Daily tab: title switches to Event imports](../screenshots/09-segments-files-imports-exports-021-import-limit-event-imports-daily.jpg)
*Event imports card selected, Daily tab: title switches to Event imports*

#### New User Import: Step 2 Import configuration and action (mapping)

![Step 2 (Anonymous users): Required mapping 'Anonymous ID', empty Map columns table, Upload mapping file](../screenshots/09-segments-files-imports-exports-024-user-import-step2-anonymous-id-mapping.jpg)
*Step 2 (Anonymous users): Required mapping 'Anonymous ID', empty Map columns table, Upload mapping file*

![Anonymous ID tooltip: mark a CSV column as identifier, e.g. email or mobile number](../screenshots/09-segments-files-imports-exports-025-user-import-step2-anonymous-id-tooltip.jpg)
*Anonymous ID tooltip: mark a CSV column as identifier, e.g. email or mobile number*

![Import behaviour 'Skip new users during this import', Save as a file segment (off), Send import status (on)](../screenshots/09-segments-files-imports-exports-026-user-import-step2-import-behaviour.jpg)
*Import behaviour 'Skip new users during this import', Save as a file segment (off), Send import status (on)*

![Save as a file segment on: File segment name picker, max 5M users note](../screenshots/09-segments-files-imports-exports-027-user-import-step2-save-as-file-segment.jpg)
*Save as a file segment on: File segment name picker, max 5M users note*

![File segment name picker: existing 'Test File' or '+ Create new file segment'](../screenshots/09-segments-files-imports-exports-028-user-import-step2-file-segment-name-dropdown.jpg)
*File segment name picker: existing 'Test File' or '+ Create new file segment'*

!['Create a new file segment' dialog (name field, Cancel/Create; Create not clicked)](../screenshots/09-segments-files-imports-exports-029-user-import-create-new-file-segment-dialog.jpg)
*'Create a new file segment' dialog (name field, Cancel/Create; Create not clicked)*

![Step 2 (Registered users): Required mapping 'User identifier'](../screenshots/09-segments-files-imports-exports-034-user-import-step2-registered-user-identifier.jpg)
*Step 2 (Registered users): Required mapping 'User identifier'*

![User identifier tooltip: one column must be the user identifier (ID)](../screenshots/09-segments-files-imports-exports-035-user-import-step2-user-identifier-tooltip.jpg)
*User identifier tooltip: one column must be the user identifier (ID)*

![Column mapping table with 4 placeholder columns: attribute + data type selects, Skip column](../screenshots/09-segments-files-imports-exports-036-user-import-step2-column-mapping-rows.jpg)
*Column mapping table with 4 placeholder columns: attribute + data type selects, Skip column*

![Mapping attribute picker (grouped, searchable) with '+ Create new attribute'](../screenshots/09-segments-files-imports-exports-037-user-import-step2-attribute-picker.jpg)
*Mapping attribute picker (grouped, searchable) with '+ Create new attribute'*

![Create new attribute dialog: column name, value, attribute name, data type](../screenshots/09-segments-files-imports-exports-038-user-import-create-new-attribute-dialog.jpg)
*Create new attribute dialog: column name, value, attribute name, data type*

![New attribute data types: Numeric, Boolean, Date time, String, Geopoint, Array Double, Array String](../screenshots/09-segments-files-imports-exports-039-user-import-create-attribute-data-types.jpg)
*New attribute data types: Numeric, Boolean, Date time, String, Geopoint, Array Double, Array String*

![Date time chosen: 'Date time format' field appears](../screenshots/09-segments-files-imports-exports-040-user-import-create-attribute-datetime-format-field.jpg)
*Date time chosen: 'Date time format\*' field appears*

![Datetime format options (YYYY-MM-DD ... YYYY/MM/DDThh:mm:ss.sTZD)](../screenshots/09-segments-files-imports-exports-041-user-import-datetime-format-options.jpg)
*Datetime format options (YYYY-MM-DD ... YYYY/MM/DDThh:mm:ss.sTZD)*

![email column mapped to Email (Standard): data type String](../screenshots/09-segments-files-imports-exports-042-user-import-mapping-email-standard-string.jpg)
*email column mapped to Email (Standard): data type String*

![signup_date mapped to First Seen: Date time plus an inline datetime-format select](../screenshots/09-segments-files-imports-exports-043-user-import-mapping-datetime-format-inline.jpg)
*signup_date mapped to First Seen: Date time plus an inline datetime-format select*

![User identifier select lists the file's columns](../screenshots/09-segments-files-imports-exports-044-user-import-user-identifier-column-dropdown.jpg)
*User identifier select lists the file's columns*

![Identifier column row shows 'Marked as user identifier' (pickers locked)](../screenshots/09-segments-files-imports-exports-045-user-import-marked-as-user-identifier.jpg)
*Identifier column row shows 'Marked as user identifier' (pickers locked)*

![Skip column ticked (row disabled) plus the bottom option cards](../screenshots/09-segments-files-imports-exports-046-user-import-skip-column-and-options.jpg)
*Skip column ticked (row disabled) plus the bottom option cards*

#### New User Import: Step 3 Scheduling

![Step 3: Import frequency One Time, As soon as possible (default)](../screenshots/09-segments-files-imports-exports-030-user-import-step3-as-soon-as-possible.jpg)
*Step 3: Import frequency One Time, As soon as possible (default)*

![At specific date and time: start date/time, time zone, Reset to defaults, past-time validation](../screenshots/09-segments-files-imports-exports-031-user-import-step3-specific-date-time.jpg)
*At specific date and time: start date/time, time zone, Reset to defaults, past-time validation*

![Searchable time zone list (IANA zones with UTC offsets)](../screenshots/09-segments-files-imports-exports-032-user-import-step3-timezone-dropdown.jpg)
*Searchable time zone list (IANA zones with UTC offsets)*

![Start date calendar (past dates disabled, Today shortcut)](../screenshots/09-segments-files-imports-exports-033-user-import-step3-date-picker.jpg)
*Start date calendar (past dates disabled, Today shortcut)*

#### User Imports (import history list)

![User imports list: Name, Custom segment, Created by, Created at, Sync status, Rows processed, Actions](../screenshots/09-segments-files-imports-exports-047-user-imports-list.jpg)
*User imports list: Name, Custom segment, Created by, Created at, Sync status, Rows processed, Actions*

![Info tooltip: import registered and anonymous user profile data via CSV](../screenshots/09-segments-files-imports-exports-048-user-imports-info-tooltip.jpg)
*Info tooltip: import registered and anonymous user profile data via CSV*

![Status filter: Successful, Failed, Partial success, Processing, Pending, Scheduled, Archived](../screenshots/09-segments-files-imports-exports-049-user-imports-status-filter.jpg)
*Status filter: Successful, Failed, Partial success, Processing, Pending, Scheduled, Archived*

![Filter imports popover: Created date, Created by, Reset/Cancel/Apply](../screenshots/09-segments-files-imports-exports-050-user-imports-filter-popover.jpg)
*Filter imports popover: Created date, Created by, Reset/Cancel/Apply*

![Created date calendar in filter popover](../screenshots/09-segments-files-imports-exports-051-user-imports-filter-created-date.jpg)
*Created date calendar in filter popover*

![Row actions: View, Duplicate](../screenshots/09-segments-files-imports-exports-052-user-imports-row-actions-menu.jpg)
*Row actions: View, Duplicate*

#### Import details (run history + View files drawer)

![Import details: type, ID, creator, segment link, schedule, next run; Run history table](../screenshots/09-segments-files-imports-exports-053-user-import-details-run-history.jpg)
*Import details: type, ID, creator, segment link, schedule, next run; Run history table*

![Completed at hover: Started at and Total time (2 mins)](../screenshots/09-segments-files-imports-exports-054-user-import-details-run-time-tooltip.jpg)
*Completed at hover: Started at and Total time (2 mins)*

![View files drawer: per-file rows in file / processed / failed](../screenshots/09-segments-files-imports-exports-055-user-import-view-files-drawer.jpg)
*View files drawer: per-file rows in file / processed / failed*

![View files status filter: Successful, Failed, Partial success, Processing, Pending](../screenshots/09-segments-files-imports-exports-056-user-import-view-files-status-filter.jpg)
*View files status filter: Successful, Failed, Partial success, Processing, Pending*

#### User Exports

![User Exports: Updated time, File name, Description, Status, Actions; empty; 'Failed to get user reports' toast](../screenshots/09-segments-files-imports-exports-057-user-exports-empty-error.jpg)
*User Exports: Updated time, File name, Description, Status, Actions; empty; 'Failed to get user reports' toast*

#### Export entry-point check (segment info Actions, segment builder Actions, query results menu)

![Segment info Actions menu: no export item](../screenshots/09-segments-files-imports-exports-058-file-segment-info-actions-menu-no-export.jpg)
*Segment info Actions menu: no export item*

![Segment builder + Actions: Create Campaign, Analyze Segment, Create Custom segment (no export)](../screenshots/09-segments-files-imports-exports-059-segment-builder-actions-no-export.jpg)
*Segment builder + Actions: Create Campaign, Analyze Segment, Create Custom segment (no export)*

![Query results row menu: Edit query, Create campaign, Create custom segment, Show sample users, Analyze segment](../screenshots/09-segments-files-imports-exports-060-query-result-row-menu-no-export.jpg)
*Query results row menu: Edit query, Create campaign, Create custom segment, Show sample users, Analyze segment*
