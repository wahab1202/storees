## 17. Data > Data Imports & Computed Traits

Storees has no file import of any kind (CSV, S3, SFTP or warehouse) and no Data section. It ingests through automatic Shopify history sync, JSON bulk-import APIs, scheduled REST pull connectors with a Test preview and row-level sync logs, and no-code inbound webhooks, but the connector screens are super-admin only and every mapping except Event Sources is API-only, so a project admin can neither run nor watch an import. On computed traits, CLV and AOV come free for every buyer where MoEngage sells an add-on, but there is no user-defined trait builder, Churn Risk and Engagement Score are never computed for customers who arrive by sync or import, and custom attributes cannot be used in the segment builder (P0).

### MoEngage overview

MoEngage's Data menu has two items.

- **Data imports.** A history list with All, Users, Events and Auxiliary Data tabs (empty in this workspace), a "Check import limit" drawer with hourly and daily quotas per data type, and a "+ Import" menu (Users, Events, Auxiliary data).
  - **Sources:** users from SFTP or Amazon S3 (CSV user upload lives under Segments, module 09); events and auxiliary lookup data from CSV upload, SFTP or S3. Snowflake, BigQuery and Databricks exist in the page code but are locked behind "Request access".
  - **Wizard:** 3 steps (Source and format, Import configuration and action, Scheduling). Next stays disabled until files are fetched (SFTP/S3) or previewed (CSV).
  - **Step 1:** SFTP and S3 pick files by a prefix plus one of 8 datetime suffixes and can decrypt PGP files. CSV upload takes files under 150 MB and needs a preview.
  - **Step 2:** a required user identifier (events also need an event time with a format and a UTC or app-timezone choice), a typed column-to-attribute table with placeholder columns and a mapping file, skip new users (users) or skip duplicate rows (events), save as a file segment (users), and a status email.
  - **Step 3:** one time (as soon as possible, or a set date and time) or hourly, daily, weekly or monthly with end conditions and an IANA time zone. Auxiliary data adds a primary key and a retention period from 1 day to 1 year.
- **Computed Traits.** Badged "New" but a paid add-on that is not enabled here, so only its upsell page was seen. Per MoEngage's docs it builds Count, Aggregation, First/Last Value and SQL traits, with a preview, a weekly or monthly schedule and Replace, Add or Subtract actions. Limits are 10 active and 50 traits per workspace.

**Capture limits.**
- **Hidden steps:** steps 2 and 3 of the S3 wizards were revealed locally with CSS, so the stepper still shows step 1 in screenshots 033-055. Steps 2 and 3 of the SFTP and CSV variants were not revealed.
- **No real source:** no SFTP connection, S3 credentials or file upload was used, so the import list, details page and run history were never populated. List columns, statuses and row actions come from page code.
- **Never seen in the UI:** the warehouse connection wizard (page code only) and the Computed Traits builder, list and detail pages (public docs only).
- **No side effects:** nothing was created, saved, uploaded, connected or requested.

| Page visited | URL path |
|---|---|
| Data flyout and Data imports list | `/v4/partners/imports/all?type=all&source=file` (tabs switch `type` to users, events or aux-data) |
| Import source picker modals (Users, Events, Auxiliary data) | Modal over `/v4/partners/imports/all` |
| New user import (SFTP), step 1: Source and format | `/v4/partners/imports/all/create?filesource=sftp&type=users&source=file` |
| App Marketplace > SFTP (opened by "+ Add connection") | `/v4/partners/sftp` (new tab) |
| New event import (CSV), step 1 | `/v4/partners/imports/all/create?filesource=csv&type=events&source=file` |
| New auxiliary data import (CSV), step 1 | `/v4/partners/imports/all/create?filesource=csv&type=aux-data&source=file` |
| New user import (Amazon S3), steps 1 to 3 | `/v4/partners/imports/all/create?filesource=s3&type=users&source=file` |
| New event import (Amazon S3) | `/v4/partners/imports/all/create?filesource=s3&type=events&source=file` |
| New auxiliary data import (Amazon S3) | `/v4/partners/imports/all/create?filesource=s3&type=aux-data&source=file` |
| New event import (SFTP), step 1 | `/v4/partners/imports/all/create?filesource=sftp&type=events&source=file` |
| Computed Traits (paid add-on promo) | `/v4/data/computed-traits` and `/v4/data/computed-traits/create` |
| Data warehouse import sources (Snowflake, BigQuery, Databricks) | `/v4/partners/snowflake`, `/v4/partners/bigquery`, `/v4/partners/databricks`; `/v4/partners/imports/all?type=all&source=data-warehouses` redirects to `/v4/campaigns/all` |

### Storees counterpart

- **No Data section and no file import.** Ingestion is spread over three screens:
  - **Event Sources** (project admins, main nav): inbound webhooks with schema inference and Event Definitions that map payload paths to identity, event properties and profile attributes (`packages/frontend/src/app/(dashboard)/event-sources/page.tsx`, `event-sources/[id]/page.tsx`; `packages/backend/src/services/inboundWebhookService.ts`, `routes/inboundWebhooks.ts`, `routes/hooks.ts`).
  - **Event Mapping** (super-admin, main nav): re-maps event meanings and replays order history (`packages/frontend/src/app/(dashboard)/event-sources/mapping/page.tsx`; `packages/backend/src/routes/eventMapping.ts`).
  - **Data Sources** (super-admin, inside the expanded project card on `/projects`): Shopify custom app, VirpanAI and Custom HTTP pull connectors with Test, Sync Now, Full Resync and per-run sync history (`packages/frontend/src/components/data-sources/`; `packages/backend/src/routes/dataConnectors.ts`, `services/dataSyncService.ts`, `workers/dataSyncWorker.ts`, `services/connectors/genericHttpConnector.ts`). `/integrations` redirects there.
- **APIs:** JSON bulk import at `POST /api/v1/import/customers`, `/orders`, `/products` and `/dealers`, up to 1,000 rows per call on the public SDK key, with orders written as historical so flows do not fire (`packages/backend/src/routes/v1Import.ts`); `POST /api/v1/events/batch` (`routes/v1Events.ts`).
- **Shopify:** history sync on install (customers with consent, every order, products, collections) plus webhooks (`packages/backend/src/routes/integrations.ts`, `workers/syncWorker.ts`).
- **Computed values (no catalog, no builder):**
  - Aggregate columns (total orders, total spent, AOV, CLV, first and last order date) kept by the aggregate worker and rebuilt nightly together with the CLV fields (`packages/backend/src/workers/aggregateReconcileWorker.ts`; `services/customerService.ts`).
  - About 30 ecommerce metrics (churn risk, engagement score, reorder cycle, discount %, windowed order counts, session metrics) written by `packages/backend/src/workers/metricsWorker.ts` whenever that customer sends a live event.
  - Segment-time computations: performed-event counts and scoped purchase aggregates (`packages/segments/src/evaluator.ts`; `packages/frontend/src/components/segments/SegmentFilterBuilder.tsx`).
  - Shown on the profile (`packages/frontend/src/components/customers/UserInfoTab.tsx`).
- **Settings > SDK & Integration** holds Data maintenance: recalculate aggregates and backfill orders from events (`packages/frontend/src/app/(dashboard)/settings/DataMaintenance.tsx`).

**Path key for the Evidence column.** Line numbers are at commit `2063cdc`.

