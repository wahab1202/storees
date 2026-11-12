## 21. Settings > Accounts: General, API Keys, MCP, Team Management

Storees has the raw pieces of MoEngage's Account section: a project ID and SDK key with copy, admin-only team management with per-user TOTP, and custom roles whose server-side contact masking MoEngage's matrix doesn't offer. But it spreads them across a flat settings bar and leaves several (event mapping, the API-key list) to platform super admins. It has no workspace time zone or editable currency, no tenant API-keys page, no key scopes, no email invites or member statuses, no MCP server, and its roles carry two data toggles instead of a module-by-action matrix. Two P0 security defects sit in this area: the social-login callback issues a session token for any email without authenticating the caller, and the server-only bulk import APIs accept the public key that every storefront embeds.

### MoEngage overview

Settings > Account holds the workspace basics, API credentials, AI-app access and team access control.

- **General Settings:** read-only Workspace ID (the SDK app id) with copy and a tooltip; a searchable workspace time zone (591 IANA zones); and Goal mapping (conversion event, then revenue attribute and currency, which stay disabled until a goal is picked). Goal mapping feeds LTV and the conversion and revenue trends on Key Metrics. A banner says changes take up to 30 minutes to apply; one explicit Save.
- **API Keys:**
  - Five auto-provisioned legacy Basic Auth keys, one per API family (Data, Push, Campaign report/..., Inform, Personalize), masked with reveal and copy.
  - Row menu: View key details, Regenerate, Edit, Archive. An archived-keys drawer keeps the last 10.
  - Create drawer: Basic Auth, OAuth 2.0 (expiry in minutes) or AWS STS (assumed-role ARNs), each with a tri-state scope tree (34 scopes in 8 groups for Basic Auth, all pre-checked).
- **MCP:** a hosted server (`https://mcp.moengage.com`) with MoEngage OAuth sign-in that respects role permissions. Setup tabs for Claude, ChatGPT, Cursor and Others. The public docs behind "Know more" list 52 tools and guardrails (drafts only, PII masking, role-gated tools, range limits).
- **Team Management:**
  - Members: search, Role and Status filters (Joined, Pending, Access revoked), bulk checkboxes, actions gated by role hierarchy, and a multi-email invite modal.
  - Roles: five default roles (Admin, Manager, Developer, Analyst, Marketer) and a read-only matrix of 27 components and 88 permissions, with a details panel and a "View users" link.
- **Security / login settings:** the route exists but is Admin-only; it redirected this user with a no-permission toast.
- **Entry points:** a searchable, grouped Settings flyout from the gear icon, and a Settings Home card grid.

**Capture caveats:** the account appears to hold the Developer role in a Test workspace with no events. Security/login settings, custom roles, the Teams tab, member row actions and invite step 2 could not be seen. Revenue attribute and Currency were disabled; the 119 currencies were read from component props. The MCP tool list and guardrails come from MoEngage's public docs, not the dashboard. Nothing was saved, revealed, created or invited.

| Page visited | URL path |
|---|---|
| General Settings | `/v4/settings-v2/accounts/general` |
| API Keys | `/v4/settings-v2/accounts/api-keys` |
| MCP | `/v4/settings-v2/accounts/mcp` (tabs via `?tab=chatgpt`, `cursor`, `others`) |
| Team Management: Members | `/v4/settings-v2/accounts/team-management` (also `/team-management/members`) |
| Team Management: Roles | `/v4/settings-v2/accounts/team-management/roles` |
| Security / login settings (role-gated) | `/v4/settings-v2/accounts/security` (redirects to `/v4/campaigns/all` with a toast) |
| Settings entry points (flyout and Settings Home) | `/v4/settings-v2` (flyout: hover the sidebar gear) |

### Storees counterpart

Storees has no Account section. The equivalents are tabs on the Settings bar (`packages/frontend/src/app/(dashboard)/settings/layout.tsx`, up to 11 tabs) plus two super-admin screens.

- **SDK & Integration** (`/settings`, `settings/page.tsx`). The page opens on its Channels sub-section; the **Setup** sub-section holds:
  - a Project card (Project ID, API URL, Domain) and an SDK connection status;
  - the API key block: the newest public key with Copy, or "API Key Missing / Generate API Key", with the secret shown once after generating;
  - integration snippets (script tag, Shopify custom pixel, NPM, REST cURL) and recommended and auto-tracked events.
  - The **AI** sub-section is a bring-your-own LLM key.
  - Backend: `packages/backend/src/routes/v1ApiKeys.ts` (`/api/api-keys`, `/api/api-keys/sdk-config`), `packages/backend/src/routes/ai.ts`.
- **Project** (`settings/project/page.tsx`): dealer-scoped access toggle, email sending domain, frequency caps. Backend: `packages/backend/src/routes/v1Onboarding.ts`.
- **Account** and **Security** (`settings/account/page.tsx`, `settings/security/page.tsx`): profile, password and self-service TOTP 2FA. Backend: `packages/backend/src/routes/auth.ts`.
- **Team** (`settings/team/page.tsx`): admin-only member management with temporary passwords. Backend: `packages/backend/src/routes/adminUsers.ts`.
- **Roles** (`settings/roles/page.tsx`): admin-only custom roles with two data permissions. Backend: `packages/backend/src/routes/roles.ts`, `packages/backend/src/middleware/capabilities.ts`.
- **Super-admin only:** Event Mapping (`packages/frontend/src/app/(dashboard)/event-sources/mapping/page.tsx`, `packages/backend/src/routes/eventMapping.ts`) maps the purchase event and nine other meanings; Projects (`packages/frontend/src/app/(dashboard)/projects/page.tsx`) holds the full, masked API-key list.
- **Auth plumbing:** `packages/backend/src/middleware/` (`apiKeyAuth.ts`, `requireAuth.ts`, `projectId.ts`, `membership.ts`, `agentScope.ts`) and NextAuth in `packages/frontend/src/lib/auth.ts`.
- **Not present:** workspace time zone, a currency setting, a tenant API-keys page, key scopes, email invites, member statuses, a permission matrix, SSO and MCP.

Short paths in the table:

