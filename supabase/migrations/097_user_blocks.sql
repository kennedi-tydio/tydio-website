-- ─────────────────────────────────────────────────────────
-- 097_user_blocks
--
-- A customer can block a Tidy Pro, and a Tidy Pro can block a
-- customer, from the bottom of the report sheet (the flag on a
-- booking). One row per block: blocker_id blocked blocked_id.
--
-- A block works both ways (lib/userBlocks.ts): neither side can
-- message the other, the customer can't send that Tidy Pro booking
-- or quote requests, and that Tidy Pro is left out of the
-- customer's search results and "ask others too" lists.
--
-- Read and written by the server only: RLS is on with no policies.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- The booking they were looking at when they blocked, for admins.
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
