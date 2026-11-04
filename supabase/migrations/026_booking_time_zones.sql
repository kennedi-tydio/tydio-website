-- ─────────────────────────────────────────────────────────
-- 026_booking_time_zones
--
-- A booking's date and time are the customer's local time, and
-- this records which zone that is. Existing bookings are all
-- Georgia, so they take the Eastern default. A cleaner's own
-- zone comes from their device, for showing them bookings in
-- their own time.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'America/New_York';
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS time_zone text;

NOTIFY pgrst, 'reload schema';
