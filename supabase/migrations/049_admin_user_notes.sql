-- ─────────────────────────────────────────────────────────
-- 049_admin_user_notes
--
-- A private admin note for each user, written and searched on
-- /admin/users. Kept in its own table rather than on profiles so
-- it can never end up in anything the user is shown. Deleting the
-- account deletes its note.
--
-- RLS is on with no policies: only the service role, used
-- server-side, can read or write notes.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_user_notes (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_user_notes ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
