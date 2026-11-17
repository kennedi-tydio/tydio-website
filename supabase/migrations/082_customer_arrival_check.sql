-- ─────────────────────────────────────────────────────────
-- 082_customer_arrival_check
--
-- 10 minutes after a booking's start, if the Tidy Pro still
-- hasn't marked themselves arrived, the customer is asked
-- whether they did: if not, tap "My Tidy Pro didn't show up";
-- if so, ask the Tidy Pro to open the app and mark it.
-- (lib/unresponsiveCleaners.ts, the every-minute
-- unresponsive-cleaners job.)
--
-- bookings.customer_arrival_check_sent_at: when that was sent,
-- so each booking asks only once. Cleared with the other
-- reminders when the start time changes.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_arrival_check_sent_at timestamptz;

NOTIFY pgrst, 'reload schema';
