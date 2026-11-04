-- ─────────────────────────────────────────────────────────
-- 015_notifications
--
-- SMS + Web Push notification consent (a tri-state: NULL = never
-- asked, 'opted_in', 'declined' — not a quiet default-on flag),
-- push subscription storage, and a de-dupe flag for the 30-minute
-- booking-start reminder.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

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

NOTIFY pgrst, 'reload schema';
