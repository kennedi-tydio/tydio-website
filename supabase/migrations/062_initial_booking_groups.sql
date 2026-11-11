-- ─────────────────────────────────────────────────────────
-- 062_initial_booking_groups
--
-- A customer can now ask up to 3 Tidy Pros when they first book,
-- not only as replacements after a decline. Those requests share
-- one payment in a request group, exactly like replacements, and
-- the first to accept gets the booking (accept_booking_request
-- already guarantees only one can).
--
-- An initial group has no original booking: every request in it is
-- a member. primary_booking_id is the request to the customer's
-- first choice, and it's the one the customer follows the outcome
-- on if nobody accepts (see lib/bookingRequestGroups).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE booking_request_groups ALTER COLUMN original_booking_id DROP NOT NULL;
ALTER TABLE booking_request_groups ADD COLUMN IF NOT EXISTS primary_booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
