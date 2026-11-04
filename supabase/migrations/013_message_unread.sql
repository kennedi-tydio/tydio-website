-- ─────────────────────────────────────────────────────────
-- 013_message_unread
--
-- Tracks, per side of a booking's message thread, whether that
-- side has an update they haven't seen yet — shown as a teal dot
-- on the Messages list. Set true by whichever action produces a
-- new message bubble for the *other* side (request created,
-- accepted/declined, cancelled), and cleared when that side opens
-- the thread.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_unread boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tidy_pro_unread boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
