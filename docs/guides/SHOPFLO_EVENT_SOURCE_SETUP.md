# Getting Shopflo checkout data into Storees — the friendly guide

**Who this is for:** anyone on the team setting up FineWine (or any store that uses
Shopflo checkout). No coding needed. Two things to set up, maybe 15 minutes.

**The problem we're solving, in one sentence:** when a shopper fills in their phone
number on the Shopflo checkout page, Storees currently never finds out — because
checkout happens on Shopflo's website, not ours.

---

## The picture in your head

Think of it like this:

- **Our store** (finewine-cosmetics.com) is our shop floor. Our camera (the Storees
  SDK) watches everything: pages viewed, products browsed, add-to-carts.
- **Shopflo checkout** (checkout.shopflo.co) is a separate back room we can't see
  into. The shopper walks in there, writes down their phone number… and we're blind.
- The fix: we give Shopflo a **letterbox** — a special web address. Every time
  something happens in their back room (someone starts a checkout, abandons it,
  pays), Shopflo drops a letter into our letterbox describing what happened.
- Then we teach Storees **how to read those letters**: "the phone number is written
  *here*, the email is written *there*."

Step 2 below = building the letterbox. Step 3 = teaching Storees to read the letters.

---

## "But Shopflo is a third-party app — will they even do this?"

Yes — and we know because **it's already happening for this exact store**:

1. **We never send anything to Shopflo.** The session note is written onto OUR
   OWN Shopify cart (on finewine-cosmetics.com), using Shopify's standard cart
   feature. Shopflo simply reads the cart when the shopper checks out — the same
   way it reads the products and the prices — and passes the notes along.
2. **Shopflo already sends these webhooks for FineWine.** Before Storees, the
   store's checkout events went to CleverSend the exact same way — their setup
   showed hundreds of Shopflo payloads arriving at CleverSend's webhook URL. And
   those payloads already contained cart notes (`note_attributes` with utm
   values) — proof that Shopflo forwards them untouched.

So the ask isn't "please accept a new vendor's data." It's: **"you already send
our checkout events to CleverSend — point that same webhook at this new URL"**
(or add it as a second destination while both run).

**If Shopflo ever refuses or strips the notes** (unlikely, given the above):
- Completed purchases still stitch without Shopflo at all — Shopify's own order
  webhook carries the cart notes, and Storees already reads them.
- Only *abandoned* checkouts depend on Shopflo's webhook; the fallback there is
  matching by phone/email with a time-window, which we can wire if needed.

---

## Step 2 — Create the letterbox (an "Event Source") and give it to Shopflo

### 2a. Create it in Storees

1. Open the Storees dashboard, make sure the **Finewine** project is selected
   (top-left dropdown).
2. In the left sidebar click **Event Sources**.
3. Click the **Create Webhook** button (top right).
4. It asks for one thing — a name. Type something you'll recognise later, like:
   `Shopflo — checkout events`. Press Enter.
5. Your letterbox now exists. In the list you'll see it with a **Copy URL** button.
   Click it. You now have a web address on your clipboard that looks like:

   ```
   https://api.storees.io/api/hooks/AbC123xYz…
   ```

   That long random ending is the key to the letterbox — anyone who has this
   address can post letters into it, so treat it like a password. Don't post it
   in public channels.

**Is it secure? Is there an auth token?** Yes — the long random ending of the URL
IS the auth token (32 random characters, unguessable, sent over HTTPS). This is
the same pattern Slack, Zapier, Stripe and even CleverSend use — because most
senders (Shopflo included) can only paste a URL, not set custom headers. If your
sender CAN set a header, open the webhook's **Settings** tab and set a **secret
header** for a second lock — then deliveries must also carry `x-storees-secret`.
And if a URL ever leaks, Settings → **Rotate URL** issues a fresh one and kills the
old instantly. It's POST only — a GET returns a clear "use POST" error.

### 2b. Hand the address to Shopflo

Shopflo needs to be told: "send your checkout events to this address." Depending on
the plan, this is either a self-serve setting or something their support does for you.

- Look in the **Shopflo merchant dashboard** for something like **Settings →
  Integrations → Webhooks** (sometimes under "Developer settings").
- If you find it: add a new webhook, paste our address, and choose the checkout
  events (at minimum **checkout abandoned**; take started/completed too if offered).
- If you can't find it: just email your Shopflo account manager. Here's a
  copy-paste message:

  > Hi — we'd like to receive checkout event webhooks (checkout abandoned /
  > started / completed) for our store FineWine Cosmetics at this callback URL:
  >
  > `<paste the copied URL>`
  >
  > Plain JSON POSTs are perfect, no special auth needed — the URL itself is the
  > secret. Also, please confirm that cart attributes / note_attributes are
  > included in the payload (we pass a session id through them). Thanks!

  (That last sentence matters — see "the magic ingredient" below.)

### 2c. Check letters are arriving

