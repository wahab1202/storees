# Integration Health / Onboarding Completeness — Plan

**Goal:** never again ship a project that *looks* connected but silently isn't.
A per-project "Integration Health" report that inspects real data + live probes
and flags missing/broken pieces with a fix hint — surfaced at the end of
onboarding and as a Settings tab. Every check below maps to a real failure we hit.

## Why (each check = a bug we actually lived)
| Failure we hit | The check that would have caught it |
|---|---|
| Token/data written to `api.storees.io` instead of the GWM deployment | **Right-instance**: data is flowing into *this* project's DB |
| Flow trigger `cart_created` but stream only had `cart_updated` | **Event-name alignment**: every flow/segment event actually occurs |
| WhatsApp delivery receipts never flowed (webhook unregistered) | **Webhook registered** per channel |
| FCM key malformed (`1E08010C`) / wrong projectId | **Channel creds valid** (live auth probe) |
| 0 customers had `fcm_token` | **Push token coverage** |
| "No reachable customers" (subscription / consent) | **Reachability coverage** per channel |
| Pushes blocked by frequency cap from failed tests | **Frequency caps sane** |
| Template not approved / wrong language | **≥1 approved template** per used channel |

## The report (per project)
`GET /api/projects/:id/health` → list of checks, each:
`{ id, category, status: pass|warn|fail, detail, fixHint }`.

### A. Ingestion (is data landing here?)
- `events_recent` — events in last 24–72h > 0. *fail* → connector not sending or wrong API base.
- `customers_present` — customer count > 0.
- `identity_quality` — % of customers with email/phone/external_id (resolution health).

### B. Event-name alignment
- `flow_trigger_events_exist` — for each **active** flow trigger event, that `event_name` has occurred ≥1×. *warn* with the missing name (the `cart_created` trap).
- `segment_rule_events_exist` — same for event-based segment rules.

### C. Channels configured + valid (only for channels actually used)
- `channel_configured` — `settings.channels.<ch>` present.
- `channel_creds_valid` — **live probe**: WhatsApp `getuserdetails` 200; FCM service-account auth succeeds + projectId resolvable; email provider key present.
- `whatsapp_webhook_registered` — `config.webhookRegisteredAt` set.
- `whatsapp_template_approved` — ≥1 APPROVED template in a language you send.

### D. Push readiness
- `fcm_auth_ok` — service account signs + token endpoint 200.
- `push_token_coverage` — count/% of customers with `custom_attributes.fcm_token`. *warn* if 0 (the miss).

### E. Reachability / consent (per used channel)
- `reachable_count` — customers passing the channel's reachability (email/phone/token/subscribed). *warn* if 0 while campaigns target it.

### F. Hygiene
- `frequency_caps_sane` — caps not 0/None and not absurdly low for the volume.
- `suppression_rate` — % suppressed/opted-out (informational).

## Severity → behaviour
- **fail** = integration broken (no data, bad creds). Block "Go live" / show red.
- **warn** = works but a gap (0 tokens, a flow targeting an unseen event). Amber, non-blocking.
- **pass** = green.

## Surface
1. **Onboarding final step** — "Integration Health" screen; criticals must pass before "Go live".
2. **Settings → Integration Health** tab — re-runnable anytime; same report. (Sits next to the
   WhatsApp "delivery tracking" health indicator we already added.)
3. Optional: a nightly job that re-runs and alerts on regression (e.g. events stopped flowing).

## Build phases
- **Phase 1 (read-only):** `GET /api/projects/:id/health` running the data checks (A, B, D-coverage,
  E, F) over existing tables + the health UI panel. Highest value, no external calls. ~M.
- **Phase 2 (live probes):** C — validate each configured provider's creds in real time
  (WhatsApp getuserdetails, FCM auth, etc.). ~M.
- **Phase 3 (gating + alerts):** make criticals block onboarding "Go live"; nightly regression
  alerts. ~S–M.

## Open decisions
1. Which checks are **blocking** vs advisory for "Go live".
2. Recency windows (24h vs 72h for `events_recent`).
3. Whether health is admin-only or visible to all roles.
