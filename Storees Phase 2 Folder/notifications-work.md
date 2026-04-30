# Storees — Notifications System

Complete inventory of all notification-related work built across the Storees platform.

---

## Architecture Overview

```
Event (Shopify webhook / SDK / manual)
  → Trigger Evaluation (flow or campaign)
    → Delivery Pipeline
      → Consent Check (opt-in/out)
      → Frequency Cap (5/day promotional)
      → Reachability Check (has email/phone/token?)
      → Provider Selection (per-project config)
        → Send via Provider (Resend, Twilio, FCM, Meta, etc.)
          → Webhook Receipt (delivery/open/click/bounce)
            → Event Creation (activity timeline)
              → UI Display (MessagesTab, campaign analytics)
```

---

## 1. Core Delivery Pipeline

### Pre-Send Pipeline — `packages/backend/src/services/deliveryService.ts`

Orchestrates every outbound message through a series of checks before queueing:

| Step | Function | Description |
|------|----------|-------------|
| 1 | `checkConsent()` | Verifies opt-in status per channel (Redis-cached, 5min TTL) |
| 2 | `checkFrequencyCap()` | Enforces 5 messages/day limit for promotional messages |
| 3 | `checkReachability()` | Validates customer has contact info for the channel |
| 4 | `recordMessage()` | Creates message record with status `queued` |
| 5 | BullMQ queue | Enqueues for async delivery |

**`executeSend()`** — Actually delivers via the configured provider.
**`handleReceipt()`** — Updates message status from provider webhooks.

**Supported channels:** `email`, `sms`, `push`, `whatsapp`, `inapp`
**Message types:** `promotional`, `transactional`
**Status flow:** `queued → sent → delivered → read/clicked → failed`

---

## 2. Channel Providers

### Provider Registry — `packages/backend/src/services/channelProviderRegistry.ts`

Dynamic provider selection per project. Checks `projects.settings.channels` JSONB config first, falls back to environment variables. Results cached for 5 minutes per project.

### Email — Resend

| File | Purpose |
|------|---------|
| `services/emailService.ts` | Legacy direct email sending + template interpolation (`{{variable}}` syntax) |
| `services/resendProvider.ts` | Provider implementation for delivery pipeline |

**Config:** `RESEND_API_KEY`, `FROM_EMAIL` (default: `Storees <noreply@storees.app>`)

### SMS

| Provider | File | Config Vars |
|----------|------|-------------|
| Twilio | `services/providers/twilioProvider.ts` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Vonage | `services/providers/vonageProvider.ts` | `VONAGE_API_KEY`, `VONAGE_API_SECRET` |
| Messagebird | `services/providers/birdProvider.ts` | `BIRD_API_KEY` |

### WhatsApp

| Provider | File | Config Vars |
|----------|------|-------------|
| Meta | `services/providers/metaWhatsappProvider.ts` | `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_VERIFY_TOKEN` |
| Gupshup | `services/providers/gupshupProvider.ts` | `GUPSHUP_API_KEY` |

### Push — Firebase Cloud Messaging

| File | Details |
|------|---------|
| `services/providers/fcmProvider.ts` | JWT-based OAuth2 auth, 50min token cache, supports Android + APNS + FCM-native, rich notifications with images |

**Config:** `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_KEY`
**Device token:** Stored in `customer.customAttributes.fcm_token`

---

## 3. Webhook Handlers & Delivery Tracking

### Resend Email Webhooks — `packages/backend/src/routes/resendWebhook.ts`

| Resend Event | Updates |
|--------------|---------|
| `email.delivered` | `delivered_at`, `delivered_count` |
| `email.opened` | `opened_at`, `opened_count` |
| `email.clicked` | `clicked_at`, `clicked_count` |
| `email.bounced` | `bounced_at`, `bounced_count` |
| `email.complained` | `complained_at`, `complained_count` |

Updates three tables: `campaign_sends`, `messages`, and `events` (activity timeline).
Uses Resend message ID for idempotency.

### Multi-Channel Webhooks — `packages/backend/src/routes/channelWebhooks.ts`

| Endpoint | Provider |
|----------|----------|
| `POST /webhooks/twilio` | Twilio SMS status |
| `POST /webhooks/gupshup` | Gupshup WhatsApp status |
| `POST /webhooks/bird` | Messagebird SMS status |
| `POST /webhooks/vonage` | Vonage SMS status |
| `GET/POST /webhooks/whatsapp` | Meta WhatsApp verification + status |

