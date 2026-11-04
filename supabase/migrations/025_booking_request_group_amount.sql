-- ─────────────────────────────────────────────────────────
-- 025_booking_request_group_amount
--
-- Replacement requests carry over the customer's original
-- payment rather than placing a card hold, so the amount is
-- simply what they paid.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE booking_request_groups RENAME COLUMN hold_amount_cents TO amount_cents;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
