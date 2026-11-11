-- ─────────────────────────────────────────────────────────
-- 061_tidypro_services
--
-- The services a Tidy Pro provides, chosen on "Services
-- provided" (/pro/profile/services). Keys are listed in
-- lib/tidyProServices.ts: taskBased, generalCleaning,
-- laundry, laundromat, petEnclosures,
-- litterBoxes.
--
-- Choosing at least one is an onboarding step
-- (missingOnboardingSteps), and onboarding steps are checked
-- live for search. Tidy Pros who are already approved (or paused) are
-- given task-based cleaning so they don't drop out of search;
-- they can add more from their profile.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS services_provided text[];

UPDATE tidypro_profiles
SET services_provided = ARRAY['taskBased']
WHERE services_provided IS NULL
  AND cleaner_status IN ('approved', 'paused');

NOTIFY pgrst, 'reload schema';
