## 02. Engage > Campaign builder: Email (all steps, editor, delivery types)

Storees covers the basic one-time email campaign end to end: a 3-step wizard, an in-house block editor, per-recipient variable mapping with save-time checks, AI copy and block rewrites, Gmail deal annotations, attachments, UTM tagging and a campaign control group. It falls well behind MoEngage's Beefree editor on authoring depth (text is edited as raw HTML, 10 block types, no saved rows, content blocks, conditional content, coupons, locales or A/B/n), and several controls that look finished do not work: the typed preheader is dropped, the From address is never checked against verified senders, and the A/B "auto-send winner" switch does nothing. Two P0 defects come first: an email template picked for a triggered (Flow) send is never found, so a hard-coded fallback email goes out instead (and the name lookup can pull another project's template), and every campaign email ships with an empty unsubscribe link and no List-Unsubscribe header.

### MoEngage overview

MoEngage's email builder offers three delivery types: One Time, Periodic and Event Triggered (no business-event, device or location triggers for email). Each is a 3-step wizard (Target users > Content > Schedule and goals) whose step tabs validate earlier steps before moving on.

- **Step 1:** campaign name, tags, content type (Promotional or Transactional), the attribute that holds the email address, the audience, and global/campaign control groups. A red banner appears when no SMTP connector is configured.
- **Step 2, template choice:** a Beefree drag-and-drop editor with Blank/2/3/4-column starters and about 125 pre-built templates (search, preview), a Custom HTML editor that also accepts a zip upload, and saved templates.
- **Step 2, email details:** subject and preheader with Merlin AI buttons; connector, verified From, Reply-to and personalisable Cc/Bcc; attachments from a local file, a URL or a per-user file; Gmail Promotions annotations (logo, deal, product carousel, preview).
- **Step 2, personalisation:** a Jinja-based drawer with fallbacks (including "Do not send"), reusable content blocks, aux data, coupon lists, conditional blocks, custom Jinja, and a natural-language Jinja generator.
- **Step 2, variants and testing:** A/B/n variations with manual or Merlin auto-optimised splits, locales, preview as a chosen user, inbox rendering tests, test sends and UTM parameters.
- **Editor:** 18 blocks, saved rows, row display conditions, dynamic images, an image editor, stock photos, change history and a dark-mode preview.

The capture was **partial**:
- Step 3 (Schedule and goals) could not be reached for any delivery type, because the workspace has no SMTP connector or verified sender and Content validation blocks the step. Send-time options, recurrence, goals and delivery controls were therefore not seen.
- Event Triggered could not get past step 1 (no tracked events).
- No Merlin generation, inbox test, test send, upload, save or download was run.

| Page visited | URL path |
|---|---|
| New Campaign modal: Email delivery types | `/v4/campaigns/all` (Create campaign modal > Email) |
| Email One Time, Step 1: Target users | `/v4/email/create/one-time` |
| Email Step 2 Content: template chooser | `/v4/email/create/one-time` (step 2, before a template is chosen) |
| Email Step 2 Content: Email details (sender, attachments, Gmail annotation) | `/v4/email/create/one-time` (step 2, after a template is chosen) |
| Email Personalization drawer (personalization picker) | `/v4/email/create/one-time` (drawer from "Click to personalize" or editor More > Personalize) |
| Jinja AI (Beta) | `/v4/developers/jinja-ai` (opens in a new tab) |
| Merlin AI: Generate content drawer | `/v4/email/create/one-time` (Subject/Preview Text wand, or Merlin "Create new") |
| Variations (A/B test), Locales and User distribution | `/v4/email/create/one-time` (step 2) |
| Drag-and-drop email editor (Beefree-based) | `/v4/email/create/one-time` (step 2, Blank Template, Edit in full screen) |
| Preview and Test Campaign | `/v4/email/create/one-time` (Preview page and bottom of step 2) |
| Custom HTML editor | `/v4/email/create/one-time` (Custom HTML editor > Edit/Paste HTML template) |
| Email Periodic, Step 1 | `/v4/email/create/periodic` |
| Email Event Triggered, Step 1 (trigger config) | `/v4/email/create/event-trigger` |

### Storees counterpart

- **`/campaigns`** (`packages/frontend/src/app/(dashboard)/campaigns/page.tsx`): the "Create Campaign" panel picks Email, then One Time or Periodic. Event Triggered is a disabled "Soon" card. It opens `/campaigns/create?channel=email&type=one-time|periodic`.
- **`/campaigns/create`** (`packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx`): the 3-step wizard (Target Users, Content, Schedule and Goals).
  - Step 2 for email is `Step2EmailContent`: My Templates / Visual Builder / Custom HTML / Preview tabs, then Email Details, AI Copywriter, Gmail Annotation, UTM Parameters and Attachments cards, then the Variables panel and `AbTestSection`.
  - The visual editor is in-house: `packages/frontend/src/components/email-builder/EmailBuilder.tsx` and `BlockPropertyEditor.tsx`, compiled to table-based HTML by `packages/frontend/src/lib/emailCompiler.ts`.
  - Personalisation is a mapping panel, `packages/frontend/src/components/templates/VariablePanel.tsx`; AI copy is `packages/frontend/src/components/campaigns/CampaignAiCopywriter.tsx`.
- **`/campaigns/[id]`** shows Preview, Test Email and Send Now; **`/campaigns/[id]/edit`** edits drafts.
- **`/templates`**, **`/templates/create`** and **`/templates/ai`** (AI Email Designer) manage reusable templates.
- **Backend:**
  - `packages/backend/src/routes/campaigns.ts`: create, lint, audience preview, test-email, send.
  - `packages/backend/src/services/campaignService.ts`: staging and the email send path (`sendOneRecipient`, lines 909-1010).
  - `packages/backend/src/services/emailService.ts` (interpolation, dynamic images, UTM, provider fallback), `emailProviderRegistry.ts` (Resend, SendGrid, Postmark, Mailgun, SES), `gmailAnnotation.ts`, `campaignAttachmentService.ts`, `templateContext.ts`, `templateLint.ts`, `variableSources.ts`, `contentLint.ts`.
  - `packages/backend/src/workers/campaignScheduler.ts` for scheduled and periodic runs.
- **Event-triggered email** exists only in Flows: `packages/frontend/src/components/flows/SendNodeConfigModal.tsx`, executed by `packages/backend/src/services/flowExecutor.ts`.

**Path key for the Evidence column.** Line numbers are at commit `2063cdc`.

