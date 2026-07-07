# How identity, stitching, and integrations actually work — plain English

For when you're staring at the dashboard thinking "wait, how does any of this
connect?" No code. Three questions answered:

1. How does an anonymous browser become a known customer? (the "stitch")
2. Where does a name for a WhatsApp message come from?
3. How does this work for Shopflo — and for other stores using something else?

---

## 1. The stitch — anonymous browser → known customer

Picture one shopper doing this:

```
  browses finewine-cosmetics.com          →  we see events, but WHO is this?
  (no login, no email yet)                   we only have a random session id
                                              e.g. session 22e99ae0…

  enters phone in Shopflo checkout        →  NOW we learn a phone: +9192822…
  then abandons

  ── the stitch ──                        →  "the person with phone +9192822…
                                              IS session 22e99ae0…"
```

### What Storees stores at each step

- **While anonymous:** every browsing event is saved with `customer_id = NULL`,
  tagged with the **session id**. No "ghost" customer is created — just events
  parked against a session.
- **When an identity appears** (a phone/email arrives — via the Shopflo webhook,
  a Shopify order, or an SDK login):
  1. `resolveCustomer` finds an existing customer with that phone/email, or
     creates a new one.
  2. `linkAnonymousSession` writes a row: *session 22e99ae0 → customer X*.
  3. A background worker **back-attributes** — it goes back and stamps
     `customer_id = X` onto all those previously-anonymous events. The browsing
     history moves onto the customer's profile.

### The one ingredient that makes it possible

The stitch needs a **shared key** that exists in BOTH worlds — the browsing world
and the checkout world. That key is **`storees_sid`**:

- Our SDK generates it while the person browses and quietly writes it onto the
  Shopify cart.
- Shopflo carries it into the checkout webhook (you saw it:
  `utm_params.storees_sid = 22e99ae0…`).
- So when the abandoned-cart event arrives, Storees reads that same id and says
  "aha, this is the browsing session I already have."

Without `storees_sid`, we'd have a phone and a pile of anonymous browsing, but no
way to know they're the same person.

### How to SEE it working (verify, don't trust)

1. **Event Debugger → Sessions panel** (the fold-out at the top).
   - Before the stitch: your browsing session shows **anonymous**, and the phone
     shows only under "Identity seen in payloads" on the Shopflo row.
   - After: the browsing session flips to **linked → (customer)**, with a
     "N back-attributed" tick.
2. **Customers → open that customer → Journey / Activity tab.** The browsing
   events (page views, product views) now appear on their timeline, even though
   they happened *before* we knew who they were.

---

## 2. Where does a NAME come from for a WhatsApp message?

Short answer: **a real name comes from the customer record — not the event.** But
the Shopflo payload does give you a ready-made *greeting* that never breaks.

The raw name fields (`customer.first_name`) are empty. HOWEVER Shopflo includes a
`quickReplyMetaData.customer_full_name` field that is **"Dear"** for a new shopper
and the **real name** for a returning one — a built-in graceful fallback. So:
- For the abandoned-cart WhatsApp, bind the greeting to
  `quickReplyMetaData.customer_full_name` — you get "Hi Dear!" for strangers and
  "Hi Priya!" for known customers, automatically.
- A *guaranteed-real* name (for other messages) still only exists once the customer
  is known:

| Situation | Is a name available? | Why |
|---|---|---|
| Shopper has ordered before (on Shopify) | **Yes** | Shopify's `customers/create`/order webhooks brought their name in; the stitch links to that existing customer, so `{{customer_name}}` resolves |
| Brand-new shopper, first ever visit, abandons | **No** | Nobody has ever given us their name — phone only. `{{customer_name}}` would be blank |

So a name-personalised recovery message works **for returning customers**, and for
new ones you either (a) use a no-name variant ("Hey! You left … in your cart"), or
(b) add a name-fallback in the send node (e.g. default value "there").

> This is also why the send-node variable step has a **Fallback value** field —
> it's exactly for "use the name if we have it, otherwise say 'there'".

### How to test a named WhatsApp right now

Don't wait for an abandoned cart — test personalization directly:

1. **Customers** → pick a customer who **has a name** (someone with a past order).
2. Note their phone. For the Pinnacle sandbox, only **+917339586637** delivers, so
   easiest is to make sure that test customer has a name set.
3. **Templates → your WhatsApp template →** use the **Test send** to that phone,
   binding `{{1}}` → Customer ▸ Name.
4. The message should arrive with the real name. If it's blank, that customer has
   no name stored — pick another, or set one.

(If you want to give the test customer a name: it comes from Shopify order data, or
you can push it via the API. The point of the test is just to prove name binding
works — it does; the data just has to contain a name.)

---

## 3. How does this generalise? (Shopflo today, "something else" tomorrow)

This is the part that feels like magic but is actually simple: **Storees doesn't
know or care what Shopflo is.** Event Sources is a generic "receive any JSON, then
tell me how to read it" system. Shopflo is just the first thing pointed at it.

### The mental model

```
  ANY external system  ──POST any JSON──►  an Event Source (a URL you created)
                                                     │
                                          an Event Definition you wrote:
                                          "the phone is HERE, the session is
                                           THERE, call this event checkout_abandoned"
                                                     │
                                          ──► normal Storees event ──► flows,
                                              segments, personalization, stitch
```

The definition is the adapter. Different provider → different field locations →
you write a different definition. The **engine downstream is identical**.

### So for OTHER customers / OTHER providers:

| Their setup | What they do |
|---|---|
| Also Shopflo | Same as FineWine — copy the same definition (identity: phone → `body.phone`, session → `body.utm_params.storees_sid`) |
| A different checkout app (Fastrr, GoKwik, etc.) | Create an Event Source, send us one payload, look at the **Schema tab** to see where *their* fields are, write a definition pointing at those |
| WooCommerce / custom backend | Same — point their webhook at an Event Source, map their JSON |
| No webhooks at all, just an app/site | Use the **SDK** or `POST /api/v1/events` directly with our field names — no definition needed, they send our shape from the start |

The two things that must line up for the **stitch** to work on any provider:
1. Something writes `storees_sid` onto the browsing session AND
2. The provider forwards it in its webhook (in note_attributes, utm params,
   metafields — wherever), so the definition can map it to Session ID.

For Shopify-based stores that's automatic (our SDK stamps the cart, the checkout
app forwards it). For a non-Shopify custom site, their developer includes our
`storees_sid` (readable from our SDK) in whatever they send us. Either way, the
definition's "Session ID" mapping is the single knob that connects it.

### The honest limits

- **No `storees_sid` forwarded = no browsing stitch.** You still get the event and
  the phone/email; you just can't join it to the anonymous browsing. (Completed
  *orders* still stitch via Shopify's own order webhook, which carries the cart
  note regardless.)
- **No name in the payload = no name** until the customer is known some other way.
- Each new provider needs its **own definition** (5 minutes with the Schema tab) —
  there's no universal auto-detect, because every provider names its fields
  differently.

---

## What to check next (your list)

1. ✅ **Session → customer mapping:** Event Debugger → Sessions panel; confirm a
   browsing session flips to *linked* after an abandoned checkout with `storees_sid`.
2. ✅ **Named WhatsApp:** Test-send a template to a customer who has a name, bind
   `{{1}}` → Customer ▸ Name (don't expect a name from the abandoned-cart event).
3. ⏭ Then: post-purchase events (`orders/paid`, `refunds/create`) — queued.
