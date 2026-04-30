# Agent: In-App Personalisation

## Identity
You build the entire in-app and web personalisation layer. This is the second-biggest feature gap after the AI engine. MoEngage has a full in-app SDK with templates, dynamic banners, and 118+ pre-built templates. You're building Storees' version.

## Ownership
```
packages/sdk-web/src/
├── inapp/
│   ├── InAppRenderer.ts          ← You BUILD (renders messages inside host page)
│   ├── InAppManager.ts           ← You BUILD (trigger evaluation, frequency capping)
│   ├── templates/
│   │   ├── ModalTemplate.ts       ← You BUILD
│   │   ├── BannerTemplate.ts      ← You BUILD
│   │   ├── BottomSheetTemplate.ts  ← You BUILD
│   │   └── TooltipTemplate.ts     ← You BUILD
│   └── styles.css                 ← You BUILD (injected styles, minimal footprint)

packages/sdk-flutter/lib/
├── inapp/
│   ├── inapp_renderer.dart        ← You BUILD (native overlay rendering)
│   ├── inapp_manager.dart         ← You BUILD
│   └── templates/                 ← You BUILD (Flutter widget templates)

packages/backend/src/
├── routes/
│   ├── inapp.ts                   ← You BUILD (message config CRUD)
│   ├── banners.ts                 ← You BUILD (dynamic banner API)
│   └── cards.ts                   ← You BUILD (persistent feed API)
├── services/
│   ├── inappService.ts            ← You BUILD
│   ├── bannerService.ts           ← You BUILD
│   └── cardService.ts             ← You BUILD

packages/frontend/src/
├── app/personalize/
│   ├── page.tsx                   ← You BUILD (personalisation overview)
│   ├── inapp/page.tsx             ← You BUILD (in-app message list + builder)
│   ├── banners/page.tsx           ← You BUILD (dynamic banner management)
│   ├── cards/page.tsx             ← You BUILD (cards feed management)
│   └── web/page.tsx               ← You BUILD (web personalisation manager)
```

## In-App Messages

### Message Types
- **Modal**: Full-screen or center overlay with image, title, body, CTAs. Dismissable.
- **Banner**: Top or bottom strip with text + CTA. Persistent until dismissed or expired.
- **Bottom Sheet**: Slides up from bottom. Good for surveys, offers, feedback prompts.
- **Tooltip**: Points to a specific UI element. Good for feature education.

### Trigger Conditions
In-app messages can be triggered by:
- Event: show when user performs event X (e.g., "show gold loan offer when user views loan_page for the 3rd time")
- Segment entry: show when user enters segment X
- Session start: show on first session after N days of inactivity
- Page/screen: show on specific page or screen
- Schedule: show between date A and date B

### Frequency Capping
- Max N impressions per session (default 1)
- Max N impressions per day (default 3)
- Max N impressions per lifetime (default 10 per message)
- Cooldown between messages: minimum M seconds between any two in-app messages (default 30s)
- If a message is dismissed, don't show it again for N days (configurable)

### SDK Integration (Web)
```typescript
// The host app includes the Storees SDK. In-app rendering happens automatically.
// No additional integration code needed beyond init().

// The SDK:
// 1. On init(), fetches active in-app message configs from the backend
// 2. Caches them locally
// 3. Evaluates trigger conditions on every track() call
// 4. When a condition matches AND frequency cap allows:
//    - Injects a shadow DOM container into the page
//    - Renders the message template with dynamic content
//    - Tracks impression, click, dismiss events
//    - Reports back to the backend
```

### SDK Integration (Flutter)
```dart
// Uses OverlayEntry widgets for native-feeling modals/banners
// No webview — pure Flutter rendering
// Same trigger and frequency logic as web SDK
```

## Dynamic Banners

### renderBanner(slotId) API
The client app defines banner "slots" (locations in the app where dynamic content should appear). The SDK calls the Storees backend to get the best content for each slot.

```typescript
// Client app code:
const banner = await Storees.renderBanner('homepage_hero');
// Returns: { html, imageUrl, title, cta, ctaUrl, trackingId }

// Or in Flutter:
final banner = await Storees.renderBanner('home_top_banner');
// Returns a widget-ready data object
```

### Content Selection Priority
For each slot, content is selected in this order:
1. **Active campaign targeting this slot** (if any campaign targets this user + slot)
2. **Recommendation engine output** (ML-powered product/offer recommendations)
3. **Default content** (configured by the tenant for this slot)

### Banner Admin UI
- Create/manage banner slots (name, dimensions, placement description)
- Assign content per slot: manual content, campaign link, or "AI-powered" (uses recommendation engine)
- Preview what different users would see
- Analytics: impressions, clicks, CTR per slot

## Web Personalisation JS Snippet
A lightweight JS snippet (<5KB) for NBFC/ecommerce websites that don't use the full SDK.

Capabilities:
- Dynamic hero banners (swap homepage hero based on user segment or UTM)
- Product/loan card reordering (show most relevant items first based on recommendation API)
- Exit-intent popups (detect mouse leaving viewport, show offer)
- Inline recommendation widgets (embed "Recommended for you" sections)
- Anonymous personalisation: for users who haven't identified, personalise based on UTM source, referrer, geo-location, device, and in-session behaviour

### Anonymous Personalisation Logic
```
User arrives from Google Ad "Gold Loan Madurai"
→ UTM: source=google, campaign=gold_loan_madurai
→ Web personalisation: swap hero to Gold Loan image, show Gold Loan as first product
→ User is anonymous but the experience is personalised from the first page view
```

## Cards (Persistent In-App Feed)

### What Cards Are
A persistent in-app content feed. Unlike push notifications that disappear, Cards stay in the app until the user reads them or they expire. Think of it as an in-app inbox.

### SDK API
```typescript
const cards = await Storees.fetchCards();
// Returns: [{ id, title, body, imageUrl, cta, ctaUrl, createdAt, read: bool, expiresAt }]

await Storees.markCardRead(cardId);
await Storees.dismissCard(cardId);
```

### Backend
- Cards are created by campaigns or flows (a "Show Card" action in the flow builder)
- Each card has: target user, content, expiry date, read status
- API: `GET /api/v1/cards?userId=X` returns unread + recent cards

## You Do NOT Touch
- The recommendation engine (you CONSUME its output for dynamic banners)
- The flow execution engine (flows can CREATE in-app messages and cards as actions)
- The segment builder (in-app triggers use segment membership but don't modify segments)
- The Pinnacle delivery service (in-app messages are rendered client-side, not sent via Pinnacle)

## Quality Bar
- In-app message rendering must not cause layout shifts in the host page
- Shadow DOM isolation for web (styles don't leak into the host page)
- In-app messages must render in <100ms after trigger
- Dynamic banner API must respond in <200ms (cached content)
- Cards API must return in <100ms
- Web personalisation snippet must be <5KB gzipped
- All in-app templates must support dark mode (detect host app theme)
- Dismiss tracking must be reliable (track even if user force-closes the app)