| Short name | Repo path |
|---|---|
| `campaigns/page.tsx`, `create/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx` | `packages/frontend/src/app/(dashboard)/campaigns/…` |
| `templates/page.tsx`, `templates/ai/page.tsx` | `packages/frontend/src/app/(dashboard)/templates/…` |
| `EmailBuilder.tsx`, `BlockPropertyEditor.tsx` | `packages/frontend/src/components/email-builder/` |
| `emailCompiler.ts`, `emailTypes.ts`, `aiEmailToBuilder.ts` | `packages/frontend/src/lib/` |
| `VariablePanel.tsx` | `packages/frontend/src/components/templates/` |
| `CampaignAiCopywriter.tsx` | `packages/frontend/src/components/campaigns/` |
| `TemplatePreviewCard.tsx` | `packages/frontend/src/components/shared/` |
| `SendNodeConfigModal.tsx` | `packages/frontend/src/components/flows/` |
| `hooks/useCampaigns.ts` | `packages/frontend/src/hooks/useCampaigns.ts` |
| `routes/*.ts`, `index.ts` | `packages/backend/src/routes/`, `packages/backend/src/index.ts` |
| `campaignService.ts`, `emailService.ts`, `emailProviderRegistry.ts`, `gmailAnnotation.ts`, `campaignAttachmentService.ts`, `templateContext.ts`, `templateLint.ts`, `variableSources.ts`, `contentLint.ts`, `flowExecutor.ts`, `flowService.ts`, `emailLayoutService.ts`, `emailLayoutRenderer.ts`, `emailDomainService.ts`, `unsubscribeService.ts`, `resendProvider.ts`, `campaignAnalyticsService.ts`, `deliveryService.ts`, `llmService.ts` | `packages/backend/src/services/` |
| `providers/*.ts` | `packages/backend/src/services/providers/` |
| `campaignScheduler.ts`, `triggerWorker.ts` | `packages/backend/src/workers/` |
| `schema.ts` | `packages/backend/src/db/schema.ts` |
| `seedTemplates.ts` | `packages/backend/src/data/seedTemplates.ts` |
| `types.ts`, `utils.ts` | `packages/shared/src/` |
| `flows/src/templates.ts` | `packages/flows/src/templates.ts` |

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Delivery types | One Time delivery type | Send to the target audience now or at a scheduled time | ✅ Full | `campaigns/page.tsx:66`; ASAP, fixed, user timezone, best time (`create/page.tsx:3349-3384`); scheduler dispatches due campaigns (`campaignScheduler.ts:46-73`) | No gap at the delivery-type level (MoEngage step 3 was not captured). Note: "User's timezone" converts the anchor time into the recipient's zone and straight back (`campaignService.ts:1153-1166`), so everyone gets the same instant. | — | — |
| Delivery types | Periodic delivery type | Recurring sends; recurrence is set in step 3 (not reachable) | 🟡 Partial | UI saves `{frequency, time, endsAt}` (`create/page.tsx:562-568`, `types.ts:224-230`). The scheduler reads `timeOfDay`, never `time` or `endsAt`, re-sends 23 h or more after the last run, and deletes `campaign_sends` and zeroes the counters (`campaignScheduler.ts:16-44,75-121`). Periodic campaigns are created as `draft` (`routes/campaigns.ts:241`) and re-run only once `status='sent'` | The chosen send time and end date are ignored, so runs drift and never stop. The first run needs a manual Send Now, and each run wipes the previous run's recipients and stats. Same as module 01. | P1 | M |
| Delivery types | Event Triggered delivery type | An email triggered by a tracked user action, as its own campaign type | 🟡 Partial | Disabled "Soon" card (`campaigns/page.tsx:68`). Only via Flows: the send node saves the template's UUID (`SendNodeConfigModal.tsx:197-221,393`), but `flowExecutor.ts:678-682` looks up `email_templates` by **name** with no `projectId` filter and otherwise sends a hard-coded "You left something behind!" email (`flowExecutor.ts:721-727`). Auto-created flows use the same template names in every project (`flows/src/templates.ts:58,65`, `flowService.ts:104-111`). Flow emails pass no From (`flowExecutor.ts:750`) | Triggered emails (abandoned cart, browse, welcome) are the core D2C use case. Any template picked in the Flow UI is never found, so the fallback email goes out. Auto-created flows can render whichever project's same-named template Postgres returns first, including another brand's edits. Flow emails also go from the ESP fallback sender, not the brand's verified address. Fix: look up by id (and by name for auto-created flows), always scoped to `projectId`; pass the project sender; then point the Event Triggered card to a prefilled one-step flow. | P0 | S |
| Step 1: Target users | 3-step wizard with validated step tabs | Target users > Content > Schedule and goals; clicking a later step validates earlier ones and marks errors | 🟡 Partial | Same 3 steps (`create/page.tsx:93-97`). Step tabs call `setStep` without validating (`create/page.tsx:715-751`). Validity is name, then subject and body (`539-556`). Next and Create Campaign are simply disabled (`959-989`). Variable-lint errors render only on step 2 (`902-917`) | Users can jump to any step. A disabled Next or Create says nothing about the missing field. Save-time variable errors show on step 2 while the Create button is on step 3, where only a toast appears. | P2 | S |
| Step 1: Target users | Channel-not-configured banner | Red banner on every email builder when no SMTP connector is configured, linking to settings | 🟡 Partial | From placeholder "Uses project/shared default until a domain is verified" (`create/page.tsx:2119`); silent fallback to the shared Resend sender (`emailService.ts:56-90`). WhatsApp has a provider banner (`create/page.tsx:2318-2392`); email has none | Nothing warns that mail will go from the shared sender, or that the brand's domain is still pending (in which case sends fail; see the From row). | P3 | S |
| Step 1: Target users | Campaign name | Campaign Name, required | ✅ Full | `create/page.tsx:1074-1080,539`; API requires it (`routes/campaigns.ts:164-166`) | None. | — | — |
| Step 1: Target users | Campaign tags | Campaign tags multi-select | 🟡 Partial | Free-text chips on create (`create/page.tsx:1082-1107`), saved (`routes/campaigns.ts:250`). Never read by `campaigns/page.tsx`, `[id]/page.tsx` or `[id]/edit/page.tsx` | Tags are saved but never shown, filtered or edited, and there is no shared tag list to pick from. | P3 | S |
| Step 1: Target users | Content type (Promotional / Transactional) | Required; Transactional is sent irrespective of subscription status | 🟡 Partial | Cards; Transactional is labelled "Always delivered, bypasses frequency caps" (`create/page.tsx:1109-1143`). Transactional sends use the transactional ESP (`emailProviderRegistry.ts:62-66`, `campaignService.ts:992`). Email staging always drops promotional opt-outs, whatever the content type (`campaignService.ts:591-622`), and email sends never apply frequency caps at all | A transactional email still skips users who opted out of marketing, so "Always delivered" is wrong for email. Respect content type in staging (keep the suppression list). Same as module 01. | P2 | S |
| Step 1: Target users | User attribute with email address | Required: choose which attribute holds the address (e.g. Email (Standard)) | ❌ Missing | Staging and reachability always use `customers.email` (`campaignService.ts:212-272,526-617`) | A secondary or custom email attribute cannot be used. Low impact for Shopify stores. | P3 | M |
| Step 1: Target users | Audience and control groups | All users or filters (property, behaviour, affinity, custom segment), nested filters, Exclude users, Show count; global and campaign control groups (module 01) | 🟡 Partial | All users / Saved segment / Custom filter, Exclude users, Audience cap, Control group, audience-preview funnel (`create/page.tsx:1221-1485`) | Assessed in module 01: an empty audience silently falls back to every customer (P0 there), and there is no global control group, affinity filter or segment-as-filter block. | See 01 | — |
| Step 2: Template chooser | Drag-and-drop starter layouts (Blank, 2, 3, 4 columns) | Blank Template, 2, 3 and 4 Columns starters | ✅ Full | `create/page.tsx:178-182` (Basic templates), `249-398` (starters built as editable blocks), `1919-1960` (cards open the Visual Builder) | None for the chooser. The 3- and 4-column starters render cramped (see "Row layouts"). | — | — |
| Step 2: Template chooser | Pre-built template gallery | About 125 templates (5 pages of 25) with search and hover Choose/Preview | 🟡 Partial | 4 prebuilt in the builder: Promo Hero, Abandoned Cart, Newsletter, Product Grid (`create/page.tsx:183-186`). 13 email starters in `seedTemplates.ts`, added via Templates > Starter Templates (`templates/page.tsx:143-157`, always `force: true`; `routes/templates.ts:68`), then listed under Saved templates | About 17 starters against about 125, with no gallery search, categories or pagination. Each "Starter Templates" click inserts another full set of copies. Indian festive-sale templates would be an inexpensive differentiator. | P2 | M |
| Step 2: Template chooser | Template preview modal (desktop/mobile, Choose and continue) | Preview modal with a desktop/mobile toggle and "Choose and continue" | 🟡 Partial | Hover Choose/Preview on saved templates (`TemplatePreviewCard.tsx:53-73`); preview slide-over iframe with no device toggle or choose button (`create/page.tsx:991-1003`); starter cards apply immediately (`1929-1935`) | No mobile preview, and starter cards replace the content before they can be previewed. | P3 | S |
| Step 2: Template chooser | My saved templates with search | Search by name or ID | 🟡 Partial | Grid of the project's email templates (`create/page.tsx:1962-1981`). The "Search template & folder" input has no value or onChange (`1864`). "API templates" is a placeholder (`1983-1987`) | The search box does nothing, there are no folders, and "API templates" leads nowhere. | P3 | S |
| Step 2: Template chooser | Upload HTML template as a zip | Custom HTML editor > Upload HTML template in Zip format | ❌ Missing | No zip library or HTML file input in any package; Custom HTML is a paste-only textarea (`create/page.tsx:2010-2022`) | Agencies deliver HTML and images as a zip, and there is no way to import them. | P3 | M |
| Step 2: Email details | Subject line | Required Subject with a Merlin AI button | ✅ Full | `create/page.tsx:2094-2097,540-541`; API requires it (`routes/campaigns.ts:169-171`); filled in per recipient (`campaignService.ts:964`) | None (AI is covered in the AI rows). | — | — |
| Step 2: Email details | Preview text (preheader) | Preview Text with a 40-130 character tip and a Merlin AI button | 🟡 Partial | The input only updates state (`create/page.tsx:2098-2101`). The sent HTML is compiled from the builder template (`create/page.tsx:2003-2006`), whose `previewText` is the starter's text or empty (`emailCompiler.ts:18,34`). `campaignService.ts:945-1010` never adds `campaigns.previewText` | Bug: the preheader typed on create never reaches the sent HTML, unless it was typed before picking a saved template (`create/page.tsx:828-831`). Blank layouts send none; starters send their default ("Your cart is waiting."). The edit page picks it up only on the next builder change (`[id]/edit/page.tsx:787-791`), and Custom HTML never gets it. The hidden preheader `<div>` is also emitted inside `<head>` (`emailCompiler.ts:34`). No length guidance. | P1 | S |
| Step 2: Email details | Email connector selection | Required connector per campaign, listing only connectors with verified From addresses | 🟡 Partial | One marketing and one transactional ESP per project: Resend, SendGrid, Postmark, Mailgun or SES (`emailProviderRegistry.ts:45-79`); automatic fallback to Resend (`emailService.ts:56-90`) | The connector cannot be chosen per campaign (for example a separate ESP or IP pool for a big sale blast). | P3 | M |
| Step 2: Email details | Sender name, verified From address, Reply-to | Required Sender Name, From (verified addresses only) and Reply-to with "Use same as from email address" | 🟡 Partial | The From dropdown lists verified senders only when one exists, otherwise it is free text (`create/page.tsx:2102-2126,534`). The API stores any address (`routes/campaigns.ts:219`). Sends use `campaign.fromEmail ?? project.emailFromAddress` with no verification check (`campaignService.ts:1222-1227`), and `registerDomain` sets `emailFromAddress` before DNS is verified (`emailDomainService.ts:142-144`) | While a brand's domain is pending, or when a user types an unverified address, every campaign email carries an unverified From and the ESP rejects it; with Resend there is no fallback. Validate From against verified senders on save, and use the shared sender until the domain is verified (as the comment in `emailDomainService.ts:20` intends). An empty Reply-to behaves like "same as From". | P1 | S |
| Step 2: Email details | Cc / Bcc | Comma-separated, "@" inserts personalised addresses; note that Cc/Bcc multiplies credits | 🟡 Partial | `create/page.tsx:2127-2136`; `utils.ts:43-46` (trims only: no validation or personalisation); `campaignService.ts:1001-1002`; test sends copy the list too (`routes/campaigns.ts:792-793`) | Cc/Bcc cannot be personalised or validated. Nothing warns that each recipient's email is copied, so a 10,000-recipient send delivers 10,000 copies (with every customer's address) to the Cc inbox. | P3 | S |
| Step 2: Attachments | Local file attachments | Local file by drag and drop or upload, up to 10 files | ✅ Full | Several files, "Up to 25MB each", removable (`create/page.tsx:1721-1733,2250-2294`); allowed types, private storage, copied on duplicate (`campaignAttachmentService.ts:5-60`) | Files travel base64-encoded in the create request, which is capped at 30 MB (`index.ts:107`), so the real total is about 22 MB, not 25 MB each. Mailgun and SES adapters reject attachments (`providers/httpEmailProviders.ts:110-132`), so those sends only go out via the Resend fallback. | — | — |
| Step 2: Attachments | Attach a file by URL | Attachments > URL: paste a URL and Attach | ❌ Missing | Uploads accept only base64 content (`campaignAttachmentService.ts:19-24`); no URL option in `create/page.tsx:2250-2294` | A hosted file, such as a catalogue PDF or size chart, cannot be attached by link. | P3 | S |
| Step 2: Attachments | Personalized attachment | Per-user attachment via the personalisation drawer, with No fallback / Do not send / Attachment link | ❌ Missing | Every recipient gets the same attachment list (`campaignService.ts:992-1004`) | No per-user files (invoice, warranty card, e-ticket). Low priority, because Shopify sends order documents itself. | P3 | M |
| Step 2: Gmail annotation | Deal annotations | Description, offer code (personalisable with "@"), start date, end date | 🟡 Partial | Promo image URL, deal text, offer code, description, start, expiry (`create/page.tsx:2149-2197`); schema.org PromotionCard/DiscountOffer JSON-LD (`gmailAnnotation.ts:9-60`), injected after variables are filled in (`campaignService.ts:972-975`) | The publisher name is hard-coded to "Storees" (`gmailAnnotation.ts:52`) instead of the brand, and annotation fields cannot be personalised (tokens stay literal). | P2 | S |
| Step 2: Gmail annotation | Sender logo | Image URL or upload (PNG/JPEG at 4:5, 1:1 or 1.91:1) | ❌ Missing | No logo field (`types.ts:232-240`, `gmailAnnotation.ts:15-23`) | The Promotions-tab annotation shows no brand logo. The brand-kit logo could fill it automatically. | P2 | S |
| Step 2: Gmail annotation | Product carousel | Manual or product-set carousel: currency; image, promo URL, headline, price and discount per product | ❌ Missing | One PromotionCard with no product list (`gmailAnnotation.ts:29-60`) | No Gmail product carousel. The catalogue and recommendation logic (`productBlockRenderer.ts`, `decisioningService.ts`) could feed a product-set option. | P2 | M |
| Step 2: Gmail annotation | Annotation preview and live warnings | Promotions-tab preview for a chosen user, with warnings such as "No Headline: Product 1" | ❌ Missing | Plain inputs, no preview or validation (`create/page.tsx:2165-2196`) | No Promotions-tab mock-up and no warnings about missing fields or image ratios. | P3 | M |
| Personalization | Personalization picker (insert attribute with fallback) | "@" in any field, or Personalize / Merge tags in the toolbar, opens one drawer to pick an attribute and fallback, then inserts the token | 🟡 Partial | `VariablePanel.tsx:47-158` (detects `{{key}}` tokens the user typed), `235-353` (source picker: customer fields, custom attributes, product, project, event paths, smart content); the panel sits below the content (`create/page.tsx:882-901`); the text toolbar inserts only `{{customer_name}}` and `{{store_name}}` (`BlockPropertyEditor.tsx:134-140`) | Values resolve correctly at send time, but no picker inserts a token at the cursor in the subject, preheader, text or URLs. Users must know token names, then map them in a separate panel, which guesses a source for unknown names (often Customer ▸ Name). | P1 | M |
| Personalization | Fallback: replace text | "Replace text" with a fallback value, or "No fallback" | ✅ Full | Default value per variable (`VariablePanel.tsx:208-215`), used when the source is empty (`templateContext.ts:143`); `customer_name` defaults to "there" (`templateContext.ts:123`) | None. | — | — |
| Personalization | Fallback: do not send when data is missing | "Do not send Email"; merge tags default to `\|default('MOE_NOT_SEND')`, which cancels the send | ❌ Missing | Missing values render as `''` (`emailService.ts:109-121`); no skip rule anywhere | Recipients with missing data still get the email with blanks (for example an empty product slot) instead of being skipped and logged. | P2 | M |
| Personalization | Attribute catalogue, including campaign attributes | Lifecycle, acquisition, uninstall, reachability, localisation, suppression, device, standard and custom attributes, plus campaign id, name and tags | 🟡 Partial | 14 customer fields, top 50 custom attributes, 7 product fields, 3 project fields, recent event paths, smart content (`variableSources.ts:13-143`); `{{campaign_name}}` (`campaignService.ts:941`) | No consent/reachability, device or acquisition groups, and no campaign id or tags tokens. In broadcast campaigns the Product and Event-property sources always resolve to the default, because the send has no product or event (`campaignService.ts:930-936`), yet the picker offers them. | P3 | M |
| Personalization | Reusable content blocks | Content blocks tab and a Content Block editor block, with "insert only the content" to detach | ❌ Missing | No content-block type (`emailTypes.ts:24-34`) and no table in `schema.ts` | Shared headers, footers and legal text must be copied into every email and updated one email at a time. `{{brand_header}}` covers only the logo header. | P2 | M |
| Personalization | Aux data | Personalise from external lookup tables, with a fallback | ❌ Missing | Catalogue and item APIs exist (`routes/catalogues.ts`, `routes/items.ts`) but are not a variable source (`variableSources.ts:13-143`) | No personalisation from uploaded lookup tables, such as the nearest store for a pincode. | P3 | L |
| Personalization | Coupons (unique codes per user) | Coupon list giving each user a unique code; fallback "Do not send Email" or "Use a fallback coupon" | ❌ Missing | No coupon pools, Shopify price-rule or discount-code generation, or per-recipient assignment in the backend. Only fixed codes: the Gmail offer code, the AI brief field (`CampaignAiCopywriter.tsx:162-165`) and WhatsApp copy-code buttons (`providers/whatsappUtils.ts:94-102`) | Emails cannot carry a unique Shopify discount code per recipient, a staple of D2C welcome and win-back offers. | P1 | L |
| Personalization | Conditional content (If / Then / Else) | If [user attribute \| product set] [operator] [value], add/group conditions, else-if rows, Else fallback; 13 string operators | ❌ Missing | `interpolateTemplate` only replaces `{{key}}` tokens (`emailService.ts:109-121`); no templating engine in any `package.json` | Copy and sections cannot change by attribute (city, VIP tier, language) inside one email, so teams clone the campaign per segment. A cheaper first step: block and row display conditions evaluated per recipient with the existing filter rule types. | P1 | L |
| Personalization | Custom Jinja code | Raw Jinja editor for variables, logic and API calls | ❌ Missing | No Jinja, Liquid or Handlebars (`emailService.ts:109-121`) | No escape hatch for advanced needs: loops (cart items with custom markup), filters or logic. | P2 | L |
| Personalization | Jinja AI (natural language to Jinja) | Jinja AI (Beta): prompt plus starter prompts, generates Jinja | ❌ Missing | Depends on a templating language, which Storees does not have | Only relevant once Storees has a templating language. | P3 | M |
| AI assistance | AI copy generation from a structured brief | Merlin drawer: use case, keywords, exclusions, audience, tone, style, language, attribute, coupon, emoji; Generate, then "Select this" | ✅ Full | `CampaignAiCopywriter.tsx:36-64` (same brief fields), `76-90` (3 variations), `191-211` (Apply title / Apply body); `create/page.tsx:2140-2147`; `routes/ai.ts:166-233`, with an env LLM fallback (`llmService.ts:52-80`) | None for the main flow. | — | — |
| AI assistance | AI option range (tones, personas, languages) | 12 tones, celebrity personas and pop-culture styles, 20 keyword chips, Hinglish and 7 Indian languages | 🟡 Partial | 4 tones, 4 styles, 5 languages (English, Hindi, Arabic, Spanish, French), 4 attributes, free-text keywords (`CampaignAiCopywriter.tsx:121-160`) | No Hinglish and no Indian languages beyond Hindi, which matters for India-heavy audiences. Few tones and personas. The attribute list offers `city` and `order_id`, which are not built-in tokens. | P2 | S |
| AI assistance | AI buttons on Subject and Preview Text fields | Merlin wands beside Subject and Preview Text; "Create AI Variation" banner | 🟡 Partial | A separate, always-open card (`create/page.tsx:2140-2147`) that cannot generate preview text. "Apply body" calls `setHtmlBody` (`2145`) | AI is not attached to the fields and cannot suggest preview text. "Apply body" replaces a designed layout with plain copy, which the next builder edit then overwrites again. | P2 | S |
| AI assistance | Build Email HTML with AI agents | "Build Email HTML with Merlin Custom Agents" (in the capture it navigated away and discarded the draft) | 🟡 Partial | AI Email Designer at `/templates/ai` (`templates/ai/page.tsx:15-66`, `emailLayoutService.ts:20-157`, `aiEmailToBuilder.ts`): full layout with cart items and a recommendation grid, then Save or Edit in builder. Linked only from `/templates` (`templates/page.tsx:137`) | Not reachable from the campaign builder. "Save as template" posts AI HTML whose buttons use `{{cart_url}}`/`{{store_url}}` with no mapping, which the save-time lint rejects (`emailLayoutRenderer.ts:22-27`, `routes/templates.ts:328-332`). "Edit in builder" auto-maps those tokens to Customer ▸ Name (`VariablePanel.tsx` `guessSourceForKey`), so buttons link to the shopper's name unless remapped. | P2 | S |
| Variations, A/B and locales | A/B test with two variants and a manual split | Copy Variation / + New Variation; each variation is a full editor tab; manual % split | 🟡 Partial | Split 10-90% (`create/page.tsx:2995-3105`); Variant B is a subject plus a raw HTML textarea (`3069-3092`); each customer always gets the same variant and B content is sent (`campaignService.ts:51-58,707,950-952`); results judge the winner by open rate only, with a rough confidence score (`campaignAnalyticsService.ts:488-543`) | Variant B cannot be designed in the visual builder or copied from A, and the chosen winner metric is ignored in results. | P2 | M |
| Variations, A/B and locales | A/B/n (three or more variations) | Variation tabs 1 to n | ❌ Missing | Only `abVariantB*` fields (`routes/campaigns.ts:244-249`) | No third variation or beyond. | P2 | M |
| Variations, A/B and locales | Automatic split optimisation / sending the winner | Merlin shifts users to the best variation by open rate, click rate or both over 2 or 4 hours | ❌ Missing | Winner metric, test duration and auto-send are saved (`create/page.tsx:3107-3151`, `schema.ts:462-464`) but only read when duplicating (`campaignService.ts:1354-1356`). The A/B split assigns 100% of recipients, so there is no remaining audience | No test-then-send-winner and no traffic shifting, yet the summary promises "Winning variant auto-sent to remaining audience" (`create/page.tsx:3149`). Build a test cohort plus a scheduled winner send, or hide the controls. | P1 | M |
| Variations, A/B and locales | Campaign control group | Control-group slice in User Distribution | ✅ Full | 1-50% holdout (`create/page.tsx:1371-1425`); fixed per-customer buckets stored in `campaign_holdouts` (`campaignService.ts:663-699`); lift per goal (`campaignAnalyticsService.ts:225-304`) | Set on step 1 instead of in a distribution drawer; works the same way. | — | — |
| Variations, A/B and locales | Locales (content per language) | "+ Locale" with per-locale content; preview labelled "Default x Variation 1" | ❌ Missing | Campaigns have no locale fields (`routes/campaigns.ts:98-160`); language fallback exists only for WhatsApp templates (`deliveryService.ts:214-267`) | No Hindi/English (or other) email versions chosen by the recipient's language. | P2 | L |
| Drag-and-drop editor | Core content blocks (Text, Title, Image, Button, Divider, Spacer, Social) | Part of an 18-block palette | ✅ Full | `emailTypes.ts:3-35,76-87`; click or drag to add (`EmailBuilder.tsx:475-495`); table-based HTML with Outlook (MSO) button fallbacks (`emailCompiler.ts:66-178`) | None. | — | — |
| Drag-and-drop editor | List and HTML blocks | List block; HTML block ("HTML experts only") | 🟡 Partial | The Text block's content is a raw-HTML textarea (`BlockPropertyEditor.tsx:93-201`), so lists or custom markup can be typed there | No list editor; custom HTML has to go inside a Text block. | P3 | S |
| Drag-and-drop editor | Table, Video, Icons, Menu, GIFs and Stickers blocks | Table; Video (YouTube/Vimeo preview image); Icons; Menu (mobile hamburger); GIFs (GIPHY); Stickers | ❌ Missing | Only 10 block types: header, text, image, button, divider, spacer, columns, product, social, footer (`emailTypes.ts:24-34`) | No video thumbnail, menu, icon list, table, sticker or GIPHY blocks, which are common in D2C newsletters. An animated GIF can still be uploaded as an image (`routes/assets.ts:60-65`). | P2 | M |
| Drag-and-drop editor | Rich-text toolbar for editing text on the canvas | Floating toolbar: font, size, B/I/U/S, colours, alignment, lists, emoji, link, Special links, Merge tags, More | 🟡 Partial | A sidebar raw-HTML textarea with B, I, Link, Break, Name and Store buttons (`BlockPropertyEditor.tsx:93-201`); font size, alignment and colour per block (`356-358`); no rich-text library in `packages/frontend/package.json` | Text is edited as HTML source in a sidebar, not on the canvas, with no inline formatting, link dialog or emoji. The largest usability gap for non-technical marketers. | P1 | M |
| Drag-and-drop editor | Personalized links dialog | Display text, protocol (None/http/https/ftp) and a URL that accepts "@" | 🟡 Partial | "Link" inserts an `<a href="https://">` tag (`BlockPropertyEditor.tsx:137`); tokens typed into button, image or text URLs are filled per recipient (`emailCompiler.ts:84-104`, `emailService.ts:109-121`) | Personalised URLs work, but only if the user types the token syntax. | P3 | S |
| Drag-and-drop editor | Unsubscribe special link | "Special links" for system links from text, buttons and images | 🟡 Partial | The Footer block links to `{{unsubscribe_url}}` (`emailCompiler.ts:173-178`), but campaign sends never set it (`campaignService.ts:925-943`, `templateContext.ts:113-120`), so the link is empty. The token service (`unsubscribeService.ts:18-43`) and List-Unsubscribe headers are used only by the legacy `resendProvider.ts:83-101`. Blank and 2/3/4-column starters have no footer at all | Every campaign email goes out with a dead or missing unsubscribe link and no List-Unsubscribe header, failing CAN-SPAM, DPDP and Gmail/Yahoo bulk-sender rules. Fix: mint a token per recipient in `sendOneRecipient`, set `unsubscribe_url`, add the headers in the email providers, and append a footer when the body has none. Same root cause as module 01's P0. | P0 | S |
| Drag-and-drop editor | View in browser special link | "View in browser" under frequently used special links | ❌ Missing | No hosted web version (searched view in browser, web version, viewInBrowser) | Sent emails have no hosted web version. | P2 | M |
| Drag-and-drop editor | Image block basics | Replace, URL, width, alignment, alt text, full width on mobile, image link | ✅ Full | Upload, URL, recent uploads, alt text, width, link, alignment, full width on mobile (`BlockPropertyEditor.tsx:362-385`); JPG/PNG/GIF/WebP up to 5 MB (`routes/assets.ts:82-120`) | None. | — | — |
| Drag-and-drop editor | File manager, stock photos and image editor | File manager (upload, import, folders), 500,000+ free stock photos, image editor (filter, crop, resize, draw, text, frames) | 🟡 Partial | A "Recent Uploads" grid of 8 images with delete (`BlockPropertyEditor.tsx:275-318`; `routes/assets.ts:121,202`) | No folders or import, no stock photo search, and no crop or resize. | P3 | M |
| Drag-and-drop editor | Image link types | Open web page, send email, make call, send SMS | 🟡 Partial | One free-text Link URL field (`BlockPropertyEditor.tsx:378`) | No link-type picker; `mailto:`, `tel:` and `sms:` links work only if typed. | P3 | S |
| Drag-and-drop editor | Dynamic image / Dynamic Content block | Dynamic Image URL; PERSONALIZED CONTENT: image URL with "@", fallback image or "Do not send", alt text, target URL, size | 🟡 Partial | `{{recipient_image:key}}` reads the customer's `images` attribute (`emailService.ts:123-133`; `campaignService.ts:942,965`); any token typed into an Image URL is filled per recipient | No dedicated UI, fallback image or do-not-send rule; an empty token produces a broken image. | P2 | S |
| Drag-and-drop editor | Row display conditions | Display condition with name, description and Before/After wrappers | ❌ Missing | Column rows have no condition fields (`emailTypes.ts:9-19`), and every row is always rendered (`emailCompiler.ts:115-143`) | A section cannot be shown to only some users (for example a VIP banner). Needs a condition engine first (see Conditional content). | P2 | M |
| Drag-and-drop editor | Row layouts and row styling | Column layouts; backgrounds, borders, rounded corners, vertical align, stack on mobile, column padding; delete and duplicate | 🟡 Partial | 8 layouts including 1:2, 2:1 and 1:2:1 (`EmailBuilder.tsx:110-148,497-530`); ratio, padding, gap, backgrounds, border, corner radius, stack on mobile (`BlockPropertyEditor.tsx:472-531`); compiled in `emailCompiler.ts:115-143` | Blocks inside columns keep the full-width 40 px side padding (`row()` in `emailCompiler.ts`). In a 4-column row (the 4 Columns and Product Grid starters) text gets about 48 px and the 32 px-padded button overflows on desktop. No vertical alignment and no per-column background or padding. | P2 | S |
| Drag-and-drop editor | Saved rows | Saved rows grouped as Empty, Default, Footer, Header, Promotional, with search and a save icon per row | ❌ Missing | Not stored anywhere (`emailTypes.ts`, `schema.ts`) | A brand header or footer cannot be saved once and reused. | P2 | M |
| Drag-and-drop editor | Email background colours | Background and content-area background colours | ✅ Full | Page Background and Content Background (`BlockPropertyEditor.tsx:827-835`) | None. | — | — |
| Drag-and-drop editor | Other email settings: width, alignment, font, link colour, background image, title, custom head HTML | Settings tab with all of these | ❌ Missing | `fontFamily` and `maxWidth` exist in the data but are fixed (system font, 640 px) with no UI (`emailTypes.ts:41-47,90-100`); no title or custom head (`emailCompiler.ts:12-47`) | Brands cannot set their font, width, link colour or background image, or add custom head CSS (web fonts, dark-mode rules). | P2 | S |
| Drag-and-drop editor | Social block | Icon collections, URL per network, "Add new icon", alignment, spacing | 🟡 Partial | 6 networks and "+ Add link", but links cannot be removed (`BlockPropertyEditor.tsx:446-463`); rendered as coloured circles with letters, not icons (`emailCompiler.ts:159-171`) | No real icons or icon styles, and links cannot be removed. | P3 | S |
| Drag-and-drop editor | Button block | Link type and URL, personalised links, width, font, colours, alignment, line height | ✅ Full | Text, URL, colours, corner radius, padding, alignment, full width, full width on mobile (`BlockPropertyEditor.tsx:387-405`); MSO-safe markup (`emailCompiler.ts:91-105`) | No font settings for buttons. | — | — |
| Drag-and-drop editor | Block options: hide on desktop or mobile | Padding per side and "Hide on" desktop or mobile | ❌ Missing | No hide or per-side padding settings (`emailTypes.ts:3-22`) | Different content cannot be shown on mobile and desktop. | P3 | S |
| Drag-and-drop editor | Full screen, desktop/mobile canvas, undo/redo | Edit in full screen, device toggle, undo and redo | ✅ Full | 25-step undo/redo (`EmailBuilder.tsx:59-87`); full screen, desktop/mobile, light/dark canvas, Copy HTML (`261-323`) | None. | — | — |
| Drag-and-drop editor | Change history panel | Timestamped list of edits | 🟡 Partial | Undo and redo only (`EmailBuilder.tsx:45-46,59-87`) | No visible, timestamped history. | P3 | S |
| Drag-and-drop editor | Template actions: Save template | Template actions > Save template | ✅ Full | Save as template with a name (`create/page.tsx:1800-1855`); Duplicate saves a copy as a template (`1775-1799`) | None. | — | — |
| Drag-and-drop editor | Template actions: Download | Template actions > Download | 🟡 Partial | Copy HTML to the clipboard (`EmailBuilder.tsx:89-97,289-296`); read-only Code view (`442-449`) | The HTML cannot be downloaded as a file. | P3 | S |
| Drag-and-drop editor | Confirmations for Change template and Switch to HTML | "Change template" warns that changes will be lost; "Switch to HTML" is a confirmed one-way switch | ❌ Missing | No confirm dialog anywhere in the builder: Reset starter and the starter cards replace content (`create/page.tsx:1763-1774,1932-1935`); Custom HTML edits are overwritten by the next Visual Builder change (`2003-2006,2016`) | Work is lost silently when moving between Custom HTML and the Visual Builder, or when resetting a layout. | P2 | S |
| Custom HTML editor | HTML code editor with live preview | Toolbar, code view with line numbers, expand, live desktop/mobile preview, "View advanced preview" | 🟡 Partial | A plain monospace textarea (`create/page.tsx:2010-2022`); preview in a separate tab (`2024-2085`); same on `[id]/edit/page.tsx:793-798` | No syntax highlighting, line numbers, formatting or side-by-side preview. | P2 | M |
| Custom HTML editor | Link and image personalisation helpers | Build a personalised URL and copy it; image URL with "@" and a fallback image or "Do not send" | ❌ Missing | Only a static hint listing three variables (`create/page.tsx:2019`) | Tokens must be typed by hand. | P3 | S |
| Preview and test | Desktop/mobile and light/dark preview | Desktop and mobile, plus a dark-mode preview | ✅ Full | `create/page.tsx:2056-2071,2080-2082`; dark mode simulated by CSS colour inversion (`1535-1546`); builder toggles (`EmailBuilder.tsx:305-320`) | None. | — | — |
| Preview and test | Tablet preview and resolution | Desktop, tablet and mobile with resolution | ❌ Missing | Only a 640 px desktop and a 375 px mobile view (`create/page.tsx:2080`) | No tablet size. | P3 | S |
| Preview and test | Preview as a chosen user | Select user by ID, email or mobile, Fetch user data, Update preview | 🟡 Partial | Dropdown of the 20 most recently seen customers plus "Render data" (`create/page.tsx:1715,2030-2077`); the preview API accepts any customer id (`routes/templates.ts:132-200`) | A specific customer cannot be found by email, phone or ID; this needs a search field. | P2 | S |
| Preview and test | Preview user by Google or iOS advertising ID | Lookup by Google or iOS Advertising Identifier | ➖ N/A | `packages/sdk` is a browser SDK and no mobile advertising IDs are collected (the only `adId` in `schema.ts` is a Meta CTWA ad id) | Not relevant without a mobile SDK. | — | — |
| Preview and test | Inbox preview (email-client rendering tests) | "Run and save test" in real clients; 10 tests a month on this plan | ❌ Missing | No email-client rendering integration (searched Litmus, Email on Acid, inbox preview) | No Gmail or Outlook screenshots before sending. | P3 | L |
| Preview and test | Test send | In step 2 before saving: send via segment, email, unique ID or mobile; several recipients; "Personalise with a random user" | 🟡 Partial | Test Email on a saved draft through a browser prompt for one address (`[id]/page.tsx:148-152,196-206`); the API personalises with the most recently seen customer (`routes/campaigns.ts:698-814`); the UI never passes a sample customer (`hooks/useCampaigns.ts:330-340`) | Not available in the builder before saving; one address only; no choice of customer data or seed segment. Test sends skip `{{recommended_products}}` and also copy the campaign's Cc/Bcc list. | P2 | S |
| Preview and test | Pre-send campaign QC | "Try Campaign QC with Merlin Custom Agents" | 🟡 Partial | `contentLint.ts:40-170` checks spam phrases, all-caps subjects, a missing unsubscribe link, unfilled variables and image-only bodies; results come back from create and `POST /api/campaigns/lint` (`routes/campaigns.ts:271-298`), but the frontend never shows them | The checks exist but users never see them. The unsubscribe check passes on the `{{unsubscribe_url}}` placeholder (`contentLint.ts:150-153`), which sends empty. | P2 | S |
| Preview and test | UTM parameters | Toggle (off until Settings > UTM tracking), utm_source/medium/campaign/term/content, custom parameters | ✅ Full | On by default with source, medium, campaign and custom parameters; values can contain tokens (`create/page.tsx:477-481,2199-2248,1548-1563`); `emailService.ts:135-164`; `campaignService.ts:966-971` | None. | — | — |
| Event-triggered email | Trigger condition: primary, alternate and follow-up events; Immediately or With Delay | Primary event(s), "+ alternate" (OR), "+ secondary" (follow-up); Immediately or With Delay (n days after, If Action) | 🟡 Partial | A flow trigger takes one event (`types.ts:588-602`, `triggerWorker.ts:77`); delays in minutes, hours or days, and follow-ups through an "event occurred" condition (`types.ts:637-660`, `flowExecutor.ts`) | No OR list of trigger events, and follow-up logic needs extra flow steps. Fix the template lookup first (Event Triggered row). Same as module 01. | P2 | M |

