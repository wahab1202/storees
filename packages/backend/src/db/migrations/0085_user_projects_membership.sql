-- Multi-client access: per-user project membership + explicit super-admin flag.
-- A client (non-super-admin) may only operate on projects they are a member of.
-- Super admins bypass membership entirely (cross-project ops, e.g. support users).
--
-- SAFETY (per the 2026-07-22 tenant-isolation revert): this is auth-only — it does
-- NOT force the JWT project as the tenant and does NOT touch encryption. The
-- membership check is enforced at requireProjectId behind the ENFORCE_PROJECT_MEMBERSHIP
-- flag; this migration BACKFILLS memberships first so no existing user is locked out
-- when the flag is switched on.

-- Explicit cross-tenant flag. NOT overloaded onto `role` (whose JWT default is
-- fail-open 'admin'); this defaults false so a missing/forged-missing claim never
-- grants cross-tenant access.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Which projects a user may access. Composite PK = one row per (user, project).
CREATE TABLE IF NOT EXISTS user_projects (
  user_id    uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id)    ON DELETE CASCADE,
  created_by uuid REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_user_projects_project ON user_projects(project_id);

-- Backfill: every existing user keeps access to their current home project, so
-- enabling enforcement does not lock anyone out of their own data.
INSERT INTO user_projects (user_id, project_id)
SELECT id, project_id FROM admin_users
WHERE project_id IS NOT NULL
ON CONFLICT (user_id, project_id) DO NOTHING;
