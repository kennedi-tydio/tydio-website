-- ─────────────────────────────────────────────────────────
-- 028_draft_any_day
--
-- A draft with no date could mean "nothing chosen yet", which
-- defaults to today, or a deliberate "Any day", which shows every
-- cleaner in range. This records which one it is.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS any_day_selected boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
