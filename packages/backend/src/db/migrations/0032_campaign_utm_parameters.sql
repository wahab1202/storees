-- Phase 4: per-campaign UTM/link personalization settings.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS utm_parameters JSONB;
