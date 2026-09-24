# Storees — E-commerce Integration Template

What to send us, and what it must look like.

Send these names with these fields and Storees works from your first event. No
configuration, no mapping screen, nothing to set up on our side.

---

## The one rule that matters

**Send events, not statuses.**

Don't tell us an order *is* delivered. Tell us it *was* delivered:

```
you delivered it   →  send order_fulfilled
you cancelled it   →  send order_cancelled
```

The event is the status. This is the whole model, and everything below follows from
it.

---

## How to send

```
POST https://<your-storees-host>/api/v1/events
X-API-Key: <your public key>
Content-Type: application/json
```

Every event uses the same envelope:

```json
{
  "event_name": "order_placed",
  "customer_email": "asha@example.com",
  "timestamp": "2026-08-27T10:15:00.000Z",
  "properties": { }
}
```

**Identity — at least one of these, or the event is rejected:**

```
customer_id       your own id for the customer   (best — stable across email changes)
customer_email
customer_phone
session_id        for a visitor who hasn't identified yet
```

**Optional envelope fields:** `device_id`, `platform`, `source`, `idempotency_key`.

Send `idempotency_key` if you can — it's how we collapse a retry into one event. If
you don't, we derive one from the event, the customer and the payload.

---

## The seven events that carry meaning

These drive orders, revenue, segments and predictions. Everything else is optional.

### 1. `order_placed` — REQUIRED

The moment money is committed. Not when it ships, not when it arrives. **Everything
in Storees is built from this event** — without it there is no revenue, no order
history and no predictions.

```json
{
  "event_name": "order_placed",
  "customer_email": "asha@example.com",
  "timestamp": "2026-08-27T10:15:00.000Z",
  "properties": {
    "order_id": "ORD-10024",
    "total": 2499,
    "currency": "INR",
    "item_count": 2,
    "payment_method": "upi",
    "line_items": [
      { "product_id": "SKU-11", "product_name": "Cotton Shirt", "quantity": 1, "price": 1499 },
      { "product_id": "SKU-42", "product_name": "Socks",        "quantity": 1, "price": 1000 }
    ]
  }
}
```

### 2. `order_fulfilled` — the order reached the customer

Moves no money. It only advances the order out of "placed".

```json
{ "order_id": "ORD-10024", "total": 2499, "currency": "INR" }
```

### 3. `order_cancelled` — never shipped

```json
{ "order_id": "ORD-10024", "total": 2499, "reason": "out of stock" }
```

### 4. `order_returned` — shipped, and came back

```json
{ "order_id": "ORD-10024", "amount": 1499, "reason": "wrong size" }
```

### 5. `order_refunded` — the money went back

```json
{ "order_id": "ORD-10024", "amount": 1499, "currency": "INR", "reason": "damaged" }
```

### 6. `product_viewed` — browsing

```json
{ "product_id": "SKU-11", "product_collection": "Shirts", "product_type": "apparel",
  "vendor": "Acme", "price": 1499 }
```

### 7. `added_to_cart` — intent

```json
{ "cart_id": "cart_01KYWH", "product_id": "SKU-11", "product_collection": "Shirts",
  "quantity": 1, "price": 1499 }
```

`quantity` is the CHANGE, not the new total — going from three to four sends `1`.

### 8. `removed_from_cart` — taken back out

```json
{ "cart_id": "cart_01KYWH", "product_id": "SKU-11", "quantity": 1, "price": 1499 }
```

Send `quantity` to reduce a line; **omit it to remove the line entirely**. Without this
event a basket is the sum of its adds, and anything the shopper took back out keeps
counting.

### 9. `cart_updated` — the whole basket

```json
{ "cart_id": "cart_01KYWH", "item_count": 4, "total": 3190,
  "line_items": [ { "product_id": "SKU-11", "product_name": "Oxford Shirt",
                    "quantity": 3, "price": 840 } ] }
```

Send it **alongside** each add and removal, not instead of them. The actions say what
the shopper did; this says what the basket is now worth, already totalled by you — and
where it is mapped, that total is read rather than reconstructed.

---

## Three things that are easy to get wrong

### `order_id` must be identical everywhere

It is the only thing tying a cancellation to its order.

```
order_placed     order_id: "ORD-10024"
order_refunded   order_id: "ORD-10024"     ← same string, exactly
```

A mismatch doesn't error. The refund simply finds no order, silently does nothing,
and the money stays counted as revenue.

### `amount`, not `total`, on returns and refunds

A refund can be **partial**. A ₹1,499 refund against a ₹2,499 order cannot call
itself the total, so the two reversal events use `amount`:

```
order_placed / order_cancelled   →  total
order_returned / order_refunded  →  amount
```

### `line_items` matters more than it looks

Fifteen features read it — basket size, product variety, reorder rate, average item
price, and every category and brand breakdown. An order without it still counts as
money, but is invisible to all of them.

```json
{ "product_id": "...", "product_name": "...", "quantity": 2, "price": 499 }
```

---

## Optional — send these if you have them

Tracked and usable in segments and journeys. None of them move money.

```
cart_created          item_count · total · currency · line_items · cart_id
cart_updated          item_count · total · line_items · cart_id
removed_from_cart     product_id · quantity · price · cart_id
checkout_started      total · currency · item_count
coupon_applied        code · type · amount
payment_failed        order_id · currency · amount · reason
collection_viewed     collection_id · collection_name
search_performed      query · results_count
added_to_wishlist     product_id · price
review_submitted      product_id · rating · comment
product_shared        product_id · channel
customer_created      email · phone
customer_updated      email · phone
```

If you install the web SDK, these arrive automatically and you write no code:

```
page_viewed · session_started · session_ended
element_clicked · scroll_depth_reached · customer_identified
```

---

## Reserved — do not send

Storees generates these itself. Sending them will confuse your own journeys.

```
enters_segment · exits_segment · whatsapp_inbound
ctwa_lead_received · optin_received
```

---

## Money and time

**Amounts** are plain numbers in your currency's main unit — `2499` means ₹2,499.
Always send `currency` as a 3-letter ISO code; we default to `INR` when it's absent,
which is only correct if you sell in rupees.

**Timestamps** are ISO 8601 with a timezone — `2026-08-27T10:15:00.000Z`. Send the
time the thing *happened*, not the time you got round to telling us. Backfilling a
year of history is fine and expected; just carry the original timestamps.

---

## If you can't use these names

You can still integrate. Storees has a vocabulary layer that maps your words onto
these seven meanings — a shop sending `purchase_confirmed`, `parcel_arrived` and
`money_returned` works exactly as well.

But it is a setup step, done once, before your data flows. **Following this document
means skipping it entirely**, which is why it exists.

---

## Checklist

```
[ ] order_placed on every order, with order_id, total, currency, line_items
[ ] the same order_id on fulfilment and every reversal
[ ] amount (not total) on order_returned and order_refunded
[ ] currency on everything that carries money
[ ] real timestamps, ISO 8601, from when it happened
[ ] one of customer_id / customer_email / customer_phone / session_id on every event
```

Send `order_placed` alone and Storees works. Send all seven and everything works.
