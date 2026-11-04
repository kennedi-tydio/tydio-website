-- ─────────────────────────────────────────────────────────
-- 040_account_suspension
--
-- An admin can suspend an account from /admin/users. Unlike a ban, nothing
-- is deleted and it can be lifted. While suspended_at is set the person
-- can't sign in, and any session they already have stops working
-- (lib/auth/sessionFingerprint.ts).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

NOTIFY pgrst, 'reload schema';