### Storees-only strengths

- **Save-time variable check with automatic mappings.** Saving is blocked when a `{{token}}` has no mapping, including in variant B (`routes/campaigns.ts:195-205`, `templateLint.ts:92-106`), and the Variables panel adds a row for each token typed and flags unused ones (`VariablePanel.tsx:53-75,186-190`). Caveat: unknown names get a guessed source, usually Customer ▸ Name (`VariablePanel.tsx` `guessSourceForKey`), which satisfies the check even when wrong, so review the guesses.
- **Value formats per variable without code.** Money, date, long and short date, upper, lower and title case (`VariablePanel.tsx:216-229`, `templateContext.ts:235-273`).
- **Per-recipient recommendation grid and smart-content variables in a broadcast.** `{{recommended_products}}` renders a 4-product grid from each customer's interests (`campaignService.ts:953-963`, `productBlockRenderer.ts`), and recommended-product and social-proof variables bind with no code (`VariablePanel.tsx:318-324`). MoEngage's editor has no recommendation block.
- **Product card block.** A ready-made, manually filled product card (image, price, CTA button) in the palette (`emailTypes.ts:20,32`, `emailCompiler.ts:145-157`, `BlockPropertyEditor.tsx:424-444`).
- **AI rewrite of one text block in context.** Rewrite, Shorter, Longer, Friendlier, Premium and Urgent, with 3 options to apply (`BlockPropertyEditor.tsx:46-55,141-198,246-273`). In the capture, Merlin covered only the subject and preheader.
- **Brand-kit tokens.** `{{brand_header}}`, `{{brand_logo}}`, `{{brand_primary_color}}`, `{{brand_accent}}` and `{{brand_slogan}}` come from the Shopify store's brand settings (`templateContext.ts:126-138`, `brandKitService.ts`). AI-designed layouts and one seeded starter (Abandoned Cart — Live Items & Picks) use them; the builder's starter layouts do not yet.
- **Rendered preview with a table of resolved values.** The sample render lists the value each token produced (`VariablePanel.tsx:355-442`, `create/page.tsx:2042-2077`).
- **Send to the customer's dealer.** Customer, Dealer or Customer + Dealer, with dealer emails about the customer (`create/page.tsx:1145-1175`, `campaignService.ts:944-1010`). The UI copy still says "WhatsApp only for now".
- **Automatic provider fallback.** A failing SendGrid, Postmark, Mailgun or SES send is retried through Resend (`emailService.ts:56-90`), with separate promotional and transactional providers (`emailProviderRegistry.ts:45-79`). Caveat: the retry uses the platform's shared Resend account with the brand's From address, so it fails too if that domain is not verified there.

