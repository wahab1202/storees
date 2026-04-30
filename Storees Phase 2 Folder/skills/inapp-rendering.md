# Skill: In-App Rendering

## When to Use
Invoke this skill when building the in-app message SDK (Web or Flutter) or the Dynamic Banner API.

## Message Types

### Modal (Full-screen overlay)
- Covers entire screen with backdrop
- Has title, body, image (optional), CTA buttons, close button
- Use for: major announcements, surveys, onboarding steps

### Bottom Sheet
- Slides up from bottom, covers 40-60% of screen
- Has title, body, CTA buttons, drag handle to dismiss
- Use for: contextual offers, consent requests, quick actions

### Banner (Top or Bottom)
- Thin strip at top or bottom of screen
- Has icon, one-line text, CTA button, dismiss X
- Auto-dismiss after N seconds (configurable)
- Use for: alerts, reminders, soft nudges

### Tooltip / Nudge
- Small bubble attached to a specific UI element
- Arrow pointing to the element
- Has text and optional CTA
- Use for: feature discovery, guidance

### Cards (Persistent Feed)
- NOT an overlay — a content feed inside the app
- App calls `fetchCards()` to get list of persistent messages
- Each card has: title, body, image, CTA, read/unread state, expiry
- Cards persist until read or expired (unlike push/in-app which disappear)

## Web SDK Rendering

### Container Injection
```javascript
// The SDK creates a container div at the end of <body>
const container = document.createElement('div');
container.id = 'storees-inapp-container';
container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none;';
document.body.appendChild(container);

// Each message creates a child element inside this container
// pointer-events:auto only on the message itself, not the container
// This ensures the host page remains interactive behind modals
```

### Styling Isolation
- Use Shadow DOM to prevent host page CSS from affecting in-app messages
- OR use highly specific CSS classes prefixed with `storees-` (e.g., `.storees-modal`, `.storees-banner`)
- NEVER use global CSS resets or normalize inside the host page
- Bundle CSS inline in the component, not as a separate stylesheet

### Z-Index Management
- Storees messages: z-index 99999
- Storees backdrop: z-index 99998
- If host page has z-index conflicts, they should adjust (our z-index is documented)

## Flutter SDK Rendering

### Overlay Architecture
```dart
// Use an Overlay widget at the app root
// The SDK pushes OverlayEntries for each message type

class StoreesOverlay {
  static OverlayEntry? _currentMessage;
  
  static void showModal(BuildContext context, InAppMessage message) {
    _currentMessage = OverlayEntry(
      builder: (context) => StoreesModal(
        message: message,
        onDismiss: () => _currentMessage?.remove(),
      ),
    );
    Overlay.of(context).insert(_currentMessage!);
  }
}
```

### Do NOT use Flutter dialogs
- `showDialog()` depends on the app's MaterialApp theme
- Use raw Overlay entries for full control over styling
- This avoids conflicts with the host app's theme/colors

## Trigger System

### When to Show
Messages are triggered by:
1. **Event trigger**: user performs a specific event → show message
2. **Segment trigger**: user enters a segment → show message
3. **Schedule trigger**: show between date X and date Y
4. **Page/screen trigger**: user visits a specific page/screen → show message

### Frequency Capping
- Per message: show at most N times total / per session / per day
- Per user: show at most N in-app messages total per session / per day
- Minimum gap between messages: configurable (default: 5 minutes)
- If multiple messages are eligible, show the highest priority one

### Display Priority
```
1. Targeted campaign messages (highest priority)
2. Flow-triggered messages
3. Dynamic banner content (recommendation-powered)
4. General promotional messages (lowest priority)
```

## Dynamic Banner API

### How it Works
```
App renders a banner slot → calls SDK.renderBanner("home_hero")
                                    ↓
SDK calls: GET /v1/banners/home_hero?userId=X
                                    ↓
Backend checks (in order):
  1. Active campaign targeting this slot + this user → return campaign content
  2. Recommendation engine has suggestions for this user → return recommendation card
  3. Default/fallback content for this slot → return default
                                    ↓
SDK renders the returned content in the banner slot
```

### Banner Slot Registration
The client app defines banner slots by ID:
```javascript
// Web
<div data-storees-slot="home_hero"></div>
<div data-storees-slot="product_recommendations"></div>

// Flutter
StoresBannerSlot(slotId: "home_hero")
```

### Content Format Returned by API
```json
{
  "slotId": "home_hero",
  "content": {
    "type": "image_text_cta",
    "imageUrl": "https://...",
    "title": "Gold Loan at 8.5% interest",
    "body": "Apply in 2 minutes. Disbursement in 24 hours.",
    "cta": { "text": "Apply Now", "deeplink": "/apply/gold-loan" }
  },
  "source": "campaign",
  "campaignId": "camp_123",
  "trackingId": "imp_456"
}
```

## Tracking
Every in-app message tracks:
- `inapp_impression`: message was shown to the user
- `inapp_click`: user clicked the CTA
- `inapp_dismiss`: user dismissed the message
- `banner_impression`: banner content was rendered
- `banner_click`: user clicked the banner CTA

These events flow through the standard event pipeline and feed into campaign analytics, BTS, and NBA.

## Performance Requirements
- SDK initialization: <100ms additional page load time
- Message render: <50ms from trigger to visible
- Banner API response: <200ms
- SDK bundle size (Web): <15KB gzipped
- SDK bundle size (Flutter): <500KB (compiled)
