-- ─────────────────────────────────────────────────────────
-- 053_onboarding_complete_notified
--
-- Records when the admin was emailed that a cleaner finished
-- onboarding and became bookable (see lib/onboardingComplete.ts),
-- so it's sent once per cleaner.
--
-- Cleaners who are already bookable are stamped now, so the
-- first profile edit after this ships doesn't email about
-- someone who finished long ago. The conditions mirror
-- missingOnboardingSteps in lib/cleanerOnboarding.ts.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS onboarding_completed_notified_at timestamptz;

UPDATE tidypro_profiles
SET onboarding_completed_notified_at = now()
WHERE onboarding_completed_notified_at IS NULL
  AND cleaner_status = 'approved'
  AND active_for_booking = true
  AND stripe_onboarding_completed = true
  AND profile_photo_url IS NOT NULL
  AND trim(coalesce(bio, '')) <> ''
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND travel_radius_miles IS NOT NULL
  AND jsonb_typeof(availability::jsonb) = 'object'
  AND EXISTS (
    SELECT 1 FROM jsonb_each(availability::jsonb) AS day(key, ranges)
    WHERE jsonb_typeof(day.ranges) = 'array' AND jsonb_array_length(day.ranges) > 0
  );

NOTIFY pgrst, 'reload schema';
