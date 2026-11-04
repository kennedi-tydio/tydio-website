-- ─────────────────────────────────────────────────────────
-- 047_single_screening_link
--
-- The cleaner now gets one link from the screening provider that
-- covers both the background check and identity verification, so
-- there's no separate identity form to send. Instead the admin ticks
-- off each part as the provider shows it done; once both are, the
-- check is recorded as submitted and moves on to be decided.
-- The id_verification_sent_at / id_verification_link columns from
-- 042 and 046 are left in place but no longer used. Apply after 046.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS background_check_completed_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS id_verification_completed_at timestamptz;

NOTIFY pgrst, 'reload schema';