1. Do a test: open the store, add something to cart, go into the Shopflo
   checkout, type a phone number, then close the tab (that's an "abandoned
   checkout" — Shopflo usually sends the letter after a delay, often 15–30 min).
2. In Storees: **Event Sources → click your webhook's name → Data tab.**
3. When the letter arrives you'll see a row appear (the page refreshes itself
   every few seconds). Click the row to read the whole letter — it's the raw
   data Shopflo sent us.
4. At this point the row will say **no_match** with an amber badge. That's
   expected! It means: "a letter arrived, but nobody has taught me how to read
   it yet." That's Step 3.

Also peek at the **Schema tab** — Storees automatically makes a table of
everything it has seen in the letters ("there's a field called `body.email`,
there's one called `body.phone`…"). You'll use these names in Step 3.

---

## Step 3 — Teach Storees to read the letters (an "Event Definition")

A definition answers three questions about each letter:

1. **Which letters count?** (the filter)
2. **Who is this letter about?** (the identity — phone/email)
3. **What should we remember from it?** (the event that gets created)

### Do this:

1. Still on your webhook's page, open the **Event Definitions** tab → click
   **New Event Definition**.

2. **Event name:** type `checkout_abandoned` (lowercase, underscores — this becomes
   the event name you'll see in the Event Debugger, and what flows/segments can
   react to).

3. **Section 1 · Set filters** — "which letters count?"
   Shopflo sends different kinds of letters through the same letterbox. We only
   want the abandoned-checkout ones here. Click **+ Add filter** and set:
   - field: `body.event_name` (pick it from the dropdown — the dropdown is fed by
     the Schema tab, so it only appears after at least one letter has arrived)
   - condition: **is**
   - value: `checkout_abandoned` *(open a received letter in the Data tab and
     check what Shopflo actually calls it — copy that exact spelling)*

4. **Section 2 · Identify the customer** — "who is this about?"
   This is the important one. Point each identity at the place in the letter
   where it's written:
   - **Email** → `body.email`
   - **Phone** → `body.phone`
   - **Session ID** → `body.note_attributes_map.storees_sid` ← *the magic
     ingredient, explained below*

5. **Sections 3 & 4** — leave them empty for now. Empty means "keep everything in
   the letter as the event's details," which is fine to start.

6. **Save.**

7. Trigger one more abandoned checkout. This time the Data tab row should say
   **processed** (green) and show `checkout_abandoned` in the Matched column.
   Check the **Event Debugger** — the event is now there, attached to a customer
   with the phone/email you typed.

### The magic ingredient — why `note_attributes_map.storees_sid`?

Here's the clever bit that connects the back room to the shop floor:

- While the shopper is still browsing on OUR site, our SDK quietly writes a note
  onto their shopping cart: *"this cart belongs to browsing session #12345."*
- Shopify keeps that note attached to the cart, and Shopflo **copies the notes
  into every letter it sends us** (they arrive in a field called
  `note_attributes`).
- So when the letter says *"phone 73393-xxxxx abandoned a checkout, cart note:
  session #12345"* — Storees can connect the dots: **the anonymous person from
  session #12345 IS the person with this phone number.** All their earlier
  browsing (the products they viewed, the pages they read) gets attached to
  their new customer profile automatically.

Without that one field, we'd know *someone* with that phone abandoned a checkout —
but we'd never know it was the same person who browsed those five lipsticks
earlier. That's the whole "stitching" thing in one paragraph.

### How you'll know the stitch worked

Open **Event Debugger → Sessions panel** (the fold-out at the top):

- Before: your browsing session shows **anonymous**, with the phone visible only
  under "Identity seen in payloads" on the *Shopflo* row.
- After: your browsing session shows **linked → (your name/phone)** with a
  "N back-attributed" tick — meaning your earlier page views got moved onto the
  customer profile.

---

## If something doesn't work

| What you see | What it means | What to do |
|---|---|---|
| Data tab stays on "Start sending data" forever | Shopflo isn't sending to our URL yet | Re-check step 2b; ask Shopflo to confirm the webhook is registered and fired |
| Rows arrive but say **no_match** | The filter in step 3.3 doesn't match the letter | Open the letter, check the exact spelling of `event_name`, fix the filter value |
| Rows say **processed** but no customer appears | Identity paths point at the wrong fields | Open the letter, find where the phone/email actually are, fix Section 2 |
| Letter has no `storees_sid` inside `note_attributes` | Either the SDK on the store is outdated (needs the rebuilt bundle), or Shopflo strips cart attributes | First re-deploy the SDK bundle; if it still doesn't appear, ask Shopflo: "do you forward cart attributes / note_attributes in checkout webhooks?" |
| Everything processed, but the browsing session still shows anonymous | The session id in the letter doesn't match a browsing session | Check the `storees_sid` value in the letter matches an `s:…` chip in the debugger |

---

*Related: UAT checklist scenarios 33–42 (Event Sources, step-by-step) and 54 (this
exact FineWine + Shopflo stitch, end-to-end).*
