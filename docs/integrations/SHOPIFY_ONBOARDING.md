# Shopify Onboarding — Region/Dealer Segments + Product Catalog + Product Notifications

End-to-end guide for connecting a Shopify store to Storees and getting product-aware
segments and notifications working. Covers both standard ecommerce setups and B2B /
dealer-scoped deployments (e.g. GowelMart).

> **Audience:** Storees admins onboarding a new merchant. The merchant performs steps in
> Shopify and the storefront theme; the admin performs the panel and (optionally) DB steps.

---

## 1. Connect the Shopify store

1. In the Storees panel, go to **Integrations → Shopify** and click **Connect**.
2. Enter the merchant's `myshopify.com` domain.
3. Approve the OAuth scopes in Shopify (`read_products`, `read_customers`, `read_orders`,
   plus a few storefront/checkout scopes).
4. Storees stores the access token (encrypted) and registers webhooks for:
   - `customers/create`, `customers/update`
   - `orders/create`, `orders/fulfilled`, `orders/cancelled`
   - `checkouts/create`, `carts/create`
   - `products/create`, `products/update`, `products/delete`
   - `collections/create`, `collections/update`, `collections/delete`

**Result:** future changes in Shopify (new products, edited collections, customer signups,
orders) flow into Storees within seconds.

---

## 2. Initial historical sync

OAuth completion enqueues a one-shot sync job (BullMQ queue `shopify-sync`). It pulls:

- **Customers** (paginated, all pages) → `customers` table, including
  `default_address.province` → `region` and `default_address.city` → `city`.
- **Orders per customer** (paginated) → `orders` table with `line_items` JSONB.
- **Products** (paginated) → `products` table including `product_type` (category) and `vendor`.
- **Collections** (custom + smart, paginated) → `collections` table.
- **Product↔Collection mappings** (the `collects` API, paginated) → `product_collections` join.

### Watch progress

- Panel: **Integrations → Shopify** shows live progress via
  `GET /api/integrations/shopify/sync-status?projectId=<id>`.
- For a manual re-sync (e.g. after fixing a token):
  `POST /api/integrations/shopify/sync?projectId=<id>`.

