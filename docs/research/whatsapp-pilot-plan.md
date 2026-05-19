# ClickSend → Storees Direct-Meta WhatsApp — Pilot Plan

**Status:** Draft, awaiting customer commitment
**Owner:** Wahab
**Companion doc:** [whatsapp-direct-meta-decision.md](./whatsapp-direct-meta-decision.md)
**Decision gate:** End of week 4. Continue to Phase 2 (Tech Provider enrolment) only if exit criteria are met.

---

## 1. Pilot objective (one paragraph)

Take 1–3 existing Storees customers who currently spend money with ClickSend (or any other generic SMS/WhatsApp sender) for their Shopify or BFSI outbound, move their WhatsApp traffic onto Storees' direct-Meta sender, and prove three things: (a) the campaign/flow UX is at least as good as ClickSend for their actual workflow, (b) delivery rate and operational support are equal or better, (c) the per-conversation economics let us either match or undercut ClickSend's effective price while leaving operational margin for Storees. If those three hold, we have evidence the broader plan (Tech Provider, embedded signup) is worth funding. If they don't, we stop and re-scope before spending more.

## 2. Target pilot customer profile

Look for these traits — pick the customer who has the most of them:

- Already a paying Storees customer (zero CAC, easy conversation).
- Sending ≥ 5,000 WhatsApp messages/month through ClickSend (small enough to be safe, big enough that the savings story is real).
- Mostly **marketing + utility** category sends, not authentication OTPs. OTPs need sub-second latency and 5-9s of delivery; we should not put OTP traffic on the pilot — defer.
- Willing to share their ClickSend invoice so we know the real cost basis.
- Has a designated person (founder or marketing lead) who can spend 2-3 hours/week on the pilot.
- Either willing to **port their existing WhatsApp number** to a new WABA OR willing to use a new number for the pilot and run side-by-side for a week.

Do NOT pilot with: BFSI customers (compliance burden), customers using ClickSend for SMS only (different problem), or customers who depend on a feature ClickSend has that Storees doesn't (verify in week 0).

## 3. What ClickSend gives them today that we have to match

Walk a customer through their ClickSend dashboard in week 0 and confirm we match each row:

| ClickSend capability | Storees status | Gap |
|---|---|---|
| WhatsApp template send (one-off) | ✅ `metaWhatsappProvider.ts` | None — works today |
| WhatsApp template send (broadcast to list) | ✅ Campaigns module, channel=whatsapp | None |
| Template approval status sync from Meta | ✅ `/api/whatsapp/sync-templates` + `templates/:id/refresh-status` | None |
| Template lint before submit | ✅ `/api/whatsapp/templates/lint` | None |
| Delivery / read receipts | ✅ `whatsappInboundService.ts` | Verify webhook deliverability under load (week 1) |
| Two-way reply inbox | ⚠️ Inbound events are persisted but there's no agent inbox UI | **Build minimal agent inbox** OR explicitly scope out for pilot |
| Contact list management | ✅ Customers module + segments | None |
| Bulk CSV import | ✅ Customer import | Verify column mapping handles phone-only files |
| Per-conversation cost tracking | ❌ Not surfaced anywhere | **Build a "WhatsApp cost" widget** for the customer to see what they're spending |
| Opt-in collection on Shopify checkout | ⚠️ Storees ingests customers, opt-in happens via Storees SDK or Shopify webhook | Confirm the customer's opt-in source is captured cleanly |
| WhatsApp Business profile editing (name, hours, away message) | ❌ Not in admin UI | Manual via Meta Business Manager for pilot — acceptable for now |

The two real gaps for a Shopify D2C ClickSend customer are: **(a) two-way reply inbox** and **(b) cost visibility**. Decide in week 0 whether the pilot customer cares about the inbox. If they don't (some D2C brands only broadcast and reply via human staff using the WhatsApp Business app on their phone), defer the inbox to Phase 2.

## 4. Storees-side work, week by week

### Week 0 — pre-pilot (2-3 days)

