-- ─────────────────────────────────────────────────────────
-- 021_background_check_manual_flow
--
-- Background checks are now run by hand from the provider's
-- dashboard, with each step recorded in Tydio: when the cleaner
-- paid or asked for one, and when their form was sent to them.
-- Apply after 017–020.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS requested_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS link_sent_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS background_check_link text;

UPDATE background_checks
SET requested_at = fee_paid_at
WHERE requested_at IS NULL AND fee_paid_at IS NOT NULL AND fee_refunded_at IS NULL;

NOTIFY pgrst, 'reload schema';
