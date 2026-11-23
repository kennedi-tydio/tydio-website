-- ─────────────────────────────────────────────────────────
-- 094_entire_home_task_photos
--
-- Entire home Tidy Tasks (baseboards, windows, floors throughout)
-- can't be shown in one photo, so the Tidy Pro can add up to 3
-- before and 3 after photos for each. At least 1 after photo is
-- still required to mark the task complete (the limits are
-- enforced in app/pro/bookings/[bookingId]/actions.ts).
--
-- Every photo of such a task is a row here. The first of each kind
-- is also mirrored onto booking_tasks.before_photo_url /
-- completion_photo_url, so the customer's booking view, the admin
-- views and the portfolio keep working off those columns.
--
-- The files are in the public task-photos bucket under the
-- booking's folder, with location metadata stripped, so the 7-day
-- task photo cleanup (lib/taskPhotoRetention.ts) removes them with
-- the rest. latitude / longitude are where the phone says the photo
-- was taken: Tydio only, never shown to customers or Tidy Pros.
--
-- Service role only. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_task_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_task_id uuid NOT NULL REFERENCES booking_tasks(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('before', 'after')),
  photo_path text NOT NULL,
  photo_url text NOT NULL,
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_task_photos_task_idx ON booking_task_photos (booking_task_id, kind, created_at);
CREATE INDEX IF NOT EXISTS booking_task_photos_booking_idx ON booking_task_photos (booking_id);

ALTER TABLE booking_task_photos ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
