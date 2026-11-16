-- ─────────────────────────────────────────────────────────
-- 077_recurring_visit_payments
--
-- A Tidy Pro accepting a recurring booking's first visit
-- accepts the whole series. From then on each next visit is
-- put on their schedule already accepted, and the customer's
-- card is charged 3 days before it instead of when it's
-- booked. See lib/recurringPayments.ts.
--
-- recurring_bookings.tidy_pro_accepted_at
--   When the series' Tidy Pro accepted it. Null until they
--   do, and again after the customer picks a new Tidy Pro or
--   the Tidy Pro drops the series; while null, visits are
--   charged when booked and sent as requests, as before.
--
-- bookings, for a visit put on the schedule unpaid:
--   amount_due              the price before the card fee
--   payment_due_at          when the card is first charged.
--                           Set only while unpaid; cleared,
--                           with amount_due, once it's paid.
--   payment_attempted_at    the last automatic try (retried
--                           every 24 hours)
--   payment_failed_at       the last failed try; the customer
--                           sees "Needs attention"
--   payment_error           why it failed, shown to them
--   suspended_for_payment_at  still unpaid 24 hours before the
--                           start: the Tidy Pro can't start
--                           it, and the customer must pay and
--                           pick a new date. Canceled at the
--                           original start if they don't.
--   auto_accepted           put on the schedule already
--                           accepted. Not a request the Tidy
--                           Pro answered, so it's left out of
--                           their acceptance rate (057).
--
-- bookings.incident_refund_level also allows 'minus_fee': a
--   customer's no-show report is now refunded on the spot, less
--   the processing fee (lib/bookingIncidents).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE recurring_bookings
  ADD COLUMN IF NOT EXISTS tidy_pro_accepted_at timestamptz;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS amount_due numeric(10, 2),
  ADD COLUMN IF NOT EXISTS payment_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_error text,
  ADD COLUMN IF NOT EXISTS suspended_for_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_accepted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS bookings_payment_due_idx
  ON bookings (payment_due_at)
  WHERE payment_due_at IS NOT NULL;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_incident_refund_level_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_incident_refund_level_check
  CHECK (incident_refund_level IN ('full', 'half', 'minus_fee', 'none'));

-- Same as 057, without visits nobody answered.
CREATE OR REPLACE VIEW tidypro_acceptance_stats
WITH (security_invoker = true) AS
SELECT
  tidy_pro_id,
  count(*) FILTER (WHERE decision_status = 'accepted')::int AS accepted_count,
  count(*) FILTER (WHERE decision_status = 'declined')::int AS declined_count
FROM bookings
WHERE tidy_pro_id IS NOT NULL
  AND decision_status IN ('accepted', 'declined')
  AND NOT auto_accepted
GROUP BY tidy_pro_id;

REVOKE ALL ON tidypro_acceptance_stats FROM anon, authenticated;
GRANT SELECT ON tidypro_acceptance_stats TO service_role;

NOTIFY pgrst, 'reload schema';
