-- ─────────────────────────────────────────────────────────
-- 042_identity_verification_form
--
-- Alongside the background check form, the admin sends each cleaner
-- an identity verification form by hand, outside Tydio. This records
-- when that was done so the admin can see who still needs one.
-- Nothing is sent from Tydio and nothing reads it but the admin console.
-- Apply after 021.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS id_verification_sent_at timestamptz;

NOTIFY pgrst, 'reload schema';