### UX notes

- **Email details placement** (screenshots 012, 043). MoEngage puts Subject, preheader and sender in a collapsible "Email details" card above the editor, with tabs for Sender Details, Attachments (n) and Gmail annotation, and "+ A/B test" / "+ Locale" at the top right. Storees shows the full-height builder first, then Email Details, AI Copywriter, Gmail Annotation, UTM and Attachments as separate cards, with Variables and A/B Testing at the very bottom (`create/page.tsx:1737-2295,882-931`), so the required Subject sits below the fold. Adopt one tabbed card above the editor, with counts on the tabs.
- **Personalisation where you type** (023, 073, 077). Typing "@" or using Personalize / Merge tags opens one drawer to pick an attribute and fallback, then inserts the token. Storees makes users type `{{key}}` by hand and map it later; the text toolbar inserts only Name and Store (`BlockPropertyEditor.tsx:134-140`). Add an "Insert variable" popover to the subject, preheader, text and URL fields that reuses the existing source picker (`VariablePanel.tsx:235-353`) and saves the token with its mapping and default.
- **Editing text on the canvas** (072). Storees edits text as raw HTML in a sidebar textarea with buttons that insert tags (`BlockPropertyEditor.tsx:93-201`), which non-technical marketers will struggle with. Make Text and Heading blocks editable on the canvas with a rich-text editor such as TipTap.
- **Step validation** (004, 063). MoEngage outlines missing fields in red and badges the step. Storees' step tabs jump freely (`create/page.tsx:715-751`), Next and Create Campaign are disabled without saying why (`959-989`), and variable errors appear only on step 2 (`902-917`) while Create is on step 3. Add inline required-field errors and error badges on the steps.
- **Sender safety** (015-018). MoEngage lists only connectors and From addresses that are verified. Storees falls back to free text when nothing is verified and sends from the project's address even while its domain is pending. Show only verified senders, explain the shared fallback, and add an email-provider status banner like the WhatsApp one.
- **Confirm before losing work** (112, 113). MoEngage confirms "Switch to HTML" (one-way) and "Change template". In Storees, Custom HTML edits are silently overwritten by the next Visual Builder change, because the builder keeps its own copy of the design (`create/page.tsx:2003-2006,2016`), and Reset starter and the starter cards replace content without asking (`1763-1774,1932-1935`). Add confirmations and lock the builder once the HTML has been hand-edited.
- **Test send placement** (109-111). MoEngage's Test Campaign section sits at the bottom of the content step, before saving, with "Send via", several recipients and "Personalise with a random user". Storees offers Test Email only on the saved campaign's page, via a browser prompt for one address (`[id]/page.tsx:148-152`). Move it into step 2, reuse the Preview tab's customer picker, and skip Cc/Bcc on test sends.
- **A/B variations** (055-062). Each MoEngage variation is a full editor tab, "Copy Variation" duplicates it, and a distribution drawer shows the split bar, the control-group slice and Merlin auto-optimisation. Storees' Variant B is a subject plus a raw HTML textarea (`create/page.tsx:3069-3092`), and the summary promises "Winning variant auto-sent to remaining audience" (`3149`) although nothing implements it. Build variant tabs and a test-cohort winner send, or hide the unfinished controls.
- **AI placement** (012, 049). Merlin sits as wands beside Subject and Preview Text with a slim banner. Storees shows a large, always-open, two-column AI Copywriter card between Email Details and Gmail Annotation (`CampaignAiCopywriter.tsx:66-219`), and its "Apply body" replaces the whole designed HTML with plain copy (`create/page.tsx:2145`). Move AI to per-field buttons, and apply body copy to the selected text block only.
- **Gmail annotation** (043-048). MoEngage pairs the form with a live Promotions-tab preview and warnings. Storees has plain inputs and no preview (`create/page.tsx:2149-2197`), and labels every brand's annotation as published by "Storees" (`gmailAnnotation.ts:52`).
- **Template chooser polish** (006-008). MoEngage's chooser has working search, pagination and a preview window with a device toggle and "Choose and continue". Storees has a "Search template & folder" box that does nothing (`create/page.tsx:1864`), an "API templates" placeholder (`1983-1987`), a second row of Drag and drop / Custom HTML tabs that duplicates the top tabs, and starter cards that apply without a preview. Remove the dead controls and add a preview step.
- **Where Storees is better:** problems surface before sending. Saving is blocked when a token has no mapping, unused mappings are flagged, and the preview renders a real customer with a table of resolved values (`VariablePanel.tsx:355-442`), while MoEngage relies on cancelling the send at runtime. Storees also has AI rewrite buttons on each text block, a recommendation grid and brand tokens that need no Jinja. Keep these as differentiators while closing the editor gaps.

