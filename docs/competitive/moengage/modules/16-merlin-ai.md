## 16. Merlin AI Studio (AI features)

Storees has no AI hub, but its screens carry more AI than Merlin AI Studio's three live tools: SMS, push and email copywriters that apply 1-5 variants in place, an AI Email Designer that uses the brand kit, a WhatsApp template copilot, AI Rewrite in the email builder, Next Best Action and a WhatsApp chatbot. It has no image generation, personalization-code assistant, AI analytics, usage metering, output feedback or in-app help, and three shipped AI paths are broken at `2063cdc`: Segment AI calls a retired Groq model (and treats rupees as paise), the email step's "Apply body" replaces the sent email with bare AI text, and AI-designed emails fail the template save lint. The cheapest wins are fixing those three, adding Indian regional languages and Hinglish to the copywriter, and one AI Studio page that makes the existing tools discoverable.

### MoEngage overview

Merlin AI Studio is MoEngage's generative-AI hub, linked from a "Merlin AI Studio" item in the top header of every page. Six tool cards each sit behind their own account feature flag (read through `POST /sentry-status`); three are live in this Test workspace.

- **Copywriter.** A sentence-style prompt form, not a chat, for Push, Email (subject line plus preview text), In-app and OSM.
  - Inputs: a required use case; 20 include-keyword presets plus custom keywords; 19 spam-word excludes; 20 audience personas; 12 tones; 89 writing styles in 5 groups (trends, celebrity personas, pop-culture characters, archetypes, authors); 21 languages plus 5 internet dialects including Hinglish; personalization attributes loaded from the workspace; a coupon field; an emoji toggle; and a 1-500 character limit for In-app and OSM.
  - Output (seen only in the front-end code, because Generate was not clicked): one variation per request, a push or inbox preview, per-field copy buttons, thumbs feedback, and a "Monthly utilization: X/Y" counter per channel.
- **Designer.** Image generation in 6 aspect ratios (21:9 default) from an optional description and/or a reference image (upload up to 5 MB, or a URL).
- **Jinja Assist (Beta).** Turns plain language into MoEngage Jinja, or fixes broken Jinja, and explains it. Prompts can be grounded on a saved template or an uploaded HTML file. It offers 9 sample prompts (4 of them as starter cards). From code: Test Code against a chosen user's data, "Fix with AI", and feedback.
- **Coming soon** (flag off here): Segment Assist (natural-language segments), In-app Template (spin-the-wheel, scratch card, countdown and survey generators) and Flow Assist.
- **Example gallery.** About 20 example cards, filterable by tool, that deep-link into each tool pre-filled and never auto-generate.
- **Elsewhere in the code:** a Campaign Insight Agent ("Ask Merlin to…"), AI-distributed message variations with CTR-uplift reporting, trigger-delay optimisation by open rate, revenue-based A/B optimisation, "Best time for user (Merlin AI)", and AI descriptions for attributes and events.
- **Help.** The header "Need help" menu has "Ask AI", which opens AIRA, an AI support assistant in the Intercom messenger.
- **Absent:** brand-voice setup, guardrail configuration and a credits page.

| Page visited | URL path |
|---|---|
| Merlin AI Studio (landing / tool hub) | `/v4/dpm/merlin-ai-studio` |
| Copywriter | `/v4/dpm/merlin-ai-studio/copywriter` |
| Designer | `/v4/dpm/merlin-ai-studio/designer` |
| Jinja Assist (Jinja AI) | `/v4/developers/jinja-ai?source=merlin-ai-studio` |
| Coming-soon tool routes: Segment Assist / Flow Assist / In-app Template | `/v4/segmentation/create?source=merlin-ai-studio`; `/v4/flows-templates` (redirects to `/v4/flows/all`); `/v4/inapp/templates` (redirects to `/v4/campaigns/all`) |
| Need help > Ask AI (support AI assistant) | Header "Need help" menu, any page |

**Capture limits.**
- **Not generated:** Generate was never clicked in Copywriter, Designer or Jinja Assist, to save the monthly quota. Output previews, copy buttons, image download, Test Code, Fix with AI, feedback modals, the utilization counter and the exit modals are described from front-end strings.
- **Blocked:** Jinja "Select Template" returned 401 ("Failed to fetch templates"). The file choosers were not opened.
- **Gated:** Segment Assist, In-app Template and Flow Assist are off by flag. The Campaign Insight Agent needs a campaign with stats, and the workspace had only 2 drafts.
- **Out of scope:** Merlin buttons inside the campaign builders (builder modules) and Settings > Account > MCP (Settings capture). No support conversation was started in Ask AI.
- **No side effects:** nothing was generated, saved, uploaded or sent.

### Storees counterpart

There is no AI hub, AI nav item or header entry: the sidebar has no AI link (`packages/frontend/src/components/layout/Sidebar.tsx:54-80`), and the app shell is only the sidebar plus the trial banner (`packages/frontend/src/components/layout/AppShell.tsx`). AI is built into individual screens:

| Storees AI surface | Where it appears | API / engine |
|---|---|---|
| AI Copywriter modal ("Generate with AI") | SMS, push and in-app content step: `packages/frontend/src/app/(dashboard)/campaigns/create/page.tsx:2722-2753`, component `packages/frontend/src/components/campaigns/AiCopywriterPanel.tsx` | `POST /api/ai/copywriter` → `packages/backend/src/services/copywriterService.ts` |
| Inline "AI Copywriter" card | Email, SMS, push and in-app steps of campaign create and edit: `packages/frontend/src/components/campaigns/CampaignAiCopywriter.tsx` | `POST /api/ai/campaign-variations` (`packages/backend/src/routes/ai.ts:166-232`) |
| AI Rewrite on email text blocks | Email builder: `packages/frontend/src/components/email-builder/BlockPropertyEditor.tsx` | Same campaign-variations endpoint |
| AI Email Designer | `/templates/ai` (`packages/frontend/src/app/(dashboard)/templates/ai/page.tsx`), reached only from "Design with AI" on `/templates` | `POST /api/ai/email-layout` → `emailLayoutService.ts`, `emailLayoutRenderer.ts` |
| WhatsApp template copilot | "Generate with AI" in `packages/frontend/src/components/whatsapp/WhatsAppTemplateBuilder.tsx`, also opened from the campaign WhatsApp step | `POST /api/ai/whatsapp-template` → `whatsappCopilotService.ts` |
| Segment AI chat | `/segments/create` and `/segments/[id]/edit` (`packages/frontend/src/components/segments/AiChatPanel.tsx`) | `POST /api/ai/segment` → `aiSegmentService.ts` (calls Groq directly) |
| Next Best Action | `/customers/[id]` (`packages/frontend/src/components/customers/NextBestActionCard.tsx`) | `POST /api/ai/next-action/:customerId` → `nextBestActionService.ts` |
| WhatsApp AI chatbot | Settings (`packages/frontend/src/app/(dashboard)/settings/WhatsappChatbotPanel.tsx`) | `whatsappChatbotService.ts` |
| AI provider settings | Settings, AI (`packages/frontend/src/app/(dashboard)/settings/page.tsx:657-830`) | `GET/POST /api/ai/config`, `POST /api/ai/test-connection` → `llmService.ts` |

