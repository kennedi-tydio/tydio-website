-- ─────────────────────────────────────────────────────────
-- 088_booking_declines
--
-- Why a Tidy Pro declined a booking request: one reason from the
-- list (ids in lib/declineReasons.ts), plus an optional note when
-- they pick "Other". One row per decline.
--
-- For admins only (the Bookings tab). Customers must never see it,
-- so it's kept off the bookings row and is service role only: RLS
-- is on with no policies.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_declines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  tidy_pro_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_declines_created_idx ON booking_declines (created_at DESC);
CREATE INDEX IF NOT EXISTS booking_declines_booking_idx ON booking_declines (booking_id);

ALTER TABLE booking_declines ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
