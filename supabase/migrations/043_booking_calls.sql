-- ─────────────────────────────────────────────────────────
-- 043_booking_calls
--
-- Masked calls between a customer and their Tidy Pro. Twilio
-- rings the caller from Tydio's number and then dials the other
-- side, so neither sees the other's phone number. This logs who
-- started each call, how it ended, and how long it ran, for
-- safety reviews. Calls are not recorded.
--
-- RLS is on with no policies: only the service role, used
-- server-side, can read or write the log.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  caller_role text NOT NULL CHECK (caller_role IN ('USER', 'TIDYPRO')),
  twilio_call_sid text NOT NULL UNIQUE,
  status text,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_calls_booking_id_idx ON booking_calls (booking_id, created_at DESC);

ALTER TABLE booking_calls ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