| Short name | Repo path |
|---|---|
| `Sidebar.tsx`, `SidebarItem.tsx` | `packages/frontend/src/components/layout/` |
| `projects/page.tsx`, `integrations/page.tsx`, `event-sources/page.tsx`, `event-sources/[id]/page.tsx`, `event-sources/mapping/page.tsx`, `analytics/predictions/page.tsx`, `DataMaintenance.tsx` (under `settings/`) | `packages/frontend/src/app/(dashboard)/` |
| `ConnectorsSection.tsx`, `SyncHistoryTable.tsx`, `AddConnectorDialog.tsx` | `packages/frontend/src/components/data-sources/` |
| `SFB` (SegmentFilterBuilder.tsx), `SegmentPreviewPanel.tsx` | `packages/frontend/src/components/segments/` |
| `UserInfoTab.tsx` | `packages/frontend/src/components/customers/` |
| `useDataConnectors.ts` | `packages/frontend/src/hooks/` |
| `v1Import.ts`, `v1Events.ts`, `dataConnectors.ts`, `events.ts`, `items.ts`, `customers.ts`, `v1Schema.ts`, `eventMapping.ts`, `integrations.ts`, `inboundWebhooks.ts`, `hooks.ts`, `assets.ts` | `packages/backend/src/routes/` |
| `index.ts` | `packages/backend/src/index.ts` |
| `customerService.ts`, `inboundWebhookService.ts`, `eventProcessor.ts`, `dataSyncService.ts`, `connectorRegistry.ts`, `genericHttpConnector.ts` (under `connectors/`), `storageService.ts`, `encryption.ts`, `entitlementService.ts`, `templateAlertService.ts`, `templateContext.ts`, `variableSources.ts`, `domainRegistry.ts`, `productCatalogService.ts`, `itemService.ts`, `orderEventKey.ts` | `packages/backend/src/services/` |
| `rateLimiter.ts`, `apiKeyAuth.ts`, `projectId.ts` | `packages/backend/src/middleware/` |
| `dataSyncWorker.ts`, `syncWorker.ts`, `metricsWorker.ts`, `aggregateReconcileWorker.ts`, `triggerWorker.ts` | `packages/backend/src/workers/` |
| `schema.ts` | `packages/backend/src/db/schema.ts` |
| `backend/package.json` | `packages/backend/package.json` |
| `evaluator.ts` | `packages/segments/src/evaluator.ts` |
| `types.ts`, `constants.ts`, `eventSchemas.ts` | `packages/shared/src/` |

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Navigation | Data menu (Data Imports; Computed Traits with a "New" badge) | Sidebar Data flyout with two items; Computed Traits badged "New" | 🟡 Partial | No Data group. Event Sources (admin) and Event Mapping (super-admin) sit in the main nav (`Sidebar.tsx:54-71`). Data Sources renders only inside super-admin `/projects` (`projects/page.tsx:148,339`); `/integrations` redirects there (`integrations/page.tsx`), so a merchant ends on "Super admins only". No computed-attributes page; `SidebarItem` takes a numeric count, not a "New" label (`SidebarItem.tsx:12,56-64`) | Add a "Data" group for project admins: Imports (connectors, sync history, later file imports), Event Sources and Computed attributes. Before moving Data Sources out of `/projects`, add `requireRole('admin')` to the write routes: `/api/data-sources` and `/api/inbound-webhooks` check only project membership (`index.ts:197,206`; `projectId.ts:21-48`), so any member can already create or delete a connector through the API. | P2 | S |
| Import history | Data imports list: All / Users / Events / Auxiliary Data tabs, per-tab empty states with a docs link, "+ Import" split button, title tooltip | History list with type tabs; Check import limit and + Import (Users, Events, Auxiliary data) in the header; one empty state per tab | 🟡 Partial | No import list. Closest: connector cards (Test, Sync Now, Full Resync, Edit, Delete) with expandable sync history (`ConnectorsSection.tsx:96-228`; `SyncHistoryTable.tsx:12-61`), super-admin `/projects` only; the Event Sources webhook list with 24h count and last received time (`event-sources/page.tsx:58-117`). JSON bulk imports return counts and keep no history (`v1Import.ts:57-416`) | One Imports page for project admins listing every ingestion job with type tabs, built on `data_source_syncs` and `SyncHistoryTable`. Recording API bulk imports as job rows needs a nullable `connector_id` and can follow. | P1 | S |
| Import history | List columns, statuses and row actions (page code only) | Source, Import type, Frequency, Created by, Created at, Sync status, Rows processed; 10 statuses; View details, Edit, Duplicate, Pause, Resume, Stop, Archive, Delete, Download | 🟡 Partial | Sync history: When, Kind, Status (Queued, Running, Success, Partial, Failed, Cancelled), imported/fetched (failed) per entity, Duration, error summary, logs filtered by all/error/warn (`SyncHistoryTable.tsx:31-193`; `dataConnectors.ts:315-368`). Card actions: Test, Sync Now, Full Resync, Edit, Delete (`ConnectorsSection.tsx:154-214`). No Pause/Resume button although PATCH and the hook accept `status` (`dataConnectors.ts:145-189`; `useDataConnectors.ts:128-139`); no Duplicate, Archive, Stop or Download. `created_by` and `triggered_by` exist but are never written or shown (`schema.ts:1361,1377`). No frequency (one global schedule). Event Sources rows do have an Active/Paused toggle (`event-sources/page.tsx:89-98`) | Add Pause/Resume (the API is ready), write and show Created by and Triggered by, a frequency column, Duplicate, and a failed-rows download. | P2 | S |
| Import limits | Import limit overview drawer and inline quota hints | Hourly and daily usage bars: users 610K/14.1M, events 5.1M/41M, aux data 1.5M/25M; Refresh; Top contributing imports; quota repeated in modals and dropzones | ❌ Missing | No ingestion usage display. Only a per-key, per-minute Redis counter with `X-RateLimit-*` headers and 429s (`rateLimiter.ts:13-55`), 2,000 requests a minute and 1,000 rows per call on imports (`v1Import.ts:34-36`). Plan limits cover contacts and sends, not import volume (`entitlementService.ts:16-45`) | Low value for D2C. If built, show rows per hour and per day and the rate-limit headroom on the Imports page. | P3 | M |
| Import sources | Source picker per data type (Users: SFTP, S3; Events and Aux data: Upload CSV, SFTP, S3) with a quota note | Modal per data type with radio source cards, remaining quota with a Check import limit link, Cancel/Continue | 🟡 Partial | `AddConnectorDialog` has a "Source type" card picker, but its sources are API pulls: VirpanAI, Custom HTTP and the Shopify custom app (`AddConnectorDialog.tsx:143-170`; `connectorRegistry.ts:10-33`). Not split by data type: one connector syncs customers, products, orders and dealers (`genericHttpConnector.ts:6`) | When file imports ship, ask for the data type first (Customers, Orders/Events, Catalog/lookup), then the source (CSV upload, S3, existing connectors). | P2 | S |
| Import sources | Upload CSV for events (drag and drop, CSV under 150 MB, quota hint, Download sample file, mandatory preview) | Event CSV step 1: Import name, Select event, sample file, dropzone, Preview file gate; aux data uses the same pattern | ❌ Missing | No CSV or file import anywhere: frontend file inputs are media, JSON key files and transcripts; multer is used only in `assets.ts:32-49`; no CSV parser in any `package.json`. Events backfill only as JSON: `POST /api/v1/events/batch`, 1,000 per call (`v1Events.ts:274-556`), and `/api/v1/import/orders` (`v1Import.ts:154-326`), both on the public SDK key (`requireApiKeyAuth` is unused: `apiKeyAuth.ts:64,206`) | Add CSV upload for orders and events on top of module 09's CSV wizard: store the file (`storageService.ts`), parse and map it in a BullMQ job, and feed the batch and historical pipelines with `historical: true`. Include a sample CSV and a preview step. | P1 | M |
| Import sources | Amazon S3 source (bucket, access key, masked secret key, optional region, folder path, inline credentials) | S3 credentials typed into the wizard (no saved connection), 26 regions, CSV only, optional PGP | ❌ Missing | S3 is used only for Storees' own assets (`storageService.ts:3-150`; `@aws-sdk/client-s3` in `backend/package.json:20`). No import from a customer bucket; connectors are REST only (`genericHttpConnector.ts`) | Add an S3 file source: bucket keys encrypted with `encryption.ts`, files listed by prefix and run through the CSV pipeline. The AWS SDK is already a dependency. | P2 | M |
| Import sources | SFTP source (saved connection added via App Marketplace, Folder URL, CSV only) | Saved-connection dropdown; "+ Add connection" opens App Marketplace > SFTP, which offers only "Request access"; full `sftp://` folder URL | ❌ Missing | No `sftp` or `ssh2` anywhere. No app marketplace (`/integrations` redirects to `/projects`). Connector credentials are encrypted per connector and cannot be reused (`dataConnectors.ts:126-137`) | SFTP pickup (ssh2-sftp-client) reusing the S3 file pipeline and encrypted credentials. Enterprise/ERP use case; low priority for Shopify D2C. | P3 | M |
| Import sources | PGP-encrypted files (decryption key, signing key, key passphrase) | "Is your file encrypted?" reveals three optional PGP fields | ❌ Missing | No `pgp` or `openpgp` anywhere | Only for S3/SFTP feeds: openpgp decryption with keys encrypted via `encryption.ts`. | P3 | S |
| Import sources | File name configuration: prefix plus one of 8 datetime suffixes, "Fetch file(s)", validation errors and toast | Prefix (default per data type) and Date time format; Fetch file(s) lists the matching files | ❌ Missing | No file sources. The nearest pre-check is connector Test, which fetches one record per endpoint and shows raw and mapped output (`dataConnectors.ts:220-263`; `ConnectorsSection.tsx:238-280`) | Part of the S3/SFTP source: prefix and date matching, a fetch preview, and a processed-file ledger so recurring runs never re-import a file. | P3 | S |
| Import sources | Warehouse imports (Snowflake, BigQuery, Databricks; locked behind "Request access") | Page code only: one-time and periodic imports, connection > schema > table, table preview, multi-event tables, updated-at incremental columns | ❌ Missing | No snowflake, bigquery, databricks or redshift in any package; planned in `docs/MOENGAGE_COMPETITIVE_PLAN.md:75` (P2). Reusable incremental cursor: `IncrementalSpec` (`genericHttpConnector.ts:42-45`) and per-entity `lastSyncedAt` (`dataSyncWorker.ts:78-80`) | Enterprise feature that MoEngage also gates. If deals need it, start with BigQuery (D2C brands exporting GA4 often have it). | P3 | L |
| Import wizard | 3-step wizard with a required Import name, "Untitled" title, Next disabled until files are fetched or previewed, stepper validation | Source and format > Import configuration and action > Scheduling | ❌ Missing | Adding a data source is one SlidePanel (source, name, base URL, key) that only suggests Test after saving (`AddConnectorDialog.tsx:122-264`, hint at 255-259). The Event Definition editor is one dialog with numbered sections 1-4 and no gating (`event-sources/[id]/page.tsx:391-567`). Connector mappings have no UI (`dataConnectors.ts:98-143`) | One import wizard, shared with module 09's CSV import, with a required preview/Test before Save; reuse TestResultPanel's raw-vs-mapped view. | P1 | S |
| Import wizard | User type: Registered vs Anonymous users, per-type sample file and default prefix | Registered users / Anonymous users cards switch the sample link and the prefix | 🟡 Partial | Registered customers resolve by external id, email or phone (`v1Import.ts:57-116`; `customerService.ts:316-531`). Anonymous ids (`anon_`, `sdk_`, bare UUIDs) are stored as sessions, not profiles (`v1Events.ts:699-721`), so an anonymous import has nothing to write to. No sample files | Keep imports registered-only; ship a sample CSV per entity with the CSV import. | P3 | S |
| Event import | Select event (searchable) with "+ Create new event" and Download sample file | Required event dropdown; the create modal notes the event is editable in Data Management | 🟡 Partial | No managed event catalog. Names come from per-vertical code constants with a property registry (`constants.ts` STANDARD_EVENTS; `eventSchemas.ts`) and from observed data (`GET /api/events/names`, `events.ts:100-113`). New names can be declared by an Event Definition (`event-sources/[id]/page.tsx:449-461`) or typed as "Custom event name…" in the segment card (`SFB:662-672`). The orders import writes the project's purchase event (`v1Import.ts:240-241`) | Event picker (standard, observed and create new) in the import wizard; a managed catalog belongs to Data Management. | P3 | S |
| Event import | Required mapping: User identifier, and Event time (column, datetime format, UTC or App timezone) | Required mapping rows at the top of step 2; timestamp columns auto-detected in code | 🟡 Partial | API events take customer_id, email, phone or session_id plus an ISO-8601 timestamp (`v1Events.ts:274-330`); the orders import requires order_id and timestamp (`v1Import.ts:198-201`). Event Sources maps identity paths (`event-sources/[id]/page.tsx:498-516`) but stamps the receipt time (`inboundWebhookService.ts:397`). Connectors refuse an orders mapping without a timestamp (`dataConnectors.ts:35-47`). No datetime-format choice, no timezone toggle and no project timezone setting | Optional event-time path with format and timezone in Event Definitions and the CSV event wizard. | P2 | S |
| Event import | Skip duplicate rows by a chosen "Column to identify duplicates" | Import behaviour checkbox plus a column picker | 🟡 Partial | Per-row dedupe through a caller `idempotency_key` on the unique `(project_id, idempotency_key)` index. Order events get one fingerprint per order (`v1Events.ts:63-73`; `orderEventKey.ts:19-21`), so an order arriving by import, webhook and Shopify sync is stored once (`v1Import.ts:262-276`). Not always on: the single-event route derives a SHA-1 key (`v1Events.ts:25-58,176`), but `/events/batch` inserts keyless non-order events with no dedupe (`v1Events.ts:428-447`), so re-running a batch history import duplicates them. Webhooks key per receipt (`inboundWebhookService.ts:396`) | Let the CSV event wizard map a chosen column to `idempotency_key`, and derive a key for keyless rows in `/events/batch` as `/events` already does. | P2 | S |
| User import mapping | Required mapping: User identifier column | A "Required mapping" row picks the column used as the user ID | 🟡 Partial | Every path resolves identity by external id, email or phone (`customerService.ts:316-531`). Only Event Sources has a UI for it (Email, Phone, External ID, Session ID, Name: `event-sources/[id]/page.tsx:498-516`). Connector identity fields sit in the API-only field map (`genericHttpConnector.ts:65-70`) | Add a required identifier row (external id, email or phone) at the top of the import mapping step. | P1 | S |
| User import mapping | Column-to-attribute table: column search, grouped searchable attribute picker, remove, "Total columns in file" | Column name, Map column to attribute, data type and Action columns | 🟡 Partial | Event Sources' "Update customer profile" maps a payload path to 5 standard fields or any typed key, merged into `custom_attributes` (`event-sources/[id]/page.tsx:287,540-563`; `inboundWebhookService.ts:94,334-360`). Connector field maps support dot-paths, concat, divide/multiply, subtract, fromArray and nested custom attributes, but only through the API (`genericHttpConnector.ts:47-140`). The JSON customer import has a fixed field list (`v1Import.ts:42-55`) | Build a visual mapping table (column to grouped attribute picker) shared by CSV imports and connectors, fed by standard fields plus the observed `custom_attributes` keys (`variableSources.ts:61-83`). | P1 | M |
| User import mapping | "+ Create new attribute" and per-column data types (double, number, bool, datetime, string, geopoint, arrays) | The attribute picker ends with "+ Create new attribute"; each mapped column gets a type | 🟡 Partial | Typing any key creates a custom attribute implicitly (`event-sources/[id]/page.tsx:550-556`). No catalog and no types: values stay raw JSON and the evaluator compares them as text (`evaluator.ts:1197-1208`); geopoint and array values have no handling | Add a typed attribute registry (name, type, source) written on first import, used for casting in the evaluator and for the segment and template pickers. | P2 | M |
| User import mapping | "+ Add Column" placeholder columns for recurring imports and "Upload mapping file" | Placeholder rows for columns later files may contain; load a saved mapping | 🟡 Partial | A connector's `configOverride` is a stored mapping reused on every scheduled run; missing source fields resolve to null instead of failing the run (`dataConnectors.ts:98-143`; `genericHttpConnector.ts:83-140`). API only: no upload, export or editor | Let admins export and import a mapping JSON in the wizard and edit it in the mapping table. | P3 | S |
| User import options | "Skip new users during this import" (update existing users only) | Existing users are updated; no new users are created | ❌ Missing | Every path creates the customer when nothing matches; `ResolveParams` has no update-only flag (`customerService.ts:316-346,401-531`). No skipNew, updateOnly or createIfMissing anywhere | Add an update-only option to `resolveCustomer` and the wizard. | P2 | S |
| User import options | Save as a file segment (name, at most 5M users, ready 30 minutes after import) | Toggle with a File segment name | ❌ Missing | No static or list segments: `segments.filters` is NOT NULL and every segment is rule-based, with membership rebuilt from filters (`schema.ts:302-321`) | Depends on module 09's file segments (P0). Once they exist, add imported customers to a static segment at import time. | P1 | S |
| User import options | Send import status email (on by default, up to 10 recipients) | Toggle pre-filled with the current user; also on event and aux-data imports | ❌ Missing | Sync results are visible only in the super-admin sync history. Failures land in `data_source_syncs` and its logs but notify nobody (`dataSyncWorker.ts:111-129`). An admin-email pattern already exists: `templateAlertService.ts:58-62` emails project admins | Email (later also in-app) project admins on failed or partial syncs and when a file import finishes, reusing the template-alert sender. | P2 | S |
| Auxiliary data | Auxiliary (lookup) data import keyed by a Primary key, from CSV, S3 or SFTP | Non-user, non-event lookup tables; required Primary key; default prefix `auxdata_` | 🟡 Partial | Keyed lookup data exists only as catalog, through JSON APIs: `/api/v1/import/products` upserts on product_id with collections (`v1Import.ts:339-362`; `productCatalogService.ts:292`); `POST /api/items/bulk` inserts items with free attributes, unique on project, catalogue and external_id, skipping existing rows (`items.ts:62-76`; `itemService.ts:28-53`; `schema.ts:741-756`). Shopify products and collections sync natively (`syncWorker.ts:413-527`). Templates cannot read items (`templateContext.ts:150-176`) | Add generic keyed lookup tables (pincode to delivery ETA, store locator, offer codes) that can be imported by CSV and used as a template variable source. | P2 | M |
| Auxiliary data | Retention period (1 day to 1 year, default 15 days) | Required "Data action" card in step 3 | ❌ Missing | No TTL or expiry column on products, items or catalogues (`schema.ts`); no retention logic in any import path | Add a TTL and a nightly purge when lookup tables are built. | P3 | S |
| Scheduling | One-time import: as soon as possible, or at a set date, time and time zone | One Time frequency with Start date, Start time, Time zone and Reset to defaults | 🟡 Partial | Sync Now runs immediately and the first run is forced full (`dataConnectors.ts:269-311`); API imports run inside the request. Nothing can run once at a set time | Allow a one-time run at a set time and time zone (a BullMQ delayed job). | P3 | S |
| Scheduling | Periodic import: hourly, daily, weekly or monthly; repeat every N; weekday chips; monthly day including last day; end conditions; IANA time zone | Full recurrence editor; each periodic file needs a unique name | 🟡 Partial | Every active connector runs on one global schedule: incremental every 3 hours, full resync at 03:00 server time (`dataSyncWorker.ts:26-27,144-156`); Shopify runs only on the nightly tick (`dataSyncWorker.ts:63-76`). Not configurable per connector and not shown. Campaigns already have `PeriodicSchedule` (`types.ts:224-230`) and `schedule_timezone` (`schema.ts:443`) | Let each connector or import set its own frequency and time zone (reuse `PeriodicSchedule` and `upsertJobScheduler`), and show the next run on the card. | P2 | S |
| Computed traits | Availability: paid add-on upsell with Learn more and an "I'm interested" request modal | Upsell page on both routes; request modal with a prefilled subject and message | ➖ N/A | Commercial packaging, not a capability. Storees has no add-on to upsell, and its built-in metrics are ungated (the `predictions` entitlement is defined but never enforced: `entitlementService.ts:15-39`) | None for the upsell page; see the builder rows. | — | — |
| Computed traits | Example traits CLV, Average Order Value, Engagement Score and Churn Score (a paid add-on in MoEngage) | Promo art computes CLV, AOV and Engagement Score from customer data; a tab shows a Churn Score trait | 🟡 Partial | CLV (historical, predicted, total, health) and AOV exist for every buyer in every plan: aggregate columns and CLV fields are rebuilt nightly (`aggregateReconcileWorker.ts:28-71`; `customerService.ts:1044-1083`) and are segment fields (`domainRegistry.ts:13-16`). Engagement Score and Churn Risk (`domainRegistry.ts:163-165`) are written only by the metrics worker when that customer sends a live event (`metricsWorker.ts:64-90,285,603-608`). Shopify history sync, connectors and the orders import never queue it (`eventProcessor.ts:182-212`; `dataSyncService.ts:392`; `v1Import.ts:299-313`), the nightly reconcile skips both keys, and the all-customer refresh is API-only (`customers.ts:883-905`). The evaluator reads a missing key as 0 (`evaluator.ts:1145-1148`), while the profile falls back to the CLV churn probability (`UserInfoTab.tsx:115-116`) | Compute the metrics JSON for every customer after history sync and imports and in the nightly reconcile (reuse `computeAndUpdateMetrics`), and add "Refresh metrics" to Data maintenance. Then demo these as MoEngage's paid add-on, included free. | P1 | S |
| Computed traits | Preference traits: Preferred Category, Top Spend Category, Total Savings, Top Watched Genre | Examples in the hero art and benefit tabs (Total Savings is a Sum used in a message) | ❌ Missing | No preferred or top category and no savings metric anywhere. Category affinity exists only as segment conditions, has purchased or has viewed a category (`evaluator.ts:620-733`); discounts only as `discount_order_percentage` (`metricsWorker.ts:186-196,280`) and a per-order discount (`syncWorker.ts:205`) | Add two built-in metrics: preferred category or collection (most-purchased product_type or collection) and total discount saved. Both feed WhatsApp and email personalization directly. | P2 | S |
| Computed traits | Count computation (event, time period, attribute filters) stored as a trait | Count type, per MoEngage's docs | 🟡 Partial | Counted only when a segment is evaluated: "Performed a specific event" at least, at most or exactly N times in the last N days, with AND property filters (`types.ts:1591-1600`; `SFB:638-786`; `evaluator.ts:212-264`). Built-in counts: orders in the last 30/90 days, total_events, cart_count, events_last_30d (`metricsWorker.ts:272-282,577-578`). User-defined counts are not stored, so templates and profiles cannot use them | Store a user-defined count in `custom_attributes` on a schedule, reusing the SQL already compiled for EventOccurrenceRule. | P2 | S |
| Computed traits | Aggregation: Sum, Min, Max, Average, Median, Distinct count, True if event exists, over an event property | Aggregation type, per MoEngage's docs | 🟡 Partial | The segment's scoped aggregate supports SUM, COUNT, COUNT_DISTINCT (orders), AVG, MIN and MAX over live purchase line items (line value, quantity or price), scoped by product, collection, category, price or quantity, over all time, the last N days or a date range (`types.ts:513-548`; `SFB:559-610,787-907`; `evaluator.ts:386-561`). No MEDIAN, no aggregation over other events' properties, no stored result | Extend the aggregate to any event and numeric property (cashback, cart value), add MEDIAN, and allow saving the result as a computed attribute. | P2 | M |
| Computed traits | First/Last Value of an event property | First/Last Value type card in the builder art and docs | 🟡 Partial | Fixed built-ins only: first and last order date, first_seen and last_seen, first_event_at and last_event_at, last_page_viewed (`metricsWorker.ts:276-279,554-570`). The user cannot choose the event or property | Add the first or last value of any event property as a computed attribute (last purchased product, first UTM source). | P2 | S |
| Computed traits | SQL Computation over user and event tables | SQL editor returning a user ID and a value; Numerical, String or Boolean | ❌ Missing | No SQL editor or raw-query endpoint anywhere; project rules forbid raw SQL outside migrations (`.claude/rules/backend.md`) | Enterprise feature with real risk on multi-tenant Postgres; defer. | P3 | L |
| Computed traits | Builder: Basic details (name, description, filter users) > Define (type cards, configuration, data type, summary, preview on one or 10 users) > Scheduling > Publish | Seen only in the illustration and the docs | ❌ Missing | No builder: metrics are hard-coded per vertical (`metricsWorker.ts:98-139`). Prediction Goals (`analytics/predictions/page.tsx`) are the only user-defined per-customer score, and they are ML propensities, not Count, Aggregation or Value traits. Reusable pieces: the segment filter compiler, the EventOccurrence and Aggregate SQL, and the live preview (count plus 10 sample customers, 600 ms debounce: `SegmentPreviewPanel.tsx:25,113-115`) | Build a trait builder that reuses the segment filter for the audience, the occurrence and aggregate SQL for the definition and the preview panel, writes values into `custom_attributes` and registers each attribute for segments and templates. This is the main answer to MoEngage's add-on. | P2 | L |
| Computed traits | Scheduling and computation actions: one time or weekly/monthly (daily on request); Replace, Compute only for new users, Add, Subtract | Per MoEngage's docs | 🟡 Partial | The metrics JSON refreshes only on that customer's own live events (`metricsWorker.ts:64-90`): fresher than MoEngage for active customers, never for idle ones. The 03:00 reconcile rebuilds aggregate columns and CLV fields only (`aggregateReconcileWorker.ts:28-71`). Data maintenance offers "Recalculate customer aggregates" and an order backfill, not a metrics refresh (`DataMaintenance.tsx`; `customers.ts:845-878`). No user-set schedule and no Add or Subtract action | Fix the refresh first (example-traits row, P1). Per-trait schedules and Replace and Add actions come with the builder. | P3 | S |
| Computed traits | Computed traits list: search; Type, Schedule and Status filters; Scheduled, Processing, Active, Paused; View, Edit, Pause/Resume; no delete | Per MoEngage's docs | ❌ Missing | No list or catalog. Metrics appear per customer in the profile's "Computed Metrics" table as auto-titled keys with no definitions (`UserInfoTab.tsx:427-459`) | Start with a read-only catalog of the built-in metrics (definition, refresh timing, where each can be used), then manage user-defined attributes there. | P2 | S |
| Computed traits | Limits: 10 active traits, 50 per workspace, about 1M users per hour | Per MoEngage's docs | ➖ N/A | Operating limits on a feature Storees does not have; its built-in metrics have no per-workspace cap | None. | — | — |
| Computed traits | Imported and computed attributes usable as user properties in segmentation and personalization | Traits and imported attributes appear in segments (Granular Targeting tab), in messages (Hyper-Personalized tab) and in the import attribute picker | 🟡 Partial | Aggregate columns (orders, spend, AOV, CLV, first and last order date) work in segments and templates (`domainRegistry.ts:5-48`; `templateContext.ts:204-223`). Metrics keys (engagement_score, churn_risk, days_overdue) are segment fields but not template variables (whitelist at `templateContext.ts:204-223`). `custom_attributes` keys appear in the template picker (`variableSources.ts:61-83`) but not in the segment builder: its fields are fixed per vertical (`v1Schema.ts:21-57`) and the evaluator reaches custom keys only through an untyped text fallback (`evaluator.ts:1197-1208`) | Add a typed custom-attribute group to `/api/schema/fields` (reuse `pullAttributeKeys`) and allow metrics keys as template variables. Same gap as module 07's Tracked Custom Attributes picker (P0). | P0 | M |
| Computed traits | Benefit tabs (Effortless Attribute Creation, Hyper-Personalized Engagement, Granular Targeting, Enrich Customer Profiles, Optimize Resources) | Five tabs, each an illustration plus marketing copy | ➖ N/A | Marketing copy on an upsell page, not product functionality | None. | — | — |

