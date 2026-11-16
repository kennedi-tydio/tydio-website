-- ─────────────────────────────────────────────────────────
-- 069_recurring_bookings
--
-- A customer who picks a specific date can make the booking
-- recurring: every week, every 2 weeks or every 4 weeks. The
-- first visit is booked as usual; each next visit is booked for
-- them a week ahead with the same Tidy Pro, tasks, place, time
-- and card, by /api/cron/recurring-bookings (hourly). See
-- lib/recurringBookings.ts.
--
--   booking_drafts.recurrence_frequency  chosen while booking
--   recurring_bookings                   one row per series
--   bookings.recurring_booking_id        visits of a series
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE booking_drafts
  ADD COLUMN IF NOT EXISTS recurrence_frequency text
  CHECK (recurrence_frequency IN ('weekly', 'biweekly', 'every_4_weeks'));

CREATE TABLE IF NOT EXISTS recurring_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- The Tidy Pro each next visit goes to; the customer can change it.
  tidy_pro_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tidy_pro_name text,
  tidy_pro_photo_url text,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'every_4_weeks')),
  start_date date NOT NULL,
  -- The next visit not yet booked.
  next_date date NOT NULL,
  scheduled_time text NOT NULL,
  time_zone text NOT NULL DEFAULT 'America/New_York',
  scheduled_location jsonb,
  task_list jsonb NOT NULL DEFAULT '[]',
  notes text,
  entry_instructions text,
  will_provide_supplies boolean NOT NULL DEFAULT false,
  payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancelled_at timestamptz,
  -- Why the last visit couldn't be booked, if it couldn't.
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_bookings_user_idx ON recurring_bookings (user_id);
CREATE INDEX IF NOT EXISTS recurring_bookings_active_next_idx ON recurring_bookings (next_date) WHERE status = 'active';

ALTER TABLE recurring_bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS recurring_booking_id uuid REFERENCES recurring_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_recurring_booking_idx ON bookings (recurring_booking_id) WHERE recurring_booking_id IS NOT NULL;

-- Hourly, through the runner from 027_scheduled_jobs.
SELECT cron.unschedule('tydio-recurring-bookings')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tydio-recurring-bookings');
SELECT cron.schedule('tydio-recurring-bookings', '7 * * * *', $$SELECT public.run_scheduled_job('/api/cron/recurring-bookings')$$);

NOTIFY pgrst, 'reload schema';
