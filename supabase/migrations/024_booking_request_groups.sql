-- ─────────────────────────────────────────────────────────
-- 024_booking_request_groups
--
-- When a Tidy Pro declines, the customer can ask up to 3 others
-- at once, and the first to accept gets the booking. A group
-- ties those requests to the one card hold backing them.
--
-- status: open (waiting on someone), filled (a cleaner accepted),
-- closed (everyone declined, or the customer cancelled).
--
-- original_booking_id is unique so a booking can only be replaced
-- once. RLS is on with no policies: server-side access only.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_request_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  stripe_payment_intent_id text NOT NULL,
  hold_amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'closed')),
  accepted_booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE booking_request_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_group_id uuid REFERENCES booking_request_groups(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_reason text;
CREATE INDEX IF NOT EXISTS bookings_request_group_idx ON bookings (request_group_id);

NOTIFY pgrst, 'reload schema';
