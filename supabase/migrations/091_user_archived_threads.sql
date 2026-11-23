-- ─────────────────────────────────────────────────────────
-- 091_user_archived_threads
--
-- A customer can archive a booking's message thread from the
-- Messages page (app/dashboard/messages). user_archived_at is when
-- they did; null when they haven't (or they unarchived it).
--
-- A newer message or added-task update after it brings the thread
-- back to the inbox, so nothing new is missed. Completed, declined
-- and canceled bookings go to Archived on their own, whatever this
-- column holds.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_archived_at timestamptz;

NOTIFY pgrst, 'reload schema';
