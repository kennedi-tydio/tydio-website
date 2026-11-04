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

-- ─── 008: Market pricing per service area ──────────────────────────────────
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS market_price numeric;
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS market_price_summary text;
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS market_price_researched_at timestamptz;

-- ─── 009: Booking schedule (location/date/time) ────────────────────────────
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS scheduled_location jsonb;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS scheduled_date date;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS scheduled_time text;

-- ─── 010: Selected cleaner on booking draft ────────────────────────────────
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS selected_tidy_pro_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ─── 011: City pricing ──────────────────────────────────────────────────────
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS median_four_hour_price numeric(10,2);
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS pricing_active boolean NOT NULL DEFAULT false;
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS pricing_updated_at timestamptz;

DO $$ BEGIN
  ALTER TABLE service_areas ADD CONSTRAINT service_areas_price_positive
    CHECK (median_four_hour_price IS NULL OR median_four_hour_price > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE service_areas ADD CONSTRAINT service_areas_pricing_active_requires_price
    CHECK (pricing_active = false OR (city IS NOT NULL AND median_four_hour_price IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS service_areas_active_price_city_state_idx
  ON service_areas (lower(city), state) WHERE pricing_active = true;

-- ─── 012: State pricing (replaces city-level pricing from 011) ─────────────
CREATE TABLE IF NOT EXISTS state_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  median_four_hour_price numeric(10,2) NOT NULL,
  pricing_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE state_pricing ADD CONSTRAINT state_pricing_price_positive
    CHECK (median_four_hour_price > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE state_pricing DISABLE ROW LEVEL SECURITY;

-- 011's city-level pricing columns are superseded by state_pricing above.
ALTER TABLE service_areas DROP CONSTRAINT IF EXISTS service_areas_price_positive;
ALTER TABLE service_areas DROP CONSTRAINT IF EXISTS service_areas_pricing_active_requires_price;
DROP INDEX IF EXISTS service_areas_active_price_city_state_idx;
ALTER TABLE service_areas DROP COLUMN IF EXISTS median_four_hour_price;
ALTER TABLE service_areas DROP COLUMN IF EXISTS pricing_active;
ALTER TABLE service_areas DROP COLUMN IF EXISTS pricing_updated_at;

-- ─── 013: Payment methods & Review Your Request details ───────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Added as explicit ALTERs (not just inline in CREATE TABLE) so this also
-- backfills correctly if payment_methods already existed in a partial state.
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS last4 text;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS exp_month integer;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS exp_year integer;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE payment_methods DISABLE ROW LEVEL SECURITY;

ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS pets text;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS supplies_provided boolean DEFAULT false;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS gift_code text;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS selected_payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL;

-- ─── 014: Customer profile — pets ──────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pets text;

-- ─── 015: Promo codes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$ BEGIN
  ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_code_unique UNIQUE (code);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

ALTER TABLE promo_codes DISABLE ROW LEVEL SECURITY;

-- ─── 016: Stripe Connect wiring for payment methods ────────────────────────
-- Note: the live payment_methods table already carries card_brand/card_last4/
-- card_exp_month/card_exp_year/stripe_payment_method_id as NOT NULL (set up
-- directly against Supabase, ahead of this script). These ALTERs exist so a
-- fresh environment ends up with the same columns the app code actually
-- reads and writes (see app/dashboard/profile/payment-methods/actions.ts).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS stripe_payment_method_id text;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_brand text;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_last4 text;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_exp_month integer;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS card_exp_year integer;
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$ BEGIN
  ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_stripe_payment_method_id_key UNIQUE (stripe_payment_method_id);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS payment_methods_user_id_idx ON payment_methods (user_id);
CREATE INDEX IF NOT EXISTS payment_methods_default_idx ON payment_methods (user_id, is_default) WHERE is_default = true;

-- Superseded by the payment_methods_stripe_payment_method_id_key constraint above.
DROP INDEX IF EXISTS payment_methods_stripe_pm_id_idx;

-- ─── 017: Bookings → message thread (pets/notes/location snapshot) ─────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pets text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS scheduled_location jsonb;

-- ─── 018: Unread dot on the Messages list ──────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_unread boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tidy_pro_unread boolean NOT NULL DEFAULT false;

-- ─── 019: Real chat between customer and Tidy Pro ──────────────────────────
CREATE TABLE IF NOT EXISTS booking_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('USER', 'TIDYPRO')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_messages_booking_id_created_at_idx
  ON booking_messages (booking_id, created_at);

ALTER TABLE booking_messages DISABLE ROW LEVEL SECURITY;

-- ─── 020: SMS + push notification consent, subscriptions, reminders ───────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_consent text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_consent text;
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_sms_consent_check CHECK (sms_consent IN ('opted_in', 'declined'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_push_consent_check CHECK (push_consent IN ('opted_in', 'declined'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS sms_consent text;
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS push_consent text;
DO $$ BEGIN
  ALTER TABLE tidypro_profiles ADD CONSTRAINT tidypro_profiles_sms_consent_check CHECK (sms_consent IN ('opted_in', 'declined'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE tidypro_profiles ADD CONSTRAINT tidypro_profiles_push_consent_check CHECK (push_consent IN ('opted_in', 'declined'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_profile_id_idx ON push_subscriptions (profile_id);
ALTER TABLE push_subscriptions DISABLE ROW LEVEL SECURITY;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS bookings_reminder_poll_idx ON bookings (status, reminder_sent_at)
  WHERE status = 'scheduled' AND reminder_sent_at IS NULL;

-- ─── 021: Cleaner onboarding — background check (Checkr) + verified ack ───
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS verified_ack_at timestamptz;
ALTER TABLE background_checks DISABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  ALTER TABLE background_checks ADD CONSTRAINT background_checks_pro_id_key UNIQUE (pro_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR unique_violation THEN NULL;
END $$;

-- ─── 022: Checkr API integration — candidate DOB + report tracking ────────
-- Checkr's Candidates API requires a date of birth (and middle name / "no
-- middle name" flag) to create a candidate record; we don't collect this
-- anywhere else today. Everything more sensitive (SSN, consent) is collected
-- directly on Checkr's own hosted invitation page, never by us.
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS legal_middle_name text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS report_id text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS result text;
CREATE INDEX IF NOT EXISTS background_checks_reference_idx ON background_checks (reference);
CREATE INDEX IF NOT EXISTS background_checks_checkr_invitation_id_idx ON background_checks (checkr_invitation_id);

-- ─── 023: Insurance verification — storage bucket + status workflow ───────
INSERT INTO storage.buckets (id, name, public)
VALUES ('insurance-documents', 'insurance-documents', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS insurance_denial_reason text;
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS insurance_submitted_at timestamptz;
DO $$ BEGIN
  ALTER TABLE tidypro_profiles ADD CONSTRAINT tidypro_profiles_insurance_status_check
    CHECK (insurance_status IN ('pending', 'approved', 'denied'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 024: Cleaner active-booking flow — entry instructions + task photos ───
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS entry_instructions text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('task-photos', 'task-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 025: Tidy Pro profile photos ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 026: Background check fee paid through Stripe Checkout ─────────────────
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_amount_cents integer;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_paid_at timestamptz;

-- ─── 027: Fee terms acceptance, refunds, undelivered adverse action notices ──
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_terms_accepted_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_terms_amount_cents integer;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_refunded_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS fee_refund_reason text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS stripe_refund_id text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS adverse_notice_undelivered_at timestamptz;

-- ─── 028: When a cleaner submitted Checkr's form ─────────────────────────────
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
UPDATE background_checks SET submitted_at = updated_at WHERE submitted_at IS NULL AND report_id IS NOT NULL;

-- ─── 029: Manual pass/reject of a background check ───────────────────────────
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS manual_decision_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS manual_decision_note text;

-- ─── 030: Background checks run by hand, each step recorded in Tydio ─────────
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS requested_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS link_sent_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS background_check_link text;
UPDATE background_checks SET requested_at = fee_paid_at WHERE requested_at IS NULL AND fee_paid_at IS NOT NULL AND fee_refunded_at IS NULL;

-- ─── 031: Banned users ───────────────────────────────────────────────────────
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

-- ─── 032: Tidy Pro "Away" toggle ─────────────────────────────────────────────
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS is_away boolean NOT NULL DEFAULT false;

-- ─── 033: Replacement requests sent to several cleaners at once ──────────────
CREATE TABLE IF NOT EXISTS booking_request_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  stripe_payment_intent_id text NOT NULL,
  hold_amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'closed')),
  accepted_booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE booking_request_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_group_id uuid REFERENCES booking_request_groups(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_reason text;
CREATE INDEX IF NOT EXISTS bookings_request_group_idx ON bookings (request_group_id);

-- ─── 034: Replacement requests carry over the original payment ───────────────
DO $$ BEGIN
  ALTER TABLE booking_request_groups RENAME COLUMN hold_amount_cents TO amount_cents;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- ─── 035: Booking time zones ─────────────────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'America/New_York';
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS time_zone text;

-- ─── 037: Remember a deliberate "Any day" ────────────────────────────────────
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS any_day_selected boolean NOT NULL DEFAULT false;

-- ─── 038: Insurance expiration ───────────────────────────────────────────────
ALTER TABLE tidypro_profiles DROP CONSTRAINT IF EXISTS tidypro_profiles_insurance_status_check;
ALTER TABLE tidypro_profiles ADD CONSTRAINT tidypro_profiles_insurance_status_check
  CHECK (insurance_status IN ('pending', 'approved', 'denied', 'expired'));
SELECT cron.schedule('tydio-insurance-expirations', '0 * * * *', \$\$SELECT public.run_scheduled_job('/api/cron/insurance-expirations')\$\$);

-- ─── 039: Insurance reminder 3 days ahead ────────────────────────────────────
ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS insurance_expiry_reminder_sent_at timestamptz;

-- ─── 040: Accepting a request can't double book a cleaner ───────────────────
CREATE OR REPLACE FUNCTION public.accept_booking_request(p_booking_id uuid, p_tidy_pro_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS \$\$
DECLARE
  b bookings%ROWTYPE;
  b_start timestamp;
  b_end timestamp;
BEGIN
  PERFORM 1 FROM tidypro_profiles WHERE id = p_tidy_pro_id FOR UPDATE;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id AND tidy_pro_id = p_tidy_pro_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF b.status IS DISTINCT FROM 'pending' THEN RETURN 'not_pending'; END IF;

  b_start := b.scheduled_date + b.scheduled_time::time;
  b_end := b_start + make_interval(mins => coalesce(b.estimated_duration_minutes, 60));

  IF EXISTS (
    SELECT 1 FROM bookings o
    WHERE o.tidy_pro_id = p_tidy_pro_id
      AND o.id <> b.id
      AND o.status NOT IN ('pending', 'cancelled', 'declined')
      AND o.scheduled_date BETWEEN b.scheduled_date - 1 AND b.scheduled_date + 1
      AND o.scheduled_time IS NOT NULL
      AND (o.scheduled_date + o.scheduled_time::time) < b_end
      AND b_start < (o.scheduled_date + o.scheduled_time::time) + make_interval(mins => coalesce(o.estimated_duration_minutes, 60))
  ) THEN
    RETURN 'conflict';
  END IF;

  IF b.request_group_id IS NOT NULL THEN
    UPDATE booking_request_groups
    SET status = 'filled', accepted_booking_id = b.id
    WHERE id = b.request_group_id AND status = 'open';
    IF NOT FOUND THEN RETURN 'taken'; END IF;
  END IF;

  UPDATE bookings
  SET decision_status = 'accepted', status = 'scheduled', tidy_pro_unread = false, user_unread = true
  WHERE id = b.id;

  RETURN 'accepted';
END;
\$\$;

REVOKE ALL ON FUNCTION public.accept_booking_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_booking_request(uuid, uuid) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_accepted_per_group_idx
  ON bookings (request_group_id)
  WHERE request_group_id IS NOT NULL AND status NOT IN ('pending', 'cancelled', 'declined');

-- ─── 041: How far each Tidy Pro will travel ─────────────────────────────────
-- Cleaners who exist when the column is added keep the old 10-mile radius.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tidypro_profiles' AND column_name = 'travel_radius_miles'
  ) THEN
    ALTER TABLE tidypro_profiles ADD COLUMN travel_radius_miles integer;
    UPDATE tidypro_profiles SET travel_radius_miles = 10;
  END IF;
END $$;
ALTER TABLE tidypro_profiles DROP CONSTRAINT IF EXISTS tidypro_profiles_travel_radius_miles_check;
ALTER TABLE tidypro_profiles ADD CONSTRAINT tidypro_profiles_travel_radius_miles_check
  CHECK (travel_radius_miles IS NULL OR travel_radius_miles BETWEEN 1 AND 20);

-- ─── 042: Tidy Pros can suggest a new start time ────────────────────────────
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS proposed_date date;
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS proposed_time text;
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS proposal_status text;
ALTER TABLE booking_messages DROP CONSTRAINT IF EXISTS booking_messages_kind_check;
ALTER TABLE booking_messages ADD CONSTRAINT booking_messages_kind_check
  CHECK (kind IN ('text', 'time_proposal'));
ALTER TABLE booking_messages DROP CONSTRAINT IF EXISTS booking_messages_proposal_status_check;
ALTER TABLE booking_messages ADD CONSTRAINT booking_messages_proposal_status_check
  CHECK (proposal_status IS NULL OR proposal_status IN ('pending', 'approved', 'declined', 'withdrawn'));

-- ─── 043: Remind cleaners who haven't left, then alert the admin ────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS on_the_way_reminder_sent_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS unresponsive_alert_sent_at timestamptz;
SELECT cron.schedule('tydio-unresponsive-cleaners', '* * * * *', \$\$SELECT public.run_scheduled_job('/api/cron/unresponsive-cleaners')\$\$);

-- ─── 044: Customer reports of a Tidy Pro (from 001, never applied) ──────────
CREATE TABLE IF NOT EXISTS risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'low',
  description text,
  metadata jsonb,
  resolved_at timestamptz,
  resolution_notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS risk_events_booking_id_idx ON risk_events (booking_id);
CREATE INDEX IF NOT EXISTS risk_events_user_id_idx ON risk_events (user_id);
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;

-- ─── 036: Scheduled jobs run from the database ───────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.run_scheduled_job(job_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS \$\$
DECLARE
  site_url text;
  cron_secret text;
BEGIN
  SELECT decrypted_secret INTO site_url FROM vault.decrypted_secrets WHERE name = 'tydio_site_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret FROM vault.decrypted_secrets WHERE name = 'tydio_cron_secret' LIMIT 1;

  IF site_url IS NULL OR cron_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_get(
    url := rtrim(site_url, '/') || job_path,
    headers := jsonb_build_object('x-cron-secret', cron_secret),
    timeout_milliseconds := 60000
  );
END;
\$\$;

REVOKE ALL ON FUNCTION public.run_scheduled_job(text) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('tydio-expire-booking-requests', '* * * * *', \$\$SELECT public.run_scheduled_job('/api/cron/expire-booking-requests')\$\$);
SELECT cron.schedule('tydio-booking-reminders', '*/5 * * * *', \$\$SELECT public.run_scheduled_job('/api/cron/booking-reminders')\$\$);

-- Force PostgREST to pick up the schema changes above immediately, instead
-- of waiting for its own periodic reload (which is what was causing "column
-- does not exist" errors right after this migration ran).
NOTIFY pgrst, 'reload schema';
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