### Storees-only strengths

- **Native Shopify history import on install, with no files.** The OAuth callback queues a full sync of customers with email and SMS consent, every order (`status=any`) with fulfilment and refund status, products, and custom and smart collections (`integrations.ts:55-131`; `syncWorker.ts:108-412,441-527`). Orders are written as historical, so no flows fire (`triggerWorker.ts:31-37`). In MoEngage the same job needs CSV, S3, SFTP or warehouse imports.
  - Caveat: synced customers get no churn risk or engagement score until their next live event (see the example-traits row).
- **Scheduled pull connectors from any REST API, with a field-mapping language.** Bearer, API-key or basic auth; offset, page or cursor pagination; an incremental parameter in ISO-8601 or epoch; transforms such as concat, divide/multiply, subtract, fromArray and nested custom attributes (`genericHttpConnector.ts:6-140`). Incremental pulls run every 3 hours and a full resync nightly (`dataSyncWorker.ts:26-27,144-156`). They pull customers, products, orders and dealers straight from a Medusa, ERP or POS backend; MoEngage's import module takes only files or locked warehouses.
  - Caveat: the UI is super-admin only and mappings are API-only.
- **Connector Test and row-level sync history.** Test fetches one record per endpoint and shows the raw and mapped output; each run shows imported, fetched and failed counts per entity, the duration, and logs filterable by level (`dataConnectors.ts:220-263,315-368`; `ConnectorsSection.tsx:238-280`; `SyncHistoryTable.tsx:63-193`). MoEngage's list shows only Rows processed and a Download.
- **Event Sources: no-code real-time ingestion for project admins.** Inbound webhooks with schema inference; Event Definitions with filters, identity, properties and profile attributes; a rule-by-rule "Why didn't this match?" showing actual values; "Reprocess no-match rows" (`event-sources/[id]/page.tsx:80-567`; `inboundWebhookService.ts`; `hooks.ts`). It connects checkout and CRM tools such as Shopflo. MoEngage's Data Imports handles batch files only.
- **One fingerprint per order across every door.** `<event>_historical:<order_id>` keys with ON CONFLICT DO NOTHING mean an order arriving by import, webhook and Shopify sync is stored once, and a re-sent order merges its newer state (`orderEventKey.ts:19-21`; `v1Import.ts:262-276`; `v1Events.ts:63-100`). Historical rows never trigger flows, so re-running an order import never double-counts revenue or welcomes old customers.
  - Caveat: keyless non-order events sent to `/events/batch` are not deduplicated.
