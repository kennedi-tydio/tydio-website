-- ─────────────────────────────────────────────────────────
-- 058_admin_favorite_tidy_pros
--
-- Tidy Pros the admin has starred on /admin/users, to find them
-- again with the Favorites filter. Admin-only, so kept in its own
-- table rather than on tidypro_profiles. Deleting the account
-- removes the favorite.
--
-- RLS is on with no policies: only the service role, used
-- server-side, can read or write it.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_favorite_tidy_pros (
  pro_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_favorite_tidy_pros ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
