-- ─────────────────────────────────────────────────────────
-- 048_tidypro_unit_number
--
-- An optional apartment / suite / address line 2 for a cleaner's
-- address, matching unit_number on customer addresses. Apply after 047.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS unit_number text;

NOTIFY pgrst, 'reload schema';
