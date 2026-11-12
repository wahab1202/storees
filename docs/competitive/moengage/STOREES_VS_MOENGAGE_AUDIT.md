# Storees vs MoEngage: feature gap audit

**Audit date:** 12 November 2026
**Baselines:** MoEngage dashboard (Test workspace), captured read-only on 11 Nov 2026 · Storees `main` at commit `2063cdc`, assessed from the code
**Supporting evidence:** [MOENGAGE_VS_STOREES.md](MOENGAGE_VS_STOREES.md) is the full comparison report. [modules/](modules/) holds 25 module sections with file and line evidence for every row. `screenshots/` holds 1,856 MoEngage screenshots.

**Contents**
1. [Summary](#1-summary)
2. [Scope, method and rating scale](#2-scope-method-and-rating-scale)
3. [Results by product area](#3-results-by-product-area)
4. [Critical findings (P0)](#4-critical-findings-p0)
5. [High-priority gaps (P1)](#5-high-priority-gaps-p1)
6. [Medium-priority themes (P2)](#6-medium-priority-themes-p2)
7. [Where Storees is ahead](#7-where-storees-is-ahead)
8. [Recommended order of work](#8-recommended-order-of-work)
- [Appendix A. Register of missing features (635)](#appendix-a-register-of-missing-features)
- [Appendix B. Register of partial features (618)](#appendix-b-register-of-partial-features)
- [Appendix C. Limits and open actions](#appendix-c-limits-and-open-actions)

---

## 1. Summary

**Storees matches about a third of what MoEngage offers.** We compared 1,469 MoEngage features with the Storees code:

| Result | Features | Share |
|---|---:|---:|
| ✅ Full parity | 124 | 8.4% |
| 🟡 Partial: Storees has it, but narrower or defective | 618 | 42.1% |
| ❌ Missing in Storees | 635 | 43.2% |
| ⭐ Storees is better | 33 | 2.2% |
| ➖ Not applicable to a web-first Shopify product | 59 | 4.0% |
| **Parity score** | | **33.0%** |

Parity score = (✅ + ⭐ + half of 🟡) ÷ (features − ➖).

**By product area,** parity is highest in the WhatsApp builder (54%), Segment (41.5%) and Engage (40.8%). It is lowest in Reports (13%), Analyze (17.5%), Content (18%) and Settings (24.3%). Section 3 has the full table.

**Key findings**

1. **Broken features are a bigger risk than missing ones.** 27 items are rated P0 (fix or build first), and 17 of them are defects in features that already ship. All 17 were traced through the code a second time on 12 Nov 2026, and every one holds. A demo or trial would run into several of them:
   - SMS campaigns send a blank body.
   - Flow email steps send a hard-coded "You left something behind!" email instead of the designed template.
   - Push loses its title, image and link, and the In-App channel reaches no one.
   - A campaign with no audience picked goes to every customer.
   - Flow branches run into each other, and fixed-time flows message the wrong people.
2. **Four security holes need fixing now** (P0-1 to P0-4):
   - The social-login callback issues a 24-hour session, super-admin included, for any email address it is sent.
   - The server import and event APIs accept the public storefront key, so anyone can bulk-write customers and orders or change a customer's phone number.
   - The flow HTTP step can call internal services, because it has no SSRF guard.
   - A Shopify reinstall wipes every channel credential.
3. **Email and SMS compliance block deals, especially in India.**
   - Campaign and flow emails have no working unsubscribe link and no List-Unsubscribe header.
   - Bounces, spam complaints and Shopify opt-outs are not honoured, and flow emails skip suppression.
   - SMS has no DLT fields, so Indian operators reject it.
4. **Marketers can't self-serve their data.**
   - There is no CSV import and no uploaded-list segment.
   - Custom attributes, country and pincode can't be targeted. City and state are hidden behind a B2B setting.
   - The only exports are a hashed ad-audience CSV, one customer's GDPR export and an API-only consent CSV.
5. **Analytics and reporting are the weakest areas.** The funnel ignores step order, and trends can't be filtered to one event. There are no cross-channel campaign stats, saved or scheduled reports, custom dashboards or alerts.
6. **Commerce essentials are missing:** unique coupon codes, flow revenue attribution, reusable content blocks and landing pages.
7. **Channel breadth trails MoEngage.** Storees has no on-site campaign builder, in-app renderer, first-party web push, ad-audience sync, generic SMS connector, quiet hours or cross-channel frequency cap.
8. **Storees leads in places worth protecting:**
   - WhatsApp operations
   - Shopify-native onboarding and data
   - commerce-native segments
   - pre-send audience checks and holdout lift
   - zero-setup RFM and predictions
   - admin debugging
   - per-recipient smart content on every plan, where MoEngage needs Enterprise

   See section 7.

**Recommended first moves**
1. Hotfix the security and send-path defects. Most are small changes in one file.
2. Log every email send in one ledger, then fix unsubscribe and suppression. Flow conditions, frequency caps and campaign stats all depend on that ledger.
3. India readiness: DLT fields, a generic HTTP SMS connector and quiet hours.
4. Self-serve data: targetable attributes, uploaded-list segments and CSV import.
5. Proof of revenue: flow revenue, coupons, campaign stats and CSV reports.

Until then, lead demos with WhatsApp, Shopify-native data and measurement, and avoid the demo traps listed in section 7.

---

## 2. Scope, method and rating scale

**Scope.** We opened every item in MoEngage's sidebar, header and "+ Create New" menu. That covers 25 areas and 266 pages, modals, drawers and wizard steps, recorded in 1,856 screenshots.

**Method**
- MoEngage was browsed read-only in its Test workspace. Nothing was saved, sent, published, imported or exported.
- Each MoEngage feature was checked against the Storees code, with file and line evidence.
- A second pass re-checked every row and made 315 corrections. A consistency review then aligned 18 rows that disagreed between modules.
- On 12 Nov 2026, all 17 P0 defects in shipped code were traced end to end again. Every one holds, and two overstated details were corrected.

**Limits**
- The MoEngage Test workspace had no data, so we saw screens and options, not results.
- Some areas are paid add-ons or were locked for our role: Inform, Personalize, Recommendations, Warehouse Segments, Computed Traits, My Studio and a few others. These were described from MoEngage's front-end code or public docs.
- Steps that would have saved a draft were not opened.
- Storees was assessed from its code, not a running instance. Appendix C lists the findings to confirm live.

**Rating scale**

| Rating | Meaning |
|---|---|
| ✅ Full | Storees has the same capability |
| 🟡 Partial | Storees has it, but it is narrower or defective |
| ❌ Missing | Storees doesn't have it |
| ⭐ Better | Storees does more than MoEngage |
| ➖ N/A | Not relevant to a web-first Shopify product, for example features that exist only in MoEngage's mobile SDK |
| P0 | Fix or build first: it breaks core sends, compliance or security, or it is a table-stakes gap that loses deals |
| P1 / P2 / P3 | High, medium or low priority |
| S, M, L, XL | Relative effort, from smallest to largest |

---

## 3. Results by product area

| Product area | Parity | | ❌ Missing | 🟡 Partial |
|---|---:|---|---:|---:|
| Segment | 41.5% | `████████░░░░░░░░░░░░` | 60 | 79 |
| Engage | 40.8% | `████████░░░░░░░░░░░░` | 151 | 200 |
| Inform & Personalize | 39.3% | `████████░░░░░░░░░░░░` | 28 | 35 |
| Dashboards | 37.0% | `███████░░░░░░░░░░░░░` | 29 | 34 |
| App Marketplace | 37.0% | `███████░░░░░░░░░░░░░` | 26 | 40 |
| Data & dev tools | 32.9% | `███████░░░░░░░░░░░░░` | 36 | 42 |
| AI (Merlin) | 32.9% | `███████░░░░░░░░░░░░░` | 19 | 17 |
| Settings | 24.3% | `█████░░░░░░░░░░░░░░░` | 141 | 101 |
| Content | 18.0% | `████░░░░░░░░░░░░░░░░` | 32 | 18 |
| Analyze | 17.5% | `████░░░░░░░░░░░░░░░░` | 79 | 40 |
| Reports | 13.0% | `███░░░░░░░░░░░░░░░░░` | 34 | 12 |

| Module | Features | ✅ Full | 🟡 Partial | ❌ Missing | ⭐ Better | ➖ N/A | Parity | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| [01 Engage > Campaigns: list, picker, audience step](modules/01-engage-campaigns.md) | 79 | 13 | 36 | 26 | 1 | 3 | 42.1% | Wizard, nested audience builder and holdouts match; list tooling and cross-campaign stats missing; three P0 send defects |
| [02 Campaign builder: Email](modules/02-builder-email.md) | 81 | 16 | 37 | 27 | 0 | 1 | 43.1% | One-time email works end to end; editor depth well behind MoEngage's Beefree editor; flow-email lookup and unsubscribe are P0 |
| [03 Campaign builder: Push & SMS](modules/03-builder-push-sms.md) | 71 | 6 | 30 | 29 | 1 | 5 | 33.3% | The builder collects far more than the send path uses: blank SMS, push drops content, no DLT or test sends |
| [04 Campaign builder: WhatsApp](modules/04-builder-whatsapp.md) | 64 | 16 | 27 | 15 | 4 | 2 | 54.0% | Strongest module: template authoring, lint and diagnostics lead; empty-audience send, carousels and sync bugs to fix |
| [05 On-site, In-app, Cards, connectors, ad audiences](modules/05-builder-onsite-inapp-other.md) | 72 | 4 | 37 | 27 | 0 | 4 | 33.1% | Only an unlinked opt-in popup; the In-App channel renders nowhere (P0); no on-site builder or ad sync |
| [06 Flows](modules/06-flows.md) | 72 | 10 | 33 | 27 | 2 | 0 | 39.6% | Working journey builder with strong WhatsApp and HTTP steps; five P0 engine defects; thin entry rules |
| **Engage subtotal** | **439** | **65** | **200** | **151** | **8** | **15** | **40.8%** | |
| [07 All Segments, builder, Search Users, profile](modules/07-segments-builder-profiles.md) | 75 | 10 | 40 | 20 | 4 | 1 | 45.9% | Commerce-native engine ahead in places; no file segments, city or custom-attribute targeting (P0s) |
| [08 RFM, Predictive & Warehouse segments](modules/08-segments-rfm-predictive-warehouse.md) | 57 | 10 | 19 | 20 | 6 | 2 | 46.4% | Zero-setup RFM and deeper model management, but neither leads to targeting yet (bucket bug) |
| [09 File segments, user imports & exports](modules/09-segments-files-imports-exports.md) | 44 | 0 | 20 | 20 | 1 | 3 | 26.8% | No marketer-facing import, file segments or export history; ingestion is engineer- and admin-side |
| **Segment subtotal** | **176** | **20** | **79** | **60** | **11** | **6** | **41.5%** | |
| [10 Analyze: My Studio, Users, Behavior, Funnels](modules/10-analyze-core.md) | 75 | 1 | 27 | 45 | 0 | 2 | 19.9% | Unordered funnel and one fixed trend; no Users or Behavior analysis, segment filter, custom dates or exports |
| [11 Analyze: Retention, Session & Source, Paths, Acquisition, Uninstalls](modules/11-analyze-advanced.md) | 52 | 0 | 13 | 34 | 0 | 5 | 13.8% | Only a cohort heatmap with counting defects; no Session & Source or User Paths |
| **Analyze subtotal** | **127** | **1** | **40** | **79** | **0** | **7** | **17.5%** | |
| [12 Home, Dashboards, header, Create New](modules/12-home-dashboards.md) | 79 | 9 | 34 | 29 | 1 | 6 | 37.0% | Better landing dashboard; no campaign stats rollup, custom dashboards, exports, help or Create launcher |
| [13 Content: blocks, recommendations, landing pages, coupons](modules/13-content.md) | 51 | 0 | 18 | 32 | 0 | 1 | 18.0% | No content blocks, landing pages or coupons (P0); ahead on per-recipient smart content in every channel |
| [14 Inform & Personalize](modules/14-inform-personalize.md) | 76 | 10 | 35 | 28 | 2 | 1 | 39.3% | Alerts run as flows with P0 gaps (fallback email, public-key API, DLT); Personalize almost absent |
| [15 Reports](modules/15-reports.md) | 46 | 0 | 12 | 34 | 0 | 0 | 13.0% | No saved, scheduled or exported reports; the on-screen per-campaign report is strong |
| [16 Merlin AI Studio](modules/16-merlin-ai.md) | 42 | 3 | 17 | 19 | 2 | 1 | 32.9% | More in-context AI than Merlin, but no hub, image generation or metering; three shipped AI paths broken |
| [17 Data imports & computed traits](modules/17-data-imports-computed-traits.md) | 40 | 0 | 21 | 16 | 0 | 3 | 28.4% | No file import or Data section; CLV and AOV are free; custom attributes not targetable (P0) |
| [18 Test & Debug, event log, integration guide](modules/18-test-debug-devtools.md) | 51 | 4 | 21 | 20 | 3 | 3 | 36.5% | Admin debugging beats MoEngage; activation (checklist, help, docs) and API auth (P0) lag |
| **Data & dev tools subtotal** | **91** | **4** | **42** | **36** | **3** | **6** | **32.9%** | |
| [19 Settings: Push, Email, SMS & RCS](modules/19-settings-push-email-sms.md) | 63 | 2 | 26 | 33 | 0 | 2 | 24.6% | Credential forms and zero-setup email exist; unsubscribe, suppression, DLT and SMS wiring are P0 |
| [20 Settings: WhatsApp, delivery controls, preferences](modules/20-settings-whatsapp-delivery-preferences.md) | 31 | 2 | 10 | 15 | 1 | 3 | 28.6% | WhatsApp setup ahead after connection; no quiet hours or cross-channel cap; email exclusion is P0 |
| [21 Settings: Accounts (general, API keys, MCP, team)](modules/21-settings-accounts.md) | 42 | 1 | 24 | 17 | 0 | 0 | 31.0% | Pieces exist but scattered; no time zone, key management, invites or permission matrix; two security P0s |
| [22 Settings: Analytics & data management](modules/22-settings-analytics-data-management.md) | 41 | 0 | 16 | 20 | 2 | 3 | 26.3% | Write-time dedup and live volumes beat MoEngage; no event or attribute catalog |
| [23 Settings: Advanced 1 (control groups, tags, locales, Content API, custom domain)](modules/23-settings-advanced-1.md) | 34 | 0 | 8 | 25 | 0 | 1 | 12.1% | None of the six pages exist; SSRF and tracked-button sync are P0 |
| [24 Settings: Advanced 2 (auth, UTM, attribution, alerts, Inform)](modules/24-settings-advanced-2.md) | 54 | 3 | 17 | 31 | 0 | 3 | 22.5% | UTM and goals live only inside builders; no alerting; shares the flow-email and flow-revenue P0s |
| **Settings subtotal** | **265** | **8** | **101** | **141** | **3** | **12** | **24.3%** | |
| [25 App Marketplace](modules/25-app-marketplace.md) | 77 | 4 | 40 | 26 | 3 | 4 | 37.0% | No catalog, but the Shopify install, Event Sources and WhatsApp paths go deeper; reinstall wipes settings (P0) |
| **Total, 25 modules** | **1,469** | **124** | **618** | **635** | **33** | **59** | **33.0%** | |

---

## 4. Critical findings (P0)

The module tables flag 53 rows as P0, and these consolidate into 27 items. The IDs match section 4.1 of the [full report](MOENGAGE_VS_STOREES.md#41-p0-fix-or-build-first-27), which gives file and line evidence and a suggested fix for each item.

### 4.1 Broken in shipped code (17)

| ID | Area | What's wrong | Impact | Effort |
|---|---|---|---|---|
| P0-1 | Security: APIs | The server-only import and event APIs (`/api/v1`) accept the public storefront key. The secret-key check isn't mounted anywhere | Anyone who reads a store's page source can bulk-write customers (with consent flags), orders, products and dealers. They can also change a customer's phone and redirect that customer's WhatsApp and SMS alerts | S-M |
| P0-2 | Security: login | `POST /api/auth/oauth-callback` is public. Given any email, it finds or creates the user and returns a 24-hour session, super-admin included. It bypasses closed registration and two-factor login (TOTP), and Shopify-install logins also skip TOTP | Any account can be taken over, including platform operators' accounts | S |
| P0-3 | Security: flows | The flow HTTP Request step calls any URL without the SSRF guard, follows redirects and has no size cap. The response shows in the flow debugger | A project admin can reach internal services, such as the unauthenticated ML service, and read the reply | S |
| P0-4 | Shopify integration | Every Shopify OAuth callback (reinstall or re-auth) resets the project settings, erasing channel credentials, the WhatsApp chatbot config and AI keys. Merchants also have no Shopify settings screen | One Shopify scope change would silently disconnect WhatsApp, SMS, email and AI for every merchant | S |
| P0-5 | SMS campaigns | SMS campaigns send an empty body, because the typed text never reaches the SMS adapters. The Pinnacle SMS tile has no adapter. The Gupshup adapter never reports an error, so rejected messages are recorded as sent | Every SMS campaign is rejected or arrives blank | S |
| P0-6 | Flow email | Flow email steps look up the template by name, not by the saved id, and without a project filter. When the lookup fails they send a hard-coded "You left something behind!" email. When two projects share a template name they can render another brand's template. Flow emails also pass no From address | Abandoned-cart, welcome and order emails never send what was designed | S |
| P0-7 | Push campaigns | Push drops the per-platform content, title, image and click action. Firebase Cloud Messaging (FCM) gets a hard-coded click action, and every variable, including the customer's email, goes into its data payload | Pushes arrive untitled, and a tap opens nothing | M |
| P0-8 | Campaign audience | "Saved segment" with nothing picked, or a filter with no rules, saves no audience, and sending then falls back to all customers. The confirmation still says "the selected segment" | Accidental whole-base blasts. WhatsApp messages are paid per send, and a blast hurts the account's quality rating | S |
| P0-9 | In-App channel | In-App is offered as a channel, but no SDK renders it. Send Now fails every recipient because of a channel-name mismatch | A buyer who tries In-App sees 100% failure, and no shopper ever sees the message | S to hide; L to ship |
| P0-11 | Email compliance | There is no working unsubscribe:<ul><li>The unsubscribe link is empty.</li><li>No List-Unsubscribe header is sent.</li><li>Blank and column starter templates have no footer.</li><li>The unsubscribe page opts people out on the first visit, so email link scanners would trigger it.</li></ul> | Fails CAN-SPAM, India's DPDP Act and the Gmail and Yahoo bulk-sender rules | S-M |
| P0-12 | Email compliance | Bounces and complaints from campaign and flow email are never suppressed. Shopify unsubscribes aren't checked. Flow emails skip suppression and consent checks entirely | Complainers, hard bounces and opted-out shoppers keep getting mail | M |
| P0-14 | Flow engine | A split branch without its own End step runs on into the other branch's steps | Customers get the other path's messages while the canvas shows something else | S |
| P0-15 | Flow engine | Fixed-time and flow-exit triggers never run as designed, because their trips stall. These flows still enrol everyone who fires the event left over from the create dialog | The flow silently messages the wrong people | M (S stopgap) |
| P0-16 | Flow engine | Email open and click conditions can never be true, because flow emails aren't logged as messages | Every customer takes the No path | M |
| P0-22 | Predictions | Prediction-bucket rules never match, because of a case mismatch and two different banding rules. "Risk Bucket is low" matches everyone. Score filters count unscored customers as 0 | Targeting by prediction is broken, and that is the main reason customers buy predictions | S |
| P0-23 | Analytics | The funnel ignores step order. Purchase-then-view still counts as a conversion, a repeated event returns 0, and anonymous visitors are dropped | The numbers won't match MoEngage's ordered funnel in a side-by-side comparison | M |
| P0-27 | WhatsApp | The hourly and manual template syncs overwrite stored buttons, dropping link tracking and the destination. Sends of tracked-button templates then lack the required URL parameter. Carousel cards are not affected | Meta rejects those sends, for example the abandoned-cart "Complete your order" button, and no clicks are recorded | S |

### 4.2 Missing table-stakes capabilities (10)

| ID | Area | What's missing | Why it matters | Effort |
|---|---|---|---|---|
| P0-10 | Testing | There is no test send for SMS or push, or from a flow send step | MoEngage test-sends every channel to any number, email or device. A test send would have caught the blank-SMS bug | M |
| P0-13 | SMS in India | SMS has no DLT template ID, entity (PE) ID or sender header | Indian operators reject commercial SMS that doesn't match a registered DLT template | M |
| P0-17 | Flow analytics | Flows stop counting conversions after the last step, and they have no revenue or attribution window | Abandoned-cart and win-back ROI, the headline flow number, can't be shown | M |
| P0-18 | Segments | There are no file segments (uploaded lists), and identity matching is exact. A 10-digit mobile number misses Shopify's +91 number, and differently cased emails don't match | Offline, COD-confirmed, event and migrated lists can't be targeted | M |
| P0-19 | Data import | Project admins have no CSV customer import. Bulk import is a JSON API only | Loading a list takes an engineer, which stalls migrations from other vendors | L |
| P0-20 | Segments | City and state appear in the segment builder only when dealer access is on, and there is no country or pincode | Regional campaigns (festivals, languages, serviceability) can't be targeted. City and state can be turned on today with Settings > Project > "Enable dealer-scoped access" | M (S for city and state) |
| P0-21 | Segments | Custom attributes from the SDK, API, connectors or Shopify tags can't be targeted, and there is no attribute catalog | Marketers can't segment on their own data. MoEngage lists tracked attributes with typed operators | M |
| P0-24 | Analytics | Trends can't be filtered to one event and don't count true unique users. Delivery receipts count as customer activity | Basic questions, such as "what is the add-to-cart trend?" or "how many people checked out?", can't be answered | S |
| P0-25 | Reporting | There are no cross-channel campaign stats. The only aggregate is the admin-only Notification Logs, which has no conversions, revenue or email | Nobody can see how the marketing programme is performing. MoEngage's stats table omits WhatsApp, which is an opening for Storees | M |
| P0-26 | Commerce | There are no unique coupon codes and no per-recipient allocation. Campaigns send a template's sample code or a hard-coded code | Unique codes are table stakes for D2C welcome and cart-recovery offers | L |

---

## 5. High-priority gaps (P1)

The module tables flag 213 rows as P1, and these consolidate into 117 items. Section 4.2 of the [full report](MOENGAGE_VS_STOREES.md#42-p1-high-priority-117) explains why each matters against MoEngage and what existing code to build on.

**Messaging infrastructure**

| ID | Gap | Effort |
|---|---|---|
| P1-1 | Log every email send, from campaigns and flows, as a message with the provider's message id. Several P0s depend on this | M |
| P1-2 | Periodic campaigns that actually run on schedule and keep each run's history | M |
| P1-3 | Campaign time zones that work: honour the chosen zone, fix "Send in user time zone", offer the full IANA list | S |
| P1-4 | A workspace time zone, defaulted from Shopify. Fixed-time flows currently fire in UTC | M |
| P1-5 | Delivery throughput, fairness between tenants, and priority for transactional sends. Today one shared limit of about 3,000 sends a minute covers everything | M |
| P1-6 | Quiet hours per channel, in the customer's time zone | M |
| P1-7 | Frequency caps that apply as shown: enforce the email cap, and scope caps to campaigns or flows | M |
| P1-8 | A cross-channel frequency cap | M |
| P1-9 | Automatic retries on temporary provider errors | S |
| P1-10 | A Transactional or Promotional choice on flow send steps | S |
| P1-11 | A fallback channel on the send step ("if not delivered in N minutes, send an SMS") | M |
| P1-12 | A synchronous send API with a secret key, for OTPs and "order shipped" messages | M |

**Email builder and deliverability**

| ID | Gap | Effort |
|---|---|---|
| P1-13 | Verified From addresses only, with the default sender applied to flows | S |
| P1-14 | Make the preheader reach the sent email | S |
| P1-15 | A personalisation picker that inserts a token at the cursor | M |
| P1-16 | Rich-text editing on the email canvas, instead of raw HTML in a sidebar | M |
| P1-17 | Conditional content: if/then/else and display conditions on blocks | L (M first step) |
| P1-18 | A/B tests that do what they say: send the winner, send variant B on SMS and push, add a real WhatsApp variant | M |
| P1-19 | Event webhooks for SendGrid, SES, Postmark and Mailgun, with per-project secrets | M |
| P1-20 | Subscription categories and a hosted preference centre | M |
| P1-21 | CSV import of suppressions and resubscribes, with history | M |

**SMS, push and WhatsApp channels**

| ID | Gap | Effort |
|---|---|---|
| P1-22 | SMS opt-outs: STOP and START replies become consent, and Shopify SMS consent is honoured | M |
| P1-23 | A generic HTTP SMS connector, plus Indian aggregators (MSG91, Karix, ValueFirst, Kaleyra and others) | M |
| P1-24 | SMS delivery receipts that work, for Twilio, Vonage and Gupshup, with signature checks | M |
| P1-25 | Short, tracked links in SMS and push, and in WhatsApp message text | M |
| P1-26 | First-party web push: opt-in prompt, service worker, per-device subscriptions | L |
| P1-27 | FCM hardening: a token cache per tenant, credential validation, test push, several devices per customer, encrypted credentials | S |
| P1-28 | Allow Utility and Authentication WhatsApp templates outside the 24-hour window in campaigns | S |
| P1-29 | UTM tags on WhatsApp campaigns and on flow SMS and push | S-M |
| P1-30 | Deliverable WhatsApp carousels. This blocks the Phase A dynamic-carousel smoke test | M |
| P1-31 | Check the short-link base domain before any tracked-button template is submitted (the CLAUDE.md hard rule) | S |
| P1-32 | Per-brand short-link domains via CNAME | L |
| P1-33 | Meta Embedded Signup. This waits on Meta Tech Provider approval | M |
| P1-34 | Make Gupshup selectable in WhatsApp settings | S |
| P1-35 | Webhook routing for brand-owned Meta apps, and signed channel webhooks | S |
| P1-36 | A choice of WhatsApp number source, with a fallback to the checkout or address phone | M |

**Flows**

| ID | Gap | Effort |
|---|---|---|
| P1-37 | Archive flows, and make delete work once a flow has run. Today it returns HTTP 500 | S |
| P1-38 | A Pause that halts in-flight trips, plus Stop and Completed states | M |
| P1-39 | WhatsApp-first flow templates in the gallery, with a preview | S-M |
| P1-40 | Trigger-filter fixes: typed comparisons, segment-scoped entry, and between, exists and in-list operators | S |
| P1-41 | Alternate (OR) trigger events | S |
| P1-42 | One-time fixed-time entry | M |
| P1-43 | Limit how often a customer can re-enter a flow | S |
| P1-44 | A flow audience step that runs on the SQL segment engine | M |
| P1-45 | A flow control group, with lift | M |
| P1-46 | Wait for an event, with a timeout | M |
| P1-47 | A multi-branch conditional split with named branches | L |
| P1-48 | Wait until a time slot in the customer's time zone | M |
| P1-49 | Block activation of invalid flows, with server-side validation and a clickable errors panel | S |

**Segmentation and profiles**

| ID | Gap | Effort |
|---|---|---|
| P1-50 | Subscription and reachability fields: WhatsApp and push opt-in, first and last seen, device | S-M |
| P1-51 | Segment-in-segment filters, and exclusions in saved segments | M |
| P1-52 | Relative and recurring dates: in the next N days, is today, birthdays and anniversaries | M |
| P1-53 | A working Segment AI. Today it calls a retired model, ignores the project's key, and reads rupee totals as paise | S |
| P1-54 | Search and pagination on the segments list | S |
| P1-55 | A read-only segment detail page | M |
| P1-56 | Reachability by channel on segments | S |
| P1-57 | An event-property picker in performed-event rules | S |
| P1-58 | Profile reachability for every channel | S |
| P1-59 | Save an RFM cell as a segment | S |
| P1-60 | Role and plan checks on prediction routes | S |
| P1-61 | Auto-created low, medium and high segments for each prediction goal | S |
| P1-62 | A plain CSV export of a segment's members, masked and limited to an agent's own customers | S |

**Imports and data management**

| ID | Gap | Effort |
|---|---|---|
| P1-63 | An import wizard: upload, a preview step, and identifier and column mapping | S-M |
| P1-64 | Import rules: opt-in columns become consent records, the original `created_at` is kept, custom attributes are merged | S |
| P1-65 | File-segment follow-ons: a sample file, Add, Remove or Replace from a new file, and saving an import as a segment | S |
| P1-66 | An imports list for project admins | S |
| P1-67 | CSV upload for orders and events, imported as historical data | M |
| P1-68 | Churn Risk and Engagement Score for every customer, refreshed nightly | S |
| P1-69 | An event catalog: first and last seen, 30-day volume, source, search | M |
| P1-70 | Silent-event detection and event-volume alerts | S-M |

**Analytics and reporting**

| ID | Gap | Effort |
|---|---|---|
| P1-71 | One shared date-range picker on every report | M |
| P1-72 | An audience filter on every analysis | S-M |
| P1-73 | Save, name and reopen every analysis | S |
| P1-74 | CSV download on every analytics and dashboard report | S |
| P1-75 | A campaign and flow performance report download | M |
| P1-76 | A configurable Behavior analysis: several event series, attribute filters, split-by, aggregations | M |
| P1-77 | Funnel depth: per-step filters, a conversion window, split-by | M |
| P1-78 | Save a funnel stage as a segment | S |
| P1-79 | A Users analysis: the distribution of any customer property | M |
| P1-80 | Save charts to custom dashboards | L |
| P1-81 | Retention that counts correctly, plus first-purchase cohorts | S |
| P1-82 | A Session & Source report: conversions and revenue by UTM source, medium and campaign | L |
| P1-83 | Per-channel trends across campaigns, including WhatsApp sent, read, clicked and converted | M |
| P1-84 | A rollup across all flows | S |
| P1-85 | WhatsApp report fields: a "Read" label, total vs unique clicks, failure codes, cost per campaign | S |

**Onboarding, help and integrations**

| ID | Gap | Effort |
|---|---|---|
| P1-86 | A merchant setup checklist on Home | S |
| P1-87 | A Need help menu linking to docs, support and the setup guide | S |
| P1-88 | Published user and developer docs, with an API reference | M-L |
| P1-89 | An integration status that tells the truth | S |
| P1-90 | Guided integration validation | M |
| P1-91 | The Shopify app installs tracking automatically, through a web pixel extension and a theme app embed | M |
| P1-92 | Meta (then Google) custom-audience sync from segments | L |
| P1-93 | Admin-only credential and integration routes, with encrypted and redacted secrets | S |

**On-site and in-app**

| ID | Gap | Effort |
|---|---|---|
| P1-94 | Make on-site messages reachable: an Inbound group in the channel picker and a nav link to `/widgets` | S |
| P1-95 | An on-site builder with drafts, tags and scheduling | M |
| P1-96 | Event triggers for widgets | S |
| P1-97 | Audience targeting for widgets | M |
| P1-98 | In-session targeting: URL and UTM parameters, new vs returning visitors | S |
| P1-99 | A template gallery of D2C popups (cart recovery, recommendations, sale, countdown) | M |
| P1-100 | Spin-wheel and scratch-card games, backed by a coupon pool | L |
| P1-101 | Style controls for widgets and in-app messages | M |
| P1-102 | Start and end dates for in-app messages and widgets | S |
| P1-103 | Per-impression attribution and widget analytics | M |

**Content and AI**

| ID | Gap | Effort |
|---|---|---|
| P1-104 | Track where each template is used, and block deleting templates that are in use | M |
| P1-105 | Deeper recommendations: bought together, also viewed, honouring "last viewed", a fallback in flows | M |
| P1-106 | Visible recommendations: product URLs on cards, multi-product variables for WhatsApp and SMS, a rules page with preview | M |
| P1-107 | A coupon list screen: create form, CSV upload, "Generate in Shopify", inventory and redemption report | M |
| P1-108 | Fix the email copywriter's "Apply body", and generate preheaders | S |
| P1-109 | More copywriter languages: Indian regional languages, Hinglish and Tanglish | S |

**Accounts, permissions and alerts**

| ID | Gap | Effort |
|---|---|---|
| P1-110 | An editable project currency, defaulted from the Shopify shop | S |
| P1-111 | Tenant API key management: named keys with secrets, revoke, rotate, admin-only routes | S |
| P1-112 | Member statuses, and access revocation that takes effect immediately rather than after up to 24 hours | M |
| P1-113 | Email invites: several addresses, a set-password link, adding existing users | M |
| P1-114 | Server-enforced permissions: module × action rights, a separate publish right, role presets | L |
| P1-115 | Remove personal data from trip context and the flow debugger, and stop logging full URLs | S |
| P1-116 | A failure-rate alert for campaigns | M |
| P1-117 | Alerts when a WhatsApp template is paused, disabled or drops in quality | S |

---

## 6. Medium-priority themes (P2)

| Theme | Examples |
|---|---|
| List tooling | Campaign and flow filters (date, channel, tags, creator, status), pagination, Pause and Stop for running campaigns |
| Event- and API-triggered campaigns | Turn the "Soon" card into a prefilled one-step flow; API-triggered sends |
| Global control group | A workspace-wide holdout, with per-campaign opt-out and benchmarking |
| Locales | Per-language content for campaigns, flow steps and alerts |
| A/B depth | A/B/n, per-step A/B in flows, automatically optimised splits |
| Email editor depth | Reusable content blocks, saved rows, product carousel, more block types, view in browser, HTML editor with live preview, template gallery |
| Segment operators | Exists and is empty, multi-value strings, more number and date operators, first- and last-time behaviour, aggregations, user affinity |
| Segment management | Archive, duplicate, type filter, create a campaign from a segment, edit history, count refresh |
| Analytics extras | More chart types, chart download, compare segments, OR events, funnel exclusion steps and strict order |
| Dashboards and alerts | Custom dashboards, scheduled dashboard emails, campaign and flow alerts, Slack and Teams destinations |
| Scheduled reports | Saved report list, daily, weekly or monthly runs, Excel output, email delivery |
| API scopes, MCP and login policy | Per-key scopes, a hosted MCP server, enforced two-factor login, active-session list |
| Data governance | Block, hide or mask an event or attribute; display names; fixed data types |
| Import breadth | S3 and SFTP sources, recurring imports, status emails, update-only imports |
| Push, SMS and RCS extras | APNs credentials, action buttons, expiry, notification icons; RCS and MMS; SMS keywords and two-way SMS |
| Email deliverability tooling | Warm-up plan, link-branding domain, metrics adjusted for bots and Apple Mail Privacy Protection, custom SMTP |
| WhatsApp extras | Limited-time-offer templates, template library filters, profiles created from new inbound numbers, Infobip and Karix |
| Personalize and AI extras | Web experiences and on-site A/B tests; an AI hub, image generation, AI journey creation, usage metering |
| Flow canvas tooling | Copy and duplicate steps, undo and redo, go-to steps, wait until a date, secondary triggers, a flow schedule window |
| Personal-data leaks to close | The funnel drill-down returns unmasked contacts and ignores agent scope; campaign recipient lists ignore the contact-data permission. Both are small fixes worth pulling into Phase 1 |
| Integrations hub | One integrations page, Google Ads Customer Match, CDP inputs (Segment, RudderStack), Zapier |

---

## 7. Where Storees is ahead

Lead demos with these. The last column lists what to fix before showing each one.

| Strength | What Storees does | Fix before demoing |
|---|---|---|
| WhatsApp operations | Templates are written, checked against 30 lint rules, submitted and tracked inside the campaign, with AI drafts. Caps, consent and the 24-hour rule follow the template category. Storees has a shared Inbox with an AI chatbot and human handoff, usage and spend by category, and Storees-managed numbers | P0-8, P0-27, P1-30 (carousels), P1-28 (utility window). Hide WhatsApp A/B |
| Shopify-native onboarding and data | One install approval creates the project, registers 17 webhook topics plus GDPR hooks, imports customers with consent, orders, products and collections, and turns on segments and default flows. Checkout is stitched to the browsing session | P0-4 (reinstall wipe); P1-91 (the pixel is still pasted by hand) |
| Commerce-native segments | "Within the same order" conditions; product, collection and category rules for purchases, views and wishlists, with an image picker; revenue that excludes cancelled, returned and refunded orders; 12 seeded segment templates | P0-20, P0-21. The seeded "High Value Customers" segment reads rupees as paise, so its thresholds are 100 times too high |
| Pre-send audience checks | A deliverability funnel from candidates to recipients, with a one-line root cause. Send Now is blocked when over 30% of email recipients haven't opened in 90 days. An audience cap | Opt-outs are counted for email only, and choosing any subscription category blocks everyone (P1-20) |
| Measurement | Holdout lift per goal, with incremental conversions; a view-through vs click-through switch; per-recipient drill-down with failure reasons; revenue without goal setup | The Revenue card shows "$"; email is missing from the logs (P1-1) |
| Predictions and RFM | An RFM grid from install, with tactics and drill-down. Prediction goals with nightly retraining, model accuracy (AUC) tracking, version rollback and hourly cart-abandonment scoring. Next Best Action | P0-22 (bucket bug). The per-segment AUC expander crashes the page. RFM cells can't become segments (P1-59) |
| Smart content on every plan | Recommended products, social proof, cart items and brand details filled in per recipient in email, SMS, push and WhatsApp. MoEngage offers this only on Enterprise and not on WhatsApp. An AI Email Designer that uses the brand kit | P0-6 (flow email), P0-5 (SMS) |
| AI in context | Copywriters for SMS, push and email that apply variants in place; AI Rewrite on email blocks; a WhatsApp template copilot; bring-your-own LLM key | P1-53 (Segment AI broken), P1-108 (Apply body) |
| Admin debugging and data ops | An Event Debugger with an identity-stitching sessions panel. No-code Event Sources with schema inference, "Why didn't this match?" and reprocessing. Signed outbound webhooks. Duplicate events dropped as they are written | The debugger and Event Sources are admin-only |
| Privacy and consent | Server-side masking of email and phone by role; a consent audit trail; consent capture on opt-in widgets that records the exact wording and IP address; GDPR and DPDP export and erasure | P1-115 (personal data in trip context); the funnel drill-down is unmasked |
| Flow extras | A per-customer flow debug tab and a journeys tab; an HTTP step whose response personalises later messages; several exit events; a WhatsApp approval gate; default flows created on connect | P0-3, P0-14, P0-15 |
| Commercial terms | Core analytics, recommendations and lifetime-value metrics on every plan; the WhatsApp bot on paid plans; self-serve upgrade through Shopify billing | Trial plans don't get the bot |
| Click-to-WhatsApp attribution | Leads and engagement for each Meta ad, implicit opt-in, a flow trigger for new leads | The page isn't linked from the nav, and its Converted and Revenue columns are never filled |

**Demo traps to avoid until fixed**
- **Broken sends:**
  - an SMS campaign (P0-5)
  - any flow email step (P0-6)
  - push with a platform selected (P0-7)
  - the In-App channel (P0-9)
  - "Saved segment" with nothing chosen (P0-8)
- **Options that block every recipient:** "Send to: Dealer" on SMS or push, and choosing any subscription category.
- **Features that don't work yet:**
  - WhatsApp A/B
  - carousel templates
  - "User's timezone" scheduling
  - Segment AI
  - prediction-bucket rules
- **Pages that may break:**
  - Analytics > Product Analytics probably never leaves its loading spinner.
  - Expanding "Segments (N)" on Predictions crashes the page.
  - The "Create Flow" link in Segment Transitions goes to a page that doesn't exist.

---

## 8. Recommended order of work

1. **Phase 1, hotfixes.** Every item is small and has no dependencies, except P0-7 (medium).
   - Security: P0-2, P0-3, P1-93, P1-115, and P1-111, which unblocks P0-1.
   - Send path: P0-5, P0-6, P0-7, P0-8, P0-14, P0-27, P0-22 and P0-4. Also two stopgaps: make P0-15 flows check the trigger type, and hide In-App (P0-9).
   - Demo-visible defects: P1-53, P1-108, P1-28, P1-3, P1-40, P1-49 and P1-9.
2. **Phase 2, the email and API foundation.**
   - The email ledger (P1-1) unlocks P0-12, P0-16, P1-7 and P1-8.
   - Add the unsubscribe link and headers (P0-11) and verified senders (P1-13).
   - Then require the secret key on server APIs (P0-1), followed by the send API (P1-12).
3. **Phase 3, India readiness.**
   - SMS: P0-13, P1-23, P1-24 and P1-22.
   - Delivery: P0-10, P1-6, P1-5 and P1-10.
   - WhatsApp: P1-31, then P1-30, then P1-34, P1-35 and P1-29.
4. **Phase 4, marketer self-serve data.**
   - P0-20, then P0-21, then P1-50, P1-51, P1-52 and P1-57.
   - P0-18, then P0-19 together with P1-63 to P1-66.
   - P1-21, once P0-12 is done.
5. **Phase 5, proof of revenue.**
   - P0-17 with P1-45.
   - P0-25 with P1-83 and P1-84.
   - P1-71, then P1-75 and P1-2.
   - P0-26, then P1-107, then P1-100.
6. **Phase 6, analytics credibility.**
   - P0-23 with P1-77, and P0-24 with P1-76.
   - Then P1-72, P1-81, P1-73, P1-74 and P1-82.
7. **Phase 7, activation and reach.**
   - Activation: P1-86, P1-89, P1-87, P1-88 and P1-39.
   - Reach: P1-91 (after P0-4) and P1-92.
   - New surfaces: the In-App renderer, the on-site builder (P1-94 to P1-103), then web push (P1-26).
   - Later: P1-33, once Meta Tech Provider approval lands.

**Dependencies to respect**
- The email ledger (P1-1) comes before P0-12, P0-16, P0-25, P1-7, P1-8 and the email part of P1-75.
- P0-1 needs P1-111, so merchants can get a secret key, and P1-88, so they know how to use it. The import endpoints have no frontend caller and can require the secret right away.
- P0-4 must ship before any new Shopify scope is requested, such as discount codes for P0-26 or the pixel extension for P1-91.
- Submit no dynamic carousel template before P1-31, the short-link base domain. This is the CLAUDE.md hard rule. P1-30 is what unblocks the Phase A smoke test. Fix P0-27 first anyway, because it breaks every other tracked button.
- Normalised identity matching from P0-18 comes before P0-19, and P1-64 ships with P0-19.
- P0-15 comes before P1-42, and P0-14 comes before relying on P1-11 fallbacks.
- P0-26 comes before P1-100 and P1-107.

---

## Appendix A. Register of missing features

Every MoEngage feature rated ❌ Missing in Storees (635 in total), grouped by module, highest priority first. Use the MIS IDs to reference rows in tickets. The module file linked under each heading has the evidence and a recommendation for every row.

**By priority, all modules:** P0 13 · P1 86 · P2 242 · P3 294.

### 01 Engage > Campaigns: list, picker, audience step (26)

By priority: P2 9 · P3 17. Evidence and recommendations: [modules/01-engage-campaigns.md](modules/01-engage-campaigns.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-001 | Campaign list filters | Created-date filter | Presets, Since, Custom Range calendar, Last N D/W/M | P2 | S |
| MIS-002 | Campaign list filters | Channel filter | Searchable multi-select over 11 channels | P2 | S |
| MIS-003 | Campaign list filters | Campaign tags filter (All of / Any of) | Tag filter with All/Any logic and a default tag group | P2 | S |
| MIS-004 | Campaign list filters | Created-by filter | Team-member multi-select | P2 | S |
| MIS-005 | Campaign stats dashboard | Best/worst campaign summary per channel | Highest and lowest CVR and CTR campaigns, plus a total count | P2 | S |
| MIS-006 | Create entry & channel picker | RCS channel | RCS: One Time, Periodic, Event Triggered | P2 | M |
| MIS-007 | Create entry & channel picker | Create a campaign with an AI agent (Merlin) | "Create a Campaign with Merlin Custom Agents" CTA | P2 | L |
| MIS-008 | Builder step 1: audience | User affinity filter | "User affinity" tab | P2 | M |
| MIS-009 | Builder step 1: reachability & control groups | Global control group | Project-wide holdout defined in Settings | P2 | M |
| MIS-010 | Campaign list | Import campaign from another workspace | 2-step drawer: choose a source workspace (including Test environments), select campaigns, import | P3 | M |
| MIS-011 | Campaign list | Integration-pending banner and help card | "Your integration is pending" banner with Check Event Log; help video and doc links | P3 | S |
| MIS-012 | Campaign list | Run Yesterday tab | Campaigns with activity yesterday (GMT) | P3 | S |
| MIS-013 | Campaign list filters | Delivery-type filter | One Time, Periodic, Event, Location, API and Device Triggered | P3 | S |
| MIS-014 | Campaign list filters | Content type filter | Promotional or Transactional | P3 | S |
| MIS-015 | Campaign list filters | Platforms filter | Android, iOS, Web, m-Web, Windows | P3 | S |
| MIS-016 | Campaign list | Shareable filter state in URL | Full filter state as JSON in `?search=` | P3 | S |
| MIS-017 | Campaign stats dashboard | Weekly AI report agent (Merlin) | "Get Weekly Reports with Merlin Custom Agents" | P3 | M |
| MIS-018 | Campaign stats dashboard | Dashboard switcher and custom dashboards | Title dropdown: Key metrics, Reachability, Create new | P3 | L |
| MIS-019 | Create entry & channel picker | MMS channel | MMS: One Time, Periodic, Event Triggered | P3 | M |
| MIS-020 | Create entry & channel picker | Cards channel (inbox) | Cards opens its builder directly | P3 | L |
| MIS-021 | Create entry & channel picker | Additional app channels (Telegram, Line, Viber, Snapchat/Pinterest/Criteo audiences) | ALL APPS section with "See all" | P3 | L |
| MIS-022 | Create entry & channel picker | Connected Apps catalogue | Category counts, conversion, retargeting, messaging and voice apps, "+ Create app", search | P3 | L |
| MIS-023 | Builder step 1: campaign details | User attribute holding the email address | Pick which attribute holds the email | P3 | S |
| MIS-024 | Builder step 1: audience | Compare against another user attribute | Value source: Constant value or User attribute | P3 | M |
| MIS-025 | Builder step 1: audience | Duplicate block and collapse to summary | Duplicate icon; completed blocks collapse to one line | P3 | S |
| MIS-026 | Builder step 1: reachability & control groups | Per-platform push reachability | Android, iOS and Web counts as % of reachable users | P3 | M |

### 02 Campaign builder: Email (27)

By priority: P1 3 · P2 13 · P3 11. Evidence and recommendations: [modules/02-builder-email.md](modules/02-builder-email.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-027 | Personalization | Coupons (unique codes per user) | Coupon list giving each user a unique code; fallback "Do not send Email" or "Use a fallback coupon" | P1 | L |
| MIS-028 | Personalization | Conditional content (If / Then / Else) | If [user attribute \| product set] [operator] [value], add/group conditions, else-if rows, Else fallback; 13 string operators | P1 | L |
| MIS-029 | Variations, A/B and locales | Automatic split optimisation / sending the winner | Merlin shifts users to the best variation by open rate, click rate or both over 2 or 4 hours | P1 | M |
| MIS-030 | Step 2: Gmail annotation | Sender logo | Image URL or upload (PNG/JPEG at 4:5, 1:1 or 1.91:1) | P2 | S |
| MIS-031 | Step 2: Gmail annotation | Product carousel | Manual or product-set carousel: currency; image, promo URL, headline, price and discount per product | P2 | M |
| MIS-032 | Personalization | Fallback: do not send when data is missing | "Do not send Email"; merge tags default to `\|default('MOE_NOT_SEND')`, which cancels the send | P2 | M |
| MIS-033 | Personalization | Reusable content blocks | Content blocks tab and a Content Block editor block, with "insert only the content" to detach | P2 | M |
| MIS-034 | Personalization | Custom Jinja code | Raw Jinja editor for variables, logic and API calls | P2 | L |
| MIS-035 | Variations, A/B and locales | A/B/n (three or more variations) | Variation tabs 1 to n | P2 | M |
| MIS-036 | Variations, A/B and locales | Locales (content per language) | "+ Locale" with per-locale content; preview labelled "Default x Variation 1" | P2 | L |
| MIS-037 | Drag-and-drop editor | Table, Video, Icons, Menu, GIFs and Stickers blocks | Table; Video (YouTube/Vimeo preview image); Icons; Menu (mobile hamburger); GIFs (GIPHY); Stickers | P2 | M |
| MIS-038 | Drag-and-drop editor | View in browser special link | "View in browser" under frequently used special links | P2 | M |
| MIS-039 | Drag-and-drop editor | Row display conditions | Display condition with name, description and Before/After wrappers | P2 | M |
| MIS-040 | Drag-and-drop editor | Saved rows | Saved rows grouped as Empty, Default, Footer, Header, Promotional, with search and a save icon per row | P2 | M |
| MIS-041 | Drag-and-drop editor | Other email settings: width, alignment, font, link colour, background image, title, custom head HTML | Settings tab with all of these | P2 | S |
| MIS-042 | Drag-and-drop editor | Confirmations for Change template and Switch to HTML | "Change template" warns that changes will be lost; "Switch to HTML" is a confirmed one-way switch | P2 | S |
| MIS-043 | Step 1: Target users | User attribute with email address | Required: choose which attribute holds the address (e.g. Email (Standard)) | P3 | M |
| MIS-044 | Step 2: Template chooser | Upload HTML template as a zip | Custom HTML editor > Upload HTML template in Zip format | P3 | M |
| MIS-045 | Step 2: Attachments | Attach a file by URL | Attachments > URL: paste a URL and Attach | P3 | S |
| MIS-046 | Step 2: Attachments | Personalized attachment | Per-user attachment via the personalisation drawer, with No fallback / Do not send / Attachment link | P3 | M |
| MIS-047 | Step 2: Gmail annotation | Annotation preview and live warnings | Promotions-tab preview for a chosen user, with warnings such as "No Headline: Product 1" | P3 | M |
| MIS-048 | Personalization | Aux data | Personalise from external lookup tables, with a fallback | P3 | L |
| MIS-049 | Personalization | Jinja AI (natural language to Jinja) | Jinja AI (Beta): prompt plus starter prompts, generates Jinja | P3 | M |
| MIS-050 | Drag-and-drop editor | Block options: hide on desktop or mobile | Padding per side and "Hide on" desktop or mobile | P3 | S |
| MIS-051 | Custom HTML editor | Link and image personalisation helpers | Build a personalised URL and copy it; image URL with "@" and a fallback image or "Do not send" | P3 | S |
| MIS-052 | Preview and test | Tablet preview and resolution | Desktop, tablet and mobile with resolution | P3 | S |
| MIS-053 | Preview and test | Inbox preview (email-client rendering tests) | "Run and save test" in real clients; 10 tests a month on this plan | P3 | L |

### 03 Campaign builder: Push & SMS (29)

By priority: P0 2 · P1 3 · P2 10 · P3 14. Evidence and recommendations: [modules/03-builder-push-sms.md](modules/03-builder-push-sms.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-054 | Step 2: SMS content | DLT Template ID (India) | "Template ID" field; the tooltip says it is mandatory under India's DLT rules | **P0** | M |
| MIS-055 | Step 2: Variants, preview and test | Test send | "Test Campaign": by Unique ID, Email, Mobile (registered or external), GAID, IDFA, device push token (push) or Custom Segment; pick locale and variation; reuse the preview sample; ignores frequency caps | **P0** | M |
| MIS-056 | Step 2: SMS content | Shorten and track URLs (custom domain) | Links shortened to 30-35 characters and click-tracked; custom short domain in Settings; UTM added only to shortened links | P1 | M |
| MIS-057 | Step 2: Personalization | Coupons | Pick a coupon list; fallback "Do not send" or "Use a fallback coupon" | P1 | L |
| MIS-058 | Step 3: Goals and delivery controls | DND / quiet hours and "Ignore DND settings" | "Ignore DND settings" on event-, device- and location-triggered SMS and push; DND hours are respected unless it is ticked | P1 | M |
| MIS-059 | Step 1: Target users | Setup check: no SMS connector | Red banner "No SMS connector found…"; step 1 turns red on Next and the sender list is empty, so an unconfigured channel cannot publish | P2 | S |
| MIS-060 | Step 1: Target users | Setup check: push platforms | Inline errors per unconfigured platform (no FCM key, no APNS certificate, no web push) with "here" links; Next and the stepper blocked with a toast; error icon on the step | P2 | S |
| MIS-061 | Step 1: Target users | Global control group | "Global control group" toggle that applies a workspace-wide holdout from Settings | P2 | M |
| MIS-062 | Step 2: Push content | Action buttons | "+ Action button": name, 11 click actions (screen, deep link, rich landing, call, share, copy, set attribute, track event, custom, snooze, remind later), URL and KV pairs; iOS buttons from categories; Web buttons with title, icon and URL | P2 | M |
| MIS-063 | Step 2: SMS content | MMS and RCS | App strings: SMS, MMS, "RCS only", "RCS with SMS as fallback"; MMS up to 10 images of 0.6 MB; Sinch, Twilio, ICS, Kaleyra, Gupshup. Not visible without a connector | P2 | L |
| MIS-064 | Step 2: Personalization | Fallback: do not send when the value is empty | "Do not send SMS" / "Do not send Push" when the personalised value is empty | P2 | S |
| MIS-065 | Step 2: Personalization | Conditional content (If / Then / Else) | Display name, If user-attribute conditions with groups, Then text, Else fallback | P2 | M |
| MIS-066 | Step 2: Variants, preview and test | Locales | "+ Locale": language versions (search, + New Locale); tests can pick locale and variation | P2 | M |
| MIS-067 | Step 3: Push advanced | Push expiry and inbox removal | "Expire notifications after" 36 Hour(s) or Minute(s); "Remove notifications from inbox after" 30 Days or Hour(s) | P2 | S |
| MIS-068 | Triggered campaigns | Minimum delay between two messages | Minimum gap between two messages from the same campaign (push defaults to 15 hours; SMS 0 means off) | P2 | S |
| MIS-069 | Step 1: Target users | Mobile-number attribute picker (SMS) | Required "User attribute that stores user's mobile number", default Mobile Number (Standard), searchable list of every attribute | P3 | M |
| MIS-070 | Step 2: Push content | Background update (silent push) and sending it to opted-out users | "Background update" template (New), plus a step 3 option to send background pushes to opted-out users | P3 | M |
| MIS-071 | Step 2: Push content | Android notification channel | Required "Notification channel" (e.g. general, High) with "Manage notification channel" and an importance tooltip | P3 | S |
| MIS-072 | Step 2: Push content | Emoji picker in text fields | Emoji picker with categories and search beside each field | P3 | S |
| MIS-073 | Step 2: Push content | AI image generation (Merlin "Generate image" and AI Designer) | Image description in the Merlin drawer (100 images a month) and "Merlin AI Designer" as an image source | P3 | M |
| MIS-074 | Step 2: Push content | Android advanced: coupon code, large icon, auto-dismiss, group key, update key | Coupon code, large icon (app icon, upload or URL), auto-dismiss after N, group key and update key | P3 | M |
| MIS-075 | Step 2: Personalization | Content blocks | Insert a saved content block, optionally only its content | P3 | M |
| MIS-076 | Step 2: Personalization | Aux data (lookup tables) | Values from auxiliary data tables | P3 | M |
| MIS-077 | Step 2: Personalization | Custom Jinja and natural-language Jinja | Jinja editor plus "Create Jinja snippets using natural language with Merlin AI" | P3 | L |
| MIS-078 | Step 2: Variants, preview and test | Automate QC with Merlin Custom Agents | Button in the Test Campaign card | P3 | M |
| MIS-079 | Step 3: Schedule | Pre-compute audience | Computes the audience about an hour before a scheduled push so slow segments don't delay it (skipped if edited within 30 minutes) | P3 | M |
| MIS-080 | Step 3: Push advanced | Push priority, APNS priority, interruption level and relevance score | "Send at priority" (Android); APNS Priority 10, 5 or 1; Interruption Level Active, Passive, Time-sensitive or Critical; Relevance Score 0-1 | P3 | S |
| MIS-081 | Triggered campaigns | Merlin intelligent delay optimisation | Merlin picks each user's trigger delay from click rates, between a minimum and maximum (30 minutes to 30 days) | P3 | L |
| MIS-082 | Governance | Approval workflow, teams and AI decisioning | Found in builder state but not shown in this workspace: approval flow, team assignment, "AI Campaign Decisioning" delivery strategy, max sends, waterfall segments | P3 | L |

### 04 Campaign builder: WhatsApp (15)

By priority: P1 2 · P2 7 · P3 6. Evidence and recommendations: [modules/04-builder-whatsapp.md](modules/04-builder-whatsapp.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-083 | Settings: Sender configuration | Meta Embedded Signup | Meta ("New"): "Add sender" launches Meta's embedded sign-up to create or link the WABA and number | P1 | M |
| MIS-084 | Settings: DND | Quiet hours, and "Ignore DND" per triggered campaign | DND hours in the user's time zone; messages discarded or queued until DND ends (all, one per campaign or one overall), sent at once or spaced out | P1 | M |
| MIS-085 | Step 1: Target users | Audience: User affinity | User affinity tab (predicted or most-frequent attribute values) | P2 | L |
| MIS-086 | Step 1: Target users | Global control group | Global control group toggle (needs a workspace-level group); no campaign holdout here | P2 | M |
| MIS-087 | Event Triggered: Step 1 | Alternate trigger events (OR) | "+ Add alternate trigger event": any one of several events starts the message | P2 | S |
| MIS-088 | Event Triggered: Step 1 | "Before" a date attribute | Timing dropdown offers Before (needs a date attribute) and After | P2 | M |
| MIS-089 | Step 2: Content | Limited-time-offer (LTO) templates | Offer detail, "Offer ends on" date-time, mandatory coupon button (code only) | P2 | M |
| MIS-090 | Step 3: Periodic | Repeat every N, several weekdays, Nth weekday, end after N, next-send preview | Repeat every N; weekday chips; days-of-month grid or [First..Last] weekday; Ends After N; "Campaign will be next sent on …" | P2 | M |
| MIS-091 | Step 3: Event Triggered | Minimum delay between two messages | "Minimum delay between two messages [N] hours" (0 = ignored) | P2 | S |
| MIS-092 | Step 1: Target users | Send ignoring opt-in preference | Checkbox "Send campaign to users ignoring Opt-in preference" | P3 | S |
| MIS-093 | Step 2: Content | Select sender; several senders per BSP | Sender picker (only senders with an active template); several senders per BSP | P3 | L |
| MIS-094 | Step 2: Content | Location header | Latitude/longitude header (code only) | P3 | S |
| MIS-095 | Step 2: Content | Sherpa decisioning and predictive insights | Automatic user distribution over 60 minutes; "Predictive Insights by Sherpa" (code only) | P3 | XL |
| MIS-096 | Settings: Sender configuration | Custom / generic WhatsApp connector | "WhatsApp Custom Sender Integration" with API details and transport- or message-level (JWE) encryption (feature-gated) | P3 | L |
| MIS-097 | Settings: Data | PII tokenization | Keep PII in a secure store; MoEngage fetches it from an endpoint at send time; enabled via the CSM | P3 | XL |

### 05 On-site, In-app, Cards, connectors, ad audiences (27)

By priority: P1 4 · P2 16 · P3 7. Evidence and recommendations: [modules/05-builder-onsite-inapp-other.md](modules/05-builder-onsite-inapp-other.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-098 | On-site: Target users | In-session attributes: Query Parameter (15 operators, case-sensitive) and User Type (New / Returning) | In-session rows: Query Parameter (name, operator, value, Case Sensitive) and User Type (New, Returning). | P1 | S |
| MIS-099 | On-site/In-app: Content | Pre-built template gallery with filters (Type, Vertical, Use case, Content, Editor), search, Pre-built vs Saved | 78 pre-built templates, a filter rail with counts, search, All / Pre-built / Saved, hover 'Select template' with live preview. | P1 | M |
| MIS-100 | On-site/In-app: Content | E-commerce use-case popups: cart abandonment, product recommendation, sale/offer, countdown, feature announcement | 'Cart abandoned Popup', 'Product Recommendation Popup', 'Sale Popup', 'Offer Popup', 4 countdown timers, feature announcements. | P1 | M |
| MIS-101 | On-site/In-app: Content | No-code gamification: spin wheel and scratch card (win %, sectors, coupon per sector, winning/losing screens) | Spin wheel / Winning screen / Losing screen tabs and a sectors table (win %, title, colours, coupon code, lose option); 6 wheels and 4 scratch cards in the gallery. | P1 | L |
| MIS-102 | Channel picker | 'Create a Campaign with Merlin Custom Agents' (an AI agent builds the campaign) | Pink bar in the New Campaign modal that starts campaign creation with Merlin AI custom agents. | P2 | L |
| MIS-103 | Connected apps | Connected Apps catalogue: categories with counts, search, Custom apps (+ Create app), 'paid add-on, Request access' | 'See all' opens Connected Apps: Custom apps (0), Conversions (4), Messaging apps (3), Retargeting (8), Voice calls (1), search, and 'Request access' tooltips. | P2 | M |
| MIS-104 | Connected apps | Conversions: TikTok, Snapchat and Microsoft Ads Conversions | TikTok, Snapchat and Microsoft Ads Conversions tiles (paid add-ons). | P2 | M |
| MIS-105 | On-site: Target users | In-session attributes: Day of the week, Time of the Day, GeoLocation (country) | Day of the week, hourly Time of the Day buckets, GeoLocation 'in the following `<country>`'. | P2 | M |
| MIS-106 | On-site: Target users | Global control group | Global control group toggle (none was defined in the test workspace). | P2 | M |
| MIS-107 | On-site/In-app: Content | Surveys and feedback: radio and multi-screen surveys, NPS slider, emoji or star rating, text box | Survey Popup templates (Emoji and Text Box, Radio Buttons with Emoji, Multi Screen, NPS Slider), emoji-rating nudge, Feedback Popup. | P2 | M |
| MIS-108 | On-site/In-app: Content | Start from scratch: Drag & drop editor (blank) | Beefree-style editor in a phone frame: CONTENT blocks (Title, Paragraph, Image, Button, HTML, Video, Form...), ROWS, SETTINGS. | P2 | L |
| MIS-109 | On-site/In-app: Content | Start from scratch: Custom HTML upload and ZIP upload (Create pop up / Create nudge) | Upload tiles for your own HTML or a ZIP of template files. | P2 | M |
| MIS-110 | On-site/In-app: Content | Click actions: Copy Coupon Code, Share, Call, SMS, Custom Action, Request Notification Permission, Navigate to notification settings | The rest of the widget action list. | P2 | M |
| MIS-111 | On-site/In-app: Content | Locale variants ('+ Locale', + New Locale) | Locale menu for per-locale content. | P2 | M |
| MIS-112 | On-site/In-app: Content | Test on device ('Preview in-app' / Test Campaign by identifier type) | Locale and variation selector, identifier type (Unique ID, Email, Mobile, GAID, IDFA, push token, segment), value, Test. | P2 | S |
| MIS-113 | On-site/In-app: Content | HTML code editor: code view, sample templates, file upload, Merlin AI edits, JS bridge (trackClick, trackEvent, setUserAttribute, dismiss) | HTML template editor with Code View, sample templates, Upload files, Clear and a Merlin AI coachmark. | P2 | M |
| MIS-114 | On-site/In-app: Schedule & delivery | Periodic (Daily / Weekly / Monthly) with a daily active window and 'next sent on' preview | Repeat every N days/weeks/months, a daily active window (start/end time), next-send preview, Reset to defaults. | P2 | S |
| MIS-115 | On-site/In-app: Schedule & delivery | Campaign priority (Critical / High / Medium / Normal / Low) | Higher priority wins when two campaigns are eligible; on a tie the newest wins. | P2 | S |
| MIS-116 | Connector | One Time webhook campaign to an audience (audience, exclusions, control groups; ASAP or scheduled) | Step 1 Target users; Step 2 API request; Step 3 send time, goals, de-duplication, delivery controls, request limit; Publish. | P2 | M |
| MIS-117 | Other channels | RCS Native (SMS only / RCS only / RCS with SMS fallback; no-code rich-card carousel editor) | Locked upsell: Intelligent SMS Fallback, No Code Editor, Smart Targeting, Cross-Channel by Design. | P2 | L |
| MIS-118 | On-site: Content | 'Request for a template' | Request-a-template option in the on-site template flow (seen in app code). | P3 | S |
| MIS-119 | In-app (mobile) | Native mobile in-app: Android and iOS; triggers On session start, On screen load, On custom event; Immediately or After N seconds | In-app Step 1 with Android/iOS platforms, three trigger tiles and Immediately / After Delay timing. | P3 | XL |
| MIS-120 | On-site/In-app: Content | User distribution: 'Dynamically using Merlin AI' vs Manual; objective; control group in the split | Drawer with objective, AI-optimised or manual split, + Campaign control group, reset. | P3 | L |
| MIS-121 | Cards | Cards (app inbox / news feed of persistent cards) | Locked paid add-on; upsell tabs High Engagement, Customize As Needed, Higher Reach, Non-intrusive Messaging. | P3 | L |
| MIS-122 | Connector | Remove duplicate users by a duplicate key (any user attribute) | 'Remove duplicate users' with a duplicate key picked from user attributes. | P3 | S |
| MIS-123 | Other channels | MMS | Locked upsell (rich media, longer messages, personalised visuals); US, Canada and Australia only. | P3 | M |
| MIS-124 | Other channels | Telegram, Line and Viber messaging apps | Tiles under ALL APPS and Messaging apps; paid add-ons with 'Request access'. | P3 | M |

### 06 Flows (27)

By priority: P0 1 · P1 9 · P2 11 · P3 6. Evidence and recommendations: [modules/06-flows.md](modules/06-flows.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-125 | Create & goals | Goal revenue and conversion window | "Revenue performance" per goal; "Track above goal for N Hours/Days" from impression/click (default 36 h); Performance column on Total Conversion | **P0** | M |
| MIS-126 | Flow list | Archived flows (archive instead of delete) | "Archived flows" toggle lists archived flows separately | P1 | S |
| MIS-127 | Entry triggers | Alternate trigger events (OR) | "+ Add alternate trigger event": doing any one of several events enters the user | P1 | S |
| MIS-128 | Entry triggers | At fixed time: One Time | One Time: As soon as possible, or at a specific date and time in the campaign time zone | P1 | M |
| MIS-129 | Entry triggers | Limit user entry (max N entries per period) | "Limit user entry": at most N entries per user in N Days/Weeks/Months/Year (default 1 in 1 Year); shown as Entry Limitation | P1 | S |
| MIS-130 | Audience & control groups | Flow control group (% holdout, sticky membership) | On by default at 5% of entrants, with "continue to be part of it for subsequent entries" | P1 | M |
| MIS-131 | Canvas: actions | Test send from a send node | "Test Campaign" in the Email, SMS, WhatsApp and Connector editors (ignores frequency capping) | P1 | M |
| MIS-132 | Canvas: conditions | Keep evaluating for the next N (wait for event with timeout) | Has done event, Conditional Split and Check User Attribute can keep evaluating for N Min/Hour/Day (on by default, 5 min) | P1 | M |
| MIS-133 | Canvas: controls | Wait: time slot | Time slot in the workspace, user or any IANA zone; Any day, Weekdays, Weekends or a weekday between hh:mm and hh:mm; "+ Add time slot"; summary sentence | P1 | M |
| MIS-134 | Flow settings | Messaging control: Ignore DND | "Ignore DND settings" toggle (on by default) | P1 | M |
| MIS-135 | Flow list | Status tabs with counts (All, Active, Run Yesterday, Drafts) | Four counters; Active = "Currently Active Flows"; Run Yesterday = activity yesterday (GMT) | P2 | S |
| MIS-136 | Flow list | Search and filters (created date, delivery type, status, tags, created by) | Search; date presets; delivery type; status; More filters (tags All/Any, Created by); filter state in the URL | P2 | S |
| MIS-137 | Entry triggers | Flow schedule (start, end, time zone) | Start As soon as possible or at a date/time; Ends Never or On a date/time; campaign time zone; Reset to defaults | P2 | M |
| MIS-138 | Audience & control groups | Audience: Exclude users and Show count | "Exclude Users" with its own filter; "Show count" for audience size | P2 | S |
| MIS-139 | Audience & control groups | Global control group | Global control group toggle (disabled until defined in settings) | P2 | M |
| MIS-140 | Canvas: actions | In-app and On-site nodes | 3-step mini-wizards. In-app: Android/iOS, session start / screen load / custom event, screens, delay. On-site: Web/Mobile Web, page load / custom event / exit intent, delay or scroll, pages. Seen / clicked / closed conditions | P2 | L |
| MIS-141 | Canvas: actions | Ad audience sync nodes (Facebook, Google Ads) | Facebook (Add) and Google Ads Audience nodes add flow users to retargeting audiences (integration required) | P2 | L |
| MIS-142 | Canvas: conditions | Connector sent successfully condition | Yes/No condition after a Connector node | P2 | S |
| MIS-143 | Canvas: controls | Wait: date & time | Next Day, Next Monday…Sunday or a specific date, until hh:mm in a chosen zone | P2 | M |
| MIS-144 | Canvas UX | Copy / duplicate steps | Node actions Copy (copy and paste stages), Edit, Delete | P2 | M |
| MIS-145 | Canvas UX | Undo / Redo | Undo and Redo in the canvas toolbar | P2 | S |
| MIS-146 | Flow list | Flow tags and default tag taxonomy | Flow tags with Manage tags; default tags (activation, engagement, onboarding, promotional, retention, transactional…); All/Any tag filter | P3 | S |
| MIS-147 | Templates | Locked feature: Intelligent path optimizer (Sherpa) | Browse Abandonment is locked behind a self-optimising path split; it also uses Facebook retargeting | P3 | L |
| MIS-148 | Templates | Locked feature: Cards (app/web inbox) | "Engage customers on App / on Web" need Cards (and NBA); Web also uses Web Push, On-site and Google Ads | P3 | XL |
| MIS-149 | Audience & control groups | Audience: User affinity | "User affinity" tab for event-based preference targeting | P3 | L |
| MIS-150 | Canvas: actions | Add more channels (Telegram, Line, Viber, Snapchat, Pinterest, TikTok Ads) | Locked "Add more channels" column, unlocked through Marketplace apps | P3 | L |
| MIS-151 | Flow settings | Preferences: send to opted-out users per channel | "Send campaigns to the users opted-out from Preference Management for" Push, SMS, WhatsApp | P3 | L |

### 07 All Segments, builder, Search Users, profile (20)

By priority: P0 2 · P1 4 · P2 8 · P3 6. Evidence and recommendations: [modules/07-segments-builder-profiles.md](modules/07-segments-builder-profiles.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-152 | All Segments | File segment: create and edit (add, remove or replace users from a file) | File Segment type. Edit modal: Add / Remove / Replace users; drag-and-drop CSV (one column, max 64 MB) or HTTPS URL (public, up to 300 MB); "Download a sample"; identifier attribute and data type (must be unique); up to 50 alert emails | **P0** | M |
| MIS-153 | Segment builder | User property: Tracked Custom Attributes | Tracked Custom Attribute group listing the workspace's custom attributes (e.g. Contact Level, Gender), with typed operators | **P0** | M |
| MIS-154 | All Segments | Search custom segment | "Search custom segment" box on the list toolbar | P1 | S |
| MIS-155 | Segment info | Segment detail page (row "View") | Custom Segment Info page (new tab): Edit and an Actions menu (Duplicate, Archive, Create campaign, Analyze), a metadata card, a count card, collapsible "Reachability and Sample Users" and "Segment Edit History" sections | P1 | M |
| MIS-156 | Segment builder | Date granularity and recurring matches (birthdays, anniversaries) | Granularity: Date, Daily where the hour, Weekly where the day, Monthly where the day, Yearly where the month, Yearly where the date | P1 | M |
| MIS-157 | Segment builder | Custom segment filter (member of an existing segment) | Custom segment tab: pick an existing segment from a searchable list (exclusion goes through Exclude Users) | P1 | M |
| MIS-158 | All Segments | Segment Type filter | "Select Segment Type" multi-select (File, Filter, Warehouse - SQL) with Clear all / Select all | P2 | S |
| MIS-159 | All Segments | Row action: Duplicate | Duplicate in row and detail menus (disabled with a tooltip for segments imported from Import Users) | P2 | S |
| MIS-160 | All Segments | Row action: Create campaign (channel and campaign type modal) | Modal with the segment description, Channel Type (In-App, On-site, Google Ads Audience, Facebook Audience, Email, MMS, Push, SMS, RCS, Connector, WhatsApp) and a channel-dependent Campaign Type (Email: Event Triggered, One Time, Periodic) | P2 | S |
| MIS-161 | Segment info | Segment Edit History | Collapsible audit section on the detail page (empty state "Oops! No edit history available") | P2 | M |
| MIS-162 | Segment builder | exists / does not exist / is empty / is not empty | exists and does not exist on date, numeric, string and boolean attributes; is empty and is not empty on strings | P2 | S |
| MIS-163 | Segment builder | Behavior: for the first time / for the last time | Execution options "for the first time" and "for the last time" | P2 | M |
| MIS-164 | Segment builder | User affinity | Has Executed event with an affinity type (Predominantly / For a minimum of N % of times / Most no. of times / Least no. of times) "with" an event attribute or a time attribute (hour of day, day of week, day of month, month of year), extra attribute rows and a time range | P2 | L |
| MIS-165 | User Profile | Timeline filter: date range | Date Range in the project timezone with presets (Today, Yesterday, Last 7 Days, Last Week, Last 30 Days, This Month, Custom Range, Last N days/weeks/months); Reset all / Cancel / Apply | P2 | S |
| MIS-166 | All Segments | Feature walkthrough video | "Watch video" opens an "All Segments Feature Walkthrough" video modal (also on Create segment) | P3 | S |
| MIS-167 | Segment builder | User property: No. of Sessions, Random User Bucket, User Creation Source | Lifecycle group also has No. of Sessions, Random User Bucket and User Creation Source | P3 | S |
| MIS-168 | Segment builder | User property: Device Data | Device Data group: Advertising Identifier (iOS & Windows), Browser Details, Google Advertising ID, Mobile User, OS Version iOS | P3 | S |
| MIS-169 | Segment builder | Value source: compare with another user attribute | Value source Constant value or User attribute; compares against another attribute of the same data type | P3 | M |
| MIS-170 | Segment builder | Query results history | Logged "Query results" table: Query Time, Description, Source (Segmentation, Push Campaign, Email Campaign), User Count, Reachable Users, re-run icon; rows expand; row menu Edit query, Create campaign, Create custom segment, Show sample users, Analyze segment | P3 | M |
| MIS-171 | User Profile | Timeline filter: platform | Platform filter: Android, iOS, Web, Other | P3 | S |

### 08 RFM, Predictive & Warehouse segments (20)

By priority: P0 1 · P1 3 · P2 6 · P3 10. Evidence and recommendations: [modules/08-segments-rfm-predictive-warehouse.md](modules/08-segments-rfm-predictive-warehouse.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-172 | Entry points | New File Segment (uploaded static list) | "+ New File Segment" and a File Segment card; saved file segments can be picked in the Custom segment filter | **P0** | M |
| MIS-173 | RFM Segments | Act on a cell: Create segment | Segment name and description; then View, Analyze or Create campaign. Saved as type `rfm_segment` | P1 | S |
| MIS-174 | Predictive Segments | Create/manage permissions and Demo-account gating | Creation disabled on Demo accounts; users without create/manage rights see a permission message | P1 | S |
| MIS-175 | Predictive Segments | Auto-created segments: low, medium and high for each prediction | Three segments created automatically, ready to target | P1 | S |
| MIS-176 | RFM Segments | Date range (default last 30 days; presets, Last N D/W/M, custom range) | Date-range picker in RFM Options; Custom Range opens a two-month calendar | P2 | M |
| MIS-177 | RFM Segments | Filter Users: All users or a filtered audience | Radios All users / Filter users by, with the standard filter builder | P2 | M |
| MIS-178 | RFM Segments | Scoping filters: User affinity and Custom segment (member of a saved segment) | Tabs User affinity (Has Executed + event) and Custom segment (pick a saved or file segment) | P2 | M |
| MIS-179 | RFM Segments | Chart and table export (PNG, JPEG, SVG, PDF, XLS, CSV) | Export menu on the chart and table cards | P2 | S |
| MIS-180 | RFM Segments | Act on a cell: Create campaign | Campaign configuration: target audience (optionally with a trigger condition), channel type, delivery type | P2 | S |
| MIS-181 | Predictive Segments | "+ Filter" extra conditions and "Reset filter" | More conditions and attribute filters on the outcome | P2 | M |
| MIS-182 | RFM Segments | Analysis types RF, FM, RM | Dropdown RFM / RF / FM / RM with hover descriptions; the subtitle and visible tabs follow the model | P3 | M |
| MIS-183 | RFM Segments | Exclude Users | A checkbox adds a separate exclusion filter group | P3 | S |
| MIS-184 | RFM Segments | Act on a cell: Analyze segment | Choose an analysis type to run on the cell's users | P3 | M |
| MIS-185 | RFM Segments | Team filter | A Team dropdown when the Teams feature is enabled | P3 | M |
| MIS-186 | Predictive Segments | Predictions list filters (Search, Created, Type, Status, Clear all) | Filter bar above the list; empty state "No predictions created yet!" | P3 | S |
| MIS-187 | Warehouse Segments | Zero-copy audiences on warehouse data (paid add-on; "I'm interested" request) | Locked upsell page with "Learn more" and "I'm interested"; BigQuery is early access | P3 | XL |
| MIS-188 | Warehouse Segments | Warehouse connectors (Snowflake, BigQuery, Redshift; Databricks catalogs) feeding Email, SMS, Push, In-app and WhatsApp | Diagram and code constants | P3 | L |
| MIS-189 | Warehouse Segments | "Warehouse - SQL" and "Warehouse - filter" builders; Edit / Duplicate | Two warehouse segment types; table preview `SELECT * FROM <table> LIMIT 10` | P3 | XL |
| MIS-190 | Warehouse Segments | Query results / history (query time, SQL, run time, data scanned, rows, status; insert, copy, run, download; create a segment from a one-column result) | A query history table with row actions | P3 | L |
| MIS-191 | Warehouse Segments | Warehouse Schema settings (Settings > Data) | Defines a warehouse schema so the no-code builder works on warehouse tables (behind a feature flag) | P3 | L |

### 09 File segments, user imports & exports (20)

By priority: P0 2 · P1 4 · P2 5 · P3 9. Evidence and recommendations: [modules/09-segments-files-imports-exports.md](modules/09-segments-files-imports-exports.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-192 | File segments | Create file segment (static segment from an uploaded list) | Modal: required name, description (300 chars), file (upload or URL), identifier attribute and data type, alert emails (up to 50); Create disabled until valid; segment type File | **P0** | M |
| MIS-193 | File segments | Identifier attribute: ID, Email or Mobile Number | One identifier column from Tracked Standard Attributes (ID, Email, Mobile Number, names); data type fixed to string | **P0** | S |
| MIS-194 | File segments | Upload format and sample file (one-column CSV up to 64 MB, drag and drop, sample) | CSV only, one column, 64 MB; drag and drop or upload; "Download a sample" (Sample_GAIDs.csv) | P1 | S |
| MIS-195 | File segment management | Update a file segment from a new file (Add, Remove or Replace users) | "Edit- Test File" modal: Select action (Add, Remove or Replace users), new file (upload or URL), identifier, alert emails; primary button named after the action | P1 | S |
| MIS-196 | User import: source and format | Import wizard (Source and format, Import configuration and action, Scheduling) | 3-step stepper, Previous/Next, final "Schedule Import"; required Import name; a step with errors shows an error icon | P1 | S |
| MIS-197 | User import: options | Save imported users as a file segment | Toggle; pick an existing file segment or create one; max 5M users; ready 30 minutes after import; the imports list links the segment | P1 | S |
| MIS-198 | File segment management | File segment info page (source, auto description, counts, reachability by channel, sample users) | Segment Type File, Source "Import Users", auto description, Created On, Last Run Time, User Count, Reachable Users, Push/Email/SMS/WhatsApp tiles, sample users | P2 | S |
| MIS-199 | User import: mapping | Supported datetime formats | 18 per-column formats, from YYYY-MM-DD and DD/MM/YYYY to ISO with time zone and fractional seconds | P2 | S |
| MIS-200 | User import: options | Import behaviour: skip new users (update existing only) | Default updates and creates; "Skip new users during this import" makes it update-only | P2 | S |
| MIS-201 | User import: options | Import status email | "Send import status" on by default, up to 10 recipients, pre-filled with the current user (file segments take up to 50 alert emails) | P2 | S |
| MIS-202 | User exports | User Exports list (generated export files) | Updated time (sortable), File name, Description, Status, Actions; search; Refresh. Empty here, "Failed to get user reports" on every load, no create control | P2 | M |
| MIS-203 | File segments | File segment from URL (public HTTPS CSV up to 300 MB) | "Provide URL": https, public (no VPN), valid CSV of 300 MB or less | P3 | S |
| MIS-204 | File segments | Identifier attribute: any other tracked attribute (grouped, searchable picker) | Groups: Lifecycle, Acquisition, Reachability, Localization, Email Opt-in Status, Tracked Custom Attributes | P3 | S |
| MIS-205 | File segments | Data type derived from the chosen attribute | The Data type select offers only the attribute's tracked type (ID gives string, LTV gives double) | P3 | S |
| MIS-206 | File segments | In-product help video ("Watch video") | Opens the YouTube "File Segment Walkthrough" | P3 | S |
| MIS-207 | File segment management | Segment type filter (File, Filter, Warehouse - SQL) | "Select Segment Type" multi-select with Clear all and Select all | P3 | S |
| MIS-208 | User import: source and format | Inline import quota hint | "You can upload upto 610K users in next hour and upto 14M users today" | P3 | S |
| MIS-209 | User import: limits | Import limit overview drawer (user, event and aux-data quotas; top contributing imports) | User 610K per hour and 14.1M per day; Event 5.1M and 41M; Aux 1.5M and 25M. Progress bars, reset tooltip, Refresh, top-5 imports (Hourly/Daily) | P3 | M |
| MIS-210 | User import: mapping | Reusable mapping file | "Upload mapping file" loads a saved column mapping | P3 | S |
| MIS-211 | Import history | Import history filters (search, status, created date, created by, refresh) | Search by name; status multi-select (Successful, Failed, Partial success, Processing, Pending, Scheduled, Archived); Created date and Created by popover; refresh | P3 | S |

### 10 Analyze: My Studio, Users, Behavior, Funnels (45)

By priority: P1 12 · P2 21 · P3 12. Evidence and recommendations: [modules/10-analyze-core.md](modules/10-analyze-core.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-212 | My Studio | Chart-point action: Create segment | Create a segment from the users behind a chart point (paid) | P1 | S |
| MIS-213 | Users / Behavior / Funnels | Filter analysis by a saved segment (Custom segment) | "Filter users by > Custom segment" on all three pages; each states its audience ("Showing ... for: All Users") | P1 | S |
| MIS-214 | Users | Download Table (CSV) | "Download Table" on the results table | P1 | S |
| MIS-215 | Users | Save chart / table to a dashboard | Pick an existing dashboard (searchable) or Create New (name up to 50 chars, visibility, permission), then a chart/table name (50) and description (1000) | P1 | L |
| MIS-216 | Behavior | Multiple event series (A, B, ...) | "+ Add Event" adds series A, B, ... with duplicate and remove, plotted together ("2 Events") | P1 | M |
| MIS-217 | Behavior | + Attributes (event-attribute filters) | "+ Attributes" filters a series by event attributes such as Platform or App Version | P1 | S |
| MIS-218 | Behavior | + Split by (event attribute) | Split each event by an event attribute (disabled until an event is chosen) | P1 | M |
| MIS-219 | Behavior / Funnels | Duration: Custom Range, Since, Before and reset | A two-month Custom Range calendar (From/To, Reset, Cancel/Done), Since (capped at 365 days), Before and a reset icon | P1 | S |
| MIS-220 | Behavior | Save Behavior analysis | Save after a run ("Perform Behavior analysis and save it."), with My Studio and dashboard options | P1 | S |
| MIS-221 | Funnels | Step + Attributes (event-attribute filters) | "+ Attributes" filters a step's event by attributes such as Platform or App Version | P1 | M |
| MIS-222 | Funnels | Conversion window | "Funnel window": a number plus Minute(s) / Hour(s) / Day(s), default 1 day; if unset, the selected duration becomes the window (screenshot 118) | P1 | M |
| MIS-223 | Funnels | Funnel split (breakdown) | Split by event, device or user property values (type and attribute dropdowns) | P1 | M |
| MIS-224 | My Studio | Chart-point action: Create campaign | Launch a campaign at the users behind a chart point (paid) | P2 | S |
| MIS-225 | My Studio | Chart-point action: Export users | Export the users behind a chart point (paid) | P2 | S |
| MIS-226 | My Studio / Behavior / Funnels | Alerts on analyses (Set alert, scheduled anomaly alerts) | Scheduled anomaly alerts; "Set alert" on Behavior and Funnels locked ("Upgrade to Product Analytics to set Alerts") | P2 | L |
| MIS-227 | My Studio | Dashboard and report subscriptions | Expanded dashboard and subscription limits (scheduled dashboard emails) in the paid plan | P2 | M |
| MIS-228 | Users | Multiple properties per analysis (A, B, ...) | "+ Add user property" rows A, B, ... with duplicate, remove and collapse | P2 | S |
| MIS-229 | Users | Per-property filters (+ Filters, case sensitive, multi-select values) | "Filter by attribute / operator / value" rows, a Case Sensitive checkbox for strings, and a multi-select value picker with search, Clear all and Select all | P2 | S |
| MIS-230 | Users | Analysis types: Total count and Unique count | Total count and unique count of a user property | P2 | S |
| MIS-231 | Users | Distribution bucketing (Auto / Custom) | Auto, or Custom "From 0 to 10 with an interval of 1"; at most 10 buckets | P2 | S |
| MIS-232 | Users | Split by user attribute (with date granularity) | Multi-select split over user attributes; dates by Date, Day of month/week/year, Hour of day, Month, Month of year, Week of month/year, Year | P2 | M |
| MIS-233 | Users / Behavior / Funnels | Inline "Filter users by" (property, behavior, affinity) with nested filters | All users, or "Filter users by" with tabs User property, User behavior (Has Executed / Has Not Executed + event), User affinity and Custom segment; + Nested Filter, + Filter | P2 | M |
| MIS-234 | Users / Behavior / Funnels | Compare segments | "+ Add segment to compare" (copy segment 1 or add a new one) creates Compare Segments tabs plotted side by side | P2 | M |
| MIS-235 | Users | Chart type switcher (horizontal bar, column, pie, geo map) | A toolbar switches between horizontal bar, column and pie, plus a geo map for country | P2 | S |
| MIS-236 | Users | Download Chart | "Download Chart" on the chart card | P2 | S |
| MIS-237 | Behavior | + OR (alternative events in one series) | "+ OR" combines alternative events into one series | P2 | S |
| MIS-238 | Behavior | Group by user property | Group the selected events by one or more user properties, with date-granularity submenus | P2 | M |
| MIS-239 | Behavior / Funnels | Duration: calendar presets (Today, Yesterday, This Month, Last Month) | Today, Yesterday, This Month and Last Month presets | P2 | S |
| MIS-240 | Behavior / Funnels | AI agents for analysis (Merlin Custom Agents) | Promo buttons "Try Merlin Custom Agents for Behavior Analysis" and "Automate Funnels with Merlin Custom Agents" | P2 | L |
| MIS-241 | Funnels | Step + OR | "+ OR" adds alternative events inside a step | P2 | S |
| MIS-242 | Funnels | Exclusion events between steps | "Exclude events from funnel" opens "Event should not occur between Step X and Step Y" + event, with "+ Exclude Event" | P2 | M |
| MIS-243 | Funnels | Order: Strict | A "Strict" toggle drops users who repeat an earlier step before completing (A > B > A > C is not counted) | P2 | S |
| MIS-244 | Funnels | Holding attribute | Keeps an event attribute constant across all steps, so a user plus attribute value completes the funnel | P2 | M |
| MIS-245 | My Studio | Private dashboards with visibility and permissions | Private / Workspace visibility and Viewer / Editor permission ("New" badge); Private and Viewer locked | P3 | M |
| MIS-246 | My Studio | Chart-point action: Analyze users | Open the users behind a chart point in another analysis (paid) | P3 | M |
| MIS-247 | Users | Email domain analysis | Breaks users down by email domain (single non-encrypted email attribute only) | P3 | S |
| MIS-248 | Users / Behavior / Funnels | Exclude Users | An "Exclude Users" checkbox opens an exclusion block with the same four tabs | P3 | S |
| MIS-249 | Users | Geo map chart | World map shaded by count, with a legend and zoom in / out / reset | P3 | M |
| MIS-250 | Users | # / % toggle, sort and zoom | # / % toggle (not on pie); sort high-low, low-high, A-Z, Z-A; zoom controls | P3 | S |
| MIS-251 | Users | Table tools (search, column menu, filters, columns panel, transpose, paging) | AG Grid with search across columns, a column menu (sort, pin, autosize, choose/reset), a Contains filter, Columns and Filters panels, Transpose and Page Size 500 | P3 | M |
| MIS-252 | Behavior | Analysis type: Attribute aggregation per user (two-level) | First per user (Sum, Min, Max, Average, Distinct of an attribute), then across users (Min, Max, Average, Median, Percentile) | P3 | M |
| MIS-253 | Funnels | Duplicate / reorder / collapse steps | Copy, delete, collapse-to-summary and swap arrows per step; a header summary ("3 steps with 1 excluded event") | P3 | S |
| MIS-254 | Funnels | Funnel type: All Occurrences | "Funnel - All Occurrences": every completion counts | P3 | M |
| MIS-255 | Funnels | Funnel type: Time to convert - All Occurrences | Time to convert counted over every completion | P3 | M |
| MIS-256 | Funnels | Frequency analysis (Unique Users / All Occurrences) | "Frequency of Step X before Step Y" with distribution bucketing | P3 | M |

### 11 Analyze: Retention, Session & Source, Paths, Acquisition, Uninstalls (34)

By priority: P1 4 · P2 17 · P3 13. Evidence and recommendations: [modules/11-analyze-advanced.md](modules/11-analyze-advanced.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-257 | Retention | Filter users by: user property / behaviour (Has Executed / Has Not Executed) / nested filters | "All users" or "Filter users by", with User property, User behavior, + Nested Filter and + Filter | P1 | M |
| MIS-258 | Session & Source | Report types: Conversion Count and Revenue by source | Conversion Goal events, or goal revenue, grouped by source property; each option has a hover description and Know more | P1 | L |
| MIS-259 | Session & Source | Group by source properties (Max 2) | "Source property" chips, maximum 2 (a third drops the oldest); summary "Report Grouped by Source and Medium for Last 7 Days" | P1 | M |
| MIS-260 | Shared | One shared "Filter users" component on every report | The same component (user property, behaviour, affinity, custom segment, nested filters, exclude, compare) on Retention, Session & Source and User Paths | P1 | M |
| MIS-261 | Retention | + OR alternative events | "+ OR" adds alternative event rows in First and Return Event | P2 | S |
| MIS-262 | Retention | + Attributes (event-attribute filters) | Attribute filters on each event (default "is", string, case-insensitive) | P2 | S |
| MIS-263 | Retention | Retention type: Unbounded | Retained in period N if the user returned in N or any later period | P2 | S |
| MIS-264 | Retention | Split by (breakdown) | Multi-select over user attributes and attributes common to the chosen events; disabled until the events are valid | P2 | M |
| MIS-265 | Retention | Custom segment picker | "Custom segment" tab listing saved custom (file or list) segments, e.g. "Test File" | P2 | S |
| MIS-266 | Retention | Compare segments ([1], [2] tabs; Copy segment) | "+ Add segment to compare" (Copy [n] Segment / + Add new segment) creates Compare Segments tabs, one result each | P2 | M |
| MIS-267 | Retention | Exclude Users | An "Exclude Users" checkbox opens an exclusion filter block | P2 | S |
| MIS-268 | Retention | Retention chart (line) | A "Retention chart" card above the table; chart_type defaults to line | P2 | S |
| MIS-269 | Retention | Save (analysis / to dashboard) | Disabled until a run ("Perform Retention analysis and save it."), then saves the chart or table to a dashboard | P2 | S |
| MIS-270 | Session & Source | Session reports: Bounce Rate, Avg. Conversions/Session | Defined in app code but not offered in this workspace | P2 | M |
| MIS-271 | Session & Source | Source filters (Source, Medium, Campaign, Content, Term, Platform, App Version, SDK Version) | "+ Add Filters" adds a row: property, operator, value, Case Sensitive, delete | P2 | S |
| MIS-272 | Session & Source | Duration, Filter users (compare, exclude) and chart + table output | The same Duration picker and Filter users component as Retention; chart and table cards with empty states | P2 | M |
| MIS-273 | User Paths | Path anchor: Starting with / Ending with an event (+ Attributes) | Path type plus one optional anchor event with "+ Attributes"; APPLY works even with no event | P2 | L |
| MIS-274 | User Paths | Path window, steps (2-15) and date range | Window as a number plus Minutes/Hours/Days (default 4 Hours); 2-15 steps (default 5); date presets (default Yesterday); validations such as "Path window cannot exceed date range" | P2 | S |
| MIS-275 | User Paths | Sankey chart and settings | (App code) Repeated events Show/Hide; Exclude events; Resolution 10% to 0.1%; Split by up to 5 event attributes and date parts; node Actions menu; Add/Remove step; Zoom and full screen; drop-off and "others" nodes | P2 | M |
| MIS-276 | Uninstalls | Download Chart | A "Download Chart" button on each uninstall chart | P2 | S |
| MIS-277 | Shared | Save-to-dashboard | Save puts a chart or table on a dashboard (Retention, Session & Source, User Paths) | P2 | XL |
| MIS-278 | Retention | Copy to return step / Copy to first step | A copy icon copies one card's definition to the other | P3 | S |
| MIS-279 | Retention | Retention type: First Occurrence | Counts only the first time each user does the return event | P3 | S |
| MIS-280 | Retention | User affinity filter | "User affinity" tab: Has Executed plus an event picker | P3 | M |
| MIS-281 | Retention | Table transpose and expand/collapse | "Transpose" / "Transpose Back" and "Expand table" / "Collapse table" (app code) | P3 | S |
| MIS-282 | Retention | Time-range comparison on retention | `comparison_timerange` compares with an earlier period; blocked when custom segment comparison is applied | P3 | M |
| MIS-283 | Retention | Set alert | Locked: "Upgrade to Product Analytics to set Alerts." | P3 | L |
| MIS-284 | Session & Source | Set alert, Save and Help | Set alert locked behind an upgrade; Save disabled until a run; "Session and Source Analysis Walkthrough" video; Know more | P3 | S |
| MIS-285 | User Paths | Filter users (no segment compare) | "All users" / "Filter users by" and "Exclude Users"; no "+ Add segment to compare" | P3 | S |
| MIS-286 | User Paths | Run states, Save and Help | "Building user paths…", then the chart or "No data available to render a chart"; Save after a run; walkthrough video; no Set alert | P3 | S |
| MIS-287 | Uninstalls | Users / Events tabs | Tabs switch between uninstalled-user counts (`?type=users`) and uninstall events (`?type=events`) | P3 | S |
| MIS-288 | Uninstalls | Uninstall By Time (Daily/Weekly/Monthly; Platform; Date Range; column chart with hover tooltip) | Column chart "Daily Uninstalls Users: N / Between …"; refreshes on every filter change, no APPLY | P3 | S |
| MIS-289 | Uninstalls | Uninstall By Attribute (LTV, City, Gender, …; Platform; Date Range; bar chart) | Bar chart of uninstalls by a chosen user attribute, with an (EMPTY) bucket | P3 | M |
| MIS-290 | Shared | Accordion builder sections with auto-generated one-line summaries | Each section collapses to a generated summary ("Analysis for N-Day Retention for Last 7 Days", "Showing retention analysis for: All Users"); APPLY collapses them all | P3 | S |

### 12 Home, Dashboards, header, Create New (29)

By priority: P1 5 · P2 10 · P3 14. Evidence and recommendations: [modules/12-home-dashboards.md](modules/12-home-dashboards.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-291 | Key Metrics dashboard | Download charts / CSVs | Download charts and CSVs; Download table and chart on Campaign stats | P1 | S |
| MIS-292 | Create New menu | New Segment: File Segment | Segment from an uploaded list | P1 | M |
| MIS-293 | Global header | Need help menu | Help center, Ask AI, Support, demo account, product ideas, Setup guide, Usecases, Integration guide, Academy | P1 | S |
| MIS-294 | Setup guide | Setup checklist with progress and welcome popup | 2/3 steps: Integrate / Validate, Invite team, Create campaign | P1 | S |
| MIS-295 | Setup guide | Knowledge Base: User, Developer, Partner guides | External docs links | P1 | M |
| MIS-296 | Dashboards flyout | Dashboard navigation and search (flyout list, groups, pin/unpin, title switcher) | Flyout with live Search, "+ New Dashboard", MoEngage Dashboards group; code defines Pinned/Workspace/Private/Shared groups and Pin/Unpin; each title has a searchable switcher with "+ Create new" | P2 | S |
| MIS-297 | Campaign stats dashboard | Campaign summary side panel (count, best/worst CVR and CTR) | Per channel: totals, highest and lowest campaigns, Show all | P2 | S |
| MIS-298 | Custom dashboards | Create custom dashboard (name, visibility, permission, limits) | Modal with unique name (50 chars), Workspace/Private, Editor/Viewer; three entry points | P2 | M |
| MIS-299 | Custom dashboards | Custom dashboard builder (charts, layout, filters, actions) | Up to 20 analysis charts, drag/resize, chart/table, time and segment filters, compare to past | P2 | XL |
| MIS-300 | Custom dashboards | Scheduled dashboard email subscriptions (and Merlin weekly-report promo) | Daily/Weekly/Monthly, up to 50 recipients, CSV data | P2 | M |
| MIS-301 | Create New menu | Campaign channel picker: RCS | RCS with One Time, Periodic, Event Triggered | P2 | L |
| MIS-302 | Create New menu | New Dashboard starting points | Start with blank, or Users / Behavior / Funnels / Retention / Session & Source | P2 | L |
| MIS-303 | Global header | Ask AI support messenger | Intercom messenger with the AIRA assistant | P2 | S |
| MIS-304 | My profile | Security: active devices / sessions | Device, platform, last active, location, actions | P2 | M |
| MIS-305 | Setup guide | Capability tour, guided product tour and demo account | Capability tabs, Start tour, demo dashboard | P2 | M |
| MIS-306 | Key Metrics dashboard | Copy Link / Email Link | Copy and email a dashboard view | P3 | S |
| MIS-307 | Key Metrics dashboard | "Set conversion goal" / "Go to settings" prompts | Shown when revenue or conversion is not configured | P3 | S |
| MIS-308 | Campaign stats dashboard | Connector and FB audience sections | Attempted, Sent, Success rate; Eligible, Attempted, Synced, User synced | P3 | S |
| MIS-309 | Custom dashboards | Private dashboards and Viewer/Editor permissions | Locked behind "Upgrade to Product Analytics" | P3 | M |
| MIS-310 | Custom dashboards | Dashboard sharing and access requests | Share by email with access type; request access with a message | P3 | M |
| MIS-311 | Create New menu | Campaign channel picker: MMS | MMS with One Time, Periodic, Event Triggered | P3 | M |
| MIS-312 | Create New menu | Campaign channel picker: Cards | INBOUND Cards tile | P3 | L |
| MIS-313 | Create New menu | ALL APPS: Telegram, Line, Viber (paid add-ons) | Tiles with "Request access", "See all", "Explore apps" | P3 | L |
| MIS-314 | Create New menu | New Experience: Web (WYSIWYG) | Visual editor for web pages | P3 | XL |
| MIS-315 | Create New menu | New Experience: Split URL Testing | Divide traffic among web pages | P3 | M |
| MIS-316 | Global header | Environment concept (Test / Live) | Header badge with Live/Test dropdown | P3 | L |
| MIS-317 | Global header | Notification bell: What's new feed | Beamer release notes, reactions, feedback, search | P3 | S |
| MIS-318 | Global header | Dark mode toggle and Appearance themes | Light/Dark/System, Minimal, High contrast, festive themes | P3 | L |
| MIS-319 | Left sidebar | Expand / collapse sidebar | Chevron switches icon rail and labelled menu | P3 | S |

### 13 Content: blocks, recommendations, landing pages, coupons (32)

By priority: P0 1 · P1 4 · P2 8 · P3 19. Evidence and recommendations: [modules/13-content.md](modules/13-content.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-320 | Coupons | Unique single-use coupon codes (coupon lists uploaded as CSV) | Lists of unique codes, each used once; no static or auto-generated codes seen | **P0** | L |
| MIS-321 | Content Blocks | Usage tracking across campaigns, Inform alerts and other blocks | Usage column; a ref-count API returns {campaigns, content_blocks} per block; preview shows "Communication type: Engage" | P1 | M |
| MIS-322 | Recommendations | Recommendation builder (Select recommendation model > Create recommendation) | Two-step wizard shell (Previous/Next); content "Not authorized" here | P1 | M |
| MIS-323 | Coupons | Coupon list setup (name under 50 chars with live snippet, Expires on, CSV under 100 MB, sample file, File preview) | Single-page "Create coupons" form | P1 | M |
| MIS-324 | Coupons | Coupon list management (Total/Available, Active/Expired, dates; Edit, usage report, Archive; detail page with files table and append CSV) | List page and `/<id>` detail with a Manage menu | P1 | M |
| MIS-325 | Content Blocks | Reusable content block library (snippets reused across campaigns, alerts and other blocks) | Named Plain-text/HTML snippets inserted with `{{ContentBlock['<label>']}}`; one edit updates every message | P2 | M |
| MIS-326 | Content Blocks | Block types: Plain text and HTML | Radio on the create form; "Content type" list filter | P2 | S |
| MIS-327 | Content Blocks | Tags (shared workspace tag list, Default tags, "Manage tags" in Settings) | Searchable tag multi-select with Default tags; the same tags apply to landing pages | P2 | M |
| MIS-328 | Content Blocks | Paginated library (12 per page) | The content-blocks search API returns 12 per page | P2 | S |
| MIS-329 | Content Blocks | Insert syntax with one-click copy (tag plus toast) | Copy icon on each row and card copies the tag; toast "Successfully copied to clipboard" | P2 | S |
| MIS-330 | Recommendations | Model: AI-powered (Merlin: real-time interactions, preferences, engagement) | "AI-powered" / "Powered by Merlin AI" (locked) | P2 | L |
| MIS-331 | Recommendations | Channels: website, In-App, On-site messaging, Cards | Website placements plus In-App, On-Site Messaging and Cards (marketing copy) | P2 | L |
| MIS-332 | Coupons | Coupon alerts (up to 50 emails; Success, Failure, Shortage below N, Expiry N days before) | Alert configuration on the create form | P2 | S |
| MIS-333 | Content Blocks | Filters: Updated by, Teams, Status, Tags (panel with Reset/Cancel/Apply) | Team-member multi-select; filter panel with Teams, Status (Active, Draft), Tags | P3 | M |
| MIS-334 | Content Blocks | Nested blocks (a block inside another block) | The ref-count API counts blocks used inside other blocks | P3 | S |
| MIS-335 | Landing Pages | Hosted landing pages: list and lifecycle (status, search, Copy URL, Preview, Edit/Duplicate/Archive/Unarchive, tags) | `/v4/lp/all`; empty state shows 5 demo templates; Copy URL and Preview per row | P3 | XL |
| MIS-336 | Landing Pages | Template gallery (18 responsive templates, Blank drag-and-drop, search) | Promotion, Product Announcement, Survey, Subscription Category Management, Lead Capture and 13 more | P3 | L |
| MIS-337 | Landing Pages: Editor | Block library (Kit #1 with 268 blocks, Kit #2 with 502; Light/Dark; categories; search; Create your own) | Hero, Features, Contact, Gallery, CTA, Text, Team, Pricing, Testimonials, Header, Footers and more | P3 | XL |
| MIS-338 | Landing Pages: Editor | Layout library (156 multi-page layout sets by industry, "Import This Layout", "Replace global styling") | Layouts tab, e.g. Business 69, One Page 53, Portfolio 28 | P3 | XL |
| MIS-339 | Landing Pages: Editor | Elements palette (about 30 elements incl. Form, Map, Video, Countdown, Carousel, Tabs, Accordion, Table, Social; customisable) | Add Elements panel with an "Edit" mode | P3 | XL |
| MIS-340 | Landing Pages: Editor | Global styling (style presets, colour palette, text styles Paragraph to H1-H6 and Button) | Styling panel: Current Style, palette swatches, text styles, Add New | P3 | M |
| MIS-341 | Landing Pages: Editor | Section/block settings (size, padding, margin, corner, blending, dividers; Advanced: device visibility, z-index, CSS class, attributes, custom CSS, hover, HTML tag) | Block toolbar plus Styling Basic/Advanced panels | P3 | L |
| MIS-342 | Landing Pages: Editor | Animation effects (None, Bounce, Fade, Rotate, Slide, Zoom, Attention) | Effects tab on blocks and elements | P3 | S |
| MIS-343 | Landing Pages: Editor | Text editing and typography (fonts plus Add New Font, size, weight, line height, spacing, B/I/U/S, case, link, alignment, gaps, HTML tag) | Text toolbar with typography and settings popovers | P3 | M |
| MIS-344 | Landing Pages: Editor | Responsive and structure tools (Desktop/Tablet/Mobile, Reorder Blocks, undo/redo, full screen, Change template) | Left rail device switch and Reorder Blocks; undo/redo; "Change template" with confirm | P3 | M |
| MIS-345 | Landing Pages: Experimentation | A/B variations with traffic split (Copy/New Variation, % tabs, User Distribution drawer) | Variation tabs with % in the label; the split is shared across cohorts | P3 | L |
| MIS-346 | Landing Pages: Experimentation | Cohort personalization (saved cohorts on in-session attributes: query parameter, day, time, geo, device, OS, browser) | "+ Cohort" and "Add new cohort" with "Save for later use" | P3 | L |
| MIS-347 | Landing Pages: Experimentation | Cohort operators and values (is, contains, starts with, exists, in the following, Case Sensitive; weekday, hour, country, device, OS, browser lists) | Condition rows per attribute with value suggestions | P3 | M |
| MIS-348 | Landing Pages: Experimentation | Preview and test as a real user (by ID, Email, Mobile, GAID, IDFA) and preview without personalisation | "Preview Landing page" menu: "Test landing page" drawer or a blob-URL tab | P3 | S |
| MIS-349 | Landing Pages: Publishing | Domains and URL (default domain, "+ Add Custom domain", page path, query parameters for dynamic text) | URL and settings section linking to Settings > Custom Domain > LP | P3 | L |
| MIS-350 | Landing Pages: Publishing | SEO and head scripts (meta title, description, favicon; scripts in `<head>`) | "Specify Meta tags" and "Add scripts" sections | P3 | S |
| MIS-351 | Landing Pages: Publishing | Page analytics in the list (Total views, Clicks, CTR; last updated on/by) | Sortable list columns; no separate report page | P3 | M |

### 14 Inform & Personalize (28)

By priority: P0 1 · P1 2 · P2 14 · P3 11. Evidence and recommendations: [modules/14-inform-personalize.md](modules/14-inform-personalize.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-352 | Inform: content | SMS Template ID for India DLT | Mandatory for India | **P0** | M |
| MIS-353 | Inform: API | Single send API for every channel (`POST /v1.0/alerts/send`) | One request with a payload per channel (recipient, personalized attributes, sender attributes, attachments); returns a request_id and a status per channel | P1 | M |
| MIS-354 | Inform: channels & fallback | Automatic retries (up to 5, exponential backoff of 200 ms) | Shown on Alert Info; "Include delivery retry details" in analytics | P1 | S |
| MIS-355 | Inform: channels & fallback | Channel order "In sequence (on Sender Failure)" with up to four fallbacks | Fallback on payload errors, vendor 4xx/5xx or rejection | P2 | M |
| MIS-356 | Inform: channels & fallback | DND / quiet hours per alert ("Ignore DND", otherwise drop or queue) | Per channel; flag `inform_dnd_enabled` | P2 | M |
| MIS-357 | Inform: content | SMS "Shorten URL and Track URL" | Content-step option | P2 | S |
| MIS-358 | Inform: alert info & analytics | Personalization failure analysis (event, user or campaign attribute, Jinja syntax; counts) | Failure categories, counts, "Create an alert for this error" | P2 | M |
| MIS-359 | Personalize: overview | Personalize module (All Experiences; up to 20 active per workspace) | Every route shows the promo; flag `CAMPAIGNS_WEB_PERSONALIZATION_ENABLED` | P2 | XL |
| MIS-360 | Personalize: experience types | Web (WYSIWYG) visual editor ("Build with Zero Code") | Editor opens on the customer's site; needs the Web SDK | P2 | XL |
| MIS-361 | Personalize: overview | "Personalize at Scale" (by name, cart products, actions, affinities, in-session behaviour) | Promo tab | P2 | L |
| MIS-362 | Personalize: overview | "Experiment and Optimize" (website A/B tests) | Promo tab | P2 | L |
| MIS-363 | Personalize: experiences | Experience list (columns, row actions, filters, create, empty state) | From bundle | P2 | M |
| MIS-364 | Personalize: experiences | Create wizard: Target users → Content → Schedule and goals | From bundle and docs | P2 | M |
| MIS-365 | Personalize: targeting | User Affinity (Predominantly, Minimum of, Most or Least number of times) | Segmentation criterion | P2 | M |
| MIS-366 | Personalize: targeting | In-session attributes and behaviour (UTM, new or returning, day, time, geo, device, OS, browser; in-session events) | From docs and bundle | P2 | L |
| MIS-367 | Personalize: targeting | Global control group | "Users in Global Control Group will be shown default experience" | P2 | M |
| MIS-368 | Personalize: content & variations | Variations per audience (default plus up to 5) with click tracking, preview and copy link | From docs and bundle | P2 | L |
| MIS-369 | Inform: channels & fallback | RCS ("Use SMS as fallback of RCS" or as a separate channel) | Behind the `inform_rcs` flag | P3 | L |
| MIS-370 | Inform: channels & fallback | Sender selection: SMS connector, sender groups, Dynamic Sender Routing | Pick a connector or other configured senders; routing conditions | P3 | M |
| MIS-371 | Inform: channels & fallback | Push advanced settings: expiry (up to 30 days), Android high priority, iOS interruption level, relevance score | Expiration, priority, interruption levels, relevance | P3 | S |
| MIS-372 | Inform: API | Sandbox endpoint and Test Alert ID | Separate sandbox base URL | P3 | M |
| MIS-373 | Inform: API | IP whitelisting (on request) | From docs | P3 | S |
| MIS-374 | Inform: API | "View in Browser" links on email alerts (Message Archival add-on) | From docs | P3 | M |
| MIS-375 | Inform: alert info & analytics | Locale Stats (by locale and sender) | From bundle | P3 | S |
| MIS-376 | Personalize: overview | "Connect Experiences" (carry ad and email personalization to the site) | Promo tab | P3 | L |
| MIS-377 | Personalize: experience types | Split URL Testing | Divide traffic among web pages | P3 | M |
| MIS-378 | Personalize: experiences | Approval workflow (Approve, Review; Under Review and Rejected) | From bundle | P3 | M |
| MIS-379 | Personalize: schedule & goals | Experience Priority (Low to Critical) to resolve conflicts within a session | From docs and bundle | P3 | S |

### 15 Reports (34)

By priority: P1 4 · P2 14 · P3 16. Evidence and recommendations: [modules/15-reports.md](modules/15-reports.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-380 | Step 1: Select campaigns | Campaign/Flow date range (Today … Last month, Since, custom two-month calendar, Last N D/W/M) | Picks campaigns and flows created, updated or sent in the range; explanatory note; maximum-range cap | P1 | M |
| MIS-381 | Step 2: Split data | Split by child campaigns (one row per run of a periodic campaign) | Option in the "Split data options" drawer | P1 | M |
| MIS-382 | Step 3: Scheduling | One Time - As soon as possible (on-demand report run) | Default: "The report will go out as soon as possible" | P1 | M |
| MIS-383 | Step 3: File & delivery | CSV file output | File format CSV (default) | P1 | S |
| MIS-384 | Navigation & report list | Reports menu (+ New Campaign Report, + New Alert Report, Campaigns Reports, Alerts Reports) | Sidebar flyout with four links: the campaign-report builder and list, and the Inform alert-report builder and list | P2 | S |
| MIS-385 | Navigation & report list | Saved campaign reports list with empty state ("No reports yet", + Report) | `/v4/reports/campaign` lists saved report definitions; the empty state's "+ Report" opens the builder | P2 | M |
| MIS-386 | Navigation & report list | Report list columns (name, created by, created at, scheduled at, type, last run with ETA) | From the bundle: also "Calculating ETA", "ETA:" and "Taking longer than expected" states | P2 | S |
| MIS-387 | Navigation & report list | Report row actions (Start, Stop, Run again, Edit, Duplicate, Download, Delete with confirm) and toasts | From the bundle, e.g. "Your report request has been initiated" | P2 | M |
| MIS-388 | Step 1: Select campaigns | 3-step "Export campaigns - create report" wizard | Select campaigns > Report format and content > Scheduling and delivery; only "Create report" writes | P2 | M |
| MIS-389 | Step 1: Select campaigns | Include performance data: only the selected range vs the entire campaign duration | Radio; default "Only for the selected date range" | P2 | M |
| MIS-390 | Step 1: Select campaigns | Channel × delivery-type filter for the channels Storees has (Email, SMS, Push, WhatsApp, In-App × One Time/Periodic, plus Flows) | Tree with search, Clear all and Select all ("24 combinations … selected") | P2 | S |
| MIS-391 | Step 1: Select campaigns | Campaign tags filter (All of these AND / Any of these OR; default tag set) | Tags dropdown with match mode and nine default tags | P2 | S |
| MIS-392 | Step 1: Select campaigns | Find campaigns and selection mode (count; dynamic "Select all" vs fixed manual list with name, ID and created on; no-results state) | Explanatory copy for recurring reports; "No campaigns found. Try again with different filters." | P2 | M |
| MIS-393 | Step 2: Columns & metrics | Per-channel column catalog and picker (accordion per channel, tri-state tree, search, expand/collapse, Clear selection, platform filters) | Default columns: Flows 35, Push 96, Connectors 40, Email 85, Facebook 26, WhatsApp 71, Google Ads 27, InApp 62, Onsite 64, SMS 68 | P2 | M |
| MIS-394 | Step 3: Scheduling | Periodic reports - Daily, Weekly, Monthly | Periodic options with start date and send time | P2 | M |
| MIS-395 | Step 3: File & delivery | Excel output | File format EXCEL, which hides Separator | P2 | S |
| MIS-396 | Step 3: File & delivery | Send to Email (recipient locked to the creator) | Recipient dropdown disabled and pre-filled with the logged-in user's email | P2 | S |
| MIS-397 | User exports | User Exports list (hidden `/v4/reports/users`: search, Refresh, UPDATED TIME, FILE NAME, DESCRIPTION, STATUS, ACTIONS) | Segment > User Exports inside the Reports app; empty here | P2 | M |
| MIS-398 | Navigation & report list | Report list search and filters (name; type; status; created by; team; chips; Inform/Campaign switch) | From the bundle | P3 | S |
| MIS-399 | Step 1: Select campaigns | Report name validation (required, 1-128 chars, starts with a letter, unique, checked on Next) | Tooltip rules; `POST /campaign_reports/validate_name`; "The report name is already taken" | P3 | S |
| MIS-400 | Step 1: Select campaigns | Facebook, Google Ads Audience, Connectors and Onsite messaging in the channel filter | "Others: Connectors, Flows, Onsite messaging" plus the audience channels, each One Time, Periodic or Event Triggered | P3 | L |
| MIS-401 | Step 1: Select campaigns | Created by filter (multi-select of team users) | "Created by" dropdown of workspace users | P3 | S |
| MIS-402 | Step 2: Columns & metrics | Duplicate column setup across channels | Copy icon on each channel header opens a channel dropdown | P3 | S |
| MIS-403 | Step 2: Columns & metrics | Onsite messaging columns (page URLs, show-on pages, delivery controls; impressions, clicks, CTR, closed, conversions) | 64 default Onsite columns; Web | P3 | M |
| MIS-404 | Step 2: Columns & metrics | Connectors, Facebook and Google Ads Audience columns (attempted/sent/user count; eligible/attempted/synced users, ad account and audience IDs, conversions) | Default columns: Connectors 40, Facebook 26, Google Ads 27 | P3 | L |
| MIS-405 | Step 2: Columns & metrics | Custom metric builder (name + formula; `@` metric picker by attribution type, `#` operators + - / \*, validation) | "Add a custom metric" modal with examples Revenue/Clicks, Converted Users/Sent, Open/Sent | P3 | M |
| MIS-406 | Step 2: Columns & metrics | Report format preview (Update preview, sample-data table per channel tab, fullscreen) | "Preview does not contain actual campaign data" | P3 | S |
| MIS-407 | Step 2: Split data | Split by locales (one row per locale) | Option in the "Split data options" drawer | P3 | L |
| MIS-408 | Step 3: Scheduling | One Time - At a specific date and time | Start date and send time (hh:mm am/pm) | P3 | S |
| MIS-409 | Step 3: Scheduling | Advanced recurrence (every N days/weeks/months; several weekdays; monthly day 1st-31st/Last or nth weekday; Ends Never / On / After N; Reset to defaults) | Full recurrence editor; end date defaults to one year later | P3 | S |
| MIS-410 | Step 3: File & delivery | CSV separator choice (comma, pipe, colon, semicolon) | Separator buttons, CSV only | P3 | S |
| MIS-411 | Step 3: File & delivery | Compression (Zip, Rar, Tar) | Compression buttons; Zip default | P3 | S |
| MIS-412 | Step 3: File & delivery | Send to REST API (download reports programmatically) | Help text linking to the Campaign Report API docs; no S3, SFTP or webhook destination | P3 | S |
| MIS-413 | Alert reports | Alerts Reports and New Alert Report (Inform transactional-alert reports; ALERT NAME, ALERT ID, ALERT EXTERNAL REFERENCE NAME) | Paid add-on, not enabled: both routes redirect to the Inform promo | P3 | L |

### 16 Merlin AI Studio (19)

By priority: P1 1 · P2 8 · P3 10. Evidence and recommendations: [modules/16-merlin-ai.md](modules/16-merlin-ai.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-414 | Copywriter | Output language: internet dialects (Hinglish, Digital Slang, Fashion Lingo, Corporate Jargon, Leetspeak) | "Internet Trends" group in the language picker | P1 | S |
| MIS-415 | Studio hub | AI tool hub with a global header entry point | Landing page "What can Merlin do for you today?" with 6 tool cards (3 live, 3 "Coming soon"); "Merlin AI Studio" link in the header of every page | P2 | S |
| MIS-416 | Copywriter | Usage limits: monthly utilization counter | "Monthly utilization: X/Y messages generated" per channel; a separate visual counter; no credits page | P2 | M |
| MIS-417 | Designer | AI image generation with aspect ratios (21:9, 16:9, 4:3, 1:1, 3:4, 9:16) | Marketing banners and hero images in 6 aspect ratios | P2 | M |
| MIS-418 | Designer | Image description / creative-direction prompt | Optional description; tooltip links to prompt ideas; a default prompt is used when it is empty | P2 | S |
| MIS-419 | Flow Assist | AI journey creation | Flag off ("Coming soon"); the route redirects to the Flows list | P2 | M |
| MIS-420 | Insights | Merlin AI Campaign Insight Agent ("Ask Merlin to…") | Chips: summarize performance, find winning patterns, analyze trends, optimize trigger playbook, diagnose delivery failures, identify underperforming metrics; seen in code only | P2 | M |
| MIS-421 | AI optimisation | Message variations distributed dynamically by AI, with CTR-uplift reporting | Merlin shifts traffic between variations and reports "Uplift in CTR due to Merlin AI optimization" | P2 | L |
| MIS-422 | Help | "Ask AI" support assistant (AIRA) in the "Need help" menu | Header menu with Help center, Ask AI, Support, Explore demo account and Submit product idea; Ask AI opens the Intercom messenger | P2 | M |
| MIS-423 | Studio hub | Example deep links (pre-fill, never auto-generate) | An example opens its tool pre-filled (`/copywriter?id=N`, `/designer?id=N`, `/jinja-ai?…&id=N`); nothing runs until Generate | P3 | S |
| MIS-424 | Copywriter | Output feedback (thumbs + feedback modal) and AI disclaimer | Thumbs up/down, "How can we make it better?" modal, "Merlin AI can make mistakes" | P3 | S |
| MIS-425 | Designer | Reference image (upload jpg/png up to 5 MB, or image URL) | "Add reference image": upload or image URL | P3 | S |
| MIS-426 | Designer | Image output actions (download, copy URL, feedback, visual counter, exit confirmation) | Preview, Download Image, Copy Image URL, thumbs, a monthly visual counter, "Exit Merlin AI Designer?" | P3 | S |
| MIS-427 | Jinja Assist | Plain-language personalization code: generate, fix and explain, grounded on a saved template or HTML | Beta tool that generates or fixes MoEngage Jinja and explains it; "Select Template" and "Upload HTML File"; also "Jinja AI" under Test and Debug | P3 | L |
| MIS-428 | Jinja Assist | Sample prompt library | 9 prompts: 4 as starter cards, all 9 in a "Sample Prompts" modal | P3 | S |
| MIS-429 | Jinja Assist | "Fix with AI" auto-repair | Repairs template errors automatically ("Template was automatically fixed") | P3 | S |
| MIS-430 | In-app Template | AI in-app template generator (spin-the-wheel, scratch card, countdown, survey; Nudge and Popup AI templates) | "Ask Merlin to create … template for you"; disclaimer "Merlin AI can make mistakes. Verify before publishing."; flag-gated | P3 | XL |
| MIS-431 | AI optimisation | Trigger-delay optimisation by open rate (flows) | "Merlin AI will optimise the trigger delay based on Open rate" | P3 | L |
| MIS-432 | AI optimisation | AI-generated descriptions for user attributes and events | AI descriptions with a feedback endpoint (`/v1/ds/merlin-ai/description/feedback`) | P3 | S |

### 17 Data imports & computed traits (16)

By priority: P1 3 · P2 6 · P3 7. Evidence and recommendations: [modules/17-data-imports-computed-traits.md](modules/17-data-imports-computed-traits.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-433 | Import sources | Upload CSV for events (drag and drop, CSV under 150 MB, quota hint, Download sample file, mandatory preview) | Event CSV step 1: Import name, Select event, sample file, dropzone, Preview file gate; aux data uses the same pattern | P1 | M |
| MIS-434 | Import wizard | 3-step wizard with a required Import name, "Untitled" title, Next disabled until files are fetched or previewed, stepper validation | Source and format > Import configuration and action > Scheduling | P1 | S |
| MIS-435 | User import options | Save as a file segment (name, at most 5M users, ready 30 minutes after import) | Toggle with a File segment name | P1 | S |
| MIS-436 | Import sources | Amazon S3 source (bucket, access key, masked secret key, optional region, folder path, inline credentials) | S3 credentials typed into the wizard (no saved connection), 26 regions, CSV only, optional PGP | P2 | M |
| MIS-437 | User import options | "Skip new users during this import" (update existing users only) | Existing users are updated; no new users are created | P2 | S |
| MIS-438 | User import options | Send import status email (on by default, up to 10 recipients) | Toggle pre-filled with the current user; also on event and aux-data imports | P2 | S |
| MIS-439 | Computed traits | Preference traits: Preferred Category, Top Spend Category, Total Savings, Top Watched Genre | Examples in the hero art and benefit tabs (Total Savings is a Sum used in a message) | P2 | S |
| MIS-440 | Computed traits | Builder: Basic details (name, description, filter users) > Define (type cards, configuration, data type, summary, preview on one or 10 users) > Scheduling > Publish | Seen only in the illustration and the docs | P2 | L |
| MIS-441 | Computed traits | Computed traits list: search; Type, Schedule and Status filters; Scheduled, Processing, Active, Paused; View, Edit, Pause/Resume; no delete | Per MoEngage's docs | P2 | S |
| MIS-442 | Import limits | Import limit overview drawer and inline quota hints | Hourly and daily usage bars: users 610K/14.1M, events 5.1M/41M, aux data 1.5M/25M; Refresh; Top contributing imports; quota repeated in modals and dropzones | P3 | M |
| MIS-443 | Import sources | SFTP source (saved connection added via App Marketplace, Folder URL, CSV only) | Saved-connection dropdown; "+ Add connection" opens App Marketplace > SFTP, which offers only "Request access"; full `sftp://` folder URL | P3 | M |
| MIS-444 | Import sources | PGP-encrypted files (decryption key, signing key, key passphrase) | "Is your file encrypted?" reveals three optional PGP fields | P3 | S |
| MIS-445 | Import sources | File name configuration: prefix plus one of 8 datetime suffixes, "Fetch file(s)", validation errors and toast | Prefix (default per data type) and Date time format; Fetch file(s) lists the matching files | P3 | S |
| MIS-446 | Import sources | Warehouse imports (Snowflake, BigQuery, Databricks; locked behind "Request access") | Page code only: one-time and periodic imports, connection > schema > table, table preview, multi-event tables, updated-at incremental columns | P3 | L |
| MIS-447 | Auxiliary data | Retention period (1 day to 1 year, default 15 days) | Required "Data action" card in step 3 | P3 | S |
| MIS-448 | Computed traits | SQL Computation over user and event tables | SQL editor returning a user ID and a value; Numerical, String or Boolean | P3 | L |

### 18 Test & Debug, event log, integration guide (20)

By priority: P1 3 · P2 9 · P3 8. Evidence and recommendations: [modules/18-test-debug-devtools.md](modules/18-test-debug-devtools.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-449 | Setup Guide | Onboarding checklist with progress bar (Integrate: Integrate now / Validate integration; Invite your team members; Create a new campaign) | "Welcome, [first name]!" card, "2/3 steps completed", check marks | P1 | S |
| MIS-450 | Setup Guide | Knowledge Base: User Guide, Developer Guide, Partner Guide | Links to the documentation portals | P1 | L |
| MIS-451 | Help & self-serve | "Need help" menu: Help center, Support, Setup guide, Integration guide | Top-bar dropdown; "Integration guide" opens the developer docs | P1 | S |
| MIS-452 | Integration Validation | "Send test push" (foreground, background, killed) | Test pushes to the connected device from the checklist | P2 | S |
| MIS-453 | Segment Payload | User affinity (the attribute value a user predominantly interacts with) | "Has Executed" + event, with affinity on event attributes | P2 | M |
| MIS-454 | Segment Payload | Custom segment: use an existing segment as a filter | Segment picker as a filter block | P2 | S |
| MIS-455 | Event Log | No-data notice ("We have not received any data … in the past 1 hour") with a troubleshooting guide | Notice banner on the event log | P2 | S |
| MIS-456 | Setup Guide | "Welcome, back!" popup prompting integration | Modal with "Integrate now" | P2 | S |
| MIS-457 | Setup Guide | "What can you do with MoEngage?" tabs (Analyze, Segment, Campaigns, Flows, Predict) with tips, CTAs and Learn more | Vertical tabs, each with a headline, a Tip box and action links | P2 | S |
| MIS-458 | Setup Guide | Product tour (Start tour) | Guided walkthrough | P2 | M |
| MIS-459 | Setup Guide | Demo dashboard / demo account with sample data (Explore now) | Switches to a populated demo account | P2 | M |
| MIS-460 | Integrate drawer & SDKs | Native and cross-platform SDKs (Android, iOS, React Native, Expo, Flutter, Cordova, Capacitor, Ionic, Unity, TV / OTT) | iOS and Android SDK cards plus the cross-platform SDKs in the developer guide | P2 | XL |
| MIS-461 | Segment Payload | Custom Segment API payload generator (name + filters give copyable JSON, client-side, validated) | "Segment Name for Payload", filter builder, Generate Payload, JSON with a copy icon | P3 | S |
| MIS-462 | Segment Payload | Collapse a finished filter into its one-line description | After "+ Filter", the first filter collapses to readable text with an expand caret | P3 | S |
| MIS-463 | Jinja AI | AI writes or fixes personalisation code from a plain-language prompt, with an explanation | Merlin produces MoEngage Jinja plus an explanation and fixes broken syntax or conditions (Beta) | P3 | M |
| MIS-464 | Jinja AI | Output panel: Code and Explanation, Copy Code, Download | Generated Jinja with an explanation, copy and download (bundle) | P3 | S |
| MIS-465 | Jinja AI | "Fix with AI" automatic repair of template errors | Repairs template errors automatically (bundle) | P3 | S |
| MIS-466 | Jinja AI | AI disclaimer and "Was the result accurate?" feedback | "Merlin AI can make mistakes…"; positive or negative plus "How can we make it better?" | P3 | S |
| MIS-467 | Integrate drawer & SDKs | Magento and WooCommerce integrations | Listed in the developer guide | P3 | L |
| MIS-468 | Help & self-serve | Ask AI, Explore demo account, Submit product idea, Use cases, MoEngage Academy | The other "Need help" items | P3 | L |

### 19 Settings: Push, Email, SMS & RCS (33)

By priority: P0 1 · P1 3 · P2 10 · P3 19. Evidence and recommendations: [modules/19-settings-push-email-sms.md](modules/19-settings-push-email-sms.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-469 | SMS & RCS > Sender configuration | India DLT template ID, entity ID and sender header | Map "DLT Template ID" as Moesms_dltTemplateId (app code) | **P0** | M |
| MIS-470 | Push > Web push | Web push opt-in prompt (2-step soft ask, 1-step, self-handled, assistive overlay, re-ask timing) | "Enable web push opt-in" reveals the methods, "Show push permission opt-in after N", re-appear time, assistive overlay, banner and nudge icons, Chrome/Firefox/Opera previews (app code) | P1 | L |
| MIS-471 | Email > Subscription management | Bulk suppression and resubscribe by CSV, with update history | "Upload CSV file", sample CSV, "Update history" of uploads and profile edits | P1 | M |
| MIS-472 | SMS & RCS > Sender configuration | Send test SMS | "Send test SMS" from sender configuration (app code) | P1 | S |
| MIS-473 | Push > Web push | Default notification icon and badge icon | "Default notification icon" (192x192) and "Badge icon for web push" by upload or image URL (alpha-only, min 72x72), Browser Compatibility Matrix link | P2 | S |
| MIS-474 | Push > Preference management | Global push exclusion ("Exclude users" segment, overridable per campaign) | Toggle "Exclude users"; matching users are blocked from push unless a campaign overrides it | P2 | M |
| MIS-475 | Email > Sender configuration | Domain / IP warm-up plan | "Generate warm up plan": a viewable or downloadable ramp, with guidance for triggered and transactional domains (app code) | P2 | M |
| MIS-476 | Email > Sender configuration | Link-branding (click-tracking) and deep-link domains | "Add link branding domain" by CNAME, MoEngage-managed or self-managed SSL, default domain, "Add deep linking domain" (app code) | P2 | L |
| MIS-477 | Email > General settings | Bot interaction sensitivity and Apple MPP adjusted metrics | Low or High sensitivity (adds Adjusted Opens, Open Rate, CTOR); "Show Adjusted Metrics Only" or "Include Adjusted Metrics with Current Metrics" | P2 | M |
| MIS-478 | Email > General settings | View-in-browser link (exemption for triggered/API campaigns and flows) | Toggle (Enabled) plus exemption checkbox | P2 | M |
| MIS-479 | Email > App Marketplace | Custom SMTP / "Add custom service provider" | Listed as email sender options (app code) | P2 | M |
| MIS-480 | SMS & RCS > Sender configuration | Two-way SMS / Mobile Originated (MO) callback URL | "Two-way SMS" with an MO callback URL (app code) | P2 | M |
| MIS-481 | SMS & RCS > Sender configuration | RCS senders | "RCS channel is not enabled"; app code shows "Add RCS Sender" through partner vendors | P2 | L |
| MIS-482 | SMS & RCS > RCS template management | RCS template library (rich cards, carousels, approval status, filters) | Not enabled; app code shows a template table, "Filter approved templates" and "Add Template" | P2 | M |
| MIS-483 | Push > App push | Huawei Mobile Services (HMS) delivery | "Huawei Mobile Service delivery" with a "Small icon path" setting (app code) | P3 | M |
| MIS-484 | Push > Web push | Sub-domain permission handling | Radios "Treat each sub-domain as a separate entity" or "Track user cross-subdomain" | P3 | S |
| MIS-485 | Push > Device analytics | App version buckets | "+ Add bucket" rows with Bucket name* and App versions*; earlier campaigns keep their settings | P3 | L |
| MIS-486 | Push > Device analytics | Top-5 OEMs view | "Configure view for OEMs": top 5 (default Samsung, Xiaomi, Oppo, Realme, Vivo; 26 available), the rest grouped as "others" | P3 | L |
| MIS-487 | Push > Device analytics | Top-5 browsers view | "Configure view for Browsers": Chrome, Safari, Firefox, Edge, Opera | P3 | M |
| MIS-488 | Email > Sender configuration | Recommended deliverability steps (Google Postmaster, onboarding checklist) | Authorize Domain Reputation (Postmaster), click-tracking domain, subscription categories, suppression list (app code) | P3 | S |
| MIS-489 | Email > General settings | User attribute that stores the email address | Searchable user-attribute dropdown (Email (Standard)) with "Show count" | P3 | S |
| MIS-490 | Email > General settings | Open-tracking pixel position (bottom / top) | Radios: bottom (default) or top (helps with Gmail clipping) | P3 | M |
| MIS-491 | Email > General settings | Auto-format HTML code | Toggle (ON): auto-corrects HTML-editor code; advanced users can send as-is | P3 | M |
| MIS-492 | Email > General settings | Bot management for opens, clicks and unsubscribes | Bot and MPP detection, user-agent and IP blocklists, rule for clients that block tracking, "Ignore unsubscribe bot clicks" (app code) | P3 | M |
| MIS-493 | Email > Subscription management | Double opt-in | Consent landing page, confirmation email on sign-up, Optin Status API (app code) | P3 | M |
| MIS-494 | Email > Font management | Custom email fonts with fallbacks and a default font | Font table (Font Name, Fallback font 1-3, Default), search, "Copy font URL", "+ Add font" (WOFF/WOFF2) | P3 | M |
| MIS-495 | Email > PII tokenization | Email PII tokenization (address fetched from the brand at send time) | Locked banner (contact CSM) | P3 | L |
| MIS-496 | SMS & RCS > Sender configuration | MMS-capable sender | Checkbox "This sender supports MMS" (app code) | P3 | S |
| MIS-497 | SMS & RCS > Sender configuration | Message encryption (Basic / Advanced) | Basic protects the connection; Advanced encrypts content with MoEngage's public key (app code) | P3 | M |
| MIS-498 | SMS & RCS > Sender configuration | SMS unsubscribe text | "SMS unsubscribe text" per sender (app code) | P3 | S |
| MIS-499 | SMS & RCS > Sender configuration | Remaining SMS credits / balance | "Remaining SMS Credits" per sender (app code) | P3 | S |
| MIS-500 | SMS & RCS > PII tokenization | SMS PII tokenization (number fetched from the brand's API at send time) | Locked; app code shows a request URL with parameters and headers | P3 | L |
| MIS-501 | SMS & RCS > Dynamic Sender Routing | SMS sender routing (2-5 senders, send and delivery-rate rules, fallback, return to primary) | Locked; rules and fallback in app code | P3 | L |

### 20 Settings: WhatsApp, delivery controls, preferences (15)

By priority: P1 5 · P2 3 · P3 7. Evidence and recommendations: [modules/20-settings-whatsapp-delivery-preferences.md](modules/20-settings-whatsapp-delivery-preferences.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-502 | WhatsApp > Sender configuration | Meta Embedded Signup (self-serve WABA creation) | Intro card: the embedded sign-up flow "will guide you through your WhatsApp and MoEngage integration" and creates a WABA if needed. In this workspace "Add sender" showed the manual form | P1 | M |
| MIS-503 | Delivery controls > Frequency capping | Cross-channel frequency cap | "All channels": "Send a maximum of N Communication from all campaigns/flows to a user in N day(s)", overriding channel rules (defaults 0 and 7 days; off) | P1 | M |
| MIS-504 | Delivery controls > Frequency capping | Email frequency cap | Email row: "Send a maximum of N Email [all / one time/periodic / event triggered / flows / API triggered] to a user in N day(s)" | P1 | M |
| MIS-505 | Delivery controls > Frequency capping | Cap scope by delivery type | Each channel cap has a "Delivery Type" scope: all campaigns, one time/periodic, event triggered, device triggered, flows, location triggered, push API / API triggered | P1 | S |
| MIS-506 | Delivery controls > Do not disturb | Channel-wise quiet hours (DND) in the user's time zone | Rows for Push, SMS & Connectors, Email and WhatsApp, each with a toggle and From/To hh:mm am/pm in the user's time zone. Covers triggered sends and flows, not One-time, Periodic or API-triggered campaigns | P1 | M |
| MIS-507 | WhatsApp > Sender configuration | Infobip sender | Form: sender name, number, API base URL, API key and the `/whatsapp/infobip/dlr` URL | P2 | M |
| MIS-508 | Delivery controls > Do not disturb | Handling of messages generated during DND | Action: discard / save and send all (default) / one per campaign / one across the channel. Order: LIFO (default) or FIFO. Gap between messages: N minutes (default 5) | P2 | M |
| MIS-509 | Delivery controls > Minimum delay | Minimum delay between two on-site messages | On site messaging: on, 15 Minutes between two on-site messages | P2 | S |
| MIS-510 | WhatsApp > Sender configuration | Karix sender | Form: sender name, number, API key (show/hide) and the `/whatsapp/karix/dlr` URL | P3 | M |
| MIS-511 | WhatsApp > Sender configuration | Multiple named senders per provider | Numbered "Sender 1" sub-tabs, each with a sender name, so a workspace can hold several numbers per BSP | P3 | L |
| MIS-512 | WhatsApp > Data | PII tokenization | Keeps PII in a secure environment and sends with tokens. Locked: "contact your Customer Success Manager" | P3 | XL |
| MIS-513 | Delivery controls > Frequency capping | Multiple cap rules per channel ("+") | A "+" on each channel row adds another rule, e.g. one per day and one per week | P3 | S |
| MIS-514 | Delivery controls > Frequency capping | Cap refresh time and time zone | "Refresh the frequency capping daily at 00:00 [App time zone \| User time zone]" | P3 | S |
| MIS-515 | Delivery controls > Minimum delay | Minimum delay between two in-app messages | Inapp: on, "Set minimum delay of 15 Minutes between two Inapp notifications" (Minutes is the only unit) | P3 | S |
| MIS-516 | Preference management | Preference management settings page | A Settings page with one EMAIL tab (lock illustration plus the exclusion statement) and an info tooltip. No preference centre, categories or double opt-in here | P3 | S |

### 21 Settings: Accounts (general, API keys, MCP, team) (17)

By priority: P0 1 · P1 2 · P2 5 · P3 9. Evidence and recommendations: [modules/21-settings-accounts.md](modules/21-settings-accounts.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-517 | API Keys | Server APIs require the secret, not just the public identifier | Data APIs authenticate with the Workspace ID plus a secret key; the SDK identifier alone can't call server APIs | **P0** | S |
| MIS-518 | General Settings | Workspace time zone (one searchable IANA zone) | Searchable single-select of 591 IANA zones with UTC offsets; one workspace-level zone | P1 | M |
| MIS-519 | Team Management: Members | Member status lifecycle (Joined / Pending / Access revoked) with immediate revocation | Invitees stay Pending until they join; revoked members keep a record | P1 | M |
| MIS-520 | API Keys | Campaign report and Dashboard & Analyze scopes | Download campaign or Inform reports for a period; run analyses | P2 | M |
| MIS-521 | MCP | Hosted MCP server with OAuth sign-in that respects roles | `https://mcp.moengage.com` with copy; MoEngage OAuth sign-in; "actions always respect your existing role-based permissions"; badged New | P2 | L |
| MIS-522 | MCP | Client setup tabs (Claude, ChatGPT, Cursor, Others) | Per-client tab: server URL with copy, four steps, a CTA (Install connector, View setup guide, Add to Cursor), copyable `mcpServers` JSON; tab kept in `?tab=` | P2 | S |
| MIS-523 | MCP | MCP tool catalog (52 tools) | Campaign drafts, content blocks, segments (create, count, validate, membership), flows (read, analytics, status), dashboards, campaign stats, Analyze runs, event and attribute catalog, feedback | P2 | L |
| MIS-524 | MCP | MCP guardrails | Drafts only; create only Push and Email; PII hidden or masked; per-user OAuth picking environment, workspace and role; 30-day sessions, 7-day idle; role-gated tools; range limits | P2 | M |
| MIS-525 | API Keys | Create new key: OAuth 2.0 (short-lived tokens) | OAuth 2.0 type with "Expiry time (in minutes)\*" (default 15) and a smaller scope tree | P3 | M |
| MIS-526 | API Keys | Create new key: AWS STS Auth (expiry and ARN list) | Expiry plus one or more assumed-role ARNs ("+ Add value"); only scope is Channel Configuration > Setup & Manage | P3 | M |
| MIS-527 | API Keys | Segmentation API scopes | Server-to-server custom segments (filter or file), archive/unarchive, view, user activity | P3 | M |
| MIS-528 | API Keys | Campaigns, Inform, Offerings, Decision Policy and Channel Configuration scopes | Campaign view, create, publish; Inform send and manage; Offerings; Decision Policy; Channel Configuration incl. message templates | P3 | L |
| MIS-529 | Team Management: Members | Search members and bulk-select checkboxes | "Search member(s)" plus select-all and row checkboxes | P3 | S |
| MIS-530 | Team Management: Members | Filter members by Role and Status | Popover with Role and Status, Reset all, Cancel / Apply; a dot marks an active filter | P3 | S |
| MIS-531 | Team Management: Roles | Teams (business units) | Settings Home says "create teams" and campaign calls carry `team_ids`, but no Teams tab for this user | P3 | L |
| MIS-532 | Security / login settings | SSO / SAML login | Expected on the locked Security page; not visible | P3 | L |
| MIS-533 | Settings entry points | Settings Home card grid | Cards with icon, title and one-line description, grouped like the flyout | P3 | S |

### 22 Settings: Analytics & data management (20)

By priority: P2 4 · P3 16. Evidence and recommendations: [modules/22-settings-analytics-data-management.md](modules/22-settings-analytics-data-management.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-534 | Data Management: Overview | Volume scope: all custom, all system, or one event (searchable picker grouped by class) | Scope dropdown in the chart modal; "Individual event" adds a picker | P2 | S |
| MIS-535 | Data Management: User attributes | Allowed data type pinning with typecasting (Any, Numeric, Boolean, Date, String, Location) | A team member pins a type; MoEngage typecasts tracked data into it | P2 | M |
| MIS-536 | Data Management: User attributes | Visibility: hide events and attributes from marketer dropdowns (row action, Visible / Hidden radio, bulk Visibility On / Off) | "Use this to remove those Events, Event attributes and User attributes from dropdowns that are not needed by Marketers" | P2 | M |
| MIS-537 | Data Management: User attributes | Edit attribute details drawer (Display name, Description up to 512 chars, Status, Visibility, Mask attribute, Allowed type; system attributes locked except Mask) | Right drawer; key read-only; display names show in segmentation filters; category system-assigned; no tags | P2 | M |
| MIS-538 | Data Management: Overview | Workspace data quotas with usage bars (Unique events used 0/512; Unique user attributes used 12/256) | Progress cards against the workspace quota, with definition tooltips | P3 | M |
| MIS-539 | Data Management: Overview | Auto-blocking once the quota is used up (Auto-blocked events / user attributes counters) | New items are blocked at 100% of quota; counters on all three tabs | P3 | M |
| MIS-540 | Data Management: Overview | Usage cards deep-link into the filtered catalog or chart ("View unique events", "View all events volume chart") | Every usage and volume card is clickable, with a hover label | P3 | S |
| MIS-541 | Data Management: Events | Status filter (Allowed / Blocked / Auto-blocked) | Blocked and auto-blocked events are not tracked | P3 | S |
| MIS-542 | Data Management: Events | Advanced "Filter events" popover (first and last seen ranges, sources, type, visibility, category, platforms) | Popover filter model; disabled here because the catalog is empty | P3 | M |
| MIS-543 | Data Management: Events | Column definitions as header tooltips (Status, Visibility, 30-day volume, Source) | Info icons explain each column | P3 | S |
| MIS-544 | Data Management: Events | Card quick filters (Unique events used → Allowed + Custom; Auto-blocked → Auto-blocked; Events not tracked → Allowed) | Clicking a usage card filters the table | P3 | S |
| MIS-545 | Data Management: User attributes | Attribute source lineage (Source column and grouped filter) | Where each attribute's data first arrived; CSV imports read "File Imports" | P3 | M |
| MIS-546 | Data Management: User attributes | Advanced "Filter user attributes" popover (Visibility, Category, Platform, Last seen, First seen, Tracked type, Allowed type, PII Masking) | Eight filters; date filters with presets and a two-month calendar | P3 | M |
| MIS-547 | Data Management: User attributes | Type filter (Standard / Derived / Custom) and Status filter (Blocked / Auto-blocked / Allowed) | Quick-filter dropdowns next to Source | P3 | S |
| MIS-548 | Data Management: User attributes | Row actions by attribute class (system: Edit only; standard and custom: Edit, Turn visibility off/on, Block) | Kebab menu whose actions vary with the class | P3 | S |
| MIS-549 | Data Management: User attributes | Bulk governance actions ("N user attribute(s) selected: Block, Allow, Visibility On, Visibility Off", Show selected, Clear selection) | Checkboxes enabled only for the 12 tracked standard and custom attributes | P3 | S |
| MIS-550 | Data Management: User attributes | Column chooser on both catalogs (optional Type, Tracked / Allowed type, Category, Platform, First seen, PII Masking) | Column-picker icon; Display name always shown | P3 | S |
| MIS-551 | Data Management: User attributes | Quota counts only tracked attributes (Standard + Custom; Derived excluded) | The "Unique user attributes used" quick filter shows 12 of 45 rows | P3 | S |
| MIS-552 | Data Management: User attributes | Catalog search by display or key name, 20-row lazy loading, filtered empty states | "reach" returns the 5 Reachability attributes; "No user attributes found. Try using a different search term or filter." | P3 | S |
| MIS-553 | Data Management: User attributes | Download all / Download CSV (catalogs, top events, volume chart) | "Download all" on both catalogs and on Top events; "Download CSV" in the chart modal | P3 | S |

### 23 Settings: Advanced 1 (control groups, tags, locales, Content API, custom domain) (25)

By priority: P0 1 · P1 2 · P2 8 · P3 14. Evidence and recommendations: [modules/23-settings-advanced-1.md](modules/23-settings-advanced-1.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-554 | Content API | Outbound calls limited to public endpoints (SSRF safety) | Not a setting in the capture. APIs are registered centrally by users with edit rights and called from MoEngage's backend. This row records the safety baseline Storees' equivalent must meet | **P0** | S |
| MIS-555 | Content API | Mask PII fields in the API response | "Mask PII fields" and "Select fields to mask" after a test run (page code) | P1 | S |
| MIS-556 | Custom Domain | Branded short-link domain via CNAME (Verify & Save) | "Configure" opens "Add new shortening method" with the vendor "Custom Domain". Prerequisites: CNAME your domain to u1.mnge.co with a 30-minute TTL. Then enter the domain and click Verify & Save | P1 | L |
| MIS-557 | Control Groups | Global control group: random allocation (% of all users, 0-10) | "Create global control group" > Random allocation, "% of all users" (0-10). A workspace-wide holdout to benchmark lift | P2 | M |
| MIS-558 | Control Groups | GCG scope: apply to existing campaigns; let marketers opt a campaign out | Two checkboxes. Tooltip: by default the CG applies to all new campaigns; the option lets marketers choose per campaign | P2 | S |
| MIS-559 | Tags | Two-level taxonomy (Category > Tag) with Tag and Category views and searches | Tag/Category radio views, each with its own search and "+ New". Category view shows tag chips with "+N more"; Tag view shows usage counts | P2 | M |
| MIS-560 | Locales | Locale registry (list, search, campaigns associated, created on) | Workspace locale list for messaging users by language or location. "+ Add locale" was permission-locked here | P2 | M |
| MIS-561 | Content API | Content API registry (named, reusable; search by name or URL; view-only permission) | Settings list of external personalisation APIs. "+ Add content API", "Search API by name or URL", and a view-only state for some roles | P2 | M |
| MIS-562 | Content API | Step 2 "API response": test run with sample values | The stepper's second step takes sample values for personalised fields, runs the API and shows the response before Save (page code) | P2 | S |
| MIS-563 | Custom Domain | Shorten and track URLs in SMS messages | The same switch covers URLs in SMS bodies | P2 | S |
| MIS-564 | Custom Domain | Email link-branding domain | "+ Add link branding": custom click-wrapping domain, CAA/SSL prerequisites, Set as default. Replacing or deleting the default swaps the domain in active campaigns. Disabled in this workspace | P2 | M |
| MIS-565 | Accessibility | Workspace switch that enables accessibility fields in Push, In-app and Card campaigns | "Enable accessibility fields" switch and Save (off here). Unlocks accessibility inputs in Push, In-app and Cards (page code) | P3 | S |
| MIS-566 | Accessibility | Cards inbox accessibility labels: Web | Web tab with label and hint inputs for the desktop Close inbox button, mobile-web Back button, Refresh icon and floating Cards image (page code) | P3 | L |
| MIS-567 | Control Groups | GCG from an uploaded user list (CSV, max 50 MB) | "Uploading users list": CSV-only drag-and-drop or upload, max 50 MB | P3 | M |
| MIS-568 | Tags | Tag usage counts across campaigns, flows and content blocks | NO OF CAMPAIGNS, NO OF FLOWS and NO OF CONTENT BLOCKS per tag | P3 | M |
| MIS-569 | Tags | Default system tags (9, locked) | "Default" category: activation, all users, engagement, incentive, onboarding, promotional, ratings, retention, transactional. Edits are blocked | P3 | S |
| MIS-570 | Tags | Create Category and Create tag modals | Category name (50 characters) with an "Add tags to category" multi-select; Tag name (50 characters) with "Add to category". "Default" and "Uncategorised" are reserved | P3 | S |
| MIS-571 | Tags | Tag management: edit, delete, move, bulk map, bulk delete; 500-tag cap | Edit and Delete tag (delete removes it from campaigns), Edit and Delete category, Move tags, Bulk map, Bulk delete, Show selected. Max 500 tags (page code) | P3 | S |
| MIS-572 | Tags | Tags train AI Campaign Decisioning | "New" banner: "Your campaign Tags now train the Campaign Decisioning Policies" | P3 | XL |
| MIS-573 | Content API | Response caching for non-personalised APIs | "Enable caching" stores the response; allowed only for non-personalised calls; no TTL field | P3 | S |
| MIS-574 | Content API | OAuth through a saved Authorization Configuration | "Enable OAuth" reveals "Select authorization setting", which lists configs from Settings > Authorization Configuration. The page code adds a prefix and an AUTHORIZATION header preview | P3 | M |
| MIS-575 | Custom Domain | Workspace default with per-campaign URL deselection | The switch sets the workspace default. URLs can be deselected in step 2 of campaign creation. The default applies only to new campaigns | P3 | S |
| MIS-576 | Custom Domain | Third-party shortener vendor (Branch) | Page code shows a Branch vendor: Authorisation key, sample URL, and a callback URL for click tracking | P3 | M |
| MIS-577 | Custom Domain | Email deep-linking domains (Branch/AppsFlyer) | "+ Add deep linking domain": Branch or AppsFlyer CNAME, "Mark this domain as default", acknowledge the prerequisites. Disabled in this workspace | P3 | M |
| MIS-578 | Custom Domain | Landing page custom domains | Landing pages tab: "Search by domain", "+ Add custom domain" (disabled here) and an empty list | P3 | XL |

### 24 Settings: Advanced 2 (auth, UTM, attribution, alerts, Inform) (31)

By priority: P1 3 · P2 14 · P3 14. Evidence and recommendations: [modules/24-settings-advanced-2.md](modules/24-settings-advanced-2.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-579 | Alert management | System alert: Failure Rate Breach (failure rate above 25% in the last day) | Built in; filterable by campaigns, channels, delivery type and tags | P1 | M |
| MIS-580 | Alert management | Alert on: Events Volume | All, custom, system or one event over the last day or hour, or per day, calendar week or month, against a threshold | P1 | M |
| MIS-581 | Inform | Single API for every channel and provider | Tab "Single API for every channel and every provider": one request, any channel, 30+ providers | P1 | M |
| MIS-582 | UTM tracking | Campaign values: id, parent id, channel, platform, delivery type, description, tags, tag ids, segment, conversion goal, locale, variation | Value dropdown of campaign attributes (GET `/campaigns/core/attributes`) | P2 | S |
| MIS-583 | UTM tracking | Flow values: flow name, flow id, child campaign name, delivery type, description, tags, goal, locale, variation | Flow value options mirror the campaign ones, from flow metadata | P2 | S |
| MIS-584 | Conversion & attribution | Saved account default for attribution model and conversion view | Two dropdowns with hover definitions, a recalculation notice and a sticky Save. Current: Last Interaction / Total conversion | P2 | S |
| MIS-585 | Conversion & attribution | Attribution model: Last Interaction (deepest, latest interaction wins) | This workspace's default; one campaign gets the credit for each conversion | P2 | M |
| MIS-586 | Alert management | Alert list: search, filters (Alert on, Created by, Subscribed by), row actions | "General alerts" tab: name search, filter popover, columns Alert name, type, Created by, Subscribed by, Subscriptions; row menu View and Subscribe to email. 9 system alerts | P2 | M |
| MIS-587 | Alert management | Per-alert email subscription and Members | "Subscribe to email" per alert and a Members multi-select; page code adds Unsubscribe and "Subscribe others to email" | P2 | S |
| MIS-588 | Alert management | Alert definition form (type, channel, condition, filters, evaluation time, members) | General details; condition written as a sentence; Filter by campaigns, channels, delivery types and tags; Members. Evaluated daily at 7 AM account time | P2 | M |
| MIS-589 | Alert management | Campaign Stats metrics and operators for alerts | Attempted through Revenue; is greater/less than, increases/decreases by more than; Day or Hour window, optional moving average | P2 | M |
| MIS-590 | Alert management | Flow Stats metrics for alerts | Trips started, active, ended and engaged; converted users, CVR, revenue, drop-offs, entries used, suppressed entries | P2 | M |
| MIS-591 | Alert management | System alerts: event and user-attribute usage against plan limits | Event usage > 511 of 512 and attribute usage > 255 of 256; checked daily, sent every time the condition is met | P2 | S |
| MIS-592 | Alert management | System alert: Facebook Token Expiry | Facebook token expiring in the next [7] Day(s) | P2 | S |
| MIS-593 | Alert destinations | Slack and Microsoft Teams alert destinations (plan-locked) | Hidden route: destination name, tool, URL (Slack webhook validated) and alert-type mapping; list with search, edit and delete | P2 | S |
| MIS-594 | Dashboard subscriptions | Subscribe to Dashboard: dashboard, up to 50 recipients, daily, weekly or monthly at a set time | Modal: Dashboard*; email chips (max 50); Daily, Weekly (Sunday to Saturday) or Monthly (last day, 1st to 31st, or nth weekday); hh:mm am/pm with "(Timezone: Asia/Kolkata)" | P2 | M |
| MIS-595 | Dashboard subscriptions | Email renders tables as charts, with the full data as a CSV | Modal note: "Subscription emails display tables as visual charts, with the full dataset available via CSV download." | P2 | M |
| MIS-596 | Authorization configuration | OAuth config library: list, edit/view/delete, usage list, no delete while in use | Account list of OAuth configs (Name, Service Type, Grant Type, Token Type, Last updated) with Edit/View/Delete and a "Check usage list" drawer; a config in use cannot be deleted. Empty here; "+ Add OAuth config" disabled for this role | P3 | M |
| MIS-597 | Authorization configuration | OAuth config form: client-credentials token request, response mapping, test before save | Drawer (page code): name, service type, grant type, token type; API URL, method, params, headers, body; token key, expiry key and unit, Bearer/Basic prefix, refresh error codes; "Send test to proceed" before Save | P3 | M |
| MIS-598 | Authorization configuration | Service type: PII Settings (fetch contact details from the brand's system at send time) | OAuth configs authenticate PII Settings, so MoEngage fetches contact details instead of storing them | P3 | L |
| MIS-599 | UTM tracking | Turning UTM off: disable only, or disable and update existing campaigns | "Modify UTM parameter" confirmation offering disable or disableAndUpdate | P3 | S |
| MIS-600 | Conversion & attribution | Attribution model: Linear Interaction | Appears only in a page-code notice (view-through default for every channel except Cards) | P3 | M |
| MIS-601 | Conversion & attribution | Conversion view: In-session (conversion within 30 minutes of a click) | Conversion type in page code only | P3 | S |
| MIS-602 | Conversion & attribution | Make conversion goals mandatory for Email campaigns | Toggle (off here); when on, every new email campaign must set a goal | P3 | S |
| MIS-603 | Alert management | System alert: Data Exports Paused | "Send alerts when an export is auto-paused after multiple failures." | P3 | S |
| MIS-604 | Alert management | System alerts: flow fair-use limit (time-based and event-triggered) | "Send alert when usage reaches [100] %" | P3 | S |
| MIS-605 | Alert management | System alert: Campaign Expiry | "Send alert when Campaign Expiry is in the next [7] Day(s)", with filters | P3 | S |
| MIS-606 | Alert management | Alert on: Active Users Volume | User metric "Tracked users (Web + Mobile)" against a threshold | P3 | S |
| MIS-607 | Alert management | Custom analytics alerts on saved analyses (flag-hidden) | Alerts on any saved analysis: above or below a value, or a % or value change versus the previous day, week or month; evaluated daily, weekly or monthly. Only the `?tab=custom` link renders, showing "No custom alerts created yet!" | P3 | L |
| MIS-608 | Dashboard subscriptions | Subscription list and controls (search, columns, team scope, edit rights, account maximum) | Search by subscriber email or dashboard name; Dashboard name, Last updated time, Updated by; "All Teams"; edit or delete by Admin/Manager or the owner; per-account maximum | P3 | S |
| MIS-609 | Dashboard subscriptions | Manage Domain Whitelist (admin-only, up to 5 recipient domains) | "Whitelist domains for subscriptions" | P3 | S |

### 25 App Marketplace (26)

By priority: P1 1 · P2 6 · P3 19. Evidence and recommendations: [modules/25-app-marketplace.md](modules/25-app-marketplace.md).

| ID | Area | Missing feature | What MoEngage offers | Priority | Effort |
|---|---|---|---|---|---|
| MIS-610 | Messaging providers | Indian and other SMS gateways (Kaleyra, ICS, Sinch, Route Mobile, Infobip, Mtalkz, Times Mobile, ValueFirst, Airtel IQ, Karix, AiSensy, GallaBox) | 18 SMS listings in total | P1 | M |
| MIS-611 | Marketplace landing | App Marketplace hub: sidebar entry and one integrations catalog | Sidebar icon opens `/v4/partners`: header card, Collections and Categories rail, search, 4-up cards for 165 listings (170 cards) in 35 categories, Suggest-a-partner footer | P2 | M |
| MIS-612 | Catalog & detail pages | Description-only partner listings (about 60% of the detail pages opened) | Docs and "Get in touch", no Integrate tab: Rokt Calendar, AccuWeather, Verloop, Salesforce, Lob, Movable Ink, Stripo, Hightouch, VWO, Flyy, Phrasee, Sheetdb, Appsflyer, eduMe, Crowdin, Talon.one, PassKit, Apxor, Twilio, Gupshup, Purchasely, Zendesk, Typeform, Exotel, Karix | P2 | S |
| MIS-613 | CDP & analytics | Campaign interaction data out (Segment, Amplitude, Mixpanel, Heap) | Integrate rows "Send campaign data to segment" and "Send campaign data to Amplitude"; Mixpanel and Heap export | P2 | M |
| MIS-614 | Data infrastructure | Cloud storage: Amazon S3, Google Cloud Storage, Azure Blob, SFTP | S3 syncs users and events both ways; GCS and Azure export; SFTP | P2 | L |
| MIS-615 | Messaging providers | Named WhatsApp BSPs: Infobip, GallaBox, ValueFirst, Airtel IQ, Karix (AiSensy under SMS) | Whatsapp providers category (5), each also listed under SMS | P2 | M |
| MIS-616 | Messaging providers | Alert management destinations: Microsoft Teams, Slack, Webhooks | The Alert management collection sends MoEngage Alerts to Teams, Slack or a webhook; Slack and Webhooks are behind Request access | P2 | S |
| MIS-617 | Marketplace landing | Collections: All, New (7), Popular (12), Alert management (3), Connected Apps (15) | Curated collection filters in the left rail; All collections is the landing view | P3 | S |
| MIS-618 | Marketplace landing | Partner search (instant, names only, `?search=`) | Search box with a clear button; "shop" returns Shopify, Shopify 2.0 and Shopflo; no results shows Suggest a partner | P3 | S |
| MIS-619 | Marketplace landing | Suggest a partner modal | Footer link opens Partner name\* (120 chars) and Description\* (200 chars) with Cancel and Submit | P3 | S |
| MIS-620 | Marketplace landing | Section collapse (Show less / Show all) | Each collection section collapses to one row | P3 | S |
| MIS-621 | Catalog & detail pages | Catalog composition: 146 MoEngage-built and 19 partner-built listings | Partner-built listings include Rudderstack, Stripo, Hightouch, VWO, Branch, AppsFlyer, Talon.one, Infobip and Pipedrive (built by Zapier) | P3 | XL |
| MIS-622 | Catalog & detail pages | Coming soon "Are you interested?" modal | Yes/No toggle (Yes preselected); a Description box (0/200) shows only for Yes; Cancel and Done | P3 | S |
| MIS-623 | CDP & analytics | Cohort import from CDPs and analytics (Segment Personas, Mixpanel and Amplitude cohorts, Dynamics 365 CI, Adobe RT-CDP) | External cohorts sync into MoEngage segments | P3 | M |
| MIS-624 | CDP & analytics | Enterprise CDPs (Tealium, mParticle, Dynamics 365 CI, Adobe Real-Time CDP, BlueConic, Treasure Data, Amperity) | Nine CDP listings; Treasure Data is marked Coming soon | P3 | L |
| MIS-625 | Ads: audiences & conversions | Microsoft, Amazon, Reddit, Criteo, Jampp and InMobi audiences; Truecaller Verified Campaigns | Retargeting listings; Microsoft, Amazon and Reddit are in the New collection | P3 | M |
| MIS-626 | Ads: audiences & conversions | TikTok and Snapchat Ads Conversions | Listings in the New collection | P3 | M |
| MIS-627 | Ads: audiences & conversions | Microsoft Ads Conversions | Listing in the New collection | P3 | S |
| MIS-628 | CRM | Salesforce native bi-directional sync (AppExchange certified) | Contacts, activities, lead status and custom events flow in; engagement data flows back to Salesforce | P3 | XL |
| MIS-629 | Data infrastructure | Data warehouses: BigQuery, Redshift, Snowflake, Databricks | Import users and events and export campaign events; all four are in Popular, with Integrate behind Request access | P3 | L |
| MIS-630 | Messaging providers | SMS-category partners beyond gateways: Attentive, Regal, Sendbird | Regal triggers SMS and calls from events; Sendbird sends in-app notifications; Attentive | P3 | M |
| MIS-631 | Messaging providers | ESPs not supported: Mandrill, SparkPost, Netcore, Mailmodo (interactive/AMP) | Emails category; Netcore shows the green connected check | P3 | S |
| MIS-632 | Messaging providers | Email template tool export (Stripo "Export to ESP") | Stripo (built by Stripo) exports drag-and-drop templates to MoEngage | P3 | S |
| MIS-633 | Messaging providers | Messaging apps as channels: Facebook Messenger, Telegram, LINE, Viber | Messaging apps category; Telegram, Line and Viber are Connected Apps behind Request access | P3 | L |
| MIS-634 | Other partner categories | Localisation (Transifex, Crowdin) | Sync email templates and content blocks to Crowdin for translation and back | P3 | M |
| MIS-635 | Other partner categories | Marketing cloud (Salesforce Marketing Cloud, Coming soon) | Sync Salesforce users and segments to MoEngage; only the interest modal exists today | P3 | L |

---

## Appendix B. Register of partial features

Every feature rated 🟡 Partial (618 in total): Storees has it, but it is narrower or defective. The "Gap" column says what is missing or wrong, and often how to fix it. Use the PAR IDs to reference rows in tickets.

**By priority, all modules:** P0 40 · P1 125 · P2 280 · P3 169 · other 4.

### 01 Engage > Campaigns: list, picker, audience step (36)

By priority: P0 3 · P1 6 · P2 22 · P3 5. Evidence and recommendations: [modules/01-engage-campaigns.md](modules/01-engage-campaigns.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-001 | Create entry & channel picker | SMS channel | Every SMS campaign reaches the provider with an empty body, so it is rejected or delivered blank. There are no DLT template or sender-ID fields, which India requires. | **P0** | S |
| PAR-002 | Builder step 1: audience | Required audience and condition validation | A half-configured campaign silently goes to the whole base. Require an explicit audience, block empty filters, reuse `validateFilterConfig`, and name "All users" in the confirmation. | **P0** | S |
| PAR-003 | Builder step 1: reachability & control groups | Automatic exclusion of opted-out users | Shoppers who never opted in, or who unsubscribed in Shopify, still get promotional campaigns, and campaign emails have no working unsubscribe. This blocks CAN-SPAM, DPDP and Gmail/Yahoo bulk-sender compliance. A manual "Email Subscribed is true" filter exists (`domainRegistry.ts:10`), but nothing applies it. | **P0** | M |
| PAR-004 | Campaign stats dashboard | Cross-campaign KPI tiles with date range | No date picker in the UI, no CTR, CVR or conversions, and no % change. Email campaigns are missing because campaign emails write no `messages` rows. Build a Campaign stats page. | P1 | M |
| PAR-005 | Campaign stats dashboard | Overall performance by channel | No per-channel table, conversions, revenue, rates or export. Email is excluded. | P1 | M |
| PAR-006 | Delivery types | Periodic | Recurring sends drift away from the chosen time, never end, and lose each run's history. | P1 | M |
| PAR-007 | Builder step 1: audience | User property attribute catalogue | Default projects cannot target by city or state, custom Shopify attributes, WhatsApp or push opt-in, first/last seen dates, or device. | P1 | M |
| PAR-008 | Builder step 1: audience | Custom segment as a filter block | Users cannot express "Segment A AND city = Pune" or exclude a segment. Time-based segments can be a day stale when the campaign sends. | P1 | M |
| PAR-009 | Builder step 1: audience | Date attribute conditions | Missing: in the next N days, is today, exists, and recurring day/month matching on a date attribute (birthdays, anniversaries). Expose `within_last` first. | P1 | M |
| PAR-010 | Campaign list | Drafts access by role (RBAC) | Any logged-in role, including a dealer `agent`, can create and send a campaign to the whole project. Add per-action permissions (view drafts, send, approve) and agent scoping. | P2 | M |
| PAR-011 | Campaign list filters | Status filter (10 statuses) | Add Pause and Stop for sending and periodic campaigns, Failed and Expired states, and a multi-status filter. | P2 | M |
| PAR-012 | Campaign list | Table columns, paging and empty state | The Goals column shows only open and click rate, with no conversions or revenue. "Created" shows the sent or scheduled date when present. No pagination. An empty search shows a blank table, and an API error shows "No campaigns yet". | P2 | M |
| PAR-013 | Campaign stats dashboard | Conversion attribution selector | No project-wide default and no cross-campaign de-duplication, so one order can be credited to several campaigns. | P2 | M |
| PAR-014 | Campaign stats dashboard | Per-channel funnel time series | No channel-level aggregation, monthly bucket, chart/table toggle or download. | P2 | M |
| PAR-015 | Create entry & channel picker | Email channel | Email campaign sends bypass `deliveryService`. The project email frequency cap and the campaign's cap toggles never apply, and no `messages` rows are written. Opens and clicks are tracked only through the Resend webhook. The unsubscribe gap is the P0 opt-out row below. | P2 | M |
| PAR-016 | Create entry & channel picker | Push channel | No web push, multi-device delivery, deep link or platform targeting. | P2 | M |
| PAR-017 | Create entry & channel picker | In-app channel | In-app messages are never displayed, and a campaign aimed at a saved segment is served to everyone. | P2 | L |
| PAR-018 | Create entry & channel picker | On-site messaging channel | No audience-targeted on-site banners or popups as a campaign channel. | P2 | L |
| PAR-019 | Create entry & channel picker | Facebook / Google Ads audience channels | Manual upload, no API sync, and not a campaign channel. | P2 | M |
| PAR-020 | Delivery types | Event Triggered | The capability exists but is hard to find. Route this card to a prefilled one-step Flow. | P2 | S |
| PAR-021 | Delivery types | API Triggered | No "send this campaign or template to user X" API. | P2 | M |
| PAR-022 | Builder step 1: campaign details | Campaign tags and Manage tags | No default tags, tag library or tag display. | P2 | S |
| PAR-023 | Builder step 1: campaign details | Content type: Promotional vs Transactional | A transactional email still skips users who opted out of marketing, so the label overpromises. | P2 | S |
| PAR-024 | Builder step 1: campaign details | Channel configuration warnings | Users find misconfiguration only after sends fail. Add provider-status banners. | P2 | S |
| PAR-025 | Builder step 1: audience | Numeric attribute operators | No "not between", ≥/≤ or exists. | P2 | S |
| PAR-026 | Builder step 1: audience | String operators, case sensitivity and multi-value | No negated operators, exists/empty, "is any of" or case toggle. | P2 | S |
| PAR-027 | Builder step 1: audience | Exclude users | Excluding "City is Pune" also drops every customer with no city, because `NOT (NULL)` filters the row out (module 03 rates the same defect). Use `NOT COALESCE((filter), FALSE)`. A saved segment cannot be excluded directly. | P2 | S |
| PAR-028 | Push step 1 | Target platforms (Android / iOS / Web) | Wire per-platform content through to sending, or remove the block. | P2 | M |
| PAR-029 | Event-triggered step 1 | Primary, alternate and secondary trigger events | No "added_to_cart OR checkout_started" trigger and no "did A then B within X" entry. | P2 | M |
| PAR-030 | Event-triggered step 1 | Send timing after trigger | No single-screen triggered send with a delay window, and no "X days before" a date attribute. | P2 | M |
| PAR-031 | Event-triggered step 1 | Real-time segment evaluation for triggered sends | Behavioural rules in a trigger audience can never match. Evaluate them with SQL. | P2 | S |
| PAR-032 | Campaign list | Refresh button | Progress of a sending campaign shows only after a refocus. Add a Refresh button or poll while a campaign is `sending`. | P3 | S |
| PAR-033 | Create entry & channel picker | Create entry points | Add a global Create menu for campaigns, flows and segments. | P3 | S |
| PAR-034 | Create entry & channel picker | Custom connector channel | Campaigns cannot broadcast a per-user webhook. | P3 | M |
| PAR-035 | Create entry & channel picker | Paid add-on tiles with Request access | No upsell path inside the picker. | P3 | S |
| PAR-036 | Delivery types | Channels without a delivery-type step | Skip the delivery step for In-App. | P3 | S |

### 02 Campaign builder: Email (37)

By priority: P0 2 · P1 5 · P2 15 · P3 14 · other 1. Evidence and recommendations: [modules/02-builder-email.md](modules/02-builder-email.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-037 | Delivery types | Event Triggered delivery type | Triggered emails (abandoned cart, browse, welcome) are the core D2C use case. Any template picked in the Flow UI is never found, so the fallback email goes out. Auto-created flows can render whichever project's same-named template Postgres returns first, including another brand's edits. Flow emails also go from the ESP fallback sender, not the brand's verified address. Fix: look up by id (and by name for auto-created flows), always scoped to `projectId`; pass the project sender; then point the Event Triggered card to a prefilled one-step flow. | **P0** | S |
| PAR-038 | Drag-and-drop editor | Unsubscribe special link | Every campaign email goes out with a dead or missing unsubscribe link and no List-Unsubscribe header, failing CAN-SPAM, DPDP and Gmail/Yahoo bulk-sender rules. Fix: mint a token per recipient in `sendOneRecipient`, set `unsubscribe_url`, add the headers in the email providers, and append a footer when the body has none. Same root cause as module 01's P0. | **P0** | S |
| PAR-039 | Delivery types | Periodic delivery type | The chosen send time and end date are ignored, so runs drift and never stop. The first run needs a manual Send Now, and each run wipes the previous run's recipients and stats. Same as module 01. | P1 | M |
| PAR-040 | Step 2: Email details | Preview text (preheader) | Bug: the preheader typed on create never reaches the sent HTML, unless it was typed before picking a saved template (`create/page.tsx:828-831`). Blank layouts send none; starters send their default ("Your cart is waiting."). The edit page picks it up only on the next builder change (`[id]/edit/page.tsx:787-791`), and Custom HTML never gets it. The hidden preheader `<div>` is also emitted inside `<head>` (`emailCompiler.ts:34`). No length guidance. | P1 | S |
| PAR-041 | Step 2: Email details | Sender name, verified From address, Reply-to | While a brand's domain is pending, or when a user types an unverified address, every campaign email carries an unverified From and the ESP rejects it; with Resend there is no fallback. Validate From against verified senders on save, and use the shared sender until the domain is verified (as the comment in `emailDomainService.ts:20` intends). An empty Reply-to behaves like "same as From". | P1 | S |
| PAR-042 | Personalization | Personalization picker (insert attribute with fallback) | Values resolve correctly at send time, but no picker inserts a token at the cursor in the subject, preheader, text or URLs. Users must know token names, then map them in a separate panel, which guesses a source for unknown names (often Customer ▸ Name). | P1 | M |
| PAR-043 | Drag-and-drop editor | Rich-text toolbar for editing text on the canvas | Text is edited as HTML source in a sidebar, not on the canvas, with no inline formatting, link dialog or emoji. The largest usability gap for non-technical marketers. | P1 | M |
| PAR-044 | Step 1: Target users | 3-step wizard with validated step tabs | Users can jump to any step. A disabled Next or Create says nothing about the missing field. Save-time variable errors show on step 2 while the Create button is on step 3, where only a toast appears. | P2 | S |
| PAR-045 | Step 1: Target users | Content type (Promotional / Transactional) | A transactional email still skips users who opted out of marketing, so "Always delivered" is wrong for email. Respect content type in staging (keep the suppression list). Same as module 01. | P2 | S |
| PAR-046 | Step 2: Template chooser | Pre-built template gallery | About 17 starters against about 125, with no gallery search, categories or pagination. Each "Starter Templates" click inserts another full set of copies. Indian festive-sale templates would be an inexpensive differentiator. | P2 | M |
| PAR-047 | Step 2: Gmail annotation | Deal annotations | The publisher name is hard-coded to "Storees" (`gmailAnnotation.ts:52`) instead of the brand, and annotation fields cannot be personalised (tokens stay literal). | P2 | S |
| PAR-048 | AI assistance | AI option range (tones, personas, languages) | No Hinglish and no Indian languages beyond Hindi, which matters for India-heavy audiences. Few tones and personas. The attribute list offers `city` and `order_id`, which are not built-in tokens. | P2 | S |
| PAR-049 | AI assistance | AI buttons on Subject and Preview Text fields | AI is not attached to the fields and cannot suggest preview text. "Apply body" replaces a designed layout with plain copy, which the next builder edit then overwrites again. | P2 | S |
| PAR-050 | AI assistance | Build Email HTML with AI agents | Not reachable from the campaign builder. "Save as template" posts AI HTML whose buttons use `{{cart_url}}`/`{{store_url}}` with no mapping, which the save-time lint rejects (`emailLayoutRenderer.ts:22-27`, `routes/templates.ts:328-332`). "Edit in builder" auto-maps those tokens to Customer ▸ Name (`VariablePanel.tsx` `guessSourceForKey`), so buttons link to the shopper's name unless remapped. | P2 | S |
| PAR-051 | Variations, A/B and locales | A/B test with two variants and a manual split | Variant B cannot be designed in the visual builder or copied from A, and the chosen winner metric is ignored in results. | P2 | M |
| PAR-052 | Drag-and-drop editor | Dynamic image / Dynamic Content block | No dedicated UI, fallback image or do-not-send rule; an empty token produces a broken image. | P2 | S |
| PAR-053 | Drag-and-drop editor | Row layouts and row styling | Blocks inside columns keep the full-width 40 px side padding (`row()` in `emailCompiler.ts`). In a 4-column row (the 4 Columns and Product Grid starters) text gets about 48 px and the 32 px-padded button overflows on desktop. No vertical alignment and no per-column background or padding. | P2 | S |
| PAR-054 | Custom HTML editor | HTML code editor with live preview | No syntax highlighting, line numbers, formatting or side-by-side preview. | P2 | M |
| PAR-055 | Preview and test | Preview as a chosen user | A specific customer cannot be found by email, phone or ID; this needs a search field. | P2 | S |
| PAR-056 | Preview and test | Test send | Not available in the builder before saving; one address only; no choice of customer data or seed segment. Test sends skip `{{recommended_products}}` and also copy the campaign's Cc/Bcc list. | P2 | S |
| PAR-057 | Preview and test | Pre-send campaign QC | The checks exist but users never see them. The unsubscribe check passes on the `{{unsubscribe_url}}` placeholder (`contentLint.ts:150-153`), which sends empty. | P2 | S |
| PAR-058 | Event-triggered email | Trigger condition: primary, alternate and follow-up events; Immediately or With Delay | No OR list of trigger events, and follow-up logic needs extra flow steps. Fix the template lookup first (Event Triggered row). Same as module 01. | P2 | M |
| PAR-059 | Step 1: Target users | Channel-not-configured banner | Nothing warns that mail will go from the shared sender, or that the brand's domain is still pending (in which case sends fail; see the From row). | P3 | S |
| PAR-060 | Step 1: Target users | Campaign tags | Tags are saved but never shown, filtered or edited, and there is no shared tag list to pick from. | P3 | S |
| PAR-061 | Step 2: Template chooser | Template preview modal (desktop/mobile, Choose and continue) | No mobile preview, and starter cards replace the content before they can be previewed. | P3 | S |
| PAR-062 | Step 2: Template chooser | My saved templates with search | The search box does nothing, there are no folders, and "API templates" leads nowhere. | P3 | S |
| PAR-063 | Step 2: Email details | Email connector selection | The connector cannot be chosen per campaign (for example a separate ESP or IP pool for a big sale blast). | P3 | M |
| PAR-064 | Step 2: Email details | Cc / Bcc | Cc/Bcc cannot be personalised or validated. Nothing warns that each recipient's email is copied, so a 10,000-recipient send delivers 10,000 copies (with every customer's address) to the Cc inbox. | P3 | S |
| PAR-065 | Personalization | Attribute catalogue, including campaign attributes | No consent/reachability, device or acquisition groups, and no campaign id or tags tokens. In broadcast campaigns the Product and Event-property sources always resolve to the default, because the send has no product or event (`campaignService.ts:930-936`), yet the picker offers them. | P3 | M |
| PAR-066 | Drag-and-drop editor | List and HTML blocks | No list editor; custom HTML has to go inside a Text block. | P3 | S |
| PAR-067 | Drag-and-drop editor | Personalized links dialog | Personalised URLs work, but only if the user types the token syntax. | P3 | S |
| PAR-068 | Drag-and-drop editor | File manager, stock photos and image editor | No folders or import, no stock photo search, and no crop or resize. | P3 | M |
| PAR-069 | Drag-and-drop editor | Image link types | No link-type picker; `mailto:`, `tel:` and `sms:` links work only if typed. | P3 | S |
| PAR-070 | Drag-and-drop editor | Social block | No real icons or icon styles, and links cannot be removed. | P3 | S |
| PAR-071 | Drag-and-drop editor | Change history panel | No visible, timestamped history. | P3 | S |
| PAR-072 | Drag-and-drop editor | Template actions: Download | The HTML cannot be downloaded as a file. | P3 | S |
| PAR-073 | Step 1: Target users | Audience and control groups | Assessed in module 01: an empty audience silently falls back to every customer (P0 there), and there is no global control group, affinity filter or segment-as-filter block. | See 01 | — |

### 03 Campaign builder: Push & SMS (30)

By priority: P0 3 · P1 7 · P2 11 · P3 8 · other 1. Evidence and recommendations: [modules/03-builder-push-sms.md](modules/03-builder-push-sms.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-074 | Step 1: Target users | Target platforms (Android / iOS / Web) with per-platform content and "Copy content" | Send `pushContent` (map it to the FCM `android`, `apns` and `webpush` blocks), keep a title visible, move platform choice to step 1, and add "Copy content". | **P0** | S |
| PAR-075 | Step 2: Push content | Default click action, deep links and key-value pairs | Add a click action (deep link or URL) and custom key-value pairs to every push; send them in `data`, the APNs payload and `webpush.fcm_options.link`; tag the link with UTM; stop putting PII such as `customer_email` in `data`. | **P0** | S |
| PAR-076 | Step 2: SMS content | SMS message composer | Make the SMS providers fall back to `variables.message` when there is no template (one line in each) and add a regression test. | **P0** | S |
| PAR-077 | Step 1: Target users | Automatic exclusion of opted-out users | Turn STOP/START replies from each SMS provider into consent records, honour Shopify SMS consent at send, and count SMS and push opt-outs in the preview. Interim workaround: add "SMS Subscribed is true" to the audience filter. | P1 | M |
| PAR-078 | Step 2: Push content | Web push (redirect URL, auto-dismiss, image, buttons, icon, desktop preview) | First-party web push: an SDK opt-in prompt and service worker, per-device subscriptions (anonymous ones too), a `webpush` payload (link, icon, actions, requireInteraction) and a desktop preview. | P1 | L |
| PAR-079 | Step 2: Variants, preview and test | A/B variations for SMS and push | Send the variant B text (and a B title for push). Then move to tabbed variations, more than two, with "Copy variation". | P1 | S |
| PAR-080 | Step 3: Schedule | At a set date and time, in a campaign time zone | Read the date and time in the chosen zone, offer the full IANA list with offsets, and show the result in the admin's own zone. | P1 | S |
| PAR-081 | Step 3: Schedule | Send in user time zone | Compute each recipient's local send time from the campaign's wall-clock date and time, fill the zone from the Shopify address or country when it is missing, and decide what happens to zones whose time has passed. Until then the option delays the whole send by a day. | P1 | S |
| PAR-082 | Step 3: Schedule | Periodic: daily, weekly or monthly, with start date and send time | Honour the send time, time zone and end date; add a start date that schedules the first run; compute the next run from the schedule rather than the last completion; keep each run's history. | P1 | M |
| PAR-083 | Step 3: Goals and delivery controls | Delivery throughput | Per-provider and per-tenant rate limits instead of one global cap, priority for transactional and flow sends, more workers, and batch provider APIs (FCM multicast, bulk SMS) to reach 50,000+ a minute. | P1 | M |
| PAR-084 | Step 1: Target users | Exclude users | Excluding "City is Pune" also drops every customer with no city, and any custom-attribute rule drops everyone without that attribute (email campaigns too). Use `NOT COALESCE((filter), FALSE)`. Excluding a saved segment is tracked in module 01. | P2 | S |
| PAR-085 | Step 2: SMS content | Character and SMS-segment counter | Detect GSM-7 vs UCS-2 and estimate length after personalisation, UTM tagging and link shortening. | P2 | S |
| PAR-086 | Step 2: Variants, preview and test | User distribution: Merlin auto-optimisation and winner | Send to a test cohort first, then the winner to everyone else; later, a bandit that shifts traffic by CTR during the send. | P2 | L |
| PAR-087 | Step 2: Variants, preview and test | UTM parameters | Starts working once the SMS body and push link are fixed; then add utm_term and utm_content presets and tag the push link. | P2 | S |
| PAR-088 | Step 3: Schedule | Periodic: every N, several weekdays, day-of-month grid, nth weekday | Interval, multi-day and nth-weekday rules (RRULE-style) in the UI and the scheduler. | P2 | M |
| PAR-089 | Step 3: Schedule | Periodic end condition and next-send preview | Enforce the end date, add a maximum number of runs, and show the server-computed next send in the builder and on the detail page. | P2 | S |
| PAR-090 | Step 3: Goals and delivery controls | Conversion goals and attribution window | Count only recipients whose send went out, start the window at each recipient's send, fix the label, and give SMS a click signal (short links). With today's empty-body defect an SMS campaign reports conversions and revenue from people who received nothing. | P2 | S |
| PAR-091 | Step 3: Goals and delivery controls | All-users safety warning before publishing | Show the audience size and an All-users warning at the end of step 3 and on Send Now, with a link back to step 1. | P2 | S |
| PAR-092 | Triggered campaigns | Event-triggered SMS and push | Make the "Event Triggered" card create a one-message flow, add a title to push templates, and give flows campaign-style revenue goals and holdout reporting. | P2 | M |
| PAR-093 | Triggered campaigns | Trigger logic: alternate and secondary events, delay relative to an action | Several trigger events joined by OR, an "A then B within X" trigger, and delays measured from an event or date attribute, including "before". | P2 | M |
| PAR-094 | Triggered campaigns | Active window (start and end date) | Optional start and end times on flows (and future event-triggered campaigns), enforced by the trigger worker. | P2 | S |
| PAR-095 | New Campaign modal | Delivery types per channel, with hover descriptions | List the types each channel really supports. Point "Event Triggered" at a prefilled one-message flow (event-triggered SMS and push already work in Flows); hide "Device Triggered" until there is an app SDK. | P3 | S |
| PAR-096 | Step 1: Target users | Campaign name and tags | Show and filter tags on the list, edit them, and suggest existing tags instead of free text. | P3 | S |
| PAR-097 | Step 2: Push content | Push title, message and Android message summary | Add a summary sent in `data` for the app to render (FCM's Android notification has no summary field), once per-platform content is wired. | P3 | S |
| PAR-098 | Step 2: Push content | Push rich media (image URL, upload, GIF, AI Designer) | Reuse the asset upload for push images, validate size and ratio, and send per-platform images. GIF, audio and video need app support. | P3 | S |
| PAR-099 | Step 2: Push content | iOS-specific content: subtitle, sound, badge, background refresh, categories, audio/video | Send subtitle, badge, a custom sound and `content-available` in the APNs payload; add categories once buttons exist. | P3 | S |
| PAR-100 | Step 2: Push content | Device previews | Lock-screen previews with dark/light and collapsed/expanded states, kept beside the editor. | P3 | S |
| PAR-101 | Step 2: SMS content | SMS sender (connector) per campaign | Several connectors or sender IDs per project (e.g. promotional vs transactional headers), chosen per campaign. | P3 | M |
| PAR-102 | Step 2: Variants, preview and test | Personalized preview (preview as a chosen user) | A customer search (email, phone or external id) and a preview that refreshes as you type. | P3 | S |
| PAR-103 | Step 1: Target users | Target audience: All users, or filter by property, behaviour, affinity or segment | Assessed in module 01: an empty segment or filter silently falls back to every customer (P0 there), and there is no affinity rule and no segment-as-filter block. | See 01 | — |

### 04 Campaign builder: WhatsApp (27)

By priority: P0 1 · P1 11 · P2 13 · P3 2. Evidence and recommendations: [modules/04-builder-whatsapp.md](modules/04-builder-whatsapp.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-104 | Step 3: Schedule and goals | "All users" warning before Publish | An accidental WhatsApp broadcast to the whole base (paid per message, and it hurts WABA quality) behind a misleading confirmation. Block "Saved segment" with no segment, and show audience type, recipient count and estimated cost before sending. Same root cause as the module 01 P0. | **P0** | S |
| PAR-105 | Step 2: Content | UTILITY and AUTHENTICATION templates in a campaign | Meta allows approved templates of any category outside the 24-hour window; the window governs free-form messages and free utility pricing. A utility broadcast (back in stock, shipping delay) reaches almost no one. Make the filter an optional cost saver. | P1 | S |
| PAR-106 | Step 2: Content | UTM parameters | WhatsApp campaign clicks reach Shopify and GA4 untagged, so external tools can't credit WhatsApp. Show the UTM block for WhatsApp and pass `utmParameters` in `sendOneRecipient`. As in MoEngage, this covers tracked buttons only. | P1 | S |
| PAR-107 | Step 2: Content | Carousel templates | An approved carousel can be created but not delivered from campaigns or flows, because Meta needs per-card header media at send time. This blocks the Phase A dynamic-carousel smoke test. Add CAROUSEL card components with per-card media and button bindings. | P1 | M |
| PAR-108 | Step 2: Content | Link shortening and click tracking | Read from code, not run: within an hour of approval a tracked button stops getting slugs, and sends go out without its button parameter. Preserve `track` and the destination across syncs first (S), then add per-project domains and a per-button click report. | P1 | M |
| PAR-109 | Step 2: Content | A/B variations | A WhatsApp A/B test sends the same template to both groups, so its results are meaningless. Hide the block for WhatsApp now (S); then add a variant-B template picker with its own mappings, judged on read or click rate. | P1 | M |
| PAR-110 | Step 3: One Time | Specific date and time in a campaign time zone | The campaign goes out at the wrong time whenever the browser's zone differs from the one picked (e.g. a Dubai team scheduling for India), and only 10 zones are offered. Convert in the chosen IANA zone and offer the full searchable list. | P1 | S |
| PAR-111 | Step 3: Periodic | Daily, weekly or monthly with start date, send time, time zone and end | Recurring WhatsApp sends drift to whenever the scheduler runs, never stop, have no start date and wipe each run's analytics. Same defect as modules 01-03. | P1 | M |
| PAR-112 | Step 3: One Time and Periodic | Request limit (throughput) | A 1-lakh (100,000) broadcast needs at least 33 minutes, longer when other brands are sending; MoEngage's default is 60,000 a minute. BullMQ's limiter is queue-wide, so adding workers won't help. Replace it with per-provider, per-number limits (Cloud API allows 80+ messages a second per number) and per-tenant fairness. | P1 | M |
| PAR-113 | Step 3: Event Triggered | Ignore / count frequency capping for triggered sends | With the default cap of 1 WhatsApp per 7 days, a customer who got any marketing broadcast that week silently misses the abandoned-cart WhatsApp. Add ignore/count toggles to the send node. | P1 | S |
| PAR-114 | Settings: Sender configuration | BSP choice: Gupshup, Infobip, Karix | Brands already on Gupshup, India's largest BSP, can't connect without migrating their number. Expose Gupshup in the panel, including the `appId` its template sync needs (the generic form collects only API key, app name and number). Add Karix and Infobip later. | P1 | S |
| PAR-115 | Settings: Sender configuration | Delivery tracking (webhook) | Read from code, not run: a BYO Meta connection may get no receipts, replies, STOP opt-outs or 24-hour-window data, while the panel says tracking is active. Pass `override_callback_uri` and a verify token on `subscribed_apps`, or show both to paste; Embedded Signup avoids the issue. | P1 | S |
| PAR-116 | New Campaign modal | Event Triggered delivery type | The capability exists, but not where a MoEngage user looks; in a demo the "Soon" card reads as a missing feature. Make the card open a prefilled trigger → WhatsApp flow. | P2 | S |
| PAR-117 | Step 1: Target users | Campaign tags | Tags organise nothing today. Add a project tag list, show tags on the list and detail pages, and filter by tag. | P2 | S |
| PAR-118 | Step 1: Target users | Custom segment combined with filters; exclude a segment | Can't express "VIP segment AND city = Mumbai" or "exclude Recent purchasers". Add a "member of segment" rule (flows already have an `in_segment` condition, `flowExecutor.ts:526-534`). | P2 | S |
| PAR-119 | Step 2: Content | Personalised preview for a real user | Can't look up a specific customer by ID, email or phone. `useCustomers.ts:12-29` already supports `search`, so a lookup box is cheap. | P2 | S |
| PAR-120 | Step 2: Content | Test campaign | Missing: tests to a registered customer by ID or email, saved test lists or segments, and test send on the edit page. The test bypasses `deliveryService`, so a template with a tracked button goes out without its button parameter, which Meta should reject (read from code). | P2 | S |
| PAR-121 | Step 3: Event Triggered | Active continuously with start/end date-time and time zone | Can't pre-schedule a festive triggered journey to start and stop on its own. Add `activeFrom`/`activeUntil` to flows and check them in `triggerWorker`. | P2 | S |
| PAR-122 | Step 3: Schedule and goals | Goal window: N hours or days from delivery | Purchases made while a large or throttled send is still going out are missed, and the label is wrong. Measure from each recipient's `delivered_at` and add a Days unit. | P2 | S |
| PAR-123 | Step 3: Event Triggered | Conversion goals and revenue for triggered sends | Triggered WhatsApp journeys, the main revenue driver, can't report attributed revenue or more than one goal. Reuse the campaign goal evaluator for flow messages. | P2 | M |
| PAR-124 | Campaign info | WhatsApp campaign info and analytics | No settings summary (tags, audience type, template, provider, cap flags, holdout %) and no per-button click report. For WhatsApp the preview card is titled "Email Preview" and shows the raw `{{1}}` body (`[id]/page.tsx:352,393-410`). | P2 | S |
| PAR-125 | Settings: Approved templates | Approved-templates library (filters, usage, delete, archive) | Rejected and test templates pile up, and there's no way to see which campaigns or flows use a template before editing it. Add delete (locally and at Meta), archive, filters and a usage view. | P2 | M |
| PAR-126 | Settings: General | WhatsApp opt-in attribute | Same send rule, but no attribute can be chosen: the gate reads only the consents table, and `customers.whatsapp_subscribed` is never read at send, so an opt-in imported as an attribute has no effect unless a consents row is also written (module 20). Shopify's marketing flags aren't copied into consents. | P2 | S |
| PAR-127 | Settings: General | Create a profile for messages from new numbers | Organic inbound leads (QR codes, website chat buttons) never become profiles, so they can't be segmented or retargeted. Add a project toggle. | P2 | S |
| PAR-128 | Settings: General | Store all incoming messages as an event | Always on; no toggle. The `whatsapp_inbound` event is inserted straight into `events` and never queued (`whatsappInboundService.ts:140-158`), so a reply can't start or exit a flow (module 20). | P2 | S |
| PAR-129 | Event Triggered: Step 1 | Secondary trigger event (AND within the delay) | The flow waits the full delay before checking, so it can't send the moment the second action happens. | P3 | M |
| PAR-130 | Settings: General | WhatsApp number attribute and format | Brands that keep a separate WhatsApp number in a custom attribute can't use it, and the default country code is platform-wide, not per brand. | P3 | S |

### 05 On-site, In-app, Cards, connectors, ad audiences (37)

By priority: P0 1 · P1 8 · P2 24 · P3 4. Evidence and recommendations: [modules/05-builder-onsite-inapp-other.md](modules/05-builder-onsite-inapp-other.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-131 | On-site/In-app: Content | Message layouts (Full screen / Pop up / Nudge) rendered on the client | Ship an SDK renderer for modal, banner, toast and full screen that fetches `/v1/in-app-messages` and posts shown, dismissed and clicked; render tokens server-side; fix the channel mismatch. Until then, hide the In-App channel or label it clearly. | **P0** | M |
| PAR-132 | Channel picker | Inbound group: In-app, On-site and Cards tiles that open their builders directly | Add an Inbound group (In-App, On-site) that skips the delivery type and opens the builder; link `/widgets`; tell Shopify merchants to add the script tag (or ship a theme app embed) so on-site widgets can render. | P1 | S |
| PAR-133 | Ad audiences | Facebook (Meta) custom audience sync | Connect the ad account, create a custom audience from a segment and keep it updated as customers enter or leave it. The hashing already exists. | P1 | L |
| PAR-134 | On-site: Target users | On-site builder shell: 3-step wizard, name and tags, Save as draft with autosave | Move widgets into the campaign wizard, or a dedicated On-site builder, with drafts, tags and scheduling. | P1 | M |
| PAR-135 | On-site: Target users | On custom event trigger (Has Executed `<event>` + Trigger/Filter; show Immediately or After Delay) | A no-code event trigger: WidgetManager listens to SDK `track()` calls and matches an event name, property filters and a delay. The manual API is a developer stopgap. | P1 | S |
| PAR-136 | On-site: Target users | Target audience: All users / Filter users by property, behavior, affinity or segment; nested filters; Exclude users; Show count | Add segment and filter targeting to widgets. Make the endpoint honour `segmentId`, exclusions and holdouts; fix the segment leak before any renderer ships. | P1 | M |
| PAR-137 | On-site/In-app: Content | Native editor styling: background, entry/exit animation, close button, border, image widget, buttons (Filled / Outlined / Text, font, colours) | Style controls for widgets and in-app layouts: colours, font, radius, close button, animation and multiple buttons. | P1 | M |
| PAR-138 | On-site/In-app: Schedule & delivery | One-time schedule: As soon as possible / specific date and time, time zone, Ends Never / On | Start and end dates for in-app messages and widgets (e.g. sale-week popups). | P1 | S |
| PAR-139 | On-site/In-app: Schedule & delivery | Conversion goals (up to 5; event and attributes; revenue; tracked N hours from impression or click) | Per-impression attribution for in-app and on-site; impression, submission and conversion analytics for widgets. | P1 | M |
| PAR-140 | Channel picker | Outbound tiles (Push, Email, SMS) with per-channel delivery types | No event-triggered campaign type (users must build a flow), and channels aren't paired with their delivery types. Builder depth is scored in modules 02-03; for example, SMS campaigns send an empty body because the SMS provider renders the template body and SMS campaigns save no template (`twilioProvider.ts:7-16`). | P2 | S |
| PAR-141 | Connected apps | Conversions: Meta Ads Conversions API | Meta documents user agent and source URL as required for website events, so relayed events may be rejected or flagged (check the Test action and Events Manager diagnostics), and purchases can be double-counted when the shop's Meta pixel or Shopify's Meta app also reports them. Capture user agent, IP, `_fbp`/`_fbc` and page URL with the cart (like `storees_sid`) and share event ids with the pixel. Built in, not a paid add-on. | P2 | S |
| PAR-142 | Ad audiences | Google Ads Customer Match sync | User-list sync through the API (developer token + OAuth). Google's normalisation guidance asks for E.164 with '+' before hashing, so phone matches may be lost; test match rates. | P2 | L |
| PAR-143 | On-site: Target users | Target platforms: Web / Mobile Web | Platform targeting based on the existing `device_type`. | P2 | S |
| PAR-144 | On-site: Target users | Select pages: All / Specific pages with URL operators, include/exclude and a 'Check page targeting' tester | An include/exclude rule builder with operators and a URL tester. | P2 | S |
| PAR-145 | On-site: Target users | Campaign control group | Apply the holdout in `/v1/in-app-messages` and in widgets, and report lift. | P2 | S |
| PAR-146 | On-site: Content | Brand Book kit styling applied to templates | Apply the brand colours, logo and font to widgets and in-app layouts. | P2 | S |
| PAR-147 | On-site/In-app: Content | Lead-generation form: field styling, custom fields (Email, Text, Date, Number, Telephone, DateTime), placeholder, attribute mapping, Required, + Terms & conditions | A configurable field list mapped to custom attributes, with styling; honour 'Phone required'. | P2 | M |
| PAR-148 | On-site/In-app: Content | Content step shell: Save / Change / Reset template with confirmation; live preview with Copy HTML | A live layout preview in the campaign step, save and reset template, full in-app template editing, and serving the campaign's own content. | P2 | S |
| PAR-149 | On-site/In-app: Content | Click actions: Navigation (URL, deep link, rich landing, key-value pairs) and Dismiss | Actions per button, several per element. | P2 | M |
| PAR-150 | On-site/In-app: Content | Click actions: Track Event and Set User Attribute | Generic track-event and set-attribute button actions. | P2 | S |
| PAR-151 | On-site/In-app: Content | Merlin AI copy generator | Add a character limit, serve the campaign body, and add AI to widgets. | P2 | S |
| PAR-152 | On-site/In-app: Content | A/B testing: variations with a % split ('+ A/B test': Copy / New Variation) | Serve variants deterministically from the endpoint and in widgets, and report results per variant. | P2 | M |
| PAR-153 | On-site/In-app: Content | Personalized preview: pick a user, Fetch user data, Update preview | A preview that can search any customer, and server-side token rendering for in-app. | P2 | S |
| PAR-154 | On-site/In-app: Content | UTM parameters (source, medium, campaign, term, content, custom) | Append UTM to in-app CTA URLs; hide the block until that works. | P2 | S |
| PAR-155 | On-site/In-app: Schedule & delivery | Delivery controls: max shows per device, minimum delay between messages, ignore global minimum delay, auto-dismiss after N seconds | Show cap, cool-down, minimum delay across messages, auto-dismiss. | P2 | S |
| PAR-156 | Connector | Custom connector in the picker with One Time / Periodic / Event Triggered | A Connector entry that opens a flow with an HTTP node (event or periodic) or a one-time webhook campaign. | P2 | S |
| PAR-157 | Connector | API request builder: Method, URL with personalization, URL Parameters (KV), Headers (KV), body Form / JSON / Raw | Query-parameter rows, Form and JSON KV bodies, custom-attribute tokens; call `assertPublicUrl` before exposing the node more widely. | P2 | S |
| PAR-158 | Connector | Authorization settings (saved configurations from Settings > Authorization Configuration) | Saved auth configurations (Bearer, Basic, API key, OAuth) that HTTP nodes can select. | P2 | S |
| PAR-159 | Connector | Test campaign (send a test request for a user by identifier type) | A 'Send test' in the HTTP node for a chosen customer that shows the response. | P2 | S |
| PAR-160 | Connector | Webhook delivery controls: request limit (rpm), ignore/count frequency capping, 'All users' warning, conversion goals | A per-node rate limit to protect partner APIs, and a warning when all users are targeted. | P2 | S |
| PAR-161 | Connector | Event Triggered: primary and alternate trigger events, secondary event, then Immediately / With Delay (After, If Action) | Several (OR) trigger events per flow. | P2 | S |
| PAR-162 | Connector | Event Triggered Step 3: active continuously with start/end, goals, minimum delay, Ignore DND, frequency capping | A start/end window for flows, and DND or quiet hours (affects every channel). | P2 | M |
| PAR-163 | Connector | Periodic webhook: Daily / Weekly / Monthly, start date, send time, repeat every N, Ends Never / On / After, next-send preview | Add an audience picker to the fixed-time trigger (and block activation without one), a time zone, a repeat interval, end conditions and a next-run preview. | P2 | S |
| PAR-164 | Ad audiences | Other retargeting apps: Snapchat, Pinterest, TikTok, Criteo, Microsoft, Amazon, Reddit Ads Audience, Truecaller | API sync for TikTok, Snap and Pinterest if customers ask. The others matter little for Indian D2C. | P3 | L |
| PAR-165 | On-site: Target users | Trigger time 'Immediately' after page load | Allow 0 s (Immediately). | P3 | S |
| PAR-166 | On-site/In-app: Content | Start from scratch: Self-Handled (custom string or JSON the app renders) | A custom JSON payload field for developer-rendered messages. | P3 | S |
| PAR-167 | Other channels | Voice calls (Deepgram) | Only as a hand-built flow step, with no call outcomes or campaign use. AI voice calls (e.g. COD confirmation) would need telephony and speech providers. | P3 | L |

### 06 Flows (33)

By priority: P0 4 · P1 7 · P2 16 · P3 6. Evidence and recommendations: [modules/06-flows.md](modules/06-flows.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-168 | Entry triggers | At fixed time: Periodic | Non-functional and misfires: the schedule never enrols anyone, while the flow still enrols every customer who fires the leftover event (On flow exit has the same flaw). Stopgap (S): skip `event` matching when `kind` is fixed_time or flow_exit, or hide both kinds. Full fix: advance the trips, add an audience step, time zones, every-N, several weekdays, ordinals, end conditions and a next-run preview. | **P0** | M |
| PAR-169 | Canvas: actions | Email node: the chosen template is sent | Email steps built in the UI never send their template, and seeded steps can render another tenant's template. Flow emails reach suppressed or unsubscribed addresses and are not tracked. Look up by id within the project (S); routing email through the gated, tracked path is in the engagement-conditions row. | **P0** | S |
| PAR-170 | Canvas: conditions | Channel-engagement conditions (context-aware) | Email open and click conditions can never be true for flow emails, so every user takes the No path. Checks are not tied to the preceding message (any WhatsApp read counts) and have no "within N" window. No sent, bounce, unsubscribe, spam or dismissed events; `<channel>_delivered` / `_failed` exist but only through a generic Has-done-event step. WhatsApp read works. | **P0** | M |
| PAR-171 | Canvas: controls | Exit nodes on every branch | A branch without its own Exit falls through into the other branch's steps, so users get messages meant for the other path while the canvas shows something else. Append an End to every open branch on save, or store explicit next pointers. | **P0** | S |
| PAR-172 | Flow list | Flow lifecycle states (Active, Scheduled, Paused, Stopped, Completed, Retired) | Pause only blocks new entries; in-flight trips keep sending when their waits end, so a misfiring flow cannot be halted. No Stop (end all trips), Scheduled, Completed or Retired. | P1 | M |
| PAR-173 | Templates | Flow template library | No preview or highlights before use. UI templates are mostly email-only and their send steps start empty. Win-Back fires on any segment entry (it cannot be scoped; see the event-trigger row). The WhatsApp-first journeys sit behind an unused API. No "Request a template". Wire the catalog into the gallery and preview it with a read-only builder. | P1 | M |
| PAR-174 | Entry triggers | Event trigger with attribute filters | Works, with two defects. `is` / `is not` use strict `===` (`eventFilters.ts:31-32`), so a typed "500" never equals a numeric 500. `enters_segment` carries `segmentId` (`segmentService.ts:144`) but the picker writes `segment_id` (`eventSchemas.ts:40`), so segment-scoped entry never matches. No between, exists or in-list operators. | P1 | S |
| PAR-175 | Audience & control groups | Audience: All users or filter by property, behaviour or custom segment | No audience step; behaviour rules cannot gate entry even through the API; the condition workaround counts everyone who triggers as a trip. | P1 | M |
| PAR-176 | Canvas: actions | SMS node | No DLT template ID, entity or sender ID, which are mandatory for SMS in India. No link shortening or click tracking. UTM saved but not applied (`SNM:597`). The number attribute cannot be chosen. | P1 | M |
| PAR-177 | Canvas: conditions | Conditional Split (multi-branch) | Routing by tier or category needs a chain of nested Yes/No steps, and branches cannot be named. | P1 | L |
| PAR-178 | Canvas UX | Errors panel and validation | Flows with unconfigured steps go live: an email step with no template sends the fallback email to every entrant, and an SMS step with no template reaches the provider with an empty body. No grouped list or jump to the faulty step. Block activation on the server. | P1 | S |
| PAR-179 | Flow list | List columns (Entry type, Status, Created, Performance, Goals, Actions) | No entry type, created date, goal or conversion/revenue column. "Completion %" counts trips that reached an end, not conversions. The chip shows the stale event name for fixed-time and flow-exit flows. No pagination. | P2 | S |
| PAR-180 | Templates | Locked feature: Next Best Action | NBA personalises content on a fixed path. No NBA step that picks the channel, offer or path for each user. | P2 | M |
| PAR-181 | Create & goals | Conversion goals (multiple, named, primary, attribute filters) | One unnamed goal; no secondary goals to compare. | P2 | M |
| PAR-182 | Entry triggers | Secondary trigger (AND; Has Executed / Has Not Executed within the delay) | No "did X and not Y within N" entry rule. The Wait + Has-done-event workaround enrols everyone and counts non-qualifiers as trips. Modules 01-05 rate the same workaround 🟡. | P2 | M |
| PAR-183 | Entry triggers | Business events | No product-level event that fans out to interested shoppers (viewed, carted, wishlisted). Back-in-stock and price-drop journeys need a per-customer event POSTed to /v1/events. | P2 | L |
| PAR-184 | Entry triggers | On flow exit (flow chaining) | Chained trips are created but never advance, and the stuck active trip then blocks that customer from the flow (one live trip per flow). No flow picker or exit-stage choice; trips ending through the goal or an exit event do not chain. The leftover-event misfire is fixed under the Periodic row (P0). | P2 | S |
| PAR-185 | Canvas: actions | Email node: in-node content editing | Content must be authored elsewhere first. No inline editing, dark-mode preview, import from a campaign or templating logic. | P2 | M |
| PAR-186 | Canvas: actions | Email node: sender details, content type, attachments | No per-step From or sender name, reply-to, preview text, cc/bcc, attachments, Gmail annotation or transactional routing, and flows ignore the project's own sender. | P2 | M |
| PAR-187 | Canvas: actions | Per-node A/B test variants | No variant-level test inside a step, and no per-variant analytics or winner. | P2 | M |
| PAR-188 | Canvas: actions | Per-node Locale variants | Multi-language email or SMS needs separate steps behind a language condition. | P2 | M |
| PAR-189 | Canvas: actions | Push node | No platform targeting, rich templates or web push. UTM is saved but not applied for push (`SNM:597`). | P2 | L |
| PAR-190 | Canvas: actions | Connector: URL parameters, auth configs, body types, test | Credentials must be pasted as headers in every node, and a request cannot be tested before going live. | P2 | S |
| PAR-191 | Canvas: conditions | Has done event: evaluation window | No "since the previous stage" or "in the past N" window, and the "Ever" label is wrong. Queue-only events such as `enters_segment` never reach the `events` table (`segmentService.ts:136-154`), so this check cannot see them. | P2 | S |
| PAR-192 | Canvas: controls | A/B Split | The UI cannot add or name branches, and moving the slider rewrites an API-made 3-way split to two branches (`FB:1201-1207`). No per-branch analytics or winner; stickiness cannot be turned off. | P2 | M |
| PAR-193 | Canvas: controls | Goto | Loops and re-routes can only be built through the API. | P2 | M |
| PAR-194 | Flow settings | Messaging control: frequency-capping overrides | No per-flow override, and flow emails are not capped at all. | P2 | S |
| PAR-195 | Create & goals | Flow name and description | Name and description cannot be edited in the UI after creation. | P3 | S |
| PAR-196 | Create & goals | Exit on conversion (optional) | Always on, so converters cannot stay for post-purchase steps. | P3 | S |
| PAR-197 | Canvas: actions | Merlin AI content generation in the Email node | No AI copy or variations from inside a flow step. | P3 | S |
| PAR-198 | Canvas UX | Node hover card with Stage ID | No hover summary and no readable, copyable stage name or id. | P3 | S |
| PAR-199 | Canvas UX | Full screen, recenter and mini map | No full-screen mode, recenter on content or mini map for large flows. | P3 | S |
| PAR-200 | Canvas UX | Entry Rules summary node | No audience, schedule or entry-limit summary, because those settings do not exist. | P3 | S |

### 07 All Segments, builder, Search Users, profile (40)

By priority: P0 1 · P1 6 · P2 26 · P3 7. Evidence and recommendations: [modules/07-segments-builder-profiles.md](modules/07-segments-builder-profiles.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-201 | Segment builder | User property: Localization (City, State, Country, Pincode, Time zone) | Shopify D2C brands cannot target by city or state (regional festivals, language creatives, serviceability) even though the data is already synced. Expose City and Region for every project, and add country and pincode from the same address. | **P0** | S |
| PAR-202 | All Segments | Predictive Segment | Score filters work, but a bucket "is" rule never matches and "is not" matches everyone. The generic Conversion Score, Dormancy Risk and Risk Bucket fields (`domainRegistry.ts:166-168`) read metrics nothing writes; Risk Bucket defaults to "low" (`evaluator.ts:1153-1154`), so "Risk Bucket is low" matches every customer. No "create segment from this prediction" action. | P1 | S |
| PAR-203 | Segment info | Reachability by channel | No per-channel split on segment cards, the edit page or the builder preview, so marketers can't compare a segment's WhatsApp and email reach before choosing a channel. | P1 | S |
| PAR-204 | Segment builder | User property: Reachability and subscription fields (Push per platform, SMS, WhatsApp, Web Push) | Cannot filter for customers who opted in to WhatsApp or can receive push, which matters for WhatsApp opt-in compliance. | P1 | S |
| PAR-205 | Segment builder | Behavior: event attribute filters (+ Attributes) | Marketers type property paths from memory; no OR, between or list operators; SDK properties prefixed with `$` are rejected. Reusing the flow builder's observed-property picker is a small change. | P1 | S |
| PAR-206 | Segment builder | Exclusions (Exclude Users) | Saved segments cannot exclude anyone (campaigns can), and no exclusion can reference a saved segment. | P1 | S |
| PAR-207 | User Profile | Per-channel reachability tiles | A Shopify D2C profile never shows WhatsApp or SMS reachability, and there is no push platform detail. The card also doesn't check that an email or phone exists. | P1 | S |
| PAR-208 | All Segments | Segment list layout and columns | No created-on or last-evaluated date and no sorting. Storees is ahead in showing member and reachable counts on the list, which MoEngage omits. | P2 | S |
| PAR-209 | All Segments | Archive action and Archived Segments view | Archive works only for default segments and there is no archived view. An archived segment keeps its frozen membership, and campaign sends read the stored membership (`campaignService.ts:227-239`), so it can still be picked and sent to. | P2 | S |
| PAR-210 | All Segments | Row action: Analyze Segment | The UI cannot run funnel, metric-trend or size-trend analysis for a segment, and segments have no Analyze action. The backend half exists, so this is mostly UI work. | P2 | M |
| PAR-211 | All Segments | New Segment type picker | Only filter segments can be created, with no type choice and no "start from a template" gallery. RFM, file and predictive types are rated in their own rows. | P2 | S |
| PAR-212 | All Segments | RFM Segment | RFM cells cannot be saved as segments, so they cannot drive campaigns or flows (seeded Champions / Loyal / At Risk templates approximate them with fixed thresholds). No 1-5 RFM scores. Bugs: the "High Value (top 10%)" bar does nothing because the engine's label (`lifecycle.ts:215`) is missing from `MONETARY_RFM_MAP` (`LifecycleChart.tsx:490-494`); the Low and Medium Value bars open the frequency+monetary composite list (`routes/customers.ts:81-130`), not the spend tier the bar counts. | P2 | M |
| PAR-213 | Synced Segments | Outbound Segment Sync | No scheduled or API sync to Meta / Google custom audiences or to warehouses; ad audiences are manual CSV uploads. Webhooks fire whenever membership is recomputed (save, sync, nightly), not on a chosen schedule. | P2 | L |
| PAR-214 | Segment info | Segment metadata | No created date, last-evaluated time, source or creator on screen; summaries use raw field names (e.g. "total spent greater than 500"). | P2 | S |
| PAR-215 | Segment info | On-demand count refresh and Last Refreshed time | No per-segment refresh and no last-refreshed timestamp. The "Recalculate stats" message can claim a re-evaluation that was skipped. The unused per-segment endpoint does not check that the segment belongs to the caller's project (see Verification notes). | P2 | S |
| PAR-216 | Segment info | Reachable users (total and % of user count) | WhatsApp reach ignores `whatsapp_subscribed` (any phone counts), which overstates reach on India's main channel; push is not counted. | P2 | S |
| PAR-217 | Segment builder | User property: Acquisition (Campaign Name, Publisher Name) | No profile-level acquisition source to segment on or display. | P2 | M |
| PAR-218 | Segment builder | User property: Email Suppression Type | Cannot segment bounced or complained addresses (list hygiene, win-back on another channel). | P2 | S |
| PAR-219 | Segment builder | User property: Tracked Standard Attributes | No External ID, first/last name, ad-consent or WhatsApp subscription fields. | P2 | S |
| PAR-220 | Segment builder | Date operators: in the last N, in the next N, is today (days ago / days from now) | No future windows (e.g. expected reorder in the next 7 days, although `expected_reorder_days` is computed: `metricsWorker.ts:292`), no "is today" and no general relative operator on date fields. | P2 | S |
| PAR-221 | Segment builder | Numeric operators and values | No "is not between" or multi-value input, operator sets differ from field to field, and equality on decimal fields is broken (Order Total equality is numeric and works). | P2 | S |
| PAR-222 | Segment builder | String operators | Missing does not contain, does not start with, does not end with and contains spaces (existence and emptiness are rated separately). | P2 | S |
| PAR-223 | Segment builder | String multi-value select and Case Sensitive option | No "is any of" list (needs an OR group today) and no case option. Equals and contains treat case differently, and the UI doesn't say so. | P2 | S |
| PAR-224 | Segment builder | Behavior: time window options and units | Event rules have no absolute ranges, no calendar presets (today, this week, last month) and no unit other than days. | P2 | S |
| PAR-225 | Segment builder | Behavior: aggregation (+ Aggregation) | No aggregation over arbitrary event properties (e.g. sum of `cart_value` on add-to-cart, average rating given). | P2 | M |
| PAR-226 | Segment builder | Validation | Rows with blank values (empty text, no product or collection picked, empty property path) pass validation and silently match nobody; no per-field highlight. | P2 | S |
| PAR-227 | Segment builder | Show count (user count and reachable users) | Faster than a manual button, but shows no reachable count or channel split, and the panel is hidden below the lg breakpoint (`segments/create/page.tsx:141`). | P2 | S |
| PAR-228 | Segment builder | Actions: Create Campaign, Analyze Segment, Create Custom segment | Cannot go from an unsaved query straight to a campaign or an analysis. | P2 | S |
| PAR-229 | Segment builder | Computed Traits | Marketers cannot define their own computed trait (e.g. "spend on category X in the last 30 days" as a stored property). | P2 | L |
| PAR-230 | Search Users | User search by ID, email, mobile, name or internal ID | External ID (e.g. Shopify customer id) and internal ID are not searchable; anonymous visitors appear only as sessions in the admin Event Debugger. | P2 | S |
| PAR-231 | User Profile | Customer Lifecycle tiles | No city, state or country (`customers.city` and `region` are stored but never displayed) and no acquisition source; sessions appear only in the raw Computed Metrics table. | P2 | S |
| PAR-232 | User Profile | TEST send buttons per channel | Cannot fire a quick test to this customer's email, phone or WhatsApp from the profile. | P2 | S |
| PAR-233 | User Profile | All user attributes with property search | No property search, grouping or system-vs-custom marker. Column fields (city, region, subscription flags) aren't listed, and metric keys are snake_case converted to Title Case. | P2 | S |
| PAR-234 | Navigation | Segment flyout menu | No grouped Segment menu and no entry points for imports, exports, file or warehouse segments (those features are missing; see their rows). The Customers page doubles as Search Users. | P3 | S |
| PAR-235 | Segment builder | Audience scope: All users / Filter users by | Cannot save "everyone except X" as a segment. | P3 | S |
| PAR-236 | Segment builder | Filter categories (tabs on each filter) | No affinity or segment-membership categories (rated below), and a condition's type can't be changed once it is added. | P3 | S |
| PAR-237 | Segment builder | Date operators: on, is between, before, after | No "on" operator, and only three order-date fields are date-typed in the catalog. | P3 | S |
| PAR-238 | Segment builder | Duplicate filter, collapse to summary, "+ Filter" disabled until complete | Long segments grow tall, and copying a condition means rebuilding it. | P3 | S |
| PAR-239 | Segment builder | In-builder user lookup | No general user lookup from the builder and no admin-editable lookup instructions. | P3 | S |
| PAR-240 | User Profile | Timeline filter: specific events or campaign channel | No multi-event selection and no per-channel campaign filter in the timeline. | P3 | S |

### 08 RFM, Predictive & Warehouse segments (19)

By priority: P0 1 · P1 1 · P2 6 · P3 11. Evidence and recommendations: [modules/08-segments-rfm-predictive-warehouse.md](modules/08-segments-rfm-predictive-warehouse.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-241 | Predictive Segments | Output user property (high / medium / low) for segmentation | "Bucket is high" matches nobody and "is not" matches everyone, which breaks the main thing predictions are bought for. Compare with `lower()`, as `routes/predictions.ts:95` already does, or store lowercase. Use one banding rule and drop the dead static fields. Score filters work. | **P0** | S |
| PAR-242 | Entry points | New User Import / User Imports | No file upload, column mapping or import list for project admins. Moving an opt-in list over from another vendor needs an engineer or a super admin. | P1 | M |
| PAR-243 | Entry points | User Exports | No plain export of users and attributes, and no export history. | P2 | M |
| PAR-244 | RFM Segments | Scoping filters: User property and User behavior (Has / Has Not Executed) | Available for segments and campaigns, but not for scoping RFM (depends on the Filter Users row). | P2 | S |
| PAR-245 | RFM Segments | User Transition view (migration between two periods; dependency wheel and a Period 1 / Period 2 table) | No migration between RFM cells, and the tab compares the wrong periods, reversed. | P2 | M |
| PAR-246 | RFM Segments | Transition Duration (N + Day/Week/Month; max 730 days, 105 weeks or 25 months) | Periods are limited to snapshots that happen to exist. A backend deployed more than once a week never takes one automatically. | P2 | M |
| PAR-247 | RFM Segments | Results table (segment, R/F/M score and value, user count, %) | No table of the segments with their R/F/M definitions. | P2 | S |
| PAR-248 | Predictive Segments | Row action: Archive | A paused goal is active again the next morning: it resumes scoring and reappears in the segment builder. Skip paused goals in the sweep and keep their status after training. Add an archive state that warns about dependent segments. | P2 | S |
| PAR-249 | Entry points | RFM Segments and Predictive Segments in the Segment section | No dedicated RFM page and no link to predictions from Segments. A project with zero saved segments never sees the RFM chart. | P3 | S |
| PAR-250 | Entry points | Global "+ Create" modal with a segment type picker | Only filter segments can be created; there is no type picker or global create entry. | P3 | S |
| PAR-251 | RFM Segments | R/F/M event configuration (Recency; Frequency, optionally the same event; Monetary plus a revenue attribute) | RFM cannot be built on other events (e.g. site visits for Recency) or another revenue property. | P3 | M |
| PAR-252 | RFM Segments | Analysis type: RFM (three dimensions) | Thresholds are fixed. F and M are merged into one axis, so there are no separate R/F/M scores and no finer segments. | P3 | M |
| PAR-253 | RFM Segments | Apply, validation and run states | No error or timeout message and no retry. | P3 | S |
| PAR-254 | RFM Segments | Help: title tooltip, "Know more", "Watch video", model tooltips | Users are not told how the cells are defined. | P3 | S |
| PAR-255 | Predictive Segments | List columns (name, type, status, created, last refreshed) and row click to results | No created date, no explicit type and no sortable table. | P3 | S |
| PAR-256 | Predictive Segments | User distribution column (% of users in high / medium / low) | Cannot compare goals' distributions at a glance. | P3 | S |
| PAR-257 | Predictive Segments | Outcome operator "Does Not Execute" on any event | Cannot predict "will NOT do X" for a custom event. | P3 | M |
| PAR-258 | Predictive Segments | First run on creation and the results-timing note (24-48 h) | No "train now" on create, and nothing tells the user when scores will appear. | P3 | S |
| PAR-259 | Predictive Segments | Custom model: user-named property (required) and optional description, 100 chars each | No separate property name or description. | P3 | S |

### 09 File segments, user imports & exports (20)

By priority: P0 1 · P1 9 · P2 5 · P3 5. Evidence and recommendations: [modules/09-segments-files-imports-exports.md](modules/09-segments-files-imports-exports.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-260 | User import: source and format | Import users from a CSV file | A marketer cannot load a list without an engineer. Build a CSV upload behind admin login that streams rows through `resolveCustomer` in a BullMQ job, recorded as an import with counts and a failed-rows file. Start from a fixed sample template. | **P0** | L |
| PAR-261 | User import: source and format | File preview validation gate | Before an import runs, show detected columns, the first rows, and counts of invalid phone numbers and emails. | P1 | S |
| PAR-262 | User import: mapping | Required identifier mapping (User identifier or Anonymous ID) | In the CSV flow let users pick the external id, email and phone columns (several allowed, since Storees resolves on any) and reject rows with none. | P1 | S |
| PAR-263 | User import: mapping | Column-to-attribute mapping table | Reuse the Event Sources mapping pattern for CSV columns, adding Skip column and a duplicate-mapping check. A fixed template is acceptable for the first release. | P1 | M |
| PAR-264 | User import: mapping | Mappable opt-in status (Email, SMS, WhatsApp, Push) | Send opt-in columns for all four channels through `updateConsent` (`consentService.ts:21`), which writes the consent row, the flag and `consent_audit_log`, with a new "import" source. WhatsApp-led brands need that proof when moving a list (Meta opt-in policy, DPDP). | P1 | S |
| PAR-265 | User import: mapping | Mappable email suppression type (Spam, Hard Bounce, Unsubscribe) | Brands moving from another ESP must bring unsubscribes and bounces, or Storees will mail people who already opted out. Add a suppression column that writes reason "manual" with source "import", and write opted_out consents for unsubscribes. | P1 | S |
| PAR-266 | User import: mapping | Mappable lifecycle and acquisition attributes (First/Last Seen, LTV, conversions, sessions, campaign, publisher) | Accept a created_at column and pass `skipLastSeenBump`. Today imported profiles count as "New This Week" (`routes/dashboard.ts:135`), match "New Customers" (`packs/ecommerce.json:285-297`) and look active to last_seen filters. Migration 0060 fixed this for connectors. Store acquisition fields as custom attributes. | P1 | S |
| PAR-267 | User import: mapping | Mappable custom attributes | Merge extra CSV columns into `custom_attributes` and expose them in the segment builder; otherwise imported attributes cannot be targeted. | P1 | S |
| PAR-268 | Import history | User imports list (Name, Custom segment, Created by, Created at, Sync status, Rows processed, Actions) | Give project admins an Imports list (name, file, created by, status, rows succeeded and failed, linked segment), reusing `SyncHistoryTable`. | P1 | S |
| PAR-269 | User exports | Export a segment's users to a file (plain attributes) | Add "CSV (selected columns)" to the same dropdown and to the filtered customer list, applying `viewContactPii` masking and agent scope. Brands use such lists for call-centre and offline follow-up. | P1 | S |
| PAR-270 | Navigation | Module entry points (+ New User Import, + New File Segment, User Imports, User Exports) | Ship the entry points with the features: "Upload a list" beside Create Segment, "Import customers" on `/customers`, and an Imports history that project admins can open. | P2 | S |
| PAR-271 | File segment management | Segment row actions (View, Edit, Duplicate, Archive, Create campaign, Analyze) | Add "Create campaign" as a deep link carrying segmentId (WhatsApp first) and Archive for every type. Same gap as module 07. | P2 | S |
| PAR-272 | User import: mapping | Mappable location (city, state, country, pincode, time zone) | Add country and pincode (pincode drives COD and serviceability targeting in India), and let an import overwrite location. | P2 | S |
| PAR-273 | User import: mapping | Create new attribute during import (typed) | Add a typed custom-attribute registry (name, type, format) that import mapping fills and the segment builder reads. | P2 | M |
| PAR-274 | Import history | Import details and run history | Give CSV imports the same run record, plus who created them and the linked segment. | P2 | S |
| PAR-275 | User import: source and format | User types (Registered or Anonymous users) with a sample file per type | Resolve on whichever identifier a row carries. Offer one sample CSV with customer_id, email and phone columns. | P3 | S |
| PAR-276 | User import: mapping | Mappable standard profile attributes (Name, First/Last Name, Email, Mobile) | Accept first_name and last_name columns and join them into name. Store ad-consent flags as custom attributes. | P3 | S |
| PAR-277 | User import: scheduling | Import scheduling (one time: as soon as possible, or a set date, time and zone) | Low value for D2C: run imports immediately. | P3 | S |
| PAR-278 | Import history | Import row actions (View, Duplicate) | A "re-run with the same mapping" action would cover Duplicate. | P3 | S |
| PAR-279 | Import history | Per-file run breakdown (View files drawer) | Row-level logs explain failures better than per-file counts. For CSV imports, add a downloadable file of the failed rows. | P3 | S |

### 10 Analyze: My Studio, Users, Behavior, Funnels (27)

By priority: P0 3 · P1 4 · P2 13 · P3 7. Evidence and recommendations: [modules/10-analyze-core.md](modules/10-analyze-core.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-280 | Behavior | Analysis type: Total events | An `eventName` (plus filters) parameter on `/api/analytics/timeseries` and an event picker in the UI. | **P0** | S |
| PAR-281 | Behavior | Analysis type: Unique users | Unique users per chosen event, with a de-duplicated total for the period. | **P0** | S |
| PAR-282 | Funnels | Funnel type: Unique Users (ordered conversion) | Ordered funnel SQL (per-customer step timestamps via window functions or LATERAL), allowing repeated events and optionally counting anonymous sessions. | **P0** | M |
| PAR-283 | Users | Analysis type: Distribution of a user property | A Users analysis endpoint that groups customers by any column, `metrics` key or `custom_attributes` key, shown as a bar chart and a table. | P1 | M |
| PAR-284 | Users | Save analysis (Save to My Studio) and reopen | A Save modal (name, description) on every report; open a saved item by id from the hub. | P1 | S |
| PAR-285 | Behavior | Analysis type: Aggregation of an event attribute | Aggregate a numeric JSONB property per bucket, with all seven functions. | P1 | M |
| PAR-286 | Funnels | Save funnel | A Save modal, re-run on load, open by id, rename and delete. | P1 | S |
| PAR-287 | My Studio | AI Proactive Insights | A scheduled BullMQ job that detects notable RFM, segment or metric shifts and posts insight cards with Save segment / Create campaign. Fix the two Transitions links. | P2 | L |
| PAR-288 | My Studio | Chart-point action: View sample users | Mask contact PII and apply agent scope in `/funnel/members` now (S); then drill-down on every chart bucket with real paging. | P2 | M |
| PAR-289 | Users | User property picker (grouped, searchable) | Reuse the catalogue in a searchable combobox with descriptions; add city, region, UTM and device fields. | P2 | S |
| PAR-290 | Users | String filter operators | Add does not contain, does not start/end with, exists / does not exist, is empty / is not empty and contains spaces. | P2 | S |
| PAR-291 | Users | Date filter operators and value modes | Expose on, in the last / in the next (start from `within_last`), is today, exists / does not exist and relative values. | P2 | S |
| PAR-292 | Users | Analysis type: Aggregation of a numeric user property | An aggregation mode in the Users analysis (`PERCENTILE_CONT` and similar). | P2 | S |
| PAR-293 | Users | Results table under the chart | A data table under every chart. | P2 | S |
| PAR-294 | Behavior | Event picker (grouped, searchable, details panel) | A searchable combobox built from `EventNameSelect`, STANDARD_EVENTS labels and per-event descriptions; separate cache keys. | P2 | S |
| PAR-295 | Behavior | Analysis type: Aggregation distribution | A per-user aggregate of any numeric attribute, then bucketed. | P2 | M |
| PAR-296 | Behavior | Analysis type: Total events per user | Per-user counts of any event, with summary functions and buckets. | P2 | S |
| PAR-297 | Behavior / Funnels | Duration: rolling "Last N" windows | Any N, with day, week and month units. | P2 | S |
| PAR-298 | Behavior / Funnels | Result states (loading, error, empty) | Inline error cards; handle `isError` on Cohorts, Products and the drill-down; compute Products' dates once per range. | P2 | S |
| PAR-299 | Funnels | Funnel type: Time to convert - Unique Users | Measured conversion time for each step pair inside the funnel; remove the made-up estimate. | P2 | S |
| PAR-300 | My Studio | Private saved-analysis folder (My Studio) | Per-user ownership with a mine/shared view; rename and delete (the DELETE endpoint already exists). | P3 | S |
| PAR-301 | My Studio | Long historical data (3 years) | Expose longer windows through the custom range; check the cost of multi-year scans on `events`. | P3 | S |
| PAR-302 | My Studio | Analyze menu | A persistent Analyze sub-navigation and a saved-analysis home instead of a card hub. | P3 | S |
| PAR-303 | Users | Numeric filter operators | Add is not between and exists / does not exist; offer the full set on every numeric field. | P3 | S |
| PAR-304 | Users / Behavior / Funnels | In-app help (info tooltip, Know more, Watch video) | Info tooltips with metric definitions and docs links. | P3 | S |
| PAR-305 | Behavior | Analysis type: Unique sessions | `COUNT(DISTINCT session_id)` for the chosen event. | P3 | S |
| PAR-306 | Funnels | Time-to-convert distribution bucketing (Auto / Custom with units) | Configurable bounds, interval and unit. | P3 | S |

### 11 Analyze: Retention, Session & Source, Paths, Acquisition, Uninstalls (13)

By priority: P1 5 · P2 3 · P3 5. Evidence and recommendations: [modules/11-analyze-advanced.md](modules/11-analyze-advanced.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-307 | Retention | First Event (cohort entry event) | First-purchase cohorts ("buyers by first-order month, % who reorder") are diluted by browsers and leads. `customers.first_order_date` already exists and is maintained (`schema.ts:148`; `customerAggregateWorker.ts:467,484`), so a "First purchase" option is a one-column swap. Any other first event needs MIN(timestamp) per customer plus a picker. | P1 | S |
| PAR-308 | Retention | Return Event (one event, or any activity) | The default view partly measures who Storees messaged, not who came back. Exclude `source = 'system'` rows and outbound receipts (`*_delivered`, `*_failed`) from "Any event", or default to the purchase vocabulary. Add search. | P1 | S |
| PAR-309 | Retention | Duration picker | Users cannot pick a specific cohort range such as festive-season cohorts. Connect the shared date picker (Shared row) to the existing parameters. | P1 | M |
| PAR-310 | Retention | Retention table | Leave unelapsed cells blank, align the window to period boundaries, compute months as years × 12 + months, and show counts on hover. Fix before demoing next to MoEngage. | P1 | S |
| PAR-311 | Shared | One shared date picker | Build one DateRangePicker and reuse it on every report; the backends already accept start and end dates. Closes the Retention Duration row. | P1 | M |
| PAR-312 | Retention | Run model and states (APPLY, loading, error, empty, "configuration changed", validation) | Add an error state (the frontend rules require loading, empty and error states). Switch to an explicit Apply once the builder grows. | P2 | S |
| PAR-313 | Session & Source | Session reports: Session Count, Avg. Session Duration, Avg. Sessions/User | No project-wide average session duration or sessions per user, and nothing by source. Aggregate the SDK session events once source grouping exists. | P2 | S |
| PAR-314 | Acquisition | Per-source quality metrics: Conversions/User, Sessions/User, Revenue/User | D2C teams want customers grouped by first-touch source, campaign or CTWA ad, with orders, revenue and sessions per customer. Stamp the first-touch UTM onto the customer at identify or first order, and populate the CTWA conversion and revenue columns. | P2 | M |
| PAR-315 | Retention | Retention type: N-Day (exact period) with daily granularity | No D0..Dn view. Low impact for D2C purchase cycles; add "day" to the truncation and period maths. | P3 | S |
| PAR-316 | Retention | Predictive Insights (Sherpa) KPI cards on charts | E.g. "% of this cohort at high churn risk". A differentiator more than a parity gap. | P3 | M |
| PAR-317 | Retention | Help: info tooltip, Know more, Watch video | The in-page explainer is arguably better for first-time users, but its "W0 … always 100%" line is wrong (UX notes). Add docs links once public docs exist. | P3 | S |
| PAR-318 | Session & Source | Filter operators (10 string operators) and Case Sensitive | Add the missing string operators and the exists checks to the shared event-property predicate. | P3 | S |
| PAR-319 | Shared | Async query jobs (POST, poll status, fetch results) | Fine at current Shopify D2C volumes. Heavy path and source queries on large tenants will need async jobs or pre-aggregation; BullMQ is already in the stack. | P3 | M |

### 12 Home, Dashboards, header, Create New (34)

By priority: P0 3 · P1 5 · P2 21 · P3 4 · other 1. Evidence and recommendations: [modules/12-home-dashboards.md](modules/12-home-dashboards.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-320 | Campaign stats dashboard | KPI summary cards (sent, impression, click, CTR, conversion, CVR) with % change and tooltips | No view of how all messaging performed in a period. Build on `campaign_sends` plus `messages`, after recording flow emails. | **P0** | M |
| PAR-321 | Campaign stats dashboard | Overall performance by channel (table, chart, granularity, download) | No comparison of volume, engagement, conversions and revenue by channel across campaigns and flows. | **P0** | M |
| PAR-322 | Create New menu | Campaign channel picker: Push, Email, SMS | Every SMS campaign reaches the provider with an empty body. Fall back to the campaign's `bodyText` as FCM does, or save an SMS template. Same defect as module 01. | **P0** | S |
| PAR-323 | Campaign stats dashboard | Date presets and custom range with Apply | One shared range picker (presets, this/last month, custom) on every report. | P1 | M |
| PAR-324 | Campaign stats dashboard | Per-channel sections (funnel, ratios, single metrics, granularity, download) | No per-channel trend across campaigns; WhatsApp has usage counts but no sent/read/clicked/conversion trend. | P1 | M |
| PAR-325 | Campaign stats dashboard | Flows section (total, engaged, converted trips, CVR) | No all-flows rollup of trips and conversions; no "engaged trips". | P1 | S |
| PAR-326 | Create New menu | Campaign channel picker: Facebook, Google Ads audiences | Retargeting audiences go stale after the upload; add Meta and Google audience sync. | P1 | L |
| PAR-327 | Create New menu | Flow templates (Create New > Flow) | The lead channel is absent from every UI template while a better library sits unused. Wire it into the gallery; add "Request a template". | P1 | S |
| PAR-328 | Key Metrics dashboard | Acquisition KPIs: new users, by platform, by source | Split new customers by platform and by acquisition source (UTM, referrer, click-to-WhatsApp ads). | P2 | M |
| PAR-329 | Key Metrics dashboard | Engagement KPIs: DAU, 7-day / 30-day active, dormant users, stickiness | Add 30-day active, DAU/MAU stickiness and a dormant-customers KPI. | P2 | S |
| PAR-330 | Key Metrics dashboard | Session KPIs: average session duration (overall, by platform), bounce rate | Project-level session duration, per-platform split and bounce rate from data already collected. | P2 | S |
| PAR-331 | Key Metrics dashboard | Conversion KPIs: conversion rate, time to convert, converted users, conversion events | Conversion rate, converted customers and time-to-first-purchase on Home. | P2 | S |
| PAR-332 | Key Metrics dashboard | Revenue KPIs: Revenue, AOV, ARPU | Add AOV and ARPU to Home; revenue already handles reversals more carefully. | P2 | S |
| PAR-333 | Key Metrics dashboard | Auto-generated KPI narratives | Generated summaries on Home and in campaign and flow reports. | P2 | M |
| PAR-334 | Key Metrics dashboard | Suggested actions | Turn KPI drops and RFM cells into pre-filled segments or campaigns; fix the two broken Transitions links. | P2 | S |
| PAR-335 | Key Metrics dashboard | Platform filter (All / iOS / Web) and Compare Duration | Platform filter, a chosen comparison period, and % change that follows the range. | P2 | S |
| PAR-336 | Key Metrics dashboard | Chart drill-down ("Analyze Chart", new tab, detailed view) | Link Active Customers, Events and Orders & Revenue to Time Series or a customer list. | P2 | S |
| PAR-337 | Campaign stats dashboard | Conversion type (click-through vs total) and attribution model | A project-level attribution rule is needed before any rollup. | P2 | S |
| PAR-338 | Reachability dashboard | Reachability trends and KPIs | No project reachability KPIs or trend. For Storees, track WhatsApp, email and SMS opt-in over time. | P2 | M |
| PAR-339 | Best time analysis | Best time analysis dashboard | An hour-by-weekday engagement heatmap with confidence; persist the per-customer best time. | P2 | S |
| PAR-340 | Create New menu | Global Create New launcher | One "+ Create" for campaign, flow and segment from anywhere. | P2 | S |
| PAR-341 | Create New menu | Campaign channel picker: In-app | Ship an SDK renderer, honour `segmentId`, and file In-App under Inbound. | P2 | M |
| PAR-342 | Create New menu | Campaign channel picker: On-site | No segment-targeted on-site offers or banners. | P2 | M |
| PAR-343 | Create New menu | Delivery type: Event Triggered | A dead tile; route it to a one-step Flow. Managers and agents cannot build one at all. | P2 | S |
| PAR-344 | Create New menu | New Segment: RFM Segment | Campaigns and flows cannot target RFM groups. | P2 | S |
| PAR-345 | Create New menu | New Experience: Web & App (API) | No public decisioning API a storefront can call. | P2 | M |
| PAR-346 | Create New menu | INFORM: Alerts (transactional) | No order, shipping or OTP alert API with channel fallback. | P2 | M |
| PAR-347 | Global header | Merlin AI Studio entry point | No single place showing what the AI can do. | P2 | M |
| PAR-348 | Home / landing | Integration-pending banner with "Check Event Log" | Show a no-data or sync-running banner on Home from that endpoint. | P2 | S |
| PAR-349 | Key Metrics dashboard | Retention table with "Download Retention Table" | Retention is a separate report and cannot be downloaded. | P3 | S |
| PAR-350 | Create New menu | Campaign channel picker: Custom connector | Campaigns cannot push a segment to an endpoint. The HTTP step lacks the SSRF guard (module 06). | P3 | M |
| PAR-351 | Create New menu | ALL APPS: Snapchat, Pinterest, Criteo audiences | Manual CSV only; no Criteo. | P3 | M |
| PAR-352 | My profile | General: personal information with Edit | Users cannot edit their name or add profile details. | P3 | S |
| PAR-353 | Create New menu | New Segment: Predictive Segment | Score filters work, but a bucket "is" rule never matches: scores are written as High/Medium/Low (`mlProxyService.ts:52`), the builder offers lowercase values (`predictionFieldDefs.ts:40`) and `is` is case-sensitive (module 08 rates this P0). Reached through the builder rather than a type card. | See 08 | — |

### 13 Content: blocks, recommendations, landing pages, coupons (18)

By priority: P0 2 · P1 4 · P2 5 · P3 7. Evidence and recommendations: [modules/13-content.md](modules/13-content.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-354 | Coupons | Per-recipient allocation in messages (snippet `{{Coupons.CouponListName['<list>']}}`) | A coupon variable source (pool id) in the resolver, so every channel, including the COPY_CODE button, pulls a reserved unique code. | **P0** | M |
| PAR-355 | Template library | Message template library | Look up by id within the project (and by name within the project for auto-created flows); the library is then ahead of anything in MoEngage's Content area. Then add pagination, tags and Duplicate. Same defect as modules 02 and 06. | **P0** | S |
| PAR-356 | Recommendations | Product recommendation engine (Smart Recommendations) | Storees already personalises with basic recommendations on every plan, where MoEngage needs Enterprise, but the algorithms are only rules and top sellers and there is no UI. Add bought-together and also-viewed queries over orders and events in `decisioningService`, keeping the current fallback. Productionising `packages/ml` is a separate L job (see the AI-powered row). | P1 | M |
| PAR-357 | Recommendations | Model: user actions-based (viewed, purchased, wishlist) | Honour last-viewed, add bought-together and also-viewed, and give flow tokens the campaign fallback to affinity and top sellers. | P1 | M |
| PAR-358 | Recommendations | Channels: Email, Push, SMS (plus WhatsApp in Storees) | Product URLs in the catalog and on cards, multi-product variables for WhatsApp and SMS, and the flow fallback. | P1 | M |
| PAR-359 | Landing Pages | Preference-center page (the "Subscription Category Management" template) | A tokenised public preference page (channels plus categories) behind `{{preferences_url}}`, linked from email footers and WhatsApp. Helps DPDP compliance; the backend pieces exist. | P1 | M |
| PAR-360 | Content navigation | Content section grouping Content Blocks, Recommendations, Landing Pages, Coupons | Add a "Content" group (Templates, On-site widgets, then Recommendations, Coupons and Blocks as they ship) and link `/widgets` now. | P2 | S |
| PAR-361 | Content Blocks | Plain-text editor with '@' personalisation picker (5,000-character counter) | Inline autocomplete fed by `GET /api/templates/variable-sources` (`routes/templates.ts:115`) in every text editor; reuse it in the block editor. | P2 | S |
| PAR-362 | Content Blocks | HTML code editor with live preview pane, full screen, Refresh, desktop/mobile Preview | HTML mode for templates: a CodeMirror-style editor beside a live iframe preview with the device toggle. The same editor would serve as the HTML block editor. | P2 | S |
| PAR-363 | Recommendations | Model: item attribute-based (similar products) | Automatic same-type and same-collection fallback, and match collection rules. | P2 | M |
| PAR-364 | Landing Pages: Forms | Lead-capture forms (13 field types, Required, Label/Placeholder, Background; each field mapped to a user attribute) | A configurable field list (type, required, label, mapped attribute); honour "Phone required" on the server; link the page. | P2 | M |
| PAR-365 | Content Blocks | Image hosting from the editor (Uploads > "Generate URL for your image files") | Offer the same upload as a "Get image URL" tool with a copy button in HTML contexts. | P3 | S |
| PAR-366 | Content Blocks | Metadata: name/label rules and description | Add a description and a stable machine label when blocks ship. | P3 | S |
| PAR-367 | Content Blocks | Save model and Active/Draft status | Draft/active status on templates and blocks so unfinished content cannot be picked for a send. | P3 | S |
| PAR-368 | Content Blocks | List search and content-type filter | Reuse the pattern for blocks, plus label search. | P3 | S |
| PAR-369 | Content Blocks | List/grid toggle with rich rows | A table view for every channel with status, updated-by, usage and updated-at columns. | P3 | S |
| PAR-370 | Content Blocks | Row actions: View (preview drawer), Edit, Duplicate, Delete | Duplicate in the library; a device toggle and details panel in the preview. | P3 | S |
| PAR-371 | Landing Pages: Forms | Form submit behaviour (Message with Success/Error text; Redirect; button style) | Configurable success and error copy, a redirect URL, and a coupon reveal on success. | P3 | S |

### 14 Inform & Personalize (35)

By priority: P0 2 · P1 5 · P2 18 · P3 10. Evidence and recommendations: [modules/14-inform-personalize.md](modules/14-inform-personalize.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-372 | Inform: overview | Template Management (edit alert content without deploying code) | An order-confirmation email built in the UI goes out as the abandoned-cart fallback, and seeded steps match a template name that every project shares. Look templates up by id within the project (the same P0 as modules 06 and 13). No versioning or approval. | **P0** | S |
| PAR-373 | Inform: API | API auth and errors (Basic auth + `MOE-APPKEY`; 400, 401, 409, 429, 500) | Anyone who copies a storefront's key can trigger alert flows with forged order events, and can redirect a customer's WhatsApp and SMS alerts (OTPs, order details) to another number. Require the secret for server events and identity changes; keep the browser key for anonymous and behavioural events. | **P0** | M |
| PAR-374 | Inform: overview | Centralized Logs (debug alerts across channels and providers) | Email alerts are absent from logs, flow stats and the debugger, and there is no per-provider view. Log email sends in `messages` with the provider message id, so receipts attach. | P1 | M |
| PAR-375 | Inform: channels & fallback | Channel order "In sequence (on Delivery Failure)": wait 1-60 minutes, then send the fallback | No built-in fallback on the send node; each alert needs three extra nodes and depends on provider receipts. Add "if not delivered within N minutes, send on &lt;channel>". | P1 | M |
| PAR-376 | Inform: channels & fallback | Transactional handling: alerts skip frequency caps, unsubscribes, bounces and SMS opt-in | An order-confirmation SMS or push from a flow counts against the marketing cap (by default 3 SMS per 7 days and 5 push per day, `schema.ts:63-68`), is blocked by a promotional opt-out and uses up the marketing budget. Flow email goes through the marketing provider. Only WhatsApp utility templates are handled correctly. Add a Transactional/Promotional choice to the send node. | P1 | S |
| PAR-377 | Inform: channels & fallback | Push target platforms: Android, iOS, Web | Key the token cache by service account first (S). Web push and multiple devices per customer are tracked in module 03 (P1, L). | P1 | S |
| PAR-378 | Inform: API | Throughput and latency: 10,000 requests/min, a multi-channel request counts once, 3 s P90 | A 100,000-recipient WhatsApp broadcast holds order alerts back for about half an hour, and there is no latency SLA. Give transactional sends their own queue or BullMQ priority, and make the per-key limit configurable. | P1 | M |
| PAR-379 | Inform: overview | Inform module (paid add-on) | Order and shipping alerts work only as flows: there is no alert object with its own ID, channel order, logs or analytics. A customer can have one live trip per flow (`triggerWorker.ts:120-153`), so a second order placed while a trip is active or waiting gets no alert. | P2 | L |
| PAR-380 | Inform: overview | Multi-provider routing behind one integration (30+ providers) | About 12 providers, one active per channel. No per-alert provider choice and no failover, except that a failed non-Resend email is retried once on Resend (`emailService.ts:54-88`). | P2 | L |
| PAR-381 | Inform: overview | Growth Opportunity (cross-sells and promotions in transactional messages) | Cross-sell works for product-level triggers (cart, product view, back in stock), not for order alerts. Fall back to `buildDecisionVarsForCustomer`, which campaigns already use (`campaignService.ts:928`), or to the first line item. Grid cards have no product link: the products table has no URL column (`schema.ts:240-273`). | P2 | S |
| PAR-382 | Inform: alert builder | Three-step alert wizard, drafts, Publish/Update, Alert ID on publish | No publish step that issues an alert id callable from the API or verifies a test request. | P2 | M |
| PAR-383 | Inform: content | Email headers per alert: subject, connector, sender name, From, Reply-to, Cc/Bcc | Triggered alerts cannot set a support reply-to or copy an ops inbox. | P2 | S |
| PAR-384 | Inform: content | Email attachments (up to 5 under 4 MB, or personalized per request) | Triggered emails cannot carry a per-order invoice or ticket PDF. | P2 | M |
| PAR-385 | Inform: content | OTP and authentication alerts (password reset, login OTP) | Authentication templates may go out without the button parameter Meta requires, and there is no synchronous OTP send. Add the OTP button and route OTPs through the send API. | P2 | M |
| PAR-386 | Inform: content | Locales ("+Locale") | No multi-language email, SMS or push alerts. | P2 | M |
| PAR-387 | Inform: content | Test message per channel | Alerts built as flows cannot be test-sent before activation. | P2 | S |
| PAR-388 | Inform: API | Publish step: Test Request Details and Test Request Logs | No button that sends a test payload for one alert and shows the response, the resulting event and the flow enrolment. | P2 | S |
| PAR-389 | Inform: alert info & analytics | Channel Performance with platform and type filters; trends by hour, day, week or month; date range | No hourly or daily trends, platform split or date range per alert, and email is missing. | P2 | M |
| PAR-390 | Inform: alert info & analytics | Alert Logs tab (per alert; empty and error states) | The logs of one alert or flow cannot be opened, and email is absent. | P2 | S |
| PAR-391 | Inform: settings | Rule-based Templates / Dynamic Template Selector (rule sets, nested groups, reorder, fallback rule) | No reusable rule sets, ordering or fallback rule. No condition reads the trigger payload: "Has done event" counts only events after the trip starts (`flowExecutor.ts:473-512`). | P2 | M |
| PAR-392 | Personalize: experience types | Web & App (API) experiences (typed variables, HTML/JSON/KV payload, "@" personalization, test snippets, request context) | Developers cannot fetch personalized JSON or HTML for a page or app slot. | P2 | M |
| PAR-393 | Personalize: targeting | Up to 10 audiences per experience: property, behaviour, segment; exclusions; nested groups | One audience per in-app campaign and none for widgets; no experiences with several audiences. | P2 | M |
| PAR-394 | Personalize: targeting | Page and URL targeting (is, is not, begins with, ends with, contains; include or exclude; page attributes; SDK and duplicate check) | No operators, exclusions, query or host matching, page attributes or SDK-install check. | P2 | S |
| PAR-395 | Personalize: schedule & goals | Conversion goals (up to 5, primary, revenue and currency) with an attribution window (default 36 h) | Reuse the campaign goal block once on-site experiences exist. | P2 | S |
| PAR-396 | Personalize: analytics | Experience analytics (impressions, clicks, revenue, goals; audience and variation performance; click elements; API request performance) | No performance reporting for on-site content. | P2 | M |
| PAR-397 | Inform: alert builder | Entry points: Create New > INFORM > Alerts; sidebar New Alert (permission-gated) and All Alerts | No dedicated entry point or list for alerts, and permissions cannot separate creating from viewing. | P3 | S |
| PAR-398 | Inform: alert builder | Alert Details fields: name, reference name/ID for API calls, description, tags, Teams | No stable API alias, tags or team ownership. | P3 | S |
| PAR-399 | Inform: content | Email authoring: drag and drop, custom HTML (type, paste or zip), saved templates | Alert emails cannot be pasted as HTML. UI-built flow email steps also do not send the chosen template at all (Template Management row, P0). | P3 | S |
| PAR-400 | Inform: content | Push templates: Android/Web defaults (basic, stylized, image carousel) or custom; iOS default or custom | No stylized or carousel layouts, action buttons or deep link. Add a title field first (S). | P3 | M |
| PAR-401 | Inform: content | Content validation and "Smart Format Bridge" | Email lint findings are not shown, and there is no validation report at send time. | P3 | S |
| PAR-402 | Inform: API | Code snippets in several languages | No Node, Python or PHP server snippets and no Postman collection. | P3 | S |
| PAR-403 | Inform: alert info & analytics | Alert Info details: Alert ID, created by/on, channels, request snippets, template preview, rule set, retry, Ignore DND | No one-page summary of an alert's settings and of how to call it from the API. | P3 | S |
| PAR-404 | Inform: alert info & analytics | Request Performance (failed requests, error table) | No request-level metrics and no grouped error breakdown. | P3 | M |
| PAR-405 | Personalize: content & variations | User distribution: manual % or Auto (Merlin AI optimises conversion, engagement or revenue) | Traffic is never shifted toward the winner, and nothing of this exists on-site. | P3 | L |
| PAR-406 | Personalize: schedule & goals | Send experience: always on, or start and end with time zones | No end date or time window in a chosen time zone for on-site content. | P3 | S |

### 15 Reports (12)

By priority: P1 2 · P2 6 · P3 4. Evidence and recommendations: [modules/15-reports.md](modules/15-reports.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-407 | Step 2: Columns & metrics | Flows columns (attributes, control group, goals, audience, trips started CG/GCG/total, trips engaged, conversions, revenue, uplift and CVR per attribution type, flow ID and version) | Flows drive most D2C revenue (abandoned cart, post-purchase), yet they have no revenue, holdout or engaged-trip metric, and their emails are not counted. Log flow emails and add flow revenue before exporting. | P1 | M |
| PAR-408 | Step 2: Columns & metrics | WhatsApp columns (sender, template, header/body/footer, buttons; Sent, Delivered, Read, Read rate, total/unique clicks, CTOR, CTR, CVR, revenue, per-attribution conversions, GCG uplift) | For India-first brands this is the most-requested export. Relabel reads as "Read", add total vs unique clicks and a failure-code breakdown, and link usage rows to messages so cost can be shown per campaign. | P1 | S |
| PAR-409 | Permissions | Role checks for creating/managing, editing and downloading reports | Today's per-campaign report already bypasses `viewContactPii` for anyone who can call `/api/campaigns`. Apply `redactContactFields` to recipient data now, then add a manage/download-reports capability (or reuse `exportCustomers`) for export files. | P2 | S |
| PAR-410 | Step 2: Columns & metrics | Email columns (attributes, audience, limits, variations, locales, control group, content, schedule; unique/total opens and clicks, CTOR, CTR, hard/soft bounces, unsubscribes, complaints, removal counts, failures, per-attribution conversions) | Missing: total vs unique opens and clicks; a hard/soft bounce split; unsubscribe count and rate; stored removal counts; any file export. | P2 | M |
| PAR-411 | Step 2: Columns & metrics | SMS columns (connector, message, template ID, click URL; Sent, Message parts, Delivered, Clicks, Unique clicks, CTR, conversions with revenue, ARPU, AOV, uplift) | Same export gap as the other channels. Capture message parts and DLT IDs, and fix the Gupshup channel tag. | P2 | S |
| PAR-412 | Step 2: Columns & metrics | Conversion metrics per attribution type with CG and GCG uplift (click-through, view-through, in-session: converted users, events, revenue, ARPU, AOV, CVR, uplift) | Add GCG and in-session attribution, show ARPU, fix the currency, and put conversions and revenue on the list and in exports. | P2 | M |
| PAR-413 | Step 2: Split data | Split by date (one row per date per campaign; adds a Date column) | Export daily rows per campaign and flow (sent, delivered, read, clicked, conversions, revenue), each counted on the date the event happened. | P2 | S |
| PAR-414 | Step 2: Split data | Split by variations (one row per A/B variation) | Add conversions and revenue per variant, and one row per variant in exports. | P2 | S |
| PAR-415 | Step 1: Select campaigns | Event Triggered, Location Triggered and API Triggered delivery types | For reporting, flows stand in for event-triggered campaigns. Location-triggered campaigns don't exist; low relevance for Shopify web stores. | P3 | L |
| PAR-416 | Step 1: Select campaigns | Include archived campaigns checkbox | Reuse `includeArchived` in a report finder; add flow archiving if flows join reports. | P3 | S |
| PAR-417 | Step 2: Columns & metrics | Push columns (per-OS content, rich content, buttons, geofence, Push Amp+; devices, tokens, attempted, sent, failed, impressions, clicks, CTR, FCM delivery rate, conversions) | Only sent and failed counts are reliable, so push reporting is thin. Low priority for Shopify web stores. | P3 | M |
| PAR-418 | Step 2: Columns & metrics | InApp columns (trigger event, delivery controls; Impressions, Clicks, CTR, Closed, Attempted, Prioritized, conversions) | Update the counters from the event API, count repeat impressions and closes instead of overwriting them, and label dismissals as such before exporting. | P3 | S |

### 16 Merlin AI Studio (17)

By priority: P1 3 · P2 4 · P3 10. Evidence and recommendations: [modules/16-merlin-ai.md](modules/16-merlin-ai.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-419 | Copywriter | Channel: Email (subject line + preview text) | Fix the defect first: apply the AI body into a Text block, or disable "Apply body" in the visual editor. Then generate subject + preheader pairs. | P1 | S |
| PAR-420 | Copywriter | Output language: global languages (21, incl. 7 Indian) | Add Bengali, Marathi, Telugu, Kannada, Malayalam, Gujarati, Urdu, Bahasa, Thai and others, with one shared list. Regional languages matter in Indian D2C deals, and this is a list change. | P1 | S |
| PAR-421 | Segment Assist | Natural-language segment creation | Once working, this beats MoEngage, whose Segment Assist was "Coming soon" (flag off) in the captured workspace; at `2063cdc` it most likely fails every request. Route it through `getLlmConfig` + `chatCompletion`, fix the paise note, teach event rules, and use ecommerce examples. | P1 | S |
| PAR-422 | Copywriter | Personalization attribute from tracked attributes | Load the picker from variable-sources, grouped, and create the mapping when the AI inserts a token. | P2 | S |
| PAR-423 | Jinja Assist | Test against a real user's data | Add customer search by email, phone or ID to both previews, and a filter for unresolved or empty variables. | P2 | S |
| PAR-424 | AI optimisation | A/B test winner optimised by revenue per variant | Honour `abWinnerMetric` and add revenue, since the data exists. Hide the auto-send toggle until a test-then-send-winner flow exists (that part is M). | P2 | S |
| PAR-425 | AI optimisation | "Best time for user" send time | Add best time to flow send nodes, and use clicks and site activity for customers with no opens. | P2 | M |
| PAR-426 | Studio hub | Example prompt gallery with filter | No examples to browse, and the only ones are for the wrong vertical. Add vertical-aware examples: abandoned-cart push, Diwali sale on WhatsApp, win-back email, "opened an email last week". | P3 | S |
| PAR-427 | Studio hub | Per-tool feature gating and availability messaging | Gate each tool through entitlements and show availability before use: with no provider configured, disable Generate and link to Settings, AI. | P3 | S |
| PAR-428 | Copywriter | Channels: In-app and OSM (on-site message) | In-app copy works only through the modal, and the inline card errors. Low value until in-app messages render. | P3 | S |
| PAR-429 | Copywriter | Include "high performing" keywords (20 presets + custom) | Add preset chips plus custom entry; the gap is cosmetic. | P3 | S |
| PAR-430 | Copywriter | Exclude keywords (19 spam-trigger presets) | Pre-fill the exclude list with common spam triggers, reusing the lint list. | P3 | S |
| PAR-431 | Copywriter | Target audience ("and convert this for", 20 personas) | Add D2C persona presets, or better, let the user pick a Storees segment and pass its summary as the audience. | P3 | S |
| PAR-432 | Copywriter | Voice / tone (12 options) | 7 tones are missing, and four AI tools use four different tone lists. Unify them. | P3 | S |
| PAR-433 | Copywriter | Writing style (89 options in 5 groups) | Add the 9 Trends styles and the archetypes. Celebrity and fictional voices add little and carry publicity-rights risk. | P3 | S |
| PAR-434 | Copywriter | Character limit (In-app/OSM; 1-500, default 25) | Add an optional maximum-characters input, useful for small-screen push, SMS segments and in-app. | P3 | S |
| PAR-435 | Copywriter | Channel preview of generated copy (push device, email inbox) | Show each variant in the existing previews, plus an inbox mock, before Apply. | P3 | S |

### 17 Data imports & computed traits (21)

By priority: P0 1 · P1 4 · P2 11 · P3 5. Evidence and recommendations: [modules/17-data-imports-computed-traits.md](modules/17-data-imports-computed-traits.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-436 | Computed traits | Imported and computed attributes usable as user properties in segmentation and personalization | Add a typed custom-attribute group to `/api/schema/fields` (reuse `pullAttributeKeys`) and allow metrics keys as template variables. Same gap as module 07's Tracked Custom Attributes picker (P0). | **P0** | M |
| PAR-437 | Import history | Data imports list: All / Users / Events / Auxiliary Data tabs, per-tab empty states with a docs link, "+ Import" split button, title tooltip | One Imports page for project admins listing every ingestion job with type tabs, built on `data_source_syncs` and `SyncHistoryTable`. Recording API bulk imports as job rows needs a nullable `connector_id` and can follow. | P1 | S |
| PAR-438 | User import mapping | Required mapping: User identifier column | Add a required identifier row (external id, email or phone) at the top of the import mapping step. | P1 | S |
| PAR-439 | User import mapping | Column-to-attribute table: column search, grouped searchable attribute picker, remove, "Total columns in file" | Build a visual mapping table (column to grouped attribute picker) shared by CSV imports and connectors, fed by standard fields plus the observed `custom_attributes` keys (`variableSources.ts:61-83`). | P1 | M |
| PAR-440 | Computed traits | Example traits CLV, Average Order Value, Engagement Score and Churn Score (a paid add-on in MoEngage) | Compute the metrics JSON for every customer after history sync and imports and in the nightly reconcile (reuse `computeAndUpdateMetrics`), and add "Refresh metrics" to Data maintenance. Then demo these as MoEngage's paid add-on, included free. | P1 | S |
| PAR-441 | Navigation | Data menu (Data Imports; Computed Traits with a "New" badge) | Add a "Data" group for project admins: Imports (connectors, sync history, later file imports), Event Sources and Computed attributes. Before moving Data Sources out of `/projects`, add `requireRole('admin')` to the write routes: `/api/data-sources` and `/api/inbound-webhooks` check only project membership (`index.ts:197,206`; `projectId.ts:21-48`), so any member can already create or delete a connector through the API. | P2 | S |
| PAR-442 | Import history | List columns, statuses and row actions (page code only) | Add Pause/Resume (the API is ready), write and show Created by and Triggered by, a frequency column, Duplicate, and a failed-rows download. | P2 | S |
| PAR-443 | Import sources | Source picker per data type (Users: SFTP, S3; Events and Aux data: Upload CSV, SFTP, S3) with a quota note | When file imports ship, ask for the data type first (Customers, Orders/Events, Catalog/lookup), then the source (CSV upload, S3, existing connectors). | P2 | S |
| PAR-444 | Event import | Required mapping: User identifier, and Event time (column, datetime format, UTC or App timezone) | Optional event-time path with format and timezone in Event Definitions and the CSV event wizard. | P2 | S |
| PAR-445 | Event import | Skip duplicate rows by a chosen "Column to identify duplicates" | Let the CSV event wizard map a chosen column to `idempotency_key`, and derive a key for keyless rows in `/events/batch` as `/events` already does. | P2 | S |
| PAR-446 | User import mapping | "+ Create new attribute" and per-column data types (double, number, bool, datetime, string, geopoint, arrays) | Add a typed attribute registry (name, type, source) written on first import, used for casting in the evaluator and for the segment and template pickers. | P2 | M |
| PAR-447 | Auxiliary data | Auxiliary (lookup) data import keyed by a Primary key, from CSV, S3 or SFTP | Add generic keyed lookup tables (pincode to delivery ETA, store locator, offer codes) that can be imported by CSV and used as a template variable source. | P2 | M |
| PAR-448 | Scheduling | Periodic import: hourly, daily, weekly or monthly; repeat every N; weekday chips; monthly day including last day; end conditions; IANA time zone | Let each connector or import set its own frequency and time zone (reuse `PeriodicSchedule` and `upsertJobScheduler`), and show the next run on the card. | P2 | S |
| PAR-449 | Computed traits | Count computation (event, time period, attribute filters) stored as a trait | Store a user-defined count in `custom_attributes` on a schedule, reusing the SQL already compiled for EventOccurrenceRule. | P2 | S |
| PAR-450 | Computed traits | Aggregation: Sum, Min, Max, Average, Median, Distinct count, True if event exists, over an event property | Extend the aggregate to any event and numeric property (cashback, cart value), add MEDIAN, and allow saving the result as a computed attribute. | P2 | M |
| PAR-451 | Computed traits | First/Last Value of an event property | Add the first or last value of any event property as a computed attribute (last purchased product, first UTM source). | P2 | S |
| PAR-452 | Import wizard | User type: Registered vs Anonymous users, per-type sample file and default prefix | Keep imports registered-only; ship a sample CSV per entity with the CSV import. | P3 | S |
| PAR-453 | Event import | Select event (searchable) with "+ Create new event" and Download sample file | Event picker (standard, observed and create new) in the import wizard; a managed catalog belongs to Data Management. | P3 | S |
| PAR-454 | User import mapping | "+ Add Column" placeholder columns for recurring imports and "Upload mapping file" | Let admins export and import a mapping JSON in the wizard and edit it in the mapping table. | P3 | S |
| PAR-455 | Scheduling | One-time import: as soon as possible, or at a set date, time and time zone | Allow a one-time run at a set time and time zone (a BullMQ delayed job). | P3 | S |
| PAR-456 | Computed traits | Scheduling and computation actions: one time or weekly/monthly (daily on request); Replace, Compute only for new users, Add, Subtract | Fix the refresh first (example-traits row, P1). Per-trait schedules and Replace and Add actions come with the builder. | P3 | S |

### 18 Test & Debug, event log, integration guide (21)

By priority: P0 1 · P1 3 · P2 5 · P3 11 · other 1. Evidence and recommendations: [modules/18-test-debug-devtools.md](modules/18-test-debug-devtools.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-457 | Integrate drawer & SDKs | Data API (server-to-server user and event data) with API docs | The public key shipped in every storefront can bulk-import customers (with subscription flags) and orders. Require the secret on server-side endpoints and publish an API reference. Same defect as module 14 (P0). | **P0** | M |
| PAR-458 | Test & Debug menu | Integration-pending banner on list pages ("Get started with integration!" + "Check Event Log") | No global "no data received" banner driven by real data and linking to Setup and the Event Debugger; the one badge is buried in Settings and misreports pixel stores. Count every ingest source. | P1 | S |
| PAR-459 | Integration Validation | Guided validation checklist with per-check status ("Yes, I performed the action", 60 s listen) | No guided checks of identify, track, setUserProperties, reset, pixel cart and checkout events or session stitching, and no pass / warn / fail with fix hints. GAID does not apply on the web. | P1 | M |
| PAR-460 | Integrate drawer & SDKs | Validate integration (card and checklist link to the validation tool) | No reliable one-click check of the merchant's real integration. Wait for the first real `/api/v1`, pixel or webhook event instead. | P1 | S |
| PAR-461 | Segment Payload | User property catalogue (Lifecycle, Acquisition, Uninstall, Reachability, Localization, Email suppression, Device, standard and custom attributes) | Missing from the picker: city, state and time zone; first-touch UTM; device and browser; bounce and spam suppression; random bucket; custom attributes. Uninstall does not apply without an app SDK. | P2 | M |
| PAR-462 | Segment Payload | Date operators (on, is between, before, after, in the next, in the last, is today, exists, does not exist) with a Today shortcut and granularity | No "on", "in the next N" (birthdays, renewals), "is today" or exists / does not exist. Expose within_last in the picker. | P2 | S |
| PAR-463 | Jinja AI | The template logic language behind Jinja AI (conditionals, loops over product sets, truncation, arithmetic, current time) | No if/else, custom loops, truncate, maths or date functions; "free delivery over ₹200" needs separate campaigns or flow branches. A sandboxed Liquid would suit Shopify merchants. | P2 | L |
| PAR-464 | Jinja AI | Test preview: pick a user by ID, email or mobile; personalisation inputs; fallbacks; "Show missing attributes only"; Refresh Preview | Add lookup by email, phone or ID, inputs for event, business-event and campaign attributes (the API takes `eventProperties`; no screen sends them) and an unresolved-variables filter. | P2 | S |
| PAR-465 | Integrate drawer & SDKs | Partner guide (import data from other martech tools) | No ready-made integrations or guides for the tools brands already use. | P2 | L |
| PAR-466 | Test & Debug menu | Test & Debug tool group in the sidebar | No developer hub; the tools sit in marketer navigation and three of MoEngage's four tools have no equivalent. Group them under a collapsible "Data & Debug" section. | P3 | S |
| PAR-467 | Integration Validation | Session Logs list (ID, device, platform, start time, status, refresh, "Session expired") | Lists every visitor, not the developer's own test session: no way to pin a test browser, no device, platform or SDK columns, no status or expiry. | P3 | M |
| PAR-468 | Integration Validation | Session details: device info, SDK config, modules integrated | No per-session summary of SDK version, config (autoTrack, consent, batching) or modules (pixel, cart bridge, widgets). | P3 | S |
| PAR-469 | SDK Logger | Remote SDK log streaming (QR connect, sessions, Info / Warning / Error filter, search, copy session ID, fetch more) | No remote view of a browser's SDK logs, and the setup screen never mentions debug mode. | P3 | M |
| PAR-470 | Segment Payload | Custom Segment API to automate segment creation | No documented, key-authenticated segment API for automation. | P3 | M |
| PAR-471 | Segment Payload | User property: attribute picker grouped by category, with search | Grouping matches; there is no type-ahead search, which matters as packs and prediction goals add fields. Use a searchable combobox. | P3 | S |
| PAR-472 | Segment Payload | Duplicate or remove a filter block | A condition or group cannot be duplicated in one click. | P3 | S |
| PAR-473 | Segment Payload | Validation: segment name required, incomplete filters highlighted | Flag empty values, say why Create is disabled, and highlight the field at fault. | P3 | S |
| PAR-474 | Jinja AI | Ground the prompt on a saved template ("+" > Select Template) or an uploaded HTML file (.html, 5 MB) | A saved template or uploaded HTML cannot be used as AI context, and HTML templates cannot be imported. | P3 | S |
| PAR-475 | Jinja AI | Prompt library: 4 starter cards and an "Explore more prompts" modal with 9 prompts | Add vertical-aware starters (abandoned cart, back in stock, COD to prepaid, festive sale) to every AI tool. | P3 | S |
| PAR-476 | Setup Guide | Subscription-code upgrade (16-digit code, Submit) | Customers cannot redeem a code themselves; an operator must apply the plan. | P3 | S |
| PAR-477 | Integrate drawer & SDKs | Web SDK | Tracking is at parity or better. Web push and an on-site message renderer are missing; they are scored in modules 03 (web push, P1) and 05 (renderer, P0). | — (see 03, 05) | — |

### 19 Settings: Push, Email, SMS & RCS (26)

By priority: P0 4 · P1 8 · P2 9 · P3 5. Evidence and recommendations: [modules/19-settings-push-email-sms.md](modules/19-settings-push-email-sms.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-478 | Email > Sender configuration | Unsubscribe: platform-inserted footer link | Mint the per-customer token at send time and set `unsubscribe_url` in every campaign, flow and test email; make `GET /u/:token` show a confirm button (POST) so link scanners can't unsubscribe people. Same defect as modules 01 and 02. | **P0** | S |
| PAR-479 | Email > Sender configuration | One-click unsubscribe (RFC 8058 List-Unsubscribe and List-Unsubscribe-Post) | Add headers to `EmailSendCommand` and all 5 adapters; attach List-Unsubscribe (https and mailto) and List-Unsubscribe-Post to every promotional campaign and flow email. | **P0** | M |
| PAR-480 | Email > Subscription management | Default exclusion of bounced, spam-complaint and unsubscribed addresses | Resolve bounces and complaints through `campaign_sends.resend_message_id`; honour Shopify marketing consent; gate flow emails; state the rules in settings. Same defect as module 01's P0. | **P0** | M |
| PAR-481 | SMS & RCS > Sender configuration | SMS service provider connection | Fall back to `variables.message` in a shared `resolveBody`; implement or remove Pinnacle SMS. Only one provider per project today. Same root cause as module 03's P0. | **P0** | S |
| PAR-482 | Push > App push | Android push credentials (FCM HTTP v1 service-account key) | Key the token cache by service account (today other tenants' pushes fail for up to 50 minutes after one tenant sends); validate the JSON and add "Send test push"; several device tokens per customer; encrypt at rest. | P1 | S |
| PAR-483 | Email > General settings | Set a default sender | Explicit default-sender selector limited to verified senders; use the shared sender until the domain verifies; apply the default to flow emails. | P1 | S |
| PAR-484 | Email > Subscription management | Subscription categories (topic-level opt-in and opt-out) | Category management UI and a hosted preference centre that writes `customer_subscriptions`; treat customers as subscribed unless they opt out. | P1 | M |
| PAR-485 | Email > App Marketplace | Bring-your-own ESP connectors (SendGrid, Amazon SES, Mandrill, SparkPost, Netcore) | Event webhooks for SendGrid, SES (through SNS), Postmark and Mailgun with per-project secrets; SparkPost or Netcore if Indian deals need them. | P1 | M |
| PAR-486 | SMS & RCS > Sender configuration | Custom SMS connector (generic HTTP) | Configurable HTTP SMS provider (URL, method, headers, body template with phone, message and DLT keys, auth, message-id path, receipt mapping). The quickest route to MSG91, Karix and ValueFirst. | P1 | M |
| PAR-487 | SMS & RCS > Sender configuration | SMS delivery tracking (DLR callback, message-id and status mapping) | Set a callback URL on every send; fix the Vonage receipt shape; add Gupshup enterprise DLRs; verify provider signatures; show callback URLs in settings. | P1 | M |
| PAR-488 | SMS & RCS > App Marketplace | SMS provider catalogue (Gupshup, Kaleyra, ICS, Sinch, Twilio, Vonage, Route Mobile, Infobip, ValueFirst, Airtel IQ, Karix and more) | Add the top Indian aggregators, or ship the generic HTTP connector to cover them. | P1 | M |
| PAR-489 | Settings (all channels) | Role-based access to channel credentials | `requireRole('admin')` on both routes; encrypt at rest with `encryption.ts`; redact every password-type field. | P1 | S |
| PAR-490 | Push > App push | iOS push credentials (APNs .p8, Team ID, Key ID, Bundle ID, iPad Bundle ID) | No direct APNs for apps that don't use Firebase on iOS, and no iPhone/iPad bundle routing. At minimum, state the Firebase-on-iOS requirement on the Push card. | P2 | M |
| PAR-491 | Email > Sender configuration | Sender list (domain type, provider, verification status, Mark as default, Add sender) | Senders table (domain, provider, status, default) with add/remove and default selection; more than one domain per project. | P2 | M |
| PAR-492 | Email > Sender configuration | Unsubscribe: brand-managed link in the email body | Add an API-key opt-out endpoint (for example `POST /api/v1/consent`) and document the recipe; honour Shopify consent (default-exclusion row). | P2 | S |
| PAR-493 | Email > General settings | Update subscription for every profile with the same email | Resolve the customer's email in `applyUnsubscribe` so an opt-out suppresses the address project-wide. | P2 | S |
| PAR-494 | Email > General settings | Several verified From addresses, chosen per campaign | "+ Add email address" on a verified domain (no extra DNS), with a list and remove. | P2 | S |
| PAR-495 | SMS & RCS > Sender configuration | Sender details: sender type, name and ID, several senders, Mark as default | Sender records with type and ID per provider (including the Gupshup mask), several senders per project, a default. | P2 | M |
| PAR-496 | SMS & RCS > Subscription management | SMS opt-out management (exclude users not opted in) | Per-channel "require opt-in" toggle enforced in campaigns and flows, using Shopify SMS consent. | P2 | S |
| PAR-497 | SMS & RCS > Keyword management | Keyword management (STOP/HELP/START, confirmation replies, general response, lead capture) | Configurable keyword sets with auto-replies; extend to SMS once inbound SMS is parsed; route keyword changes through `updateConsent` so they are audited. | P2 | M |
| PAR-498 | Settings navigation | Channels settings group with Settings Home and search | Settings > Channels with one page per channel and consistent sub-tabs, plus settings search. | P2 | M |
| PAR-499 | Push > App push | Show iOS impressions | Document a Notification Service Extension recipe (or ship a thin iOS helper), accept FCM's short message id, and authenticate receipts. | P3 | M |
| PAR-500 | Push > Preview settings | Campaign preview defaults (Android app name, app icon, large icon; iOS app icon) | Use the brand-kit name and logo in previews; optional per-platform preview icons. | P3 | S |
| PAR-501 | Email > Sender configuration | Separate sender domains per email type (Promotional / Event-triggered / Transactional) | Expose marketing and transactional provider and domain separately so promotional reputation can't hurt order mail. | P3 | S |
| PAR-502 | Email > Dynamic sender routing | Rule-based sender routing with fallback | Rule-based routing with an explicit fallback sender. Low priority for D2C. | P3 | L |
| PAR-503 | SMS & RCS > General settings | Mobile-number attribute and number format | Default country code and E.164 normalisation setting applied at ingestion. | P3 | S |

### 20 Settings: WhatsApp, delivery controls, preferences (10)

By priority: P0 1 · P1 3 · P2 5 · P3 1. Evidence and recommendations: [modules/20-settings-whatsapp-delivery-preferences.md](modules/20-settings-whatsapp-delivery-preferences.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-504 | Preference management | Default exclusion of email blocks, unsubscribes and complaints | The rule exists, but almost nothing feeds it. Complainers, hard bounces and Shopify unsubscribes keep getting campaign email, flows email known unsubscribes, and recipients have no working way to unsubscribe. That is a deliverability and legal risk (Gmail/Yahoo bulk-sender rules, CAN-SPAM, DPDP), with the same root cause as the P0s in modules 01 and 02. Fix: resolve the project from `campaign_sends.resend_message_id`, record flow email sends, apply suppression and consent in the flow path, mint unsubscribe tokens in `sendEmail`, and mirror Shopify unsubscribes into consents. | **P0** | M |
| PAR-505 | WhatsApp > Sender configuration | Gupshup sender | Brands already on Gupshup can't connect from the UI. Expose it in the panel with the `appId` that template sync needs and the webhook URL to paste. Gupshup Enterprise username/password accounts (what MoEngage asks for) aren't supported, and templates can't be submitted through Gupshup. | P1 | S |
| PAR-506 | WhatsApp > Sender configuration | Delivery tracking (DLR) webhook setup | Automatic registration beats copy-paste for Pinnacle and Storees-managed numbers. For a BYO Meta app, `subscribed_apps` subscribes the brand's own app, whose callback URL Storees never sets or shows. Receipts, replies and STOP may therefore never arrive while the card says tracking is active (read from code, not run). Pass `override_callback_uri` with a per-project verify token, or show both for copy, and show the URLs for the backend-only BSPs. Also, POST callbacks from Meta, Gupshup, Twilio, Bird and Vonage are accepted without any signature check (only Pinnacle checks a secret), so a forged inbound "STOP" or "START" can flip a customer's WhatsApp consent. | P1 | S |
| PAR-507 | WhatsApp > General settings | Attribute that holds the WhatsApp number | Brands can't point WhatsApp at another attribute, such as a custom `whatsapp_number` or the checkout phone. On Indian Shopify stores, where shoppers often give a phone only at checkout or in the address, many customers look unreachable on WhatsApp. Add an address and checkout phone fallback at ingestion, plus a project-level number source used by reachability and sends. | P1 | M |
| PAR-508 | WhatsApp > General settings | Attribute that holds the WhatsApp opt-in | An opt-in imported as a profile attribute has no effect unless it is also written as a consents row, and no attribute can be mapped. The customer Consent tab reads the flag, not the gate: it shows WhatsApp "Opted out" whenever `whatsapp_subscribed` is false, the default, even though sends go out (`ConsentTab.tsx`; `consentService.ts:112-131`). STOP/START changes skip the consent audit log (`whatsappInboundService.ts:295-356`). Add an opt-in source setting or sync the flag into consents, and show the effective status. | P2 | S |
| PAR-509 | WhatsApp > General settings | Create a profile when a new number messages (lead capture) | Organic inbound leads (website chat buttons, QR codes, "Hi" messages) never become profiles, so they can't be segmented, attributed or retargeted. Add a setting that calls `resolveCustomer` for any new number, with source `whatsapp_inbound`. | P2 | S |
| PAR-510 | WhatsApp > General settings | Store all incoming messages as an event | The event works in segments, the timeline and flow Condition nodes (`flowExecutor.ts:473-495`), but a reply can't start a flow or act as a flow exit (e.g. "stop the cart reminders when the customer replies"). Messages from unknown numbers are kept but not on any profile. There's no switch to stop storing message bodies, which a DPDP data-minimisation request might need. Publish the event to the queue. | P2 | S |
| PAR-511 | Delivery controls | Delivery controls hub (Frequency capping / DND / Throttling / Minimum delay) | No single place to see or explain sending rules, and no DND, throttling defaults or minimum delay. Add Settings > Delivery controls and move frequency caps there. | P2 | S |
| PAR-512 | Delivery controls > Throttling | Default campaign send speed per channel | There's no default send speed per channel, and the create page's 60000-per-minute placeholder is far above the real ceiling of about 3,000 WhatsApp/SMS/push messages per minute across all tenants. Add per-channel defaults that prefill the campaign field, and show the real ceiling. | P2 | S |
| PAR-513 | WhatsApp > General settings | Opt-in sending rule with per-campaign override | The default rule matches. Missing: the per-campaign override (rarely advisable; if added, limit it to UTILITY/AUTH templates and admins) and any on-page explanation of the rule. | P3 | S |

### 21 Settings: Accounts (general, API keys, MCP, team) (24)

By priority: P0 1 · P1 8 · P2 10 · P3 5. Evidence and recommendations: [modules/21-settings-accounts.md](modules/21-settings-accounts.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-514 | Security / login settings | Login security enforced on every sign-in path (2FA can't be bypassed; social-login callback authenticated) | Authenticate the callback (a shared server secret from the NextAuth server, or verify the provider's ID token) and add the TOTP step to social and Shopify logins. As shipped, anyone who knows a member's email, including a super admin's, can get a session as that member. | **P0** | S |
| PAR-515 | General Settings | Goal mapping: currency (one ISO currency per workspace) | Any non-INR Shopify store (self-serve trials are open) gets ₹ prices in its emails and can't change it. Set it from `/shop.json` `currency` at install and add a select on Project settings. | P1 | S |
| PAR-516 | API Keys | API key inventory: search, name, auth type, sortable created-on, masked key with reveal and copy, row menu, archived link | Build a tenant API Keys page from the super-admin `ApiKeysSection`. Gate the routes to project admins: today any signed-in member, including dealer agents, can list and mint keys. | P1 | S |
| PAR-517 | API Keys | Key row actions: View, Regenerate, Edit, Archive | Add revoke (with a cache purge), rotate-secret and rename in the UI. Rotation matters because the public key sits in every storefront's page source. | P1 | S |
| PAR-518 | API Keys | Create new key: named key, Basic Auth default | Add "Create key" with a name (scopes later). Needed before the P0 below can ship, since tenants need a way to obtain a secret. | P1 | S |
| PAR-519 | Team Management: Members | Invite members by email (several addresses, then role) | Email invites for several addresses with a set-password link and a Pending status; allow adding existing users to a project. | P1 | M |
| PAR-520 | Team Management: Roles | Default role set (Admin, Manager, Developer, Analyst, Marketer) | Ship functional presets (Marketer, read-only Analyst, Developer, Support) once action permissions exist. | P1 | M |
| PAR-521 | Team Management: Roles | Permission matrix (27 components, 88 permissions) | Add module × action permissions (view, edit, publish, download), enforced on the server. | P1 | L |
| PAR-522 | Team Management: Roles | How roles differ: create vs publish vs download | Separate send/publish rights from edit rights, optionally with an approval step. | P1 | M |
| PAR-523 | API Keys | Auto-provisioned per-service keys (Data, Push, Campaign report/..., Inform, Personalize) | Create a key at every project creation path. Per-family keys are unnecessary once scopes exist. | P2 | S |
| PAR-524 | API Keys | View key details drawer | Add tenant-facing key details, masked by default. | P2 | S |
| PAR-525 | API Keys | Per-key API scopes (34 scopes in 8 groups, tri-state tree) | Add per-API scopes chosen at creation (e.g. `events:write`, `import:write`, `inapp:read`). Default new keys to SDK ingestion only, not MoEngage's all-checked tree. | P2 | M |
| PAR-526 | API Keys | Data API scopes: Track/Get/Merge/Delete User, Create Events, Bulk Import, GDPR Delete, File Imports, Track Device, Email Double Opt-in | Add API-key get, merge and erase endpoints so non-Shopify brands can automate DPDP/GDPR requests. Shopify stores already get erasure through the compliance webhook. | P2 | M |
| PAR-527 | API Keys | API documentation links ("Know more", "View API documentation here") | Publish an API reference (events, customers, import, opt-in) and link it from Settings. | P2 | M |
| PAR-528 | Team Management: Members | Members list (avatar, name and email, status, role, action menu) | List every project member (join `user_projects`) and add a status column. | P2 | S |
| PAR-529 | Team Management: Members | Role-hierarchy action gating (graded Team Members permissions; disabled actions with tooltip) | Add Team permissions (view, manage, manage all roles, export) to the permission model. | P2 | M |
| PAR-530 | Team Management: Roles | Custom roles | Competitive once the permission matrix exists; the role builder UI is already in place. | P2 | M |
| PAR-531 | Security / login settings | Workspace login policy (require 2FA for all, session, IP and password policy) | Add an admin setting "Require 2FA for all members" and a session timeout. | P2 | M |
| PAR-532 | Settings entry points | Settings navigation with grouped sections and search | Group settings into a left rail (Account, Channels, Data, Developer and AI) with search. | P2 | S |
| PAR-533 | General Settings | Goal mapping: conversion goal | Merchants can't see or set their own conversion goal. Small impact on Shopify (the ecommerce pack maps `order_placed`), larger for API-integrated brands. At least show it read-only to project admins. | P3 | S |
| PAR-534 | General Settings | Goal mapping: revenue attribute | No UI to choose the revenue property. Add a property picker under Purchase on the mapping screen. | P3 | S |
| PAR-535 | General Settings | Propagation notice and explicit Save | Reuse the Event Mapping preview pattern on tenant settings that move reported numbers (time zone, currency, goal). | P3 | S |
| PAR-536 | API Keys | Archived keys (separate list, up to 10, Archived on) | Add `revoked_at` and an Archived filter on the keys page. | P3 | S |
| PAR-537 | Team Management: Roles | Role details panel and "View users" link | Add a "View members" link and audit fields. | P3 | S |

### 22 Settings: Analytics & data management (16)

By priority: P1 3 · P2 11 · P3 2. Evidence and recommendations: [modules/22-settings-analytics-data-management.md](modules/22-settings-analytics-data-management.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-538 | Data Management: Events | Event catalog table (Display name, Key name, Status, Visibility, First seen, Last seen, 30-day volume, Source; sortable; search) | Admins can't see which events exist, when each was first and last seen, its 30-day volume or where it came from. Build an events catalog from `GROUP BY event_name` (min/max timestamp, 30-day count, distinct source) | P1 | M |
| PAR-539 | Data Management: Events | Events not tracked: count of events with no data in the last 7, 30 or 60 days (card + quick filter) | If the pixel or an integration breaks, `added_to_cart` or `checkout_started` stop arriving unnoticed and abandoned-cart flows stop firing. Track last seen per event, list events silent for 7/30/60 days, and alert admins | P1 | S |
| PAR-540 | Data Management: User attributes | User-attribute catalog with class (Derived / Standard / Custom) and system category (Lifecycle, Acquisition, Reachability…) | No page lists every attribute with its class, type, last seen or source. Custom attributes from Shopify, connectors or the API never appear in the segment builder, although the evaluator reads them (`evaluator.ts:1197-1207`). Build an attribute catalog that unions registry fields, metrics keys and observed custom keys | P1 | M |
| PAR-541 | Settings navigation | Settings IA: "Analytics & Segmentation" and "Data" groups in a searchable flyout, plus Settings Home cards with one-line descriptions | Admins can't find how their data is configured. Add a "Data" settings group (catalog, Event Sources, Event Mapping, identity, data maintenance) with a one-line description per item | P2 | S |
| PAR-542 | Query Settings | Analytics user merging (toggle) | A WhatsApp phone-only profile and a Shopify email profile for one shopper stay two people unless an operator calls the API. Add a per-project identity setting with the shadow report as preview; make ingest follow `merged_into` to the survivor; exclude merged rows from every count | P2 | M |
| PAR-543 | Query Settings | Real-time delete and merge propagation (toggle) | Erased and merged profiles stay in segment counts and member lists indefinitely. On erase or merge, drop their memberships and exit active trips; add `merged_into IS NULL` to the evaluator, dashboard and analytics | P2 | M |
| PAR-544 | Query Settings | Role-based edit lock: page stays visible, controls disabled with "Your role doesn't have the permission to edit this page" | No view-versus-edit permission and no live read-only rendering. Enforce `screens` with view and edit levels, and promote the Event Mapping banner to a shared read-only pattern | P2 | M |
| PAR-545 | Acquisition Tracking | Acquisition quality metrics: conversions, revenue and sessions per user by acquisition campaign | No report of customers, orders, revenue and sessions per first-touch source, campaign or CTWA ad. Stamp the first-touch UTM or CTWA ad on the customer, write CTWA conversions on the first order, add a per-source report, and link `/campaigns/ctwa` | P2 | M |
| PAR-546 | Data Management: Overview | Event volume cards (All events / Custom events) with a 12-month calendar picker | No at-a-glance monthly ingestion volume split into total and custom. Add volume cards to a data overview using the timeseries query, excluding internal rows | P2 | S |
| PAR-547 | Data Management: Overview | Top events by volume (ranked bars, All / Custom selector, Download all) | Project admins can't see which events dominate ingestion. Move the counts to a data overview with a period selector and a bar chart | P2 | S |
| PAR-548 | Data Management: Events | Source filter (SDK, Data API, Internal, File Imports; partners Segment, mParticle, Snowflake) | Lineage is split across two columns and can't be filtered. Normalise to one source value, then add it as a catalog column and filter | P2 | S |
| PAR-549 | Data Management: User attributes | Tracked data type (observed types, possibly several, e.g. "String, Numeric") | A key holding mixed types goes unnoticed. Infer `jsonb_typeof` per key in the catalog | P2 | S |
| PAR-550 | Data Management: User attributes | Blocklisting (Allowed / Blocked / Auto-blocked; row Block; Status radio in the drawer; bulk Block / Allow) | Admins can't stop a noisy or wrong event or attribute from being stored and offered to marketers. Add a block status checked at ingest, with Event Mapping's impact preview before saving | P2 | M |
| PAR-551 | Data Management: User attributes | PII masking per attribute ("Mask attribute" under Data privacy configuration; PII Masking filter and column) | Admins can't mark other attributes as PII. Add a PII flag per attribute that feeds the existing redaction helpers | P2 | M |
| PAR-552 | Data Management: Overview | Event volume chart modal: daily line with presets (Last 7 Days, Last Week, Last 30 Days, Last Month, Custom Range) | Add calendar presets and a custom range to the shared date control | P3 | S |
| PAR-553 | Data Management: Events | Type filter (System / Custom); internal events kept out of the catalog | Add an event class (standard, custom, internal) derived from the registries and name prefixes, and filter on it | P3 | S |

### 23 Settings: Advanced 1 (control groups, tags, locales, Content API, custom domain) (8)

By priority: P0 1 · P1 1 · P2 4 · P3 2. Evidence and recommendations: [modules/23-settings-advanced-1.md](modules/23-settings-advanced-1.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-554 | Custom Domain | Shorten and track URLs in WhatsApp messages | First (S): keep `track` and the destination across syncs, either by merging or by not overwriting `buttons` on rows submitted through Storees. Then shorten URL-valued body and header parameters with the same service, so WhatsApp body links get click statistics too | **P0** | S |
| PAR-555 | Custom Domain | Default platform short domain | Add `SHORTLINK_BASE_URL` to `.env.example`. Refuse to submit tracked-button templates when the base is unset, not HTTPS, or localhost. Show the domain beside "Track clicks". This is also the CLAUDE.md hard rule for dynamic carousel templates | P1 | S |
| PAR-556 | Control Groups | Benchmark campaign performance against the holdout | Add branch-level conversions and lift to flow analytics. Once the GCG exists, add a project incrementality report (GCG vs messaged, by month and channel) | P2 | M |
| PAR-557 | Locales | Localised campaign content by user language or location | Quick win (S): normalise the SDK's `$language` and Shopify's customer locale to a Meta code on the customer, so WhatsApp variant routing actually fires. Then add per-locale content variants, with fallback, to email, SMS and push, keyed off the locale registry | P2 | M |
| PAR-558 | Content API | Send-time external data in message content | Let campaign variables bind to a registered content source, fetched per recipient with concurrency limits and the default value on timeout. For Shopify D2C the main use is unique per-recipient coupons, which a native Shopify discount-code source would serve better than a generic API | P2 | M |
| PAR-559 | Content API | Request: GET/POST/PUT, URL with @ personalisation, URL params and headers as key/value rows | Add encoded query-parameter rows, a variable picker, and the full customer context to interpolation | P2 | S |
| PAR-560 | Navigation | Settings flyout with search and an "Advanced settings" group | Minor today. When workspace control groups, tags and link domains arrive, move Settings to a grouped left rail with an "Advanced" group and a filter box instead of adding tabs | P3 | S |
| PAR-561 | Content API | Body types: Form, JSON (auto Content-Type), Raw | Add Form and Raw modes, and escape values to suit the body type | P3 | S |

### 24 Settings: Advanced 2 (auth, UTM, attribution, alerts, Inform) (17)

By priority: P0 2 · P1 3 · P2 9 · P3 3. Evidence and recommendations: [modules/24-settings-advanced-2.md](modules/24-settings-advanced-2.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-562 | Conversion & attribution | Default model also applied to flows (flow conversions and revenue) | No revenue per journey, the headline number for abandoned-cart and win-back flows. Same gap as module 06 (P0). Reuse the campaign revenue and window logic | **P0** | M |
| PAR-563 | Inform | Template Management: edit transactional content without code deploys | An order-confirmation email built in the UI goes out as the abandoned-cart fallback. Look templates up by id within the project (same P0 as modules 06, 13 and 14) | **P0** | S |
| PAR-564 | UTM tracking | UTM added to links on every channel (campaigns and flows) | WhatsApp campaign clicks reach GA and Shopify untagged. Quick win (S): show the card for WhatsApp and pass `utmParameters` in `sendOneRecipient` (module 04, P1). Flow SMS and push need the SMS body fix first | P1 | M |
| PAR-565 | Alert management | Alert on: WhatsApp Template Suspension | When Meta pauses an abandoned-cart template, flows keep sending into failures with no alert. Reuse the re-categorisation email for pauses, disables and quality drops, and name the flows and campaigns that use the template | P1 | S |
| PAR-566 | Inform | Centralized Logs: debug alerts in real time, API and channel performance | Email alerts cannot be debugged from the log. Log email sends in `messages` with the provider message id (module 14, P1) | P1 | M |
| PAR-567 | Authorization configuration | Service type: SMS Custom Connector (any HTTP SMS gateway) | Indian D2C brands already pay MSG91, Kaleyra, Exotel or ValueFirst under DLT and cannot plug them in. Add a configurable HTTP SMS provider (URL, method, body template, auth) after the empty-body fix (module 03) | P2 | M |
| PAR-568 | Authorization configuration | Service type: Content API (live API data at send time) | Flows only. No token fetch or refresh and no caching; a failed call is stored and the trip continues. The node skips the `assertPublicUrl` SSRF guard that connectors and outbound webhooks use (`genericHttpConnector.ts:258`; `webhookService.ts:122`); module 23 rates that fix P0 | P2 | M |
| PAR-569 | UTM tracking | Account-level UTM switch with defaults for every campaign and flow (editable per campaign) | A brand cannot set its own defaults once (for example utm_source=brand_crm): campaigns start from "storees" and flow steps start untagged. Store defaults in `projects.settings` and pre-fill both builders | P2 | S |
| PAR-570 | Conversion & attribution | Conversion view: Total conversion | Undelivered recipients inflate conversions and revenue. Restrict "Any" to sends that went out (`sent_at` set, or status sent/delivered) | P2 | S |
| PAR-571 | Conversion & attribution | Conversion view: Click-through conversion | Click-through can count orders placed before the click and is blind on SMS and push. Count only events at or after `clicked_at`, and start the window at the click | P2 | S |
| PAR-572 | Conversion & attribution | Attribution window (set per campaign) | With best-time, time-zone or rate-limited sends, conversions by early recipients before dispatch ends are never counted. Periodic runs delete earlier `campaign_sends` rows (`campaignScheduler.ts:98`), so past runs' conversions vanish (module 15, P1). Start the window per recipient at `campaign_sends.sent_at` and fix the label | P2 | S |
| PAR-573 | Inform | Inform add-on: managed transactional alerts (OTP, order, shipping, password reset) | Order and shipping alerts are reliable only on WhatsApp utility templates. Add a Transactional option to send steps and allow parallel trips for transactional flows (module 14, P2) | P2 | L |
| PAR-574 | Inform | Multi-provider routing (30+ providers) | No SMS or WhatsApp failover, and no routing by country or cost | P2 | L |
| PAR-575 | Inform | Growth Opportunity: promotions and cross-sell inside transactional messages | WhatsApp order and shipping alerts cannot carry a cross-sell; the empty parameter is sent as "-" (`deliveryService.ts:150-152`). Fall back to `buildDecisionVarsForCustomer` in flows. Flow email grids are blocked by the template P0 above | P2 | S |
| PAR-576 | UTM tracking | Default set: utm_source and utm_medium required; utm_campaign, utm_term, utm_content optional | No required-field check, so a blanked Source ships links without it. No preset rows for term or content | P3 | S |
| PAR-577 | UTM tracking | Separate campaign value and flow value per parameter | Keeping dozens of flow steps consistent is manual; this comes with the account-level default | P3 | S |
| PAR-578 | Conversion & attribution | Conversion view: View-through (users who received the message) | Same label, different definition, so Storees reads lower side by side. Rename it to open-through or align the definitions. Email opens arrive only from Resend (`resendWebhook.ts:142-148`) | P3 | S |

### 25 App Marketplace (40)

By priority: P0 2 · P1 4 · P2 8 · P3 26. Evidence and recommendations: [modules/25-app-marketplace.md](modules/25-app-marketplace.md).

| ID | Area | Feature | Gap in Storees | Priority | Effort |
|---|---|---|---|---|---|
| PAR-579 | Ecommerce | Shopify Integrate tab: merchant adds and manages the store connection | A project admin cannot see store status or last sync, and cannot resync or reconnect. Worse, any reinstall or scope re-auth silently disconnects WhatsApp, SMS, email and AI. Make `activatePack` merge settings before any scope change, then add a Shopify card in Settings | **P0** | S |
| PAR-580 | Messaging providers | SMS gateways Storees also supports (Twilio, Gupshup, Vonage; Storees adds Bird) | Indian operators reject commercial SMS without DLT IDs (modules 03 and 19 rate this P0), and the Pinnacle tile cannot send with the merchant's key | **P0** | M |
| PAR-581 | Integrate patterns & access | Permissions model: integrate and create-app gated per role, disabled with a tooltip | Any member, including an agent or a PII-masked role, can replace messaging credentials or add an outbound webhook that sends raw email and phone (`segmentService.ts:170-178`). Put `requireRole('admin')` or an integrations permission on these routes, and show disabled controls with a reason instead of hiding screens | P1 | S |
| PAR-582 | Ecommerce | Shopify app installs on-site tracking automatically | Without the paste, browse and `added_to_cart` events never arrive. The auto-created Abandoned Cart flow (trigger `added_to_cart`, `flows/src/templates.ts:18-27`) and browse abandonment then never fire; only `checkout_started` still arrives, from the checkouts/create webhook (`webhooks.ts:26`). Ship a web pixel extension that installs with the app, plus a theme app embed. Fix the settings wipe first, because a new scope sends every merchant back through the OAuth callback | P1 | M |
| PAR-583 | Ads: audiences & conversions | Meta (Facebook) Custom Audience sync from segments | Retargeting and exclusion audiences go stale after upload. Push members to a Meta custom audience and keep it in sync on segment enter and exit; the hashing already exists | P1 | M |
| PAR-584 | Messaging providers | ESP connectors Storees also supports (Sendgrid, Amazon SES) | Sends through SendGrid or SES get no delivered, open, click or bounce data and no auto-suppression. Add their event webhooks (module 19, P1/M) | P1 | M |
| PAR-585 | Marketplace landing | Create app: forward segments or run campaigns through your own app | Segments can reach a brand's own system, but there is no saved app definition and campaigns cannot send through a custom endpoint. Add a reusable custom app (endpoint, auth, payload template) that works as a campaign channel and as a flow step | P2 | M |
| PAR-586 | Marketplace landing | "Custom destinations" section (empty heading, likely feature-flagged) | Destinations receive segment changes only. Emit customer, order and message events (sent, delivered, clicked) so the same webhook covers streaming | P2 | M |
| PAR-587 | Integrate patterns & access | Integrate pattern C: OAuth connect ("Sign in with Google" for Google Ads Audience) | Pasting tokens is the main setup drop-off, and it rules out Google Ads. Add OAuth connect for Google and Meta alongside audience sync (module 20 rates Embedded Signup P1) | P2 | M |
| PAR-588 | Integrate patterns & access | Integrate pattern E: Zapier app with embedded workflow templates | Only teams that wire raw webhooks can use it: no listed app, templates or authenticated triggers and actions. A Zapier app (create or update customer, track event, trigger on segment entered) would open up CRMs and form tools | P2 | M |
| PAR-589 | Integration mechanisms | Content APIs: partner data fetched at send time | Loyalty balances, coupons or live stock can personalise flows only, and every flow repeats the API setup. Add a named content-source registry that campaigns can use (module 23, P2) | P2 | M |
| PAR-590 | CDP & analytics | CDP and event-pipeline data in (Segment, RudderStack, Snowplow, PostHog) | A Segment or RudderStack customer needs one definition per event, or custom transforms. Accept the Segment track/identify spec at a dedicated endpoint | P2 | M |
| PAR-591 | Ads: audiences & conversions | Google Ads Customer Match audience (Sign in with Google) | Uploads are manual. API sync needs OAuth plus a developer token | P2 | L |
| PAR-592 | Ads: audiences & conversions | Meta Ads Conversions API | Purchases are relayed but funnel events are not, and website events lack fields Meta requires (module 05, P2) | P2 | S |
| PAR-593 | Marketplace landing | Header actions: Know more, Watch video, Integrate with us | In-app snippets exist, but there is no help content and no published API reference. Add a docs link per integration and publish the v1 API reference | P3 | S |
| PAR-594 | Marketplace landing | Categories filter with counts (35 categories, All, Connected apps) | Grouping exists per channel only. Group the hub by Ecommerce, Messaging, Ads, Data in, Data out and AI, with counts | P3 | S |
| PAR-595 | Marketplace landing | Partner card anatomy: logo, name, Built by, one-liner, category chips, badges, connected check | Initial-letter tiles look unfinished in demos. Use brand logos and add category and status chips | P3 | S |
| PAR-596 | Marketplace landing | Status badges: New and Coming soon | Coming soon appears on one form only. Add New and Coming soon badges to hub cards | P3 | S |
| PAR-597 | Marketplace landing | URL-driven filter state and deep links | Support cannot send a merchant a link to "Setup > Shopify pixel". Put the section and channel in the query string | P3 | S |
| PAR-598 | Catalog & detail pages | Partner detail page: breadcrumb, about text, setup guide, category, Get in touch, Description carousel, Integrate tab | Merchants see credential fields before learning what an integration does. Add a panel per integration covering what it does, what syncs and a setup guide | P3 | S |
| PAR-599 | Integrate patterns & access | Integrate pattern A: integration list with "+ Add integration" | A brand cannot run two ESPs (say promotional and transactional) or two SMS gateways. The email split is half built: expose both columns and store a config per provider | P3 | M |
| PAR-600 | Integrate patterns & access | Integrate pattern B: "Request access" gate | Self-serve upgrade suits Shopify merchants better than a sales gate. Enforce the audience-export entitlement or drop it | P3 | S |
| PAR-601 | Integrate patterns & access | Connected indicator | No single connected view, and pixel-only Shopify stores read "Not Connected". Count pixel events and show status on hub cards | P3 | S |
| PAR-602 | Integration mechanisms | Connector Campaigns: per-user webhook with method, URL, headers and a Form/JSON/Raw body | Event-triggered calls work in flows; one-time or periodic broadcasts to an endpoint do not. Add a connector campaign type once the SSRF guard is in | P3 | M |
| PAR-603 | Ecommerce | Yotpo: UGC ratings and reviews in campaigns via Content APIs | Reviews reach flows only, one value per variable, set up per flow. A Judge.me or Yotpo source in the content registry would cover the D2C use case | P3 | M |
| PAR-604 | CDP & analytics | Google Tag Manager: forward events without code | Works for technical teams only. A GTM community template that maps dataLayer events would make it no-code | P3 | S |
| PAR-605 | Ads: audiences & conversions | TikTok, Snapchat and Pinterest audiences | Manual only. TikTok is unavailable in India, so this is low priority for Indian D2C | P3 | M |
| PAR-606 | CRM | LeadSquared and Pipedrive (lead import, ticket creation) | Possible only with engineering help; low relevance to D2C | P3 | M |
| PAR-607 | Data infrastructure | Reverse ETL: Hightouch, Census | Workable through a custom HTTP destination; a documented recipe is enough for now | P3 | S |
| PAR-608 | Other partner categories | Support ticketing (Zendesk via connector campaigns) | Flows only, with no recipe | P3 | S |
| PAR-609 | Other partner categories | Survey tools (Typeform, Iterate, QuestionPro, Delighted, Qualtrics, SurveyMonkey) | No native connector and no survey widget (module 05 rates the widget P2) | P3 | S |
| PAR-610 | Other partner categories | Voice calls (Exotel, Deepgram) | COD confirmation calls are an Indian D2C use case, though WhatsApp usually covers it | P3 | M |
| PAR-611 | Other partner categories | Direct mail (Inkit, Optilyz, Lob, Paperplanes, PFL, Poplar) and Calendar (Rokt Calendar) | These vendors focus on the US and EU; low relevance | P3 | S |
| PAR-612 | Other partner categories | Dynamic content partners (18, e.g. Movable Ink, Rocketium, Argoid, Dynamic Yield, NiftyImages) | Product personalisation is native; sale countdowns and live-image partners are missing | P3 | M |
| PAR-613 | Other partner categories | Loyalty partners (15, e.g. Talon.one, Voucherify, Smile, LoyaltyLion, Capillary) | Points balances and reward codes need engineering work. A recipe or connector for the loyalty apps Shopify D2C brands use would help retention flows | P3 | M |
| PAR-614 | Other partner categories | Gamification (Flyy, Smashpops, CustomerGlu) | Low relevance | P3 | S |
| PAR-615 | Other partner categories | Google Sheets (Sheetdb, Sheetsu) and contextual location (AccuWeather, Open weather, Radar) | Flows only; low relevance | P3 | S |
| PAR-616 | Other partner categories | Experimentation (AB Tasty, VWO, Growthbook) | VWO is common in Indian D2C CRO teams; a snippet recipe is enough | P3 | S |
| PAR-617 | Other partner categories | Mobile wallets (PassKit, Skycore) | Possible only as a hand-built flow. Loyalty cards and coupons in mobile wallets are low priority | P3 | M |
| PAR-618 | Other partner categories | Automation and iPaaS (Pipedream, Airtable, Tray.io, DataChannel; Fivetran coming soon) | No listings or templates. Zapier is the one worth building (see the Integrate pattern E row) | P3 | S |

---

## Appendix C. Limits and open actions

**Not covered.** States that needed data, a different role, a paid add-on or a save could not be reached in MoEngage. Some reachable screens were skipped as near-duplicates. Examples are push templates other than Basic, later pages of the email template gallery, and about 120 of the 165 App Marketplace partner pages. Appendix B of the [full report](MOENGAGE_VS_STOREES.md#b-what-was-not-covered-and-why) lists the gaps module by module.

**Confirm on a running Storees instance**
- WhatsApp webhook routing for brand-owned Meta apps (P1-35).
- Segment AI failing every request (P1-53).
- The Product Analytics loading spinner.
- Any row marked "read from code, not run" in the module files.

**Open actions from the capture**
- The MoEngage On-site builder auto-saved one draft named "Untitled" during capture. Someone with a role that can open All Campaigns > Drafts should delete it.
- 16 screenshots show personal data: 10 in module 07 and 6 in module 09. Redact them before the `screenshots/` folder is shared or committed.
