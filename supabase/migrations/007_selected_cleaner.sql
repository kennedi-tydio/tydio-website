-- ─────────────────────────────────────────────────────────
-- 007_selected_cleaner
--
-- Lets a booking draft remember which Tidy Pro the customer
-- picked while choosing an appointment time.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS selected_tidy_pro_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
