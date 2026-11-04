-- ─────────────────────────────────────────────────────────
-- 030_insurance_expiry_reminder
--
-- Records when a cleaner was reminded, 3 days ahead, that their
-- insurance is about to expire, so they're only reminded once.
-- Cleared whenever a new expiration date is set.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE tidypro_profiles ADD COLUMN IF NOT EXISTS insurance_expiry_reminder_sent_at timestamptz;

NOTIFY pgrst, 'reload schema';
