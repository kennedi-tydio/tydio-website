-- ─────────────────────────────────────────────────────────
-- 096_manual_payout_hold
--
-- Replaces 090's automatic 24-hour payout hold with a manual one.
-- A Tidy Pro is paid as soon as a booking completes, unless the
-- admin has put its payout on hold (lib/payoutHold.ts), e.g. while
-- reviewing a customer's complaint. Nothing is sent while
-- payout_held_at is set; the admin releases it with Pay Tidy Pro, or
-- settles it with a refund that sets the payout.
--
-- payout_held_at:   when the admin put the payout on hold.
-- payout_hold_note: why, for the admin.
--
-- 090's columns (payout_adjusted_at, stripe_transfer_reversal_id)
-- stay in use. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payout_held_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payout_hold_note text;
