-- ─────────────────────────────────────────────────────────
-- 075_booking_upcharges
--
-- The Tydio team can ask a customer to pay extra for a booking
-- from /admin/bookings (say the home needed far more work than
-- was booked). See lib/bookingUpcharges.ts.
--
-- booking_upcharges: one row per request.
--   amount         what Tydio asks for, before the card fee. The
--                  customer pays this plus Stripe's fee for their
--                  card (customer_charge), like a booking.
--   cleaner_pay    the Tidy Pro's share (80% of amount by default).
--   Once paid, an upcharge is part of the booking: customer_charge
--   is added to bookings.total_customer_charge, amount to
--   customer_subtotal and cleaner_pay to cleaner_pay, so refunds
--   and the payout are worked out on the booking's whole total.
--   A refund is spread across the booking's charge and these.
--   status         pending   waiting on the customer
--                  paid      charged (stripe_payment_intent_id)
--                  cancelled withdrawn by the admin, or the
--                            booking was canceled first
--                  refunded  paid, then refunded with the booking
--                            (stripe_refund_id: this charge's part)
--   At most one pending row per booking.
--
-- bookings.suspended_for_upcharge_at: set while an upcharge is
--   pending. The Tidy Pro can't start or continue the booking
--   until the customer pays, and the customer sees it as
--   "Needs attention".
--
-- Service role only. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS suspended_for_upcharge_at timestamptz;

CREATE TABLE IF NOT EXISTS booking_upcharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  cleaner_pay numeric(10, 2) NOT NULL CHECK (cleaner_pay >= 0 AND cleaner_pay <= amount),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  customer_charge numeric(10, 2),
  stripe_payment_intent_id text,
  stripe_refund_id text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_upcharges_one_pending_idx
  ON booking_upcharges (booking_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS booking_upcharges_booking_idx
  ON booking_upcharges (booking_id);

ALTER TABLE booking_upcharges ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
