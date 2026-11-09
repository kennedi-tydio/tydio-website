-- ─────────────────────────────────────────────────────────
-- 056_tidypro_time_off
--
-- Dates a Tidy Pro has marked themselves unavailable, on top
-- of their weekly hours: a list of { start, end } ranges as
-- "YYYY-MM-DD", whole days unless they also carry startTime
-- and endTime ("HH:MM") (see lib/timeOff.ts).
-- They don't show up in search for those dates, and customers
-- can't pick them on the calendar.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS time_off jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
