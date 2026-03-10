# Integrations — Email (Resend)

> **Provider**: Resend (Phase 1). Extensible to SendGrid/SES in Phase 2.
> **API Key**: `RESEND_API_KEY` environment variable
> **From Address**: `noreply@storees.io` (default) or per-project configured sender

## Resend API Usage

### Send Single Email
```typescript
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

await resend.emails.send({
  from: 'Storees <noreply@storees.io>',
  to: customer.email,
  subject: processedSubject,
  html: processedHtml,
})
```

### Template Variable Substitution

Templates use `{{variable}}` syntax. The action executor replaces variables before sending.

**Available Variables** (from flow trip context + customer profile):
| Variable | Source | Description |
|----------|--------|-------------|
| `{{customer_name}}` | `customer.name` or `customer.email` fallback | Customer display name |
| `{{customer_email}}` | `customer.email` | |
| `{{checkout_url}}` | `trip.context.properties.checkout_url` | Link back to Shopify cart |
| `{{cart_items}}` | `trip.context.properties.items` | Array, used with `{{#each}}` |
| `{{cart_value}}` | `trip.context.properties.cart_value` | Total cart value |
| `{{store_name}}` | `project.name` | |
| `{{unsubscribe_url}}` | Generated per customer | Opt-out link |

### `{{#each}}` Block Processing

For cart items in abandoned cart emails:
```html
{{#each cart_items}}
<div>
  <img src="{{this.image_url}}" width="80" />
  <span>{{this.product_name}}</span>
  <span>Qty: {{this.quantity}}</span>
  <span>{{this.price}}</span>
</div>
{{/each}}
```

Implementation: Use a simple Handlebars-like processor. In Phase 1, a basic regex-based replacer is sufficient. Phase 2 can adopt Handlebars.js proper.

## Abandoned Cart Email Template

**Subject**: `{{customer_name}}, you left something behind!`

**HTML Structure**:
- Header bar: `#0F1D40` background, white text "Your cart is waiting"
- Body: Greeting with customer name, cart items with image/name/qty/price each, total value
- CTA: Gold button (`#D9A441`) "Complete Your Purchase" linking to `{{checkout_url}}`
- Footer: `#F7F3EB` background, unsubscribe link

See full HTML template in `STOREES_REQUIREMENTS.md` Section 6.3.

## Email Tracking (Phase 2)

Not in Phase 1 scope but design for it:
- Add tracking pixel `<img>` for open tracking
- Wrap all links through redirect URL for click tracking
- Store delivery/open/click events in `events` table with `platform = 'email'`