### Verification notes

Every row was re-checked against the code at `2063cdc`. Rows changed:

- **Content type: ✅ Full → 🟡 Partial (P2, S).** Email staging drops promotional opt-outs whatever the content type (`campaignService.ts:591-622`), and email sends never apply frequency caps, so "Always delivered, bypasses frequency caps" is wrong for email. This matches module 01.
- **User attribute with email address: 🟡 Partial → ❌ Missing (P3, M unchanged).** There is no attribute choice at all; sending to the standard email field is a default both products share. This matches module 01's status.
- **Audience and control groups: ✅ Full → 🟡 Partial (tracked in module 01).** Module 01 found the empty-audience fallback to every customer (P0), no global control group, no affinity filter and no segment-as-filter block.
- **Sender name, verified From address, Reply-to: ✅ Full → 🟡 Partial (P1, S).** The verified-only dropdown appears only when a verified sender exists; otherwise From is free text, the API stores any address (`routes/campaigns.ts:219`), and sends use `project.emailFromAddress` even while the domain is unverified (`emailDomainService.ts:142-144`, `campaignService.ts:1222-1227`). Resend rejects such sends, and `sendEmail` has no fallback when the provider is Resend (`emailService.ts:56-69`).
- **Row layouts and row styling: ✅ Full → 🟡 Partial (P2, S).** Compiling a 4-column row with the real `emailCompiler.ts` (run in a scratch copy) showed each inner text and button cell keeps `padding:8px 40px` / `16px 40px` inside a 25% column, so the 4 Columns and Product Grid starters render cramped on desktop.
- **Confirmations for Change template and Switch to HTML: 🟡 Partial → ❌ Missing (P2, S).** No confirm dialog exists anywhere in the campaign builder or email editor; nothing is partly there.
- **Deal annotations: P1 → P2.** A niche feature whose main defect (the hard-coded publisher) is a one-line fix; per-user offer codes depend on the separate Coupons gap.
- **A/B test with two variants: P1 → P2.** Subject and HTML tests work end to end (fixed per-customer split, B content sent, per-variant results). The remaining gaps are authoring ergonomics and the ignored winner metric; the misleading auto-winner promise stays P1 in its own row.
- **Test send: P1 → P2.** Campaigns are only sent from the saved draft's page, where Test Email already exists, so testing before launch is possible. The gaps are convenience plus two smaller correctness issues (Cc/Bcc copies, no recommendation grid).

