-- 0090: WhatsApp outbound messages (support inbox).
--
-- Stores every message WE send on WhatsApp outside the template/campaign path:
-- chatbot auto-replies and human agent replies from the inbox. Paired with
-- whatsapp_inbound_messages, this gives a complete two-sided conversation thread.

CREATE TABLE IF NOT EXISTS whatsapp_outbound_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id         uuid REFERENCES customers(id) ON DELETE SET NULL,
  phone               varchar(50) NOT NULL,
  content             text NOT NULL,
  -- 'bot' = chatbot auto-reply · 'agent' = human reply from the inbox
  sent_by             varchar(10) NOT NULL,
  agent_user_id       uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  provider_message_id varchar(255),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_outbound_phone ON whatsapp_outbound_messages (project_id, phone, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_outbound_customer ON whatsapp_outbound_messages (project_id, customer_id, created_at);
