# Identity Phase 2 — Deterministic Identity Graph + Consent-Native Cross-Brand

**Status:** Design / decision doc (not yet built)
**Depends on:** Phase 1 (durable device id — shipped, `feat(sdk): durable device id…`)
**Pairs with:** `gokwik-kwikpass-teardown-storees-roadmap.md`

---

## 1. Goal

Recognise a returning person reliably **within a brand**, and — as an explicit, consented option — **across brands**, using **deterministic keys only** (device id, session id, hashed phone, hashed email). No probabilistic device fingerprinting. This is the "better way" from the teardown: it does not decay, it does not fight Safari, and it is the version GoKwik is legally exposed on and we would not be.

**Non-goals:** anonymous first-touch cross-brand recognition (that needs GoKwik's 200M-phone network — unwinnable, don't attempt); any fingerprinting.

---

## 2. Current state (what we build on)

- **`customers`** — the resolved profile per project. Today it *is* the identity cluster.
- **`anonymousSessions`** — `(project_id, session_id, customer_id, device_id)`; `linkAnonymousSession()` / `stitchOrderToSession()` already stitch a browse session to a customer and back-attribute events (L1a/L1b).
- **SDK** — durable `device_id` (Phase 1) across localStorage + first-party cookie + IndexedDB; `phone`/`email` on identify.
- **`consentService`** — already **per channel + per purpose** (`transactional`/`promotional`) with an audit log and `bulkUpdateConsent`. This is the substrate for consent-native cross-brand.

We are ~70% of the way to the schema the teardown proposes; Phase 2 formalises the graph and adds the cross-brand layer.

---

## 3. Target schema (additive — do not rip out `customers`)

```
identity_edges                      -- the within-brand graph substrate
  id            uuid pk
  project_id    uuid            -- tenant-scoped
  customer_id   uuid            -- the cluster this edge belongs to
  edge_type     text            -- 'device_id' | 'session_id' | 'phone' | 'email' | 'external_id'
  edge_value    text            -- raw for device/session/external
  edge_hash     text            -- sha256 of normalised value (E.164 phone / lowercased email)
  source        text            -- 'sdk' | 'webhook' | 'pos' | 'loyalty' | 'shopify' | 'admin'
  first_seen_at timestamptz
  last_seen_at  timestamptz
  unique (project_id, edge_type, edge_hash)
```

```
identity_links_global               -- ONLY populated for cross-brand-consented identities
  phone_hash    text pk           -- sha256(E.164 phone) — the only cross-brand key
  global_id     uuid              -- stable cross-project person id
  consent_at    timestamptz
  withdrawn_at  timestamptz null  -- withdrawal propagates by setting this
```

`customer_id` stays the per-project cluster (everything already keys on it — zero churn to segments/flows/campaigns). `identity_edges` is the resolver; `identity_links_global` is the *opt-in* cross-brand bridge.

---

## 4. Deterministic merge logic (within-brand)

On any event / identify / order carrying identifiers:

1. Normalise (phone → E.164, email → lowercased) and hash.
2. Look up `identity_edges` for each identifier in this project.
3. **No match** → attach edges to the current/new `customer_id`.
4. **All matches → same `customer_id`** → update `last_seen_at`.
5. **Matches → different `customer_id`s** → **merge**: pick the survivor (oldest / most orders), re-point the loser's edges + events + orders + sessions, write a `customer_merges` audit row (reversible), never hard-delete.

Rules: phone is canonical; a merge never crosses `project_id`; merges are logged and reversible; conflicts (two strong identities disagreeing) are flagged, not silently joined.

This replaces the current implicit "one webhook = one customer row" behaviour that produces the `fabqueen2004`-style triple-count in the teardown.

---

## 5. Cross-brand — consent-native, gated three ways

Cross-brand recognition activates **only** when all hold:

1. A new consent purpose — **`cross_brand`** — granted by the identity (extends the existing `ConsentPurpose`; reuse `consentService` + audit).
2. **Both** the source and target projects have the `cross_brand` feature flag on (a per-project opt-in, like the existing feature flags).
3. The `phone_hash` exists in `identity_links_global` with `withdrawn_at IS NULL`.

Recognition = look up `phone_hash` → `global_id` → the person's clusters in other consenting projects. **Withdrawal** sets `withdrawn_at` and removes the bridge — it propagates by construction (segments/flows read through the bridge, so they stop matching immediately). This is the Consent Manager-compatible behaviour DPDP will require by Nov 2026, and it is the thing GoKwik cannot cheaply retrofit.

Only **known** (previously phone-identified, consented) people are ever bridged. Anonymous first-touch is never cross-brand.

---

## 6. Durability tail (finishes Phase 1 on Safari) — **DELIVERED (2c)**

Phase 1's cookie is JS-set → Safari caps it at 7 days. The fix is a **server-set first-party cookie**, now built:

- `GET /id` issues an `HttpOnly`, `Secure`, `SameSite=Lax`, 400-day cookie carrying the `device_id`. Resolution is churn-safe: existing cookie → the id the SDK supplies (`?d=`) → new uuid.
- The SDK calls it best-effort on init (`serverDeviceId` config, default on), sending its current id, and **adopts** the server's durable id — healing an id evicted from the client stores.

**Operator step (per merchant, to actually persist on Safari):** point a CNAME `id.<merchant>.com` → the Storees backend and set the SDK's `apiUrl` to it. First-party = the cookie sticks. Without the CNAME the call still runs but the cookie is third-party (ITP-blocked) and simply echoes the SDK's id — no harm, no durability gain.

---

## 7. Rollout process (the incident lesson: never a straight deploy)

1. **Flag-gated, per project.** Reuse the existing feature-flag mechanism. Default **off**.
2. **Backfill** `identity_edges` from existing `customers` + `anonymousSessions` (batch job, idempotent).
3. **Shadow mode.** Compute merges and log what *would* happen — no writes to `customer_id`. Review the merge/collision report on Fine Wine before enabling.
4. **Enable within-brand** on one project, verify counts (the dedupe should *reduce* inflated customer counts), then broaden.
5. **Cross-brand stays off** until the § 8 decision is made and consent copy is live.
6. Smoke test on the running app at each step. No auth/tenant-adjacent change ships without it.

---

## 8. Decisions required (business / legal, not engineering)

1. **Do we turn on cross-brand at all?** It makes Storees a DPDP **Data Fiduciary** for that graph and requires consent notice copy that explicitly names cross-brand recognition. High upside (compounding, defensible), real obligation. *Recommendation: build the schema so it's ready; keep it off until counsel signs the consent notice.*
2. **Server-cookie CNAME per merchant?** Needed for Safari durability. Ops cost per client.
3. **Which sources feed edges first?** SDK + Shopflo webhook exist; POS + loyalty (the teardown's product wedge) are the highest-value new edge sources.

---

## 9. Build order (once § 8.1 is "ready, off")

| Step | Deliverable | Risk |
|---|---|---|
| 2a | `identity_edges` + backfill + within-brand resolver in shadow mode | low (no writes) |
| 2b | Enable within-brand merge (fixes dedupe/triple-count) | medium — gated, reversible merges |
| 2c | Server-set first-party cookie endpoint + CNAME playbook | low |
| 2d | `identity_links_global` + `cross_brand` consent purpose + withdrawal propagation | **off by default; gated on § 8.1** |

Each step is one gated, reviewable change — not a big-bang.
