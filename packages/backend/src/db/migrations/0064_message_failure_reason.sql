-- Store the provider/webhook error text on a failed send so the UI can show WHY
-- it failed (e.g. Meta "131026 recipient not on WhatsApp") instead of a bare
-- "Failed". On both the unified messages table and the campaign-recipients table.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS failure_reason text;
