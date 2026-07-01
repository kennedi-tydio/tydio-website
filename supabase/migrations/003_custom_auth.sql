-- ─────────────────────────────────────────────────────────
-- 003_custom_auth
--
-- Replaces Supabase Auth with custom credential auth stored
-- directly in the profiles table.
--
-- Changes:
--   1. Add password_hash column (bcrypt-hashed password)
--   2. Make profiles.id auto-generate (UUID default) so it
--      is independent of auth.users
--   3. Drop any FK from profiles.id → auth.users
--   4. Add UNIQUE(email, role) — same email can be both
--      USER and TIDYPRO as separate rows
--   5. Update booking_drafts.customer_user_id FK to point
--      at profiles(id) instead of auth.users(id)
--   6. Disable RLS on profiles (all ops go through service
--      role server-side; re-enable per-table later if needed)
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────

-- 1. Add password_hash
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text;

-- 2. Auto-generate id for new rows
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. Drop FK from profiles.id → auth.users (various possible names)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- 4. UNIQUE(email, role)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_email_role_unique;
ALTER TABLE profiles ADD CONSTRAINT profiles_email_role_unique UNIQUE (email, role);

-- 5. Re-point booking_drafts.customer_user_id → profiles(id)
ALTER TABLE booking_drafts DROP CONSTRAINT IF EXISTS booking_drafts_customer_user_id_fkey;
ALTER TABLE booking_drafts
  ADD CONSTRAINT booking_drafts_customer_user_id_fkey
  FOREIGN KEY (customer_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 6. Disable RLS on profiles (service role handles all auth ops)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
