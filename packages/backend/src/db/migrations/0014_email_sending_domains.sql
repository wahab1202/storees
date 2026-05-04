-- 0014_email_sending_domains.sql
-- Phase E2.1 — per-tenant Resend sending domains.
--
-- Each project can register its own from-domain (e.g. mail.theirstore.com) so
-- DKIM/SPF/reputation accumulates against the tenant's own domain rather than
-- a single shared Storees domain. Without this, one client's bad list tanks
-- deliverability for every other tenant on the platform.
--
-- All columns are nullable; existing projects fall back to the shared
-- FROM_EMAIL env var (rate-capped — see resendProvider).

ALTER TABLE projects
  ADD COLUMN email_from_address VARCHAR(255),       -- e.g. 'noreply@mail.theirstore.com'
  ADD COLUMN email_from_name VARCHAR(255),          -- e.g. 'GowelMart'
  ADD COLUMN resend_domain_id VARCHAR(255),         -- Resend's domain id (returned by domains.create)
  ADD COLUMN email_domain_verified_at TIMESTAMPTZ;  -- set when Resend reports status='verified'

CREATE INDEX idx_projects_email_domain ON projects(resend_domain_id) WHERE resend_domain_id IS NOT NULL;
