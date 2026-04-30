# Rule: Delivery Pipeline

## Applies To
All files that send messages: `deliveryService.ts`, `flowExecutor.ts`, `campaignService.ts`, any code calling Pinnacle.

## The Rule
Every outbound message must pass through the DeliveryService pre-send pipeline. Direct calls to Pinnacle, Resend, or any delivery API are FORBIDDEN outside of `deliveryService.ts`.

## Pre-Send Pipeline (executed in order, every send)
```
1. CONSENT CHECK
   → Query consent_records for (customer, channel, message_type)
   → If not consented → BLOCK. Log "consent_blocked". Return.
   → Cache consent in Redis (TTL 5 min): consent:<project>:<customer>:<channel>:<type>

2. FREQUENCY CAP CHECK
   → Count messages sent to this user in this channel in the last 24h / 7d
   → If exceeds project's frequency cap → BLOCK. Log "frequency_capped".
   → Default caps: 5/day/channel (promotional), unlimited (transactional)

3. QUIET HOURS CHECK
   → If current time is within user's quiet hours AND message is promotional
   → DELAY to next acceptable time. Log "quiet_hours_delayed".
   → Default quiet hours: 9 PM to 8 AM user local time (configurable per project)

4. RATE LIMIT CHECK
   → Check Pinnacle throughput limits (messages per second)
   → If at limit → QUEUE with backoff. NEVER drop.

5. SEND
   → Call deliveryService.send(command)
   → Returns messageId
   → Store in messages table with status "sent"

6. RECEIPT HANDLING (async)
   → Pinnacle calls back with delivery status updates
   → Update messages table: sent → delivered → read → clicked
   → Write as events (for BTS, NBA, campaign analytics)
```

## Forbidden Patterns
```typescript
// ❌ WRONG — direct API call bypassing DeliveryService
await resend.emails.send({ to: user.email, ... });

// ❌ WRONG — sending without consent check
await pinnacleApi.sendWhatsapp({ phone: user.phone, ... });

// ❌ WRONG — no attribution
await deliveryService.send({ userId, channel, templateId });
// Missing: flowTripId or campaignId for attribution

// ✅ CORRECT
await deliveryService.send({
  userId,
  channel: 'whatsapp',
  templateId: 'tmpl_123',
  variables: { name: user.firstName, product: 'Gold Loan' },
  messageType: 'promotional',
  flowTripId: trip.id,  // or campaignId for one-off campaigns
  projectId: project.id,
});
```

## Message Storage
Every send attempt MUST be recorded in a `messages` table:
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  channel TEXT NOT NULL,
  template_id TEXT,
  message_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT NOT NULL,
  flow_trip_id UUID,
  campaign_id UUID,
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  clicked_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```
This table powers: campaign analytics, BTS computation (open/click times), NBA learning (outcomes), and the Customer 360 campaign exposure history.
