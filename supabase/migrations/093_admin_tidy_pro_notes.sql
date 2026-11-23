-- ─────────────────────────────────────────────────────────
-- 093_admin_tidy_pro_notes
--
-- The admin's own note on each Tidy Pro, edited from the Notes
-- column on /admin/tidy-pros. Admin-only, so kept in its own
-- table rather than on tidypro_profiles (which Tidy Pros and
-- customers can read). One note per Tidy Pro; clearing it
-- deletes the row. Deleting the account removes the note.
--
-- RLS is on with no policies: only the service role, used
-- server-side, can read or write it.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_tidy_pro_notes (
  pro_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_tidy_pro_notes ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
