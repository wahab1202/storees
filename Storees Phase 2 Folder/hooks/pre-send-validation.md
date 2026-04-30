# Hook: Pre-Send Validation

## Trigger
Before every call to `deliveryService.send()` — this runs inside the DeliveryService itself.

## Checks (in order — first failure blocks the send)

### 1. Consent
```typescript
const consented = await consentService.check(
  command.projectId,
  command.userId,
  command.channel,
  command.messageType
);
if (!consented) {
  log('send_blocked', { reason: 'consent', userId: command.userId, channel: command.channel });
  return { status: 'blocked', reason: 'consent_not_granted' };
}
```
Transactional messages (OTPs, order confirmations) may bypass promotional consent but NEVER bypass explicit opt-out.

### 2. Frequency Cap
```typescript
const sentCount = await messageService.countRecentMessages(
  command.projectId,
  command.userId,
  command.channel,
  '24h'  // or '7d' depending on cap config
);
const cap = await projectConfig.getFrequencyCap(command.projectId, command.channel);
if (sentCount >= cap) {
  log('send_blocked', { reason: 'frequency_cap', sentCount, cap });
  return { status: 'blocked', reason: 'frequency_cap_exceeded' };
}
```

### 3. User Exists and Active
```typescript
const user = await customerService.getById(command.userId, command.projectId);
if (!user) {
  return { status: 'blocked', reason: 'user_not_found' };
}
// Don't send to users who haven't been seen in 180+ days (configurable)
if (daysSince(user.lastSeenAt) > config.maxInactivityDays) {
  log('send_blocked', { reason: 'user_inactive', lastSeen: user.lastSeenAt });
  return { status: 'blocked', reason: 'user_inactive' };
}
```

### 4. Channel Reachability
```typescript
// Verify the user has the required contact info for the channel
if (command.channel === 'email' && !user.email) {
  return { status: 'blocked', reason: 'no_email' };
}
if (command.channel === 'whatsapp' && !user.phone) {
  return { status: 'blocked', reason: 'no_phone' };
}
if (command.channel === 'sms' && !user.phone) {
  return { status: 'blocked', reason: 'no_phone' };
}
// Push requires device token (stored in user properties)
if (command.channel === 'push' && !user.properties?.push_token) {
  return { status: 'blocked', reason: 'no_push_token' };
}
```

### 5. PII Tokenisation (if enabled)
```typescript
const piiConfig = await piiService.getConfig(command.projectId);
if (piiConfig.enabled) {
  command.variables = await piiService.tokeniseVariables(command.variables, piiConfig);
  command.resolverUrl = piiConfig.resolverUrl;
}
```

## Logging
Every send attempt (success or blocked) is logged in the `messages` table with the block reason if applicable. This creates the audit trail needed for compliance.
