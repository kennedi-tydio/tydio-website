-- ─────────────────────────────────────────────────────────
-- 068_booking_schedule_ranges
--
-- Customers can search for a booking with a date range
-- ("Nov 20 – Nov 25") and a start-time window ("starting
-- between 9:00 AM and 1:00 PM"), not only one date and time.
-- scheduled_date / scheduled_time hold the start of each
-- range and these hold the end; null means a single date or
-- time, as before. Once the customer picks a Tidy Pro's
-- exact start time, the draft is set to it and the ends are
-- cleared, so bookings still get one date and time.
--
-- unmet_booking_searches keeps the range too, so the later
-- check against a new Tidy Pro searches the same range.
-- See lib/bookingSlots.ts.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS scheduled_end_date date;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS scheduled_end_time text;

ALTER TABLE unmet_booking_searches ADD COLUMN IF NOT EXISTS scheduled_end_date date;
ALTER TABLE unmet_booking_searches ADD COLUMN IF NOT EXISTS scheduled_end_time text;

NOTIFY pgrst, 'reload schema';
