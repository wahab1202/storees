-- 0025_campaign_audience_v2.sql
--
-- Phase 1 — campaign builder overhaul, slice 1: audience model.
--
-- Today campaigns target audiences via a single `segment_id` FK. Two big gaps:
--   (a) you can't define an ad-hoc filter inside the campaign — must save a
--       segment first (round-trip back to the segment-builder UI)
--   (b) no audience cap, no control / holdout group
--
-- This migration adds the storage layer for all four:
--
--   tags                 — free-text labels for filtering campaign lists
--   audience_filter      — inline FilterConfig (same schema segments use).
--                          Mutually exclusive with segment_id; if both are set,
--                          audience_filter wins.
--   audience_cap         — optional max-recipient limit applied at staging
--   control_group_pct    — 0..50, % of audience held back as no-send "control"
--                          group for lift measurement. 0 = disabled.
--   control_group_seed   — random string set when control_group_pct > 0; lets
--                          the deterministic split be reproduced for audit.
--
-- + new `campaign_holdouts` table that records every customer who got the
-- control treatment for a campaign. Send pipeline INSERTs into this table
-- when a recipient is held back; analytics joins on it to compute lift.

ALTER TABLE campaigns
  ADD COLUMN tags                JSONB        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN audience_filter     JSONB,
  ADD COLUMN audience_cap        INTEGER,
  ADD COLUMN control_group_pct   INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN control_group_seed  VARCHAR(64);

-- Sanity bound — control group can't exceed 50% of audience (anything higher
-- defeats the point — you'd be testing 'send' as the experiment).
ALTER TABLE campaigns
  ADD CONSTRAINT chk_control_group_pct
  CHECK (control_group_pct >= 0 AND control_group_pct <= 50);

-- One row per (campaign, customer) where the customer got the control treatment.
-- Kept lean — analytics derives lift from this + the conversion-goals events.
CREATE TABLE campaign_holdouts (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id  UUID         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reason       VARCHAR(20)  NOT NULL DEFAULT 'control_group',  -- future: 'cap_exceeded' | 'frequency_cap' etc.
  recorded_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uniq_campaign_customer_holdout UNIQUE (campaign_id, customer_id)
);

CREATE INDEX idx_campaign_holdouts_campaign ON campaign_holdouts (campaign_id);
CREATE INDEX idx_campaign_holdouts_customer ON campaign_holdouts (customer_id);
