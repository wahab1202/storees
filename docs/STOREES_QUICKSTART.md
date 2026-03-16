# Storees — Developer Quickstart

> You have an app. You want to track what your users do. Here's how to plug Storees in — in under 30 minutes.

---

## The Scenario

You're a developer at **One2One**, a ride-hailing app (like Uber/Ola). Your marketing team wants to:

1. Know when a user **completes a ride**
2. Know when a user **applies a discount coupon**

That's it. Two events. Let's integrate Storees.

---

## Step 1: Get Your API Key

Your team lead creates a project on the Storees dashboard and gives you two things:

```
STOREES_API_URL=https://storees.yourcompany.com
STOREES_API_KEY=sk_live_a1b2c3d4e5f6...
```

Add these to your `.env.local` (Next.js) or `.env` file:

```env
NEXT_PUBLIC_STOREES_API_URL=https://storees.yourcompany.com
NEXT_PUBLIC_STOREES_API_KEY=sk_live_a1b2c3d4e5f6...
```

---

## Step 2: Install the SDK

```bash
npm install @storees/react
```

---

## Step 3: Wrap Your App (one-time setup)

You only do this **once**. Create a providers file and wrap your root layout.

```tsx
// app/providers.tsx
'use client'

import { StoreesProvider, StoreeRouteTracker } from '@storees/react'
import { usePathname } from 'next/navigation'

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <StoreesProvider
      apiKey={process.env.NEXT_PUBLIC_STOREES_API_KEY!}
      apiUrl={process.env.NEXT_PUBLIC_STOREES_API_URL!}
    >
      <StoreeRouteTracker pathname={pathname} />
      {children}
    </StoreesProvider>
  )
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

After this step, Storees **automatically tracks page views** across your entire app. No extra code needed for that.

---

## Step 4: Identify the User on Login

When a user logs in, tell Storees who they are. Find your login handler and add one line.

**Before:**

```tsx
// app/login/page.tsx

async function handleLogin(phone: string, otp: string) {
  const user = await api.verifyOtp(phone, otp)
  setSession(user)
  router.push('/home')
}
```

**After:**

```tsx
// app/login/page.tsx
import { useIdentify } from '@storees/react'   // ← add import

function LoginPage() {
  const identify = useIdentify()                 // ← add hook

  async function handleLogin(phone: string, otp: string) {
    const user = await api.verifyOtp(phone, otp)
    setSession(user)

    // ← Tell Storees who just logged in
    identify(user.id, {
      name: user.name,
      phone: user.phone,
      email: user.email,
      city: user.city,
    })

    router.push('/home')
  }
}
```

**What this does:** Creates (or updates) this user's profile in Storees. Their `user.id` becomes their unique identifier. Any events they trigger from now on are linked to this profile.

---

## Step 5: Track Event #1 — Ride Completed

Find the place in your code where a ride is marked as completed. Add one `track()` call.

**Before:**

```tsx
// app/ride/[id]/page.tsx

async function onRideComplete(ride: Ride) {
  await api.completeRide(ride.id)
  setRideStatus('completed')
  showRatingModal()
}
```

**After:**

```tsx
// app/ride/[id]/page.tsx
import { useTrack } from '@storees/react'         // ← add import

function RidePage({ ride }: { ride: Ride }) {
  const track = useTrack()                          // ← add hook

  async function onRideComplete(ride: Ride) {
    await api.completeRide(ride.id)
    setRideStatus('completed')
    showRatingModal()

    // ← Track this event in Storees
    track('ride_completed', {
      ride_id: ride.id,
      amount: ride.fare,
      distance_km: ride.distance,
      ride_type: ride.type,           // 'auto', 'sedan', 'suv'
      payment_method: ride.payment,   // 'upi', 'cash', 'wallet'
      city: ride.city,
    })
  }
}
```

**What this does:** Every time a user completes a ride, Storees records it with all the details. Your marketing team can now build segments like "Users who spent more than ₹5,000 on rides" or "Users in Mumbai who prefer UPI".

---

## Step 6: Track Event #2 — Discount Applied

Find where discount coupons are applied. Same pattern — one `track()` call.

**Before:**

```tsx
// components/CouponInput.tsx

async function applyCoupon(code: string) {
  const result = await api.validateCoupon(code)
  if (result.valid) {
    setDiscount(result.discount)
    toast.success(`₹${result.discount} off!`)
  }
}
```

**After:**

```tsx
// components/CouponInput.tsx
import { useTrack } from '@storees/react'          // ← add import

function CouponInput() {
  const track = useTrack()                          // ← add hook

  async function applyCoupon(code: string) {
    const result = await api.validateCoupon(code)
    if (result.valid) {
      setDiscount(result.discount)
      toast.success(`₹${result.discount} off!`)

      // ← Track this event in Storees
      track('discount_applied', {
        coupon_code: code,
        discount_amount: result.discount,
        discount_type: result.type,    // 'flat', 'percentage'
        min_order_value: result.minOrder,
      })
    }
  }
}
```

---

## That's It. You're Done.

Here's everything you changed:

| File | What you did |
|------|-------------|
| `.env.local` | Added 2 environment variables |
| `app/providers.tsx` | Created new file — StoreesProvider + route tracker |
| `app/layout.tsx` | Wrapped children with `<Providers>` |
| `app/login/page.tsx` | Added `identify()` call in login handler |
| `app/ride/[id]/page.tsx` | Added `track('ride_completed', {...})` in ride complete handler |
| `components/CouponInput.tsx` | Added `track('discount_applied', {...})` in coupon handler |

**Total lines of Storees code added: ~20 lines across 4 files.**

---

## What Happens Next (Without You Writing More Code)

Once those events start flowing, Storees automatically:

1. **Builds customer profiles** — each user gets a unified profile with all their events
2. **Computes metrics** — total rides, total spend, days since last ride, discount usage count
3. **Evaluates segments** — your marketing team can create segments like:
   - "Power users" → completed 50+ rides
   - "Discount hunters" → applied 10+ coupons
   - "Churning" → no rides in 30+ days
   - "High spenders in Delhi" → total spend > ₹10K and city = Delhi
4. **Triggers flows** — send a push notification when a user hasn't booked in 7 days

You don't write any code for steps 1-4. That's all configured in the Storees dashboard by your marketing/growth team.

---

## Quick Reference

### The two functions you'll use 90% of the time

```typescript
// Tell Storees who the user is
identify(userId, { ...attributes })

// Tell Storees what the user did
track(eventName, { ...properties })
```

### Rules of thumb

- Call `identify()` **once per session** (on login or app open)
- Call `track()` **every time something worth tracking happens**
- Put whatever properties feel useful — you can always filter by them later
- Event names should be past tense: `ride_completed`, not `complete_ride`
- You don't need to track page views — the SDK does that automatically

### What properties to send

Send whatever your marketing team might want to filter or segment by. Ask yourself: *"Would someone want to say 'show me all users where [this property] is [some value]'?"* If yes, include it.

Good: `{ amount: 500, city: 'Mumbai', ride_type: 'sedan' }`
Unnecessary: `{ internal_request_id: 'req_abc', db_updated_at: '...' }`
