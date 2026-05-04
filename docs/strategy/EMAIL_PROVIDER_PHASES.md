# Email Provider Strategy — Phased ESP Migration

> Storees positions itself as the *deliverability platform* — the layer that
> makes multi-tenant marketing email actually safe. The provider underneath
> is a swappable detail; the suppression list, per-tenant rate budgets,
> domain verification UX, and bounce-rate dashboards are the moat.
>
> This document plans the ESP migration through three phases tied to client
> count and aggregate volume. Trigger thresholds matter more than dates —
> migrate when the math says, not when the calendar does.

## Phase boundaries (trigger thresholds)

| Phase | Client count | Volume / mo | Provider mix | Status |
|---|---|---|---|---|
| **1 — Resend-only** | 1-5 | < 500K | Resend (everything) | **Now** |
| **2 — Hybrid** | 5-15 | 500K - 3M | SES (marketing) + Resend or Postmark (transactional) | Plan |
| **3 — Dedicated** | 15+, OR any 1 client > 1M/mo | 3M+ | SES with dedicated IP pools per high-volume client | Plan |

---

## Phase 1 — Resend-only (now through ~5 clients)

**Why stay:** the engineering time to migrate (~2 weeks of focused work) is
not worth the ~$200-300/mo savings at this scale. Use this phase to learn
what bounces and complaints look like in your actual client mix — that
intelligence shapes Phase 2 architecture.

**What's already shipped (commits `d3b0615` → `15de0c1`):**

- ✅ Per-tenant Resend sending domain (`Settings → Project → Email`)
- ✅ Suppression list (`email_suppressions` table)
- ✅ Consent gate in dispatcher (excludes opted-out + suppressed)
- ✅ List-Unsubscribe header + one-click unsubscribe endpoint
- ✅ Resend svix HMAC + idempotency
- ✅ Per-tenant rate budget (`projects.email_rate_per_minute`)

### Phase 1 prep work — DO NOW to make Phase 2 cheap

These are small (~1 day total) and the alternative is doing a big refactor
later instead of a small refactor now:

#### P1.1 — Provider abstraction (high value, ~3 hours)

Right now [resendProvider.ts](../../packages/backend/src/services/resendProvider.ts)
is hardcoded as the only email path. The codebase already has a
`channelProviderRegistry` pattern for SMS/WhatsApp/push providers
([channelProviderRegistry.ts](../../packages/backend/src/services/channelProviderRegistry.ts)) —
**email is the outlier**.

**Change:** define an `EmailProvider` interface, register Resend
implementation behind it, route through the registry. Phase 2 is then "add
SES implementation" with no other code changes; Phase 1 with no SES is
unchanged.

```ts
// packages/backend/src/services/providers/types.ts
export type EmailProvider = {
  name: 'resend' | 'ses' | 'postmark'
  send(command: SendCommand, fromInfo: FromInfo): Promise<SendResult>
  registerDomain(projectId: string, domain: string): Promise<DomainRegistrationResult>
  checkDomainStatus(domainId: string): Promise<DomainStatusResult>
}
```

#### P1.2 — Per-purpose provider routing schema (~30 min)

Add columns now so Phase 2's switch-flip doesn't need a migration:

```sql
-- 0017_email_provider_routing.sql (write but don't apply yet — the column
-- existing with a default of 'resend' is harmless until we read it)
ALTER TABLE projects
  ADD COLUMN email_marketing_provider VARCHAR(20) NOT NULL DEFAULT 'resend',
  ADD COLUMN email_transactional_provider VARCHAR(20) NOT NULL DEFAULT 'resend';
```

Phase 2 reads these columns to decide whether to invoke `sesProvider` or
`resendProvider` per send.

#### P1.3 — Provider-agnostic domain table (~1 hour)

[emailDomainService.ts](../../packages/backend/src/services/emailDomainService.ts)
currently writes to `projects.resend_domain_id` directly. Phase 2 needs the
same table to also store an SES domain identity ARN.

**Change:** rename `resend_domain_id` → `email_domain_provider_id` plus a
new `email_domain_provider` column. Existing data backfilled with
`provider='resend'`. The `emailDomainService` API stays the same; only the
column it writes to changes.

#### P1.4 — Suppression-list export/sync hooks (~1 hour)

The `email_suppressions` table is already provider-agnostic. Phase 2 needs
to **mirror** suppressions to SES's account-level suppression list (SES
doesn't have a per-tenant scope, so we treat ours as truth and push to
SES). Add an internal job pattern now:

```ts
// packages/backend/src/services/suppressionSync.ts
export async function pushSuppressionToProvider(
  projectId: string,
  email: string,
  reason: SuppressionReason,
): Promise<void> {
  // Phase 1: no-op (Resend has no per-account suppression API we use)
  // Phase 2: push to SES via SES.PutSuppressedDestination
}
```

The Resend webhook handler calls this stub on every suppression event;
Phase 2 just fills it in.

