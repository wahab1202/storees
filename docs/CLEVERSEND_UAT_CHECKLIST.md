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

# PHASE 3 & 4 — not shipped yet
Step-by-step scripts will be added here in the same format when each phase lands
(webhook data sources, event definitions, segments-on-custom-events; A/B, HTTP node,
previous-node data).

---

**Feedback format:** scenario number + the step where it broke + what you saw instead
+ screenshot. 😐 "works but feels wrong" observations are exactly the UX feedback this
initiative exists for.
