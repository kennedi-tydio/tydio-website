-- ─────────────────────────────────────────────────────────
-- 039_rate_limits
--
-- One row per attempt that counts toward a limit (a failed login, a
-- password reset email, ...), keyed like 'login:email:<address>' or
-- 'signup:ip:<address>'. lib/rateLimit.ts counts recent rows for a key.
-- Rows older than a day are no use to any limit and are cleared hourly.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_events_key_created_at_idx ON rate_limit_events (key, created_at);

-- Server-only, like every other table since 038.
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limit_events FROM anon, authenticated;
GRANT ALL ON rate_limit_events TO service_role;

SELECT cron.unschedule('tydio-clear-rate-limit-events')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tydio-clear-rate-limit-events');
SELECT cron.schedule(
  'tydio-clear-rate-limit-events',
  '17 * * * *',
  $$DELETE FROM public.rate_limit_events WHERE created_at < now() - interval '1 day'$$
);

NOTIFY pgrst, 'reload schema';
