# Shopify SDK + Customer Events — Install Runbook (AK)

Goal: get browse + checkout behavioral events flowing from the **Fine Wine** storefront
(`finewinecosmetics.myshopify.com`) into Storees, so segments/flows (cart abandonment,
viewed-not-bought, discount intent) work. **This is all Shopify-admin / theme work — no
Storees deploys needed.**

Two layers:
1. **Theme snippet** — on-store browse events (page views, product views, add-to-cart, collections).
2. **Customer Events custom pixel** — checkout-funnel events the theme can't see (checkout_started, discount, completion, search).

Verify each step in the Storees **Event Debugger** before moving on — don't batch all edits then test.

---

## 0. Before you start (5 min)

1. **Get the credentials.** Storees → make sure active project is **Finewine** → **Settings → SDK & Integration → Script Tag** tab. Note:
   - `apiKey` (this is the **public** key — safe in the browser; do NOT use the secret)
   - `apiUrl` (e.g. `https://api.storees.io`)
   Keep the **Copy** snippet handy — it has both baked in.
2. **Work on a theme copy, not the live theme.** Online Store → Themes → on the live theme **⋯ → Duplicate**. Edit the **duplicate**, preview-test, and only **Publish** at the end. (The Customer Events pixel in §5 is separate from the theme and is safe to add directly.)
3. Open the Storees **Event Debugger** in another tab — you'll watch events land here. Use the customer/date filters to find your own test session.

Replace `<PUBLIC_API_KEY>` and `<API_URL>` in every snippet below.

---

## 1. Base install + identify — `layout/theme.liquid`

Themes → (duplicate) → **Edit code** → `layout/theme.liquid`. Paste **just before `</head>`**:

```html
<script>
  !function(s,t,o,r){s.Storees=s.Storees||function(){(s.Storees.q=s.Storees.q||[]).push(arguments)};
  var e=t.createElement('script');e.src=r;e.async=1;t.head.appendChild(e)}(window,document,'script',
  '<API_URL>/sdk/storees.min.js');
  Storees('init', { apiKey: '<PUBLIC_API_KEY>', apiUrl: '<API_URL>',
    autoTrack: { pageViews: true, sessions: true, utm: true } });
</script>
{% if customer %}
<script>
  Storees('identify', {
    externalId: '{{ customer.id }}',
    email: {{ customer.email | json }},
    name: {{ customer.name | json }}
  });
</script>
{% endif %}
```
> `externalId: {{ customer.id }}` MUST be the Shopify customer id — it matches the `external_id` the order sync stored, so a browsing customer's events attach to their existing profile + orders.

**✅ Verify:** Preview the theme, load any page → Event Debugger shows **`page_view`**; log in → shows the customer name on events.

---

## 2. Product page — `product_viewed` + `added_to_cart`

Open the product section — usually `sections/main-product.liquid` (older themes: `sections/product-template.liquid`). Paste near the bottom:

```html
<script>
  Storees('track', 'product_viewed', {
    product_id: {{ product.id | json }},
    title: {{ product.title | json }},
    product_type: {{ product.type | json }},
    vendor: {{ product.vendor | json }},
    price: {{ product.price | divided_by: 100.0 | json }}
  });
  document.querySelector('form[action="/cart/add"]')?.addEventListener('submit', function () {
    Storees('track', 'added_to_cart', {
      product_id: {{ product.id | json }},
      title: {{ product.title | json }},
      price: {{ product.price | divided_by: 100.0 | json }}
    });
  });
</script>
```
> `product_id: {{ product.id }}` matches the synced `shopify_product_id` so "viewed/bought product X" segments resolve.

**✅ Verify:** Open a product (incognito preview) → **`product_viewed`**; click Add to cart → **`added_to_cart`**.

---

## 3. Collection page — `collection_viewed`

Collection section — usually `sections/main-collection-product-grid.liquid` or `sections/main-collection-banner.liquid`:
```html
<script>
  Storees('track', 'collection_viewed', {
    collection_id: {{ collection.id | json }},
    title: {{ collection.title | json }}
  });
</script>
```
**✅ Verify:** open a collection → **`collection_viewed`**.

