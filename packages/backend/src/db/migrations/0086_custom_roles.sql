-- 0086: Data-oriented custom roles + field-level PII masking.
--
-- A role bundles BOTH screen access and data-visibility policy. The security-
-- critical bit is `permissions.viewContactPii`: when false, the API redacts
-- customer email/phone everywhere before the response leaves the backend.
--
-- Non-breaking by design: admin_users.role_id is NULL for every existing user,
-- and a NULL role_id resolves to FULL capabilities (see getViewerCaps). Masking
-- only ever takes effect for a user explicitly assigned a role whose
-- permissions turn a capability off. No backfill needed.

CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        varchar(80) NOT NULL,
  description text,
  -- { "viewContactPii": bool, "exportCustomers": bool, "screens": string[] }
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- reserved for future built-in presets; custom roles are is_system=false
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One role name per project (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_project_name ON roles (project_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_roles_project ON roles (project_id);

-- Assign a custom role to a user. NULL = legacy behaviour (full access, scoped
-- only by the existing admin/manager/agent `role` column). ON DELETE SET NULL so
-- deleting a role safely reverts its holders to full access rather than cascading.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users (role_id);