Evidence and gap corrections (status and priority unchanged):

- **Event Triggered (P0):** every project's auto-created flows use the same template names (`abandoned_cart_default`, `flows/src/templates.ts:58,65`), so the unscoped name lookup can render another project's, possibly edited, template. Flow emails also pass no From (`flowExecutor.ts:750`).
- **Preview text:** the preheader does reach the HTML if it is typed before a saved template is picked (`create/page.tsx:828-831`). Compiling confirmed the hidden preheader `<div>` lands inside `<head>`.
- **Local file attachments:** the "25MB each" label is bounded by the 30 MB JSON limit on the whole create request (`index.ts:107`).
- **Unsubscribe (P0):** blank and 2/3/4-column starters include no footer, and the content lint that would flag this is never shown; the lint even passes on the empty placeholder.
- **Build Email HTML with AI:** "Edit in builder" auto-maps `{{cart_url}}` and `{{store_url}}` to Customer ▸ Name.
- **Attribute catalogue:** Product and Event-property sources resolve empty in broadcast campaigns.
- **Pre-built gallery:** the Starter Templates button always posts `force: true`, so each click adds duplicates.
- **Automatic winner:** the A/B split already assigns 100% of recipients, so there is no remaining audience to send a winner to.
- **Storees-only list:** caveats added to the save-time check (guessed sources), brand tokens (used by AI layouts and one seeded starter, not by builder starters), provider fallback (shared Resend account) and dealer sends (UI copy says WhatsApp only).

Confirmed unchanged after trying to refute them:

- The ❌ Missing rows were searched under synonyms (coupon, discount_code, price_rule, code_redemption; content block, snippet, saved row; locale, language; zip, jszip, adm-zip; view in browser, web version; Litmus, Email on Acid; Jinja, Liquid, Handlebars, Mustache; confirm dialogs) across frontend, backend, shared, flows and segments, with no hits beyond those noted in the table.
- The ✅ Full chains were traced UI → route → service: AI copy (`CampaignAiCopywriter.tsx` → `routes/ai.ts` → `llmService.ts`), UTM (`create/page.tsx` → `routes/campaigns.ts` → `emailService.ts`), control group (`campaignService.ts:663-699`), image upload (`BlockPropertyEditor.tsx` → `routes/assets.ts`) and undo/redo.
- The ➖ N/A row holds: the SDK is browser-only, and the only `adId` in the schema belongs to Meta Click-to-WhatsApp attribution.

Seen along the way:

- **Unescaped personalisation values.** `interpolateTemplate` inserts values into HTML as-is (`emailService.ts:109-121`). A customer-controlled value, such as a name containing markup, lands verbatim in dealer copies and Cc/Bcc inboxes. Escape values by default and allow raw HTML only for system blocks (`cart_items`, `recommended_products`, `brand_header`).
- **Guessed variable mappings break links.** When a token has no mapping, the Variables panel guesses a source and falls back to Customer ▸ Name (`VariablePanel.tsx` `guessSourceForKey`). All 13 seeded email starters share a footer with `{{store_url}}` and `{{preferences_url}}` (`seedTemplates.ts:16-60`), so a campaign built from one links "Visit Store" and "Preferences" to the shopper's name unless the marketer remaps them. Default unknown tokens to "unmapped" (amber, blocking) instead of a customer field.
- **Cross-tenant template lookup.** The flow email lookup ignores `projectId` (`flowExecutor.ts:678-682`); covered in the Event Triggered row.

### Screens

#### New Campaign modal: Email delivery types

![Create campaign modal with Email expanded: One Time, Periodic, Event Triggered](../screenshots/02-builder-email-001-email-delivery-types.jpg)
*Create campaign modal with Email expanded: One Time, Periodic, Event Triggered*

![One Time hover text: 'Send message to your target audience now or at scheduled time'](../screenshots/02-builder-email-119-onetime-hover-description.png)
*One Time hover text: 'Send message to your target audience now or at scheduled time'*

![Periodic hover text: 'Send message to your target audience on a recurring basis'](../screenshots/02-builder-email-120-periodic-hover-description.jpg)
*Periodic hover text: 'Send message to your target audience on a recurring basis'*

![Event Triggered hover text: message triggered by a user action event tracked on app or server](../screenshots/02-builder-email-121-event-triggered-hover-description.jpg)
*Event Triggered hover text: message triggered by a user action event tracked on app or server*

#### Email One Time, Step 1: Target users

![Step 1 top: SMTP-not-configured banner, name, tags, content type, email attribute](../screenshots/02-builder-email-002-onetime-step1-top-smtp-banner.jpg)
*Step 1 top: SMTP-not-configured banner, name, tags, content type, email attribute*

![Step 1 bottom: audience filter, Exclude Users, Show count, control groups, Next](../screenshots/02-builder-email-003-onetime-step1-bottom-control-groups.jpg)
*Step 1 bottom: audience filter, Exclude Users, Show count, control groups, Next*

![Clicking the Content step tab validates step 1: name, email attribute and event are required](../screenshots/02-builder-email-004-step1-validation-errors.jpg)
*Clicking the Content step tab validates step 1: name, email attribute and event are required*

#### Email Step 2 Content: template chooser

![Content step: Drag and drop editor / Custom HTML editor / My saved templates tabs; Blank, 2, 3 and 4 column layouts](../screenshots/02-builder-email-005-content-step-editor-tabs-layouts.jpg)
*Content step: Drag and drop editor / Custom HTML editor / My saved templates tabs; Blank, 2, 3 and 4 column layouts*

![Pre-built templates grid with hover Choose / Preview, plus search](../screenshots/02-builder-email-006-prebuilt-templates-hover-choose-preview.jpg)
*Pre-built templates grid with hover Choose / Preview, plus search*

![Template pagination (5 pages, 25 items per page), Previous / Next](../screenshots/02-builder-email-007-prebuilt-templates-pagination.jpg)
*Template pagination (5 pages, 25 items per page), Previous / Next*

![Preview template modal, desktop view, with Cancel / Choose and continue](../screenshots/02-builder-email-008-template-preview-desktop.jpg)
*Preview template modal, desktop view, with Cancel / Choose and continue*

![Preview template modal, mobile device frame](../screenshots/02-builder-email-009-template-preview-mobile.jpg)
*Preview template modal, mobile device frame*

![Custom HTML editor tab: Edit/Paste HTML template, Upload HTML template in Zip format](../screenshots/02-builder-email-010-custom-html-editor-options.jpg)
*Custom HTML editor tab: Edit/Paste HTML template, Upload HTML template in Zip format*

![My saved templates: search by Name or ID; 'No data found'](../screenshots/02-builder-email-011-my-saved-templates-empty.jpg)
*My saved templates: search by Name or ID; 'No data found'*

#### Email Step 2 Content: Email details (sender, attachments, Gmail annotation)

![Content page header: + A/B test, + Locale, Merlin AI banner, Email details > Sender Details](../screenshots/02-builder-email-012-content-email-details-sender.jpg)
*Content page header: + A/B test, + Locale, Merlin AI banner, Email details > Sender Details*

![Editor toolbar row: Edit in full screen, Build Email HTML with Merlin Custom Agents, Template actions, Dark mode preview, Switch to HTML editor, Preview](../screenshots/02-builder-email-013-content-editor-area-top.jpg)
*Editor toolbar row: Edit in full screen, Build Email HTML with Merlin Custom Agents, Template actions, Dark mode preview, Switch to HTML editor, Preview*

![Preview Text tooltip: preheader explanation, keep it 40-130 characters](../screenshots/02-builder-email-014-preview-text-tooltip.jpg)
*Preview Text tooltip: preheader explanation, keep it 40-130 characters*

![Email Connector tooltip: only connectors with verified from-addresses appear](../screenshots/02-builder-email-015-email-connector-tooltip.jpg)
*Email Connector tooltip: only connectors with verified from-addresses appear*

![From email tooltip: only verified from-addresses appear (Email Settings > General Settings)](../screenshots/02-builder-email-016-from-address-tooltip.jpg)
*From email tooltip: only verified from-addresses appear (Email Settings > General Settings)*

![Email Connector dropdown is empty in this workspace](../screenshots/02-builder-email-017-email-connector-dropdown-empty.jpg)
*Email Connector dropdown is empty in this workspace*

![From email address dropdown is empty](../screenshots/02-builder-email-018-from-email-dropdown-empty.jpg)
*From email address dropdown is empty*

![Cc / Bcc fields (comma-separated, '@' inserts personalised addresses) and a note that Cc/Bcc multiplies email credits](../screenshots/02-builder-email-019-cc-bcc-fields-credit-note.jpg)
*Cc / Bcc fields (comma-separated, '@' inserts personalised addresses) and a note that Cc/Bcc multiplies email credits*

![Attachments > Local file: drag & drop or upload, 'Uploaded file(s) (0/10)'](../screenshots/02-builder-email-020-attachments-local-file.jpg)
*Attachments > Local file: drag & drop or upload, 'Uploaded file(s) (0/10)'*

![Attachments > URL: paste URL + Attach](../screenshots/02-builder-email-021-attachments-url.jpg)
*Attachments > URL: paste URL + Attach*

![Attachments > Personalized attachment: 'Click to personalize'](../screenshots/02-builder-email-022-attachments-personalized.jpg)
*Attachments > Personalized attachment: 'Click to personalize'*

![Gmail annotation tab: reference image, Add Gmail annotation, Promotions-tab note](../screenshots/02-builder-email-042-gmail-annotation-tab.jpg)
*Gmail annotation tab: reference image, Add Gmail annotation, Promotions-tab note*

![Gmail annotation form: Sender logo (Image URL/Upload), Deal annotations and Product Carousel toggles, Personalized preview (user email redacted)](../screenshots/02-builder-email-043-gmail-annotation-form-sender-logo.jpg)
*Gmail annotation form: Sender logo (Image URL/Upload), Deal annotations and Product Carousel toggles, Personalized preview (user email redacted)*

![Deal annotations: Description, Offer code (@ personalization), Start date, End date](../screenshots/02-builder-email-044-gmail-deal-annotations.jpg)
*Deal annotations: Description, Offer code (@ personalization), Start date, End date*

![Product Carousel: Manual / Product set (needs recommendations), Currency, Product 1 + Add Product, live warnings](../screenshots/02-builder-email-045-gmail-product-carousel-warnings.jpg)
*Product Carousel: Manual / Product set (needs recommendations), Currency, Product 1 + Add Product, live warnings*

![Carousel product fields: Image*, Promo URL*, Headline, Original price, Discount type, Discount value](../screenshots/02-builder-email-046-gmail-product-carousel-fields.jpg)
*Carousel product fields: Image\*, Promo URL\*, Headline, Original price, Discount type, Discount value*

![Discount type options: Discounted Price, Discount Percentage](../screenshots/02-builder-email-047-gmail-discount-type-options.jpg)
*Discount type options: Discounted Price, Discount Percentage*

