-- 0016_email_rate_limit.sql
-- Phase E3.1 — per-tenant rate budget for email sends.
--
-- Without this, a single client's high-volume Black Friday campaign
-- consumes all queue throughput and starves every other tenant. The
-- delivery worker checks this column before each email send and reschedules
-- the job into the next-minute window if the project is over budget.
--
-- Default 60/min: conservative, suitable for new domains pre-warming.
-- Admins raise this from Settings → Project for high-volume tenants once
-- their Resend domain is verified and warming complete.

ALTER TABLE projects
  ADD COLUMN email_rate_per_minute INTEGER NOT NULL DEFAULT 60;
