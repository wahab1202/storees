# Skill: SDK Development

## When to Use
Invoke this skill when building or modifying the Web (TypeScript) or Flutter (Dart) SDKs.

## Web SDK Conventions

### Bundle Requirements
- Target: ES2020+ browsers (Chrome, Firefox, Safari, Edge — last 2 versions)
- Bundle size: <15KB gzipped
- Output formats: UMD (for script tag) + ESM (for npm import)
- NO heavy dependencies: no lodash, no axios, no moment.js
- Use native `fetch`, `localStorage`, `crypto.randomUUID()`

### Script Tag Integration
```html
<script src="https://cdn.storees.io/sdk/v1/storees.min.js"></script>
<script>
  Storees.init({ projectId: 'proj_xxx' });
</script>
```

### NPM Integration
```typescript
import Storees from '@storees/web-sdk';
Storees.init({ projectId: 'proj_xxx' });
```

### Anonymous ID Generation
```typescript
function generateAnonymousId(): string {
  // Use crypto.randomUUID() if available, fallback to timestamp+random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `anon_${crypto.randomUUID()}`;
  }
  return `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```
Store in localStorage under key `storees_anonymous_id`. Persists across page reloads.

### Event Batching
```typescript
class EventQueue {
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  
  add(event: QueuedEvent) {
    this.queue.push(event);
    
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.config.batchInterval);
    }
  }
  
  async flush() {
    if (this.queue.length === 0) return;
    
    const batch = [...this.queue];
    this.queue = [];
    
    try {
      await this.transport.send(batch);
    } catch (err) {
      // Failed — put events back in queue (offline queue)
      this.queue = [...batch, ...this.queue];
      this.persistToStorage(); // Save to localStorage for recovery
    }
  }
}
```

### Page Unload Handling
```typescript
// Use sendBeacon for guaranteed delivery on page unload
window.addEventListener('beforeunload', () => {
  const batch = this.queue.splice(0);
  if (batch.length > 0) {
    navigator.sendBeacon(
      `${this.config.apiUrl}/api/v1/events/batch`,
      JSON.stringify({ batch, projectId: this.config.projectId })
    );
  }
});
```

### SPA Route Detection
```typescript
// Detect route changes in SPAs (React, Next.js, Vue, Angular)
const originalPushState = history.pushState;
history.pushState = function(...args) {
  originalPushState.apply(this, args);
  Storees.page(); // Auto-track page view
};

window.addEventListener('popstate', () => {
  Storees.page();
});
```

## Flutter SDK Conventions

### Dependencies (minimal)
```yaml
dependencies:
  shared_preferences: ^2.2.0    # Offline queue persistence
  connectivity_plus: ^5.0.0     # Network state
  device_info_plus: ^9.0.0      # Device metadata
  package_info_plus: ^4.0.0     # App version
  http: ^1.1.0                  # HTTP client
  uuid: ^4.0.0                  # Anonymous ID generation
```

### App Lifecycle
```dart
class StoreesLifecycleObserver extends WidgetsBindingObserver {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        Storees.track('app_foregrounded');
        Storees.flushQueue(); // Send queued events
        break;
      case AppLifecycleState.paused:
        Storees.track('app_backgrounded');
        Storees.persistQueue(); // Save queue to disk
        break;
      default:
        break;
    }
  }
}
```

### Offline Queue (Flutter)
```dart
// Save to SharedPreferences as JSON string
// On app resume: check connectivity, flush if online
// Max queue size: 1000 events
// Queue is FIFO: oldest events sent first
```

## Error Handling (Both SDKs)
The SDK must NEVER crash the host application. Every public method wraps in try-catch:

```typescript
track(eventName: string, properties?: Record<string, any>) {
  try {
    // ... actual tracking logic ...
  } catch (err) {
    if (this.config.debug) {
      console.warn('[Storees] track() error:', err);
    }
    // Silently fail — never throw into the host app
  }
}
```

## Backend Batch Endpoint
The SDKs send to: `POST /api/v1/events/batch`

```typescript
// Request
{
  "projectId": "proj_xxx",
  "batch": [
    {
      "type": "track",        // "track", "page", "identify", "consent"
      "name": "loan_page_viewed",
      "properties": { "item_id": "gold_loan_001" },
      "anonymousId": "anon_abc123",
      "userId": "user_12345", // null if not yet identified
      "timestamp": "2026-03-25T14:30:00.000Z",
      "context": {
        "page": { "url": "...", "title": "..." },
        "device": { "type": "mobile", "os": "Android 14" },
        "utm": { "source": "google", "medium": "cpc" },
        "sdk": { "name": "storees-web", "version": "1.0.0" }
      }
    }
  ]
}

// Response
{ "success": true, "accepted": 5, "rejected": 0 }
```

This endpoint feeds each event through the existing event processing pipeline (eventProcessor.ts). It handles identity resolution, event persistence, interaction engine, and flow triggers — all existing code.
