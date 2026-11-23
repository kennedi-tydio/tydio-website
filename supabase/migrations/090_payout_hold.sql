-- ─────────────────────────────────────────────────────────
-- 090_payout_hold
--
-- A completed booking's payout is held for 24 hours after the
-- Tidy Pro marks it complete (lib/payoutHold.ts), so a customer who
-- escalates can be refunded before the money leaves Tydio. The
-- scheduled job sends it once the hold is up.
--
-- payout_adjusted_at: when the admin set the Tidy Pro's payout while
--   refunding the booking (a completed booking's refund, or an admin
--   cancellation that still pays the Tidy Pro). cleaner_pay then holds
--   the amount the admin chose, and it's paid straight away: the
--   review the hold waits for has happened.
-- stripe_transfer_reversal_id: when the payout had already gone out,
--   the reversal that took back the part the admin removed.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payout_adjusted_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_transfer_reversal_id text;

-- The scheduled job looks for completed bookings whose hold is up and
-- that haven't been paid.
CREATE INDEX IF NOT EXISTS bookings_completed_unpaid_idx
  ON bookings (cleaner_marked_complete_at)
  WHERE status = 'completed' AND stripe_transfer_id IS NULL;
