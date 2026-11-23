-- ─────────────────────────────────────────────────────────
-- 095_customer_bio_preferences
--
-- A customer's bio and cleaning preferences, written on their
-- Profile screen and shown to Tidy Pros they've booked (on the
-- customer profile a Tidy Pro opens from a booking or chat).
-- Both optional free text. Deleting the account deletes the
-- profile row, and these with it.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cleaning_preferences text;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE profiles ADD CONSTRAINT profiles_bio_length CHECK (char_length(bio) <= 500);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_cleaning_preferences_length;
ALTER TABLE profiles ADD CONSTRAINT profiles_cleaning_preferences_length CHECK (char_length(cleaning_preferences) <= 1000);

NOTIFY pgrst, 'reload schema';
