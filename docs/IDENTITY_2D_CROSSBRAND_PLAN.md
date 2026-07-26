# Identity 2d — Storees Cross-Brand Recognition Network

**Status:** Design / decision doc (not built). Supersedes §5 of `IDENTITY_PHASE2_PLAN.md`.
**Model owner's intent (verbatim):** Storees owns this data and uses it only to inform the brand. Like KwikPass/Shopflo: if a user is in the Storees network, recognise/log them in at any brand that runs Storees. A user registers + buys at Brand D → their identity + hardened session is saved to Storees' proprietary DB. 8 days later they visit Brand K → Storees recognises them and identifies them at K. **Their activity at K is affiliated to K only — never shared to other brands.**

---

## 1. The shape

Storees becomes a **cross-brand identity resolver**, not a cross-brand data broker. Two planes, kept strictly separate:

- **Global plane (Storees-owned):** "this person exists in the network" + the keys that resolve to them. No behavioural data.
- **Brand plane (per project, already built):** the customer profile + all activity. **Siloed.** Brand K never sees Brand D's data — it only learns "this is a returning networked person → here is *K's* customer record for them."

Recognition crosses brands; **data never does.** That is the whole design and the DPDP defence.

---

## 2. The one hard fork — how is a returning user recognised?

Recognition needs a key that is present at Brand K. There are exactly two kinds, and this choice defines the product:

**A. Deterministic (recommended).** The key is a **hashed phone or email** the person provides at K — at checkout, an opt-in widget, or a **one-tap login** (Truecaller in India = one tap → phone → match, which *feels* like auto-login). Reliable, non-decaying, consent-clean. Fires the moment they interact, not on blank landing.

**B. Probabilistic (device fingerprint).** The only way to recognise on **zero-touch landing** — because a first-party device id set on `brandD.com` is origin-isolated and cannot be read on `brandK.com`, and third-party cookies are dead. This is precisely GoKwik's mechanism, and it (a) decays (Safari/ITP), (b) is what DPDP Rule 3 targets, and (c) is only useful at 200M-network scale. The teardown's own conclusion: don't spend a quarter here.

**Reality to internalise:** the "recognise them the instant they land, before they touch anything" bit of the vision is *only* achievable with B. Everything else in the vision — recognise + pre-identify + one-tap "log in" + siloed activity + Storees-owned — is achievable cleanly with A. **Recommendation: build A now; treat B as an optional probabilistic booster to decide on later, eyes open.**

---

## 3. Schema (global plane — new, Storees-owned)

```
global_identities
  id          uuid pk            -- the cross-brand person
  created_at  timestamptz

global_identity_keys             -- deterministic keys that resolve to a person
  id          uuid pk
  key_type    text               -- 'phone' | 'email'  (+ 'device_sig' only if fork B)
  key_hash    text               -- sha256(normalised)  — PII never stored raw here
  global_id   uuid -> global_identities
  consent_at  timestamptz        -- cross-brand recognition consent
  withdrawn_at timestamptz null   -- withdrawal removes recognition
  unique (key_type, key_hash)

global_identity_links            -- which per-brand customer a person maps to
  id          uuid pk
  global_id   uuid
  project_id  uuid
  customer_id uuid               -- the brand's OWN customer row (brand plane)
  linked_at   timestamptz
  unique (global_id, project_id) -- one customer per brand per person
```

Note what is **absent**: no orders, events, spend, or attributes on the global plane. It is a pure resolver. A brand can only ever read its own `global_identity_links` row → its own `customer_id`.

---

## 4. Recognition flow (Brand K, deterministic)

1. Person provides a key at K (checkout / widget / Truecaller one-tap) → SDK/webhook sends hashed phone/email.
2. Look up `global_identity_keys` → `global_id`. Gate: consent present, `withdrawn_at` null, K opted into the network.
3. `global_identity_links` for `(global_id, K)`:
   - **exists** → that is K's returning customer → `identify()` them (pre-fill, optional passwordless session). K sees "returning networked customer."
   - **absent** → create K's customer (brand plane), add the link. Person is now known at K.
4. All subsequent activity writes to K's `customers`/`events` only. Nothing propagates to D or the global plane except (optionally) new keys the person provides at K.

"Logs them in" = step 3's `identify()` + optional passwordless session, scoped entirely to K.

---

## 5. Registration flow (Brand D — how someone enters the network)

On identify at D (register/checkout/opt-in) with cross-brand consent:
1. Upsert `global_identity_keys` for their hashed phone/email → get/create `global_id`.
2. Upsert `global_identity_links (global_id, D, D's customer_id)`.
3. Done. They are now recognisable at any consenting brand.

The durable `device_id` (Phase 1/2c) stays a **within-brand** key — it strengthens D's own re-recognition; it does not travel to K (fork A).

---

## 6. DPDP posture (the reason this is defensible)

- **Storees is a Data Fiduciary** for `global_identities` — owning it is a *decision with obligations*, not a free lunch. Needs a consent notice that, in plain itemised language (Rule 3), states cross-brand recognition.
- **Purpose limitation is satisfied by design:** the global plane carries identity only; activity is siloed. Storees is not using Brand D's *behaviour* to serve Brand K — the exact joint GoKwik is exposed on. Storees only answers "is this a known person, and who are they at *your* store."
- **Withdrawal** sets `withdrawn_at` on the keys → recognition stops network-wide immediately (propagates by construction). Consent-Manager-compatible before Nov 2026.
- **Legitimate interest does not exist under DPDP** — this rests entirely on consent, which is why consent is a first-class object (already ~built).

**Decision reserved for counsel:** the consent-notice wording + Data-Fiduciary registration. Engineering can be built and shipped **off** ahead of that.

---

## 7. Build order (all gated, off by default)

| Step | Deliverable | Risk |
|---|---|---|
| 2d-1 | Global schema (§3) + `globalIdentityService` (upsert keys/links, resolve) | low (additive) |
| 2d-2 | Register hook: on identify with cross-brand consent, populate global plane | low (gated flag) |
| 2d-3 | Recognise endpoint: key → returning `customer_id` at the visiting brand | medium (identity) |
| 2d-4 | `cross_brand` consent purpose + withdrawal propagation | low (extends consentService) |
| 2d-5 | One-tap login widget (Truecaller-first, India) — the "auto-login" UX | medium |
| 2d-B | *(optional)* device-signal booster — probabilistic, decided separately | high / legal |

Each ships behind a flag, default off; rollout starts with two consenting brands, shadow-first.

---

## 8. The decision needed before 2d-1

**Fork A (deterministic) or A+B (add fingerprint)?** A gets you recognise-on-interaction + one-tap "login" + siloed activity + Storees-owned — the whole vision minus zero-touch-on-blank-landing. B adds landing-time recognition at the cost of decay + the DPDP practice Rule 3 targets, and only pays off at network scale you don't have yet. Recommendation: **ship A, revisit B once the network has real breadth.**
