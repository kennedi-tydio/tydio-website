-- ─────────────────────────────────────────────────────────
-- 008_city_pricing
--
-- Adds administrator-configured city pricing to service_areas.
-- This becomes the single source of truth for booking prices,
-- replacing the AI-researched market_price as the authoritative
-- value (market_price/market_price_summary are left in place but
-- are no longer read by the pricing engine).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

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

-- Prevent duplicate active pricing records for the same city + state.
CREATE UNIQUE INDEX IF NOT EXISTS service_areas_active_price_city_state_idx
  ON service_areas (lower(city), state) WHERE pricing_active = true;
