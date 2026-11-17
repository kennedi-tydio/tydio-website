-- 080_recurring_skipped_dates
--
-- Canceling one visit of a recurring booking that isn't booked yet (visits are booked a
-- week ahead): the date goes here, and the recurring job skips it instead of booking it.
-- The job removes a date once it has passed over it. See lib/recurringOccurrences.ts.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE recurring_bookings
  ADD COLUMN IF NOT EXISTS skipped_dates date[] NOT NULL DEFAULT '{}';
