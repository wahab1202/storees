/**
 * The Storees pixel for Shopify's Customer Events (Settings → Customer events →
 * Add custom pixel). One paste per shop; no theme files are touched.
 *
 * Why a pixel and not Shopify's cart webhooks: `carts/create` and `carts/update`
 * carry the basket but never the shopper — no customer, no email, no browser id —
 * so every one of them is dropped at ingestion ("no customer identifier"). The
 * theme snippets we used to hand out fixed that only on themes whose product form
 * matched the selector, and missed quick-add, cart drawers and quantity changes
 * entirely. The pixel is fed by Shopify itself, on every theme and in checkout.
 *
 * How the shopper is recognised, in order of what is available:
 *   - every event carries Shopify's browser id (`clientId`) as the session, so an
 *     anonymous visitor's browsing is stored against one session;
 *   - a logged-in shopper also carries their Shopify customer id and email;
 *   - the first checkout step that knows an email (or phone) links that session
 *     to the customer, and the earlier anonymous events move over with it.
 *
 * `checkout_started` is keyed on the checkout token — the same key the
 * `checkouts/create` webhook writes — so a shop receiving both stores it once.
 *
 * Event names are the published ecommerce names (the defaults in the project
 * vocabulary), so segments, flows and models recognise them without mapping.
 */
export function buildShopifyPixel(opts: { apiUrl: string; apiKey: string }): string {
  const url = `${opts.apiUrl.replace(/\/+$/, '')}/api/v1/events`

  return `// Storees — Shopify Customer Events pixel. Paste as-is.
const STOREES_KEY = ${JSON.stringify(opts.apiKey)};
const STOREES_URL = ${JSON.stringify(url)};

// Shopify ids arrive as "gid://shopify/Product/123" in some places, "123" in others.
const idOf = (v) => (v === null || v === undefined || v === '' ? undefined : String(v).split('/').pop().split('?')[0]);
const money = (m) => (m && m.amount !== undefined && m.amount !== null ? Number(m.amount) : undefined);

const item = (variant, quantity) => ({
  product_id: idOf(variant?.product?.id),
  item_id: idOf(variant?.product?.id),
  variant_id: idOf(variant?.id),
  title: variant?.product?.title,
  variant_title: variant?.title,
  sku: variant?.sku || undefined,
  vendor: variant?.product?.vendor || undefined,
  product_type: variant?.product?.type || undefined,
  price: money(variant?.price),
  currency: variant?.price?.currencyCode,
  quantity,
});

const checkoutProps = (c) => ({
  checkout_token: c?.token || undefined,
  total: money(c?.totalPrice),
  currency: c?.currencyCode,
  item_count: (c?.lineItems || []).reduce((n, l) => n + (l.quantity || 0), 0),
  line_items: (c?.lineItems || []).map((l) => item(l.variant, l.quantity)),
  discount_code: (c?.discountApplications || []).map((d) => d.title).filter(Boolean)[0],
});

function send(name, event, properties, opts) {
  const customer = init?.data?.customer;
  const email = opts?.email || customer?.email || undefined;
  const phone = opts?.phone || customer?.phone || undefined;
  fetch(STOREES_URL, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': STOREES_KEY },
    body: JSON.stringify({
      event_name: name,
      session_id: event.clientId,
      customer_id: idOf(customer?.id),
      customer_email: email,
      customer_phone: phone,
      idempotency_key: opts?.key || 'px:' + event.id,
      timestamp: event.timestamp,
      source: 'shopify_pixel',
      platform: 'web',
      properties: { ...properties, page_url: event.context?.document?.location?.href },
    }),
  }).catch(() => {});
}

// Browsing
analytics.subscribe('page_viewed', (e) =>
  send('page_viewed', e, { title: e.context?.document?.title, referrer: e.context?.document?.referrer || undefined }));

analytics.subscribe('product_viewed', (e) =>
  send('product_viewed', e, item(e.data?.productVariant)));

analytics.subscribe('collection_viewed', (e) =>
  send('collection_viewed', e, { collection_id: idOf(e.data?.collection?.id), title: e.data?.collection?.title }));

analytics.subscribe('search_submitted', (e) =>
  send('product_searched', e, { query: e.data?.searchResult?.query }));

// Cart
analytics.subscribe('product_added_to_cart', (e) => {
  const l = e.data?.cartLine;
  send('added_to_cart', e, { ...item(l?.merchandise, l?.quantity), line_total: money(l?.cost?.totalAmount) });
});

analytics.subscribe('product_removed_from_cart', (e) => {
  const l = e.data?.cartLine;
  send('removed_from_cart', e, { ...item(l?.merchandise, l?.quantity), line_total: money(l?.cost?.totalAmount) });
});

analytics.subscribe('cart_viewed', (e) => {
  const c = e.data?.cart;
  send('cart_viewed', e, {
    cart_id: idOf(c?.id),
    total: money(c?.cost?.totalAmount),
    currency: c?.cost?.totalAmount?.currencyCode,
    item_count: c?.totalQuantity,
    line_items: (c?.lines || []).map((l) => item(l.merchandise, l.quantity)),
  });
});

// Checkout — the steps that carry the shopper's email are what link the
// anonymous browsing above to a real customer.
analytics.subscribe('checkout_started', (e) => {
  const c = e.data?.checkout;
  send('checkout_started', e, checkoutProps(c),
    { email: c?.email, phone: c?.phone, key: c?.token ? 'checkout_started:' + c.token : undefined });
});

analytics.subscribe('checkout_contact_info_submitted', (e) => {
  const c = e.data?.checkout;
  send('checkout_contact_submitted', e, checkoutProps(c), { email: c?.email, phone: c?.phone });
});

analytics.subscribe('checkout_shipping_info_submitted', (e) => {
  const c = e.data?.checkout;
  send('checkout_shipping_submitted', e, checkoutProps(c), { email: c?.email, phone: c?.phone });
});

analytics.subscribe('payment_info_submitted', (e) => {
  const c = e.data?.checkout;
  send('checkout_payment_submitted', e, checkoutProps(c), { email: c?.email, phone: c?.phone });
});

analytics.subscribe('checkout_completed', (e) => {
  const c = e.data?.checkout;
  const orderId = idOf(c?.order?.id);
  send('checkout_completed', e, { ...checkoutProps(c), order_id: orderId },
    { email: c?.email, phone: c?.phone, key: orderId ? 'checkout_completed:' + orderId : undefined });
});
`
}
