-- ─────────────────────────────────────────────────────────
-- 009_state_pricing
--
-- Replaces city-level pricing (008_city_pricing) with a single
-- administrator-configured median 4-hour clean price per state.
-- One row per state; the state's price applies to every service
-- area within it.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

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

-- 008's city-level pricing columns are superseded by the table above.
ALTER TABLE service_areas DROP CONSTRAINT IF EXISTS service_areas_price_positive;
ALTER TABLE service_areas DROP CONSTRAINT IF EXISTS service_areas_pricing_active_requires_price;
DROP INDEX IF EXISTS service_areas_active_price_city_state_idx;
ALTER TABLE service_areas DROP COLUMN IF EXISTS median_four_hour_price;
ALTER TABLE service_areas DROP COLUMN IF EXISTS pricing_active;
ALTER TABLE service_areas DROP COLUMN IF EXISTS pricing_updated_at;
