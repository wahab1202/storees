# Event Specification

What to send Storees, and what each field buys you.

This is the contract a client integrates against. It is also what the prediction
pipeline reads — the two are the same list on purpose. Where a client's own naming
differs and cannot be changed, the per-project **Event Mapping** screen overrides it;
that is the exception, not the route.

---

## 1. Sending an event

```
POST  {BASE_URL}/api/v1/events
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

```json
{
  "event_name": "order_placed",
  "customer_id": "CUST_001",
  "session_id": "sess_8f2a",
  "timestamp": "2026-08-14T10:15:00+05:30",
  "properties": { }
}
```

### Top-level fields

| field | required | notes |
|---|---|---|
| `event_name` | **yes** | must match a name below |
| `customer_id` | one of these | your own id for the customer |
| `customer_email` / `customer_phone` | | used to resolve identity if no id |
| `session_id` | **strongly recommended** | one visit. Anonymous traffic may send this alone. |
| `timestamp` | no | ISO 8601 with offset. Defaults to receipt time. Cannot be more than 7 days in the past. |
| `idempotency_key` | no | your own de-duplication key. One is derived if absent. |
| `properties` | per event | everything else, as specified below |

`session_id` is a first-class column, **not** a property. Eight features depend on it
and nothing else in the system can reconstruct it — only your application knows where
one visit ends and the next begins.

---

## 2. Rules that apply to every event

**Names are exact.** `order_placed`, not `order_completed` or `orderPlaced`. An event
whose name is not recognised is stored and counted as generic activity, but gets no
features of its own.

**Amounts are numbers, in major units** — `4905`, not `"4905"` and not paise. If you
send minor units, say so once during onboarding; there is a setting for it. Getting
this wrong is silent and scales every money feature by 100.

**Timestamps carry an offset.** `2026-08-14T10:15:00+05:30`.

**Extra properties are welcome.** Anything not listed here is stored and ignored.
Nothing breaks by sending more.

**Missing properties are not an error.** The features that need them come out empty
and are dropped. You lose those features; nothing else is affected.

---

## 3. Ecommerce

### `product_viewed`
```json
{ "product_id": "P_77", "product_type": "Mobiles", "vendor": "Redmi",
  "price": 11990, "product_collection": "Smartphones" }
```
| property | required | unlocks |
|---|---|---|
| `product_id` | **yes** | product variety; also the key used to look the rest up in your catalog |
| `price` | recommended | 5 price-bracket features |
| `product_type` | optional | 5 category features |
| `vendor` | optional | 3 brand features |
| `product_collection` | optional | |

If your catalog is uploaded, `price`, `product_type` and `vendor` are read from it
when the event omits them. Sending them on the event is still better — it records what
was true at the time, where the catalog only knows today.

### `added_to_cart`
```json
{ "product_id": "P_77", "quantity": 1, "price": 11990,
  "product_collection": "Smartphones" }
```
Send this as an **action** — one event per add. If your platform can only report the
cart's current contents, use `cart_updated` instead and say so during onboarding.

### `cart_updated` — cart state
```json
{ "cart_id": "cart_01KYWH", "item_count": 4, "total": 3190,
  "line_items": [ { "product_id": "P_77", "product_name": "Redmi A4",
                    "quantity": 3, "price": 840 } ] }
```
| property | required | notes |
|---|---|---|
| `cart_id` | **yes** | identifies the basket across updates |
| `item_count` | **yes** | how real adds are reconstructed — a snapshot whose basket grew is an add |
| `total` | recommended | |
| `line_items` | optional | |

### `order_placed`
```json
{ "order_id": "ORD_123", "total": 34304, "currency": "INR",
  "item_count": 1,
  "line_items": [ { "product_id": "P_77", "product_name": "Moto Edge 70",
                    "quantity": 1, "price": 34204 } ] }
