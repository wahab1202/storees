# Rule: Consent Enforcement

## Applies To
All code paths that send messages: `deliveryService.ts`, `flowExecutor.ts`, `campaignService.ts`, any worker that calls the Pinnacle API.

## The Rule
NO message is ever sent without a valid consent check. This is not a feature flag — it is a hard gate.

## Consent Model
```typescript
interface ConsentRecord {
  customerId: string;
  projectId: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'push' | 'inapp';
  messageType: 'promotional' | 'transactional';
  consented: boolean;
  source: 'sdk' | 'api' | 'import' | 'manual';
  updatedAt: Date;
  previousValue?: boolean;
}
```

## Rules

### Before Every Send
```typescript
// This check is MANDATORY. It lives in deliveryService.ts and cannot be bypassed.
const consent = await consentService.check(customerId, channel, messageType);
if (!consent.consented) {
  await logConsentBlock(customerId, channel, messageType, flowTripId);
  return { status: 'blocked', reason: 'consent_not_granted' };
}
```

### Opt-out is Immediate
When a user calls `setConsent({whatsapp: false})`:
1. Backend writes to consent_records table immediately
2. Redis consent cache is invalidated immediately
3. Any PENDING messages in the delivery queue for that user + channel are cancelled
4. Any ACTIVE flow trips that would send on that channel skip the send node
5. This is not batched, not delayed, not queued. It is synchronous.

### Transactional vs Promotional
- Transactional messages (OTPs, payment confirmations, order updates) have SEPARATE consent from promotional
- A user can opt out of WhatsApp promotional but still receive WhatsApp transactional
- Default: transactional consent = true unless explicitly revoked. Promotional consent = true only if explicitly granted.

### Audit Trail
Every consent change is logged:
```typescript
interface ConsentAuditEntry {
  customerId: string;
  channel: string;
  messageType: string;
  oldValue: boolean;
  newValue: boolean;
  source: string;      // 'sdk', 'api', 'import', 'manual'
  timestamp: Date;
  ip?: string;
  userAgent?: string;
}
```
This table is append-only. Never delete consent audit records. RBI compliance requires this for regulated clients.

### For Regulated Clients (NBFCs)
- Consent records must include the exact text the user agreed to (consent_text field)
- Timestamp must be stored in IST with timezone info
- Export endpoint: `GET /api/consent/export?customerId=X` returns full audit trail as CSV