- **Event Mapping with a replay preview (super-admin).** Events from non-Shopify stacks can be re-mapped to purchase, refund and other meanings after the fact. The preview shows the order and revenue impact, saving requires typing the project name, and the order history is then replayed (`eventMapping.ts:322-700`; `event-sources/mapping/page.tsx`). In MoEngage an event's meaning is fixed at import.
- **CLV and AOV built in, free.** Historical, predicted and total CLV plus a health label for every buyer, rebuilt nightly, with AOV and order totals as segment and template fields (`customerService.ts:162-312,1044-1083`; `aggregateReconcileWorker.ts:28-71`; `UserInfoTab.tsx`). MoEngage sells this as the paid Computed Traits add-on.
  - Caveat: churn risk, engagement score and reorder timing appear only after a customer's next live event.
- **Scoped purchase aggregates at evaluation time.** A condition such as "spent over 5,000 on collection X in the last 90 days" needs no pre-built trait or refresh schedule, counts each order once and drops cancelled and refunded orders (`types.ts:513-548`; `evaluator.ts:386-561`).
- **Imported custom attributes discovered automatically for personalization.** The top 50 `custom_attributes` keys of the 1,000 most recently seen customers, with sample values, appear in the template variable picker without being declared (`variableSources.ts:61-83`).
- **Self-serve data repair.** After a large import, admins can rebuild customer totals and turn event-only orders into order records from Settings (`DataMaintenance.tsx`; `customers.ts:845-878`).

