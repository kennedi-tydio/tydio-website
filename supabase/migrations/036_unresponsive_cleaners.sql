-- ─────────────────────────────────────────────────────────
-- 036_unresponsive_cleaners
--
-- Records when a cleaner was reminded to tap "I'm on the way" at a
-- booking's start time, and when the admin was alerted that they
-- still hadn't 15 minutes later, so each only goes out once. Checks
-- every minute using the job runner from 027_scheduled_jobs.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS on_the_way_reminder_sent_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS unresponsive_alert_sent_at timestamptz;

SELECT cron.schedule('tydio-unresponsive-cleaners', '* * * * *', $$SELECT public.run_scheduled_job('/api/cron/unresponsive-cleaners')$$);

NOTIFY pgrst, 'reload schema';
