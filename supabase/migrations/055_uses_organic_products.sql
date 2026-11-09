-- ─────────────────────────────────────────────────────────
-- 055_uses_organic_products
--
-- Lets a Tidy Pro say they use organic cleaning products.
-- Set from the profile edit page and shown to customers on
-- the Tidy Pro's profile.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles
  ADD COLUMN IF NOT EXISTS uses_organic_products boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
