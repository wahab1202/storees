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
| **WhatsApp-ready bundle** | `body.quickReplyMetaData.*` | Shopflo pre-builds this for exactly this use case — USE IT |
| Greeting | `body.quickReplyMetaData.customer_full_name` | "Dear" for new shoppers, real name if Shopflo knows it — a built-in fallback, NOT a fetched name |
| Product summary | `body.quickReplyMetaData.product_details` | "Queen Of Hearts Creme Lipstick and 4 more" — already human-readable |
| Product image | `body.quickReplyMetaData.image` | already picked (top-level `image_url` is empty) |
| Cart value (formatted) | `body.quickReplyMetaData.total_price` | "INR 3038.40" — already formatted; raw `body.total_price` = 3038.4 |
| Recovery link | `body.quickReplyMetaData.checkout_link` | same as `abandoned_checkout_url` |
| Marketing consent | `body.customer.marketing_consent` (`true`) | |
| Attribution | `body.utm_params.utm_source` / `utm_campaign` etc. | ig / Instagram_Feed / … |

> Why `quickReplyMetaData` and not `line_items`: Shopflo repeats the same lipstick
> twice and includes ₹0 free gifts, so `line_items` is messy and
> `quickReplyMetaData.quantity` (5) counts line rows, not distinct products.
> `quickReplyMetaData` is Shopflo's clean, pre-summarised bundle built for exactly
> this message — prefer it. `line_items.0.*` still works if you want the raw first item.

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
   - `greeting` ← `body.quickReplyMetaData.customer_full_name`
   - `product_details` ← `body.quickReplyMetaData.product_details`
   - `product_image` ← `body.quickReplyMetaData.image`
   - `price` ← `body.quickReplyMetaData.total_price`
   - `recovery_url` ← `body.quickReplyMetaData.checkout_link`
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
  > Hi {{1}}! You left *{{2}}* (worth {{3}}) in your cart 💄
  > Complete your order before it sells out.

  where `{{1}}` = greeting, `{{2}}` = product summary, `{{3}}` = price.
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
   - `{{1}}` (greeting) → **Event payload path…** → `quickReplyMetaData.customer_full_name`
     · set **Fallback value** = `there` (so it never sends empty)
   - `{{2}}` (product) → **Event payload path…** → `quickReplyMetaData.product_details`
   - `{{3}}` (price) → **Event payload path…** → `quickReplyMetaData.total_price`
   - **Header & buttons** section:
     - *Image header* → **Event payload path…** → `quickReplyMetaData.image`
     - *Button "Complete your order" destination (tracked)* → **Event payload
       path…** → `quickReplyMetaData.checkout_link`  *(or `abandoned_checkout_url`)*
   - **Settings step:** UTM on → `utm_source=storees`, `utm_medium=whatsapp`,
     `utm_campaign=abandoned_cart` (rides on the recovery link for GA).
5. **Save Flow → set Active.**

---

## Step 4 — Verify end-to-end

1. Browse FineWine → add to cart → enter phone in Shopflo checkout → abandon.
2. Event Sources Data tab → row **processed**.
3. After the wait (or demo delay), the WhatsApp lands on the phone: greeting
   ("Hi Dear!" for a new shopper, or the real name for a returning one), the
   product summary + price in the body, the product image header, and a
   "Complete your order" button.
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
