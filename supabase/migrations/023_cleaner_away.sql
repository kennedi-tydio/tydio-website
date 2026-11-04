-- ─────────────────────────────────────────────────────────
-- 023_cleaner_away
--
-- Lets a Tidy Pro mark themselves away. While set, they don't
-- appear in search and can't receive new booking requests.
-- Their saved availability is left untouched.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS is_away boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
