# Fine Wine Cosmetics — Shopify Connection & Sync Diagnosis

Runbook + diagnosis log for connecting **Fine Wine Cosmetics**
(`finewinecosmetics.myshopify.com`) to Storees via the custom-app flow, and the
investigation into why customers/orders did not sync.

- **Project:** Finewine — `cb28b02b-273c-45b7-969c-cb5af5a2085a`
- **Store:** Fine Wine Cosmetics — `finewinecosmetics.myshopify.com`
- **App:** "Storees Finewine" (custom-distribution app, created by the CTO; installed in the store)
- **Connect method:** custom-app `client_credentials` (NOT OAuth)

---

## 1. Two connection systems (don't confuse them)

Storees has **two separate data-ingestion paths**. A store uses one or the other:

| | **Connected Stores** (native Shopify) | **Data Sources → Add connector** |
|---|---|---|
| Used by | Shopify (Fine Wine) | VirpanAI, custom HTTP exports (GoWelmart) |
| Mechanism | Shopify Admin API + webhooks + dedicated sync worker | Generic HTTP pull from a base URL + auth key |
| Templates | n/a (native) | `virpanai`, `custom` |
| Where you connect | **Connected Stores** page (left nav) | Project page → **Data Sources** panel |

**Key point:** there is **no Shopify connector template**, and there can't easily
be one — Shopify is the Admin API (its own auth, pagination, webhooks), not a plain
export URL. So **for Shopify, "Connected Stores" IS the connector.** The project's
"Data Sources: No data sources yet" panel staying empty for a Shopify store is
**expected** — that panel is only for VirpanAI-style connectors.

---

## 2. How the native Shopify connect works

1. **Connected Stores** → enter store domain + **Client ID** + **Client secret** from
   the custom app.
2. Backend (`POST /api/integrations/shopify/connect`) mints an Admin API token via the
   `client_credentials` grant (validates creds + that the app is installed), stores it
   encrypted in `projects.shopify_access_token`, saves the creds in
   `settings.shopifyCustomApp`, registers webhooks, and **queues a historical sync**.
3. The sync worker (`shopify-sync`, runs inside `storees-backend`) backfills
   customers → orders → products → collections.
4. Webhooks keep it live afterward (`customers/*`, `orders/*`, `products/*`, `collections/*`).

Onboarding also offers this inline: ecommerce projects now get a **Connect** step in
the new-project wizard (Shopify creds entered there are connected at Launch against the
new project).

---

## 3. Diagnosis — why customers/orders didn't sync

### Symptom
DB check for the project returned:

```
has_token = true | customers = 0 | orders = 0 | products = 8
```

Meanwhile the Shopify store has **379 orders** and a **full catalogue**.

### Evidence gathered
- **App permissions** (Shopify → app detail → Activity and permissions): Products,
  Customers, **and** Orders all show **View ✓** with recent read activity. → scopes are
  granted and Shopify logged the app *reading* all three.
- **The 8 products are real** (real Shopify product IDs, real titles) but their
  `created_at` timestamps are **scattered across two days** (06:17, 07:53, 10:20, 12:18,
  14:07…). A bulk sync inserts the whole catalogue in one burst — this scatter is the
  signature of **webhooks** trickling in catalogue edits, NOT a historical backfill.
- Products sync filters `status=active`, so drafts/archived are excluded by design.

### Root cause: Protected Customer Data Access (PCD)
The `read_customers` scope is **necessary but not sufficient**. Shopify gates the actual
customer PII behind a separate **Protected Customer Data Access** approval. Without it,
`/customers.json` returns an **empty array** (not a 403) — the call "succeeds" and is
logged as activity, but hands back nothing.

Because the sync worker fetches **orders per customer**
(`/customers/{id}/orders.json`), **zero customers ⇒ zero orders**, even though 379 exist.
Products are not PII, so they were unaffected (and only trickled in via webhooks because
the bulk backfill aborted/returned empty in the customer stage).

### Where PCD is configured
"Storees Finewine" is a **custom-distribution app created in the CTO's Partner Dashboard**
(that's why the store admin's app page has **no Configuration tab**, and it doesn't appear
under **Develop apps**). Therefore PCD is **not** a store-admin setting — it must be enabled
by the **partner account owner (the CTO)**:

> partners.shopify.com → Apps → **Storees Finewine** → **API access** → **Protected
> customer data** → request/enable access → tick **name, email, phone, address**.

---

## 4. Fix (action items)

1. **CTO:** enable **Protected Customer Data Access** for the app in the Partner Dashboard
   (fields: name, email, phone, address).
2. **Storees:** Connected Stores → **Disconnect & reconnect** (re-mints the token with PCD).
3. **Storees:** **Sync now** (the new button on the connected card).
4. Re-run the count query — customers and orders should populate.

```sql
SELECT p.name, p.shopify_domain,
       (p.shopify_access_token IS NOT NULL) AS has_token,
       (SELECT count(*) FROM customers c WHERE c.project_id = p.id) AS customers,
       (SELECT count(*) FROM orders    o WHERE o.project_id = p.id) AS orders,
       (SELECT count(*) FROM products  pr WHERE pr.project_id = p.id) AS products
FROM projects p
WHERE p.id = 'cb28b02b-273c-45b7-969c-cb5af5a2085a';
```

### Caveats after PCD is on
- Shopify only returns orders from the **last 60 days** unless the app is granted
  **`read_all_orders`** (separate approval) — recent orders flow first; full history needs it.
- Full browse behavior (product views, add-to-cart, wishlist) still requires the **Storees
  SDK pixel** in the Shopify theme — see `SHOPIFY_ONBOARDING.md` §4. Sync alone does not
  give browse events.

---

## 5. Worker hardening (follow-up, recommended)

The current worker couples orders to the per-customer loop and aborts the whole backfill
if the customer stage fails. Planned improvements:

- Decouple orders → sync independently via `/orders.json?status=any`.
- Don't let a customer-stage failure abort products/collections.
- Log **fetched** counts (not just persisted) so an empty/redacted response is obvious.

Reference: [syncWorker.ts](../../packages/backend/src/workers/syncWorker.ts),
[integrations.ts](../../packages/backend/src/routes/integrations.ts),
[shopifyService.ts](../../packages/backend/src/services/shopifyService.ts).
