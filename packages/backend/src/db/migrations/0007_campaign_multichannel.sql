-- Add multi-channel and periodic delivery support to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'email';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20) NOT NULL DEFAULT 'one-time';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS body_text TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS periodic_schedule JSONB;

-- Make subject and html_body nullable (SMS/Push don't require them)
ALTER TABLE campaigns ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE campaigns ALTER COLUMN html_body DROP NOT NULL;
