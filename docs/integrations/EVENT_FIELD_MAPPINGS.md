# Field Mappings — Wishlist & Discount

How wishlist and discount data map into Storees. Two different mechanisms:
- **Connector pull** (orders/customers via VirpanAI template `fieldMap`) — for discount.
- **App-emitted events** (SDK / backend → `/api/v1/events`) — for wishlist.

> Reminder: for GoWelmart, send to `https://api-storees.gowelmart.com/api/v1/...` with the
> **GWM** project's public key — never `api.storees.io`.

---

## Discount

### A. On orders (connector pull) — **already implemented**
The VirpanAI connector maps a per-order discount from the Medusa order summary
(`services/connectors/templates/virpanai.ts`, orders fieldMap):

```ts
discount: { subtract: ['summary.original_order_total', 'summary.current_order_total'] }
```
`original_order_total` (gross) − `current_order_total` (net) = the discount applied.
Lands on the Storees order's `discount` and feeds `discount_order_percentage` in the
metrics worker + segment evaluator.

> If the new `/storees-cdp/export/orders` shape provides a **flat** discount field instead
> of `summary.*`, change the mapping to: `discount: '<flat_field_name>'` (confirm the field
> name from a sample payload). Until confirmed, the subtract mapping above is correct for
> the Medusa summary shape.

### B. On app-emitted order/cart events
If pushing order/cart events directly, include discount in `properties`:
```json
{ "event_name": "order_placed",
  "properties": { "order_id": "…", "total": 4999, "discount": 500, "currency": "inr" } }
```
Canonical property: **`discount`** (integer, smallest currency unit — paise/cents, like all money).

---

## Wishlist

Wishlist is **not a pull entity** — it's an **app-emitted event** (the SDK/app sends it as
the user adds/removes items). Send to `/api/v1/events`:

| Event name | When | Properties |
|---|---|---|
| `added_to_wishlist` | User adds a product to wishlist | `product_id` (req), `product_name`, `price` (smallest unit), `currency`, `collection` |
| `removed_from_wishlist` | User removes a product | `product_id` (req), `product_name` |

```json
{ "event_name": "added_to_wishlist",
  "customer_id": "<id>",
  "properties": { "product_id": "prod_123", "product_name": "FP Neckband", "price": 18000, "currency": "inr" } }
```

These power: "wishlist but didn't buy" segments, price-drop/back-in-stock flows targeting
wishlist holders, and product affinity. No connector `fieldMap` change is needed — event
`properties` are free-form JSONB; just send the exact `event_name` so flow triggers and
segment rules can match it (exact-string match — `added_to_wishlist`, not `wishlist_add`).

### If GWM exports wishlist via the CDP instead of the app
If GoWelmart exposes wishlists at `/storees-cdp/export/wishlist` (server-to-server rather
than app events), add an endpoint + map to the same event in the connector. Confirm the
export shape first; placeholder mapping:
```ts
// endpoints.wishlist: { path: '/storees-cdp/export/wishlist', method: 'GET', responseDataPath: 'wishlists', responseCountPath: 'count' }
// → emit added_to_wishlist events with { product_id, product_name, price } per row
```
(Not wired yet — needs GWM to confirm they export it. Default path is app events above.)

---

## Standard money/units rule
All prices/discounts are **integers in the smallest currency unit** (paise/cents), never floats —
consistent with the rest of Storees. The connector's `divideBy: 100` on product prices is the
exception that converts Medusa cents → major units where the source already differs; match the
target column's expectation when adding mappings.