All handlers update message status idempotently and create tracking events.

---

## 4. Consent Management

### Service — `packages/backend/src/services/consentService.ts`

GDPR-compliant opt-in/opt-out management with immutable audit logging.

| Function | Description |
|----------|-------------|
| `updateConsent()` | Updates subscription flag + appends audit log entry |
| `getConsentStatus()` | Returns current consent across all channels |
| `getConsentAuditLog()` | Immutable audit trail (most recent first) |
| `bulkUpdateConsent()` | Batch update multiple channels |

**Channels:** `email`, `sms`, `push`, `whatsapp`

### API — `packages/backend/src/routes/consent.ts`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/consent/:customerId` | Current consent status |
| GET | `/api/consent/:customerId/audit` | Audit trail |
| POST | `/api/consent/:customerId` | Single channel update |
| POST | `/api/consent/:customerId/bulk` | Bulk update |

---

## 5. Campaign System

### Service — `packages/backend/src/services/campaignService.ts`

| Function | Description |
|----------|-------------|
| `getCampaignRecipients()` | Fetch segment members with contact info |
| `dispatchCampaign()` | Create per-recipient `campaign_sends` with A/B variant assignment |
| `processCampaign()` | Route to correct channel provider |

**A/B Testing:** Random split by percentage, variant A (control) vs B, tracking at send-level, winner selection by metric.

### API — `packages/backend/src/routes/campaigns.ts`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List campaigns |
| GET | `/api/campaigns/:id` | Campaign detail |
| POST | `/api/campaigns` | Create campaign |
| PATCH | `/api/campaigns/:id` | Update campaign |
| POST | `/api/campaigns/:id/send` | Dispatch campaign |
| GET | `/api/campaigns/:id/analytics` | Performance metrics |
| POST | `/api/campaigns/:id/ab-winner` | Select A/B winner |

---

## 6. Flow Automation Notifications

### Executor — `packages/backend/src/services/flowExecutor.ts`

State machine for flow trip execution. Action nodes support: `send_email`, `send_sms`, `send_push`, `send_whatsapp`.

**Features:**
- Delay scheduling with `DEMO_DELAY_MINUTES` override
- Condition branching
- Template interpolation with dynamic data
- Trip status: `active → waiting → completed/exited`

### Pre-Built Templates — `packages/flows/src/templates.ts`

| Template | Trigger | Channels | Use Case |
|----------|---------|----------|----------|
| Abandoned Cart Recovery | `cart_created` | email | 30min delay, exit on `order_placed` |
| Reorder Reminder | custom | email → email → whatsapp | Multi-step escalation with discount |
| EMI Overdue Reminder | `emi_overdue` | email → sms | 1hr then 24hr delays |
| KYC Re-Verification | `kyc_expired` | email → push | 2hr then 3-day delays |
| Dormant Account Reactivation | `transaction_completed` | email → push | >60 days inactive filter |
| Trial Expiry Nudge | `trial_expiring` | email → email | 2-day delay between sends |

---

## 7. Database Schema

### Key Tables — `packages/backend/src/db/schema.ts`

#### `messages`
Unified message delivery tracking for all channels.

| Column | Type | Description |
|--------|------|-------------|
| `status` | enum | queued, sent, delivered, read, clicked, failed, blocked |
| `channel` | enum | email, sms, push, whatsapp, inapp |
| `messageType` | enum | promotional, transactional |
| `blockReason` | text | consent_blocked, frequency_capped, user_inactive, no_channel_reachability |
| `provider` | text | pinnacle, resend |
| `providerMessageId` | text | Provider's message ID |
| `sentAt`, `deliveredAt`, `readAt`, `clickedAt`, `failedAt` | timestamp | Lifecycle timestamps |
| `flowTripId`, `campaignId` | uuid | Source tracking |

#### `campaign_sends`
Per-recipient campaign tracking with A/B variant assignment.

| Column | Type | Description |
|--------|------|-------------|
| `status` | enum | pending, sent, delivered, failed, bounced |
| `variant` | text | A or B |
| `resendMessageId` | text | Linked to Resend webhooks |
| Timestamps | various | sentAt, deliveredAt, openedAt, clickedAt, bouncedAt, complainedAt |

