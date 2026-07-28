-- Storees-provisioned WhatsApp onboarding (ops-assisted, KwikEngage-style).
-- When a brand has no WhatsApp provider, the onboarding team provisions a WABA
-- for them: the brand/ops fills a form (a phone number NOT already on any Meta
-- business account + business details + logo), the team creates the WABA on the
-- Meta side out-of-band, then records the resulting ids/token to link it. This
-- table is the intake + provisioning lifecycle BEFORE credentials exist. One
-- request per project.
CREATE TABLE IF NOT EXISTS whatsapp_provisioning_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- submitted -> provisioning -> active | error (| cancelled)
  status            varchar(20) NOT NULL DEFAULT 'submitted',
  requested_number  varchar(30),                   -- desired sending number (fresh, not on any Meta business acct)
  business_name     varchar(200),                  -- intended display / verified name
  category          varchar(60),                   -- business vertical
  address           text,
  website           varchar(300),
  about             text,                           -- business description
  logo_url          text,                           -- brand logo (set as WABA avatar in Phase 3)
  contact_name      varchar(120),
  contact_email     varchar(200),
  notes             text,                           -- brand-supplied notes
  ops_notes         text,                           -- internal onboarding-team notes
  assigned_to       uuid,                           -- admin user handling it
  phone_number_id   varchar(255),                   -- filled when the created WABA is linked
  waba_id           varchar(255),
  error_reason      text,
  submitted_at      timestamptz NOT NULL DEFAULT NOW(),
  provisioned_at    timestamptz,                    -- when it went active
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);

-- One provisioning request per project (upsert on resubmit).
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_provisioning_project
  ON whatsapp_provisioning_requests (project_id);

-- Ops queue ordering by status + recency.
CREATE INDEX IF NOT EXISTS idx_wa_provisioning_status
  ON whatsapp_provisioning_requests (status, submitted_at);
