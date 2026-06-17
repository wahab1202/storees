# Push Token & Consent Contract (for the mobile app team)

**Audience:** the team that owns the GoWelmart mobile app.
**Why this exists:** Storees sends the push notifications, but it has **no SDK inside
your app**. So your app is the only place that can see the device's notification
permission and FCM token — and Storees can only send if your app **relays** them.
Without this, every push is blocked ("No marketing consent") or fails ("token not
registered"). This is a small, one-time integration: **4 calls**, all to endpoints
you already have credentials for.

> **Customer ID must match.** Use the **same `customer_id`** you already send Storees
> for orders/events (the Medusa customer id). That's the key everything links on.

Auth headers on every call:
```
X-API-Key: <public key>
X-API-Secret: <secret key>
Content-Type: application/json
```

---

## 1. On notification permission GRANTED (+ token obtained) — **required**
After the OS prompt returns "allow" and Firebase gives you a token:

```http
POST https://api.storees.io/api/v1/customers
{
  "customer_id": "<your customer id>",
  "attributes": {
    "fcm_token": "<the FCM device token>",
    "push_subscribed": true
  }
}
```
This is what makes the customer reachable for push. (Storees treats the **presence
of a token** as consent, since the OS permission already gated it — but send
`push_subscribed: true` too; it's the explicit signal.)

## 2. On token REFRESH — **required**
Firebase rotates tokens (`onTokenRefresh` / `didReceiveRegistrationToken`). Send the
new one or pushes silently start failing:

```http
POST https://api.storees.io/api/v1/customers
{ "customer_id": "<your customer id>", "attributes": { "fcm_token": "<new token>" } }
```

## 3. On permission REVOKED or LOGOUT — **required for compliance**
If the user turns notifications off (or logs out), stop sending:

```http
POST https://api.storees.io/api/v1/customers
{ "customer_id": "<your customer id>", "attributes": { "push_subscribed": false } }
```

## 4. On notification TAP — *optional (enables click analytics)*
```http
POST https://api.storees.io/api/v1/events
{ "event_name": "push_clicked", "customer_id": "<your customer id>",
  "properties": { "message_id": "<message_id from the push data payload>" } }
```

---

## What Storees handles for you
- **Uninstalls / dead tokens:** if Firebase reports the token as unregistered on a
  send, Storees automatically clears it and stops sending — you don't need to detect
  uninstalls. (But #3 above is still needed for *permission revoked while installed*.)
- **Delivery/read tracking:** delivered status flows automatically; "read" needs the
  tap event (#4).

## When you can't relay something
Push depends entirely on your app cooperating. For audiences/consent you can't get
from the app, Storees also runs **WhatsApp, email, and SMS** — those collect consent
at web/checkout touchpoints (opt-in checkbox, WhatsApp "START", etc.) that GoWelmart
controls directly, independent of the app.

## Quick test
1. Grant permission in the app → confirm call #1 fired.
2. In Storees → Customers → find that customer → it should show `fcm_token` and
   `push_subscribed: true`.
3. Send a test push from Storees → notification appears; **Notification Logs** shows
   Delivered. If it shows "Device token expired", the token in #1 was stale —
   re-send the current one.
