-- ─────────────────────────────────────────────────────────
-- 071_tidypro_portfolio
--
-- Before photos and the Tidy Pro's "Recent Work" portfolio.
--
-- booking_tasks.before_photo_url: optional photo the Tidy Pro
--   takes when they arrive, before doing the task. Lives in the
--   task-photos bucket next to the (required) after photo in
--   completion_photo_url, and is removed with it 7 days after
--   the booking ends (lib/taskPhotoRetention.ts).
--
-- booking_tasks.{before,completion}_photo_{latitude,longitude}:
--   where each photo was taken, read from its GPS tags on upload
--   (lib/photoLocation.ts). The public files are stripped of all
--   metadata, so these columns are the only copy of the location,
--   and only the server (service role) reads them. Kept with the
--   booking record, not cleared by the 7-day photo retention;
--   removed when the booking is (customer account deletion).
--
-- tidypro_portfolio_items: before/after pairs the Tidy Pro chose
--   to add to their profile when they finished a booking. The
--   photos are copied into the public portfolio-photos bucket
--   under "<tidy pro id>/<uuid>.<ext>" so they outlive the
--   7-day task photo retention. Shown on the customer-facing
--   Tidy Pro page (lib/tidyProPortfolio.ts).
--
--   Rows cascade with the Tidy Pro, and with the booking: a
--   customer deleting their account takes the photos of their
--   home with it (lib/accountDeletion.ts removes the files).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.booking_tasks ADD COLUMN IF NOT EXISTS before_photo_url text;
ALTER TABLE public.booking_tasks ADD COLUMN IF NOT EXISTS before_photo_latitude double precision;
ALTER TABLE public.booking_tasks ADD COLUMN IF NOT EXISTS before_photo_longitude double precision;
ALTER TABLE public.booking_tasks ADD COLUMN IF NOT EXISTS completion_photo_latitude double precision;
ALTER TABLE public.booking_tasks ADD COLUMN IF NOT EXISTS completion_photo_longitude double precision;

-- Photo locations are for Tydio only. The app reads booking_tasks solely
-- through the service role, so the public API roles get no access at all.
ALTER TABLE public.booking_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_tasks FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.tidypro_portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tidypro_id uuid NOT NULL REFERENCES public.tidypro_profiles(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  booking_task_id uuid REFERENCES public.booking_tasks(id) ON DELETE SET NULL,
  task_name text NOT NULL,
  before_photo_path text NOT NULL,
  after_photo_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tidypro_portfolio_items_tidypro_idx
  ON public.tidypro_portfolio_items (tidypro_id, created_at DESC);

-- A task can only be added to a profile once.
CREATE UNIQUE INDEX IF NOT EXISTS tidypro_portfolio_items_task_idx
  ON public.tidypro_portfolio_items (booking_task_id)
  WHERE booking_task_id IS NOT NULL;

-- Only the server (service role) reads and writes these.
ALTER TABLE public.tidypro_portfolio_items ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-photos',
  'portfolio-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
