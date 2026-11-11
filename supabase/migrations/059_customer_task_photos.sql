-- ─────────────────────────────────────────────────────────
-- 059_customer_task_photos
--
-- Private storage bucket for the photos customers add to pet
-- enclosure and litter box tasks in Add Task. These show the
-- inside of customers' homes, so unlike task-photos (public)
-- they are only ever read by the server: for the AI photo
-- check, and through short-lived signed URLs on the customer's
-- booking pages and the booked Tidy Pro's views.
--
-- Files live under "<profile id>/<uuid>.<ext>" and are removed
-- with the account (lib/accountDeletion.ts).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-task-photos',
  'customer-task-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
