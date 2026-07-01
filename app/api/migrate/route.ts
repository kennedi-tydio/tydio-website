import { NextResponse } from 'next/server'

const MIGRATION_SQL = `
-- Dynamically drop ANY FK from profiles → auth.users (constraint name varies by project)
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'f'
    AND confrelid = 'auth.users'::regclass
  LIMIT 1;
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END;
$$;

-- Add UUID default so rows can be inserted without explicit id
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Custom auth column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text;

-- Allow same email under different roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_email_role_unique;
ALTER TABLE profiles ADD CONSTRAINT profiles_email_role_unique UNIQUE (email, role);

-- Disable RLS — all ops go through service role server-side
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Re-point booking_drafts FK to profiles instead of auth.users
DO $$
BEGIN
  ALTER TABLE booking_drafts DROP CONSTRAINT IF EXISTS booking_drafts_customer_user_id_fkey;
  ALTER TABLE booking_drafts ADD CONSTRAINT booking_drafts_customer_user_id_fkey
    FOREIGN KEY (customer_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN
  NULL; -- ignore if booking_drafts has orphaned rows; run /api/clear-old-profiles first
END;
$$;

-- ─── 004: Service areas & booking access ───────────────────────────────────

CREATE TABLE IF NOT EXISTS service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'waitlist_only',
  city text,
  state text DEFAULT 'GA',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_area_zip_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_area_id uuid NOT NULL REFERENCES service_areas(id) ON DELETE CASCADE,
  zip_code text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(service_area_id, zip_code)
);

CREATE TABLE IF NOT EXISTS service_area_activation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_area_id uuid REFERENCES service_areas(id),
  previous_status text,
  new_status text,
  activated_by uuid REFERENCES profiles(id),
  users_notified_count integer DEFAULT 0,
  active_cleaner_count integer DEFAULT 0,
  waitlisted_user_count integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street_address text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS service_area_id uuid REFERENCES service_areas(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_access_status text DEFAULT 'waitlisted';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_access_granted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS waitlisted_at timestamptz DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at timestamptz;

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS service_area_ids uuid[];
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS service_zip_codes text[];
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS active_for_booking boolean DEFAULT false;

UPDATE profiles
SET booking_access_status = 'booking_allowed'
WHERE waitlisted = false AND booking_access_status = 'waitlisted';

ALTER TABLE service_areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_area_zip_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_area_activation_events DISABLE ROW LEVEL SECURITY;

-- ─── 005: Password reset tokens ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE password_reset_tokens DISABLE ROW LEVEL SECURITY;

-- ─── 006: Email verification ───────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- Auto-verify every existing profile so the new check doesn't lock out current users
UPDATE profiles SET email_verified_at = now() WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_verification_tokens DISABLE ROW LEVEL SECURITY;

-- ─── 007: Custom rooms per user ────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_rooms text[] DEFAULT '{}';
`

export async function GET() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1]

  if (!token) {
    return NextResponse.json(
      { error: 'SUPABASE_ACCESS_TOKEN not set in .env.local — get it from supabase.com/dashboard/account/tokens' },
      { status: 500 }
    )
  }

  if (!projectRef) {
    return NextResponse.json({ error: 'Could not parse project ref from SUPABASE_URL' }, { status: 500 })
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: MIGRATION_SQL }),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: 'Migration failed', detail: data }, { status: res.status })
  }

  return NextResponse.json({ ok: true, message: 'Migration applied successfully', result: data })
}
