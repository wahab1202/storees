# CleverSend Parity — UAT Checklist (step-by-step)

Every scenario is numbered steps: **do exactly this → see exactly that.**
Mark each scenario ✅ / ❌ / 😐 (works but feels wrong) and note the step number where
it deviated. Screenshots help most.

## Setup (once per test session)

1. Deploy check: on the server run `pm2 status` → **uptime must be seconds/minutes**,
   not days. If stale: `git pull`, `npm run build -w @storees/shared`, build the
   package, `npm run db:migrate -w @storees/backend` (Phase 2 needs migration 0069),
   `pm2 restart` — for BOTH backend and frontend checkouts.
2. Have ready:
   - 1 **APPROVED** WhatsApp template with ≥1 variable (`{{1}}`) and, ideally, a URL
     button with "Track clicks" ON.
   - 1 email template with `{{customer_name}}` in the body.
   - A test customer whose phone is **+917339586637** (only number the Pinnacle
     sandbox delivers to).
   - Your project's public API key (Settings → API keys) for curl tests.
3. curl template for firing events (used in several scenarios):
   ```bash
   curl -X POST '<API_URL>/api/v1/events' \
     -H 'Authorization: Bearer <PUBLIC_KEY>' -H 'Content-Type: application/json' \
     -d '{"event_name":"EVENT_NAME","customer_id":"<CUSTOMER_ID>","properties":{}}'
   ```

---

# PHASE 1 — Flow builder UX (shipped)

## Scenario 1 — Send node opens a wizard, not the drawer
1. Sidebar → click **Flows**.
2. Click any existing flow (or create one from the template gallery).
3. On the canvas, click a **WhatsApp/Email send node** card.

**Outcome:** a large centered modal opens with three steps across the top —
**① Template ② Variables ③ Settings**. The old narrow right-side panel does NOT appear.
Press `Esc` → modal closes, nothing changed.

