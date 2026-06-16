# Gowelmart × Storees — Making Push Notifications Better

**Audience:** GWM platform/backend team (primary) + app team (minor) + WAIOZ.
**From:** WAIOZ (Storees platform).

**Context this doc starts from:** GWM **already sends push notifications today** — the app collects FCM device tokens, GWM's **own backend calls FCM directly**, and ~6,000 Android users already receive notifications. **We are not rebuilding push.** We are putting Storees *in front of* that working pipe so push gets **segmented, behavioral, and automated** instead of broadcast.

**Decisions taken (drive this whole doc):**
1. **Sender of record going forward = Storees.** GWM shares its FCM service-account key; Storees becomes the push engine.
2. **First wins = behavioral triggers/flows + segmentation** (abandoned-cart, win-back, etc. → precise audiences, not blasts).
3. GWM's current sender is **server-side (own backend → FCM)** — which makes the integration low-friction (see §3).

---

## 1. What "better" means here

GWM today can broadly only **broadcast** (or hand-build a list). Storees adds the layers a CDP gives you on top of the *same* FCM pipe:

| Capability | Today (GWM backend) | With Storees as the engine |
|---|---|---|
| **Targeting** | Everyone / manual lists | Live **segments** — "abandoned cart < 24h", "high churn-risk", "lapsed but browsing", "VIP" |
| **Automation** | Manual sends | **Flows** — event-triggered abandoned-cart, win-back, post-purchase, price-drop |
| **Personalization** | Generic copy | `{{name}}`, order-specific, recommended products |
| **Predictive** | — | Propensity / CLV / churn scores pick the audience ([PREDICTION_LOGIC.md](docs/PREDICTION_LOGIC.md)) |
| **Guardrails** | Ad-hoc | Consent, **frequency caps**, quiet hours, send-time |
| **Measurement** | Limited | Open/click funnels per campaign, A/B |

The **two priorities** are **behavioral flows** and **segmentation** — everything below is sequenced to deliver those first.

---

## 2. Target architecture (Storees becomes the sender)

```
┌──────────────┐  app registers token   ┌──────────────────┐
│  GWM App     │───────────────────────▶│  GWM Backend     │  (UNCHANGED — app keeps talking to GWM)
└──────────────┘                         │  holds tokens    │
                                         └───────┬──────────┘
                  NEW: forward token + consent   │  POST /api/v1/customers  (X-API-Key/Secret)
                  (server-to-server, no app rel.)│  { customer_id, attributes:{ fcm_token, push_subscribed } }
                                                 ▼
                                   ┌──────────────────────────────┐
                                   │  STOREES (the push engine)    │
                                   │  • token on customer record   │
                                   │  • segments + behavioral flows │
                                   │  • consent / freq-cap / timing │
                                   │  • FCM send via GWM's key      │
                                   └───────────────┬───────────────┘
                                                   │ FCM v1 API (GWM service-account key)
                                                   ▼
                                   ┌──────────────────────────────┐
                                   │  Firebase Cloud Messaging     │──▶ user's device
                                   └──────────────────────────────┘
```

**End state:** Storees calls FCM. GWM's backend stops sending the campaign types Storees now owns (see §7 — double-push is the main risk). GWM's backend keeps doing one new small job: **forwarding tokens to Storees**.

---

## 3. Why this is low-friction: no app release needed

Because GWM's backend already **receives and stores the tokens** (the app talks to GWM, not Firebase-only), the integration is **server-to-server**:

- **GWM's backend forwards** each token (and consent + customer id) to Storees. The mobile app is **not touched** — it keeps registering with GWM exactly as it does now.
- A **one-time backfill** pushes the existing ~6,000 tokens into Storees.

That's the whole token integration. No app store release, no SDK change.

---

## 4. Responsibility split