#### `campaigns`
Campaign configuration and aggregate analytics.

| Column | Type | Description |
|--------|------|-------------|
| `channel` | enum | email, sms, push |
| `contentType` | enum | promotional, transactional |
| `status` | enum | draft, scheduled, sending, sent, paused |
| A/B fields | various | abTestEnabled, abSplitPct, abVariantB*, abWinner, abWinnerMetric |
| Metric counts | integer | sent, delivered, opened, clicked, bounced, complained, converted |

#### `consents`
Granular channel + purpose-level consent.

| Column | Type | Description |
|--------|------|-------------|
| `channel` | enum | email, sms, push, whatsapp |
| `purpose` | enum | transactional, promotional |
| `status` | enum | opted_in, opted_out |
| `source` | text | app, web, api, sms |

#### `consent_audit_log`
Immutable append-only consent changes for compliance.

| Column | Type | Description |
|--------|------|-------------|
| `action` | enum | opt_in, opt_out |
| `source` | text | sdk, api, admin, webhook |
| `consentText` | text | Full text shown to user |
| `ipAddress` | text | User's IP |

#### `email_templates`
Reusable notification templates across channels.

| Column | Type | Description |
|--------|------|-------------|
| `channel` | enum | email, sms, push, whatsapp |
| `subject` | text | Email subject line |
| `htmlBody` | text | Email HTML content |
| `bodyText` | text | SMS/push/whatsapp plain text |

#### Customer subscription fields on `customers` table
- `emailSubscribed`, `smsSubscribed`, `pushSubscribed`, `whatsappSubscribed` (boolean)
- `customAttributes.fcm_token` (JSONB) for push notifications

---

## 8. Shared Types — `packages/shared/src/types.ts`

```typescript
type MessageChannel = 'email' | 'sms' | 'push' | 'whatsapp' | 'inapp'

type SendCommand = {
  userId: string
  channel: MessageChannel
  templateId: string
  variables: Record<string, string>
  scheduledAt?: Date
  messageType: 'promotional' | 'transactional'
  flowTripId?: string
  campaignId?: string
  projectId: string
}

type Message = {
  id: string
  projectId: string
  customerId: string
  channel: MessageChannel
  messageType: 'promotional' | 'transactional'
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'clicked' | 'failed' | 'blocked'
  blockReason: string | null
  provider: 'pinnacle' | 'resend' | null
  providerMessageId: string | null
  // ... timestamps
}
```

---

## 9. Frontend UI

### Toast Notifications (Sonner)

Configured in `packages/frontend/src/app/layout.tsx` with `<Toaster position="bottom-right" richColors />`.

Used across 7+ pages: settings, templates, onboarding, analytics.

### Message History — `packages/frontend/src/components/customers/MessagesTab.tsx`

Displays all messages sent to a customer with:
- Channel icons (Mail, MessageSquare, Bell, Smartphone)
- Source attribution (campaign name or flow name)
- Type badge (promotional/transactional)
- Color-coded status: gray (queued), blue (sent), green (delivered), emerald (read), purple (clicked), red (failed), yellow (blocked)
- Lifecycle timestamps

---

## 10. Background Jobs (BullMQ)

| Queue | Job | Purpose |
|-------|-----|---------|
| `deliveryQueue` | `send` | Execute message delivery via provider |
| `campaignQueue` | `send-campaign` | Batch campaign message creation and dispatch |
| `flowActionsQueue` | `advance-trip` | Scheduled flow progression (delays, wait-until) |
| `syncWorker` | various | Shopify sync, segment re-evaluation |

---

## 11. Key Design Patterns

1. **Pipeline architecture** — Consent → Frequency → Reachability → Queue → Send
2. **Pluggable providers** — Per-project channel config with env var fallback
3. **Idempotent webhooks** — Provider message IDs prevent duplicate processing
4. **Immutable audit logging** — Consent changes append-only for compliance
5. **Event-driven** — Shopify webhooks → events → trigger flows/campaigns
6. **State machine** — Flow trips: `active → waiting → completed/exited`
7. **Template interpolation** — `{{variable}}` replacement across all channels
8. **Demo mode** — `DEMO_DELAY_MINUTES` overrides all flow delays for testing
