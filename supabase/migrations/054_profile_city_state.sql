-- ─────────────────────────────────────────────────────────
-- 054_profile_city_state
--
-- City and state on profiles, worked out from zip_code at
-- signup (lib/zipLocation.ts), so /admin/users can filter
-- by them.
--
-- Existing profiles are filled in by
-- scripts/backfill-profile-city-state.mjs after this runs.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state text;

CREATE INDEX IF NOT EXISTS profiles_state_city_idx ON profiles (state, city);

NOTIFY pgrst, 'reload schema';
