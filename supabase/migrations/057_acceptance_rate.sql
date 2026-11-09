-- ─────────────────────────────────────────────────────────
-- 057_acceptance_rate
--
-- A Tidy Pro's acceptance rate: of the booking requests they
-- answered, how many they accepted (see lib/acceptanceRate.ts).
-- Only their own answers count, so a request that expired, was
-- canceled by the customer, or was taken by another cleaner
-- first isn't held against them. A booking they accepted and
-- later canceled keeps decision_status 'accepted'.
--
-- low_acceptance_alerted_at records when they and the admin
-- were emailed that the rate fell below 80%. It's cleared once
-- the rate is back up, so each dip is emailed once.
--
-- The view is read with the service role only.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS low_acceptance_alerted_at timestamptz;

CREATE OR REPLACE VIEW tidypro_acceptance_stats
WITH (security_invoker = true) AS
SELECT
  tidy_pro_id,
  count(*) FILTER (WHERE decision_status = 'accepted')::int AS accepted_count,
  count(*) FILTER (WHERE decision_status = 'declined')::int AS declined_count
FROM bookings
WHERE tidy_pro_id IS NOT NULL
  AND decision_status IN ('accepted', 'declined')
GROUP BY tidy_pro_id;

REVOKE ALL ON tidypro_acceptance_stats FROM anon, authenticated;
GRANT SELECT ON tidypro_acceptance_stats TO service_role;

NOTIFY pgrst, 'reload schema';
