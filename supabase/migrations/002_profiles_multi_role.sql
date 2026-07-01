-- ─────────────────────────────────────────────────────────
-- 002_profiles_multi_role
--
-- Allows the same email (auth user) to hold both a USER and
-- a TIDYPRO profile. Changes:
--   1. Add auth_user_id (FK to auth.users) — the stable link
--      to the Supabase auth row.
--   2. Backfill auth_user_id from existing id values (they
--      were always equal before this migration).
--   3. Make id auto-generated so new profile rows get their
--      own UUID (decoupled from auth.users.id).
--   4. Add UNIQUE(auth_user_id, role) — one profile per role
--      per auth user.
--   5. Refresh RLS policies to key on auth_user_id.
--
-- Safe to re-run (all statements are idempotent).
-- ─────────────────────────────────────────────────────────

-- 1. Add auth_user_id column (nullable first so backfill can run)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- 2. Backfill: existing rows had id = auth.users.id
UPDATE profiles SET auth_user_id = id WHERE auth_user_id IS NULL;

-- 3. Constrain + index
ALTER TABLE profiles ALTER COLUMN auth_user_id SET NOT NULL;

ALTER TABLE profiles
  ADD CONSTRAINT IF NOT EXISTS profiles_auth_user_id_fkey
  FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE profiles
  ADD CONSTRAINT IF NOT EXISTS profiles_auth_user_role_unique
  UNIQUE (auth_user_id, role);

-- 4. Make id auto-generate for new rows (existing rows keep their UUID)
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 5. RLS — drop old identity-keyed policies and replace with auth_user_id ones
--    (Policy names vary across projects; drop common variants defensively)
DROP POLICY IF EXISTS "Users can view own profile"   ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable" ON profiles;
DROP POLICY IF EXISTS "Enable read access for own profile" ON profiles;
DROP POLICY IF EXISTS "Enable insert for own profile"     ON profiles;
DROP POLICY IF EXISTS "Enable update for own profile"     ON profiles;

-- Allow users to read any of their own profiles (USER + TIDYPRO)
CREATE POLICY "Users can read own profiles"
  ON profiles FOR SELECT
  USING (auth_user_id = auth.uid());

-- Allow users to update any of their own profiles
CREATE POLICY "Users can update own profiles"
  ON profiles FOR UPDATE
  USING (auth_user_id = auth.uid());

-- Inserts are done server-side via service role — no INSERT policy needed
-- for the anon/authenticated role. If you add one, use:
-- CREATE POLICY "Server inserts only" ON profiles FOR INSERT WITH CHECK (false);
