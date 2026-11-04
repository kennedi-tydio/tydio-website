-- ─────────────────────────────────────────────────────────
-- 044_deleted_accounts
--
-- A log of accounts an admin deleted from /admin/users, shown
-- in the Deleted Accounts section there. The account itself is
-- gone (the profiles row and everything cascading from it);
-- this keeps only who it was and when, so the deletion can be
-- looked up later.
--
-- RLS is on with no policies: only the service role, used
-- server-side, can read or write the log.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deleted_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  former_profile_id uuid NOT NULL,
  email text NOT NULL,
  first_name text,
  last_name text,
  role text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deleted_accounts_deleted_at_idx ON deleted_accounts (deleted_at DESC);

ALTER TABLE deleted_accounts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