**Sync time guidance:** ~1 customer/sec (rate-limited by Shopify's 2 req/sec Basic plan).
A 5,000-customer store takes ~80 minutes. Products and collections complete in the
final minute (single batch each, 250-per-page).

---

## 3. (B2B only) Enable dealer-scoped access

Skip this section for standard ecommerce stores.

For multi-distributor setups where each agent should only see customers assigned to
their dealer:

1. Go to **Settings → Project**.
2. Toggle **"Enable dealer-scoped access"** ON.
3. Storees writes `features.agentScopedAccess = true` on the project row.

This unlocks:
- **Settings → Dealers** tab — manage the dealer (`agents`) roster.
- **Settings → Team** tab — invite agent/manager logins and assign them to dealers.
- **Segment builder** — new "Dealer & Region" filter group with Dealer / Region / City
  fields. Region/City options are auto-populated from `customers.region/city` (which
  are filled by the Shopify sync from `default_address`).
- **Customer scope enforcement** — agent/manager logins see only their dealer's customers,
  enforced at the SQL level by the segment evaluator and customer routes.

### Dealer assignment for existing customers

If the merchant has an external dealer mapping (e.g. customers tagged with a `dealer_id`
in Shopify metafields or imported from a prior CDP), run a one-shot backfill SQL:

```sql
-- See packages/backend/src/db/data/gowelmart_agent_backfill.sql for a template.
-- Pattern:
--   1. INSERT distinct dealer_ids into agents (project_id, external_dealer_id, name)
--   2. UPDATE customers SET agent_id = a.id FROM agents a WHERE a.external_dealer_id = ...
--   3. (optional) overwrite region/city from a richer source than postal_code
```

---

## 4. Install the Storees SDK in the Shopify theme

The webhook stream gives us **server-side** events (orders, customers, carts) but not
**browse behavior** (product views, wishlist, search). For "customers who viewed
product X but didn't buy" segments and product-keyed flows, the merchant must install
the Storees JS SDK in their Shopify theme.

### Get the snippet

Open **Settings → SDK & Integration**. Copy the **Script tag** snippet — it includes
the project's API key.

### Paste into Shopify theme

1. Shopify admin → **Online Store → Themes → Edit code**.
2. Open `layout/theme.liquid`.
3. Paste the snippet **just before `</head>`**. It looks like:

   ```html
   <script>
     !function(s,t,o,r){s.Storees=s.Storees||function(){
     (s.Storees.q=s.Storees.q||[]).push(arguments)};
     var e=t.createElement('script');e.src=r;e.async=1;
     t.head.appendChild(e)}(window,document,'script',
     'https://YOUR_API_HOST/sdk/storees.min.js');

     Storees('init', {
       apiKey: '<PROJECT_API_KEY>',
       apiUrl: 'https://YOUR_API_HOST',
       autoTrack: { pageViews: true, sessions: true, utm: true }
     });
   </script>
   ```

4. **Identify** the customer when logged in — paste this in `templates/customers/account.liquid`:

   ```html
   {% if customer %}
     <script>
       Storees('identify', {
         externalId: '{{ customer.id }}',
         email: '{{ customer.email }}',
         name: '{{ customer.name }}'
       });
     </script>
   {% endif %}
   ```

5. **Track product views** — in `sections/product-template.liquid` (or the equivalent
   for the theme):

   ```html
   <script>
     Storees('track', 'product_viewed', {
       product_id: {{ product.id | json }},
       title: {{ product.title | json }},
       product_type: {{ product.type | json }},
       vendor: {{ product.vendor | json }},
       price: {{ product.price | json }}
     });
   </script>
   ```

6. **Track add-to-cart** — bind to the add-to-cart form's submit:

   ```html
   <script>
     document.querySelector('form[action="/cart/add"]')?.addEventListener('submit', () => {
       Storees('track', 'added_to_cart', {
         product_id: {{ product.id | json }},
         price: {{ product.price | json }}
       });
     });
   </script>
   ```

### Verify

1. Visit a product page on the storefront in an incognito window.
2. In the Storees panel, go to **Debugger** — you should see a `product_viewed` event
   within ~2 seconds. The `sdkConnected` indicator on **Settings → SDK & Integration**
   also turns green once any event has flowed through.

---

## 5. Build your first product-aware segment

1. Go to **Segments → New Segment**.
2. Pick conditions:
   - "Has purchased Product X" (uses Shopify orders `line_items` data — works without SDK)
   - "Has viewed product in category Y" (requires SDK pixel)
   - "From Region Z" (B2B only, uses `customers.region` from `default_address.province`)
3. Save. Membership is computed in seconds against existing customer data.

### Common patterns

| Goal | Filter |
|---|---|
| Cross-sell | "Has purchased Product A" AND "Has not purchased Product B" |
| Win-back | "Has purchased" AND "Days since last order > 90" |
| Regional promo | "Region is Tamil Nadu" AND "Total Spent > 5000" |
| Dealer book of business | (B2B) "Dealer is X" — automatic if logged in as that agent |
| Browse abandoners | "Has viewed Product X" AND "Has not purchased Product X" |

---

## 5b. (Pre-flight) Verify the email send path

Before letting a merchant send their first real campaign, sanity-check the
Resend send path. This catches misconfiguration BEFORE the first send to a
real customer list — far cheaper than diagnosing it after a deliverability
incident.

### Run the test script

```bash
node scripts/test-email-send.mjs your-own-inbox@example.com
```

The script reads `RESEND_API_KEY` and `FROM_EMAIL` from
`packages/backend/.env`, sends one HTML test email, and prints the Resend
message id. Open the recipient inbox (and spam folder) within 30 seconds —
the message should arrive in inbox, not spam.

### Run a deliverability score check

1. Visit https://www.mail-tester.com — they generate a single-use address
   (e.g. `test-xyz123@srv1.mail-tester.com`).
2. Send the test email to that address:
   ```bash
   node scripts/test-email-send.mjs test-xyz123@srv1.mail-tester.com
   ```
3. Click "Then check your score" on mail-tester within 30 seconds.

**Target: 9-10 / 10.** Common failure modes:

| Score impact | Cause | Fix |
|---|---|---|
| -2 | Missing SPF | Add `v=spf1 include:_spf.resend.com ~all` to the from-domain DNS |
| -2 | Missing/broken DKIM | Verify the domain in Resend → paste their CNAME record into DNS |
| -1 | DMARC not set | Add `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` |
| -1 | Missing `List-Unsubscribe` | The Storees campaign builder will add this in Phase E2.2; the test script does not |
| -1 | Image-only HTML | Add a meaningful text/plain alternative |

### Confirm the webhook loop

1. In the Resend dashboard, register the webhook endpoint:
   `https://YOUR_API_HOST/api/webhooks/resend`
2. Subscribe to: `email.delivered`, `email.opened`, `email.clicked`,
   `email.bounced`, `email.complained`.
3. Send the test email; check the Storees DB:
   ```sql
   SELECT * FROM events WHERE event_name LIKE 'email_%' ORDER BY timestamp DESC LIMIT 5;
   ```
   You should see `email_delivered` and `email_opened` rows within 30 seconds.

If any of the above fails, **do not start sending real campaigns yet.** Fix
the verification step first.

---

## 6. Send your first product-keyed campaign

1. Go to **Campaigns → New Campaign**.
2. **Step 1 — Target:** pick the segment from step 5.
3. **Step 2 — Content:** write the email/SMS/WhatsApp template. Use `{{firstName}}`,
   `{{product_name}}` etc. for personalization.
4. **Step 3 — Schedule:** send now or schedule.

The campaign worker streams recipients in pages of 100, dispatches via Resend (email),
the configured WhatsApp/SMS provider, or push, and tracks deliveries in `campaign_sends`.

---

## Troubleshooting

### Segment builder doesn't show "Dealer & Region" group

- Confirm the project has `features.agentScopedAccess = true` (Settings → Project toggle).
- Confirm at least one row exists in `agents` for the project (Settings → Dealers).
- If the toggle is on but the group is missing, hard-refresh the page — the schema
  endpoint response is cached in TanStack Query and re-fetches on navigation.

### Region dropdown only shows the country code (e.g. "IN")

- This means the customer rows have `region = 'IN'` because they were imported from a
  source that mapped country code → region. Re-run the customer sync OR run a
  fix-up SQL that maps `default_address.province` → region for those rows.

### Product picker is empty after Shopify connect

- Initial sync may still be in progress. Check `GET /api/integrations/shopify/sync-status`.
- If sync is `complete` but `products` table is still empty, check the worker logs for
  Shopify API errors (likely a missing `read_products` scope — re-do the OAuth dance).

### `product_viewed` events not arriving

- Verify the SDK snippet is in `theme.liquid` and renders in page source.
- Check the browser's Network tab — should see `POST /api/v1/events` from the storefront.
- If blocked by an ad blocker or CSP, the SDK can be self-hosted from the merchant's
  own domain via a Cloudflare Worker — not covered here.

---

## Reference

- **OAuth + webhook registration:** [shopifyService.ts](../../packages/backend/src/services/shopifyService.ts)
- **Initial sync worker:** [syncWorker.ts](../../packages/backend/src/workers/syncWorker.ts)
- **Webhook handler (customer events):** [eventProcessor.ts](../../packages/backend/src/services/eventProcessor.ts)
- **Webhook handler (catalog):** [catalogService.ts](../../packages/backend/src/services/catalogService.ts)
- **Schema fields endpoint:** [v1Schema.ts](../../packages/backend/src/routes/v1Schema.ts) — see `buildAgentFieldDefs` for how Dealer/Region/City are injected.
- **Per-project feature flags:** [features.ts](../../packages/backend/src/config/features.ts)
- **Settings → Project toggle:** [page.tsx](../../packages/frontend/src/app/(dashboard)/settings/project/page.tsx)
- **B2B backfill template:** [gowelmart_agent_backfill.sql](../../packages/backend/src/db/data/gowelmart_agent_backfill.sql)
