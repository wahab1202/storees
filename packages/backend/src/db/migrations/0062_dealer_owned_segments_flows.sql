-- 0062_dealer_owned_segments_flows.sql
--
-- B2B dealer (agent) RBAC, step 1: ownership of dealer-authored segments and
-- flows. A dealer logging in (admin_users.role = 'agent') can now create their
-- own segments and flows; these rows are stamped with created_by_agent_id so
-- they stay private to that dealer (admin sees all). Evaluation / audience of an
-- owned segment/flow is scoped to that dealer's customers (customers.agent_id).
--
-- NULL created_by_agent_id = admin/project-global (existing rows, default
-- segments) — unchanged behaviour for admins.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

ALTER TABLE segments
  ADD COLUMN IF NOT EXISTS created_by_agent_id uuid REFERENCES agents(id);

ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS created_by_agent_id uuid REFERENCES agents(id);

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS created_by_agent_id uuid REFERENCES agents(id);

CREATE INDEX IF NOT EXISTS idx_segments_owner
  ON segments (project_id, created_by_agent_id);

CREATE INDEX IF NOT EXISTS idx_flows_owner
  ON flows (project_id, created_by_agent_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_owner
  ON campaigns (project_id, created_by_agent_id);
