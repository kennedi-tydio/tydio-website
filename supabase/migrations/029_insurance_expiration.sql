-- ─────────────────────────────────────────────────────────
-- 029_insurance_expiration
--
-- Adds an 'expired' insurance status, set on the expiration date
-- the admin enters when approving a policy, and checks for it
-- hourly using the job runner from 027_scheduled_jobs.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles DROP CONSTRAINT IF EXISTS tidypro_profiles_insurance_status_check;
ALTER TABLE tidypro_profiles ADD CONSTRAINT tidypro_profiles_insurance_status_check
  CHECK (insurance_status IN ('pending', 'approved', 'denied', 'expired'));

SELECT cron.schedule('tydio-insurance-expirations', '0 * * * *', $$SELECT public.run_scheduled_job('/api/cron/insurance-expirations')$$);

NOTIFY pgrst, 'reload schema';
