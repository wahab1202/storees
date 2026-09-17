# WhatsApp Onboarding — Ops Runbook

How the onboarding team provisions a **Storees-managed** WhatsApp number for a
brand. For brands who already have their own Meta or Pinnacle account, they
self-connect under Settings → Channels → WhatsApp (no ops needed).

Related: `META_WHATSAPP_BUILD_PLAN.md` (architecture).

## The model
Storees is the Meta **Tech Provider**. Brands' numbers live under **Storees'**
Meta infrastructure (our WABA + our token); Storees meters usage; the brand
rides on it. The app captures the request and records the result — a human
bridges the Meta-side steps in the middle.

## One-time setup (Storees business — do once)
1. Meta Business Manager + **Business Verification** approved.
2. A Meta **App** with the WhatsApp product → set its App ID as `META_APP_ID`
   (enables profile-photo upload).
3. A **WABA** under Storees' business with a **payment method / credit line**
   (Meta bills this).
4. A **System User** with a **permanent token** scoped to
   `whatsapp_business_management` + `whatsapp_business_messaging`, WABA assigned.
5. App **webhook** → `https://<host>/api/webhooks/channel/whatsapp`, verify token
   `WA_VERIFY_TOKEN`, subscribed to `messages` + `message_template_status_update`.
6. Add the onboarding team's admin emails to `STOREES_PLATFORM_ADMINS` (unlocks
   the cross-project provisioning queue at `/whatsapp-provisioning`).

## Per brand — when a request comes in
| # | Step | Where |
|---|---|---|
| 1 | Brand/you submit the intake form (fresh number + business details + logo) | App · Settings → Channels → WhatsApp → **Storees managed** |
| 2 | Add the phone number to Storees' WABA; set the display name (brand name) | Meta · WhatsApp Manager |
| 3 | **Verify the number** — enter the OTP Meta sends to it | Meta (interactive) |
| 4 | Copy the **`phone_number_id`** + **`waba_id`**; have the System User token | Meta |
| 5 | In the request's **"Onboarding team — register & link"** panel: paste the ids + token + a 6-digit PIN → **Register & set PIN** (calls the Cloud API for you) | App |
| 6 | Then **Link & go live** — validates, subscribes webhooks, imports templates, flips the request `active` | App |
| 7 | Set the brand's **logo + details** on the Business Profile panel | App |
| 8 | Meta reviews the **display name** — the profile panel shows **Name pending / approved**; full sending unlocks on approval | App shows status |

- Watch the whole pipeline across brands on the **queue** at `/whatsapp-provisioning`
  (platform-admin). "Open" jumps to a brand's project to work its request.
- Billing: Meta charges Storees' credit line **per conversation**; each brand's
  category counts (+ estimated spend if `WA_RATE_*` set) show on the WhatsApp
  **Usage** panel — invoice from there.

## Hard rules
- The number must be **fresh** — not currently active on the WhatsApp or WhatsApp
  Business app (delete it there first if it is).
- Only **APPROVED** templates send; a flow/campaign won't activate otherwise.
- Tokens are stored **encrypted**; never paste them anywhere else.
- `401/190` from Meta → the token is bad/expired; re-issue, don't retry.

## Env reference
`META_APP_ID` · `WA_VERIFY_TOKEN` · `STOREES_PLATFORM_ADMINS` ·
`WA_RATE_MARKETING` / `_UTILITY` / `_AUTHENTICATION` / `_SERVICE` ·
`WA_RATE_CURRENCY` · `ENCRYPTION_KEY` (encrypt tokens at rest).
