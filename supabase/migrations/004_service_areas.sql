-- ─────────────────────────────────────────────────────────
-- 004_service_areas
--
-- Introduces service-area-based booking access gating.
--
-- Changes:
--   1. service_areas — named geographic zones with a status
--   2. service_area_zip_codes — admin adds ZIPs to activate them
--   3. service_area_activation_events — audit log
--   4. profiles — new columns for service area + booking access
--   5. tidypro_profiles — service area assignment columns
--   6. Migrate old waitlisted boolean → booking_access_status
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

-- 1. service_areas
CREATE TABLE IF NOT EXISTS service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'waitlist_only',
  city text,
  state text DEFAULT 'GA',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. service_area_zip_codes
CREATE TABLE IF NOT EXISTS service_area_zip_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_area_id uuid NOT NULL REFERENCES service_areas(id) ON DELETE CASCADE,
  zip_code text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(service_area_id, zip_code)
);

-- 3. service_area_activation_events
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

-- 4. Profile additions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS street_address text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS service_area_id uuid REFERENCES service_areas(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_access_status text DEFAULT 'waitlisted';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_access_granted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS waitlisted_at timestamptz DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at timestamptz;

-- 5. TidyPro additions
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS service_area_ids uuid[];
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS service_zip_codes text[];
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS active_for_booking boolean DEFAULT false;

-- 6. Migrate old waitlisted boolean → booking_access_status
UPDATE profiles
SET booking_access_status = 'booking_allowed'
WHERE waitlisted = false AND booking_access_status = 'waitlisted';

-- Disable RLS — all ops go through service role server-side
ALTER TABLE service_areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_area_zip_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_area_activation_events DISABLE ROW LEVEL SECURITY;