![Preview user 'Select user by': ID, Email Id, Mobile Number, Google Advertising Identifier, IOS Advertising Identifier](../screenshots/02-builder-email-048-gmail-preview-user-select-by.jpg)
*Preview user 'Select user by': ID, Email Id, Mobile Number, Google Advertising Identifier, IOS Advertising Identifier*

![Clicking 'Schedule and goals' validates Content: Subject, connector, sender name, from and reply-to are required; this blocks step 3](../screenshots/02-builder-email-063-content-validation-blocks-step3.jpg)
*Clicking 'Schedule and goals' validates Content: Subject, connector, sender name, from and reply-to are required; this blocks step 3*

#### Email Personalization drawer (personalization picker)

![Email Personalization drawer: tabs, attribute selector, Choose Fallback (attachment context)](../screenshots/02-builder-email-023-personalization-drawer-data-tab.jpg)
*Email Personalization drawer: tabs, attribute selector, Choose Fallback (attachment context)*

![Attribute picker grouped by UserAttribute (First Seen, Last Seen, LTV ...)](../screenshots/02-builder-email-024-personalization-attribute-list-top.jpg)
*Attribute picker grouped by UserAttribute (First Seen, Last Seen, LTV ...)*

![End of attribute list: Campaign attribute group (Campaign id, Campaign name, Campaign tags)](../screenshots/02-builder-email-025-personalization-attribute-list-campaign-attrs.jpg)
*End of attribute list: Campaign attribute group (Campaign id, Campaign name, Campaign tags)*

![Attribute selected; fallback options enabled; Done active](../screenshots/02-builder-email-026-personalization-attribute-selected-fallback.jpg)
*Attribute selected; fallback options enabled; Done active*

![Fallback 'Attachment link' with a Fallback url field](../screenshots/02-builder-email-027-personalization-fallback-attachment-link.jpg)
*Fallback 'Attachment link' with a Fallback url field*

![Content blocks tab: Select content block + 'Insert only the content of the content block' toggle](../screenshots/02-builder-email-028-personalization-content-blocks-tab.jpg)
*Content blocks tab: Select content block + 'Insert only the content of the content block' toggle*

![Content block list is empty](../screenshots/02-builder-email-029-personalization-content-block-dropdown-empty.jpg)
*Content block list is empty*

![Tooltip: inserting content only disconnects it from future content-block updates](../screenshots/02-builder-email-030-personalization-content-block-insert-only-tooltip.jpg)
*Tooltip: inserting content only disconnects it from future content-block updates*

![Aux data tab: Select aux data + fallback](../screenshots/02-builder-email-031-personalization-aux-data-tab.jpg)
*Aux data tab: Select aux data + fallback*

![Aux data list is empty](../screenshots/02-builder-email-032-personalization-aux-data-dropdown-empty.jpg)
*Aux data list is empty*

![Coupons tab: Select coupon list; fallback Do not send Email / Use a fallback coupon](../screenshots/02-builder-email-033-personalization-coupons-tab.jpg)
*Coupons tab: Select coupon list; fallback Do not send Email / Use a fallback coupon*

![Coupon list is empty](../screenshots/02-builder-email-034-personalization-coupon-list-empty.jpg)
*Coupon list is empty*

![Conditional (New): display name, If/Then rows, + Add condition, + Add Group condition, Else fallback](../screenshots/02-builder-email-035-personalization-conditional-tab.jpg)
*Conditional (New): display name, If/Then rows, + Add condition, + Add Group condition, Else fallback*

![Condition source: User attribute or Product set](../screenshots/02-builder-email-036-conditional-source-user-attr-product-set.jpg)
*Condition source: User attribute or Product set*

![Product set condition (product set list empty)](../screenshots/02-builder-email-037-conditional-product-set.jpg)
*Product set condition (product set list empty)*

![String operators: is, is not, contains, contains spaces, does not contain, starts/ends with (and negations), exists, does not exist, is empty, is not empty](../screenshots/02-builder-email-038-conditional-string-operators.jpg)
*String operators: is, is not, contains, contains spaces, does not contain, starts/ends with (and negations), exists, does not exist, is empty, is not empty*

!['Else use fallback option as': No fallback, Do not send, Fallback](../screenshots/02-builder-email-039-conditional-else-fallback-options.jpg)
*'Else use fallback option as': No fallback, Do not send, Fallback*

![Custom (New): display name + 'Enter Jinja code here' code editor](../screenshots/02-builder-email-040-personalization-custom-jinja-tab.jpg)
*Custom (New): display name + 'Enter Jinja code here' code editor*

#### Jinja AI (Beta)

![Jinja AI (Beta) page with prompt box, starter prompts and Generate](../screenshots/02-builder-email-041-merlin-jinja-ai-page.jpg)
*Jinja AI (Beta) page with prompt box, starter prompts and Generate*

#### Merlin AI: Generate content drawer

![Generate content using Merlin AI: prompt builder fields](../screenshots/02-builder-email-049-merlin-generate-content-drawer.jpg)
*Generate content using Merlin AI: prompt builder fields*

![High performing keywords multi-select (Exclusive, New, Sale, Save, Flash, Limited, Hurry, VIP ...)](../screenshots/02-builder-email-050-merlin-high-performing-keywords.jpg)
*High performing keywords multi-select (Exclusive, New, Sale, Save, Flash, Limited, Hurry, VIP ...)*

![Voice/tone options (Persuasive, Informative, Excitement, FOMO ...)](../screenshots/02-builder-email-051-merlin-voice-tone-options.jpg)
*Voice/tone options (Persuasive, Informative, Excitement, FOMO ...)*

![Writing style: Trends, Persona (celebrities), Pop-culture references](../screenshots/02-builder-email-052-merlin-writing-style-persona.jpg)
*Writing style: Trends, Persona (celebrities), Pop-culture references*

![Language: Internet Trends (Hinglish, Digital Slang ...) and Global Languages](../screenshots/02-builder-email-053-merlin-language-options.jpg)
*Language: Internet Trends (Hinglish, Digital Slang ...) and Global Languages*

#### Variations (A/B test), Locales and User distribution

![+ Locale menu: search, empty list, + New Locale, Add](../screenshots/02-builder-email-054-add-locale-menu.jpg)
*+ Locale menu: search, empty list, + New Locale, Add*

![+ A/B test menu: Copy Variation / + New Variation](../screenshots/02-builder-email-055-ab-test-menu-copy-new-variation.jpg)
*+ A/B test menu: Copy Variation / + New Variation*

![Variation tabs (Variation 1, Variation 2, + Variation) and User Distribution link](../screenshots/02-builder-email-056-variation-tabs-user-distribution.jpg)
*Variation tabs (Variation 1, Variation 2, + Variation) and User Distribution link*

![User distribution drawer: Dynamically using Merlin AI (default) vs Manual](../screenshots/02-builder-email-057-user-distribution-merlin-dynamic.jpg)
*User distribution drawer: Dynamically using Merlin AI (default) vs Manual*

![Merlin optimizes on: Open rate, Click rate, Both](../screenshots/02-builder-email-058-merlin-optimize-metric-options.jpg)
*Merlin optimizes on: Open rate, Click rate, Both*

![Campaign duration for dynamic optimization: 2 Hours, 4 Hours](../screenshots/02-builder-email-059-merlin-campaign-duration-options.jpg)
*Campaign duration for dynamic optimization: 2 Hours, 4 Hours*

![Tooltip: Merlin assigns more users to the variation performing best on the chosen metric](../screenshots/02-builder-email-060-merlin-metric-tooltip.jpg)
*Tooltip: Merlin assigns more users to the variation performing best on the chosen metric*

![Manual distribution: 50/50 split bar, per-variation %, Reset distribution](../screenshots/02-builder-email-061-user-distribution-manual-split.jpg)
*Manual distribution: 50/50 split bar, per-variation %, Reset distribution*

![Manual distribution with a Campaign control group slice added](../screenshots/02-builder-email-062-user-distribution-control-group-slice.jpg)
*Manual distribution with a Campaign control group slice added*

#### Drag-and-drop email editor (Beefree-based)

![Template actions: Change template, Download, Save template](../screenshots/02-builder-email-064-template-actions-menu.jpg)
*Template actions: Change template, Download, Save template*

![Full-screen editor with the CONTENT block palette](../screenshots/02-builder-email-065-fullscreen-editor-content-blocks.jpg)
*Full-screen editor with the CONTENT block palette*

![All 18 blocks: Paragraph, Text, List, Content Block, Title, Image, Button, Table, Divider, Spacer, Social, Dynamic Content, HTML, Video, Icons, Menu, GIFs, Stickers](../screenshots/02-builder-email-066-content-blocks-full-list.jpg)
*All 18 blocks: Paragraph, Text, List, Content Block, Title, Image, Button, Table, Divider, Spacer, Social, Dynamic Content, HTML, Video, Icons, Menu, GIFs, Stickers*

![ROWS tab: column layout presets](../screenshots/02-builder-email-067-rows-tab-layouts.jpg)
*ROWS tab: column layout presets*

![Row categories: Empty, Default, Footer, Header, Promotional](../screenshots/02-builder-email-068-rows-category-dropdown.jpg)
*Row categories: Empty, Default, Footer, Header, Promotional*

![Promotional saved rows: search, 'No rows were found'](../screenshots/02-builder-email-069-rows-promotional-empty.jpg)
*Promotional saved rows: search, 'No rows were found'*

![SETTINGS: content width, alignment, colors, background image, default font, link color, Metadata title, Custom head HTML](../screenshots/02-builder-email-070-settings-tab-design-metadata-head.jpg)
*SETTINGS: content width, alignment, colors, background image, default font, link color, Metadata title, Custom head HTML*

![Default font list (Arial, Arial Black, Bitter, Brush Script MT, Calibri, Comic Sans MS, Courier New ...)](../screenshots/02-builder-email-071-settings-default-font-list.jpg)
*Default font list (Arial, Arial Black, Bitter, Brush Script MT, Calibri, Comic Sans MS, Courier New ...)*

![Text block: rich-text toolbar (Special links, Merge tags, More) and Text properties / Block options (Hide on)](../screenshots/02-builder-email-072-text-block-toolbar-properties.jpg)
*Text block: rich-text toolbar (Special links, Merge tags, More) and Text properties / Block options (Hide on)*

![Merge tags list in Jinja form, e.g. {{UserAttribute('First Seen')|default('MOE_NOT_SEND')}}](../screenshots/02-builder-email-073-merge-tags-jinja-default.png)
*Merge tags list in Jinja form, e.g. {{UserAttribute\['First Seen'\]|default('MOE\_NOT\_SEND')}}*

![Special links dialog: search, 'Frequently used' category](../screenshots/02-builder-email-074-special-links-categories.jpg)
*Special links dialog: search, 'Frequently used' category*

![Frequently used special link: View in browser](../screenshots/02-builder-email-075-special-links-view-in-browser.jpg)
*Frequently used special link: View in browser*

