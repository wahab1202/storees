-- GowelMart-specific: promote dealer_id from custom_attributes into
--   (a) agents rows (one per unique dealer per project)
--   (b) customers.agent_id + customers.region + customers.city
--
-- Idempotent: re-running is safe; ON CONFLICT DO NOTHING for agents and
-- WHERE agent_id IS NULL for customers update.
--
-- Run AFTER migration 0012_agents_rbac.sql has applied.
-- Client-specific; NOT part of the automatic migration sequence.

BEGIN;

-- 1. Seed agents from every distinct non-empty dealer_id seen in GowelMart imports
INSERT INTO agents (project_id, external_dealer_id, name)
SELECT DISTINCT
  c.project_id,
  c.custom_attributes->>'dealer_id' AS external_dealer_id,
  COALESCE(
    NULLIF(c.custom_attributes->>'company', ''),
    'Dealer ' || (c.custom_attributes->>'dealer_id')
  ) AS name
FROM customers c
WHERE c.custom_attributes->>'_source' = 'gowelmart_import'
  AND COALESCE(c.custom_attributes->>'dealer_id', '') <> ''
ON CONFLICT (project_id, external_dealer_id) DO NOTHING;

-- 1b. Repair agent names from order events. The customer-attribute path
-- above stamps each agent with the CUSTOMER's shop name (the retail outlet
-- placing the order), not the wholesale dealer. The canonical dealer name
-- lives in events.properties.dealer.name (e.g. "MADURAI GWM"). Latest event
-- wins per dealer; idempotent (skip rows where name is already correct).
UPDATE agents a
SET
  name       = ed.evt_name,
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (e.properties->'dealer'->>'id')
    e.properties->'dealer'->>'id'   AS ext_id,
    e.properties->'dealer'->>'name' AS evt_name
  FROM events e
  WHERE e.event_name = 'order_completed'
    AND NULLIF(e.properties->'dealer'->>'id', '')   IS NOT NULL
    AND NULLIF(e.properties->'dealer'->>'name', '') IS NOT NULL
  ORDER BY e.properties->'dealer'->>'id', e.timestamp DESC
) ed
WHERE a.external_dealer_id = ed.ext_id
  AND a.name IS DISTINCT FROM ed.evt_name;

-- 2. Link customers to agents + hoist region/city from custom_attributes
UPDATE customers c
SET
  agent_id = a.id,
  city = NULLIF(c.custom_attributes->>'postal_code', ''),  -- GowelMart stores city here
  region = NULLIF(c.custom_attributes->>'country', ''),
  updated_at = NOW()
FROM agents a
WHERE a.project_id = c.project_id
  AND a.external_dealer_id = c.custom_attributes->>'dealer_id'
  AND c.custom_attributes->>'_source' = 'gowelmart_import'
  AND c.agent_id IS NULL;

-- 3. Flip the feature flag on for any project that got agents seeded
UPDATE projects p
SET features = features || '{"agentScopedAccess": true}'::jsonb
WHERE EXISTS (SELECT 1 FROM agents a WHERE a.project_id = p.id)
  AND NOT (features ? 'agentScopedAccess');

COMMIT;

-- Verification queries (run manually after):
--   SELECT project_id, COUNT(*) FROM agents GROUP BY project_id;
--   SELECT COUNT(*) FILTER (WHERE agent_id IS NOT NULL) AS linked,
--          COUNT(*) FILTER (WHERE agent_id IS NULL) AS unlinked
--     FROM customers
--     WHERE custom_attributes->>'_source' = 'gowelmart_import';