### Phase 1 deliverable

Three commits, ~half a day total:
1. `feat(backend): EmailProvider abstraction (P1.1)` — interface + Resend impl behind registry
2. `feat(backend): per-purpose email provider routing schema (P1.2 + P1.3)` — migration only, columns default to 'resend'
3. `chore(backend): suppression sync stub (P1.4)`

Don't change runtime behavior. The point is: when you flip the switch in
Phase 2, only the provider implementations need new code.

---

## Phase 2 — Hybrid (SES marketing + Resend/Postmark transactional)

**Trigger:** any of:
- 5+ paying clients
- Aggregate volume > 500K/mo
- A single client moves to weekly campaign cadence on a >50K list

**Why now:** at 2M/mo aggregate, SES at $0.10/1K = $200/mo vs Resend at
roughly $1,500-1,800/mo (their tier breaks at $20/50K then $1/1K). That's
~$1,200-1,400/mo into the margin column. With 10 clients, that's roughly
$120-140 per client per month back to gross margin — a junior eng paid for
by the migration alone.

**Why split marketing from transactional:** Postmark's deliverability for
single-trigger messages (OTPs, password resets, receipts) is best-in-class
because their entire infrastructure is tuned for it. SES is great for
bulk; using it for OTPs sometimes lands in spam (longer routing, no
priority lane). The split protects the *user-facing* email path (where
users explicitly expect the message) while saving on the marketing path
(where ESP economics dominate).

### Phase 2 work — ~2 weeks of focused engineering

Group of work | Estimate | Notes
---|---|---
**1. SES provider implementation** | 3 days | `sesProvider.ts` implementing the `EmailProvider` interface from P1.1. AWS SDK v3 (`@aws-sdk/client-sesv2`). SES v2 API has better DKIM + suppression handling than v1. Implements `send`, `registerDomain` (creates email identity + DKIM tokens), `checkDomainStatus`.
**2. SNS bounce/complaint webhook** | 2 days | SES doesn't post webhooks directly — it goes via SNS. Set up an SNS topic per region, subscribe an HTTPS endpoint. Webhook handler verifies the SNS signature (different from svix), extracts bounce + complaint events, funnels into the same suppression pipeline as Resend.
**3. Admin suppression dashboard** | 4 days | This is the big UX win. SES has no UI for suppressions; ours does. Per-project dashboard shows: active suppressions (filter by reason), bounce rate over time (the metric that triggers SES throttling), complaint rate over time (must stay <0.3% for SES not to suspend the account), domain reputation. Manual remove-from-suppression button (admin only, audit-logged).
**4. Provider routing logic** | 1 day | Read `projects.email_marketing_provider` + `email_transactional_provider`. Route `command.messageType === 'transactional'` to the transactional provider, else to marketing. Default to Resend for backwards compat.
**5. Domain identity migration** | 2 days | For projects already on Resend, the SES SDK call generates a *new* set of DKIM CNAMEs. Tenant adds those alongside existing Resend records (SES uses different selectors so they coexist). UI updated to show both providers' DNS records when transitioning a project. Once SES is verified, project's `email_marketing_provider` flips to `'ses'`.
**6. Warming + monitoring** | 1 week (passive) | New SES accounts start with 200/day cap, 1/sec rate. AWS auto-raises after a few days of clean traffic. Cron job hits SES `GetAccount` daily, surfaces current sending limits + reputation in the admin dashboard. Alert if bounce rate >5% or complaint rate >0.1%.

### Phase 2 architectural changes

```
┌────────────────────┐
│   campaignService  │
│  (segments, opts)  │
└─────────┬──────────┘
          │ enqueues per-recipient send
          ▼
┌────────────────────────────────────┐
│        deliveryWorker              │
│   • acquireEmailSlot (per tenant)  │
│   • check suppression list         │
│   • check consents                 │
│   • route by messageType + project │
│       config                       │
└─────────┬──────────────────────────┘
          │
   ┌──────┴──────────┐
   │                 │
   ▼                 ▼
┌──────────┐    ┌──────────┐
│ sesProv  │    │ resendProv│
│(marketing)│   │ or postmark│
│           │   │ (txnl)    │
└─────┬────┘    └─────┬─────┘
      │ DKIM         │ DKIM
      ▼               ▼
   tenant         tenant
   domain         domain
      │               │
      └──┐         ┌──┘
         ▼         ▼
    ┌──────────────────┐
    │  recipient inbox │
    └──────────────────┘
                 │
   bounce/complaint webhooks
                 │
                 ▼
        ┌──────────────────┐
        │   single shared  │
        │ suppression pipe │
        │ (per-project)    │
        └──────────────────┘
```

### Phase 2 deliverables

