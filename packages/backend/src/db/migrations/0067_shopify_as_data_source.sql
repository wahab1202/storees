-- Surface native Shopify connections as Data Source rows so they appear in the
-- project's Data Sources panel alongside connectors (VirpanAI etc.) with the
-- same status / sync-history / metrics / resync UI. Credentials + token stay on
-- the projects row (the shopify-sync worker reads them) — this row is the
-- display + sync-history shell, keyed by template='shopify'.
INSERT INTO data_source_connectors (project_id, template, name, base_url, auth_config, config, status)
SELECT p.id,
       'shopify',
       'Shopify · ' || p.shopify_domain,
       'https://' || p.shopify_domain,
       '',
       jsonb_build_object('shopifyDomain', p.shopify_domain),
       'active'
FROM projects p
WHERE p.shopify_domain IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM data_source_connectors c
    WHERE c.project_id = p.id AND c.template = 'shopify'
  );
