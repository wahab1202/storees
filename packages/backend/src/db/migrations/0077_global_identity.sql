-- Cross-brand recognition network (Phase 2, step 2d-1). Storees-OWNED and
-- cross-tenant BY DESIGN: global_identities/_keys span brands. Identity-only —
-- NO orders/events/spend live here. A brand only ever reads its own row in
-- global_identity_links (scoped by project_id). OFF by default (ENABLE_CROSS_BRAND).

CREATE TABLE IF NOT EXISTS global_identities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Deterministic keys that resolve to a person. PII stored hash-only.
CREATE TABLE IF NOT EXISTS global_identity_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_type     varchar(20) NOT NULL,   -- 'phone' | 'email' | 'device_sig' (fork B)
  key_hash     varchar(64) NOT NULL,
  global_id    uuid NOT NULL REFERENCES global_identities(id) ON DELETE CASCADE,
  consent_at   timestamptz,
  withdrawn_at timestamptz,             -- withdrawal removes recognition network-wide
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_identity_keys_unique ON global_identity_keys (key_type, key_hash);
CREATE INDEX IF NOT EXISTS idx_global_identity_keys_global ON global_identity_keys (global_id);

-- Which per-brand customer a person maps to. project_id scopes brand access.
CREATE TABLE IF NOT EXISTS global_identity_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_id   uuid NOT NULL REFERENCES global_identities(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  linked_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_identity_links_unique ON global_identity_links (global_id, project_id);
CREATE INDEX IF NOT EXISTS idx_global_identity_links_project ON global_identity_links (project_id, customer_id);
