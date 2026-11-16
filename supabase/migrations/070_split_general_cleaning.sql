-- ─────────────────────────────────────────────────────────
-- 070_split_general_cleaning
--
-- "General cleaning" (generalCleaning) is replaced by two
-- services: standard cleaning (standardCleaning) and deep
-- cleaning (deepCleaning). Tidy Pros who had general cleaning
-- checked get both, in its place. lib/tidyProServices.ts also
-- maps the old key on read, so rows are right before and after
-- this runs.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

UPDATE tidypro_profiles
SET services_provided = (
  SELECT array_agg(DISTINCT s)
  FROM unnest(
    array_remove(services_provided, 'generalCleaning')
    || ARRAY['standardCleaning', 'deepCleaning']
  ) AS s
)
WHERE 'generalCleaning' = ANY(services_provided);

UPDATE unmet_booking_searches
SET required_services = (
  SELECT array_agg(DISTINCT s)
  FROM unnest(
    array_remove(required_services, 'generalCleaning')
    || ARRAY['standardCleaning', 'deepCleaning']
  ) AS s
)
WHERE 'generalCleaning' = ANY(required_services);

NOTIFY pgrst, 'reload schema';
