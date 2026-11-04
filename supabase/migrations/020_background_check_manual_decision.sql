-- ─────────────────────────────────────────────────────────
-- 020_background_check_manual_decision
--
-- Records an admin's manual pass or reject of a background
-- check. Once set, later Checkr results are stored but no
-- longer change the outcome.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS manual_decision_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS manual_decision_note text;

NOTIFY pgrst, 'reload schema';
