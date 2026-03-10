# Lessons Learned

Mistakes, corrections, and insights captured during development.

## Schema & Types

- **Use `type` not `interface`** — CLAUDE.md convention. Requirements doc uses `interface` but `.claude/rules/shared.md` overrides.
- **Use `unknown` not `any`** — Never use `any` in shared types. Requirements doc has `Record<string, any>` but rules say `unknown`.
- **Junction table over array column** — Replaced `segment_ids UUID[]` on customers with `customer_segments` junction table. Drizzle ORM handles standard joins better than Postgres array operations.
- **Shopify rate limit is 2/sec on Basic** — Requirements doc says 4/sec but that's Plus only. Use `SHOPIFY_API_DELAY_MS = 500`.
- **Exit config scope is `'any' | 'matching'`** — Requirements doc has `'any_order'` in the abandoned cart template, but type definition uses `'any'`.
- **Action node fields are camelCase** — Requirements doc uses snake_case (`action_type`, `template_id`) but TypeScript types use camelCase (`actionType`, `templateId`).

## Phase 1 Scope

- **No storefront JS SDK in Phase 1** — `product_viewed`, `page_viewed`, `session_start`, `session_end` events have no data source without SDK. Removed from active constants.
- **`Researchers` segment template removed** — Depends on `product_views_count` which requires SDK.
- **Anonymous browsing can't be mapped** — Cart webhooks only include customer data for logged-in users. Demo must use logged-in customer.
- **GDPR blocks cookie-based tracking** — Option 2 (reading `__st.cid` cookie) violates GDPR. Not viable without consent infrastructure.

## Infrastructure

- **Resend domain verification takes up to 48h** — DNS propagation. Must be done before coding starts, not on demo day.
- **Webhook HMAC needs raw body** — Express JSON parser destroys raw body. Webhook routes must use `express.raw()` mounted BEFORE `express.json()`.
- **`composite: true` needed in shared tsconfig** — Required for project references to work across packages.

## Frontend Testing

- **Take screenshots of every module after running** — Verify data renders correctly visually. Don't rely on typecheck alone. Prevents repeat iteration cycles.

## UI/UX Quality

- **Design system compliance matters** — First implementation of create/edit UIs used basic forms. User feedback: "doesn't look like Klaviyo/Customer.io." Redesigned with card-based layouts, grouped field dropdowns, AND/OR connector pills, backdrop blur modals. Lesson: always reference the design system docs and competitor UIs from the start.
- **Express route ordering matters** — `GET /segments/lifecycle` was captured by `GET /segments/:id` because `:id` route was registered first. Static paths must always be registered before parameterized routes.
- **`as const` + flatMap causes TypeScript headaches** — Using `as const` on complex nested arrays creates narrow literal types that break with `flatMap`. Fix: use explicit type annotations (`type FieldDef = { value: string; label: string; type: string }`) instead of `as const`.

## Research Phase Insights

- **AI Segment Builder is lowest-effort, highest-impact feature** — FilterConfig JSON schema already exists, filter builder UI exists, backend evaluation exists. Only missing piece: LLM that converts natural language → FilterConfig.
- **Gemini 2.0 Flash is optimal for structured output** — Free tier, native multilingual (100+ languages), `responseMimeType: "application/json"` guarantees valid JSON. No SDK needed — raw REST fetch.
- **Web Speech API is free and browser-native** — Supports Tamil (`ta-IN`), French (`fr-FR`), Spanish (`es-ES`), Mandarin (`zh-CN`), Hindi (`hi-IN`). No external API cost. Limitation: not supported in Firefox.
- **Money values in paise cause LLM confusion** — System prompt must explicitly state "₹5000 = 500000 paise" with examples, otherwise LLM will output 5000 as the value.
- **Email template builder is high-impact but complex** — Requires drag-and-drop block editor, Shopify product catalog integration, responsive email rendering. Libraries like `react-email` or `@usewaypoint/email-editor` can help. Defer to next milestone.
- **SMS/WhatsApp/Push have zero implementation** — Type stubs only, `console.warn` in flow executor. Full provider integrations (Twilio, Meta Business API) needed before template builders make sense.
- **No campaign/broadcast system exists** — Only event-triggered flows. Bulk send to segment requires new campaign entity, scheduler, send tracking. Important but separate milestone.

## Product Catalog Integration

- **Product/collection filter fields need real data, not free text** — Free text inputs for product names are useless in practice. Users need to search and select from actual synced Shopify products/collections. Always wire catalog fields to searchable dropdowns backed by API data.
- **Shopify has two collection types** — `custom_collections` and `smart_collections` are separate API endpoints. Must fetch both and merge. Products link to collections via the `collects` API (a separate junction endpoint), not embedded in the product or collection payload.
- **Rebuild shared package after adding types** — Adding new exports to `packages/shared/src/types.ts` doesn't make them available to other packages until `npm run build` regenerates `dist/`. Always rebuild shared after type changes.
