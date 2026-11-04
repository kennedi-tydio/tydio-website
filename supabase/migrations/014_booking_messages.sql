-- ─────────────────────────────────────────────────────────
-- 014_booking_messages
--
-- Real chat messages between a customer and their Tidy Pro,
-- scoped to a booking's thread (the composer in both Messages
-- UIs was wired up but disabled until this existed).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('USER', 'TIDYPRO')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_messages_booking_id_created_at_idx
  ON booking_messages (booking_id, created_at);

ALTER TABLE booking_messages DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
