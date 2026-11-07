-- ─────────────────────────────────────────────────────────
-- 052_auth_identities
--
-- Links a profile to an outside sign-in provider (Google for
-- now), so "Continue with Google" finds the same account every
-- time even if the person later changes the email on it.
--
-- One profile has at most one identity per provider. A Google
-- account can link to both a customer and a Tidy Pro profile,
-- since those are separate rows (UNIQUE(email, role) on profiles).
--
-- Password sign-in is untouched. A profile created through Google
-- has password_hash NULL until the person sets one with
-- "Forgot password".
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth_identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('google')),
  provider_user_id text NOT NULL,
  email            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  CONSTRAINT auth_identities_profile_provider_unique UNIQUE (profile_id, provider),
  CONSTRAINT auth_identities_provider_subject_profile_unique UNIQUE (provider, provider_user_id, profile_id)
);

CREATE INDEX IF NOT EXISTS auth_identities_provider_subject_idx
  ON auth_identities (provider, provider_user_id);

-- Only the server (service role) reads or writes this table.
ALTER TABLE auth_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_identities FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
