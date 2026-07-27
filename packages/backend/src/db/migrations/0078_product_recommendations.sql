-- Cross-sell / recommendation pairing config (Decisioning Step 1). Merchant-
-- defined "when a customer's context is X, recommend product Y" rules, matched
-- on a specific product, a product_type, or a collection. Powers dynamic
-- content in flows AND (later) onsite storefront personalization — one brain.
CREATE TABLE IF NOT EXISTS product_recommendations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  match_type           varchar(20) NOT NULL,   -- 'product' | 'product_type' | 'collection'
  match_value          varchar(255) NOT NULL,  -- external product id / product_type / collection name
  recommend_product_id varchar(255) NOT NULL,  -- external product id (products.shopify_product_id) to recommend
  rank                 integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_recs_unique
  ON product_recommendations (project_id, match_type, match_value, recommend_product_id);
CREATE INDEX IF NOT EXISTS idx_product_recs_match
  ON product_recommendations (project_id, match_type, match_value, rank);
