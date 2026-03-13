-- Add MoEngage-style campaign creation fields
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) NOT NULL DEFAULT 'promotional';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS preview_text VARCHAR(500);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS conversion_goals JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS goal_tracking_hours INTEGER NOT NULL DEFAULT 36;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS delivery_limit INTEGER;