### UX notes

- **Where ingestion lives (screens 001, 002, 004).** MoEngage puts every ingestion job in one list under Data > Data imports, with type tabs and a "+ Import" split button. Storees spreads ingestion over three places:
  - Event Sources (admin nav).
  - Event Mapping (super-admin nav).
  - Data Sources, inside the expanded card of the super-admin `/projects` page (`projects/page.tsx:148,339`). A merchant following an old `/integrations` link lands on "Super admins only".

  As a result, a merchant on a self-serve trial cannot see whether their Shopify history finished syncing. Adopt a "Data" section for project admins with an Imports list built from `data_source_syncs`.
- **Wizard and gating (screens 006, 017, 018, 023).** MoEngage keeps Next disabled until files are fetched or previewed and shows inline "Required input" errors with a toast. Storees' AddConnectorDialog saves with just a name, base URL and key, then suggests running Test (`AddConnectorDialog.tsx:255-259`), so a wrong mapping is found only after a sync. Make Test a required step before the first sync and show its raw-vs-mapped output inline; TestResultPanel already exists (`ConnectorsSection.tsx:238-280`).
- **Mapping table (screens 033, 045, 048).** MoEngage starts step 2 with a required identifier row (plus event time, format and timezone for events), then a typed table with a grouped, searchable attribute picker and "+ Create new attribute". Storees' Event Definition editor has a PathPicker per row and a five-item datalist of profile fields (`event-sources/[id]/page.tsx:287,540-563`), with no types and no event-time field. Adopt the required-row plus typed-table pattern and fill the picker from the custom attribute keys already observed (`variableSources.ts:61-83`).
- **Scheduling (screens 035-043).** MoEngage lets the user set the frequency, repeat interval, end condition and an IANA time zone that defaults to Asia/Kolkata. Storees connectors run on a hidden global schedule, every 3 hours plus a full resync at 03:00 server time (`dataSyncWorker.ts:26-27`). At minimum, show the schedule and next run on each connector card; then reuse the campaign `PeriodicSchedule` control (`types.ts:224-230`) for per-connector schedules.
- **Feedback after an import (screens 034, 056).** MoEngage turns "Send import status" on by default, pre-filled with the current user, and has a quota drawer. Storees records sync failures in `data_source_sync_logs` but alerts nobody. The failure email is the cheaper and more useful half to copy, and `templateAlertService.ts` already emails project admins; the quota drawer is low value for D2C.
- **Where Storees is better.** Its sync history shows imported, fetched and failed counts per entity, the duration and per-row logs filterable by level (`SyncHistoryTable.tsx`). Event Sources explains, rule by rule and with the actual values, why a payload did not match (`event-sources/[id]/page.tsx:197-225`). MoEngage's list shows only Rows processed and a Download action. Keep this depth in the unified Imports page.
- **Computed traits (screens 057-065).** MoEngage gives a whole upsell page to a locked feature whose hero art lists CLV, AOV, Engagement Score and Preferred Category. Storees computes CLV and AOV for free and has Engagement Score and Churn Risk fields, but it shows them only as auto-titled keys in the profile's "Computed Metrics" table (`UserInfoTab.tsx:427-459`), with no catalog, and the two scores are empty for customers who arrived by history sync. Fix the scores, then add a read-only "Computed attributes" page (formula, refresh timing, where each can be used) to make the advantage visible in demos. A later builder can follow MoEngage's Basic details > Define > Scheduling layout with type cards (screen 060).
- **Inconsistent attribute rules.** Built-in metrics such as engagement_score and churn_risk work in segments but not in templates, because `templateContext.ts:204-223` uses a whitelist. Custom attributes work in templates (`variableSources.ts`) but not in the segment builder (`v1Schema.ts:21-57`). The profile's Churn Risk even reads a different key from the segment field when `churn_risk` is missing (`UserInfoTab.tsx:115-116` against `evaluator.ts:1147-1148`), so a customer the profile shows at 85% does not match "Churn Risk Score > 70". MoEngage treats all of these as one list of user properties. Merge them into one typed attribute registry used by the segment builder, the template picker and the import mapping step.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status. Missing and partial rows were searched under these terms:
- csv, papaparse, csv-parse, xlsx, multer, FileReader, `type="file"`, upload, dropzone;
- S3 bucket, ListObjects, sftp, ssh2, pgp, openpgp, snowflake, bigquery, databricks, redshift;
- skipNew, updateOnly, update_only, createIfMissing, existing only;
- computed trait or attribute, derived attribute, calculated field, custom metric, attribute registry, SQL editor, raw query, monaco, codemirror;
- preferred or top category, favourite, total discount, savings, affinity (the decisioning service and the interactions table);
- project timezone, retention, TTL, notification, alert, sendEmail;
- every `metricsQueue` producer, every `upsertJobScheduler` and every `computeAndUpdateMetrics` caller.

