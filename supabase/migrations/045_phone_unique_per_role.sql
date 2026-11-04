-- ─────────────────────────────────────────────────────────
-- 045_phone_unique_per_role
--
-- One person can hold a customer and a Tidy Pro account with the
-- same phone number, the same as with email (see signup). That's
-- enforced per role by profiles_phone_role_unique. An older
-- profiles_phone_unique index, not created by any migration here,
-- required phones to be unique across every account and blocked
-- a Tidy Pro from also signing up as a customer.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_phone_unique;
DROP INDEX IF EXISTS profiles_phone_unique;

NOTIFY pgrst, 'reload schema';
