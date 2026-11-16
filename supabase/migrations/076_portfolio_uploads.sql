-- ─────────────────────────────────────────────────────────
-- 076_portfolio_uploads
--
-- Tidy Pros can upload work photos to their profile straight
-- from their device, not only from a finished booking.
--
-- An uploaded item has no booking_id / booking_task_id. Its
-- after_photo_path is the main photo and before_photo_path is
-- optional, so a single photo of a finished cleaning works too.
-- task_name is the caption the Tidy Pro types.
--
-- Uploaded photos are re-encoded without metadata on the server
-- (lib/tidyProPortfolio.ts), like task photos, and live in the
-- same "<tidy pro id>/" folder of portfolio-photos, so they go
-- with the Tidy Pro's account.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.tidypro_portfolio_items ALTER COLUMN before_photo_path DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