- Identify candidate customer. Get their ClickSend invoice for the last 3 months.
- Walkthrough their ClickSend dashboard. Confirm gap table above.
- Decide together: port existing number, or use a new number? Document.
- If new number: order the number in their Meta WABA *now* — number provisioning + display-name approval takes 1-3 business days.
- Get them to enrol/verify their Facebook Business (if not already) — this is the single longest external dependency, 1-7 days.
- Decide: do they keep ClickSend running in parallel for week 1, or hard cut?

**Exit:** customer has a verified WABA + a phone number ready to send, and a signed mini-agreement on what the pilot covers.

### Week 1 — wire up & first campaign

Engineering work in Storees (small, ~3-5 days of one engineer):

1. **Tenant WhatsApp credentials storage** — verify the per-project (WABA ID, phone-number ID, access token, app secret) storage path is clean and rotatable. Right now it likely lives in env vars or the channel-provider table. If env-var based, move to per-project encrypted columns (we already have `encryption.ts`).
2. **Provider routing override** — confirm a Storees admin can switch this specific project's WhatsApp channel from `gupshup` (or whatever default) to `meta_direct` without redeploying.
3. **Webhook URL provisioning** — give the customer a copy-paste Meta webhook URL specific to their project. Confirm the subscribe-fields setup is correct (`messages`, `message_template_status_update`, `phone_number_quality_update`, `account_review_update`).
4. **Cost tracking — minimal version:** stamp each `campaign_sends` row with the conversation category Meta returns (marketing / utility / authentication / service). We'll multiply by Meta's published India rate at month end — no need for real-time cost yet. Adds ~20 lines.
5. **Phone number quality rating display** — read it via the Meta phone-numbers endpoint once a day, store on the project. Show GREEN/YELLOW/RED dot in admin. ~30 lines.

Then with the customer:
- Recreate their 3-5 most-used templates in Storees, submit for approval (Meta usually approves utility templates within hours, marketing within 24h).
- Migrate the segment / contact list they broadcast to.
- Send one **small** real broadcast (≤ 500 recipients) and compare with what ClickSend would have done — delivery rate, read rate, time-to-deliver.

**Exit:** one real broadcast sent through Storees direct-Meta. Numbers logged.

### Week 2 — first full campaign cycle + a flow

- Customer runs their normal weekly campaign through Storees instead of ClickSend.
- Activate one event-triggered flow (e.g. abandoned-cart on Shopify) ending in a WhatsApp send.
- Compare both campaigns and the flow against the customer's prior ClickSend equivalent.
- If two-way inbox was scoped in: ship a minimal version. The data is already in `whatsappInboundService` — just need a list/detail UI keyed off `customers.phone`.
- Daily check-in (Slack / call) — 15 min — to triage anything that's worse than ClickSend.

**Exit:** customer has run a full week of their normal volume through Storees. No critical regressions.

### Week 3 — operational stress

- Push for higher volume — the customer's normal monthly volume in a week if possible.
- Deliberately let one template get rejected and walk through the recovery UX. Note the friction.
- Simulate a webhook outage (toggle off webhook subscriptions for an hour, then re-enable) — confirm status reconciles on resume via `templates/:id/refresh-status` pattern.
- Customer fills out a short feedback form: would they cancel ClickSend? What's missing?

**Exit:** quantified comparison: delivery rate, read rate, time-to-first-message, cost per conversation, support tickets per 1k messages.

### Week 4 — decision

Compile the data into a one-page memo:

- Cost per 1k marketing conversations: ClickSend vs Storees direct-Meta. Include Meta's published rate as the floor.
- Delivery rate delta (Storees minus ClickSend).
- Read rate delta.
- Tickets / issues raised, with severity.
- Customer NPS: "Would you cancel ClickSend tomorrow if we asked you to?"

## 5. Success metrics — what "the pilot worked" means

Set thresholds before week 1 starts so we can't shift the goalposts:

