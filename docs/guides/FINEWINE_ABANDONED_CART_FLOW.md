# FineWine abandoned-cart recovery — exact setup from the real Shopflo payload

The Shopflo `checkout_abandoned` events are now arriving in Event Sources. This is
the end-to-end recovery flow, with **exact field paths taken from the real
payload** (no guessing).

## Payload facts that drive the config

| What | Where in the payload | Notes |
|---|---|---|
| Identity — phone | `body.phone` (`+919282255892`) | email is `null` for this shopper; phone is the identity |
| Session stitch key | `body.utm_params.storees_sid` | our SDK's browsing session — NOT `body.session_id` (that's Shopflo's own) |
| Recovery link | `body.abandoned_checkout_url` | unique per checkout — the button target |
| Product image | `body.line_items.0.image` | top-level `image_url` is empty; use the first line item |
| Product name | `body.line_items.0.title` | "Queen Of Hearts Creme Lipstick" |
| Cart value | `body.total_price` (`3038.4`) | after discount; `subtotal_price` is pre-discount |
| Marketing consent | `body.customer.marketing_consent` (`true`) | |
| Attribution | `body.utm_params.utm_source` / `utm_campaign` etc. | ig / Instagram_Feed / … |

> Heads-up on `line_items`: Shopflo repeats the same lipstick twice and includes
> ₹0 free items. For the recovery message use `line_items.0.*`; don't derive a
> "distinct product count" from the array length.

---

## Step 1 — Event Definition (Event Sources → your webhook → Event Definitions)

1. **New Event Definition** → name: `checkout_abandoned`
2. **Filters:** `body.event_name` **is** `checkout_abandoned`
3. **Identify the customer:**
   - Phone → `body.phone`
   - Session ID → `body.utm_params.storees_sid`  ← **the stitch**
   - (leave Email blank — it's null here)
4. **Event properties** (Section 3) — map the fields the message needs so they're
   clean on the event (optional; leaving it empty passes the whole body, which
   also works with nested paths):
   - `product_image` ← `body.line_items.0.image`
   - `product_name` ← `body.line_items.0.title`
   - `recovery_url` ← `body.abandoned_checkout_url`
   - `cart_value` ← `body.total_price`
5. **Update customer profile** (Section 4): `utm_source` ← `body.utm_params.utm_source`
   (optional, nice for attribution). **Save.**

After the next abandoned checkout, the Data-tab row should read **processed**, and
the Event Debugger should show a `checkout_abandoned` event on a customer resolved
by that phone — with the browsing session stitched (Sessions panel flips to
**linked**).

---

## Step 2 — WhatsApp template (Templates → New WhatsApp Template)

- **Category:** MARKETING (recovery is promotional; be aware of the per-user cap /
  error 131049 on unengaged numbers).
- **Header:** Image (upload any on-brand sample for Meta approval — the real image
  is bound per-send).
- **Body** (example, with variables):
  > Hi! You left *{{1}}* in your cart 💄
  > Complete your order before it sells out.
- **Button:** URL, text "Complete your order", **Track clicks = ON**. Give it any
  valid URL for approval (e.g. `https://finewine-cosmetics.com`) — the real
  destination is bound per-send.
- Submit → wait for **APPROVED**.

> The tracked button's approved URL is a fixed `…/c/{{1}}` base; at send we mint a
> short link that 302s to each recipient's `abandoned_checkout_url`. This is why
> Shopflo's mid-URL token isn't a problem.

---

## Step 3 — The flow (Flows → new)

1. **Trigger:** event `checkout_abandoned` (type it as a custom event name if it's
   not in the dropdown yet; it appears under "Observed in your data" once one has
   arrived).
2. **Wait:** 30 minutes (or rely on `DEMO_DELAY_MINUTES` for a live demo).
3. *(optional)* **Condition:** did the customer place an order since trip start? →
   Yes: Exit. No: continue. (Prevents messaging someone who already bought.)
4. **WhatsApp send node** → pick the approved template → **Variables step**:
   - `{{1}}` → **Event payload path…** → `product_name`  *(or `line_items.0.title`
     if you skipped property mapping)*
   - **Header & buttons** section:
     - *Image header* → **Event payload path…** → `product_image`  *(or
       `line_items.0.image`)*
     - *Button "Complete your order" destination (tracked)* → **Event payload
       path…** → `recovery_url`  *(or `abandoned_checkout_url`)*
   - **Settings step:** UTM on → `utm_source=storees`, `utm_medium=whatsapp`,
     `utm_campaign=abandoned_cart` (rides on the recovery link for GA).
5. **Save Flow → set Active.**

---

## Step 4 — Verify end-to-end

1. Browse FineWine → add to cart → enter phone in Shopflo checkout → abandon.
2. Event Sources Data tab → row **processed**.
3. After the wait (or demo delay), the WhatsApp lands on the phone with the product
   image, the product name in the body, and a "Complete your order" button.
4. Tap the button → it 302s to that exact Shopflo checkout (with UTM appended) and
   logs a `whatsapp_clicked` → Flow Analytics shows the click; if they buy, the
   goal converts.

---

## What was built to make this work

- **Per-send tracked-button destination** (`wa_button_dest_N`) — the recovery
  button points at each recipient's `abandoned_checkout_url`, not a static
  template URL. Surfaced in the send-node "Header & buttons" step as an editable
  "destination (tracked)" row.
- Nested dot-path binding (Phase 2), the header-media binding, and the durable
  short-link service were already in place.
