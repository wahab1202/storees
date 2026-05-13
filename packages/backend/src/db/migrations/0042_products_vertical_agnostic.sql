-- 0042_products_vertical_agnostic.sql
--
-- Make the products table vertical-agnostic so the same schema fits banking
-- (loans, insurance, cards), edtech (courses, certifications), sporttech
-- (arenas, memberships), and any future vertical — not just e-commerce SKUs.
--
-- Strategy: one extension column (`attributes` JSONB) for vertical-specific
-- metadata + two columns for the universal "price + currency" pair that
-- every vertical has but the old schema treated as implicit from order
-- totals. Same pattern as customers.custom_attributes — domain registry
-- declares which JSONB keys are filterable per-vertical.
--
-- Examples by vertical:
--   E-commerce:  attributes = {}, product_type = "Audio"
--   Banking:     attributes = { apr_min: 10.5, apr_max: 18, max_amount: 500000 },
--                product_type = "personal_loan"
--   EdTech:      attributes = { instructor: "Priya", duration_weeks: 8, level: "beginner" },
--                product_type = "course"
--   SportTech:   attributes = { capacity: 22, sport: "football", city: "Chennai" },
--                product_type = "arena"
--
-- Not renaming shopify_product_id → external_id in this migration. The name
-- is historical but semantically fine (it stores any external id, not just
-- Shopify's). Rename can be a follow-up if/when needed.

ALTER TABLE products
  ADD COLUMN attributes JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN base_price NUMERIC(12, 2),
  ADD COLUMN currency   VARCHAR(3);

-- GIN index on attributes for JSONB containment queries
-- ("products where attributes @> {level: 'beginner'}"). Cheap on a catalogue
-- of even 100K products. Lets segment filters on attribute fields stay fast.
CREATE INDEX idx_products_attributes ON products USING GIN (attributes);
