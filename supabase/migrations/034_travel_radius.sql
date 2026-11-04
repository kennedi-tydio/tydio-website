-- How far each Tidy Pro is willing to travel from their address. NULL until
-- they choose, which keeps them out of search as an unfinished onboarding step.
-- Cleaners who exist when the column is first added keep the old fixed 10-mile
-- radius so search doesn't empty out; anyone after that has to choose.
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

NOTIFY pgrst, 'reload schema';
