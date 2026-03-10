# Testing — Integration Checkpoints & Risk Mitigation

## Daily Integration Checkpoints

| Day | Checkpoint | Success Criteria | Fallback |
|-----|-----------|-----------------|----------|
| **1** | Monorepo compiles, DB runs, OAuth redirect works | Click "Connect Shopify" → redirected to Shopify | Check Railway Postgres connection. Verify Shopify API credentials. |
| **2** | Agent 1 + 2 merged. Customer list shows real data. | Open /customers → see real names and emails from Shopify store | Check API contract types match. Verify historical sync completed. |
| **3** | Agent 3 merged. Segments functional. | Create "Champion Customers" from template → matching customers listed | Verify filter evaluation SQL. Check segment member count matches manual count. |
| **4** | Agent 4 merged. Events flowing through queue. | Shopify webhook → event in DB → BullMQ job created | Check webhook HMAC verification. Verify BullMQ Redis connection. Check event processor logs. |
| **5** | Full pipeline working. | Cart on Shopify → trip starts → delay scheduled → job pending | Run complete E2E manually. Check BullMQ dashboard for job status. |
| **6** | Demo rehearsal passes. | Full 30-minute demo script runs without errors | Log all bugs. Prioritize P0 fixes only. Defer P1/P2 cosmetic issues. |
| **7** | Production deployment verified. | Same demo works on production URLs with production Shopify store | Deploy Day 6 evening. Day 7 is testing only. Have localhost as backup. |

## E2E Test Scenarios

### Scenario 1: Shopify Connection
```
1. Navigate to /integrations
2. Click "Connect Shopify"
3. Complete OAuth on Shopify dev store
4. Verify: projects table has access token
5. Verify: webhooks registered on Shopify (check Shopify admin → Settings → Notifications)
6. Verify: historical sync starts (sync_status updates)
7. Verify: customers appear in /customers page
```

### Scenario 2: Customer Profile
```
1. Navigate to /customers
2. Search for a specific customer by name
3. Click to expand customer row
4. Verify: Details tab shows name, email, phone, subscription badges
5. Verify: Orders tab shows real orders with line items
6. Verify: Activity tab shows events (historical_sync events from import)
```

### Scenario 3: Segment Creation
```
1. Navigate to /segments
2. Click "Create Segment"
3. Click "Champion Customers" template
4. Verify: segment created with correct filters
5. Verify: member count > 0
6. Click into segment → verify member list shows real customers
7. Create from scratch: total_spent > 5000 AND days_since_last_order < 30
8. Verify: preview count updates as filters change
9. Save → verify segment appears in list
```

### Scenario 4: Abandoned Cart Flow (THE DEMO)
```
1. Navigate to /flows
2. Create from "Abandoned Cart" template
3. Review trigger config: cart_created, 30 min delay (overridden to 2 min by env)
4. Start the flow
5. Open Shopify dev store in another tab
6. Add a product to cart (as an identified customer)
7. Switch to /debugger → verify cart_created event appears
8. Verify: flow_trips table has new trip with status 'waiting'
9. Verify: scheduled_jobs has pending job with execute_at = now + 2 min
10. Wait 2 minutes
11. Verify: email arrives at customer's email address
12. Verify: trip status = 'completed'
```

### Scenario 5: Exit Condition
```
1. Start abandoned cart flow
2. Add product to cart on Shopify (creates trip)
3. BEFORE delay fires, complete a purchase on Shopify (order_placed event)
4. Verify: trip status = 'exited' (not 'completed')
5. Verify: scheduled job status = 'cancelled'
6. Verify: NO email is sent
```

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Shopify webhook delivery failure | Medium | Critical | Test on Day 1 with ngrok. Verify HMAC. Log all incoming requests. Have manual trigger button as escape hatch. |
| Agent code integration failure | High | High | Contract-first (shared types defined Day 1). Daily integration merges. Small PRs. |
| Email not sending in demo | Medium | Critical | Pre-trigger email before meeting. Have Resend dashboard open to show "Sent" status. Test 3 times on Day 7. |
| Historical sync too slow | Low | Medium | Limit to 100 customers for demo. Show sync progress bar. Full sync runs in background. |
| Flow timing issues | Medium | High | 2-min delay for demo (env var). Add manual "trigger now" button on flow canvas. Pre-scheduled job as backup. |
| Segment counts wrong | Low | Medium | Pre-calculate on sync complete. Cache in segment table. Verify against manual Shopify filter count. |
| Production deploy failure | Low | Critical | Deploy on Day 6 evening. Day 7 morning = production testing only. Keep localhost as backup with ngrok. |
| BullMQ jobs not processing | Medium | Critical | Monitor BullMQ dashboard (bull-board). Check Redis connection. Verify worker is running. |
| Shopify rate limiting | Low | Medium | 250ms delay between API calls. Queue-based sync. Retry with backoff. |
