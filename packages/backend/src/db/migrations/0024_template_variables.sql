-- 0024_template_variables.sql
-- Phase 0 of the campaign builder overhaul: per-template variable mapping.
--
-- Today, variable substitution is hardcoded to ~3 keys (customer_name,
-- customer_email, store_name). Every other {{whatever}} in a body silently
-- becomes empty string at send-time. This migration introduces the storage
-- layer for declaring "in this template, {{customer_name}} maps to
-- customer.name with default 'there'" — same shape used by Meta WhatsApp.
--
-- The shape (matches src/services/templateContext.ts):
--   variables: [
--     { key: 'customer_name', source: { kind: 'customer', field: 'name' },
--       defaultValue: 'there', format: null },
--     { key: 'order_number',  source: { kind: 'event', key: 'order_number' },
--       defaultValue: '' },
--     { key: 'last_order',    source: { kind: 'customer', field: 'last_order_date' },
--       format: 'date:MMM D' },
--     { key: 'discount_code', source: { kind: 'literal', value: 'WELCOME10' } },
--   ]
--
-- Default '[]' means existing rows upgrade with no behaviour change — the
-- legacy hardcoded substitution kicks in for unmapped keys until each
-- template is migrated explicitly through the new picker UI.

ALTER TABLE email_templates
  ADD COLUMN variables JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE campaigns
  ADD COLUMN variables JSONB NOT NULL DEFAULT '[]'::jsonb;