| # | Item | GWM | WAIOZ |
|---|---|---|---|
| 1 | FCM Project ID + **Service Account Key JSON** | **Provide** (securely) | Configure in Storees |
| 2 | **Backfill** existing ~6k tokens → Storees | **Build** (one-time loop) | Provide endpoint + verify match |
| 3 | **Forward** new/refreshed/opt-out tokens → Storees, ongoing | **Build** (backend hook) | — |
| 4 | Use the **Medusa customer id** as `customer_id` | **Build** (must match) | Confirm convention, audit match rate |
| 5 | Map existing **push consent** → `push_subscribed` | **Provide** current opt-in state | Honor it at send |
| 6 | **Stop/scope** GWM's own sends for campaigns Storees takes over | **Build** (cutover) | Define ownership boundary |
| 7 | Segments, behavioral **flows**, templates | — | **Build** |
| 8 | FCM send, consent/freq-cap/quiet-hours | — | **Build** (live) |
| 9 | (Optional, phase 2) push open/click analytics | **Build** (report taps) | Provide webhook + id |
| 10 | (iOS, if in scope) APNs key in Firebase | **Build** | — |

---

## 5. Token sync — the core integration work

### 5.1 The endpoint (same for backfill and ongoing)

GWM's backend calls this **upsert** per token. (Note: the bulk `/api/v1/import/customers` endpoint exists but does **not** carry `fcm_token`/`push_subscribed` — use `/api/v1/customers`.)

```http
POST /api/v1/customers
Host: <storees-api-base>           # WAIOZ provides
X-API-Key: strs_pub_xxxx           # WAIOZ provides (GWM project)
X-API-Secret: strs_sec_xxxx
Content-Type: application/json

{
  "customer_id": "<MEDUSA_CUSTOMER_ID>",
  "attributes": {
    "fcm_token": "<device token>",
    "push_subscribed": true
  }
}
```

- `fcm_token` → stored on the customer; the address Storees sends to.
- `push_subscribed` → the **consent flag** Storees enforces (no flag → no send).
- Upsert + idempotent — safe to call repeatedly.

### 5.2 Backfill (one-time, ~6k)

GWM backend iterates its token table and calls the above for each `(medusa_customer_id, fcm_token, consent)`. At ~6k rows this is a short job (modest concurrency). WAIOZ then **audits the match rate** — how many tokens landed on real, order-bearing Storees customers vs orphans (see §6).

### 5.3 Ongoing forwarding (the new backend hook)

Wherever GWM's backend currently writes a token, add a forward to Storees:
- **On register / token refresh** → POST with `push_subscribed: true`.
- **On opt-out / logout / disable** → POST with `push_subscribed: false`.
- **On uninstall/`UNREGISTERED` from FCM** → POST `push_subscribed: false` (or WAIOZ prunes on FCM failure).

---

## 6. ⭐ The make-or-break matching rule

A push only reaches a user if the token is stored on the **same customer record** Storees already has from the Medusa connector. Therefore:

> `customer_id` sent to Storees **MUST equal the Medusa customer id** (Storees' `externalId`).

Send a Firebase UID or device id instead and Storees creates an **orphan** customer — no orders, no segment membership — so segmented/behavioral campaigns (the whole point) miss them. The backfill is the moment to **audit match rate**: tokens that don't match an existing customer flag an id-convention mismatch to fix before cutover.

---

## 7. ⚠️ Avoiding double-push (the cutover — biggest operational risk)

Both GWM's backend and Storees can call FCM. If both send, users get **duplicate / over-frequent** notifications and neither system knows what the other sent. Since the decision is **Storees = sender of record**, the rule is:

- **Storees owns** the campaign types it now runs — start with the two priorities: **abandoned-cart & other behavioral flows, and all segmented sends.** GWM's backend **stops** sending those.
- Any campaign GWM keeps sending short-term (e.g. a legacy manual broadcast) must be **explicitly carved out** and ideally migrated into Storees too, so there's one frequency authority.
- Define this as a written **ownership boundary** before flipping traffic on — "Storees sends X, Y, Z; GWM sends nothing overlapping." Frequency caps only protect users if one system is the authority.

---

## 8. What Storees builds (delivering the two priorities)

Once tokens are flowing and matched:

**Segmentation** — push to live segments instead of all 6k. Examples that already exist as engines: cart-abandoners, churn-risk tiers, `lapsed_engaged` (browsing but not buying), RFM grids, propensity buckets ([PREDICTION_LOGIC.md](docs/PREDICTION_LOGIC.md)).

**Behavioral flows** (event-triggered, no manual send) — e.g.:
- **Abandoned cart:** `cart_updated` → wait *N* → if no order → push "Still thinking it over? 🛒".
- **Win-back:** entered `lapsed_engaged` → push an offer.
- **Post-purchase:** `order_placed` → review request / cross-sell after *N* days.
- **Price-drop / back-in-stock:** product event → push to wishlist holders.

These require the **product/cart/order events** to be in Storees — already flowing via the Medusa connector.

> ⚠️ **Event-name alignment (must match exactly — flow triggers are exact-string).** The
> Medusa connector emits **`cart_updated`** on every cart add/remove (it does **not** emit
> `cart_created` or `add_to_cart`), and **`order_placed`** (not `order_completed`). Target
> those exact names in flow triggers, or the flow never fires.
>
> ⚠️ **Send a stable `idempotency_key`.** `carts/update` is chatty and retries, so the
> connector must send `idempotency_key` (e.g. `cart_updated:<cart_id>:<updated_at>`) or
> the same cart state is recorded many times. Storees auto-dedupes identical events within
> ~10s as a safety net, but bursts wider than that still duplicate without a real key.

The FCM message Storees sends (`fcmProvider`) carries `notification{title, body, image}` + a `data` map (deep link + ids). The app already handles GWM's notifications; confirm with WAIOZ that the **`data.deeplink` key + Android notification channel / `click_action`** match what the GWM app expects so taps route correctly.

---

## 9. Consent & analytics

- **Consent:** GWM's current opt-in/opt-out state must seed `push_subscribed` during backfill, and stay synced via §5.3. Storees won't send without it.
- **Analytics (optional, phase 2):** FCM has no server delivery webhook, so open/click tracking needs the app (or GWM backend) to report taps to `POST /api/webhooks/channel/fcm` with a correlation id Storees puts in `data`. Skip for v1 if send-and-segment is enough; add when you want open-rate funnels.

---

## 10. Phased rollout

| Phase | What | Owner |
|---|---|---|
| **0 — Setup** | GWM sends FCM Project ID + Service Account Key; WAIOZ configures the Push channel; agree `customer_id` = Medusa id | GWM + WAIOZ |
| **1 — Token sync** | GWM backfills ~6k tokens + wires ongoing forwarding; WAIOZ audits match rate | GWM (WAIOZ verify) |
| **2 — Build** | WAIOZ builds segments + the first behavioral flows (abandoned-cart, win-back); seed-device test send | WAIOZ |
| **3 — Shadow** | Run Storees flows to a small cohort while GWM still sends the rest; verify no duplicates, correct deep links | Both |
| **4 — Cutover** | GWM stops sending the Storees-owned campaign types; Storees becomes sender of record; (optional) wire analytics | Both |

---

## 11. Checklists

**GWM**
- [ ] Provide FCM Project ID + Service Account Key JSON (secure).
- [ ] Confirm `customer_id` = Medusa customer id.
- [ ] Backfill ~6k tokens → `POST /api/v1/customers`.
- [ ] Add ongoing forward (register / refresh / opt-out) from backend.
- [ ] Seed `push_subscribed` from current consent state.
- [ ] Carve out / stop GWM-side sends for Storees-owned campaigns (§7).
- [ ] Confirm app's expected `data.deeplink` + notification channel / `click_action`.

**WAIOZ**
- [ ] Configure Push (FCM) channel in Storees with GWM's key.
- [ ] Issue GWM project API key/secret + base URL.
- [ ] Audit backfill match rate (tokens → real customers).
- [ ] Build segments + abandoned-cart / win-back flows.
- [ ] Define the campaign **ownership boundary** with GWM (§7).
- [ ] Seed-device test → shadow cohort → cutover.

---

## 12. Open items to confirm

1. **`customer_id` convention** — Medusa id on both sides? (§6) Make-or-break.
2. **Consent source of truth** — where GWM's current opt-in state lives, so we seed `push_subscribed` correctly.
3. **Campaign ownership boundary** — exactly which sends move to Storees first vs stay on GWM during transition (§7).
4. **iOS in scope?** — current users are Android; iOS needs the APNs key in Firebase.
5. **`data`/deeplink + Android channel contract** — so Storees-sent notifications render and route identically to GWM's current ones.
6. **Analytics depth** — open/click tracking in v1, or send-and-segment first? (§9)

---

*Net: keep GWM's FCM pipe and app untouched; add one backend job (forward tokens) and a one-time backfill; Storees becomes the brain + sender so push goes from broadcast to segmented, behavioral, and measured. First deliverables: abandoned-cart & win-back flows on real segments.*
