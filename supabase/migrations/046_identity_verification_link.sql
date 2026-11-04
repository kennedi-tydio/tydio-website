-- ─────────────────────────────────────────────────────────
-- 046_identity_verification_link
--
-- The admin now pastes the identity verification form link into the
-- admin console and Tydio emails it to the cleaner, instead of sending
-- it by hand outside Tydio. This stores the link that was sent, so a
-- resend starts from it. Apply after 042.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS id_verification_link text;

NOTIFY pgrst, 'reload schema';
