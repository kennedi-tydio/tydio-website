-- ─────────────────────────────────────────────────────────
-- 078_booking_task_additions
--
-- A customer adding tasks from their dashboard to an accepted
-- booking that's more than 2 hours away. They pay for the added
-- tasks up front, and it's sent to the Tidy Pro as an "Additional
-- task(s)" request to accept or decline. See
-- lib/bookingTaskAdditions.ts.
--
-- booking_task_additions: one row per request.
--   task_list        the tasks asked for (taken off the dashboard
--                    while the request is out)
--   amount           what the added tasks cost, before the card fee
--   cleaner_pay      the Tidy Pro's share (80% of amount)
--   customer_charge  what the card was charged: amount plus
--                    Stripe's fee for that card
--   apply_to_series  a recurring visit: the tasks are also added to
--                    every future visit of the series, priced into
--                    each visit's own total (charged 3 days before
--                    it like the rest of the visit), not charged
--                    separately again
--   status   pending   waiting on the Tidy Pro
--            accepted  added to the booking. Its payment is then
--                      recorded as a paid booking_upcharges row
--                      (task_addition_id), so refunds and the payout
--                      work on the booking's whole total, like any
--                      upcharge.
--            declined  the Tidy Pro said no
--            expired   not answered before the booking started
--            cancelled the booking was canceled first
--            removed   accepted, then the Tidy Pro backed out of the
--                      booking and it went to someone else
--   declined, expired, cancelled and removed are refunded in full
--   (stripe_refund_id) and the tasks go back on the dashboard.
--   At most one pending row per booking.
--
-- Service role only. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_task_additions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tidy_pro_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  task_list jsonb NOT NULL,
  apply_to_series boolean NOT NULL DEFAULT false,
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  cleaner_pay numeric(10, 2) NOT NULL CHECK (cleaner_pay >= 0 AND cleaner_pay <= amount),
  customer_charge numeric(10, 2) NOT NULL,
  -- How long the visit will be with the tasks added.
  new_duration_minutes integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled', 'removed')),
  stripe_payment_intent_id text NOT NULL,
  stripe_refund_id text,
  -- The checklist rows added to the booking on accept.
  booking_task_ids uuid[] NOT NULL DEFAULT '{}',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_task_additions_one_pending_idx
  ON booking_task_additions (booking_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS booking_task_additions_booking_idx
  ON booking_task_additions (booking_id);

ALTER TABLE booking_task_additions ENABLE ROW LEVEL SECURITY;

ALTER TABLE booking_upcharges
  ADD COLUMN IF NOT EXISTS task_addition_id uuid REFERENCES booking_task_additions(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
