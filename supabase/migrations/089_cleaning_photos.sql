-- ─────────────────────────────────────────────────────────
-- 089_cleaning_photos
--
-- Optional photos of a Standard / Deep Cleaning: up to 10 before
-- and 10 after for the whole cleaning, of whole rooms or areas
-- (the limit is enforced in app/pro/bookings/[bookingId]/actions.ts).
-- Add-ons and Tidy Tasks keep their own required after photo on
-- booking_tasks.
--
-- The files are in the public task-photos bucket under the
-- booking's folder, with location metadata stripped, so the 7-day
-- task photo cleanup (lib/taskPhotoRetention.ts) removes them with
-- the rest. latitude / longitude are where the phone says the photo
-- was taken: Tydio only, never shown to customers or Tidy Pros.
--
-- Service role only. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_cleaning_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('before', 'after')),
  photo_path text NOT NULL,
  photo_url text NOT NULL,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_cleaning_photos_booking_idx ON booking_cleaning_photos (booking_id, kind, created_at);

ALTER TABLE booking_cleaning_photos ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
