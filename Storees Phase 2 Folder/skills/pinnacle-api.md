# Skill: Pinnacle API

## When to Use
Invoke this skill when building or modifying the Pinnacle delivery integration, the DeliveryService, or any code that sends messages.

## Architecture
```
Flow Executor / Campaign Service
        ↓
   DeliveryService (packages/backend/src/services/deliveryService.ts)
        ↓ Pre-send pipeline: consent → frequency cap → quiet hours → rate limit
        ↓
   DeliveryWorker (BullMQ queue processor)
        ↓
   PinnacleProvider / ResendProvider (swappable backend)
        ↓
   Pinnacle API (production) / Resend API (dev/test)
        ↓
   Delivery Receipt Webhook → events table → campaign analytics → BTS → NBA
```

## DeliveryService Interface
```typescript
class DeliveryService {
  async send(command: SendCommand): Promise<SendResult> {
    // 1. Consent check (MANDATORY — see consent-enforcement rule)
    // 2. Frequency cap check
    // 3. Quiet hours check (delay if needed)
    // 4. Rate limit check (queue if at limit)
    // 5. Add to delivery queue (BullMQ)
  }

  async getStatus(messageId: string): Promise<DeliveryStatus> { }
  async cancelPending(userId: string, channel?: string): Promise<number> { }
}
```

## Provider Interface
```typescript
interface DeliveryProvider {
  name: 'pinnacle' | 'resend';
  send(command: SendCommand): Promise<ProviderResult>;
  getStatus(providerMessageId: string): Promise<DeliveryStatus>;
}
```

## Provider Selection
```typescript
const provider = process.env.DELIVERY_PROVIDER === 'pinnacle'
  ? new PinnacleProvider()
  : new ResendProvider();
```

## Message Tracking
Every message gets a `message_id` (UUID) in Storees. The provider returns a `provider_message_id`. Both are stored.

```typescript
interface MessageRecord {
  id: string;                     // Storees message ID
  providerMessageId: string;      // Pinnacle/Resend ID
  projectId: string;
  customerId: string;
  channel: string;
  messageType: string;
  templateId: string;
  status: DeliveryStatus;
  flowTripId?: string;
  campaignId?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  clickedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
}
```

## Delivery Receipt Processing
When Pinnacle sends a webhook with delivery status:

```typescript
// POST /api/webhooks/pinnacle-delivery
async function handlePinnacleWebhook(payload: PinnacleWebhook) {
  // 1. Find message by provider_message_id
  // 2. Update message status
  // 3. Write delivery event to events table:
  //    - "message_delivered", "message_read", "message_clicked", "message_bounced"
  // 4. These events feed into:
  //    - Campaign analytics (delivery/open/click/bounce rates)
  //    - BTS computation (click timestamps → per-user engagement histograms)
  //    - NBA learning (outcome for the selected action)
}
```

## Rate Limiting
- Pinnacle has throughput limits (messages per second)
- DeliveryWorker processes the BullMQ queue at a controlled rate
- If queue depth > 10,000: log warning, continue processing (never drop messages)
- Use BullMQ rate limiter: `{ max: 50, duration: 1000 }` (50 messages/second)

## Channel-Specific Considerations

### WhatsApp (via Pinnacle)
- Templates must be pre-approved by WhatsApp Business API
- Template variables use {{1}}, {{2}} format
- Storees stores templates with named variables ({{customer_name}})
- PinnacleProvider maps named → positional at send time
- 24-hour messaging window: after 24h of no reply, only template messages allowed

### SMS (via Pinnacle)
- DLT registration required for India (Pinnacle handles this)
- Template ID must be included in send request
- Sender ID configured per project in Pinnacle

### Email (via Pinnacle or Resend)
- Storees composes the HTML email body with variable interpolation
- Provider just sends the composed body
- Track opens via pixel, clicks via link wrapping (provider handles this)

### Push (via Pinnacle or FCM/APNs directly)
- FCM server key / APNs cert stored per project
- Storees composes the notification payload (title, body, image, deeplink)
- Provider handles platform-specific delivery

## Error Handling
```typescript
try {
  const result = await provider.send(command);
  if (result.status === 'failed') {
    // Retry logic: exponential backoff, max 3 retries
    // After 3 failures: mark as permanently failed, log reason
    // NEVER silently drop a message
  }
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    // Re-queue with delay
  } else if (error.code === 'INVALID_TEMPLATE') {
    // Don't retry — template problem, not transient
  } else {
    // Retry with backoff
  }
}
```