```
| property | required | unlocks |
|---|---|---|
| `order_id` | **yes** | de-duplication; without it the order is discarded |
| `total` | **yes** | 88 features and four of the five models |
| `currency` | recommended | |
| `line_items` | recommended | 15 basket features |
| `line_items[].product_id` | | product variety, reorder rate, catalog lookup |
| `line_items[].product_name` | | |
| `line_items[].quantity` | | 4 quantity features |
| `line_items[].price` | | average item price |
| `payment_method` | optional | no feature yet; useful for segments |

**`order_id` and `total` are the two that matter most.** An order missing either is
dropped entirely, and four of the five prediction models cannot be built without
orders.

### `order_cancelled` / `order_refunded` / `order_returned`
```json
{ "order_id": "ORD_123", "total": 19990, "reason": "customer_request" }
```
These remove the matching order from revenue. Without them, cancelled and returned
money stays in every spend feature. `order_refunded` and `order_returned` may send
`amount` instead of `total` where the refund is partial.

### Other recognised ecommerce events
```
collection_viewed   collection_id, collection_name
search_performed    query, results_count
added_to_wishlist   product_id, price
review_submitted    product_id, rating, comment
checkout_started    total, currency, item_count
coupon_applied      code, type, amount
order_fulfilled     order_id, total, currency
payment_failed      order_id, amount, currency, reason
```

---

## 4. NBFC / Lending

All eighteen events below are mapped by the industry pack and defined in
`eventSchemas.ts`, so each one's properties are filterable in segments and flows.

| event | properties | notes |
|---|---|---|
| `loan_page_viewed` | `product_type`, `amount` | browsing |
| `pre_approved_viewed` | `amount`, `product_type` | browsing |
| `emi_calculator_used` | `amount`, `tenure_months`, `product_type` | engagement |
| `loan_application_started` | `application_id`, `amount`, `tenure_months`, `product_type` | unfinished intent |
| `top_up_inquiry` | `loan_id`, `amount` | unfinished intent |
| `documents_uploaded` | `application_id`, `document_type` | |
| `loan_applied` | `application_id`, `amount`, `tenure_months`, `product_type` | the application submitted |
| `loan_approved` | `loan_id`, `amount`, `tenure_months` | your decision, not the customer's — see below |
| `loan_rejected` | `application_id`, `reason` | your decision, not the customer's |
| **`loan_disbursed`** | `loan_id`, `amount`, `currency` | **the purchase** |
| **`emi_paid`** | `loan_id`, `amount`, `currency` | **sets every window size — see below** |
| **`emi_overdue`** | `loan_id`, `amount`, `days_overdue` | **the default-risk goal targets this** |
| `emi_missed` | `loan_id`, `amount`, `due_date` | the cycle closed unpaid — distinct from overdue |
| `loan_closed` | `loan_id`, `reason` | ran to term |
| `loan_pre_closed` | `loan_id`, `amount`, `reason` | settled early |
| `app_login` | `method`, `device` | the clearest engagement signal you have |
| `kyc_verified` | `method`, `status` | |
| `kyc_expired` | `method` | |

**`emi_overdue` vs `emi_missed`** — overdue means the instalment is late and may still
arrive; missed means the cycle closed without payment. Send whichever you record. If
you record both, send both.

**`loan_approved` / `loan_rejected` are your decisions, not your customer's.** They are
carried as signals because they help cross-sell, churn and pre-closure. They are
deliberately not treated as customer intent — a model that learns "approved, therefore
likely to disburse" is repeating a decision you already made.

**`app_login` matters more than it looks.** A borrower on auto-debit may transact twice
a year but open the app monthly. Without it, "this customer went quiet" is judged on
far less evidence than you actually have.

A loan is not "cancelled" the way an order is, so lending has no cancellation event.
`emi_overdue` and `emi_missed` are the vertical's most predictive signals — a lender
that sends neither loses the model that matters most to it.

### Why `emi_paid` matters more than it looks

Window sizes are not typed by anyone; they are scaled by how often a customer acts. For
a shop that is the purchase. **For a lender it is the EMI**, because a borrower takes
one loan and there is no gap between one loan and the next to measure.

A lender that sends no `emi_paid` gets a fixed 14-day fallback, and every goal sized off
it asks a question that is too short — churn ends up asking "will this borrower go quiet
for six weeks?" of people who are normally quiet for months.

**Send `emi_paid` on every instalment, including auto-debits.** It costs one event a
month per borrower and it is what makes the windows correct.

---

## 5. SaaS

All eleven events below are mapped by the industry pack and defined in
`eventSchemas.ts`, so each one's properties are filterable in segments and flows.

| event | properties | notes |
|---|---|---|
| `pricing_page_viewed` | `plan` | browsing |
| `plan_compared` | `plans` | unfinished intent |
| `trial_started` | `plan`, `days_remaining` | |
| `trial_expired` | `plan` | the trial-expiration goal targets this |
| **`subscription_started`** | **`subscription_id`**, `plan`, `total`, `currency`, `interval` | **the purchase** |
| **`subscription_renewed`** | `subscription_id`, `plan`, `total`, `currency` | **recurring revenue, and it sets every window size — see below** |
| `subscription_upgraded` | `subscription_id`, `plan`, `previous_plan`, `total` | expansion, not a first purchase |
| **`subscription_cancelled`** | `plan`, `reason` | **the churn goal targets this** |
| `feature_used` | `feature`, `plan` | the usage signal |
| `user_invited` | `inviter_id`, `role` | |
| `api_key_created` | `key_name`, `scope` | |

**`subscription_id` is the one that matters most.** It identifies the *subscription*,
not the tier. `plan` cannot stand in — two customers on `pro` collapse into one row
during deduplication. Without it, subscriptions are discarded.

**`subscription_cancelled` is both the undo event and the churn label.** A client that
sends it gets a churn model built on a stated fact rather than inferred silence, which
is a materially easier question to answer well.

### Why `subscription_renewed` matters more than it looks

Window sizes are not typed by anyone; they are scaled by how often a customer acts. For
a shop that is the purchase. **For SaaS it is the renewal**, because a customer
subscribes once and then renews on a clock.

A client that sends no `subscription_renewed` gets a fixed 14-day fallback, and every
goal sized off it asks a question that is too short.

---

## 6. EdTech

All thirteen events below are mapped by the industry pack and defined in
`eventSchemas.ts`, so each one's properties are filterable in segments and flows.

| event | properties | notes |
|---|---|---|
| `course_viewed` | `course_id`, `category`, `price` | browsing |
| `course_preview_watched` | `course_id`, `duration_s` | |
| `course_added_to_list` | `course_id` | unfinished intent |
| **`course_enrolled`** | **`enrollment_id`**, `course_id`, `price`, `currency` | **the purchase** |
| `enrollment_refunded` | `enrollment_id`, `price`, `reason` | the cancellation — money actually returned |
| `lesson_started` | `course_id`, `lesson_id` | progress |
| **`lesson_completed`** | `course_id`, `lesson_id` | **sets every window size — see below** |
| `quiz_attempted` | `course_id`, `score` | progress |
| `course_completed` | `course_id` | |
| `certificate_issued` | `course_id`, `certificate_id` | |
| **`course_dropped`** | `course_id`, `reason` | **the completion-risk goal targets this** |
| `subscription_started` | `plan`, `total`, `currency`, `interval` | the subscription-conversion goal targets this |
| `subscription_cancelled` | `plan`, `reason` | |

**`enrollment_id` is the one that matters most.** It identifies the *transaction*, not
the course. Send only `course_id` and a learner who enrols in three courses cannot be
told apart from one course enrolled three times, and a re-enrolment after a break
collapses into the original. Without it, enrolments are discarded.

**Dropping a course is not a refund.** `course_dropped` is the learner giving up;
`enrollment_refunded` is money going back. Only the second reverses revenue. They were
the same event here until now, which asked the cleaner to undo payments that were never
returned — and collided with the completion-risk goal, which is built on drops.

### Why `lesson_completed` matters more than it looks

Window sizes are not typed by anyone; they are scaled by how often a learner acts. For
a shop that is the purchase. **For a course platform it is the lesson**, because
enrolments are rare and lessons are the steady rhythm of the relationship.

A client that sends no `lesson_completed` gets a fixed 14-day fallback, and every goal
sized off it asks a question that is too short.

---

## 7. Your product catalog

Upload it once and keep it current. It fills in what your events omit.

| column | used for |
|---|---|
| `product_id` | joins to `product_id` on events and order lines |
| `base_price` | the item price on browse events, where the event omits it |
| `product_type` | category features |
| `vendor` | brand features |

A populated catalog is usually less work than adding three fields to every event, and
it is the only source for taste features if your events carry only an id.

---

## 8. What happens if you deviate

| deviation | consequence |
|---|---|
| different name for the amount | **88 features and 4 of 5 models lost.** The only loud failure. |
| different name for the order id | orders discarded; same as above |
| `items` instead of `line_items` | 15 basket features silently empty |
| no `session_id` | 8 features silently empty |
| no cancellation event | cancelled and refunded money stays in revenue |
| no `price` on browse, no catalog | 5 price features silently empty |
| no `product_type` / `vendor`, no catalog | 8 taste features silently empty |
| no cadence event (`emi_paid`, a renewal, a lesson) | windows fall back to a fixed 14 days and every goal is sized wrong |
| extra properties we don't know | nothing — stored and ignored |

**Everything except the first two fails silently.** A model still trains and still
reports a plausible score; it simply had less to work with. If a client cannot match a
name, map it on the Event Mapping screen — that screen only offers events which have
actually arrived, so a mapping there cannot point at nothing.

---

## 9. Minimum viable integration

```
order_placed  with  order_id + total
```

That alone trains four of the five models. Everything else in this document adds
features; nothing else is required to start.
