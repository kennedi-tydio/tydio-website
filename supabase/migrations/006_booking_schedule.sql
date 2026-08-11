-- ─────────────────────────────────────────────────────────
-- 006_booking_schedule
--
-- Adds scheduling fields to booking_drafts (location, date,
-- time) for the post-pricing scheduling step.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS scheduled_location jsonb;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS scheduled_date date;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS scheduled_time text;
