-- Phase 5: send-time options beyond ASAP/fixed.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS send_time_mode VARCHAR(32) NOT NULL DEFAULT 'asap';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS schedule_timezone VARCHAR(64);
