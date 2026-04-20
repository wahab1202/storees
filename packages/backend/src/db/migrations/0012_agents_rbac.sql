-- Agents (B2B distributors / regional reps) and sub-admin RBAC.
-- Opt-in per project via projects.features.agentScopedAccess.

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  external_dealer_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  region VARCHAR(64),
  city VARCHAR(128),
  manager_id UUID REFERENCES agents(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_dealer ON agents(project_id, external_dealer_id);
CREATE INDEX IF NOT EXISTS idx_agents_manager ON agents(manager_id);
CREATE INDEX IF NOT EXISTS idx_agents_region ON agents(project_id, region);

-- Promote B2B mapping columns onto customers. Safe additive migration.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS region VARCHAR(64);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_customers_agent ON customers(project_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(project_id, region);

-- Sub-admin scoping. role already exists; semantics widened to
-- 'admin' | 'manager' | 'agent'. agent_id is required when role != 'admin'.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id);
CREATE INDEX IF NOT EXISTS idx_admin_users_agent ON admin_users(agent_id);

-- Per-project feature flags. agent-rbac is off by default on existing projects.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}';