Everything except Segment AI goes through `packages/backend/src/services/llmService.ts`. It uses the project's own Groq, OpenAI or Anthropic key from Settings, AI, and otherwise the server's `GROQ_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (lines 52-82), with a fallback for retired Groq models (lines 24-40, 112-157). The non-generative counterparts of Merlin's optimisation features are rule-based "Best time for user" scheduling (`packages/backend/src/services/sendTimeService.ts`) and ML prediction goals (`packages/ml`, covered in module 08). `routes/agents.ts` is B2B dealer administration, not AI agents.

### Parity table

| Area | Feature | MoEngage | Storees | Evidence | Gap / recommendation | Priority | Effort |
|---|---|---|---|---|---|---|---|
| Studio hub | AI tool hub with a global header entry point | Landing page "What can Merlin do for you today?" with 6 tool cards (3 live, 3 "Coming soon"); "Merlin AI Studio" link in the header of every page | ❌ Missing | No hub route, nav item or header (`Sidebar.tsx:54-80`; `AppShell.tsx`). The tools are scattered: `campaigns/create/page.tsx:2140, 2743, 2867`; `templates/ai/page.tsx`, reached only from `templates/page.tsx:137`; `WhatsAppTemplateBuilder.tsx:329`; `segments/create/page.tsx:144`; `customers/[id]/page.tsx:170` | Storees has eight AI surfaces but nowhere to discover them, so demos never show an "AI suite". Add an AI Studio page with cards linking to the existing tools, plus a sidebar entry. | P2 | S |
| Studio hub | Example prompt gallery with filter | About 20 example cards tagged Designer, Jinja, Copywriter or Segment, with a "Filter by" dropdown | 🟡 Partial | Only Segment AI has examples: 3 clickable prompts (`AiChatPanel.tsx:151-164, 340-344`). They are fintech ("verified KYC and active SIPs", "portfolio over 5 lakh") and shown to every project. The copywriter, email designer and WhatsApp copilot have placeholder text only (`AiCopywriterPanel.tsx:105`; `templates/ai/page.tsx:88`; `WhatsAppBriefModal.tsx:68`) | No examples to browse, and the only ones are for the wrong vertical. Add vertical-aware examples: abandoned-cart push, Diwali sale on WhatsApp, win-back email, "opened an email last week". | P3 | S |
| Studio hub | Example deep links (pre-fill, never auto-generate) | An example opens its tool pre-filled (`/copywriter?id=N`, `/designer?id=N`, `/jinja-ai?…&id=N`); nothing runs until Generate | ❌ Missing | No AI tool reads a pre-fill parameter: `templates/ai/page.tsx` reads no search params, and `AiCopywriterPanel` gets only `initialUseCase` from the composer body (`create/page.tsx:2747`). The only pre-fill deep link is Next Best Action to `/campaigns/create?channel=&nbaAction=` (`NextBestActionCard.tsx:100-103`; `create/page.tsx:423-447`) | Needed only once a gallery exists; reuse the Next Best Action query-parameter pattern. | P3 | S |
| Studio hub | Per-tool feature gating and availability messaging | Each tool behind its own account flag; disabled cards show "Coming soon"; disabled examples toast "Please contact your account manager…" | 🟡 Partial | Entitlements define `ai_chatbot` and `ai_email_designer` (`entitlementService.ts:15, 27, 36-39`). Only `ai_chatbot` is enforced (`whatsappChatbotService.ts:117`), with an "Upgrade to unlock" panel (`WhatsappChatbotPanel.tsx:14, 80`). `ai_email_designer` is never checked, and the copywriters, copilot and Segment AI are ungated. Users learn AI is off only after Generate ("No LLM provider configured…", `copywriterService.ts:109-112`). `/api/ai/status` checks only the server's `GROQ_API_KEY` (`aiSegmentService.ts:362-364`), so Segment AI tells merchants to set an env var (`AiChatPanel.tsx:136-142`) | Gate each tool through entitlements and show availability before use: with no provider configured, disable Generate and link to Settings, AI. | P3 | S |
| Copywriter | Channel: Push (title + message) | Title, message and summary, shown in a push preview | ✅ Full | Push copy is a title of at most 50 characters plus a body of at most 200 (`copywriterService.ts:35-40`), via `POST /api/ai/copywriter` (`routes/ai.ts:83-123`). The modal applies the title to `pushTitle` and the body to `bodyText` (`create/page.tsx:2743-2753`); the inline card adds "Apply title" (`create/page.tsx:2867-2874`; `[id]/edit/page.tsx:1163-1171`). New push campaigns use these single-platform fields by default (`create/page.tsx:495, 626-627`) | None for the core. No summary field. Once Android, iOS or Web tabs are ticked, per-platform content is sent (`MultiPlatformPushBlock.tsx:8-15`) and AI copy is not copied into it. | — | — |
| Copywriter | Channel: Email (subject line + preview text) | Generates a subject line and preview text, shown in an inbox preview on mobile and desktop | 🟡 Partial | Email copy is a subject plus a body (`copywriterService.ts:36`; `routes/ai.ts:187-192`); the inline card on the email step applies both (`create/page.tsx:2140-2147`; `[id]/edit/page.tsx:698-706`). No AI writes preview text, although campaigns have `previewText`. **Defect:** "Apply body" calls `setHtmlBody` while the builder JSON keeps the old design (`create/page.tsx:1994-2008`; `[id]/edit/page.tsx:790`). The send uses `htmlBody` (`campaignService.ts:952`), so the bare AI text goes out, with no layout and no visible unsubscribe footer, and the next builder edit silently drops it | Fix the defect first: apply the AI body into a Text block, or disable "Apply body" in the visual editor. Then generate subject + preheader pairs. | P1 | S |
| Copywriter | Channels: In-app and OSM (on-site message) | In-app and OSM, each with a required "under characters" limit | 🟡 Partial | The modal sends in-app as push and applies the title to `subject` (`create/page.tsx:2746-2752`). The inline card posts `channel: 'in_app'`, which `/api/ai/campaign-variations` rejects with 400 "Valid channel is required" (`routes/ai.ts:175-177`); this happens on create and edit (`[id]/edit/page.tsx:979, 1163`). Opt-in widgets (`/widgets`) have no AI. No SDK renders in-app messages (`packages/sdk/src` has only the opt-in `widget.ts`) | In-app copy works only through the modal, and the inline card errors. Low value until in-app messages render. | P3 | S |
| Copywriter | Use-case prompt (required) | Required "Describe your use case\*" textarea | ✅ Full | `AiCopywriterPanel.tsx:99-108` (Generate disabled until filled, line 180); `CampaignAiCopywriter.tsx:94-103`. The backend requires `useCase`, up to 800 characters (`routes/ai.ts:90-95`) | None. | — | — |
| Copywriter | Include "high performing" keywords (20 presets + custom) | Searchable multi-select of 20 presets; a new word is offered under "Newly Created" | 🟡 Partial | Free-text, comma-separated "Include keywords" in both panels (`AiCopywriterPanel.tsx:144-154`; `CampaignAiCopywriter.tsx:105-108`), sent as "Try to include these keywords naturally" (`copywriterService.ts:84-86`). No presets | Add preset chips plus custom entry; the gap is cosmetic. | P3 | S |
| Copywriter | Exclude keywords (19 spam-trigger presets) | Multi-select of 19 spam words (Unsecured, Jackpot, Cash, Free, Guarantee…) | 🟡 Partial | Free-text "Exclude keywords" (`AiCopywriterPanel.tsx:155-164`; `CampaignAiCopywriter.tsx:109-112`), sent as "Avoid these words entirely" (`copywriterService.ts:87-89`). No presets. Separately, content lint flags 7 spam patterns in subject lines (`contentLint.ts:77-93`) | Pre-fill the exclude list with common spam triggers, reusing the lint list. | P3 | S |
| Copywriter | Target audience ("and convert this for", 20 personas) | 20 preset personas (Gen Z Enthusiasts, Deal Seekers, Inactive Users…) | 🟡 Partial | Free-text "Audience persona" (`AiCopywriterPanel.tsx:134-142`) and "Target audience" (`CampaignAiCopywriter.tsx:115-118`), both put into the prompt. No presets | Add D2C persona presets, or better, let the user pick a Storees segment and pass its summary as the audience. | P3 | S |
| Copywriter | Voice / tone (12 options) | Persuasive, Informative, Excitement, FOMO, Exclusivity, Trust, Empathetic, Humor, Educational, Curiosity, Casual, Professional | 🟡 Partial | The modal has 5 tones, MoEngage's first five (`AiCopywriterPanel.tsx:29-35`; `routes/ai.ts:80`; `copywriterService.ts:42-48`). The inline card has 4 different ones (`CampaignAiCopywriter.tsx:120-127`), the WhatsApp copilot another 4 (`WhatsAppBriefModal.tsx:9-14`) and the email designer 6 (`templates/ai/page.tsx:14`) | 7 tones are missing, and four AI tools use four different tone lists. Unify them. | P3 | S |
| Copywriter | Writing style (89 options in 5 groups) | Trends, 20 celebrity personas, 20 pop-culture characters, 20 archetypes, 20 authors | 🟡 Partial | Only the inline card has styles, 4 of them (`CampaignAiCopywriter.tsx:131-139`); the modal has none | Add the 9 Trends styles and the archetypes. Celebrity and fictional voices add little and carry publicity-rights risk. | P3 | S |
| Copywriter | Output language: global languages (21, incl. 7 Indian) | 21 languages including Hindi, Bengali, Urdu, Marathi, Telugu, Tamil, Kannada, Arabic, Bahasa, Thai | 🟡 Partial | The modal offers en, hi, ta, fr, es and zh (`AiCopywriterPanel.tsx:37-44`; validated at `routes/ai.ts:81`; `copywriterService.ts:50-57`). The inline card offers English, Hindi, Arabic, Spanish and French (`CampaignAiCopywriter.tsx:141-149`). The WhatsApp copilot writes in the template's language (`WhatsAppBriefModal.tsx:100`). The email-layout API accepts `language`, but the UI never sends it (`routes/ai.ts:62`; `templates/ai/page.tsx:34`) | Add Bengali, Marathi, Telugu, Kannada, Malayalam, Gujarati, Urdu, Bahasa, Thai and others, with one shared list. Regional languages matter in Indian D2C deals, and this is a list change. | P1 | S |
| Copywriter | Output language: internet dialects (Hinglish, Digital Slang, Fashion Lingo, Corporate Jargon, Leetspeak) | "Internet Trends" group in the language picker | ❌ Missing | No dialect option in any AI language list (`AiCopywriterPanel.tsx:37-44`; `CampaignAiCopywriter.tsx:143-149`; `copywriterService.ts:50-57`) | Much Indian D2C push and WhatsApp copy is Hinglish. Add Hinglish (and Tanglish) as languages, with prompt guidance on Roman-script mixing. | P1 | S |
| Copywriter | Personalization attribute from tracked attributes | Searchable list of the workspace's user attributes grouped by category, from the segmentation metadata API | 🟡 Partial | Only the inline card has a picker, a fixed select of 4 tokens (`CampaignAiCopywriter.tsx:153-161`), sent as a prompt hint (line 57). The project's catalog (`GET /api/templates/variable-sources`, `routes/templates.ts:115-124`; `variableSources.ts`) is unused. `city` and `order_id` are not system keys (`templateContext.ts:294-318`), so they still need a mapping once inserted | Load the picker from variable-sources, grouped, and create the mapping when the AI inserts a token. | P2 | S |
| Copywriter | Coupon code and "Include emoji" | "and add coupon" field and "Include emoji" checkbox | ✅ Full | The inline card has "Coupon code" and "Include emoji" (`CampaignAiCopywriter.tsx:162-175`), both added to the brief (lines 58-59) | None. The modal lacks both; merging the two panels fixes that. | — | — |
| Copywriter | Character limit (In-app/OSM; 1-500, default 25) | Required "under characters\*" stepper | 🟡 Partial | No user-set limit. Each channel has a fixed limit in the prompt: SMS 160, push 50/200, WhatsApp 1024, email subject 60 (`copywriterService.ts:35-40`; `routes/ai.ts:187-192`). The modal counts characters and warns above 160 for SMS (`AiCopywriterPanel.tsx:243-246`) | Add an optional maximum-characters input, useful for small-screen push, SMS segments and in-app. | P3 | S |
| Copywriter | Output handling: variations, copy and apply | One variation per request, paging, per-field Copy and "Copy all"; the Studio is standalone, so output is pasted into a campaign; exit-confirmation modal | ⭐ Storees better | The modal generates 1-5 variants at once (`AiCopywriterPanel.tsx:167-176`; `copywriterService.ts:60`), each with Apply into the campaign fields (lines 215-251). The inline card returns 3 with "Apply title" and "Apply body" (`CampaignAiCopywriter.tsx:83, 189-212`) | Ahead for SMS and push: variants side by side, one-click apply inside the composer. No copy buttons or exit warning, and see the email "Apply body" defect and the in-app 400 above. | — | — |
| Copywriter | Channel preview of generated copy (push device, email inbox) | The right pane renders a push notification or an inbox row on mobile and desktop | 🟡 Partial | AI results are plain text cards (`AiCopywriterPanel.tsx:215-251`; `CampaignAiCopywriter.tsx:191-210`). The composer has previews that AI results don't use: Android, iOS and Web push (`MultiPlatformPushBlock.tsx:218-290`) and `WhatsappBubblePreview` (`create/page.tsx:2613`) | Show each variant in the existing previews, plus an inbox mock, before Apply. | P3 | S |
| Copywriter | Output feedback (thumbs + feedback modal) and AI disclaimer | Thumbs up/down, "How can we make it better?" modal, "Merlin AI can make mistakes" | ❌ Missing | No thumbs, feedback endpoint or disclaimer in any AI panel; searches for ThumbsUp, ThumbsDown, aiFeedback, "can make mistakes" and "was this helpful" across frontend and backend find nothing | No signal for tuning prompts or measuring AI quality. Add thumbs plus an optional reason on every AI output, stored per tool. | P3 | S |
| Copywriter | Usage limits: monthly utilization counter | "Monthly utilization: X/Y messages generated" per channel; a separate visual counter; no credits page | ❌ Missing | No AI metering, quotas or counters; entitlement limits cover contacts, messages, flows, templates, seats and stores only (`entitlementService.ts:16`). `/api/ai` is mounted with `requireAuth` only (`index.ts:198`). The Redis `rateLimiter` middleware exists but is used only on auth, device-id and recognize routes. Projects without their own key fall back to the server's Groq, OpenAI or Anthropic key (`llmService.ts:70-79`) | Self-serve trial and keyless projects spend Storees' LLM key with no cap and no rate limit. Put `rateLimiter` on `/api/ai` now; then add per-project monthly counters, plan limits and an "X/Y generations this month" display. | P2 | M |
| Designer | AI image generation with aspect ratios (21:9, 16:9, 4:3, 1:1, 3:4, 9:16) | Marketing banners and hero images in 6 aspect ratios | ❌ Missing | No image-generation code: searches for dall-e, gpt-image, stable diffusion, imagen, images/generations, text-to-image, replicate, fal and flux find nothing. `llmService.ts` does chat completions only (lines 87-102), and of the three bring-your-own providers only OpenAI offers images | No AI banners for email, push or WhatsApp media headers. Add an image endpoint with its own provider key, save outputs to the asset store, and surface them in the email Image block and the WhatsApp media header. | P2 | M |
| Designer | Image description / creative-direction prompt | Optional description; tooltip links to prompt ideas; a default prompt is used when it is empty | ❌ Missing | No image prompt UI; image blocks take an upload or a URL only (`BlockPropertyEditor.tsx:275-318`) | Comes with image generation. | P2 | S |
| Designer | Reference image (upload jpg/png up to 5 MB, or image URL) | "Add reference image": upload or image URL | ❌ Missing | No reference-image generation. Reusable plumbing: `POST /api/assets/email-image` (JPG, PNG, GIF or WebP up to 5 MB; `routes/assets.ts:54-118`) and the builder's Recent Uploads picker (`BlockPropertyEditor.tsx:275-318`) | Reuse the upload and recent-images picker as the reference input, for example to restyle a Shopify product photo into a sale banner. | P3 | S |
| Designer | Image output actions (download, copy URL, feedback, visual counter, exit confirmation) | Preview, Download Image, Copy Image URL, thumbs, a monthly visual counter, "Exit Merlin AI Designer?" | ❌ Missing | Nothing to act on, because no images are generated. `storageService.ts` (S3, R2 or local) could host the outputs | Comes with image generation. Inserting the image straight into a template block would beat a download and copy-URL flow. | P3 | S |
| Jinja Assist | Plain-language personalization code: generate, fix and explain, grounded on a saved template or HTML | Beta tool that generates or fixes MoEngage Jinja and explains it; "Select Template" and "Upload HTML File"; also "Jinja AI" under Test and Debug | ❌ Missing | Storees has no templating language to generate. Personalization is `{{key}}` tokens mapped to sources, with defaults and 7 formatters (`templateContext.ts:142, 235-258`; `shared/src/types.ts:1113-1120`). There are no conditionals or loops (no jinja, liquid, handlebars or nunjucks anywhere) and no AI help for mapping | Matters only once conditional content exists (a Content-module gap). Nearer win: describe the personalization in words and get suggested mappings and fallbacks. | P3 | L |
| Jinja Assist | Sample prompt library | 9 prompts: 4 as starter cards, all 9 in a "Sample Prompts" modal | ❌ Missing | No code-based personalization tool to attach them to | Comes with the tool. | P3 | S |
| Jinja Assist | Test against a real user's data | Pick a user by identifier; rendered output; inputs grouped by type; "Show missing attributes only"; fallbacks; Refresh Preview | 🟡 Partial | The template editor's "Test with sample customer" renders through the send-time resolver with a "Resolved variables" table and lint results (`VariablePanel.tsx:92-98, 151, 428`; `POST /api/templates/preview`, `routes/templates.ts:126-281`). It always uses the most recently seen customer (lines 194-201), although the API accepts `sampleCustomerId`. Campaign create and edit have "Auto sample customer" pickers with "Render data" for email, WhatsApp and SMS/push (`create/page.tsx:2035, 2505, 2934`; `[id]/edit/page.tsx:716-739, 1079-1096, 1177-1195`), each listing only the 20 most recently seen customers (`create/page.tsx:1715`) | Add customer search by email, phone or ID to both previews, and a filter for unresolved or empty variables. | P2 | S |
| Jinja Assist | "Fix with AI" auto-repair | Repairs template errors automatically ("Template was automatically fixed") | ❌ Missing | Save-time lint reports `undefined_variable`, unknown fields and bad formats, and blocks the save (`templateLint.ts:92-106`; `routes/templates.ts:328-332`). There is no one-click or AI fix | Propose mappings for undefined tokens. That would remove a common save failure, such as `{{cart_url}}` in AI Email Designer output. | P3 | S |
| Segment Assist | Natural-language segment creation | Segment builder in AI mode; flag-gated here ("Coming soon", blank panel). Examples are engagement-based ("clicked a push at least 5 times in the last 30 days") | 🟡 Partial | Segment AI chat on segment create and edit (`AiChatPanel.tsx`; `segments/create/page.tsx:141-144`; `segments/[id]/edit/page.tsx:218-221`): multi-turn, voice input in 6 languages (`useSpeechRecognition.ts:17-24`), domain fields plus order-line aggregates, validated before "Apply to Builder" (`aiSegmentService.ts:242-357`). It calls Groq directly with `llama-3.3-70b-versatile` (lines 8-9, 278-291); commit `023dbb1` records that this model was retired on 2026-08-16 and was 404ing, but only `llmService.ts` got the fallback. It ignores the project key and needs the server's `GROQ_API_KEY` (lines 247-250). The prompt says money is in paise (lines 40-43), but `total_spent` is stored in rupees (`schema.ts:141`; `customerAggregateWorker.ts:346, 483`), so "spent over ₹5,000" filters at ₹5 lakh. Event-occurrence rules work in the evaluator (`segments/src/evaluator.ts:206, 242`), but the prompt never describes them and the validator rejects them (lines 322-351). The panel is hidden below the `lg` breakpoint | Once working, this beats MoEngage, whose Segment Assist was "Coming soon" (flag off) in the captured workspace; at `2063cdc` it most likely fails every request. Route it through `getLlmConfig` + `chatCompletion`, fix the paise note, teach event rules, and use ecommerce examples. | P1 | S |
| Flow Assist | AI journey creation | Flag off ("Coming soon"); the route redirects to the Flows list | ❌ Missing | No AI flow generation (searches for generateFlow, flow assist and ai/flow find nothing). The non-AI alternative is a template gallery with 3 general and 13 ecommerce templates, plus NBFC, SaaS and edtech sets (`flowTemplates.ts:69-357`; `FlowTemplateGallery.tsx`, used in `flows/page.tsx:190`) | MoEngage has not shipped this either. A "describe your journey" generator could reuse Segment AI's validate-then-apply pattern and the template node schema. | P2 | M |
| In-app Template | AI in-app template generator (spin-the-wheel, scratch card, countdown, survey; Nudge and Popup AI templates) | "Ask Merlin to create … template for you"; disclaimer "Merlin AI can make mistakes. Verify before publishing."; flag-gated | ❌ Missing | In-app templates are a static form: title, body, image, CTA, position (modal, banner, toast, inbox), frequency and target pages (`templates/create/page.tsx:217-254, 403-450`). No gamified types (no spin, scratch or survey code). No SDK renders in-app messages; only the API exists (`routes/v1InAppMessages.ts:44, 188`) | Needs an SDK renderer and gamified template types before AI generation is worth building. | P3 | XL |
| Insights | Merlin AI Campaign Insight Agent ("Ask Merlin to…") | Chips: summarize performance, find winning patterns, analyze trends, optimize trigger playbook, diagnose delivery failures, identify underperforming metrics; seen in code only | ❌ Missing | No AI over analytics. The LLM call sites are the copywriter, campaign variations, email layout, WhatsApp copilot, chatbot, Next Best Action and the connection test (`copywriterService.ts:115`; `routes/ai.ts:194`; `emailLayoutService.ts:110`; `whatsappCopilotService.ts:84`; `whatsappChatbotService.ts:326`; `nextBestActionService.ts:141`). Settings, AI says the provider powers "natural language queries" (`settings/page.tsx:731`); none exist | Campaign and flow metrics are already computed (`campaignAnalyticsService.ts`; `flowAnalyticsService.ts`), so an "Explain this campaign" summary over that JSON would be a cheap demo. Correct the Settings copy now. | P2 | M |
| AI optimisation | Message variations distributed dynamically by AI, with CTR-uplift reporting | Merlin shifts traffic between variations and reports "Uplift in CTR due to Merlin AI optimization" | ❌ Missing | A/B tests are two variants with a fixed hash split (`campaignService.ts:52-57, 487-488`) and a winner judged afterwards (`campaignAnalyticsService.ts:488-543`). No bandit or auto-allocation code (searches for bandit, thompson, epsilon-greedy, UCB and auto-optimise find nothing) | No automatic traffic shift toward the best variant, and no uplift reporting. | P2 | L |
| AI optimisation | Trigger-delay optimisation by open rate (flows) | "Merlin AI will optimise the trigger delay based on Open rate" | ❌ Missing | Flow wait and delay nodes use fixed durations; no optimisation in `packages/flows/src` or `components/flows` (searched optimi, best time, send time, smart delay) | Low urgency for D2C flows. | P3 | L |
| AI optimisation | A/B test winner optimised by revenue per variant | A/B tests can be optimised on each variant's revenue | 🟡 Partial | The builder offers "Winner Metric" (open, click or conversion rate) and an "Auto-send winner" toggle that promises "Winning variant auto-sent to remaining audience" (`create/page.tsx:3110-3150`; `[id]/edit/page.tsx:1390-1410`). The backend ignores both. The winner is decided on open rate only, by more than 1 point (`campaignAnalyticsService.ts:538`). The whole audience is split at send, so there is no remaining audience (`campaignService.ts:52-57`), and nothing reads `abAutoSendWinner`. There is no revenue option, although revenue per goal is tracked (`campaignAnalyticsService.ts:39-44, 116-223`) | Honour `abWinnerMetric` and add revenue, since the data exists. Hide the auto-send toggle until a test-then-send-winner flow exists (that part is M). | P2 | S |
| AI optimisation | "Best time for user" send time | Send-time option "Best time for user (Merlin AI)" | 🟡 Partial | Campaign scheduling has "Best time for user" (`create/page.tsx:3356`; `[id]/edit/page.tsx:1666`). It takes each recipient's most-engaged hour from `campaign_sends.opened_at`, which includes email opens and WhatsApp/SMS read receipts (`messageStatusService.ts:122-130`), falls back to a project default (`sendTimeService.ts:15-90`), and is applied per recipient (`campaignService.ts:506-510, 1133-1137`). It is rule-based and campaign-only: flow send nodes have no best-time option | Add best time to flow send nodes, and use clicks and site activity for customers with no opens. | P2 | M |
| AI optimisation | AI-generated descriptions for user attributes and events | AI descriptions with a feedback endpoint (`/v1/ds/merlin-ai/description/feedback`) | ❌ Missing | No AI on the data dictionary. The event property registry has labels only (`shared/src/eventSchemas.ts`), and no LLM call site handles metadata | Low priority. | P3 | S |
| Help | "Ask AI" support assistant (AIRA) in the "Need help" menu | Header menu with Help center, Ask AI, Support, Explore demo account and Submit product idea; Ask AI opens the Intercom messenger | ❌ Missing | No header, help menu, help-centre link, support chat or AI assistant: the shell is `Sidebar` plus `TrialBanner` (`AppShell.tsx`). Searches for intercom, crisp, zendesk, freshchat, tawk, "help center" and "ask ai" find nothing | Self-serve trials have no in-app help at all. Add a Help menu (docs, WhatsApp support, demo), then an AI help widget grounded in the product docs. | P2 | M |
| Governance | Brand kit applied to AI output | None: no brand kit or brand-voice setup | ⭐ Storees better | The AI Email Designer renders with the project's brand kit: the logo (or a wordmark) header and the primary and accent colours (`emailLayoutRenderer.ts:38-57, 97`; tokens from `templateContext.ts:126-138`). Its preview fills live sample products (`emailLayoutService.ts:128-157`), and "Edit in builder" carries the accent colour (`templates/ai/page.tsx:52-66`) | Ahead for email. Neither product has a brand-voice field; adding one to the brand kit and feeding it into the copywriter and WhatsApp copilot would widen the lead. | — | — |
| Governance | AI guardrails (blocked terms) and an AI credits page | Absent: only per-request exclude keywords and "Merlin AI can make mistakes" disclaimers; no credits page | ➖ N/A | Storees has neither: exclude keywords exist per request only (`copywriterService.ts:87-89`). Projects with their own key are billed by their provider; keyless projects use Storees' server key unmetered (see the usage-limits row) | No gap, because neither product has it. Project-level blocked terms applied to every AI tool would be a cheap differentiator for regulated brands. | — | — |

### Storees-only strengths

- **AI Email Designer: a full email layout from a goal** (`routes/ai.ts:46-73`; `emailLayoutService.ts:20-121`; `emailLayoutRenderer.ts`; `templates/ai/page.tsx`; `lib/aiEmailToBuilder.ts`).
  - The model picks from a validated block schema (hero, paragraph, button, cart_items, product_grid, discount, divider, spacer, footer_note; up to 14 blocks), and the renderer produces a brand-tokenized, email-safe template with live cart and recommendation blocks.
  - The page has tone, cart and recommendation toggles, a sandboxed preview filled with sample products, "Save as template" and "Edit in builder".
  - MoEngage's Copywriter writes only email subject lines; this is a strong D2C demo.
  - **Defect:** "Save as template" posts no variable mappings, and every layout's button links to `{{cart_url}}` or `{{store_url}}` (`emailLayoutService.ts:43`; `emailLayoutRenderer.ts:22-27, 45`). Neither is a system key (`templateContext.ts:294-318`), so the save lint returns 400 "Template has invalid variables" (`templateLint.ts:92-106`; `routes/templates.ts:328-332`). "Edit in builder" still works. The `ai_email_designer` entitlement is never checked.
- **WhatsApp template copilot** (`whatsappCopilotService.ts:9-129`; `routes/ai.ts:125-151`; `components/whatsapp/WhatsAppBriefModal.tsx`; `WhatsAppTemplateBuilder.tsx:329, 606`).
  - Drafts Meta-compliant templates: sequential `{{n}}` parameters with sample values, category-safe wording for Utility and Authentication, and a text header, footer and buttons, in the template's own language.
  - Reachable from the campaign WhatsApp step through the "Create WhatsApp template" dialog (`create/page.tsx:2356-2361`). Merlin's Copywriter has no WhatsApp channel.
- **SMS, push and email copy with 1-5 variants applied in place** (`copywriterService.ts:35-93`; `routes/ai.ts:83-123, 166-232`; `AiCopywriterPanel.tsx:167-176, 215-251`; `CampaignAiCopywriter.tsx:189-212`).
  - Merlin covers Push, Email subject, In-app and OSM, and returns one variation per request that must be copied and pasted.
  - Caveats: the copywriter API's WhatsApp channel has no UI (WhatsApp campaigns use approved templates, so WhatsApp AI goes through the copilot), and the email step's "Apply body" is defective (see the parity table).
- **AI Rewrite inside the email builder** (`components/email-builder/BlockPropertyEditor.tsx:46-55, 141-198, 246-273`).
  - Rewrite, Shorter, Longer, Friendlier, Premium and Urgent, with 3 options per request. It uses up to 4,000 characters of the full email HTML as context and keeps `{{variables}}`.
  - Editing happens block by block where the copy lives; Merlin's Studio output has to be pasted into the editor.
- **Next Best Action per customer** (`nextBestActionService.ts`; `routes/ai.ts:153-162`; `NextBestActionCard.tsx:100-103`; `customers/[id]/page.tsx:170`).
  - An LLM recommendation with a heuristic fallback and cart-friction analysis: recover_cart, send_offer, win_back, upsell, nurture or do_nothing.
  - It links straight to a pre-filled campaign or flow. Merlin Studio shows no AI for individual users.
- **WhatsApp AI chatbot with human handoff** (`whatsappChatbotService.ts:97-177, 294-338`; `settings/WhatsappChatbotPanel.tsx:14, 80`).
  - Answers FAQs, reports order status and recommends products. It hands off to a person on request, below 0.4 confidence, at the turn cap, or when AI is unavailable.
  - Plan-gated with "Upgrade to unlock". Merlin's only chat AI here is AIRA, a support bot for MoEngage's own users.
- **Bring-your-own LLM provider with Test Connection** (`llmService.ts:5-82, 87-159`; `routes/ai.ts:234-253, 279-368, 404-416`; `settings/page.tsx:657-830`).
  - Groq, OpenAI or Anthropic: the customer controls the model, the cost and the data processor, with no vendor-metered monthly cap.
  - Caveats:
    - The key is stored in plaintext in `projects.settings` (`routes/ai.ts:351-361`), although `encryption.ts` protects other credentials.
    - The Groq model list still offers retired models (`settings/page.tsx:658`); they work only through the backend fallback.
    - Segment AI ignores this setting.
    - Keeping the "Default" model saves `ai_model: ''`. `llmService.ts:66` uses `??`, which does not replace an empty string, so OpenAI and Anthropic calls go out with an empty model name and fail until a model is picked explicitly.
- **Segment AI chat with multi-turn refinement and voice input** (`components/segments/AiChatPanel.tsx`; `hooks/useSpeechRecognition.ts:17-24`; `aiSegmentService.ts:72-103`).
  - Voice input in English, Tamil, Hindi, French, Spanish and Mandarin, plus product- and collection-scoped spend and quantity aggregates.
  - MoEngage's Segment Assist is "Coming soon" in this workspace. It must be fixed before any demo (see the parity table).

### UX notes

- **Discoverability** (screenshots 001, 002 vs `Sidebar.tsx:54-80`). MoEngage makes AI a destination: a header link on every page leads to tool cards and a filterable example gallery that pre-fills each tool. Storees' AI stays invisible until the user is deep inside a screen. The AI Email Designer is reachable only from a Templates header button, and Segment AI only on segment create and edit, hidden below the `lg` breakpoint (`segments/create/page.tsx:141`). An "AI Studio" page with cards for the existing tools (Email Designer, Copywriter, WhatsApp copilot, Segment AI, Next Best Action, Chatbot) plus a sidebar entry would take about a day and would present Storees' AI as a suite in demos.
- **Two copywriters on one screen** (screenshots 006, 013, 019 vs `AiCopywriterPanel.tsx` and `CampaignAiCopywriter.tsx`). MoEngage uses one sentence-style form with searchable, grouped preset dropdowns that also accept custom values. Storees' SMS and push step shows two AI copywriters that call two endpoints with inconsistent options:
  - The "Generate with AI" modal (`/api/ai/copywriter`) has 5 tones, 6 languages including Tamil, and a variant count.
  - The inline "AI Copywriter" card (`/api/ai/campaign-variations`) mirrors MoEngage's labels ("Describe your use case", "Type your use case/scenario") and has 4 free-text tones, 5 languages including Arabic, plus writing style, coupon and emoji.
  - Merge them into one component and one prompt engine, use preset-plus-custom comboboxes, and fill the personalization picker from `GET /api/templates/variable-sources`.
- **Output** (screenshot 006 right pane and the capture's output states vs `AiCopywriterPanel.tsx:215-251`). MoEngage renders each generation inside a push-device or inbox mock; Storees shows plain text cards. The composer already has `AndroidPreview`, `IosPreview`, `WebPreview` (`MultiPlatformPushBlock.tsx:218-290`) and `WhatsappBubblePreview` (`create/page.tsx:2613`) to reuse. Storees' output model is still better: 1-5 variants side by side with Apply into the campaign, against one variation per request with paging and Copy buttons.
- **Integration defects found while reading the code:**
  1. On the email step, "Apply body" writes the AI text over the compiled `htmlBody` while the builder keeps the old design. The send uses `htmlBody` (`campaignService.ts:952`), and the next builder edit recompiles over it (`create/page.tsx:1994-2008`; `[id]/edit/page.tsx:790`). Apply into a Text block instead.
  2. On in-app campaigns, the inline AI card posts channel `in_app`, which `/api/ai/campaign-variations` rejects with a 400 (`routes/ai.ts:175-177`), on both create and edit.
  3. AI push copy fills only the legacy single-platform fields, not the Android, iOS and Web tabs.
  4. The A/B "Auto-send winner" toggle and the "Winner Metric" select are saved but never used by the backend.
  5. Choosing the "Default" model in Settings, AI saves an empty model name, which breaks OpenAI and Anthropic calls.
- **Segment AI** (screenshot 037 vs `AiChatPanel.tsx`). MoEngage's Segment Assist is a gated, blank panel, so Storees' chat-plus-voice panel could be a demo win. Today, though:
  - It calls the decommissioned Groq model (`aiSegmentService.ts:8-9`).
  - Its empty state is a developer instruction ("Set the GROQ_API_KEY environment variable on the backend", lines 136-142), because `/api/ai/status` checks only the server env key.
  - Its example prompts are fintech ("verified KYC and active SIPs") even on Shopify stores.
  - Its "Generated Filters" preview casts every rule to field/operator/value, so aggregate and group rules render blank (lines 205-219).
  - It cannot express "did X at least N times in D days", although the manual builder's evaluator can.
  - Fix the model call, write merchant-facing copy, teach event rules, and use engagement-style examples like MoEngage's ("opened an email in the last week", "users in Bangalore").
- **Availability states** (screenshot 005 locked toast vs `WhatsappChatbotPanel.tsx:80`). MoEngage signals unavailability before the user starts ("Coming soon" badges, a "contact your account manager" toast). Storees' chatbot lock with "Upgrade to unlock" linking to `/settings/billing` is better for self-serve trials. Extend the same pattern to every AI tool instead of failing after Generate with "No LLM provider configured…" (`copywriterService.ts:109-112`).
- **Personalization testing** (screenshots 029, 032 Jinja Assist vs `VariablePanel.tsx`). MoEngage needs AI to write Jinja and then lets the user test it against a real user. Storees' no-code source mapping avoids code entirely, which is the better model for D2C marketers. Adopt the "pick a user" tester, though: the template editor always renders the most recently seen customer although the API accepts `sampleCustomerId`, and the campaign pickers list only the 20 most recently seen customers, with no search.
- **Designer** (screenshots 024, 026, 027). Storees already has the plumbing for an image tool: uploads up to 5 MB (`routes/assets.ts:54-118`), S3/R2 storage, and a Recent Uploads picker in the email builder Image block. A generator that drops results straight into the Image block or the WhatsApp media header would beat MoEngage's Download and Copy-URL flow. Only OpenAI among the three bring-your-own providers can generate images, so this needs a separate image-provider setting.
- **Help** (screenshots 038, 039). MoEngage's header "Need help" menu offers Help center, Ask AI (AIRA), Support, a demo account and product ideas. Storees has no help entry anywhere in `AppShell` or `Sidebar`, which hurts self-serve Shopify trials. Add a Help menu (docs, WhatsApp support, AI help).
- **Settings copy does not match behaviour.** Settings, AI says the provider "Powers Next Best Action, smart segments, and natural language queries" (`settings/page.tsx:731`). Smart segments ignore this setting, and natural-language queries do not exist. The Groq model list still offers retired models (`llama-3.3-70b-versatile`, `mixtral-8x7b-32768`; `settings/page.tsx:658`), which work only through the backend fallback. Correct the copy and the model list.

### Verification notes

Every row was re-checked against the code at `2063cdc`, trying to refute each status.

**Searches.** Missing and partial rows were searched under synonyms across frontend, backend (routes, services, workers, schema, migrations), shared, segments, flows, ml, sdk and sdk-react:
- image generation: dall-e, gpt-image, stable diffusion, imagen, images/generations, text-to-image, replicate, fal, flux, aspect ratio;
- feedback: ThumbsUp, ThumbsDown, aiFeedback, "can make mistakes", "was this helpful";
- help: intercom, crisp, zendesk, freshchat, tawk, "help center", "ask ai", "need help";
- templating: jinja, liquid, handlebars, nunjucks, `{% if`, `{{#if`;
- optimisation: bandit, thompson, epsilon-greedy, UCB, auto-optimise, dynamic allocation; best time, send time, optimal delay, smart delay in flows and ml;
- AI flows and analytics: generateFlow, flow assist, ai/flow, natural-language query, nlq, text-to-sql;
- metering: ai_usage, generation_count, ai_credits, ai_quota, token_usage, `rateLimiter` mounts;
- every `chatCompletion(` call site and every direct provider URL or env key.

`decisioningService.ts` (rule-based recommendations and social proof), `interactionEngine.ts` (interaction weights) and `routes/agents.ts` (B2B dealer admin) were read to rule them out as AI optimisation or agent features.

**Rows changed:**
- **AI tool hub: 🟡 → ❌.** No hub page, nav item or header entry exists. The tools it would list are scored in their own rows, so giving the hub partial credit for them double-counts.
- **Email (subject line + preview text): P2 → P1; 🟡 kept.** The "Apply body" defect is confirmed end to end: the send path reads `campaign.htmlBody` (`campaignService.ts:952`), so the bare AI text replaces the designed email, without the builder's layout or visible unsubscribe footer. The edit page has the same pattern (`[id]/edit/page.tsx:698-706, 790`). A shipped AI action that silently changes what is sent outranks preheader generation.
- **A/B winner by revenue (evidence; 🟡 kept).** "The UI does not expose it" was wrong. Create and edit both offer a Winner Metric select (open, click or conversion rate) and an "Auto-send winner" toggle (`create/page.tsx:3110-3150`; `[id]/edit/page.tsx:1390-1410`). The backend ignores both: the whole audience is hash-split at send (`campaignService.ts:52-57`), and nothing reads `abAutoSendWinner`, so the toggle's promise is false. There is still no revenue option.
- **Test against a real user's data (evidence; 🟡 kept).** The table credited only the campaign edit page. The create page also has "Auto sample customer" pickers for email, WhatsApp and SMS/push (`create/page.tsx:2035, 2505, 2934`). All pickers list only the 20 most recently seen customers, and the template editor falls back to the most recently seen customer (`routes/templates.ts:194-201`), not the most recently created one.
- **Segment Assist (evidence; 🟡 and P1 kept).**
  - The paise bug is confirmed: amounts are added to `total_spent` in rupees (`customerAggregateWorker.ts:346, 483`, with comments citing "₹4,499" refunds).
  - The evaluator supports event-occurrence rules (`segments/src/evaluator.ts:206, 242`), so the gap is only in the AI prompt and validator.
  - `/api/ai/status` reflects only the server env key, so a project with its own key still sees "AI not configured".
- **In-app and OSM (evidence; 🟡 kept).** The inline card's 400 also happens on the edit page, whose SMS/Push branch serves in-app campaigns (`[id]/edit/page.tsx:979, 1163`).
- **Usage limits (evidence; ❌ kept).** A Redis `rateLimiter` exists (`middleware/rateLimiter.ts`) but is mounted only on auth, device-id and recognize routes, so rate-limiting `/api/ai` is a one-line first step.
- **Brand kit (evidence; ⭐ kept).** The AI layout uses the logo or wordmark header and the primary and accent colours; it never places the slogan.
- **Guardrails and credits (reasoning; ➖ kept).** "Customers bring their own keys, so their provider bills usage" holds only for projects that set a key; keyless projects use Storees' server key unmetered.
- **Storees-only strengths.**
  - "SMS, WhatsApp and email-body copy generation" was narrowed to SMS, push and email: WhatsApp campaigns never render either copywriter (`create/page.tsx:845-858`; `[id]/edit/page.tsx:979`).
  - Caveats added: the AI key is stored in plaintext, the empty "Default" model breaks OpenAI and Anthropic, and `ai_email_designer` is never enforced.
- **MoEngage description.** Jinja Assist has 9 unique sample prompts, not 13: the 4 starter cards are among the 9 in the modal.

**Confirmed unchanged:** all other rows. The cited code exists and behaves as described, every missing row's searches came up empty, and no row was left undecided.

### Screens

#### Merlin AI Studio (landing / tool hub)

![Studio landing: 'What can Merlin do for you today?' with 6 tool cards; Segment Assist, In-app Template and Flow Assist are marked 'Coming soon'](../screenshots/16-merlin-ai-001-studio-landing-tool-cards.jpg)
*Studio landing: 'What can Merlin do for you today?' with 6 tool cards; Segment Assist, In-app Template and Flow Assist are marked 'Coming soon'*

![Or explore what you can do with MerlinAI: gallery of example prompts (Designer / Jinja / Copywriter / Segment)](../screenshots/16-merlin-ai-002-studio-examples-gallery.jpg)
*'Or explore what you can do with MerlinAI' gallery of example prompts (Designer / Jinja / Copywriter / Segment)*

![Bottom of the examples gallery](../screenshots/16-merlin-ai-003-studio-examples-gallery-bottom.jpg)
*Bottom of the examples gallery*

![Gallery 'Filter by' dropdown: All, Designer, Jinja, Copywriter, Segment](../screenshots/16-merlin-ai-004-studio-examples-filter-dropdown.jpg)
*Gallery 'Filter by' dropdown: All, Designer, Jinja, Copywriter, Segment*

![Clicking a Segment example while Segment AI is disabled: toast 'Please contact your account manager to have this feature enabled.'](../screenshots/16-merlin-ai-005-studio-segment-example-locked-toast.jpg)
*Clicking a Segment example while Segment AI is disabled: toast 'Please contact your account manager to have this feature enabled.'*

#### Copywriter

![Copywriter form, Push channel, empty preview pane](../screenshots/16-merlin-ai-006-copywriter-push-form.jpg)
*Copywriter form, Push channel, empty preview pane*

![High performing keywords multi-select (Exclusive, New, Sale, Save, Flash, Limited, Hurry, VIP...)](../screenshots/16-merlin-ai-007-copywriter-include-keywords-dropdown.jpg)
*'High performing keywords' multi-select (Exclusive, New, Sale, Save, Flash, Limited, Hurry, VIP...)*

![Typing a new keyword offers a 'Newly Created' custom keyword option (not selected)](../screenshots/16-merlin-ai-008-copywriter-include-keywords-custom.jpg)
*Typing a new keyword offers a 'Newly Created' custom keyword option (not selected)*

![Exclude keywords multi-select of spam-trigger words (Unsecured, Jackpot, Cash, Hidden...)](../screenshots/16-merlin-ai-009-copywriter-exclude-keywords-dropdown.jpg)
*'Exclude keywords' multi-select of spam-trigger words (Unsecured, Jackpot, Cash, Hidden...)*

![and convert this for: target-audience persona list](../screenshots/16-merlin-ai-010-copywriter-audience-dropdown.jpg)
*'and convert this for' target-audience persona list*

![with voice/tone list (Persuasive, Informative, Excitement, FOMO...)](../screenshots/16-merlin-ai-011-copywriter-voice-tone-dropdown.jpg)
*'with voice/tone' list (Persuasive, Informative, Excitement, FOMO...)*

![in the writing style of: Trends group](../screenshots/16-merlin-ai-012-copywriter-writing-style-trends.jpg)
*'in the writing style of', Trends group*

![Writing style, Persona group (celebrity voices)](../screenshots/16-merlin-ai-013-copywriter-writing-style-persona.jpg)
*Writing style, Persona group (celebrity voices)*

![Writing style, Pop-culture references group](../screenshots/16-merlin-ai-014-copywriter-writing-style-pop-culture.jpg)
*Writing style, Pop-culture references group*

![Writing style, Archetypes group](../screenshots/16-merlin-ai-015-copywriter-writing-style-archetypes.jpg)
*Writing style, Archetypes group*

![Writing style, Prose & Poetry group (authors)](../screenshots/16-merlin-ai-016-copywriter-writing-style-prose-poetry.jpg)
*Writing style, Prose & Poetry group (authors)*

![in language: Internet Trends group (Hinglish, Digital Slang, Fashion Lingo, Corporate Jargon, Leetspeak)](../screenshots/16-merlin-ai-017-copywriter-language-internet-trends.jpg)
*'in language', Internet Trends group (Hinglish, Digital Slang, Fashion Lingo, Corporate Jargon, Leetspeak)*

![in language: Global Languages group](../screenshots/16-merlin-ai-018-copywriter-language-global.jpg)
*'in language', Global Languages group*

![with personalization attribute: the workspace's user attributes grouped by category](../screenshots/16-merlin-ai-019-copywriter-personalization-attribute.jpg)
*'with personalization attribute': the workspace's user attributes grouped by category*

![Channel 'Email (Subject line)' selected (same field set as Push)](../screenshots/16-merlin-ai-020-copywriter-channel-email-subject.jpg)
*Channel 'Email (Subject line)' selected (same field set as Push)*

![Channel In-app adds a required 'under characters\*' limit (default 25)](../screenshots/16-merlin-ai-021-copywriter-channel-inapp-char-limit.jpg)
*Channel In-app adds a required 'under characters\*' limit (default 25)*

![Channel OSM: same form as In-app, with the character limit](../screenshots/16-merlin-ai-022-copywriter-channel-osm.jpg)
*Channel OSM: same form as In-app, with the character limit*

![Copywriter opened from a gallery example (?id=3): use case pre-filled, nothing generated](../screenshots/16-merlin-ai-023-copywriter-from-example.jpg)
*Copywriter opened from a gallery example (?id=3): use case pre-filled, nothing generated*

#### Designer

![Designer form: aspect-ratio radios, Image description, Add reference image, Generate; empty preview](../screenshots/16-merlin-ai-024-designer-form.jpg)
*Designer form: aspect-ratio radios, Image description, Add reference image, Generate; empty preview*

![Image description info tooltip with a 'Find prompt ideas here' docs link](../screenshots/16-merlin-ai-025-designer-description-tooltip.jpg)
*Image description info tooltip with a 'Find prompt ideas here' docs link*

![Add reference image ticked: 'Image url' mode with 'Enter source URL here'](../screenshots/16-merlin-ai-026-designer-reference-image-url.jpg)
*Add reference image ticked: 'Image url' mode with 'Enter source URL here'*

![Upload image mode: drag & drop or upload from computer, jpg/jpeg/png up to 5 MB](../screenshots/16-merlin-ai-027-designer-reference-image-upload.jpg)
*'Upload image' mode: drag & drop or upload from computer, jpg/jpeg/png up to 5 MB*

![Designer opened from a gallery example (?id=1): description pre-filled, nothing generated](../screenshots/16-merlin-ai-028-designer-from-example.jpg)
*Designer opened from a gallery example (?id=1): description pre-filled, nothing generated*

#### Jinja Assist (Jinja AI)

![Jinja Assist (Beta): prompt box, starter prompt cards, disabled Generate, empty output pane, 'Failed to fetch templates' toast](../screenshots/16-merlin-ai-029-jinja-assist-page.jpg)
*Jinja Assist (Beta): prompt box, starter prompt cards, disabled Generate, empty output pane, 'Failed to fetch templates' toast*

![Plus menu inside the prompt box: Select Template, Upload HTML File](../screenshots/16-merlin-ai-030-jinja-plus-menu.jpg)
*'+' menu inside the prompt box: Select Template, Upload HTML File*

![Jinja Assist info tooltip describing generate / fix / explain](../screenshots/16-merlin-ai-031-jinja-info-tooltip.jpg)
*Jinja Assist info tooltip describing generate / fix / explain*

![Sample Prompts modal (9 prompts) from 'Explore more prompts'](../screenshots/16-merlin-ai-032-jinja-sample-prompts-modal.jpg)
*'Sample Prompts' modal (9 prompts) from 'Explore more prompts'*

![A sample prompt (Fix Jinja syntax) selected; 'Select Prompt' enabled](../screenshots/16-merlin-ai-033-jinja-sample-prompt-selected.jpg)
*A sample prompt (Fix Jinja syntax) selected; 'Select Prompt' enabled*

![Prompt inserted into the box; Generate enabled (not clicked)](../screenshots/16-merlin-ai-034-jinja-prompt-inserted.jpg)
*Prompt inserted into the box; Generate enabled (not clicked)*

![Jinja Assist opened from a gallery example (?source=merlin-ai-studio&id=2): prompt pre-filled](../screenshots/16-merlin-ai-035-jinja-from-example.jpg)
*Jinja Assist opened from a gallery example (?source=merlin-ai-studio&id=2): prompt pre-filled*

![Test and Debug sidebar flyout (Integration Validation, SDK Logger, Segment Payload, Jinja AI) with Jinja AI active](../screenshots/16-merlin-ai-036-test-debug-flyout-jinja-ai.jpg)
*Test and Debug sidebar flyout (Integration Validation, SDK Logger, Segment Payload, Jinja AI) with Jinja AI active*

#### Coming-soon tool routes: Segment Assist / Flow Assist / In-app Template

![Segment Assist route with the flag off: 'Merlin AI Studio > Segment Assist' header, blank AI panel, Query results below](../screenshots/16-merlin-ai-037-segment-assist-gated.jpg)
*Segment Assist route with the flag off: 'Merlin AI Studio > Segment Assist' header, blank AI panel, Query results below*

#### Need help > Ask AI (support AI assistant)

![Header 'Need help' menu with the 'Ask AI' entry](../screenshots/16-merlin-ai-038-need-help-menu-ask-ai.jpg)
*Header 'Need help' menu with the 'Ask AI' entry*

![Ask AI opens the MoEngage Support messenger with 'Ask a question' and the AIRA promo](../screenshots/16-merlin-ai-039-ask-ai-support-messenger.jpg)
*Ask AI opens the MoEngage Support messenger with 'Ask a question' and the AIRA promo*
