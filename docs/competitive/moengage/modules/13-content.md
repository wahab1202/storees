## 13. Content > Content Blocks, Recommendations, Landing Pages, Coupons (+ template library)

Storees has no Content area: there are no reusable content blocks, no hosted landing pages and no coupon engine, and its rule-based recommendations have no page where a merchant can see or configure them. It is ahead inside the message itself: recommended products, live social proof, cart items and brand tokens resolve per recipient in email, SMS, push and WhatsApp on every plan, while MoEngage locks Smart Recommendations to its Enterprise plan. The urgent gaps are unique single-use coupon codes (P0) and a flow defect that keeps email steps from ever sending the library template chosen for them (P0, also reported in modules 02 and 06).

### MoEngage overview

MoEngage's sidebar "Content" flyout holds four libraries of reusable assets. It has no message template library: message templates live inside each channel builder (modules 02-05).

- **Content Blocks.** Named Plain-text or HTML snippets, inserted with `{{ContentBlock['<label>']}}` into campaigns, Inform alerts and other blocks, so one edit updates every message that uses them.
  - Create form: Name (5-100 characters; it doubles as the insert label), Description (250), shared workspace Tags with a "Manage tags" link, and the type.
  - Editors: a plain-text box with an '@' personalisation picker (5,000 characters), or an HTML code editor beside a live preview with full screen, image upload to a hosted URL and desktop/mobile preview.
  - Publish is the only save. Blocks are Active or Draft.
  - The list has search, filters (Updated by, Content type, Teams, Status, Tags), list and grid views, a usage count per block (campaigns and other blocks), a copy-tag icon, a preview drawer and View / Edit / Duplicate / Delete. It pages 12 at a time. There is no version history.
- **Recommendations.** Smart Recommendations offers attribute-based, user-action-based and Merlin AI models for website, email, push, SMS, in-app, on-site and cards. It is locked to the Enterprise plan in this workspace: an upsell page plus an empty two-step builder that says "Not authorized".
- **Landing Pages.** Hosted pages built from 18 templates or Blank in a third-party drag-and-drop builder.
  - Builder: about 770 blocks in two kits, 156 layout sets, about 30 elements, global styles, block styling and effects, and Desktop/Tablet/Mobile views.
  - Experimentation: A/B variations with a traffic split, saved cohorts on in-session attributes (query parameter, day, time, geo, device, OS, browser) and preview as a real user.
  - Forms: lead forms with 13 field types, each mapped to a user attribute.
  - Publishing: a default or custom domain, meta tags, favicon and head scripts. The list shows Active / Draft / Archived status, views, clicks and CTR.
- **Coupons.** Lists of unique single-use codes uploaded as CSV, with an expiry date and email alerts (success, failure, shortage threshold, N days before expiry). A Jinja snippet, `{{Coupons.CouponListName['<list>']}}`, gives each recipient one code at send time. List and detail pages show total and available counts, status and upload history, with append-CSV, a usage report and archive.

| Page visited | URL path |
|---|---|
| Content flyout (sidebar) | Sidebar flyout on every page (Content icon) |
| Content Blocks list | `/v4/content-blocks` |
| Create content block | `/v4/create/content-block` |
| Recommendations (Smart Recommendations, locked) | `/v4/dpm/recommendation/all` |
| Create recommendation (direct URL) | `/v4/dpm/recommendation/create` |
| Landing pages list | `/v4/lp/all` |
| Create landing page: template gallery, URL and settings | `/v4/lp/create` |
| Landing page editor: canvas, block library, elements, styling | `/v4/lp/create` (builder is a cross-origin iframe on app-cdn.moengage.com) |
| Landing page editor: A/B variations, cohorts, preview/test, forms | `/v4/lp/create` |
| Coupons list | `/v4/dpm/coupon-management` |
| Create coupon list | `/v4/dpm/coupon-management/create` |
| Coupon list detail | `/v4/dpm/coupon-management/<couponListId>` |

**Capture limits.**
- **Recommendations locked:** the model list, algorithm settings, catalog setup, filters and campaign usage could not be seen. Neither the Content nor the Data flyout has a Catalog entry.
- **Mocked tables:** the content block, landing page and coupon lists were seen only with locally mocked rows, because the workspace has none. Some mock details (content type, coupon expiry, an empty Draft menu, disabled coupon actions) may differ with real data.
- **Not opened:** the '@' personalisation picker, a real block's edit page, Save and Publish, layout import, uploads, coupon CSV upload, file preview, usage report and the Edit coupon list page.
- Nothing was created, changed or deleted; this was re-checked after full reloads.

### Storees counterpart

Storees has no Content section. The nearest pieces:

- **Template library** at `/templates` (`packages/frontend/src/app/(dashboard)/templates/page.tsx`), an admin-only nav item (`packages/frontend/src/components/layout/Sidebar.tsx:61`).
  - Related routes: `/templates/create`, `/templates/[id]/edit`, `/templates/ai` (AI Email Designer) and `/templates/whatsapp/new`.
  - API: `/api/templates` (`packages/backend/src/routes/templates.ts`): list, seed, variable-sources, preview and CRUD.
  - Storage: `email_templates` (`packages/backend/src/db/schema.ts:545-570`) holds name, channel, subject, body, builder JSON and variables. It has no tags, status, description, author or version. WhatsApp templates live in their own lifecycle table and show on the same page.
  - Authoring: email in the block builder (`packages/frontend/src/components/email-builder/`), personalisation in `packages/frontend/src/components/templates/VariablePanel.tsx`.
  - Rendering: flat `{{key}}` replacement (`packages/backend/src/services/templateContext.ts:103-148`; `packages/backend/src/services/emailService.ts:109-121`) with no include syntax.
- **Smart content and recommendations** in `packages/backend/src/services/decisioningService.ts`: pairing rules, the customer's last purchase, top sellers and live social proof.
  - Consumers: `decision` variables and the `{{recommended_products}}` email grid in flows (`flowExecutor.ts:657-701`) and campaigns (`campaignService.ts:925-962`), and the WhatsApp AI chatbot (`whatsappChatbotService.ts:161-163`).
  - Rules are managed only through `/api/recommendations` (`packages/backend/src/routes/recommendations.ts`), which nothing in the frontend calls.
  - Also present but never called and with no UI: a Python recommender (`packages/ml/recommendations/`), and catalogue, item and interaction-weight APIs (`routes/catalogues.ts`, `items.ts`, `interactionConfig.ts`) whose `interactions` rows only the Python trainers read.
- **On-site opt-in widgets** at `/widgets` (`packages/frontend/src/app/(dashboard)/widgets/page.tsx`).
  - Admin API `/api/optin-widgets`; public `POST /api/v1/optin` (`packages/backend/src/routes/v1OptIn.ts`); rendered by `packages/sdk/src/widget.ts`.
  - No navigation item or link points to `/widgets`.
