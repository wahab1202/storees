-- 0089: WhatsApp chatbot conversation state (AI WhatsApp Chatbot).
--
-- One row per (project, phone): the bot/human state machine. `status` gates the
-- auto-responder — once a conversation is handed to a human (or closed) the bot
-- stops replying until it reopens. bot_turns bounds runaway loops.

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  phone          varchar(50) NOT NULL,
  -- 'bot' = auto-responding · 'human' = handed off · 'closed' = resolved/ended
  status         varchar(20) NOT NULL DEFAULT 'bot',
  bot_turns      integer NOT NULL DEFAULT 0,
  last_inbound_at timestamptz,
  last_bot_at    timestamptz,
  handoff_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_convos_project_phone ON whatsapp_conversations (project_id, phone);
CREATE INDEX IF NOT EXISTS idx_wa_convos_status ON whatsapp_conversations (project_id, status, updated_at);
