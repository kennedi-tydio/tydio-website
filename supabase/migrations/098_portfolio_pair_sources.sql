-- ─────────────────────────────────────────────────────────────
-- 098_portfolio_pair_sources
--
-- A booking can now add more than one before/after pair per
-- task to the Tidy Pro's profile: each after photo of an Entire
-- home task (booking_task_photos), and each after photo of a
-- Standard / Deep Cleaning (booking_cleaning_photos), as well as
-- a regular task's single pair. They can also add them after the
-- job is finished, until the booking's photos are removed.
--
-- tidypro_portfolio_items.source_key: which after photo of the
--   booking the pair was made from, so it's added only once:
--     'task:<booking_tasks.id>'            a task's single pair
--     'task-photo:<booking_task_photos.id>' an Entire home photo
--     'cleaning:<booking_cleaning_photos.id>' a cleaning photo
--   Null for photos the Tidy Pro uploaded from their device.
--
-- The old one-pair-per-task index is replaced by one on
-- (booking_id, source_key).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.tidypro_portfolio_items ADD COLUMN IF NOT EXISTS source_key text;

UPDATE public.tidypro_portfolio_items
SET source_key = 'task:' || booking_task_id
WHERE booking_task_id IS NOT NULL AND source_key IS NULL;

DROP INDEX IF EXISTS public.tidypro_portfolio_items_task_idx;

CREATE UNIQUE INDEX IF NOT EXISTS tidypro_portfolio_items_source_idx
  ON public.tidypro_portfolio_items (booking_id, source_key)
  WHERE source_key IS NOT NULL;

NOTIFY pgrst, 'reload schema';
