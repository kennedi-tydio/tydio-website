-- ─────────────────────────────────────────────────────────
-- 018_background_check_fee_terms
--
-- Records a cleaner's acceptance of the background-screening
-- fee terms and any refund of that fee, plus a flag for an
-- adverse action notice Checkr couldn't deliver.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_terms_accepted_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_terms_amount_cents integer;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_refunded_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_refund_reason text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS stripe_refund_id text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS adverse_notice_undelivered_at timestamptz;

NOTIFY pgrst, 'reload schema';
