-- ─────────────────────────────────────────────────────────
-- 017_background_check_fee
--
-- Tracks the Stripe Checkout payment a cleaner makes for their
-- own background check before being sent to Checkr's form.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_amount_cents integer;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_paid_at timestamptz;

NOTIFY pgrst, 'reload schema';
