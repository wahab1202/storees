-- 0019_ctwa_attribution.sql
-- Phase F2a — CTWA (Click-to-WhatsApp) campaign attribution.
--
-- When a user taps a Meta CTWA ad and sends their first WhatsApp message,
-- the inbound webhook payload includes a `referral` object with the ad id,
-- campaign id, headline, source URL, and a unique click token (ctwa_clid).
-- This is the merchant's primary growth signal — every CTWA click that
-- becomes a conversation is a list addition + attribution row.
--
-- One row per (project, customer, ad). A customer who clicks the same ad
-- multiple times produces one attribution; clicking a *different* ad later
-- produces a second row (different ad_id, second touchpoint).
--
-- ctwa_clid is recorded but NOT in the unique key — the same user clicking
-- the same ad twice in a session produces two clids, but should still
-- collapse to one attribution row. Save the latest clid for conversion
-- attribution.

CREATE TABLE IF NOT EXISTS ctwa_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Meta ad identifiers
  ad_id VARCHAR(255) NOT NULL,                    -- Meta's source_id (creative or campaign id depending on level)
  source_type VARCHAR(40),                        -- 'ad' | 'post' (Meta's source_type)
  source_url VARCHAR(2048),                       -- the fb.me/... short URL the user tapped
  source_id VARCHAR(255),                         -- raw source_id from referral (often = ad_id, kept verbatim)
  headline VARCHAR(512),                          -- ad headline shown to user
  body TEXT,                                      -- ad body
  media_type VARCHAR(40),                         -- 'image' | 'video'
  image_url VARCHAR(2048),                        -- ad creative image url
  ctwa_clid VARCHAR(255),                         -- unique click token; updated on repeat clicks

  -- Conversion timeline (lead → conversation → purchase)
  first_inbound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_inbound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inbound_count INTEGER NOT NULL DEFAULT 1,
  first_purchase_at TIMESTAMPTZ,                  -- updated by orderService when an order is attributed back
  attributed_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ctwa_attributions_unique
  ON ctwa_attributions (project_id, customer_id, ad_id);

-- Reporting indexes
CREATE INDEX idx_ctwa_attributions_project_ad
  ON ctwa_attributions (project_id, ad_id, first_inbound_at);

CREATE INDEX idx_ctwa_attributions_clid
  ON ctwa_attributions (ctwa_clid)
  WHERE ctwa_clid IS NOT NULL;
