-- ─────────────────────────────────────────────────────────
-- 073_no_access_photo
--
-- bookings.no_access_photo_url: the photo of the location
--   (house or apartment number and the whole front of the home)
--   the Tidy Pro must take before canceling for no access. Lives
--   in the task-photos bucket under the booking's folder, so it
--   is deleted with the booking's other photos 7 days after the
--   report is settled (lib/taskPhotoRetention.ts).
-- bookings.no_access_photo_latitude / _longitude: where that
--   photo was taken, if the phone recorded it. Read from the
--   photo before its metadata is stripped; only the server reads
--   these (see 038_lock_down_public_api).
-- ─────────────────────────────────────────────────────────

alter table public.bookings
  add column if not exists no_access_photo_url text,
  add column if not exists no_access_photo_latitude double precision,
  add column if not exists no_access_photo_longitude double precision;

notify pgrst, 'reload schema';