![Toolbar More menu: Personalized Links, Personalize](../screenshots/02-builder-email-076-toolbar-more-personalize-menu.jpg)
*Toolbar More menu: Personalized Links, Personalize*

![Personalize from the editor opens the same Email Personalization drawer (fallbacks incl. Replace text)](../screenshots/02-builder-email-077-editor-personalize-drawer.jpg)
*Personalize from the editor opens the same Email Personalization drawer (fallbacks incl. Replace text)*

![First Name selected with 'Replace text' fallback field](../screenshots/02-builder-email-078-personalize-replace-text-fallback.jpg)
*First Name selected with 'Replace text' fallback field*

![PERSONALIZE LINK modal: Display Text, Protocol, URL (@ personalization)](../screenshots/02-builder-email-079-personalize-link-modal.jpg)
*PERSONALIZE LINK modal: Display Text, Protocol, URL (@ personalization)*

![Protocol options: None, http://, https://, ftp://](../screenshots/02-builder-email-080-personalize-link-protocols.jpg)
*Protocol options: None, http://, https://, ftp://*

![Image properties: Replace, Apply effects, URL, Dynamic Image, width, align, alt text, Image link](../screenshots/02-builder-email-081-image-block-properties.jpg)
*Image properties: Replace, Apply effects, URL, Dynamic Image, width, align, alt text, Image link*

![Dynamic Image on: 'Dynamic Url' field with a note on preview dimensions](../screenshots/02-builder-email-082-image-dynamic-image-url.jpg)
*Dynamic Image on: 'Dynamic Url' field with a note on preview dimensions*

![Image link actions: Open web page, Send email, Make call, Send SMS](../screenshots/02-builder-email-083-image-link-action-types.jpg)
*Image link actions: Open web page, Send email, Make call, Send SMS*

![File manager: Upload, Import, Search free photos; empty folder](../screenshots/02-builder-email-084-file-manager-empty.jpg)
*File manager: Upload, Import, Search free photos; empty folder*

![Search free photos: 500,000+ CC0 stock photos powered by Pexels and Pixabay](../screenshots/02-builder-email-085-search-free-photos-pexels-pixabay.jpg)
*Search free photos: 500,000+ CC0 stock photos powered by Pexels and Pixabay*

![Image editor: Filter, Resize, Crop, Transform, Draw, Text, Shapes, Stickers, Frame, Corners](../screenshots/02-builder-email-086-image-editor-apply-effects.jpg)
*Image editor: Filter, Resize, Crop, Transform, Draw, Text, Shapes, Stickers, Frame, Corners*

![Button properties: link type/URL, Personalized Links, width, font, colors, align, line height; toolbar with Merge tags / Personalize](../screenshots/02-builder-email-087-button-block-properties.jpg)
*Button properties: link type/URL, Personalized Links, width, font, colors, align, line height; toolbar with Merge tags / Personalize*

![Social properties: icon collection, per-network URL, Add new icon, align, spacing](../screenshots/02-builder-email-088-social-block-properties.jpg)
*Social properties: icon collection, per-network URL, Add new icon, align, spacing*

![Dynamic Content properties: 'Select the content to use' + ADD OPTION](../screenshots/02-builder-email-089-dynamic-content-block-properties.jpg)
*Dynamic Content properties: 'Select the content to use' + ADD OPTION*

![PERSONALIZED CONTENT dialog: Content Block Name, Image Source URL (@), fallback image or Do not send](../screenshots/02-builder-email-090-personalized-content-dialog-top.jpg)
*PERSONALIZED CONTENT dialog: Content Block Name, Image Source URL (@), fallback image or Do not send*

![Personalized content: Alternate Text, Target URL, Target window, Width/Height/Border/HSpace/VSpace/Align](../screenshots/02-builder-email-091-personalized-content-dialog-bottom.jpg)
*Personalized content: Alternate Text, Target URL, Target window, Width/Height/Border/HSpace/VSpace/Align*

![Content Block dropped: 'Add/Edit Content Block' button](../screenshots/02-builder-email-092-content-block-placeholder.jpg)
*Content Block dropped: 'Add/Edit Content Block' button*

![Content block picker (Email Personalization, Content blocks tab)](../screenshots/02-builder-email-093-content-block-picker.jpg)
*Content block picker (Email Personalization, Content blocks tab)*

![Content Block properties: Add/Edit Content Block + HTML code area ('HTML experts only')](../screenshots/02-builder-email-094-content-block-html-properties.jpg)
*Content Block properties: Add/Edit Content Block + HTML code area ('HTML experts only')*

![Video properties: YouTube/Vimeo URL auto-generates a preview image, Title, attributes](../screenshots/02-builder-email-095-video-block-properties.jpg)
*Video properties: YouTube/Vimeo URL auto-generates a preview image, Title, attributes*

![GIFs block: GIPHY search picker](../screenshots/02-builder-email-096-gifs-giphy-picker.jpg)
*GIFs block: GIPHY search picker*

![Icons properties: Add new icon, font, size, spacing, padding](../screenshots/02-builder-email-097-icons-block-properties.jpg)
*Icons properties: Add new icon, font, size, spacing, padding*

![Menu properties: Add new item, layout, separator, Mobile menu toggle](../screenshots/02-builder-email-098-menu-block-properties.jpg)
*Menu properties: Add new item, layout, separator, Mobile menu toggle*

![Table properties: columns, rows, border, striped rows, header row styling](../screenshots/02-builder-email-099-table-block-properties.jpg)
*Table properties: columns, rows, border, striped rows, header row styling*

![Row properties: backgrounds, borders, rounded corners, vertical align, stack on mobile; save row/delete/duplicate icons](../screenshots/02-builder-email-100-row-properties-top.jpg)
*Row properties: backgrounds, borders, rounded corners, vertical align, stack on mobile; save row/delete/duplicate icons*

![Row 'Dynamic content' display condition + Columns structure / column padding](../screenshots/02-builder-email-101-row-display-condition-columns.jpg)
*Row 'Dynamic content' display condition + Columns structure / column padding*

![Add a new display condition: Name, Description, Before, After (conditional statement wrappers)](../screenshots/02-builder-email-102-row-add-display-condition.jpg)
*Add a new display condition: Name, Description, Before, After (conditional statement wrappers)*

![Editor canvas in mobile view](../screenshots/02-builder-email-103-editor-mobile-view.jpg)
*Editor canvas in mobile view*

![Change history panel (timestamped list of edits)](../screenshots/02-builder-email-104-editor-change-history.jpg)
*Change history panel (timestamped list of edits)*

#### Preview and Test Campaign

![Personalized preview: select user by Email Id, Fetch user data, desktop render (user email redacted)](../screenshots/02-builder-email-105-preview-personalized.jpg)
*Personalized preview: select user by Email Id, Fetch user data, desktop render (user email redacted)*

![Inbox preview: Run and save test, 10 tests remaining of a monthly quota of 10](../screenshots/02-builder-email-106-preview-inbox-quota.jpg)
*Inbox preview: Run and save test, 10 tests remaining of a monthly quota of 10*

![Editor Preview mode: light/dark toggle, desktop/tablet/mobile, resolution](../screenshots/02-builder-email-107-preview-mode-light-desktop.jpg)
*Editor Preview mode: light/dark toggle, desktop/tablet/mobile, resolution*

![Dark-mode preview at mobile size (320x480)](../screenshots/02-builder-email-108-preview-mode-dark-mobile.jpg)
*Dark-mode preview at mobile size (320x480)*

![UTM parameters (disabled via Settings) and the Test Campaign section](../screenshots/02-builder-email-109-utm-and-test-campaign-section.jpg)
*UTM parameters (disabled via Settings) and the Test Campaign section*

![Test 'Send via': Custom Segment, Email ID (Registered users), Email ID (Non-registered users), Unique ID, Mobile Number](../screenshots/02-builder-email-110-test-send-via-options.jpg)
*Test 'Send via': Custom Segment, Email ID (Registered users), Email ID (Non-registered users), Unique ID, Mobile Number*

!['Personalise with a random user' tooltip](../screenshots/02-builder-email-111-test-random-user-tooltip.jpg)
*'Personalise with a random user' tooltip*

#### Custom HTML editor

!['Switch to HTML editor' confirm: one-time action, cannot revert to drag & drop](../screenshots/02-builder-email-112-switch-to-html-confirm.jpg)
*'Switch to HTML editor' confirm: one-time action, cannot revert to drag & drop*

![Change Template confirm: 'All your changes will be lost'](../screenshots/02-builder-email-113-change-template-discard-confirm.jpg)
*Change Template confirm: 'All your changes will be lost'*

![HTML Template Editor: toolbar, code view, Link/Image personalization, Preview pane](../screenshots/02-builder-email-114-html-template-editor.jpg)
*HTML Template Editor: toolbar, code view, Link/Image personalization, Preview pane*

![HTML editor Template actions: Change template, Download, Save template](../screenshots/02-builder-email-115-html-editor-template-actions.jpg)
*HTML editor Template actions: Change template, Download, Save template*

![Link personalisation: 'Create personalized URL. Copy and paste wherever required.' + Copy](../screenshots/02-builder-email-116-html-link-personalisation.jpg)
*Link personalisation: 'Create personalized URL. Copy and paste wherever required.' + Copy*

![Image Personalization modal: Image Source URL (@), fallback image URL or Do not send this email](../screenshots/02-builder-email-117-html-image-personalization.jpg)
*Image Personalization modal: Image Source URL (@), fallback image URL or Do not send this email*

![View advanced preview with an empty template: 'Template is empty' toast](../screenshots/02-builder-email-118-advanced-preview-template-empty.jpg)
*View advanced preview with an empty template: 'Template is empty' toast*

#### Email Periodic, Step 1

![Emails (Periodic) step 1: same fields as One Time](../screenshots/02-builder-email-122-periodic-step1-target-users.jpg)
*Emails (Periodic) step 1: same fields as One Time*

#### Email Event Triggered, Step 1 (trigger config)

![Emails (Event Triggered) step 1 top](../screenshots/02-builder-email-123-event-trigger-step1-top.jpg)
*Emails (Event Triggered) step 1 top*

![Trigger condition block: primary event, alternate/secondary event links, With Delay 3 Days After If Action](../screenshots/02-builder-email-124-event-trigger-condition-with-delay.jpg)
*Trigger condition block: primary event, alternate/secondary event links, With Delay 3 Days After If Action*

![Trigger event dropdown is empty (no tracked events)](../screenshots/02-builder-email-125-event-trigger-event-list-empty.jpg)
*Trigger event dropdown is empty (no tracked events)*

!['If Action' dropdown (only option without a secondary event)](../screenshots/02-builder-email-126-event-trigger-if-action-option.jpg)
*'If Action' dropdown (only option without a secondary event)*

![Immediately: 'Trigger Messages with only IF condition can now be sent immediately i.e within few mins of every action'](../screenshots/02-builder-email-127-event-trigger-immediately-note.jpg)
*Immediately: 'Trigger Messages with only IF condition can now be sent immediately i.e within few mins of every action'*
