-- ─────────────────────────────────────────────────────────
-- 012_bookings_messaging
--
-- Adds the columns needed to turn a confirmed booking_draft into
-- a real `bookings` row that can be displayed as a "Booking
-- Request" card in the customer's message thread with their
-- Tidy Pro: pets/notes carried over from the Review Your Request
-- screen, and a snapshot of scheduled_location (same shape as
-- booking_drafts.scheduled_location) so distance/address can be
-- rendered without re-deriving it later.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pets text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS scheduled_location jsonb;

NOTIFY pgrst, 'reload schema';
