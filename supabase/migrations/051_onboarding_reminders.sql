-- ─────────────────────────────────────────────────────────
-- 051_onboarding_reminders
--
-- Records when a cleaner who hadn't finished onboarding was
-- emailed at 3 days and at 7 days (the 7-day one also emails the
-- admin), so each goes out once. Checked daily at 15:00 UTC
-- (10am Eastern) using the job runner from 027_scheduled_jobs.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS onboarding_reminder_sent_at timestamptz;
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS onboarding_final_reminder_sent_at timestamptz;

SELECT cron.schedule('tydio-onboarding-reminders', '0 15 * * *', $$SELECT public.run_scheduled_job('/api/cron/onboarding-reminders')$$);

NOTIFY pgrst, 'reload schema';