- `feat(backend): SES email provider implementation`
- `feat(backend): SES SNS bounce/complaint webhook handler`
- `feat(backend,frontend): admin suppression dashboard`
- `feat(backend,frontend): SES domain identity verification UI`
- `feat(backend): provider routing for marketing vs transactional`
- `chore(ops): SES warming runbook + reputation monitoring cron`

---

## Phase 3 — Dedicated IPs + per-client deliverability tier

**Trigger:** any of:
- 15+ paying clients
- Any single client crosses 1M sends/mo
- An NBFC / regulated client signs and asks for dedicated infra (this is
  the more likely real trigger — compliance, not volume)

**Why this is the moat:** MoEngage and CleverTap don't sell dedicated IPs
to mid-market clients — they bundle it into their enterprise tier at
6-figure ACVs. If Storees offers per-client dedicated IPs at the $24.95/mo
hard cost (passed through with margin) plus the suppression dashboard from
Phase 2, you've out-positioned the incumbents on the one thing that
matters to financially-regulated clients: deliverability + auditability.

### Phase 3 work — ~1 week of engineering + ongoing ops

Group of work | Estimate | Notes
---|---|---
**1. SES dedicated IP pool management** | 3 days | AWS API for IP pool create/delete, attach project to pool. Schema: `ip_pools` table (id, project_id, aws_pool_name, created_at, warmed_at) + `projects.ip_pool_id` FK. The send path attaches the pool name in the `ConfigurationSetName` parameter.
**2. Warming schedule per pool** | 2 days | Cron job ramps the per-pool send count over 30 days following AWS's recommended curve (50/day → 100 → 500 → 1K → 2.5K → 5K → 10K → ...). Stored as `ip_pool_warming_schedule` table; the rate limiter in E3.1 reads from here in addition to the project budget.
**3. Per-client deliverability dashboard** | 2 days | Reuse the suppression dashboard from Phase 2; add IP-pool-scoped reputation metrics, sender-score lookup (free public API), open/click rate trends per domain.
**4. Compliance / audit trail** | 1 day | NBFC clients want export of: who sent what, when, to which recipients, what consent state, what suppression actions, who in the org clicked send. Most of this exists in `events` + `messages` already; add a per-project audit-export endpoint that streams a signed CSV.

### Pricing for clients

- Shared SES pool: included in plan
- Dedicated IP: $24.95/mo direct cost from AWS, charge the client $50-75/mo
  (typical 2-3x markup is industry standard; NBFCs accept this readily for
  the audit story)
- Suppression dashboard, bounce-rate alerts, sender-score monitoring:
  bundled into all tiers (these are the *Storees product*, not the AWS cost)

---

## Open architectural questions for Phase 2/3

To resolve before Phase 2 kicks off, not now:

1. **AWS region selection.** SES SLAs and pricing vary by region. Probably
   `us-east-1` for default, but Indian fintech clients may want
   `ap-south-1` (Mumbai) for data residency. Schema: `projects.aws_region`?
2. **Multi-region failover.** If `us-east-1` SES has an incident,
   automatically failover to `eu-west-1`? Adds cost but is a real selling
   point for high-volume clients.
3. **Postmark vs Resend for transactional.** Resend is cheaper but
   Postmark's reputation for OTPs is meaningfully better. Worth a
   side-by-side test in Phase 1 with a single transactional template before
   committing.
4. **Volume-based plan tiers.** When do clients move from "shared SES" to
   "dedicated IP" automatically vs by request? Shared SES has a soft
   ceiling around 10K/mo per client before reputation suffers; that may be
   the auto-upgrade trigger.

---

## Trigger checklist (when to act)

Watch these metrics weekly. Any one crossing → start the next phase.

- [ ] Aggregate Storees email volume / mo > 500K → **start Phase 2 work**
- [ ] Any single client volume / mo > 200K → **start Phase 2 work**
- [ ] 5th paying client signs → **start Phase 2 work**
- [ ] First NBFC / regulated-industry client signs LOI → **start Phase 3 work** (parallel with Phase 2)
- [ ] Any single client volume / mo > 1M → **start Phase 3 work** (urgency)
- [ ] Resend bill / mo crosses $1,000 → **start Phase 2 work** (the math justifies it)

## Cost model snapshot

| Volume / mo | Resend | SES + Postmark (txnl 5%) | Storees savings |
|---|---|---|---|
| 100K | $80 | $20 (SES) + $15 (PM) = $35 | $45 |
| 500K | $440 | $50 (SES) + $35 (PM) = $85 | $355 |
| 2M | $1,640 | $200 (SES) + $50 (PM) = $250 | **$1,390** |
| 10M | ~$8,000 | $1,000 (SES) + $100 (PM) = $1,100 | **$6,900** |

(Resend numbers based on $20/50K then $1/1K then $0.80/1K above 100K. SES
based on $0.10/1K. Postmark assuming 5% transactional split at their
$15/10K rate.)

The savings curve is nonlinear — staying on Resend past 1M/mo is
expensive. Phase 2 trigger should fire well before that.
