# Self-Serve Shopify Onboarding + 14-Day Free Trial — Plan

_Plan · 2026-10-29 · Owner: Wahab · Audience: product + eng_

## 1. Goal & scope

Let a Shopify merchant **sign up on their own**, **connect their Shopify store**, and get a **14-day free trial** with a **limited feature set + usage caps**. When the trial ends, restrict until they upgrade. As a **super admin**, see every signup — who they are, what store, what plan, trial days left, what they're using, and conversion status.

**Scope: Shopify only.** Self-serve onboarding is gated to the Shopify integration (OAuth does the heavy lifting). Non-Shopify / custom (IPS, API-key) stays **manually provisioned** by the Storees team — not a self-serve funnel.

## 2. What already exists (the backbone)

| Piece | Where | Reuse |
|---|---|---|
| **Shopify OAuth auto-provision** — install → creates a `projects` row, admin user, default flows, webhooks, kicks off sync | `routes/integrations.ts` (callback inserts project @ L91, `instantiateDefaultFlows`) | This *is* the signup entry — extend it to stamp the trial |
| **Multi-tenant** — every table has `project_id`; super-admin + `user_projects` | shipped | Each merchant = one project (tenant) |
| **`projects.features` JSONB** | `db/schema.ts` | Store entitlements/plan flags |
| **Onboarding wizard** (7-step, vertical packs) | `routes/wizard.ts` | Post-connect guided setup |
| **Super-admin Clients view** | `app/(dashboard)/clients`, `routes/superAdmin.ts` | Extend into the trial monitoring dashboard |
| **Usage metering** (WhatsApp conversations), messages, events | `whatsapp_usage`, `messages`, `events` | Feed the admin metrics + trial caps |
| **Roles + field-level PII masking** | shipped | Per-tenant isolation already enforced |

Gap today: there's **no plan/trial/status model**, **no entitlement gating**, and **no trial monitoring dashboard**. Those are the three things to build.

## 3. The onboarding funnel (Shopify-only)

```
Shopify App Store  ──install──▶  OAuth consent  ──callback──▶  Storees provisions:
  (or "Connect Shopify" on                                       • project (tenant)
   a marketing landing page)                                     • admin user (store owner email)
                                                                 • plan=trial, status=trialing
                                                                 • trial_started_at=now, trial_ends_at=+14d
                                                                 • default flows + data sync kicks off
        │
        ▼
  Welcome / onboarding wizard  ──▶  Activated trial
   • store connected ✓ (auto)         • explore within trial entitlements
   • import contacts/orders (sync)    • send first WhatsApp/email
   • pick starter templates           • day 7 / 12 / 14 reminders
   • set WhatsApp sender (optional)    • expiry → restricted → upgrade
```

Key point: **the merchant never fills a signup form** — Shopify OAuth both authenticates and provisions. The only new work in the callback is **stamping the trial fields + entitlements**.

## 4. Trial & plan model (schema)

New columns on `projects` (migration 00NN):
- `plan` varchar — `'trial' | 'starter' | 'pro' | 'custom'` (default `'trial'` for self-serve; `'custom'` for manual/IPS).
- `status` varchar — `'trialing' | 'active' | 'expired' | 'suspended' | 'cancelled'` (default `'trialing'`).
- `trial_started_at`, `trial_ends_at` timestamptz.
- `signup_source` varchar — `'shopify' | 'manual'` (so admin can filter self-serve vs hand-provisioned).
- (Entitlements live in `features` JSONB — see §5 — or a resolved `plan` → entitlements map.)

Store domain + owner already captured (`projects.shopifyDomain`, admin user email). `created_at` = signup date.

## 5. Entitlements & feature-gating

A **plan → entitlements** map (code constant, overridable per-project via `features`):

```
entitlements = {
  features: string[]   // which capabilities are ON
  limits: {            // usage caps
    contacts, whatsappMessages, emailMessages, flows, templates, teamSeats, connectedStores
  }
}
```

**Proposed trial vs paid** (tune in §11):

| Capability | Trial (14d) | Paid |
|---|---|---|
| Connect Shopify + sync | ✓ | ✓ |
| Contacts synced | up to ~1,000 | plan-based |
| WhatsApp sends (trial total) | ~100 | plan-based |
| Email sends (trial total) | ~500 | plan-based |
| Flows (automations) | 2 (abandoned cart + welcome) | all |
| Templates | up to 5 | unlimited |
| Campaigns / broadcasts | ✓ (within caps) | ✓ |
| Support inbox | ✓ | ✓ |
| **AI chatbot** | ✗ (upgrade) | ✓ |
| **AI email/template designer** | limited (e.g. 5 generations) | ✓ |
| **Predictions / ML, ad-audience export** | ✗ | ✓ |
| Team seats | 1 | plan-based |
| Connected stores | 1 | plan-based |

**Enforcement — server-side is the source of truth** (same principle as the PII masking):
- `services/entitlementService.ts`: `getEntitlements(projectId)` (plan + per-project overrides), `requireFeature(key)` middleware (403 when off), `checkLimit(projectId, metric, n)` before a send/sync (returns allowed + remaining).
- Hook the caps into the existing send pipeline (`deliveryService` — count against `whatsapp_usage`/`messages`) and sync (contact cap).
- **UI hiding** is cosmetic only — hide locked features + show "Upgrade" CTAs; the backend still enforces. Expose entitlements via `/api/auth/me` (like capabilities) so the frontend knows what to show/lock.

