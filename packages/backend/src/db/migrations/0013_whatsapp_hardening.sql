-- WhatsApp hardening: approved templates + inbound messages
-- Adds tables for native WhatsApp template send (HSM) and capturing customer replies.
-- No destructive ops; all CREATE IF NOT EXISTS / ALTER ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL,                         -- 'meta' | 'gupshup' | 'twilio' | 'bird' | 'vonage'
  provider_template_id VARCHAR(255) NOT NULL,            -- Meta: template name; Gupshup: id; Twilio: ContentSid
  name VARCHAR(255) NOT NULL,                            -- human-readable identifier (Meta uses name = id)
  language VARCHAR(20) NOT NULL,                         -- e.g. 'en_US', 'en'
  category VARCHAR(50),                                  -- 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',         -- 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED'
  body_text TEXT NOT NULL,
  header JSONB,                                          -- { type: 'TEXT'|'IMAGE'|'VIDEO'|'DOCUMENT', text? }
  footer TEXT,
  buttons JSONB,                                         -- array of { type, text, url? } or quick reply objects
  parameter_count INTEGER NOT NULL DEFAULT 0,            -- number of {{1}} {{2}} slots in body
  raw_payload JSONB,                                     -- original provider response for debugging
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_templates_unique ON whatsapp_templates (project_id, provider, name, language);
CREATE INDEX IF NOT EXISTS idx_wa_templates_status ON whatsapp_templates (project_id, status);

CREATE TABLE IF NOT EXISTS whatsapp_inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,  -- nullable until matched by phone
  from_phone VARCHAR(50) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  provider_message_id VARCHAR(255) NOT NULL,
  content TEXT,                                          -- text body if any
  media_url TEXT,                                        -- presigned media URL (provider-hosted)
  media_type VARCHAR(50),                                -- 'image' | 'video' | 'audio' | 'document' | 'sticker'
  reply_to VARCHAR(255),                                 -- providerMessageId of the message this replies to (if any)
  raw_payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_inbound_idem ON whatsapp_inbound_messages (provider, provider_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_inbound_customer ON whatsapp_inbound_messages (project_id, customer_id, received_at);
CREATE INDEX IF NOT EXISTS idx_wa_inbound_phone ON whatsapp_inbound_messages (project_id, from_phone, received_at);

-- Per-provider opt-in attribution on consents (which provider observed the opt-in/out)
ALTER TABLE consents ADD COLUMN IF NOT EXISTS provider VARCHAR(30);
