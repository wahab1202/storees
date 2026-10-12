-- 0087: Brand kit (Email Engine Step 2).
--
-- Stores the store's visual identity (logo, colours, slogan, font) pulled from
-- the connected Shopify store's brand settings. Applied to emails automatically
-- via brand_* template tokens. Nullable + additive: NULL means "no brand kit
-- synced yet", and every template falls back to neutral defaults, so existing
-- projects are unaffected. No backfill.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_kit jsonb;