## 6. Trial lifecycle

- **Reminders**: a daily scheduler (BullMQ, like the template-status worker) scans `trial_ends_at` → sends email on **day 7, day 12, day 14** ("trial ending"), using the existing email pipeline. Events: `trial_reminder_sent`.
- **Expiry**: when `now > trial_ends_at` and not upgraded → `status='expired'`. Expired = **read-only / sends blocked** (keep data, block outbound + locked features) with an upgrade banner. Optional short **grace period** (e.g., 3 days) before harder suspend.
- **Upgrade**: for Shopify apps the native path is the **Shopify Billing API** (recurring app charges, surfaced in the merchant's Shopify bill) — recommended for the Shopify funnel. Stripe is the alternative for non-Shopify. Phase 1 can stub this: a "Request upgrade" CTA + super-admin flips `plan`/`status` manually; Phase 2 wires real billing.
- Events emitted across lifecycle: `trial_started`, `store_connected`, `trial_activated` (first send), `trial_reminder_sent`, `trial_expired`, `upgraded`, `suspended` — these power the admin dashboard + funnel analytics.

## 7. Admin monitoring dashboard (super-admin)

Extend the super-admin area (`/clients` → add a **"Customers / Trials"** view) backed by new super-admin routes:
- **List**: each signup with store domain, owner email, signup date, source (Shopify/manual), **plan**, **status**, **trial days left**, and quick usage (contacts synced, WA + email sent, last active).
- **Filters**: status (trialing/active/expired), source, "ending soon (≤3d)", "activated vs never sent".
- **Detail**: per-tenant — connected store, sync status, usage vs caps, flows enabled, timeline of lifecycle events, and admin actions (**extend trial**, **upgrade/downgrade plan**, **suspend**, **impersonate/open** via the existing super-admin project access).
- **Funnel metrics**: installs → activated (first send) → converted; trial→paid rate; active trials; expiring this week.
- Data sources: `projects` (plan/status/trial), `whatsapp_usage` + `messages` (sends), `customers` count (contacts), `events` (lifecycle), last-active from events/sessions.

This directly answers "who signed up, what they're getting, how they're using it, are they converting."

## 8. Shopify-only enforcement

- Self-serve provisioning path only runs for the **Shopify OAuth** entry (`integrationType='shopify'`, `signup_source='shopify'`).
- The public email/password `/register` stays **closed** (`ALLOW_PUBLIC_REGISTRATION`) — Shopify OAuth is the only self-serve door.
- Non-Shopify (API-key / custom / IPS) remains **super-admin-provisioned** with `plan='custom'` (no trial clock, or a bespoke one) — these need manual integration work anyway, so they're off the self-serve funnel by design.

## 9. Abuse / integrity
- **One active trial per store** (unique on `shopifyDomain`) — reinstalling the same store resumes/doesn't restart the clock. Dedupe on domain + owner email.
- Rate-limit the provision endpoint; verify Shopify OAuth HMAC (already done).
- Caps are enforced server-side, so a trial can't exceed its sending budget even via API.

## 10. Build phases

- **Phase 1 — trial core (ship first):** migration (plan/status/trial fields) + stamp trial in the Shopify callback + `entitlementService` with the proposed map + enforce the 2–3 most important caps (WA sends, email sends, AI-chatbot off) + expose entitlements on `/me` + lock UI. _Merchants can now trial._
- **Phase 2 — admin monitoring:** super-admin Customers/Trials dashboard (list + detail + metrics) + lifecycle events + the daily reminder/expiry worker.
- **Phase 3 — conversion:** Shopify Billing API (or Stripe) upgrade flow, grace period, dunning emails, plan tiers.

## 11. Open decisions (need your call)
1. **Trial feature set + caps** — confirm/adjust the §5 table (what's in trial vs upgrade, and the numeric caps). This is the main product decision.
2. **Billing provider** — Shopify Billing API (native, recommended for the Shopify funnel) vs Stripe vs manual-for-now.
3. **Expiry behavior** — hard block sends immediately, or a grace period (how many days) before read-only/suspend.
4. **Trial length** — 14 days confirmed? (reminder cadence assumes day 7/12/14).
5. **App Store vs direct** — list on the Shopify App Store (review process, Billing API required) or a "Connect your Shopify store" button on a marketing site using the same OAuth.

---

### Pointers
- Provision: `routes/integrations.ts` (Shopify callback), `services/flowService.ts` (`instantiateDefaultFlows`).
- Tenancy: `middleware/membership.ts`, `routes/superAdmin.ts`, `app/(dashboard)/clients`.
- Enforce caps in: `services/deliveryService.ts` (sends), sync services (contacts).
- Entitlements surface: `routes/auth.ts` `/me` (pattern already used for capabilities).
- Related: `docs/WHATSAPP_CRM_VIRPANAI_SEND_PLAN.md` (the external-API story overlaps the entitlement/provisioning work).
