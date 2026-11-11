# Storees — Data Protection & Compliance Assessment

**Scope:** GDPR (EU), DPDP Act 2023 (India), HIPAA (US health).
**Last updated:** 2026-11-11
**Status:** Technical data-protection controls built. Legal/organisational work outstanding (owner: business).

---

## 0. Read this first — what "compliant" actually means

Compliance is **not** a code setting. For every regime below, it is roughly:

```
compliance  =  technical controls  +  legal instruments  +  organisational process
               (what we build)        (contracts/policies)   (people, training, audits)
```

Code can satisfy only the **technical** column. The other two columns — a Data
Processing Agreement with each merchant, a published privacy policy, a named
data-protection contact, a breach-notification procedure, retention schedules,
sub-processor disclosures, staff training — are **business/legal deliverables**
that no amount of engineering produces. This document is honest about which is
which so nobody mistakes "we shipped the erasure endpoint" for "we are GDPR
compliant."

---

## 1. HIPAA — almost certainly does NOT apply

HIPAA governs **Protected Health Information (PHI)** handled by *covered
entities* (health plans, providers, clearinghouses) and their *business
associates*. Storees is a **Shopify marketing/CDP platform**: it processes
names, emails, phone numbers, order history and marketing engagement — **not**
diagnoses, treatments, or health records.

**Conclusion:** HIPAA is out of scope unless Storees is deliberately sold to a
covered entity to process PHI (e.g. a pharmacy or clinic using it for patient
messaging). If that ever happens, HIPAA compliance requires a signed **Business
Associate Agreement (BAA)**, encryption mandates, access logging, and a formal
risk analysis — a separate, large programme. **Do not claim HIPAA compliance or
readiness today.** If a prospect raises it, treat it as a scoping conversation,
not a feature request.

---

## 2. GDPR & DPDP — the technical controls (what we built)

GDPR and DPDP overlap heavily; the same primitives satisfy both. Storees acts as
a **data processor** (GDPR) / **data processor** (DPDP) on behalf of each
merchant (the **controller** / **data fiduciary**).

| Right / obligation | GDPR | DPDP | Status | Where |
|---|---|---|---|---|
| Right of access / portability | Art. 15 / 20 | §11 | ✅ Built | `dataSubjectService.exportCustomerData` → `GET /api/customers/:id/data-export` + Shopify `customers/data_request` |
| Right to erasure | Art. 17 | §12 | ✅ Built | `dataSubjectService.eraseCustomer` → `POST /api/customers/:id/erase` + Shopify `customers/redact` |
| Shop uninstall purge | Art. 17 | §8(7) | ✅ Built | `dataSubjectService.purgeShopData` → Shopify `shop/redact` |
| Consent capture + proof | Art. 7 | §6 | ✅ Present | `consents` + `consent_audit_log` tables; `consentService` |
| Data minimisation in logs | Art. 5(1)(c) | §8 | ✅ Present | `dataMasking` middleware redacts card/Aadhaar; `lib/pii.ts` field masking |
| Encryption at rest | Art. 32 | §8(5) | ⚠️ Partial — see §4 | `services/encryption.ts` (AES) |
| Tenant isolation | Art. 32 | §8 | ✅ Present | `project_id` on every table; scope middleware |
| Purpose-limited access (RBAC) | Art. 32 | §8 | ✅ Present | role + capability gating; PII masking per viewer |

### What erasure actually does
`eraseCustomer` anonymises rather than hard-deletes, which GDPR/DPDP permit once
data is no longer identifiable (keeps aggregate analytics + referential
integrity intact):

- **customers**: email/phone/name/externalId/customAttributes cleared.
- **events**: PII keys stripped from raw `properties` JSONB (event kept for analytics).
- **whatsapp_inbound/outbound_messages + conversations**: message bodies, media and phone numbers redacted.
- **consents**: **retained** — this is the lawful record that processing was permitted (an auditor needs it).
- An audit `data_erased` event is written.

`purgeShopData` runs the customer anonymisation across the whole tenant and
severs the Shopify token (fired by Shopify 48h after uninstall).

---

## 3. GDPR & DPDP — the legal/organisational gaps (business owns these)

These are **required for compliance** and **cannot be built in code**:

- [ ] **Published privacy policy** describing what is collected, why, legal basis, retention, and data-subject rights.
- [ ] **Data Processing Agreement (DPA)** offered to / signed with every merchant (Storees = processor).
- [ ] **Sub-processor list** (Shopify, Resend, Groq/LLM provider, Pinnacle/WhatsApp, Railway, Upstash) — disclosed, with DPAs in place with each.
- [ ] **Named data-protection contact** (GDPR; a DPO only if thresholds met). **DPDP: a Data Protection Officer / grievance contact is mandatory for a Significant Data Fiduciary and strongly advised otherwise.**
- [ ] **Breach-notification procedure** — GDPR: 72h to supervisory authority. DPDP: notify the Data Protection Board + affected principals.
- [ ] **Retention schedule** — how long each data class is kept, with automated deletion.
- [ ] **International transfer basis** — SCCs or adequacy if EU data leaves the EEA (check hosting regions).
- [ ] **Records of processing activities (RoPA)** — Art. 30.
- [ ] **Consent-withdrawal path** exposed to the end customer (not just merchant-triggered).
- [ ] **Staff access policy + training.**

---

## 4. ⚠️ Known technical gap — production encryption key

`services/encryption.ts` returns **plaintext when `ENCRYPTION_KEY` is unset**,
and **production currently has no key set** — so Shopify access tokens and other
secrets are stored unencrypted in prod.

**This has NOT been changed in this pass, by design.** A prior attempt to make
encryption fail-closed (2026-07-22) broke the GWM production tenant and was
reverted. Changing the fail mode is a coordinated deploy, not a code tweak.

**Remediation (requires devops, out of band):**
1. Generate and set `ENCRYPTION_KEY` on both prod boxes.
2. Backfill-encrypt existing plaintext tokens in a migration.
3. *Then* consider making decrypt fail-closed.

Until step 1 is done, Art. 32 / §8(5) "encryption at rest" is only partially met
in production. Flag this to the business as the single highest-value technical
remediation.

---

## 5. Honest summary

| | Built in code (this pass) | Still required |
|---|---|---|
| **GDPR** | Access, erasure, consent, masking, isolation, RBAC | DPA, privacy policy, breach process, RoPA, retention, sub-processor DPAs, prod `ENCRYPTION_KEY` |
| **DPDP** | Same technical primitives | Grievance/DPO contact, consent-withdrawal UX, breach process to Data Protection Board |
| **HIPAA** | N/A | Nothing — out of scope unless selling to a covered entity (then BAA + full programme) |

**Bottom line:** the platform now has the concrete **technical** data-protection
controls GDPR and DPDP require. Full compliance still depends on legal and
organisational work that only the business can complete. HIPAA does not apply.
