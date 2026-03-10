-- Products catalog synced from Shopify
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  shopify_product_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  product_type VARCHAR(255) DEFAULT '',
  vendor VARCHAR(255) DEFAULT '',
  image_url VARCHAR(2048),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shopify ON products(project_id, shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_products_project ON products(project_id);

-- Collections (custom + smart) synced from Shopify
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  shopify_collection_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  collection_type VARCHAR(20) NOT NULL DEFAULT 'custom',
  image_url VARCHAR(2048),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_shopify ON collections(project_id, shopify_collection_id);
CREATE INDEX IF NOT EXISTS idx_collections_project ON collections(project_id);

-- Junction table: which products belong to which collections
CREATE TABLE IF NOT EXISTS product_collections (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_collections_unique ON product_collections(product_id, collection_id);
CREATE INDEX IF NOT EXISTS idx_product_collections_collection ON product_collections(collection_id);