- `settings/…`, `projects/…`, `campaigns/…` and `event-sources/…` (and `mapping/page.tsx`, short for `event-sources/mapping/page.tsx`) are under `packages/frontend/src/app/(dashboard)/`.
- `Sidebar.tsx` is in `packages/frontend/src/components/layout/`, `StructuredFlowBuilder.tsx` in `packages/frontend/src/components/flows/`, `useProjects.ts` in `packages/frontend/src/hooks/`, and `frontend lib/…` in `packages/frontend/src/lib/`.
- `shared/src/types.ts` is `packages/shared/src/types.ts`; `docs/…` is relative to the repo root.
- Every other `.ts` file is under `packages/backend/src/` (`routes/`, `middleware/`, `services/`, `workers/`, `db/`, `lib/`, `__tests__/`).

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| General Settings | Workspace ID: read-only, copy, tooltip; repeated in the API Keys header | Read-only Workspace ID with copy and an info tooltip ("developers use it for SDK integration"); also in the API Keys header | ✅ Full | Setup's Project card shows Project ID, API URL and Domain (`settings/page.tsx:159-166`). The SDK public key, which `Storees('init', { apiKey })` takes, sits below it with Copy and a "safe to embed" hint (`settings/page.tsx:86-90, 966-982`). Project ID itself is plain text (`Field`, :872-879) | Polish only: copy icon and tooltip on Project ID. Settings opens on Channels (`settings/page.tsx:57`), so Setup is one extra click. | — | — |
| General Settings | Workspace time zone (one searchable IANA zone) | Searchable single-select of 591 IANA zones with UTC offsets; one workspace-level zone | ❌ Missing | No time zone on `projects` (`db/schema.ts:20-70`) or in any project route. Only per-campaign `scheduleTimezone` from 10 hard-coded zones (`schema.ts:443`; `campaigns/create/page.tsx:3161`). Fixed-time flows fire in UTC (`flowFixedTimeScheduler.ts:24-30`; builder label "Time (UTC)", `StructuredFlowBuilder.tsx:1402`) though the shared type says "local to project timezone" (`shared/src/types.ts:582-585`). Daily charts bucket by `timestamp::date` (`dashboard.ts:385-408`); no `AT TIME ZONE` anywhere | Add a project time zone with a searchable picker, defaulted at install from Shopify's `iana_timezone` (`/shop.json` is already fetched, `shopifyService.ts:241-252`). Apply it to fixed-time flows, schedule defaults and dashboard day buckets. Today a "09:00" fixed-time flow fires at 14:30 IST. | P1 | M |
| General Settings | Goal mapping: conversion goal | Searchable event picker; feeds LTV and the conversion and revenue trends on Key Metrics | 🟡 Partial | Event Mapping assigns Purchase and nine other meanings from received events (`mapping/page.tsx:31-46`; `eventMapping.ts:322, 560`); saved purchase events drive LTV and revenue (`projectVocabulary.ts`; `customerAggregateWorker.ts:324-347`). Super-admin only: nav item (`Sidebar.tsx:68`), page guard (`mapping/page.tsx:139`), `requireSuperAdmin()` on every route (`eventMapping.ts:322, 449, 465, 560`). Per-campaign and per-flow goals exist separately (`schema.ts:333, 432`) | Merchants can't see or set their own conversion goal. Small impact on Shopify (the ecommerce pack maps `order_placed`), larger for API-integrated brands. At least show it read-only to project admins. | P3 | S |
| General Settings | Goal mapping: revenue attribute | Dropdown of the conversion event's attributes; disabled until a goal is chosen | 🟡 Partial | Revenue property is `amountKey`, default `total` (`projectVocabulary.ts:174`), overridable only by connector config `mapping.fields.order.amount` (:288, 336); aggregation reads `props[amountKey] ?? total ?? amount` (`customerAggregateWorker.ts:346-347`). No screen edits it: Event Mapping has event boxes only, and the connector dialog has no field mapping | No UI to choose the revenue property. Add a property picker under Purchase on the mapping screen. | P3 | S |
| General Settings | Goal mapping: currency (one ISO currency per workspace) | 119 ISO currencies ("US Dollar - USD" to "Indian Rupee - INR"); one per workspace, used for revenue and LTV | 🟡 Partial | `projects.currency` (ISO 4217, default `INR`; `schema.ts:41-42`, migration `0088_project_currency.sql`) formats money in campaign and flow emails (`campaignService.ts:785, 958`; `flowExecutor.ts:642`; `emailLayoutService.ts:130`; `productBlockRenderer.ts:65-76`). Nothing writes it: no PATCH route, no field on `settings/project/page.tsx`, and the Shopify install drops the shop's currency (`fetchShopInfo` keeps only name, email and owner, `shopifyService.ts:241-252`) | Any non-INR Shopify store (self-serve trials are open) gets ₹ prices in its emails and can't change it. Set it from `/shop.json` `currency` at install and add a select on Project settings. | P1 | S |
| General Settings | Propagation notice and explicit Save | Banner: changes take up to ~30 minutes; Key Metrics conversions appear after 24 hours. One Save | 🟡 Partial | No General page to carry it. Settings cards save explicitly (e.g. "Save caps", `settings/project/page.tsx:130, 187-192`). Event Mapping goes further but is super-admin only: a ₹ impact preview, type-the-project-name confirmation and a "Rebuilding order history" banner that locks Save (`mapping/page.tsx:205-252, 552-576`; `eventMapping.ts:465-520`) | Reuse the Event Mapping preview pattern on tenant settings that move reported numbers (time zone, currency, goal). | P3 | S |
| API Keys | API key inventory: search, name, auth type, sortable created-on, masked key with reveal and copy, row menu, archived link | "Active API keys (N)" table with those columns; header shows Workspace ID with copy and "+ Create new key" | 🟡 Partial | Tenants see only the newest active public key, unmasked, with Copy (`settings/page.tsx:966-982`, from `GET /api/api-keys/sdk-config`, `v1ApiKeys.ts:110-152`). A full list (masked key, reveal, copy, status, permission chips, rate, last used) is on the super-admin Projects page only (`projects/page.tsx:57-145`, guard :147-151; `GET /api/api-keys`, `v1ApiKeys.ts:53-76`). No search or sort. Key routes have no role gate: `requireProjectId` only (`v1ApiKeys.ts:11`), mounted with `requireAuth` (`index.ts:210`) | Build a tenant API Keys page from the super-admin `ApiKeysSection`. Gate the routes to project admins: today any signed-in member, including dealer agents, can list and mint keys. | P1 | S |
| API Keys | Auto-provisioned per-service keys (Data, Push, Campaign report/..., Inform, Personalize) | Five legacy Basic Auth keys with purpose tooltips and a "legacy keys can't be regenerated" warning | 🟡 Partial | One key pair (public `sk_live_`, secret `ss_live_`, read+write, 1000/min) is created only by `POST /api/onboarding/projects` (`v1Onboarding.ts:345-356`). The Shopify self-serve install (`integrations.ts:95-109`) and `/api/wizard/complete` (`wizard.ts:165-170`) create projects with no key, so Setup shows "API Key Missing" and the Shopify pixel snippet falls back to `YOUR_API_KEY` (`settings/page.tsx:68, 124, 941-963`). One key serves all of `/api/v1` | Create a key at every project creation path. Per-family keys are unnecessary once scopes exist. | P2 | S |
| API Keys | Key row actions: View, Regenerate, Edit, Archive | Row kebab with all four; Edit and Archive disabled for legacy keys | 🟡 Partial | Backend only: `DELETE /api/api-keys/:id` soft-revokes (`is_active=false`, `v1ApiKeys.ts:81-104`); no UI calls it (`settings/page.tsx:918-923`; `useProjects.ts:73-79`). It never calls `invalidateApiKeyCache` (`apiKeyAuth.ts:52-58`, called nowhere), so a revoked key keeps authenticating from the Redis cache for up to 5 minutes (`apiKeyAuth.ts:10, 232-254`). No rotate or rename | Add revoke (with a cache purge), rotate-secret and rename in the UI. Rotation matters because the public key sits in every storefront's page source. | P1 | S |
| API Keys | View key details drawer | Drawer: key name, masked key with reveal and copy, authentication type | 🟡 Partial | Super-admin list shows name, status, permission chips, key masked to first 12 / last 6 with reveal and copy, rate, last used, created (`projects/page.tsx:93-140`). Tenants see only the unmasked public key (`settings/page.tsx:966-982`) | Add tenant-facing key details, masked by default. | P2 | S |
| API Keys | Archived keys (separate list, up to 10, Archived on) | Drawer with Key name, Auth type, Archived on (sortable), Key; empty state | 🟡 Partial | Revoked keys stay in `api_keys` with `is_active=false` (`v1ApiKeys.ts:95-97`) and show a red "Revoked" badge in the super-admin list (`projects/page.tsx:102-106`). No `revoked_at` column (`schema.ts:574-590`), no separate view, nothing tenant-facing | Add `revoked_at` and an Archived filter on the keys page. | P3 | S |
| API Keys | Create new key: named key, Basic Auth default | Drawer: Key name\*, Authentication type, Select APIs for access\*, Cancel / Create key | 🟡 Partial | `POST /api/api-keys` takes only `{ name }` and returns the secret once (`v1ApiKeys.ts:16-48`). The only UI caller is "Generate API Key", shown when the project has no key and always named "Default" (`settings/page.tsx:918-930, 941-963`); it then shows the secret once with Copy (:983-1001). A second, named key can't be created from the UI | Add "Create key" with a name (scopes later). Needed before the P0 below can ship, since tenants need a way to obtain a secret. | P1 | S |
| API Keys | Server APIs require the secret, not just the public identifier | Data APIs authenticate with the Workspace ID plus a secret key; the SDK identifier alone can't call server APIs | ❌ Missing | The secret is generated and stored hashed (`apiKeyAuth.ts:14-24`), and the Quick Start cURLs and docs present it as required for server calls (`v1Onboarding.ts:212-247`; `docs/STOREES_SDK_INTEGRATION.md:33-37`). But `requireApiKeyAuth`, the only middleware that checks `X-API-Secret` and the IP allowlist (`apiKeyAuth.ts:64-193`), is mounted nowhere (only a test mock references it). Every `/api/v1` router uses `requirePublicKeyAuth()`, including the server-only bulk imports `/import/customers`, `/orders`, `/products`, `/dealers` (`v1Import.ts:33, 57, 154, 339, 370`). The public key ships in every storefront (`settings/page.tsx:79-91`) and `/api/v1` CORS is `*` (`index.ts:116`) | Require the secret on `/api/v1/import/*` (and any future server API); keep public-key auth for SDK ingestion only. Today anyone who views a store's page source can bulk-write customers and consent flags, historical orders (revenue, LTV), dealers, and product titles, images and prices that render in the brand's emails. | P0 | S |
| API Keys | Create new key: OAuth 2.0 (short-lived tokens) | OAuth 2.0 type with "Expiry time (in minutes)\*" (default 15) and a smaller scope tree | ❌ Missing | No token endpoint or OAuth authorization server; Storees is only an OAuth client (Shopify `client_credentials`, `shopifyService.ts:323-346`; Google and GitHub via NextAuth). `api_keys.expires_at` is enforced (`apiKeyAuth.ts:89, 134, 239, 267`) but nothing sets it | No short-lived credentials for integrations. A cheap first step is letting a key carry an expiry. | P3 | M |
| API Keys | Create new key: AWS STS Auth (expiry and ARN list) | Expiry plus one or more assumed-role ARNs ("+ Add value"); only scope is Channel Configuration > Setup & Manage | ❌ Missing | No STS or IAM-role auth; the AWS SDK is used only for S3 storage (`storageService.ts:3`). Keys are static pairs (`apiKeyAuth.ts:14-19`) | Matters only for AWS-native enterprise integrations, not Shopify D2C. | P3 | M |
| API Keys | Per-key API scopes (34 scopes in 8 groups, tri-state tree) | Required scope tree, all pre-checked, with Select all / De-select all | 🟡 Partial | `api_keys.permissions` holds `read` / `write` / `admin` (`schema.ts:580`) and the middlewares check it (`apiKeyAuth.ts:106, 157, 244, 272`). But every key is created with `['read','write']` (`v1ApiKeys.ts:26`; `v1Onboarding.ts:354`), the public-key path checks only `write`, and there are no per-endpoint scopes or UI | Add per-API scopes chosen at creation (e.g. `events:write`, `import:write`, `inapp:read`). Default new keys to SDK ingestion only, not MoEngage's all-checked tree. | P2 | M |
| API Keys | Data API scopes: Track/Get/Merge/Delete User, Create Events, Bulk Import, GDPR Delete, File Imports, Track Device, Email Double Opt-in | Ten Data API operations | 🟡 Partial | API-key endpoints: Track User (`POST /api/v1/customers`, `/identify`: `v1Events.ts:563, 989`), Create Events (`/events`, `/events/batch` up to 1000: :114, 274), Bulk Import (`v1Import.ts:57-370`), opt-in capture (`v1OptIn.ts:81`), web device id (`/id`, `deviceId.ts:26`). Erasure exists but not as an API: admin-JWT `GET /api/customers/:id/data-export` and `POST /:id/erase` (`customers.ts:922, 945`) and Shopify's `customers/redact` webhook (`webhooks.ts:248-264`). No Get User, Merge User, file-upload import or email double opt-in | Add API-key get, merge and erase endpoints so non-Shopify brands can automate DPDP/GDPR requests. Shopify stores already get erasure through the compliance webhook. | P2 | M |
| API Keys | Segmentation API scopes | Server-to-server custom segments (filter or file), archive/unarchive, view, user activity | ❌ Missing | Segment create, update, delete and evaluate are dashboard routes behind `requireAuth` and `requireRole('admin')` (`segments.ts:187-319`; `index.ts:193`). No `/api/v1` router serves segments | No server-to-server segment API. | P3 | M |
| API Keys | Campaign report and Dashboard & Analyze scopes | Download campaign or Inform reports for a period; run analyses | ❌ Missing | Campaign analytics (`campaignAnalyticsService.ts`), dashboard and analytics are JWT-only (`index.ts:194, 200, 221`). Outbound webhooks emit only segment events (`segmentService.ts:170` is the sole `emitWebhookEvent` caller) | BI teams can't pull campaign stats. Add a read-only stats endpoint, or emit message events to outbound webhooks. | P2 | M |
| API Keys | Campaigns, Inform, Offerings, Decision Policy and Channel Configuration scopes | Campaign view, create, publish; Inform send and manage; Offerings; Decision Policy; Channel Configuration incl. message templates | ❌ Missing | Campaigns, templates, senders, WhatsApp and channel config are JWT-only (`index.ts:198-205`). No `/api/v1` endpoint sends or manages messages; the only API route to a send is an event that triggers a flow | No public API to manage or send messages. Low priority for Shopify D2C, but an MCP server would need it. | P3 | L |
| API Keys | API documentation links ("Know more", "View API documentation here") | Header link to the API-key docs; the create drawer links to the API reference | 🟡 Partial | Copyable snippets beside the key: script tag, Shopify custom pixel, NPM, REST cURL (`settings/page.tsx:79-131, 203-271`; `frontend lib/shopifyPixel.ts`). Onboarding returns Quick Start cURLs (`v1Onboarding.ts:212-249`). No hosted API reference or docs link in the UI; guides live only in the repo (`docs/STOREES_INTEGRATION_GUIDE.md`, `docs/STOREES_SDK_INTEGRATION.md`) | Publish an API reference (events, customers, import, opt-in) and link it from Settings. | P2 | M |
| MCP | Hosted MCP server with OAuth sign-in that respects roles | `https://mcp.moengage.com` with copy; MoEngage OAuth sign-in; "actions always respect your existing role-based permissions"; badged New | ❌ Missing | No MCP server, dependency or doc in any package or in `docs/` (searched mcp, modelcontextprotocol, mcpServers). No OAuth authorization server for third-party clients; sign-in is NextAuth credentials, Google and GitHub (`frontend lib/auth.ts:9-18`) | Claude, ChatGPT and Cursor can't work with a Storees workspace. | P2 | L |
| MCP | Client setup tabs (Claude, ChatGPT, Cursor, Others) | Per-client tab: server URL with copy, four steps, a CTA (Install connector, View setup guide, Add to Cursor), copyable `mcpServers` JSON; tab kept in `?tab=` | ❌ Missing | No "connect AI apps" page. Settings > SDK & Integration > AI is the reverse direction: a bring-your-own LLM key that Storees calls (`settings/page.tsx:670-870`; `ai.ts:235-416`) | Easy to build once a server exists. | P2 | S |
| MCP | MCP tool catalog (52 tools) | Campaign drafts, content blocks, segments (create, count, validate, membership), flows (read, analytics, status), dashboards, campaign stats, Analyze runs, event and attribute catalog, feedback | ❌ Missing | No tool layer for outside apps. In-app features a server could wrap: NL to segment (`POST /api/ai/segment`, `ai.ts:23-44`; `aiSegmentService.ts`), copywriter and variations (`ai.ts:83, 166`), WhatsApp template copilot (:129), email layout (:49), next best action (:154) | Start with a mostly read-only set: list/get segments, campaigns and flows; campaign stats; segment count; draft creation. | P2 | L |
| MCP | MCP guardrails | Drafts only; create only Push and Email; PII hidden or masked; per-user OAuth picking environment, workspace and role; 30-day sessions, 7-day idle; role-gated tools; range limits | ❌ Missing | No MCP layer. Reusable pieces: server-side contact masking by role (`lib/pii.ts`; `capabilities.ts:82-126`), role gates (`agentScope.ts:59-66`), draft statuses on flows and campaigns (`schema.ts:336, 414`). No Test/Live environment concept | Design MCP drafts-only from day one, with role-based PII masking. | P2 | M |
| Team Management: Members | Members list (avatar, name and email, status, role, action menu) | "Members(N)" table with avatar initial, name and email, Status badge, Role, Action kebab, select-all and row checkboxes | 🟡 Partial | Settings > Team: name with "(you)", email, inline Role select, Permissions select (custom role), Dealer select, 2FA badge, Reset password and Remove (`settings/team/page.tsx:255-357`; `GET /api/admin-users`, `adminUsers.ts:22-50`). It lists only users whose home project is this one (`adminUsers.ts:44`), so members linked to a second project through `user_projects` (`superAdmin.ts:102-113`) don't appear and can't be edited or removed (`adminUsers.ts:164, 252`). No status column or avatar | List every project member (join `user_projects`) and add a status column. | P2 | S |
| Team Management: Members | Search members and bulk-select checkboxes | "Search member(s)" plus select-all and row checkboxes | ❌ Missing | No search input or checkboxes (`settings/team/page.tsx:154-357`); `GET /api/admin-users` takes no search or filter parameters (`adminUsers.ts:22-50`) | Low impact for small D2C teams. | P3 | S |
| Team Management: Members | Filter members by Role and Status | Popover with Role and Status, Reset all, Cancel / Apply; a dot marks an active filter | ❌ Missing | No filter UI or API parameters (`settings/team/page.tsx`; `adminUsers.ts:22-50`) | Add once member statuses and more roles exist. | P3 | S |
| Team Management: Members | Member status lifecycle (Joined / Pending / Access revoked) with immediate revocation | Invitees stay Pending until they join; revoked members keep a record | ❌ Missing | Accounts are live on creation with `emailVerified` forced true (`adminUsers.ts:114-125`); Remove is a hard delete (:239-262). Sessions are a 24-hour backend JWT carrying role and agentId (`authService.ts:7-8, 16-25`), verified with no database lookup (`requireAuth.ts:13-48`); NextAuth copies the role only at sign-in (`frontend lib/auth.ts:127-139`). Membership is checked only when `ENFORCE_PROJECT_MEMBERSHIP=true` (`membership.ts:18-20, 76`), and the JWT's home project always passes (:87). A removed or demoted member keeps their old access for up to 24 hours, though the Remove dialog says "They will lose access immediately" (`settings/team/page.tsx:145`) | Add invited, active and revoked statuses. Make removal and role changes take effect at once (token version or a per-request user check). | P1 | M |
| Team Management: Members | Role-hierarchy action gating (graded Team Members permissions; disabled actions with tooltip) | Unavailable actions are disabled with "You can't perform this action". Team permissions: View, Create & Manage, Create & Manage all roles, Download users | 🟡 Partial | Team and Roles are all-or-nothing admin screens: `requireRole('admin')` on both routers (`adminUsers.ts:15`; `roles.ts:13`) and admin-only tabs (`settings/layout.tsx:24-26`). Self-protection exists: you can't change your own role or delete yourself (`adminUsers.ts:172-174, 244-246`; UI disables them, `settings/team/page.tsx:283, 344`). No view-only team access, no "manage lower roles only", no member export | Add Team permissions (view, manage, manage all roles, export) to the permission model. | P2 | M |
| Team Management: Members | Invite members by email (several addresses, then role) | "+ Invite Member" modal takes several emails (Enter or comma), then Next; step 2 probably assigns the role; invitees show as Pending | 🟡 Partial | "Invite member" opens an inline form: Name\*, Email\*, Temporary password\* (8+ characters), Role\*, Permission role, and Dealer for dealer roles. It creates a live account immediately and tells the admin to "Share the email and temporary password with the user" (`settings/team/page.tsx:172-241`; `adminUsers.ts:57-149`). No invitation email, accept link or forced password change. `admin_users.email` is unique platform-wide (`schema.ts:1056`), so adding someone who already has a Storees login (e.g. an agency user) fails with 409 (`adminUsers.ts:102-110`). Reset-password tokens and a branded email already exist (`auth.ts:215-323`) | Email invites for several addresses with a set-password link and a Pending status; allow adding existing users to a project. | P1 | M |
| Team Management: Roles | Default role set (Admin, Manager, Developer, Analyst, Marketer) | Five "Default" roles, last updated by MoEngage, from Admin (everything) to Analyst (view, reports and segment queries) | 🟡 Partial | Base roles are `admin`, `manager`, `agent` (`authService.ts:14`). Manager and agent are B2B dealer-scoping roles offered only when dealer access is on (`settings/team/page.tsx:186-188`; `agentScope.ts:19-45`); otherwise every member is an Admin. `roles.is_system` is reserved for presets, but none are seeded (`schema.ts:1078-1090`) | Ship functional presets (Marketer, read-only Analyst, Developer, Support) once action permissions exist. | P1 | M |
| Team Management: Roles | Role details panel and "View users" link | Details: name, type, description, last updated on and by, user count; "View users" opens Members filtered by the role | 🟡 Partial | Roles table shows name, description, restriction chips and member count (`settings/roles/page.tsx:181-237`; `roles.ts:30-54`). No role type, last-updated fields or link to the members holding it | Add a "View members" link and audit fields. | P3 | S |
| Team Management: Roles | Permission matrix (27 components, 88 permissions) | Read-only component × permission checkboxes, e.g. Campaigns: View; Create & Manage; Create, Manage & Publish; Download | 🟡 Partial | Custom roles carry two permissions, "See contact details" and "Export customer data" (`settings/roles/page.tsx:47-51, 128-146`; `capabilities.ts:15-126`). A `screens` list is stored, always written as `'*'` and read by nothing (`roles/page.tsx:50`; `roles.ts:16-27`). All else follows the base role: admin-only gates on flows (`flows.ts:42`), segment writes (`segments.ts:187-319`), logs, brand and billing subscribe. `campaigns.ts` and `templates.ts` have no role check, so any member can create and send campaigns | Add module × action permissions (view, edit, publish, download), enforced on the server. | P1 | L |
| Team Management: Roles | How roles differ: create vs publish vs download | Developer creates campaigns but can't publish or download; Analyst is view, run and download; Marketer has no channel setup or landing-page publish | 🟡 Partial | One split only. Non-admins (dealer manager and agent) lose flows, segment writes, logs, brand and billing (`flows.ts:42`; `segments.ts:187-319`; `logs.ts:15`; `brandKit.ts:38, 62`; `billing.ts:18`), the Templates, Flows, Event Sources, Debugger and Logs nav items (`Sidebar.tsx:54-70`), and every Settings tab except Account and Security (`settings/layout.tsx:12-27`). They keep Campaigns with full send rights (`Sidebar.tsx:59`). No "create but not publish", read-only analyst or approval step | Separate send/publish rights from edit rights, optionally with an approval step. | P1 | M |
| Team Management: Roles | Custom roles | Not shown to this user (no "Create role"); "Role type: Default" implies custom roles exist on other plans or roles | 🟡 Partial | Project admins create, edit and delete roles (name, description, two toggles) and assign them per member, with holder counts (`settings/roles/page.tsx`; `roles.ts:30-159`; `settings/team/page.tsx:191-203, 294-306`). Deleting a role reverts holders to full access; edits apply within 30 seconds (`capabilities.ts:50-80`). Self-serve, but a role can express only two data permissions | Competitive once the permission matrix exists; the role builder UI is already in place. | P2 | M |
| Team Management: Roles | Teams (business units) | Settings Home says "create teams" and campaign calls carry `team_ids`, but no Teams tab for this user | ❌ Missing | No team or business-unit model; the access tables are `admin_users`, `user_projects` and `roles`. Closest is dealer-scoped access (`agents` hierarchy plus `customers.agent_id`; `agentScope.ts:19-162`; `settings/dealers/page.tsx`), which scopes customer data, not ownership of campaigns or content | Low relevance for Shopify D2C; separate projects already cover multi-brand setups. | P3 | L |
| Security / login settings | Login security enforced on every sign-in path (2FA can't be bypassed; social-login callback authenticated) | Account-level login settings under "Security Settings: Setup & manage" (Admin only) | 🟡 Partial | Password login enforces TOTP with a 5-minute pending token and is rate-limited (`auth.ts:96-160`). But NextAuth sends Google and GitHub sign-ins to `POST /api/auth/oauth-callback` (`frontend lib/auth.ts:95-108`), a public route with no shared secret or provider-token check (`auth.ts:423-507`; mounted unguarded, `index.ts:162`). Given any `email`, it finds that user or creates one (bypassing the closed registration at `auth.ts:31-36`), links the caller's provider id and returns a full 24-hour JWT without checking `totpEnabled`, with `isSuperAdmin` set if the email belongs to a platform operator. No rate limit. Shopify install logins also skip TOTP (`integrations.ts:187`) | Authenticate the callback (a shared server secret from the NextAuth server, or verify the provider's ID token) and add the TOTP step to social and Shopify logins. As shipped, anyone who knows a member's email, including a super admin's, can get a session as that member. | P0 | S |
| Security / login settings | Workspace login policy (require 2FA for all, session, IP and password policy) | Role-gated login settings page; probably 2FA enforcement and similar; non-Admins get "Your role doesn't have permission to access login settings" | 🟡 Partial | Users turn on TOTP themselves in Settings > Security (QR and secret, verify to enable, code to disable: `settings/security/page.tsx`; `auth.ts:327-419`). The Team table shows each member's 2FA state (`settings/team/page.tsx:325-331`). No workspace policy (searched enforce2fa, require2fa, mfa_required), no configurable session or idle timeout (fixed 24-hour JWT), no user IP allowlist, and the password rule is 8+ characters | Add an admin setting "Require 2FA for all members" and a session timeout. | P2 | M |
| Security / login settings | SSO / SAML login | Expected on the locked Security page; not visible | ❌ Missing | No saml, sso, oidc, openid or scim anywhere in the backend or frontend. Login is email and password, Google, GitHub (`frontend lib/auth.ts:9-18`) and Shopify install | Only enterprise buyers in this market ask for it. | P3 | L |
| Settings entry points | Settings navigation with grouped sections and search | Gear flyout with type-to-filter search, a Settings Home link and collapsible groups (Account, Analytics & Segmentation, Data, Channels, Advanced, Reports and Alerts, Miscellaneous) | 🟡 Partial | One Settings sidebar item (`Sidebar.tsx:78`) opens a flat bar of up to 11 tabs (`settings/layout.tsx:12-27, 44-64`). The first tab hides a second Setup / Channels / AI switch (`settings/page.tsx:47-51, 141-154`). No grouping or search | Group settings into a left rail (Account, Channels, Data, Developer and AI) with search. | P2 | S |
| Settings entry points | Settings Home card grid | Cards with icon, title and one-line description, grouped like the flyout | ❌ Missing | `/settings` lands straight in SDK & Integration, on Channels (`settings/page.tsx:57, 337`). No overview page | A landing grid helps discoverability; low priority. | P3 | S |

### Storees-only strengths

- **Role-based masking of contact data, enforced on the server.**
  - Where: `maskEmail` / `maskPhone` in `packages/backend/src/lib/pii.ts`; `getViewerCaps` and `requireCapability` in `middleware/capabilities.ts:82-126`, applied across customers, segments, events, logs, dashboard, predictions, inbound webhooks, campaigns and the consent export. Toggles on `settings/roles/page.tsx:128-146`.
  - Why it matters: an agency or support teammate can run campaigns without seeing emails or phone numbers, and the masking covers API responses and CSV exports, not just the screen. MoEngage's role matrix has no such permission. Suits DPDP.
- **Dealer-scoped (row-level) access for B2B distributor networks.**
  - Where: `middleware/agentScope.ts:19-162`; toggle on `settings/project/page.tsx:81-105`; dealers on `settings/dealers/page.tsx`.
  - Why it matters: manager and agent logins see only their dealers' customers across customers, dashboard, events, segments and inbox. MoEngage's roles are module-level and its Teams weren't visible.
- **2FA visibility and admin password reset in the Team table.**
  - Where: `settings/team/page.tsx:325-341, 360-391`; `adminUsers.ts:210-215`.
  - Why it matters: an admin can see who has 2FA on and unblock a locked-out teammate without support. MoEngage's members list has no 2FA column.
- **Event Mapping with an impact preview.**
  - Where: `event-sources/mapping/page.tsx:31-46, 205-252, 552-576`; preview `eventMapping.ts:465-520`, save and replay `:560`.
  - Why it matters: ten meanings (purchase, view, cart add, remove and snapshot, fulfilment, delivery, cancellation, return, refund) are mapped from events actually received, and the ₹ change in orders and revenue is previewed and typed-confirmed before order history is rebuilt. Richer than MoEngage's single conversion goal, but super-admin only today.
- **SDK connection status and ready-to-paste snippets beside the key.**
  - Where: `settings/page.tsx:168-192` (Connected / Not connected from `source='sdk'` events) and `:203-329` (script tag, Shopify custom pixel, NPM, cURL, recommended and auto-tracked events); `v1ApiKeys.ts:110-152`.
  - Why it matters: a Shopify merchant can install tracking without a developer and see when events arrive. MoEngage's API Keys page only lists keys.
- **Per-key rate limits and last-used tracking.**
  - Where: `middleware/rateLimiter.ts:13-48`; `last_used_at` updates in `apiKeyAuth.ts:182-185, 293-296`; shown on `projects/page.tsx:133-139`.
  - Why it matters: shows whether a key is still in use before revoking it and caps damage from a leaked key. Only super admins can see it today.
- **Tokenised inbound webhooks as narrowly scoped credentials.**
  - Where: `routes/hooks.ts:11-60` (per-endpoint token plus an optional `x-storees-secret` header); `event-sources/page.tsx`.
  - Why it matters: each integration (Zapier, ERP, form tools) gets its own revocable URL that can only post mapped events, rather than a workspace-wide key.
- **Bring-your-own LLM provider (Settings > SDK & Integration > AI).**
  - Where: `settings/page.tsx:670-870`; `ai.ts:235-416`; `services/llmService.ts:52-80`.
  - Why it matters: brands run Storees' AI features on their own Groq, OpenAI or Anthropic key and model; the reverse of MoEngage's MCP (AI inside the product rather than the product inside the AI).
  - Caveat: the key is stored in plain text in `projects.settings.ai_api_key` and the route has no role gate.

### UX notes

- **Information architecture** (screens 006, 042, 043): MoEngage splits Account into four single-purpose pages, reached from a searchable grouped flyout and a Settings Home grid with one-line descriptions. Storees' `/settings` is a flat bar of up to 11 tabs whose first tab hides a Setup / Channels / AI switch that opens on Channels (`settings/layout.tsx:12-27`; `settings/page.tsx:47-57`), so the API key and Project ID sit two clicks deep under a channel-focused default. Adopt a grouped left rail with search: Account (General, API keys, Team, Roles, Security), Channels, Data, AI.
- **General settings** (screens 001, 003): one card with the ID and time zone, then Goal mapping with dependent dropdowns, and one Save. Storees has no home for project basics; Project Settings holds dealer access, email domain and frequency caps only (`settings/project/page.tsx:74-109`). A "General" card at the top of Project Settings (name, time zone, currency) is the natural fit.
- **API key list** (screens 007, 010, 011, 044): MoEngage masks every key, offers reveal and copy, sorts by Created on and explains each key in a tooltip. Storees shows tenants the full public key in clear text with one Copy button (`settings/page.tsx:966-982`), while its better masked list (reveal, copy, last used, rate) is hidden on the super-admin Projects page (`projects/page.tsx:57-145`). Reuse that component, and keep Storees' clearer "public key, safe to embed; secret for server-to-server" wording rather than per-family legacy key names.
- **Create-key drawer** (screens 013-018): MoEngage pre-checks all 34 scopes, which nudges users toward over-privileged keys. If Storees adds scopes, a new key should default to SDK ingestion only. Keep Storees' show-once secret panel with Copy (`settings/page.tsx:983-1001`) as the success state.
- **Members and invites** (screens 025, 026, 031): MoEngage's centred modal takes several emails before the role step and tracks Joined / Pending / Access revoked. Storees' inline form makes the admin type a temporary password and share it outside the product (`settings/team/page.tsx:172-241`), which buyers notice in demos. Keep the inline Role / Permissions / Dealer selects and the 2FA column (faster than a kebab, and MoEngage lacks the 2FA view), but switch creation to an email invite with a Pending badge.
- **Two role concepts per member:** each Team row has a "Role" select (admin, manager, agent) and a separate "Permissions" select (custom role) (`settings/team/page.tsx:259-262, 280-305`). MoEngage shows one Role per member. Merge them into one picker, or explain the difference inline, before adding more roles.
- **Roles layout** (screens 032, 036, 040): MoEngage uses three panes (role list, component × permission matrix, details with "View users"). Storees' flat table with "Contact hidden" and "No export" chips (`settings/roles/page.tsx:181-237`) is a good summary worth keeping, but a real permission set needs the matrix and a members link.
- **Permission denied** (screen 041): MoEngage redirects to a safe page with an explicit toast. In Storees a non-admin who opens `/settings/team` gets a 403 the page never handles, so it reads "No team members yet." (`settings/team/page.tsx:56, 244-253`). The settings layout also treats a missing role as admin (`settings/layout.tsx:33`), while the sidebar denies by default (`Sidebar.tsx:83-95`). Add a permission-denied state and make both fail closed.
- **Tooltips and confirmations** (screens 002, 003, 044): MoEngage puts an info tooltip on every non-obvious field and a propagation banner on General settings. Storees relies on page descriptions, and its destructive actions use the browser `confirm()` dialog (`settings/team/page.tsx:145`; `settings/roles/page.tsx:67`). The Remove dialog also promises "They will lose access immediately", which isn't true (see the status lifecycle row). Storees' own Event Mapping has the stronger pattern (impact preview plus typing the project name); reuse it for removing members and revoking keys.
- **MCP page** (screens 020-024): if Storees builds an MCP server, MoEngage's page is a compact template: one tab per client (state in `?tab=`), a read-only server URL with copy, four numbered steps, a single call to action, and a copyable JSON block for Cursor and other clients.

### Verification notes

Every row was re-checked against the code at `2063cdc`. One status changed; the other changes correct or extend evidence and gap text.

- **Server APIs require the secret: 🟡 Partial → ❌ Missing (P0, S kept).** `requireApiKeyAuth`, the only code that checks `X-API-Secret` (and the IP allowlist), is referenced only by a test mock (`__tests__/v1Events.test.ts:34`) and mounted on no route. Generating the secret and documenting it as required doesn't make any API require it. Added the concrete harm from `/import/products`: titles, images and prices render in the brand's emails (`productCatalogService.ts:51-63`).
- **Auto-provisioned keys (P2, S kept): evidence corrected.** The key is created by `POST /api/onboarding/projects` (the super-admin New Project flow), not by "the onboarding wizard". The actual wizard, `/api/wizard/complete`, creates projects without a key (`wizard.ts:165-170`), as does the Shopify self-serve install. The Setup banner's "Older projects created before the fix" wording assumes every path was fixed.
- **Login security (P0, S kept): gap widened.** The open callback also creates accounts for unknown emails, bypassing the closed registration (`auth.ts:31-36`), puts `isSuperAdmin` in the token when the email is a platform operator's, and has no rate limiter.
- **Time zone (P1, M kept) and Currency (P1, S kept): evidence added.** The Shopify install already calls `/shop.json` (`shopifyService.ts:241-252`), whose response carries `iana_timezone` and `currency`, but `fetchShopInfo` keeps only name, email and owner, so both defaults are a few lines away. For time zone, the shared `FixedTimeSchedule` type already promises "local to project timezone" (`shared/src/types.ts:582-585`) with no project time zone behind it.
- **Data API scopes (P2, M kept): evidence updated for HEAD.** Commit `2063cdc` added admin-JWT data export and erase (`customers.ts:922, 945`) and wired Shopify's `customers/redact` webhook to `eraseCustomer` (`webhooks.ts:248-264`), so Shopify stores get automated erasure. The API-key gap now applies to non-Shopify brands.
- **API key inventory (P1, S kept): evidence added.** The key routes are mounted with `requireAuth` only and have no `requireRole`, so any signed-in member can list and mint keys. `requireProjectId` checks membership only when `ENFORCE_PROJECT_MEMBERSHIP=true` (`membership.ts:76`), a flag absent from `.env.example`; its production value can't be read from the code.
- **Member status lifecycle (P1, M kept):** added that the Remove dialog promises immediate loss of access while the 24-hour JWT keeps working.
- **Members list (P2, S kept):** added that PATCH and DELETE are also scoped to the home project (`adminUsers.ts:164, 252`), so `user_projects`-linked members can't be managed from Team.
- **Campaign report scopes (❌, P2 kept):** checked outbound webhooks as an alternative export path; only segment events are emitted.
- **Rows confirmed as stated:** all remaining statuses, priorities and efforts. Workspace ID stays ✅ Full: the identifier the SDK actually takes (the public key) is shown with Copy and an explanatory hint; only the Project ID copy icon is missing. No row qualified as ⭐ Storees better or ➖ N/A; AWS STS stays ❌ Missing at P3 rather than N/A, since it's a real capability Storees lacks, only a low-value one for D2C.

### Screens

#### General Settings

![General settings: Basic details (Workspace ID blurred locally; time zone Asia/Kolkata) and Goal mapping (Conversion goal, Revenue attribute, Currency), with Save](../screenshots/21-settings-accounts-001-general-settings-top.jpg)
*General settings: Basic details (Workspace ID blurred locally; time zone Asia/Kolkata) and Goal mapping (Conversion goal, Revenue attribute, Currency), with Save*

![Workspace ID tooltip: developers use it for SDK integration and to refer to this workspace](../screenshots/21-settings-accounts-002-general-workspace-id-tooltip.jpg)
*Workspace ID tooltip: developers use it for SDK integration and to refer to this workspace*

![Goal mapping tooltip: drives LTV and the conversion and revenue trends in the Key Metrics dashboard](../screenshots/21-settings-accounts-003-general-goal-mapping-tooltip.jpg)
*Goal mapping tooltip: drives LTV and the conversion and revenue trends in the Key Metrics dashboard*

![Time zone dropdown: searchable list of IANA zones with UTC offsets (591 options, unsorted)](../screenshots/21-settings-accounts-004-general-timezone-dropdown.jpg)
*Time zone dropdown: searchable list of IANA zones with UTC offsets (591 options, unsorted)*

![Conversion goal picker is searchable but empty, because no events have been ingested yet](../screenshots/21-settings-accounts-005-general-conversion-goal-dropdown-empty.jpg)
*Conversion goal picker is searchable but empty, because no events have been ingested yet*

#### API Keys

![Active API keys (5): Data, Push, Campaign report/..., Inform and Personalize, all Basic Auth (Legacy), with masked keys, reveal/copy icons and row menus](../screenshots/21-settings-accounts-007-api-keys-list.jpg)
*Active API keys (5): Data, Push, Campaign report/..., Inform and Personalize, all Basic Auth (Legacy), with masked keys, reveal/copy icons and row menus*

![Page tooltip: several keys with different access levels can be created here](../screenshots/21-settings-accounts-008-api-keys-info-tooltip.jpg)
*Page tooltip: several keys with different access levels can be created here*

![Full key name: Campaign report/Business events/Custom templates/Catalog API/Inform Report](../screenshots/21-settings-accounts-009-api-keys-key-name-tooltip.jpg)
*Full key name: Campaign report/Business events/Custom templates/Catalog API/Inform Report*

![Key info tooltip: what the key is for (Data APIs), plus an orange warning that legacy keys cannot be regenerated and a new scoped key should be created](../screenshots/21-settings-accounts-044-api-keys-legacy-key-info-tooltip.jpg)
*Key info tooltip: what the key is for (Data APIs), plus an orange warning that legacy keys cannot be regenerated and a new scoped key should be created*

![Row menu: View key details, Regenerate key, Edit key details (disabled), Archive key (disabled)](../screenshots/21-settings-accounts-010-api-keys-row-actions-menu.jpg)
*Row menu: View key details, Regenerate key, Edit key details (disabled), Archive key (disabled)*

![View key details drawer: Key name, masked API key with reveal/copy, Authentication type](../screenshots/21-settings-accounts-011-api-keys-view-key-details-drawer.jpg)
*View key details drawer: Key name, masked API key with reveal/copy, Authentication type*

![View archived keys: up to 10 archived keys are kept (the oldest is replaced); empty state](../screenshots/21-settings-accounts-012-api-keys-archived-keys-empty.jpg)
*View archived keys: up to 10 archived keys are kept (the oldest is replaced); empty state*

![Create new key (Basic Auth): Key name, Authentication type, scope tree starting with Data APIs and Segmentation APIs](../screenshots/21-settings-accounts-013-api-keys-create-basic-auth-top.jpg)
*Create new key (Basic Auth): Key name, Authentication type, scope tree starting with Data APIs and Segmentation APIs*

![Scope tree, middle: Segmentation APIs, Campaigns, Inform, Offerings, Decision Policy](../screenshots/21-settings-accounts-014-api-keys-create-scopes-middle.jpg)
*Scope tree, middle: Segmentation APIs, Campaigns, Inform, Offerings, Decision Policy*

![Scope tree, bottom: Dashboard & Analyze and Channel Configuration; Cancel / Create key (not clicked)](../screenshots/21-settings-accounts-015-api-keys-create-scopes-bottom.jpg)
*Scope tree, bottom: Dashboard & Analyze and Channel Configuration; Cancel / Create key (not clicked)*

![Authentication type options: Basic Auth, OAuth 2.0, AWS STS Auth](../screenshots/21-settings-accounts-016-api-keys-auth-type-dropdown.jpg)
*Authentication type options: Basic Auth, OAuth 2.0, AWS STS Auth*

![OAuth 2.0 variant (unsaved): Expiry time in minutes (default 15) and a smaller scope tree](../screenshots/21-settings-accounts-017-api-keys-create-oauth2.jpg)
*OAuth 2.0 variant (unsaved): Expiry time in minutes (default 15) and a smaller scope tree*

![AWS STS Auth variant (unsaved): Expiry time, ARN\* with '+ Add value', only scope is Channel Configuration > Setup & Manage](../screenshots/21-settings-accounts-018-api-keys-create-aws-sts.jpg)
*AWS STS Auth variant (unsaved): Expiry time, ARN\* with '+ Add value', only scope is Channel Configuration > Setup & Manage*

![ARN info tooltip explaining Amazon Resource Names, with a Learn more link](../screenshots/21-settings-accounts-019-api-keys-arn-tooltip.jpg)
*ARN info tooltip explaining Amazon Resource Names, with a Learn more link*

#### MCP

![Claude tab: custom connector for Claude Desktop or claude.ai, server URL with copy, 4 steps, Install connector (not clicked)](../screenshots/21-settings-accounts-020-mcp-claude-tab.jpg)
*Claude tab: custom connector for Claude Desktop or claude.ai, server URL with copy, 4 steps, Install connector (not clicked)*

![MCP tooltip: connect MCP-compatible AI apps to build campaigns, segments and flows in natural language](../screenshots/21-settings-accounts-021-mcp-info-tooltip.jpg)
*MCP tooltip: connect MCP-compatible AI apps to build campaigns, segments and flows in natural language*

![ChatGPT tab: custom connector for Business/Enterprise workspaces, or a personal custom MCP connector; 4 steps; View setup guide](../screenshots/21-settings-accounts-022-mcp-chatgpt-tab.jpg)
*ChatGPT tab: custom connector for Business/Enterprise workspaces, or a personal custom MCP connector; 4 steps; View setup guide*

![Cursor tab: steps, copyable mcpServers JSON, Add to Cursor (not clicked)](../screenshots/21-settings-accounts-023-mcp-cursor-tab.jpg)
*Cursor tab: steps, copyable mcpServers JSON, Add to Cursor (not clicked)*

![Others tab: generic MCP configuration JSON for any MCP-compatible client](../screenshots/21-settings-accounts-024-mcp-others-generic-config.jpg)
*Others tab: generic MCP configuration JSON for any MCP-compatible client*

#### Team Management - Members

![Members(3): names and emails blurred locally; all Joined; roles Admin, Admin, Developer](../screenshots/21-settings-accounts-025-team-members-list.jpg)
*Members(3): names and emails blurred locally; all Joined; roles Admin, Admin, Developer*

![Filter members popover: Role, Status, Reset all, Cancel / Apply](../screenshots/21-settings-accounts-026-team-members-filter-panel.jpg)
*Filter members popover: Role, Status, Reset all, Cancel / Apply*

![Role filter: Admin, Manager, Analyst, Marketer, Developer](../screenshots/21-settings-accounts-027-team-members-filter-role-dropdown.jpg)
*Role filter: Admin, Manager, Analyst, Marketer, Developer*

![Status filter: Joined, Pending, Access revoked](../screenshots/21-settings-accounts-028-team-members-filter-status-dropdown.jpg)
*Status filter: Joined, Pending, Access revoked*

![Row action menu disabled for this user, with a 'You can't perform this action' tooltip](../screenshots/21-settings-accounts-029-team-members-row-action-disabled.jpg)
*Row action menu disabled for this user, with a 'You can't perform this action' tooltip*

![Row selection checkbox also disabled, with the same tooltip](../screenshots/21-settings-accounts-030-team-members-row-checkbox-disabled.jpg)
*Row selection checkbox also disabled, with the same tooltip*

![Invite members, step 1: several email addresses (Enter or comma separated), then Next (not advanced)](../screenshots/21-settings-accounts-031-team-invite-members-modal.jpg)
*Invite members, step 1: several email addresses (Enter or comma separated), then Next (not advanced)*

#### Team Management - Roles

![Roles tab, Developer selected: role list, permission matrix (Coupons, Recommendations & Catalog, Dashboard & analyze...) and Details panel](../screenshots/21-settings-accounts-032-team-roles-developer-top.jpg)
*Roles tab, Developer selected: role list, permission matrix (Coupons, Recommendations & Catalog, Dashboard & analyze...) and Details panel*

![Developer matrix, part 2: Dashboard & analyze, Segments, Imports, Campaigns, Drafts, Reports, Predict, App Marketplace, App Configuration](../screenshots/21-settings-accounts-033-team-roles-developer-matrix-2.jpg)
*Developer matrix, part 2: Dashboard & analyze, Segments, Imports, Campaigns, Drafts, Reports, Predict, App Marketplace, App Configuration*

![Developer matrix, part 3: Channel Configuration, Security Settings, Team Members, Usage and Billing, OOB and Custom Alerts Management, Landing Pages](../screenshots/21-settings-accounts-034-team-roles-developer-matrix-3.jpg)
*Developer matrix, part 3: Channel Configuration, Security Settings, Team Members, Usage and Billing, OOB and Custom Alerts Management, Landing Pages*

![Developer matrix, part 4: Content, Offerings, Decision Policy, Computed Traits, User Profile, Create Workspace, Campaign Decisioning Policy, Custom Agent, Warehouse Schema](../screenshots/21-settings-accounts-035-team-roles-developer-matrix-4-bottom.jpg)
*Developer matrix, part 4: Content, Offerings, Decision Policy, Computed Traits, User Profile, Create Workspace, Campaign Decisioning Policy, Custom Agent, Warehouse Schema*

![Admin: account-owner role with every permission; 2 users](../screenshots/21-settings-accounts-036-team-roles-admin.jpg)
*Admin: account-owner role with every permission; 2 users*

![Manager: full dashboard access, close to Admin; 0 users](../screenshots/21-settings-accounts-037-team-roles-manager.jpg)
*Manager: full dashboard access, close to Admin; 0 users*

![Analyst: view, report and segmentation-query role that cannot create campaigns; 0 users](../screenshots/21-settings-accounts-038-team-roles-analyst.jpg)
*Analyst: view, report and segmentation-query role that cannot create campaigns; 0 users*

![Marketer: like Manager, but read-only account settings and no billing; 0 users](../screenshots/21-settings-accounts-039-team-roles-marketer.jpg)
*Marketer: like Manager, but read-only account settings and no billing; 0 users*

![View users (Marketer) jumps to Members filtered by role: 'No member(s) found' empty state](../screenshots/21-settings-accounts-040-team-roles-view-users-filtered-empty.jpg)
*View users (Marketer) jumps to Members filtered by role: 'No member(s) found' empty state*

#### Security / login settings (role-gated)

![Opening /accounts/security redirects to All campaigns with a toast saying the role lacks permission for login settings](../screenshots/21-settings-accounts-041-security-login-settings-no-permission-toast.jpg)
*Opening /accounts/security redirects to All campaigns with a toast saying the role lacks permission for login settings*

#### Settings entry points (flyout and Settings Home, Account section)

![Settings flyout: search, Settings Home, Account (General Settings, API Keys, MCP, Team Management), Analytics & Segmentation, Data, Channels...](../screenshots/21-settings-accounts-006-settings-flyout-menu.jpg)
*Settings flyout: search, Settings Home, Account (General Settings, API Keys, MCP, Team Management), Analytics & Segmentation, Data, Channels...*

![Flyout search: typing 'key' filters the menu to Account > API Keys](../screenshots/21-settings-accounts-043-settings-flyout-search.jpg)
*Flyout search: typing 'key' filters the menu to Account > API Keys*

![Settings Home, Account cards: General Settings, API Keys, MCP, Team Management ('Invite team members, define roles, and create teams')](../screenshots/21-settings-accounts-042-settings-home-account-cards.jpg)
*Settings Home, Account cards: General Settings, API Keys, MCP, Team Management ('Invite team members, define roles, and create teams')*