- **Delivery rate** within 1.5 percentage points of ClickSend (Meta is the underlying delivery layer for both, so this should hold trivially; if it doesn't, we have a bug).
- **Effective cost per marketing conversation** ≤ ClickSend's effective rate. Aim for ≥ 15% headroom so Storees can still mark up in the eventual reseller play.
- **Zero P0 outages** during the 4 weeks. P1 issues resolved < 1 business day.
- **Customer answer to "would you cancel ClickSend?"** = Yes, or Yes-conditional with named conditions Storees can fix in ≤ 6 weeks.

If all four are GREEN: proceed to Phase 2 (Tech Provider enrolment + embedded signup).
If 1-2 are RED: scope the fixes, do a 2-week extension, re-evaluate.
If 3-4 are RED: stop. The thesis is wrong and we need to re-examine whether direct-Meta makes sense at all.

## 6. Risks & how we handle them

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Customer's WABA gets quality-rated YELLOW or RED during pilot | Med | High | Watch the quality endpoint daily; if it drops, pause broadcasts immediately, audit recent template, throttle. Don't blame Storees for ClickSend-era template hygiene — we agree pre-pilot on what "good" templates look like. |
| Template rejection delays first send | High | Low-Med | Pre-approve templates in week 0, not week 1. Have backup templates lined up. |
| Customer expects features we said we'd build but didn't (scope creep) | High | Med | Week 0 sign-off on the exact pilot scope. Anything outside it is "Phase 2". Be ruthless. |
| Meta account-level enforcement (warning, partial restriction) | Low | Catastrophic | Read Meta's Commerce + Business Messaging policies *before* week 1. Don't pilot with anything that touches restricted categories (alcohol, finance products, etc.) without owner explicit sign-off. |
| Customer reports worse delivery on Storees | Med | High | This shouldn't happen mechanically — same Meta pipe — but if it does, almost certainly a webhook ack lag or a retry-policy gap. Debug fast; have an SLA agreement that we fix within 48h or they go back to ClickSend penalty-free. |
| Engineering work overruns the 3-5 day estimate | Med | Med | Scope is the lever. Drop two-way inbox first, drop cost-tracking-UI second. We can sell those in Phase 2. |

## 7. What this pilot does NOT do

State this explicitly to the customer:

- **Storees does not bill you for Meta conversations during the pilot.** Meta bills your card directly via the WABA. We will give you a cost summary at week 4 to compare with ClickSend; we are not the merchant of record.
- **We are not yet a Meta Tech Provider.** This pilot uses your own WABA. If/when we become a Tech Provider, the onboarding experience improves but the billing relationship stays the same until we cross Solution Partner status (see [decision doc](./whatsapp-direct-meta-decision.md) section 4).
- **No two-way inbox unless explicitly in scope** — your team can keep replying via the WhatsApp Business mobile app for the pilot.
- **No OTPs in scope** — keep auth traffic on whatever you use today.

## 8. What we ship to Storees regardless of pilot outcome

These four pieces are useful to the existing product even if the pilot fails, so build them in week 1:

1. Per-project encrypted storage of WhatsApp credentials (cleaner multi-tenancy).
2. Webhook URL provisioning UI in admin.
3. Phone-number quality rating poll + display.
4. Conversation-category stamping on `campaign_sends` rows.

They cost 1-2 days, harden the existing multi-provider WhatsApp infrastructure, and make every future tenant onboarding 10x easier — independent of whether the pilot customer converts.

## 9. Decision after week 4

- **Green pilot:** open a second pilot with a different customer profile (different ICP — e.g. a service-based BFSI tenant if pilot 1 was D2C, or vice-versa). At customer #3 with green metrics, file the Tech Provider application and start embedded-signup work.
- **Yellow pilot:** identify the two largest gaps, build them, re-run with the same customer for 2 more weeks. Don't open a second pilot until the first is fully green.
- **Red pilot:** revisit the broader hypothesis. The fallback isn't catastrophic — Storees already runs other WhatsApp providers (Gupshup, Twilio, Bird) so existing customers are not affected. We just don't pursue the direct-Meta + reseller line of business for another quarter.

---

## Open questions to resolve in week 0

1. Who is the pilot customer? (Name)
2. What's their ClickSend monthly bill (last 3 months)?
3. Existing number port, or new number?
4. Two-way inbox in scope, or deferred to Phase 2?
5. Who is the named technical contact on the customer side?
6. What's the cutover model — hard cut, or parallel for 1 week?

Until those six are answered, the plan is paper. The unblock is finding the customer, not writing more spec.
