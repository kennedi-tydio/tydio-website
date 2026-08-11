-- ─────────────────────────────────────────────────────────
-- 005_market_pricing
--
-- Adds AI-researched market pricing to service_areas, used to
-- anchor booking totals to the local full-service clean rate
-- instead of summing per-task fees.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS market_price numeric;
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS market_price_summary text;
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS market_price_researched_at timestamptz;
