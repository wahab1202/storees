# Skill: Integration Rules

> Invoke with `/integration-rules`

## Shopify
- SDK: `@shopify/shopify-api` v9+, API version `2024-01`
- OAuth scopes: read_customers, read_orders, read_products, read_checkouts, read_draft_orders
- Rate limit: 4 req/sec — implement 250ms delay between API calls in sync
- Webhooks: HMAC-SHA256 verification using raw body (before JSON parse)
- Historical sync: paginated fetch (limit=250), process customers then their orders
- Webhook endpoint: `POST /api/webhooks/shopify/{projectId}` — no auth middleware, HMAC only
- Store nonce in Redis for CSRF during OAuth (10-min TTL)

## Resend (Email)
- API key from `RESEND_API_KEY` env var
- From address: `noreply@storees.io` (default)
- Template variables: `{{customer_name}}`, `{{cart_items}}`, `{{checkout_url}}`, etc.
- `{{#each cart_items}}` for iterating cart items in HTML
- Phase 1: simple regex-based substitution. Phase 2: Handlebars.js

## Customer Identity Resolution
1. Check `external_id` (Shopify customer ID)
2. Fall back to `email`
3. Fall back to `phone`
4. If none match → create new customer
5. Always update `last_seen = now()`
