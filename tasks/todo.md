# Data-oriented roles & field-level PII masking

Goal: custom per-project roles that control BOTH screen access AND data visibility.
First real use case: "give an employee customer-data access, but hide contact details."

Locked decisions (2026-10-09):
- Model: **full custom-roles builder** (per-project roles, not just flags on legacy roles).
- Masked fields: **email + phone/WhatsApp** (name & address stay visible).
- Mask style: **partial** — `j•••@•••.com`, `+91•••••7100` (keep last 4).
- Export: **block entirely** for roles without contact access (403 + hide button).

Principle: **masking is enforced server-side** — the API redacts before the response
leaves the backend. Frontend hiding alone = leak via devtools/network/CSV.

Default is non-breaking: a user with no custom role (or legacy admin/manager/agent)
keeps FULL access. Masking only applies when a role explicitly sets viewContactPii=false.

## Backend — DONE

- [x] Migration 0086: `roles` table + `admin_users.role_id` FK (ON DELETE SET NULL). Applied, verified in DB.
- [x] schema.ts: `roles` pgTable + `adminUsers.roleId`.
- [x] `lib/pii.ts`: maskEmail, maskPhone, redactCustomerContact/redactContactFields, scrubJsonbPii.
- [x] `middleware/capabilities.ts`: ViewerCapabilities + getViewerCaps (cached, bounded) + invalidateCaps/invalidateAllCaps + requireCapability.
- [x] Masking enforced at all egress points: customers list/detail/journey/events; events feed + session debugger; logs/notifications; dashboard activity; predictions goal customers; segments preview; inbound-webhook events/explain/schema; test-send sample context (campaigns + whatsappAdmin).
- [x] Export blocked when !exportCustomers: consent-export (requireRole+requireCapability) + segment export-audience.
- [x] `routes/roles.ts` (`/api/roles`): list/create/update/delete, mounted in index.ts.
- [x] adminUsers POST/PATCH accept + validate `roleId`; invalidateCaps on change; GET returns roleId/roleName.
- [x] `/api/auth/me` returns resolved capabilities.

## Frontend — DONE

- [x] `hooks/useRoles.ts` (+ useMyCapabilities).
- [x] `settings/roles/page.tsx` — roles builder (toggles: see contact details, export customers).
- [x] settings/layout.tsx — Roles tab (adminOnly).
- [x] team page — Permissions column + invite-form select to assign a role.
- [x] ExportAudienceButton hidden when !capabilities.exportCustomers.

## Verify — DONE
- [x] typecheck both packages (backend exit 0, frontend clean)
- [x] masking unit check: j•••@•••.com, phone keeps last 4, nested JSONB scrubbed, viewContactPii=true passes through
- [ ] Manual UAT: create "Support (no contact)" role → assign → confirm masked list/detail + 403 export
- [ ] NOTE: screen-level scoping via custom roles is stored (`screens`) but not yet enforced — sidebar still gates by legacy role. Follow-up.
- [ ] GWM branch: cherry-pick / re-apply (mirrors multi-client pattern). Not pushed.
