-- ─────────────────────────────────────────────────────────
-- 042_bans_and_background_check_appeals
--
-- profiles.banned_at: set while a banned account still exists (the 7 days
-- before it's deleted). It's what ends their sessions; see
-- lib/auth/sessionFingerprint.ts. A suspension, by contrast, only stops
-- booking: a suspended person can still sign in and see their account.
--
-- background_checks denial: an admin's denial now records a reason the
-- cleaner is emailed, along with a link (appeal_token) to appeal. The
-- account is left unapproved. If no appeal is accepted within 7 days of
-- denied_at, they're banned and the account deleted, by the hourly
-- /api/cron/ban-deletions job.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;

ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS denied_at timestamptz;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS denial_reason text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS appeal_token text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS appeal_message text;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS appeal_submitted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS background_checks_appeal_token_idx ON background_checks (appeal_token);

-- Anyone banned under 041 whose account is still waiting to be deleted.
UPDATE profiles p SET banned_at = b.banned_at
FROM banned_users b
WHERE b.former_profile_id = p.id AND b.account_deleted_at IS NULL AND p.banned_at IS NULL;

NOTIFY pgrst, 'reload schema';