---

## 4. (Optional) In-cart discount — `cart` template

If the theme has a discount-code box on the cart page, in `sections/main-cart-*.liquid` (or `templates/cart.liquid`):
```liquid
{% if cart.total_discount > 0 %}
<script>
  Storees('track', 'discount_applied', {
    code: {{ cart.cart_level_discount_applications.first.title | default: '' | json }},
    amount: {{ cart.total_discount | divided_by: 100.0 | json }}
  });
</script>
{% endif %}
```
(Most discounts are applied at checkout — that's covered by the pixel in §5.)

---

## 5. Customer Events pixel — checkout funnel (the high-value one)

Shopify admin → **Settings → Customer events → Add custom pixel** → name **"Storees"** → paste (fill key/host) → **Save** → **Connect**:

```js
const KEY = '<PUBLIC_API_KEY>';
const URL = '<API_URL>/api/v1/events';
const send = (event_name, properties, id = {}) =>
  fetch(URL, { method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
    body: JSON.stringify({ event_name, ...id, properties }) }).catch(() => {});

analytics.subscribe('checkout_started', (e) => {
  const c = e.data.checkout;
  send('checkout_started', { total: Number(c.totalPrice?.amount), currency: c.currencyCode, item_count: c.lineItems?.length }, { email: c.email, phone: c.phone });
  const d = c.discountApplications?.[0];
  if (d) send('discount_applied', { code: d.title, type: d.type }, { email: c.email });
});

analytics.subscribe('payment_info_submitted', (e) =>
  send('checkout_payment_info', { total: Number(e.data.checkout.totalPrice?.amount) }, { email: e.data.checkout.email }));

analytics.subscribe('checkout_completed', (e) => {
  const c = e.data.checkout;
  send('checkout_completed', { order_id: c.order?.id, total: Number(c.totalPrice?.amount), currency: c.currencyCode }, { email: c.email });
});

analytics.subscribe('search_submitted', (e) =>
  send('product_searched', { query: e.data.searchResult?.query }));
```
> The pixel runs in a sandbox (can't reach the theme's `Storees`), so it POSTs directly to `/api/v1/events` with the public key. Field names (`discountApplications`, `value`) can vary by Shopify version — verify the first event and report any nulls.

**✅ Verify:** add to cart → start checkout → **`checkout_started`** (+ `discount_applied` if a code is applied); complete a test order → **`checkout_completed`**.

---

## 6. Publish + final smoke test

1. **Publish** the duplicated theme (Online Store → Themes → the copy → **Publish**).
2. In an incognito window, **logged in as a test customer**: view a product → add to cart → start checkout → apply a discount → complete (or abandon) checkout.
3. In the Event Debugger, filter to that customer — you should see, stitched to their profile:
   `page_view → product_viewed → added_to_cart → checkout_started (+ discount_applied) → checkout_completed`.
4. Settings → SDK & Integration → **sdkConnected** turns green.

If any event is missing or shows null fields, note **which event** + **which field** and send it back — usually a theme file path or a Shopify field-name tweak.

---

## Event reference (what each one powers)

| Event | Where | Powers |
|---|---|---|
| `page_view`, session | theme (auto) | activity timeline, session stitching |
| `product_viewed` | theme PDP | viewed-not-bought, category affinity, predictions |
| `added_to_cart` | theme PDP | cart abandonment, intent scoring |
| `collection_viewed` | theme collection | category affinity |
| `checkout_started` | pixel | **cart-abandonment prediction (highest-weight signal)** |
| `discount_applied` | pixel (+ cart) | discount-led intent |
| `checkout_completed` | pixel | funnel completion (order/revenue still comes from the orders webhook) |
| `product_searched` | pixel | search intent |
| `added_to_wishlist` | theme/app (if present) | engagement |

Keys: use the **public** API key everywhere here. Never put the secret in the theme or pixel.
