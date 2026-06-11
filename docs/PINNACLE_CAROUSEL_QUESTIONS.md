# Pinnacle (Pinbot) — Carousel template support questionnaire

Ready-to-send email to the Pinnacle BSP contact. Goal: unblock the WhatsApp dynamic-carousel send path. We need **working sample payloads**, not just prose — interpretation risk on payload shape is the main thing slowing us down.

---

**Subject:** WhatsApp carousel templates on Pinbot — payload shapes + sandbox

Hi [name],

We're building dynamic product carousels on top of our Pinbot WABA integration (`partnersv1.pinbot.ai/v3`). We already submit, sync, and track status for standard/auth/utility templates through your API; carousels are the last piece. A few questions before we wire up per-recipient sending — **concrete sample payloads would answer most of these in one shot.**

**Most important (this one changes our architecture):**

1. For an **approved carousel template with N cards**, can a single send include **fewer than N cards** at runtime (e.g. only 3 of 5 if we don't have enough products), or must every send fill all N? This determines whether we backfill or skip.

**Sample payloads (please share request bodies exactly as your API expects):**

2. A complete **carousel template *submission*** request (the `/message_templates` body) — body component + `CAROUSEL` with cards (header media + body + buttons), including how the **media example** is provided at submission (handle vs URL).

3. A complete **carousel *send*** request (the `/messages` body) — showing per-card components: header media, body parameters, and the URL-button suffix variable per card.

4. For **media in the send** (point 3): do you accept a **direct CDN image/video URL per card**, or is a pre-uploaded **media handle** required? If a handle: what's its **TTL / caching** behavior?

**Operational:**

5. **Webhooks** — we already receive delivery statuses (`delivered/read/failed`) and `message_template_status_update` (approved/rejected/paused/quality). Anything **carousel-specific** we should also subscribe to?

6. **Card-level errors** — if one card's media or body fails validation, is it a **whole-message rejection** or partial delivery? (Affects our retry logic.)

7. **Throughput** — per-WABA tier send limits and any Pinnacle-side rate caps; batching guidance for large blasts.

8. **Pricing** — confirm a carousel send is billed as **one** marketing message (not per card).

9. **Variable limits** — max variables per **card body** and per **bubble (top) body**.

10. **Meta per-user marketing frequency** as currently enforced for **India**, and how a frequency-block surfaces in your webhooks (status/reason code).

11. **Sandbox / test WABA** for development — is one available, and how do we get access?

Thanks — a sample submission + send payload (Q2/Q3) and the answer to Q1 unblock us immediately.

[your name]

---

### Internal notes (don't send)
- Q1 (variable card count) gates the filter/rank pipeline's backfill-vs-skip design (spec §6.2).
- Q3/Q4 verify our `buildTemplateComponents` carousel send path, which **does not exist yet** — we're building it against the answer, not guessing.
- Our submission code currently passes `example: { header_handle: [<public URL>] }`; Q2/Q4 confirm or correct that.
- Webhook/status coverage already exists in `channelWebhooks.ts`; Q5/Q6 are confirmation, not greenfield.