Prediction Goals were considered for the builder rows and ruled out: they are ML propensity scores (`analytics/predictions/page.tsx`; `packages/ml/publish_results.py`), not Count, Aggregation or Value traits.

39 of 40 statuses held. One status and two priorities changed, and seven rows had their evidence or gap corrected:

- **Example traits CLV, AOV, Engagement Score and Churn Score: ⭐ Storees better → 🟡 Partial, now P1 S.** The evidence said the metrics are "computed for every customer on each event, reconciled nightly". That holds for CLV and AOV only.
  - Engagement Score and Churn Risk are written only by the metrics worker when a customer sends a live event (`metricsWorker.ts:64-90,285,603-608`).
  - Shopify history sync (`processHistoricalEvent`, `eventProcessor.ts:182-212`), connector syncs (`dataSyncService.ts:392`) and the orders import (`v1Import.ts:299-313`) queue only the aggregate worker. The nightly reconcile merges CLV fields but neither key (`customerService.ts:1044-1083`), and the all-customer `POST /api/customers/refresh-metrics` is API-only (`customers.ts:883-905`).
  - The evaluator reads a missing key as 0 (`evaluator.ts:1145-1148`). On a freshly synced store, a "Churn Risk Score > 70" segment is therefore empty while the profile shows a churn % taken from `clv_churn_probability` (`UserInfoTab.tsx:115-116`). For customers who go quiet, both scores freeze at their last active value.
- **Skip duplicate rows (🟡): P3 → P2, evidence corrected.** Dedupe is not always on. `/api/v1/events/batch` derives no key for keyless non-order events (`v1Events.ts:428-447`; the SHA-1 key exists only on the single-event route, `v1Events.ts:176`), so re-running a batch history import double-inserts them and inflates "performed N times" segments.
- **Trait scheduling and computation actions (🟡, P3 S kept): evidence corrected.** "Reconciled nightly at 03:00" applies to aggregate columns and CLV fields, not to the metrics JSON, and Data maintenance has no metrics refresh. The fix is tracked on the example-traits row.
- **Import list columns, statuses and row actions (🟡, P2 S kept): evidence corrected.** `created_by` and `triggered_by` are never written, not merely hidden: no insert sets them (`dataConnectors.ts:126-137,280-301`). Event Sources rows already have an Active/Paused toggle (`event-sources/page.tsx:89-98`).
- **Data menu (🟡, P2 S kept): gap extended.** `/api/data-sources` and `/api/inbound-webhooks` are mounted with `requireAuth` and check only project membership (`index.ts:197,206`; `projectId.ts:21-48`), so the admin-only navigation is cosmetic. Any project member can create or delete connectors through the API today, and deleting the Shopify connector clears the store token (`dataConnectors.ts:191-213`). Add `requireRole('admin')` before exposing the panel.
- **Select event (🟡, P3 S kept): evidence refined.** A code-level, per-vertical event registry with property types exists (`constants.ts`; `eventSchemas.ts`). What is missing is a managed catalog with "create new event".
- **Computed traits list (❌ kept): wording.** Profile keys are auto-titled, not raw.
- **Send import status (❌ kept): gap.** It now points at `templateAlertService.ts`, which already emails project admins.
- **Storees counterpart and Storees-only list.** "About 40 metrics per vertical recomputed on every event" became "about 30 ecommerce metrics, recomputed when that customer sends a live event". The "built-in metrics ready from day one" strength was narrowed to CLV and AOV, with a caveat.

**Cross-module consistency.**
- Rows shared with module 09 keep its ratings: the wizard (❌ P1 S), the imports list (🟡 P1 S), the identifier (🟡 P1 S), the mapping table (🟡 P1 M), typed attributes (🟡 P2 M), skip new users (❌ P2 S), file segment (❌ P1 S), status email (❌ P2 S), one-time scheduling (🟡 P3 S) and the limit drawer (❌ P3 M).
- "Upload mapping file" is 🟡 here but ❌ in module 09. Here the comparison is recurring source imports, and their Storees analogue, the connector, does keep a reusable mapping. Module 09 compares one-off CSV imports, which store no mapping.
- The P0 user-properties row matches module 07's P0 Tracked Custom Attributes row. Module 07 also rates Storees' fixed computed traits 🟡 Partial, which the example-traits row now agrees with.

### Screens

#### Data flyout and Data imports list

![Data flyout: Data Imports, and Computed Traits with a 'New' badge](../screenshots/17-data-imports-computed-traits-001-data-flyout.jpg)
*Data flyout: Data Imports, and Computed Traits with a 'New' badge*

![Data imports, All tab: empty state ('ingest your data into MoEngage using CSV files'), Check import limit, + Import split button](../screenshots/17-data-imports-computed-traits-002-data-imports-all-empty.jpg)
*Data imports, All tab: empty state ('ingest your data into MoEngage using CSV files'), Check import limit, + Import split button*

![Title tooltip: import users, events and auxiliary data from various sources](../screenshots/17-data-imports-computed-traits-003-data-imports-info-tooltip.jpg)
*Title tooltip: import users, events and auxiliary data from various sources*

![+ Import menu: Users, Events, Auxiliary data (the main button opens the same menu)](../screenshots/17-data-imports-computed-traits-004-import-type-dropdown.jpg)
*+ Import menu: Users, Events, Auxiliary data (the main button opens the same menu)*

![Users tab: 'User import' empty state](../screenshots/17-data-imports-computed-traits-019-data-imports-users-tab-empty.jpg)
*Users tab: 'User import' empty state*

![Events tab: 'Event import' empty state](../screenshots/17-data-imports-computed-traits-020-data-imports-events-tab-empty.jpg)
*Events tab: 'Event import' empty state*

![Auxiliary Data tab (type=aux-data): 'Auxiliary data import' empty state](../screenshots/17-data-imports-computed-traits-021-data-imports-aux-data-tab-empty.jpg)
*Auxiliary Data tab (type=aux-data): 'Auxiliary data import' empty state*

![Import limit overview drawer: User 0/610K hourly and 0/14.1M daily, Event 0/5.1M and 0/41M, Aux 0/1.5M and 0/25M; Top contributing imports (Hourly/Daily); Refresh](../screenshots/17-data-imports-computed-traits-056-check-import-limit-drawer.jpg)
*Import limit overview drawer: User 0/610K hourly and 0/14.1M daily, Event 0/5.1M and 0/41M, Aux 0/1.5M and 0/25M; Top contributing imports (Hourly/Daily); Refresh*

#### Import source picker modals (Users, Events, Auxiliary data)

![Import users: SFTP and Amazon S3; 'User imports limit 610K left (Hourly) / 14.1M left (Daily)'](../screenshots/17-data-imports-computed-traits-005-import-users-source-modal.jpg)
*Import users: SFTP and Amazon S3; 'User imports limit 610K left (Hourly) / 14.1M left (Daily)'*

![Import events: Upload CSV, SFTP, Amazon S3; 'Event imports limit 5.1M left (Hourly) / 41M left (Daily)'](../screenshots/17-data-imports-computed-traits-022-import-events-source-modal.jpg)
*Import events: Upload CSV, SFTP, Amazon S3; 'Event imports limit 5.1M left (Hourly) / 41M left (Daily)'*

![Import auxiliary data: Upload CSV, SFTP, Amazon S3; 'Aux data limit 1.5M left (Hourly) / 25M left (Daily)'](../screenshots/17-data-imports-computed-traits-026-import-aux-data-source-modal.jpg)
*Import auxiliary data: Upload CSV, SFTP, Amazon S3; 'Aux data limit 1.5M left (Hourly) / 25M left (Daily)'*

#### New user import (SFTP), step 1: Source and format

![Step 1 top: stepper, Import name, Registered/Anonymous cards, Configure SFTP, File name configuration](../screenshots/17-data-imports-computed-traits-006-sftp-users-step1-top.jpg)
*Step 1 top: stepper, Import name, Registered/Anonymous cards, Configure SFTP, File name configuration*

![SFTP connection dropdown: no saved connections, '+ Add connection' (opens App Marketplace > SFTP in a new tab)](../screenshots/17-data-imports-computed-traits-007-sftp-connection-dropdown.jpg)
*SFTP connection dropdown: no saved connections, '+ Add connection' (opens App Marketplace > SFTP in a new tab)*

