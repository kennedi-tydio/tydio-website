-- ─────────────────────────────────────────────────────────
-- 022_banned_users
--
-- People denied by an admin. Their profile is deleted, so this
-- is the only record left, and what's checked at login and
-- signup. Payment details are kept for reference.
--
-- RLS is on with no policies: only the service role, used
-- server-side, can read or write this list.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS banned_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  phones_normalized text[] NOT NULL DEFAULT '{}',
  first_name text,
  last_name text,
  note text,
  former_profile_id uuid,
  fee_amount_cents integer,
  stripe_payment_intent_id text,
  banned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS banned_users_email_idx ON banned_users (email);
CREATE INDEX IF NOT EXISTS banned_users_phones_idx ON banned_users USING gin (phones_normalized);

ALTER TABLE banned_users ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