## Scenario 2 — Template list previews on click
1. Open the wizard (Scenario 1), stay on step ① Template.
2. In the left list, click the FIRST template (don't press Next).
3. Look at the right pane.
4. Click a SECOND template. Look again.

**Outcome:** after step 2 the right pane instantly shows a WhatsApp-style chat bubble
(body text, header image placeholder, footer, blue buttons — carousel cards if any).
After step 4 the preview swaps to the second template. With nothing selected it says
"Select a template to preview it here."

## Scenario 3 — Search filters the list
1. In the wizard step ①, type 3–4 letters of a template's name in the **Search** box.
2. Clear the search box.

**Outcome:** step 1 → list shrinks to matching names live. Step 2 → full list returns.
No match → "No templates match your search."

## Scenario 4 — Channel tabs swap the catalog
1. In the wizard step ①, select a WhatsApp template.
2. Click the **Email** channel tab.
3. Click back to **WhatsApp**.

**Outcome:** step 2 → the list swaps to email templates and the WhatsApp selection is
CLEARED (templates don't cross channels); preview empties. Step 3 → WhatsApp list is
back, only **APPROVED** templates are listed (no drafts/pending), still nothing selected.

## Scenario 5 — Empty channel state
1. In the wizard step ①, click the **SMS** tab (assuming you have no SMS templates).

**Outcome:** no blank void — you see "No sms templates yet" plus a link
"Create one under Templates → New".

## Scenario 6 — Adding a send node goes straight to the wizard
1. On the canvas, click a round **+** button between two nodes.
2. In the Actions column, click **WhatsApp**.
3. Click **Cancel** in the wizard that opens.
4. Look at the canvas.

**Outcome:** step 2 → wizard opens immediately. Step 4 → the node card exists on the
canvas with a red error badge and "No template selected" (validation catches it —
the flow won't save cleanly until configured).

## Scenario 7 — Node card shows the template NAME
1. Open a send node's wizard, select a template, click **Next → Next → Save**.
2. Look at the node card's small grey subtitle.

**Outcome:** the subtitle reads the template's **name** (e.g. `birthday_offer · 2 vars`),
NOT a truncated ID like `Template: b40304b7-c8ce-…`. If UTM was enabled it also shows
`· UTM`.

## Scenario 8 — WhatsApp variables pre-seeded per node
1. Wizard step ① → select an APPROVED template that has `{{1}}` (and `{{2}}`).
2. Click **Next** (step ② Variables).

**Outcome:** one card per variable (`{{1}}`, `{{2}}`), each with a "Maps to" source
dropdown ALREADY set to the template's default mapping, a Fallback value input, and a
Format dropdown. The right pane shows the bubble with binding tokens substituted
(e.g. `‹customer.name›`).

## Scenario 9 — Per-node mapping persists
1. In step ②, change `{{1}}`'s source (e.g. Customer ▸ Name → Customer ▸ City) and
   type a Fallback value `friend`.
2. Click **Next → Save**.
3. Click **Save Flow** (bottom bar), wait for the toast.
4. Refresh the page (F5), reopen the same send node.
5. Go to step ②.

**Outcome:** `{{1}}` still shows YOUR mapping (City + fallback `friend`) — not reset to
the template default.

## Scenario 10 — Email variables with live sample preview
1. Open an EMAIL send node's wizard → pick your email template → **Next**.
2. Step ② shows a Variables panel with a row per `{{key}}` found in the body.
3. Click **Test with sample customer**.

**Outcome:** below the button a real render appears: sample customer name, the email
body in a frame with variables substituted, and a "Resolved variables" list showing
each `{{key}}` → value.

## Scenario 11 — Live send uses the node's values (the real proof)
1. Build/repurpose a flow: Trigger = an event you can fire → WhatsApp send node whose
   `{{1}}` you remapped in Scenario 9. **Save Flow** and set the flow **Active**.
2. Fire the trigger event with the curl from Setup, using the whitelisted customer's id.
3. Watch the phone (+917339586637).

**Outcome:** the WhatsApp message arrives with `{{1}}` filled from YOUR node mapping
(the customer's city, or `friend` if empty) — not the template's default mapping.

## Scenario 12 — UTM step defaults
1. Any send node wizard → step ③ Settings.
2. Click the **Add UTM parameters** toggle ON.

**Outcome:** three rows pre-filled — `utm_source=storees`, `utm_medium=<channel>`,
`utm_campaign=<template name>` — plus "+ Add custom parameter" and a live preview line
`{your_link}?utm_source=storees&utm_medium=whatsapp&…`.

## Scenario 13 — Email UTM live
1. Email send node → step ③ → UTM ON → Save → **Save Flow** → flow Active.
2. Fire the trigger event for a customer with a real inbox you control.
3. Open the received email → hover/long-press any link → inspect the URL.

**Outcome:** every link in the email carries `?utm_source=storees&utm_medium=email&utm_campaign=…`.

## Scenario 14 — WhatsApp button UTM live
1. WhatsApp send node using a template whose URL button has **Track clicks** ON →
   step ③ → UTM ON → Save → Save Flow → Active.
2. Fire the trigger for the whitelisted customer.
3. On the phone, tap the message's URL button.
4. Look at the browser address bar after the redirect.

**Outcome:** you land on the button's destination WITH `utm_source=storees&utm_medium=whatsapp&…`
appended, and the campaign/flow analytics registers a click. (A button WITHOUT Track
clicks opens its original URL with no UTM — expected, that URL is baked at Meta approval.)

## Scenario 15 — SMS/push UTM honesty
1. SMS send node wizard → step ③ → toggle UTM ON.

**Outcome:** the explainer text explicitly says the config is **saved now but applies
when flow link-tracking ships** — no false promise.

## Scenario 16 — Deleting a split asks what to keep
1. Build: Trigger → **Conditional Split** → add one node on the **Yes** path and one on
   the **No** path.
2. Click the trash icon on the SPLIT node card.

**Outcome:** a dialog appears: "Delete condition split?" showing counts
("Yes: 1 node, No: 1 node") and two radio options — **Delete all subsequent nodes** /
**Keep one path** (with a Yes/No picker). Nothing is deleted yet.

## Scenario 17 — Delete all subsequent
1. From Scenario 16's dialog choose **Delete all subsequent nodes** → **Delete**.
2. Check the canvas and the node counter in the bottom bar.

**Outcome:** split + both path nodes are gone (3 fewer nodes); remaining chain
reconnects with no dangling connectors.

## Scenario 18 — Keep one path (+ survives reload)
1. Rebuild Scenario 16. Delete the split → choose **Keep one path** → select
   **Yes path** → **Delete**.
2. Check the canvas.
3. Click **Save Flow**, wait for the toast, press F5.

**Outcome:** step 2 → the Yes-path node moved UP into the split's old position; the No
node is gone. Step 3 → after reload the structure is exactly the same (splice persisted).

## Scenario 19 — Empty split deletes silently
1. Add a Conditional Split with NOTHING on either path. Click its trash icon.

**Outcome:** deletes immediately, no dialog (nothing to decide).

## Scenario 20 — Plain node deletes silently
1. Delete a **Wait** node that sits mid-chain.

**Outcome:** silent removal; the chain above and below reconnects.

## Scenario 21 — Observed events in the trigger picker
1. Fire a made-up event once via curl: `"event_name":"uat_custom_check"`.
2. Flows → open a flow → click the **Trigger** node (drawer opens on the right).
3. Open the **Event** dropdown.

**Outcome:** the dropdown has optgroups — "Catalog events" AND **"Observed in your
data"** which contains `uat_custom_check`.

## Scenario 22 — Free-text custom event survives reload
1. In the trigger's Event dropdown pick **Custom event name…**.
2. Type `uat_never_fired_yet` in the input that appears.
3. Add one property filter (Custom property path… → `foo` is `bar`).
4. **Save Flow** → F5 → reopen the trigger.

**Outcome:** after reload the event still reads `uat_never_fired_yet` and the filter row
is intact.

## Scenario 23 — Custom event end-to-end
1. Set a flow: Trigger = custom event `uat_custom_check` → WhatsApp send →
   Save → **Active**.
2. Fire it via curl for the whitelisted customer with `"properties":{"foo":"bar"}`.
3. Check the phone, and Flows → the flow → **Debug** tab.

**Outcome:** a trip appears within seconds and the message arrives. This is the
CleverSend custom-event parity proof.

## Scenario 24 — Media header blocks submission (not drafts)
1. Templates → **New WhatsApp Template** → set header type **Image** — do NOT upload.
2. Fill name/body, look at the buttons at the bottom.
3. Click **Save as draft**.

**Outcome:** step 2 → **Submit for approval is disabled** with an amber hint "your
image header needs sample media before submission…". Step 3 → draft saves fine.

## Scenario 25 — Upload unblocks submission
1. Continue from Scenario 24: upload an image (or paste a public URL) in the header
   section.

**Outcome:** Submit for approval becomes enabled; submitting moves the template to
**PENDING** (no "HEADER missing expected field (example)" error).

---

# PHASE 2 — Binding depth, goals, quality (shipped)

## Scenario 26 — Nested dot-path variable resolves
1. Fire an event with a nested payload:
   ```json
   "event_name":"uat_nested", "properties":{"line_items":[{"image":"https://picsum.photos/200","price":4999}]}
   ```
2. Flow: Trigger = `uat_nested` (Observed group) → WhatsApp/Email send node → wizard
   step ② → for a variable choose **Event payload path…** (bottom of the source
   dropdown) → type `line_items.0.price`.
3. Save node → Save Flow → Active → fire the event again for the whitelisted customer.

**Outcome:** step 2 → a monospace input appears under the dropdown accepting the dotted
path. Step 3 → the received message shows `4999` where the variable was. If you typo
the path, the message shows the variable's **fallback value** — never "undefined".

## Scenario 27 — Nested trigger filter gates the trip
1. On the `uat_nested` trigger, add a property filter: **Custom property path…** →
   `line_items.0.price` · **greater than** · `10000`. Save, Active.
2. Fire the event with price `4999`. Check the Debug tab.
3. Fire again with price `19999`. Check again.

**Outcome:** step 2 → NO trip is created. Step 3 → a trip is created. The nested filter
actually gates enrolment.

## Scenario 28 — Goal marks the trip converted
1. In the builder's bottom bar click **Goal & Exits: …**.
2. In the dialog's Goal section pick event `order_placed` (or any event you can fire).
   Click **Apply**, then **Save Flow**, set Active.
3. Fire the flow's trigger event → confirm a trip exists (Debug tab, status
   active/waiting).
4. Now fire the GOAL event (`order_placed`) for the same customer.
5. Open the flow's **Analytics** tab.

**Outcome:** step 4 → the trip flips to **completed** and pending scheduled sends are
cancelled. Step 5 → the **Converted** card shows `1` with a conversion percentage.

## Scenario 29 — Goal filters must match
1. Edit the goal: add a filter `total` **greater than** `100000`.
2. Re-run Scenario 28 but fire `order_placed` with `"properties":{"total":500}`.
3. Fire again with `"properties":{"total":200000}`.

**Outcome:** step 2 → trip stays active (goal NOT counted). Step 3 → converted.

## Scenario 30 — Multiple exits, each filtered
1. Goal & Exits dialog → **Add exit event** twice: exit A = `unsubscribed` (no filter),
   exit B = `support_ticket_opened` with filter `priority` is `high`. Apply, Save, Active.
2. Enrol a trip (fire the trigger).
3. Fire `support_ticket_opened` with `"priority":"low"`.
4. Fire `support_ticket_opened` with `"priority":"high"`.

**Outcome:** step 3 → trip unaffected. Step 4 → trip status = **exited**, pending sends
cancelled. (Repeat with `unsubscribed` — exits immediately, filters not needed. Exits
are OR'd.)

## Scenario 31 — Legacy single exit still works
1. Open a flow saved BEFORE this phase that had an "Exit on: <event>" configured.
2. Look at the bottom bar, open the Goal & Exits dialog.

**Outcome:** the old exit shows as **1 exit** in the summary and appears as the first
row in the Exits list — nothing lost in the format change.

## Scenario 32 — Quality rating badge
1. Templates page → on any non-draft WhatsApp template card click **Refresh**.
2. Look at the badge row at the top-right of the card.

**Outcome:** next to the status pill a **Quality: GREEN / YELLOW / RED** badge appears
(green/amber/red tinted). No badge is shown when Meta hasn't rated the template yet
(UNKNOWN) — that's expected for fresh/sandbox templates, not a bug. "Sync from
provider" also populates it in bulk.

---

# PHASE 3 — Custom-events data-source suite (shipped)

> Deploy note: Phase 3 needs **migration 0070** on the server (`npm run db:migrate`).
> The webhook receive URL points at the API host (`api.storees.io/api/hooks/…`), not the dashboard.

## Scenario 33 — Create a webhook and copy its URL
1. Sidebar → click **Event Sources** (new entry, below Flows).
2. Click **Create Webhook** (top right).
3. Type a name, e.g. `Shopflow — checkout events`, press Enter.
4. In the new table row, click **Copy URL**.

**Outcome:** step 2 → a small centered dialog with one Name field. Step 3 → the dialog
closes; the webhook appears in the table with status **Active**, Data (last 24h) = 0,
Last received = —. Step 4 → button flips to "Copied"; your clipboard has
`https://<api-host>/api/hooks/<32-char-token>`.

## Scenario 34 — First payload appears live
1. Click the webhook's name to open its detail page → **Data** tab.
2. Note the empty state: "Start sending data" + a Copy URL button.
3. From a terminal (NO API key — the URL token is the auth):
   ```bash
   curl -X POST '<COPIED_URL>' -H 'Content-Type: application/json' \
     -d '{"event_name":"checkout_abandoned","email":"uat@test.com","phone":"7339586637","cart":{"value":4999,"items":[{"sku":"NECKBAND-1","price":4999}]}}'
   ```
4. Watch the Data tab (it polls every 5s).
5. Click the new row.

**Outcome:** step 3 → HTTP 200 `{"success":true,"data":{"status":"no_match","matched":0}}`
(no definitions yet — that's correct). Step 4 → a row appears within ~5s: payload
preview, status badge **no_match** (amber), Matched —. Step 5 → row expands showing the
full JSON body + collapsible headers.

## Scenario 35 — Paused webhook rejects
1. Back on the list, click the **Active** badge (toggles to Paused).
2. Re-run the curl from Scenario 34.
3. Toggle back to Active.

**Outcome:** step 2 → HTTP 409 `{"success":false,"error":"Webhook is paused"}` and NO
new row in the log.

## Scenario 36 — Observed schema (union of payloads)
1. POST two MORE payloads with overlapping-but-different fields, e.g. add
   `"utm":{"source":"ig"}` to one and `"note":"hello"` to the other.
2. Open the webhook detail → **Schema** tab.

**Outcome:** a table of dot-paths with types and samples — the UNION across payloads:
`body.event_name (string)`, `body.cart.value (number)`, `body.cart.items.0.price`,
`body.utm.source`, `body.note`, plus `headers.…` rows. Array indices show as `.0`.

## Scenario 37 — Event definition: filters gate the match
1. Detail → **Event Definitions** tab → **New Event Definition**.
2. Name: `checkout_abandoned` (lowercase enforced).
3. Under **1 · Set filters** → Add filter → field `body.event_name` (pick from the
   dropdown — it's fed by the observed schema) · **is** · `checkout_abandoned`.
4. Under **2 · Identify the customer** → set Email = `body.email`, Phone = `body.phone`.
5. Leave properties/profile mappings empty. **Save**.
6. Re-run the Scenario 34 curl.
7. Send one more curl with `"event_name":"something_else"` in the body.
8. Check the Data tab, then the **Event Debugger** page.

**Outcome:** step 6 → response `{"status":"processed","matched":1}`; the log row shows
Matched: `checkout_abandoned`, status **processed** (green). Step 7 → that row shows
**no_match**. Step 8 → Debugger shows a `checkout_abandoned` event whose properties are
the payload body, attached to a customer with `uat@test.com` (created if new).

## Scenario 38 — Profile attribute mapping updates the customer
1. Edit the definition → **4 · Update customer profile** → add:
   `body.cart.value` → `last_cart_value` (custom key) and `body.email` → `email`.
2. Save, re-run the curl with `"cart":{"value":12345,…}`.
3. Customers → open `uat@test.com` → check attributes.

**Outcome:** the customer's custom attributes show `last_cart_value: 12345`. Repeat
curls keep updating it (upsert, not append).

## Scenario 39 — Defined event triggers a flow end-to-end
1. Flows → create/edit a flow: Trigger = event `checkout_abandoned` (it now appears
   under "Observed in your data") → WhatsApp send → Save, **Active**.
2. Re-run the curl but with the whitelisted phone: `"phone":"7339586637"`.
3. Check the phone and the flow's Debug tab.

**Outcome:** webhook → definition → event → trigger → trip → message on the phone.
This is the full CleverSend loop with zero engineering steps.

## Scenario 40 — Property mappings shape the event
1. Edit the definition → **3 · Event properties** → add `body.cart.value` → `cart_value`
   and `body.cart.items.0.sku` → `first_sku`. Save.
2. Re-run the curl. Open the newest event in the Debugger.

**Outcome:** the event's properties are now EXACTLY `{cart_value: …, first_sku: …}` —
not the whole body (empty mapping list = whole body; any mappings = only the mapped set).

## Scenario 41 — Segment on a custom event
1. Segments → New segment → **Add condition** → pick **"Performed a specific event"**
   (new teal option).
2. Configure: Performed `checkout_abandoned` · **at least** `1` times · in the last
   `7` days · + Property filter: `cart_value` · **greater than** · `10000`.
3. Save & evaluate the segment; check members.
4. Change the property filter to `greater than 99999` and re-evaluate.

**Outcome:** step 3 → `uat@test.com` is a member (their cart_value was 12345).
Step 4 → membership drops to 0. Arbitrary custom-event properties are segmentable.

## Scenario 42 — Pickers now suggest nested paths
1. Open any flow send node → wizard step ② → open a variable's source dropdown.
2. Look at the "Event properties" optgroup.

**Outcome:** for events with nested payloads the dropdown now lists dotted paths
(e.g. `checkout_abandoned.cart.value`) discovered from real payloads — no more typing
paths blind (typing still works via "Event payload path…").

---

# PHASE 4 — Extended parity (shipped)

## Scenario 43 — A/B split renders with weights
1. Flow builder → **+** → Controls column → **A/B Split**.
2. Look at the canvas, then click the split node.
3. In the drawer drag the **Traffic split** slider to 70.
4. Add a different send node under each branch (use the + under A and under B).

**Outcome:** step 2 → the node renders like a condition split but with
fuchsia/blue pills reading `A · 50%` / `B · 50%`. Step 3 → pills update to
`A · 70%` / `B · 30%` (B auto-compensates; weights can't leave 1–99).
Step 4 → both branches hold their own chains.

## Scenario 44 — A/B assignment is deterministic
1. Save + activate a flow: Trigger → A/B (50/50) → branch A sends template X,
   branch B sends template Y.
2. Fire the trigger event for the SAME customer 3 times (wait for each trip to finish
   or exit it).
3. Check the Debug tab / received messages.

**Outcome:** the same customer lands on the SAME branch every time (assignment hashes
customer+node). Different customers distribute roughly evenly.

## Scenario 45 — A/B delete safety
1. Delete the A/B split node (trash icon).
2. Choose **Keep one path → A path** → Delete.

**Outcome:** the dialog says "Delete A/B split?" with per-path node counts; after
confirming, A's chain splices up into the split's place and B's chain is gone —
identical semantics to condition-split deletion (Scenario 18).

## Scenario 46 — HTTP request node calls out
1. Get a test URL from https://webhook.site (or run `nc -l 9999` locally).
2. Builder → **+** → Controls → **HTTP Request**. In the drawer:
   Method POST · URL = your test URL · Body:
   ```json
   {"email": "{{customer_email}}", "cart": "{{event.cart_value}}"}
   ```
   Save response as: `crm`.
3. Place it BETWEEN the trigger and a send node. Save, Active, fire the trigger.
4. Check webhook.site.

**Outcome:** the request arrives with the customer's real email and the trigger
event's cart_value substituted. The node card subtitle shows `POST webhook.site/…`.

## Scenario 47 — HTTP failure doesn't strand the trip
1. Change the URL to `https://definitely-not-a-real-host-xyz.invalid/x`. Save, fire.
2. Check the Debug tab and the phone/inbox.

**Outcome:** the send AFTER the http node still goes out — the trip continues; the
failure is recorded on the trip context, not thrown.

## Scenario 48 — Previous-node data in a later send
1. Point the HTTP node at an endpoint that returns JSON, e.g.
   `https://api.github.com/zen` won't do (plain text) — use
   `https://httpbin.org/json` with method GET, Save response as `crm`.
2. In the send node AFTER it → wizard step ② → variable source →
   **Event payload path…** → type `node_outputs.crm.body.slideshow.title`.
3. Fire the trigger.

**Outcome:** the received message contains the value from the HTTP response
(`Sample Slide Show`). Earlier-node outputs are bindable exactly like trigger
payload fields — CleverSend's "Previous Node Data" equivalent.

## Scenario 49 — WhatsApp template table view
1. Templates → WhatsApp tab → click the **Table** toggle (top right of the list).
2. Click **Cards** to switch back.

**Outcome:** a compact table with Name (+body preview), Category, Language,
**Quality dot** (green/amber/red), Status, Created, and the same Edit/Refresh
actions. Toggle is instant; search still filters both views.

## Scenario 50 — Inserting a split mid-chain keeps the downstream (bug fix)
1. Build: Trigger → WhatsApp send → Wait (a chain of at least 2 nodes below the trigger).
2. Click the **+** button BETWEEN the trigger and the WhatsApp node → **Conditional Split**.
3. A dialog appears: "Insert condition split — there are N existing steps below…".
4. Choose **Yes path (condition met)** → **Insert split**.
5. Look at the canvas. Then Save Flow, refresh, and look again.

**Outcome:** step 3 → the dialog MUST appear (previously the split swallowed the chain
silently). Step 5 → the WhatsApp + Wait nodes hang under the **Yes** branch; the No
branch shows an empty + button. Nothing disappears, before or after reload. Repeat with
**A/B Split** — same dialog with A/B wording.

**Recovery check:** any flow previously broken by this bug (nodes vanished after adding
a condition) heals itself when you open it — the hidden steps reappear under the
split's Yes path. Save the flow to persist the repair.

## Scenario 51 — Header & button bindings in the flow wizard
1. Open a WhatsApp send node's wizard → select a template that has a media header
   and/or buttons → step ② Variables.
2. Look below the `{{n}}` rows for a **Header & buttons** section.

**Outcome:** every dynamic piece of the template appears:
- media header → editable row (defaults to the approved sample URL; bind a payload
  image via "Event payload path…", e.g. `line_items.0.image`)
- URL button with Track clicks → info row "Tracked — short link generated automatically"
- static URL button → info row "Fixed URL, baked in at Meta approval"
- dynamic URL button (`{{1}}` suffix) → editable "URL suffix" row
- copy-code button → editable coupon-code row
- call / quick-reply buttons → info rows ("nothing to bind")
Nothing about the template is invisible anymore. Bindings persist across
Save → reload like scenario 9.

## Scenario 52 — Insert / delete at the head of a branch
1. Build: Trigger → Condition → Yes: WhatsApp → End, No: Email → End (like a real flow).
2. Hover between the **Yes pill** and the WhatsApp node → a **+** button is there now.
3. Click it → add a **Wait** node.
4. Also try: + at the head of the No branch → **Conditional Split**.
5. Delete the WhatsApp node (a branch head with steps below it).

**Outcome:** step 3 → Wait lands ABOVE WhatsApp inside the Yes branch; nothing vanishes.
Step 4 → the "which path do the existing steps continue on?" dialog appears (same as
scenario 50), and the Email chain hangs off the chosen sub-path. Step 5 → the End node
(everything below the deleted head) re-chains directly under the Yes pill instead of
disappearing. Save + reload → structure intact.

---

**Feedback format:** scenario number + the step where it broke + what you saw instead
+ screenshot. 😐 "works but feels wrong" observations are exactly the UX feedback this
initiative exists for.
