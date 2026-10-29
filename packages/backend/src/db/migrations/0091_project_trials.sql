-- 0091: Self-serve trial + plan model on projects.
--
-- Adds the trial/plan lifecycle so a Shopify merchant can self-onboard on a
-- 14-day trial with limited entitlements, and super admins can monitor it.
--
-- Non-breaking: existing projects default to plan='custom' / status='active'
-- with no trial clock, so nothing changes for current (hand-provisioned)
-- tenants. Only the Shopify self-serve path sets plan='trial'. No backfill.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan             varchar(20)  NOT NULL DEFAULT 'custom';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status           varchar(20)  NOT NULL DEFAULT 'active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS trial_ends_at    timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS signup_source    varchar(20)  NOT NULL DEFAULT 'manual';

-- Admin monitoring: find trials ending soon / by status quickly.
CREATE INDEX IF NOT EXISTS idx_projects_plan_status ON projects (plan, status, trial_ends_at);
