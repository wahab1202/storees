# FCM Test Token Tool

Mints a real FCM device token for the `gowelmart-9b9c8` Firebase project and
registers it on a Storees customer — so you can verify push **delivery**
end-to-end without waiting on the mobile app.

## Setup (one time)
1. Open `index.html` and fill the two blocks at the top:
   - `FIREBASE_CONFIG` — Firebase Console → Project settings → General → Your apps (Web app):
     `apiKey`, `messagingSenderId`, `appId` (projectId/authDomain are pre-filled).
   - `VAPID_KEY` — Firebase Console → Project settings → Cloud Messaging →
     Web Push certificates → "Key pair".

## Run (must be localhost/https — FCM web push won't work over file://)
```bash
cd scripts/fcm-token-tool
python3 -m http.server 8000
# then open http://localhost:8000 in Chrome
```

## Use
1. Click **"Allow notifications & get token"** → grant permission → a real token prints.
2. Fill your Storees **public + secret API keys** and a **customer_id**, click
   **"Register token with Storees"**.
3. In Storees, send a **push** campaign/flow to that customer.
   - Notification appears (foreground or background) ✅
   - **Notification Logs** shows Delivered.
   - If it shows *"Device token expired"*, the token was stale — click step 1 again
     to mint a fresh one and re-register.

> The token belongs to *this browser/profile*. It's a genuine FCM registration on
> `gowelmart-9b9c8`, so a send from Storees (which uses that project's service
> account) will be accepted and delivered.
