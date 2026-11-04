-- ─────────────────────────────────────────────────────────
-- 027_scheduled_jobs
--
-- Runs the app's scheduled jobs from the database, so they don't
-- depend on any outside scheduler.
--   expire-booking-requests: every minute, since a booking should
--     cancel right at its cutoff, an hour before it starts
--   booking-reminders: every 5 minutes, for its 10-minute window
--
-- The job's address and shared secret are read from Vault, so
-- neither is stored in this file or visible in the jobs list. Until
-- the live address is set, the jobs run and do nothing:
--
--   select vault.create_secret('https://your-domain', 'tydio_site_url');
--
-- CRON_SECRET goes in the same way, as 'tydio_cron_secret', and
-- must match the value the site itself has.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.run_scheduled_job(job_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  site_url text;
  cron_secret text;
BEGIN
  SELECT decrypted_secret INTO site_url FROM vault.decrypted_secrets WHERE name = 'tydio_site_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret FROM vault.decrypted_secrets WHERE name = 'tydio_cron_secret' LIMIT 1;

  IF site_url IS NULL OR cron_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_get(
    url := rtrim(site_url, '/') || job_path,
    headers := jsonb_build_object('x-cron-secret', cron_secret),
    timeout_milliseconds := 60000
  );
END;
$$;

-- Not callable from the browser's public API, only by the scheduler.
REVOKE ALL ON FUNCTION public.run_scheduled_job(text) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('tydio-expire-booking-requests', '* * * * *', $$SELECT public.run_scheduled_job('/api/cron/expire-booking-requests')$$);
SELECT cron.schedule('tydio-booking-reminders', '*/5 * * * *', $$SELECT public.run_scheduled_job('/api/cron/booking-reminders')$$);
