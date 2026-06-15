# Durable short-link + click-tracking service — implementation plan

Decision: **per-project custom domains** (white-label). This doc scopes the full
build and flags the one hard dependency (TLS for arbitrary customer domains) that
gates the custom-domain layer.

> One-way door: a template's URL-button base is **baked at Meta approval**. So a
> project's link domain must be final before that project submits any URL-button
> template. Changing it later = re-submit + re-approve every template.

---

## Architecture (3 layers)

### 1. Link store (durable — replaces the in-memory `urlTracker` Map)
`tracked_links` table:
- `id` (uuid), `project_id`, `slug` (short, unique per domain), `original_url`
- `message_id` (nullable), `campaign_id` (nullable), `customer_id` (nullable)
- `click_count` (int), `first_clicked_at`, `last_clicked_at`, `created_at`
- index on `(domain_id, slug)` and `(project_id, campaign_id)`

`GET /c/:slug` (host-aware): resolve `(host → project, slug)` → log click
(`messages.clicked_at`/status + `${channel}_clicked` event + bump counters) → `302`
to `original_url`. Generalize the current SMS-only `sms_clicked` to the message channel.

### 2. Per-project domain management
`project_link_domains` table:
- `id`, `project_id`, `domain` (e.g. `links.acmebrand.com`), `is_default` (bool)
- `status`: `pending_dns` → `dns_verified` → `cert_active` (or `failed`)
- `verification_token`, `cname_target`, `verified_at`, `cert_status`, `created_at`

Settings UI: add domain → show CNAME instructions (`links.acme.com CNAME →
edge.storees.io`) → "Verify" polls DNS → once verified, trigger cert issuance →
show health. Mirrors the delivery-tracking health pattern we just built.

### 3. Template wiring (per-recipient attribution)
WhatsApp URL buttons support a **dynamic suffix** (`{{1}}`). Bake the button as
`https://<project-domain>/c/{{1}}` and pass a per-send slug as the URL variable.
That gives per-recipient click attribution without changing the approved template.
(Static buttons can bake a fixed slug.)

---

## ⚠ The gating dependency: TLS on customer domains
WhatsApp button URLs must be HTTPS. A wildcard cert can't cover arbitrary tenant
domains, so each custom domain needs its own cert, issued on demand. Options:

| Option | How | Tradeoff |
|---|---|---|
| **Cloudflare for SaaS** | Tenants CNAME to us; CF issues + serves certs per custom hostname | Least ops; small per-domain cost; depends on CF |
| **Caddy on-demand TLS** | Reverse proxy in front of the backend; Caddy ACME-issues per host on first hit | Self-hosted, free; must run/scale Caddy + an allow-list endpoint |
| **Platform subdomain only** | `<project-slug>.links.storees.io` under one wildcard cert | No per-domain TLS needed; not a true custom domain |

**This choice is infra, not app code, and it gates the custom-domain layer.**

---

## Recommended phasing (so the demo isn't blocked on DNS/TLS)
1. **Phase 1 — durable link service on a platform default** (`go.storees.io/c/<slug>`,
   one wildcard cert). Builds the `tracked_links` table, host-aware redirect, channel
   click events, and template URL-button wiring. **Click tracking works immediately**,
   and it's the carousel-engine prerequisite. ~M.
2. **Phase 2 — custom-domain layer**: `project_link_domains`, verification UI, and the
   chosen TLS mechanism. Tenants opt in; default keeps working. ~M–L + infra.

Phase 1 is fully in-app and unblocks both click tracking and carousels now. Phase 2
adds white-label once the TLS mechanism is chosen and provisioned.

---

## Open decisions before building
1. **TLS mechanism** for Phase 2 (Cloudflare for SaaS vs Caddy on-demand vs other).
2. **Default platform domain** for Phase 1 (e.g. `go.storees.io`) — needs one DNS record + cert.
3. Confirm phasing (build Phase 1 now, or wait and do both together).
