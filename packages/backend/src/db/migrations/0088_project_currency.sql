-- 0088: Per-project currency (Email Engine — multi-currency money formatting).
--
-- Money in emails (product prices, cart totals, {{...|money}} variables) was
-- hardcoded to ₹. This stores the project's ISO-4217 currency so the formatter
-- renders the right symbol/grouping via Intl. Additive, NOT NULL with a default,
-- so every existing project keeps ₹ behaviour until changed. No backfill needed.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'INR';
