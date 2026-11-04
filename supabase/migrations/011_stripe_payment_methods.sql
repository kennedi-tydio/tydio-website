-- ─────────────────────────────────────────────────────────
-- 011_stripe_payment_methods
--
-- Replaces the manual card-entry placeholder with real Stripe
-- Connect wiring: each profile gets a Stripe Customer, and each
-- saved card is backed by a real Stripe PaymentMethod (created
-- via SetupIntent + the Payment Element — no raw PAN ever
-- touches our server).
--
-- Column names (card_brand/card_last4/card_exp_month/card_exp_year,
-- stripe_payment_method_id) match what the app code in
-- app/dashboard/profile/payment-methods/actions.ts actually
-- reads and writes.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;

ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS stripe_payment_method_id text;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_brand text;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_last4 text;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_exp_month integer;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_exp_year integer;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$ BEGIN
  ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_stripe_payment_method_id_key UNIQUE (stripe_payment_method_id);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS payment_methods_user_id_idx ON payment_methods (user_id);
CREATE INDEX IF NOT EXISTS payment_methods_default_idx ON payment_methods (user_id, is_default) WHERE is_default = true;

NOTIFY pgrst, 'reload schema';
