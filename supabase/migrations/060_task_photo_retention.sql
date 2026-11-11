-- ─────────────────────────────────────────────────────────
-- 060_task_photo_retention
--
-- Task photos are deleted 7 days after a booking ends: the
-- Tidy Pro's completion photos (task-photos) and the photos
-- the customer added to pet enclosure / litter box tasks
-- (customer-task-photos). Customer photos on tasks that are
-- never booked go 7 days after upload. See
-- lib/taskPhotoRetention.ts.
--
-- ended_at: when the booking left pending/scheduled (completed,
--   cancelled, declined, ...). Set by trigger, so every code
--   path that ends a booking records it. updated_at can't be
--   used: nothing keeps it current.
-- task_photos_removed_at: when this booking's photos were
--   deleted, so the job only handles each booking once.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS task_photos_removed_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_booking_ended_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ended_at IS NULL
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IS NOT NULL
     AND NEW.status NOT IN ('pending', 'scheduled') THEN
    NEW.ended_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_booking_ended_at_trigger ON bookings;
CREATE TRIGGER set_booking_ended_at_trigger
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_ended_at();

-- Bookings that had already ended before this migration: best available time.
UPDATE bookings
SET ended_at = COALESCE(cleaner_marked_complete_at, updated_at, created_at)
WHERE ended_at IS NULL
  AND status IS NOT NULL
  AND status NOT IN ('pending', 'scheduled');

CREATE INDEX IF NOT EXISTS bookings_task_photo_retention_idx
  ON bookings (ended_at)
  WHERE task_photos_removed_at IS NULL;

-- Hourly, at half past.
SELECT cron.unschedule('tydio-task-photo-retention')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tydio-task-photo-retention');
SELECT cron.schedule('tydio-task-photo-retention', '30 * * * *', $$SELECT public.run_scheduled_job('/api/cron/task-photo-retention')$$);

NOTIFY pgrst, 'reload schema';
