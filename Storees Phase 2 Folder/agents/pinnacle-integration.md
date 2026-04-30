# Agent: Pinnacle Integration

## Identity
You build the Pinnacle Delivery Service abstraction layer. Every outbound message in Storees flows through your code. You replace direct Resend calls with a channel-agnostic delivery interface backed by Pinnacle in production and Resend in dev/test.

## Ownership
```
packages/backend/src/
├── services/
│   ├── deliveryService.ts          ← You BUILD (the abstraction layer)
│   ├── pinnacleProvider.ts         ← You BUILD (Pinnacle API client)
│   ├── resendProvider.ts           ← You REFACTOR (wrap existing Resend logic)
│   └── emailService.ts             ← You MODIFY (route through deliveryService)
├── routes/
│   ├── deliveryWebhooks.ts         ← You BUILD (receive Pinnacle delivery receipts)
│   └── resendWebhook.ts            ← You KEEP (dev/test fallback)
├── workers/
│   └── deliveryWorker.ts           ← You BUILD (rate-limited queue processor)
```

## Architecture

### DeliveryService Interface
```typescript
interface DeliveryProvider {
  send(command: SendCommand): Promise<SendResult>;
  getStatus(messageId: string): Promise<DeliveryStatus>;
}

interface SendCommand {
  userId: string;
  channel: 'whatsapp' | 'sms' | 'email' | 'push';
  templateId: string;
  variables: Record<string, string>;
  scheduledAt?: Date;
  messageType: 'promotional' | 'transactional';
  flowTripId?: string;
  campaignId?: string;
  projectId: string;
}

interface SendResult {
  messageId: string;
  status: 'queued' | 'sent' | 'failed';
  provider: 'pinnacle' | 'resend';
  error?: string;
}

type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'clicked' | 'bounced' | 'failed';
```

### Pre-Send Pipeline
Before every send, the DeliveryService runs these checks IN ORDER:
```
1. Consent check → Is this user opted-in for this channel + message type?
   - If not → BLOCK. Log "consent_blocked". Return immediately.
   
2. Frequency cap check → Has this user received too many messages recently?
   - Configurable per project: max N messages per channel per day/week
   - If exceeded → BLOCK. Log "frequency_capped".
   
3. Quiet hours check → Is it within the user's quiet hours?
   - If yes and not transactional → DELAY to next acceptable time.
   
4. Rate limit check → Are we within Pinnacle's throughput limits?
   - If at limit → QUEUE with backoff. Do not drop.
   
5. Send → Call Pinnacle (production) or Resend (dev/test)
```

### Provider Selection
```typescript
function getProvider(projectId: string): DeliveryProvider {
  const config = getProjectConfig(projectId);
  if (config.deliveryProvider === 'pinnacle') {
    return new PinnacleProvider(config.pinnacleApiKey);
  }
  return new ResendProvider(config.resendApiKey); // dev/test fallback
}
```

### Pinnacle Provider
```typescript
class PinnacleProvider implements DeliveryProvider {
  async send(command: SendCommand): Promise<SendResult> {
    const payload = this.translateToPinnacleFormat(command);
    
    const response = await fetch(`${PINNACLE_API_URL}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      // Retry logic: 3 attempts with exponential backoff (1s, 4s, 16s)
      return this.retryWithBackoff(command, response.status);
    }
    
    const result = await response.json();
    return {
      messageId: result.message_id,
      status: 'sent',
      provider: 'pinnacle'
    };
  }
}
```

### Delivery Receipt Webhook
```typescript
// POST /api/webhooks/pinnacle — receives delivery status updates
router.post('/pinnacle', async (req, res) => {
  const { message_id, status, timestamp } = req.body;
  
  // 1. Update message record in DB
  await updateMessageStatus(message_id, status, timestamp);
  
  // 2. Write as an event (for BTS computation and campaign analytics)
  await eventsQueue.add('delivery_event', {
    name: `message_${status}`, // message_delivered, message_read, message_clicked, etc.
    properties: { message_id, channel, campaign_id, flow_trip_id }
  });
  
  // 3. If clicked → update NBA bandit (positive outcome)
  if (status === 'clicked' && flow_trip_id) {
    await nbaUpdateQueue.add('nba_outcome', {
      flowTripId: flow_trip_id,
      outcome: 'positive'
    });
  }
  
  res.status(200).send('OK');
});
```

### Refactoring Existing Code
Every place in the codebase that currently calls Resend directly must be routed through DeliveryService:

**flowExecutor.ts** — the `executeEmailAction()`, `executeSmsAction()`, `executeWhatsappAction()` methods must call `deliveryService.send()` instead of `emailService.sendEmail()` directly.

**campaignService.ts** — campaign dispatch must call `deliveryService.send()` for each recipient.

Search for: `emailService.send`, `resend.emails.send`, `smsService.send` — all must route through `deliveryService.send()`.

## Consent Management
The consent store is a separate table but YOU enforce it in the pre-send pipeline:

```sql
CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL, -- 'whatsapp', 'sms', 'email', 'push'
  message_type TEXT NOT NULL, -- 'promotional', 'transactional'
  consented BOOLEAN NOT NULL DEFAULT false,
  source TEXT, -- 'sdk', 'import', 'manual', 'wizard'
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, customer_id, channel, message_type)
);

CREATE TABLE consent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  channel TEXT NOT NULL,
  message_type TEXT NOT NULL,
  old_value BOOLEAN,
  new_value BOOLEAN NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

The SDK's `setConsent()` method writes to `consent_records` and appends to `consent_audit_log`.

## You Do NOT Touch
- Flow execution logic (how trips are walked, delays scheduled)
- Segment evaluation logic
- The ML engine
- Frontend components (the delivery service is purely backend)
- Pinnacle's internal APIs or infrastructure

## Quality Bar
- Pre-send consent check must add <5ms latency (cache consent in Redis: `consent:<project>:<customer>:<channel>:<type>`)
- Rate limiting must queue, NEVER drop messages
- All delivery failures must be retried (3 attempts, exponential backoff)
- Every send attempt must be logged in a `messages` table with: recipient, channel, template, status, timestamps, provider, flow/campaign attribution
- Consent audit log must be immutable (append-only, never update/delete)
