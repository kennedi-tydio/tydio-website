-- Raise the furthest a Tidy Pro can choose to travel from 20 to 25 miles.
-- Saved distances are left as they are; Pros can widen theirs if they want.
ALTER TABLE tidypro_profiles DROP CONSTRAINT IF EXISTS tidypro_profiles_travel_radius_miles_check;
ALTER TABLE tidypro_profiles ADD CONSTRAINT tidypro_profiles_travel_radius_miles_check
  CHECK (travel_radius_miles IS NULL OR travel_radius_miles BETWEEN 1 AND 25);

NOTIFY pgrst, 'reload schema';