![Configure SFTP tooltip: MoEngage authenticates with the selected connection; you can create a new one](../screenshots/17-data-imports-computed-traits-010-sftp-configure-tooltip.jpg)
*Configure SFTP tooltip: MoEngage authenticates with the selected connection; you can create a new one*

![Folder URL tooltip: full SFTP path without a trailing slash, e.g. sftp://{host-name}/my_folder/sub_folder](../screenshots/17-data-imports-computed-traits-011-sftp-folder-url-tooltip.jpg)
*Folder URL tooltip: full SFTP path without a trailing slash, e.g. `sftp://{host-name}/my_folder/sub_folder`*

![Encryption tooltip: only PGP-encrypted files are supported; paste your PGP keys](../screenshots/17-data-imports-computed-traits-012-sftp-encrypted-tooltip.jpg)
*Encryption tooltip: only PGP-encrypted files are supported; paste your PGP keys*

![Date time format (filename suffix): 8 options from {mm}_{yyyy} to {yyyymmdd}_{hhmmss}](../screenshots/17-data-imports-computed-traits-013-sftp-datetime-format-dropdown.jpg)
*Date time format (filename suffix): `{mm}_{yyyy}`, `{ddmmyyyy}`, `{yyyymmdd}`, `{yyyymmddhhmm}`, `{yyyymmddhhmmss}`, `{mon}_{yyyy}`, `{yyyymmdd}_{hhmm}`, `{yyyymmdd}_{hhmmss}`*

![Encryption ticked: Decryption key (PGP private key block, optional)](../screenshots/17-data-imports-computed-traits-014-sftp-encrypted-pgp-fields.jpg)
*Encryption ticked: Decryption key (PGP private key block, optional)*

![Signing key (PGP public key block), Key passphrase, File name configuration, Fetch file(s), Next disabled](../screenshots/17-data-imports-computed-traits-015-sftp-pgp-fields-bottom-next-disabled.jpg)
*Signing key (PGP public key block), Key passphrase, File name configuration, Fetch file(s), Next disabled*

![Anonymous users selected: the link becomes 'Download sample file for anonymous users' and the prefix becomes anonymous_user_data_](../screenshots/17-data-imports-computed-traits-016-sftp-anonymous-users-selected.jpg)
*Anonymous users selected: the link becomes 'Download sample file for anonymous users' and the prefix becomes `anonymous_user_data_`*

![Fetch file(s) with empty fields: Required selection and Required input errors; toast 'Fix the missing or inaccurate values... before fetching file(s)'](../screenshots/17-data-imports-computed-traits-017-sftp-fetch-files-validation.jpg)
*Fetch file(s) with empty fields: Required selection and Required input errors; toast 'Fix the missing or inaccurate values... before fetching file(s)'*

![Clicking a later step only validates step 1: error icon on step 1, Import name Required input](../screenshots/17-data-imports-computed-traits-018-sftp-step1-errors-stepper.jpg)
*Clicking a later step only validates step 1: error icon on step 1, Import name Required input*

#### App Marketplace > SFTP (opened by '+ Add connection')

![App marketplace > SFTP, Description tab: Category Cloud storages, View setup guide](../screenshots/17-data-imports-computed-traits-008-sftp-marketplace-description.jpg)
*App marketplace > SFTP, Description tab: Category Cloud storages, View setup guide*

![SFTP Integrate tab: 'Request access' only (locked), no connection form](../screenshots/17-data-imports-computed-traits-009-sftp-marketplace-integrate-request-access.jpg)
*SFTP Integrate tab: 'Request access' only (locked), no connection form*

#### New event import (CSV), step 1

![New event import (CSV): Import name, Select event, Download sample file, CSV dropzone (under 150 MB), Preview file gate](../screenshots/17-data-imports-computed-traits-023-csv-events-step1.jpg)
*New event import (CSV): Import name, Select event, Download sample file, CSV dropzone (under 150 MB), Preview file gate*

![Select event dropdown: no events, '+ Create new event'](../screenshots/17-data-imports-computed-traits-024-csv-events-select-event-dropdown.jpg)
*Select event dropdown: no events, '+ Create new event'*

![Create new event modal: Event name (required), editable later in Data Management; Cancel/Create (cancelled)](../screenshots/17-data-imports-computed-traits-025-csv-events-create-new-event-modal.jpg)
*Create new event modal: Event name (required), editable later in Data Management; Cancel/Create (cancelled)*

#### New auxiliary data import (CSV), step 1

![New auxiliary data import (CSV): Import name, file dropzone, File preview](../screenshots/17-data-imports-computed-traits-027-csv-aux-data-step1.jpg)
*New auxiliary data import (CSV): Import name, file dropzone, File preview*

![Preview file with no inputs: Required input errors; toast 'Fix the missing or inaccurate values... before previewing file'](../screenshots/17-data-imports-computed-traits-028-csv-aux-data-preview-validation.jpg)
*Preview file with no inputs: Required input errors; toast 'Fix the missing or inaccurate values... before previewing file'*

#### New user import (Amazon S3), steps 1 to 3

![S3 step 1: S3 bucket name, access key, secret key (masked), Region (optional), Folder path](../screenshots/17-data-imports-computed-traits-029-s3-users-step1-top.jpg)
*S3 step 1: S3 bucket name, access key, secret key (masked), Region (optional), Folder path*

![S3 access key tooltip: get the Access Key ID from AWS IAM Console > Users](../screenshots/17-data-imports-computed-traits-030-s3-access-key-tooltip.jpg)
*S3 access key tooltip: get the Access Key ID from AWS IAM Console > Users*

![Region dropdown: 26 AWS regions (US East N. Virginia ... Middle East UAE)](../screenshots/17-data-imports-computed-traits-031-s3-region-dropdown.jpg)
*Region dropdown: 26 AWS regions (US East N. Virginia ... Middle East UAE)*

![S3 step 1 bottom: Folder path, 'Is your file encrypted?', Prefix registered_user_data_, Date time format, Fetch file(s), Next disabled](../screenshots/17-data-imports-computed-traits-032-s3-users-step1-bottom.jpg)
*S3 step 1 bottom: Folder path, 'Is your file encrypted?', Prefix `registered_user_data_`, Date time format, Fetch file(s), Next disabled*

![Step 2 (pre-rendered, revealed locally): Required mapping 'User identifier'; Map columns with search, + Add Column, Upload mapping file](../screenshots/17-data-imports-computed-traits-033-s3-users-step2-mapping.jpg)
*Step 2 (pre-rendered, revealed locally): Required mapping 'User identifier'; Map columns with search, + Add Column, Upload mapping file*

![Step 2 lower: Total columns in file, 'Skip new users during this import', Save as a file segment, Send import status (email blurred)](../screenshots/17-data-imports-computed-traits-034-s3-users-step2-import-behaviour.jpg)
*Step 2 lower: Total columns in file, 'Skip new users during this import', Save as a file segment, Send import status (email blurred)*

![+ Add Column adds a placeholder row (column name, attribute, data type, remove); tooltip on recurring-import placeholder columns](../screenshots/17-data-imports-computed-traits-044-s3-step2-add-column-row.jpg)
*+ Add Column adds a placeholder row (column name, attribute, data type, remove); tooltip on recurring-import placeholder columns*

![Map column to attribute picker: Lifecycle (No. of Sessions, Last Seen, First Seen, LTV, No. of Conversions, User Creation Source...) and + Create new attribute](../screenshots/17-data-imports-computed-traits-045-s3-step2-attribute-dropdown.jpg)
*Map column to attribute picker: Lifecycle (No. of Sessions, Last Seen, First Seen, LTV, No. of Conversions, User Creation Source...) and + Create new attribute*

![Save as a file segment on: File segment name (required), 'File segment can have a maximum of 5M users'](../screenshots/17-data-imports-computed-traits-046-s3-step2-save-as-file-segment.jpg)
*Save as a file segment on: File segment name (required), 'File segment can have a maximum of 5M users'*

![Step 3 (pre-rendered): Import frequency One Time / Periodic; One time import with Start date, Start time, Time zone, Reset to defaults](../screenshots/17-data-imports-computed-traits-035-s3-step3-one-time-specific-date.jpg)
*Step 3 (pre-rendered): Import frequency One Time / Periodic; One time import with Start date, Start time, Time zone, Reset to defaults*

![Periodic Hourly: Repeat every N hours; Ends Never / On / After N occurrences; unique-file-name note](../screenshots/17-data-imports-computed-traits-036-s3-step3-hourly.jpg)
*Periodic Hourly: Repeat every N hours; Ends Never / On / After N occurrences; unique-file-name note*

![Periodic Daily: Repeat every N days](../screenshots/17-data-imports-computed-traits-037-s3-step3-daily.jpg)
*Periodic Daily: Repeat every N days*

![Periodic Weekly: Repeat every N weeks, Repeat on S M T W T F S](../screenshots/17-data-imports-computed-traits-038-s3-step3-weekly.jpg)
*Periodic Weekly: Repeat every N weeks, Repeat on S M T W T F S*

![Periodic Monthly: Repeat every N months on a chosen day; note that short months run on the last day](../screenshots/17-data-imports-computed-traits-039-s3-step3-monthly.jpg)
*Periodic Monthly: Repeat every N months on a chosen day; note that short months run on the last day*

![Monthly 'Repeat on' options: Last day, 1st day, 2nd day ...](../screenshots/17-data-imports-computed-traits-040-s3-step3-monthly-repeat-on-day.jpg)
*Monthly 'Repeat on' options: Last day, 1st day, 2nd day ...*

![Ends 'On': End date and End time](../screenshots/17-data-imports-computed-traits-041-s3-step3-ends-on-date.jpg)
*Ends 'On': End date and End time*

![Time zone: searchable IANA zones with UTC offsets (default Asia/Kolkata UTC+0530)](../screenshots/17-data-imports-computed-traits-042-s3-step3-timezone-dropdown.jpg)
*Time zone: searchable IANA zones with UTC offsets (default Asia/Kolkata UTC+0530)*

![One Time 'As soon as possible': 'The import will be performed as soon as possible'](../screenshots/17-data-imports-computed-traits-043-s3-step3-as-soon-as-possible.jpg)
*One Time 'As soon as possible': 'The import will be performed as soon as possible'*

#### New event import (Amazon S3)

![New event import (S3) step 1: Select event, Download sample file, S3 fields](../screenshots/17-data-imports-computed-traits-047-s3-events-step1.jpg)
*New event import (S3) step 1: Select event, Download sample file, S3 fields*

![Event step 2 (pre-rendered): User identifier and Event time (column, datetime format, UTC / App timezone)](../screenshots/17-data-imports-computed-traits-048-s3-events-step2-required-mapping.jpg)
*Event step 2 (pre-rendered): User identifier and Event time (column, datetime format, UTC / App timezone)*

!['Skip duplicate rows' tooltip: rows with the same value in the selected column are treated as duplicates](../screenshots/17-data-imports-computed-traits-049-s3-events-skip-duplicates-tooltip.jpg)
*'Skip duplicate rows' tooltip: rows with the same value in the selected column are treated as duplicates*

![Skip duplicate rows ticked: 'Column to identify duplicates' picker](../screenshots/17-data-imports-computed-traits-050-s3-events-skip-duplicates-column.jpg)
*Skip duplicate rows ticked: 'Column to identify duplicates' picker*

#### New auxiliary data import (Amazon S3)

![New auxiliary data import (S3) step 1: S3 fields, prefix auxdata_](../screenshots/17-data-imports-computed-traits-051-s3-aux-data-step1.jpg)
*New auxiliary data import (S3) step 1: S3 fields, prefix `auxdata_`*

![Aux step 2 (pre-rendered): Primary key (required) with tooltip; Send import status](../screenshots/17-data-imports-computed-traits-052-s3-aux-data-step2-primary-key.jpg)
*Aux step 2 (pre-rendered): Primary key (required) with tooltip; Send import status*

![Aux step 3: Import frequency plus Data action 'Auxiliary data retention period' (15 days)](../screenshots/17-data-imports-computed-traits-053-s3-aux-data-step3-retention.jpg)
*Aux step 3: Import frequency plus Data action 'Auxiliary data retention period' (15 days)*

![Retention tooltip: how long imported auxiliary data is retained](../screenshots/17-data-imports-computed-traits-054-s3-aux-data-retention-tooltip.jpg)
*Retention tooltip: how long imported auxiliary data is retained*

![Retention options: 1 day, 2 days, 1 week, 15 days, 30 days, 1 month ... 1 year](../screenshots/17-data-imports-computed-traits-055-s3-aux-data-retention-dropdown.jpg)
*Retention options: 1 day, 2 days, 1 week, 15 days, 30 days, 1 month ... 1 year*

#### New event import (SFTP), step 1

![New event import (SFTP) step 1: Select event, SFTP connection, Folder URL, encryption, Prefix (e.g. Event_Name_01311996.csv), Date time format](../screenshots/17-data-imports-computed-traits-070-sftp-events-step1.jpg)
*New event import (SFTP) step 1: Select event, SFTP connection, Folder URL, encryption, Prefix (e.g. `Event_Name_01311996.csv`), Date time format*

#### Computed Traits (paid add-on promo)

![Computed Traits upsell: Learn more, I'm interested, 'paid add-on ... not enabled' banner, benefit tabs](../screenshots/17-data-imports-computed-traits-057-computed-traits-promo-top.jpg)
*Computed Traits upsell: Learn more, I'm interested, 'paid add-on ... not enabled' banner, benefit tabs*

![Hero art: Customer Data > 'Create computation' (Count, Aggregation, First/Last Value, SQL Computation) > new attributes (CLV, AOV, Engagement Score, Preferred Category)](../screenshots/17-data-imports-computed-traits-058-computed-traits-hero-illustration.jpg)
*Hero art: Customer Data > 'Create computation' (Count, Aggregation, First/Last Value, SQL Computation) > new attributes (CLV, AOV, Engagement Score, Preferred Category)*

![Tab 'Effortless Attribute Creation': built-in aggregation functions or advanced SQL](../screenshots/17-data-imports-computed-traits-059-computed-traits-tab-attribute-creation.jpg)
*Tab 'Effortless Attribute Creation': built-in aggregation functions or advanced SQL*

![Builder art: steps Basic details, Define Computed trait, Scheduling; Type cards Count, Aggregation, First/Last Value, SQL Computation; Configuration](../screenshots/17-data-imports-computed-traits-060-computed-traits-builder-illustration.jpg)
*Builder art: steps Basic details, Define Computed trait, Scheduling; Type cards Count, Aggregation, First/Last Value, SQL Computation; Configuration*

![Tab 'Hyper-Personalized Engagement': 'Total Savings' trait (Sum over discounts, cashbacks, reward points, free shipping) used in a message](../screenshots/17-data-imports-computed-traits-061-computed-traits-tab-hyper-personalized.jpg)
*Tab 'Hyper-Personalized Engagement': 'Total Savings' trait (Sum over discounts, cashbacks, reward points, free shipping) used in a message*

![Tab 'Granular Targeting': segment 'At-Risk Sci-Fi Binge Watchers' built from traits (Top Watched Genre, Churn Score > 15%, Unwatched Recommended Shows > 10)](../screenshots/17-data-imports-computed-traits-062-computed-traits-tab-granular-targeting.jpg)
*Tab 'Granular Targeting': segment 'At-Risk Sci-Fi Binge Watchers' built from traits (Top Watched Genre, Churn Score > 15%, Unwatched Recommended Shows > 10)*

![Tab 'Enrich Customer Profiles': profile with traits such as Average Transaction Value, Total Annual Card Spend, Churn Likelihood, Top Spend Category](../screenshots/17-data-imports-computed-traits-063-computed-traits-tab-enrich-profiles.jpg)
*Tab 'Enrich Customer Profiles': profile with traits such as Average Transaction Value, Total Annual Card Spend, Churn Likelihood, Top Spend Category*

![Tab 'Optimize Resources': no engineering dependency](../screenshots/17-data-imports-computed-traits-064-computed-traits-tab-optimize-resources.jpg)
*Tab 'Optimize Resources': no engineering dependency*

!['Request Computed Traits' modal: Subject 'Enable early access for computed traits - (workspace name)', message (blurred, contains the user's email), Submit (not clicked)](../screenshots/17-data-imports-computed-traits-065-computed-traits-request-modal.jpg)
*'Request Computed Traits' modal: Subject 'Enable early access for computed traits - (workspace name)', message (blurred, contains the user's email), Submit (not clicked)*

#### Data warehouse import sources (App Marketplace: Snowflake, BigQuery, Databricks)

![App marketplace > Snowflake, Description tab: Category Data warehouses](../screenshots/17-data-imports-computed-traits-066-snowflake-marketplace-description.jpg)
*App marketplace > Snowflake, Description tab: Category Data warehouses*

![Snowflake Integrate: 'Request access' only (locked)](../screenshots/17-data-imports-computed-traits-067-snowflake-integrate-request-access.jpg)
*Snowflake Integrate: 'Request access' only (locked)*

![BigQuery Integrate: 'Request access' only (locked)](../screenshots/17-data-imports-computed-traits-068-bigquery-integrate-request-access.jpg)
*BigQuery Integrate: 'Request access' only (locked)*

![Databricks Integrate: 'Request access' only (locked)](../screenshots/17-data-imports-computed-traits-069-databricks-integrate-request-access.jpg)
*Databricks Integrate: 'Request access' only (locked)*
