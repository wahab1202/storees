-- 0047_segment_reachable_count.sql
--
-- Gap 13: surface a second count on each segment alongside member_count.
-- reachable_count = customers who match the filter AND are reachable on
-- at least one channel (email_subscribed + email present, OR sms
-- subscribed + phone, OR any phone for WhatsApp).
--
-- Critical for accurate campaign sizing — "send to 10K dormant users"
-- often quietly means only 4-5K can actually be reached after consent
-- + identifier presence is factored in. Showing both numbers on the
-- segments list prevents the marketer from over-promising deliverable
-- volume.

ALTER TABLE segments
  ADD COLUMN IF NOT EXISTS reachable_count INTEGER NOT NULL DEFAULT 0;
