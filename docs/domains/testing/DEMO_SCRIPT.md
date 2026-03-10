# Testing — Demo Script

> Rehearse 3 times before the Pinnacle meeting. Use `DEMO_DELAY_MINUTES=2`. Have a pre-triggered backup email.

## Pre-Demo Checklist

- [ ] Production deployment verified (Railway + Vercel)
- [ ] Shopify dev store connected with test data (50+ customers, 100+ orders)
- [ ] At least 3 segments populated with real member counts
- [ ] Abandoned cart flow created and set to Active
- [ ] Resend API verified — test email sent successfully
- [ ] `DEMO_DELAY_MINUTES=2` set in production env
- [ ] Pre-triggered abandoned cart email already in inbox (backup)
- [ ] Browser tabs pre-loaded: Storees admin, Shopify store, email inbox
- [ ] Incognito/guest browser ready for Shopify storefront (to trigger cart)

## The Script (30 minutes)

### Opening (2 min)

> "Let me show you Storees, our marketing automation platform that we've built for Shopify merchants. This is a live system connected to a real Shopify store."

→ Open dashboard. Show metric cards: total customers, active this week, total orders, average CLV.

### CDP Demo (5 min)

> "Here's the customer data platform. We pull every customer from Shopify with their full purchase history."

→ Open /customers. Show paginated list with real data.

> "Every customer has a complete profile."

→ Click into a customer row. Walk through tabs:
- **Details**: name, email, phone, account created date, subscription badges (email ✓, SMS ✗, etc.)
- **Orders**: show 2-3 orders with line item expansion (product name, qty, price, images)
- **Activity**: show event timeline ("order_placed", "customer_created" from historical sync)

### Segmentation Demo (5 min)

> "We have intelligent segmentation built in with pre-built templates."

→ Open /segments. Show the 5 default segments with member counts.

→ Click into "Champion Customers" — show the member list.

> "And here's the customer lifecycle view."

→ Show lifecycle chart. Point out the grid: "Champions here in green, At Risk in amber, About to Lose in red."

→ Hover over "At Risk" cell → show retention tactics popup.

> "Let me create a custom segment live."

→ Click "Create from Scratch". Build: `total_spent > 5000 AND days_since_last_order < 30`.

→ Show the preview count updating as you add rules. Save the segment.

### Flow Builder Demo (5 min)

> "Now the automation engine. Let me show you how we build marketing flows."

→ Open /flows. Show the abandoned cart flow.

→ Walk through the canvas visually: "When a customer adds to cart... we wait 30 minutes... check if they purchased... if not, we send this email."

→ Show the email template: customer name, cart items with images, gold CTA button.

### Live Trigger (8 min)

> "Let me trigger this live right now."

→ Open Shopify dev store in another tab.

→ Browse to a product. Add it to cart.

→ Switch to /debugger in Storees.

> "Watch — the cart_created event just arrived."

→ Point to the event in the stream: event name, customer, timestamp, properties.

> "The flow has started. In about 2 minutes, the customer will receive an abandoned cart email."

→ Switch to email inbox. Wait. (Fill time by talking about the platform vision.)

→ When email arrives: "There it is. Real email, real cart items, real checkout link."

→ Open the email. Show the product image, price, and "Complete Your Purchase" button.

### Close (5 min)

> "This is the foundation we've built. For Pinnacle, we'll extend this into the full platform —"

Cover briefly:
- Analytics dashboards (funnels, cohorts, retention)
- AI-powered content generation and send-time optimization
- Multi-channel: push notifications, SMS, WhatsApp
- Web and app personalization
- Custom integrations beyond Shopify

> "We have the architecture, the data layer, and the automation engine already working. The Pinnacle platform builds on top of this proven foundation."

## Timing Backup Plan

If the email doesn't arrive within 2.5 minutes:

> "While we wait for the delivery — let me show you this email that was triggered earlier today."

→ Open the pre-triggered backup email from your inbox.

> "This is the exact same email template. The one we just triggered should arrive any moment — sometimes email delivery takes a few extra seconds."

→ Switch to Resend dashboard. Show the "Sent" status with timestamp.

## Things That Can Go Wrong + Recovery

| Issue | Recovery |
|-------|---------|
| Shopify OAuth fails | Have a pre-connected store. Skip the connect step. "Let me show you a store that's already connected." |
| Customer list is empty | Check Railway logs. If sync failed, show /debugger to prove events are flowing. |
| Segment count is zero | Adjust filter thresholds on the spot. "Let me widen the criteria..." |
| Flow canvas doesn't render | Show the flow as a list view. Describe the node sequence verbally. |
| Email doesn't arrive | Use backup email. Show Resend dashboard. "Delivery typically takes 10-30 seconds, but let me show you one from earlier." |
| Event debugger is empty | Manually fire a webhook using Postman/curl. Have the command pre-loaded. |
