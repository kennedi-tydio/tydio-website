-- ─────────────────────────────────────────────────────────
-- 065_customer_pet_notes_optional
--
-- Pet notes are optional (only the pet type is required). 063
-- was first applied while notes were still required, and its
-- CREATE TABLE IF NOT EXISTS doesn't change an existing table,
-- so this relaxes the column on databases that already have it.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.customer_pets ALTER COLUMN notes DROP NOT NULL;
ALTER TABLE public.customer_pets DROP CONSTRAINT IF EXISTS customer_pets_notes_check;