- **Coupons:** none. Only flow steps can bind a per-send code to a WhatsApp COPY_CODE button (`packages/frontend/src/components/flows/SendNodeConfigModal.tsx:98-105`; `packages/backend/src/services/providers/whatsappUtils.ts:93-104`).
- **Public pages:** only the unsubscribe confirmation at `/u/:token` (`packages/backend/src/routes/unsubscribe.ts:36-73`).

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Content navigation | Content section grouping Content Blocks, Recommendations, Landing Pages, Coupons | Sidebar "Content" flyout with the four libraries; no template-library entry | 🟡 Partial | One admin-only "Templates" item, no Content group (`Sidebar.tsx:54-71`, `:61`). `/widgets` exists but no href in `packages/frontend/src` points to it. `/api/recommendations` has no frontend caller (`routes/recommendations.ts`; `index.ts:223`). No coupon area | Add a "Content" group (Templates, On-site widgets, then Recommendations, Coupons and Blocks as they ship) and link `/widgets` now. | P2 | S |
| Content Blocks | Reusable content block library (snippets reused across campaigns, alerts and other blocks) | Named Plain-text/HTML snippets inserted with `{{ContentBlock['<label>']}}`; one edit updates every message | ❌ Missing | No block, snippet, partial or include anywhere; flat `{{key}}` replacement only (`emailService.ts:109-121`; `templateContext.ts:103-148`). Campaigns copy the template HTML when it is picked (`campaigns/create/page.tsx:823-841`). Nearest: system brand tokens such as `{{brand_header}}` (`templateContext.ts:126-138`) | A `content_blocks` table (label, type, body, status), a block token expanded before variable resolution, and a library page. Today a footer or legal line must be edited template by template. | P2 | M |
| Content Blocks | Block types: Plain text and HTML | Radio on the create form; "Content type" list filter | ❌ Missing | No block entity. Templates are typed only by channel: email, sms, push, whatsapp, in_app (`routes/templates.ts:316-319`) | Ship both types with the library: text for SMS, WhatsApp and push; HTML for email. | P2 | S |
| Content Blocks | Plain-text editor with '@' personalisation picker (5,000-character counter) | Textarea "Type @ to personalize the block", 0/5000 | 🟡 Partial | SMS, push and in-app bodies are plain textareas (`templates/create/page.tsx:528-552`) with an N/160 counter for SMS only (`:545-550`). `{{key}}` is typed by hand, then auto-detected by the Variables panel (`VariablePanel.tsx:53-75`). The email Text block inserts only Name and Store tokens (`BlockPropertyEditor.tsx:139-140`). No inline '@' or '{{' autocomplete | Inline autocomplete fed by `GET /api/templates/variable-sources` (`routes/templates.ts:115`) in every text editor; reuse it in the block editor. | P2 | S |
| Content Blocks | HTML code editor with live preview pane, full screen, Refresh, desktop/mobile Preview | Line-numbered editor with '@' beside a live preview; Edit in full screen, Uploads, Preview frames, Refresh | 🟡 Partial | No code-editor library in the frontend. Raw HTML only in the email Text block textarea (`BlockPropertyEditor.tsx:93-201`) and the campaign "Custom HTML" textarea, whose preview is a separate tab (`campaigns/create/page.tsx:2010-2022`). The template editor has no HTML mode; its Code view is a read-only `<pre>` (`EmailBuilder.tsx:443-449`). Full screen and Desktop/Mobile (375px) exist in the visual builder (`EmailBuilder.tsx:43`, `:299-310`) | HTML mode for templates: a CodeMirror-style editor beside a live iframe preview with the device toggle. The same editor would serve as the HTML block editor. | P2 | S |
| Content Blocks | Image hosting from the editor (Uploads > "Generate URL for your image files") | Drag and drop or upload jpg/png/gif up to 5 MB; returns a hosted URL | 🟡 Partial | `POST /api/assets/email-image` takes JPG/PNG/GIF/WebP up to 5 MB to S3-compatible or local storage; `GET` lists the newest 60; `DELETE` removes one (`routes/assets.ts:82`, `:121-133`, `:202`). Upload and "Recent Uploads" appear only in the email Image/Product block panel (`BlockPropertyEditor.tsx:226-245`, `:275-318`); no copy-URL tool where raw HTML is typed | Offer the same upload as a "Get image URL" tool with a copy button in HTML contexts. | P3 | S |
| Content Blocks | Metadata: name/label rules and description | Name* (5-100 chars; letters, digits, `_`, `-`) doubling as the insert label; Description (250) | 🟡 Partial | Free-text name that must not be empty; no label format and no description column (`routes/templates.ts:312-314`; `schema.ts:545-570`). Only WhatsApp names are normalised to lowercase and underscores (`WhatsAppTemplateBuilder.tsx:338`) | Add a description and a stable machine label when blocks ship. | P3 | S |
| Content Blocks | Tags (shared workspace tag list, Default tags, "Manage tags" in Settings) | Searchable tag multi-select with Default tags; the same tags apply to landing pages | ❌ Missing | `email_templates` has no tags (`schema.ts:545-570`). Only campaigns carry free-text tags (`schema.ts:469`; input at `campaigns/create/page.tsx:1059-1100`). No tag registry and no tag settings tab (`settings/layout.tsx:12-26`) | A project tag list seeded with defaults; tags and tag filters on templates, and later on blocks, coupons and widgets. | P2 | M |
| Content Blocks | Save model and Active/Draft status | Publish only (no draft save, no auto-save); blocks are Active or Draft | 🟡 Partial | Email, SMS, push and in-app templates save immediately and have no status (`routes/templates.ts:303-360`). Only WhatsApp templates have a lifecycle: DRAFT, PENDING, APPROVED, REJECTED and others (`templates/page.tsx:18-27`) | Draft/active status on templates and blocks so unfinished content cannot be picked for a send. | P3 | S |
| Content Blocks | List search and content-type filter | "Search by block name or label"; Content type multi-select | 🟡 Partial | `/templates` searches name and subject in memory (name and body for WhatsApp) and has channel tabs with counts (`templates/page.tsx:77-105`, `:172-211`) | Reuse the pattern for blocks, plus label search. | P3 | S |
| Content Blocks | Filters: Updated by, Teams, Status, Tags (panel with Reset/Cancel/Apply) | Team-member multi-select; filter panel with Teams, Status (Active, Draft), Tags | ❌ Missing | Templates store no created_by/updated_by, status or tags (`schema.ts:545-570`). No teams concept: Settings > Team manages members only (`settings/team/page.tsx`). No filter panel (`templates/page.tsx:171-211`) | Add updated_by, status and tags first, then a filter panel. Teams is enterprise-only. | P3 | M |
| Content Blocks | List/grid toggle with rich rows | List: Name (copy label), Content type, Status, Updated by, Usage, menu. Grid cards: thumbnail and "Engage \| Usage \| Updated by" | 🟡 Partial | Email, SMS and push show only as iframe cards with a channel badge and delete on hover; a Cards/Table toggle exists only for WhatsApp (`templates/page.tsx:273-305`, `:309-373`, `:433-500`). Generic templates show no status, author or usage | A table view for every channel with status, updated-by, usage and updated-at columns. | P3 | S |
| Content Blocks | Paginated library (12 per page) | The content-blocks search API returns 12 per page | ❌ Missing | `GET /api/templates` returns every row for the project (`routes/templates.ts:50-64`); the page filters in memory (`templates/page.tsx:77-97`). Breaks the repo's own `?page/pageSize` convention | Server-side pagination and search for templates and future blocks. | P2 | S |
| Content Blocks | Usage tracking across campaigns, Inform alerts and other blocks | Usage column; a ref-count API returns {campaigns, content_blocks} per block; preview shows "Communication type: Engage" | ❌ Missing | No where-used count; `DELETE /api/templates/:id` checks nothing (`routes/templates.ts:419-438`). References do exist: `campaigns.template_id` (`schema.ts:431`), flow nodes store the id (`SendNodeConfigModal.tsx:197-222`), in-app campaigns inner-join the template when served (`v1InAppMessages.ts:76`), and SMS/push providers read the body by id at send (`twilioProvider.ts:7-17`; same in Gupshup, Vonage, FCM). Deleting a template in use silently stops in-app campaigns and sends empty SMS/push from flows. No Engage/Inform split | Usage count per template (campaign references plus flow node configs), and block deletion while a template is in use. | P1 | M |
| Content Blocks | Nested blocks (a block inside another block) | The ref-count API counts blocks used inside other blocks | ❌ Missing | No include mechanism at all (`emailService.ts:109-121`) | Allow a block inside a block, with cycle detection, once blocks ship. | P3 | S |
| Content Blocks | Insert syntax with one-click copy (tag plus toast) | Copy icon on each row and card copies the tag; toast "Successfully copied to clipboard" | ❌ Missing | No block tag. Tokens are typed by hand and mapped in the Variables panel; the source picker has no copy action (`VariablePanel.tsx:47-158`, `:235-353`) | A copyable token for every block, and every variable source, in libraries and pickers. | P2 | S |
| Content Blocks | Row actions: View (preview drawer), Edit, Duplicate, Delete | Row menu View, Edit (new tab), Duplicate, Delete; drawer with Duplicate/Edit, device toggle and a Details tab | 🟡 Partial | A card click opens the editor; delete on hover with an inline confirm; the preview SlidePanel shows subject, updated date, a sandboxed iframe and Edit, with no device toggle or details (`templates/page.tsx:309-373`, `:380-428`). No Duplicate in the library; the only one is in the campaign composer and saves "`<subject>` copy" (`campaigns/create/page.tsx:1775-1798`) | Duplicate in the library; a device toggle and details panel in the preview. | P3 | S |
| Content Blocks | Versioning / version history | Not seen on the list, the create form or the preview drawer | ➖ N/A | No template versions either: no version columns (only prediction models have them, `schema.ts:987-1016`) and PATCH overwrites in place (`routes/templates.ts:363-417`) | Neither product has it. Version history with restore would be a differentiator only. | — | M (optional) |
| Recommendations | Product recommendation engine (Smart Recommendations) | AI-powered engine, locked here ("part of the Enterprise Plan"); tabs Multiple Models, Omni-Channel, Merlin AI, Personalized Experience, Simplified Discovery | 🟡 Partial | Rule-based engine wired into sends: pairing rules (exact product beats product_type, then rank), else the customer's last purchase through the rules, else the project's top sellers, enriched from `products` (`decisioningService.ts:77-110`, `:173-214`; rules table `schema.ts:1524-1535`). Not plan-gated. Rules can be managed only through `/api/recommendations`, which has no frontend caller (`routes/recommendations.ts:13-64`). `packages/ml/recommendations` is never called; the ML proxy only scores and trains predictions (`mlProxyService.ts:185-316`) | Storees already personalises with basic recommendations on every plan, where MoEngage needs Enterprise, but the algorithms are only rules and top sellers and there is no UI. Add bought-together and also-viewed queries over orders and events in `decisioningService`, keeping the current fallback. Productionising `packages/ml` is a separate L job (see the AI-powered row). | P1 | M |
| Recommendations | Model: item attribute-based (similar products) | "Product attribute-based" (marketing copy; builder locked) | 🟡 Partial | Manual pairing rules by exact product or product_type only (`decisioningService.ts:87-90`). `collection` rules are accepted by the API (`routes/recommendations.ts:26`) but never matched, although `product_collections` exists (`schema.ts:293-299`). The attribute model in `packages/ml/recommendations/train_attribute.py` is unused | Automatic same-type and same-collection fallback, and match collection rules. | P2 | M |
| Recommendations | Model: user actions-based (viewed, purchased, wishlist) | "User actions-based", e.g. wishlist items (marketing copy) | 🟡 Partial | Campaigns: last purchase, then pairing rules, then top sellers (`decisioningService.ts:194-214`). Flows: only the trigger event's product_id through pairing rules (`flowExecutor.ts:657-663`), so single-product tokens are blank when no rule matches. The picker's "Based on last viewed product" (`VariablePanel.tsx:332-340`) is saved but no backend code reads `basedOn` (`shared/src/types.ts:1110`) | Honour last-viewed, add bought-together and also-viewed, and give flow tokens the campaign fallback to affinity and top sellers. | P1 | M |
| Recommendations | Model: AI-powered (Merlin: real-time interactions, preferences, engagement) | "AI-powered" / "Powered by Merlin AI" (locked) | ❌ Missing | Collaborative filtering and context-based model choice exist only as unwired prototype code. `/recommendations/v1/recommend` (`packages/ml/recommendations/serve.py:157-162`; mounted at `packages/ml/main.py:9,22`) takes no project id, and each trainer writes one global model file (`train_cooccurrence.py:129-132`). Nothing in backend, frontend or SDK calls it | Per-project model storage, a project parameter, scheduled training, then a call from `decisioningService` behind the SQL fallback. | P2 | L |
| Recommendations | Channels: Email, Push, SMS (plus WhatsApp in Storees) | Recommendations in Email, Push and SMS (marketing copy; WhatsApp not listed) | 🟡 Partial | Smart-content sources (recommended product name, image, price; viewers and buyers) go through one resolver for email, SMS, push and WhatsApp in flows and campaigns (`VariablePanel.tsx:318-324`; `templateContext.ts:173-185`; `flowExecutor.ts:782`; `campaignService.ts:927-935`). Email also gets a 4-product grid (`decisioningService.ts:235-247`; `campaignService.ts:953-962`), and the WhatsApp AI chatbot appends 3 picks (`whatsappChatbotService.ts:161-163`). Limits: one product per non-email message; grid cards have no link because `products` has no URL column (`schema.ts:240-273`) and `toRenderable` passes none (`decisioningService.ts:224-226`); flow tokens need pairing rules | Product URLs in the catalog and on cards, multi-product variables for WhatsApp and SMS, and the flow fallback. | P1 | M |
| Recommendations | Channels: website, In-App, On-site messaging, Cards | Website placements plus In-App, On-Site Messaging and Cards (marketing copy) | ❌ Missing | The SDK renders only opt-in widgets (`packages/sdk/src/widget.ts`); `packages/sdk` and `sdk-react` have no recommendation code; in-app messages have no renderer. `/api/recommendations/resolve` needs admin auth (`index.ts:223`) and no public `/api/v1` route serves recommendations | A public, API-key-authed recommendation endpoint plus an SDK or Shopify theme block for product carousels. | P2 | L |
| Recommendations | Recommendation builder (Select recommendation model > Create recommendation) | Two-step wizard shell (Previous/Next); content "Not authorized" here | ❌ Missing | No page or hook calls `/api/recommendations`; rules can be created only through the API (`routes/recommendations.ts:21-44`) | A Recommendations page: choose a strategy, manage rules with a product picker (`GET /api/products` exists), preview through `/resolve`. | P1 | M |
| Landing Pages | Hosted landing pages: list and lifecycle (status, search, Copy URL, Preview, Edit/Duplicate/Archive/Unarchive, tags) | `/v4/lp/all`; empty state shows 5 demo templates; Copy URL and Preview per row | ❌ Missing | No landing-page, page-builder, grapesjs, unlayer or beefree code; the only hit is the SDK's `landing_page` session property (`autotrack.ts:112`). The only public HTML page is the unsubscribe confirmation (`routes/unsubscribe.ts:36-73`). Nearest asset: opt-in popups with Active/Inactive, Preview, Edit and Delete (`widgets/page.tsx:82-167`) | Shopify D2C brands send traffic to their own store pages, so hosted pages matter little for this customer profile. If built, embed an open-source builder (L) rather than writing one. | P3 | XL |
| Landing Pages | Template gallery (18 responsive templates, Blank drag-and-drop, search) | Promotion, Product Announcement, Survey, Subscription Category Management, Lead Capture and 13 more | ❌ Missing | No page templates. Starter packs exist only for messages: 13 email, 10 SMS, 10 push (`data/seedTemplates.ts:65-855`) | Depends on a page builder. Survey and lead-capture needs can be covered by widget presets instead. | P3 | L |
| Landing Pages | Preference-center page (the "Subscription Category Management" template) | A landing-page template that collects each user's subscription categories | 🟡 Partial | Subscription categories are admin-only data (`routes/subscriptionCategories.ts:10-70`; `index.ts:203`) used to filter campaign audiences (`campaignService.ts:303-316`); per-channel consent has an audit trail (`consentService.ts:21`). Customers get only a fixed one-click unsubscribe page (`unsubscribe.ts:36-73`). All 13 starter emails link "Preferences" to `{{preferences_url}}` (`seedTemplates.ts:53`), which nothing resolves, so the link is empty | A tokenised public preference page (channels plus categories) behind `{{preferences_url}}`, linked from email footers and WhatsApp. Helps DPDP compliance; the backend pieces exist. | P1 | M |
| Landing Pages: Editor | Block library (Kit #1 with 268 blocks, Kit #2 with 502; Light/Dark; categories; search; Create your own) | Hero, Features, Contact, Gallery, CTA, Text, Team, Pricing, Testimonials, Header, Footers and more | ❌ Missing | No page builder. The email builder has 10 block types and 8 row presets, for email only (`lib/emailTypes.ts:25-35`; `EmailBuilder.tsx:499-508`) | Comes only with a third-party page builder. | P3 | XL |
| Landing Pages: Editor | Layout library (156 multi-page layout sets by industry, "Import This Layout", "Replace global styling") | Layouts tab, e.g. Business 69, One Page 53, Portfolio 28 | ❌ Missing | No page builder | Comes only with a third-party page builder. | P3 | XL |
| Landing Pages: Editor | Elements palette (about 30 elements incl. Form, Map, Video, Countdown, Carousel, Tabs, Accordion, Table, Social; customisable) | Add Elements panel with an "Edit" mode | ❌ Missing | No page elements. Email blocks are Header, Text, Image, Button, Divider, Spacer, Columns, Product, Social and Footer (`emailTypes.ts:25-35`); no video, countdown, form, map or embed | Comes only with a page builder. Countdown and video are worth adding to the email builder separately. | P3 | XL |
| Landing Pages: Editor | Global styling (style presets, colour palette, text styles Paragraph to H1-H6 and Button) | Styling panel: Current Style, palette swatches, text styles, Add New | ❌ Missing | The brand kit stores logo, primary and accent colours and a slogan (`settings/brand/page.tsx`; `brandKitService.ts`). The email builder's editable global styles are the page and content backgrounds only (`BlockPropertyEditor.tsx:826-834`). No text-style presets | Brand-kit text styles would help both email and any future pages. | P3 | M |
| Landing Pages: Editor | Section/block settings (size, padding, margin, corner, blending, dividers; Advanced: device visibility, z-index, CSS class, attributes, custom CSS, hover, HTML tag) | Block toolbar plus Styling Basic/Advanced panels | ❌ Missing | No page builder. Email rows offer padding, column gap, backgrounds, border, radius and stack-on-mobile only (`BlockPropertyEditor.tsx:472-825`) | Comes only with a page builder. | P3 | L |
| Landing Pages: Editor | Animation effects (None, Bounce, Fade, Rotate, Slide, Zoom, Attention) | Effects tab on blocks and elements | ❌ Missing | No animation settings anywhere | Comes only with a page builder. | P3 | S |
| Landing Pages: Editor | Text editing and typography (fonts plus Add New Font, size, weight, line height, spacing, B/I/U/S, case, link, alignment, gaps, HTML tag) | Text toolbar with typography and settings popovers | ❌ Missing | No page editor. Email text is a raw-HTML textarea with B, I, Link, Break and token buttons, plus font size, alignment and colour; no font picker (`BlockPropertyEditor.tsx:93-201`) | A rich-text editor and font choice would also fix raw-HTML text editing in the email builder. | P3 | M |
| Landing Pages: Editor | Responsive and structure tools (Desktop/Tablet/Mobile, Reorder Blocks, undo/redo, full screen, Change template) | Left rail device switch and Reorder Blocks; undo/redo; "Change template" with confirm | ❌ Missing | No page editor. The email builder alone has Desktop/Mobile, 25-step undo/redo, full screen, drag-in from the palette and up/down arrows (`EmailBuilder.tsx:43`, `:59-90`, `:299-310`, `:384-388`); no tablet view, drag-to-reorder or template swap | Comes only with a page builder. | P3 | M |
| Landing Pages: Experimentation | A/B variations with traffic split (Copy/New Variation, % tabs, User Distribution drawer) | Variation tabs with % in the label; the split is shared across cohorts | ❌ Missing | Pages have no variants. A/B exists only on campaigns (variant B, split %, winner metric, duration; `schema.ts:455-464`), and variant B is applied only to email at send (`campaignService.ts:950-952`). Widgets have no variants (`schema.ts:1124-1145`) | Widget A/B would matter more than page A/B for this customer profile. | P3 | L |
| Landing Pages: Experimentation | Cohort personalization (saved cohorts on in-session attributes: query parameter, day, time, geo, device, OS, browser) | "+ Cohort" and "Add new cohort" with "Save for later use" | ❌ Missing | On-site targeting is a URL glob only (`widget.ts:154-163`). In-app campaigns can filter on stored profile data (`v1InAppMessages.ts:153-161`), but nothing renders them; no in-session attributes or reusable cohorts | Session-context targeting (UTM/query parameter, device, time) for widgets is the relevant subset. | P3 | L |
| Landing Pages: Experimentation | Cohort operators and values (is, contains, starts with, exists, in the following, Case Sensitive; weekday, hour, country, device, OS, browser lists) | Condition rows per attribute with value suggestions | ❌ Missing | Widget page matching is a glob (`widget.ts:154-163`). The segment engine's string operators run server-side on stored data only (`segments/src/evaluator.ts:468-473`) | Reuse segment operator semantics in an SDK-side evaluator if session targeting is built. | P3 | M |
| Landing Pages: Experimentation | Preview and test as a real user (by ID, Email, Mobile, GAID, IDFA) and preview without personalisation | "Preview Landing page" menu: "Test landing page" drawer or a blob-URL tab | ❌ Missing | No pages. The template preview auto-picks the most recently seen customer (or a placeholder) with no picker, though `POST /api/templates/preview` accepts `sampleCustomerId` (`routes/templates.ts:132-262`; `VariablePanel.tsx:92-98`). The campaign composer preview has a customer dropdown (`campaigns/create/page.tsx:2031-2048`). The widget preview is a static mock (`widgets/page.tsx:278-299`) | Add a customer search to the template preview now; reuse it for widgets later. | P3 | S |
| Landing Pages: Forms | Lead-capture forms (13 field types, Required, Label/Placeholder, Background; each field mapped to a user attribute) | Text, Email, Number, Paragraph, Select, Radio, Checkbox, Date, URL, Time, Hidden, Tel, Password; UserAttribute mapping | 🟡 Partial | Opt-in widgets collect phone plus optional name and email only (`schema.ts:1124-1145`; `widgets/page.tsx:252-259`). A submission resolves or creates the customer, records WhatsApp (and email) consent with the exact text and IP, and emits `optin_received`, behind a honeypot and a 5-per-hour IP limit (`v1OptIn.ts:81-216`). The "Phone required" toggle is cosmetic: the API rejects an empty phone regardless (`v1OptIn.ts:130-134`). No other field types or attribute mapping; `/widgets` is not in the navigation | A configurable field list (type, required, label, mapped attribute); honour "Phone required" on the server; link the page. | P2 | M |
| Landing Pages: Forms | Form submit behaviour (Message with Success/Error text; Redirect; button style) | Submit-button action popover (Message or Redirect) and style popover | 🟡 Partial | The widget shows a fixed "Thanks! We'll be in touch." or the API error, then closes (`widget.ts:262-277`). Only the button label is configurable (`widgets/page.tsx:213-215`) | Configurable success and error copy, a redirect URL, and a coupon reveal on success. | P3 | S |
| Landing Pages: Publishing | Domains and URL (default domain, "+ Add Custom domain", page path, query parameters for dynamic text) | URL and settings section linking to Settings > Custom Domain > LP | ❌ Missing | No hosted pages or per-project domains. The only configurable public base is `SHORTLINK_BASE_URL` (`shortLinkService.ts:8-15`); per-project custom domains are planned for Phase 2 (`docs/SHORTLINK_SERVICE_PLAN.md`) | Comes only with hosted pages. A custom short-link domain is the nearer need. | P3 | L |
| Landing Pages: Publishing | SEO and head scripts (meta title, description, favicon; scripts in `<head>`) | "Specify Meta tags" and "Add scripts" sections | ❌ Missing | No hosted pages | Comes only with hosted pages. | P3 | S |
| Landing Pages: Publishing | Page analytics in the list (Total views, Clicks, CTR; last updated on/by) | Sortable list columns; no separate report page | ❌ Missing | No pages. Widgets record no impressions or CTR; submissions appear only as `optin_received` events (`widget.ts`; `v1OptIn.ts:186-213`) | At minimum, track views and submissions per widget. | P3 | M |
| Coupons | Unique single-use coupon codes (coupon lists uploaded as CSV) | Lists of unique codes, each used once; no static or auto-generated codes seen | ❌ Missing | No coupon or discount tables, routes or UI. Searching coupon, discount_code, price_rule, discount_pool, code_redemption and promo_code finds only the `coupon_applied` event schema (`eventSchemas.ts:90-94`), the WhatsApp COPY_CODE parameter, the Gmail DiscountOffer annotation, the AI copywriter's manual coupon field and a flow template placeholder. Shopify OAuth scopes leave out `read_discounts` and `write_discounts` (`shopifyService.ts:14-24`). Planned only (`docs/WHATSAPP_CAROUSEL_ENGINE_ALIGNMENT.md` §5) | Table stakes for D2C welcome and cart-recovery offers. Build a code pool with atomic per-recipient reservation and CSV upload, plus auto-generated Shopify discount codes as a Shopify-native edge. | P0 | L |
| Coupons | Per-recipient allocation in messages (snippet `{{Coupons.CouponListName['<list>']}}`) | Snippet in any campaign; each recipient gets one unique code at send | 🟡 Partial | Flow steps can bind a per-send code to a WhatsApp COPY_CODE button (`wa_copy_code` from an event path, attribute or fixed value; `SendNodeConfigModal.tsx:98-105`; `whatsappUtils.ts:93-104`). Campaigns never bind it (only header media and URL buttons are seeded, `campaigns/create/page.tsx:107-130`), so they send the template's sample code. Email and SMS can only show a code already in event or profile data, or a hard-coded one: the AI discount block (`emailLayoutRenderer.ts:53-58`) and seed codes WELCOME10, COMEBACK15, BDAY20 (`seedTemplates.ts:90`, `:335`, `:454`). Nothing allocates from a pool | A coupon variable source (pool id) in the resolver, so every channel, including the COPY_CODE button, pulls a reserved unique code. | P0 | M |
| Coupons | Coupon list setup (name under 50 chars with live snippet, Expires on, CSV under 100 MB, sample file, File preview) | Single-page "Create coupons" form | ❌ Missing | No coupon route or page. Uploads accept only images, WhatsApp media and transcripts (`routes/assets.ts:13-81`) | A create form like MoEngage's (live snippet, expiry, CSV upload with preview) plus a "Generate in Shopify" option. | P1 | M |
| Coupons | Coupon list management (Total/Available, Active/Expired, dates; Edit, usage report, Archive; detail page with files table and append CSV) | List page and `/<id>` detail with a Manage menu | ❌ Missing | Nothing to manage. Redemption signals are only the order discount amount (`orders.discount`, `schema.ts:189`; order sync keeps `total_discounts` only, `syncWorker.ts:205`), the checkout `discount_code` captured by the Shopify web pixel (`lib/shopifyPixel.ts:56`) and a `coupon_applied` event schema (`eventSchemas.ts:90-94`) | Inventory counts and a usage report (allocated vs redeemed, matched to checkout codes). This also enables redemption attribution. | P1 | M |
| Coupons | Coupon alerts (up to 50 emails; Success, Failure, Shortage below N, Expiry N days before) | Alert configuration on the create form | ❌ Missing | No coupon alerts. A reusable admin-email alert pattern exists for WhatsApp template re-categorisation (`templateAlertService.ts:30-90`) | Shortage alerts first: a pool that runs dry would silently break WhatsApp cart-recovery flows. | P2 | S |
| Template library | Message template library | No standalone library linked from Content; message templates live inside each channel builder | 🟡 Partial | `/templates` is one library for email, SMS, push, in-app and WhatsApp: channel tabs with counts, search, preview, Starter Templates (13 email, 10 SMS, 10 push), Design with AI, WhatsApp approval status and quality (`templates/page.tsx:29-211`, `:433-559`; `routes/templates.ts:50-438`). But flow email steps never send it: the node saves the template's UUID (`SendNodeConfigModal.tsx:197-222`), `flowExecutor.ts:678-682` looks it up by name with no project filter, and on a miss sends a hard-coded "You left something behind!" email (`:721-727`). Auto-created flows seed same-named templates in every project (`flowService.ts:104-111`), so a name match can return another project's row | Look up by id within the project (and by name within the project for auto-created flows); the library is then ahead of anything in MoEngage's Content area. Then add pagination, tags and Duplicate. Same defect as modules 02 and 06. | P0 | S |

### Storees-only strengths

- **Brand kit filled from Shopify or a website scan, applied through tokens.** "Sync from Shopify" and "Scan website" (`settings/brand/page.tsx:85-110`; `brandKitService.ts`; `websiteBrandFetcher.ts`) feed `{{brand_header}}`, `{{brand_logo}}`, `{{brand_accent}}` and more (`templateContext.ts:126-138`). It works as a system-managed reusable block: the header and colours live in one place, which covers the most common content-block use with no upkeep.
- **Send-time product blocks: `{{cart_items}}` and a 4-product `{{recommended_products}}` grid** (`productBlockRenderer.ts:97-153`; `flowExecutor.ts:684-701`; `campaignService.ts:953-962`; AI designer toggles at `templates/ai/page.tsx:99-100`). Each recipient gets their own abandoned items and picks, while MoEngage content blocks are static snippets. Caveat: grid cards carry no product link yet.
- **Recommendations and live social proof inside WhatsApp, SMS, push and email variables, on every plan.** Smart-content options in the variable picker (`VariablePanel.tsx:318-324`), also used by the WhatsApp builder (`WhatsAppTemplateBuilder.tsx:930`); viewers in 30 days and buyers in 90 (`decisioningService.ts:120-166`); not an entitlement feature (`entitlementService.ts:15`). The WhatsApp AI chatbot appends three picks on a recommendation intent (`whatsappChatbotService.ts:161-163`). MoEngage locks recommendations to Enterprise and does not list WhatsApp as a channel.
- **AI Email Designer and AI rewrite of individual blocks** (`templates/ai/page.tsx`; `emailLayoutService.ts`; `BlockPropertyEditor.tsx:246-273`). It builds whole on-brand layouts, with cart and recommendation blocks, from a goal. MoEngage's Content area showed no AI authoring.
- **Per-send code bound to the WhatsApp copy-code button in flows** (`whatsappUtils.ts:93-104`; `SendNodeConfigModal.tsx:98-105`). Once a coupon pool exists, unique WhatsApp offers need only a pool lookup.
- **DPDP-grade consent capture in on-site opt-in forms, wired to flows** (`v1OptIn.ts:81-216`: exact consent text and IP recorded through `consentService`, honeypot, 5-per-hour IP limit, `optin_received` event; `schema.ts:1124-1145`; `widget.ts`). MoEngage lead forms map fields to attributes but showed no auditable consent wording.
- **Shopify catalog auto-sync feeding recommendations** (products and collections at `syncWorker.ts:340-360`; product and collection webhooks at `webhooks.ts:32-33`; `schema.ts:240-299`). MoEngage's recommendations need a catalog that could not be reached in this workspace.
- **Save-time personalisation check and preview with a resolved-variables table** (`templateLint.ts:45-152`; `routes/templates.ts:132-262`, `:328-332`; `VariablePanel.tsx:355-442`). Broken or unmapped tokens are caught before a send. Caveat: the create and edit pages do not show the rejection (see UX notes).
- **One cross-channel template library** for email, SMS, push, in-app and WhatsApp, with Meta approval status, quality rating and provider sync (`templates/page.tsx:172-199`, `:502-559`). MoEngage's Content area has no library. Flow email steps cannot use it until the P0 lookup defect is fixed.

### UX notes

- **Navigation (screenshots 001, 002, 096).** MoEngage groups reusable assets under one "Content" flyout, and every list follows the same pattern: breadcrumb, an info tooltip on the title, the primary button top right, then a toolbar with search, filters, a list/grid toggle and a filter icon, and a menu on each row. Storees has one admin-only "Templates" item (`Sidebar.tsx:61`), and its on-site widgets page is linked from nowhere. Add a Content group as blocks, coupons and recommendations ship.
- **List density (096, 101).** MoEngage defaults to a dense table (Name with copy icon, Content type, Status, Updated by with date, Usage, row menu), with grid cards as an option. Storees shows email, SMS and push only as large iframe cards with delete on hover; only the WhatsApp tab has a table (`templates/page.tsx:273-305`, `:309-373`). A default table with status, updated-by and usage fits the "information density over decoration" principle.
- **Token insertion (097, 102).** One click copies `{{ContentBlock['label']}}` and confirms with a toast. In Storees, users type `{{key}}` and then map it in the Variables panel (`VariablePanel.tsx:47-158`). The save-time check rejects unmapped tokens, but `/templates/create` and `/templates/[id]/edit` call the mutation with `onSuccess` only (`templates/create/page.tsx:232-254`; `templates/[id]/edit/page.tsx:99-111`) and the QueryClient has no global error handler (`app/providers.tsx:11-18`). A rejected save, or the 403 plan-cap error, therefore fails with no message. Add copy-token and inline '{{' autocomplete, and show save errors.
- **Coupon flows (092, 095, 108, 114).** Creation is one scrolling page: name with a live snippet preview, expiry, a CSV drop zone with sample file and preview, then alert thresholds. The list puts Total and Available side by side with an Active/Expired badge, and the detail page keeps the upload history. When Storees builds coupons, copy the live snippet and the available-count shortage alert, and add a "Generate in Shopify" source so merchants never handle CSVs; MoEngage cannot do that.
- **Empty states (025).** The landing-page empty state sells the feature with five use-case cards. Storees' widgets empty state is a bare "No widgets yet" line (`widgets/page.tsx:76-80`) with no presets. Add presets such as welcome offer, exit-intent cart saver and WhatsApp opt-in.
- **Experimentation in the editor (060, 061, 063).** Variations are tabs that show their traffic % in the label, with a User Distribution drawer and cohorts beside them. Storees' only A/B is on campaigns (`schema.ts:455-464`), and widgets are edited in a modal form with a static preview (`widgets/page.tsx:182-299`). If widgets get variants, copy the tab-with-% pattern.
- **Preview as a real user (076, 077).** MoEngage looks up a user by ID, email or mobile and renders the page with their data. Storees' template preview always uses the most recently seen customer and has no picker (`VariablePanel.tsx:92-98`), although the API accepts `sampleCustomerId` and the campaign preview has a customer dropdown (`campaigns/create/page.tsx:2031-2048`). Reuse that dropdown, with search, in the template editor.
- **Preview drawer (100).** It has a desktop/mobile toggle, a Details tab (type, updated by, description) and Duplicate/Edit in the header. Storees' template preview SlidePanel shows only the subject, date and an iframe, with Close and Edit (`templates/page.tsx:381-428`).
- **Code and preview side by side (013, 014).** MoEngage's HTML editor shows code next to a live preview, with full screen and refresh. Storees' campaign "Custom HTML" is a plain monospace textarea with the preview in a separate tab (`campaigns/create/page.tsx:2010-2022`), and the template editor has no HTML mode at all.
- **Recommendations positioning (018, 019).** MoEngage shows an Enterprise upsell hero. Storees already personalises with recommended products and social proof on every plan, but hides it in a "Smart content" group of the variable picker (`VariablePanel.tsx:318-324`) with no page to explain or configure it. A Recommendations page (strategy, rules with a product picker, preview through `/api/recommendations/resolve`) would make it a visible demo differentiator.
- **Where Storees is ahead.** The Templates page puts every channel in one library with per-channel counts and WhatsApp approval and quality badges (`templates/page.tsx:172-199`, `:502-559`). MoEngage's Content area has no equivalent; its templates are spread across channel builders.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status. Missing and partial rows were searched under synonyms across frontend, backend (routes, services, workers, schema, migrations), shared, segments, flows, ml, sdk and sdk-react:
- content block, contentBlock, snippet, partial, fragment, saved row or section, include, `{{>`;
- coupon, discount_code, discountCode, price_rule, priceRule, discount_pool, code_redemption, promo_code, COPY_CODE, total_discounts;
- landing page, page builder, grapesjs, unlayer, beefree, microsite, hosted page;
- recommend, decision, basedOn, last_viewed, collection rules, `/v1/recommend`, ML_SERVICE_URL, interactions, catalogues, items;
- experiment, variant, holdout, cohort, targetPages;
- tags, updated_by, created_by, version, template_version, usage, where-used, clipboard;
- codemirror, monaco, prism;
- preference, preferences_url, subscription categories, unsubscribe.

The template library row was checked for a UI route, an API endpoint and a working engine down to each send path.

**Status changes (3):**
- **Template library: ⭐ Storees better → 🟡 Partial, P0 S.** The library itself is real, but flow email steps never send it. The node saves the template UUID (`SendNodeConfigModal.tsx:197-222`), the executor looks it up by name with no project filter (`flowExecutor.ts:678-682`), and on a miss sends a hard-coded fallback email (`:721-727`). Auto-created flows seed the same template names in every project (`flowService.ts:104-111`), so a name match can return another tenant's template. Modules 02 and 06 report the same defect.
- **Model: AI-powered: 🟡 Partial → ❌ Missing, effort M → L.** The Python recommender is unreachable: nothing calls it, `/v1/recommend` takes no project id (`serve.py:157-162`), and trainers write one global model file (`train_cooccurrence.py:129-132`). Wiring it needs per-project storage and training, not just a call.
- **Versioning: ❌ Missing → ➖ N/A.** MoEngage showed no versioning either, so this is not a parity gap.

**Priority, effort and gap changes (2):**
- **Usage tracking: P2 → P1.** Templates are referenced by id at runtime: `campaigns.template_id` (`schema.ts:431`), the in-app serve query inner-joins it (`v1InAppMessages.ts:76`), and SMS/push providers read the body by id (`twilioProvider.ts:7-17` and peers). Deleting a template in use silently stops in-app campaigns and sends empty SMS/push from flows. The earlier evidence said campaigns keep nothing to count; they keep `template_id`.
- **Product recommendation engine: gap rewritten.** "Call the ML service from decisioningService" is not an M job, because the ML service is single-tenant. The recommendation is now SQL-first (bought-together and also-viewed in `decisioningService`, M), with `packages/ml` as a separate L item.

**Evidence corrections (no status change):**
- **Plain-text editor:** the N/160 counter is SMS-only (`templates/create/page.tsx:545-550`), not SMS and push.
- **Preference-center page:** all 13 starter emails link "Preferences" to `{{preferences_url}}` (`seedTemplates.ts:53`), which no code resolves. This strengthens the P1.
- **Lead-capture forms:** the "Phone required" toggle only changes the storefront form; `POST /api/v1/optin` rejects an empty phone regardless (`v1OptIn.ts:130-134`).
- **Recommendation channels:** added the WhatsApp AI chatbot as a consumer (`whatsappChatbotService.ts:161-163`) and the reason grid cards have no link (`toRenderable`, `decisioningService.ts:224-226`).
- **Item attribute-based model:** `product_collections` already exists (`schema.ts:293-299`), so matching collection rules is a small change.
- **Block types:** channel validation is at `routes/templates.ts:316-319`.

**Confirmed unchanged:** all other rows. Each missing row's searches found nothing, and each partial row's cited code exists and behaves as described. No row was left undecided.

### Screens

#### Content flyout (sidebar)

![Content flyout: Content Blocks, Recommendations, Landing Pages, Coupons](../screenshots/13-content-001-content-flyout.jpg)
*Content flyout: Content Blocks, Recommendations, Landing Pages, Coupons*

#### Content Blocks list

![Content blocks list, empty state with search, Updated by, Content type, list/grid toggle and filter icon](../screenshots/13-content-002-content-blocks-list-empty.jpg)
*Content blocks list, empty state with search, Updated by, Content type, list/grid toggle and filter icon*

![Title tooltip: reusable elements across campaigns, alerts and other content blocks](../screenshots/13-content-003-content-blocks-info-tooltip.jpg)
*Title tooltip: reusable elements across campaigns, alerts and other content blocks*

!['Select updated by' team-member multi-select (emails redacted locally before the capture)](../screenshots/13-content-004-cb-updated-by-filter.jpg)
*'Select updated by' team-member multi-select (emails redacted locally before the capture)*

![Content type filter: Plain text, HTML](../screenshots/13-content-005-cb-content-type-filter.jpg)
*Content type filter: Plain text, HTML*

![Filter content blocks panel: Teams, Status, Tags, Reset / Cancel / Apply](../screenshots/13-content-006-cb-filter-panel.jpg)
*Filter content blocks panel: Teams, Status, Tags, Reset / Cancel / Apply*

![Teams filter (no teams defined in this workspace)](../screenshots/13-content-007-cb-filter-teams-empty.jpg)
*Teams filter (no teams defined in this workspace)*

![Status filter: Active, Draft](../screenshots/13-content-008-cb-filter-status.jpg)
*Status filter: Active, Draft*

![Tags filter, Default group: activation, all users, engagement, incentive, onboarding, promotional, ratings, retention, transactional](../screenshots/13-content-009-cb-filter-tags.jpg)
*Tags filter, Default group: activation, all users, engagement, incentive, onboarding, promotional, ratings, retention, transactional*

![List view with 2 locally mocked rows (not real data): columns Name, Content type, Status, Updated by, Usage, three-dot menu](../screenshots/13-content-096-cb-list-columns-mock-rows.jpg)
*List view with 2 locally mocked rows (not real data): columns Name, Content type, Status, Updated by, Usage, three-dot menu*

![Name column tooltip: 'Copy the block label with copy icon.'](../screenshots/13-content-097-cb-name-copy-label-tooltip.png)
*Name column tooltip: 'Copy the block label with copy icon.'*

![Usage tooltip: usage of the block across campaigns, alerts and other content blocks](../screenshots/13-content-098-cb-usage-column-tooltip.jpg)
*Usage tooltip: usage of the block across campaigns, alerts and other content blocks*

![Row actions: View, Edit, Duplicate, Delete (none clicked except View)](../screenshots/13-content-099-cb-row-actions-menu.jpg)
*Row actions: View, Edit, Duplicate, Delete (none clicked except View)*

![View: 'Preview content blocks' drawer with Duplicate / Edit, desktop/mobile preview and Details (Communication type: Engage, Content type, Updated by, Description)](../screenshots/13-content-100-cb-preview-drawer-details.jpg)
*View: 'Preview content blocks' drawer with Duplicate / Edit, desktop/mobile preview and Details (Communication type: Engage, Content type, Updated by, Description)*

![Grid view cards: thumbnail, name, copy icon, menu, Engage, Usage and Updated by](../screenshots/13-content-101-cb-grid-view-cards.jpg)
*Grid view cards: thumbnail, name, copy icon, menu, Engage | Usage | Updated by*

![Copy icon shows the ContentBlock label tag and the toast 'Successfully copied to clipboard'](../screenshots/13-content-102-cb-copy-label-snippet-toast.jpg)
*Copy icon shows `{{ContentBlock['<label>']}}` and the toast 'Successfully copied to clipboard'*

#### Create content block

![Create content block form, Plain Text type: Name, Description, Tags, type, Content (0/5000), Publish](../screenshots/13-content-010-create-content-block-plain-text.jpg)
*Create content block form, Plain Text type: Name, Description, Tags, type, Content (0/5000), Publish*

![Name rules tooltip: 5-100 chars, alphabets, numbers, underscores and hyphens](../screenshots/13-content-011-cb-name-rules-tooltip.jpg)
*Name rules tooltip: 5-100 chars, alphabets, numbers, underscores and hyphens*

![Tags dropdown with search, Default tags and a 'Manage tags' link](../screenshots/13-content-012-cb-tags-dropdown-manage-tags.jpg)
*Tags dropdown with search, Default tags and a 'Manage tags' link*

![HTML type: code editor plus preview pane; Edit in full screen, Uploads, Preview, Refresh](../screenshots/13-content-013-cb-html-type-editor.jpg)
*HTML type: code editor plus preview pane; Edit in full screen, Uploads, Preview, Refresh*

![HTML editor in full screen](../screenshots/13-content-014-cb-html-full-screen.jpg)
*HTML editor in full screen*

![Uploads: 'Generate URL for your image files' (drag and drop or upload; jpg/jpeg/png/gif up to 5MB)](../screenshots/13-content-015-cb-generate-image-url-modal.jpg)
*Uploads: 'Generate URL for your image files' (drag & drop / upload; jpg/jpeg/png/gif up to 5MB)*

![Preview mode, desktop frame](../screenshots/13-content-016-cb-preview-desktop.jpg)
*Preview mode, desktop frame*

![Preview mode, mobile frame](../screenshots/13-content-017-cb-preview-mobile.jpg)
*Preview mode, mobile frame*

#### Recommendations (Smart Recommendations, locked)

![Smart Recommendations upsell hero with the Enterprise-plan lock banner](../screenshots/13-content-018-recommendations-locked-hero.jpg)
*Smart Recommendations upsell hero with the Enterprise-plan lock banner*

![Tab Multiple Models: Product attribute-based, User actions-based, AI-powered](../screenshots/13-content-019-reco-tab-multiple-models.jpg)
*Tab Multiple Models: Product attribute-based, User actions-based, AI-powered*

![Tab Omni-Channel Orchestration: website plus Email, Push, SMS, In-App, On-Site Messaging, Cards](../screenshots/13-content-020-reco-tab-omnichannel.jpg)
*Tab Omni-Channel Orchestration: website plus Email, Push, SMS, In-App, On-Site Messaging, Cards*

![Tab Powered by Merlin AI: real-time interactions, preferences, engagement patterns](../screenshots/13-content-021-reco-tab-merlin-ai.jpg)
*Tab Powered by Merlin AI: real-time interactions, preferences, engagement patterns*

![Tab Personalized Experience: 1-1 tailored recommendations](../screenshots/13-content-022-reco-tab-personalized-experience.jpg)
*Tab Personalized Experience: 1-1 tailored recommendations*

![Tab Simplified Product Discovery: without vs with recommendations](../screenshots/13-content-023-reco-tab-simplified-discovery.jpg)
*Tab Simplified Product Discovery: without vs with recommendations*

#### Create recommendation (direct URL)

![Recommendation wizard shell (Select recommendation model, Create recommendation) with the 'Not authorized' toast](../screenshots/13-content-024-reco-create-direct-url-not-authorized.jpg)
*Recommendation wizard shell (Select recommendation model, Create recommendation) with the 'Not authorized' toast*

#### Landing pages list

![Landing pages empty state with 5 template cards and Create landing page](../screenshots/13-content-025-landing-pages-list-empty-templates.jpg)
*Landing pages empty state with 5 template cards and Create landing page*

![List view with locally mocked rows: Name, Status, Actions, Last updated on, Total views, Clicks, CTR (emails redacted)](../screenshots/13-content-103-lp-list-columns-mock-rows.jpg)
*List view with locally mocked rows: Name, Status, Actions, Last updated on, Total views, Clicks, CTR (emails redacted)*

![Status filter: Archived, Draft, Active](../screenshots/13-content-104-lp-list-status-filter.jpg)
*Status filter: Archived, Draft, Active*

![Mock rows in Active / Draft / Archived states; Copy URL and Preview action icons](../screenshots/13-content-105-lp-list-active-draft-archived-mock.jpg)
*Mock rows in Active / Draft / Archived states; Copy URL and Preview action icons*

![Active page menu: Edit, Duplicate, Archive](../screenshots/13-content-106-lp-row-menu-active.jpg)
*Active page menu: Edit, Duplicate, Archive*

![Archived page menu: Unarchive](../screenshots/13-content-107-lp-row-menu-archived-unarchive.jpg)
*Archived page menu: Unarchive*

#### Create landing page: template gallery, URL and settings

![Create landing page: name, tags, Save, Blank Templates card, Templates (18)](../screenshots/13-content-026-lp-create-template-gallery.jpg)
*Create landing page: name, tags, Save, Blank Templates card, Templates (18)*

![Template rows 1-2 (hover shows 'Select template') and the URL and settings section](../screenshots/13-content-027-lp-templates-rows1-2-url-settings.jpg)
*Template rows 1-2 (hover shows 'Select template') and the URL and settings section*

![Templates: Contact Us, Services, Travel Offers, Product Launch, Package Offers, Product Listing, Webinar, FAQs, Daily Deals, Sale](../screenshots/13-content-028-lp-templates-rows2-3.jpg)
*Templates: Contact Us, Services, Travel Offers, Product Launch, Package Offers, Product Listing, Webinar, FAQs, Daily Deals, Sale*

![Templates: Testimonials, Event details, E-book download](../screenshots/13-content-029-lp-templates-row4.jpg)
*Templates: Testimonials, Event details, E-book download*

![Domain name: landing-pages-01.mnge.co and + Add Custom domain](../screenshots/13-content-030-lp-domain-dropdown.jpg)
*Domain name: landing-pages-01.mnge.co and + Add Custom domain*

![Query parameters tooltip: parameters used for dynamic text replacement appear here](../screenshots/13-content-031-lp-query-params-tooltip.jpg)
*Query parameters tooltip: parameters used for dynamic text replacement appear here*

![Specify Meta tags: Meta tag title, Meta tag description, Favicon (jpg/jpeg/png/ico/gif/webp up to 5 MB)](../screenshots/13-content-032-lp-meta-tags-favicon.jpg)
*Specify Meta tags: Meta tag title, Meta tag description, Favicon (jpg/jpeg/png/ico/gif/webp up to 5 MB)*

![Add scripts: head scripts for analytics, API or authentication](../screenshots/13-content-033-lp-add-scripts.jpg)
*Add scripts: head scripts for analytics, API or authentication*

![Landing page tags dropdown with Manage tags](../screenshots/13-content-034-lp-select-tags-dropdown.jpg)
*Landing page tags dropdown with Manage tags*

![Template card hover: Select template](../screenshots/13-content-035-lp-template-hover-select.jpg)
*Template card hover: Select template*

![Blank Templates card hover: Select](../screenshots/13-content-036-lp-blank-template-hover-select.jpg)
*Blank Templates card hover: Select*

!['Select a template' modal: a single Blank Template with the Drag and drop badge](../screenshots/13-content-037-lp-select-a-template-modal-dragdrop.jpg)
*'Select a template' modal: a single Blank Template with the Drag & drop badge*

#### Landing page editor: canvas, block library, elements, styling

![Blank drag-and-drop editor: A/B test, Cohort, Preview Landing page, left rail, ADD A NEW BLOCK](../screenshots/13-content-038-lp-dragdrop-editor-blank.jpg)
*Blank drag-and-drop editor: A/B test, Cohort, Preview Landing page, left rail, ADD A NEW BLOCK*

![Block library (Blocks tab, Kit #2): Styles Light/Dark, Categories, Create your own](../screenshots/13-content-039-lp-block-picker-kit2.jpg)
*Block library (Blocks tab, Kit #2): Styles Light/Dark, Categories, Create your own*

![Kit #2 categories: All 502, Free 335, Hero 140, Features 100, Contact 40, Gallery 24, CTA 50, Text 34, Team 22, Pricing 30, Testimonials 30, Header 18, Footers 12](../screenshots/13-content-040-lp-block-picker-categories.jpg)
*Kit #2 categories: All 502, Free 335, Hero 140, Features 100, Contact 40, Gallery 24, CTA 50, Text 34, Team 22, Pricing 30, Testimonials 30, Header 18, Footers 12*

![Block kit dropdown: Kit #1, Kit #2](../screenshots/13-content-041-lp-block-kit-dropdown.jpg)
*Block kit dropdown: Kit #1, Kit #2*

![Kit #1: Light 134 / Dark 134; All 268, Free 236, Cover 44, Features 64, Contact 22, CTA 10, Blog 38, Gallery 22 and more](../screenshots/13-content-042-lp-block-picker-kit1.jpg)
*Kit #1: Light 134 / Dark 134; All 268, Free 236, Cover 44, Features 64, Contact 22, CTA 10, Blog 38, Gallery 22 and more*

![Layouts tab: 156 layout sets by industry category](../screenshots/13-content-043-lp-layouts-tab.jpg)
*Layouts tab: 156 layout sets by industry category*

![Layout set hover: 'Zoo - 5 layouts'](../screenshots/13-content-044-lp-layout-hover-zoo.jpg)
*Layout set hover: 'Zoo - 5 layouts'*

![Layout set detail: page thumbnails, 'Replace global styling', 'Import This Layout' (not clicked)](../screenshots/13-content-045-lp-layout-set-zoo-import.jpg)
*Layout set detail: page thumbnails, 'Replace global styling', 'Import This Layout' (not clicked)*

![Add Elements: Column, Row; Essentials Text, Image, Button, Icon, Spacer, Map, Form, Line, Menu; Media Gallery, Video, Audio, Playlist](../screenshots/13-content-046-lp-add-elements-panel.jpg)
*Add Elements: Column, Row; Essentials Text, Image, Button, Icon, Spacer, Map, Form, Line, Menu; Media Gallery, Video, Audio, Playlist*

![Add Elements, Content: Icon Box, Embed, Rating, Alert, Counter, Countdown, Progress, Calendly, Carousel, Tabs, Accordion, Switcher, Table, Timeline; Social: Facebook, Twitter, Comments](../screenshots/13-content-047-lp-add-elements-content-social.jpg)
*Add Elements, Content: Icon Box, Embed, Rating, Alert, Counter, Countdown, Progress, Calendly, Carousel, Tabs, Accordion, Switcher, Table, Timeline; Social: Facebook, Twitter, Comments*

![Add Elements 'Edit' mode: checkmarks to customise which elements show in the palette](../screenshots/13-content-048-lp-add-elements-edit-mode.jpg)
*Add Elements 'Edit' mode: checkmarks to customise which elements show in the palette*

![Reorder Blocks panel](../screenshots/13-content-049-lp-reorder-blocks.jpg)
*Reorder Blocks panel*

![Styling panel: Current Style, colour palette, text styles (Paragraph, Subtitle, Above Title, Heading 1-6, Button), Add New](../screenshots/13-content-050-lp-styling-panel.jpg)
*Styling panel: Current Style, colour palette, text styles (Paragraph, Subtitle, Above Title, Heading 1-6, Button), Add New*

![Current Style dropdown (only 'Default')](../screenshots/13-content-051-lp-current-style-dropdown.jpg)
*Current Style dropdown (only 'Default')*

![Device switch: Desktop, Tablet, Mobile](../screenshots/13-content-052-lp-device-menu.jpg)
*Device switch: Desktop, Tablet, Mobile*

![Section/block toolbar icons (settings, duplicate and delete among them)](../screenshots/13-content-053-lp-block-toolbar.jpg)
*Section/block toolbar icons (settings, duplicate and delete among them)*

![Block settings: Width (Boxed, 100%), Height (Auto), Styling, Effects](../screenshots/13-content-054-lp-block-width-height-popover.jpg)
*Block settings: Width (Boxed, 100%), Height (Auto), Styling, Effects*

![Effects: None, Bounce, Fade, Rotate, Slide, Zoom, Attention](../screenshots/13-content-055-lp-block-effects.jpg)
*Effects: None, Bounce, Fade, Rotate, Slide, Zoom, Attention*

![Styling, Basic: Padding, Margin, Corner, Blending Mode, Dividers, Type](../screenshots/13-content-056-lp-block-styling-basic.jpg)
*Styling, Basic: Padding, Margin, Corner, Blending Mode, Dividers, Type*

![Styling, Advanced: Show on Desktop, Z-index, Block Name, CSS Class, Custom Attributes, Custom CSS, Hover Transition, HTML Tag](../screenshots/13-content-057-lp-block-styling-advanced.jpg)
*Styling, Advanced: Show on Desktop, Z-index, Block Name, CSS Class, Custom Attributes, Custom CSS, Hover Transition, HTML Tag*

![Text element toolbar: typography, frame, alignment, B/I/U/S, text case, link, settings, duplicate, delete](../screenshots/13-content-072-lp-text-element-toolbar.jpg)
*Text element toolbar: typography, frame, alignment, B/I/U/S, text case, link, settings, duplicate, delete*

![Typography: fonts (Noto Serif, Montserrat, Lato, Overpass, Red Hat Text, + Add New Font), size, weight, line height, letter spacing](../screenshots/13-content-073-lp-text-typography-popover.jpg)
*Typography: fonts (Noto Serif, Montserrat, Lato, Overpass, Red Hat Text, + Add New Font), size, weight, line height, letter spacing*

![Text settings: Gap Above / Below, HTML Tag (H1), Styling, Effects](../screenshots/13-content-074-lp-text-settings-gap-htmltag.jpg)
*Text settings: Gap Above / Below, HTML Tag (H1), Styling, Effects*

![Column toolbar (background, frame, link, add, code, settings, duplicate, delete)](../screenshots/13-content-078-lp-column-toolbar.jpg)
*Column toolbar (background, frame, link, add, code `<>`, settings, duplicate, delete)*

#### Landing page editor: A/B variations, cohorts, preview/test, forms

![Template menu: Change template](../screenshots/13-content-058-lp-template-menu-change-template.jpg)
*Template menu: Change template*

![+ A/B test menu: Copy Variation, + New Variation](../screenshots/13-content-059-lp-ab-test-menu.jpg)
*+ A/B test menu: Copy Variation, + New Variation*

![Variation tabs 1 (50%) / 2 (50%), + Variation, + Cohort, User Distribution (Variation 2 loaded the Promotion template)](../screenshots/13-content-060-lp-ab-variations-tabs.jpg)
*Variation tabs 1 (50%) / 2 (50%), + Variation, + Cohort, User Distribution (Variation 2 loaded the Promotion template)*

![User distribution drawer: objective, split bar, per-variation %, Reset distribution](../screenshots/13-content-061-lp-user-distribution-drawer.jpg)
*User distribution drawer: objective, split bar, per-variation %, Reset distribution*

![Cohort popover: no cohorts yet; cohorts are saved for reuse across all landing pages](../screenshots/13-content-062-lp-cohort-popover.jpg)
*Cohort popover: no cohorts yet; cohorts are saved for reuse across all landing pages*

![Add new cohort: Cohort name, In-session attributes, Save for later use (cancelled)](../screenshots/13-content-063-lp-add-new-cohort-modal.jpg)
*Add new cohort: Cohort name, In-session attributes, Save for later use (cancelled)*

![In-session attributes tooltip: group visitors by user type, location, browser/device and more](../screenshots/13-content-064-lp-in-session-attributes-tooltip.jpg)
*In-session attributes tooltip: group visitors by user type, location, browser/device and more*

![Attributes: Query Parameter, Day of the week, Time of the Day, GeoLocation, Device Type, Operating System, Browser Type](../screenshots/13-content-065-lp-cohort-attribute-list.jpg)
*Attributes: Query Parameter, Day of the week, Time of the Day, GeoLocation, Device Type, Operating System, Browser Type*

![Query Parameter condition: param name, operator, value, Case Sensitive](../screenshots/13-content-066-lp-cohort-query-parameter.jpg)
*Query Parameter condition: param name, operator, value, Case Sensitive*

![Query Parameter operators (is ... not in the following)](../screenshots/13-content-067-lp-cohort-query-operators.jpg)
*Query Parameter operators (is ... not in the following)*

![GeoLocation: in the following / not in the following + Select Country](../screenshots/13-content-068-lp-cohort-geolocation.jpg)
*GeoLocation: in the following / not in the following + Select Country*

![Device Type values: Desktop, Mobile, Tablet](../screenshots/13-content-069-lp-cohort-device-type-values.jpg)
*Device Type values: Desktop, Mobile, Tablet*

![Operating System values: Android, iOS, Windows, Mac, Linux, Others](../screenshots/13-content-070-lp-cohort-os-values.jpg)
*Operating System values: Android, iOS, Windows, Mac, Linux, Others*

![GeoLocation country 'Value Suggestions' list](../screenshots/13-content-071-lp-cohort-country-suggestions.jpg)
*GeoLocation country 'Value Suggestions' list*

![Preview menu: Preview with personalisation / without personalisation](../screenshots/13-content-075-lp-preview-menu-personalisation.jpg)
*Preview menu: Preview with personalisation / without personalisation*

![Test landing page drawer: Select user by, User identifier value, Fetch user data, Test](../screenshots/13-content-076-lp-test-landing-page-drawer.jpg)
*Test landing page drawer: Select user by, User identifier value, Fetch user data, Test*

![Select user by: ID, Email Id, Mobile Number, Google Advertising Identifier, IOS Advertising Identifier](../screenshots/13-content-077-lp-test-select-user-by.jpg)
*Select user by: ID, Email Id, Mobile Number, Google Advertising Identifier, IOS Advertising Identifier*

![In-app confirm: change the current template?](../screenshots/13-content-079-lp-change-template-confirm.jpg)
*In-app confirm: change the current template?*

![Lead Capture template with a lead form (Full Name, Email, Phone, Message)](../screenshots/13-content-080-lp-lead-capture-template-form.jpg)
*Lead Capture template with a lead form (Full Name, Email, Phone, Message)*

![Form field toolbar](../screenshots/13-content-081-lp-form-toolbar.jpg)
*Form field toolbar*

![Field tab: Type, Required, Spacing](../screenshots/13-content-082-lp-form-field-settings.jpg)
*Field tab: Type, Required, Spacing*

![Field types (first page): Text, Email, Number, Paragraph, Select ...](../screenshots/13-content-083-lp-form-field-types.jpg)
*Field types (first page): Text, Email, Number, Paragraph, Select ...*

![Submit button toolbar](../screenshots/13-content-084-lp-form-button-toolbar.jpg)
*Submit button toolbar*

![Button style: Button/Icon tabs, Size, Fill, Corner](../screenshots/13-content-085-lp-button-style-popover.jpg)
*Button style: Button/Icon tabs, Size, Fill, Corner*

![Form submit action, Message: Success / Error text](../screenshots/13-content-086-lp-form-submit-message.jpg)
*Form submit action, Message: Success / Error text*

![Form submit action, Redirect: Go to URL](../screenshots/13-content-087-lp-form-submit-redirect.jpg)
*Form submit action, Redirect: Go to URL*

![Field Advanced tab: Label, Placeholder, UserAttribute mapping](../screenshots/13-content-088-lp-field-advanced-user-attribute.jpg)
*Field Advanced tab: Label, Placeholder, UserAttribute mapping*

![UserAttribute options: Unique Id, First Seen, Last Seen, LTV, No. of Conversions ...](../screenshots/13-content-089-lp-user-attribute-mapping-list.jpg)
*UserAttribute options: Unique Id, First Seen, Last Seen, LTV, No. of Conversions ...*

#### Coupons list

![Coupons empty state with '+ Coupon list'](../screenshots/13-content-090-coupons-empty-state.jpg)
*Coupons empty state with '+ Coupon list'*

![Coupons tooltip: unique coupon codes usable once, distributed via messaging channels](../screenshots/13-content-091-coupons-info-tooltip.jpg)
*Coupons tooltip: unique coupon codes usable once, distributed via messaging channels*

![Coupon lists with local mock rows: snippet, Total / Available coupons, Status, Date created, Expiry date](../screenshots/13-content-108-coupons-list-columns-mock-rows.jpg)
*Coupon lists with local mock rows: snippet, Total / Available coupons, Status, Date created, Expiry date*

![Personalization snippet tooltip: jinja code for campaigns](../screenshots/13-content-109-coupons-personalization-snippet-tooltip.png)
*Personalization snippet tooltip: jinja code for campaigns*

![+ Coupon List disabled with 'You do not have sufficient permission' (mock-data state)](../screenshots/13-content-110-coupons-add-list-permission-tooltip.jpg)
*+ Coupon List disabled with 'You do not have sufficient permission' (mock-data state)*

![Active list menu: Edit coupon list, Generate usage report, Archive coupon list](../screenshots/13-content-111-coupons-row-menu-active.jpg)
*Active list menu: Edit coupon list, Generate usage report, Archive coupon list*

![Expired list menu: Edit coupon list, Generate usage report](../screenshots/13-content-112-coupons-row-menu-expired.jpg)
*Expired list menu: Edit coupon list, Generate usage report*

#### Create coupon list

![Create coupons form: name with snippet, Expires on, CSV upload, File preview, Alert configuration](../screenshots/13-content-092-create-coupon-list-form.jpg)
*Create coupons form: name with snippet, Expires on, CSV upload, File preview, Alert configuration*

![Name tooltip: under 50 chars; special characters replaced with an underscore](../screenshots/13-content-093-coupon-name-rules-tooltip.jpg)
*Name tooltip: under 50 chars; special characters replaced with '`_`'*

![Expires on date picker](../screenshots/13-content-094-coupon-expiry-date-picker.jpg)
*Expires on date picker*

![Alerts: Success, Failure, Coupon shortage threshold, Expiry alert N days before; Create](../screenshots/13-content-095-coupon-alert-configuration.jpg)
*Alerts: Success, Failure, Coupon shortage threshold, Expiry alert N days before; Create*

#### Coupon list detail

![Detail page with a fake ID (404): summary cards and '+ Add Coupons file' empty state](../screenshots/13-content-113-coupon-detail-not-found-empty-files.jpg)
*Detail page with a fake ID (404): summary cards and '+ Add Coupons file' empty state*

![Detail with mock data: Total / Available coupons, Status, Created on/by, snippet; files table](../screenshots/13-content-114-coupon-detail-summary-files-table.jpg)
*Detail with mock data: Total / Available coupons, Status, Created on/by, snippet; files table*

![Manage menu: Edit coupon list, Generate usage report, Archive coupon list](../screenshots/13-content-115-coupon-detail-manage-menu.jpg)
*Manage menu: Edit coupon list, Generate usage report, Archive coupon list*

![File row menu: 'You do not have permission to perform this action' (mock-data state)](../screenshots/13-content-116-coupon-file-row-permission-tooltip.jpg)
*File row menu: 'You do not have permission to perform this action' (mock-data state)*
