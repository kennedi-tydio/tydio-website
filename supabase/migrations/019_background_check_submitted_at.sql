-- ─────────────────────────────────────────────────────────
-- 019_background_check_submitted_at
--
-- Records when a cleaner submitted Checkr's form, alongside the
-- existing completed_at for when the result came back. Rows
-- that already have a report are backfilled from their last
-- update, the closest time available.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

UPDATE background_checks
SET submitted_at = updated_at
WHERE submitted_at IS NULL AND report_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
